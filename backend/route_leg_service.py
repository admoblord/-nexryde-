"""One Compute Routes call per trip leg — Essentials SKU, minimal fieldMask."""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any, Optional

from maps_billing import (
    DEVIATION_M,
    DEVIATION_STREAK_NEEDED,
    can_reroute,
    incr_maps_call,
)
from polyline_eta import (
    coords_from_trip_leg,
    decode_polyline,
    eta_seconds_from_route,
    remaining_distance_m,
)

logger = logging.getLogger("route_leg")

GOOGLE_MAPS_API_KEY = os.environ.get("GOOGLE_MAPS_API_KEY", "")


async def fetch_essentials_route(
    origin_lat: float,
    origin_lng: float,
    dest_lat: float,
    dest_lng: float,
    *,
    trip_id: Optional[str] = None,
    kind: str = "leg",
) -> Optional[dict[str, Any]]:
    """
    Routes API Essentials (no TRAFFIC_AWARE). Field mask limited to
    duration, distanceMeters, polyline.encodedPolyline.
    """
    if not GOOGLE_MAPS_API_KEY:
        return None
    # Prefer Routes API v2 with TRAFFIC_UNAWARE (= Essentials)
    try:
        from http_client import get_http_client

        url = "https://routes.googleapis.com/directions/v2:computeRoutes"
        headers = {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
            "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline",
        }
        body = {
            "origin": {
                "location": {"latLng": {"latitude": origin_lat, "longitude": origin_lng}}
            },
            "destination": {
                "location": {"latLng": {"latitude": dest_lat, "longitude": dest_lng}}
            },
            "travelMode": "DRIVE",
            "routingPreference": "TRAFFIC_UNAWARE",
        }
        client = get_http_client()
        response = await client.post(url, headers=headers, json=body, timeout=8.0)
        data = response.json()
        routes = data.get("routes") or []
        if not routes:
            raise RuntimeError(data.get("error", {}).get("message") or "no routes")
        route = routes[0]
        duration_str = str(route.get("duration") or "0s")
        duration_seconds = int(duration_str.replace("s", "") or 0)
        result = {
            "distance_meters": int(route.get("distanceMeters") or 0),
            "duration_seconds": duration_seconds,
            "polyline": (route.get("polyline") or {}).get("encodedPolyline") or "",
            "source": "google_routes_essentials",
            "routing_preference": "TRAFFIC_UNAWARE",
        }
        await incr_maps_call(trip_id=trip_id, kind=kind, detail="computeRoutes_essentials")
        return result
    except Exception as exc:
        logger.warning("essentials Routes API failed: %s — falling back to Directions", exc)

    # Fallback: classic Directions WITHOUT departure_time (Essentials-ish)
    try:
        from http_client import get_http_client

        url = "https://maps.googleapis.com/maps/api/directions/json"
        params = {
            "origin": f"{origin_lat},{origin_lng}",
            "destination": f"{dest_lat},{dest_lng}",
            "mode": "driving",
            "key": GOOGLE_MAPS_API_KEY,
        }
        client = get_http_client()
        response = await client.get(url, params=params, timeout=8.0)
        data = response.json()
        if data.get("status") != "OK":
            return None
        route = data["routes"][0]
        leg = (route.get("legs") or [{}])[0]
        result = {
            "distance_meters": int((leg.get("distance") or {}).get("value") or 0),
            "duration_seconds": int((leg.get("duration") or {}).get("value") or 0),
            "polyline": (route.get("overview_polyline") or {}).get("points") or "",
            "source": "google_directions_essentials",
            "routing_preference": "TRAFFIC_UNAWARE",
        }
        await incr_maps_call(trip_id=trip_id, kind=kind, detail="directions_essentials")
        return result
    except Exception as exc:
        logger.warning("Directions essentials fallback failed: %s", exc)
        return None


async def store_active_leg_route(
    trip_id: str,
    *,
    leg: str,
    origin_lat: float,
    origin_lng: float,
    dest_lat: float,
    dest_lng: float,
    force: bool = False,
) -> Optional[dict[str, Any]]:
    """Fetch (unless already stored for this leg) and persist active_leg_route on trip."""
    from database import db

    trip = await db.trips.find_one({"id": trip_id}, {"_id": 0})
    if not trip:
        return None
    existing = trip.get("active_leg_route") or {}
    if (
        not force
        and existing.get("leg") == leg
        and existing.get("polyline")
        and int(existing.get("distance_meters") or 0) > 0
    ):
        return existing

    route = await fetch_essentials_route(
        origin_lat,
        origin_lng,
        dest_lat,
        dest_lng,
        trip_id=trip_id,
        kind=f"leg_{leg}",
    )
    if not route or not route.get("polyline"):
        return existing or None

    coords = decode_polyline(route["polyline"])
    preview = [{"lat": c[0], "lng": c[1]} for c in coords[:: max(1, len(coords) // 40)]]
    payload = {
        "leg": leg,
        "polyline": route["polyline"],
        "distance_meters": route["distance_meters"],
        "duration_seconds": route["duration_seconds"],
        "coordinates": preview,
        "source": route.get("source"),
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "origin": {"lat": origin_lat, "lng": origin_lng},
        "destination": {"lat": dest_lat, "lng": dest_lng},
    }
    update: dict[str, Any] = {
        "active_leg_route": payload,
        "leg_polyline": route["polyline"],
        "deviation_streak": 0,
    }
    # Keep trip-level polyline for dropoff leg (booking map)
    if leg == "to_dropoff":
        update["polyline"] = route["polyline"]
        update["route_preview_coordinates"] = preview
        update["distance_km"] = round(route["distance_meters"] / 1000.0, 3)
        update["duration_mins"] = max(1, int(round(route["duration_seconds"] / 60.0)))
    await db.trips.update_one({"id": trip_id}, {"$set": update})
    return payload


async def maybe_reroute_if_deviated(
    trip_id: str,
    driver_lat: float,
    driver_lng: float,
) -> Optional[dict[str, Any]]:
    """Re-route only after sustained >150m deviation, with hard caps."""
    from database import db

    trip = await db.trips.find_one({"id": trip_id})
    if not trip:
        return None
    coords = coords_from_trip_leg(trip)
    if len(coords) < 2:
        return None
    _rem, off_m = remaining_distance_m((driver_lat, driver_lng), coords)
    streak = int(trip.get("deviation_streak") or 0)
    if off_m > DEVIATION_M:
        streak += 1
    else:
        streak = 0
    await db.trips.update_one({"id": trip_id}, {"$set": {"deviation_streak": streak}})
    if streak < DEVIATION_STREAK_NEEDED:
        return None
    ok, reason = can_reroute(trip)
    if not ok:
        if reason == "trip_reroute_ceiling":
            logger.error(
                "MAPS_REROUTE_CEILING trip=%s count=%s — investigating",
                trip_id,
                trip.get("reroute_count"),
            )
        return None

    status = str(trip.get("status") or "").lower()
    pickup = trip.get("pickup_location") or {}
    dropoff = trip.get("dropoff_location") or {}
    try:
        if status in {"accepted", "arrived"}:
            dest_lat, dest_lng = float(pickup["lat"]), float(pickup["lng"])
            leg = "to_pickup"
        elif status == "ongoing":
            dest_lat, dest_lng = float(dropoff["lat"]), float(dropoff["lng"])
            leg = "to_dropoff"
        else:
            return None
    except (KeyError, TypeError, ValueError):
        return None

    route = await store_active_leg_route(
        trip_id,
        leg=leg,
        origin_lat=driver_lat,
        origin_lng=driver_lng,
        dest_lat=dest_lat,
        dest_lng=dest_lng,
        force=True,
    )
    await db.trips.update_one(
        {"id": trip_id},
        {
            "$set": {
                "last_reroute_at": datetime.now(timezone.utc).isoformat(),
                "deviation_streak": 0,
            },
            "$inc": {"reroute_count": 1},
        },
    )
    return route


async def local_tracking_from_polyline(
    trip: dict[str, Any],
    driver_lat: float,
    driver_lng: float,
) -> Optional[dict[str, Any]]:
    """ETA/distance from stored polyline + zone traffic factor — zero Google."""
    from traffic_factor import get_zone_traffic_factor

    coords = coords_from_trip_leg(trip)
    leg = trip.get("active_leg_route") or {}
    total_m = float(leg.get("distance_meters") or 0)
    total_s = float(leg.get("duration_seconds") or 0)
    if len(coords) < 2:
        return None
    rem_m, off_m = remaining_distance_m((driver_lat, driver_lng), coords)
    pickup = trip.get("pickup_location") or {}
    factor = await get_zone_traffic_factor(pickup.get("lat"), pickup.get("lng"))
    if total_m <= 0:
        total_m = path_length_fallback(coords)
    if total_s <= 0:
        total_s = max(60.0, (total_m / 1000.0) / 25.0 * 3600.0)
    eta_s = eta_seconds_from_route(
        rem_m,
        total_distance_m=total_m,
        total_duration_s=total_s,
        traffic_factor=factor,
    )
    return {
        "eta_seconds": eta_s,
        "distance_km": round(rem_m / 1000.0, 3),
        "distance_remaining_km": round(rem_m / 1000.0, 3),
        "off_route_m": round(off_m, 1),
        "traffic_factor": factor,
        "source": "local_polyline",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }


def path_length_fallback(coords: list) -> float:
    from polyline_eta import path_length_m

    return path_length_m(coords)

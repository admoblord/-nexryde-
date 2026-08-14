"""
Live trip tracking: ETA, distance, route helpers for rider real-time map.
"""
from __future__ import annotations

import time
from datetime import datetime
from typing import Any, Optional, Tuple

from smart_pricing import decode_google_polyline

# Throttle rider WS location pushes (seconds between emits per trip)
_LAST_REALTIME_EMIT: dict[str, float] = {}
MIN_REALTIME_EMIT_INTERVAL_SEC = 2.5

DEFAULT_SPEED_KMH = 25.0
MIN_SPEED_KMH = 8.0
MAX_SPEED_KMH = 90.0
MAX_ETA_SECONDS = 7200
ARRIVED_DISTANCE_KM = 0.05
ARRIVING_ETA_SECONDS = 60

#: Straight line under-states how far a car must actually drive. Lagos road
#: geometry (lagoons, few crossings, one-ways) runs ~1.4x the chord, so an ETA
#: built from raw haversine always read optimistic and the driver showed up late.
#: Only used when there is no stored route polyline to measure against.
ROAD_WINDING_FACTOR = 1.4
#: A driver's instantaneous speed is a poor predictor on its own — stopped at a
#: light does not mean an infinite ETA. Blend it with the corridor average.
LIVE_SPEED_WEIGHT = 0.6


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    from math import asin, cos, radians, sin, sqrt

    r = 6371.0
    d_lat = radians(lat2 - lat1)
    d_lon = radians(lon2 - lon1)
    a = sin(d_lat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(d_lon / 2) ** 2
    return r * 2 * asin(sqrt(a))


def _coord_pair(loc: Any) -> Optional[Tuple[float, float]]:
    if not isinstance(loc, dict):
        return None
    lat, lng = loc.get("lat"), loc.get("lng")
    if lat is None or lng is None:
        return None
    try:
        return float(lat), float(lng)
    except (TypeError, ValueError):
        return None


def trip_tracking_target(trip: dict) -> Optional[Tuple[float, float]]:
    """Destination for ETA while en route: pickup until ride starts, then dropoff."""
    status = str(trip.get("status") or "").strip().lower()
    pickup = _coord_pair(trip.get("pickup_location"))
    dropoff = _coord_pair(trip.get("dropoff_location"))
    if status in {"accepted", "arrived"}:
        return pickup
    if status == "ongoing":
        return dropoff
    return None


def resolve_tracking_speed_kmh(speed_kmh: Optional[float] = None) -> float:
    """
    Speed to plan the ETA with.

    A live reading is blended with the corridor average rather than trusted
    outright, so a driver stopped at a light does not blow the ETA up and a
    short burst on an expressway does not promise an arrival they cannot make.
    """
    try:
        live = float(speed_kmh) if speed_kmh is not None else 0.0
    except (TypeError, ValueError):
        live = 0.0
    if live <= 0:
        return DEFAULT_SPEED_KMH
    blended = (live * LIVE_SPEED_WEIGHT) + (DEFAULT_SPEED_KMH * (1 - LIVE_SPEED_WEIGHT))
    return max(MIN_SPEED_KMH, min(MAX_SPEED_KMH, blended))


def compute_live_tracking(
    *,
    driver_lat: float,
    driver_lng: float,
    target_lat: float,
    target_lng: float,
    speed_kmh: Optional[float] = None,
    trip_status: str = "accepted",
    traffic_factor: float = 1.0,
) -> dict:
    """
    Fallback ETA when no route polyline is stored for this leg.

    Reports the estimated ROAD distance, not the chord — that is the number a
    rider reads as "km away" and the number the ETA is built from.
    """
    straight_km = haversine_km(driver_lat, driver_lng, target_lat, target_lng)
    road_km = straight_km * ROAD_WINDING_FACTOR
    avg_speed = resolve_tracking_speed_kmh(speed_kmh)
    try:
        factor = float(traffic_factor)
    except (TypeError, ValueError):
        factor = 1.0
    factor = max(1.0, min(3.0, factor))
    # Arrival is physical proximity — judge it on the real gap, not the estimate.
    if straight_km <= ARRIVED_DISTANCE_KM or str(trip_status).lower() == "arrived":
        eta_seconds = 0
        tracking_status = "arrived"
    else:
        eta_seconds = int((road_km / avg_speed) * 3600 * factor)
        eta_seconds = min(MAX_ETA_SECONDS, max(1, eta_seconds))
        tracking_status = "arriving" if eta_seconds < ARRIVING_ETA_SECONDS else "en_route"
    return {
        "eta_seconds": eta_seconds,
        "distance_km": round(road_km, 3),
        "distance_remaining_km": round(road_km, 3),
        "straight_line_km": round(straight_km, 3),
        "average_speed_kmh": round(avg_speed, 1),
        "traffic_factor": round(factor, 2),
        "status": tracking_status,
        "source": "haversine_estimate",
        "updated_at": datetime.utcnow().isoformat(),
    }


async def enrich_driver_location_payload(
    trip: dict,
    driver_location: Optional[dict],
    *,
    speed_kmh: Optional[float] = None,
) -> Optional[dict]:
    if not driver_location:
        return None
    try:
        d_lat = float(driver_location["lat"])
        d_lng = float(driver_location["lng"])
    except (KeyError, TypeError, ValueError):
        return driver_location
    out = dict(driver_location)
    # Prefer stored polyline remaining distance — zero Google cost.
    try:
        from route_leg_service import local_tracking_from_polyline

        local = await local_tracking_from_polyline(trip, d_lat, d_lng)
        if local:
            status = str(trip.get("status") or "").lower()
            if status == "arrived" or local["distance_remaining_km"] <= 0.05:
                local["eta_seconds"] = 0
                local["status"] = "arrived"
            elif local["eta_seconds"] < ARRIVING_ETA_SECONDS:
                local["status"] = "arriving"
            else:
                local["status"] = "en_route"
            out.update(local)
            return out
    except Exception:
        pass
    target = trip_tracking_target(trip)
    if target:
        # Same zone traffic the polyline path uses, so both estimates agree.
        factor = 1.0
        try:
            from traffic_factor import get_zone_traffic_factor

            pickup = trip.get("pickup_location") or {}
            factor = float(
                await get_zone_traffic_factor(pickup.get("lat"), pickup.get("lng")) or 1.0
            )
        except Exception:
            factor = 1.0
        tracking = compute_live_tracking(
            driver_lat=d_lat,
            driver_lng=d_lng,
            target_lat=target[0],
            target_lng=target[1],
            speed_kmh=speed_kmh or trip.get("current_speed_kmh"),
            trip_status=str(trip.get("status") or ""),
            traffic_factor=factor,
        )
        out.update(tracking)
    return out


def should_emit_realtime(trip_id: str, *, force: bool = False) -> bool:
    if force:
        return True
    now = time.monotonic()
    last = _LAST_REALTIME_EMIT.get(trip_id, 0.0)
    if now - last < MIN_REALTIME_EMIT_INTERVAL_SEC:
        return False
    _LAST_REALTIME_EMIT[trip_id] = now
    return True


def mark_realtime_emitted(trip_id: str) -> None:
    _LAST_REALTIME_EMIT[trip_id] = time.monotonic()


def trip_route_waypoints(trip: dict) -> list[dict]:
    preview = trip.get("route_preview_coordinates")
    if isinstance(preview, list) and len(preview) >= 2:
        out = []
        for p in preview:
            if not isinstance(p, dict):
                continue
            lat = p.get("lat")
            lng = p.get("lng")
            if lat is None or lng is None:
                continue
            try:
                out.append({"lat": float(lat), "lng": float(lng)})
            except (TypeError, ValueError):
                continue
        if len(out) >= 2:
            return out
    encoded = trip.get("polyline")
    if isinstance(encoded, str) and encoded.strip():
        try:
            decoded = decode_google_polyline(encoded)
            return [{"lat": lat, "lng": lng} for lat, lng in decoded]
        except Exception:
            pass
    pickup = _coord_pair(trip.get("pickup_location"))
    dropoff = _coord_pair(trip.get("dropoff_location"))
    if pickup and dropoff:
        return [{"lat": pickup[0], "lng": pickup[1]}, {"lat": dropoff[0], "lng": dropoff[1]}]
    return []


def build_trip_route_response(trip: dict, driver_location: Optional[dict] = None) -> dict:
    waypoints = trip_route_waypoints(trip)
    distance_km = float(trip.get("distance_km") or 0)
    duration_seconds = int((trip.get("duration_mins") or trip.get("duration_minutes") or 0) * 60)
    polyline = trip.get("polyline")
    if not distance_km and len(waypoints) >= 2:
        distance_km = sum(
            haversine_km(waypoints[i]["lat"], waypoints[i]["lng"], waypoints[i + 1]["lat"], waypoints[i + 1]["lng"])
            for i in range(len(waypoints) - 1)
        )
    # Live driver→target geometry is rendered client-side via Google Directions.
    # Do not expose a 2-point chord — it reads as a broken road route on the map.
    return {
        "polyline": polyline if isinstance(polyline, str) else None,
        "distance_km": round(distance_km, 3) if distance_km else None,
        "duration_seconds": duration_seconds or None,
        "waypoints": waypoints,
        "segment_to_target": [],
        "trip_status": trip.get("status"),
    }


# Re-export pickup wait helpers (tests + WS payloads import from here).
from fare_config import PICKUP_FREE_WAIT_SECONDS  # noqa: E402
from trip_fare_adjustments import compute_pickup_wait_payload  # noqa: E402

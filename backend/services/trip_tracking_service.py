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


def compute_live_tracking(
    *,
    driver_lat: float,
    driver_lng: float,
    target_lat: float,
    target_lng: float,
    speed_kmh: Optional[float] = None,
    trip_status: str = "accepted",
) -> dict:
    distance_km = haversine_km(driver_lat, driver_lng, target_lat, target_lng)
    avg_speed = float(speed_kmh) if speed_kmh is not None and float(speed_kmh) > 0 else DEFAULT_SPEED_KMH
    avg_speed = max(MIN_SPEED_KMH, min(MAX_SPEED_KMH, avg_speed))
    if distance_km <= ARRIVED_DISTANCE_KM or str(trip_status).lower() == "arrived":
        eta_seconds = 0
        tracking_status = "arrived"
    else:
        eta_seconds = int((distance_km / avg_speed) * 3600)
        eta_seconds = min(MAX_ETA_SECONDS, max(1, eta_seconds))
        tracking_status = "arriving" if eta_seconds < ARRIVING_ETA_SECONDS else "en_route"
    return {
        "eta_seconds": eta_seconds,
        "distance_km": round(distance_km, 3),
        "distance_remaining_km": round(distance_km, 3),
        "average_speed_kmh": round(avg_speed, 1),
        "status": tracking_status,
        "updated_at": datetime.utcnow().isoformat(),
    }


def enrich_driver_location_payload(
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
    target = trip_tracking_target(trip)
    if target:
        tracking = compute_live_tracking(
            driver_lat=d_lat,
            driver_lng=d_lng,
            target_lat=target[0],
            target_lng=target[1],
            speed_kmh=speed_kmh or trip.get("current_speed_kmh"),
            trip_status=str(trip.get("status") or ""),
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

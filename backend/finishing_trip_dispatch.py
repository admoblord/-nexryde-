"""Bolt-style stacked dispatch: a driver finishing a nearby drop-off can take the next ride.

Idle online drivers are always preferred. A driver already on a trip is only
offered a new request when they are on the last leg (status=ongoing) and close
to the current drop-off. The new rider is told the driver is finishing nearby
and will join shortly.
"""
from __future__ import annotations

import math
from typing import Any, Optional

# Last-leg window. ~1.5 km or ~4 min at Lagos urban speed.
FINISHING_RADIUS_KM = 1.5
FINISHING_MAX_ETA_SEC = 240
FINISHING_SPEED_KMH = 22.0
MAX_CHAINED_PICKUP_KM = 15.0

# Fan-out: hydrate more nearby cars, then offer the best slice.
DISPATCH_CANDIDATE_CAP = 50
DISPATCH_OFFER_CAP = 40
DISPATCH_RADIUS_M_NEAR = 8_000
DISPATCH_RADIUS_M_FAR = 20_000

RIDER_FINISHING_HEADLINE = "Your driver is finishing a trip nearby"
RIDER_FINISHING_BODY = "They'll join you shortly."
DRIVER_NEXT_RIDE_HINT = "Next ride · after you drop off"
RIDER_NOW_EN_ROUTE_TITLE = "Your driver is on the way"
RIDER_NOW_EN_ROUTE_BODY = "just finished nearby and is heading to you now."


def _coord(loc: Any) -> Optional[tuple[float, float]]:
    if not isinstance(loc, dict):
        return None
    lat = loc.get("lat", loc.get("latitude"))
    lng = loc.get("lng", loc.get("longitude"))
    try:
        lat_f = float(lat)
        lng_f = float(lng)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(lat_f) or not math.isfinite(lng_f):
        return None
    return lat_f, lng_f


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlng / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1.0 - a)))


def eta_sec_for_km(km: float, *, speed_kmh: float = FINISHING_SPEED_KMH) -> int:
    meters_per_sec = max(2.0, (speed_kmh * 1000.0) / 3600.0)
    return int(max(30.0, float(km) * 1000.0 / meters_per_sec))


def finishing_offer_state(
    busy_trip: Optional[dict[str, Any]],
    driver_lat: float,
    driver_lng: float,
) -> Optional[dict[str, Any]]:
    """Return finishing metadata if this on-trip driver can take a next offer.

    None means hard-busy (heading to pickup, waiting, or still far from drop-off).
    """
    if not busy_trip:
        return None
    status = str(busy_trip.get("status") or "").strip().lower()
    if status != "ongoing":
        return None
    drop = _coord(busy_trip.get("dropoff_location"))
    if not drop:
        return None
    remaining_km = haversine_km(driver_lat, driver_lng, drop[0], drop[1])
    remaining_eta_sec = eta_sec_for_km(remaining_km)
    if remaining_km > FINISHING_RADIUS_KM and remaining_eta_sec > FINISHING_MAX_ETA_SEC:
        return None
    return {
        "finishing_trip": True,
        "prior_trip_id": str(busy_trip.get("id") or ""),
        "remaining_km": round(remaining_km, 3),
        "finishing_eta_sec": remaining_eta_sec,
        "current_dropoff": {
            "lat": drop[0],
            "lng": drop[1],
            "address": (busy_trip.get("dropoff_location") or {}).get("address"),
        },
    }


def chained_distance_km(
    *,
    driver_lat: float,
    driver_lng: float,
    current_dropoff: dict[str, Any],
    new_pickup_lat: float,
    new_pickup_lng: float,
) -> float:
    """Remaining drop-off + deadhead to the new pickup (what the next rider waits)."""
    drop = _coord(current_dropoff) or (driver_lat, driver_lng)
    remaining = haversine_km(driver_lat, driver_lng, drop[0], drop[1])
    deadhead = haversine_km(drop[0], drop[1], new_pickup_lat, new_pickup_lng)
    return remaining + deadhead


def rider_finishing_push(driver_name: str) -> tuple[str, str]:
    name = (driver_name or "").strip() or "Your driver"
    return (
        f"{name} is finishing a trip nearby",
        RIDER_FINISHING_BODY,
    )


def merge_driver_profiles(*groups: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Nearest-first union so later, wider rings fill gaps without dropping close cars."""
    seen: dict[str, dict[str, Any]] = {}
    out: list[dict[str, Any]] = []
    for group in groups:
        for profile in group or []:
            uid = str(profile.get("user_id") or "")
            if not uid or uid in seen:
                continue
            seen[uid] = profile
            out.append(profile)
    return out


def accept_lock_decision(
    *,
    new_trip_id: str,
    active_trip_id: Optional[str],
    queued_next_trip_id: Optional[str],
    busy_trip: Optional[dict[str, Any]],
    driver_lat: Optional[float],
    driver_lng: Optional[float],
) -> dict[str, Any]:
    """How to lock a driver who is accepting `new_trip_id`.

    Returns ``mode`` of ``active`` (idle lock), ``queued`` (stack behind
    a finishing trip), or ``reject``.
    """
    new_id = str(new_trip_id or "").strip()
    active = str(active_trip_id or "").strip()
    queued = str(queued_next_trip_id or "").strip()
    if queued and queued != new_id:
        return {"mode": "reject", "reason": "already_queued"}
    if not active or active == new_id:
        return {"mode": "active"}
    if driver_lat is None or driver_lng is None:
        return {"mode": "reject", "reason": "busy"}
    state = finishing_offer_state(busy_trip, float(driver_lat), float(driver_lng))
    if not state:
        return {"mode": "reject", "reason": "busy"}
    return {
        "mode": "queued",
        "finishing": state,
        "prior_trip_id": active,
    }


def cancel_lock_decision(
    *,
    cancelled_trip_id: str,
    active_trip_id: Optional[str],
    queued_next_trip_id: Optional[str],
) -> str:
    """``clear_queued`` | ``promote_or_clear`` | ``noop``."""
    cancelled = str(cancelled_trip_id or "").strip()
    active = str(active_trip_id or "").strip()
    queued = str(queued_next_trip_id or "").strip()
    if queued and queued == cancelled:
        return "clear_queued"
    if active and active == cancelled:
        return "promote_or_clear"
    if not active and queued and queued != cancelled:
        return "promote_or_clear"
    return "noop"


def eligibility_rank_key(
    driver: dict[str, Any],
    preferred_driver_id: Optional[str],
) -> tuple:
    """Preferred → idle → finishing → closer → higher visibility."""
    return (
        0 if driver.get("driver_id") == preferred_driver_id else 1,
        1 if driver.get("finishing_trip") else 0,
        float(driver.get("distance_to_pickup") or 99.0),
        -float(driver.get("visibility_score") or 0.0),
    )

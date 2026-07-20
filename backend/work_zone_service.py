"""Work Zone business logic — activation, caps, entitlement, dispatch checks."""
from __future__ import annotations

import logging
import math
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from zoneinfo import ZoneInfo

from database import db
from work_zone_areas import (
    WORK_ZONE_AREAS,
    build_zone_label,
    point_in_zone,
    resolve_area_id,
)
from work_zone_config import (
    WORK_ZONE_DEFAULT_RADIUS_M,
    WORK_ZONE_EARLY_ACCESS_EMAILS,
    WORK_ZONE_ENABLED,
    WORK_ZONE_EXPIRY_HOUR_WAT,
    WORK_ZONE_MAX_ZONES,
    WORK_ZONE_MAX_RADIUS_M,
    WORK_ZONE_MIN_RADIUS_M,
)

logger = logging.getLogger("server")
_WAT = ZoneInfo("Africa/Lagos")
_EARTH_RADIUS_M = 6_371_000


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def work_zone_expires_at_today() -> datetime:
    """End of work-zone day in WAT → UTC."""
    now_wat = _now_utc().astimezone(_WAT)
    expiry_wat = now_wat.replace(
        hour=min(WORK_ZONE_EXPIRY_HOUR_WAT, 23),
        minute=59,
        second=59,
        microsecond=0,
    )
    if expiry_wat <= now_wat:
        expiry_wat += timedelta(days=1)
    return expiry_wat.astimezone(timezone.utc)


async def driver_has_early_access(user_id: str) -> bool:
    user = await db.users.find_one(
        {"id": user_id},
        {"_id": 0, "email": 1, "work_zone_early_access": 1},
    ) or {}
    if user.get("work_zone_early_access"):
        return True
    email = (user.get("email") or "").strip().lower()
    return email in WORK_ZONE_EARLY_ACCESS_EMAILS


async def feature_available_for_driver(user_id: str) -> tuple[bool, str]:
    if WORK_ZONE_ENABLED:
        return True, "enabled"
    if await driver_has_early_access(user_id):
        return True, "early_access"
    return False, "Work Zone is not available yet — coming soon for all drivers"


def _subscription_end_date_valid(sub: dict) -> bool:
    expiry = sub.get("end_date")
    if not expiry:
        return True
    try:
        exp_dt = datetime.fromisoformat(str(expiry).replace("Z", "+00:00"))
        if exp_dt.tzinfo is None:
            exp_dt = exp_dt.replace(tzinfo=timezone.utc)
    except Exception:
        return True
    return _now_utc() < exp_dt


def work_zone_entitlement_message(plan_status: str) -> str:
    if plan_status == "trial":
        return (
            "Included with your NexRyde driver plan — "
            "subscribe anytime to keep Work Zone after your trial"
        )
    if plan_status in {"active", "grace_period"}:
        return "Included with your NexRyde subscription"
    return "Subscribe to activate Work Zone"


async def resolve_work_zone_entitlement(user_id: str) -> tuple[bool, str]:
    """
    Work Zone is included with the NexRyde driver plan — no separate add-on.
    Delegates to ``resolve_driver_plan_entitlement`` (go-online parity).
    """
    from driver_trial_policy import resolve_driver_plan_entitlement

    plan = await resolve_driver_plan_entitlement(user_id)
    return bool(plan.get("entitled")), str(plan.get("plan_status") or "inactive")


def _zone_still_valid_today(profile: dict) -> bool:
    """True while an active zone has not reached work_zone_expires_at (end-of-day WAT)."""
    if not profile.get("work_zone_active"):
        return False
    expires_raw = profile.get("work_zone_expires_at")
    if not expires_raw:
        return False
    try:
        expires = datetime.fromisoformat(str(expires_raw).replace("Z", "+00:00"))
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
    except Exception:
        return False
    return _now_utc() < expires


async def driver_has_work_zone_entitlement(user_id: str) -> bool:
    entitled, _ = await resolve_work_zone_entitlement(user_id)
    return entitled


async def driver_has_active_subscription(user_id: str) -> bool:
    """Back-compat alias — use driver_has_work_zone_entitlement."""
    return await driver_has_work_zone_entitlement(user_id)


async def clear_work_zone_if_not_entitled(user_id: str, profile: dict) -> tuple[dict, bool, str]:
    """Deactivate zone when driver plan no longer includes Work Zone."""
    entitled, plan_status = await resolve_work_zone_entitlement(user_id)
    if entitled or not profile.get("work_zone_active"):
        return profile, entitled, plan_status
    # Graceful lapse: trial/subscription ended mid-day — zone runs until expires_at.
    if _zone_still_valid_today(profile):
        return profile, entitled, plan_status
    await db.driver_profiles.update_one(
        {"user_id": user_id},
        {
            "$set": {
                "work_zone_active": False,
                "work_zone_cleared_reason": "plan_inactive",
                "work_zone_cleared_at": _now_utc().isoformat(),
            }
        },
    )
    profile = dict(profile)
    profile["work_zone_active"] = False
    return profile, entitled, plan_status


# Back-compat alias for routers/tests
async def driver_has_subscription_entitlement(user_id: str) -> bool:
    return await driver_has_work_zone_entitlement(user_id)


async def _count_online_in_areas(area_ids: set[str]) -> int:
    if not area_ids:
        return 0
    profiles = await db.driver_profiles.find(
        {"is_online": True, "verification_status": "approved"},
        {"_id": 0, "user_id": 1, "current_location": 1},
    ).to_list(500)
    count = 0
    for p in profiles:
        loc = p.get("current_location") or {}
        lat, lng = loc.get("lat"), loc.get("lng")
        if lat is None or lng is None:
            continue
        rid = resolve_area_id(float(lat), float(lng))
        if rid and rid in area_ids:
            count += 1
    return count


def _coerce_float(value: Any, default: Optional[float] = None) -> Optional[float]:
    try:
        f = float(value)
        if math.isfinite(f):
            return f
    except (TypeError, ValueError):
        pass
    return default


def _coerce_radius_m(value: Any) -> int:
    raw = _coerce_float(value, WORK_ZONE_DEFAULT_RADIUS_M) or WORK_ZONE_DEFAULT_RADIUS_M
    return int(max(WORK_ZONE_MIN_RADIUS_M, min(WORK_ZONE_MAX_RADIUS_M, raw)))


def distance_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Haversine distance in metres."""
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lam = math.radians(lng2 - lng1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lam / 2) ** 2
    return _EARTH_RADIUS_M * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def normalize_work_zone_place(raw: dict[str, Any], index: int = 0) -> dict[str, Any]:
    """Normalize a Google Places/geocode selection for profile storage."""
    lat = _coerce_float(raw.get("lat", raw.get("latitude")))
    lng = _coerce_float(raw.get("lng", raw.get("longitude")))
    if lat is None or lng is None:
        raise ValueError("Each work zone needs latitude and longitude")
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        raise ValueError("Invalid work zone coordinates")
    label = str(
        raw.get("label")
        or raw.get("name")
        or raw.get("short_label")
        or raw.get("address")
        or raw.get("description")
        or ""
    ).strip()
    if not label:
        label = f"Zone {index + 1}"
    place_id = str(raw.get("place_id") or raw.get("placeId") or "").strip()
    zone_id = str(raw.get("id") or place_id or f"{round(lat, 5)}:{round(lng, 5)}").strip()
    return {
        "id": zone_id[:160],
        "place_id": place_id,
        "label": label[:160],
        "address": str(raw.get("address") or raw.get("formatted_address") or raw.get("description") or label).strip()[:260],
        "lat": lat,
        "lng": lng,
        "radius_m": _coerce_radius_m(raw.get("radius_m")),
        "country": str(raw.get("country") or "Nigeria").strip()[:80],
        "state": str(raw.get("state") or "").strip()[:100],
        "source": str(raw.get("source") or "places").strip()[:40],
    }


def normalize_work_zone_places(raw_zones: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not raw_zones:
        raise ValueError("Select at least one work zone")
    if len(raw_zones) > WORK_ZONE_MAX_ZONES:
        raise ValueError(f"Select up to {WORK_ZONE_MAX_ZONES} work zones")
    zones = [normalize_work_zone_place(z, idx) for idx, z in enumerate(raw_zones)]
    seen: set[str] = set()
    unique: list[dict[str, Any]] = []
    for z in zones:
        key = z.get("place_id") or f"{round(z['lat'], 5)}:{round(z['lng'], 5)}"
        if key in seen:
            continue
        seen.add(key)
        unique.append(z)
    return unique


def build_zone_label_from_places(zones: list[dict[str, Any]]) -> str:
    names = [str(z.get("label") or "Zone").strip() for z in zones if z]
    if not names:
        return ""
    if len(names) <= 2:
        return " · ".join(names)
    return f"{names[0]} · {names[1]} +{len(names) - 2}"


def point_in_work_zone_places(lat: Optional[float], lng: Optional[float], zones: list[dict[str, Any]]) -> bool:
    if lat is None or lng is None:
        return False
    try:
        p_lat = float(lat)
        p_lng = float(lng)
    except (TypeError, ValueError):
        return False
    for zone in zones or []:
        z_lat = _coerce_float(zone.get("lat"))
        z_lng = _coerce_float(zone.get("lng"))
        if z_lat is None or z_lng is None:
            continue
        if distance_m(p_lat, p_lng, z_lat, z_lng) <= _coerce_radius_m(zone.get("radius_m")):
            return True
    return False


async def _count_online_near_zones(zones: list[dict[str, Any]]) -> int:
    if not zones:
        return 0
    profiles = await db.driver_profiles.find(
        {"is_online": True, "verification_status": "approved"},
        {"_id": 0, "user_id": 1, "current_location": 1},
    ).to_list(1000)
    count = 0
    for p in profiles:
        loc = p.get("current_location") or {}
        if point_in_work_zone_places(loc.get("lat"), loc.get("lng"), zones):
            count += 1
    return count


async def _count_zoned_online_in_areas(area_ids: set[str]) -> int:
    profiles = await db.driver_profiles.find(
        {
            "is_online": True,
            "verification_status": "approved",
            "work_zone_active": True,
            "work_zone_area_ids": {"$exists": True, "$ne": []},
        },
        {"_id": 0, "work_zone_area_ids": 1},
    ).to_list(200)
    count = 0
    for p in profiles:
        zids = set(p.get("work_zone_area_ids") or [])
        if zids & area_ids:
            count += 1
    return count


async def check_activation_guardrails(
    user_id: str,
    area_ids: list[str],
    *,
    bypass_share_cap: bool = False,
) -> tuple[bool, str]:
    # New marketplace policy: never block activation because an area is new,
    # quiet, or has too few online drivers. Counts remain informational only.
    return True, "ok"


async def get_zone_demand_stats(zones: list[dict[str, Any]]) -> dict[str, int]:
    """Rough trips/week per arbitrary zone from last 7 days completed trips."""
    since = (_now_utc() - timedelta(days=7)).isoformat()
    counts = {str(z.get("id") or idx): 0 for idx, z in enumerate(zones or [])}
    if not counts:
        return counts
    trips = await db.trips.find(
        {"status": "completed", "created_at": {"$gte": since}},
        {"_id": 0, "pickup_location": 1, "dropoff_location": 1},
    ).to_list(5000)
    for trip in trips:
        for zone in zones:
            zid = str(zone.get("id") or "")
            for loc_key in ("pickup_location", "dropoff_location"):
                loc = trip.get(loc_key) or {}
                if point_in_work_zone_places(loc.get("lat"), loc.get("lng"), [zone]):
                    counts[zid] = counts.get(zid, 0) + 1
                    break
    return counts


def normalize_profile_work_zone(profile: dict) -> dict:
    """Expire stale zones on read."""
    if not profile.get("work_zone_active"):
        return profile
    expires_raw = profile.get("work_zone_expires_at")
    if not expires_raw:
        return profile
    try:
        expires = datetime.fromisoformat(str(expires_raw).replace("Z", "+00:00"))
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
    except Exception:
        return profile
    if _now_utc() >= expires:
        profile = dict(profile)
        profile["work_zone_active"] = False
    return profile


async def clear_expired_work_zone(user_id: str, profile: dict) -> dict:
    profile = normalize_profile_work_zone(profile)
    if profile.get("work_zone_active"):
        return profile
    if not (await db.driver_profiles.find_one({"user_id": user_id}, {"work_zone_active": 1})) or {}:
        return profile
    await db.driver_profiles.update_one(
        {"user_id": user_id},
        {"$set": {"work_zone_active": False, "work_zone_cleared_reason": "expired"}},
    )
    return profile


async def get_area_demand_stats(area_ids: Optional[list[str]] = None) -> dict[str, int]:
    """Rough trips/week per area from last 7 days completed trips."""
    since = (_now_utc() - timedelta(days=7)).isoformat()
    trips = await db.trips.find(
        {"status": "completed", "created_at": {"$gte": since}},
        {"_id": 0, "pickup_location": 1, "dropoff_location": 1},
    ).to_list(5000)
    counts: dict[str, int] = {aid: 0 for aid in (area_ids or WORK_ZONE_AREAS.keys())}
    for trip in trips:
        for loc_key in ("pickup_location", "dropoff_location"):
            loc = trip.get(loc_key) or {}
            lat, lng = loc.get("lat"), loc.get("lng")
            if lat is None or lng is None:
                continue
            aid = resolve_area_id(float(lat), float(lng))
            if aid and aid in counts:
                counts[aid] += 1
    return counts


def demand_label_for_count(trips_per_week: int) -> str:
    if trips_per_week >= 80:
        return "high"
    if trips_per_week >= 30:
        return "moderate"
    if trips_per_week >= 10:
        return "steady"
    return "low"


async def work_zone_public_state(profile: dict, user_id: str) -> dict[str, Any]:
    from driver_trial_policy import resolve_driver_plan_entitlement

    profile = await clear_expired_work_zone(user_id, profile)
    profile, entitled, plan_status = await clear_work_zone_if_not_entitled(user_id, profile)
    plan = await resolve_driver_plan_entitlement(user_id)
    trial_active = bool(plan.get("trial_active"))
    area_ids = profile.get("work_zone_area_ids") or []
    zones = profile.get("work_zone_zones") or []
    if not zones and area_ids:
        # Legacy profiles keep working until a driver updates to flexible zones.
        zones = [
            {
                "id": aid,
                "place_id": "",
                "label": WORK_ZONE_AREAS[aid].name,
                "address": f"{WORK_ZONE_AREAS[aid].name}, {WORK_ZONE_AREAS[aid].city}",
                "lat": WORK_ZONE_AREAS[aid].centroid_lat,
                "lng": WORK_ZONE_AREAS[aid].centroid_lng,
                "radius_m": WORK_ZONE_DEFAULT_RADIUS_M,
                "country": "Nigeria",
                "source": "legacy_area",
            }
            for aid in area_ids
            if aid in WORK_ZONE_AREAS
        ]
    available, avail_reason = await feature_available_for_driver(user_id)
    early = await driver_has_early_access(user_id)
    zone_running_grace = bool(
        not entitled and profile.get("work_zone_active") and _zone_still_valid_today(profile)
    )
    return {
        "active": bool(profile.get("work_zone_active") and (zones or area_ids)),
        "area_ids": area_ids,
        "zones": zones,
        "label": profile.get("work_zone_label") or build_zone_label_from_places(zones) or build_zone_label(area_ids),
        "set_at": profile.get("work_zone_set_at"),
        "expires_at": profile.get("work_zone_expires_at"),
        "feature_available": available,
        "feature_reason": avail_reason,
        "entitled": entitled,
        "trial_active": trial_active,
        "subscription_status": plan_status,
        "zone_running_grace": zone_running_grace,
        "early_access": early,
        "included_with_subscription": True,
        "included_with_driver_plan": True,
        "no_additional_fee": True,
        "entitlement_message": work_zone_entitlement_message(plan_status if entitled else "inactive"),
    }


def trip_endpoint_area_ids(trip: dict) -> tuple[Optional[str], Optional[str]]:
    pickup = trip.get("pickup_location") or {}
    dropoff = trip.get("dropoff_location") or {}
    p_lat, p_lng = pickup.get("lat"), pickup.get("lng")
    d_lat, d_lng = dropoff.get("lat"), dropoff.get("lng")
    pickup_id = resolve_area_id(float(p_lat), float(p_lng)) if p_lat is not None and p_lng is not None else None
    dropoff_id = resolve_area_id(float(d_lat), float(d_lng)) if d_lat is not None and d_lng is not None else None
    return pickup_id, dropoff_id


def driver_work_zone_allows_trip(profile: dict, trip: dict) -> tuple[bool, dict[str, Any]]:
    """
    Both pickup AND dropoff must be inside the driver's active zone.
    Returns (allowed, debug_dict) for dispatch logging.
    """
    if not profile.get("work_zone_active"):
        return True, {"work_zone_filter": False}
    zones = profile.get("work_zone_zones") or []
    if zones:
        pickup = trip.get("pickup_location") or {}
        dropoff = trip.get("dropoff_location") or {}
        pickup_in = point_in_work_zone_places(pickup.get("lat"), pickup.get("lng"), zones)
        dropoff_in = point_in_work_zone_places(dropoff.get("lat"), dropoff.get("lng"), zones)
        # Scalable work zones primarily constrain pickup territory. Dropoff is
        # logged for transparency but does not block a driver from serving a
        # local pickup that leaves the zone.
        allowed = pickup_in or (pickup.get("lat") is None and dropoff_in)
        meta = {
            "work_zone_filter": True,
            "matching_mode": "radius_geofence",
            "pickup_in": pickup_in,
            "dropoff_in": dropoff_in,
            "zone_count": len(zones),
            "zone_labels": [z.get("label") for z in zones],
        }
        return allowed, meta
    area_ids = set(profile.get("work_zone_area_ids") or [])
    if not area_ids:
        return True, {"work_zone_filter": False}

    pickup = trip.get("pickup_location") or {}
    dropoff = trip.get("dropoff_location") or {}
    p_lat, p_lng = pickup.get("lat"), pickup.get("lng")
    d_lat, d_lng = dropoff.get("lat"), dropoff.get("lng")

    pickup_in = point_in_zone(float(p_lat), float(p_lng), area_ids) if p_lat is not None and p_lng is not None else False
    dropoff_in = point_in_zone(float(d_lat), float(d_lng), area_ids) if d_lat is not None and d_lng is not None else False
    allowed = pickup_in and dropoff_in
    meta = {
        "work_zone_filter": True,
        "pickup_in": pickup_in,
        "dropoff_in": dropoff_in,
        "zone_areas": list(area_ids),
    }
    return allowed, meta


def log_zone_dispatch_decision(
    *,
    driver_id: str,
    trip_id: str,
    allowed: bool,
    meta: dict[str, Any],
) -> None:
    if not meta.get("work_zone_filter"):
        return
    action = "eligible" if allowed else "skipped"
    logger.info(
        "[ZONE] driver=%s trip=%s pickup_in=%s dropoff_in=%s → %s",
        driver_id,
        trip_id,
        meta.get("pickup_in"),
        meta.get("dropoff_in"),
        action,
    )

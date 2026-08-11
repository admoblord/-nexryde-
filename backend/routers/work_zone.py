"""Work Zone API — driver territory dispatch."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from auth_guard import verify_owner_strict
from database import db
from work_zone_areas import WORK_ZONE_AREAS
from work_zone_config import WORK_ZONE_MAX_AREAS, work_zone_public_config
from work_zone_service import (
    build_zone_label_from_places,
    demand_label_for_count,
    driver_has_work_zone_entitlement,
    feature_available_for_driver,
    get_zone_demand_stats,
    normalize_work_zone_places,
    work_zone_entitlement_message,
    work_zone_expires_at_today,
    work_zone_public_state,
    _count_online_near_zones,
)

work_zone_router = APIRouter(prefix="/api", tags=["Work Zone"])


class WorkZonePlaceBody(BaseModel):
    id: Optional[str] = None
    place_id: Optional[str] = None
    placeId: Optional[str] = None
    label: str = Field(..., min_length=1, max_length=160)
    address: Optional[str] = None
    description: Optional[str] = None
    lat: float
    lng: float
    radius_m: Optional[int] = None
    country: Optional[str] = "Nigeria"
    state: Optional[str] = None
    source: Optional[str] = "places"


class WorkZoneActivateBody(BaseModel):
    zones: Optional[List[WorkZonePlaceBody]] = None
    # Legacy body for old clients. New clients should send ``zones``.
    area_ids: Optional[List[str]] = Field(None, max_length=4)


@work_zone_router.get("/work-zone/config")
async def get_work_zone_config():
    from hot_cache import TTL_WORK_ZONE_SEC, cache_get_json, cache_set_json, work_zone_config_key

    key = work_zone_config_key()
    hit = await cache_get_json(key)
    if isinstance(hit, dict):
        return hit
    payload = work_zone_public_config()
    await cache_set_json(key, payload, TTL_WORK_ZONE_SEC)
    return payload


@work_zone_router.get("/work-zone/areas")
async def list_work_zone_areas(city: str = "lagos"):
    # The production Work Zone selector is Places/geofence based. The old fixed
    # Lagos list is intentionally no longer exposed as the source of truth.
    return {
        "areas": [],
        "city": city.strip().lower() or "all",
        "deprecated": True,
        "message": "Use /api/places/autocomplete and POST zones with lat/lng/radius.",
    }


@work_zone_router.get("/drivers/{user_id}/work-zone")
async def get_driver_work_zone(user_id: str, request: Request):
    verify_owner_strict(request, user_id)
    from hot_cache import (
        TTL_WORK_ZONE_SEC,
        cache_get_json,
        cache_set_json,
        work_zone_driver_key,
    )

    key = work_zone_driver_key(user_id)
    hit = await cache_get_json(key)
    if isinstance(hit, dict):
        return hit
    profile = await db.driver_profiles.find_one({"user_id": user_id}, {"_id": 0}) or {}
    if not profile:
        raise HTTPException(status_code=404, detail="Driver profile not found")
    state = await work_zone_public_state(profile, user_id)
    payload = {**state, "config": work_zone_public_config()}
    await cache_set_json(key, payload, TTL_WORK_ZONE_SEC)
    return payload


@work_zone_router.post("/drivers/{user_id}/work-zone")
async def activate_driver_work_zone(user_id: str, body: WorkZoneActivateBody, request: Request):
    verify_owner_strict(request, user_id)
    available, reason = await feature_available_for_driver(user_id)
    if not available:
        raise HTTPException(status_code=403, detail=reason)

    if not await driver_has_work_zone_entitlement(user_id):
        raise HTTPException(
            status_code=402,
            detail=work_zone_entitlement_message("inactive"),
        )

    raw_zones = [z.dict() for z in (body.zones or [])]
    area_ids: list[str] = []
    if not raw_zones and body.area_ids:
        area_ids = [a.strip() for a in body.area_ids if a.strip()][:WORK_ZONE_MAX_AREAS]
        raw_zones = [
            {
                "id": aid,
                "label": WORK_ZONE_AREAS[aid].name,
                "address": f"{WORK_ZONE_AREAS[aid].name}, {WORK_ZONE_AREAS[aid].city}",
                "lat": WORK_ZONE_AREAS[aid].centroid_lat,
                "lng": WORK_ZONE_AREAS[aid].centroid_lng,
                "country": "Nigeria",
                "source": "legacy_area",
            }
            for aid in area_ids
            if aid in WORK_ZONE_AREAS
        ]
    try:
        zones = normalize_work_zone_places(raw_zones)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    # Informational only. Activation must work for the first driver in a new area.
    online_count = await _count_online_near_zones(zones)
    demand_counts = await get_zone_demand_stats(zones)

    now_iso = datetime.now(timezone.utc).isoformat()
    expires = work_zone_expires_at_today().isoformat()
    label = build_zone_label_from_places(zones)

    await db.driver_profiles.update_one(
        {"user_id": user_id},
        {
            "$set": {
                "work_zone_active": True,
                "work_zone_area_ids": area_ids,
                "work_zone_zones": [
                    {
                        **z,
                        "trips_per_week": demand_counts.get(str(z.get("id")), 0),
                        "demand_label": demand_label_for_count(demand_counts.get(str(z.get("id")), 0)),
                        "online_driver_count": online_count,
                    }
                    for z in zones
                ],
                "work_zone_label": label,
                "work_zone_set_at": now_iso,
                "work_zone_expires_at": expires,
                "work_zone_matching_mode": "radius_geofence",
                # Retire legacy destination mode when work zone activates
                "destination_mode": False,
            },
            "$unset": {
                "destination_lat": "",
                "destination_lng": "",
                "destination_name": "",
            },
        },
        upsert=True,
    )
    try:
        from hot_cache import invalidate_driver_hot_cache

        await invalidate_driver_hot_cache(user_id)
    except Exception:
        pass
    return {
        "success": True,
        "active": True,
        "area_ids": area_ids,
        "zones": zones,
        "label": label,
        "expires_at": expires,
        "online_driver_count": online_count,
        "activation_blocked_by_driver_count": False,
        "message": f"Work Zone active: {label}",
    }


@work_zone_router.delete("/drivers/{user_id}/work-zone")
async def deactivate_driver_work_zone(user_id: str, request: Request):
    verify_owner_strict(request, user_id)
    await db.driver_profiles.update_one(
        {"user_id": user_id},
        {
            "$set": {
                "work_zone_active": False,
                "work_zone_cleared_at": datetime.now(timezone.utc).isoformat(),
            }
        },
    )
    try:
        from hot_cache import invalidate_driver_hot_cache

        await invalidate_driver_hot_cache(user_id)
    except Exception:
        pass
    return {"success": True, "active": False}

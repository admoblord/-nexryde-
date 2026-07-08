"""Work Zone API — driver territory dispatch."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from auth_guard import verify_owner_strict
from database import db
from work_zone_areas import WORK_ZONE_AREAS, build_zone_label, validate_area_selection
from work_zone_config import WORK_ZONE_MAX_AREAS, work_zone_public_config
from work_zone_service import (
    check_activation_guardrails,
    demand_label_for_count,
    driver_has_early_access,
    driver_has_work_zone_entitlement,
    feature_available_for_driver,
    get_area_demand_stats,
    work_zone_entitlement_message,
    work_zone_expires_at_today,
    work_zone_public_state,
)

work_zone_router = APIRouter(prefix="/api", tags=["Work Zone"])


class WorkZoneActivateBody(BaseModel):
    area_ids: List[str] = Field(..., min_length=1, max_length=4)


@work_zone_router.get("/work-zone/config")
async def get_work_zone_config():
    return work_zone_public_config()


@work_zone_router.get("/work-zone/areas")
async def list_work_zone_areas(city: str = "lagos"):
    stats = await get_area_demand_stats()
    slug = city.strip().lower() or "lagos"
    areas = []
    for area in WORK_ZONE_AREAS.values():
        if slug != "all" and area.city_slug != slug:
            continue
        tpw = stats.get(area.id, 0)
        areas.append(
            area.to_public_dict(
                trips_per_week=tpw,
                demand_label=demand_label_for_count(tpw),
            )
        )
    return {"areas": areas, "city": slug}


@work_zone_router.get("/drivers/{user_id}/work-zone")
async def get_driver_work_zone(user_id: str, request: Request):
    verify_owner_strict(request, user_id)
    profile = await db.driver_profiles.find_one({"user_id": user_id}, {"_id": 0}) or {}
    if not profile:
        raise HTTPException(status_code=404, detail="Driver profile not found")
    state = await work_zone_public_state(profile, user_id)
    return {**state, "config": work_zone_public_config()}


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

    area_ids = [a.strip() for a in body.area_ids if a.strip()][:WORK_ZONE_MAX_AREAS]
    ok, msg = validate_area_selection(area_ids)
    if not ok:
        raise HTTPException(status_code=400, detail=msg)

    bypass_cap = await driver_has_early_access(user_id)
    guard_ok, guard_msg = await check_activation_guardrails(
        user_id, area_ids, bypass_share_cap=bypass_cap
    )
    if not guard_ok:
        raise HTTPException(status_code=409, detail=guard_msg)

    now_iso = datetime.now(timezone.utc).isoformat()
    expires = work_zone_expires_at_today().isoformat()
    label = build_zone_label(area_ids)

    await db.driver_profiles.update_one(
        {"user_id": user_id},
        {
            "$set": {
                "work_zone_active": True,
                "work_zone_area_ids": area_ids,
                "work_zone_label": label,
                "work_zone_set_at": now_iso,
                "work_zone_expires_at": expires,
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
    return {
        "success": True,
        "active": True,
        "area_ids": area_ids,
        "label": label,
        "expires_at": expires,
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
    return {"success": True, "active": False}

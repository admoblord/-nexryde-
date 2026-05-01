"""Nexryde Driver Control System — cost protection and fair dispatch.

Features:
  1. Zone-based active-driver cap (max 30 per zone by default).
  2. Auto-offline after 15 minutes of idle (no GPS heartbeat).
  3. Request-ignore cooldown: 3 ignored requests → 15–30 min cooldown.
"""
import uuid
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from database import db
from auth_guard import require_authenticated

logger = logging.getLogger("server")

driver_control_router = APIRouter(prefix="/api", tags=["Driver Control"])

# ── Configuration ─────────────────────────────────────────────────────────────
MAX_DRIVERS_PER_ZONE = 30           # hard cap per zone
IDLE_TIMEOUT_MINUTES = 15           # auto-offline if no heartbeat
IGNORE_COOLDOWN_THRESHOLD = 3       # ignored requests before cooldown
IGNORE_COOLDOWN_MINUTES_MIN = 15
IGNORE_COOLDOWN_MINUTES_MAX = 30


# ── Zone helpers ─────────────────────────────────────────────────────────────

def _resolve_zone(lat: float, lng: float) -> str:
    """Resolve a lat/lng to a broad zone key (city-level for now).

    A real implementation would use reverse geocoding or a polygon lookup.
    Here we bucket by ~0.5-degree grid for a simple approximation.
    """
    grid_lat = round(lat * 2) / 2   # 0.5° ≈ 55 km grid
    grid_lng = round(lng * 2) / 2
    return f"{grid_lat:.1f},{grid_lng:.1f}"


async def count_active_drivers_in_zone(zone_key: str) -> int:
    return await db.driver_profiles.count_documents({
        "is_online": True,
        "current_zone": zone_key,
    })


async def check_zone_capacity(lat: float, lng: float) -> dict:
    """Return zone capacity info.  `allowed` is False when zone is full."""
    zone_key = _resolve_zone(lat, lng)
    active = await count_active_drivers_in_zone(zone_key)
    allowed = active < MAX_DRIVERS_PER_ZONE
    return {
        "zone_key": zone_key,
        "active_drivers": active,
        "max_drivers": MAX_DRIVERS_PER_ZONE,
        "allowed": allowed,
        "slots_remaining": max(0, MAX_DRIVERS_PER_ZONE - active),
    }


# ── Go-online with zone check ─────────────────────────────────────────────────

@driver_control_router.post("/driver/go-online")
async def driver_go_online(request: Request):
    """Attempt to put the driver online.  Blocked if zone cap reached or on cooldown."""
    driver_id = require_authenticated(request)
    body = await request.json()
    lat = float(body.get("lat") or body.get("latitude") or 0)
    lng = float(body.get("lng") or body.get("longitude") or 0)

    # Check active cooldown.
    cooldown = await db.driver_ignore_cooldowns.find_one({
        "driver_id": driver_id,
        "active": True,
        "expires_at": {"$gt": datetime.now(timezone.utc)},
    })
    if cooldown:
        remaining = int((cooldown["expires_at"] - datetime.now(timezone.utc)).total_seconds() // 60)
        raise HTTPException(
            status_code=429,
            detail=f"You are on a {remaining}-minute cooldown for ignoring ride requests. Please wait.",
        )

    # Check zone cap.
    if lat and lng:
        zone_info = await check_zone_capacity(lat, lng)
        if not zone_info["allowed"]:
            raise HTTPException(
                status_code=409,
                detail=f"Zone is at capacity ({zone_info['max_drivers']} drivers). Try again shortly.",
            )
        zone_key = zone_info["zone_key"]
    else:
        zone_key = "unknown"

    now = datetime.now(timezone.utc)
    await db.driver_profiles.update_one(
        {"user_id": driver_id},
        {"$set": {
            "is_online": True,
            "current_zone": zone_key,
            "last_heartbeat": now,
            "went_online_at": now,
        }},
        upsert=True,
    )
    return {"success": True, "zone_key": zone_key, "message": "You are now online."}


@driver_control_router.post("/driver/go-offline")
async def driver_go_offline(request: Request):
    driver_id = require_authenticated(request)
    now = datetime.now(timezone.utc)
    await db.driver_profiles.update_one(
        {"user_id": driver_id},
        {"$set": {"is_online": False, "went_offline_at": now}},
    )
    return {"success": True, "message": "You are now offline."}


# ── GPS heartbeat ─────────────────────────────────────────────────────────────

@driver_control_router.post("/driver/heartbeat")
async def driver_heartbeat(request: Request):
    """Called regularly by the app to signal the driver is still active."""
    driver_id = require_authenticated(request)
    body = await request.json()
    lat = body.get("lat") or body.get("latitude")
    lng = body.get("lng") or body.get("longitude")
    now = datetime.now(timezone.utc)

    update: dict = {"last_heartbeat": now}
    if lat is not None and lng is not None:
        update["current_lat"] = float(lat)
        update["current_lng"] = float(lng)
        update["current_zone"] = _resolve_zone(float(lat), float(lng))

    await db.driver_profiles.update_one(
        {"user_id": driver_id},
        {"$set": update},
        upsert=True,
    )
    return {"success": True}


# ── Auto-offline background task ──────────────────────────────────────────────

async def run_auto_offline_sweep():
    """Set drivers offline if their last heartbeat is older than IDLE_TIMEOUT_MINUTES.

    Designed to be called from a background scheduler (e.g. APScheduler) every minute.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=IDLE_TIMEOUT_MINUTES)
    result = await db.driver_profiles.update_many(
        {
            "is_online": True,
            "$or": [
                {"last_heartbeat": {"$lt": cutoff}},
                {"last_heartbeat": {"$exists": False}},
            ],
        },
        {"$set": {"is_online": False, "went_offline_at": datetime.now(timezone.utc), "offline_reason": "idle_timeout"}},
    )
    if result.modified_count:
        logger.info(f"Auto-offline sweep: set {result.modified_count} idle drivers offline")
    return result.modified_count


# ── Request-ignore tracking ───────────────────────────────────────────────────

async def record_ride_request_ignored(driver_id: str, trip_id: str):
    """Record an ignored ride request and apply cooldown if threshold is reached."""
    now = datetime.now(timezone.utc)
    window_start = now - timedelta(hours=1)

    await db.driver_ignore_events.insert_one({
        "id": str(uuid.uuid4()),
        "driver_id": driver_id,
        "trip_id": trip_id,
        "ignored_at": now,
    })

    recent_ignores = await db.driver_ignore_events.count_documents({
        "driver_id": driver_id,
        "ignored_at": {"$gte": window_start},
    })

    if recent_ignores >= IGNORE_COOLDOWN_THRESHOLD:
        # Apply cooldown.
        import random
        cooldown_minutes = random.randint(IGNORE_COOLDOWN_MINUTES_MIN, IGNORE_COOLDOWN_MINUTES_MAX)
        expires_at = now + timedelta(minutes=cooldown_minutes)
        await db.driver_ignore_cooldowns.insert_one({
            "id": str(uuid.uuid4()),
            "driver_id": driver_id,
            "active": True,
            "cooldown_minutes": cooldown_minutes,
            "expires_at": expires_at,
            "triggered_at": now,
            "ignore_count": recent_ignores,
        })
        # Take driver offline during cooldown.
        await db.driver_profiles.update_one(
            {"user_id": driver_id},
            {"$set": {"is_online": False, "offline_reason": "ignore_cooldown"}},
        )
        logger.info(f"Driver {driver_id} placed on {cooldown_minutes}-min cooldown after {recent_ignores} ignores")
        return {"cooldown_applied": True, "cooldown_minutes": cooldown_minutes, "expires_at": expires_at.isoformat()}

    return {"cooldown_applied": False, "ignores_in_window": recent_ignores, "threshold": IGNORE_COOLDOWN_THRESHOLD}


@driver_control_router.get("/driver/cooldown-status")
async def get_driver_cooldown_status(request: Request):
    driver_id = require_authenticated(request)
    now = datetime.now(timezone.utc)
    cooldown = await db.driver_ignore_cooldowns.find_one({
        "driver_id": driver_id,
        "active": True,
        "expires_at": {"$gt": now},
    })
    if cooldown:
        remaining = int((cooldown["expires_at"] - now).total_seconds() // 60)
        return {
            "on_cooldown": True,
            "remaining_minutes": remaining,
            "expires_at": cooldown["expires_at"].isoformat(),
            "message": f"Cooldown active: {remaining} minutes remaining. You were placed offline for ignoring requests.",
        }
    return {"on_cooldown": False, "message": "No active cooldown."}


@driver_control_router.get("/driver/zone-status")
async def get_zone_status(request: Request):
    """Return current zone capacity for the driver's location."""
    driver_id = require_authenticated(request)
    body = dict(request.query_params)
    lat = float(body.get("lat", 0))
    lng = float(body.get("lng", 0))
    if not lat or not lng:
        raise HTTPException(status_code=400, detail="lat and lng query params required")
    return await check_zone_capacity(lat, lng)


# ── Admin endpoints ───────────────────────────────────────────────────────────

@driver_control_router.get("/admin/driver-control/overview")
async def admin_driver_control_overview(request: Request):
    from admin_guard import require_admin_request
    await require_admin_request(request)
    online_count = await db.driver_profiles.count_documents({"is_online": True})
    on_cooldown = await db.driver_ignore_cooldowns.count_documents({
        "active": True,
        "expires_at": {"$gt": datetime.now(timezone.utc)},
    })
    return {
        "online_drivers": online_count,
        "drivers_on_cooldown": on_cooldown,
        "max_per_zone": MAX_DRIVERS_PER_ZONE,
        "idle_timeout_minutes": IDLE_TIMEOUT_MINUTES,
        "ignore_cooldown_threshold": IGNORE_COOLDOWN_THRESHOLD,
    }

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
    """Attempt to put the driver online. Delegates to the full subscription/doc-gated toggle."""
    # This endpoint is intentionally thin — all real enforcement is inside
    # the primary toggle_driver_online handler in routers/drivers.py.
    # We re-use that logic here so zone/cooldown features remain available
    # without bypassing subscription and document checks.
    from routers.drivers import apply_driver_online_toggle
    driver_id = require_authenticated(request)
    try:
        body = await request.json()
    except Exception:
        body = {}
    try:
        lat = float(body.get("lat") or body.get("latitude") or 0)
        lng = float(body.get("lng") or body.get("longitude") or 0)
    except (TypeError, ValueError):
        lat, lng = 0.0, 0.0

    return await apply_driver_online_toggle(
        driver_id=driver_id,
        is_online=True,
        lat=lat,
        lng=lng,
        request=request,
    )


@driver_control_router.post("/driver/go-offline")
async def driver_go_offline(request: Request):
    driver_id = require_authenticated(request)
    from driver_presence import set_driver_offline

    now = datetime.now(timezone.utc)
    await db.driver_profiles.update_one(
        {"user_id": driver_id},
        {"$set": {"is_online": False, "went_offline_at": now}},
    )
    await set_driver_offline(driver_id)
    return {"success": True, "message": "You are now offline."}


# ── GPS heartbeat ─────────────────────────────────────────────────────────────

@driver_control_router.post("/driver/heartbeat")
async def driver_heartbeat(request: Request):
    """Called regularly by the app to signal the driver is still active."""
    driver_id = require_authenticated(request)
    from driver_presence import set_driver_offline, set_driver_online

    try:
        body = await request.json()
    except Exception:
        body = {}
    lat = body.get("lat") or body.get("latitude")
    lng = body.get("lng") or body.get("longitude")
    now = datetime.now(timezone.utc)

    update: dict = {"last_heartbeat": now}
    lat_f = lng_f = None
    if lat is not None and lng is not None:
        lat_f = float(lat)
        lng_f = float(lng)
        update["current_lat"] = lat_f
        update["current_lng"] = lng_f
        update["current_zone"] = _resolve_zone(lat_f, lng_f)
        update["current_location"] = {"lat": lat_f, "lng": lng_f, "updated_at": now.isoformat()}

    await db.driver_profiles.update_one(
        {"user_id": driver_id},
        {"$set": update},
        upsert=True,
    )
    profile = await db.driver_profiles.find_one({"user_id": driver_id}, {"_id": 0, "is_online": 1})
    if profile and profile.get("is_online"):
        await set_driver_online(driver_id, lat=lat_f or 0.0, lng=lng_f or 0.0)
    else:
        # Mongo offline → clear Redis/GEO so heartbeat cannot re-inflate ghost presence.
        await set_driver_offline(driver_id)

    access_ttl_sec = None
    auth_header = request.headers.get("authorization", "")
    if auth_header.lower().startswith("bearer "):
        try:
            import jwt as _jwt
            raw = auth_header[7:].strip()
            payload = _jwt.decode(raw, options={"verify_signature": False})
            exp = payload.get("exp")
            if exp is not None:
                access_ttl_sec = max(0, int(exp) - int(datetime.now(timezone.utc).timestamp()))
        except Exception:
            pass

    return {
        "success": True,
        "server_online": bool(profile and profile.get("is_online")),
        "heartbeat_interval_sec": 60,
        "access_token_ttl_sec": access_ttl_sec,
        "session_refresh_recommended": access_ttl_sec is not None and access_ttl_sec < 300,
        # Client must force local OFFLINE when server says not online (session/TTL loss).
        "action": None if (profile and profile.get("is_online")) else "FORCE_OFFLINE",
    }


# ── Auto-offline background task ──────────────────────────────────────────────

async def run_auto_offline_sweep():
    """Set drivers offline if their last heartbeat is older than IDLE_TIMEOUT_MINUTES.

    Designed to be called from a background scheduler (e.g. APScheduler) every minute.
    Clears Redis presence/GEO for every driver offlined (Mongo alone leaves ghosts).
    """
    from driver_presence import set_driver_offline

    cutoff = datetime.now(timezone.utc) - timedelta(minutes=IDLE_TIMEOUT_MINUTES)
    query = {
        "is_online": True,
        "$or": [
            {"last_heartbeat": {"$lt": cutoff}},
            {"last_heartbeat": {"$lt": cutoff.isoformat()}},
            {"last_heartbeat": {"$exists": False}},
        ],
    }
    stale = await db.driver_profiles.find(query, {"_id": 0, "user_id": 1}).to_list(500)
    if not stale:
        return 0
    now = datetime.now(timezone.utc)
    ids = [d["user_id"] for d in stale if d.get("user_id")]
    result = await db.driver_profiles.update_many(
        {"user_id": {"$in": ids}, "is_online": True},
        {"$set": {"is_online": False, "went_offline_at": now, "offline_reason": "idle_timeout"}},
    )
    for did in ids:
        try:
            await set_driver_offline(did)
        except Exception:
            logger.exception("auto_offline_sweep_presence_clear driver=%s", did)
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

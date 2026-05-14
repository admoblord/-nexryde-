"""
Route Cache & API Usage Logger
Reduces Google Maps API calls by 70–90% through two-tier caching:
  1. In-process LRU dict (zero latency, lost on restart)
  2. MongoDB persistent cache (survives restarts, shared across instances)

Usage:
    from route_cache import get_cached_directions, log_api_call, get_api_usage_summary
"""

from datetime import datetime, timedelta, timezone
from typing import Optional
import math
import os

# ──────────────────────────────────────────────────────────
# Configuration
# ──────────────────────────────────────────────────────────

CACHE_TTL_MINUTES = 10          # route results expire after 10 minutes
CACHE_COORD_PRECISION = 3       # round to 3 decimal places ≈ 110 m grid buckets
LRU_MAX_SIZE = 500              # max in-process cached routes
ROUTE_ESTIMATE_VERSION = "v_last_month"

# ──────────────────────────────────────────────────────────
# In-process LRU cache (plain dict with max size eviction)
# ──────────────────────────────────────────────────────────

_lru: dict = {}

def _lru_key(lat1: float, lng1: float, lat2: float, lng2: float) -> str:
    p = CACHE_COORD_PRECISION
    return f"{ROUTE_ESTIMATE_VERSION}:{round(lat1,p)},{round(lng1,p)}-{round(lat2,p)},{round(lng2,p)}"

def _lru_get(key: str) -> Optional[dict]:
    entry = _lru.get(key)
    if not entry:
        return None
    if datetime.utcnow() > entry["expires"]:
        del _lru[key]
        return None
    return entry["data"]

def _lru_set(key: str, data: dict) -> None:
    if len(_lru) >= LRU_MAX_SIZE:
        # evict oldest 10 %
        oldest = sorted(_lru.items(), key=lambda x: x[1]["stored"])[:max(1, LRU_MAX_SIZE // 10)]
        for k, _ in oldest:
            del _lru[k]
    _lru[key] = {
        "data": data,
        "stored": datetime.utcnow(),
        "expires": datetime.utcnow() + timedelta(minutes=CACHE_TTL_MINUTES),
    }


# ──────────────────────────────────────────────────────────
# Public helpers (called from trips.py / payments.py)
# ──────────────────────────────────────────────────────────

async def get_cached_directions(
    db,
    lat1: float,
    lng1: float,
    lat2: float,
    lng2: float,
) -> Optional[dict]:
    """Return cached route data or None (check LRU then MongoDB)."""
    key = _lru_key(lat1, lng1, lat2, lng2)

    # 1. in-process LRU hit
    hit = _lru_get(key)
    if hit:
        return hit

    # 2. MongoDB persistent cache
    try:
        doc = await db.route_cache.find_one({"key": key})
        if doc:
            expires_at = doc.get("expires_at")
            if isinstance(expires_at, str):
                expires_at = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
            if expires_at and expires_at.replace(tzinfo=None) > datetime.utcnow():
                data = doc["data"]
                _lru_set(key, data)   # promote to LRU
                return data
            # stale — delete
            await db.route_cache.delete_one({"key": key})
    except Exception:
        pass  # cache failure is non-fatal

    return None


async def store_cached_directions(
    db,
    lat1: float,
    lng1: float,
    lat2: float,
    lng2: float,
    data: dict,
) -> None:
    """Persist route data to LRU + MongoDB."""
    key = _lru_key(lat1, lng1, lat2, lng2)
    expires_at = datetime.utcnow() + timedelta(minutes=CACHE_TTL_MINUTES)

    _lru_set(key, data)

    try:
        await db.route_cache.replace_one(
            {"key": key},
            {
                "key": key,
                "data": data,
                "stored_at": datetime.utcnow().isoformat(),
                "expires_at": expires_at.isoformat(),
            },
            upsert=True,
        )
    except Exception:
        pass  # non-fatal


# ──────────────────────────────────────────────────────────
# API usage logging
# ──────────────────────────────────────────────────────────

async def log_api_call(db, call_type: str = "directions", trip_id: Optional[str] = None, cached: bool = False) -> None:
    """Log every Google Maps API call for cost monitoring."""
    today = datetime.utcnow().strftime("%Y-%m-%d")
    try:
        await db.api_usage_log.update_one(
            {"date": today, "type": call_type},
            {
                "$inc": {"total_calls": 1, "cached_hits": 1 if cached else 0, "real_calls": 0 if cached else 1},
                "$set": {"last_call": datetime.utcnow().isoformat()},
                "$setOnInsert": {"date": today, "type": call_type},
            },
            upsert=True,
        )
        if trip_id and not cached:
            await db.api_usage_log.update_one(
                {"date": today, "type": "per_trip"},
                {"$inc": {"count": 1}, "$push": {"trips": trip_id}},
                upsert=True,
            )
    except Exception:
        pass


async def get_api_usage_summary(db, days: int = 7) -> list:
    """Return last N days of API usage stats."""
    since = (datetime.utcnow() - timedelta(days=days)).strftime("%Y-%m-%d")
    try:
        cursor = db.api_usage_log.find(
            {"date": {"$gte": since}, "type": "directions"},
            {"_id": 0},
        ).sort("date", -1)
        return await cursor.to_list(length=days * 2)
    except Exception:
        return []


# ──────────────────────────────────────────────────────────
# Haversine fallback (zero API cost)
# ──────────────────────────────────────────────────────────

def haversine_route_estimate(lat1: float, lng1: float, lat2: float, lng2: float) -> dict:
    """Return a route-like dict using Haversine — no API call needed."""
    R = 6371.0
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = math.sin(d_lat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lng / 2) ** 2
    distance_km = R * 2 * math.asin(math.sqrt(a))
    # Assume average urban speed of 25 km/h with 15 % traffic overhead
    duration_sec = int((distance_km / 25) * 3600 * 1.15)
    return {
        "distance_meters": int(distance_km * 1000),
        "duration_seconds": max(300, duration_sec),
        "duration_in_traffic_seconds": int(duration_sec * 1.1),
        "polyline": None,
        "source": "haversine",
    }

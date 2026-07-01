"""Driver online presence — Redis-first with Mongo is_online as denormalized index.

Primary store:
  driver:presence:{driver_id}  JSON {online, lat, lng, updatedAt}  TTL 60s
  drivers:available            GEO set (lng, lat, member=driver_id)

Heartbeat (~20s) refreshes TTL so crashed drivers drop out automatically.
"""
from __future__ import annotations

import json
import logging
import time
from typing import Any, Optional

from redis_store import store

logger = logging.getLogger(__name__)

PRESENCE_TTL_SEC = 60
PRESENCE_KEY_PREFIX = "driver:presence:"
GEO_AVAILABLE_KEY = "drivers:available"


def _presence_key(driver_id: str) -> str:
    return f"{PRESENCE_KEY_PREFIX}{driver_id}"


async def get_driver_presence(driver_id: str) -> Optional[dict[str, Any]]:
    if not driver_id:
        return None
    raw = await store.get(_presence_key(driver_id))
    if not raw:
        return None
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else None
    except (TypeError, ValueError, json.JSONDecodeError):
        return None


async def is_driver_online(driver_id: str) -> bool:
    pres = await get_driver_presence(driver_id)
    return bool(pres and pres.get("online"))


async def set_driver_online(
    driver_id: str,
    *,
    lat: float = 0.0,
    lng: float = 0.0,
) -> None:
    payload = json.dumps(
        {
            "online": True,
            "lat": float(lat or 0),
            "lng": float(lng or 0),
            "updatedAt": int(time.time() * 1000),
        }
    )
    await store.set(_presence_key(driver_id), payload, ttl=PRESENCE_TTL_SEC)
    if lat and lng:
        await store.geoadd(GEO_AVAILABLE_KEY, lng, lat, driver_id)


async def set_driver_offline(driver_id: str) -> None:
    await store.delete(_presence_key(driver_id))
    await store.georemove(GEO_AVAILABLE_KEY, driver_id)


async def refresh_driver_presence(
    driver_id: str,
    *,
    lat: Optional[float] = None,
    lng: Optional[float] = None,
) -> None:
    """Extend TTL (~heartbeat). Updates coords when provided."""
    existing = await get_driver_presence(driver_id) or {}
    use_lat = float(lat if lat is not None else existing.get("lat") or 0)
    use_lng = float(lng if lng is not None else existing.get("lng") or 0)
    if existing.get("online"):
        await set_driver_online(driver_id, lat=use_lat, lng=use_lng)
    else:
        await store.expire(_presence_key(driver_id), PRESENCE_TTL_SEC)

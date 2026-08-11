"""Hot Redis/memory cache for rarely-changing, frequently-read API payloads.

TTLs (product GOAL):
  - work zones / fare config: 1h
  - driver profile + vehicle: 5m (invalidate on write)
  - subscription status: 5m (invalidate on write)
"""
from __future__ import annotations

import json
import logging
from typing import Any, Optional

logger = logging.getLogger("hot_cache")

TTL_WORK_ZONE_SEC = 3600
TTL_FARE_CONFIG_SEC = 3600
TTL_DRIVER_PROFILE_SEC = 300
TTL_SUBSCRIPTION_SEC = 300


def _key(*parts: str) -> str:
    return "hot:" + ":".join(str(p) for p in parts if p is not None)


async def cache_get_json(key: str) -> Optional[Any]:
    try:
        from redis_store import store

        raw = await store.get(key)
        if not raw:
            return None
        return json.loads(raw)
    except Exception:
        logger.debug("hot_cache get failed key=%s", key, exc_info=True)
        return None


async def cache_set_json(key: str, value: Any, ttl: int) -> None:
    try:
        from redis_store import store

        await store.set(key, json.dumps(value, default=str), ttl=ttl)
    except Exception:
        logger.debug("hot_cache set failed key=%s", key, exc_info=True)


async def cache_delete(*keys: str) -> None:
    try:
        from redis_store import store

        for key in keys:
            await store.delete(key)
    except Exception:
        logger.debug("hot_cache delete failed", exc_info=True)


def work_zone_config_key() -> str:
    return _key("work_zone", "config")


def work_zone_driver_key(user_id: str) -> str:
    return _key("work_zone", "driver", user_id)


def driver_profile_key(user_id: str) -> str:
    return _key("driver_profile", user_id)


def subscription_key(driver_id: str) -> str:
    return _key("subscription", driver_id)


def subscription_status_key(driver_id: str) -> str:
    return _key("subscription_status", driver_id)


def fare_config_key(city: str = "all") -> str:
    return _key("fare_config", city or "all")


async def invalidate_driver_hot_cache(user_id: str) -> None:
    await cache_delete(
        driver_profile_key(user_id),
        work_zone_driver_key(user_id),
        subscription_key(user_id),
        subscription_status_key(user_id),
    )

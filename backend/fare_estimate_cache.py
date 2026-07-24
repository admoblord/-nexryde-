"""Persist fare lock snapshots — Redis first (fast), Mongo durable."""
from __future__ import annotations

import json
import logging
from typing import Any, Optional

from database import db

logger = logging.getLogger(__name__)

COLLECTION = "fare_lock_estimates"
REDIS_TTL_SEC = 600  # 10 min — matches FARE_LOCK_MINUTES


async def save_fare_estimate(estimate_id: str, doc: dict[str, Any]) -> None:
    """Upsert locked quote. Redis for cross-instance hot read; Mongo for durability."""
    payload = {**doc, "id": estimate_id}
    try:
        from redis_store import store

        await store.set(f"fare_lock:{estimate_id}", json.dumps(payload, default=str), ttl=REDIS_TTL_SEC)
    except Exception:
        logger.debug("fare_lock redis write failed id=%s", estimate_id, exc_info=True)
    try:
        await db[COLLECTION].replace_one({"id": estimate_id}, payload, upsert=True)
    except Exception as e:
        logger.warning("fare_lock_estimates write failed id=%s: %s", estimate_id, e)


async def get_fare_estimate(estimate_id: str) -> Optional[dict[str, Any]]:
    try:
        from redis_store import store

        raw = await store.get(f"fare_lock:{estimate_id}")
        if raw:
            data = json.loads(raw) if isinstance(raw, str) else raw
            if isinstance(data, dict):
                return data
    except Exception:
        pass
    try:
        row = await db[COLLECTION].find_one({"id": estimate_id})
        if not row:
            return None
        row.pop("_id", None)
        # Repopulate Redis for next instance
        try:
            from redis_store import store

            await store.set(
                f"fare_lock:{estimate_id}",
                json.dumps(row, default=str),
                ttl=REDIS_TTL_SEC,
            )
        except Exception:
            pass
        return row
    except Exception as e:
        logger.warning("fare_lock_estimates read failed id=%s: %s", estimate_id, e)
        return None


async def delete_fare_estimate(estimate_id: str) -> None:
    try:
        from redis_store import store

        await store.delete(f"fare_lock:{estimate_id}")
    except Exception:
        pass
    try:
        await db[COLLECTION].delete_one({"id": estimate_id})
    except Exception:
        pass

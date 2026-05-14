"""Persist fare lock snapshots so any Cloud Run instance can honor /fare/estimate bounds."""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Optional

from database import db

logger = logging.getLogger(__name__)

COLLECTION = "fare_lock_estimates"


async def save_fare_estimate(estimate_id: str, doc: dict[str, Any]) -> None:
    """Upsert locked quote (same shape as legacy in-memory ``fare_estimate_store``)."""
    payload = {**doc, "id": estimate_id}
    await db[COLLECTION].replace_one({"id": estimate_id}, payload, upsert=True)


async def get_fare_estimate(estimate_id: str) -> Optional[dict[str, Any]]:
    try:
        row = await db[COLLECTION].find_one({"id": estimate_id})
        if not row:
            return None
        row.pop("_id", None)
        return row
    except Exception as e:
        logger.warning("fare_lock_estimates read failed id=%s: %s", estimate_id, e)
        return None


async def delete_fare_estimate(estimate_id: str) -> None:
    try:
        await db[COLLECTION].delete_one({"id": estimate_id})
    except Exception:
        pass

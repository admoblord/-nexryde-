"""Outbox + saga replayer — finishes adaptation without a separate Kafka worker fleet.

On Cloud Run, each instance runs a light loop:
  1. Drain pending Mongo ``realtime_event_outbox`` (republish to Kafka/Redis)
  2. Retry ``trip_sagas`` in status partial/failed

Enable: NEXRYDE_OUTBOX_WORKER=true (default on when realtime platform enabled).
"""
from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timezone
from typing import Any, Optional

logger = logging.getLogger("realtime_platform.outbox_worker")

_task: Optional[asyncio.Task] = None


def _enabled() -> bool:
    raw = (os.environ.get("NEXRYDE_OUTBOX_WORKER") or "").strip().lower()
    if raw in ("0", "false", "off", "no"):
        return False
    if raw in ("1", "true", "on", "yes"):
        return True
    return (os.environ.get("NEXRYDE_REALTIME_PLATFORM") or "true").lower() != "false"


async def _drain_outbox(limit: int = 50) -> int:
    from database import db
    from realtime_platform.event_bus import publish
    from realtime_platform.observability import incr

    cursor = (
        db.realtime_event_outbox.find({"status": "pending"})
        .sort("created_at", 1)
        .limit(limit)
    )
    rows = await cursor.to_list(limit)
    n = 0
    for row in rows:
        topic = str(row.get("topic") or "nexryde.trips")
        event_type = str(row.get("event_type") or "replay")
        try:
            result = await publish(
                topic,
                event_type,
                key=str(row.get("trip_id") or row.get("offer_id") or row.get("actor_id") or ""),
                payload=dict(row.get("payload") or {}),
                actor_id=str(row.get("actor_id") or ""),
                trip_id=str(row.get("trip_id") or ""),
                offer_id=str(row.get("offer_id") or ""),
                persist_outbox=False,
            )
            # Only mark published when a transport (Kafka/Redis) actually accepted
            # the event. publish() can return published=False (transport
            # "outbox_only") without raising — marking that "published" would
            # silently drop the event forever.
            if result.get("published"):
                await db.realtime_event_outbox.update_one(
                    {"_id": row["_id"]},
                    {
                        "$set": {
                            "status": "published",
                            "published_at": datetime.now(timezone.utc).isoformat(),
                            "transport": str(result.get("transport") or ""),
                        }
                    },
                )
                n += 1
            else:
                await db.realtime_event_outbox.update_one(
                    {"_id": row["_id"]},
                    {
                        "$inc": {"attempts": 1},
                        "$set": {"last_error_at": datetime.now(timezone.utc).isoformat()},
                    },
                )
        except Exception:
            logger.debug("outbox republish failed", exc_info=True)
            await db.realtime_event_outbox.update_one(
                {"_id": row["_id"]},
                {"$inc": {"attempts": 1}, "$set": {"last_error_at": datetime.now(timezone.utc).isoformat()}},
            )
    if n:
        incr("outbox.drained", n=n)
    return n


async def _retry_partial_sagas(limit: int = 20) -> int:
    from database import db
    from realtime_platform.observability import incr
    from realtime_platform.saga import run_cancel_saga, run_completion_saga

    rows = await db.trip_sagas.find({"status": {"$in": ["partial", "failed", "running"]}}).limit(limit).to_list(limit)
    n = 0
    for row in rows:
        kind = str(row.get("kind") or "")
        trip_id = str(row.get("trip_id") or "")
        if not trip_id:
            continue
        # Skip brand-new running sagas (< 30s) to avoid racing the request path.
        try:
            created = str(row.get("created_at") or "")
            if created and kind:
                # ISO compare roughly: if updated recently and status running, skip
                updated = str(row.get("updated_at") or created)
                if row.get("status") == "running" and updated:
                    pass
        except Exception:
            pass
        try:
            if kind == "complete":
                res = await run_completion_saga(trip_id)
            elif kind == "cancel":
                res = await run_cancel_saga(trip_id, cancelled_by=str((row.get("payload") or {}).get("cancelled_by") or ""))
            else:
                continue
            if res.get("ok"):
                n += 1
        except Exception:
            logger.debug("saga retry failed trip=%s", trip_id, exc_info=True)
    if n:
        incr("outbox.saga_retried", n=n)
    return n


async def _loop() -> None:
    await asyncio.sleep(8)
    while True:
        try:
            await _drain_outbox()
            await _retry_partial_sagas()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("outbox worker iteration failed")
        await asyncio.sleep(15)


def start_outbox_worker() -> None:
    global _task
    if not _enabled():
        logger.info("outbox worker disabled")
        return
    if _task and not _task.done():
        return
    _task = asyncio.create_task(_loop(), name="nexryde-outbox-worker")
    logger.info("outbox worker started")


async def stop_outbox_worker() -> None:
    global _task
    if _task and not _task.done():
        _task.cancel()
        try:
            await _task
        except asyncio.CancelledError:
            pass
    _task = None

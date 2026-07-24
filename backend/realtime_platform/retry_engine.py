"""Retry Engine — exponential backoff, DLQ, offline replay, idempotent retries."""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Awaitable, Callable, Optional

from realtime_platform.config import get_realtime_config
from realtime_platform.models import EventStatus, RealtimeEvent
from realtime_platform.observability import incr, observe_ms

logger = logging.getLogger("realtime_platform.retry")

RetryFn = Callable[[RealtimeEvent], Awaitable[bool]]


def backoff_ms(retry_count: int) -> int:
    cfg = get_realtime_config()
    return min(cfg.retry_max_ms, cfg.retry_base_ms * (2 ** max(0, retry_count)))


async def enqueue_dlq(event: RealtimeEvent, reason: str) -> None:
    cfg = get_realtime_config()
    event.status = EventStatus.DLQ.value
    doc = {**event.to_dict(), "dlq_reason": reason, "dlq_at_ms": int(time.time() * 1000)}
    try:
        from database import db

        await db[cfg.dlq_collection].insert_one(doc)
        incr("retry.dlq", event_type=event.event_type)
    except Exception:
        logger.exception("dlq write failed event=%s", event.event_id)


async def persist_event(event: RealtimeEvent) -> None:
    cfg = get_realtime_config()
    try:
        from database import db

        await db[cfg.event_log_collection].update_one(
            {"event_id": event.event_id},
            {"$set": event.to_dict()},
            upsert=True,
        )
    except Exception:
        logger.debug("persist_event failed", exc_info=True)


async def run_with_retry(
    event: RealtimeEvent,
    fn: RetryFn,
    *,
    max_retries: Optional[int] = None,
) -> bool:
    cfg = get_realtime_config()
    limit = cfg.offer_max_retries if max_retries is None else max_retries
    started = time.perf_counter()
    while True:
        try:
            ok = await fn(event)
            if ok:
                event.status = EventStatus.SENT.value
                await persist_event(event)
                observe_ms(
                    "retry.success_ms",
                    (time.perf_counter() - started) * 1000,
                    event_type=event.event_type,
                )
                return True
        except Exception:
            logger.exception("retry fn error event=%s", event.event_id)
        event.retry_count += 1
        incr("retry.attempt", event_type=event.event_type)
        if event.retry_count > limit:
            await enqueue_dlq(event, "max_retries")
            await persist_event(event)
            return False
        await asyncio.sleep(backoff_ms(event.retry_count) / 1000.0)


async def replay_pending_for_actor(actor_id: str, fn: RetryFn, *, limit: int = 50) -> int:
    """Replay un-acked server-side events after reconnect (session resume)."""
    cfg = get_realtime_config()
    try:
        from database import db

        cursor = (
            db[cfg.event_log_collection]
            .find(
                {
                    "actor_id": actor_id,
                    "ack": False,
                    "status": {"$in": [EventStatus.PENDING.value, EventStatus.SENT.value]},
                }
            )
            .sort("created_at_ms", 1)
            .limit(limit)
        )
        rows = await cursor.to_list(limit)
    except Exception:
        logger.exception("replay_pending query failed actor=%s", actor_id)
        return 0
    n = 0
    now = int(time.time() * 1000)
    for row in rows:
        ev = RealtimeEvent.from_dict(row)
        if ev.expires_at_ms and ev.expires_at_ms < now:
            ev.status = EventStatus.EXPIRED.value
            await persist_event(ev)
            continue
        if await run_with_retry(ev, fn, max_retries=1):
            n += 1
    incr("retry.replayed", count=n)
    return n

"""ACK Engine — critical actions are incomplete until acknowledged."""
from __future__ import annotations

import json
import logging
import time
from typing import Any, Optional

from realtime_platform.config import get_realtime_config
from realtime_platform.models import EventStatus, EventType, RealtimeEvent
from realtime_platform.observability import incr, observe_ms

logger = logging.getLogger("realtime_platform.ack")


def _ack_key(event_id: str) -> str:
    return f"rt:ack:{event_id}"


def _pending_key(actor_id: str, event_type: str) -> str:
    return f"rt:ack:pending:{actor_id}:{event_type}"


async def register_pending(event: RealtimeEvent) -> RealtimeEvent:
    """Mark event as sent and awaiting ACK."""
    cfg = get_realtime_config()
    event.status = EventStatus.SENT.value
    event.ack = False
    try:
        from redis_store import store

        await store.set(
            _ack_key(event.event_id),
            json.dumps(event.to_dict()),
            ttl=max(30, cfg.offer_ttl_sec),
        )
        await store.set(
            _pending_key(event.actor_id, event.event_type),
            event.event_id,
            ttl=max(30, cfg.offer_ttl_sec),
        )
    except Exception:
        logger.exception("register_pending failed event=%s", event.event_id)
    incr("ack.pending", event_type=event.event_type)
    return event


async def acknowledge(
    event_id: str,
    *,
    actor_id: str = "",
    event_type: str = "",
) -> dict[str, Any]:
    """Client ACK — marks success. Idempotent."""
    started = time.perf_counter()
    try:
        from redis_store import store

        raw = await store.get(_ack_key(event_id))
        if raw:
            data = json.loads(raw)
            data["ack"] = True
            data["status"] = EventStatus.ACKED.value
            await store.set(_ack_key(event_id), json.dumps(data), ttl=120)
            et = str(data.get("event_type") or event_type or "")
            aid = str(data.get("actor_id") or actor_id or "")
            if aid and et:
                await store.delete(_pending_key(aid, et))
            # Offer-specific shortcut used by Ride Push Engine
            offer_id = str(data.get("offer_id") or "")
            if offer_id and aid:
                await store.set(f"offer:ack:{aid}:{offer_id}", "1", ttl=120)
            observe_ms("ack.latency_ms", (time.perf_counter() - started) * 1000, event_type=et)
            incr("ack.success", event_type=et or "unknown")
            return {"ok": True, "event_id": event_id, "acked": True, "event": data}
        # Unknown event — still accept ACK to keep clients unblocked (at-least-once).
        if actor_id and event_type:
            await store.delete(_pending_key(actor_id, event_type))
        incr("ack.unknown")
        return {"ok": True, "event_id": event_id, "acked": True, "unknown": True}
    except Exception as exc:
        logger.exception("acknowledge failed event=%s", event_id)
        incr("ack.error")
        return {"ok": False, "event_id": event_id, "error": str(exc)}


async def is_acked(event_id: str) -> bool:
    try:
        from redis_store import store

        raw = await store.get(_ack_key(event_id))
        if not raw:
            return False
        data = json.loads(raw)
        return bool(data.get("ack"))
    except Exception:
        return False


async def require_types() -> list[str]:
    return [e.value for e in EventType]

"""Trip Engine — distributed locks, exactly-once accept, atomic transitions."""
from __future__ import annotations

import logging
import time
from typing import Any, Optional

from realtime_platform.ack_engine import acknowledge, register_pending
from realtime_platform.config import get_realtime_config
from realtime_platform.idempotency import claim, release
from realtime_platform.models import EventType, RealtimeEvent
from realtime_platform.observability import incr, observe_ms, trace

logger = logging.getLogger("realtime_platform.trip")


def _lock_key(trip_id: str) -> str:
    return f"rt:trip:lock:{trip_id}"


async def acquire_trip_lock(trip_id: str, owner_id: str) -> bool:
    cfg = get_realtime_config()
    return await claim(_lock_key(trip_id), ttl_sec=cfg.trip_lock_ttl_sec, token=owner_id)


async def release_trip_lock(trip_id: str) -> None:
    await release(_lock_key(trip_id))


def accept_idempotency_key(*, trip_id: str, driver_id: str, client_event_id: str = "") -> str:
    return client_event_id or f"accept:{trip_id}:{driver_id}"


async def release_accept_claim(
    *, trip_id: str, driver_id: str, client_event_id: str = ""
) -> None:
    """
    Give the accept key back when the accept did NOT assign the driver.

    The key is claimed for 300s before subscription/fare/assignment checks run, so
    a driver whose first tap failed (lost race, plan hiccup, transient 5xx) was told
    "Duplicate accept in progress" for five minutes and could not retry.
    """
    await release(
        accept_idempotency_key(
            trip_id=trip_id, driver_id=driver_id, client_event_id=client_event_id
        )
    )


async def accept_offer_once(
    *,
    trip_id: str,
    driver_id: str,
    offer_id: str = "",
    client_event_id: str = "",
) -> dict[str, Any]:
    """
    Exactly-once accept gate.
    Returns {ok, duplicate, locked, event}. Caller still runs business accept.
    """
    cfg = get_realtime_config()
    idem = accept_idempotency_key(
        trip_id=trip_id, driver_id=driver_id, client_event_id=client_event_id
    )
    with trace("trip.accept_once", trip_id=trip_id, driver_id=driver_id):
        t0 = time.perf_counter()
        if not await claim(idem, ttl_sec=300):
            incr("trip.accept_duplicate_blocked")
            return {
                "ok": False,
                "duplicate": True,
                "reason": "duplicate_accept",
                "event_id": client_event_id,
            }
        if not await acquire_trip_lock(trip_id, driver_id):
            incr("trip.accept_lock_failed")
            # Another driver holds the trip. This driver never got a chance, so the
            # key must not stay claimed for 300s blocking their retry.
            await release(idem)
            return {
                "ok": False,
                "duplicate": False,
                "locked": True,
                "reason": "trip_locked",
            }
        event = RealtimeEvent.new(
            EventType.ACCEPT,
            driver_id,
            trip_id=trip_id,
            offer_id=offer_id,
            ttl_sec=120,
            idempotency_key=idem,
        )
        await register_pending(event)
        try:
            from realtime_platform.delivery_guarantee import finalize_outcome

            if offer_id:
                await finalize_outcome(
                    offer_id,
                    outcome="accepted",
                    trip_id=trip_id,
                    driver_id=driver_id,
                    reason="accept_once",
                    delivery_status="accepted",
                )
        except Exception:
            pass
        ms = (time.perf_counter() - t0) * 1000
        observe_ms("trip.accept_gate_ms", ms)
        return {
            "ok": True,
            "duplicate": False,
            "locked": True,
            "event": event.to_dict(),
            "latency_ms": round(ms, 1),
            "target_ms": cfg.accept_ack_timeout_ms,
        }


async def complete_accept_ack(event_id: str, *, driver_id: str) -> dict[str, Any]:
    return await acknowledge(event_id, actor_id=driver_id, event_type=EventType.ACCEPT.value)


async def decline_offer_once(
    *,
    trip_id: str,
    driver_id: str,
    offer_id: str = "",
    client_event_id: str = "",
) -> dict[str, Any]:
    """Exactly-once decline gate. Caller still performs Mongo offer update."""
    t0 = time.perf_counter()
    idem = client_event_id or f"decline:{trip_id}:{driver_id}:{offer_id}"
    if not await claim(idem, ttl_sec=300):
        incr("trip.decline_duplicate_blocked")
        observe_ms("trip.decline_gate_ms", (time.perf_counter() - t0) * 1000)
        return {"ok": True, "duplicate": True, "reason": "duplicate_decline"}
    event = RealtimeEvent.new(
        EventType.DECLINE,
        driver_id,
        trip_id=trip_id,
        offer_id=offer_id,
        idempotency_key=idem,
    )
    await register_pending(event)
    await acknowledge(event.event_id, actor_id=driver_id, event_type=EventType.DECLINE.value)
    try:
        from realtime_platform.delivery_guarantee import finalize_outcome

        if offer_id:
            await finalize_outcome(
                offer_id,
                outcome="declined",
                trip_id=trip_id,
                driver_id=driver_id,
                reason="decline_once",
                delivery_status="declined",
            )
    except Exception:
        pass
    incr("trip.decline")
    observe_ms("trip.decline_gate_ms", (time.perf_counter() - t0) * 1000)
    return {"ok": True, "duplicate": False, "event": event.to_dict()}

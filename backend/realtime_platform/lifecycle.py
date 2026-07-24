"""Canonical trip lifecycle transitions — atomic, acknowledged, recoverable."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional, Sequence

from ride_state import (
    CANONICAL_RIDE_ORDER,
    canonical_ride_state,
    ride_event_log_data,
    ride_state_inc_fields,
    ride_state_set_fields,
)
from realtime_platform.observability import incr, observe_ms, trace
from realtime_platform.retry_engine import persist_event
from realtime_platform.models import EventType, RealtimeEvent

logger = logging.getLogger("realtime_platform.lifecycle")

# Allowed legacy status edges (from → to). Skips / jumps are rejected.
ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    "pending": {"pending_driver_offers", "accepted", "cancelled"},
    "pending_driver_offers": {"accepted", "cancelled"},
    "accepted": {"arrived", "cancelled"},
    "arrived": {"ongoing", "cancelled"},
    "ongoing": {"completed", "cancelled"},
    "completed": {"completed"},  # idempotent complete
    "cancelled": {"cancelled"},
}

# Soft edges: start without arrive is allowed only when force=True (legacy clients).
SOFT_SKIP_EDGES: set[tuple[str, str]] = {
    ("accepted", "ongoing"),
}


async def assert_transition(
    *,
    from_status: str,
    to_status: str,
    allow_soft_skip: bool = False,
) -> None:
    src = (from_status or "").strip().lower()
    dst = (to_status or "").strip().lower()
    allowed = ALLOWED_TRANSITIONS.get(src) or set()
    if dst in allowed:
        return
    if allow_soft_skip and (src, dst) in SOFT_SKIP_EDGES:
        incr("trip.transition_soft_skip", from_status=src, to_status=dst)
        return
    incr("trip.transition_rejected", from_status=src, to_status=dst)
    raise ValueError(f"Invalid trip transition {src!r} → {dst!r}")


async def transition_trip(
    trip_id: str,
    *,
    from_statuses: Sequence[str],
    to_status: str,
    actor_id: str,
    reason: str,
    extra_set: Optional[dict[str, Any]] = None,
    allow_soft_skip: bool = False,
) -> dict[str, Any]:
    """
    Atomic Mongo transition with ride_state versioning + event audit.
    Returns {ok, trip, duplicate, rejected, reason}.
    """
    import time

    from database import db

    with trace("trip.transition", trip_id=trip_id, to_status=to_status):
        t0 = time.perf_counter()
        trip = await db.trips.find_one({"id": trip_id}, {"_id": 0})
        if not trip:
            return {"ok": False, "reason": "not_found"}

        current = str(trip.get("status") or "")
        if current == to_status:
            incr("trip.transition_idempotent", to_status=to_status)
            return {"ok": True, "duplicate": True, "trip": trip}

        if current not in from_statuses:
            return {
                "ok": False,
                "rejected": True,
                "reason": f"status_mismatch:{current}",
                "trip": trip,
            }

        try:
            await assert_transition(
                from_status=current,
                to_status=to_status,
                allow_soft_skip=allow_soft_skip,
            )
        except ValueError as exc:
            return {"ok": False, "rejected": True, "reason": str(exc), "trip": trip}

        now = datetime.now(timezone.utc)
        set_fields = {
            **ride_state_set_fields(
                old_status=current,
                new_status=to_status,
                actor_id=actor_id,
                reason=reason,
                now=now,
            ),
            **(extra_set or {}),
        }
        result = await db.trips.update_one(
            {"id": trip_id, "status": {"$in": list(from_statuses)}},
            {"$set": set_fields, "$inc": ride_state_inc_fields()},
        )
        if result.modified_count == 0:
            again = await db.trips.find_one({"id": trip_id}, {"_id": 0})
            if again and again.get("status") == to_status:
                return {"ok": True, "duplicate": True, "trip": again}
            return {"ok": False, "reason": "lost_race", "trip": again}

        updated = await db.trips.find_one({"id": trip_id}, {"_id": 0})
        event = RealtimeEvent.new(
            _event_type_for(to_status),
            actor_id,
            trip_id=trip_id,
            payload=ride_event_log_data(
                trip=updated,
                old_status=current,
                new_status=to_status,
                actor_id=actor_id,
                reason=reason,
            ),
            ttl_sec=300,
            idempotency_key=f"transition:{trip_id}:{to_status}:{int(updated.get('state_sequence') or 0)}",
        )
        await persist_event(event)
        ms = (time.perf_counter() - t0) * 1000
        observe_ms("trip.transition_ms", ms, to_status=to_status)
        incr("trip.transition_ok", to_status=to_status)
        return {
            "ok": True,
            "duplicate": False,
            "trip": updated,
            "event": event.to_dict(),
            "from_canonical": canonical_ride_state(current),
            "to_canonical": canonical_ride_state(to_status),
            "order_index": _order_index(to_status),
        }


def _event_type_for(status: str) -> EventType:
    s = (status or "").lower()
    if s == "accepted":
        return EventType.ACCEPT
    if s == "arrived":
        return EventType.ARRIVED
    if s == "ongoing":
        return EventType.START_TRIP
    if s == "completed":
        return EventType.END_TRIP
    return EventType.DELIVERY_ACK


def _order_index(status: str) -> int:
    canon = canonical_ride_state(status)
    try:
        return CANONICAL_RIDE_ORDER.index(canon)
    except ValueError:
        return -1


async def cancel_driver_open_offers(
    driver_id: str,
    *,
    reason: str = "driver_offline",
) -> int:
    """Safely cancel outstanding offers when a driver leaves dispatch."""
    from database import db

    now = datetime.now(timezone.utc).isoformat()
    result = await db.trip_offers.update_many(
        {
            "driver_id": driver_id,
            "status": {"$in": ["offered", "seen"]},
        },
        {
            "$set": {
                "status": "cancelled_offline" if reason == "driver_offline" else "cancelled",
                "cancelled_at": now,
                "cancel_reason": reason,
                "delivery_status": "cancelled",
            }
        },
    )
    n = int(result.modified_count or 0)
    if n:
        incr("offer.cancelled_on_offline", n=n)
        try:
            from routers.realtime_dispatch import push_driver_offers_withdrawn

            await push_driver_offers_withdrawn(driver_id, reason=reason, count=n)
        except Exception:
            logger.debug("offer withdraw notify failed", exc_info=True)
        try:
            from realtime_platform.event_bus import publish_offer

            await publish_offer(
                "offers_withdrawn",
                offer_id="",
                actor_id=driver_id,
                reason=reason,
                count=n,
            )
        except Exception:
            pass
    return n


async def withdraw_trip_offers(trip_id: str, *, reason: str = "trip_cancelled") -> int:
    """Cancel all open offers for a trip and notify each driver (accept/cancel)."""
    from database import db

    now = datetime.now(timezone.utc).isoformat()
    open_offers = await db.trip_offers.find(
        {"trip_id": trip_id, "status": {"$in": ["offered", "seen"]}},
        {"_id": 0, "id": 1, "driver_id": 1},
    ).to_list(100)
    if not open_offers:
        return 0
    result = await db.trip_offers.update_many(
        {"trip_id": trip_id, "status": {"$in": ["offered", "seen"]}},
        {
            "$set": {
                "status": "cancelled",
                "cancelled_at": now,
                "cancel_reason": reason,
                "delivery_status": "cancelled",
            }
        },
    )
    n = int(result.modified_count or 0)
    drivers = {str(o.get("driver_id") or "") for o in open_offers if o.get("driver_id")}
    try:
        from routers.realtime_dispatch import push_driver_offers_withdrawn

        for did in drivers:
            await push_driver_offers_withdrawn(did, reason=reason, count=1)
    except Exception:
        logger.debug("trip offer withdraw notify failed", exc_info=True)
    try:
        from realtime_platform.event_bus import publish_offer

        await publish_offer(
            "trip_offers_withdrawn",
            offer_id="",
            trip_id=trip_id,
            reason=reason,
            count=n,
            drivers=list(drivers),
        )
    except Exception:
        pass
    if n:
        incr("offer.withdrawn_for_trip", n=n)
    return n

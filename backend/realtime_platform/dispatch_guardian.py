"""Dispatch Guardian — every offer delivered, retry, escalate, single accept.

Guarantees:
  • Pending trips without open offers get a redispatch wave
  • Unacked offers are retried (socket → FCM path via push_engine)
  • Offers past TTL escalate: expire + pull next eligible drivers
  • Accept remains single-winner (trip_engine.accept_offer_once)
"""
from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Any

from realtime_platform.observability import incr, observe_ms, trace

logger = logging.getLogger("realtime_platform.dispatch_guardian")

OFFER_ACK_GRACE_SEC = 8
OFFER_ESCALATE_SEC = 60
PENDING_WITHOUT_OFFERS_SEC = 12


async def _verify_and_retry_unacked(limit: int = 40) -> int:
    from database import db
    from realtime_platform.delivery_guarantee import guarantee_deliver
    from realtime_platform.offer_ledger import mark_offer

    cutoff = (datetime.now(timezone.utc) - timedelta(seconds=OFFER_ACK_GRACE_SEC)).isoformat()
    rows = await db.trip_offers.find(
        {
            "status": {"$in": ["offered", "seen"]},
            "delivery_status": {"$in": ["pending", "socket_sent", "fcm_sent", "delivered_unacked", None]},
            "created_at": {"$lt": cutoff},
        },
        {"_id": 0},
    ).limit(limit).to_list(limit)

    n = 0
    for offer in rows:
        oid = str(offer.get("id") or "")
        if not oid:
            continue
        try:
            retries = int(offer.get("delivery_retry_count") or 0) + 1
            await mark_offer(oid, delivery_status="retried", retry_count=retries)
            # After grace: retry with reassign if still unacked (Delivery Guarantee Engine)
            result = await guarantee_deliver(
                {**offer, "delivery_retry_count": retries},
                reassign_on_fail=retries >= 2,
            )
            if result.get("ok") or result.get("outcome"):
                n += 1
                incr("guardian.dispatch.retry_ok")
            else:
                incr("guardian.dispatch.retry_fail")
        except Exception:
            logger.debug("dispatch retry failed offer=%s", oid, exc_info=True)
            incr("guardian.dispatch.retry_error")
    return n


async def _escalate_expired_offers(limit: int = 30) -> int:
    """Expire timed-out offers and redispatch the trip to fresh drivers."""
    from database import db

    now = datetime.now(timezone.utc)
    cutoff = (now - timedelta(seconds=OFFER_ESCALATE_SEC)).isoformat()
    trips = await db.trips.find(
        {"status": {"$in": ["pending", "pending_driver_offers", "searching"]}},
        {"_id": 0, "id": 1, "blocked_drivers": 1, "rider_id": 1},
    ).limit(limit).to_list(limit)

    escalated = 0
    for trip in trips:
        tid = str(trip.get("id") or "")
        if not tid:
            continue
        open_offers = await db.trip_offers.find(
            {"trip_id": tid, "status": {"$in": ["offered", "seen"]}},
            {"_id": 0, "id": 1, "driver_id": 1, "created_at": 1, "delivery_status": 1},
        ).to_list(50)
        if not open_offers:
            continue
        oldest = min(str(o.get("created_at") or cutoff) for o in open_offers)
        if oldest > cutoff:
            continue
        # Expire current wave
        declined = [str(o.get("driver_id") or "") for o in open_offers if o.get("driver_id")]
        await db.trip_offers.update_many(
            {"trip_id": tid, "status": {"$in": ["offered", "seen"]}},
            {
                "$set": {
                    "status": "expired",
                    "delivery_status": "expired",
                    "outcome": "expired",
                    "expired_by": "dispatch_guardian",
                }
            },
        )
        blocked = list({*(trip.get("blocked_drivers") or []), *declined})
        await db.trips.update_one({"id": tid}, {"$set": {"blocked_drivers": blocked}})
        try:
            from routers.trips import _create_trip_offers

            full = await db.trips.find_one({"id": tid}, {"_id": 0}) or trip
            offers = await _create_trip_offers(full, blocked)
            escalated += 1
            incr("guardian.dispatch.escalated", offers=len(offers or []))
        except Exception:
            logger.exception("dispatch escalate failed trip=%s", tid)
            incr("guardian.dispatch.escalate_error")
    return escalated


async def _redispatch_orphans(limit: int = 20) -> int:
    """Trips pending too long with zero open offers."""
    from database import db

    cutoff = (datetime.now(timezone.utc) - timedelta(seconds=PENDING_WITHOUT_OFFERS_SEC)).isoformat()
    trips = await db.trips.find(
        {
            "status": {"$in": ["pending", "pending_driver_offers", "searching"]},
            "created_at": {"$lt": cutoff},
        },
        {"_id": 0},
    ).limit(limit).to_list(limit)

    n = 0
    for trip in trips:
        tid = str(trip.get("id") or "")
        open_n = await db.trip_offers.count_documents(
            {"trip_id": tid, "status": {"$in": ["offered", "seen"]}}
        )
        if open_n > 0:
            continue
        try:
            from routers.trips import _create_trip_offers

            offers = await _create_trip_offers(trip, list(trip.get("blocked_drivers") or []))
            if offers:
                n += 1
                incr("guardian.dispatch.orphan_redispatch", offers=len(offers))
        except Exception:
            logger.debug("orphan redispatch failed trip=%s", tid, exc_info=True)
    return n


async def run_dispatch_guardian() -> dict[str, Any]:
    with trace("guardian.dispatch"):
        t0 = time.perf_counter()
        retried = await _verify_and_retry_unacked()
        escalated = await _escalate_expired_offers()
        orphans = await _redispatch_orphans()
        unknown_fixed = 0
        try:
            from realtime_platform.delivery_guarantee import sweep_unknown_offers

            sweep = await sweep_unknown_offers(older_than_sec=OFFER_ESCALATE_SEC)
            unknown_fixed = int(sweep.get("fixed") or 0)
        except Exception:
            logger.debug("unknown offer sweep failed", exc_info=True)
        ms = (time.perf_counter() - t0) * 1000
        observe_ms("guardian.dispatch_ms", ms)
        return {
            "ok": True,
            "retried": retried,
            "escalated": escalated,
            "orphans_redispatched": orphans,
            "unknown_fixed": unknown_fixed,
            "latency_ms": round(ms, 1),
        }

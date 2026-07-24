"""Delivery Guarantee Engine.

Every ride offer:
  1. Has a unique ID
  2. Requires an ACK
  3. Has an ACK timeout
  4. Retries on timeout
  5. Falls back to FCM if retries fail
  6. Reassigns to another eligible driver if FCM fails / still unacked
  7. Logs every outcome — never ends "unknown"

Terminal outcomes only:
  Delivered | Accepted | Declined | Expired | Reassigned
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional

from realtime_platform.observability import incr, observe_ms, trace
from realtime_platform.offer_ledger import (
    TERMINAL_OUTCOMES,
    log_outcome_event,
    mark_offer,
)

logger = logging.getLogger("realtime_platform.delivery_guarantee")


async def guarantee_deliver(
    offer: dict[str, Any],
    trip: Optional[dict[str, Any]] = None,
    *,
    socket_payload: Optional[dict[str, Any]] = None,
    notif_title: str = "New Ride Request",
    notif_body: str = "Open NEXRYDE to accept — pickup nearby.",
    fcm_immediate: bool = False,
    reassign_on_fail: bool = False,
) -> dict[str, Any]:
    """
    Deliver with full guarantee semantics.

    Returns dict with: ok, acked, outcome, offer_id, driver_id, event_id, ...
    Terminal outcome when ACK'd (delivered) or when FCM fails / reassign_on_fail.
    Otherwise leaves offer in-flight (delivered_unacked) for guardian TTL close.
    """
    offer_id = str(offer.get("id") or offer.get("offer_id") or "")
    driver_id = str(offer.get("driver_id") or "")
    trip_id = str(offer.get("trip_id") or (trip or {}).get("id") or "")

    if not offer_id or not driver_id:
        incr("delivery_guarantee.missing_ids")
        return {"ok": False, "reason": "missing_ids", "outcome": None}

    # Unique ID already required at create; claim idempotent deliver wave
    try:
        from realtime_platform.idempotency import claim

        # Allow guardian retries via distinct retry keys; first deliver is once.
        wave = f"dge:deliver:{offer_id}:{int(offer.get('delivery_retry_count') or 0)}"
        if not await claim(wave, ttl_sec=90):
            incr("delivery_guarantee.duplicate_deliver_blocked")
            return {
                "ok": True,
                "duplicate": True,
                "offer_id": offer_id,
                "driver_id": driver_id,
                "outcome": None,
            }
    except Exception:
        pass

    with trace("delivery_guarantee.deliver", offer_id=offer_id, driver_id=driver_id):
        from realtime_platform.push_engine import deliver_offer

        result = await deliver_offer(
            offer,
            trip,
            socket_payload=socket_payload,
            notif_title=notif_title,
            notif_body=notif_body,
            fcm_immediate=fcm_immediate,
        )
        acked = bool(result.get("acked"))
        fcm_ok = bool(result.get("fcm_ok"))
        if acked:
            await mark_offer(
                offer_id,
                delivery_status="delivered_acked",
                event_id=str(result.get("event_id") or ""),
                outcome="delivered",
                extra={"acked_at": datetime.now(timezone.utc).isoformat()},
            )
            await log_outcome_event(
                offer_id,
                outcome="delivered",
                trip_id=trip_id,
                driver_id=driver_id,
                reason="ack_received",
                meta={"event_id": result.get("event_id"), "latency_ms": result.get("latency_ms")},
            )
            incr("delivery_guarantee.delivered")
            return {
                **result,
                "outcome": "delivered",
                "guaranteed": True,
            }

        # FCM send failed → immediate reassign (device unreachable).
        # Or guardian asks reassign_on_fail after ACK grace / retries exhausted.
        should_reassign = (not fcm_ok) or reassign_on_fail
        if should_reassign:
            reassigned = await reassign_offer(
                offer,
                trip=trip,
                reason="fcm_failed" if not fcm_ok else "unacked_after_retries",
            )
            if reassigned.get("ok"):
                incr("delivery_guarantee.reassigned")
                return {
                    **result,
                    "acked": False,
                    "outcome": "reassigned",
                    "guaranteed": True,
                    "reassign": reassigned,
                }
            await finalize_outcome(
                offer_id,
                outcome="expired",
                trip_id=trip_id,
                driver_id=driver_id,
                reason="reassign_failed",
                delivery_status="expired",
                meta={"event_id": result.get("event_id")},
            )
            incr("delivery_guarantee.expired")
            return {
                **result,
                "acked": False,
                "outcome": "expired",
                "guaranteed": True,
            }

        # In-flight: FCM sent, waiting for driver ACK / accept — guardian will close.
        incr("delivery_guarantee.awaiting_ack")
        return {
            **result,
            "acked": False,
            "outcome": None,
            "guaranteed": False,
            "awaiting_ack": True,
        }


async def finalize_outcome(
    offer_id: str,
    *,
    outcome: str,
    trip_id: str = "",
    driver_id: str = "",
    reason: str = "",
    delivery_status: Optional[str] = None,
    meta: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """Force a terminal outcome (Accepted/Declined/Expired/Reassigned/Delivered)."""
    if outcome not in TERMINAL_OUTCOMES:
        outcome = "expired"
    status = delivery_status or {
        "delivered": "delivered_acked",
        "accepted": "accepted",
        "declined": "declined",
        "expired": "expired",
        "reassigned": "reassigned",
    }.get(outcome, "expired")
    await mark_offer(
        offer_id,
        delivery_status=status,
        outcome=outcome,
        extra={"outcome_reason": reason},
    )
    await log_outcome_event(
        offer_id,
        outcome=outcome,
        trip_id=trip_id,
        driver_id=driver_id,
        reason=reason,
        meta=meta,
    )
    # Mirror business status when appropriate
    if outcome in ("expired", "reassigned", "declined"):
        try:
            from database import db

            await db.trip_offers.update_one(
                {"id": offer_id, "status": {"$in": ["offered", "seen"]}},
                {"$set": {"status": "expired" if outcome != "declined" else "declined"}},
            )
        except Exception:
            pass
    incr("delivery_guarantee.finalized", outcome=outcome)
    return {"ok": True, "offer_id": offer_id, "outcome": outcome}


async def reassign_offer(
    offer: dict[str, Any],
    *,
    trip: Optional[dict[str, Any]] = None,
    reason: str = "delivery_failed",
) -> dict[str, Any]:
    """
    Expire current offer as Reassigned and create a fresh wave for other drivers.
    Blocks the failed driver from the next wave.
    """
    offer_id = str(offer.get("id") or "")
    driver_id = str(offer.get("driver_id") or "")
    trip_id = str(offer.get("trip_id") or (trip or {}).get("id") or "")
    if not trip_id or not offer_id:
        return {"ok": False, "reason": "missing_trip_or_offer"}

    await finalize_outcome(
        offer_id,
        outcome="reassigned",
        trip_id=trip_id,
        driver_id=driver_id,
        reason=reason,
        delivery_status="reassigned",
    )

    try:
        from database import db

        trip_doc = trip or await db.trips.find_one({"id": trip_id}, {"_id": 0}) or {}
        if not trip_doc:
            return {"ok": False, "reason": "trip_not_found", "offer_id": offer_id}

        blocked = list({*(trip_doc.get("blocked_drivers") or []), driver_id})
        await db.trips.update_one({"id": trip_id}, {"$set": {"blocked_drivers": blocked}})

        # Prefer platform dispatch (device-health filtered); fall back to trips helper
        new_offers: list[dict[str, Any]] = []
        try:
            from realtime_platform.dispatch_engine import create_offers_for_trip

            new_offers = await create_offers_for_trip(trip_doc, blocked_drivers=blocked, db=db)
        except Exception:
            try:
                from routers.trips import _create_trip_offers

                new_offers = await _create_trip_offers(trip_doc, blocked) or []
            except Exception:
                logger.exception("reassign create offers failed trip=%s", trip_id)
                return {"ok": False, "reason": "create_failed", "offer_id": offer_id}

        # Deliver new wave (without nested reassign to avoid cascade storms in one tick)
        delivered = 0
        for o in new_offers[:5]:
            try:
                from realtime_platform.push_engine import deliver_offer

                r = await deliver_offer(o, trip_doc)
                if r.get("acked"):
                    await finalize_outcome(
                        str(o.get("id")),
                        outcome="delivered",
                        trip_id=trip_id,
                        driver_id=str(o.get("driver_id") or ""),
                        reason="reassign_wave_ack",
                    )
                delivered += 1
            except Exception:
                logger.debug("reassign deliver failed", exc_info=True)

        incr("delivery_guarantee.reassign_wave", offers=len(new_offers))
        return {
            "ok": True,
            "offer_id": offer_id,
            "new_offers": len(new_offers),
            "delivered": delivered,
            "blocked_driver": driver_id,
            "reason": reason,
        }
    except Exception:
        logger.exception("reassign_offer failed offer=%s", offer_id)
        return {"ok": False, "reason": "exception", "offer_id": offer_id}


async def sweep_unknown_offers(*, older_than_sec: int = 90, limit: int = 40) -> dict[str, Any]:
    """
    Guardian helper: any open offer past grace without a terminal outcome
    gets expired or reassigned so the ledger never stays unknown.
    """
    from database import db
    from datetime import timedelta

    cut = (datetime.now(timezone.utc) - timedelta(seconds=older_than_sec)).isoformat()
    rows = await db.trip_offers.find(
        {
            "status": {"$in": ["offered", "seen"]},
            "created_at": {"$lt": cut},
            "$or": [
                {"outcome": {"$exists": False}},
                {"outcome": None},
                {"outcome": {"$nin": list(TERMINAL_OUTCOMES)}},
            ],
        },
        {"_id": 0},
    ).limit(limit).to_list(limit)

    fixed = 0
    for offer in rows:
        oid = str(offer.get("id") or "")
        if not oid:
            continue
        try:
            result = await reassign_offer(offer, reason="unknown_sweep")
            if not result.get("ok"):
                await finalize_outcome(
                    oid,
                    outcome="expired",
                    trip_id=str(offer.get("trip_id") or ""),
                    driver_id=str(offer.get("driver_id") or ""),
                    reason="unknown_sweep_expire",
                )
            fixed += 1
        except Exception:
            logger.debug("sweep unknown failed offer=%s", oid, exc_info=True)
    observe_ms("delivery_guarantee.sweep_ms", 0)
    incr("delivery_guarantee.sweep_fixed", count=fixed)
    return {"fixed": fixed, "scanned": len(rows)}

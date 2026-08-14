"""Trip completion / cancel sagas — side effects retry until confirmed.

After the atomic Mongo status transition, non-critical side effects are recorded
as saga steps and executed with idempotent retries (Kafka/outbox driven).
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from realtime_platform.event_bus import publish_saga
from realtime_platform.observability import incr, observe_ms, trace

logger = logging.getLogger("realtime_platform.saga")

COMPLETE_STEPS = (
    "driver_stats",
    "rider_stats",
    "incentives",
    "wallet_hold_release",
    "pushes",
    "metrics",
    "emit_realtime",
)

CANCEL_STEPS = (
    "wallet_hold_release",
    "clear_driver_lock",
    "withdraw_offers",
    "pushes",
    "enforcement",
    "emit_realtime",
)


async def _upsert_saga(trip_id: str, kind: str, steps: tuple[str, ...]) -> dict[str, Any]:
    from database import db

    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": f"saga:{kind}:{trip_id}",
        "trip_id": trip_id,
        "kind": kind,
        "steps": {s: {"status": "pending", "attempts": 0} for s in steps},
        "created_at": now,
        "updated_at": now,
        "status": "running",
    }
    existing = await db.trip_sagas.find_one({"id": doc["id"]}, {"_id": 0})
    if existing:
        return existing
    await db.trip_sagas.update_one({"id": doc["id"]}, {"$setOnInsert": doc}, upsert=True)
    return doc


async def _mark_step(saga_id: str, step: str, status: str, error: str = "") -> None:
    from database import db

    patch: dict[str, Any] = {
        f"steps.{step}.status": status,
        f"steps.{step}.updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if error:
        patch[f"steps.{step}.error"] = error[:500]
    if status == "pending":
        await db.trip_sagas.update_one({"id": saga_id}, {"$inc": {f"steps.{step}.attempts": 1}, "$set": patch})
    else:
        await db.trip_sagas.update_one({"id": saga_id}, {"$set": patch})


async def _claim_saga_run(saga_id: str, ttl_sec: int = 120) -> bool:
    """Serialize saga execution across the inline request path, the kafka-worker,
    and the outbox retry loop.

    Only one runner may execute a saga's steps at a time — without this, the same
    completion/cancel side effects (stats $inc, incentive grants, enforcement
    violations) run concurrently from all three paths and double-apply. A stale
    lock (holder crashed mid-run) is reclaimed after ``ttl_sec`` so partial sagas
    are still retried.
    """
    from database import db

    now = datetime.now(timezone.utc)
    stale_before = (now - timedelta(seconds=ttl_sec)).isoformat()
    res = await db.trip_sagas.find_one_and_update(
        {
            "id": saga_id,
            "status": {"$ne": "done"},
            "$or": [
                {"run_lock_at": {"$exists": False}},
                {"run_lock_at": None},
                {"run_lock_at": {"$lte": stale_before}},
            ],
        },
        {"$set": {"run_lock_at": now.isoformat()}},
    )
    return res is not None


async def _release_saga_run(saga_id: str) -> None:
    from database import db

    try:
        await db.trip_sagas.update_one({"id": saga_id}, {"$unset": {"run_lock_at": ""}})
    except Exception:
        logger.debug("saga run-lock release failed id=%s", saga_id, exc_info=True)


def _saga_inline() -> bool:
    """When false, dedicated kafka-worker replays sagas (NEXRYDE_SAGA_INLINE=false)."""
    import os

    raw = (os.environ.get("NEXRYDE_SAGA_INLINE") or "true").strip().lower()
    return raw not in ("0", "false", "off", "no")


async def enqueue_completion_saga(trip_id: str, *, trip: dict[str, Any]) -> dict[str, Any]:
    saga = await _upsert_saga(trip_id, "complete", COMPLETE_STEPS)
    await publish_saga(
        "completion_enqueued",
        trip_id=trip_id,
        saga_id=saga["id"],
        kind="complete",
        fare=float(trip.get("fare") or 0),
        driver_id=trip.get("driver_id") or "",
        rider_id=trip.get("rider_id") or "",
    )
    incr("saga.complete_enqueued")
    if not _saga_inline():
        return {"ok": True, "deferred": True, "saga_id": saga["id"]}
    # Default: run in-request; kafka-worker still retries partials.
    result = await run_completion_saga(trip_id, trip=trip)
    return result


async def enqueue_cancel_saga(trip_id: str, *, trip: dict[str, Any], cancelled_by: str) -> dict[str, Any]:
    saga = await _upsert_saga(trip_id, "cancel", CANCEL_STEPS)
    await publish_saga(
        "cancel_enqueued",
        trip_id=trip_id,
        saga_id=saga["id"],
        kind="cancel",
        cancelled_by=cancelled_by,
    )
    incr("saga.cancel_enqueued")
    if not _saga_inline():
        return {"ok": True, "deferred": True, "saga_id": saga["id"]}
    result = await run_cancel_saga(trip_id, trip=trip, cancelled_by=cancelled_by)
    return result


async def run_completion_saga(trip_id: str, *, trip: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    import time

    from database import db

    with trace("saga.complete", trip_id=trip_id):
        t0 = time.perf_counter()
        saga_id = f"saga:complete:{trip_id}"
        trip = trip or await db.trips.find_one({"id": trip_id}, {"_id": 0})
        if not trip:
            return {"ok": False, "reason": "not_found"}

        async def step_driver_stats() -> None:
            did = trip.get("driver_id")
            if not did:
                return
            await db.users.update_one({"id": did}, {"$inc": {"total_trips": 1}})
            await db.users.update_one({"id": did}, {"$inc": {"streaks.current": 1}})

        async def step_rider_stats() -> None:
            rid = trip.get("rider_id")
            if rid:
                await db.users.update_one({"id": rid}, {"$inc": {"total_trips": 1}})

        async def step_incentives() -> None:
            from routers.incentives import on_trip_completed as _on_trip_completed

            inc_res = await _on_trip_completed(
                trip_id=trip_id,
                rider_id=trip.get("rider_id") or "",
                driver_id=trip.get("driver_id") or "",
                fare=float(trip.get("fare") or 0),
            ) or {}
            mb = inc_res.get("mystery_bonus") if isinstance(inc_res, dict) else None
            if isinstance(mb, dict) and mb.get("amount_ngn"):
                try:
                    amt_mb = float(mb["amount_ngn"])
                    if amt_mb > 0:
                        mb_set = {"mystery_bonus_ngn": amt_mb}
                        if mb.get("expires_at"):
                            mb_set["mystery_bonus_expires_at"] = mb["expires_at"]
                        await db.trips.update_one({"id": trip_id}, {"$set": mb_set})
                except (TypeError, ValueError):
                    pass

        async def step_wallet() -> None:
            pm = str(trip.get("payment_method") or "cash").lower()
            if pm in ("wallet", "nexryde_wallet"):
                return
            rid = trip.get("rider_id")
            if not rid:
                return
            from wallet_ops import release_rider_wallet_hold

            await release_rider_wallet_hold(db, rid, trip_id)

        async def step_pushes() -> None:
            from push_notifications import send_push_notification

            trip_fresh = await db.trips.find_one({"id": trip_id}, {"_id": 0}) or trip
            fare_f = float(trip_fresh.get("fare") or 0)
            mb_ngn = float(trip_fresh.get("mystery_bonus_ngn") or 0)
            if trip_fresh.get("rider_id"):
                body = f"Your trip is complete. Fare: ₦{fare_f:,.0f}"
                if mb_ngn > 0:
                    body += f" You unlocked a Mystery Bonus: ₦{mb_ngn:,.0f} promo credit."
                await send_push_notification(
                    trip_fresh["rider_id"],
                    "Trip Completed",
                    body,
                    {"type": "trip_completed", "trip_id": trip_id, "mystery_bonus_ngn": mb_ngn or None},
                )
                await send_push_notification(
                    trip_fresh["rider_id"],
                    "Confirm Safe Arrival",
                    "Please confirm you arrived safely. NEXRYDE will check in automatically if you do not respond.",
                    {"type": "safe_arrival_checkin", "trip_id": trip_id},
                )
            if trip_fresh.get("driver_id"):
                await send_push_notification(
                    trip_fresh["driver_id"],
                    "Trip Completed",
                    f"Trip completed! ₦{fare_f:,.0f} earned.",
                    {"type": "trip_completed", "trip_id": trip_id},
                )

        async def step_metrics() -> None:
            from metrics_service import track_ride_completed

            track_ride_completed(fare_ngn=float(trip.get("fare") or 0))

        async def step_emit() -> None:
            from routers.trips import _emit_rider_trip_realtime

            await _emit_rider_trip_realtime(trip_id)

        handlers = {
            "driver_stats": step_driver_stats,
            "rider_stats": step_rider_stats,
            "incentives": step_incentives,
            "wallet_hold_release": step_wallet,
            "pushes": step_pushes,
            "metrics": step_metrics,
            "emit_realtime": step_emit,
        }

        await _upsert_saga(trip_id, "complete", COMPLETE_STEPS)
        if not await _claim_saga_run(saga_id):
            # Another runner (inline / kafka-worker / outbox) already holds this
            # saga, or it is already done — do not double-apply side effects.
            incr("saga.complete_skipped_locked")
            return {"ok": True, "skipped": True, "saga_id": saga_id}
        try:
            saga = await db.trip_sagas.find_one({"id": saga_id}, {"_id": 0}) or {}
            done = 0
            failed = 0
            for name, fn in handlers.items():
                st = ((saga.get("steps") or {}).get(name) or {}).get("status")
                if st == "done":
                    done += 1
                    continue
                await _mark_step(saga_id, name, "pending")
                try:
                    await fn()
                    await _mark_step(saga_id, name, "done")
                    done += 1
                except Exception as exc:
                    failed += 1
                    await _mark_step(saga_id, name, "failed", str(exc))
                    logger.warning("saga complete step=%s trip=%s err=%s", name, trip_id, exc)

            status = "done" if failed == 0 else "partial"
            await db.trip_sagas.update_one(
                {"id": saga_id},
                {"$set": {"status": status, "updated_at": datetime.now(timezone.utc).isoformat()}},
            )
        finally:
            await _release_saga_run(saga_id)
        observe_ms("saga.complete_ms", (time.perf_counter() - t0) * 1000)
        incr("saga.complete_run", status=status)
        return {"ok": failed == 0, "status": status, "done": done, "failed": failed, "saga_id": saga_id}


async def run_cancel_saga(
    trip_id: str,
    *,
    trip: Optional[dict[str, Any]] = None,
    cancelled_by: str = "",
) -> dict[str, Any]:
    """Execute remaining cancel side effects (offers already withdrawn in hot path ideally)."""
    import time

    from database import db

    with trace("saga.cancel", trip_id=trip_id):
        t0 = time.perf_counter()
        saga_id = f"saga:cancel:{trip_id}"
        trip = trip or await db.trips.find_one({"id": trip_id}, {"_id": 0})
        if not trip:
            return {"ok": False, "reason": "not_found"}

        async def step_wallet() -> None:
            rid = trip.get("rider_id")
            if not rid:
                return
            from wallet_ops import release_rider_wallet_hold

            await release_rider_wallet_hold(db, rid, trip_id)

        async def step_lock() -> None:
            did = trip.get("driver_id")
            if did:
                from routers.trips import _promote_or_release_driver_lock

                await _promote_or_release_driver_lock(str(did), trip_id)

        async def step_withdraw() -> None:
            from realtime_platform.lifecycle import withdraw_trip_offers

            await withdraw_trip_offers(trip_id, reason="trip_cancelled")

        async def step_emit() -> None:
            from routers.trips import _emit_rider_trip_realtime

            await _emit_rider_trip_realtime(trip_id)

        async def step_pushes() -> None:
            from push_notifications import send_push_notification

            actor = cancelled_by or trip.get("cancelled_by") or ""
            if actor == trip.get("driver_id") and trip.get("rider_id"):
                await send_push_notification(
                    trip["rider_id"],
                    "Driver Cancelled",
                    "Your driver cancelled this trip. You can request another NEXRYDE.",
                    {"type": "driver_cancelled", "trip_id": trip_id, "delivery_slot": "cancel"},
                    source="trip",
                )
            elif actor == trip.get("rider_id") and trip.get("driver_id"):
                await send_push_notification(
                    trip["driver_id"],
                    "Rider Cancelled",
                    "The rider cancelled this trip request.",
                    {"type": "rider_cancelled", "trip_id": trip_id, "delivery_slot": "cancel"},
                    source="trip",
                )

        async def step_enforcement() -> None:
            from enforcement_system import record_violation

            actor = cancelled_by or trip.get("cancelled_by") or ""
            if not actor:
                return
            kind = "driver_cancellation" if actor == trip.get("driver_id") else "rider_cancellation"
            await record_violation(actor, kind, trip_id)

        handlers = {
            "wallet_hold_release": step_wallet,
            "clear_driver_lock": step_lock,
            "withdraw_offers": step_withdraw,
            "pushes": step_pushes,
            "enforcement": step_enforcement,
            "emit_realtime": step_emit,
        }

        await _upsert_saga(trip_id, "cancel", CANCEL_STEPS)
        if not await _claim_saga_run(saga_id):
            incr("saga.cancel_skipped_locked")
            return {"ok": True, "skipped": True, "saga_id": saga_id}
        try:
            saga = await db.trip_sagas.find_one({"id": saga_id}, {"_id": 0}) or {}
            done = failed = 0
            for name, fn in handlers.items():
                # Skip already-completed steps on retry. Critically, step_enforcement
                # → record_violation is NOT idempotent, so re-running it duplicated
                # cancellation penalties on every retry (completion saga already did
                # this; cancel did not).
                st = ((saga.get("steps") or {}).get(name) or {}).get("status")
                if st == "done":
                    done += 1
                    continue
                await _mark_step(saga_id, name, "pending")
                try:
                    await fn()
                    await _mark_step(saga_id, name, "done")
                    done += 1
                except Exception as exc:
                    failed += 1
                    await _mark_step(saga_id, name, "failed", str(exc))
                    logger.warning("saga cancel step=%s trip=%s err=%s", name, trip_id, exc)

            status = "done" if failed == 0 else "partial"
            await db.trip_sagas.update_one(
                {"id": saga_id},
                {"$set": {"status": status, "updated_at": datetime.now(timezone.utc).isoformat()}},
            )
        finally:
            await _release_saga_run(saga_id)
        observe_ms("saga.cancel_ms", (time.perf_counter() - t0) * 1000)
        return {"ok": failed == 0, "status": status, "done": done, "failed": failed, "saga_id": saga_id}

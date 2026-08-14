"""Trip Guardian — consistency: transitions, duplicates, incomplete recovery.

Protects:
  • Stuck pending / accepted / ongoing trips (delegates TTLs to stuck_trip_recovery)
  • Orphan driver locks (active_trip_id pointing at missing/terminal trips)
  • Partial sagas left running
  • Duplicate open offers after accept (withdraw leftover)
"""
from __future__ import annotations

import logging
import time
from typing import Any

from realtime_platform.observability import incr, observe_ms, trace

logger = logging.getLogger("realtime_platform.trip_guardian")


async def _clear_orphan_driver_locks(limit: int = 50) -> int:
    from database import db

    profiles = await db.driver_profiles.find(
        {"active_trip_id": {"$exists": True, "$nin": [None, ""]}},
        {"_id": 0, "user_id": 1, "active_trip_id": 1, "queued_next_trip_id": 1},
    ).limit(limit).to_list(limit)

    cleared = 0
    terminal = {"completed", "cancelled", "canceled", "no_show", "expired"}
    for p in profiles:
        tid = str(p.get("active_trip_id") or "")
        did = str(p.get("user_id") or "")
        if not tid or not did:
            continue
        trip = await db.trips.find_one({"id": tid}, {"_id": 0, "status": 1, "driver_id": 1})
        if trip is None or str(trip.get("status") or "") in terminal:
            try:
                from routers.trips import _promote_or_release_driver_lock

                await _promote_or_release_driver_lock(did, tid)
            except Exception:
                await db.driver_profiles.update_one(
                    {"user_id": did, "active_trip_id": tid},
                    {"$unset": {"active_trip_id": ""}},
                )
            cleared += 1
            incr("guardian.trip.orphan_lock_cleared")
        elif str(trip.get("driver_id") or "") not in ("", did):
            await db.driver_profiles.update_one(
                {"user_id": did, "active_trip_id": tid},
                {"$unset": {"active_trip_id": ""}},
            )
            cleared += 1
            incr("guardian.trip.mismatched_lock_cleared")
    return cleared


async def _withdraw_stale_offers_after_accept(limit: int = 30) -> int:
    from database import db
    from realtime_platform.lifecycle import withdraw_trip_offers

    trips = await db.trips.find(
        {"status": {"$in": ["accepted", "arrived", "ongoing", "completed"]}},
        {"_id": 0, "id": 1, "driver_id": 1},
    ).sort("updated_at", -1).limit(limit).to_list(limit)

    n = 0
    for trip in trips:
        tid = str(trip.get("id") or "")
        open_n = await db.trip_offers.count_documents(
            {"trip_id": tid, "status": {"$in": ["offered", "seen"]}}
        )
        if open_n <= 0:
            continue
        try:
            await withdraw_trip_offers(tid, reason="trip_guardian_after_accept")
            n += 1
            incr("guardian.trip.stale_offers_withdrawn", count=open_n)
        except Exception:
            logger.debug("withdraw stale offers failed trip=%s", tid, exc_info=True)
    return n


async def _retry_stuck_sagas(limit: int = 20) -> int:
    from realtime_platform.outbox_worker import _retry_partial_sagas

    return await _retry_partial_sagas(limit=limit)


async def _recover_stuck_trips() -> dict[str, Any]:
    try:
        from database import db
        from stuck_trip_recovery import recover_stale_active_trips

        return await recover_stale_active_trips(db)
    except Exception:
        logger.debug("stuck_trip_recovery unavailable", exc_info=True)
        return {"recovered": 0}


async def run_trip_guardian() -> dict[str, Any]:
    with trace("guardian.trip"):
        t0 = time.perf_counter()
        locks = await _clear_orphan_driver_locks()
        withdrawn = await _withdraw_stale_offers_after_accept()
        sagas = await _retry_stuck_sagas()
        stuck = await _recover_stuck_trips()
        ms = (time.perf_counter() - t0) * 1000
        observe_ms("guardian.trip_ms", ms)
        return {
            "ok": True,
            "orphan_locks_cleared": locks,
            "stale_offers_withdrawn": withdrawn,
            "sagas_retried": sagas,
            "stuck_trips": stuck,
            "latency_ms": round(ms, 1),
        }

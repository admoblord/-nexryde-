"""Safe Arrival Guardian — makes the post-trip safety check-in actually happen.

When a driver ends a trip the rider is pushed "Confirm Safe Arrival", promising
"NEXRYDE will check in automatically if you do not respond". Fulfilling that
promise needs something watching ``confirm_deadline_at``.

Escalation used to be lazy: it only ran inside GET /trips/{id} and
GET /trips/{id}/status. But the rider app navigates to the receipt on
completion and stops polling, so for a rider who never responds — exactly the
person the feature exists for — nothing ran and no one was told.

This guardian sweeps the deadline on the always-on guardians loop instead, so
escalation happens on time whether or not any client is still asking.

The state machine itself lives in routers.trips._maybe_process_safe_arrival_check
and is reused verbatim: deadline → second push, then
SAFE_ARRIVAL_CALL_RESPONSE_SECONDS later → SMS the rider's emergency contacts
and raise an sos_alert. Steps are idempotent, so re-running a trip is safe.
"""
from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Any

from realtime_platform.observability import incr, observe_ms, trace

logger = logging.getLogger("realtime_platform.safe_arrival_guardian")

# Trips completed longer ago than this are past saving by an SMS — leave them
# alone rather than scanning the whole collection every tick.
LOOKBACK_HOURS = 24
BATCH_LIMIT = 100


async def run_safe_arrival_guardian(limit: int = BATCH_LIMIT) -> dict[str, Any]:
    """Escalate every unconfirmed safe-arrival check whose deadline has passed."""
    from database import db
    from routers.trips import _maybe_process_safe_arrival_check

    with trace("guardian.safe_arrival"):
        t0 = time.perf_counter()
        now = datetime.now(timezone.utc)
        cutoff = (now - timedelta(hours=LOOKBACK_HOURS)).isoformat()

        query = {
            "safe_arrival_check.required": True,
            "safe_arrival_check.confirmed_at": None,
            "safe_arrival_check.unsafe_reported_at": None,
            # Fully escalated trips have nothing left to do.
            "safe_arrival_check.emergency_notified_at": None,
            "safe_arrival_check.confirm_deadline_at": {"$lte": now.isoformat()},
            "safe_arrival_check.trip_completed_at": {"$gte": cutoff},
            "status": {"$in": ["completed", "pending_payment"]},
        }

        overdue = await db.trips.find(query, {"_id": 0}).limit(limit).to_list(limit)

        checked = len(overdue)
        called = 0
        escalated = 0
        for trip in overdue:
            try:
                updated = await _maybe_process_safe_arrival_check(trip)
                status = ((updated or {}).get("safe_arrival_check") or {}).get("check_in_status")
                if status == "emergency_notified":
                    escalated += 1
                    incr("guardian.safe_arrival.emergency_notified")
                elif status == "call_attempted":
                    called += 1
                    incr("guardian.safe_arrival.check_in_sent")
            except Exception:
                incr("guardian.safe_arrival.error")
                logger.exception("safe arrival escalation failed trip=%s", trip.get("id"))

        observe_ms("guardian.safe_arrival_ms", (time.perf_counter() - t0) * 1000)
        incr("guardian.safe_arrival.ok")
        if checked:
            logger.info(
                "safe arrival guardian checked=%s check_ins_sent=%s escalated=%s",
                checked,
                called,
                escalated,
            )
        return {"checked": checked, "check_ins_sent": called, "escalated": escalated}

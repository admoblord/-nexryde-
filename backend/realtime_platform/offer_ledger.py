"""Offer delivery ledger — every offer has a known terminal or in-flight state.

Pipeline (in-flight) statuses track how delivery progressed.
Terminal outcomes are the only allowed end states for audit:
  Delivered | Accepted | Declined | Expired | Reassigned
Never "lost" / unknown.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional

from realtime_platform.observability import incr

logger = logging.getLogger("realtime_platform.offer_ledger")

# In-flight + terminal delivery statuses written to trip_offers.delivery_status
DELIVERY_STATES = frozenset(
    {
        "pending",
        "socket_sent",
        "fcm_sent",
        "delivered_acked",
        "delivered_unacked",
        "expired",
        "accepted",
        "declined",
        "cancelled",
        "failed",
        "retried",
        "reassigned",
    }
)

# Canonical terminal outcomes (user-facing / audit). Never unknown.
TERMINAL_OUTCOMES = frozenset(
    {
        "delivered",  # ACK received (device got the offer)
        "accepted",
        "declined",
        "expired",
        "reassigned",
    }
)

# Map ledger delivery_status → terminal outcome when the offer wave closes.
_STATUS_TO_OUTCOME = {
    "delivered_acked": "delivered",
    "accepted": "accepted",
    "declined": "declined",
    "expired": "expired",
    "reassigned": "reassigned",
    "cancelled": "expired",
    "failed": "expired",
}


def outcome_for_status(delivery_status: str) -> Optional[str]:
    """Return terminal outcome for a status, or None if still in-flight."""
    return _STATUS_TO_OUTCOME.get(delivery_status)


async def mark_offer(
    offer_id: str,
    *,
    delivery_status: str,
    event_id: str = "",
    retry_count: Optional[int] = None,
    extra: Optional[dict[str, Any]] = None,
    outcome: Optional[str] = None,
) -> None:
    if not offer_id:
        return
    status = delivery_status if delivery_status in DELIVERY_STATES else "failed"
    if delivery_status not in DELIVERY_STATES:
        incr("offer.unknown_status_coerced")
    now = datetime.now(timezone.utc).isoformat()
    resolved_outcome = outcome or outcome_for_status(status)
    if resolved_outcome and resolved_outcome not in TERMINAL_OUTCOMES:
        incr("offer.unknown_outcome_coerced")
        resolved_outcome = "expired"
    patch: dict[str, Any] = {
        "delivery_status": status,
        "delivery_updated_at": now,
    }
    if event_id:
        patch["realtime_event_id"] = event_id
    if retry_count is not None:
        patch["delivery_retry_count"] = int(retry_count)
    if resolved_outcome:
        patch["outcome"] = resolved_outcome
        patch["outcome_at"] = now
    if extra:
        patch.update(extra)
    try:
        from database import db

        await db.trip_offers.update_one({"id": offer_id}, {"$set": patch})
        incr("offer.ledger_write", status=status)
        if resolved_outcome:
            incr("offer.outcome", outcome=resolved_outcome)
    except Exception:
        logger.debug("offer ledger write failed offer=%s", offer_id, exc_info=True)


async def log_outcome_event(
    offer_id: str,
    *,
    outcome: str,
    trip_id: str = "",
    driver_id: str = "",
    reason: str = "",
    meta: Optional[dict[str, Any]] = None,
) -> None:
    """Append-only audit row so no offer ends without a logged terminal state."""
    if outcome not in TERMINAL_OUTCOMES:
        outcome = "expired"
        incr("offer.outcome_event_coerced")
    doc = {
        "offer_id": offer_id,
        "trip_id": trip_id,
        "driver_id": driver_id,
        "outcome": outcome,
        "reason": reason,
        "meta": meta or {},
        "logged_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        from database import db

        await db.offer_delivery_outcomes.insert_one(doc)
        incr("offer.outcome_logged", outcome=outcome)
    except Exception:
        logger.debug("outcome event log failed offer=%s", offer_id, exc_info=True)


async def get_offer_audit(offer_id: str) -> Optional[dict[str, Any]]:
    from database import db

    doc = await db.trip_offers.find_one({"id": offer_id}, {"_id": 0})
    if not doc:
        return None
    delivery = doc.get("delivery_status") or "pending"
    outcome = doc.get("outcome") or outcome_for_status(delivery)
    return {
        "offer_id": doc.get("id"),
        "trip_id": doc.get("trip_id"),
        "driver_id": doc.get("driver_id"),
        "uuid": doc.get("id"),
        "created_at": doc.get("created_at"),
        "expires_at": doc.get("expires_at"),
        "status": doc.get("status"),
        "delivery_status": delivery,
        "outcome": outcome,
        "ack": bool(doc.get("acked_at") or delivery == "delivered_acked"),
        "retry_count": int(doc.get("delivery_retry_count") or 0),
        "realtime_event_id": doc.get("realtime_event_id") or "",
        "driver_response": doc.get("status"),
        "terminal": outcome in TERMINAL_OUTCOMES if outcome else False,
    }


async def assert_no_unknown_offers(
    *,
    older_than_sec: int = 120,
    limit: int = 100,
) -> dict[str, Any]:
    """Scan for open offers past grace with no terminal outcome (should be ~0)."""
    from database import db

    cutoff = (
        datetime.now(timezone.utc).timestamp() - older_than_sec
    )
    # ISO compare works for our created_at format
    from datetime import timedelta

    cut_iso = (datetime.now(timezone.utc) - timedelta(seconds=older_than_sec)).isoformat()
    rows = await db.trip_offers.find(
        {
            "created_at": {"$lt": cut_iso},
            "status": {"$in": ["offered", "seen"]},
            "$or": [
                {"outcome": {"$exists": False}},
                {"outcome": None},
                {"outcome": {"$nin": list(TERMINAL_OUTCOMES)}},
            ],
        },
        {"_id": 0, "id": 1, "trip_id": 1, "driver_id": 1, "delivery_status": 1},
    ).limit(limit).to_list(limit)
    incr("offer.unknown_scan", count=len(rows))
    return {
        "unknown_count": len(rows),
        "offers": rows,
        "ok": len(rows) == 0,
        "cutoff_sec": older_than_sec,
        "scanned_at_epoch": cutoff,
    }

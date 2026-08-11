"""Auto-recovery for trips stuck after driver acceptance (audit 5.3).

A driver's phone dying (or app crash / network loss) after accepting used to
lock BOTH the trip and the driver's active_trip_id forever, requiring manual
database surgery. This module gives every post-accept state a TTL and gives
admins a force-complete that always clears the driver lock.

TTLs (state age measured from the state's own timestamp, falling back to
created_at):
  accepted  > 45 min  → cancelled  (trip never started; wallet hold refunded)
  arrived   > 90 min  → cancelled  (same)
  ongoing   > 6 hours → completed  (ride clearly over; cash settled in person)

Cancelling a never-started trip is always money-safe: nothing was owed.
Force-completing an ongoing trip only marks the record; with the fare wallet
disabled all settlement is direct rider→driver, so no balances move here.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from ride_state import ride_state_set_fields, ride_state_inc_fields

logger = logging.getLogger(__name__)

ACCEPTED_TTL_MINUTES = 45
ARRIVED_TTL_MINUTES = 90
ONGOING_TTL_HOURS = 6

# Post-accept states an admin may force-complete out of.
FORCE_COMPLETABLE_STATUSES = {"accepted", "arrived", "ongoing", "pending_payment"}


def _cutoff_variants(cutoff: datetime) -> list:
    """Match datetime, naive-datetime, and ISO-string timestamps (all exist in prod)."""
    return [cutoff, cutoff.replace(tzinfo=None), cutoff.isoformat()]


def _stale_query(status: str, ts_field: str, cutoff: datetime) -> dict:
    ors: list[dict] = []
    for c in _cutoff_variants(cutoff):
        ors.append({ts_field: {"$lt": c}})
        # Legacy docs missing the state timestamp: age by created_at instead.
        ors.append({ts_field: {"$exists": False}, "created_at": {"$lt": c}})
        ors.append({ts_field: None, "created_at": {"$lt": c}})
    return {"status": status, "$or": ors}


async def _log_recovery_event(db: Any, trip_id: str, event_type: str, data: dict) -> None:
    try:
        await db.trip_events.insert_one(
            {
                "id": str(uuid.uuid4()),
                "trip_id": trip_id,
                "event_type": event_type,
                "actor_id": "system:stuck_trip_recovery",
                "data": data,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )
    except Exception:
        logger.exception("stuck_trip_recovery_log trip=%s", trip_id)


async def _clear_driver_lock(db: Any, driver_id: Optional[str], trip_id: str) -> None:
    """Unlock the driver ONLY if they are still locked to this trip."""
    if not driver_id:
        return
    await db.driver_profiles.update_one(
        {"user_id": driver_id, "active_trip_id": trip_id},
        {"$unset": {"active_trip_id": ""}},
    )


async def _notify_parties(trip: dict, title: str, body: str, data: dict) -> None:
    try:
        from push_notifications import send_push_notification

        for uid in {trip.get("rider_id"), trip.get("driver_id")}:
            if uid:
                await send_push_notification(uid, title, body, data)
    except Exception:
        logger.exception("stuck_trip_recovery_notify trip=%s", trip.get("id"))


async def _cancel_stale_trip(db: Any, trip: dict, reason: str) -> bool:
    trip_id = trip.get("id")
    old_status = trip.get("status")
    result = await db.trips.update_one(
        {"id": trip_id, "status": old_status},  # atomic: skip if state moved on
        {
            "$set": {
                **ride_state_set_fields(
                    old_status=old_status,
                    new_status="cancelled",
                    actor_id="system:stuck_trip_recovery",
                    reason=reason,
                ),
                "cancelled_by": "system",
                "cancelled_at": datetime.utcnow(),
                "cancellation_reason": reason,
                "cancel_reason": reason,
            },
            "$inc": ride_state_inc_fields(),
        },
    )
    if result.modified_count == 0:
        return False

    rider_id = trip.get("rider_id")
    if rider_id:
        try:
        except Exception:
            logger.exception("stuck_trip_recovery_hold_release trip=%s", trip_id)
    await _clear_driver_lock(db, trip.get("driver_id"), trip_id)
    await _log_recovery_event(
        db, trip_id, "trip_auto_cancelled_stale", {"previous_status": old_status, "reason": reason}
    )
    await _notify_parties(
        trip,
        "Trip closed",
        "This trip was inactive for too long and was closed automatically. "
        "You can book or accept a new trip right away.",
        {"type": "trip_auto_closed", "trip_id": trip_id},
    )
    return True


async def _force_complete_trip_doc(
    db: Any, trip: dict, *, actor_id: str, reason: str
) -> bool:
    trip_id = trip.get("id")
    old_status = trip.get("status")
    result = await db.trips.update_one(
        {"id": trip_id, "status": old_status},
        {
            "$set": {
                **ride_state_set_fields(
                    old_status=old_status,
                    new_status="completed",
                    actor_id=actor_id,
                    reason=reason,
                ),
                "completed_at": datetime.now(timezone.utc).isoformat(),
                # Settlement is direct rider→driver (cash/transfer); mark closed.
                "payment_status": "completed",
                "payment_settled_offline": True,
                "force_completed": True,
                "force_completed_by": actor_id,
                "force_completed_reason": reason,
            },
            "$inc": ride_state_inc_fields(),
        },
    )
    if result.modified_count == 0:
        return False

    rider_id = trip.get("rider_id")
    if rider_id:
        # Refund any wallet hold — we never debit on a forced completion.
        try:
        except Exception:
            logger.exception("force_complete_hold_release trip=%s", trip_id)
    await _clear_driver_lock(db, trip.get("driver_id"), trip_id)
    await _log_recovery_event(
        db,
        trip_id,
        "trip_force_completed",
        {"previous_status": old_status, "reason": reason, "actor_id": actor_id},
    )
    return True


async def recover_stale_active_trips(db: Any) -> dict:
    """One watchdog tick: cancel/complete every post-accept trip past its TTL."""
    now = datetime.now(timezone.utc)
    counts = {"accepted_cancelled": 0, "arrived_cancelled": 0, "ongoing_completed": 0}

    stale_specs = [
        ("accepted", "accepted_at", now - timedelta(minutes=ACCEPTED_TTL_MINUTES), "cancel"),
        ("arrived", "arrived_at", now - timedelta(minutes=ARRIVED_TTL_MINUTES), "cancel"),
        ("ongoing", "started_at", now - timedelta(hours=ONGOING_TTL_HOURS), "complete"),
    ]

    for status, ts_field, cutoff, action in stale_specs:
        try:
            rows = await db.trips.find(_stale_query(status, ts_field, cutoff), {"_id": 0}).to_list(100)
        except Exception:
            logger.exception("stuck_trip_recovery_query status=%s", status)
            continue
        for trip in rows:
            try:
                if action == "cancel":
                    ok = await _cancel_stale_trip(db, trip, f"stale_{status}_ttl")
                    if ok:
                        counts[f"{status}_cancelled"] += 1
                else:
                    ok = await _force_complete_trip_doc(
                        db,
                        trip,
                        actor_id="system:stuck_trip_recovery",
                        reason=f"stale_{status}_ttl",
                    )
                    if ok:
                        counts["ongoing_completed"] += 1
                        await _notify_parties(
                            trip,
                            "Trip completed",
                            "This trip was automatically completed after being active for a long time.",
                            {"type": "trip_auto_completed", "trip_id": trip.get("id")},
                        )
            except Exception:
                logger.exception("stuck_trip_recovery_apply trip=%s", trip.get("id"))

    # Safety net: drivers locked to a trip that is already terminal (crash between writes).
    try:
        locked = await db.driver_profiles.find(
            {"active_trip_id": {"$nin": [None, ""]}}, {"_id": 0, "user_id": 1, "active_trip_id": 1}
        ).to_list(200)
        for row in locked:
            tid = row.get("active_trip_id")
            trip = await db.trips.find_one({"id": tid}, {"_id": 0, "status": 1})
            status = (trip or {}).get("status")
            if trip is None or status in ("completed", "cancelled", "expired"):
                await db.driver_profiles.update_one(
                    {"user_id": row["user_id"], "active_trip_id": tid},
                    {"$unset": {"active_trip_id": ""}},
                )
                counts["driver_locks_cleared"] = counts.get("driver_locks_cleared", 0) + 1
    except Exception:
        logger.exception("stuck_trip_recovery_lock_sweep")

    return counts


async def admin_force_complete_trip(db: Any, trip_id: str, *, admin_email: str, note: str = "") -> dict:
    """Admin escape hatch: complete a stuck post-accept trip and free the driver."""
    trip = await db.trips.find_one({"id": trip_id}, {"_id": 0})
    if not trip:
        return {"success": False, "error": "Trip not found"}
    status = trip.get("status")
    if status == "completed" and trip.get("payment_status") == "completed":
        # Still clear a dangling driver lock even if the trip itself is fine.
        await _clear_driver_lock(db, trip.get("driver_id"), trip_id)
        return {"success": True, "already_completed": True, "status": "completed"}
    if status not in FORCE_COMPLETABLE_STATUSES and status != "completed":
        return {
            "success": False,
            "error": f"Trip in status '{status}' cannot be force-completed (allowed: {sorted(FORCE_COMPLETABLE_STATUSES)})",
        }

    reason = f"admin_force_complete: {note}".strip().rstrip(":")
    ok = await _force_complete_trip_doc(db, trip, actor_id=f"admin:{admin_email}", reason=reason)
    if not ok:
        # Status changed between read and write — report current state.
        current = await db.trips.find_one({"id": trip_id}, {"_id": 0, "status": 1})
        await _clear_driver_lock(db, trip.get("driver_id"), trip_id)
        return {"success": True, "already_transitioned": True, "status": (current or {}).get("status")}

    await _notify_parties(
        trip,
        "Trip completed",
        "Your trip was completed by NEXRYDE support. Contact support if anything looks wrong.",
        {"type": "trip_force_completed", "trip_id": trip_id},
    )
    return {"success": True, "status": "completed", "driver_unlocked": bool(trip.get("driver_id"))}

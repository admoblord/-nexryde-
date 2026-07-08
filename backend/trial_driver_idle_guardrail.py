"""
Auto-offline trial drivers who stay online 5+ continuous hours with zero completed trips today.

Paying subscribers (active / grace_period) are never affected.
Enable cost guardrail only for subscription status ``trial``.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from database import db
from driver_presence import set_driver_offline
from notification_service import send_push_notification

logger = logging.getLogger(__name__)

TRIAL_IDLE_ONLINE_MAX_HOURS = 5
_GUARD_PUSH_TITLE = "You're offline now"
_GUARD_PUSH_BODY = "You've been set offline — go back online anytime."


async def tick_trial_driver_idle_guardrail() -> int:
    """Returns count of drivers auto-offlined this tick."""
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=TRIAL_IDLE_ONLINE_MAX_HOURS)
    cutoff_iso = cutoff.isoformat()
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    profiles = await db.driver_profiles.find(
        {
            "is_online": True,
            "online_session_started_at": {"$exists": True, "$ne": None, "$lte": cutoff_iso},
        },
        {"_id": 0, "user_id": 1, "online_session_started_at": 1},
    ).to_list(500)

    offlined = 0
    for profile in profiles:
        driver_id = profile.get("user_id")
        if not driver_id:
            continue

        paying = await db.subscriptions.find_one(
            {
                "driver_id": driver_id,
                "status": {"$in": ["active", "grace_period"]},
            },
            {"_id": 1},
        )
        if paying:
            continue

        trial = await db.subscriptions.find_one(
            {"driver_id": driver_id, "status": "trial"},
            {"_id": 1},
        )
        if not trial:
            continue

        trips_today = await db.trips.count_documents(
            {
                "driver_id": driver_id,
                "status": "completed",
                "completed_at": {"$gte": today_start},
            }
        )
        if trips_today > 0:
            continue

        await set_driver_offline(driver_id)
        await db.driver_profiles.update_one(
            {"user_id": driver_id},
            {
                "$set": {
                    "is_online": False,
                    "went_offline_reason": "trial_idle_guardrail",
                },
                "$unset": {"online_session_started_at": ""},
            },
        )
        try:
            await send_push_notification(
                driver_id,
                _GUARD_PUSH_TITLE,
                _GUARD_PUSH_BODY,
                {"type": "trial_idle_guardrail"},
                source="trial_idle_guardrail",
            )
        except Exception as exc:
            logger.debug("trial_idle_guardrail push skipped uid=%s: %s", driver_id, exc)

        offlined += 1
        logger.info(
            "Trial idle guardrail: offlined driver=%s session_hours>=%s trips_today=0",
            driver_id,
            TRIAL_IDLE_ONLINE_MAX_HOURS,
        )

    return offlined

"""In-app + push reminders when driver subscriptions are expiring."""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone, timedelta

from database import db
from notification_service import send_push_notification

logger = logging.getLogger(__name__)

REMINDER_DAYS = (3, 1, 0)


def _parse_end_date(raw) -> datetime | None:
    if isinstance(raw, datetime):
        return raw.replace(tzinfo=None) if raw.tzinfo else raw
    if isinstance(raw, str) and raw.strip():
        try:
            return datetime.fromisoformat(raw.replace("Z", "+00:00")).replace(tzinfo=None)
        except Exception:
            return None
    return None


async def _upsert_subscription_notification(
    driver_id: str,
    *,
    notif_type: str,
    title: str,
    message: str,
    dedupe_key: str,
) -> None:
    since = datetime.now(timezone.utc) - timedelta(hours=20)
    existing = await db.notifications.find_one(
        {
            "user_id": driver_id,
            "type": notif_type,
            "data.dedupe_key": dedupe_key,
            "created_at": {"$gte": since.isoformat()},
        }
    )
    if existing:
        return
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.notifications.insert_one(
        {
            "id": str(uuid.uuid4()),
            "user_id": driver_id,
            "type": notif_type,
            "title": title,
            "message": message,
            "read": False,
            "created_at": now_iso,
            "data": {"dedupe_key": dedupe_key, "screen": "/driver/subscription"},
        }
    )
    try:
        await send_push_notification(
            driver_id,
            title,
            message,
            {"type": notif_type, "screen": "/driver/subscription"},
            source="subscription_reminder",
        )
    except Exception as exc:
        logger.warning("subscription push failed driver=%s: %s", driver_id, exc)


async def tick_subscription_expiry_reminders() -> int:
    """Send 3-day, 1-day, and expiry-day reminders for active paid subscriptions."""
    now = datetime.utcnow()
    sent = 0
    cursor = db.subscriptions.find(
        {"status": {"$in": ["active", "grace_period"]}},
        {"_id": 0, "driver_id": 1, "end_date": 1, "tier": 1, "status": 1},
    )
    async for sub in cursor:
        driver_id = sub.get("driver_id")
        if not driver_id:
            continue
        end_date = _parse_end_date(sub.get("end_date"))
        if not end_date:
            continue
        days_left = (end_date.date() - now.date()).days
        if days_left not in REMINDER_DAYS:
            continue

        tier_label = "Road Warrior" if sub.get("tier") == "road_warrior" else "City Rider"
        if days_left == 3:
            title = "Subscription ending soon"
            message = (
                f"Your {tier_label} plan ends in 3 days. Tap Subscribe now to keep earning without interruption."
            )
            dedupe = f"sub-exp-3d-{end_date.date().isoformat()}"
        elif days_left == 1:
            title = "Subscription ends tomorrow"
            message = (
                f"Your {tier_label} subscription ends tomorrow. Pay now to stay online and accept rides."
            )
            dedupe = f"sub-exp-1d-{end_date.date().isoformat()}"
        else:
            title = "Subscription ends today"
            message = (
                f"Your {tier_label} subscription ends today. Subscribe now to restore full driver access."
            )
            dedupe = f"sub-exp-0d-{end_date.date().isoformat()}"

        await _upsert_subscription_notification(
            driver_id,
            notif_type="subscription_expiring",
            title=title,
            message=message,
            dedupe_key=dedupe,
        )
        sent += 1

    return sent

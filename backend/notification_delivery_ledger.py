"""Atomic notification delivery ledger — dedupe, role logging, scheduler locks.

Unique delivery key:
  user_id + notification_type + local_date + time_slot

Atomic Mongo insert claims a send before Expo/FCM. Identical deliveries within
24 hours (same user, type, role, delivery_window) are skipped.
"""
from __future__ import annotations

import logging
import os
import socket
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from pymongo.errors import DuplicateKeyError

from database import db
from notification_catalog import (
    NotificationAudience,
    NotificationCategory,
    get_kind_meta,
    normalize_audience,
    normalize_category,
)

logger = logging.getLogger(__name__)

INSTANCE_ID = os.environ.get("K_REVISION") or os.environ.get("HOSTNAME") or socket.gethostname() or uuid.uuid4().hex[:12]
DEDUPE_WINDOW_HOURS = int(os.environ.get("NOTIFICATION_DEDUPE_WINDOW_HOURS", "24"))
MAX_ENGAGEMENT_PER_DAY = int(os.environ.get("ENGAGEMENT_MAX_PER_DAY", "2"))

_DEDUPE_CATEGORIES = {
    NotificationCategory.DRIVER_ENGAGEMENT,
    NotificationCategory.RIDER_ENGAGEMENT,
    NotificationCategory.MARKETING,
    NotificationCategory.COMPLIANCE,
}
_DEDUPE_SOURCES = {
    "engagement",
    "daily_slot",
    "compliance",
    "scheduled",
}


def build_delivery_key(
    user_id: str,
    notification_type: str,
    *,
    trip_id: Optional[str] = None,
    local_date: Optional[str] = None,
    delivery_slot: str = "default",
) -> str:
    """Canonical dedupe key: user + type + (trip_id | local_date) + delivery_slot."""
    scope = str(trip_id or local_date or "none").strip() or "none"
    slot = str(delivery_slot or "default").strip() or "default"
    return f"{user_id}|{notification_type}|{scope}|{slot}"


def infer_delivery_window(local_hour: int, *, weekend: bool = False) -> str:
    if weekend and local_hour < 22:
        return "weekend"
    if 7 <= local_hour < 10:
        return "morning"
    if 12 <= local_hour < 15:
        return "afternoon"
    if 17 <= local_hour < 20:
        return "evening"
    if 22 <= local_hour or local_hour < 5:
        return "night"
    return "offpeak"


def infer_time_slot(local_hour: int, *, weekend: bool = False, explicit: Optional[str] = None) -> str:
    slot = str(explicit or "").strip()
    if slot:
        return slot
    return infer_delivery_window(local_hour, weekend=weekend)


def should_dedupe_notification(
    *,
    category: NotificationCategory | str,
    source: str,
    notification_type: str,
    trip_id: Optional[str] = None,
) -> bool:
    cat = normalize_category(category)
    src = str(source or "").strip().lower()
    kind = str(notification_type or "").strip().lower()
    if src in _DEDUPE_SOURCES:
        return True
    if cat in _DEDUPE_CATEGORIES:
        return True
    if kind.startswith(("daily_slot_", "monthly_verification")):
        return True
    # Ride / safety pushes with a trip_id are deduped per trip + type + slot.
    if trip_id and cat in {NotificationCategory.RIDES, NotificationCategory.SAFETY, NotificationCategory.PAYMENTS}:
        return True
    return False


def log_notification_decision(
    *,
    user_id: str,
    role: Optional[str],
    notification_type: str,
    audience: str,
    template: str,
    delivered: bool,
    skipped_reason: Optional[str] = None,
    delivery_key: Optional[str] = None,
    source: str = "",
    trip_id: Optional[str] = None,
    extra: Optional[dict[str, Any]] = None,
) -> None:
    payload: dict[str, Any] = {
        "user_id": user_id,
        "role": role,
        "notification_type": notification_type,
        "audience": audience,
        "template": template,
        "trip_id": trip_id,
        "delivered": delivered,
        "delivery_status": "sent" if delivered else "skipped",
        "skipped_reason": skipped_reason,
        "delivery_key": delivery_key,
        "source": source,
    }
    if extra:
        payload.update(extra)
    logger.info("notification_decision %s", payload)


async def claim_notification_delivery(
    *,
    user_id: str,
    role: str,
    notification_type: str,
    audience: str | NotificationAudience,
    template: str,
    local_date: str,
    time_slot: str,
    delivery_window: str,
    source: str,
    title: str = "",
    body: str = "",
    trip_id: Optional[str] = None,
) -> tuple[bool, dict[str, Any]]:
    """Atomically reserve a delivery. Returns (claimed, meta)."""
    now = datetime.now(timezone.utc)
    aud = normalize_audience(audience).value
    delivery_key = build_delivery_key(
        user_id,
        notification_type,
        trip_id=trip_id,
        local_date=None if trip_id else local_date,
        delivery_slot=time_slot,
    )
    meta: dict[str, Any] = {
        "delivery_key": delivery_key,
        "local_date": local_date,
        "time_slot": time_slot,
        "delivery_window": delivery_window,
        "role": role,
        "audience": aud,
        "notification_type": notification_type,
        "template": template,
        "source": source,
        "trip_id": trip_id,
    }

    # 24h identical check (type + role + delivery_window [+ trip when present]).
    since = now - timedelta(hours=DEDUPE_WINDOW_HOURS)
    identical_q: dict[str, Any] = {
        "user_id": user_id,
        "notification_type": notification_type,
        "role": role,
        "delivery_window": delivery_window,
        "created_at": {"$gte": since},
    }
    if trip_id:
        identical_q["trip_id"] = trip_id
    prior = await db.notification_delivery_ledger.find_one(
        identical_q,
        {"_id": 0, "delivery_key": 1},
    )
    if prior:
        reason = "duplicate_within_24h"
        log_notification_decision(
            user_id=user_id,
            role=role,
            notification_type=notification_type,
            audience=aud,
            template=template,
            delivered=False,
            skipped_reason=reason,
            delivery_key=str(prior.get("delivery_key") or delivery_key),
            source=source,
            trip_id=trip_id,
        )
        return False, {**meta, "skip_reason": reason}

    # Cap engagement-style sends at max 2 / local day.
    # Ride / safety / payments / compliance must NEVER consume this engagement budget.
    kind_meta = get_kind_meta(notification_type)
    kind_category = normalize_category(kind_meta.get("category"))
    is_engagement_budget = source in {"engagement", "daily_slot"} or kind_category in {
        NotificationCategory.DRIVER_ENGAGEMENT,
        NotificationCategory.RIDER_ENGAGEMENT,
        NotificationCategory.MARKETING,
    }
    if is_engagement_budget:
        day_sent = await db.notification_delivery_ledger.count_documents(
            {
                "user_id": user_id,
                "local_date": local_date,
                "source": {"$in": ["engagement", "daily_slot"]},
                "status": {"$in": ["queued", "sent"]},
            }
        )
        if day_sent >= MAX_ENGAGEMENT_PER_DAY:
            reason = "daily_cap"
            log_notification_decision(
                user_id=user_id,
                role=role,
                notification_type=notification_type,
                audience=aud,
                template=template,
                delivered=False,
                skipped_reason=reason,
                delivery_key=delivery_key,
                source=source,
                trip_id=trip_id,
            )
            return False, {**meta, "skip_reason": reason}

    doc = {
        "delivery_key": delivery_key,
        "user_id": user_id,
        "role": role,
        "notification_type": notification_type,
        "audience": aud,
        "template": template,
        "local_date": local_date,
        "time_slot": time_slot,
        "delivery_window": delivery_window,
        "trip_id": trip_id,
        "source": source,
        "title": title[:160],
        "body": (body or "")[:240],
        "status": "queued",
        "created_at": now,
        "expires_at": now + timedelta(days=45),
    }
    try:
        await db.notification_delivery_ledger.insert_one(doc)
    except DuplicateKeyError:
        reason = "duplicate_delivery_key"
        log_notification_decision(
            user_id=user_id,
            role=role,
            notification_type=notification_type,
            audience=aud,
            template=template,
            delivered=False,
            skipped_reason=reason,
            delivery_key=delivery_key,
            source=source,
            trip_id=trip_id,
        )
        return False, {**meta, "skip_reason": reason}

    return True, meta


async def mark_notification_delivery(
    delivery_key: str,
    *,
    delivered: bool,
    skip_reason: Optional[str] = None,
) -> None:
    now = datetime.now(timezone.utc)
    await db.notification_delivery_ledger.update_one(
        {"delivery_key": delivery_key},
        {
            "$set": {
                "status": "sent" if delivered else ("skipped" if skip_reason else "failed"),
                "delivered": bool(delivered),
                "skip_reason": skip_reason,
                "completed_at": now,
            }
        },
    )


async def acquire_scheduler_lock(job_name: str, *, hold_seconds: int = 240) -> bool:
    """Ensure only one backend instance runs a scheduler job window."""
    now = datetime.now(timezone.utc)
    expires = now + timedelta(seconds=hold_seconds)
    lock_id = str(job_name)

    try:
        from redis_store import REDIS_URL, store

        redis_key = f"nexryde:notif_sched_lock:{lock_id}"
        if REDIS_URL:
            return bool(await store.set_nx(redis_key, INSTANCE_ID, ttl=hold_seconds))
    except Exception:
        logger.debug("redis scheduler lock unavailable; using mongo", exc_info=True)

    try:
        await db.notification_scheduler_locks.insert_one(
            {
                "_id": lock_id,
                "owner": INSTANCE_ID,
                "acquired_at": now,
                "expires_at": expires,
            }
        )
        return True
    except DuplicateKeyError:
        existing = await db.notification_scheduler_locks.find_one({"_id": lock_id})
        if not existing:
            return False
        exp = existing.get("expires_at")
        if isinstance(exp, datetime):
            exp_aware = exp if exp.tzinfo else exp.replace(tzinfo=timezone.utc)
            if exp_aware <= now:
                res = await db.notification_scheduler_locks.update_one(
                    {"_id": lock_id, "expires_at": {"$lte": now}},
                    {
                        "$set": {
                            "owner": INSTANCE_ID,
                            "acquired_at": now,
                            "expires_at": expires,
                        }
                    },
                )
                return bool(res.modified_count)
        return False


def engagement_tick_lock_id(now: Optional[datetime] = None) -> str:
    """One lock bucket per 5-minute UTC window so multi-instance ticks don't overlap."""
    now = now or datetime.now(timezone.utc)
    bucket = now.replace(second=0, microsecond=0)
    minute = (bucket.minute // 5) * 5
    bucket = bucket.replace(minute=minute)
    return f"engagement_tick:{bucket.strftime('%Y%m%d%H%M')}"

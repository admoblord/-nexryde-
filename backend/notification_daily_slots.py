"""
Recurring push notifications at fixed local times (daily).

Default timezone: Africa/Lagos. Enable with DAILY_SLOT_NOTIFICATIONS_ENABLED=true
(off by default — turn on at 500+ active users; scans broadcast audience on each tick).

Slots (local time):
  Morning 7:30, Lunch 12:15, Evening 5:45 PM, Night 10:30 PM

Copy is intentionally neutral — customize in DAILY_SLOT_MESSAGES_JSON if needed.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from datetime import datetime, timezone
from typing import Any, Optional

from pymongo.errors import DuplicateKeyError

from database import db
from notification_service import get_user_ids_for_broadcast_target, send_push_notification

logger = logging.getLogger(__name__)

SlotRow = tuple[str, int, int, str, str, Optional[str]]

_DEFAULT_SLOTS: list[SlotRow] = [
    ("morning", 7, 30, "🌅 Morning Commute?", "Get 20% off your ride", "open_booking"),
    ("lunch", 12, 15, "Lunch break", "Need a lift? Book your NEXRYDE in seconds.", None),
    ("evening", 17, 45, "Evening commute", "Heading home? Request your ride on NEXRYDE.", None),
    ("night", 22, 30, "Night travel", "Travel safe tonight — NEXRYDE is here when you need us.", None),
]


def _daily_slots_enabled() -> bool:
    return os.environ.get("DAILY_SLOT_NOTIFICATIONS_ENABLED", "").strip().lower() in ("1", "true", "yes")


def _timezone_name() -> str:
    return (os.environ.get("DAILY_SLOT_TIMEZONE") or "Africa/Lagos").strip() or "Africa/Lagos"


def _audience() -> str:
    return (os.environ.get("DAILY_SLOT_AUDIENCE") or "all").strip() or "all"


def _load_slots() -> list[SlotRow]:
    raw = os.environ.get("DAILY_SLOT_MESSAGES_JSON", "").strip()
    if not raw:
        return list(_DEFAULT_SLOTS)
    try:
        parsed = json.loads(raw)
        out: list[SlotRow] = []
        for row in parsed:
            if not isinstance(row, dict):
                continue
            sid = str(row.get("id") or "").strip()
            h = int(row["hour"])
            m = int(row["minute"])
            title = str(row.get("title") or "NEXRYDE")
            body = str(row.get("body") or "")
            act_raw = row.get("action")
            action_opt = str(act_raw).strip() if act_raw else None
            if sid:
                out.append((sid, h, m, title, body, action_opt))
        return out if out else list(_DEFAULT_SLOTS)
    except Exception as e:
        logger.warning("DAILY_SLOT_MESSAGES_JSON invalid, using defaults: %s", e)
        return list(_DEFAULT_SLOTS)


async def tick_daily_slot_notifications() -> int:
    """If local time matches a slot this minute, broadcast once (deduped per day). Returns slots fired."""
    if not _daily_slots_enabled():
        return 0

    try:
        from zoneinfo import ZoneInfo

        tz_name = _timezone_name()
        try:
            tz = ZoneInfo(tz_name)
        except Exception:
            logger.warning("Invalid DAILY_SLOT_TIMEZONE=%s, using Africa/Lagos", tz_name)
            tz = ZoneInfo("Africa/Lagos")
            tz_name = "Africa/Lagos"
    except Exception as e:
        logger.warning("zoneinfo unavailable: %s", e)
        return 0

    now_local = datetime.now(tz)
    day_key = now_local.strftime("%Y-%m-%d")
    slots = _load_slots()
    fired = 0

    for slot_id, hour, minute, title, body in slots:
        if now_local.hour != hour or now_local.minute != minute:
            continue

        type_slug = f"daily_slot_{slot_id}"
        try:
            await db.daily_notification_slot_log.insert_one(
                {
                    "day": day_key,
                    "slot_id": slot_id,
                    "timezone": tz_name,
                    "sent_at": datetime.now(timezone.utc).isoformat(),
                }
            )
        except DuplicateKeyError:
            continue

        target = _audience()
        try:
            uids = await get_user_ids_for_broadcast_target(target)
        except Exception:
            uids = []

        data: dict[str, Any] = {"type": type_slug, "slot": slot_id}
        if slot_action:
            data["action"] = slot_action
        sem = asyncio.Semaphore(40)

        async def one(uid: str):
            async with sem:
                await send_push_notification(uid, title, body, data, source="daily_slot")

        await asyncio.gather(*(one(uid) for uid in uids[:25_000]), return_exceptions=True)
        fired += 1
        logger.info(
            "daily_slot fired slot=%s day=%s audience=%s users=%s",
            slot_id,
            day_key,
            target,
            len(uids),
        )

    return fired

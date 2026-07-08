"""
Daily engagement push notifications — location-aware, Nigeria-specific.

Started from server._engagement_push_loop() only when ENGAGEMENT_LOOP_ENABLED=true.
Leave disabled below ~500 active users to avoid scanning all push-token holders every 5 min.

For each active time slot the service:
  1. Looks up every user of that role who has a push token
  2. Resolves their last known GPS to a Nigerian neighborhood
  3. Sends a hyper-local message referencing their actual area / road

Slots (WAT = UTC+1):
  Drivers → 06:00 · 12:00 · 17:00 · 20:00
  Riders  → 07:30 · 13:00 · 18:00
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from database import db
from notification_service import send_push_notification
from nigeria_geo_zones import resolve_area
from nigeria_push_messages import get_message

logger = logging.getLogger(__name__)

WAT = timedelta(hours=1)

# Slot registry: (hour, minute, role)
_SLOTS: list[tuple[int, int, str]] = [
    (6,  0,  "driver"),
    (7,  30, "rider"),
    (12, 0,  "driver"),
    (13, 0,  "rider"),
    (17, 0,  "driver"),
    (18, 0,  "rider"),
    (20, 0,  "driver"),
]

_sent_today: set[str] = set()


def _wat_now() -> datetime:
    return datetime.now(timezone.utc) + WAT


def _slot_key(hour: int, minute: int) -> str:
    return f"{hour:02d}:{minute:02d}"


def _rotation_idx() -> int:
    """Rotate by day-of-year so message copy changes daily (15 variants = no repeat for 2 weeks)."""
    return _wat_now().timetuple().tm_yday % 15


def _slot_rotation(slot_index: int) -> int:
    """Per-slot rotation seed so every slot shows a DIFFERENT variant on a given day,
    and the whole pool cycles over time.

    day-of-year * 7 (coprime with the 15-variant pool) jumps across variants day to day,
    while + slot_index makes the slots within one day distinct. get_message() applies % len(pool).
    """
    yday = _wat_now().timetuple().tm_yday
    return yday * 7 + slot_index


async def _near(hour: int, minute: int, window: int = 5) -> bool:
    now = _wat_now()
    target = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    return abs((now - target).total_seconds()) <= window * 60


async def _last_location(user_id: str, role: str) -> tuple[Optional[float], Optional[float]]:
    """Return (lat, lng) from the user's most recent GPS ping, or (None, None)."""
    if role == "driver":
        doc = await db.driver_profiles.find_one(
            {"user_id": user_id},
            {"_id": 0, "current_location": 1},
        )
        loc = (doc or {}).get("current_location") or {}
        return loc.get("lat"), loc.get("lng")

    # Rider: use last trip pickup location
    trip = await db.trips.find_one(
        {"rider_id": user_id, "status": {"$in": ["completed", "active", "driver_assigned"]}},
        {"_id": 0, "pickup_location": 1},
        sort=[("created_at", -1)],
    )
    if trip:
        pl = trip.get("pickup_location") or {}
        return pl.get("lat") or pl.get("latitude"), pl.get("lng") or pl.get("longitude")

    # Fallback: user profile city field
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "city": 1})
    return None, None


async def tick_engagement_pushes() -> int:
    """
    Called every 5 minutes by the server background loop.
    Sends location-aware push notifications for any slot within ±5 minutes.
    Returns total pushes dispatched.
    """
    sent = 0
    today_str = _wat_now().strftime("%Y-%m-%d")

    for slot_index, (hour, minute, role) in enumerate(_SLOTS):
        rotation = _slot_rotation(slot_index)
        slot_key = _slot_key(hour, minute)
        dedup_key = f"{today_str}_{slot_key}_{role}"
        if dedup_key in _sent_today:
            continue
        if not await _near(hour, minute):
            continue

        _sent_today.add(dedup_key)

        # Fetch all active users of this role who have at least one push token.
        # NOTE: MongoDB silently ignores duplicate keys in a dict literal, so
        # {"$ne": None, "$ne": ""} only keeps "$ne": "". Use $and instead.
        query = {
            "role": role,
            "is_active": {"$ne": False},
            "$or": [
                {
                    "push_token": {
                        "$exists": True,
                        "$nin": [None, ""],
                    }
                },
                {
                    "push_devices": {
                        "$exists": True,
                        "$not": {"$size": 0},
                    }
                },
            ],
        }
        user_ids: list[str] = [
            u["id"] async for u in db.users.find(query, {"_id": 0, "id": 1})
        ]

        logger.info(
            "Engagement push slot=%s role=%s users=%d",
            slot_key, role, len(user_ids),
        )

        for uid in user_ids:
            try:
                lat, lng = await _last_location(uid, role)
                area = resolve_area(lat, lng)
                msg = get_message(area, role, slot_key, rotation)

                await send_push_notification(
                    uid,
                    msg["title"],
                    msg["body"],
                    {
                        "type": "earnings_update" if role == "driver" else "feature_update",
                        "screen": "/(driver-tabs)/driver-home" if role == "driver" else "/rider/book",
                        "area": area.area,
                        "city": area.city,
                        # Android: route into the 'offers' channel (importance HIGH)
                        "channel_id": "offers",
                        # Badge count shown on app icon
                        "badge": "1",
                    },
                    source="engagement_push",
                )
                sent += 1
            except Exception as exc:
                logger.debug("Engagement push skipped uid=%s: %s", uid, exc)

    return sent

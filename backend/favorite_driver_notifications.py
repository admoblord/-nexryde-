"""Targeted rider pushes that explain favourites + perks (after trip milestones)."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from database import db
from notification_service import send_push_notification

logger = logging.getLogger(__name__)


async def maybe_send_rider_favorite_engagement_pushes(rider_id: str, driver_id: Optional[str]) -> None:
    """
    Sent only for riders, after trip completion is persisted:

    - 1st completed trip: if they have no favourites yet — soft nudge with perk hint.
    - 3rd completed trip: if they still have zero favourites — stronger habit nudge.

    Idempotent via ``users.rider_engagement.*`` flags.
    """
    try:
        n_done = await db.trips.count_documents({"rider_id": rider_id, "status": "completed"})
    except Exception as e:
        logger.debug("favorite_engagement trip count skipped: %s", e)
        return

    user = await db.users.find_one(
        {"id": rider_id},
        {"favorite_drivers": 1, "role": 1, "rider_engagement": 1},
    )
    if not user or user.get("role") != "rider":
        return

    favs = user.get("favorite_drivers") or []
    if not isinstance(favs, list):
        favs = []
    eng = user.get("rider_engagement") or {}
    if not isinstance(eng, dict):
        eng = {}

    now_iso = datetime.now(timezone.utc).isoformat()
    base_data = {
        "type": "favorite_driver_nudge",
        "action": "open_favorites",
    }

    # First-ever completed trip — onboarding favours
    if (
        n_done == 1
        and len(favs) == 0
        and not eng.get("favorite_first_trip_nudge_sent")
    ):
        res = await db.users.update_one(
            {"id": rider_id, "rider_engagement.favorite_first_trip_nudge_sent": {"$ne": True}},
            {
                "$set": {
                    "rider_engagement.favorite_first_trip_nudge_sent": True,
                    "rider_engagement.favorite_first_trip_nudge_at": now_iso,
                }
            },
        )
        if res.modified_count:
            payload = {
                **base_data,
                "nudge": "first_trip",
            }
            if driver_id:
                payload["driver_id"] = driver_id
            await send_push_notification(
                rider_id,
                "Had a 5-star ride?",
                "Save your driver as a favourite — quicker next booking, and when they’re on shift your fare estimate may include a loyalty perk.",
                payload,
                source="favorite_engagement",
            )
        return

    # Third trip, still no favourites — habit nudge (skip if they already saved anyone)
    if (
        n_done == 3
        and len(favs) == 0
        and not eng.get("favorite_three_trips_nudge_sent")
    ):
        res = await db.users.update_one(
            {"id": rider_id, "rider_engagement.favorite_three_trips_nudge_sent": {"$ne": True}},
            {
                "$set": {
                    "rider_engagement.favorite_three_trips_nudge_sent": True,
                    "rider_engagement.favorite_three_trips_nudge_at": now_iso,
                }
            },
        )
        if res.modified_count:
            await send_push_notification(
                rider_id,
                "Pick who picks you up",
                "Save favourite drivers under Profile → Fav Drivers — less guesswork, more rides with people you trust.",
                {**base_data, "nudge": "three_trips"},
                source="favorite_engagement",
            )

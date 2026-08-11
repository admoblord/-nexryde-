"""Google Maps billing guardrails — per-trip + daily call counters."""
from __future__ import annotations

import logging
import traceback
from datetime import datetime, timezone
from typing import Any, Optional

logger = logging.getLogger("maps_billing")

# Soft ceiling: fare(1) + to_pickup(1) + to_dropoff(1) + limited re-routes
TRIP_CALL_WARN = 5
DAILY_CALL_ALERT = int(__import__("os").environ.get("NEXRYDE_MAPS_DAILY_ALERT", "5000"))
REROUTE_MIN_INTERVAL_SEC = 180
REROUTE_MAX_PER_TRIP = 4
DEVIATION_M = 150.0
DEVIATION_STREAK_NEEDED = 3


def _day_key() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


async def incr_maps_call(
    *,
    trip_id: Optional[str],
    kind: str,
    detail: str = "",
) -> int:
    """Increment counters. Returns per-trip total when trip_id set, else daily total."""
    trip_total = 0
    try:
        from redis_store import store

        day = _day_key()
        daily_key = f"maps:calls:day:{day}"
        daily = await store.incr(daily_key, ttl=86400 * 2)
        if daily == 1:
            await store.expire(daily_key, 86400 * 2)
        if daily >= DAILY_CALL_ALERT and daily % 50 == 0:
            logger.error(
                "MAPS_DAILY_ALERT day=%s total=%s threshold=%s kind=%s",
                day,
                daily,
                DAILY_CALL_ALERT,
                kind,
            )

        if trip_id:
            tkey = f"maps:calls:trip:{trip_id}"
            trip_total = await store.incr(tkey, ttl=86400)
            if trip_total == 1:
                await store.expire(tkey, 86400)
            # Persist on trip document (best-effort)
            try:
                from database import db

                await db.trips.update_one(
                    {"id": trip_id},
                    {
                        "$inc": {"maps_api_calls": 1},
                        "$push": {
                            "maps_api_call_log": {
                                "$each": [
                                    {
                                        "kind": kind,
                                        "detail": detail[:120],
                                        "at": datetime.now(timezone.utc).isoformat(),
                                    }
                                ],
                                "$slice": -20,
                            }
                        },
                    },
                )
            except Exception:
                pass
            if trip_total > TRIP_CALL_WARN:
                logger.error(
                    "MAPS_TRIP_OVER_BUDGET trip=%s calls=%s kind=%s detail=%s\n%s",
                    trip_id,
                    trip_total,
                    kind,
                    detail,
                    "".join(traceback.format_stack(limit=8)),
                )
        return trip_total or int(daily)
    except Exception:
        logger.debug("maps counter failed", exc_info=True)
        return trip_total


async def attribute_booking_maps_call(trip_id: str, *, detail: str = "fare_estimate") -> None:
    """
    Attribute the pre-trip fare-estimate Google call to a trip after create.
    Does not bump the daily counter (already counted at estimate time).
    """
    try:
        from redis_store import store

        tkey = f"maps:calls:trip:{trip_id}"
        raw = await store.get(tkey)
        if raw is None or int(raw) < 1:
            await store.set(tkey, "1", ttl=86400)
    except Exception:
        pass
    try:
        from database import db

        trip = await db.trips.find_one({"id": trip_id}, {"_id": 0, "maps_api_calls": 1})
        if int((trip or {}).get("maps_api_calls") or 0) >= 1:
            return
        await db.trips.update_one(
            {"id": trip_id},
            {
                "$set": {"maps_api_calls": 1},
                "$push": {
                    "maps_api_call_log": {
                        "$each": [
                            {
                                "kind": "fare_estimate",
                                "detail": detail[:120],
                                "at": datetime.now(timezone.utc).isoformat(),
                            }
                        ],
                        "$slice": -20,
                    }
                },
            },
        )
    except Exception:
        logger.debug("attribute booking maps call failed", exc_info=True)


async def get_trip_maps_calls(trip_id: str) -> int:
    try:
        from redis_store import store

        raw = await store.get(f"maps:calls:trip:{trip_id}")
        if raw is not None:
            return int(raw)
    except Exception:
        pass
    try:
        from database import db

        doc = await db.trips.find_one({"id": trip_id}, {"_id": 0, "maps_api_calls": 1})
        return int((doc or {}).get("maps_api_calls") or 0)
    except Exception:
        return 0


def can_reroute(trip: dict[str, Any]) -> tuple[bool, str]:
    """Hard floor: ≤1 re-route / 3 min and ≤4 re-routes / trip."""
    count = int(trip.get("reroute_count") or 0)
    if count >= REROUTE_MAX_PER_TRIP:
        return False, "trip_reroute_ceiling"
    last = trip.get("last_reroute_at")
    if last:
        try:
            ts = datetime.fromisoformat(str(last).replace("Z", "+00:00"))
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            age = (datetime.now(timezone.utc) - ts).total_seconds()
            if age < REROUTE_MIN_INTERVAL_SEC:
                return False, "reroute_cooldown"
        except Exception:
            pass
    return True, "ok"

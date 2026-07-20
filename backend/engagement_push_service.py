"""Intelligent driver/rider engagement notifications.

Backend-owned schedules let ops change timing/copy without app releases. The
engine is conservative by design: max 2 sends/user/day, preference-aware,
driver-online suppression, rider recent-trip suppression, local-time aware, and
deduped per user/day/rule.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import random
from datetime import datetime, time, timedelta, timezone
from typing import Any, Optional

from pymongo.errors import DuplicateKeyError

from database import db
from notification_service import send_push_notification
from nigeria_geo_zones import resolve_area

logger = logging.getLogger(__name__)

MAX_DAILY_ENGAGEMENT_PUSHES = int(os.getenv("ENGAGEMENT_MAX_PER_DAY", "2"))
MIN_HOURS_BETWEEN_ENGAGEMENT_PUSHES = float(os.getenv("ENGAGEMENT_MIN_HOURS_BETWEEN", "6"))
RIDER_RECENT_TRIP_SUPPRESSION_HOURS = int(os.getenv("ENGAGEMENT_RIDER_RECENT_TRIP_HOURS", "4"))
WINDOW_MINUTES = int(os.getenv("ENGAGEMENT_SLOT_WINDOW_MINUTES", "5"))
DEFAULT_TIMEZONE = os.getenv("ENGAGEMENT_DEFAULT_TIMEZONE", "Africa/Lagos")
VARIANT_HISTORY_DAYS = int(os.getenv("ENGAGEMENT_VARIANT_HISTORY_DAYS", "14"))
QUIET_HOURS_START = int(os.getenv("ENGAGEMENT_QUIET_HOURS_START", "22"))
QUIET_HOURS_END = int(os.getenv("ENGAGEMENT_QUIET_HOURS_END", "7"))
DEMAND_RADIUS_KM = float(os.getenv("ENGAGEMENT_DEMAND_RADIUS_KM", "5"))
MIN_PENDING_FOR_DEMAND_PUSH = int(os.getenv("ENGAGEMENT_MIN_PENDING_DEMAND", "2"))
MIN_ONLINE_DRIVERS_FOR_RIDER_AVAILABILITY = int(os.getenv("ENGAGEMENT_MIN_ONLINE_DRIVERS_AVAILABILITY", "3"))
_RANDOM = random.SystemRandom()

DEFAULT_RULES: list[dict[str, Any]] = [
    {
        "id": "driver_morning_rush",
        "role": "driver",
        "kind": "driver_morning_rush",
        "days": "weekday",
        "start": "07:00",
        "end": "10:00",
        "preferred_minute": 15,
        "title": "Morning rush has started in {area}",
        "body": "Go online and start earning.",
        "action": "open_driver_home",
        "delivery_window": "morning",
    },
    {
        "id": "driver_midday_reminder",
        "role": "driver",
        "kind": "driver_midday_reminder",
        "days": "weekday",
        "start": "12:00",
        "end": "15:00",
        "preferred_minute": 20,
        "title": "Lunch hour demand is increasing near {area}",
        "body": "Go online and catch midday requests.",
        "action": "open_driver_home",
        "delivery_window": "afternoon",
    },
    {
        "id": "driver_evening_rush",
        "role": "driver",
        "kind": "driver_evening_rush",
        "days": "weekday",
        "start": "17:00",
        "end": "20:00",
        "preferred_minute": 10,
        "title": "Evening rush has started",
        "body": "Peak demand is live in {area}.",
        "action": "open_driver_home",
        "delivery_window": "evening",
    },
    {
        "id": "driver_weekend_demand",
        "role": "driver",
        "kind": "driver_weekend_demand",
        "days": "weekend",
        "start": "10:00",
        "end": "20:00",
        "preferred_minute": 0,
        "title": "Weekend demand around {city}",
        "body": "Events, errands, and family trips are active today. Go online in {area}.",
        "action": "open_driver_home",
        "delivery_window": "weekend",
    },
    {
        "id": "driver_offline_reminder",
        "role": "driver",
        "kind": "driver_offline_reminder",
        "days": "weekday",
        "start": "09:30",
        "end": "11:00",
        "preferred_minute": 45,
        "title": "Go online reminder",
        "body": "Turn on driver mode when you are available for nearby requests in {city}.",
        "action": "open_driver_home",
        "delivery_window": "morning",
    },
    {
        "id": "peak_demand_reminder",
        "role": "driver",
        "kind": "peak_demand_reminder",
        "days": "weekday",
        "start": "17:00",
        "end": "20:00",
        "preferred_minute": 35,
        "title": "Peak demand near {area}",
        "body": "This is one of today's busiest earning periods. Go online now.",
        "action": "open_driver_home",
        "delivery_window": "evening",
    },
    {
        "id": "driver_nearby_ride_opportunity",
        "role": "driver",
        "kind": "driver_nearby_ride_opportunity",
        "priority": "high",
        "days": "all",
        "start": "07:00",
        "end": "22:00",
        "preferred_minute": 5,
        "requires_nearby_request": True,
        "title": "Ride opportunity near {area}",
        "body": "A rider may need a driver nearby. Go online to be considered.",
        "action": "open_driver_home",
        "delivery_window": "opportunity",
    },
    {
        "id": "driver_online_high_demand",
        "role": "driver",
        "kind": "driver_online_high_demand",
        "priority": "high",
        "days": "all",
        "start": "07:00",
        "end": "21:30",
        "preferred_minute": 25,
        "requires_driver_online": True,
        "requires_demand_snapshot": True,
        "min_pending_near": 2,
        "min_demand_ratio": 0.45,
        "title": "High demand near {area}",
        "body": "Stay online. Rider demand remains strong around {area}.",
        "action": "view_heatmap",
        "delivery_window": "demand",
        "suppress_when_online": False,
    },
    {
        "id": "driver_online_move_to_demand",
        "role": "driver",
        "kind": "driver_online_move_to_demand",
        "priority": "normal",
        "days": "all",
        "start": "07:00",
        "end": "21:30",
        "preferred_minute": 55,
        "requires_driver_online": True,
        "requires_demand_snapshot": True,
        "requires_top_demand_area": True,
        "min_pending_near": 2,
        "min_demand_ratio": 0.35,
        "title": "Move toward {demand_area}",
        "body": "Demand is increasing there based on active ride requests.",
        "action": "view_heatmap",
        "delivery_window": "demand",
        "suppress_when_online": False,
    },
    {
        "id": "rider_morning_commute",
        "role": "rider",
        "kind": "rider_morning_commute",
        "days": "weekday",
        "start": "07:00",
        "end": "10:00",
        "preferred_minute": 20,
        "title": "Good morning. Book your ride with NexRyde.",
        "body": "Avoid morning traffic. Request a ride now.",
        "action": "open_booking",
        "delivery_window": "morning",
    },
    {
        "id": "rider_afternoon_ride",
        "role": "rider",
        "kind": "rider_afternoon_ride",
        "days": "weekday",
        "start": "12:00",
        "end": "15:00",
        "preferred_minute": 20,
        "title": "Going out for lunch?",
        "body": "Book a NexRyde in seconds.",
        "action": "open_booking",
        "delivery_window": "afternoon",
    },
    {
        "id": "rider_evening_ride",
        "role": "rider",
        "kind": "rider_evening_ride",
        "days": "weekday",
        "start": "17:00",
        "end": "20:00",
        "preferred_minute": 20,
        "title": "Heading home?",
        "body": "Book your ride now.",
        "action": "open_booking",
        "delivery_window": "evening",
    },
    {
        "id": "rider_weekend_travel",
        "role": "rider",
        "kind": "rider_weekend_travel",
        "days": "weekend",
        "start": "09:00",
        "end": "21:00",
        "preferred_minute": 10,
        "title": "Weekend plans?",
        "body": "Travel comfortably with NexRyde.",
        "action": "open_booking",
        "delivery_window": "weekend",
    },
    {
        "id": "rider_inactive_reminder",
        "role": "rider",
        "kind": "rider_inactive_reminder",
        "days": "all",
        "start": "11:00",
        "end": "19:00",
        "preferred_minute": 25,
        "title": "We miss you on NexRyde",
        "body": "Reliable rides are available near {area}. Book when you are ready.",
        "action": "open_booking",
        "delivery_window": "offpeak",
    },
    {
        "id": "complete_first_ride",
        "role": "rider",
        "kind": "complete_first_ride",
        "days": "all",
        "start": "10:00",
        "end": "18:00",
        "preferred_minute": 5,
        "title": "Complete your first NexRyde",
        "body": "Your first ride is a few taps away from {area}.",
        "action": "open_booking",
        "delivery_window": "offpeak",
    },
    {
        "id": "saved_places_reminder",
        "role": "rider",
        "kind": "saved_places_reminder",
        "days": "weekday",
        "start": "07:00",
        "end": "09:00",
        "preferred_minute": 50,
        "title": "Saved places make booking faster",
        "body": "Add Home and Work so your next ride from {area} is one tap away.",
        "action": "open_booking",
        "delivery_window": "morning",
    },
    {
        "id": "rider_weather_ready",
        "role": "rider",
        "kind": "rider_weather_ready",
        "days": "all",
        "start": "07:00",
        "end": "20:00",
        "preferred_minute": 40,
        "requires_weather": True,
        "title": "Rainy day rides in {city}",
        "body": "If the weather turns, book a comfortable NexRyde from {area}.",
        "action": "open_booking",
        "delivery_window": "weather",
    },
    {
        "id": "rider_promo",
        "role": "rider",
        "kind": "rider_promo",
        "days": "all",
        "start": "10:00",
        "end": "18:00",
        "preferred_minute": 50,
        "requires_promo": True,
        "title": "NexRyde offer near {area}",
        "body": "Open NexRyde to check available ride offers in {city}.",
        "action": "open_booking",
        "delivery_window": "promo",
    },
    {
        "id": "rider_driver_availability",
        "role": "rider",
        "kind": "rider_driver_availability",
        "priority": "normal",
        "days": "all",
        "start": "07:00",
        "end": "21:30",
        "preferred_minute": 35,
        "requires_driver_availability": True,
        "title": "More drivers are online near {area}",
        "body": "Driver availability is stronger now. Book when you are ready.",
        "action": "open_booking",
        "delivery_window": "availability",
    },
    {
        "id": "rider_book_before_demand_rises",
        "role": "rider",
        "kind": "rider_book_before_demand_rises",
        "priority": "low",
        "days": "all",
        "start": "07:00",
        "end": "21:30",
        "preferred_minute": 5,
        "requires_rising_demand": True,
        "title": "Demand is increasing around {city}",
        "body": "Consider booking early if you plan to travel soon.",
        "action": "open_booking",
        "delivery_window": "rising_demand",
    },
]

COPY_VARIANTS: dict[str, list[dict[str, str]]] = {
    "driver_morning_rush": [
        {"title": "Good morning", "body": "Morning rush has started in {area}. Go online and start earning."},
        {"title": "Riders are requesting trips", "body": "Riders are already requesting trips near {area}."},
        {"title": "Your work zone is becoming busy", "body": "Go online now."},
        {"title": "Start your day with NexRyde", "body": "Catch early commuters near {area}."},
    ],
    "driver_midday_reminder": [
        {"title": "Lunch hour demand", "body": "Lunch hour demand is increasing near {area}."},
        {"title": "More riders nearby", "body": "More riders are requesting trips around your location."},
        {"title": "Midday requests", "body": "Go online and catch midday requests."},
        {"title": "Demand is increasing", "body": "Demand is increasing in {city}."},
    ],
    "driver_evening_rush": [
        {"title": "Evening rush has started", "body": "Office workers are heading home near {area}."},
        {"title": "Peak demand is live", "body": "Peak demand is live in {area}."},
        {"title": "Busy earning period", "body": "This is one of today's busiest earning periods."},
        {"title": "Evening demand near {area}", "body": "Go online for homebound riders in {city}."},
    ],
    "driver_weekend_demand": [
        {"title": "Weekend demand around {city}", "body": "Events, errands, and family trips are active today."},
        {"title": "Saturday movement is starting", "body": "Go online in {area} and catch weekend rides."},
        {"title": "Weekend riders need drivers", "body": "Be available around {city} for shopping, visits, and outings."},
        {"title": "Your weekend earnings window", "body": "Trips are opening across {area}. Go online when ready."},
    ],
    "driver_offline_reminder": [
        {"title": "Go online reminder", "body": "Turn on driver mode when you are available near {area}."},
        {"title": "Riders may be waiting", "body": "Go online to start receiving trip requests in {city}."},
        {"title": "Ready to earn?", "body": "Open NexRyde Driver and start earning today."},
    ],
    "peak_demand_reminder": [
        {"title": "Peak demand near {area}", "body": "This is one of today's busiest earning periods."},
        {"title": "Evening rush is live", "body": "Go online now around {city}."},
        {"title": "Peak earning window", "body": "Office workers are heading home near {area}."},
    ],
    "driver_nearby_ride_opportunity": [
        {"title": "Ride opportunity near {area}", "body": "A rider may need a driver nearby. Go online to be considered."},
        {"title": "Nearby rider activity detected", "body": "Open driver mode now if you can accept trips."},
        {"title": "Request activity around {area}", "body": "You are close enough to compete for nearby rides."},
        {"title": "Potential trip nearby", "body": "Go online now to be visible to riders around {city}."},
    ],
    "driver_online_high_demand": [
        {"title": "High demand near your location", "body": "{pending_near} active request signals are nearby. Stay online while demand remains strong."},
        {"title": "Rider demand remains strong", "body": "You are online near {area}, where current request pressure is elevated."},
        {"title": "Demand is active around {area}", "body": "Stay online. Nearby rider activity is backed by live trip requests."},
        {"title": "Keep driving near {area}", "body": "Current demand is above the safe threshold for an online-driver nudge."},
    ],
    "driver_online_move_to_demand": [
        {"title": "Move toward {demand_area}", "body": "Live requests show stronger demand there than your current area."},
        {"title": "{demand_area} is heating up", "body": "Open the heatmap before moving. Demand is based on active ride requests."},
        {"title": "Nearby demand cluster: {demand_area}", "body": "Consider repositioning only if it fits your route."},
        {"title": "Demand is increasing in {demand_area}", "body": "The backend is seeing active pickup requests near that area."},
    ],
    "rider_morning_commute": [
        {"title": "Good morning", "body": "Book your ride with NexRyde."},
        {"title": "Avoid morning traffic", "body": "Request a ride now."},
        {"title": "Your driver is nearby", "body": "Your driver is only a few taps away."},
        {"title": "Morning commute", "body": "Book a comfortable ride from {area}."},
    ],
    "rider_afternoon_ride": [
        {"title": "Going out for lunch?", "body": "Book a NexRyde in seconds."},
        {"title": "Need to move around today?", "body": "Reliable rides are available nearby."},
        {"title": "Afternoon ride", "body": "Ride comfortably this afternoon with NexRyde."},
        {"title": "Lunchtime trip?", "body": "Open NexRyde and request a driver near {area}."},
    ],
    "rider_evening_ride": [
        {"title": "Heading home?", "body": "Book your ride now."},
        {"title": "Beat the evening rush", "body": "Beat the evening rush with NexRyde."},
        {"title": "Safe evening rides", "body": "Safe evening rides are waiting."},
        {"title": "Evening movement", "body": "Request a ride home from {area}."},
    ],
    "rider_weekend_travel": [
        {"title": "Weekend plans?", "body": "Travel comfortably with NexRyde."},
        {"title": "Going out tonight?", "body": "Book a safe ride now."},
        {"title": "Weekend travel", "body": "Request a ride for outings, visits, or errands."},
        {"title": "Move around {city}", "body": "Book a reliable NexRyde in seconds."},
    ],
    "rider_inactive_reminder": [
        {"title": "We miss you on NexRyde", "body": "Reliable rides are available near {area}."},
        {"title": "Ready when you are", "body": "Book a comfortable ride across {city}."},
        {"title": "It has been a while", "body": "Open NexRyde and book your next ride."},
    ],
    "complete_first_ride": [
        {"title": "Complete your first NexRyde", "body": "Your first ride is a few taps away."},
        {"title": "Start with NexRyde", "body": "Book from {area} and ride comfortably."},
    ],
    "saved_places_reminder": [
        {"title": "Saved places make booking faster", "body": "Add Home and Work for one-tap rides."},
        {"title": "Save your frequent places", "body": "Book faster from {area} next time."},
    ],
    "rider_weather_ready": [
        {"title": "Rainy day rides in {city}", "body": "If the weather turns, book a comfortable NexRyde from {area}."},
        {"title": "Do not get caught in the rain", "body": "NexRyde is ready when the weather changes."},
        {"title": "Weather may slow movement", "body": "Book ahead and travel comfortably."},
        {"title": "Rain-ready rides near {area}", "body": "Open NexRyde when you need a dry, reliable trip."},
    ],
    "rider_promo": [
        {"title": "NexRyde offer near {area}", "body": "Open NexRyde to check available ride offers in {city}."},
        {"title": "It has been a while", "body": "Open NexRyde and book your next ride."},
        {"title": "Your next trip is one tap away", "body": "Come back and ride with NexRyde."},
        {"title": "Trusted rides are ready", "body": "Open NexRyde when you need to move around {city}."},
    ],
    "rider_driver_availability": [
        {"title": "More drivers are online near {area}", "body": "{online_drivers_near} drivers are currently available nearby."},
        {"title": "Driver availability improved near {area}", "body": "There are more online drivers nearby than the previous snapshot."},
        {"title": "Shorter wait conditions near {area}", "body": "Driver supply is currently healthy based on live online-driver data."},
        {"title": "Good time to book in {city}", "body": "Driver availability is stronger near your area right now."},
    ],
    "rider_book_before_demand_rises": [
        {"title": "Demand is increasing around {city}", "body": "Consider booking early if you plan to travel soon."},
        {"title": "Ride requests are building near {area}", "body": "Book ahead if you want to move soon."},
        {"title": "More riders are requesting trips", "body": "Demand signals are rising around {city}."},
        {"title": "Plan your ride early", "body": "Current request activity near {area} is increasing."},
    ],
}


def _normalize_variant(rule_id: str, idx: int, raw: dict[str, Any]) -> dict[str, str]:
    return {
        "id": str(raw.get("id") or f"{rule_id}_v{idx + 1}"),
        "title": str(raw.get("title") or "NexRyde"),
        "body": str(raw.get("body") or ""),
    }


def _variants_for_rule(rule: dict[str, Any]) -> list[dict[str, str]]:
    rule_id = str(rule.get("id") or rule.get("kind") or "engagement")
    raw_variants = rule.get("variants")
    if isinstance(raw_variants, list) and raw_variants:
        return [
            _normalize_variant(rule_id, idx, v)
            for idx, v in enumerate(raw_variants)
            if isinstance(v, dict) and (v.get("title") or v.get("body"))
        ]
    return [
        _normalize_variant(rule_id, idx, v)
        for idx, v in enumerate(COPY_VARIANTS.get(rule_id) or [])
    ] or [
        _normalize_variant(
            rule_id,
            0,
            {"title": str(rule.get("title") or "NexRyde"), "body": str(rule.get("body") or "")},
        )
    ]


def _rule_with_variants(rule: dict[str, Any]) -> dict[str, Any]:
    return {**rule, "variants": _variants_for_rule(rule)}


DEFAULT_RULES = [_rule_with_variants(rule) for rule in DEFAULT_RULES]


def _parse_hhmm(value: str) -> time:
    hour, minute = str(value).split(":", 1)
    return time(hour=int(hour), minute=int(minute))


def _user_timezone(user: dict[str, Any]) -> str:
    tz = str(user.get("timezone") or user.get("time_zone") or "").strip()
    return tz or DEFAULT_TIMEZONE


def _now_in_timezone(tz_name: str) -> datetime:
    try:
        from zoneinfo import ZoneInfo

        return datetime.now(ZoneInfo(tz_name))
    except Exception:
        from zoneinfo import ZoneInfo

        try:
            return datetime.now(ZoneInfo(DEFAULT_TIMEZONE))
        except Exception:
            return datetime.now(timezone.utc)


def _days_match(rule_days: Any, local_now: datetime) -> bool:
    days = rule_days if isinstance(rule_days, list) else str(rule_days or "all")
    weekday = local_now.weekday()
    if days == "all":
        return True
    if days == "weekday":
        return weekday < 5
    if days == "weekend":
        return weekday >= 5
    if isinstance(days, list):
        return weekday in {int(d) for d in days if str(d).isdigit()}
    return True


def _in_slot_window(rule: dict[str, Any], local_now: datetime) -> bool:
    if not _days_match(rule.get("days"), local_now):
        return False
    try:
        start = _parse_hhmm(str(rule.get("start") or "00:00"))
        end = _parse_hhmm(str(rule.get("end") or "23:59"))
    except Exception:
        logger.warning("Skipping invalid engagement rule time: %s", rule.get("id") or rule.get("kind"))
        return False
    now_t = local_now.time()
    if not (start <= now_t <= end):
        return False
    preferred_minute = int(rule.get("preferred_minute", 0))
    return abs(local_now.minute - preferred_minute) <= WINDOW_MINUTES


def _priority(rule: dict[str, Any]) -> str:
    p = str(rule.get("priority") or "normal").strip().lower()
    return p if p in {"critical", "high", "normal", "low"} else "normal"


def _priority_channel(priority: str, role: str) -> str:
    if priority == "critical":
        return "engagement_critical"
    if priority == "high":
        return "engagement_high"
    if priority == "low":
        return "engagement_low"
    return "earnings" if role == "driver" else "marketing"


def _priority_actions(rule: dict[str, Any], role: str) -> list[dict[str, str]]:
    action = str(rule.get("action") or "")
    if action == "view_heatmap":
        return [{"id": "view_heatmap", "title": "View Heatmap", "route": "/driver/heatmap"}]
    if action == "open_driver_home" or role == "driver":
        return [{"id": "go_online", "title": "Go Online", "route": "/(driver-tabs)/driver-home"}]
    if action == "open_booking" or role == "rider":
        return [{"id": "book_ride", "title": "Book Ride", "route": "/rider/book"}]
    return [{"id": "open_app", "title": "Open NexRyde", "route": "/"}]


def _is_quiet_hour(local_now: datetime) -> bool:
    hour = local_now.hour
    if QUIET_HOURS_START < QUIET_HOURS_END:
        return QUIET_HOURS_START <= hour < QUIET_HOURS_END
    return hour >= QUIET_HOURS_START or hour < QUIET_HOURS_END


def _area_key(lat: Optional[float], lng: Optional[float], city: str) -> str:
    if isinstance(lat, (int, float)) and isinstance(lng, (int, float)):
        return f"{round(float(lat), 2):.2f},{round(float(lng), 2):.2f}"
    return f"city:{(city or 'unknown').strip().lower()}"


def _channels_allow(user: dict[str, Any], role: str) -> bool:
    if user.get("notifications_enabled", True) is False:
        return False
    channels = user.get("notification_channels") if isinstance(user.get("notification_channels"), dict) else {}
    if channels.get("push", True) is False:
        return False
    types = user.get("notification_types") if isinstance(user.get("notification_types"), dict) else {}
    if types.get("engagement", True) is False:
        return False
    if types.get("promotions", True) is False and role == "rider":
        return False
    if types.get("driver_engagement", True) is False and role == "driver":
        return False
    if types.get("rider_engagement", True) is False and role == "rider":
        return False
    return True


async def _load_rules() -> list[dict[str, Any]]:
    config = await db.engagement_notification_config.find_one({"id": "active"})
    if config and isinstance(config.get("rules"), list):
        return [
            _rule_with_variants(r)
            for r in config["rules"]
            if isinstance(r, dict) and r.get("enabled", True) is not False
        ]
    raw = os.getenv("ENGAGEMENT_RULES_JSON", "").strip()
    if raw:
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                return [
                    _rule_with_variants(r)
                    for r in parsed
                    if isinstance(r, dict) and r.get("enabled", True) is not False
                ]
        except Exception as exc:
            logger.warning("ENGAGEMENT_RULES_JSON invalid, using defaults: %s", exc)
    return list(DEFAULT_RULES)


async def _last_location(user_id: str, role: str) -> tuple[Optional[float], Optional[float]]:
    if role == "driver":
        doc = await db.driver_profiles.find_one(
            {"user_id": user_id},
            {"_id": 0, "current_location": 1},
        )
        loc = (doc or {}).get("current_location") or {}
        return loc.get("lat"), loc.get("lng")

    trip = await db.trips.find_one(
        {"rider_id": user_id, "status": {"$in": ["completed", "active", "driver_assigned"]}},
        {"_id": 0, "pickup_location": 1},
        sort=[("created_at", -1)],
    )
    if trip:
        pickup = trip.get("pickup_location") or {}
        return pickup.get("lat") or pickup.get("latitude"), pickup.get("lng") or pickup.get("longitude")
    return None, None


async def _driver_profile(user_id: str) -> dict[str, Any]:
    return await db.driver_profiles.find_one(
        {"user_id": user_id},
        {
            "_id": 0,
            "is_online": 1,
            "work_zone_label": 1,
            "work_zone_zones": 1,
            "current_location": 1,
        },
    ) or {}


async def _rider_recent_trip(user_id: str, now_utc: datetime) -> bool:
    cutoff = now_utc - timedelta(hours=RIDER_RECENT_TRIP_SUPPRESSION_HOURS)
    trip = await db.trips.find_one(
        {
            "rider_id": user_id,
            "status": "completed",
            "$or": [
                {"completed_at": {"$gte": cutoff}},
                {"completed_at": {"$gte": cutoff.isoformat()}},
                {"updated_at": {"$gte": cutoff.isoformat()}},
                {"created_at": {"$gte": cutoff.isoformat()}},
            ],
        },
        {"_id": 1},
    )
    return trip is not None


async def _daily_send_count(user_id: str, day_key: str) -> int:
    return await db.engagement_notification_log.count_documents(
        {"user_id": user_id, "day": day_key, "delivery_status": "sent"}
    )


def _parse_dt(value: Any) -> Optional[datetime]:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, str) and value:
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
        except Exception:
            return None
    return None


async def _last_successful_engagement(user_id: str) -> Optional[dict[str, Any]]:
    return await db.engagement_notification_log.find_one(
        {"user_id": user_id, "delivery_status": "sent"},
        {"_id": 0, "sent_at": 1, "created_at": 1, "notification_type": 1, "variant_id": 1},
        sort=[("sent_at", -1), ("created_at", -1)],
    )


async def _recent_variant_ids(user_id: str, slot_id: str) -> set[str]:
    cutoff = datetime.now(timezone.utc) - timedelta(days=VARIANT_HISTORY_DAYS)
    rows = await db.engagement_notification_log.find(
        {
            "user_id": user_id,
            "slot_id": slot_id,
            "delivery_status": "sent",
            "$or": [{"sent_at": {"$gte": cutoff.isoformat()}}, {"created_at": {"$gte": cutoff}}],
        },
        {"_id": 0, "variant_id": 1},
    ).sort("sent_at", -1).limit(20).to_list(20)
    return {str(r.get("variant_id")) for r in rows if r.get("variant_id")}


async def _rider_trip_history(user_id: str, now_utc: datetime) -> dict[str, Any]:
    count = await db.trips.count_documents({"rider_id": user_id, "status": "completed"})
    last = await db.trips.find_one(
        {"rider_id": user_id, "status": "completed"},
        {"_id": 0, "completed_at": 1, "updated_at": 1, "created_at": 1},
        sort=[("created_at", -1)],
    )
    last_at = _parse_dt((last or {}).get("completed_at")) or _parse_dt((last or {}).get("updated_at")) or _parse_dt((last or {}).get("created_at"))
    days = None
    if last_at:
        days = max(0, int((now_utc - last_at.astimezone(timezone.utc)).total_seconds() // 86400))
    return {"trip_count": count, "last_trip_days": days}


async def _activity_pattern_allows(user_id: str, local_now: datetime, priority: str) -> bool:
    if priority in {"critical", "high"}:
        return True
    rows = await db.engagement_notification_log.find(
        {"user_id": user_id, "opened_at": {"$exists": True}},
        {"_id": 0, "opened_at": 1},
    ).sort("opened_at", -1).limit(20).to_list(20)
    hours: list[int] = []
    for row in rows:
        opened = _parse_dt(row.get("opened_at"))
        if opened:
            try:
                hours.append(opened.astimezone(local_now.tzinfo).hour if local_now.tzinfo else opened.hour)
            except Exception:
                hours.append(opened.hour)
    if len(hours) < 3:
        return True
    now_hour = local_now.hour
    return any(min((now_hour - h) % 24, (h - now_hour) % 24) <= 3 for h in hours)


async def _nearby_request_exists(driver_profile: dict[str, Any]) -> bool:
    loc = driver_profile.get("current_location") or {}
    lat = loc.get("lat")
    lng = loc.get("lng")
    if not isinstance(lat, (int, float)) or not isinstance(lng, (int, float)):
        return False
    since = datetime.now(timezone.utc) - timedelta(minutes=20)
    trips = await db.trips.find(
        {
            "status": {"$in": ["requested", "searching", "pending"]},
            "$or": [{"created_at": {"$gte": since}}, {"created_at": {"$gte": since.isoformat()}}],
        },
        {"_id": 0, "pickup_location": 1},
    ).sort("created_at", -1).limit(50).to_list(50)
    try:
        from work_zone_service import distance_m
    except Exception:
        return bool(trips)

    for trip in trips:
        pickup = trip.get("pickup_location") or {}
        plat = pickup.get("lat") or pickup.get("latitude")
        plng = pickup.get("lng") or pickup.get("longitude")
        if isinstance(plat, (int, float)) and isinstance(plng, (int, float)):
            if distance_m(float(lat), float(lng), float(plat), float(plng)) <= 5000:
                return True
    return False


async def _demand_snapshot(
    lat: Optional[float],
    lng: Optional[float],
    city: str,
    *,
    radius_km: float = DEMAND_RADIUS_KM,
) -> dict[str, Any]:
    if not isinstance(lat, (int, float)) or not isinstance(lng, (int, float)):
        return {
            "has_location": False,
            "pending_near": 0,
            "online_drivers_near": 0,
            "demand_ratio": 0.0,
            "demand_area": city or "your area",
            "area_key": _area_key(lat, lng, city),
        }

    from surge_demand import haversine_km, trip_pickup_coords

    since = datetime.utcnow() - timedelta(minutes=45)
    trips = await db.trips.find(
        {
            "status": {"$in": ["pending", "pending_driver_offers", "requested", "searching"]},
            "$or": [{"created_at": {"$gte": since}}, {"created_at": {"$gte": since.isoformat()}}],
        },
        {"pickup_lat": 1, "pickup_lng": 1, "pickup_location": 1},
    ).sort("created_at", -1).limit(500).to_list(500)

    pending_near = 0
    top_pickup: tuple[Optional[float], Optional[float]] = (None, None)
    closest_km = 9999.0
    for trip in trips:
        plat, plng = trip_pickup_coords(trip)
        if plat is None or plng is None:
            continue
        dist = haversine_km(float(lat), float(lng), float(plat), float(plng))
        if dist <= radius_km:
            pending_near += 1
            if dist < closest_km:
                closest_km = dist
                top_pickup = (plat, plng)

    profiles = await db.driver_profiles.find(
        {"is_online": True, "verification_status": "approved"},
        {"current_location": 1},
    ).limit(800).to_list(800)
    online_near = 0
    for profile in profiles:
        loc = profile.get("current_location") or {}
        dlat = loc.get("lat")
        dlng = loc.get("lng")
        if not isinstance(dlat, (int, float)) or not isinstance(dlng, (int, float)):
            continue
        if haversine_km(float(lat), float(lng), float(dlat), float(dlng)) <= radius_km:
            online_near += 1

    demand_ratio = round(float(pending_near) / max(1.0, float(online_near)), 3)
    dlat, dlng = top_pickup
    demand_area = city or "your area"
    if dlat is not None and dlng is not None:
        try:
            demand_area = resolve_area(dlat, dlng).area or demand_area
        except Exception:
            pass

    return {
        "has_location": True,
        "pending_near": pending_near,
        "online_drivers_near": online_near,
        "demand_ratio": demand_ratio,
        "demand_area": demand_area,
        "area_key": _area_key(float(lat), float(lng), city),
    }


async def _previous_area_snapshot(area_key: str) -> Optional[dict[str, Any]]:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=6)
    return await db.engagement_area_metric_snapshots.find_one(
        {
            "area_key": area_key,
            "created_at": {"$gte": cutoff},
        },
        {"_id": 0},
        sort=[("created_at", -1)],
    )


async def _record_area_snapshot(area_key: str, role: str, snapshot: dict[str, Any], now_utc: datetime) -> None:
    try:
        await db.engagement_area_metric_snapshots.insert_one(
            {
                "area_key": area_key,
                "role": role,
                "pending_near": int(snapshot.get("pending_near") or 0),
                "online_drivers_near": int(snapshot.get("online_drivers_near") or 0),
                "demand_ratio": float(snapshot.get("demand_ratio") or 0),
                "created_at": now_utc,
                "expires_at": now_utc + timedelta(days=2),
            }
        )
    except Exception:
        logger.debug("engagement area metric snapshot skipped", exc_info=True)


async def tick_engagement_learning_attribution() -> int:
    """Attribute downstream behavior to recent engagement notifications using real state changes."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    rows = await db.engagement_notification_log.find(
        {
            "delivery_status": "sent",
            "learning_attributed_at": {"$exists": False},
            "$or": [{"sent_at": {"$gte": cutoff.isoformat()}}, {"created_at": {"$gte": cutoff}}],
        },
        {
            "_id": 0,
            "id": 1,
            "user_id": 1,
            "role": 1,
            "sent_at": 1,
            "created_at": 1,
            "opened_at": 1,
            "notification_type": 1,
            "variant_id": 1,
        },
    ).limit(500).to_list(500)
    updated = 0
    now_iso = datetime.now(timezone.utc).isoformat()
    for row in rows:
        user_id = str(row.get("user_id") or "")
        sent_at = _parse_dt(row.get("sent_at")) or _parse_dt(row.get("created_at"))
        if not user_id or not sent_at:
            continue
        sent_utc = sent_at.astimezone(timezone.utc)
        outcome: dict[str, Any] = {
            "opened": bool(row.get("opened_at")),
            "dismissed": False,
            "dismiss_tracking_supported": False,
        }
        if row.get("role") == "driver":
            profile = await db.driver_profiles.find_one(
                {"user_id": user_id},
                {"_id": 0, "went_online_at": 1, "online_session_started_at": 1},
            ) or {}
            online_at = _parse_dt(profile.get("went_online_at")) or _parse_dt(profile.get("online_session_started_at"))
            outcome["driver_went_online_after_notification"] = bool(online_at and online_at.astimezone(timezone.utc) >= sent_utc)
        trip = await db.trips.find_one(
            {
                "status": {"$in": ["ongoing", "completed"]},
                "$and": [
                    {"$or": [{"rider_id": user_id}, {"driver_id": user_id}]},
                    {
                        "$or": [
                            {"started_at": {"$gte": sent_utc.isoformat()}},
                            {"created_at": {"$gte": sent_utc.isoformat()}},
                        ]
                    },
                ],
            },
            {"_id": 0, "id": 1, "started_at": 1, "created_at": 1},
            sort=[("created_at", 1)],
        )
        outcome["trip_started_after_notification"] = bool(trip)
        if trip:
            outcome["attributed_trip_id"] = trip.get("id")
        res = await db.engagement_notification_log.update_one(
            {"id": row.get("id")},
            {"$set": {"learning": outcome, "learning_attributed_at": now_iso}},
        )
        if res.modified_count:
            updated += 1
    return updated


def _first_work_zone_label(profile: dict[str, Any]) -> str:
    label = str(profile.get("work_zone_label") or "").strip()
    if label:
        return label
    zones = profile.get("work_zone_zones") if isinstance(profile.get("work_zone_zones"), list) else []
    for zone in zones:
        if isinstance(zone, dict) and zone.get("label"):
            return str(zone["label"])
    return ""


def _format_copy(template: str, meta: dict[str, Any]) -> str:
    values = {
        "first_name": meta.get("first_name") or "",
        "area": meta.get("area") or "your area",
        "city": meta.get("city") or "your city",
        "work_zone": meta.get("work_zone") or meta.get("area") or "your area",
        "local_time": meta.get("local_time") or "",
        "day_of_week": meta.get("day_of_week") or "",
        "driver_status": meta.get("driver_status") or "offline",
        "trip_count": str(meta.get("trip_count") or 0),
        "last_trip_days": str(meta.get("last_trip_days") if meta.get("last_trip_days") is not None else "a few"),
        "pending_near": str(meta.get("pending_near") or 0),
        "online_drivers_near": str(meta.get("online_drivers_near") or 0),
        "demand_ratio": str(meta.get("demand_ratio") or 0),
        "demand_area": meta.get("demand_area") or meta.get("area") or "your area",
    }
    try:
        return template.format(**values).strip()
    except Exception:
        return template


async def _copy_for_rule(user_id: str, rule: dict[str, Any], meta: dict[str, Any]) -> dict[str, Any]:
    slot_id = str(rule.get("id") or rule.get("kind") or "")
    variants = _variants_for_rule(rule)
    experiment_key = str(rule.get("experiment_key") or os.getenv("ENGAGEMENT_AB_EXPERIMENT_KEY") or "").strip()
    if experiment_key and len(variants) > 1:
        from notification_service import assign_ab_variant

        selected_id = assign_ab_variant(user_id, experiment_key, [v["id"] for v in variants])
        selected = next((v for v in variants if v["id"] == selected_id), variants[0])
        return {**selected, "experiment_key": experiment_key, "ab_variant": selected["id"], "selection_strategy": "ab"}

    used = await _recent_variant_ids(user_id, slot_id)
    pool = [v for v in variants if v["id"] not in used] or variants
    selected = _RANDOM.choice(pool)
    return {**selected, "experiment_key": None, "ab_variant": None, "selection_strategy": "random_no_recent_repeat"}


async def _eligible(
    user: dict[str, Any],
    rule: dict[str, Any],
    local_now: datetime,
    now_utc: datetime,
) -> tuple[bool, dict[str, Any]]:
    role = str(rule.get("role") or user.get("role") or "")
    user_id = str(user.get("id") or "")
    day_key = local_now.strftime("%Y-%m-%d")
    priority = _priority(rule)

    if priority != "critical" and _is_quiet_hour(local_now):
        return False, {"reason": "quiet_hours"}
    if not await _activity_pattern_allows(user_id, local_now, priority):
        return False, {"reason": "outside_user_activity_pattern"}

    if not _channels_allow(user, role):
        return False, {"reason": "preferences_disabled"}
    if await _daily_send_count(user_id, day_key) >= MAX_DAILY_ENGAGEMENT_PUSHES:
        return False, {"reason": "daily_cap"}
    last_send = await _last_successful_engagement(user_id)
    last_send_at = _parse_dt((last_send or {}).get("sent_at")) or _parse_dt((last_send or {}).get("created_at"))
    if last_send_at:
        elapsed_hours = (now_utc - last_send_at.astimezone(timezone.utc)).total_seconds() / 3600
        if elapsed_hours < MIN_HOURS_BETWEEN_ENGAGEMENT_PUSHES:
            return False, {"reason": "min_interval"}

    profile: dict[str, Any] = {}
    driver_status = "offline"
    trip_history: dict[str, Any] = {"trip_count": 0, "last_trip_days": None}
    if role == "driver":
        profile = await _driver_profile(user_id)
        driver_status = "online" if profile.get("is_online") is True else "offline"
        if rule.get("requires_driver_online") and profile.get("is_online") is not True:
            return False, {"reason": "driver_not_online"}
        if rule.get("suppress_when_online", True) is not False and not rule.get("requires_driver_online") and profile.get("is_online") is True:
            return False, {"reason": "driver_online"}
        if rule.get("requires_nearby_request") and not await _nearby_request_exists(profile):
            return False, {"reason": "no_nearby_request"}
    elif role == "rider":
        trip_history = await _rider_trip_history(user_id, now_utc)
        if await _rider_recent_trip(user_id, now_utc):
            return False, {"reason": "recent_trip"}
        if rule.get("requires_weather") and os.getenv("ENGAGEMENT_WEATHER_ENABLED", "").lower() not in ("1", "true", "yes"):
            return False, {"reason": "weather_disabled"}
        if rule.get("requires_promo") and os.getenv("ENGAGEMENT_PROMO_ENABLED", "").lower() not in ("1", "true", "yes"):
            return False, {"reason": "promo_disabled"}

    lat, lng = await _last_location(user_id, role)
    area_info = resolve_area(lat, lng)
    city = str(user.get("city") or area_info.city or "your city")
    work_zone = _first_work_zone_label(profile) if role == "driver" else ""
    area = work_zone if role == "driver" else ""
    area = area or area_info.area or city
    name = str(user.get("name") or user.get("first_name") or "").strip()
    first_name = name.split()[0] if name else ""
    snapshot = await _demand_snapshot(lat, lng, city)
    if rule.get("requires_demand_snapshot"):
        min_pending = int(rule.get("min_pending_near") or MIN_PENDING_FOR_DEMAND_PUSH)
        min_ratio = float(rule.get("min_demand_ratio") or 0.35)
        if not snapshot.get("has_location"):
            return False, {"reason": "missing_location"}
        if int(snapshot.get("pending_near") or 0) < min_pending:
            return False, {"reason": "insufficient_pending_demand"}
        if float(snapshot.get("demand_ratio") or 0) < min_ratio:
            return False, {"reason": "weak_demand_ratio"}
    if rule.get("requires_top_demand_area") and not snapshot.get("demand_area"):
        return False, {"reason": "no_demand_area"}
    if rule.get("requires_driver_availability"):
        previous = await _previous_area_snapshot(str(snapshot.get("area_key") or ""))
        current_online = int(snapshot.get("online_drivers_near") or 0)
        previous_online = int((previous or {}).get("online_drivers_near") or 0)
        if current_online < MIN_ONLINE_DRIVERS_FOR_RIDER_AVAILABILITY:
            return False, {"reason": "insufficient_driver_availability"}
        if previous and current_online < max(previous_online + 1, int(previous_online * 1.2)):
            return False, {"reason": "availability_not_improved"}
    if rule.get("requires_rising_demand"):
        previous = await _previous_area_snapshot(str(snapshot.get("area_key") or ""))
        current_pending = int(snapshot.get("pending_near") or 0)
        previous_pending = int((previous or {}).get("pending_near") or 0)
        if not previous or current_pending < max(MIN_PENDING_FOR_DEMAND_PUSH, previous_pending + 1):
            return False, {"reason": "demand_not_rising"}

    await _record_area_snapshot(str(snapshot.get("area_key") or ""), role, snapshot, now_utc)

    return True, {
        "city": city,
        "area": area,
        "work_zone": work_zone or area,
        "day": day_key,
        "timezone": _user_timezone(user),
        "first_name": first_name,
        "local_time": local_now.strftime("%I:%M %p").lstrip("0"),
        "day_of_week": local_now.strftime("%A"),
        "driver_status": driver_status,
        "trip_count": trip_history.get("trip_count") or 0,
        "last_trip_days": trip_history.get("last_trip_days"),
        "pending_near": snapshot.get("pending_near") or 0,
        "online_drivers_near": snapshot.get("online_drivers_near") or 0,
        "demand_ratio": snapshot.get("demand_ratio") or 0,
        "demand_area": snapshot.get("demand_area") or area,
        "area_key": snapshot.get("area_key"),
        "priority": priority,
    }


async def _send_rule_to_user(user: dict[str, Any], rule: dict[str, Any], local_now: datetime, now_utc: datetime) -> bool:
    user_id = str(user.get("id") or "")
    role = str(rule.get("role") or "")
    user_role = str(user.get("role") or "").strip().lower()
    if role and user_role and role != user_role:
        logger.info(
            "notification_decision %s",
            {
                "user_id": user_id,
                "role": user_role,
                "notification_type": rule.get("kind"),
                "audience": role,
                "template": rule.get("kind"),
                "delivered": False,
                "skipped_reason": "rule_role_mismatch",
                "source": "engagement",
            },
        )
        return False

    ok, meta = await _eligible(user, rule, local_now, now_utc)
    if not ok:
        logger.info(
            "notification_decision %s",
            {
                "user_id": user_id,
                "role": user_role or role,
                "notification_type": rule.get("kind"),
                "audience": role,
                "template": rule.get("kind"),
                "delivered": False,
                "skipped_reason": meta.get("reason"),
                "source": "engagement",
            },
        )
        return False

    slot_id = str(rule.get("id") or rule.get("kind") or "engagement")
    notif_type = str(rule.get("kind") or slot_id)
    priority = str(meta.get("priority") or _priority(rule))
    delivery_window = str(rule.get("delivery_window") or slot_id)
    log_id = f"{user_id}:{meta['day']}:{slot_id}"
    selected_copy = await _copy_for_rule(user_id, rule, meta)
    title = _format_copy(str(selected_copy.get("title") or "NexRyde"), meta)
    body = _format_copy(str(selected_copy.get("body") or ""), meta)
    try:
        await db.engagement_notification_log.insert_one(
            {
                "user_id": user_id,
                "id": log_id,
                "day": meta["day"],
                "slot_id": slot_id,
                "notification_type": notif_type,
                "role": role,
                "priority": priority,
                "delivery_window": delivery_window,
                "variant_id": selected_copy.get("id"),
                "selected_message": {"title": title, "body": body},
                "experiment_key": selected_copy.get("experiment_key"),
                "ab_variant": selected_copy.get("ab_variant"),
                "selection_strategy": selected_copy.get("selection_strategy"),
                "delivery_status": "queued",
                "created_at": now_utc,
            }
        )
    except DuplicateKeyError:
        logger.info(
            "notification_decision %s",
            {
                "user_id": user_id,
                "role": role,
                "notification_type": notif_type,
                "audience": role,
                "template": notif_type,
                "delivered": False,
                "skipped_reason": "duplicate_engagement_slot",
                "source": "engagement",
            },
        )
        return False

    data = {
        "type": notif_type,
        "slot": slot_id,
        "time_slot": slot_id,
        "local_date": meta["day"],
        "delivery_window": delivery_window,
        "role": role,
        "variant_id": selected_copy.get("id"),
        "experiment_key": selected_copy.get("experiment_key"),
        "ab_variant": selected_copy.get("ab_variant"),
        "nid": log_id,
        "engagement_id": log_id,
        "priority": priority,
        "action": str(rule.get("action") or ("open_driver_home" if role == "driver" else "open_booking")),
        "category_id": "engagement_driver" if role == "driver" else "engagement_rider",
        "screen": "/(driver-tabs)/driver-home" if role == "driver" else "/rider/book",
        "deep_link": "/driver/heatmap" if str(rule.get("action")) == "view_heatmap" else ("/rider/book" if role == "rider" else "/(driver-tabs)/driver-home"),
        "rich_actions": _priority_actions(rule, role),
        "area": meta["area"],
        "city": meta["city"],
        "timezone": meta["timezone"],
        "channel_id": _priority_channel(priority, role),
        "badge": "1",
    }
    sent = await send_push_notification(
        user_id,
        title,
        body,
        data,
        source="engagement",
        experiment_key=selected_copy.get("experiment_key"),
        variant=selected_copy.get("ab_variant") or selected_copy.get("id"),
    )
    status = "sent" if sent else "failed"
    await db.engagement_notification_log.update_one(
        {"user_id": user_id, "day": meta["day"], "slot_id": slot_id},
        {
            "$set": {
                "sent": bool(sent),
                "delivery_status": status,
                "sent_at": now_utc.isoformat(),
                "delivered_at": now_utc.isoformat() if sent else None,
                "title": title,
                "body": body[:240],
                "selected_message": {"title": title, "body": body},
                "type": notif_type,
                "priority": priority,
                "delivery_path": "fcm_or_expo_push",
                "personalization": {
                    "city": meta.get("city"),
                    "area": meta.get("area"),
                    "work_zone": meta.get("work_zone"),
                    "timezone": meta.get("timezone"),
                    "local_time": meta.get("local_time"),
                    "day_of_week": meta.get("day_of_week"),
                    "driver_status": meta.get("driver_status"),
                    "trip_count": meta.get("trip_count"),
                    "last_trip_days": meta.get("last_trip_days"),
                    "pending_near": meta.get("pending_near"),
                    "online_drivers_near": meta.get("online_drivers_near"),
                    "demand_ratio": meta.get("demand_ratio"),
                    "demand_area": meta.get("demand_area"),
                    "area_key": meta.get("area_key"),
                    "first_name_present": bool(meta.get("first_name")),
                },
            }
        },
    )
    if sent:
        await db.users.update_one(
            {"id": user_id},
            {
                "$set": {
                    "engagement_last_notification_at": now_utc.isoformat(),
                    "engagement_last_notification_type": notif_type,
                    "engagement_last_notification_variant_id": selected_copy.get("id"),
                }
            },
        )
    return bool(sent)


async def tick_engagement_pushes() -> int:
    """Run due engagement rules. Called every 5 minutes by the backend loop."""
    from notification_delivery_ledger import acquire_scheduler_lock, engagement_tick_lock_id

    if not await acquire_scheduler_lock(engagement_tick_lock_id(), hold_seconds=280):
        logger.info("engagement tick skipped — another instance holds the scheduler lock")
        return 0

    try:
        await tick_engagement_learning_attribution()
    except Exception:
        logger.debug("engagement learning attribution skipped", exc_info=True)
    rules = await _load_rules()
    if not rules:
        return 0

    now_utc = datetime.now(timezone.utc)
    roles = sorted({str(r.get("role") or "") for r in rules if r.get("role")})
    if not roles:
        return 0

    user_query = {
        "role": {"$in": roles},
        "is_active": {"$ne": False},
        "$or": [
            {"push_token": {"$exists": True, "$nin": [None, ""]}},
            {"push_devices": {"$exists": True, "$not": {"$size": 0}}},
        ],
    }
    projection = {
        "_id": 0,
        "id": 1,
        "name": 1,
        "first_name": 1,
        "role": 1,
        "city": 1,
        "timezone": 1,
        "time_zone": 1,
        "notifications_enabled": 1,
        "notification_channels": 1,
        "notification_types": 1,
    }
    scan_limit = int(os.getenv("ENGAGEMENT_SCAN_LIMIT", "25000"))
    users = await db.users.find(user_query, projection).to_list(scan_limit)
    sem = asyncio.Semaphore(int(os.getenv("ENGAGEMENT_SEND_CONCURRENCY", "25")))

    async def handle_user(user: dict[str, Any]) -> int:
        role = str(user.get("role") or "")
        local_now = _now_in_timezone(_user_timezone(user))
        due_rules = [r for r in rules if str(r.get("role") or "") == role and _in_slot_window(r, local_now)]
        count = 0
        for rule in due_rules:
            async with sem:
                try:
                    if await _send_rule_to_user(user, rule, local_now, now_utc):
                        count += 1
                except Exception as exc:
                    logger.debug("Engagement push skipped uid=%s rule=%s: %s", user.get("id"), rule.get("id"), exc)
            if count >= MAX_DAILY_ENGAGEMENT_PUSHES:
                break
        return count

    results = await asyncio.gather(*(handle_user(u) for u in users), return_exceptions=True)
    sent = sum(r for r in results if isinstance(r, int))
    if sent:
        logger.info("Engagement notification tick sent=%d users_scanned=%d", sent, len(users))
    return sent

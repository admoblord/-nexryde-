"""Central registry for push notification kinds (`data.type`).

Every server-side push must use a registered kind so delivery can enforce the
intended audience before tokens are touched. Add new notification kinds here
first, then use that `data.type` from callers.
"""
from __future__ import annotations

from enum import Enum
from typing import Any, Optional

# Channels must stay aligned with frontend `notifications.ts` (setNotificationChannelAsync).
DEFAULT_ANDROID_CHANNEL = "default"


class NotificationAudience(str, Enum):
    DRIVER = "driver"
    RIDER = "rider"
    BOTH = "both"


class NotificationCategory(str, Enum):
    ADMIN = "admin"
    COMPLIANCE = "compliance"
    DRIVER_ENGAGEMENT = "driver_engagement"
    DRIVER_OPS = "driver_ops"
    EARNINGS = "earnings"
    MARKETING = "marketing"
    PAYMENTS = "payments"
    RIDER_ENGAGEMENT = "rider_engagement"
    RIDER_OPS = "rider_ops"
    RIDES = "rides"
    SAFETY = "safety"
    SECURITY = "security"
    SUBSCRIPTION = "subscription"
    SYSTEM = "system"
    WORK_ZONE = "work_zone"


def _meta(
    *,
    audience: NotificationAudience,
    category: NotificationCategory,
    channel_id: str = DEFAULT_ANDROID_CHANNEL,
    urgent: bool = False,
    sound: Optional[str] = None,
) -> dict[str, Any]:
    out: dict[str, Any] = {
        "channel_id": channel_id,
        "urgent": urgent,
        "audience": audience,
        "category": category,
    }
    if sound:
        out["sound"] = sound
    return out


NOTIFICATION_KIND_META: dict[str, dict[str, Any]] = {
    # Trip / dispatch (high visibility) — primary types used by trips.py today
    "ride_request": _meta(audience=NotificationAudience.DRIVER, category=NotificationCategory.RIDES, channel_id="driver_offers", sound="driver_offer_1.m4a", urgent=True),
    "trip_accepted": _meta(audience=NotificationAudience.RIDER, category=NotificationCategory.RIDES, channel_id="rides", urgent=True),
    "driver_arrived": _meta(audience=NotificationAudience.RIDER, category=NotificationCategory.RIDES, channel_id="rides", urgent=True),
    "trip_started": _meta(audience=NotificationAudience.BOTH, category=NotificationCategory.RIDES, channel_id="rides"),
    "trip_completed": _meta(audience=NotificationAudience.BOTH, category=NotificationCategory.RIDES, channel_id="rides"),
    "route_updated": _meta(audience=NotificationAudience.BOTH, category=NotificationCategory.RIDES, channel_id="rides"),
    # Stuck-trip recovery. Unregistered kinds are dropped before delivery, so both
    # sides used to be silently left holding a trip the watchdog had already closed.
    "trip_auto_closed": _meta(audience=NotificationAudience.BOTH, category=NotificationCategory.RIDES, channel_id="rides", urgent=True),
    "trip_auto_completed": _meta(audience=NotificationAudience.BOTH, category=NotificationCategory.RIDES, channel_id="rides", urgent=True),
    "trip_force_completed": _meta(audience=NotificationAudience.BOTH, category=NotificationCategory.RIDES, channel_id="rides", urgent=True),
    "rider_route_updated": _meta(audience=NotificationAudience.RIDER, category=NotificationCategory.RIDES, channel_id="rides"),
    # Stable aliases for ride lifecycle (same audiences; keep primary types above for backward compat)
    "searching_for_driver": _meta(audience=NotificationAudience.RIDER, category=NotificationCategory.RIDES, channel_id="rides"),
    "driver_found": _meta(audience=NotificationAudience.RIDER, category=NotificationCategory.RIDES, channel_id="rides", urgent=True),
    "driver_accepted": _meta(audience=NotificationAudience.RIDER, category=NotificationCategory.RIDES, channel_id="rides", urgent=True),
    "driver_arriving": _meta(audience=NotificationAudience.RIDER, category=NotificationCategory.RIDES, channel_id="rides", urgent=True),
    "otp_verification": _meta(audience=NotificationAudience.RIDER, category=NotificationCategory.RIDES, channel_id="rides", urgent=True),
    "payment_successful": _meta(audience=NotificationAudience.RIDER, category=NotificationCategory.PAYMENTS, channel_id="rides"),
    "driver_cancelled": _meta(audience=NotificationAudience.RIDER, category=NotificationCategory.RIDES, channel_id="rides", urgent=True),
    "fare_updated": _meta(audience=NotificationAudience.RIDER, category=NotificationCategory.RIDES, channel_id="rides"),
    "rider_cancelled": _meta(audience=NotificationAudience.DRIVER, category=NotificationCategory.RIDES, channel_id="driver_offers", urgent=True),
    "ride_accepted": _meta(audience=NotificationAudience.DRIVER, category=NotificationCategory.RIDES, channel_id="driver_offers"),
    "navigate_to_pickup": _meta(audience=NotificationAudience.DRIVER, category=NotificationCategory.RIDES, channel_id="driver_offers"),
    "rider_waiting": _meta(audience=NotificationAudience.DRIVER, category=NotificationCategory.RIDES, channel_id="driver_offers", urgent=True),
    "start_trip": _meta(audience=NotificationAudience.DRIVER, category=NotificationCategory.RIDES, channel_id="driver_offers"),
    "end_trip": _meta(audience=NotificationAudience.DRIVER, category=NotificationCategory.RIDES, channel_id="earnings"),
    "payment_received": _meta(audience=NotificationAudience.DRIVER, category=NotificationCategory.PAYMENTS, channel_id="earnings"),
    "ride_payment": _meta(audience=NotificationAudience.RIDER, category=NotificationCategory.PAYMENTS, channel_id="rides"),
    # Safety / geo
    "geo_fence_trip_lock_armed": _meta(audience=NotificationAudience.BOTH, category=NotificationCategory.SAFETY, channel_id="rides", urgent=True),
    "geo_fence_explained": _meta(audience=NotificationAudience.BOTH, category=NotificationCategory.SAFETY, channel_id="rides"),
    "geo_fence_deviation": _meta(audience=NotificationAudience.RIDER, category=NotificationCategory.SAFETY, channel_id="rides", urgent=True),
    "geo_fence_deviation_driver": _meta(audience=NotificationAudience.DRIVER, category=NotificationCategory.SAFETY, channel_id="rides", urgent=True),
    "driver_stop_reason": _meta(audience=NotificationAudience.BOTH, category=NotificationCategory.SAFETY, channel_id="rides"),
    "speed_spike_alert": _meta(audience=NotificationAudience.RIDER, category=NotificationCategory.SAFETY, channel_id="rides", urgent=True),
    "speed_spike_driver": _meta(audience=NotificationAudience.DRIVER, category=NotificationCategory.SAFETY, channel_id="rides", urgent=True),
    "gps_spoofing_alert": _meta(audience=NotificationAudience.RIDER, category=NotificationCategory.SAFETY, channel_id="rides", urgent=True),
    "gps_spoofing_driver": _meta(audience=NotificationAudience.DRIVER, category=NotificationCategory.SAFETY, channel_id="rides", urgent=True),
    "abnormal_stop": _meta(audience=NotificationAudience.BOTH, category=NotificationCategory.SAFETY, channel_id="rides", urgent=True),
    # Auto Stop Safety Check — rider "Are you safe?" / driver "why did you stop?"
    "safety_check": _meta(audience=NotificationAudience.RIDER, category=NotificationCategory.SAFETY, channel_id="rides", urgent=True),
    "stop_reason_requested": _meta(audience=NotificationAudience.DRIVER, category=NotificationCategory.SAFETY, channel_id="rides", urgent=True),
    "trip_paused": _meta(audience=NotificationAudience.RIDER, category=NotificationCategory.RIDES, channel_id="rides"),
    "safe_arrival_checkin": _meta(audience=NotificationAudience.RIDER, category=NotificationCategory.SAFETY, channel_id="rides", urgent=True),
    "shield_driver_sos": _meta(audience=NotificationAudience.DRIVER, category=NotificationCategory.SAFETY, channel_id="rides", urgent=True),
    "shield_case_created": _meta(audience=NotificationAudience.BOTH, category=NotificationCategory.SAFETY, channel_id="rides", urgent=True),
    "shield_case_responded": _meta(audience=NotificationAudience.BOTH, category=NotificationCategory.SAFETY, channel_id="rides"),
    "shield_case_resolved": _meta(audience=NotificationAudience.BOTH, category=NotificationCategory.SAFETY, channel_id="rides"),
    "invisible_shield_mode": _meta(audience=NotificationAudience.DRIVER, category=NotificationCategory.SAFETY, channel_id="rides"),
    # Subscription / compliance style (adjust copy in callers)
    "trial_ended": _meta(audience=NotificationAudience.DRIVER, category=NotificationCategory.SUBSCRIPTION, urgent=True),
    "trial_trips_low": _meta(audience=NotificationAudience.DRIVER, category=NotificationCategory.SUBSCRIPTION),
    "trial_days_low": _meta(audience=NotificationAudience.DRIVER, category=NotificationCategory.SUBSCRIPTION),
    "trial_idle_guardrail": _meta(audience=NotificationAudience.DRIVER, category=NotificationCategory.DRIVER_OPS),
    "go_online": _meta(audience=NotificationAudience.DRIVER, category=NotificationCategory.DRIVER_ENGAGEMENT),
    "subscription_expiring": _meta(audience=NotificationAudience.DRIVER, category=NotificationCategory.SUBSCRIPTION, channel_id="earnings"),
    "subscription_expired": _meta(audience=NotificationAudience.DRIVER, category=NotificationCategory.SUBSCRIPTION, channel_id="earnings", urgent=True),
    "payment_due_tomorrow": _meta(audience=NotificationAudience.DRIVER, category=NotificationCategory.PAYMENTS, channel_id="earnings", urgent=True),
    "payment_overdue": _meta(audience=NotificationAudience.DRIVER, category=NotificationCategory.PAYMENTS, channel_id="earnings", urgent=True),
    "suspension_warning": _meta(audience=NotificationAudience.DRIVER, category=NotificationCategory.PAYMENTS, channel_id="earnings", urgent=True),
    "account_suspended": _meta(audience=NotificationAudience.DRIVER, category=NotificationCategory.PAYMENTS, channel_id="earnings", urgent=True),
    "earnings_update": _meta(audience=NotificationAudience.DRIVER, category=NotificationCategory.EARNINGS, channel_id="earnings"),
    "document_grace": _meta(audience=NotificationAudience.DRIVER, category=NotificationCategory.COMPLIANCE),
    "document_expired": _meta(audience=NotificationAudience.DRIVER, category=NotificationCategory.COMPLIANCE, urgent=True),
    "document_expired_warning": _meta(audience=NotificationAudience.DRIVER, category=NotificationCategory.COMPLIANCE, urgent=True),
    "document_expiring": _meta(audience=NotificationAudience.DRIVER, category=NotificationCategory.COMPLIANCE),
    "monthly_verification_reminder": _meta(audience=NotificationAudience.DRIVER, category=NotificationCategory.COMPLIANCE),
    "vehicle_inspection_reminder": _meta(audience=NotificationAudience.DRIVER, category=NotificationCategory.COMPLIANCE),
    "driver_selfie_reminder": _meta(audience=NotificationAudience.DRIVER, category=NotificationCategory.COMPLIANCE),
    "vehicle_document_renewal": _meta(audience=NotificationAudience.DRIVER, category=NotificationCategory.COMPLIANCE),
    # Product / marketing
    "feature_update": _meta(audience=NotificationAudience.BOTH, category=NotificationCategory.SYSTEM),
    "admin_broadcast": _meta(audience=NotificationAudience.BOTH, category=NotificationCategory.ADMIN),
    "admin_message": _meta(audience=NotificationAudience.DRIVER, category=NotificationCategory.ADMIN),
    "info": _meta(audience=NotificationAudience.BOTH, category=NotificationCategory.ADMIN),
    "security_update": _meta(audience=NotificationAudience.BOTH, category=NotificationCategory.SECURITY, urgent=True),
    "account_security_alert": _meta(audience=NotificationAudience.BOTH, category=NotificationCategory.SECURITY, urgent=True),
    "password_changed": _meta(audience=NotificationAudience.BOTH, category=NotificationCategory.SECURITY, urgent=True),
    "app_update_available": _meta(audience=NotificationAudience.BOTH, category=NotificationCategory.SYSTEM),
    "new_app_version": _meta(audience=NotificationAudience.BOTH, category=NotificationCategory.SYSTEM),
    "scheduled_maintenance": _meta(audience=NotificationAudience.BOTH, category=NotificationCategory.SYSTEM),
    "terms_privacy_update": _meta(audience=NotificationAudience.BOTH, category=NotificationCategory.SYSTEM),
    # Daily time-slot reminders — Android channel `marketing` (see frontend notifications.ts)
    "daily_slot_morning": _meta(audience=NotificationAudience.RIDER, category=NotificationCategory.MARKETING, channel_id="marketing"),
    "daily_slot_lunch": _meta(audience=NotificationAudience.RIDER, category=NotificationCategory.MARKETING, channel_id="marketing"),
    "daily_slot_evening": _meta(audience=NotificationAudience.RIDER, category=NotificationCategory.MARKETING, channel_id="marketing"),
    "daily_slot_night": _meta(audience=NotificationAudience.RIDER, category=NotificationCategory.MARKETING, channel_id="marketing"),
    # Intelligent engagement notifications (engagement_push_service.py)
    "driver_morning_rush": _meta(audience=NotificationAudience.DRIVER, category=NotificationCategory.DRIVER_ENGAGEMENT, channel_id="earnings"),
    "driver_midday_reminder": _meta(audience=NotificationAudience.DRIVER, category=NotificationCategory.DRIVER_ENGAGEMENT, channel_id="earnings"),
    "driver_evening_rush": _meta(audience=NotificationAudience.DRIVER, category=NotificationCategory.DRIVER_ENGAGEMENT, channel_id="earnings"),
    "driver_weekend_demand": _meta(audience=NotificationAudience.DRIVER, category=NotificationCategory.DRIVER_ENGAGEMENT, channel_id="earnings"),
    "driver_offline_reminder": _meta(audience=NotificationAudience.DRIVER, category=NotificationCategory.DRIVER_ENGAGEMENT, channel_id="earnings"),
    "driver_nearby_ride_opportunity": _meta(audience=NotificationAudience.DRIVER, category=NotificationCategory.DRIVER_ENGAGEMENT, channel_id="engagement_high"),
    "driver_online_high_demand": _meta(audience=NotificationAudience.DRIVER, category=NotificationCategory.DRIVER_ENGAGEMENT, channel_id="engagement_high"),
    "driver_online_move_to_demand": _meta(audience=NotificationAudience.DRIVER, category=NotificationCategory.DRIVER_ENGAGEMENT, channel_id="earnings"),
    "rider_morning_commute": _meta(audience=NotificationAudience.RIDER, category=NotificationCategory.RIDER_ENGAGEMENT, channel_id="marketing"),
    "rider_afternoon_ride": _meta(audience=NotificationAudience.RIDER, category=NotificationCategory.RIDER_ENGAGEMENT, channel_id="marketing"),
    "rider_evening_ride": _meta(audience=NotificationAudience.RIDER, category=NotificationCategory.RIDER_ENGAGEMENT, channel_id="marketing"),
    "rider_weekend_travel": _meta(audience=NotificationAudience.RIDER, category=NotificationCategory.RIDER_ENGAGEMENT, channel_id="marketing"),
    "rider_weather_ready": _meta(audience=NotificationAudience.RIDER, category=NotificationCategory.RIDER_ENGAGEMENT, channel_id="marketing"),
    "rider_promo": _meta(audience=NotificationAudience.RIDER, category=NotificationCategory.MARKETING, channel_id="marketing"),
    "complete_first_ride": _meta(audience=NotificationAudience.RIDER, category=NotificationCategory.RIDER_ENGAGEMENT, channel_id="marketing"),
    "saved_places_reminder": _meta(audience=NotificationAudience.RIDER, category=NotificationCategory.RIDER_ENGAGEMENT, channel_id="marketing"),
    "book_next_ride": _meta(audience=NotificationAudience.RIDER, category=NotificationCategory.RIDER_ENGAGEMENT, channel_id="marketing"),
    "rider_inactive_reminder": _meta(audience=NotificationAudience.RIDER, category=NotificationCategory.RIDER_ENGAGEMENT, channel_id="marketing"),
    "ride_discount": _meta(audience=NotificationAudience.RIDER, category=NotificationCategory.MARKETING, channel_id="marketing"),
    "promo_offer": _meta(audience=NotificationAudience.RIDER, category=NotificationCategory.MARKETING, channel_id="marketing"),
    "rider_driver_availability": _meta(audience=NotificationAudience.RIDER, category=NotificationCategory.RIDER_ENGAGEMENT, channel_id="marketing"),
    "rider_book_before_demand_rises": _meta(audience=NotificationAudience.RIDER, category=NotificationCategory.RIDER_ENGAGEMENT, channel_id="engagement_low"),
    # Rider favourites onboarding (favorite_driver_notifications.py)
    "favorite_driver_nudge": _meta(audience=NotificationAudience.RIDER, category=NotificationCategory.RIDER_ENGAGEMENT),
    # Work Zone (optional future reminders)
    "work_zone_expiring": _meta(audience=NotificationAudience.DRIVER, category=NotificationCategory.WORK_ZONE),
    "work_zone_reminder": _meta(audience=NotificationAudience.DRIVER, category=NotificationCategory.WORK_ZONE),
    "peak_demand_reminder": _meta(audience=NotificationAudience.DRIVER, category=NotificationCategory.DRIVER_ENGAGEMENT, channel_id="earnings"),
    # Driver demand notifications created in-app by services/driver_surge_notifications.py.
    "surge_active": _meta(audience=NotificationAudience.DRIVER, category=NotificationCategory.DRIVER_ENGAGEMENT, channel_id="earnings"),
    "surge_elevated": _meta(audience=NotificationAudience.DRIVER, category=NotificationCategory.DRIVER_ENGAGEMENT, channel_id="earnings"),
    "surge_high": _meta(audience=NotificationAudience.DRIVER, category=NotificationCategory.DRIVER_ENGAGEMENT, channel_id="earnings"),
    "surge_peak_guide": _meta(audience=NotificationAudience.DRIVER, category=NotificationCategory.DRIVER_ENGAGEMENT, channel_id="earnings"),
    # Policy/enforcement notices can apply to riders or drivers.
    "enforcement_warning": _meta(audience=NotificationAudience.BOTH, category=NotificationCategory.SAFETY, urgent=True),
    "enforcement_timeout": _meta(audience=NotificationAudience.BOTH, category=NotificationCategory.SAFETY, urgent=True),
    "enforcement_booking_blocked": _meta(audience=NotificationAudience.BOTH, category=NotificationCategory.SAFETY, urgent=True),
    "enforcement_suspended": _meta(audience=NotificationAudience.BOTH, category=NotificationCategory.SAFETY, urgent=True),
    "enforcement_suspended_long": _meta(audience=NotificationAudience.BOTH, category=NotificationCategory.SAFETY, urgent=True),
    "enforcement_deactivated": _meta(audience=NotificationAudience.BOTH, category=NotificationCategory.SAFETY, urgent=True),
}


def normalize_audience(raw: Any) -> NotificationAudience:
    try:
        return raw if isinstance(raw, NotificationAudience) else NotificationAudience(str(raw).strip().lower())
    except Exception:
        return NotificationAudience.BOTH


def normalize_category(raw: Any) -> NotificationCategory:
    try:
        return raw if isinstance(raw, NotificationCategory) else NotificationCategory(str(raw).strip().lower())
    except Exception:
        return NotificationCategory.SYSTEM


def get_kind_meta(kind: Optional[str]) -> dict[str, Any]:
    t = str(kind or "").strip()
    meta = dict(NOTIFICATION_KIND_META.get(t) or {})
    if not meta:
        meta = _meta(audience=NotificationAudience.BOTH, category=NotificationCategory.SYSTEM)
        meta["unknown"] = True
    meta["audience"] = normalize_audience(meta.get("audience"))
    meta["category"] = normalize_category(meta.get("category"))
    return meta


# Categories / sources that inflate tab badges without being actionable.
BADGE_NOISY_CATEGORIES = frozenset(
    {
        NotificationCategory.DRIVER_ENGAGEMENT.value,
        NotificationCategory.RIDER_ENGAGEMENT.value,
        NotificationCategory.MARKETING.value,
        "engagement",
        "daily_slot",
    }
)
BADGE_NOISY_SOURCES = frozenset({"engagement", "daily_slot", "reconnect", "smart_surge"})


def badge_noisy_types() -> list[str]:
    """Inbox `type` values that should not count toward the tab/map badge."""
    return [
        kind
        for kind, meta in NOTIFICATION_KIND_META.items()
        if str(getattr(meta.get("category"), "value", meta.get("category")) or "")
        in BADGE_NOISY_CATEGORIES
    ]


def unread_badge_query(user_id: str, *, exclude_engagement: bool = False) -> dict[str, Any]:
    """Mongo filter for unread inbox rows (optionally excluding engagement noise)."""
    q: dict[str, Any] = {"user_id": user_id, "read": False}
    if exclude_engagement:
        q["$nor"] = [
            {"category": {"$in": list(BADGE_NOISY_CATEGORIES)}},
            {"source": {"$in": list(BADGE_NOISY_SOURCES)}},
            {"type": {"$in": badge_noisy_types()}},
        ]
    return q


def enrich_push_data(data: Optional[dict]) -> dict[str, Any]:
    """Merge catalog defaults (e.g. Android channel) onto outbound push data."""
    out: dict[str, Any] = dict(data or {})
    t = str(out.get("type") or "").strip()
    meta = get_kind_meta(t)
    if "channel_id" not in out and meta.get("channel_id"):
        out["channel_id"] = meta["channel_id"]
    elif "channel_id" not in out:
        out["channel_id"] = DEFAULT_ANDROID_CHANNEL
    if "sound" not in out and meta.get("sound"):
        out["sound"] = meta["sound"]
    out["audience"] = normalize_audience(meta.get("audience")).value
    out["notification_category"] = normalize_category(meta.get("category")).value
    return out


def list_known_kinds() -> list[str]:
    """Stable list for admin/docs tooling."""
    return sorted(NOTIFICATION_KIND_META.keys())


def list_kind_audiences() -> list[dict[str, str]]:
    return [
        {
            "type": kind,
            "audience": normalize_audience(meta.get("audience")).value,
            "category": normalize_category(meta.get("category")).value,
            "channel_id": str(meta.get("channel_id") or DEFAULT_ANDROID_CHANNEL),
        }
        for kind, meta in sorted(NOTIFICATION_KIND_META.items())
    ]

"""
Central registry for push notification kinds (`data.type`).

Extend NOTIFICATION_KIND_META when you add new server-side pushes so Android gets the
right channel and docs stay in one place. Optional fields per kind:
  - channel_id: Expo Android channelId (must match channels created in the app).
  - urgent: hint for clients that may tune sound/banner (optional).
  - audience: driver | rider | both — documentation only unless you branch on it later.

Paste your full notification list into NOTIFICATION_KIND_META as you define them.
"""
from __future__ import annotations

from typing import Any, Optional

# Channels must stay aligned with frontend `notifications.ts` (setNotificationChannelAsync).
DEFAULT_ANDROID_CHANNEL = "default"

NOTIFICATION_KIND_META: dict[str, dict[str, Any]] = {
    # Trip / dispatch (high visibility)
    "ride_request": {
        "channel_id": "driver_offers",
        "sound": "driver_offer_1.m4a",
        "urgent": True,
        "audience": "driver",
    },
    "trip_accepted": {"channel_id": "rides", "urgent": True, "audience": "rider"},
    "driver_arrived": {"channel_id": "rides", "urgent": True, "audience": "rider"},
    "trip_started": {"channel_id": "rides", "urgent": False, "audience": "both"},
    "trip_completed": {"channel_id": "rides", "urgent": False, "audience": "both"},
    "route_updated": {"channel_id": "rides", "urgent": False, "audience": "both"},
    "rider_route_updated": {"channel_id": "rides", "urgent": False, "audience": "rider"},
    # Safety / geo
    "geo_fence_trip_lock_armed": {"channel_id": "rides", "urgent": True, "audience": "both"},
    "geo_fence_explained": {"channel_id": "rides", "urgent": False, "audience": "both"},
    "geo_fence_deviation": {"channel_id": "rides", "urgent": True, "audience": "rider"},
    "geo_fence_deviation_driver": {"channel_id": "rides", "urgent": True, "audience": "driver"},
    "driver_stop_reason": {"channel_id": "rides", "urgent": False, "audience": "both"},
    "speed_spike_alert": {"channel_id": "rides", "urgent": True, "audience": "rider"},
    "speed_spike_driver": {"channel_id": "rides", "urgent": True, "audience": "driver"},
    "gps_spoofing_alert": {"channel_id": "rides", "urgent": True, "audience": "rider"},
    "gps_spoofing_driver": {"channel_id": "rides", "urgent": True, "audience": "driver"},
    "abnormal_stop": {"channel_id": "rides", "urgent": True, "audience": "both"},
    "safe_arrival_checkin": {"channel_id": "rides", "urgent": False, "audience": "rider"},
    # Subscription / compliance style (adjust copy in callers)
    "trial_ended": {"channel_id": "default", "urgent": True, "audience": "driver"},
    "go_online": {"channel_id": "default", "urgent": False, "audience": "driver"},
    "subscription_expiring": {"channel_id": "earnings", "urgent": False, "audience": "driver"},
    "earnings_update": {"channel_id": "earnings", "urgent": False, "audience": "driver"},
    # Product / marketing
    "feature_update": {"channel_id": "default", "urgent": False, "audience": "both"},
    "admin_broadcast": {"channel_id": "default", "urgent": False, "audience": "both"},
    # Daily time-slot reminders — Android channel `marketing` (see frontend notifications.ts)
    "daily_slot_morning": {"channel_id": "marketing", "urgent": False, "audience": "both"},
    "daily_slot_lunch": {"channel_id": "marketing", "urgent": False, "audience": "both"},
    "daily_slot_evening": {"channel_id": "marketing", "urgent": False, "audience": "both"},
    "daily_slot_night": {"channel_id": "marketing", "urgent": False, "audience": "both"},
    # Rider favourites onboarding (favorite_driver_notifications.py)
    "favorite_driver_nudge": {"channel_id": "default", "urgent": False, "audience": "rider"},
    # Work Zone (optional future reminders)
    "work_zone_expiring": {"channel_id": "default", "urgent": False, "audience": "driver"},
}


def enrich_push_data(data: Optional[dict]) -> dict[str, Any]:
    """Merge catalog defaults (e.g. Android channel) onto outbound push data."""
    out: dict[str, Any] = dict(data or {})
    t = str(out.get("type") or "").strip()
    meta = NOTIFICATION_KIND_META.get(t) or {}
    if "channel_id" not in out and meta.get("channel_id"):
        out["channel_id"] = meta["channel_id"]
    elif "channel_id" not in out:
        out["channel_id"] = DEFAULT_ANDROID_CHANNEL
    if "sound" not in out and meta.get("sound"):
        out["sound"] = meta["sound"]
    return out


def list_known_kinds() -> list[str]:
    """Stable list for admin/docs tooling."""
    return sorted(NOTIFICATION_KIND_META.keys())

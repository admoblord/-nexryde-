"""Pure helpers for Auto Stop Safety Check and driver stop-reason prompts.

Kept free of FastAPI / DB so the merge and response-normalisation rules can be
unit-tested without standing up the trips router.
"""
from __future__ import annotations

from typing import Any, Optional

SAFETY_CHECK_SAFE_RESPONSES = frozenset({"safe", "im_safe", "i_am_safe", "yes"})
SAFETY_CHECK_HELP_RESPONSES = frozenset({"need_help", "no", "unsafe", "not_safe", "help"})

RIDER_SAFETY_CHECK_TYPES = frozenset({"abnormal_stop", "safety_check"})


def normalize_safety_check_response(raw: Any) -> Optional[str]:
    """Return ``safe`` / ``need_help``, or None when the value is not recognised."""
    token = str(raw or "").strip().lower().replace("-", "_").replace(" ", "_")
    if token in SAFETY_CHECK_SAFE_RESPONSES:
        return "safe"
    if token in SAFETY_CHECK_HELP_RESPONSES:
        return "need_help"
    return None


def rider_safety_check_is_active(alert: Any) -> bool:
    """True when the rider still owes an in-trip 'Are you safe?' response."""
    if not isinstance(alert, dict):
        return False
    if alert.get("active") is False:
        return False
    if alert.get("rider_response"):
        return False
    alert_type = str(alert.get("type") or "")
    if alert_type in RIDER_SAFETY_CHECK_TYPES:
        return True
    return bool(alert.get("check_id"))


def driver_stop_reason_is_needed(alert: Any, stop_reason: Any) -> bool:
    """True when Auto Stop asked the driver to explain a long stop and they have not."""
    if not rider_safety_check_is_active(alert):
        return False
    if not isinstance(alert, dict):
        return False
    submitted_at = None
    if isinstance(stop_reason, dict):
        submitted_at = stop_reason.get("submitted_at")
    if not submitted_at:
        return True
    triggered_at = alert.get("triggered_at") or alert.get("stop_reason_submitted_at")
    if not triggered_at:
        return False
    return str(submitted_at) < str(triggered_at)


def merge_driver_stop_reason_alert(
    existing: Any,
    *,
    reason: str,
    now_iso: str,
    driver_id: str,
) -> dict[str, Any]:
    """Keep an in-flight Auto Stop check when the driver shares why they stopped.

    Overwriting ``guardian_alert`` with ``driver_stop_reason`` used to drop the
    rider's check_id, so 'Are you safe?' vanished the moment the driver answered.
    """
    current = dict(existing) if isinstance(existing, dict) else {}
    keep_check = rider_safety_check_is_active(current)
    alert: dict[str, Any] = {
        "active": True,
        "type": current.get("type") if keep_check else "driver_stop_reason",
        "message": (
            current.get("message")
            if keep_check
            else "Driver shared why the vehicle stopped."
        ),
        "reason": reason,
        "driver_reason": reason,
        "triggered_at": current.get("triggered_at") or now_iso,
        "stop_reason_submitted_at": now_iso,
        "driver_id": driver_id,
    }
    if current.get("check_id"):
        alert["check_id"] = current["check_id"]
    if current.get("stop_duration_seconds") is not None:
        alert["stop_duration_seconds"] = current["stop_duration_seconds"]
    if current.get("location"):
        alert["location"] = current["location"]
    if current.get("escalated"):
        alert["escalated"] = current["escalated"]
    return alert


def trip_safety_latlng(trip: dict[str, Any]) -> tuple[Optional[float], Optional[float]]:
    last_point: dict[str, Any] = {}
    route = trip.get("actual_route") or []
    if isinstance(route, list) and route:
        last = route[-1]
        if isinstance(last, dict):
            last_point = last
    loc = (trip.get("guardian_alert") or {}) if isinstance(trip.get("guardian_alert"), dict) else {}
    loc = loc.get("location") or {}
    if not isinstance(loc, dict):
        loc = {}
    drop = trip.get("dropoff_location") or {}
    if not isinstance(drop, dict):
        drop = {}
    lat = last_point.get("lat") or loc.get("lat") or drop.get("lat")
    lng = last_point.get("lng") or loc.get("lng") or drop.get("lng")
    try:
        lat_f = float(lat) if lat is not None else None
    except (TypeError, ValueError):
        lat_f = None
    try:
        lng_f = float(lng) if lng is not None else None
    except (TypeError, ValueError):
        lng_f = None
    return lat_f, lng_f

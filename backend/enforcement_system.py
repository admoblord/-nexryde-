"""
NEXRYDE Enforcement & Penalty System
Based on Bolt/Uber industry standards, adapted for Nigerian market.

Cancellation policy (24-hour rolling window):
  - Warnings only until the 7th cancellation in 24 hours
  - Penalty applies exactly on the 7th cancellation (not again at 8, 9, … in the same window)
  - Repeat episodes escalate: 1h → 24h → 7 days (riders and drivers)

Strike system (30-day rolling window, non-cancellation violations):
  - Each violation adds strikes per VIOLATION_CONFIG (cancellations add 0 strikes)
  - 5 active strikes = mandatory 24h account pause
  - 7 active strikes = permanent deactivation
  - Strikes age out after 30 days of clean behavior
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone, timedelta
import logging
import asyncio
import uuid

from database import db
from auth_guard import require_authenticated

logger = logging.getLogger(__name__)
enforcement_router = APIRouter(prefix="/api", tags=["Enforcement"])

# ==================== VIOLATION TYPES & PENALTIES ====================

VIOLATION_CONFIG = {
    # Driver violations
    "ride_rejection": {
        "description": "Rejected ride request",
        "threshold": 3,
        "window_hours": 24,
        "penalty": "warning",
        "strikes": 1,
        "escalation": {
            3: {"action": "warning", "message": "You've rejected 3 rides in 24 hours. Continued rejections may result in suspension."},
            5: {"action": "timeout_1h", "message": "Too many ride rejections. You're offline for 1 hour."},
            8: {"action": "suspend_24h", "message": "Excessive ride rejections. Your account is suspended for 24 hours."},
        },
        "role": "driver",
    },
    "driver_cancellation": {
        "description": "Driver cancelled after accepting",
        "threshold": 7,
        "window_hours": 24,
        "penalty": "warning",
        "strikes": 0,
        "escalation": {
            1: {
                "action": "warning",
                "message": "You cancelled after accepting. Riders are already on their way — only accept trips you can complete.",
            },
            4: {
                "action": "warning",
                "message": "4 post-accept cancellations in 24 hours. At 7, going online pauses (1 hour first time, longer if it happens again).",
            },
            6: {
                "action": "warning",
                "message": "6 post-accept cancellations in 24 hours. One more in this window triggers an automatic pause.",
            },
            7: {
                "action": "cancellation_progressive",
                "message": "You've reached 7 post-accept cancellations in 24 hours.",
            },
        },
        "role": "driver",
    },
    "rider_cancellation": {
        "description": "Rider cancelled trip",
        "threshold": 7,
        "window_hours": 24,
        "penalty": "warning",
        "strikes": 0,
        "escalation": {
            1: {
                "action": "warning",
                "message": "Trip cancelled. Drivers lose time and fuel when bookings are called off — book only when you're ready to travel.",
            },
            4: {
                "action": "warning",
                "message": "4 cancellations in 24 hours. At 7, booking pauses (1 hour the first time, 24 hours the second, longer after that).",
            },
            6: {
                "action": "warning",
                "message": "6 cancellations in 24 hours. One more in this window triggers an automatic booking pause.",
            },
            7: {
                "action": "cancellation_progressive",
                "message": "You've reached 7 ride cancellations in 24 hours.",
            },
        },
        "role": "rider",
    },
    "lost_item_refusal": {
        "description": "Driver refused to return rider's lost item",
        "threshold": 1,
        "window_hours": 0,
        "penalty": "suspend_24h",
        "strikes": 3,
        "escalation": {
            1: {"action": "suspend_24h", "message": "Refusing to return a rider's lost item is a serious violation. Your account is suspended for 24 hours."},
            2: {"action": "deactivate", "message": "Repeated refusal to return lost items. Your account has been permanently deactivated."},
        },
        "role": "driver",
    },
    "offline_trip_request": {
        "description": "Driver requested payment outside the app",
        "threshold": 1,
        "window_hours": 0,
        "penalty": "warning",
        "strikes": 2,
        "escalation": {
            1: {"action": "warning", "message": "Requesting offline payments violates NEXRYDE policy. This disables safety features for riders."},
            2: {"action": "suspend_24h", "message": "Second offline payment violation. Account suspended for 24 hours."},
            3: {"action": "deactivate", "message": "Repeated offline payment requests. Account permanently deactivated."},
        },
        "role": "driver",
    },
    "rude_behavior": {
        "description": "Rude or inappropriate behavior reported",
        "threshold": 2,
        "window_hours": 168,
        "penalty": "warning",
        "strikes": 1,
        "escalation": {
            2: {"action": "warning", "message": "Multiple behavior complaints received. Please maintain professional conduct."},
            4: {"action": "suspend_24h", "message": "Continued behavior complaints. Account suspended for 24 hours."},
            6: {"action": "suspend_24h", "message": "Repeated behavior issues. Account suspended for 24 hours. Please improve your conduct."},
        },
        "role": "both",
    },
    "safety_violation": {
        "description": "Safety violation (reckless driving, DUI, etc.)",
        "threshold": 1,
        "window_hours": 0,
        "penalty": "deactivate",
        "strikes": 5,
        "escalation": {
            1: {"action": "deactivate", "message": "Safety violation confirmed. Your account has been permanently deactivated. Contact support to appeal."},
        },
        "role": "driver",
    },
    "speed_spike": {
        "description": "Driver exceeded 100 km/h during an active trip",
        "threshold": 1,
        "window_hours": 24 * 365,
        "penalty": "warning",
        "strikes": 1,
        "escalation": {
            1: {"action": "warning", "message": "Critical overspeed detected. Slow down immediately. This incident is now on your safety record."},
            2: {"action": "warning", "message": "Second speed spike recorded. One more and your account will be suspended automatically."},
            3: {"action": "suspend_24h", "message": "Third speed spike recorded. Your account has been suspended automatically for rider safety."},
        },
        "role": "driver",
    },
    "gps_spoofing": {
        "description": "GPS spoofing or impossible route manipulation detected",
        "threshold": 1,
        "window_hours": 24 * 365,
        "penalty": "suspend_24h",
        "strikes": 3,
        "escalation": {
            1: {"action": "suspend_24h", "message": "GPS spoofing was detected on your account. Your driver account is suspended for 24 hours pending investigation."},
        },
        "role": "driver",
    },
    "fraud": {
        "description": "Fraudulent activity detected",
        "threshold": 1,
        "window_hours": 0,
        "penalty": "deactivate",
        "strikes": 5,
        "escalation": {
            1: {"action": "deactivate", "message": "Fraudulent activity detected. Account permanently deactivated."},
        },
        "role": "both",
    },
    "no_show_driver": {
        "description": "Driver did not show up at pickup",
        "threshold": 2,
        "window_hours": 24,
        "penalty": "warning",
        "strikes": 1,
        "escalation": {
            2: {"action": "warning", "message": "Multiple no-show reports. Please ensure you arrive at pickup locations."},
            4: {"action": "suspend_24h", "message": "Repeated no-shows. Account suspended for 24 hours."},
        },
        "role": "driver",
    },
    "rider_no_show": {
        "description": "Rider was not at pickup location",
        "threshold": 3,
        "window_hours": 24,
        "penalty": "warning",
        "strikes": 1,
        "escalation": {
            3: {"action": "warning", "message": "Please be ready at your pickup location when the driver arrives."},
            6: {"action": "cooldown_30m", "message": "Repeated no-shows. Please wait 30 minutes before booking."},
        },
        "role": "rider",
    },
    "low_rating": {
        "description": "Rating dropped below acceptable threshold",
        "threshold": 1,
        "window_hours": 0,
        "penalty": "warning",
        "strikes": 0,
        "escalation": {
            1: {"action": "warning", "message": "Your rating has dropped below 3.5. Improve your service to avoid suspension."},
        },
        "role": "both",
    },
}

STRIKE_WINDOW_DAYS = 30
STRIKE_SUSPEND_AT = 5
STRIKE_DEACTIVATE_AT = 7

CANCELLATION_PENALTY_THRESHOLD = 7
CANCELLATION_PROGRESSIVE_TYPES = frozenset({"rider_cancellation", "driver_cancellation"})
CANCELLATION_TIER_FIELD = {
    "rider_cancellation": "rider_cancellation_penalty_tier",
    "driver_cancellation": "driver_cancellation_penalty_tier",
}

# Rotating copy so repeat warnings are not identical in the inbox.
VIOLATION_COPY_VARIANTS: dict[str, dict[str, list[str]]] = {
    "driver_cancellation": {
        "warning": [
            "You cancelled after accepting — riders may already be waiting. Only accept trips you can finish.",
            "Post-accept cancellation logged. Once you tap Accept, the rider is counting on you to show up.",
            "Cancellation after accept hurts reliability. Check traffic and pickup time before you accept.",
        ],
        "timeout": [
            "Going online is paused for 1 hour — 7 post-accept cancellations in the last 24 hours.",
            "You're offline for 1 hour. This is your first cancellation pause; repeat episodes last longer.",
        ],
        "suspended": [
            "Your driver account is paused for 24 hours after another 7-cancellation episode.",
            "Second cancellation pause: 24 hours offline. Accept only when you can complete the trip.",
        ],
        "suspended_long": [
            "Your driver account is paused for 7 days after repeated cancellation episodes.",
            "Extended pause applied — too many 7-cancellation windows. Contact support if this seems wrong.",
        ],
    },
    "ride_rejection": {
        "warning": [
            "Several ride offers were declined in a short window. Steady acceptance keeps you visible to riders.",
            "High decline rate detected. Ignoring too many nearby requests may limit future offers.",
        ],
    },
    "rider_cancellation": {
        "warning": [
            "Trip cancelled — drivers lose time and fuel when bookings are called off late.",
            "Another cancellation recorded. Book when you're ready to travel to avoid booking limits.",
        ],
        "booking_blocked": [
            "Booking is paused for 1 hour — 7 cancellations in the last 24 hours.",
            "First cancellation pause: 1 hour. Book only when you're ready to travel.",
        ],
        "suspended": [
            "Booking and account access are paused for 24 hours after another 7-cancellation episode.",
            "Second cancellation pause: 24 hours. Please book only when you're sure you'll ride.",
        ],
        "suspended_long": [
            "Your account is paused for 7 days after repeated cancellation episodes.",
            "Extended pause — too many 7-cancellation windows in a short period. Email support@nexryde.com to appeal.",
        ],
    },
    "rude_behavior": {
        "warning": [
            "A conduct concern was logged on your account. Professional, respectful trips keep everyone safe.",
            "We've received another behaviour report. Please keep conversations courteous on every trip.",
        ],
    },
    "speed_spike": {
        "warning": [
            "Overspeed detected during an active trip. Slow down — this is on your safety record.",
            "Speed limit exceeded on trip. Repeated spikes trigger an automatic pause.",
        ],
    },
    "accumulated_strikes": {
        "suspended": [
            "Your strike balance triggered a mandatory pause. See the deadline below before going online again.",
            "Too many active strikes in 30 days — account paused until the time shown below.",
        ],
        "deactivated": [
            "Your account was deactivated after repeated strikes. Contact support if you believe this is an error.",
        ],
    },
}


def _parse_iso_dt(raw: str) -> Optional[datetime]:
    if not raw:
        return None
    try:
        return datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None


def _format_until_label(iso: str) -> str:
    """Human-readable lift time from an ISO deadline."""
    until = _parse_iso_dt(iso)
    if not until:
        return "the listed time"
    now = datetime.now(timezone.utc)
    remaining = until - now
    secs = int(remaining.total_seconds())
    if secs <= 0:
        return "now"
    if secs < 3600:
        mins = max(1, secs // 60)
        return f"{mins} minute{'s' if mins != 1 else ''}"
    if secs < 48 * 3600:
        hours = max(1, secs // 3600)
        return f"{hours} hour{'s' if hours != 1 else ''}"
    days = round(secs / 86400, 1)
    if days == int(days):
        return f"{int(days)} day{'s' if int(days) != 1 else ''}"
    return f"{days} days"


def _format_until_clock(iso: str) -> str:
    until = _parse_iso_dt(iso)
    if not until:
        return ""
    return until.astimezone(timezone.utc).strftime("%d %b, %H:%M UTC")


def _deadline_lines(action_result: dict) -> list[str]:
    lines: list[str] = []
    mapping = (
        ("suspended_until", "Account unfreezes"),
        ("offline_until", "You can go online again"),
        ("blocked_until", "Booking reopens"),
    )
    for key, prefix in mapping:
        iso = action_result.get(key)
        if not iso:
            continue
        rel = _format_until_label(iso)
        clock = _format_until_clock(iso)
        if clock:
            lines.append(f"{prefix} in {rel} ({clock}).")
        else:
            lines.append(f"{prefix} in {rel}.")
    return lines


def _strike_status_line(total_strikes: int) -> str:
    if total_strikes >= STRIKE_DEACTIVATE_AT:
        return (
            f"Strike tally: {total_strikes} active in the last {STRIKE_WINDOW_DAYS} days "
            f"(policy maximum)."
        )
    if total_strikes >= STRIKE_SUSPEND_AT:
        next_label = STRIKE_DEACTIVATE_AT - total_strikes
        return (
            f"Strike tally: {total_strikes} of {STRIKE_DEACTIVATE_AT} in {STRIKE_WINDOW_DAYS} days. "
            f"{next_label} more may lead to permanent deactivation."
        )
    until_suspend = STRIKE_SUSPEND_AT - total_strikes
    return (
        f"Strike tally: {total_strikes} of {STRIKE_DEACTIVATE_AT} in {STRIKE_WINDOW_DAYS} days "
        f"({until_suspend} more before a mandatory 24-hour pause)."
    )


def _window_count_line(violation_type: str, count: int, window_hours: int) -> str:
    if window_hours <= 0 or count <= 0:
        return ""
    desc = VIOLATION_CONFIG.get(violation_type, {}).get("description", violation_type.replace("_", " "))
    if window_hours < 48:
        window_label = f"{window_hours} hours"
    else:
        window_label = f"{max(1, window_hours // 24)} days"
    return f"Incident count: {count}× {desc.lower()} in the last {window_label}."


def _pick_variant_copy(violation_type: str, action_bucket: str, count: int) -> Optional[str]:
    pool = VIOLATION_COPY_VARIANTS.get(violation_type, {}).get(action_bucket, [])
    if not pool:
        return None
    return pool[(max(1, count) - 1) % len(pool)]


def _action_bucket(action_result: dict) -> str:
    action = action_result.get("action") or "warning"
    if action_result.get("cancellation_penalty_tier", 0) >= 3 and action == "suspended":
        return "suspended_long"
    if action in ("timeout", "cooldown"):
        return "timeout"
    if action == "booking_blocked":
        return "booking_blocked"
    if action == "suspended":
        return "suspended"
    if action == "deactivated":
        return "deactivated"
    return "warning"


def _cancellation_penalty_summary(violation_type: str, tier: int, hours: int) -> str:
    role = "booking" if violation_type == "rider_cancellation" else "going online"
    if tier == 1:
        return (
            f"Pause #{tier}: {role} is limited for 1 hour after 7 cancellations in 24 hours. "
            f"A second episode within 30 days becomes a 24-hour pause."
        )
    if tier == 2:
        return (
            f"Pause #{tier}: {role} is suspended for 24 hours after another 7-cancellation window. "
            f"A third episode triggers a 7-day pause."
        )
    return (
        f"Pause #{tier}: extended {hours // 24}-day suspension after repeated 7-cancellation episodes. "
        f"Contact support@nexryde.com if you need to appeal."
    )


def _accumulated_strike_message(total_strikes: int, action_result: dict) -> str:
    bucket = _action_bucket(action_result)
    variant = _pick_variant_copy("accumulated_strikes", bucket, total_strikes)
    if action_result.get("action") == "deactivated":
        base = variant or (
            f"Your account was deactivated after {total_strikes} active strikes "
            f"in {STRIKE_WINDOW_DAYS} days. Email support@nexryde.com to appeal."
        )
    else:
        until_iso = action_result.get("suspended_until")
        rel = _format_until_label(until_iso) if until_iso else "24 hours"
        clock = _format_until_clock(until_iso)
        clock_bit = f" ({clock})" if clock else ""
        base = variant or (
            f"Your account is paused for {rel}{clock_bit} after {total_strikes} active strikes "
            f"in {STRIKE_WINDOW_DAYS} days."
        )
    parts = [base, _strike_status_line(total_strikes)]
    parts.extend(_deadline_lines(action_result))
    return "\n\n".join(p for p in parts if p)


def _enforcement_notification_title(
    violation_type: str,
    action_result: dict,
    total_strikes: int,
    count: int,
) -> str:
    action = action_result.get("action") or "warning"
    if action == "deactivated":
        return "Account deactivated"
    if action == "suspended":
        if violation_type == "accumulated_strikes":
            return f"Strike pause · {total_strikes}/{STRIKE_DEACTIVATE_AT}"
        return "Account paused"
    if action in ("timeout", "cooldown"):
        tier = action_result.get("cancellation_penalty_tier")
        if tier == 1:
            return "1-hour online pause"
        return "Going offline temporarily"
    if action == "booking_blocked":
        tier = action_result.get("cancellation_penalty_tier")
        if tier == 1:
            return "Booking paused · 1 hour"
        return "Booking paused"
    if action == "suspended" and action_result.get("cancellation_penalty_tier"):
        tier = action_result["cancellation_penalty_tier"]
        if tier >= 3:
            return "Extended cancellation pause"
        if tier == 2:
            return "24-hour cancellation pause"
    title_pools = {
        "driver_cancellation": [
            "Trip commitment reminder",
            "Cancellation notice",
            "Reliability alert",
        ],
        "ride_rejection": ["Offer decline notice", "Acceptance reminder"],
        "rider_cancellation": ["Booking cancellation", "Trip cancelled"],
        "speed_spike": ["Safety speed alert", "Speed limit notice"],
        "rude_behavior": ["Conduct reminder", "Professional standards"],
        "accumulated_strikes": [
            f"Strike warning · {total_strikes}/{STRIKE_DEACTIVATE_AT}",
            f"Account standing · {total_strikes} strikes",
        ],
    }
    pool = title_pools.get(violation_type, ["Policy update", "Account notice", "Trip policy"])
    return pool[(max(1, count) - 1) % len(pool)]


def compose_enforcement_notification(
    violation_type: str,
    count: int,
    total_strikes: int,
    action_result: dict,
    config: dict,
) -> tuple[str, str, str]:
    """Return (title, message, notification_type) for inbox + email."""
    bucket = _action_bucket(action_result)
    variant = _pick_variant_copy(violation_type, bucket, count)
    if action_result.get("cancellation_penalty_tier"):
        body = action_result.get("message") or "Cancellation limit reached."
    else:
        body = variant or (action_result.get("message") or "A policy event was recorded on your account.")

    if violation_type == "accumulated_strikes":
        body = _accumulated_strike_message(total_strikes, action_result)
    else:
        parts = [body.strip()]
        window_line = _window_count_line(violation_type, count, config.get("window_hours", 0))
        if window_line:
            parts.append(window_line)
        if total_strikes > 0:
            parts.append(_strike_status_line(total_strikes))
        parts.extend(_deadline_lines(action_result))
        body = "\n\n".join(p for p in parts if p)

    title = _enforcement_notification_title(violation_type, action_result, total_strikes, count)
    notif_type = f"enforcement_{bucket}"
    return title, body, notif_type


# ==================== MODELS ====================

class ReportViolationRequest(BaseModel):
    reported_user_id: str
    reporter_id: str
    violation_type: str
    trip_id: Optional[str] = None
    description: Optional[str] = None
    evidence: Optional[str] = None


class AppealRequest(BaseModel):
    user_id: str
    violation_id: str
    reason: str


# ==================== CORE ENFORCEMENT LOGIC ====================

async def record_violation(user_id: str, violation_type: str, trip_id: str = None,
                           reporter_id: str = None, description: str = None):
    """Record a violation and apply appropriate penalty."""
    config = VIOLATION_CONFIG.get(violation_type)
    if not config:
        return {"action": "none", "message": "Unknown violation type"}

    # A completed trip can NEVER be a cancellation. Guard against recording a
    # cancellation violation (and the "Booking cancellation" notice) for a trip
    # that already reached the terminal `completed` state.
    if trip_id and violation_type in {"rider_cancellation", "driver_cancellation"}:
        try:
            ref_trip = await db.trips.find_one({"id": trip_id}, {"_id": 0, "status": 1})
            if ref_trip and str(ref_trip.get("status") or "").lower() == "completed":
                return {"action": "none", "message": "Trip already completed; no cancellation."}
        except Exception:
            pass

    now = datetime.now(timezone.utc)
    # Keep violations for retention_days (default 90 days) then auto-delete via TTL index.
    retention_days = config.get("retention_days", 90)
    violation = {
        "user_id": user_id,
        "violation_type": violation_type,
        "description": description or config["description"],
        "trip_id": trip_id,
        "reporter_id": reporter_id,
        "strikes": config["strikes"],
        "status": "active",
        "created_at": now.isoformat(),
        "expires_at": now + timedelta(days=retention_days),
    }
    await db.violations.insert_one(violation)

    window = timedelta(hours=config["window_hours"]) if config["window_hours"] > 0 else timedelta(days=365)
    since = datetime.now(timezone.utc) - window
    count = await db.violations.count_documents({
        "user_id": user_id,
        "violation_type": violation_type,
        "created_at": {"$gte": since.isoformat()},
    })

    action_result = {"action": "recorded", "message": "Violation recorded.", "count": count}

    if (
        violation_type in CANCELLATION_PROGRESSIVE_TYPES
        and count == CANCELLATION_PENALTY_THRESHOLD
    ):
        escalation = config["escalation"][CANCELLATION_PENALTY_THRESHOLD]
        action_result = await apply_cancellation_progressive_penalty(
            user_id, violation_type, escalation.get("message", ""), count
        )
    elif violation_type in CANCELLATION_PROGRESSIVE_TYPES:
        escalation = config["escalation"].get(count)
        if escalation and escalation["action"] == "warning":
            action_result = await apply_penalty(
                user_id, escalation["action"], escalation["message"], violation_type
            )
    else:
        for threshold in sorted(config["escalation"].keys(), reverse=True):
            if count >= threshold:
                escalation = config["escalation"][threshold]
                action_result = await apply_penalty(
                    user_id, escalation["action"], escalation["message"], violation_type
                )
                break

    strike_window_start = (datetime.now(timezone.utc) - timedelta(days=STRIKE_WINDOW_DAYS)).isoformat()
    strike_rows = await db.violations.find(
        {
            "user_id": user_id,
            "status": "active",
            "created_at": {"$gte": strike_window_start},
            "violation_type": {"$nin": list(CANCELLATION_PROGRESSIVE_TYPES)},
        },
        {"strikes": 1},
    ).to_list(500)
    total_strikes = sum(int(v.get("strikes") or 1) for v in strike_rows)

    notify_violation_type = violation_type
    if total_strikes >= STRIKE_DEACTIVATE_AT:
        action_result = await apply_penalty(
            user_id, "deactivate", "", "accumulated_strikes"
        )
        action_result["message"] = _accumulated_strike_message(total_strikes, action_result)
        notify_violation_type = "accumulated_strikes"
    elif total_strikes >= STRIKE_SUSPEND_AT:
        action_result = await apply_penalty(
            user_id, "suspend_7d", "", "accumulated_strikes"
        )
        action_result["message"] = _accumulated_strike_message(total_strikes, action_result)
        notify_violation_type = "accumulated_strikes"

    notify_config = (
        config
        if notify_violation_type != "accumulated_strikes"
        else {
            "description": "Accumulated policy strikes",
            "window_hours": STRIKE_WINDOW_DAYS * 24,
        }
    )
    title, inbox_message, notif_type = compose_enforcement_notification(
        notify_violation_type, count, total_strikes, action_result, notify_config
    )

    from user_inbox_notifications import insert_user_notification

    await insert_user_notification(
        user_id=user_id,
        type=notif_type,
        title=title,
        message=inbox_message,
        data={
            "violation_type": violation_type,
            "incident_count": count,
            "total_strikes": total_strikes,
            "action": action_result.get("action"),
            "cancellation_penalty_tier": action_result.get("cancellation_penalty_tier"),
            "suspended_until": action_result.get("suspended_until"),
            "offline_until": action_result.get("offline_until"),
            "blocked_until": action_result.get("blocked_until"),
            "trip_id": trip_id,
        },
    )

    from services.product_notification_email import schedule_notify_user_brevo_email

    vdesc = (config.get("description") or violation_type).strip()
    body = (
        f"{title}\n\n"
        f"{inbox_message}\n\n"
        f"Event: {vdesc}\n"
        + (f"Trip: {trip_id}\n" if trip_id else "")
        + f"\nIf this looks wrong, reach out via in-app support."
    ).strip()
    schedule_notify_user_brevo_email(
        user_id,
        subject=f"NEXRYDE — {title}",
        body_plain=body,
        tags=["nexryde-violation", violation_type[:32]],
        respect_notification_channels=False,
    )

    return action_result


async def apply_cancellation_progressive_penalty(
    user_id: str,
    violation_type: str,
    base_message: str,
    count_in_window: int,
) -> dict:
    """Apply 1h → 24h → 7d pause when a user hits exactly 7 cancellations in 24 hours."""
    user = await db.users.find_one({"id": user_id}) or {}
    tier_field = CANCELLATION_TIER_FIELD[violation_type]
    tier = int(user.get(tier_field) or 0) + 1
    now = datetime.now(timezone.utc)

    if tier == 1:
        until = now + timedelta(hours=1)
        if violation_type == "rider_cancellation":
            await db.users.update_one(
                {"id": user_id},
                {
                    "$set": {
                        tier_field: tier,
                        "booking_blocked_until": until.isoformat(),
                        "block_reason": violation_type,
                    }
                },
            )
            action = "booking_blocked"
            deadline_key = "blocked_until"
        else:
            await db.users.update_one(
                {"id": user_id},
                {
                    "$set": {
                        tier_field: tier,
                        "forced_offline_until": until.isoformat(),
                        "block_reason": violation_type,
                    }
                },
            )
            await db.driver_profiles.update_one({"user_id": user_id}, {"$set": {"is_online": False}})
            from driver_presence import clear_driver_presence_safe
            await clear_driver_presence_safe(user_id)
            action = "timeout"
            deadline_key = "offline_until"
        hours = 1
    elif tier == 2:
        until = now + timedelta(hours=24)
        await db.users.update_one(
            {"id": user_id},
            {
                "$set": {
                    tier_field: tier,
                    "suspended_until": until.isoformat(),
                    "suspension_reason": violation_type,
                    "booking_blocked_until": until.isoformat(),
                    "block_reason": violation_type,
                    "forced_offline_until": until.isoformat(),
                }
            },
        )
        await db.driver_profiles.update_one({"user_id": user_id}, {"$set": {"is_online": False}})
        from driver_presence import clear_driver_presence_safe
        await clear_driver_presence_safe(user_id)
        action = "suspended"
        deadline_key = "suspended_until"
        hours = 24
    else:
        until = now + timedelta(days=7)
        await db.users.update_one(
            {"id": user_id},
            {
                "$set": {
                    tier_field: tier,
                    "suspended_until": until.isoformat(),
                    "suspension_reason": violation_type,
                    "booking_blocked_until": until.isoformat(),
                    "block_reason": violation_type,
                    "forced_offline_until": until.isoformat(),
                }
            },
        )
        await db.driver_profiles.update_one({"user_id": user_id}, {"$set": {"is_online": False}})
        from driver_presence import clear_driver_presence_safe
        await clear_driver_presence_safe(user_id)
        action = "suspended"
        deadline_key = "suspended_until"
        hours = 24 * 7

    summary = _cancellation_penalty_summary(violation_type, tier, hours)
    message = f"{base_message.strip()}\n\n{summary}".strip()
    result = {
        "action": action,
        "message": message,
        "count": count_in_window,
        "cancellation_penalty_tier": tier,
        deadline_key: until.isoformat(),
    }
    if tier == 1 and violation_type == "driver_cancellation":
        result["offline_until"] = until.isoformat()
    if tier >= 2:
        result["blocked_until"] = until.isoformat()
        if violation_type == "driver_cancellation":
            result["offline_until"] = until.isoformat()
    return result


async def apply_penalty(user_id: str, action: str, message: str, violation_type: str):
    """Apply a penalty action to a user."""
    now = datetime.now(timezone.utc)

    if action == "warning":
        await db.users.update_one({"id": user_id}, {"$set": {"last_warning": now.isoformat(), "last_warning_reason": violation_type}})
        return {"action": "warning", "message": message}

    elif action == "cooldown_30m":
        until = now + timedelta(minutes=30)
        await db.users.update_one({"id": user_id}, {"$set": {"booking_blocked_until": until.isoformat(), "block_reason": violation_type}})
        return {"action": "cooldown", "message": message, "blocked_until": until.isoformat()}

    elif action == "booking_block_1h":
        until = now + timedelta(hours=1)
        await db.users.update_one({"id": user_id}, {"$set": {"booking_blocked_until": until.isoformat(), "block_reason": violation_type}})
        return {"action": "booking_blocked", "message": message, "blocked_until": until.isoformat(), "blocked_seconds": 3600}

    elif action == "timeout_1h":
        until = now + timedelta(hours=1)
        await db.users.update_one({"id": user_id}, {"$set": {"forced_offline_until": until.isoformat(), "block_reason": violation_type}})
        await db.driver_profiles.update_one({"user_id": user_id}, {"$set": {"is_online": False}})
        from driver_presence import clear_driver_presence_safe
        await clear_driver_presence_safe(user_id)
        return {"action": "timeout", "message": message, "offline_until": until.isoformat()}

    elif action == "timeout_2h":
        until = now + timedelta(hours=2)
        await db.users.update_one({"id": user_id}, {"$set": {"forced_offline_until": until.isoformat(), "block_reason": violation_type}})
        await db.driver_profiles.update_one({"user_id": user_id}, {"$set": {"is_online": False}})
        from driver_presence import clear_driver_presence_safe
        await clear_driver_presence_safe(user_id)
        return {"action": "timeout", "message": message, "offline_until": until.isoformat()}

    elif action == "suspend_24h":
        until = now + timedelta(hours=24)
        await db.users.update_one({"id": user_id}, {"$set": {"suspended_until": until.isoformat(), "suspension_reason": violation_type}})
        await db.driver_profiles.update_one({"user_id": user_id}, {"$set": {"is_online": False}})
        from driver_presence import clear_driver_presence_safe
        await clear_driver_presence_safe(user_id)
        return {"action": "suspended", "message": message, "suspended_until": until.isoformat()}

    elif action == "suspend_3d":
        until = now + timedelta(days=3)
        await db.users.update_one({"id": user_id}, {"$set": {"suspended_until": until.isoformat(), "suspension_reason": violation_type}})
        await db.driver_profiles.update_one({"user_id": user_id}, {"$set": {"is_online": False}})
        from driver_presence import clear_driver_presence_safe
        await clear_driver_presence_safe(user_id)
        return {"action": "suspended", "message": message, "suspended_until": until.isoformat()}

    elif action == "suspend_7d":
        until = now + timedelta(days=7)
        await db.users.update_one({"id": user_id}, {"$set": {"suspended_until": until.isoformat(), "suspension_reason": violation_type}})
        await db.driver_profiles.update_one({"user_id": user_id}, {"$set": {"is_online": False}})
        from driver_presence import clear_driver_presence_safe
        await clear_driver_presence_safe(user_id)
        return {"action": "suspended", "message": message, "suspended_until": until.isoformat()}

    elif action == "deactivate":
        await db.users.update_one({"id": user_id}, {"$set": {"is_deactivated": True, "deactivated_at": now.isoformat(), "deactivation_reason": violation_type}})
        await db.driver_profiles.update_one({"user_id": user_id}, {"$set": {"is_online": False}})
        from driver_presence import clear_driver_presence_safe
        await clear_driver_presence_safe(user_id)
        return {"action": "deactivated", "message": message}

    return {"action": action, "message": message}


async def check_user_status(user_id: str):
    """Check if a user is allowed to use the app (not suspended/deactivated)."""
    from user_lookup import find_user_by_id, QUERY_MAX_TIME_MS

    user = await find_user_by_id(
        user_id,
        {
            "_id": 0,
            "id": 1,
            "role": 1,
            "is_deactivated": 1,
            "verification_status": 1,
            "suspended_until": 1,
            "suspension_reason": 1,
        },
        max_time_ms=QUERY_MAX_TIME_MS,
    )
    if not user:
        return {"allowed": False, "reason": "User not found"}

    if user.get("is_deactivated"):
        return {"allowed": False, "reason": "Account deactivated", "message": "Your account has been permanently deactivated due to policy violations. Contact support@nexryde.com to appeal."}

    # Hard verification/compliance gates for drivers.
    if user.get("role") == "driver":
        profile = await db.driver_profiles.find_one(
            {"user_id": user_id},
            {
                "_id": 0,
                "verification_status": 1,
                "documents_verified": 1,
                "suspended_reason": 1,
            },
            max_time_ms=QUERY_MAX_TIME_MS,
        ) or {}
        if user.get("verification_status") in {"recheck_required", "rejected"} or profile.get("verification_status") in {"recheck_required", "rejected"}:
            return {
                "allowed": True,
                "can_go_online": False,
                "message": "Driver verification recheck is required before you can go online.",
            }
        if not profile.get("documents_verified") or profile.get("verification_status") != "approved":
            return {
                "allowed": True,
                "can_go_online": False,
                "message": "Complete document verification and approval before going online.",
            }
        # Only hard-block if actual documents are expired — monthly re-uploads are soft reminders only
        if profile.get("suspended_reason") in {"expired_documents"}:
            return {
                "allowed": True,
                "can_go_online": False,
                "message": "Your account is restricted: one or more documents have expired. Please renew them.",
            }

    suspended_until = user.get("suspended_until")
    if suspended_until:
        try:
            until_dt = datetime.fromisoformat(suspended_until.replace("Z", "+00:00"))
            if datetime.now(timezone.utc) < until_dt:
                remaining = until_dt - datetime.now(timezone.utc)
                total_hours = int(remaining.total_seconds() / 3600)
                if total_hours >= 48:
                    days = round(remaining.total_seconds() / 86400, 1)
                    time_str = f"{days} days" if days != int(days) else f"{int(days)} days"
                else:
                    time_str = f"{total_hours} hours"
                reason = (user.get("suspension_reason") or "policy").replace("_", " ")
                return {
                    "allowed": False,
                    "reason": "Account suspended",
                    "message": f"Account paused ({reason}). {time_str} remaining.",
                    "suspended_until": suspended_until,
                }
            else:
                await db.users.update_one({"id": user_id}, {"$unset": {"suspended_until": "", "suspension_reason": ""}})
        except (ValueError, TypeError):
            pass

    forced_offline = user.get("forced_offline_until")
    if forced_offline and user.get("role") == "driver":
        try:
            until_dt = datetime.fromisoformat(forced_offline.replace("Z", "+00:00"))
            if datetime.now(timezone.utc) < until_dt:
                remaining = until_dt - datetime.now(timezone.utc)
                mins = int(remaining.total_seconds() / 60)
                return {"allowed": True, "can_go_online": False, "message": f"You cannot go online for {mins} more minutes due to policy violations."}
            else:
                await db.users.update_one({"id": user_id}, {"$unset": {"forced_offline_until": "", "block_reason": ""}})
        except (ValueError, TypeError):
            pass

    booking_blocked = user.get("booking_blocked_until")
    if booking_blocked and user.get("role") == "rider":
        try:
            until_dt = datetime.fromisoformat(booking_blocked.replace("Z", "+00:00"))
            now_utc = datetime.now(timezone.utc)
            if now_utc < until_dt:
                remaining = until_dt - now_utc
                total_secs = int(remaining.total_seconds())
                mins = total_secs // 60
                secs = total_secs % 60
                return {
                    "allowed": True,
                    "can_book": False,
                    "reason": "booking_blocked",
                    "message": f"Booking suspended. {mins}m {secs:02d}s remaining.",
                    "booking_blocked_until": until_dt.isoformat(),
                    "booking_blocked_seconds_remaining": total_secs,
                }
            else:
                await db.users.update_one({"id": user_id}, {"$unset": {"booking_blocked_until": "", "block_reason": ""}})
        except (ValueError, TypeError):
            pass

    return {"allowed": True}


# ==================== API ENDPOINTS ====================

@enforcement_router.post("/enforcement/report")
async def report_violation(request: ReportViolationRequest, http_request: Request):
    """Report a violation against a user. Caller must be authenticated."""
    from security_advanced import verify_jwt_token
    auth_header = http_request.headers.get("Authorization", "")
    token = auth_header.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required")
    try:
        payload = verify_jwt_token(token)
        caller_id = str(payload.get("sub") or "")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    if not caller_id:
        raise HTTPException(status_code=401, detail="Invalid token claims")
    # reporter_id must match the authenticated caller (prevents impersonation)
    if request.reporter_id and request.reporter_id != caller_id:
        raise HTTPException(status_code=403, detail="reporter_id must match authenticated user")
    if request.violation_type not in VIOLATION_CONFIG:
        raise HTTPException(status_code=400, detail=f"Unknown violation type. Valid types: {', '.join(VIOLATION_CONFIG.keys())}")
    result = await record_violation(
        user_id=request.reported_user_id,
        violation_type=request.violation_type,
        trip_id=request.trip_id,
        reporter_id=caller_id,
        description=request.description,
    )
    return result


@enforcement_router.get("/enforcement/status/{user_id}")
async def get_enforcement_status(user_id: str, http_request: Request):
    """Check enforcement status. Users can only check their own status; admins can check any."""
    from security_advanced import verify_jwt_token
    auth_header = http_request.headers.get("Authorization", "")
    token = auth_header.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required")
    try:
        payload = verify_jwt_token(token)
        caller_id = str(payload.get("sub") or "")
        caller_role = str(payload.get("role") or "rider")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    if caller_role not in ("admin",) and caller_id != user_id:
        raise HTTPException(status_code=403, detail="You can only check your own enforcement status")
    return await check_user_status(user_id)


@enforcement_router.get("/enforcement/book-status/{user_id}")
async def get_book_status(user_id: str, http_request: Request):
    """Lightweight check — can this rider book right now? Returns countdown seconds if blocked."""
    caller_id = require_authenticated(http_request)
    try:
        caller = await db.users.find_one({"id": caller_id}, {"role": 1})
        caller_role = (caller or {}).get("role", "rider")
    except Exception:
        caller_role = "rider"
    if caller_role not in ("admin",) and caller_id != user_id:
        raise HTTPException(status_code=403, detail="You can only check your own booking status")
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "booking_blocked_until": 1, "block_reason": 1, "is_deactivated": 1, "suspended_until": 1})
    if not user:
        return {"can_book": True}
    if user.get("is_deactivated"):
        return {"can_book": False, "reason": "deactivated", "message": "Account deactivated."}
    suspended_until = user.get("suspended_until")
    if suspended_until:
        try:
            until_dt = datetime.fromisoformat(suspended_until.replace("Z", "+00:00"))
            if datetime.now(timezone.utc) < until_dt:
                remaining = until_dt - datetime.now(timezone.utc)
                return {"can_book": False, "reason": "suspended", "message": f"Account suspended. {int(remaining.total_seconds() // 3600)}h remaining.", "seconds_remaining": int(remaining.total_seconds())}
        except (ValueError, TypeError):
            pass
    booking_blocked = user.get("booking_blocked_until")
    if booking_blocked:
        try:
            until_dt = datetime.fromisoformat(booking_blocked.replace("Z", "+00:00"))
            now_utc = datetime.now(timezone.utc)
            if now_utc < until_dt:
                secs = int((until_dt - now_utc).total_seconds())
                mins = secs // 60
                block_reason = (user.get("block_reason") or "cancellations").replace("_", " ")
                if mins >= 60:
                    time_msg = f"{mins // 60}h {mins % 60}m"
                else:
                    time_msg = f"{mins}m {secs % 60:02d}s"
                return {
                    "can_book": False,
                    "reason": "booking_blocked",
                    "message": f"Booking paused ({block_reason}). {time_msg} remaining.",
                    "seconds_remaining": secs,
                    "blocked_until": until_dt.isoformat(),
                }
        except (ValueError, TypeError):
            pass
    return {"can_book": True}


@enforcement_router.get("/enforcement/history/{user_id}")
async def get_violation_history(user_id: str, http_request: Request):
    """Get user's violation history."""
    caller_id = require_authenticated(http_request)
    try:
        caller = await db.users.find_one({"id": caller_id}, {"role": 1})
        caller_role = (caller or {}).get("role", "rider")
    except Exception:
        caller_role = "rider"
    if caller_role not in ("admin",) and caller_id != user_id:
        raise HTTPException(status_code=403, detail="You can only view your own violation history")
    violations = await db.violations.find(
        {"user_id": user_id}
    ).sort("created_at", -1).to_list(50)
    for v in violations:
        v["_id"] = str(v["_id"])

    active_count = sum(1 for v in violations if v.get("status") == "active")
    total_strikes = sum(v.get("strikes", 0) for v in violations if v.get("status") == "active")

    return {
        "violations": violations,
        "active_violations": active_count,
        "total_strikes": total_strikes,
        "strike_limit": 7,
    }


@enforcement_router.get("/enforcement/policies")
async def get_policies():
    """Return all enforcement policies for display in the app."""
    policies = []
    for key, config in VIOLATION_CONFIG.items():
        policies.append({
            "id": key,
            "description": config["description"],
            "applies_to": config["role"],
            "strikes_per_violation": config["strikes"],
            "escalation_levels": [
                {"threshold": t, "action": e["action"], "message": e["message"]}
                for t, e in sorted(config["escalation"].items())
            ],
        })
    return {
        "policies": policies,
        "strike_system": {
            "warning": f"Strikes accumulate over {STRIKE_WINDOW_DAYS} days (cancellations do not add strikes)",
            "suspension_24h": f"{STRIKE_SUSPEND_AT} active strikes = mandatory 24-hour pause",
            "deactivation": f"{STRIKE_DEACTIVATE_AT} active strikes = permanent deactivation",
            "reset": f"Strikes age out after {STRIKE_WINDOW_DAYS} days without new violations",
        },
        "cancellation_policy": {
            "threshold_per_24h": CANCELLATION_PENALTY_THRESHOLD,
            "first_episode": "1 hour booking / online pause",
            "second_episode": "24 hour account pause",
            "third_plus_episode": "7 day account pause",
            "note": "Penalty applies on the 7th cancellation in a 24-hour window, not on every cancellation after that.",
        },
    }


@enforcement_router.post("/enforcement/appeal")
async def appeal_violation(request: AppealRequest):
    """Submit an appeal for a violation."""
    appeal = {
        "user_id": request.user_id,
        "violation_id": request.violation_id,
        "reason": request.reason,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.appeals.insert_one(appeal)
    return {"message": "Appeal submitted. Our team will review within 24-48 hours.", "status": "pending"}

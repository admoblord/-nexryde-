"""
NEXRYDE Enforcement & Penalty System
Based on Bolt/Uber industry standards, adapted for Nigerian market.

Strike system:
  - Violations accumulate strikes
  - 3 strikes = 24hr suspension
  - 5 strikes = 7-day suspension
  - 7 strikes = permanent deactivation
  - Strikes reset after 30 days of clean behavior
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone, timedelta
import logging

from database import db

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
        "threshold": 3,
        "window_hours": 24,
        "penalty": "warning",
        "strikes": 1,
        "escalation": {
            3: {"action": "warning", "message": "You've cancelled 3 trips today. Your acceptance rate is dropping."},
            5: {"action": "timeout_2h", "message": "Too many cancellations. You're offline for 2 hours."},
            7: {"action": "suspend_24h", "message": "Excessive cancellations. Account suspended for 24 hours."},
            10: {"action": "suspend_7d", "message": "Repeated cancellations. Account suspended for 7 days. Contact support."},
        },
        "role": "driver",
    },
    "rider_cancellation": {
        "description": "Rider cancelled trip",
        "threshold": 5,
        "window_hours": 24,
        "penalty": "warning",
        "strikes": 1,
        "escalation": {
            5: {"action": "warning", "message": "You've cancelled 5 rides today. Frequent cancellations affect your rider score."},
            8: {"action": "cooldown_30m", "message": "Too many cancellations. Please wait 30 minutes before booking again."},
            12: {"action": "suspend_24h", "message": "Excessive cancellations. Your booking is suspended for 24 hours."},
        },
        "role": "rider",
    },
    "lost_item_refusal": {
        "description": "Driver refused to return rider's lost item",
        "threshold": 1,
        "window_hours": 0,
        "penalty": "suspend_7d",
        "strikes": 3,
        "escalation": {
            1: {"action": "suspend_7d", "message": "Refusing to return a rider's lost item is a serious violation. Your account is suspended for 7 days."},
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
            2: {"action": "suspend_7d", "message": "Second offline payment violation. Account suspended for 7 days."},
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
            6: {"action": "suspend_7d", "message": "Repeated behavior issues. Account suspended for 7 days. Mandatory review required."},
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
        "penalty": "suspend_7d",
        "strikes": 3,
        "escalation": {
            1: {"action": "suspend_7d", "message": "GPS spoofing was detected on your account. Your driver account is suspended pending investigation."},
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

    violation = {
        "user_id": user_id,
        "violation_type": violation_type,
        "description": description or config["description"],
        "trip_id": trip_id,
        "reporter_id": reporter_id,
        "strikes": config["strikes"],
        "status": "active",
        "created_at": datetime.now(timezone.utc).isoformat(),
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

    for threshold in sorted(config["escalation"].keys(), reverse=True):
        if count >= threshold:
            escalation = config["escalation"][threshold]
            action_result = await apply_penalty(user_id, escalation["action"], escalation["message"], violation_type)
            break

    total_strikes = await db.violations.count_documents({
        "user_id": user_id,
        "status": "active",
        "created_at": {"$gte": (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()},
    })

    if total_strikes >= 7:
        action_result = await apply_penalty(user_id, "deactivate",
                                            "Your account has been deactivated due to repeated violations. Contact support to appeal.",
                                            "accumulated_strikes")
    elif total_strikes >= 5:
        action_result = await apply_penalty(user_id, "suspend_7d",
                                            "Multiple violations recorded. Account suspended for 7 days.",
                                            "accumulated_strikes")

    await db.notifications.insert_one({
        "user_id": user_id,
        "type": "enforcement",
        "title": "Policy Notice",
        "message": action_result["message"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "read": False,
    })

    return action_result


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

    elif action == "timeout_1h":
        until = now + timedelta(hours=1)
        await db.users.update_one({"id": user_id}, {"$set": {"forced_offline_until": until.isoformat(), "block_reason": violation_type}})
        await db.driver_profiles.update_one({"user_id": user_id}, {"$set": {"is_online": False}})
        return {"action": "timeout", "message": message, "offline_until": until.isoformat()}

    elif action == "timeout_2h":
        until = now + timedelta(hours=2)
        await db.users.update_one({"id": user_id}, {"$set": {"forced_offline_until": until.isoformat(), "block_reason": violation_type}})
        await db.driver_profiles.update_one({"user_id": user_id}, {"$set": {"is_online": False}})
        return {"action": "timeout", "message": message, "offline_until": until.isoformat()}

    elif action == "suspend_24h":
        until = now + timedelta(hours=24)
        await db.users.update_one({"id": user_id}, {"$set": {"suspended_until": until.isoformat(), "suspension_reason": violation_type}})
        await db.driver_profiles.update_one({"user_id": user_id}, {"$set": {"is_online": False}})
        return {"action": "suspended", "message": message, "suspended_until": until.isoformat()}

    elif action == "suspend_7d":
        until = now + timedelta(days=7)
        await db.users.update_one({"id": user_id}, {"$set": {"suspended_until": until.isoformat(), "suspension_reason": violation_type}})
        await db.driver_profiles.update_one({"user_id": user_id}, {"$set": {"is_online": False}})
        return {"action": "suspended", "message": message, "suspended_until": until.isoformat()}

    elif action == "deactivate":
        await db.users.update_one({"id": user_id}, {"$set": {"is_deactivated": True, "deactivated_at": now.isoformat(), "deactivation_reason": violation_type}})
        await db.driver_profiles.update_one({"user_id": user_id}, {"$set": {"is_online": False}})
        return {"action": "deactivated", "message": message}

    return {"action": action, "message": message}


async def check_user_status(user_id: str):
    """Check if a user is allowed to use the app (not suspended/deactivated)."""
    user = await db.users.find_one({"id": user_id})
    if not user:
        return {"allowed": False, "reason": "User not found"}

    if user.get("is_deactivated"):
        return {"allowed": False, "reason": "Account deactivated", "message": "Your account has been permanently deactivated due to policy violations. Contact support@nexryde.com to appeal."}
    if user.get("role") == "driver" and user.get("ghost_driver_lock", {}).get("active"):
        return {
            "allowed": False,
            "reason": "Ghost driver lock",
            "message": "Ghost Driver Protection is active. Reconfirm identity to unlock your account.",
        }
    if user.get("role") == "driver" and user.get("sim_swap_lock", {}).get("active"):
        return {
            "allowed": False,
            "reason": "SIM swap lock",
            "message": "SIM Swap Protection is active. Complete secondary identity reconfirmation to unlock your account.",
        }

    # Hard verification/compliance gates for drivers.
    if user.get("role") == "driver":
        profile = await db.driver_profiles.find_one({"user_id": user_id}) or {}
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
        if profile.get("suspended_reason") in {"expired_documents", "monthly_verification_overdue", "verification_recheck_required"}:
            return {
                "allowed": True,
                "can_go_online": False,
                "message": "Your account is restricted pending compliance update.",
            }

    suspended_until = user.get("suspended_until")
    if suspended_until:
        try:
            until_dt = datetime.fromisoformat(suspended_until.replace("Z", "+00:00"))
            if datetime.now(timezone.utc) < until_dt:
                remaining = until_dt - datetime.now(timezone.utc)
                hours = int(remaining.total_seconds() / 3600)
                return {"allowed": False, "reason": "Account suspended", "message": f"Your account is suspended. {hours} hours remaining.", "suspended_until": suspended_until}
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
            if datetime.now(timezone.utc) < until_dt:
                remaining = until_dt - datetime.now(timezone.utc)
                mins = int(remaining.total_seconds() / 60)
                return {"allowed": True, "can_book": False, "message": f"Booking is temporarily disabled for {mins} more minutes."}
            else:
                await db.users.update_one({"id": user_id}, {"$unset": {"booking_blocked_until": "", "block_reason": ""}})
        except (ValueError, TypeError):
            pass

    return {"allowed": True}


# ==================== API ENDPOINTS ====================

@enforcement_router.post("/enforcement/report")
async def report_violation(request: ReportViolationRequest):
    """Report a violation against a user."""
    if request.violation_type not in VIOLATION_CONFIG:
        raise HTTPException(status_code=400, detail=f"Unknown violation type. Valid types: {', '.join(VIOLATION_CONFIG.keys())}")
    result = await record_violation(
        user_id=request.reported_user_id,
        violation_type=request.violation_type,
        trip_id=request.trip_id,
        reporter_id=request.reporter_id,
        description=request.description,
    )
    return result


@enforcement_router.get("/enforcement/status/{user_id}")
async def get_enforcement_status(user_id: str):
    """Check if user is allowed to use the app."""
    return await check_user_status(user_id)


@enforcement_router.get("/enforcement/history/{user_id}")
async def get_violation_history(user_id: str):
    """Get user's violation history."""
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
    return {"policies": policies, "strike_system": {
        "warning": "3 strikes in 30 days",
        "suspension_24h": "5 strikes in 30 days",
        "suspension_7d": "7 strikes in 30 days",
        "deactivation": "7+ strikes or severe violations",
        "reset": "Strikes reset after 30 days of clean behavior",
    }}


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

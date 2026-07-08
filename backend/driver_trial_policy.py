"""
Per-driver trial policy: trips + day limits, grandfather configs, early-subscribe discount.

Defaults live in ``system_config`` key ``driver_trial_defaults`` (tunable without redeploy).
Per-driver overrides live on ``driver_profiles.trial_config``::

    { "trip_limit": 15, "day_limit": 14 }   # new drivers
    { "trip_limit": 20, "day_limit": null }  # grandfathered (no day cap)

Day clock starts at ``driver_profiles.trial_first_online_at`` (first successful go-online).
Trial trips count **completed** trips only.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from database import db
from notification_service import send_push_notification

logger = logging.getLogger(__name__)

SYSTEM_CONFIG_KEY = "driver_trial_defaults"
GRANDFATHER_EMAIL = "loopy9ice@gmail.com"

_BUILTIN_DEFAULTS: dict[str, Any] = {
    "default_trial_trip_limit": 15,
    "default_trial_day_limit": 14,
    "monthly_fee_ngn": 18000,
    "early_subscribe_discount_ngn": 3000,
    "early_subscribe_first_month_fee_ngn": 15000,
    "reminder_trips_threshold": 3,
    "reminder_days_threshold": 3,
}

_GRANDFATHER_TRIAL_CONFIG = {"trip_limit": 20, "day_limit": None}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _naive_utc(dt: datetime) -> datetime:
    if dt.tzinfo:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def _parse_dt(raw) -> Optional[datetime]:
    if raw is None:
        return None
    if isinstance(raw, datetime):
        return _naive_utc(raw)
    try:
        dt = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
        return _naive_utc(dt)
    except (TypeError, ValueError):
        return None


async def get_trial_defaults() -> dict[str, Any]:
    doc = await db.system_config.find_one({"key": SYSTEM_CONFIG_KEY})
    merged = dict(_BUILTIN_DEFAULTS)
    if doc:
        for k in _BUILTIN_DEFAULTS:
            if k in doc and doc[k] is not None:
                merged[k] = doc[k]
    return merged


_LEGACY_TRIAL_CONFIG = {"trip_limit": 20, "day_limit": None}


def resolve_trial_config(profile: Optional[dict]) -> dict[str, Any]:
    """Return {trip_limit, day_limit} from profile.

    Missing ``trial_config`` uses legacy-safe grandfather-style limits (20 trips, no day cap)
    so pre-policy drivers are never locked out or day-expired retroactively.
    Explicit ``trial_config`` on the profile always wins (new cohort defaults are persisted there).
    """
    cfg = (profile or {}).get("trial_config") if profile else None
    if isinstance(cfg, dict) and cfg.get("trip_limit") is not None:
        day_limit = cfg.get("day_limit")
        if day_limit is not None:
            try:
                day_limit = int(day_limit)
            except (TypeError, ValueError):
                day_limit = None
        return {
            "trip_limit": int(cfg["trip_limit"]),
            "day_limit": day_limit,
        }
    return dict(_LEGACY_TRIAL_CONFIG)


async def ensure_profile_trial_config(driver_id: str, profile: Optional[dict] = None) -> dict[str, Any]:
    """Persist default trial_config on profile when missing."""
    profile = profile or await db.driver_profiles.find_one({"user_id": driver_id}, {"_id": 0}) or {}
    existing = profile.get("trial_config")
    if isinstance(existing, dict) and existing.get("trip_limit") is not None:
        return resolve_trial_config(profile)

    defaults = await get_trial_defaults()
    cfg = {
        "trip_limit": int(defaults["default_trial_trip_limit"]),
        "day_limit": int(defaults["default_trial_day_limit"])
        if defaults.get("default_trial_day_limit") is not None
        else None,
    }
    await db.driver_profiles.update_one(
        {"user_id": driver_id},
        {"$set": {"trial_config": cfg}},
        upsert=True,
    )
    return cfg


async def record_first_go_online(driver_id: str) -> Optional[datetime]:
    """Start the day clock on first go-online (idempotent)."""
    profile = await db.driver_profiles.find_one(
        {"user_id": driver_id},
        {"_id": 0, "trial_first_online_at": 1, "trial_config": 1},
    ) or {}
    existing = _parse_dt(profile.get("trial_first_online_at"))
    if existing:
        return existing

    now = _utcnow()
    await db.driver_profiles.update_one(
        {"user_id": driver_id},
        {"$set": {"trial_first_online_at": now.isoformat()}},
        upsert=True,
    )
    return now


async def count_completed_trial_trips(driver_id: str) -> int:
    return await db.trips.count_documents({"driver_id": driver_id, "status": "completed"})


async def compute_trial_snapshot(driver_id: str, subscription: Optional[dict] = None) -> dict[str, Any]:
    """Live trial metrics without mutating subscription status."""
    profile = await db.driver_profiles.find_one({"user_id": driver_id}, {"_id": 0}) or {}
    cfg = resolve_trial_config(profile)
    defaults = await get_trial_defaults()

    trip_limit = int(cfg["trip_limit"])
    day_limit = cfg.get("day_limit")
    completed = await count_completed_trial_trips(driver_id)
    trips_remaining = max(0, trip_limit - completed)

    days_remaining: Optional[int] = None
    days_elapsed = 0
    first_online = _parse_dt(profile.get("trial_first_online_at"))
    expired_by_days = False
    if day_limit is not None and first_online is not None:
        days_elapsed = (_naive_utc(_utcnow()) - first_online).days
        days_remaining = max(0, int(day_limit) - days_elapsed)
        expired_by_days = days_elapsed >= int(day_limit)
    elif day_limit is not None and first_online is None:
        days_remaining = int(day_limit)

    expired_by_trips = completed >= trip_limit
    trial_expired = expired_by_trips or expired_by_days

    trips_pct = (completed / trip_limit) if trip_limit > 0 else 1.0
    days_pct = (
        (days_elapsed / int(day_limit)) if day_limit and day_limit > 0 and first_online else 0.0
    )
    emphasize_days = day_limit is not None and (
        days_pct >= trips_pct or (trips_remaining > 3 and days_remaining is not None and days_remaining <= 3)
    )

    urgency = "normal"
    if trial_expired:
        urgency = "expired"
    elif trips_remaining <= int(defaults["reminder_trips_threshold"]) or (
        days_remaining is not None and days_remaining <= int(defaults["reminder_days_threshold"])
    ):
        urgency = "critical"
    elif trips_remaining <= 5 or (days_remaining is not None and days_remaining <= 5):
        urgency = "warning"

    early_discount = int(defaults["early_subscribe_discount_ngn"])
    monthly_fee = int(defaults["monthly_fee_ngn"])
    first_month_fee = int(defaults["early_subscribe_first_month_fee_ngn"])

    return {
        "trial_config": cfg,
        "trial_trips_target": trip_limit,
        "trial_trips_completed": completed,
        "trial_trips_remaining": trips_remaining,
        "trial_day_limit": day_limit,
        "trial_days_remaining": days_remaining,
        "trial_days_elapsed": days_elapsed,
        "trial_first_online_at": profile.get("trial_first_online_at"),
        "trial_expired": trial_expired,
        "trial_expired_by_trips": expired_by_trips,
        "trial_expired_by_days": expired_by_days,
        "trial_emphasis": "days" if emphasize_days else "trips",
        "trial_urgency": urgency,
        "early_subscribe_discount_ngn": early_discount,
        "early_subscribe_first_month_fee_ngn": first_month_fee,
        "monthly_fee_ngn": monthly_fee,
        "early_subscribe_message": (
            f"Subscribe now and save ₦{early_discount:,} on your first month."
            if not trial_expired
            else None
        ),
        "subscription": subscription or {},
    }


async def evaluate_driver_trial(driver_id: str, subscription: dict) -> dict:
    """
    Enrich subscription with live trial state; persist ``pending_payment`` when expired.
    """
    if not subscription or subscription.get("status") not in {"trial", "pending_payment"}:
        return subscription

    snap = await compute_trial_snapshot(driver_id, subscription)
    sub = dict(subscription)
    now = _naive_utc(_utcnow())

    sub["trial_trips_completed"] = snap["trial_trips_completed"]
    sub["trial_trips_target"] = snap["trial_trips_target"]
    sub["trial_trips_remaining"] = snap["trial_trips_remaining"]
    sub["trial_day_limit"] = snap["trial_day_limit"]
    sub["trial_days_remaining"] = snap["trial_days_remaining"]
    sub["trial_emphasis"] = snap["trial_emphasis"]
    sub["trial_urgency"] = snap["trial_urgency"]
    sub["early_subscribe_discount_ngn"] = snap["early_subscribe_discount_ngn"]
    sub["early_subscribe_first_month_fee_ngn"] = snap["early_subscribe_first_month_fee_ngn"]
    sub["early_subscribe_message"] = snap["early_subscribe_message"]

    if snap["trial_expired"]:
        if sub.get("status") == "trial":
            await db.subscriptions.update_one(
                {"id": sub["id"]},
                {
                    "$set": {
                        "status": "pending_payment",
                        "trial_completed": True,
                        "trial_active": False,
                        "updated_at": now,
                    }
                },
            )
        sub["status"] = "pending_payment"
        sub["trial_completed"] = True
        sub["trial_active"] = False
        sub["trial_trips_remaining"] = 0
        sub["days_remaining"] = 0
        sub["trial_message"] = (
            "Your free trial has ended. Subscribe to keep receiving trips."
        )
    else:
        sub["trial_active"] = True
        sub["trial_completed"] = False
        sub["days_remaining"] = snap["trial_days_remaining"] or 0
        trips_left = snap["trial_trips_remaining"]
        days_left = snap["trial_days_remaining"]
        if snap["trial_day_limit"] is not None and days_left is not None:
            sub["trial_message"] = (
                f"Free trial: {snap['trial_trips_completed']}/{snap['trial_trips_target']} trips · "
                f"{days_left} day{'s' if days_left != 1 else ''} left"
            )
        else:
            sub["trial_message"] = (
                f"Free trial: {snap['trial_trips_completed']}/{snap['trial_trips_target']} trips · "
                f"{trips_left} remaining"
            )

    await maybe_send_trial_reminder_pushes(driver_id, snap, sub)
    return sub


def _subscription_end_date_valid(sub: dict) -> bool:
    expiry = sub.get("end_date")
    if not expiry:
        return True
    try:
        exp_dt = datetime.fromisoformat(str(expiry).replace("Z", "+00:00"))
        if exp_dt.tzinfo is None:
            exp_dt = exp_dt.replace(tzinfo=timezone.utc)
    except Exception:
        return True
    return _utcnow() < exp_dt


async def resolve_driver_plan_entitlement(driver_id: str) -> dict[str, Any]:
    """
    Canonical driver plan gate — same rules as go-online (prepare_driver_online).

    Entitled when: active paid subscription, grace period, or live active trial
    (``compute_trial_snapshot`` via ``evaluate_driver_trial`` → ``trial_active``).

    Auto-provisions trial for verified drivers (``_ensure_auto_trial_for_verified_driver``)
    so Work Zone works before first go-online, matching the go-online path.
    """
    from routers.payments import _ensure_auto_trial_for_verified_driver, _evaluate_driver_trial

    sub = await _ensure_auto_trial_for_verified_driver(driver_id)
    if not sub:
        return {"entitled": False, "plan_status": "inactive", "trial_active": False}

    status = sub.get("status")
    if status == "active":
        entitled = _subscription_end_date_valid(sub)
        return {
            "entitled": entitled,
            "plan_status": "active" if entitled else "inactive",
            "trial_active": False,
        }
    if status == "grace_period":
        return {"entitled": True, "plan_status": "grace_period", "trial_active": False}
    if status == "trial":
        evaluated = await _evaluate_driver_trial(driver_id, sub)
        trial_active = (
            evaluated.get("status") == "trial" and evaluated.get("trial_active", False)
        )
        return {
            "entitled": trial_active,
            "plan_status": "trial" if trial_active else "inactive",
            "trial_active": bool(evaluated.get("trial_active", False)),
        }
    return {"entitled": False, "plan_status": "inactive", "trial_active": False}


async def is_driver_trial_valid_for_offers(driver_id: str) -> bool:
    """Server-side gate for dispatch / go-online (evaluates live state)."""
    plan = await resolve_driver_plan_entitlement(driver_id)
    return bool(plan.get("entitled"))


async def resolve_subscription_checkout_amount(driver_id: str, tier: str, base_amount_ngn: float) -> tuple[float, dict]:
    """
    Apply early-subscribe first-month discount when paying during an active trial.
    Returns (amount_ngn, metadata_dict).
    """
    meta: dict[str, Any] = {"base_amount_ngn": base_amount_ngn}
    if tier != "city_rider":
        return base_amount_ngn, meta

    sub = await db.subscriptions.find_one({"driver_id": driver_id}, sort=[("created_at", -1)])
    if not sub or sub.get("status") != "trial":
        return base_amount_ngn, meta

    evaluated = await evaluate_driver_trial(driver_id, sub)
    if evaluated.get("status") != "trial" or not evaluated.get("trial_active"):
        return base_amount_ngn, meta

    if sub.get("first_subscription_discount_applied"):
        return base_amount_ngn, meta

    defaults = await get_trial_defaults()
    discounted = float(defaults["early_subscribe_first_month_fee_ngn"])
    meta["early_subscribe_discount_applied"] = True
    meta["early_subscribe_discount_ngn"] = int(defaults["early_subscribe_discount_ngn"])
    meta["amount_before_discount_ngn"] = base_amount_ngn
    return discounted, meta


async def mark_first_subscription_discount_used(driver_id: str) -> None:
    await db.subscriptions.update_one(
        {"driver_id": driver_id},
        {"$set": {"first_subscription_discount_applied": True, "updated_at": _naive_utc(_utcnow())}},
    )


async def maybe_send_trial_reminder_pushes(driver_id: str, snap: dict, sub: dict) -> None:
    """Idempotent pushes: 3 trips left, 3 days left, on expiry."""
    defaults = await get_trial_defaults()
    reminders = (await db.driver_profiles.find_one({"user_id": driver_id}, {"trial_reminder_pushes": 1}) or {}).get(
        "trial_reminder_pushes"
    ) or {}

    async def _send_once(key: str, title: str, body: str, push_type: str) -> None:
        if reminders.get(key):
            return
        try:
            await send_push_notification(
                driver_id,
                title,
                body,
                {"type": push_type, "route": "/driver/subscription"},
                source="trial_reminder",
            )
            await db.driver_profiles.update_one(
                {"user_id": driver_id},
                {"$set": {f"trial_reminder_pushes.{key}": _utcnow().isoformat()}},
            )
        except Exception as exc:
            logger.debug("trial reminder push skipped driver=%s key=%s: %s", driver_id, key, exc)

    trips_left = snap["trial_trips_remaining"]
    days_left = snap["trial_days_remaining"]
    trip_threshold = int(defaults["reminder_trips_threshold"])
    day_threshold = int(defaults["reminder_days_threshold"])

    if snap["trial_expired"]:
        await _send_once(
            "expired",
            "Your trial ended",
            "Subscribe to go back online and keep receiving trips.",
            "trial_ended",
        )
        return

    if trips_left == trip_threshold:
        await _send_once(
            "trips_3",
            f"{trips_left} free trips left",
            "Subscribe during your trial and save on your first month.",
            "trial_trips_low",
        )

    if days_left is not None and days_left == day_threshold:
        await _send_once(
            "days_3",
            f"{days_left} days left on your trial",
            "Subscribe now to keep earning without interruption.",
            "trial_days_low",
        )


async def trial_unlock_message() -> str:
    defaults = await get_trial_defaults()
    trips = int(defaults["default_trial_trip_limit"])
    days = defaults.get("default_trial_day_limit")
    if days is not None:
        return (
            f"Complete verification to unlock your free trial "
            f"({trips} trips or {int(days)} days from first go-online)."
        )
    return f"Complete verification to unlock your free {trips}-trip activity trial."


async def tick_online_trial_expiry() -> int:
    """Re-evaluate online trial drivers; offline + notify when trial expires (day or trip cap)."""
    profiles = await db.driver_profiles.find(
        {"is_online": True},
        {"_id": 0, "user_id": 1},
    ).to_list(500)
    expired_count = 0
    for profile in profiles:
        driver_id = profile.get("user_id")
        if not driver_id:
            continue
        sub = await db.subscriptions.find_one(
            {"driver_id": driver_id, "status": "trial"},
            sort=[("created_at", -1)],
        )
        if not sub:
            continue
        evaluated = await evaluate_driver_trial(driver_id, sub)
        if evaluated.get("status") != "pending_payment":
            continue
        try:
            from driver_presence import set_driver_offline

            await set_driver_offline(driver_id)
            await db.driver_profiles.update_one(
                {"user_id": driver_id},
                {
                    "$set": {"is_online": False, "went_offline_reason": "trial_expired"},
                    "$unset": {"online_session_started_at": ""},
                },
            )
        except Exception as exc:
            logger.warning("trial expiry offline failed driver=%s: %s", driver_id, exc)
        expired_count += 1
    return expired_count


async def seed_grandfathered_trial_configs() -> int:
    """
    One-time style seed: set grandfather trial_config for configured emails.
    Returns count of profiles updated.
    """
    user = await db.users.find_one({"email": GRANDFATHER_EMAIL}, {"_id": 0, "id": 1})
    if not user or not user.get("id"):
        logger.warning("Grandfather trial seed: user %s not found", GRANDFATHER_EMAIL)
        return 0

    driver_id = user["id"]
    await db.driver_profiles.update_one(
        {"user_id": driver_id},
        {"$set": {"trial_config": _GRANDFATHER_TRIAL_CONFIG}},
        upsert=True,
    )
    await db.subscriptions.update_many(
        {"driver_id": driver_id, "status": {"$in": ["trial", "pending_payment"]}},
        {"$set": {"trial_trips_target": _GRANDFATHER_TRIAL_CONFIG["trip_limit"]}},
    )
    logger.info("Grandfathered trial config applied driver=%s email=%s", driver_id, GRANDFATHER_EMAIL)
    return 1


async def ensure_system_trial_defaults() -> None:
    """Insert default system_config document if missing."""
    existing = await db.system_config.find_one({"key": SYSTEM_CONFIG_KEY})
    if existing:
        return
    doc = {"key": SYSTEM_CONFIG_KEY, **_BUILTIN_DEFAULTS, "updated_at": _utcnow().isoformat()}
    await db.system_config.insert_one(doc)
    logger.info("Seeded system_config %s", SYSTEM_CONFIG_KEY)

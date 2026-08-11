"""Server feature flags (system_config.feature_flags) with a short in-process cache.

NexRyde does not hold customer funds — riders pay drivers by cash/transfer.
Driver Squad subscription payments are a separate flow and are not gated here.
"""
from __future__ import annotations

import time
from typing import Any

# Single source of truth for flag defaults (admin_ops reads these too).
FLAG_DEFAULTS: dict[str, str] = {
    "work_zone": "all",
    "favourite_driver": "all",
    "referrals": "all",
    "promotions": "all",
    "chat": "all",
    "call_masking": "beta",
    # Platform kill switches (Uber-style incident response). Default ON.
    "booking": "all",
    "dispatch": "all",
    # Driver KYC posture. Default OFF = clean+complete document uploads are
    # auto-approved (fast onboarding) with the fraud/duplicate/image checks still
    # applied. Flip to "all"/"on" to force EVERY submission into the admin review
    # queue (pending_review) — real manual KYC — without a rebuild:
    #   POST /api/admin/feature-flags {"driver_manual_review": "all"}
    "driver_manual_review": "off",
}

_ENABLED_VALUES = {"all", "on", "true", "enabled", "beta", "1"}
_DISABLED_VALUES = {"off", "false", "disabled", "0", "kill", "maintenance"}

_cache: dict[str, Any] = {"at": 0.0, "flags": None}
_CACHE_TTL_SECONDS = 15.0  # faster kill-switch propagation across replicas


def flag_value_enabled(value: Any) -> bool:
    return str(value or "").strip().lower() in _ENABLED_VALUES


def flag_value_disabled(value: Any) -> bool:
    return str(value or "").strip().lower() in _DISABLED_VALUES


def invalidate_feature_flags_cache() -> None:
    _cache["flags"] = None
    _cache["at"] = 0.0


async def get_feature_flags(db: Any) -> dict[str, str]:
    now = time.monotonic()
    if _cache["flags"] is not None and (now - _cache["at"]) < _CACHE_TTL_SECONDS:
        return _cache["flags"]
    doc = await db.system_config.find_one({"key": "feature_flags"}, {"_id": 0, "value": 1})
    flags = {**FLAG_DEFAULTS, **((doc or {}).get("value") or {})}
    _cache["flags"] = flags
    _cache["at"] = now
    return flags


async def is_booking_enabled(db: Any) -> bool:
    """Stop new trip requests. On flag-read failure, stay OPEN so a DB blip is not an outage."""
    try:
        flags = await get_feature_flags(db)
    except Exception:
        return True
    raw = flags.get("booking", FLAG_DEFAULTS["booking"])
    if flag_value_disabled(raw):
        return False
    return flag_value_enabled(raw)


async def is_dispatch_enabled(db: Any) -> bool:
    """Stop matching / go-online intake. Flag-read failure → stay OPEN."""
    try:
        flags = await get_feature_flags(db)
    except Exception:
        return True
    raw = flags.get("dispatch", FLAG_DEFAULTS["dispatch"])
    if flag_value_disabled(raw):
        return False
    return flag_value_enabled(raw)


async def is_driver_manual_review_enabled(db: Any) -> bool:
    """When enabled, every driver document submission goes to the admin review
    queue (pending_review) instead of auto-approving clean uploads. On flag-read
    failure, fall back to the platform default (off = auto-approve) so a DB blip
    never silently freezes all driver onboarding."""
    try:
        flags = await get_feature_flags(db)
    except Exception:
        return flag_value_enabled(FLAG_DEFAULTS.get("driver_manual_review"))
    return flag_value_enabled(
        flags.get("driver_manual_review", FLAG_DEFAULTS["driver_manual_review"])
    )


BOOKING_DISABLED_DETAIL = (
    "NEXRYDE booking is temporarily paused for maintenance. Please try again shortly."
)
DISPATCH_DISABLED_DETAIL = (
    "Driver matching is temporarily paused. Please try again in a few minutes."
)

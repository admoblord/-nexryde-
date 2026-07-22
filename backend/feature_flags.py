"""Server feature flags (system_config.feature_flags) with a short in-process cache.

LAUNCH POLICY: the fare wallet is DISABLED by default ("wallet": "off").
Riders pay drivers directly (cash or bank transfer to the driver's account);
NexRyde holds no fare float. The driver subscription (Squad checkout) is a
separate flow and is NOT gated by this flag.

Re-enable later without a rebuild: POST /api/admin/feature-flags {"wallet": "all"}.
"""
from __future__ import annotations

import time
from typing import Any

# Single source of truth for flag defaults (admin_ops reads these too).
FLAG_DEFAULTS: dict[str, str] = {
    "work_zone": "all",
    "favourite_driver": "all",
    "wallet": "off",  # fare wallet off for launch — cash + direct transfer only
    "referrals": "all",
    "promotions": "all",
    "chat": "all",
    "call_masking": "beta",
}

_ENABLED_VALUES = {"all", "on", "true", "enabled", "beta", "1"}

_cache: dict[str, Any] = {"at": 0.0, "flags": None}
_CACHE_TTL_SECONDS = 30.0


def flag_value_enabled(value: Any) -> bool:
    return str(value or "").strip().lower() in _ENABLED_VALUES


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


async def is_wallet_enabled(db: Any) -> bool:
    """Money safety: fail CLOSED — if flags can't be read, the wallet stays off."""
    try:
        flags = await get_feature_flags(db)
    except Exception:
        return False
    return flag_value_enabled(flags.get("wallet"))

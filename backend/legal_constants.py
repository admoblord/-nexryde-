"""Legal document versions — bump when Terms or Privacy materially changes."""
from __future__ import annotations

import os

# ISO date or semver; must match frontend src/constants/legal.ts
CURRENT_TERMS_VERSION = os.getenv("NEXRYDE_TERMS_VERSION", "2026-07-01")

CURRENT_PRIVACY_VERSION = os.getenv("NEXRYDE_PRIVACY_VERSION", "2026-07-01")


def user_terms_current(user: dict | None) -> bool:
    if not user:
        return False
    if not user.get("terms_accepted"):
        return False
    accepted_version = (user.get("terms_version") or "").strip()
    return accepted_version == CURRENT_TERMS_VERSION


def user_privacy_current(user: dict | None) -> bool:
    if not user:
        return False
    if user.get("privacy_accepted"):
        return (user.get("privacy_version") or "").strip() == CURRENT_PRIVACY_VERSION
    # Legacy accounts: current terms acceptance bundled privacy before separate tracking.
    return user_terms_current(user)


def user_legal_current(user: dict | None) -> bool:
    return user_terms_current(user) and user_privacy_current(user)

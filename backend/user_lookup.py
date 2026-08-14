"""Lean MongoDB user lookups — never pull biometric blobs on hot paths."""
from __future__ import annotations

from typing import Any, Optional

from database import db
from user_biometrics import LOGIN_MAX_TIME_MS, USER_BLOB_EXCLUDE_PROJECTION

# Middleware / auth-context checks (role, status flags).
AUTH_CONTEXT_PROJECTION: dict[str, Any] = {
    "_id": 0,
    "id": 1,
    "email": 1,
    "name": 1,
    "role": 1,
    "phone": 1,
    "rating": 1,
    "total_trips": 1,
    "wallet_balance": 1,
    "city": 1,
    "earnings_frozen": 1,
    "subscription_active": 1,
    "subscription_expiry": 1,
    "terms_accepted": 1,
    "terms_version": 1,
    "privacy_accepted": 1,
    "privacy_version": 1,
    "verification_status": 1,
    "is_deactivated": 1,
}

# Profile API: all user fields except multi-KB blobs (defense-in-depth post-migration).
# profile_image is often a 20–50KB data-URI and must not ride on every tab prefetch.
PROFILE_API_PROJECTION: dict[str, Any] = {
    **USER_BLOB_EXCLUDE_PROJECTION,
    "profile_image": 0,
    "_id": 1,
}

QUERY_MAX_TIME_MS = LOGIN_MAX_TIME_MS


async def find_user_by_id(
    user_id: str,
    projection: Optional[dict[str, Any]] = None,
    *,
    max_time_ms: int = LOGIN_MAX_TIME_MS,
) -> Optional[dict[str, Any]]:
    if not user_id:
        return None
    return await db.users.find_one(
        {"id": user_id},
        projection or AUTH_CONTEXT_PROJECTION,
        max_time_ms=max_time_ms,
    )

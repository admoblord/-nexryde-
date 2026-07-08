"""Server-side legal compliance guards for booking and driver actions."""
from __future__ import annotations

from typing import Any

from fastapi import HTTPException

from legal_constants import user_legal_current

LEGAL_USER_PROJECTION: dict[str, Any] = {
    "_id": 0,
    "id": 1,
    "role": 1,
    "terms_accepted": 1,
    "terms_version": 1,
    "privacy_accepted": 1,
    "privacy_version": 1,
}

COMPLIANCE_MESSAGE = (
    "Please accept the latest Terms of Service and Privacy Policy in the app before continuing."
)


def assert_user_legal_compliance(user: dict | None, *, role: str | None = None) -> None:
    """Raise HTTP 403/404 when terms or privacy acceptance is missing or stale."""
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if role and user.get("role") != role:
        raise HTTPException(status_code=403, detail=f"{role.capitalize()} account required")
    if not user_legal_current(user):
        raise HTTPException(status_code=403, detail=COMPLIANCE_MESSAGE)

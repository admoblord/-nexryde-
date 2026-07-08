"""Audit trail for admin access to encrypted government identifiers."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import Request

from database import db


def _client_ip(request: Request | None) -> str | None:
    if not request:
        return None
    forwarded = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    return forwarded or (request.client.host if request.client else None)


async def log_pii_access(
    *,
    admin_email: str,
    subject_user_id: str,
    subject_role: str,
    pii_type: str,
    action: str,
    reason: str,
    request: Request | None = None,
    subject_name: str | None = None,
    extra: Optional[dict[str, Any]] = None,
) -> None:
    """Permanent audit entry — who accessed whose PII, when, and why."""
    entry = {
        "accessed_by": admin_email,
        "subject_user_id": subject_user_id,
        "subject_role": subject_role,
        "subject_name": subject_name,
        "pii_type": pii_type,
        "action": action,
        "reason": reason.strip(),
        "accessed_at": datetime.now(timezone.utc).isoformat(),
        "ip": _client_ip(request),
    }
    if extra:
        entry.update(extra)
    await db.admin_pii_access_log.insert_one(entry)

"""Insert in-app inbox rows and publish realtime badge updates."""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from database import db

logger = logging.getLogger(__name__)


async def insert_user_notification(
    *,
    user_id: str,
    type: str,
    title: str,
    message: str,
    data: Optional[dict[str, Any]] = None,
    id: Optional[str] = None,
    read: bool = False,
    created_at: Any = None,
    publish_badge: bool = True,
    **extra: Any,
) -> dict[str, Any]:
    """Insert a ``notifications`` row and push ``notification_badge`` over inbox WS."""
    uid = str(user_id or "").strip()
    # Stamp catalog category so badge exclusion works without per-caller wiring.
    if "category" not in extra:
        try:
            from notification_catalog import get_kind_meta

            cat = get_kind_meta(type).get("category")
            if cat is not None:
                extra["category"] = getattr(cat, "value", str(cat))
        except Exception:
            logger.debug("notification category stamp failed type=%s", type, exc_info=True)
    doc: dict[str, Any] = {
        "id": id or str(uuid.uuid4()),
        "user_id": uid,
        "type": type,
        "title": title,
        "message": message,
        "data": data if data is not None else {},
        "created_at": created_at if created_at is not None else datetime.now(timezone.utc).isoformat(),
        "read": bool(read),
        **extra,
    }
    await db.notifications.insert_one(doc)
    if publish_badge and uid:
        try:
            from routers.realtime_dispatch import publish_notification_badge

            await publish_notification_badge(uid)
        except Exception as exc:
            logger.debug("badge publish after insert failed user=%s: %s", uid, exc)
    return doc

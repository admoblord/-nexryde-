"""Notify rider/driver emergency contacts (Uber-style SOS SMS)."""
from __future__ import annotations

import logging
from typing import Any, Optional

from sms_service import send_sms

logger = logging.getLogger(__name__)


def _maps_link(lat: Optional[float], lng: Optional[float]) -> str:
    if lat is None or lng is None:
        return "location unavailable"
    try:
        return f"https://maps.google.com/?q={float(lat)},{float(lng)}"
    except (TypeError, ValueError):
        return "location unavailable"


def build_emergency_sms(
    *,
    user_name: str,
    role: str,
    trip_id: str,
    lat: Optional[float],
    lng: Optional[float],
    reason: str = "SOS",
) -> str:
    loc = _maps_link(lat, lng)
    return (
        f"NEXRYDE {reason}: {user_name} ({role}) needs help on trip {trip_id}. "
        f"Live location: {loc}. Call them or emergency services now."
    )


async def notify_emergency_contacts(
    contacts: list[dict[str, Any]] | None,
    *,
    user_name: str,
    role: str,
    trip_id: str,
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    reason: str = "SOS",
) -> int:
    """SMS each contact with a phone. Returns count successfully handed to provider."""
    if not contacts:
        return 0
    message = build_emergency_sms(
        user_name=user_name or "A NEXRYDE user",
        role=role or "user",
        trip_id=trip_id or "unknown",
        lat=lat,
        lng=lng,
        reason=reason,
    )
    sent = 0
    seen: set[str] = set()
    for raw in contacts:
        if not isinstance(raw, dict):
            continue
        phone = str(raw.get("phone") or raw.get("number") or "").strip()
        if not phone or phone in seen:
            continue
        seen.add(phone)
        ok = await send_sms(phone, message, purpose=f"emergency_{reason.lower()}")
        if ok:
            sent += 1
    if contacts and sent == 0:
        logger.warning(
            "emergency_sms_none_sent trip=%s contacts=%s (configure TERMII/TWILIO)",
            trip_id,
            len(contacts),
        )
    return sent

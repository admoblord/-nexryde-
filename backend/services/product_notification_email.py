"""
Brevo transactional emails for product flows (not OTP): welcome, violations, receipts,
payment reminders, vehicle approval, etc.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Optional

from database import db
from pymongo import ReturnDocument

from services.brevo_transactional_mail import (
    BrevoMailError,
    brevo_is_configured,
    brevo_send_transactional,
    brevo_simple_notification_html,
)

logger = logging.getLogger(__name__)


def _user_allows_optional_email(channels: Any) -> bool:
    if not isinstance(channels, dict):
        return True
    return channels.get("email", True) is not False


async def notify_user_brevo_email(
    user_id: str,
    *,
    subject: str,
    body_plain: str,
    tags: list[str],
    respect_notification_channels: bool = True,
) -> bool:
    """Send a transactional email to the user's verified mailbox when Brevo is configured."""
    if not brevo_is_configured():
        return False
    user = await db.users.find_one(
        {"id": user_id},
        {"email": 1, "notification_channels": 1},
    )
    if not user:
        return False
    mail = (user.get("email") or "").strip()
    if not mail:
        return False
    if respect_notification_channels and not _user_allows_optional_email(user.get("notification_channels")):
        return False
    sub = (subject or "NEXRYDE")[:998]
    body = body_plain.strip() if body_plain else ""
    try:
        await brevo_send_transactional(
            recipients=[mail],
            subject=sub,
            text_content=f"{sub}\n\n{body}" if body else sub,
            html_content=brevo_simple_notification_html(title=sub, body_plain=body or sub),
            tags=tags[:16],
        )
        return True
    except BrevoMailError as exc:
        logger.warning("Brevo product email skipped user=%s: %s", user_id, exc)
        return False


def schedule_notify_user_brevo_email(
    user_id: str,
    *,
    subject: str,
    body_plain: str,
    tags: list[str],
    respect_notification_channels: bool = True,
) -> None:
    async def _run() -> None:
        try:
            await notify_user_brevo_email(
                user_id,
                subject=subject,
                body_plain=body_plain,
                tags=tags,
                respect_notification_channels=respect_notification_channels,
            )
        except Exception:
            logger.exception("schedule_notify_user_brevo_email failed user=%s", user_id)

    asyncio.create_task(_run())


async def send_registration_welcome_email(*, to_email: str, name: str, role: str) -> None:
    if not brevo_is_configured():
        return
    label = "driver" if role == "driver" else "rider"
    rn = (name or "there").strip()
    sub = "Welcome to NEXRYDE"
    body = (
        f"Hi {rn},\n\n"
        f"Your {label} account is ready. You can book premium rides, manage your wallet, "
        f"and get trip updates in the app.\n\n"
        f"If you did not create this account, contact support immediately.\n\n"
        f"— NEXRYDE"
    )
    try:
        await brevo_send_transactional(
            recipients=[to_email.strip().lower()],
            subject=sub,
            text_content=body,
            html_content=brevo_simple_notification_html(title=sub, body_plain=body),
            tags=["nexryde-welcome", f"role-{label}"],
        )
    except BrevoMailError as exc:
        logger.warning("Welcome email skipped: %s", exc)


def schedule_registration_welcome_email(*, to_email: str, name: str, role: str) -> None:
    async def _run() -> None:
        try:
            await send_registration_welcome_email(to_email=to_email, name=name, role=role)
        except Exception:
            logger.exception("schedule_registration_welcome_email failed")

    asyncio.create_task(_run())


def _receipt_lines(trip: dict) -> tuple[str, str]:
    trip_id = trip.get("id") or ""
    pickup_loc = trip.get("pickup_location") or trip.get("pickup", {})
    dropoff_loc = trip.get("dropoff_location") or trip.get("dropoff", {})
    pickup_address = (
        pickup_loc.get("address", pickup_loc) if isinstance(pickup_loc, dict) else str(pickup_loc)
    )
    dropoff_address = (
        dropoff_loc.get("address", dropoff_loc) if isinstance(dropoff_loc, dict) else str(dropoff_loc)
    )
    rid = f"NXR-{str(trip_id)[:8].upper()}" if trip_id else "NEXRYDE"
    fare = trip.get("fare", 0)
    try:
        fare_f = float(fare)
    except (TypeError, ValueError):
        fare_f = 0.0
    pm = trip.get("payment_method", "cash")
    ca = trip.get("completed_at")
    if hasattr(ca, "isoformat"):
        date_s = ca.isoformat()
    else:
        date_s = str(ca or "")
    lines = (
        f"Receipt #{rid}\n"
        f"Trip ID: {trip_id}\n"
        f"Date: {date_s}\n\n"
        f"Pickup:\n{pickup_address}\n\n"
        f"Drop-off:\n{dropoff_address}\n\n"
        f"Fare: ₦{fare_f:,.0f}\n"
        f"Payment: {pm}\n"
        f"Status: {trip.get('status', 'completed')}\n"
    )
    return rid, lines.strip()


async def send_trip_receipt_emails_once(trip_id: str) -> None:
    """
    Idempotent: sends rider + driver receipt when payment_status is completed
    and receipt_email_sent_at was not yet set.
    """
    if not brevo_is_configured():
        return
    ts = datetime.now(timezone.utc).isoformat()
    trip = await db.trips.find_one_and_update(
        {
            "id": trip_id,
            "payment_status": "completed",
            "receipt_email_sent_at": {"$exists": False},
        },
        {"$set": {"receipt_email_sent_at": ts}},
        return_document=ReturnDocument.AFTER,
    )
    if not trip:
        return
    receipt_label, plain_body = _receipt_lines(trip)
    rider_id = trip.get("rider_id")
    driver_id = trip.get("driver_id")
    sub = f"NEXRYDE trip receipt ({receipt_label})"
    if rider_id:
        await notify_user_brevo_email(
            rider_id,
            subject=sub,
            body_plain=plain_body + "\n\nThank you for riding with NEXRYDE.",
            tags=["nexryde-trip-receipt", "recipient-rider"],
            respect_notification_channels=False,
        )
    if driver_id:
        await notify_user_brevo_email(
            driver_id,
            subject=sub + " — driver copy",
            body_plain=plain_body + "\n\nDriver copy for your records.",
            tags=["nexryde-trip-receipt", "recipient-driver"],
            respect_notification_channels=False,
        )


def schedule_trip_receipt_emails_after_payment(trip_id: str) -> None:
    async def _run() -> None:
        try:
            await send_trip_receipt_emails_once(trip_id)
        except Exception:
            logger.exception("trip receipt email failed trip_id=%s", trip_id)

    asyncio.create_task(_run())

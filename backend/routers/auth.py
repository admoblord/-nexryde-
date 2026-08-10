"""Auth Router - Authentication, OTP, Registration, and Session Management for NEXRYDE."""
from fastapi import APIRouter, HTTPException, Response, Request, Query, status
from pydantic import BaseModel, Field, EmailStr, ConfigDict, AliasChoices
from typing import Optional, List
from datetime import datetime, timezone, timedelta
from uuid import uuid4
import asyncio
import hashlib as _hashlib
import logging
import os
import random
import uuid
import re
import smtplib
from email.message import EmailMessage

import httpx

from database import db
from pii_encryption import nin_storage_fields, public_nin_fields, strip_sensitive_pii
from nin_registry_verify import (
    verify_nin_with_full_name,
    finalize_nin_verification_from_result,
    nin_verification_audit_fields,
)
from user_biometrics import (
    LOGIN_MAX_TIME_MS,
    USER_BLOB_EXCLUDE_PROJECTION,
    get_reference_face_image,
    upsert_face_template,
)
from face_match import (
    face_template_match_confidence,
    FACE_MATCH_SENSITIVE_MIN,
    FACE_MATCH_STRONG_MIN,
    FACE_TEMPLATE_FORTRESS_REJECT_BELOW,
    FACE_TEMPLATE_SIMSWAP_MIN,
)
from security_advanced import create_jwt_token, auth_limiter, otp_limiter, check_brute_force, record_failed_login, clear_login_attempts

from services.brevo_transactional_mail import (
    BrevoMailError,
    brevo_is_configured,
    brevo_send_transactional,
    brevo_simple_notification_html,
)
from services.nexryde_brevo_unified_otp import (
    request_otp as brevo_unified_request_otp,
    verify_otp as brevo_unified_verify_otp,
    otp_status as brevo_unified_otp_status,
    OTP_EXPIRY_SECONDS as BREVO_UNIFIED_OTP_EXPIRY_SECONDS,
    GENERIC_REQUEST_RATE,
    GENERIC_VERIFY_FAIL,
    GENERIC_SERVER,
)

logger = logging.getLogger('server')
auth_router = APIRouter(prefix="/api", tags=["Auth"])

# Login must not pull multi-MB face blobs over Atlas — causes NetworkTimeout on existing users.
_LOGIN_USER_PROJECTION = {
    "_id": 1,
    "id": 1,
    "email": 1,
    "name": 1,
    "role": 1,
    "phone": 1,
    "profile_image": 1,
    "rating": 1,
    "verification_status": 1,
    "driver_verification_status": 1,
    "city": 1,
    "wallet_balance": 1,
    "nin_verified": 1,
    "subscription_status": 1,
    "is_suspended": 1,
    "suspension_reason": 1,
    "terms_accepted": 1,
    "terms_version": 1,
    "terms_accepted_at": 1,
    "privacy_accepted": 1,
    "privacy_version": 1,
    "privacy_accepted_at": 1,
    "rider_verification_completed": 1,
    "onboarding_complete": 1,
}

# Config
def _env_truthy(name: str) -> bool:
    return (os.environ.get(name) or "").strip().lower() in ("1", "true", "yes", "on")


# When true, phone OTP is stored and logged — no SMS is sent (local/dev only).
SMS_OTP_MOCK = _env_truthy("SMS_OTP_MOCK")
EMERGENT_AUTH_URL = os.environ.get('EMERGENT_AUTH_URL', '')

# OTP Configuration
OTP_EXPIRY_MINUTES = 10
OTP_MAX_ATTEMPTS = 3
OTP_RESEND_COOLDOWN_SECONDS = 60
OTP_MAX_DAILY_REQUESTS = 10
EMAIL_OTP_VERIFICATION_TTL_HOURS = 24
# Aliases for driver fortress (see face_match.py for semantics).
FORTRESS_FACE_MIN_CONFIDENCE = FACE_MATCH_STRONG_MIN
# Phone-style “same person” template match; not used for wallet/vault (those use face_match_confidence in drivers).
FORTRESS_FACE_BLOCK_BELOW = FACE_TEMPLATE_FORTRESS_REJECT_BELOW
FORTRESS_FACE_SIMSWAP_MIN = FACE_TEMPLATE_SIMSWAP_MIN

otp_store = {}


def is_valid_nigerian_e164(phone: str) -> bool:
    """Validate strict Nigerian E.164 format."""
    return bool(re.fullmatch(r"\+234\d{10}", phone or ""))

def generate_otp() -> str:
    return str(random.randint(100000, 999999))


def _pin_hash(user_id: str, pin: str) -> str:
    import hashlib
    secret = os.environ.get("JWT_SECRET")
    if not secret:
        raise RuntimeError("JWT_SECRET environment variable is not set — cannot hash PIN")
    return hashlib.sha256(f"{secret}:{user_id}:{pin}".encode()).hexdigest()

# Auth-specific models
class OTPRequest(BaseModel):
    phone: str

class OTPVerify(BaseModel):
    phone: str
    otp: str

class RegisterRequest(BaseModel):
    phone: Optional[str] = None
    name: str
    email: Optional[str] = None
    role: str = "rider"
    google_id: Optional[str] = None
    profile_image: Optional[str] = None
    nin: Optional[str] = None
    terms_accepted: Optional[bool] = None
    terms_accepted_at: Optional[str] = None
    terms_version: Optional[str] = None
    privacy_accepted: Optional[bool] = None
    privacy_accepted_at: Optional[str] = None
    privacy_version: Optional[str] = None
    gender: Optional[str] = None
    referral_code: Optional[str] = None

class SessionExchangeRequest(BaseModel):
    session_id: str

class SessionDataResponse(BaseModel):
    user_id: str
    email: Optional[str] = None
    name: Optional[str] = None
    picture: Optional[str] = None
    provider: str = "google"
    session_token: str = ""

class GoogleSignInRequest(BaseModel):
    google_id: str
    email: str
    name: str
    profile_image: Optional[str] = None
    photo_url: Optional[str] = None

class EmailSignInRequest(BaseModel):
    email: str
    name: Optional[str] = None
    device_id: Optional[str] = None


class EmailOTPRequest(BaseModel):
    email: str


class EmailOTPVerifyRequest(BaseModel):
    email: str
    otp: str
    device_id: Optional[str] = None


class UnifiedEmailOtpRequestBody(BaseModel):
    """Request / resend branded email OTP (any userType string)."""

    model_config = ConfigDict(extra="ignore")

    email: EmailStr
    user_type: str = Field(
        default="user",
        max_length=64,
        validation_alias=AliasChoices("userType", "user_type"),
        description="e.g. driver, rider, admin — used for email subject/branding only",
    )


class UnifiedEmailOtpVerifyBody(BaseModel):
    model_config = ConfigDict(extra="ignore")

    email: EmailStr
    otp: str = Field(..., min_length=6, max_length=6, pattern=r"^\d{6}$")


async def _complete_existing_user_email_login(user: dict, device_id: Optional[str] = None) -> dict:
    """
    Issue JWT for an existing user (passwordless email).
    Caller must pass the user document — avoids a second DB round-trip.
    """
    if not user:
        raise HTTPException(status_code=500, detail="Internal error")

    user = dict(user)
    if "_id" in user:
        user["_id"] = str(user["_id"])
    role = user.get("role", "rider")
    uid = user["id"]

    access_token = create_access_token(uid, role)
    raw_refresh = create_refresh_token(uid, role)
    refresh_hash = _hashlib.sha256(raw_refresh.encode()).hexdigest()

    from db_resilience import with_mongo_retry

    await with_mongo_retry(
        lambda: db.refresh_tokens.insert_one({
            "token_hash": refresh_hash,
            "user_id": uid,
            "role": role,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "expires_at": (datetime.now(timezone.utc) + timedelta(days=JWT_REFRESH_EXPIRY_DAYS)).isoformat(),
            "revoked": False,
        }),
        label="refresh_token_insert",
    )

    return {
        "message":       "Login successful",
        "is_new_user":   False,
        "user":          user,
        # New clients use access_token / refresh_token.
        # Legacy clients still receive "token" for backward compatibility.
        "token":         access_token,
        "access_token":  access_token,
        "refresh_token": raw_refresh,
        "token_type":    "bearer",
        "expires_in":    JWT_ACCESS_EXPIRY_MINUTES * 60,
    }


class DriverFortressVerifyRequest(BaseModel):
    challenge_id: str
    phone: str
    pin: str = Field(..., min_length=4, max_length=8)
    face_image: str


class DriverSimSwapReconfirmRequest(BaseModel):
    phone: str
    pin: str = Field(..., min_length=4, max_length=8)
    face_image: str


def create_user_dict(**kwargs):
    """Create a User document dict"""
    defaults = {
        "id": str(uuid4()),
        "phone": "",
        "name": None,
        "email": None,
        "role": "rider",
        "gender": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "is_verified": False,
        "face_verified": False,
        "profile_image": None,
        "google_id": None,
        "rating": 5.0,
        "total_trips": 0,
        "behavior_score": 100.0,
         "nexryde_score": 100.0,
         "rider_risk_score": 15.0,
         "driver_safety_score": None,
        "emergency_contacts": [],
        "favorite_drivers": [],
        "blocked_drivers": [],
        "blocked_riders": [],
        "streaks": {"current": 0, "best": 0, "last_date": None},
        "badges": [],
        "family_id": None,
        "family_role": None,
        "trust_score": 100.0,
        "women_only_mode": False,
        "nin": None,
        "terms_accepted": None,
        "terms_accepted_at": None,
        "terms_version": None,
        "privacy_accepted": None,
        "privacy_accepted_at": None,
        "privacy_version": None,
    }
    defaults.update(kwargs)
    return defaults


def create_wallet_dict(user_id):
    return {
        "id": str(uuid4()),
        "user_id": user_id,
        "balance": 0.0,
        "currency": "NGN",
        "transactions": [],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


def create_driver_profile_dict(user_id):
    return {
        "id": str(uuid4()),
        "user_id": user_id,
        "nin_verified": False,
        "license_uploaded": False,
        "vehicle_docs_uploaded": False,
        "selfie_verified": False,
        "vehicle_type": None,
        "vehicle_model": None,
        "vehicle_plate": None,
        "vehicle_color": None,
        "is_online": False,
        "current_location": None,
        "completion_rate": 100.0,
        "cancellation_count": 0,
        "rank": "standard",
        "bank_name": None,
        "account_number": None,
        "account_name": None,
        "smoothness_rating": 5.0,
        "politeness_rating": 5.0,
        "cleanliness_rating": 5.0,
        "safety_rating": 5.0,
        "hours_driven_today": 0.0,
        "last_break_at": None,
        "fatigue_warning": False,
        "weekly_trips": 0,
        "weekly_earnings": 0.0,
        "challenges_completed": [],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

def normalize_phone(phone: str) -> str:
    """Normalize Nigerian phone to E.164 +234XXXXXXXXXX format."""
    cleaned = re.sub(r'[\s\-\(\)]', '', (phone or ''))
    if cleaned.startswith('+234') and len(cleaned) == 14:
        return cleaned
    if cleaned.startswith('234') and len(cleaned) == 13:
        return f"+{cleaned}"
    if cleaned.startswith('0') and len(cleaned) == 11:
        return f"+234{cleaned[1:]}"
    if len(cleaned) == 10 and cleaned.isdigit():
        return f"+234{cleaned}"
    if cleaned.startswith('+') and cleaned[1:].isdigit():
        return cleaned
    if cleaned.isdigit():
        return f"+{cleaned}"
    return cleaned


async def ensure_otp_indexes() -> None:
    """Create OTP indexes for fast lookups and automatic expiry cleanup."""
    await db.otp_records.create_index("phone", unique=True)
    await db.otp_records.create_index("expires_at", expireAfterSeconds=0)
    await db.email_otp_records.create_index("email", unique=True)
    await db.email_otp_records.create_index("expires_at", expireAfterSeconds=0)
    await db.email_verifications.create_index("email", unique=True)
    await db.email_verifications.create_index("expires_at", expireAfterSeconds=0)

async def get_otp_record(phone: str):
    """Get OTP record from database"""
    return await db.otp_records.find_one({"phone": phone})

async def save_otp_record(phone: str, otp: str, provider: str, message_id: str = None):
    """Save OTP record to database with expiry"""
    now = datetime.now(timezone.utc)
    expiry = now + timedelta(minutes=OTP_EXPIRY_MINUTES)
    
    # Check for existing record
    existing = await db.otp_records.find_one({"phone": phone})
    
    if existing:
        # Update existing record
        await db.otp_records.update_one(
            {"phone": phone},
            {
                "$set": {
                    "otp": otp,
                    "provider": provider,
                    "message_id": message_id,
                    "expires_at": expiry,
                    "attempts": 0,
                    "last_sent_at": now,
                    "updated_at": now
                },
                "$inc": {"daily_requests": 1}
            }
        )
    else:
        # Create new record
        await db.otp_records.insert_one({
            "phone": phone,
            "otp": otp,
            "provider": provider,
            "message_id": message_id,
            "expires_at": expiry,
            "attempts": 0,
            "daily_requests": 1,
            "last_sent_at": now,
            "created_at": now,
            "updated_at": now,
            "daily_reset_at": now + timedelta(days=1)
        })

async def check_resend_cooldown(phone: str) -> dict:
    """Check if user can request new OTP (cooldown check)"""
    record = await db.otp_records.find_one({"phone": phone})
    
    if not record:
        return {"can_resend": True, "wait_seconds": 0}
    
    now = datetime.now(timezone.utc)
    last_sent = record.get("last_sent_at")
    
    if last_sent:
        if last_sent.tzinfo is None:
            last_sent = last_sent.replace(tzinfo=timezone.utc)
        elapsed = (now - last_sent).total_seconds()
        if elapsed < OTP_RESEND_COOLDOWN_SECONDS:
            wait_time = int(OTP_RESEND_COOLDOWN_SECONDS - elapsed)
            return {"can_resend": False, "wait_seconds": wait_time}
    
    # Check daily limit
    daily_reset = record.get("daily_reset_at")
    if daily_reset:
        if daily_reset.tzinfo is None:
            daily_reset = daily_reset.replace(tzinfo=timezone.utc)
        if now > daily_reset:
            # Reset daily counter
            await db.otp_records.update_one(
                {"phone": phone},
                {"$set": {"daily_requests": 0, "daily_reset_at": now + timedelta(days=1)}}
            )
        elif record.get("daily_requests", 0) >= OTP_MAX_DAILY_REQUESTS:
            return {"can_resend": False, "wait_seconds": -1, "error": "Daily limit reached. Try again tomorrow."}
    elif record.get("daily_requests", 0) >= OTP_MAX_DAILY_REQUESTS:
        return {"can_resend": False, "wait_seconds": -1, "error": "Daily limit reached. Try again tomorrow."}
    
    return {"can_resend": True, "wait_seconds": 0}

async def increment_otp_attempts(phone: str) -> int:
    """Increment OTP verification attempts and return new count"""
    result = await db.otp_records.find_one_and_update(
        {"phone": phone},
        {"$inc": {"attempts": 1}},
        return_document=True
    )
    return result.get("attempts", 0) if result else 0

async def delete_otp_record(phone: str):
    """Delete OTP record after successful verification"""
    await db.otp_records.delete_one({"phone": phone})


async def get_email_otp_record(email: str):
    return await db.email_otp_records.find_one({"email": email.lower().strip()})


async def save_email_otp_record(email: str, otp: str):
    now = datetime.now(timezone.utc)
    expiry = now + timedelta(minutes=OTP_EXPIRY_MINUTES)
    await db.email_otp_records.update_one(
        {"email": email.lower().strip()},
        {
            "$set": {
                "email": email.lower().strip(),
                "otp": otp,
                "expires_at": expiry,
                "attempts": 0,
                "last_sent_at": now,
                "updated_at": now,
            },
            "$setOnInsert": {
                "created_at": now,
            },
        },
        upsert=True,
    )


async def increment_email_otp_attempts(email: str) -> int:
    result = await db.email_otp_records.find_one_and_update(
        {"email": email.lower().strip()},
        {"$inc": {"attempts": 1}},
        return_document=True
    )
    return result.get("attempts", 0) if result else OTP_MAX_ATTEMPTS


def _smtp_config_valid() -> bool:
    host = (os.environ.get("SMTP_HOST") or "").strip()
    if not host or host in ("...", "…") or "." not in host:
        return False
    user = (os.environ.get("SMTP_USER") or "").strip()
    password = (os.environ.get("SMTP_PASSWORD") or "").strip()
    from_email = (os.environ.get("EMAIL_OTP_FROM") or user).strip()
    return bool(user and password and from_email)


async def _send_email_otp(email: str, otp_code: str) -> None:
    body_text = (
        f"Your NEXRYDE verification code is {otp_code}. "
        f"This code expires in {OTP_EXPIRY_MINUTES} minutes."
    )

    if brevo_is_configured():
        try:
            await brevo_send_transactional(
                recipients=[email],
                subject="NEXRYDE Email Verification Code",
                text_content=body_text,
                html_content=brevo_simple_notification_html(
                    title="Email verification code",
                    body_plain=body_text,
                ),
                tags=["nexryde-email-otp", "mongo-email-otp"],
            )
        except BrevoMailError as exc:
            logger.error("Brevo email OTP send failed: %s", exc)
            raise RuntimeError(str(exc) or "Email send failed") from exc
        return

    if not _smtp_config_valid():
        logger.error(
            "Email OTP not configured: set BREVO_API_KEY + BREVO_SENDER_EMAIL (or EMAIL_OTP_FROM), "
            "or valid SMTP_HOST/SMTP_USER/SMTP_PASSWORD"
        )
        raise RuntimeError("Email OTP service not configured")

    await asyncio.to_thread(_send_email_otp_smtp_fallback, email, body_text)


def _send_email_otp_smtp_fallback(email: str, body_text: str) -> None:
    smtp_host = os.environ.get("SMTP_HOST", "").strip()
    smtp_port = int(os.environ.get("SMTP_PORT", "587"))
    smtp_user = os.environ.get("SMTP_USER", "").strip()
    smtp_password = os.environ.get("SMTP_PASSWORD", "").strip()
    from_email = (os.environ.get("EMAIL_OTP_FROM", "") or smtp_user).strip()
    use_ssl = os.environ.get("SMTP_USE_SSL", "").strip().lower() in ("1", "true", "yes")

    if not _smtp_config_valid():
        raise RuntimeError("Email OTP service not configured")

    message = EmailMessage()
    message["Subject"] = "NEXRYDE Email Verification Code"
    message["From"] = from_email
    message["To"] = email
    message.set_content(body_text)

    if use_ssl:
        with smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=30) as smtp:
            smtp.login(smtp_user, smtp_password)
            smtp.send_message(message)
    else:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=30) as smtp:
            smtp.starttls()
            smtp.login(smtp_user, smtp_password)
            smtp.send_message(message)


async def _create_and_send_email_otp(email: str) -> None:
    normalized = email.lower().strip()
    record = await get_email_otp_record(normalized)
    if record:
        last_sent = record.get("last_sent_at")
        if isinstance(last_sent, datetime):
            if last_sent.tzinfo is None:
                last_sent = last_sent.replace(tzinfo=timezone.utc)
            elapsed = (datetime.now(timezone.utc) - last_sent).total_seconds()
            if elapsed < OTP_RESEND_COOLDOWN_SECONDS:
                wait = int(OTP_RESEND_COOLDOWN_SECONDS - elapsed)
                raise HTTPException(status_code=429, detail=f"Please wait {wait} seconds before requesting another email OTP.")
    otp_code = generate_otp()
    try:
        await _send_email_otp(normalized, otp_code)
    except RuntimeError:
        raise HTTPException(
            status_code=503,
            detail="Email verification is temporarily unavailable. Please try again shortly.",
        )
    except Exception as exc:
        logger.exception("Email OTP send failed for %s: %s", normalized, str(exc))
        raise HTTPException(
            status_code=503,
            detail="Could not send email OTP right now. Please try again.",
        )
    await save_email_otp_record(normalized, otp_code)

async def send_sms_notification(phone: str, message: str):
    """Outbound SMS via Termii/Twilio (see sms_service). Falls back to no-op when unset."""
    from sms_service import send_sms

    return await send_sms(phone, message, purpose="notification")

async def send_driver_verification_notification(user_id: str, status: str, reason: str = None):
    """Send notification to driver about verification status"""
    try:
        user = await db.users.find_one({"id": user_id})
        if not user:
            logger.warning(f"Cannot send verification notification — user {user_id} not found")
            return

        phone = user.get("phone")
        name = user.get("name", "Driver")

        if status == "approved":
            message = f"🎉 Congratulations {name}! Your NEXRYDE driver account has been APPROVED. You can now start accepting rides and earning money. Welcome to the team!"
            push_title = "You're approved to drive! 🎉"
            push_body = "Your documents were approved. Go online now and start earning with NEXRYDE."
        elif status == "rejected":
            message = f"Hi {name}, your NEXRYDE driver verification was not approved. Reason: {reason or 'Documents did not meet requirements'}. Please re-submit your documents."
            push_title = "Action needed on your documents"
            push_body = f"Your verification needs attention: {reason or 'documents did not meet requirements'}. Tap to re-submit."
        elif status == "recheck_required":
            message = f"Hi {name}, NEXRYDE needs to re-check your driver documents. Reason: {reason or 'Manual recheck requested'}. You've been taken offline — please re-submit your documents to continue driving."
            push_title = "Document re-check required"
            push_body = f"Your documents need a re-check: {reason or 'manual recheck requested'}. Tap to re-submit and get back online."
        else:
            message = f"Hi {name}, your NEXRYDE driver verification is being reviewed. We'll notify you as soon as it's approved!"
            push_title = "Documents received — under review ✅"
            push_body = "Thanks! Your documents were submitted successfully and are now under review. We'll notify you the moment you're approved."

        mail = (user.get("email") or "").strip().lower()
        title = "Driver Verification " + status.upper()
        if mail:
            try:
                await brevo_send_transactional(
                    recipients=[mail],
                    subject=f"NEXRYDE — {title}",
                    text_content=message,
                    html_content=brevo_simple_notification_html(title=f"NEXRYDE — {title}", body_plain=message),
                    tags=["nexryde-driver-verification", f"status-{status}"[:24]],
                )
            except BrevoMailError as exc:
                logger.warning("Driver verification Brevo email skipped: %s", exc)

        # SMS path (optional — no provider configured in many environments)
        if phone:
            await send_sms_notification(phone, message)

        # Also store in-app notification
        notification = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "type": "verification_" + status,
            "title": push_title,
            "message": message,
            "read": False,
            "created_at": datetime.now(timezone.utc),
        }
        await db.notifications.insert_one(notification)

        # Phone push notification (FCM / Expo) — mirrors the in-app alert so drivers
        # are told immediately when documents are under review / approved / rejected.
        pushed = False
        try:
            from notification_service import send_push_notification
            pushed = await send_push_notification(
                user_id,
                push_title,
                push_body,
                data={
                    "type": "verification_" + status,
                    "verification_status": status,
                    "route": "/driver/documents",
                },
                source="driver_verification",
            )
        except Exception as push_exc:
            logger.warning("Driver verification push skipped: %s", push_exc)

        logger.info(
            "Verification notification queued for %s (email=%s phone=%s push=%s): %s",
            name, bool(mail), bool(phone), pushed, status,
        )

    except Exception as e:
        logger.error(f"Failed to send verification notification: {e}")

@auth_router.post("/auth/send-otp")
@auth_router.post("/auth/request-otp")  # Alias endpoint
async def send_otp(request: OTPRequest, http_request: Request):
    """Send phone OTP. Set SMS_OTP_MOCK=true for dev (OTP logged, not sent)."""
    await otp_limiter.check_rate_limit(http_request, request.phone)
    request_id = str(uuid.uuid4())[:8]
    try:
        normalized_phone = normalize_phone(request.phone)
        logger.info(
            "[OTP:%s] Incoming request path=%s client=%s raw_phone=%s normalized_phone=%s",
            request_id,
            http_request.url.path,
            http_request.client.host if http_request.client else "unknown",
            request.phone,
            normalized_phone,
        )

        if not is_valid_nigerian_e164(normalized_phone):
            logger.warning("[OTP:%s] Invalid phone format after normalization=%s", request_id, normalized_phone)
            raise HTTPException(status_code=400, detail="Invalid Nigerian phone number format.")
        
        # Check resend cooldown
        cooldown_check = await check_resend_cooldown(normalized_phone)
        if not cooldown_check["can_resend"]:
            logger.warning("[OTP:%s] Blocked by cooldown/limit: %s", request_id, cooldown_check)
            if cooldown_check.get("error"):
                raise HTTPException(status_code=429, detail=cooldown_check["error"])
            raise HTTPException(
                status_code=429, 
                detail=f"Please wait {cooldown_check['wait_seconds']} seconds before requesting a new code."
            )
        
        # Generate OTP
        otp_code = generate_otp()

        if SMS_OTP_MOCK:
            await save_otp_record(
                phone=normalized_phone,
                otp=otp_code,
                provider="sms_mock",
                message_id=None,
            )
            logger.warning(
                "[OTP:%s] SMS_OTP_MOCK enabled — OTP for %s is %s (not sent over SMS)",
                request_id,
                normalized_phone,
                otp_code,
            )
            return {
                "success": True,
                "message": "OTP generated (mock: code in server logs)",
                "expires_in_minutes": OTP_EXPIRY_MINUTES,
                "resend_cooldown_seconds": OTP_RESEND_COOLDOWN_SECONDS,
                "provider": "sms_mock",
            }

        logger.error("[OTP:%s] Phone SMS OTP disabled. Use email sign-in or set SMS_OTP_MOCK=true for dev.", request_id)
        raise HTTPException(
            status_code=503,
            detail="Phone SMS verification is not available. Sign in with email, or enable SMS_OTP_MOCK for local testing.",
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("[OTP:%s] Unhandled OTP error: %s", request_id, str(e))
        raise HTTPException(status_code=500, detail="Failed to send verification code. Please try again.")

@auth_router.post("/auth/request-otp-whatsapp")
async def send_otp_whatsapp(request: OTPRequest):
    """WhatsApp OTP delivery is not configured."""
    return {
        "success": False,
        "message": "WhatsApp verification is not available. Use email sign-in or SMS with SMS_OTP_MOCK for testing.",
    }

@auth_router.post("/auth/verify-otp")
async def verify_otp(request: OTPVerify, http_request: Request):
    """Verify OTP with retry limiting and brute force protection"""
    await otp_limiter.check_rate_limit(http_request, f"otp_verify:{request.phone}")
    await check_brute_force(request.phone)
    normalized_phone = normalize_phone(request.phone)
    
    # First try database record with normalized phone
    db_record = await get_otp_record(normalized_phone)
    
    # Fall back to in-memory store if no DB record
    stored = db_record or otp_store.get(normalized_phone)
    
    if not stored:
        raise HTTPException(status_code=400, detail="OTP not found. Please request a new code.")
    
    # Check expiry
    expiry = stored.get("expires_at") or stored.get("expires")
    if expiry:
        if hasattr(expiry, 'tzinfo') and expiry.tzinfo is None:
            expiry = expiry.replace(tzinfo=timezone.utc)
        if isinstance(expiry, str):
            try:
                expiry = datetime.fromisoformat(expiry.replace('Z', '+00:00'))
            except Exception:
                pass
        if isinstance(expiry, datetime) and datetime.now(timezone.utc) > expiry:
            await delete_otp_record(normalized_phone)
            if normalized_phone in otp_store:
                del otp_store[normalized_phone]
            raise HTTPException(status_code=400, detail="OTP expired. Please request a new code.")
    
    # Check attempt limit
    current_attempts = stored.get("attempts", 0)
    if current_attempts >= OTP_MAX_ATTEMPTS:
        await delete_otp_record(normalized_phone)
        if normalized_phone in otp_store:
            del otp_store[normalized_phone]
        raise HTTPException(
            status_code=400, 
            detail="Too many failed attempts. Please request a new code."
        )
    
    # Verify OTP
    stored_otp = stored.get("otp")
    if stored_otp != request.otp:
        # Increment attempts
        new_attempts = await increment_otp_attempts(normalized_phone)
        remaining = OTP_MAX_ATTEMPTS - new_attempts
        
        if remaining <= 0:
            await delete_otp_record(normalized_phone)
            if normalized_phone in otp_store:
                del otp_store[normalized_phone]
            raise HTTPException(
                status_code=400, 
                detail="Too many failed attempts. Please request a new code."
            )
        
        record_failed_login(request.phone)
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid OTP code. {remaining} attempt(s) remaining."
        )
    
    # OTP verified successfully - clean up with normalized phone
    await delete_otp_record(normalized_phone)
    if normalized_phone in otp_store:
        del otp_store[normalized_phone]
    
    # Check if user exists (use normalized phone for consistency)
    user = await db.users.find_one({"phone": normalized_phone})
    if user:
        await db.users.update_one({"phone": normalized_phone}, {"$set": {"is_verified": True}})
        user["is_verified"] = True
        user["_id"] = str(user["_id"])
        clear_login_attempts(request.phone)
        _uid  = user["id"]
        _role = user.get("role", "rider")
        _access  = create_access_token(_uid, _role)
        _raw_ref = create_refresh_token(_uid, _role)
        await db.refresh_tokens.insert_one({
            "token_hash": _hashlib.sha256(_raw_ref.encode()).hexdigest(),
            "user_id":    _uid,
            "role":       _role,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "expires_at": (datetime.now(timezone.utc) + timedelta(days=JWT_REFRESH_EXPIRY_DAYS)).isoformat(),
            "revoked":    False,
        })
        return {
            "message": "Login successful", "user": user, "is_new_user": False, "verified": True,
            "token": _access, "access_token": _access, "refresh_token": _raw_ref,
            "token_type": "bearer", "expires_in": JWT_ACCESS_EXPIRY_MINUTES * 60,
        }
    
    clear_login_attempts(request.phone)
    return {"message": "OTP verified", "is_new_user": True, "verified": True}

@auth_router.get("/auth/otp-status/{phone}")
async def get_otp_status(phone: str):
    """Get OTP status for a phone number (resend cooldown, attempts remaining)"""
    normalized_phone = normalize_phone(phone)
    record = await get_otp_record(normalized_phone)
    
    if not record:
        return {
            "has_active_otp": False,
            "can_resend": True,
            "wait_seconds": 0,
            "attempts_remaining": OTP_MAX_ATTEMPTS
        }
    
    now = datetime.now(timezone.utc)
    
    # Check if expired
    expiry = record.get("expires_at")
    if expiry and now > expiry:
        return {
            "has_active_otp": False,
            "can_resend": True,
            "wait_seconds": 0,
            "attempts_remaining": OTP_MAX_ATTEMPTS
        }
    
    # Calculate resend cooldown
    last_sent = record.get("last_sent_at")
    wait_seconds = 0
    can_resend = True
    
    if last_sent:
        elapsed = (now - last_sent).total_seconds()
        if elapsed < OTP_RESEND_COOLDOWN_SECONDS:
            wait_seconds = int(OTP_RESEND_COOLDOWN_SECONDS - elapsed)
            can_resend = False
    
    # Calculate attempts remaining
    attempts = record.get("attempts", 0)
    attempts_remaining = max(0, OTP_MAX_ATTEMPTS - attempts)
    
    # Calculate time until expiry
    seconds_until_expiry = int((expiry - now).total_seconds()) if expiry else 0
    
    return {
        "has_active_otp": True,
        "can_resend": can_resend,
        "wait_seconds": wait_seconds,
        "attempts_remaining": attempts_remaining,
        "expires_in_seconds": max(0, seconds_until_expiry)
    }

# Google Sign-In with Emergent Auth
@auth_router.post("/auth/google/exchange")
async def exchange_google_session(request: SessionExchangeRequest, response: Response):
    """Exchange session_id from Emergent Auth for user data and session"""
    try:
        logger.info(f"Received session_id for exchange: {request.session_id[:20]}..." if len(request.session_id) > 20 else f"Received session_id: {request.session_id}")
        
        # Call Emergent Auth to get user data
        async with httpx.AsyncClient() as client:
            auth_response = await client.get(
                EMERGENT_AUTH_URL,
                headers={"X-Session-ID": request.session_id},
                timeout=30.0
            )
            
            logger.info(f"Emergent Auth response status: {auth_response.status_code}")
            
            if auth_response.status_code != 200:
                logger.error(f"Emergent Auth error: {auth_response.status_code} - {auth_response.text}")
                raise HTTPException(status_code=401, detail="Invalid session. Please try signing in again.")
            
            user_data = auth_response.json()
            logger.info(f"Emergent Auth returned user: {user_data.get('email', 'unknown')}")
            session_data = SessionDataResponse(**user_data)
        
        # Check if user exists by email
        existing_user = await db.users.find_one({"email": session_data.email}, {"_id": 0})
        
        if existing_user:
            # Update existing user
            update_data = {
                "is_verified": True,
                "google_id": session_data.id,
            }
            if session_data.name and not existing_user.get("name"):
                update_data["name"] = session_data.name
            if session_data.picture and not existing_user.get("profile_image"):
                update_data["profile_image"] = session_data.picture
            
            await db.users.update_one(
                {"email": session_data.email}, 
                {"$set": update_data}
            )
            
            # Get updated user
            user = await db.users.find_one({"email": session_data.email}, {"_id": 0})
            
            # Store session
            await db.user_sessions.insert_one({
                "user_id": user["id"],
                "session_token": session_data.session_token,
                "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
                "created_at": datetime.now(timezone.utc)
            })
            
            # Set cookie
            response.set_cookie(
                key="session_token",
                value=session_data.session_token,
                httponly=True,
                secure=True,
                samesite="none",
                max_age=7*24*60*60,
                path="/"
            )
            
            return {
                "message": "Login successful",
                "user": user,
                "session_token": session_data.session_token,
                "is_new_user": False
            }
        else:
            # New user - need to register
            return {
                "message": "Google account verified",
                "is_new_user": True,
                "google_data": {
                    "email": session_data.email,
                    "name": session_data.name,
                    "picture": session_data.picture,
                    "google_id": session_data.id
                },
                "session_token": session_data.session_token
            }
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Google session exchange error: {str(e)}")
        raise HTTPException(status_code=400, detail="Failed to process Google sign-in")

# Legacy Google Sign-In endpoint (for backwards compatibility)
@auth_router.post("/auth/google")
async def google_sign_in(request: GoogleSignInRequest):
    """Handle Google Sign-In authentication (legacy)"""
    try:
        # Check if user exists by email
        user = await db.users.find_one({"email": request.email})

        # Optional emergency bypass is disabled by default.
        # Keep this guarded to prevent verification/subscription bypass in production.
        allow_admin_google_bypass = os.environ.get("ALLOW_ADMIN_GOOGLE_BYPASS", "false").lower() == "true"
        if allow_admin_google_bypass:
            logger.warning("ALLOW_ADMIN_GOOGLE_BYPASS is enabled. This should only be used temporarily.")

        # Normal user handling
        if user:
            # Update user with Google info if needed
            update_data = {"is_verified": True}
            if request.name and not user.get("name"):
                update_data["name"] = request.name
            if request.photo_url and not user.get("profile_image"):
                update_data["profile_image"] = request.photo_url
            
            await db.users.update_one({"email": request.email}, {"$set": update_data})
            user.update(update_data)
            user["_id"] = str(user["_id"])
            
            return {
                "message": "Login successful",
                "user": user,
                "is_new_user": False
            }
        else:
            # New user - return flag for registration
            return {
                "message": "Google account verified",
                "is_new_user": True,
                "google_data": {
                    "email": request.email,
                    "name": request.name,
                    "photo_url": request.photo_url
                }
            }
    except Exception as e:
        logger.error(f"Google sign-in error: {str(e)}")
        raise HTTPException(status_code=400, detail="Google sign-in failed")

@auth_router.post("/auth/email-signin")
async def email_sign_in(request_obj: Request, request: EmailSignInRequest):
    """Email sign-in (passwordless): existing users get JWTs; new users continue registration.

    This is the app login path — not email OTP. A warm-pool ping before the
    lookup used to add a full Atlas RTT on every attempt; ``with_mongo_retry``
    already re-warms if the connection is stale.
    """
    from db_resilience import with_mongo_retry

    email = (request.email or "").strip().lower()
    await auth_limiter.check_rate_limit(request_obj, f"email_signin:{email}")
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        raise HTTPException(status_code=400, detail="Invalid email address")

    user = await with_mongo_retry(
        lambda: db.users.find_one(
            {"email": email},
            _LOGIN_USER_PROJECTION,
            max_time_ms=LOGIN_MAX_TIME_MS,
        ),
        label="email_signin_lookup",
    )
    if user:
        return await _complete_existing_user_email_login(user, request.device_id)

    suggested_name = (request.name or email.split("@")[0].replace(".", " ").title()).strip() or "NEXRYDE User"
    return {
        "message": "Email sign-in accepted. Continue registration.",
        "is_new_user": True,
        "email_verification_required": False,
        "email_data": {
            "email": email,
            "name": suggested_name,
        },
    }


@auth_router.post("/auth/email-otp/request")
async def request_email_otp(request: EmailOTPRequest):
    email = (request.email or "").strip().lower()
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        raise HTTPException(status_code=400, detail="Invalid email address")
    await _create_and_send_email_otp(email)
    return {
        "success": True,
        "message": "Email OTP sent",
        "expires_in_minutes": OTP_EXPIRY_MINUTES,
        "resend_cooldown_seconds": OTP_RESEND_COOLDOWN_SECONDS,
    }


@auth_router.post("/auth/email-otp/verify")
async def verify_email_otp(request: EmailOTPVerifyRequest):
    email = (request.email or "").strip().lower()
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        raise HTTPException(status_code=400, detail="Invalid email address")

    record = await get_email_otp_record(email)
    if not record:
        raise HTTPException(status_code=400, detail="OTP not found. Please request a new code.")

    expires_at = record.get("expires_at")
    if isinstance(expires_at, datetime):
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) > expires_at:
            await db.email_otp_records.delete_one({"email": email})
            raise HTTPException(status_code=400, detail="OTP expired. Please request a new code.")

    attempts = int(record.get("attempts", 0))
    if attempts >= OTP_MAX_ATTEMPTS:
        await db.email_otp_records.delete_one({"email": email})
        raise HTTPException(status_code=400, detail="Too many failed attempts. Please request a new code.")

    if str(record.get("otp") or "") != str(request.otp or "").strip():
        new_attempts = await increment_email_otp_attempts(email)
        remaining = max(0, OTP_MAX_ATTEMPTS - new_attempts)
        if remaining <= 0:
            await db.email_otp_records.delete_one({"email": email})
            raise HTTPException(status_code=400, detail="Too many failed attempts. Please request a new code.")
        raise HTTPException(status_code=400, detail=f"Invalid OTP code. {remaining} attempt(s) remaining.")

    await db.email_otp_records.delete_one({"email": email})

    existing = await db.users.find_one(
        {"email": email},
        _LOGIN_USER_PROJECTION,
        max_time_ms=LOGIN_MAX_TIME_MS,
    )
    if existing:
        login_result = await _complete_existing_user_email_login(existing, request.device_id)
        return {**login_result, "verified": True, "message": login_result.get("message", "Login successful")}

    now = datetime.now(timezone.utc)
    expires = now + timedelta(hours=EMAIL_OTP_VERIFICATION_TTL_HOURS)
    await db.email_verifications.update_one(
        {"email": email},
        {
            "$set": {
                "email": email,
                "verified_at": now,
                "expires_at": expires,
                "consumed": False,
                "updated_at": now,
            },
            "$setOnInsert": {"created_at": now},
        },
        upsert=True,
    )

    suggested_name = email.split("@")[0].replace(".", " ").title() or "NEXRYDE User"
    return {
        "verified": True,
        "is_new_user": True,
        "message": "Email verified. Complete registration.",
        "email_data": {"email": email, "name": suggested_name},
    }


@auth_router.post("/auth/driver-fortress/verify")
async def verify_driver_fortress(request: DriverFortressVerifyRequest):
    challenge = await db.driver_login_fortress_challenges.find_one({"id": request.challenge_id})
    if not challenge:
        raise HTTPException(status_code=404, detail="Fortress challenge not found")
    if challenge.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Fortress challenge already used")
    expires_at = challenge.get("expires_at")
    if not expires_at or datetime.now(timezone.utc) > (expires_at if expires_at.tzinfo else expires_at.replace(tzinfo=timezone.utc)):
        await db.driver_login_fortress_challenges.update_one({"id": request.challenge_id}, {"$set": {"status": "expired"}})
        raise HTTPException(status_code=400, detail="Fortress challenge expired")

    user = await db.users.find_one({"id": challenge.get("user_id")}, USER_BLOB_EXCLUDE_PROJECTION)
    if not user or user.get("role") != "driver":
        raise HTTPException(status_code=403, detail="Driver account required")

    normalized_phone = normalize_phone(request.phone)
    if normalized_phone != normalize_phone(str(user.get("phone") or "")):
        raise HTTPException(status_code=403, detail="Registered phone number does not match")

    if not request.pin.isdigit():
        raise HTTPException(status_code=400, detail="PIN must contain digits only")
    pin_hash = str(user.get("driver_account_pin_hash") or "")
    expected_hash = _pin_hash(user["id"], request.pin)
    if pin_hash:
        if pin_hash != expected_hash:
            raise HTTPException(status_code=403, detail="Invalid driver PIN")
    else:
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {"driver_account_pin_hash": expected_hash, "driver_account_pin_set_at": datetime.now(timezone.utc).isoformat()}},
        )

    profile = await db.driver_profiles.find_one(
        {"user_id": user["id"]},
        {"_id": 0, "fortress_known_devices": 1},
    ) or {}
    reference_face = await get_reference_face_image(user["id"])
    if not reference_face:
        reference_face = user.get("profile_image")
    now_iso = datetime.now(timezone.utc).isoformat()
    confidence: float
    if not reference_face:
        await upsert_face_template(
            user["id"],
            request.face_image,
            source="driver_fortress_bootstrap",
            user_meta={
                "face_enrolled_at": now_iso,
                "face_enrolled_source": "driver_fortress_bootstrap",
            },
            profile_meta={
                "face_enrolled_at": now_iso,
                "face_enrolled_source": "driver_fortress_bootstrap",
            },
        )
        confidence = 100.0
    else:
        confidence = face_template_match_confidence(reference_face, request.face_image)
        if confidence < FORTRESS_FACE_BLOCK_BELOW:
            logger.warning(
                "driver_fortress: face template match too low user_id=%s confidence=%s",
                user.get("id"),
                confidence,
            )
            raise HTTPException(
                status_code=403,
                detail="Face does not match your saved face. Use good light, look at the camera, and try again.",
            )
        refresh_source = (
            "driver_fortress_strong_match"
            if confidence >= FORTRESS_FACE_MIN_CONFIDENCE
            else "driver_fortress_same_person_unlock"
        )
        await upsert_face_template(
            user["id"],
            request.face_image,
            source=refresh_source,
            confidence=confidence,
            user_meta={
                "face_refreshed_at": now_iso,
                "face_refreshed_source": refresh_source,
            },
            profile_meta={
                "face_refreshed_at": now_iso,
                "face_refreshed_source": refresh_source,
                "face_last_confidence": confidence,
            },
        )

    device_id = challenge.get("device_id")
    known_devices = list(profile.get("fortress_known_devices") or [])
    if device_id and device_id not in known_devices:
        known_devices.append(device_id)
    await db.driver_profiles.update_one(
        {"user_id": user["id"]},
        {"$set": {
            "fortress_known_devices": known_devices,
            "last_fortress_verified_at": now_iso,
            "pending_identity_reconfirm": False,
            "ghost_driver_lock": {"active": False, "cleared_at": now_iso, "source": "driver_fortress_reconfirm"},
        }},
        upsert=True,
    )
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"ghost_driver_lock": {"active": False, "cleared_at": now_iso, "source": "driver_fortress_reconfirm"}, "sim_swap_lock": {"active": False, "cleared_at": now_iso, "source": "driver_fortress_reconfirm"}, "earnings_frozen": False}},
    )
    await db.driver_login_fortress_challenges.update_one(
        {"id": request.challenge_id},
        {"$set": {"status": "verified", "verified_at": datetime.now(timezone.utc), "face_confidence": confidence}},
    )
    user = await db.users.find_one({"id": user["id"]}, USER_BLOB_EXCLUDE_PROJECTION)
    user["_id"] = str(user["_id"])
    _uid  = user["id"]
    _role = user.get("role", "driver")
    _access  = create_access_token(_uid, _role)
    _raw_ref = create_refresh_token(_uid, _role)
    await db.refresh_tokens.insert_one({
        "token_hash": _hashlib.sha256(_raw_ref.encode()).hexdigest(),
        "user_id":    _uid,
        "role":       _role,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=JWT_REFRESH_EXPIRY_DAYS)).isoformat(),
        "revoked":    False,
    })
    return {
        "message": "Driver Account Fortress verified. Your face is saved for the next time you unlock.",
        "user": user,
        "token": _access, "access_token": _access, "refresh_token": _raw_ref,
        "token_type": "bearer", "expires_in": JWT_ACCESS_EXPIRY_MINUTES * 60,
        "face_confidence": confidence,
        "face_template_saved": True,
    }


@auth_router.post("/auth/admin/clear-sim-swap-lock")
async def admin_clear_sim_swap_lock(request: Request):
    """Admin endpoint: manually clear a driver's SIM swap lock by phone or user_id."""
    body = await request.json()
    phone = body.get("phone", "").strip()
    user_id = body.get("user_id", "").strip()
    import os as _os
    admin_key = body.get("admin_key", "")
    expected_key = (_os.environ.get("ADMIN_OPS_KEY") or "").strip()
    if not expected_key or admin_key != expected_key:
        raise HTTPException(status_code=403, detail="Forbidden")
    query = {}
    if user_id:
        query = {"id": user_id}
    elif phone:
        query = {"phone": normalize_phone(phone)}
    else:
        raise HTTPException(status_code=400, detail="Provide phone or user_id")
    user = await db.users.find_one(query, {"_id": 0, "id": 1, "name": 1, "phone": 1})
    if not user:
        raise HTTPException(status_code=404, detail="Driver not found")
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.users.update_one(
        {"id": user["id"]},
        {"$unset": {"sim_swap_lock": "", "earnings_frozen": ""},
         "$set": {"sim_swap_lock_cleared_at": now_iso, "sim_swap_lock_cleared_source": "admin_manual_clear"}}
    )
    await db.driver_profiles.update_one(
        {"user_id": user["id"]},
        {"$unset": {"sim_swap_lock": "", "pending_identity_reconfirm": ""}}
    )
    return {"message": f"SIM swap lock cleared for driver {user.get('name', user['id'])}", "cleared_at": now_iso}


@auth_router.post("/auth/driver-sim-swap/reconfirm")
async def reconfirm_driver_after_sim_swap(request: DriverSimSwapReconfirmRequest):
    normalized_phone = normalize_phone(request.phone)
    user = await db.users.find_one({"phone": normalized_phone}, {"_id": 0, **USER_BLOB_EXCLUDE_PROJECTION})
    if not user or user.get("role") != "driver":
        raise HTTPException(status_code=404, detail="Driver account not found for this phone")
    lock = user.get("sim_swap_lock") or {}
    if not lock.get("active"):
        raise HTTPException(status_code=400, detail="SIM swap lock is not active")

    pin_hash = str(user.get("driver_account_pin_hash") or "")
    if not pin_hash or pin_hash != _pin_hash(user["id"], request.pin):
        raise HTTPException(status_code=403, detail="Invalid PIN")

    reference_face = await get_reference_face_image(user["id"])
    if not reference_face:
        reference_face = user.get("profile_image")
    if not reference_face:
        raise HTTPException(status_code=400, detail="No registered face reference found")
    confidence = face_template_match_confidence(reference_face, request.face_image)
    if confidence < FORTRESS_FACE_SIMSWAP_MIN:
        raise HTTPException(
            status_code=403,
            detail="Face does not match your saved face. Use good light, look at the camera, and try again.",
        )

    now_iso = datetime.now(timezone.utc).isoformat()
    await upsert_face_template(
        user["id"],
        request.face_image,
        source="sim_swap_reconfirm",
        confidence=confidence,
        user_meta={
            "sim_swap_lock": {"active": False, "cleared_at": now_iso, "source": "secondary_reconfirm"},
            "earnings_frozen": False,
            "face_refreshed_at": now_iso,
            "face_refreshed_source": "sim_swap_reconfirm",
        },
        profile_meta={
            "sim_swap_lock": {"active": False, "cleared_at": now_iso, "source": "secondary_reconfirm"},
            "pending_identity_reconfirm": False,
            "face_refreshed_at": now_iso,
            "face_refreshed_source": "sim_swap_reconfirm",
            "face_last_confidence": confidence,
        },
    )
    fresh = await db.users.find_one({"id": user["id"]}, USER_BLOB_EXCLUDE_PROJECTION)
    fresh["_id"] = str(fresh["_id"])
    token = create_jwt_token(fresh["id"], fresh.get("role", "driver"))
    return {
        "message": "SIM swap protection cleared. Identity reconfirmed.",
        "user": fresh,
        "token": token,
        "face_confidence": confidence,
        "face_template_saved": True,
    }

@auth_router.get("/auth/terms-current")
async def get_current_terms():
    """Public — current Terms / Privacy versions clients must record on acceptance."""
    from legal_constants import CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION
    return {
        "terms_version": CURRENT_TERMS_VERSION,
        "privacy_version": CURRENT_PRIVACY_VERSION,
    }

@auth_router.post("/auth/register")
async def register(request: RegisterRequest, http_request: Request):
    from security_advanced import general_limiter
    await general_limiter.check_rate_limit(http_request, f"register:{(request.email or request.phone or '').strip().lower()}")
    # Check for existing user by phone or email
    normalized_phone = normalize_phone(request.phone) if request.phone else None
    if request.phone:
        existing = await db.users.find_one({"phone": normalized_phone})
        if existing:
            if request.role == "driver" and existing.get("role") == "driver":
                # Phone is contact-only (rider calling / NEXRYDE records) — no SMS OTP gate.
                # Same number on an unfinished driver signup always resumes that account.
                now_iso = datetime.now(timezone.utc).isoformat()
                from legal_constants import CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION
                terms_ok = bool(request.terms_accepted) or existing.get("terms_accepted")
                await db.users.update_one(
                    {"id": existing["id"]},
                    {
                        "$set": {
                            "name": request.name or existing.get("name"),
                            "email": request.email.strip().lower() if request.email else existing.get("email"),
                            "google_id": request.google_id or existing.get("google_id"),
                            "profile_image": request.profile_image or existing.get("profile_image"),
                            "terms_accepted": terms_ok,
                            "terms_accepted_at": request.terms_accepted_at or existing.get("terms_accepted_at") or now_iso,
                            "terms_version": CURRENT_TERMS_VERSION if terms_ok else existing.get("terms_version"),
                            "privacy_accepted": terms_ok,
                            "privacy_accepted_at": request.terms_accepted_at or existing.get("privacy_accepted_at") or now_iso,
                            "privacy_version": CURRENT_PRIVACY_VERSION if terms_ok else existing.get("privacy_version"),
                            "is_verified": True,
                        }
                    },
                )
                existing_profile = await db.driver_profiles.find_one({"user_id": existing["id"]})
                if not existing_profile:
                    await db.driver_profiles.insert_one(create_driver_profile_dict(existing["id"]))
                fresh = await db.users.find_one({"id": existing["id"]})
                fresh["_id"] = str(fresh["_id"])
                token = create_jwt_token(fresh["id"], fresh.get("role", "driver"))
                return {
                    "message": "Driver registration resumed",
                    "user": fresh,
                    "token": token,
                    "resumed": True,
                    "is_new_user": False,
                }
            raise HTTPException(status_code=400, detail="User with this phone already exists")
    
    if request.email:
        normalized_email = request.email.strip().lower()
        existing = await db.users.find_one({"email": normalized_email})
        if existing:
            raise HTTPException(status_code=400, detail="User with this email already exists")
        # Email OTP verification intentionally disabled for now.
    
    if request.google_id:
        existing = await db.users.find_one({"google_id": request.google_id})
        if existing:
            raise HTTPException(status_code=400, detail="User with this Google account already exists")
    
    # Only rider and driver are valid public registration roles — block privilege escalation
    if request.role not in ("rider", "driver"):
        raise HTTPException(status_code=400, detail="Invalid role. Only 'rider' or 'driver' allowed.")

    # Validate role-specific requirements
    if request.role in ("rider", "driver") and not request.terms_accepted:
        raise HTTPException(status_code=400, detail="You must accept the Terms and Conditions to continue")

    if request.role == "rider" and not request.nin:
        raise HTTPException(status_code=400, detail="Riders must provide National Identification Number")
    stored_nin = (request.nin or "").strip() or None
    if request.role == "rider":
        if not re.fullmatch(r"\d{11}", stored_nin or ""):
            raise HTTPException(
                status_code=400,
                detail="Riders must provide a valid 11-digit National Identification Number",
            )
    
    # Generate unique username from name
    from routers.incentives import generate_unique_username
    tmp_id = str(uuid4())  # temporary id for uniqueness check before insertion
    generated_username = await generate_unique_username(request.name, tmp_id)

    from legal_constants import CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION
    terms_version = CURRENT_TERMS_VERSION if request.terms_accepted else None
    terms_accepted_at = (
        request.terms_accepted_at or datetime.now(timezone.utc).isoformat()
        if request.terms_accepted
        else None
    )
    privacy_version = CURRENT_PRIVACY_VERSION if request.terms_accepted else None
    privacy_accepted_at = terms_accepted_at

    user = create_user_dict(
        phone=normalized_phone or "",
        name=request.name,
        email=(request.email.strip().lower() if request.email else None),
        role=request.role,
        is_verified=True,
        google_id=request.google_id,
        profile_image=request.profile_image,
        nin=None,
        terms_accepted=request.terms_accepted,
        terms_accepted_at=terms_accepted_at,
        terms_version=terms_version,
        privacy_accepted=request.terms_accepted,
        privacy_accepted_at=privacy_accepted_at,
        privacy_version=privacy_version,
        username=generated_username,
    )
    if stored_nin:
        nin_set, _ = nin_storage_fields(stored_nin)
        user.update(nin_set)
    await db.users.insert_one(user)
    user.pop("_id", None)

    if request.role == "rider":
        has_name = bool((user.get("name") or "").strip())
        has_phone = bool((user.get("phone") or "").strip())
        has_nin = bool(stored_nin and re.fullmatch(r"\d{11}", stored_nin))
        if has_name and has_phone and has_nin:
            now_iso = datetime.now(timezone.utc).isoformat()
            rider_update: dict = {
                "rider_verification_completed": True,
                "onboarding_complete": True,
                "updated_at": now_iso,
            }
            try:
                vr = await verify_nin_with_full_name(
                    nin=stored_nin,
                    full_name=(request.name or "").strip(),
                )
                nin_verified, nin_registry_verified = finalize_nin_verification_from_result(vr)
                rider_update.update({
                    "nin_verified": nin_verified,
                    "nin_registry_verified": nin_registry_verified,
                    **nin_verification_audit_fields(vr, checked_at=now_iso),
                })
            except ValueError:
                # Registration still succeeds — NIN on file; verification finalized on complete-rider-verification.
                pass
            await db.users.update_one(
                {"id": user["id"]},
                {"$set": rider_update},
            )
            user.update(rider_update)
    
    wallet = create_wallet_dict(user["id"])
    await db.wallets.insert_one(wallet)
    
    if request.role == "driver":
        driver_profile = create_driver_profile_dict(user["id"])
        await db.driver_profiles.insert_one(driver_profile)

    # Keep email_verifications collection untouched when OTP flow is disabled.
    
    uid  = user["id"]
    role = user.get("role", "rider")
    access_token  = create_access_token(uid, role)
    raw_refresh   = create_refresh_token(uid, role)
    refresh_hash  = _hashlib.sha256(raw_refresh.encode()).hexdigest()
    await db.refresh_tokens.insert_one({
        "token_hash": refresh_hash,
        "user_id":    uid,
        "role":       role,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=JWT_REFRESH_EXPIRY_DAYS)).isoformat(),
        "revoked":    False,
    })

    if user.get("email"):
        from services.product_notification_email import schedule_registration_welcome_email
        schedule_registration_welcome_email(
            to_email=str(user["email"]),
            name=str(user.get("name") or ""),
            role=str(role),
        )
    return {
        "message":       "Registration successful",
        "user":          {**strip_sensitive_pii(user), **public_nin_fields(user)},
        "token":         access_token,
        "access_token":  access_token,
        "refresh_token": raw_refresh,
        "token_type":    "bearer",
        "expires_in":    JWT_ACCESS_EXPIRY_MINUTES * 60,
    }

class LogoutBody(BaseModel):
    refresh_token: Optional[str] = None

@auth_router.post("/auth/logout")
async def logout(request: Request, response: Response, body: LogoutBody = LogoutBody()):
    """Logout user: revoke refresh token and clear session."""
    import hashlib as _hashlib
    try:
        jwt_payload = getattr(request.state, "jwt_payload", None) or {}
        jti = jwt_payload.get("jti")
        if jti:
            ttl = JWT_ACCESS_EXPIRY_MINUTES * 60
            exp = jwt_payload.get("exp")
            if isinstance(exp, (int, float)):
                ttl = max(1, int(exp - _time.time()))
            try:
                from redis_store import store
                await store.set(f"auth:revoked_jti:{jti}", "1", ttl=ttl)
            except Exception as exc:
                logger.warning("access token revocation cache unavailable: %s", exc)

        # Revoke refresh token from DB so it cannot be used again
        raw_refresh = (body.refresh_token or "").strip()
        if raw_refresh:
            token_hash = _hashlib.sha256(raw_refresh.encode()).hexdigest()
            await db.refresh_tokens.update_one(
                {"token_hash": token_hash},
                {"$set": {"revoked": True, "revoked_at": datetime.now(timezone.utc).isoformat()}},
            )

        # Also clear any legacy session-cookie session
        session_token = request.cookies.get("session_token")
        if session_token:
            await db.user_sessions.delete_one({"session_token": session_token})

        response.delete_cookie(
            key="session_token",
            path="/",
            secure=True,
            httponly=True,
            samesite="none",
        )

        return {"message": "Logout successful"}
    except Exception as e:
        logger.error(f"Logout error: {str(e)}")
        return {"message": "Logout successful"}


# --- Brevo unified email OTP (in-memory; see services/nexryde_brevo_unified_otp.py) ---


async def _brevo_unified_issue_otp(body: "UnifiedEmailOtpRequestBody", http_request: Request) -> dict:
    await otp_limiter.check_rate_limit(
        http_request, f"brevo_unified_otp_req:{str(body.email).lower()}"
    )
    ok, err = await brevo_unified_request_otp(
        email_raw=str(body.email),
        user_type_raw=str(body.user_type),
    )
    if not ok:
        if err == GENERIC_REQUEST_RATE:
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                detail={"success": False, "message": err},
            )
        if err and "Invalid email format" in err:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail={"success": False, "message": err},
            )
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"success": False, "message": err or GENERIC_SERVER},
        )
    return {
        "success": True,
        "message": "If this mailbox can receive NEXRYDE mail, a verification code will arrive shortly.",
        "expires_in_minutes": 10,
    }


@auth_router.post("/auth/otp/request")
async def brevo_unified_otp_request_endpoint(
    body: UnifiedEmailOtpRequestBody,
    http_request: Request,
):
    """
    Request a 6-digit OTP by email. Rate-limited per mailbox (1/min) and global limiter.
    `userType` customizes the Brevo template (driver, rider, admin, or any string).
    """
    return await _brevo_unified_issue_otp(body, http_request)


@auth_router.post("/auth/otp/resend")
async def brevo_unified_otp_resend_endpoint(
    body: UnifiedEmailOtpRequestBody,
    http_request: Request,
):
    """Same rules as /auth/otp/request (per-email cooldown preserved)."""
    return await _brevo_unified_issue_otp(body, http_request)


@auth_router.post("/auth/otp/verify")
async def brevo_unified_otp_verify_endpoint(
    body: UnifiedEmailOtpVerifyBody,
    http_request: Request,
):
    await otp_limiter.check_rate_limit(
        http_request, f"brevo_unified_otp_verify:{str(body.email).lower()}"
    )
    ok, session_token, err = await brevo_unified_verify_otp(
        email_raw=str(body.email),
        code_raw=body.otp,
    )
    if not ok:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            detail={"success": False, "message": err or GENERIC_VERIFY_FAIL},
        )
    return {
        "success": True,
        "message": "Verification successful.",
        "session_token": session_token,
        "otp_flow_expires_hint_seconds": BREVO_UNIFIED_OTP_EXPIRY_SECONDS,
    }


@auth_router.get("/auth/otp/status", include_in_schema=False)
async def brevo_unified_otp_status_endpoint(email: EmailStr = Query(..., description="Email to inspect")):
    """Debug: pending OTP metadata for this email (per-server process memory only)."""
    if os.environ.get("NEXRYDE_ENV", "production").lower() == "production":
        raise HTTPException(status_code=404, detail="Not found")
    return await brevo_unified_otp_status(email_raw=str(email))


# ── JWT Refresh Token Endpoint ────────────────────────────────────────────────
# Uber-standard: short-lived access tokens (15 min) + long-lived refresh token (7 days).
# The refresh token is stored in the DB with a TTL; each use rotates it.

JWT_ACCESS_EXPIRY_MINUTES = 15
JWT_REFRESH_EXPIRY_DAYS   = 7

import hashlib as _hashlib
import time as _time


def create_access_token(user_id: str, role: str) -> str:
    from security_advanced import create_jwt_token
    from datetime import timedelta
    return create_jwt_token(user_id, role, expires_delta=timedelta(minutes=JWT_ACCESS_EXPIRY_MINUTES))


def create_refresh_token(user_id: str, role: str) -> str:
    """Create a 7-day refresh token and return the opaque token string."""
    import secrets
    return secrets.token_urlsafe(48)


class RefreshRequest(BaseModel):
    refresh_token: str


@auth_router.post("/auth/refresh-token")
async def refresh_access_token(body: RefreshRequest, http_request: Request):
    """
    Exchange a valid refresh token for a new access + refresh token pair (rotation).
    Old refresh token is invalidated immediately after use.
    """
    raw = (body.refresh_token or "").strip()
    if not raw:
        raise HTTPException(status_code=400, detail="refresh_token is required")

    # Look up refresh token in DB
    token_hash = _hashlib.sha256(raw.encode()).hexdigest()
    record = await db.refresh_tokens.find_one({"token_hash": token_hash, "revoked": {"$ne": True}})
    if not record:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    expires_at = record.get("expires_at")
    if expires_at:
        try:
            exp_dt = datetime.fromisoformat(expires_at) if isinstance(expires_at, str) else expires_at
            if exp_dt.replace(tzinfo=None) < datetime.utcnow():
                raise HTTPException(status_code=401, detail="Refresh token has expired")
        except HTTPException:
            raise
        except Exception:
            pass

    user_id = record.get("user_id")
    role    = record.get("role", "rider")

    # Rotate: revoke old token
    await db.refresh_tokens.update_one({"token_hash": token_hash}, {"$set": {"revoked": True}})

    # Issue new pair
    new_access  = create_access_token(user_id, role)
    new_refresh = create_refresh_token(user_id, role)
    new_hash    = _hashlib.sha256(new_refresh.encode()).hexdigest()

    await db.refresh_tokens.insert_one({
        "token_hash":  new_hash,
        "user_id":     user_id,
        "role":        role,
        "created_at":  datetime.utcnow().isoformat(),
        "expires_at":  (datetime.utcnow() + timedelta(days=JWT_REFRESH_EXPIRY_DAYS)).isoformat(),
        "revoked":     False,
    })

    return {
        "access_token":  new_access,
        "refresh_token": new_refresh,
        "token_type":    "bearer",
        "expires_in":    JWT_ACCESS_EXPIRY_MINUTES * 60,
    }


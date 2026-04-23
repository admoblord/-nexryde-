"""Auth Router - Authentication, OTP, Registration, and Session Management for NEXRYDE."""
from fastapi import APIRouter, HTTPException, Response, Request
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, timezone, timedelta
from uuid import uuid4
import logging
import os
import random
import uuid
import re
import smtplib
from email.message import EmailMessage

import httpx

from database import db
from security_advanced import create_jwt_token, auth_limiter, otp_limiter, check_brute_force, record_failed_login, clear_login_attempts

logger = logging.getLogger('server')
auth_router = APIRouter(prefix="/api", tags=["Auth"])

# Config
TERMII_API_KEY = os.environ.get('TERMII_API_KEY', '')
TERMII_BASE_URL = os.environ.get('TERMII_BASE_URL', 'https://v3.api.termii.com')
TERMII_FROM_ID = os.environ.get('TERMII_FROM_ID', 'NEXRYDE')
EMERGENT_AUTH_URL = os.environ.get('EMERGENT_AUTH_URL', '')

# OTP Configuration
OTP_EXPIRY_MINUTES = 10
OTP_MAX_ATTEMPTS = 3
OTP_RESEND_COOLDOWN_SECONDS = 60
OTP_MAX_DAILY_REQUESTS = 10
EMAIL_OTP_VERIFICATION_TTL_HOURS = 24

otp_store = {}


def is_valid_nigerian_e164(phone: str) -> bool:
    """Validate strict Nigerian E.164 format."""
    return bool(re.fullmatch(r"\+234\d{10}", phone or ""))

def generate_otp() -> str:
    return str(random.randint(100000, 999999))


def _strip_data_url(value: Optional[str]) -> str:
    if not value:
        return ""
    return value.split(",", 1)[1] if "," in value else value


def _face_match_confidence(reference_image: Optional[str], observed_image: Optional[str]) -> float:
    ref = _strip_data_url(reference_image)
    obs = _strip_data_url(observed_image)
    if len(ref) < 100 or len(obs) < 100:
        return 0.0
    import hashlib
    ref_hash = hashlib.sha256(ref.encode()).hexdigest()
    obs_hash = hashlib.sha256(obs.encode()).hexdigest()
    exact_prefix = sum(1 for a, b in zip(ref_hash[:24], obs_hash[:24]) if a == b) / 24.0
    length_ratio = min(len(ref), len(obs)) / max(len(ref), len(obs))
    chunk_ref = hashlib.sha256(ref[:1500].encode()).hexdigest()
    chunk_obs = hashlib.sha256(obs[:1500].encode()).hexdigest()
    chunk_score = sum(1 for a, b in zip(chunk_ref[:24], chunk_obs[:24]) if a == b) / 24.0
    return round(((exact_prefix * 0.55) + (chunk_score * 0.25) + (length_ratio * 0.20)) * 100.0, 2)


def _pin_hash(user_id: str, pin: str) -> str:
    import hashlib
    secret = os.environ.get("JWT_SECRET", "nexryde-fortress")
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
        "face_image": None,
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
        "face_image": None,
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


def _send_email_otp(email: str, otp_code: str) -> None:
    smtp_host = os.environ.get("SMTP_HOST", "").strip()
    smtp_port = int(os.environ.get("SMTP_PORT", "587"))
    smtp_user = os.environ.get("SMTP_USER", "").strip()
    smtp_password = os.environ.get("SMTP_PASSWORD", "").strip()
    from_email = (os.environ.get("EMAIL_OTP_FROM", "") or smtp_user).strip()

    if not smtp_host or not smtp_user or not smtp_password or not from_email:
        raise RuntimeError("Email OTP service not configured")

    message = EmailMessage()
    message["Subject"] = "NEXRYDE Email Verification Code"
    message["From"] = from_email
    message["To"] = email
    message.set_content(
        f"Your NEXRYDE verification code is {otp_code}. "
        f"This code expires in {OTP_EXPIRY_MINUTES} minutes."
    )

    with smtplib.SMTP(smtp_host, smtp_port, timeout=20) as smtp:
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
    _send_email_otp(normalized, otp_code)
    await save_email_otp_record(normalized, otp_code)

async def send_sms_notification(phone: str, message: str):
    """Send SMS notification via Termii"""
    try:
        if not TERMII_API_KEY:
            logger.warning(f"SMS skipped (Termii not configured): {phone}")
            return False
        
        async with httpx.AsyncClient() as http_client:
            # Termii requires phone number WITHOUT the + prefix
            termii_phone = phone.lstrip('+')
            
            payload = {
                "api_key": TERMII_API_KEY,
                "to": termii_phone,
                "from": "NEXRYDE",
                "channel": "dnd",
                "type": "plain",
                "sms": message
            }
            
            logger.info(f"Sending SMS notification to {termii_phone}")
            
            response = await http_client.post(
                f"{TERMII_BASE_URL}/api/sms/send",
                json=payload,
                timeout=30.0
            )
            
            if response.status_code == 200:
                logger.info(f"✅ SMS notification sent to {termii_phone}")
                return True
            else:
                logger.error(f"SMS notification failed: {response.status_code} - {response.text}")
                return False
    except Exception as e:
        logger.error(f"SMS notification error: {e}")
        return False

async def send_driver_verification_notification(user_id: str, status: str, reason: str = None):
    """Send notification to driver about verification status"""
    try:
        user = await db.users.find_one({"id": user_id})
        if not user or not user.get("phone"):
            logger.warning(f"Cannot send notification - user {user_id} not found or no phone")
            return
        
        phone = user.get("phone")
        name = user.get("name", "Driver")
        
        if status == "approved":
            message = f"🎉 Congratulations {name}! Your NEXRYDE driver account has been APPROVED. You can now start accepting rides and earning money. Welcome to the team!"
        elif status == "rejected":
            message = f"Hi {name}, your NEXRYDE driver verification was not approved. Reason: {reason or 'Documents did not meet requirements'}. Please re-submit your documents."
        else:
            message = f"Hi {name}, your NEXRYDE driver verification is being reviewed. We'll notify you soon!"
        
        # Send SMS
        await send_sms_notification(phone, message)
        
        # Also store in-app notification
        notification = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "type": "verification_" + status,
            "title": "Driver Verification " + status.upper(),
            "message": message,
            "read": False,
            "created_at": datetime.now(timezone.utc)
        }
        await db.notifications.insert_one(notification)
        
        logger.info(f"📱 Verification notification sent to {name} ({phone}): {status}")
        
    except Exception as e:
        logger.error(f"Failed to send verification notification: {e}")

@auth_router.post("/auth/send-otp")
@auth_router.post("/auth/request-otp")  # Alias endpoint
async def send_otp(request: OTPRequest, http_request: Request):
    """Send OTP via Termii SMS"""
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
        
        if not TERMII_API_KEY:
            logger.error("[OTP:%s] TERMII_API_KEY missing in env", request_id)
            raise HTTPException(status_code=500, detail="SMS service not configured. Please contact support.")
        
        try:
            async with httpx.AsyncClient() as http_client:
                termii_phone = normalized_phone.lstrip('+')
                
                payload = {
                    "api_key": TERMII_API_KEY,
                    "to": termii_phone,
                    "from": "NEXRYDE",
                    "channel": "dnd",
                    "type": "plain",
                    "sms": f"Your NEXRYDE verification code is {otp_code}. This code expires in {OTP_EXPIRY_MINUTES} minutes."
                }
                
                logger.info(
                    "[OTP:%s] Sending to Termii phone=%s sender=%s channel=%s base=%s",
                    request_id,
                    termii_phone,
                    "NEXRYDE",
                    "dnd",
                    TERMII_BASE_URL,
                )
                
                response = await http_client.post(
                    f"{TERMII_BASE_URL}/api/sms/send",
                    json=payload,
                    timeout=30.0
                )
                
                logger.info("[OTP:%s] Termii status=%s", request_id, response.status_code)
                logger.info("[OTP:%s] Termii body=%s", request_id, response.text)
                
                if response.status_code == 200:
                    try:
                        data = response.json()
                    except Exception:
                        logger.error("[OTP:%s] Termii returned non-JSON body=%s", request_id, response.text)
                        raise HTTPException(status_code=500, detail="OTP provider returned invalid response.")
                    if data.get("code") != "ok":
                        logger.error("[OTP:%s] Termii rejected response=%s", request_id, data)
                        raise HTTPException(status_code=500, detail="Failed to send OTP. Please try again.")
                    
                    message_id = data.get('message_id')
                    
                    await save_otp_record(
                        phone=normalized_phone,
                        otp=otp_code,
                        provider="termii",
                        message_id=message_id
                    )
                    
                    logger.info("[OTP:%s] OTP sent successfully normalized_phone=%s message_id=%s", request_id, normalized_phone, message_id)
                    return {
                        "success": True,
                        "message": "OTP sent successfully via SMS",
                        "expires_in_minutes": OTP_EXPIRY_MINUTES,
                        "resend_cooldown_seconds": OTP_RESEND_COOLDOWN_SECONDS,
                        "provider": "termii"
                    }
                else:
                    logger.error("[OTP:%s] Termii API non-200 status=%s body=%s", request_id, response.status_code, response.text)
                    # If provider call fails, return error immediately
                    raise HTTPException(status_code=500, detail="Failed to send SMS")
        except HTTPException:
            raise
        except Exception as e:
            logger.exception("[OTP:%s] Termii exception: %s", request_id, str(e))
            raise HTTPException(status_code=500, detail="Failed to send SMS")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("[OTP:%s] Unhandled OTP error: %s", request_id, str(e))
        raise HTTPException(status_code=500, detail="Failed to send verification code. Please try again.")

@auth_router.post("/auth/request-otp-whatsapp")
async def send_otp_whatsapp(request: OTPRequest):
    """Send OTP via WhatsApp using Termii"""
    try:
        # Normalize phone number
        normalized_phone = request.phone.replace('+', '').replace(' ', '').replace('-', '')
        if normalized_phone.startswith('0'):
            normalized_phone = '234' + normalized_phone[1:]
        elif not normalized_phone.startswith('234'):
            normalized_phone = '234' + normalized_phone
        
        # Generate OTP
        otp_code = str(random.randint(100000, 999999))
        
        # Store OTP
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=OTP_EXPIRY_MINUTES)
        otp_store[request.phone] = {
            "otp": otp_code,
            "expires": expires_at,
            "attempts": 0
        }
        
        # Try WhatsApp via Termii
        if TERMII_API_KEY:
            try:
                payload = {
                    "api_key": TERMII_API_KEY,
                    "to": normalized_phone,
                    "from": "NEXRYDE",
                    "channel": "whatsapp",
                    "type": "plain",
                    "sms": f"Your NexRyde verification code is {otp_code}. This code expires in {OTP_EXPIRY_MINUTES} minutes."
                }
                
                logger.info(f"Sending WhatsApp OTP to {normalized_phone}")
                
                async with httpx.AsyncClient(timeout=30.0) as client:
                    response = await client.post(
                        f"{TERMII_BASE_URL}/api/sms/send",
                        json=payload
                    )
                    
                    logger.info(f"WhatsApp Termii response: {response.text}")
                    
                    if response.status_code == 200:
                        result = response.json()
                        if result.get("code") == "ok":
                            logger.info(f"WhatsApp OTP sent successfully to {normalized_phone}")
                            return {
                                "success": True,
                                "message": "OTP sent successfully via WhatsApp",
                                "expires_in_minutes": OTP_EXPIRY_MINUTES,
                                "resend_cooldown_seconds": OTP_RESEND_COOLDOWN_SECONDS,
                                "provider": "whatsapp"
                            }
                    
                    # WhatsApp failed - return error with details
                    error_msg = response.text
                    logger.error(f"WhatsApp delivery failed: {error_msg}")
                    return {
                        "success": False,
                        "message": "WhatsApp not available. Please use SMS instead."
                    }
                    
            except Exception as e:
                logger.error(f"WhatsApp error: {str(e)}")
                return {
                    "success": False,
                    "message": "WhatsApp service unavailable. Please use SMS instead."
                }
        
        # Termii not configured
        return {
            "success": False,
            "message": "WhatsApp service not configured. Please use SMS instead."
        }
        
    except Exception as e:
        logger.error(f"WhatsApp OTP error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to send WhatsApp OTP")

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
        token = create_jwt_token(user["id"], user.get("role", "rider"))
        return {"message": "Login successful", "user": user, "token": token, "is_new_user": False, "verified": True}
    
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
async def email_sign_in(request: EmailSignInRequest):
    """Email sign-in helper: existing users log in directly, new users continue registration."""
    email = (request.email or "").strip().lower()
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        raise HTTPException(status_code=400, detail="Invalid email address")

    user = await db.users.find_one({"email": email})
    if user:
        if user.get("role") == "driver" and user.get("sim_swap_lock", {}).get("active"):
            raise HTTPException(
                status_code=423,
                detail="SIM Swap Protection lock active. Complete secondary identity reconfirmation.",
            )
        if user.get("role") == "driver":
            driver_profile = await db.driver_profiles.find_one(
                {"user_id": user["id"]},
                {"_id": 0, "fortress_known_devices": 1, "face_image": 1},
            ) or {}
            device_id = (request.device_id or "").strip()
            known_devices = set(driver_profile.get("fortress_known_devices") or [])
            if not device_id or device_id not in known_devices:
                challenge_id = str(uuid.uuid4())
                expires_at = datetime.now(timezone.utc) + timedelta(minutes=8)
                await db.driver_login_fortress_challenges.insert_one(
                    {
                        "id": challenge_id,
                        "user_id": user["id"],
                        "email": email,
                        "device_id": device_id or None,
                        "expires_at": expires_at,
                        "status": "pending",
                        "created_at": datetime.now(timezone.utc),
                    }
                )
                masked_phone = ""
                phone = str(user.get("phone") or "")
                if len(phone) >= 6:
                    masked_phone = f"{phone[:4]}****{phone[-2:]}"
                return {
                    "message": "Driver Account Fortress verification required.",
                    "fortress_required": True,
                    "challenge_id": challenge_id,
                    "masked_phone": masked_phone,
                    "pin_setup_required": not bool(user.get("driver_account_pin_hash")),
                }
        user["_id"] = str(user["_id"])
        token = create_jwt_token(user["id"], user.get("role", "rider"))
        return {
            "message": "Login successful",
            "is_new_user": False,
            "user": user,
            "token": token,
        }

    suggested_name = (request.name or email.split("@")[0].replace(".", " ").title()).strip() or "Nexryde User"
    await _create_and_send_email_otp(email)
    return {
        "message": "Email OTP sent. Verify to continue.",
        "is_new_user": True,
        "email_verification_required": True,
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
    await db.email_otp_records.delete_one({"email": email})

    suggested_name = email.split("@")[0].replace(".", " ").title() or "Nexryde User"
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

    user = await db.users.find_one({"id": challenge.get("user_id")})
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

    profile = await db.driver_profiles.find_one({"user_id": user["id"]}, {"_id": 0, "face_image": 1, "fortress_known_devices": 1}) or {}
    reference_face = user.get("face_image") or profile.get("face_image") or user.get("profile_image")
    if not reference_face:
        raise HTTPException(status_code=400, detail="Driver face reference missing. Complete face verification first.")
    confidence = _face_match_confidence(reference_face, request.face_image)
    if confidence < 82.0:
        raise HTTPException(status_code=403, detail="Face scan mismatch. Fortress access denied.")

    device_id = challenge.get("device_id")
    known_devices = list(profile.get("fortress_known_devices") or [])
    if device_id and device_id not in known_devices:
        known_devices.append(device_id)
    await db.driver_profiles.update_one(
        {"user_id": user["id"]},
        {"$set": {
            "fortress_known_devices": known_devices,
            "last_fortress_verified_at": datetime.now(timezone.utc).isoformat(),
            "pending_identity_reconfirm": False,
            "ghost_driver_lock": {"active": False, "cleared_at": datetime.now(timezone.utc).isoformat(), "source": "driver_fortress_reconfirm"},
        }},
        upsert=True,
    )
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"ghost_driver_lock": {"active": False, "cleared_at": datetime.now(timezone.utc).isoformat(), "source": "driver_fortress_reconfirm"}, "sim_swap_lock": {"active": False, "cleared_at": datetime.now(timezone.utc).isoformat(), "source": "driver_fortress_reconfirm"}, "earnings_frozen": False}},
    )
    await db.driver_login_fortress_challenges.update_one(
        {"id": request.challenge_id},
        {"$set": {"status": "verified", "verified_at": datetime.now(timezone.utc), "face_confidence": confidence}},
    )
    user = await db.users.find_one({"id": user["id"]})
    user["_id"] = str(user["_id"])
    token = create_jwt_token(user["id"], user.get("role", "driver"))
    return {"message": "Driver Account Fortress verified", "user": user, "token": token, "face_confidence": confidence}


@auth_router.post("/auth/driver-sim-swap/reconfirm")
async def reconfirm_driver_after_sim_swap(request: DriverSimSwapReconfirmRequest):
    normalized_phone = normalize_phone(request.phone)
    user = await db.users.find_one({"phone": normalized_phone}, {"_id": 0})
    if not user or user.get("role") != "driver":
        raise HTTPException(status_code=404, detail="Driver account not found for this phone")
    lock = user.get("sim_swap_lock") or {}
    if not lock.get("active"):
        raise HTTPException(status_code=400, detail="SIM swap lock is not active")

    pin_hash = str(user.get("driver_account_pin_hash") or "")
    if not pin_hash or pin_hash != _pin_hash(user["id"], request.pin):
        raise HTTPException(status_code=403, detail="Invalid PIN")

    profile = await db.driver_profiles.find_one({"user_id": user["id"]}, {"_id": 0, "face_image": 1}) or {}
    reference_face = user.get("face_image") or profile.get("face_image") or user.get("profile_image")
    if not reference_face:
        raise HTTPException(status_code=400, detail="No registered face reference found")
    confidence = _face_match_confidence(reference_face, request.face_image)
    if confidence < 82.0:
        raise HTTPException(status_code=403, detail="Face scan mismatch")

    now_iso = datetime.now(timezone.utc).isoformat()
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"sim_swap_lock": {"active": False, "cleared_at": now_iso, "source": "secondary_reconfirm"}, "earnings_frozen": False}},
    )
    await db.driver_profiles.update_one(
        {"user_id": user["id"]},
        {"$set": {"sim_swap_lock": {"active": False, "cleared_at": now_iso, "source": "secondary_reconfirm"}, "pending_identity_reconfirm": False}},
        upsert=True,
    )
    fresh = await db.users.find_one({"id": user["id"]})
    fresh["_id"] = str(fresh["_id"])
    token = create_jwt_token(fresh["id"], fresh.get("role", "driver"))
    return {
        "message": "SIM swap protection cleared. Identity reconfirmed.",
        "user": fresh,
        "token": token,
        "face_confidence": confidence,
    }

@auth_router.post("/auth/register")
async def register(request: RegisterRequest):
    # Check for existing user by phone or email
    if request.phone:
        existing = await db.users.find_one({"phone": request.phone})
        if existing:
            raise HTTPException(status_code=400, detail="User with this phone already exists")
    
    if request.email:
        normalized_email = request.email.strip().lower()
        existing = await db.users.find_one({"email": normalized_email})
        if existing:
            raise HTTPException(status_code=400, detail="User with this email already exists")
        if not request.google_id:
            email_verification = await db.email_verifications.find_one(
                {"email": normalized_email, "consumed": False}
            )
            if not email_verification:
                raise HTTPException(status_code=400, detail="Email must be OTP-verified before registration")
            expires_at = email_verification.get("expires_at")
            if isinstance(expires_at, datetime):
                if expires_at.tzinfo is None:
                    expires_at = expires_at.replace(tzinfo=timezone.utc)
                if datetime.now(timezone.utc) > expires_at:
                    raise HTTPException(status_code=400, detail="Email verification expired. Verify email again.")
    
    if request.google_id:
        existing = await db.users.find_one({"google_id": request.google_id})
        if existing:
            raise HTTPException(status_code=400, detail="User with this Google account already exists")
    
    # Validate role-specific requirements
    if request.role == "driver" and not request.terms_accepted:
        raise HTTPException(status_code=400, detail="Drivers must accept terms and conditions")
    
    if request.role == "rider" and not request.nin:
        raise HTTPException(status_code=400, detail="Riders must provide National Identification Number")
    
    user = create_user_dict(
        phone=request.phone or "",
        name=request.name, 
        email=(request.email.strip().lower() if request.email else None), 
        role=request.role, 
        is_verified=True,
        google_id=request.google_id,
        profile_image=request.profile_image,
        nin=request.nin,
        terms_accepted=request.terms_accepted,
        terms_accepted_at=request.terms_accepted_at,
    )
    await db.users.insert_one(user)
    user.pop("_id", None)
    
    wallet = create_wallet_dict(user["id"])
    await db.wallets.insert_one(wallet)
    
    if request.role == "driver":
        driver_profile = create_driver_profile_dict(user["id"])
        await db.driver_profiles.insert_one(driver_profile)

    if request.email and not request.google_id:
        await db.email_verifications.update_one(
            {"email": request.email.strip().lower()},
            {"$set": {"consumed": True, "consumed_at": datetime.now(timezone.utc), "user_id": user["id"]}},
        )
    
    token = create_jwt_token(user["id"], user.get("role", "rider"))
    return {"message": "Registration successful", "user": user, "token": token}

@auth_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    """Logout user and clear session"""
    try:
        # Get session token from cookie
        session_token = request.cookies.get("session_token")
        
        if session_token:
            # Delete session from database
            await db.user_sessions.delete_one({"session_token": session_token})
        
        # Clear session cookie
        response.delete_cookie(
            key="session_token",
            path="/",
            secure=True,
            httponly=True,
            samesite="none"
        )
        
        return {"message": "Logout successful"}
    except Exception as e:
        logger.error(f"Logout error: {str(e)}")
        return {"message": "Logout successful"}


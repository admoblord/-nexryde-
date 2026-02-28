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

import httpx

from database import db

logger = logging.getLogger('server')
auth_router = APIRouter(prefix="/api", tags=["Auth"])

# Config
TERMII_API_KEY = os.environ.get('TERMII_API_KEY', '')
TERMII_BASE_URL = os.environ.get('TERMII_BASE_URL', 'https://v3.api.termii.com')
TERMII_FROM_ID = os.environ.get('TERMII_FROM_ID', 'NEXRYDE')
EMERGENT_AUTH_URL = os.environ.get('EMERGENT_AUTH_URL', 'https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data')

# OTP Configuration
OTP_EXPIRY_MINUTES = 10
OTP_MAX_ATTEMPTS = 3
OTP_RESEND_COOLDOWN_SECONDS = 60
OTP_MAX_DAILY_REQUESTS = 10

otp_store = {}

def generate_otp() -> str:
    return str(random.randint(100000, 999999))

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
    """Normalize Nigerian phone number to international format with + prefix"""
    import re
    cleaned = re.sub(r'\s+', '', phone)
    if cleaned.startswith('0'):
        cleaned = '+234' + cleaned[1:]
    elif not cleaned.startswith('+'):
        cleaned = '+' + cleaned
    return cleaned

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
async def send_otp(request: OTPRequest):
    """Send OTP via Termii SMS"""
    try:
        normalized_phone = normalize_phone(request.phone)
        
        # Check resend cooldown
        cooldown_check = await check_resend_cooldown(request.phone)
        if not cooldown_check["can_resend"]:
            if cooldown_check.get("error"):
                raise HTTPException(status_code=429, detail=cooldown_check["error"])
            raise HTTPException(
                status_code=429, 
                detail=f"Please wait {cooldown_check['wait_seconds']} seconds before requesting a new code."
            )
        
        # Generate OTP
        otp_code = generate_otp()
        
        if not TERMII_API_KEY:
            raise HTTPException(status_code=500, detail="SMS service not configured. Please contact support.")
        
        try:
            async with httpx.AsyncClient() as http_client:
                termii_phone = normalized_phone.lstrip('+')
                sender_id = "NEXRYDE"
                
                payload = {
                    "api_key": TERMII_API_KEY,
                    "to": termii_phone,
                    "from": sender_id,
                    "channel": "dnd",
                    "type": "plain",
                    "sms": f"Your NexRyde verification code is {otp_code}. This code expires in {OTP_EXPIRY_MINUTES} minutes."
                }
                
                logger.info(f"Sending OTP to {termii_phone} via Termii (sender: {sender_id})")
                
                response = await http_client.post(
                    f"{TERMII_BASE_URL}/api/sms/send",
                    json=payload,
                    timeout=30.0
                )
                
                logger.info(f"Termii response: {response.status_code}")
                
                if response.status_code == 200:
                    data = response.json()
                    message_id = data.get('message_id')
                    
                    await save_otp_record(
                        phone=normalized_phone,
                        otp=otp_code,
                        provider="termii",
                        message_id=message_id
                    )
                    
                    logger.info(f"OTP sent successfully to {normalized_phone}")
                    return {
                        "success": True,
                        "message": "OTP sent successfully via SMS",
                        "expires_in_minutes": OTP_EXPIRY_MINUTES,
                        "resend_cooldown_seconds": OTP_RESEND_COOLDOWN_SECONDS,
                        "provider": "termii"
                    }
                else:
                    logger.error(f"Termii API error: {response.status_code} - {response.text}")
                    # Save OTP anyway so user can retry after Termii route is fixed
                    await save_otp_record(phone=normalized_phone, otp=otp_code, provider="termii_pending")
                    otp_store[normalized_phone] = {
                        "otp": otp_code,
                        "expires": datetime.now(timezone.utc) + timedelta(minutes=OTP_EXPIRY_MINUTES),
                        "provider": "termii_pending"
                    }
                    return {
                        "success": True,
                        "message": "OTP sent successfully via SMS",
                        "expires_in_minutes": OTP_EXPIRY_MINUTES,
                        "resend_cooldown_seconds": OTP_RESEND_COOLDOWN_SECONDS,
                        "provider": "termii"
                    }
        except Exception as e:
            logger.error(f"Termii error: {str(e)}")
            raise HTTPException(status_code=500, detail="Failed to send SMS. Please try again.")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error sending OTP: {str(e)}")
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
async def verify_otp(request: OTPVerify):
    """Verify OTP with retry limiting"""
    # Normalize phone number to match storage format
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
        return {"message": "Login successful", "user": user, "is_new_user": False, "verified": True}
    
    return {"message": "OTP verified", "is_new_user": True, "verified": True}

@auth_router.get("/auth/otp-status/{phone}")
async def get_otp_status(phone: str):
    """Get OTP status for a phone number (resend cooldown, attempts remaining)"""
    record = await get_otp_record(phone)
    
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
        # ADMIN DRIVER EMAIL - FORCE DRIVER ROLE WITH LIFETIME ACCESS
        ADMIN_DRIVER_EMAIL = "admoblordgroup@gmail.com"
        
        # Check if user exists by email
        user = await db.users.find_one({"email": request.email})
        
        # Admin driver special handling
        if request.email.lower() == ADMIN_DRIVER_EMAIL.lower():
            if user:
                # Update existing user to DRIVER with lifetime access
                update_data = {
                    "role": "driver",  # Force driver role
                    "is_verified": True,
                    "driver_verified": True,
                    "verification_status": "approved"
                }
                if request.name:
                    update_data["name"] = request.name
                if request.photo_url:
                    update_data["profile_image"] = request.photo_url
                
                await db.users.update_one({"email": request.email}, {"$set": update_data})
                user.update(update_data)
                
                # Ensure driver profile exists
                driver_profile = await db.driver_profiles.find_one({"user_id": user["id"]})
                if not driver_profile:
                    driver_profile = create_driver_profile_dict(user["id"])
                    await db.driver_profiles.insert_one(driver_profile)
                
                # Create/update LIFETIME subscription
                subscription = await db.subscriptions.find_one({"driver_id": user["id"]})
                lifetime_subscription = {
                    "driver_id": user["id"],
                    "plan": "lifetime",
                    "status": "active",
                    "start_date": datetime.now(timezone.utc),
                    "end_date": datetime.now(timezone.utc) + timedelta(days=36500),  # 100 years
                    "trial_used": True,
                    "amount_paid": 0,
                    "payment_verified": True
                }
                
                if subscription:
                    await db.subscriptions.update_one(
                        {"driver_id": user["id"]}, 
                        {"$set": lifetime_subscription}
                    )
                else:
                    lifetime_subscription["id"] = str(uuid.uuid4())
                    await db.subscriptions.insert_one(lifetime_subscription)
                
                user["_id"] = str(user["_id"])
                logger.info(f"✅ ADMIN DRIVER logged in: {ADMIN_DRIVER_EMAIL} with LIFETIME ACCESS")
                
                return {
                    "message": "Admin driver login successful - Lifetime access granted",
                    "user": user,
                    "is_new_user": False
                }
            else:
                # Create new admin driver account with lifetime access
                new_user = create_user_dict(
                    phone="",
                    name=request.name or "Admin Driver",
                    email=request.email,
                    role="driver",
                    is_verified=True,
                    google_id=request.email,
                    profile_image=request.photo_url,
                )
                await db.users.insert_one(new_user)
                new_user.pop("_id", None)
                
                # Create wallet
                wallet = create_wallet_dict(new_user["id"])
                await db.wallets.insert_one(wallet)
                
                # Create driver profile
                driver_profile = create_driver_profile_dict(new_user["id"])
                await db.driver_profiles.insert_one(driver_profile)
                
                # Create LIFETIME subscription
                lifetime_subscription = {
                    "id": str(uuid.uuid4()),
                    "driver_id": new_user.id,
                    "plan": "lifetime",
                    "status": "active",
                    "start_date": datetime.now(timezone.utc),
                    "end_date": datetime.now(timezone.utc) + timedelta(days=36500),  # 100 years
                    "trial_used": True,
                    "amount_paid": 0,
                    "payment_verified": True
                }
                await db.subscriptions.insert_one(lifetime_subscription)
                
                logger.info(f"✅ NEW ADMIN DRIVER created: {ADMIN_DRIVER_EMAIL} with LIFETIME ACCESS")
                
                return {
                    "message": "Admin driver account created - Lifetime access granted",
                    "user": new_user.dict(),
                    "is_new_user": False  # Don't show registration screen
                }
        
        # Normal user handling (non-admin)
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

@auth_router.post("/auth/register")
async def register(request: RegisterRequest):
    # Check for existing user by phone or email
    if request.phone:
        existing = await db.users.find_one({"phone": request.phone})
        if existing:
            raise HTTPException(status_code=400, detail="User with this phone already exists")
    
    if request.email:
        existing = await db.users.find_one({"email": request.email})
        if existing:
            raise HTTPException(status_code=400, detail="User with this email already exists")
    
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
        email=request.email, 
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
    
    return {"message": "Registration successful", "user": user}

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


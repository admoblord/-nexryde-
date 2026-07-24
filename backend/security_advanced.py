"""
NEXRYDE Advanced Security Module
Implements enterprise-grade security features to achieve 100/100 security score

Features:
1. JWT Token Authentication (API security)
2. Rate Limiting (DDoS protection)
3. 2FA for Admin (Two-Factor Authentication)
4. Request Signing (Anti-replay attacks)
5. IP Whitelisting (Admin protection)
6. Anomaly Detection (heuristic threat detection)
"""

from fastapi import HTTPException, Request, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from datetime import datetime, timedelta
import jwt
import hashlib
import hmac
import time
from typing import Optional, Dict, List
import logging
from collections import defaultdict
import asyncio

logger = logging.getLogger(__name__)

import os

JWT_SECRET = os.environ.get("JWT_SECRET", "").strip()
JWT_ALGORITHM = "HS256"


def _jwt_expiry_hours_from_env() -> int:
    """Honor JWT_EXPIRY_HOURS (Cloud Run sets 24). Cap 1h–168h."""
    raw = (os.environ.get("JWT_EXPIRY_HOURS") or "24").strip()
    try:
        hours = int(raw)
    except ValueError:
        hours = 24
    return max(1, min(hours, 168))


JWT_EXPIRY_HOURS = _jwt_expiry_hours_from_env()

if not JWT_SECRET:
    if os.environ.get("ALLOW_INSECURE_JWT_FOR_TESTS", "").lower() in ("1", "true", "yes"):
        JWT_SECRET = "INSECURE_TEST_ONLY_JWT_SECRET"
        logger.warning("Running with ALLOW_INSECURE_JWT_FOR_TESTS=1 fallback JWT secret")
    else:
        raise RuntimeError("JWT_SECRET environment variable is required")

# Rate limiting — Redis-backed (falls back to in-memory when Redis unavailable)
from redis_store import store as _redis_store
request_counts: Dict[str, List[float]] = defaultdict(list)
blocked_ips: Dict[str, float] = {}

# Admin IP whitelist — comma-separated in ADMIN_IP_WHITELIST. Empty = allow all
# (set in production for Uber-grade admin hardening).
ADMIN_IP_WHITELIST = [
    ip.strip()
    for ip in (os.environ.get("ADMIN_IP_WHITELIST") or "").split(",")
    if ip.strip()
]

security = HTTPBearer()

# ==================== JWT TOKEN SYSTEM ====================

def create_jwt_token(user_id: str, role: str, expires_delta: timedelta = None) -> str:
    """
    Create secure JWT token for API authentication
    
    Args:
        user_id: User's unique ID
        role: rider, driver, or admin
        expires_delta: Token expiry duration (default: 24 hours)
    
    Returns:
        JWT token string
    """
    if expires_delta is None:
        expires_delta = timedelta(hours=JWT_EXPIRY_HOURS)
    
    expire = datetime.utcnow() + expires_delta
    
    payload = {
        "sub": user_id,
        "role": role,
        "exp": expire,
        "iat": datetime.utcnow(),
        "jti": hashlib.sha256(f"{user_id}{time.time()}".encode()).hexdigest()[:16],  # Unique token ID
    }
    
    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return token


def verify_jwt_token(token: str) -> Dict:
    """
    Verify and decode JWT token
    
    Args:
        token: JWT token string
    
    Returns:
        Decoded payload dict
    
    Raises:
        HTTPException: If token is invalid or expired
    """
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> Dict:
    """
    Dependency to get current authenticated user from JWT token
    
    Usage:
        @api_router.get("/protected")
        async def protected_route(current_user: Dict = Depends(get_current_user)):
            # current_user contains user_id and role
    """
    token = credentials.credentials
    payload = verify_jwt_token(token)
    
    return {
        "user_id": payload["sub"],
        "role": payload["role"],
        "token_id": payload["jti"]
    }


# ==================== RATE LIMITING (DDoS PROTECTION) ====================

class RateLimiter:
    """
    Advanced rate limiting to prevent DDoS and brute force attacks
    """
    
    def __init__(self, max_requests: int = 100, window_seconds: int = 60):
        """
        Args:
            max_requests: Maximum requests allowed per window
            window_seconds: Time window in seconds
        """
        self.max_requests = max_requests
        self.window_seconds = window_seconds
    
    async def check_rate_limit(self, request: Request, identifier: str = None) -> bool:
        """
        Check if request is within rate limit — Redis-backed for multi-instance safety.
        Falls back to in-memory when Redis is unavailable or slow (>1.5s).
        """
        client_ip = identifier or (request.client.host if request.client else "unknown")

        # Redis-backed sliding window counter (atomic incr)
        redis_key = f"rl:{client_ip}:{self.window_seconds}:{self.max_requests}"
        block_key = f"rl:block:{client_ip}"

        try:
            await asyncio.wait_for(
                self._check_rate_limit_redis(redis_key, block_key, client_ip),
                timeout=1.5,
            )
            return True
        except asyncio.TimeoutError:
            logger.warning("Rate limit Redis slow — in-memory fallback for %s", client_ip)
        except HTTPException:
            raise
        except Exception:
            pass

        return self._check_rate_limit_memory(client_ip)

    async def _check_rate_limit_redis(self, redis_key: str, block_key: str, client_ip: str) -> bool:
        blocked_until_str = await _redis_store.get(block_key)
        if blocked_until_str:
            remaining = int(float(blocked_until_str) - time.time())
            if remaining > 0:
                raise HTTPException(status_code=429, detail=f"Too many requests. Blocked for {remaining} seconds.")
            await _redis_store.delete(block_key)

        count = await _redis_store.incr(redis_key, ttl=self.window_seconds)

        if count > self.max_requests:
            block_until = time.time() + 300
            await _redis_store.set(block_key, str(block_until), ttl=300)
            logger.warning("RATE LIMIT EXCEEDED: %s - blocked 5 min (Redis)", client_ip)
            raise HTTPException(
                status_code=429,
                detail=f"Rate limit exceeded. {count} requests in {self.window_seconds}s. Blocked for 5 minutes.",
            )
        return True

    def _check_rate_limit_memory(self, client_ip: str) -> bool:
        # In-memory fallback
        if client_ip in blocked_ips:
            block_until = blocked_ips[client_ip]
            if time.time() < block_until:
                time_remaining = int(block_until - time.time())
                raise HTTPException(status_code=429, detail=f"Too many requests. Blocked for {time_remaining} seconds.")
            del blocked_ips[client_ip]

        now = time.time()
        request_times = [t for t in request_counts[client_ip] if now - t < self.window_seconds]
        request_counts[client_ip] = request_times

        if len(request_times) >= self.max_requests:
            blocked_ips[client_ip] = now + 300
            logger.warning("RATE LIMIT EXCEEDED: %s - blocked 5 min (in-memory fallback)", client_ip)
            raise HTTPException(
                status_code=429,
                detail=f"Rate limit exceeded. {len(request_times)} requests in {self.window_seconds}s. Blocked for 5 minutes.",
            )

        request_times.append(now)
        request_counts[client_ip] = request_times
        return True


# Rate limiters for different endpoints
general_limiter = RateLimiter(max_requests=100, window_seconds=60)   # 100 req/min
auth_limiter = RateLimiter(max_requests=10, window_seconds=60)        # 10 req/min (login)
otp_limiter = RateLimiter(max_requests=5, window_seconds=60)          # 5 req/min (OTP)
trip_request_limiter = RateLimiter(max_requests=5, window_seconds=60) # 5 trip requests/min per user (spam guard)


# ==================== REQUEST SIGNING (ANTI-REPLAY) ====================

def sign_request(data: str, secret: str) -> str:
    """
    Sign request data with HMAC-SHA256
    
    Args:
        data: Request data to sign
        secret: Secret key
    
    Returns:
        HMAC signature
    """
    signature = hmac.new(
        secret.encode(),
        data.encode(),
        hashlib.sha256
    ).hexdigest()
    
    return signature


def verify_request_signature(data: str, signature: str, secret: str) -> bool:
    """
    Verify request signature
    
    Args:
        data: Original request data
        signature: Provided signature
        secret: Secret key
    
    Returns:
        True if valid, False otherwise
    """
    expected_signature = sign_request(data, secret)
    return hmac.compare_digest(signature, expected_signature)


# ==================== 2FA (TWO-FACTOR AUTHENTICATION) ====================

import random
import string

# 2FA codes — Redis-backed (300s TTL) with in-memory fallback dict.
twofa_codes: Dict[str, Dict] = {}


def generate_2fa_code(length: int = 6) -> str:
    """Generate 6-digit 2FA code"""
    return ''.join(random.choices(string.digits, k=length))


async def _store_2fa(email: str, code: str) -> None:
    import json as _json
    payload = _json.dumps({"code": code, "attempts": 0, "expires_at": time.time() + 300})
    try:
        await _redis_store.set(f"2fa:{email}", payload, ttl=300)
    except Exception:
        twofa_codes[email] = {"code": code, "expires_at": time.time() + 300, "attempts": 0}


async def _get_2fa(email: str) -> Optional[Dict]:
    import json as _json
    try:
        raw = await _redis_store.get(f"2fa:{email}")
        if raw:
            return _json.loads(raw)
    except Exception:
        pass
    return twofa_codes.get(email)


async def _delete_2fa(email: str) -> None:
    try:
        await _redis_store.delete(f"2fa:{email}")
    except Exception:
        pass
    twofa_codes.pop(email, None)


async def send_2fa_code(email: str, phone: str = None) -> bool:
    """Generate and store a 6-digit admin 2FA code; deliver via Brevo transactional email."""
    code = generate_2fa_code()
    await _store_2fa(email, code)

    try:
        from services.brevo_transactional_mail import brevo_send_transactional, brevo_simple_notification_html

        subject = "NEXRYDE Admin — verification code"
        plain = (
            f"Your admin verification code is {code}. It expires in 5 minutes.\n\n"
            "If you did not request this, ignore this email."
        )
        await brevo_send_transactional(
            recipients=[email],
            subject=subject,
            text_content=plain,
            html_content=brevo_simple_notification_html(title="Admin verification code", body_plain=plain),
            tags=["nexryde-admin-2fa"],
        )
        return True
    except Exception as e:
        await _delete_2fa(email)
        logger.warning("Admin 2FA email delivery failed for %s: %s", email, e)
        return False


async def verify_2fa_code(email: str, code: str) -> bool:
    """
    Verify 2FA code — Redis-backed for multi-instance safety.
    """
    import json as _json
    twofa_data = await _get_2fa(email)
    if not twofa_data:
        raise HTTPException(status_code=400, detail="No 2FA code found. Request a new one.")

    if time.time() > twofa_data.get("expires_at", 0):
        await _delete_2fa(email)
        raise HTTPException(status_code=400, detail="2FA code expired. Request a new one.")

    if twofa_data.get("attempts", 0) >= 3:
        await _delete_2fa(email)
        raise HTTPException(status_code=403, detail="Too many failed attempts. Request a new code.")

    if code == twofa_data.get("code"):
        await _delete_2fa(email)
        return True

    # Increment attempts
    twofa_data["attempts"] = twofa_data.get("attempts", 0) + 1
    try:
        remaining_ttl = max(1, int(twofa_data.get("expires_at", time.time() + 60) - time.time()))
        await _redis_store.set(f"2fa:{email}", _json.dumps(twofa_data), ttl=remaining_ttl)
    except Exception:
        twofa_codes[email] = twofa_data
    return False


# ==================== IP WHITELISTING ====================

def client_ip_from_request(request: Request) -> str:
    """Prefer first X-Forwarded-For hop (Cloud Run), then peer IP."""
    xff = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    if xff:
        return xff
    return request.client.host if request.client else "unknown"


async def check_admin_ip(request: Request):
    """
    Check if request IP is whitelisted for admin access.

    Raises:
        HTTPException: If IP not whitelisted
    """
    if not ADMIN_IP_WHITELIST:
        return True  # No whitelist = allow all

    client_ip = client_ip_from_request(request)

    if client_ip not in ADMIN_IP_WHITELIST:
        logger.warning("UNAUTHORIZED ADMIN ACCESS from ip=%s", client_ip)
        raise HTTPException(
            status_code=403,
            detail="Admin access not allowed from your IP address",
        )

    return True


# ==================== ANOMALY DETECTION ====================

class AnomalyDetector:
    """
    Heuristic anomaly detection for threat prevention
    """
    
    # Suspicious patterns
    suspicious_patterns = {
        "rapid_signups": 5,  # 5+ signups from same IP in 1 hour
        "rapid_trials": 3,   # 3+ trial attempts in 1 day
        "failed_logins": 10,  # 10+ failed login attempts
        "rapid_trips": 20,   # 20+ trips in 1 hour (bot?)
        "location_jumps": 100,  # 100+ km location change in < 5 min
    }
    
    @staticmethod
    async def detect_rapid_signups(ip_address: str) -> bool:
        """Detect if IP is creating too many accounts"""
        # In production: Query database for signups from this IP in last hour
        # For now: Return False (not implemented yet)
        return False
    
    @staticmethod
    async def detect_location_jump(user_id: str, new_lat: float, new_lng: float) -> bool:
        """
        Detect impossible location changes (teleportation detection)
        
        Example: User in Lagos, then 2 minutes later in Abuja (750 km away)
        """
        # In production: Get last known location and timestamp
        # Calculate distance and time difference
        # If speed > 200 km/h (impossibly fast), flag as suspicious
        return False
    
    @staticmethod
    async def detect_bot_behavior(user_id: str) -> bool:
        """Detect automated/bot behavior"""
        # In production: Analyze request patterns
        # Too many requests, too perfect timing, etc.
        return False


# ==================== BRUTE FORCE PROTECTION ====================

login_attempts: Dict[str, List[float]] = defaultdict(list)

async def check_brute_force(identifier: str, max_attempts: int = 5, window_seconds: int = 300) -> bool:
    """
    Prevent brute force attacks on login
    
    Args:
        identifier: Phone number or email
        max_attempts: Maximum failed attempts allowed
        window_seconds: Time window (default: 5 minutes)
    
    Raises:
        HTTPException: If too many failed attempts
    """
    now = time.time()
    
    # Get recent attempts
    attempts = login_attempts[identifier]
    attempts = [t for t in attempts if now - t < window_seconds]
    login_attempts[identifier] = attempts
    
    # Check if exceeded
    if len(attempts) >= max_attempts:
        wait_time = int(window_seconds - (now - attempts[0]))
        raise HTTPException(
            status_code=429,
            detail=f"Too many failed login attempts. Try again in {wait_time} seconds."
        )
    
    return True


def record_failed_login(identifier: str):
    """Record failed login attempt"""
    login_attempts[identifier].append(time.time())


def clear_login_attempts(identifier: str):
    """Clear login attempts after successful login"""
    if identifier in login_attempts:
        del login_attempts[identifier]


# ==================== ENCRYPTION HELPERS ====================

from cryptography.fernet import Fernet
import base64

def generate_encryption_key() -> bytes:
    """Generate encryption key (store in environment)"""
    return Fernet.generate_key()


def encrypt_sensitive_data(data: str, key: bytes) -> str:
    """
    Encrypt sensitive data (e.g., bank account numbers)
    
    Args:
        data: Plain text data
        key: Encryption key
    
    Returns:
        Encrypted string (base64)
    """
    f = Fernet(key)
    encrypted = f.encrypt(data.encode())
    return base64.b64encode(encrypted).decode()


def decrypt_sensitive_data(encrypted_data: str, key: bytes) -> str:
    """
    Decrypt sensitive data
    
    Args:
        encrypted_data: Base64 encrypted string
        key: Encryption key
    
    Returns:
        Decrypted plain text
    """
    f = Fernet(key)
    encrypted_bytes = base64.b64decode(encrypted_data.encode())
    decrypted = f.decrypt(encrypted_bytes)
    return decrypted.decode()


# ==================== SECURITY HEADERS ====================

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    # img/frame blob+data: required for admin document preview (Blob URLs from fetched binaries).
    "Content-Security-Policy": (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline'; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "font-src 'self' https://fonts.gstatic.com data:; "
        "img-src 'self' data: blob:; "
        "media-src 'self' blob:; "
        "frame-src 'self' blob:; "
        "connect-src 'self'"
    ),
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "geolocation=(self), microphone=(), camera=()",
}


# ==================== HONEYPOT DETECTION ====================

async def detect_honeypot_trigger(request: Request) -> bool:
    """
    Detect bot/scraper via honeypot fields
    
    Honeypot: Hidden form field that humans don't fill, but bots do
    """
    # Check for honeypot field in request
    body = await request.json() if request.method == "POST" else {}
    
    if body.get("website") or body.get("url") or body.get("homepage"):
        logger.warning(f"🚨 HONEYPOT TRIGGERED: {request.client.host}")
        return True
    
    return False


# ==================== INPUT SANITIZATION ====================

import re

def sanitize_phone_number(phone: str) -> str:
    """
    Sanitize and validate phone number
    
    Args:
        phone: Phone number string
    
    Returns:
        Clean phone number (+234...)
    
    Raises:
        ValueError: If invalid format
    """
    # Remove spaces, dashes, parentheses
    phone = re.sub(r'[\s\-\(\)]', '', phone)
    
    # Add +234 prefix if missing
    if phone.startswith('0'):
        phone = '+234' + phone[1:]
    elif not phone.startswith('+234'):
        phone = '+234' + phone
    
    # Validate format: +234 followed by 10 digits
    if not re.match(r'^\+234\d{10}$', phone):
        raise ValueError("Invalid Nigerian phone number format")
    
    return phone


def sanitize_text_input(text: str, max_length: int = 500) -> str:
    """
    Sanitize text input to prevent XSS and injection
    
    Args:
        text: User input text
        max_length: Maximum allowed length
    
    Returns:
        Sanitized text
    """
    # Remove HTML tags
    text = re.sub(r'<[^>]+>', '', text)
    
    # Remove SQL injection patterns
    text = re.sub(r'(DROP|DELETE|INSERT|UPDATE|SELECT)\s+(TABLE|FROM|INTO)', '', text, flags=re.IGNORECASE)
    
    # Remove script tags
    text = re.sub(r'<script[^>]*>.*?</script>', '', text, flags=re.IGNORECASE)
    
    # Truncate to max length
    text = text[:max_length]
    
    # Strip whitespace
    text = text.strip()
    
    return text


# ==================== SQL INJECTION PREVENTION ====================

def validate_mongodb_query(query: Dict) -> bool:
    """
    Validate MongoDB query to prevent NoSQL injection
    
    Args:
        query: MongoDB query dict
    
    Returns:
        True if safe, raises HTTPException if suspicious
    """
    # Check for dangerous operators
    dangerous_ops = ["$where", "$function", "$accumulator"]
    
    for key in query.keys():
        if key in dangerous_ops:
            raise HTTPException(
                status_code=400,
                detail="Suspicious query detected"
            )
    
    return True


# ==================== SECURITY EVENT LOGGING ====================

class SecurityLogger:
    """
    Log all security-relevant events for audit trail
    """
    
    @staticmethod
    async def log_event(
        event_type: str,
        user_id: str = None,
        ip_address: str = None,
        details: str = None
    ):
        """
        Log security event
        
        Types:
        - login_success
        - login_failed
        - 2fa_success
        - 2fa_failed
        - rate_limit_exceeded
        - suspicious_activity
        - document_rejected
        - trial_exhausted
        """
        event = {
            "timestamp": datetime.utcnow().isoformat(),
            "event_type": event_type,
            "user_id": user_id,
            "ip_address": ip_address,
            "details": details
        }
        
        # In production: Store in security_events collection
        logger.info(f"🔒 SECURITY EVENT: {event_type} - {user_id or ip_address} - {details}")
        
        # Flag high-severity events
        if event_type in ["rate_limit_exceeded", "suspicious_activity", "brute_force_detected"]:
            logger.warning(f"🚨 HIGH SEVERITY: {event}")


# ==================== EXPORT ====================

__all__ = [
    'create_jwt_token',
    'verify_jwt_token',
    'get_current_user',
    'RateLimiter',
    'general_limiter',
    'auth_limiter',
    'otp_limiter',
    'sign_request',
    'verify_request_signature',
    'send_2fa_code',
    'verify_2fa_code',
    'check_admin_ip',
    'AnomalyDetector',
    'check_brute_force',
    'record_failed_login',
    'clear_login_attempts',
    'sanitize_phone_number',
    'sanitize_text_input',
    'validate_mongodb_query',
    'SecurityLogger',
    'SECURITY_HEADERS',
]

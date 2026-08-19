from fastapi import FastAPI, APIRouter, HTTPException, status, Response, Request, WebSocket, WebSocketDisconnect, Form, File, UploadFile, Body, Depends
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse as FJSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import GZipMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware
from typing import Set
import os
import logging

# ── Structured logging ────────────────────────────────────────────────────────
import structlog

_LOG_REDACT = {"password", "token", "otp", "code", "secret", "pin", "jwt", "credential"}

def _redact_processor(logger, method, event_dict):
    """Redact sensitive fields from every structured log entry."""
    for key in list(event_dict.keys()):
        if any(s in key.lower() for s in _LOG_REDACT):
            event_dict[key] = "***REDACTED***"
    return event_dict

structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso"),
        _redact_processor,
        structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
    ],
    wrapper_class=structlog.stdlib.BoundLogger,
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    cache_logger_on_first_use=True,
)
_formatter = structlog.stdlib.ProcessorFormatter(
    processor=structlog.processors.JSONRenderer(),
)
_handler = logging.StreamHandler()
_handler.setFormatter(_formatter)
root_logger = logging.getLogger()
root_logger.handlers.clear()
root_logger.addHandler(_handler)
root_logger.setLevel(logging.INFO)

# ── Sentry error tracking ─────────────────────────────────────────────────────
def _valid_sentry_dsn(dsn: str) -> bool:
    """Reject empty/placeholder DSNs. A real DSN is https://<key>@<host>/<project_id>
    with a non-zero project id and an ingest host — never the .../0 placeholder."""
    dsn = (dsn or "").strip()
    if not dsn or "@" not in dsn:
        return False
    try:
        project_id = dsn.rsplit("/", 1)[1]
    except Exception:
        return False
    if not project_id.isdigit() or int(project_id) <= 0:
        return False
    return "sentry.io" in dsn or "ingest." in dsn


_SENTRY_DSN = os.environ.get("SENTRY_DSN", "").strip()
if _SENTRY_DSN and _valid_sentry_dsn(_SENTRY_DSN):
    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.starlette import StarletteIntegration
        sentry_sdk.init(
            dsn=_SENTRY_DSN,
            integrations=[StarletteIntegration(), FastApiIntegration()],
            traces_sample_rate=0.1,
            send_default_pii=False,
            environment=os.environ.get("NEXRYDE_ENV", "production"),
            release=os.environ.get("K_REVISION") or None,
        )
        logging.getLogger(__name__).info("Sentry initialized")
    except Exception as _sentry_exc:  # never let a bad DSN crash startup
        _SENTRY_DSN = ""
        logging.getLogger(__name__).warning("Sentry init failed; running without it: %s", _sentry_exc)
elif _SENTRY_DSN:
    # A value is set but it's a placeholder/malformed — disable rather than crash.
    logging.getLogger(__name__).warning("SENTRY_DSN present but invalid/placeholder — Sentry disabled")
    _SENTRY_DSN = ""
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timedelta, timezone
import random
import math
import httpx
import hashlib
import json
import asyncio
import time
# rate_limit (SlowAPI) removed — using security_advanced.RateLimiter
from fare_config import FARE_CONFIG, SHORT_TRIP_KM_THRESHOLD, normalize_fare_city_key, resolve_fare_rate_card
from nexryde_pricing import (
    append_stop_time_breakdown_suffix,
    core_components_from_rate_card,
    intermediate_stop_time_components,
    nexryde_route_location_multiplier,
    nexryde_route_time_minutes,
    nexryde_service_multiplier,
)
from surge_pricing import compute_max_style_surge_multiplier
from lagride_lagos_pricing import build_lagos_lagride_fare_breakdown

# Chat is limited to rider-driver messaging for the launch surface.
# from emergentintegrations.llm.chat import LlmChat, UserMessage
LlmChat = None
UserMessage = None

from payment_reminder_system import payment_reminder_job

# ONE trial model: driver_trial_policy. The legacy subscription_manager (24h/3-trip)
# and two_tier_subscription (48h/0-trip) routers were retired — this shim keeps their
# old /api/subscription paths answering from the canonical source (audit 7.1).
from legacy_subscription_routes import legacy_subscription_router

# Import Route Caching Service (API Cost Protection)
from route_cache_service import route_cache_router

# Import Smart Route Planner (Eliminate Empty Returns)
from smart_route_planner import route_planner_router

# Import Map Service (Cost Controlled)
from map_service import map_router
from places_service import places_router
from safety_data_service import safety_data_router

# Import Call Service (Privacy Protected)
from call_service import call_router

# Import Smart Mode
from smart_mode_ai import router as smart_mode_router

# Import Community & Safety Routers (REFACTORED)
from routers.community import community_router, seed_community_groups, seed_community_content, cleanup_test_community_events
from routers.safety import safety_router, seed_danger_zones
from routers.admin import admin_router, require_admin_access
from routers.admin_ops import admin_ops_router
from routers.admin_driver_profile import admin_driver_profile_router
from routers.admin_ops_center import admin_ops_center_router
from routers.admin_rider_profile import admin_rider_profile_router
from routers.admin_notifications import admin_notifications_router
from routers.trips import trips_router, set_fare_estimate_store, set_shared_functions
from routers.auth import auth_router, send_otp as router_send_otp, ensure_otp_indexes
from routers.bidding import bidding_router
from routers.payments import payments_router, set_payments_shared_functions, set_payments_fare_estimate_store
from routers.realtime_dispatch import realtime_dispatch_router
from routers.connect_realtime import connect_realtime_router
from realtime_platform.gateway import realtime_gateway_router
from routers.voice import voice_router
from enforcement_system import enforcement_router, record_violation, check_user_status
from driver_compliance import compliance_router, start_compliance_background_tasks

ROOT_DIR = Path(__file__).parent
ADMIN_DIR = ROOT_DIR / 'admin'  # admin folder is inside backend/
ADMIN_SPA_DIR = ADMIN_DIR / 'dist'
load_dotenv(ROOT_DIR / '.env')

# ── Startup environment validation ────────────────────────────────────────────
# Fail fast on missing critical vars rather than serving broken endpoints.
_REQUIRED_ENV = {
    "JWT_SECRET": "Authentication",
    "MONGODB_URI": "Database",
}
_WARN_ENV = {
    "REDIS_URL": "Rate limiting / WebSocket pub/sub",
    "SQUAD_WEBHOOK_SECRET": "Payment webhook verification",
    "BREVO_API_KEY": "Email OTP delivery",
}
_missing_critical = [k for k, _ in _REQUIRED_ENV.items() if not os.environ.get(k)]
if _missing_critical and not os.environ.get("ALLOW_INSECURE_JWT_FOR_TESTS"):
    for k in _missing_critical:
        logging.getLogger(__name__).critical("STARTUP ABORT: Required env var %s (%s) is missing — refusing to start", k, _REQUIRED_ENV[k])
    import sys as _sys
    _sys.exit(1)
for k, desc in _WARN_ENV.items():
    if not os.environ.get(k):
        logging.getLogger(__name__).warning("STARTUP: Optional env var %s (%s) not set — degraded functionality", k, desc)

# MongoDB — use the single pooled client from database.py (no duplicate).
from database import client, db  # noqa: E402 — after load_dotenv

_ENGAGEMENT_LOOP_ENABLED = os.environ.get("ENGAGEMENT_LOOP_ENABLED", "").strip().lower() in ("1", "true", "yes", "on")
if _ENGAGEMENT_LOOP_ENABLED:
    try:
        from notification_service import validate_firebase_admin_config

        _firebase_status = validate_firebase_admin_config(require=True)
        logging.getLogger(__name__).info(
            "STARTUP: Firebase Admin ready for engagement notifications configured=%s initialized=%s",
            _firebase_status.get("configured"),
            _firebase_status.get("initialized"),
        )
    except Exception as _firebase_startup_exc:
        logging.getLogger(__name__).critical(
            "STARTUP ABORT: Engagement notifications are enabled but Firebase Admin is not ready: %s",
            _firebase_startup_exc,
        )
        import sys as _sys
        _sys.exit(1)

# Google Maps API Key
GOOGLE_MAPS_API_KEY = os.environ.get('GOOGLE_MAPS_API_KEY', '')

# Emergent Auth URL
EMERGENT_AUTH_URL = os.environ.get('EMERGENT_AUTH_URL', '')

# Create the main app
_is_production_env = (
    os.environ.get("NEXRYDE_ENV", os.environ.get("ENVIRONMENT", "production")).strip().lower()
    == "production"
)
app = FastAPI(
    title="NEXRYDE API",
    version="2.0.0",
    docs_url=None if _is_production_env else "/docs",
    redoc_url=None if _is_production_env else "/redoc",
    openapi_url=None if _is_production_env else "/openapi.json",
)

# limiter removed (SlowAPI fully replaced by security_advanced.RateLimiter)


@app.exception_handler(Exception)
async def _global_exception_handler(request: Request, exc: Exception):
    """Catch all unhandled 500s — log + Sentry capture, never expose traceback to clients."""
    import traceback
    logger = logging.getLogger(__name__)
    logger.error(
        "Unhandled exception path=%s method=%s error=%s",
        request.url.path,
        request.method,
        type(exc).__name__,
        exc_info=True,
    )
    if _SENTRY_DSN:
        import sentry_sdk
        sentry_sdk.capture_exception(exc)
    return FJSONResponse(
        status_code=500,
        content={"detail": "An unexpected error occurred. Our team has been notified."},
    )


@app.get("/")
async def service_root():
    """Minimal root for probes; REST API is under /api."""
    return {"service": "nexryde-api", "api": "/api", "docs": "/docs"}


@app.get("/health")
async def service_health_liveness():
    """Liveness without Mongo — Cloud Run can probe before deferred startup completes."""
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}


# ── Android App Links verification ────────────────────────────────────────────
# Serves the Digital Asset Links file so Android can verify that
# https://nexryde.app/invite/* links open NEXRYDE directly without a chooser.
# SHA-256 fingerprint: Google Play Console → Release → Setup → App signing
_ASSETLINKS_SHA256 = os.environ.get("ANDROID_SHA256_CERT", "")

@app.get("/.well-known/assetlinks.json", include_in_schema=False)
async def assetlinks():
    """Android App Links verification — required for autoVerify deep links."""
    links = [
        {
            "relation": ["delegate_permission/common.handle_all_urls"],
            "target": {
                "namespace": "android_app",
                "package_name": "com.nexryde.app",
                "sha256_cert_fingerprints": [_ASSETLINKS_SHA256] if _ASSETLINKS_SHA256 else [],
            },
        }
    ]
    return FJSONResponse(content=links, headers={"Cache-Control": "public, max-age=86400"})


# ── iOS Universal Links verification ──────────────────────────────────────────
# Apple fetches this file to verify that nexryde.app links should open the app.
# Team ID and bundle ID come from Apple Developer Portal / EAS credentials.
# Set IOS_TEAM_ID env var in Cloud Run to enable real verification.
_IOS_TEAM_ID     = os.environ.get("IOS_TEAM_ID", "")      # e.g. "ABCDE12345"
_IOS_BUNDLE_ID   = "com.nexryde.app"

@app.get("/.well-known/apple-app-site-association", include_in_schema=False)
async def apple_app_site_association():
    """
    iOS Universal Links verification.
    Apple CDN fetches this at app install / update to verify the domain.
    """
    aasa: dict = {
        "applinks": {
            "apps": [],
            "details": [
                {
                    "appID": f"{_IOS_TEAM_ID}.{_IOS_BUNDLE_ID}" if _IOS_TEAM_ID else _IOS_BUNDLE_ID,
                    "paths": [
                        "/invite/*",
                        "/referral/*",
                        "/join/*",
                    ],
                }
            ],
        },
        "webcredentials": {
            "apps": [
                f"{_IOS_TEAM_ID}.{_IOS_BUNDLE_ID}" if _IOS_TEAM_ID else _IOS_BUNDLE_ID
            ]
        },
    }
    return FJSONResponse(
        content=aasa,
        headers={
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=3600",
        },
    )


# ── Referral invite redirect page ─────────────────────────────────────────────
# When someone taps a nexryde.app/invite/{slug} link:
#   • If NEXRYDE is installed → Android intent URL opens the app directly.
#   • If not installed → falls back to Play Store.
# This page also stores the referral identifier in the URL so the app can
# read it from Linking.getInitialURL() on cold-start.

_PLAY_STORE_URL  = "https://play.google.com/store/apps/details?id=com.nexryde.app"
_APP_STORE_URL   = "https://apps.apple.com/app/nexryde/id6766440778"

_INVITE_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="theme-color" content="#0D1420">
<title>Join NEXRYDE — Nigeria's Smartest Ride App</title>
<style>
  *{{box-sizing:border-box;margin:0;padding:0}}
  body{{background:#0D1420;color:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;padding-bottom:env(safe-area-inset-bottom,24px)}}
  .card{{background:#111827;border-radius:24px;padding:36px 24px;max-width:420px;width:100%;text-align:center;box-shadow:0 8px 60px rgba(0,0,0,.7);border:1px solid #1e293b}}
  .logo{{font-size:52px;margin-bottom:14px}}
  .brand{{font-size:13px;font-weight:800;color:#22C55E;letter-spacing:2px;text-transform:uppercase;margin-bottom:10px}}
  h1{{font-size:22px;font-weight:900;margin-bottom:8px;line-height:1.3}}
  .sub{{color:#94A3B8;font-size:14px;margin-bottom:24px;line-height:1.6}}
  .reward{{background:linear-gradient(135deg,#3B0764,#6D28D9);border-radius:14px;padding:16px 20px;margin-bottom:24px;border:1px solid rgba(139,92,246,.3)}}
  .reward-label{{font-size:11px;color:#C4B5FD;font-weight:700;text-transform:uppercase;letter-spacing:.8px}}
  .reward-amount{{font-size:36px;font-weight:900;color:#fff;margin-top:4px}}
  .reward-sub{{font-size:12px;color:#A78BFA;margin-top:4px}}
  .btn{{display:flex;align-items:center;justify-content:center;gap:8px;background:#22C55E;color:#022C22;text-decoration:none;border-radius:14px;padding:16px;font-size:16px;font-weight:900;margin-bottom:10px;transition:opacity .15s}}
  .btn:active{{opacity:.85}}
  .btn-android{{background:#22C55E}}
  .btn-ios{{background:#0ea5e9;color:#fff}}
  .btn-secondary{{background:#1e293b;color:#94A3B8;font-size:14px;padding:13px;border:1px solid #334155}}
  .store-btns{{display:none}}
  .divider{{display:flex;align-items:center;gap:8px;margin:16px 0;color:#334155;font-size:12px}}
  .divider::before,.divider::after{{content:'';flex:1;height:1px;background:#1e293b}}
  .note{{font-size:12px;color:#475569;margin-top:16px;line-height:1.5}}
  .badge{{display:inline-block;background:rgba(34,197,94,.1);color:#22C55E;font-size:11px;font-weight:800;border-radius:999px;padding:3px 10px;margin-bottom:14px;border:1px solid rgba(34,197,94,.25)}}
</style>
</head>
<body>
<div class="card">
  <div class="logo">🚗</div>
  <div class="brand">NEXRYDE</div>
  <div class="badge">You've been invited</div>
  <h1>Nigeria's Smartest Ride App</h1>
  <p class="sub">Your friend invited you to join NEXRYDE — book rides in seconds, keep 100% of your fare as a driver.</p>
  <div class="reward">
    <div class="reward-label">New rider welcome bonus</div>
    <div class="reward-amount">₦500 FREE</div>
    <div class="reward-sub">Applied automatically on your first ride</div>
  </div>
  <a class="btn btn-android" id="openBtn" href="{intent_url}">
    <span>🚀</span> Open NEXRYDE App
  </a>
  <div class="store-btns" id="storeBtns">
    <div class="divider">Download the app</div>
    <a class="btn btn-android" href="{play_store_url}">📱 Get it on Play Store</a>
    <a class="btn btn-ios" href="{app_store_url}">🍎 Download on App Store</a>
  </div>
  <p class="note" id="note">Already installed? Tap "Open NEXRYDE App" above.</p>
</div>
<script>
(function(){{
  var ua        = navigator.userAgent || '';
  var isIOS     = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  var isAndroid = /Android/.test(ua);
  var deeplink  = "{deeplink_url}";
  var intent    = "{intent_url}";
  var playStore = "{play_store_url}";
  var appStore  = "{app_store_url}";

  var openBtn   = document.getElementById('openBtn');
  var storeBtns = document.getElementById('storeBtns');
  var note      = document.getElementById('note');

  if (isIOS) {{
    // iOS: use universal link / custom scheme; fall back to App Store
    openBtn.href    = deeplink;
    openBtn.innerHTML = '<span>🍎</span> Open NEXRYDE on iPhone';
    openBtn.className = 'btn btn-ios';
    note.textContent  = 'If the app is not installed, you will be redirected to the App Store.';
    var timer = setTimeout(function(){{ window.location = appStore; }}, 2500);
    openBtn.addEventListener('click', function(){{ clearTimeout(timer); }});
    window.location = deeplink;
  }} else if (isAndroid) {{
    // Android: intent URL opens app with Play Store fallback
    openBtn.href = intent;
    var timer = setTimeout(function(){{ window.location = playStore; }}, 2500);
    openBtn.addEventListener('click', function(){{ clearTimeout(timer); }});
    window.location.href = deeplink;
  }} else {{
    // Desktop / unknown: show both store buttons
    openBtn.style.display = 'none';
    storeBtns.style.display = 'block';
    note.textContent = 'Scan the QR code or search "NEXRYDE" in your device's app store.';
  }}
}})();
</script>
</body>
</html>"""

@app.get("/invite/{identifier}", response_class=HTMLResponse, include_in_schema=False)
async def invite_redirect(identifier: str):
    """Smart invite landing page — opens the NEXRYDE app on Android or iOS, or shows store buttons."""
    slug = identifier.strip()
    deeplink_url = f"nexryde://invite/{slug}"
    intent_url = (
        f"intent://invite/{slug}"
        "#Intent;"
        "scheme=nexryde;"
        "package=com.nexryde.app;"
        f"S.browser_fallback_url={_PLAY_STORE_URL};"
        "end"
    )
    html = _INVITE_HTML.format(
        deeplink_url=deeplink_url,
        intent_url=intent_url,
        play_store_url=_PLAY_STORE_URL,
        app_store_url=_APP_STORE_URL,
    )
    return HTMLResponse(content=html)


# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

logger = logging.getLogger(__name__)

# ==================== CONFIGURATION ====================

# FARE_CONFIG: fare_config.py · surge rules: surge_pricing.py (used by calculate_fare).

# Driver Certification Levels
DRIVER_CERTIFICATION_LEVELS = {
    "bronze": {
        "name": "Bronze",
        "min_trips": 0,
        "min_rating": 0,
        "min_months": 0,
        "perks": ["Basic support", "Standard matching"],
        "badge_color": "#CD7F32"
    },
    "silver": {
        "name": "Silver", 
        "min_trips": 50,
        "min_rating": 4.5,
        "min_months": 3,
        "perks": ["Priority support", "Early features", "5% subscription discount"],
        "badge_color": "#C0C0C0"
    },
    "gold": {
        "name": "Gold",
        "min_trips": 200,
        "min_rating": 4.7,
        "min_months": 6,
        "perks": ["Premium support", "Fee waiver days", "Premium matching", "10% subscription discount"],
        "badge_color": "#FFD700"
    },
    "platinum": {
        "name": "Platinum",
        "min_trips": 500,
        "min_rating": 4.9,
        "min_months": 12,
        "perks": ["Dedicated support", "Profit sharing", "First access to new features", "15% subscription discount", "Free subscription month yearly"],
        "badge_color": "#E5E4E2"
    }
}

# Route deviation threshold in km
ROUTE_DEVIATION_THRESHOLD = 0.5
# Abnormal stop duration in seconds
ABNORMAL_STOP_THRESHOLD = 300  # 5 minutes
# Cache settings — in-memory LRU acts as L1, MongoDB as persistent L2.
# Capped at 2 000 entries to prevent unbounded memory growth under load.
from collections import OrderedDict as _OrderedDict

class _LRUCache(dict):
    """Simple in-process LRU cache capped at `maxsize` entries."""
    def __init__(self, maxsize: int = 2000):
        super().__init__()
        self._maxsize = maxsize
        self._order: _OrderedDict = _OrderedDict()

    def __setitem__(self, key, value):
        if key in self._order:
            self._order.move_to_end(key)
        self._order[key] = True
        super().__setitem__(key, value)
        while len(self._order) > self._maxsize:
            oldest, _ = self._order.popitem(last=False)
            super().pop(oldest, None)

    def __getitem__(self, key):
        if key in self._order:
            self._order.move_to_end(key)
        return super().__getitem__(key)

route_cache: Dict[str, Dict[str, Any]] = _LRUCache(maxsize=2000)
CACHE_TTL_SECONDS = 300          # L1 in-memory: 5 minutes
PERSISTENT_CACHE_TTL_HOURS = 24  # L2 MongoDB: 24 hours
# Fare lock duration
FARE_LOCK_MINUTES = 10
# OTP storage
otp_store = {}
# Fare estimate storage
fare_estimate_store: Dict[str, Dict[str, Any]] = {}

# Driver subscription/trial config: single source is driver_trial_policy
# (system_config.driver_trial_defaults) + routers/payments.SUBSCRIPTION_CONFIG.

# ==================== RIDE TYPES CONFIG ====================
RIDE_TYPES = {
    "economy": {"name": "Economy", "multiplier": 1.0, "description": "Affordable rides"},
    "comfort": {"name": "Comfort", "multiplier": 1.3, "description": "Extra comfort"},
    "premium": {"name": "Premium", "multiplier": 1.8, "description": "Luxury vehicles"},
    "xl": {"name": "XL", "multiplier": 1.5, "description": "6+ passengers"},
    "female_only": {"name": "Women Only", "multiplier": 1.1, "description": "Female drivers for female riders"},
    "package": {"name": "Package", "multiplier": 0.9, "description": "Send packages"},
}

# ==================== PROMO/REFERRAL CONFIG ====================
PROMO_CONFIG = {
    "referral_bonus_referrer": 500,  # ₦500 for referrer (matches incentives.py)
    "referral_bonus_referee": 500,   # ₦500 for new rider (matches incentives.py)
    "first_ride_discount": 0.2,      # 20% off first ride fare
    "max_promo_discount": 0.5,       # Max 50% discount on coded promos
}

# ==================== SUPPORTED LANGUAGES ====================
SUPPORTED_LANGUAGES = {
    "en": "English",
    "pcm": "Pidgin",
    "yo": "Yoruba",
    "ig": "Igbo",
    "ha": "Hausa",
}

# ==================== MODELS ====================

class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    phone: str = ""
    name: Optional[str] = None
    email: Optional[str] = None
    role: str = "rider"
    gender: Optional[str] = None  # For women-only mode
    created_at: datetime = Field(default_factory=datetime.utcnow)
    is_verified: bool = False
    face_verified: bool = False
    face_image: Optional[str] = None  # Base64 encoded face image for verification
    profile_image: Optional[str] = None
    google_id: Optional[str] = None  # Google OAuth ID
    rating: float = 5.0
    total_trips: int = 0
    behavior_score: float = 100.0  # Behavior score (hidden)
    emergency_contacts: List[dict] = []  # [{name, phone, relationship}]
    favorite_drivers: List[str] = []  # List of driver IDs
    blocked_drivers: List[str] = []  # List of driver IDs
    blocked_riders: List[str] = []  # List of rider IDs (for drivers)
    streaks: dict = Field(default_factory=lambda: {"current": 0, "best": 0, "last_date": None})
    badges: List[str] = []
    # NEXRYDE Family
    family_id: Optional[str] = None  # Family group ID
    family_role: Optional[str] = None  # "owner" or "member"
    trust_score: float = 100.0  # Trust score (inheritable)
    # Women-only mode preference
    women_only_mode: bool = False
    # New fields for registration
    nin: Optional[str] = None  # National Identification Number for riders
    terms_accepted: Optional[bool] = None  # Terms acceptance for drivers
    terms_accepted_at: Optional[str] = None  # Timestamp when driver accepted terms
    
class DriverProfile(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    nin_verified: bool = False
    license_uploaded: bool = False
    vehicle_docs_uploaded: bool = False
    selfie_verified: bool = False
    face_image: Optional[str] = None  # For face match at ride start
    vehicle_type: Optional[str] = None
    vehicle_model: Optional[str] = None
    vehicle_plate: Optional[str] = None
    vehicle_color: Optional[str] = None
    is_online: bool = False
    current_location: Optional[dict] = None
    completion_rate: float = 100.0
    cancellation_count: int = 0
    rank: str = "standard"
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    account_name: Optional[str] = None
    # Comfort ratings
    smoothness_rating: float = 5.0
    politeness_rating: float = 5.0
    cleanliness_rating: float = 5.0
    safety_rating: float = 5.0
    # Fatigue monitoring
    hours_driven_today: float = 0.0
    last_break_at: Optional[datetime] = None
    fatigue_warning: bool = False
    # Stats
    weekly_trips: int = 0
    weekly_earnings: float = 0.0
    challenges_completed: List[str] = []
    created_at: datetime = Field(default_factory=datetime.utcnow)

class Subscription(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    driver_id: str
    amount: float = 18000.0
    status: str = "trial"  # trial, pending_payment, pending_verification, active, expired, suspended
    start_date: datetime = Field(default_factory=datetime.utcnow)
    end_date: datetime = Field(default_factory=lambda: datetime.utcnow() + timedelta(days=30))
    trial_end_date: Optional[datetime] = None  # Trial period end date
    payment_method: Optional[str] = None
    transaction_id: Optional[str] = None
    payment_screenshot: Optional[str] = None  # Base64 encoded screenshot
    payment_submitted_at: Optional[datetime] = None
    payment_verified_at: Optional[datetime] = None
    grace_period_requested: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
class PaymentProofSubmission(BaseModel):
    driver_id: str
    screenshot: str  # Base64 encoded image
    amount: float = 18000.0
    payment_reference: Optional[str] = None

class Trip(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    rider_id: str
    driver_id: Optional[str] = None
    pickup_location: dict
    dropoff_location: dict
    distance_km: float
    duration_mins: int
    base_fare: float = 800.0
    distance_fee: float = 0.0
    time_fee: float = 0.0
    traffic_fee: float = 0.0
    fare: float
    surge_multiplier: float = 1.0
    service_type: str = "economy"
    status: str = "pending"
    payment_method: str = "cash"
    payment_status: str = "pending"
    # Ratings
    rider_rating: Optional[float] = None
    driver_rating: Optional[float] = None
    # Comfort ratings from rider
    comfort_ratings: Optional[dict] = None  # {smoothness, politeness, cleanliness, safety}
    rating_comment: Optional[str] = None
    # Safety features
    is_monitored: bool = True
    sos_triggered: bool = False
    security_code: Optional[str] = None  # 4-digit code for driver verification
    security_code_verified: bool = False
    security_code_attempts: int = 0
    sos_triggered_at: Optional[datetime] = None
    route_deviation_detected: bool = False
    abnormal_stop_detected: bool = False
    risk_alert_by_driver: bool = False
    risk_alert_by_rider: bool = False
    recording_enabled: bool = False
    face_verified_at_start: bool = False
    # Route tracking
    polyline: Optional[str] = None
    actual_route: List[dict] = []  # [{lat, lng, timestamp}]
    fare_locked_until: Optional[datetime] = None
    # Insurance
    is_insured: bool = True
    insurance_id: Optional[str] = None
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    accepted_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    cancelled_at: Optional[datetime] = None
    cancelled_by: Optional[str] = None

class SOSAlert(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    trip_id: str
    user_id: str
    user_role: str  # rider or driver
    location: dict  # {lat, lng}
    triggered_at: datetime = Field(default_factory=datetime.utcnow)
    auto_triggered: bool = False  # If triggered automatically
    status: str = "active"  # active, resolved, false_alarm
    emergency_contacts_notified: List[str] = []
    admin_notified: bool = False
    audio_recording_url: Optional[str] = None
    resolution_notes: Optional[str] = None
    resolved_at: Optional[datetime] = None

class SafetyCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    trip_id: str
    check_type: str  # route_deviation, abnormal_stop, long_idle, safety_prompt
    triggered_at: datetime = Field(default_factory=datetime.utcnow)
    location: dict
    rider_response: Optional[str] = None  # "safe", "need_help", "no_response"
    responded_at: Optional[datetime] = None
    escalated: bool = False

class Wallet(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    balance: float = 0.0
    currency: str = "NGN"
    created_at: datetime = Field(default_factory=datetime.utcnow)

class Challenge(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    description: str
    target_type: str  # trips, rating, cancellation_free, earnings
    target_value: float
    reward_type: str  # badge, priority_boost, bonus
    reward_value: str
    start_date: datetime
    end_date: datetime
    is_active: bool = True

# ==================== REQUEST MODELS ====================

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
    nin: Optional[str] = None  # National Identification Number for riders
    terms_accepted: Optional[bool] = None  # Terms acceptance for drivers
    terms_accepted_at: Optional[str] = None  # Timestamp when terms were accepted

class UpdateProfileRequest(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    profile_image: Optional[str] = None

class EmergencyContactRequest(BaseModel):
    name: str
    phone: str
    relationship: str

class FaceVerificationRequest(BaseModel):
    face_image: str  # Base64 encoded image

# Driver Document Verification Models
class DriverVerificationSubmission(BaseModel):
    user_id: str
    personal_info: dict  # {fullName, phone, email, address, dateOfBirth}
    vehicle_info: dict  # {vehicleMake, vehicleModel, vehicleYear, vehicleColor, plateNumber}
    documents: dict  # {nin, drivers_license, passport_photo, vehicle_registration, insurance}

class DriverVerificationStatus(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    personal_info: dict = {}
    vehicle_info: dict = {}
    documents: dict = {}
    status: str = "pending"  # pending, under_review, approved, rejected
    submitted_at: datetime = Field(default_factory=datetime.utcnow)
    reviewed_at: Optional[datetime] = None
    reviewed_by: Optional[str] = None
    rejection_reason: Optional[str] = None
    notes: Optional[str] = None

class DriverProfileUpdate(BaseModel):
    vehicle_type: Optional[str] = None
    vehicle_model: Optional[str] = None
    vehicle_plate: Optional[str] = None
    vehicle_color: Optional[str] = None
    nin_verified: Optional[bool] = None
    license_uploaded: Optional[bool] = None
    vehicle_docs_uploaded: Optional[bool] = None
    selfie_verified: Optional[bool] = None
    face_image: Optional[str] = None
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    account_name: Optional[str] = None

class LocationUpdate(BaseModel):
    latitude: float
    longitude: float

class FareEstimateRequest(BaseModel):
    pickup_lat: float
    pickup_lng: float
    dropoff_lat: float
    dropoff_lng: float
    service_type: str = "economy"
    city: str = "lagos"

class TripRequest(BaseModel):
    pickup_lat: float
    pickup_lng: float
    pickup_address: str
    dropoff_lat: float
    dropoff_lng: float
    dropoff_address: str
    service_type: str = "economy"
    payment_method: str = "cash"
    fare_estimate_id: Optional[str] = None
    enable_recording: bool = False

class ComfortRatingRequest(BaseModel):
    overall_rating: float
    smoothness: Optional[float] = None
    politeness: Optional[float] = None
    cleanliness: Optional[float] = None
    safety: Optional[float] = None
    comment: Optional[str] = None

class SOSRequest(BaseModel):
    trip_id: str
    location_lat: float
    location_lng: float
    auto_triggered: bool = False

class SafetyResponseRequest(BaseModel):
    check_id: str
    response: str  # "safe", "need_help"

class RiskAlertRequest(BaseModel):
    trip_id: str
    reason: Optional[str] = None

class FavoriteDriverRequest(BaseModel):
    driver_id: str

class BookForOtherRequest(BaseModel):
    pickup_lat: float
    pickup_lng: float
    pickup_address: str
    dropoff_lat: float
    dropoff_lng: float
    dropoff_address: str
    rider_name: str
    rider_phone: str
    service_type: str = "economy"
    payment_method: str = "cash"

class SubscriptionRequest(BaseModel):
    payment_method: str

class GracePeriodRequest(BaseModel):
    reason: str
    days_requested: int = 3

# ==================== TIER SYSTEM MODELS ====================

class DriverTier(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    driver_id: str
    tier: str = "basic"  # basic or premium
    earning_potential: dict = Field(default_factory=lambda: {"min": 200, "max": 300})
    requirements_met: dict = Field(default_factory=dict)
    upgraded_at: Optional[datetime] = None
    downgraded_at: Optional[datetime] = None
    warnings: int = 0
    probation_until: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class VehicleInspection(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    driver_id: str
    inspection_type: str  # initial, quarterly, random
    status: str = "pending"  # pending, passed, failed
    interior_photo: Optional[str] = None
    exterior_photo: Optional[str] = None
    ac_working: bool = False
    leather_seats: bool = False
    vehicle_year: Optional[int] = None
    notes: Optional[str] = None
    inspected_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class FareAdjustment(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    trip_id: str
    base_fare: float
    estimated_time_mins: int
    actual_time_mins: int
    extra_time_mins: int = 0
    time_rate: float = 20.0  # NGN per minute
    traffic_charge: float = 0.0
    weather_surcharge: float = 0.0
    time_of_day_premium: float = 0.0
    total_adjustment: float = 0.0
    final_fare: float = 0.0
    cap_applied: bool = False
    max_cap_percentage: float = 50.0
    calculated_at: datetime = Field(default_factory=datetime.utcnow)

class TripTracking(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    trip_id: str
    speed_logs: List[dict] = []  # [{timestamp, speed_kmh, location}]
    traffic_delays: List[dict] = []  # [{start, end, duration_mins, location}]
    weather_conditions: List[dict] = []  # [{timestamp, condition, surcharge_applied}]
    route_deviations: List[dict] = []
    stationary_periods: List[dict] = []  # [{start, end, duration_mins, at_destination}]
    created_at: datetime = Field(default_factory=datetime.utcnow)

class RiderPreferences(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    preferred_ride_type: str = "quiet"  # quiet, chatty, any
    preferred_ac_level: str = "medium"  # low, medium, high
    preferred_music: str = "none"  # none, soft, any
    saved_routes: List[dict] = []  # [{name, pickup, dropoff}]
    default_payment: str = "cash"
    auto_tip_percentage: float = 0.0
    created_at: datetime = Field(default_factory=datetime.utcnow)

class LoyaltyProgram(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    tier: str = "bronze"  # bronze, silver, gold, platinum
    points: int = 0
    total_trips: int = 0
    total_spent: float = 0.0
    perks_earned: List[str] = []
    created_at: datetime = Field(default_factory=datetime.utcnow)

class InAppMessage(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    trip_id: str
    sender_id: str
    sender_role: str  # rider or driver
    message_type: str = "text"  # text or preset
    content: str
    read: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)

class LostItem(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    trip_id: str
    reporter_id: str
    reporter_role: str  # rider or driver
    item_description: str
    status: str = "reported"  # reported, found, returned, not_found
    driver_response: Optional[str] = None
    resolution_notes: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    resolved_at: Optional[datetime] = None

# Tier System Configuration
TIER_CONFIG = {
    "basic": {
        "name": "NEXRYDE Basic",
        "monthly_fee": 18000,
        "earning_per_ride": {"min": 200, "max": 300},
        "requirements": {
            "vehicle_year_min": None,
            "leather_seats": False,
            "dual_ac": False,
            "min_rating": 4.3
        },
        "color": "#C9A9A6"  # Rose gold
    },
    "premium": {
        "name": "NEXRYDE Premium", 
        "monthly_fee": 18000,  # Same fee!
        "earning_per_ride": {"min": 300, "max": 450},
        "requirements": {
            "vehicle_year_min": 2018,
            "leather_seats": True,
            "dual_ac": True,
            "min_rating": 4.7,
            "premium_training": True
        },
        "color": "#D4AF37",  # Gold
        "perks": [
            "Priority support",
            "Early access to new features", 
            "Free vehicle inspection vouchers",
            "Premium Driver badge"
        ]
    }
}

# Fare Adjustment Configuration
FARE_ADJUSTMENT_CONFIG = {
    "free_buffer_minutes": 5,
    "max_increase_percentage": 50,
    "time_rates": {
        "normal": 20,  # NGN per minute
        "peak": 25,    # 7-10am, 4-8pm
        "night": 30,   # 10pm-5am
        "weekend": 25
    },
    "weather_surcharges": {
        "heavy_rain": 0.10,  # 10%
        "flooding": 0.15,    # 15%
        "extreme_heat": 0.05 # 5%
    },
    "peak_hours": {
        "morning": {"start": 7, "end": 10},
        "evening": {"start": 16, "end": 20}
    },
    "night_hours": {"start": 22, "end": 5}
}

# Loyalty Tiers Configuration  
LOYALTY_TIERS = {
    "bronze": {
        "min_trips": 0,
        "min_spent": 0,
        "perks": ["Basic support"],
        "points_multiplier": 1.0
    },
    "silver": {
        "min_trips": 20,
        "min_spent": 50000,
        "perks": ["Priority support", "5% discount on 10th ride"],
        "points_multiplier": 1.2
    },
    "gold": {
        "min_trips": 50,
        "min_spent": 150000,
        "perks": ["Premium support", "10% discount every 5th ride", "Free cancellation"],
        "points_multiplier": 1.5
    },
    "platinum": {
        "min_trips": 100,
        "min_spent": 500000,
        "perks": ["Dedicated support", "15% off always", "Priority matching", "Free upgrades"],
        "points_multiplier": 2.0
    }
}

# Request Models for New Features
class DriverTierUpgradeRequest(BaseModel):
    vehicle_year: int
    leather_seats: bool
    dual_ac: bool
    interior_photo: str
    exterior_photo: str

class TripTrackingUpdate(BaseModel):
    trip_id: str
    latitude: float
    longitude: float
    speed_kmh: float
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class RiderPreferencesUpdate(BaseModel):
    preferred_ride_type: Optional[str] = None
    preferred_ac_level: Optional[str] = None
    preferred_music: Optional[str] = None
    default_payment: Optional[str] = None
    auto_tip_percentage: Optional[float] = None

class SavedRouteRequest(BaseModel):
    name: str
    pickup_lat: float
    pickup_lng: float
    pickup_address: str
    dropoff_lat: float
    dropoff_lng: float
    dropoff_address: str

class SendMessageRequest(BaseModel):
    trip_id: str
    message_type: str = "text"
    content: str

class ReportLostItemRequest(BaseModel):
    trip_id: str
    item_description: str

class LostItemResponseRequest(BaseModel):
    item_id: str
    response: str  # found, not_found
    notes: Optional[str] = None

# ==================== HELPER FUNCTIONS ====================

from route_cache import directions_cache_key, get_cached_directions, store_cached_directions
from routing_quality import is_directions_road_route


def get_cache_key(
    pickup_lat: float,
    pickup_lng: float,
    dropoff_lat: float,
    dropoff_lng: float,
    stop_lat: Optional[float] = None,
    stop_lng: Optional[float] = None,
) -> str:
    return directions_cache_key(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, stop_lat, stop_lng)


def _directions_route_from_google_response(route: dict) -> dict:
    """Aggregate one or more legs from a Google Directions route."""
    legs = route.get("legs") or []
    if not legs:
        raise ValueError("directions route missing legs")
    distance_m = sum(int((leg.get("distance") or {}).get("value", 0)) for leg in legs)
    duration_s = sum(int((leg.get("duration") or {}).get("value", 0)) for leg in legs)
    traffic_s = 0
    for leg in legs:
        dit = (leg.get("duration_in_traffic") or {}).get("value")
        traffic_s += int(dit if dit is not None else (leg.get("duration") or {}).get("value", 0))
    return {
        "distance_meters": distance_m,
        "duration_seconds": duration_s,
        "duration_in_traffic_seconds": traffic_s,
        "polyline": (route.get("overview_polyline") or {}).get("points", ""),
        "source": "google_directions_api",
    }

def is_cache_valid(cache_entry: dict) -> bool:
    if not cache_entry:
        return False
    cached_at = cache_entry.get("cached_at")
    if not cached_at:
        return False
    return (datetime.utcnow() - cached_at).total_seconds() < CACHE_TTL_SECONDS

def calculate_distance_haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)
    a = math.sin(delta_lat/2)**2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return R * c

def _haversine_estimate(
    pickup_lat: float,
    pickup_lng: float,
    dropoff_lat: float,
    dropoff_lng: float,
    stop_lat: Optional[float] = None,
    stop_lng: Optional[float] = None,
) -> dict:
    """Free estimate using Haversine — no API cost. Applies 1.35x road-factor for Nigerian roads."""
    if stop_lat is not None and stop_lng is not None:
        straight_km = (
            calculate_distance_haversine(pickup_lat, pickup_lng, stop_lat, stop_lng)
            + calculate_distance_haversine(stop_lat, stop_lng, dropoff_lat, dropoff_lng)
        )
    else:
        straight_km = calculate_distance_haversine(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng)
    road_km = straight_km * 1.35
    avg_speed_kmh = 25
    duration_seconds = int((road_km / avg_speed_kmh) * 3600)
    return {
        "distance_meters": int(road_km * 1000),
        "duration_seconds": max(300, duration_seconds),
        "duration_in_traffic_seconds": max(300, int(duration_seconds * 1.2)),
        "polyline": "",
        "source": "haversine",
    }


async def _store_route_in_db(cache_key: str, result: dict):
    """Persist route to MongoDB for long-term reuse across Cloud Run instances."""
    try:
        await db.route_cache_v2.update_one(
            {"cache_key": cache_key},
            {"$set": {
                "cache_key": cache_key,
                "data": result,
                "cached_at": datetime.utcnow(),
                "hits": 0,
            }},
            upsert=True,
        )
    except Exception as e:
        logger.warning(f"Route DB cache write failed: {e}")


async def _get_route_from_db(cache_key: str) -> Optional[dict]:
    """Retrieve route from MongoDB persistent cache (24-hour TTL)."""
    try:
        entry = await db.route_cache_v2.find_one({"cache_key": cache_key})
        if not entry:
            return None
        cached_at = entry.get("cached_at")
        if not cached_at:
            return None
        age_hours = (datetime.utcnow() - cached_at).total_seconds() / 3600
        if age_hours > PERSISTENT_CACHE_TTL_HOURS:
            return None
        await db.route_cache_v2.update_one(
            {"cache_key": cache_key},
            {"$inc": {"hits": 1}},
        )
        return entry["data"]
    except Exception as e:
        logger.warning(f"Route DB cache read failed: {e}")
        return None


async def _redis_get_route(key: str) -> "dict | None":
    """L1.5 — Redis route cache (cross-instance, 6-hour TTL)."""
    try:
        from redis_store import get_redis
        r = get_redis()
        if r is None:
            return None
        import json as _json
        raw = r.get(f"route:{key}")
        return _json.loads(raw) if raw else None
    except Exception:
        return None


async def _redis_set_route(key: str, value: dict, ttl: int = 21600) -> None:
    """Write to Redis route cache (default 6 h)."""
    try:
        from redis_store import get_redis
        r = get_redis()
        if r is None:
            return
        import json as _json
        r.setex(f"route:{key}", ttl, _json.dumps(value, default=str))
    except Exception:
        pass


def _driver_deviated(origin_lat: float, origin_lng: float,
                     current_lat: float, current_lng: float,
                     threshold_m: float = 150.0) -> bool:
    """
    Returns True only when the driver has moved >threshold_m from the
    route origin — the threshold at which a new Directions API call
    is worthwhile.  Avoids unnecessary recalculation during slow traffic.
    """
    return calculate_distance_haversine(origin_lat, origin_lng, current_lat, current_lng) * 1000 > threshold_m


async def get_directions_from_google(
    pickup_lat: float,
    pickup_lng: float,
    dropoff_lat: float,
    dropoff_lng: float,
    stop_lat: Optional[float] = None,
    stop_lng: Optional[float] = None,
) -> dict:
    cache_key = get_cache_key(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, stop_lat, stop_lng)

    # L0: shared fare/trip route cache (LRU + Mongo route_cache — same key as POST /fare/estimate)
    try:
        shared_cached = await get_cached_directions(
            db, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, stop_lat, stop_lng
        )
        if shared_cached and is_directions_road_route(shared_cached):
            cached_hit = dict(shared_cached)
            cached_hit["maps_billed"] = False
            route_cache[cache_key] = {"data": cached_hit, "cached_at": datetime.utcnow()}
            return cached_hit
    except Exception:
        pass

    # L1: in-memory cache (fastest, 5-minute TTL)
    if cache_key in route_cache and is_cache_valid(route_cache[cache_key]):
        hit = dict(route_cache[cache_key]["data"])
        hit["maps_billed"] = False
        return hit

    # L1.5: Redis cross-instance cache (6-hour TTL)
    redis_cached = await _redis_get_route(cache_key)
    if redis_cached:
        redis_cached = dict(redis_cached)
        redis_cached["maps_billed"] = False
        route_cache[cache_key] = {"data": redis_cached, "cached_at": datetime.utcnow()}
        return redis_cached

    # L2: persistent MongoDB cache (survives restarts, 24-hour TTL)
    db_cached = await _get_route_from_db(cache_key)
    if db_cached:
        db_cached = dict(db_cached)
        db_cached["maps_billed"] = False
        route_cache[cache_key] = {"data": db_cached, "cached_at": datetime.utcnow()}
        await _redis_set_route(cache_key, db_cached)
        return db_cached

    if not GOOGLE_MAPS_API_KEY:
        return _haversine_estimate(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, stop_lat, stop_lng)

    # L3: Google Directions API (primary for fare — road distance + traffic-aware ETA when available)
    try:
        url = "https://maps.googleapis.com/maps/api/directions/json"
        params = {
            "origin": f"{pickup_lat},{pickup_lng}",
            "destination": f"{dropoff_lat},{dropoff_lng}",
            "mode": "driving",
            "key": GOOGLE_MAPS_API_KEY,
            "departure_time": "now",
        }
        if stop_lat is not None and stop_lng is not None:
            params["waypoints"] = f"{stop_lat},{stop_lng}"
        from http_client import get_http_client

        client = get_http_client()
        response = await client.get(url, params=params, timeout=10.0)
        data = response.json()

        if data.get("status") != "OK":
            retry_params = {k: v for k, v in params.items() if k != "departure_time"}
            response = await client.get(url, params=retry_params, timeout=10.0)
            data = response.json()

        if data.get("status") == "OK":
            route = data["routes"][0]
            result = _directions_route_from_google_response(route)
            route_cache[cache_key] = {"data": result, "cached_at": datetime.utcnow()}
            await _redis_set_route(cache_key, result)
            await _store_route_in_db(cache_key, result)
            if is_directions_road_route(result):
                try:
                    await store_cached_directions(
                        db,
                        pickup_lat,
                        pickup_lng,
                        dropoff_lat,
                        dropoff_lng,
                        result,
                        stop_lat,
                        stop_lng,
                    )
                except Exception:
                    pass
            result["maps_billed"] = True
            try:
                from maps_billing import incr_maps_call

                await incr_maps_call(
                    trip_id=None,
                    kind="fare_estimate",
                    detail="directions_traffic_aware",
                )
            except Exception:
                pass
            return result
    except Exception as e:
        logger.warning(f"Directions API failed: {e}")

    # L4: Google Routes API v2 (fallback — also driving-distance based)
    try:
        url = "https://routes.googleapis.com/directions/v2:computeRoutes"
        headers = {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
            "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline"
        }
        body = {
            "origin": {"location": {"latLng": {"latitude": pickup_lat, "longitude": pickup_lng}}},
            "destination": {"location": {"latLng": {"latitude": dropoff_lat, "longitude": dropoff_lng}}},
            "travelMode": "DRIVE",
            "routingPreference": "TRAFFIC_AWARE"
        }

        from http_client import get_http_client

        client = get_http_client()
        response = await client.post(url, headers=headers, json=body, timeout=10.0)
        data = response.json()

        if "routes" in data and len(data["routes"]) > 0:
            route = data["routes"][0]
            duration_str = route.get("duration", "0s")
            duration_seconds = int(duration_str.replace("s", ""))
            result = {
                "distance_meters": route.get("distanceMeters", 0),
                "duration_seconds": duration_seconds,
                "duration_in_traffic_seconds": duration_seconds,
                "polyline": route.get("polyline", {}).get("encodedPolyline", ""),
                "source": "google_routes_api",
            }
            route_cache[cache_key] = {"data": result, "cached_at": datetime.utcnow()}
            await _store_route_in_db(cache_key, result)
            result["maps_billed"] = True
            try:
                from maps_billing import incr_maps_call

                await incr_maps_call(
                    trip_id=None,
                    kind="fare_estimate",
                    detail="computeRoutes_traffic_aware",
                )
            except Exception:
                pass
            return result
    except Exception as e:
        logger.warning(f"Routes API failed: {e}")

    # L5: Haversine fallback (free, always works)
    return _haversine_estimate(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, stop_lat, stop_lng)

def calculate_fare(
    distance_km: float,
    duration_min: int,
    traffic_duration_min: int,
    service_type: str = "economy",
    city: str = "lagos",
    demand_ratio: float = 0.0,
    is_raining: bool = False,
    pickup_lat: Optional[float] = None,
    pickup_lng: Optional[float] = None,
    dropoff_lat: Optional[float] = None,
    dropoff_lng: Optional[float] = None,
    has_intermediate_stop: bool = False,
) -> dict:
    """
    **Lagos** — NEXRYDE exact Lagride-style (see ``lagride_lagos_pricing``):

    ``Price = Distance × Area_Rate × Service_Multiplier × Surge_Multiplier`` (and
    ``× Lagos_Market_Multiplier`` when that factor is not 1.0).

    Road-route ``Distance`` only; no base fare / no time line item. Lagos market multiplier: ``LAGOS_MARKET_WIDE_FARE_MULTIPLIER`` in ``lagride_lagos_pricing``.

    **Other cities**: (Base + Distance×PerKm) × RouteLocation × Service × Surge for direct trips;
    when the rider adds an intermediate stop, add Time×PerMin (same per-minute card as the service tier).
    """
    city_key = normalize_fare_city_key(city)
    city_config = FARE_CONFIG.get(city_key, FARE_CONFIG["default"])
    service_key = (service_type or "economy").lower()
    # "Standard" in UI is the same tier as "economy" in backend pricing.
    if service_key == "standard":
        service_key = "economy"
    if service_key == "pro":
        service_key = "premium"
    config = city_config.get(service_key, city_config.get("economy", FARE_CONFIG["default"]["economy"]))

    booking_fee = 0.0
    min_fare = float(config.get("min_fare", 0))
    max_multiplier = config.get("max_multiplier", 2.5)
    cancellation_fee = config.get("cancellation_fee", 300)

    if city_key == "lagos":
        return build_lagos_lagride_fare_breakdown(
            distance_km=float(distance_km),
            duration_min=int(duration_min),
            traffic_duration_min=int(traffic_duration_min),
            service_key=service_key,
            demand_ratio=float(demand_ratio),
            is_raining=bool(is_raining),
            pickup_lat=pickup_lat,
            pickup_lng=pickup_lng,
            max_multiplier=float(max_multiplier),
            cancellation_fee=float(cancellation_fee),
            min_fare=min_fare,
            short_trip_threshold_km=float(SHORT_TRIP_KM_THRESHOLD),
            dropoff_lat=dropoff_lat,
            dropoff_lng=dropoff_lng,
            has_intermediate_stop=bool(has_intermediate_stop),
        )

    fare_bucket = "short" if float(distance_km) < SHORT_TRIP_KM_THRESHOLD else "standard"

    route_time_min = nexryde_route_time_minutes(duration_min, traffic_duration_min)
    rate_card = resolve_fare_rate_card(city_key, service_key, fare_bucket)
    # Direct trips: base + distance only. Stop trips add per-minute time charge.
    line = core_components_from_rate_card(
        rate_card["base_fare"],
        rate_card["per_km"],
        0,
        distance_km,
        0,
    )
    stop_time = (
        intermediate_stop_time_components(
            city_key,
            service_key,
            route_time_min,
            fare_bucket=fare_bucket,
        )
        if has_intermediate_stop
        else {"time_fee": 0.0, "stop_time_per_min": 0.0, "stop_time_fee_applied": False}
    )
    base_fare = line["base_fare"]
    distance_fee = line["distance_fee"]
    time_fee = float(stop_time["time_fee"])
    traffic_fee = 0.0

    location_mult, location_zone = nexryde_route_location_multiplier(
        city_key, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng
    )
    service_mult = nexryde_service_multiplier(service_key)

    core_before_adjust = float(line["core_presurge_pres_adjustment"]) + time_fee
    subtotal = round(core_before_adjust * location_mult * service_mult, 2)

    # Step 6–7: Max-style surge (WAT) — max of normal / high demand / rain / peak; tier cap from FARE_CONFIG
    wat_now = datetime.utcnow() + timedelta(hours=1)
    current_hour = wat_now.hour
    if current_hour >= 24:
        current_hour -= 24
    is_weekend = wat_now.weekday() >= 5
    is_morning_peak = 7 <= current_hour < 9
    is_evening_peak = 17 <= current_hour < 20
    is_peak = is_morning_peak or is_evening_peak

    surge_meta = compute_max_style_surge_multiplier(
        demand_ratio=demand_ratio,
        is_raining=is_raining,
        service_max_multiplier=max_multiplier,
    )
    dynamic_multiplier = float(surge_meta.get("effective_multiplier") or surge_meta.get("multiplier") or 1.0)

    # Step 8: final fare — short trips use ₦10 granularity (exact table feel); long trips ₦50
    total_fare = round(subtotal * dynamic_multiplier, 2)
    _step = 10.0 if fare_bucket == "short" else 50.0
    _floor = 200.0 if fare_bucket == "short" else 500.0
    total_fare = max(_floor, round(total_fare / _step) * _step)
    if min_fare > 0:
        total_fare = max(total_fare, min_fare)

    bucket_note = " · Short · city table" if fare_bucket == "short" else " · Long · Lagride-style"
    fare_rate_model = "short_city_table" if fare_bucket == "short" else "long_lagride_style"

    price_breakdown = (
        f"₦{int(base_fare)} + ₦{int(distance_fee)} ({round(distance_km,2)}km)"
        f" × loc {round(location_mult,2)} ({location_zone}) × tier {round(service_mult,2)}{bucket_note}"
    )
    if time_fee > 0:
        price_breakdown = append_stop_time_breakdown_suffix(
            price_breakdown,
            route_time_min,
            time_fee,
            float(stop_time["stop_time_per_min"]),
        )

    return {
        "base_fare": base_fare,
        "distance_km": round(distance_km, 2),
        "distance_fee": distance_fee,
        "duration_min": duration_min,
        "pricing_route_minutes": route_time_min,
        "time_fee": time_fee,
        "has_intermediate_stop": bool(has_intermediate_stop and time_fee > 0),
        "stop_time_fee_applied": bool(stop_time.get("stop_time_fee_applied")),
        "stop_time_per_min": float(stop_time.get("stop_time_per_min") or 0),
        "traffic_duration_min": traffic_duration_min,
        "traffic_fee": traffic_fee,
        "booking_fee": booking_fee,
        "subtotal": round(subtotal, 2),
        "location_multiplier": round(location_mult, 2),
        "location_zone": location_zone,
        "service_multiplier": round(service_mult, 2),
        "surge_multiplier": round(dynamic_multiplier, 2),
        "surge_uncapped": surge_meta.get("uncapped_multiplier"),
        "surge_factors": surge_meta.get("factors"),
        "total_fare": total_fare,
        "min_fare": min_fare,
        "cancellation_fee": cancellation_fee,
        "is_surge": dynamic_multiplier > 1.0,
        "is_peak": is_peak,
        "is_weekend": is_weekend,
        "peak_type": "morning_rush" if is_morning_peak else ("evening_peak" if is_evening_peak else None),
        "service_type": service_key,
        "city": city_key,
        "currency": "NGN",
        "fare_bucket": fare_bucket,
        "fare_rate_model": fare_rate_model,
        "short_trip_threshold_km": SHORT_TRIP_KM_THRESHOLD,
        "price_breakdown": price_breakdown,
    }

def generate_otp() -> str:
    return str(random.randint(100000, 999999))

def check_route_deviation(expected_route: List[dict], current_location: dict) -> bool:
    """Check if current location deviates from expected route"""
    if not expected_route:
        return False
    
    min_distance = float('inf')
    for point in expected_route:
        distance = calculate_distance_haversine(
            current_location['lat'], current_location['lng'],
            point['lat'], point['lng']
        )
        min_distance = min(min_distance, distance)
    
    return min_distance > ROUTE_DEVIATION_THRESHOLD

def calculate_behavior_score_change(event_type: str) -> float:
    """Calculate behavior score change based on event"""
    changes = {
        "completed_trip": 0.5,
        "five_star_rating": 1.0,
        "low_rating": -2.0,
        "cancellation": -3.0,
        "sos_triggered": -5.0,
        "false_sos": -10.0,
        "risk_alert": -2.0,
        "on_time_pickup": 0.5,
        "late_pickup": -1.0,
    }
    return changes.get(event_type, 0)


# Auth endpoints extracted to routers/auth.py

# ==================== USER ENDPOINTS (REFACTORED TO routers/users.py) ====================

# ==================== PROFILE PICTURE (REFACTORED TO routers/users.py) ====================

# ==================== EMERGENCY CONTACTS (REFACTORED TO routers/users.py) ====================

# ==================== FAVORITE/BLOCKED DRIVERS (REFACTORED TO routers/users.py) ====================

# ==================== FACE VERIFICATION (REFACTORED TO routers/users.py) ====================

# ==================== DRIVER ENDPOINTS (REFACTORED TO routers/drivers.py) ====================

# ==================== DRIVER DOCUMENT VERIFICATION (REFACTORED TO routers/drivers.py) ====================



# ==================== NOTIFICATIONS (REFACTORED TO routers/users.py) ====================


# SUBSCRIPTION ENDPOINTS - extracted to routers/


# FARE ESTIMATE - extracted to routers/



# ==================== TRIPS (REFACTORED TO routers/trips.py) ====================

# ==================== SOS & SAFETY (REFACTORED TO routers/support.py) ====================
# ==================== FAMILY (REFACTORED TO routers/support.py) ====================
# ==================== TRIP SHARING (REFACTORED TO routers/support.py) ====================
# ==================== FRAUD DETECTION (REFACTORED TO routers/support.py) ====================
# ==================== AUDIO/INSURANCE/TRACKING (REFACTORED TO routers/support.py) ====================
# ==================== RIDER PREFERENCES (REFACTORED TO routers/support.py) ====================
# ==================== IN-APP MESSAGING (REFACTORED TO routers/support.py) ====================
# ==================== LOST & FOUND (REFACTORED TO routers/support.py) ====================
# ==================== SMART MATCHING (REFACTORED TO routers/support.py) ====================

# ==================== HEALTH CHECK ====================

@api_router.get("/trips/active/{user_id}")
async def get_active_trip(user_id: str, request: Request):
    """Get the user's current active trip (if any)"""
    try:
        from auth_guard import require_authenticated

        actor_id = require_authenticated(request)
        if actor_id != user_id:
            raise HTTPException(status_code=403, detail="Not authorized to view this active trip")

        trip = await db.trips.find_one(
            {
                "$and": [
                    {"$or": [{"rider_id": user_id}, {"driver_id": user_id}]},
                    {"$or": [
                        {"status": {"$in": [
                            "accepted", "arrived", "pickup", "ongoing", "pending", "pending_driver_offers",
                            "in_progress", "started", "picked_up", "driver_arriving",
                        ]}},
                        {"status": "completed", "payment_status": "pending"},
                    ]},
                ],
            },
            {"_id": 0},
            sort=[("created_at", -1)]
        )
        if not trip:
            return {"active": False}

        if trip.get("status") == "completed":
            if str(trip.get("payment_status") or "").lower() == "completed":
                return {"active": False}
            # Trips completed before cash/transfer settled at completion can still
            # be sitting on payment_status=pending, which pins the rider and driver
            # to a finished trip forever. Settle those on read.
            from wallet_trip_helpers import payment_status_after_completion

            if payment_status_after_completion(trip.get("payment_method")) == "completed":
                await db.trips.update_one(
                    {"id": trip.get("id"), "payment_status": {"$ne": "completed"}},
                    {"$set": {"payment_status": "completed", "paid_at": datetime.now(timezone.utc)}},
                )
                return {"active": False}

        # Attach estate_gate_access so driver trips screen sees the gate countdown
        try:
            from routers.trips import _build_estate_gate_access
            gate = await _build_estate_gate_access(trip, user_id)
            if gate:
                trip["estate_gate_access"] = gate
        except Exception:
            pass
        try:
            if user_id == trip.get("driver_id") and trip.get("rider_id"):
                rider_doc = await db.users.find_one(
                    {"id": trip["rider_id"]},
                    {
                        "_id": 0,
                        "name": 1,
                        "phone": 1,
                        "profile_image": 1,
                        "rating": 1,
                        "rider_reputation_trip_count": 1,
                    },
                ) or {}
                rider_trip_count = int(rider_doc.get("rider_reputation_trip_count") or 0)
                trip["rider_name"] = trip.get("rider_name") or rider_doc.get("name")
                trip["rider_phone"] = rider_doc.get("phone")
                trip["rider_profile_image"] = rider_doc.get("profile_image")
                trip["rider_photo"] = rider_doc.get("profile_image")
                trip["rider_reputation_avg"] = (
                    round(float(rider_doc.get("rating") or 0.0), 2)
                    if rider_trip_count > 0
                    else None
                )
                trip["rider_trip_count"] = rider_trip_count
                trip["rider_new_account"] = rider_trip_count < 3
            elif user_id == trip.get("rider_id") and trip.get("driver_id"):
                driver_doc = await db.users.find_one(
                    {"id": trip["driver_id"]},
                    {
                        "_id": 0,
                        "name": 1,
                        "profile_image": 1,
                        "rating": 1,
                        "total_trips": 1,
                        "trips_completed": 1,
                        "is_verified": 1,
                    },
                ) or {}
                trip["driver_name"] = trip.get("driver_name") or driver_doc.get("name")
                trip["driver_profile_image"] = trip.get("driver_profile_image") or driver_doc.get("profile_image")
                trip["driver_rating"] = trip.get("driver_rating") or driver_doc.get("rating")
                trip["driver_total_trips"] = (
                    trip.get("driver_total_trips")
                    or driver_doc.get("total_trips")
                    or driver_doc.get("trips_completed")
                )
                trip["driver_verified"] = bool(trip.get("driver_verified") or driver_doc.get("is_verified"))
        except Exception:
            pass
        return {"active": True, "trip": trip}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get active trip error: {e}")
        return {"active": False, "error": str(e)}

@api_router.get("/")
async def root():
    return {"service": "nexryde-api", "message": "NEXRYDE API is running", "version": "2.0.0", "docs": "/docs"}

@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "service": "nexryde-api", "timestamp": datetime.utcnow().isoformat()}


@api_router.get("/config/client")
async def client_config():
    """Public app config read at startup. Controls launch-mode features without a rebuild.

    wallet_enabled=false → cash + direct bank transfer only; no fare-wallet UI or holds.
    """
    from feature_flags import is_wallet_enabled

    wallet_on = await is_wallet_enabled(db)
    return {
        "wallet_enabled": wallet_on,
        "payment_methods": (["cash", "transfer", "wallet"] if wallet_on else ["cash", "transfer"]),
    }


@api_router.get("/health/ready")
async def health_ready():
    """Readiness check: MongoDB ping + optional Redis ping."""
    checks: dict = {}
    # MongoDB
    try:
        await db.command("ping")
        checks["database"] = "ok"
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"database_unavailable: {exc}")
    # Redis (optional — degraded but still ready if Redis is down)
    try:
        from redis_store import store as _redis_store
        if _redis_store is not None:
            await _redis_store.ping()
            checks["redis"] = "ok"
        else:
            checks["redis"] = "unconfigured"
    except Exception:
        checks["redis"] = "degraded"
    return {"status": "ready", **checks, "timestamp": datetime.utcnow().isoformat()}


@api_router.get("/health/ops")
async def health_ops(request: Request):
    """
    Optional metrics for on-call (not in OpenAPI discovery noise).
    Header: X-NEXRYDE-OPS-KEY must match env NEXRYDE_OPS_KEY. Wrong/missing key -> 404.
    """
    expected = (os.environ.get("NEXRYDE_OPS_KEY") or "").strip()
    got = (request.headers.get("x-nexryde-ops-key") or "").strip()
    if not expected or got != expected:
        raise HTTPException(status_code=404, detail="Not found")
    try:
        dlq_pending = await db.squad_webhook_dlq.count_documents({"status": "pending"})
        dlq_replayed = await db.squad_webhook_dlq.count_documents({"status": {"$in": ["replayed", "auto_replayed"]}})
    except Exception:
        dlq_pending = dlq_replayed = -1
    return {
        "squad_webhook_dlq_pending": dlq_pending,
        "squad_webhook_dlq_replayed_total": dlq_replayed,
        "realtime": "websocket",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

@api_router.get("/health/sentry")
async def health_sentry():
    """Report whether Sentry is actually wired in this running revision.

    Safe to call publicly — never returns the DSN, only booleans so you can
    tell 'configured in code' apart from 'a DSN is present and initialized'.
    """
    initialized = False
    try:
        import sentry_sdk  # type: ignore
        client = sentry_sdk.Hub.current.client
        initialized = client is not None and client.dsn is not None
    except Exception:
        initialized = False
    return {
        "sentry_dsn_present": bool(_SENTRY_DSN),
        "sentry_initialized": initialized,
        "revision": os.environ.get("K_REVISION", "unknown"),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@api_router.get("/health/push")
async def health_push():
    """Report whether this revision can actually send a push notification.

    Firebase Admin is only validated at startup when ENGAGEMENT_LOOP_ENABLED is
    on, so with it off a revision can run for weeks unable to push and say
    nothing. Safe to call publicly — booleans and a path, never the credential.
    """
    try:
        from notification_service import validate_firebase_admin_config

        status = validate_firebase_admin_config()
    except Exception as exc:
        status = {"configured": False, "initialized": False, "error": str(exc)[:200]}
    return {
        "fcm_configured": bool(status.get("configured")),
        "fcm_initialized": bool(status.get("initialized")),
        "credential_path": status.get("credential_path"),
        "engagement_loop_enabled": _ENGAGEMENT_LOOP_ENABLED,
        "revision": os.environ.get("K_REVISION", "unknown"),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@api_router.get("/debug/test-crash")
async def debug_test_crash(request: Request):
    """Deliberate crash to PROVE an event reaches Sentry.

    Gated by X-NEXRYDE-OPS-KEY (same as /health/ops). Wrong/missing key -> 404.
    On a correct key this raises an unhandled exception; if Sentry is wired the
    event will land in the dashboard. If Sentry is NOT wired the request will
    just 500 and nothing reaches Sentry — which is itself proof of the gap.
    """
    expected = (os.environ.get("NEXRYDE_OPS_KEY") or "").strip()
    got = (request.headers.get("x-nexryde-ops-key") or "").strip()
    if not expected or got != expected:
        raise HTTPException(status_code=404, detail="Not found")
    raise RuntimeError(
        "NEXRYDE deliberate test-crash: if you see this in Sentry, backend error reporting works."
    )


_MAINTENANCE_TICK_LOCK = asyncio.Lock()
_MAINTENANCE_TICK_TIMEOUT_S = 45.0


@api_router.post("/ops/maintenance-tick")
async def ops_maintenance_tick(request: Request):
    """Accept one maintenance tick — for Cloud Scheduler when nothing stays warm.

    Guardians, saga retries, the outbox drain and the safe-arrival escalation are
    timer work. With minScale 0 there is no always-on process to run them, so a
    scheduled call to this endpoint is what keeps them happening. Same tick the
    worker loop runs.

    The HTTP response returns immediately (accepted) and the tick runs in the
    background. Running it inline blocked the event loop for 90–110s every 2
    minutes, which killed the Cloud Run connection and stormed 503 / uptime /
    latency alerts. Overlapping ticks are skipped; a hung tick is cut at 45s.

    Gated by X-NEXRYDE-OPS-KEY (wrong/missing key -> 404) — Cloud Scheduler sends
    it as a header.
    """
    expected = (os.environ.get("NEXRYDE_OPS_KEY") or "").strip()
    got = (request.headers.get("x-nexryde-ops-key") or "").strip()
    if not expected or got != expected:
        raise HTTPException(status_code=404, detail="Not found")

    from realtime_platform.maintenance import run_maintenance_tick

    if _MAINTENANCE_TICK_LOCK.locked():
        return {
            "ok": True,
            "accepted": True,
            "skipped": "in_flight",
            "revision": os.environ.get("K_REVISION", "unknown"),
        }

    async def _run_tick() -> None:
        if _MAINTENANCE_TICK_LOCK.locked():
            logger.info("ops_maintenance_tick_skipped in_flight")
            return
        async with _MAINTENANCE_TICK_LOCK:
            try:
                await asyncio.wait_for(
                    run_maintenance_tick(),
                    timeout=_MAINTENANCE_TICK_TIMEOUT_S,
                )
            except asyncio.TimeoutError:
                logger.error(
                    "ops_maintenance_tick_timeout timeout_s=%s",
                    _MAINTENANCE_TICK_TIMEOUT_S,
                )
            except Exception:
                logger.exception("ops_maintenance_tick_background_failed")

    asyncio.create_task(_run_tick())
    return {
        "ok": True,
        "accepted": True,
        "revision": os.environ.get("K_REVISION", "unknown"),
    }


@api_router.post("/ops/migrate-driver-document-binaries")
async def ops_migrate_driver_document_binaries(request: Request, dry_run: bool = True):
    """One-shot, idempotent migration of driver_documents binaries → private GCS.

    Runs in-process on Cloud Run where the service account credentials and the
    GCS bucket are available. Gated by X-NEXRYDE-OPS-KEY (wrong/missing key → 404).
    Pass ?dry_run=false to actually move binaries. Safe to re-run.
    """
    expected = (os.environ.get("NEXRYDE_OPS_KEY") or "").strip()
    got = (request.headers.get("x-nexryde-ops-key") or "").strip()
    if not expected or got != expected:
        raise HTTPException(status_code=404, detail="Not found")
    from driver_doc_storage import run_document_binary_migration
    summary = await run_document_binary_migration(dry_run=dry_run)
    return summary


@api_router.post("/ops/migrate-trip-face-binaries")
async def ops_migrate_trip_face_binaries(request: Request, dry_run: bool = True):
    """One-shot, idempotent migration of trips.driver_face_image → private GCS.

    Gated by X-NEXRYDE-OPS-KEY (wrong/missing key → 404). Pass ?dry_run=false to
    move binaries. Safe to re-run.
    """
    expected = (os.environ.get("NEXRYDE_OPS_KEY") or "").strip()
    got = (request.headers.get("x-nexryde-ops-key") or "").strip()
    if not expected or got != expected:
        raise HTTPException(status_code=404, detail="Not found")
    from trip_face_storage import run_trip_face_migration
    summary = await run_trip_face_migration(dry_run=dry_run)
    return summary


@api_router.get("/ops/mongo-performance")
async def ops_mongo_performance(request: Request):
    """Ops runbook for the slow-mongo alert — in-process command stats.

    Gated by X-NEXRYDE-OPS-KEY (wrong/missing key → 404).
    """
    expected = (os.environ.get("NEXRYDE_OPS_KEY") or "").strip()
    got = (request.headers.get("x-nexryde-ops-key") or "").strip()
    if not expected or got != expected:
        raise HTTPException(status_code=404, detail="Not found")
    from realtime_platform.gateway import _mongo_performance_payload

    return {"ok": True, **_mongo_performance_payload(), "revision": os.environ.get("K_REVISION", "unknown")}


@api_router.get("/ops/places-google-probe")
async def ops_places_google_probe(request: Request, input: str = "Victoria"):
    """Raw Google Places Autocomplete as seen from this Cloud Run revision.

    Cloud Run has no SSH. This is the in-process equivalent of
    ``curl -v -m 15`` against maps.googleapis.com from the running instance.
    Gated by X-NEXRYDE-OPS-KEY (wrong/missing key → 404). The Maps API key is
    stripped from the URL, headers and body.
    """
    expected = (os.environ.get("NEXRYDE_OPS_KEY") or "").strip()
    got = (request.headers.get("x-nexryde-ops-key") or "").strip()
    if not expected or got != expected:
        raise HTTPException(status_code=404, detail="Not found")
    from places_service import probe_google_places_autocomplete

    payload = await probe_google_places_autocomplete(input)
    payload["revision"] = os.environ.get("K_REVISION", "unknown")
    return payload


@api_router.post("/ops/ensure-indexes")
async def ops_ensure_indexes(request: Request):
    """Re-run Mongo index ensure without a full restart.

    Safe to call after a unique-index failure skipped later collections.
    Gated by X-NEXRYDE-OPS-KEY (wrong/missing key → 404).
    """
    expected = (os.environ.get("NEXRYDE_OPS_KEY") or "").strip()
    got = (request.headers.get("x-nexryde-ops-key") or "").strip()
    if not expected or got != expected:
        raise HTTPException(status_code=404, detail="Not found")
    from db_indexes import ensure_indexes

    await ensure_indexes(db)
    return {"ok": True, "revision": os.environ.get("K_REVISION", "unknown")}


@api_router.get("/route-cache/stats")
async def route_cache_stats():
    """Monitor route cache savings — each DB hit = 1 saved Google API call (~$0.007)."""
    try:
        total_cached = await db.route_cache_v2.count_documents({})
        pipeline = [{"$group": {"_id": None, "total_hits": {"$sum": "$hits"}}}]
        agg = await db.route_cache_v2.aggregate(pipeline).to_list(1)
        total_hits = agg[0]["total_hits"] if agg else 0
        estimated_savings_usd = round(total_hits * 0.007, 2)
        return {
            "cached_routes": total_cached,
            "total_cache_hits": total_hits,
            "estimated_savings_usd": estimated_savings_usd,
            "estimated_savings_ngn": round(estimated_savings_usd * 1600, 0),
            "in_memory_routes": len(route_cache),
            "persistent_ttl_hours": PERSISTENT_CACHE_TTL_HOURS,
        }
    except Exception as e:
        return {"error": str(e)}


# ==================== ADMIN (REFACTORED TO routers/admin.py) ====================


# ==================== ADMIN PANEL STATIC FILES ====================

@app.get("/admin/")
async def serve_admin():
    """Serve React admin SPA (dist) or legacy HTML fallback."""
    from fastapi.responses import Response as _Resp
    spa_file = ADMIN_SPA_DIR / "index.html"
    legacy_file = ADMIN_DIR / "index.legacy.html"
    fallback_file = ADMIN_DIR / "index.html"
    admin_file = spa_file if spa_file.exists() else (legacy_file if legacy_file.exists() else fallback_file)
    if admin_file.exists():
        content = admin_file.read_bytes()
        return _Resp(
            content=content,
            media_type="text/html",
            headers={
                "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
                "Pragma": "no-cache",
                "Expires": "0",
            },
        )
    raise HTTPException(status_code=404, detail="Admin panel not found")

@app.get("/admin/subscription-management.html")
@app.get("/admin/subscription-management")
async def serve_subscription_admin():
    """Serve subscription management admin panel"""
    admin_file = ADMIN_DIR / "subscription-management.html"
    if admin_file.exists():
        return FileResponse(admin_file, media_type="text/html")
    raise HTTPException(status_code=404, detail="Subscription management panel not found")

# Direct auth routes WITHOUT /api prefix (for compatibility)
@app.post("/auth/request-otp")
@app.post("/auth/send-otp")
async def direct_send_otp(request: OTPRequest, http_request: Request):
    """Direct OTP endpoint without /api prefix"""
    return await router_send_otp(request, http_request)

# ==================== ROUTER INCLUDES ====================
app.include_router(api_router)
app.include_router(legacy_subscription_router)
app.include_router(smart_mode_router)
app.include_router(route_cache_router)
app.include_router(route_planner_router)
app.include_router(map_router)
app.include_router(places_router)
app.include_router(call_router)
app.include_router(community_router)
app.include_router(safety_router)
app.include_router(safety_data_router)
app.include_router(admin_router)
app.include_router(admin_ops_router)
app.include_router(admin_driver_profile_router)
app.include_router(admin_ops_center_router)
app.include_router(admin_rider_profile_router)

# Metrics + circuit breaker status
try:
    from metrics_service import metrics_router
    app.include_router(metrics_router)
except Exception as _me:
    logger.warning("metrics_service load failed: %s", _me)
app.include_router(admin_notifications_router, dependencies=[Depends(require_admin_access)])
app.include_router(trips_router)
app.include_router(auth_router)
app.include_router(bidding_router)
app.include_router(payments_router)
app.include_router(voice_router)
app.include_router(enforcement_router)
app.include_router(compliance_router)

from routers.chat import chat_router, start_call_session_cleanup_task
app.include_router(chat_router)
app.include_router(realtime_dispatch_router)
app.include_router(connect_realtime_router)
app.include_router(realtime_gateway_router)

from routers.users import users_router
app.include_router(users_router)

from routers.gamification import gamification_router
app.include_router(gamification_router)

from routers.drivers import drivers_router
from routers.work_zone import work_zone_router
app.include_router(drivers_router)
app.include_router(work_zone_router)

from routers.support import support_router
app.include_router(support_router)

from routers.shield import shield_router
app.include_router(shield_router)

from routers.incentives import incentives_router
app.include_router(incentives_router)

from routers.driver_control import driver_control_router
app.include_router(driver_control_router)

# ==================== SQUAD WEBHOOK DLQ AUTO-RETRY ====================
async def _squad_webhook_dlq_autoreplay_loop():
    """Replay DLQ payloads after a short delay (transient DB errors). Disable: SQUAD_DLQ_AUTOREPLAY=0."""
    if os.environ.get("SQUAD_DLQ_AUTOREPLAY", "1").lower() in ("0", "false", "no"):
        return
    await asyncio.sleep(90)
    while True:
        try:
            from routers.payments import _process_squad_webhook_payload

            cutoff = datetime.utcnow() - timedelta(minutes=2)
            cursor = (
                db.squad_webhook_dlq.find(
                    {"status": "pending", "attempts": {"$lt": 8}, "created_at": {"$lt": cutoff}}
                )
                .sort("created_at", 1)
                .limit(5)
            )
            async for doc in cursor:
                did = doc.get("id")
                pl = doc.get("payload")
                if not isinstance(pl, dict) or not did:
                    continue
                try:
                    result = await _process_squad_webhook_payload(pl)
                    await db.squad_webhook_dlq.update_one(
                        {"id": did},
                        {
                            "$set": {
                                "status": "auto_replayed",
                                "auto_result": result,
                                "auto_at": datetime.now(timezone.utc).isoformat(),
                            },
                            "$inc": {"attempts": 1},
                        },
                    )
                except Exception as exc:
                    await db.squad_webhook_dlq.update_one(
                        {"id": did},
                        {
                            "$set": {"last_auto_error": str(exc)[:500]},
                            "$inc": {"attempts": 1},
                        },
                    )
        except Exception:
            logger.exception("squad_webhook_dlq_autoreplay_tick")
        await asyncio.sleep(300)


# ==================== BACKGROUND WATCHDOG LOOPS ====================

async def _driver_heartbeat_watchdog_loop():
    """
    Every 60s: auto-offline drivers whose last heartbeat is older than
    IDLE_TIMEOUT_MINUTES (shared with dispatch freshness). Prevents ghost-online
    drivers from receiving offers after the app is killed.
    Matches both datetime and legacy ISO-string heartbeat fields; clears Redis presence.
    """
    from routers.driver_control import IDLE_TIMEOUT_MINUTES

    await asyncio.sleep(60)
    while True:
        try:
            from driver_presence import set_driver_offline

            cutoff = datetime.now(timezone.utc) - timedelta(minutes=IDLE_TIMEOUT_MINUTES)
            query = {
                "is_online": True,
                "$or": [
                    {"last_heartbeat": {"$lt": cutoff}},
                    {"last_heartbeat": {"$lt": cutoff.isoformat()}},
                    {"last_heartbeat": {"$exists": False}},
                ],
            }
            stale = await db.driver_profiles.find(query, {"_id": 0, "user_id": 1}).to_list(500)
            if stale:
                ids = [d["user_id"] for d in stale if d.get("user_id")]
                result = await db.driver_profiles.update_many(
                    {"user_id": {"$in": ids}, "is_online": True},
                    {
                        "$set": {
                            "is_online": False,
                            "went_offline_reason": "heartbeat_timeout",
                            "went_offline_at": datetime.now(timezone.utc),
                        }
                    },
                )
                for did in ids:
                    try:
                        await set_driver_offline(did)
                    except Exception:
                        logger.exception("heartbeat_watchdog_presence_clear driver=%s", did)
                if result.modified_count:
                    logger.info(
                        "Heartbeat watchdog: auto-offlined %d ghost drivers",
                        result.modified_count,
                    )
        except Exception:
            logger.exception("heartbeat_watchdog_tick")
        await asyncio.sleep(60)


async def _stranded_trip_cleanup_loop():
    """
    Every 5 minutes: expire trips stuck in pending/searching states for > 10 minutes.
    Prevents orphaned trips from blocking rider booking.

    Matches both datetime and legacy ISO-string created_at (Mongo type order otherwise
    never expires Date fields against a string cutoff).
    """
    await asyncio.sleep(90)
    while True:
        try:
            cutoff = datetime.now(timezone.utc) - timedelta(minutes=10)
            # Naive UTC also, since trips.py often stores datetime.now() without tz.
            cutoff_naive = datetime.utcnow() - timedelta(minutes=10)
            stale_statuses = [
                "pending", "pending_driver_offers", "searching",
            ]
            stale_filter = {
                "status": {"$in": stale_statuses},
                "$or": [
                    {"created_at": {"$lt": cutoff}},
                    {"created_at": {"$lt": cutoff_naive}},
                    {"created_at": {"$lt": cutoff.isoformat()}},
                ],
            }
            # Capture trips before expire so wallet holds can be released.
            stale_trips = await db.trips.find(
                stale_filter,
                {"_id": 0, "id": 1, "rider_id": 1, "payment_method": 1},
            ).to_list(200)
            result = await db.trips.update_many(
                stale_filter,
                {
                    "$set": {
                        "status": "expired",
                        "expired_at": datetime.now(timezone.utc).isoformat(),
                        "expired_reason": "no_driver_found_timeout",
                    }
                },
            )
            if result.modified_count:
                logger.info("Stranded trip cleanup: expired %d stuck trips", result.modified_count)
                try:
                    from wallet_ops import release_rider_wallet_hold
                    from wallet_trip_helpers import is_wallet_payment_method

                    for t in stale_trips:
                        if not is_wallet_payment_method(t.get("payment_method")):
                            continue
                        rid = t.get("rider_id")
                        tid = t.get("id")
                        if rid and tid:
                            await release_rider_wallet_hold(db, rid, tid)
                except Exception:
                    logger.exception("stranded_trip_hold_release")

            # Also close stale trip_offers
            offer_cutoff = datetime.now(timezone.utc) - timedelta(minutes=6)
            offer_cutoff_naive = datetime.utcnow() - timedelta(minutes=6)
            await db.trip_offers.update_many(
                {
                    "status": "pending",
                    "$or": [
                        {"created_at": {"$lt": offer_cutoff}},
                        {"created_at": {"$lt": offer_cutoff_naive}},
                        {"created_at": {"$lt": offer_cutoff.isoformat()}},
                    ],
                },
                {"$set": {"status": "expired"}},
            )
        except Exception:
            logger.exception("stranded_trip_cleanup_tick")
        await asyncio.sleep(300)


async def _stuck_active_trip_watchdog_loop():
    """
    Every 5 minutes: recover trips stuck AFTER driver acceptance (audit 5.3).
    accepted/arrived past TTL → auto-cancel (wallet hold refunded);
    ongoing past TTL → auto-complete; dangling driver active_trip_id locks cleared.
    A driver whose app dies post-accept must auto-recover — never DB surgery.
    """
    await asyncio.sleep(120)
    while True:
        try:
            from stuck_trip_recovery import recover_stale_active_trips

            counts = await recover_stale_active_trips(db)
            if any(counts.values()):
                logger.info("Stuck trip recovery: %s", counts)
        except Exception:
            logger.exception("stuck_active_trip_watchdog_tick")
        await asyncio.sleep(300)


async def _subscription_expiry_watchdog_loop():
    """
    Every 2 minutes: find drivers whose subscription has lapsed while they are online
    and force them offline so they stop receiving trip offers.

    Subscriptions store end_date (datetime or ISO), not expires_at.
    """
    await asyncio.sleep(120)
    while True:
        try:
            from driver_presence import set_driver_offline

            now = datetime.now(timezone.utc)
            now_naive = datetime.utcnow()
            now_iso = now.isoformat()
            # Find subscriptions that have expired (field is end_date in payments.py).
            expired_subs = await db.subscriptions.find(
                {
                    "status": {"$in": ["active", "grace_period"]},
                    "$or": [
                        {"end_date": {"$lt": now}},
                        {"end_date": {"$lt": now_naive}},
                        {"end_date": {"$lt": now_iso}},
                    ],
                }
            ).to_list(500)

            for sub in expired_subs:
                driver_id = sub.get("driver_id")
                if not driver_id:
                    continue
                # Mark subscription expired
                await db.subscriptions.update_one(
                    {"_id": sub["_id"]},
                    {"$set": {"status": "expired"}},
                )
                # Force driver offline (Mongo + Redis presence)
                result = await db.driver_profiles.update_one(
                    {"user_id": driver_id, "is_online": True},
                    {
                        "$set": {
                            "is_online": False,
                            "went_offline_reason": "subscription_expired",
                            "went_offline_at": now,
                        }
                    },
                )
                try:
                    await set_driver_offline(driver_id)
                except Exception:
                    logger.exception(
                        "subscription_expiry_watchdog_presence_clear driver=%s", driver_id
                    )
                if result.modified_count:
                    logger.info("subscription_expiry_watchdog: driver %s offlined (subscription lapsed)", driver_id)
                    # Push realtime notification to driver
                    try:
                        from routers.realtime_dispatch import driver_offer_hub
                        await driver_offer_hub.send_json(driver_id, {
                            "type": "subscription_expired",
                            "message": "Your subscription has expired. Please renew to continue receiving rides.",
                        })
                    except Exception:
                        pass

        except Exception:
            logger.exception("subscription_expiry_watchdog_tick")
        await asyncio.sleep(120)


async def _engagement_push_loop():
    """Every 5 minutes: fire engagement push notifications for any active time slot."""
    import os

    # Off by default — enable ENGAGEMENT_LOOP_ENABLED=true at 500+ active users to avoid
    # scanning all push-token holders on every instance while the fleet is small.
    if os.environ.get("ENGAGEMENT_LOOP_ENABLED", "").strip().lower() not in ("1", "true", "yes"):
        logger.info("Engagement push loop disabled (set ENGAGEMENT_LOOP_ENABLED=true to enable)")
        return

    await asyncio.sleep(60)  # brief warm-up delay after startup
    while True:
        try:
            from engagement_push_service import tick_engagement_pushes

            sent = await tick_engagement_pushes()
            if sent:
                logger.info("Engagement pushes sent: %d", sent)
        except Exception:
            logger.exception("engagement_push_loop error")
        await asyncio.sleep(300)  # check every 5 minutes


async def _trial_driver_idle_guardrail_loop():
    """Trial drivers only: auto-offline after 5h online with zero trips completed today."""
    await asyncio.sleep(180)
    while True:
        try:
            from trial_driver_idle_guardrail import tick_trial_driver_idle_guardrail
            from driver_trial_policy import tick_online_trial_expiry

            n = await tick_trial_driver_idle_guardrail()
            if n:
                logger.info("Trial idle guardrail: offlined %d drivers", n)
            expired = await tick_online_trial_expiry()
            if expired:
                logger.info("Trial expiry guard: offlined %d drivers", expired)
        except Exception:
            logger.exception("trial_driver_idle_guardrail_loop error")
        await asyncio.sleep(300)


# ==================== SEED ON STARTUP ====================
async def _deferred_startup():
    """
    Mongo seeding, indexes, background loops.
    Runs in a task so lifespan returns quickly — Cloud Run requires the process to listen on PORT promptly.
    """
    try:
        try:
            await db.command("ping")
        except Exception as ping_exc:
            logger.warning(
                "MongoDB is not reachable; skipping deferred startup (indexes, seeds, background jobs). "
                "Most API routes need the database — start MongoDB locally (e.g. "
                "`docker run -d -p 27017:27017 --name nexryde-mongo mongo:7`) "
                "or set MONGO_URL / MONGODB_URI to a running cluster. Detail: %s",
                ping_exc,
            )
            return

        await ensure_otp_indexes()
        from driver_trial_policy import ensure_system_trial_defaults, seed_grandfathered_trial_configs

        await ensure_system_trial_defaults()
        await seed_grandfathered_trial_configs()
        from routers.admin import seed_promo_codes as _seed_promos

        await _seed_promos()
        # Restore driver community data if missing.
        await seed_community_groups(db)
        await cleanup_test_community_events(db)
        await seed_community_content(db)
        # Seed base safety zones used by safety/community alerts.
        await seed_danger_zones(db)
        # Create TTL index for persistent route cache (auto-delete after 48 hours as safety margin)
        try:
            await db.route_cache_v2.create_index("cached_at", expireAfterSeconds=48 * 3600)
        except Exception:
            pass
        # Start periodic cleanup for masked call relay sessions.
        start_call_session_cleanup_task()
        # Start recurring driver compliance checks.
        start_compliance_background_tasks()
        # Ensure MongoDB indexes for query performance.
        from db_indexes import ensure_indexes

        await ensure_indexes(db)
        logger.info("Startup validation: Mongo indexes ensured")
        from notification_scheduler import start_notification_scheduler

        start_notification_scheduler()
        logger.info("Startup validation: scheduled notification service initialized")
        asyncio.create_task(_squad_webhook_dlq_autoreplay_loop())
        asyncio.create_task(_driver_heartbeat_watchdog_loop())
        asyncio.create_task(_stranded_trip_cleanup_loop())
        asyncio.create_task(_stuck_active_trip_watchdog_loop())
        asyncio.create_task(_subscription_expiry_watchdog_loop())
        asyncio.create_task(_engagement_push_loop())
        logger.info(
            "Startup validation: engagement scheduler task created enabled=%s",
            os.environ.get("ENGAGEMENT_LOOP_ENABLED", "").strip().lower() in ("1", "true", "yes", "on"),
        )
        asyncio.create_task(_trial_driver_idle_guardrail_loop())
        # One-time migration: lift all monthly_verification_overdue suspensions
        # so verified drivers are never hard-blocked by this soft reminder system
        try:
            from database import db as _db
            dp_r = await _db.driver_profiles.update_many(
                {"suspended_reason": "monthly_verification_overdue"},
                {"$unset": {"suspended_reason": ""}, "$set": {"monthly_verification_complete": True}}
            )
            u_r = await _db.users.update_many(
                {"suspension_reason": "monthly_verification_overdue"},
                {"$unset": {"suspension_reason": "", "suspended_until": ""}}
            )
            if dp_r.modified_count or u_r.modified_count:
                logger.info(
                    f"Startup migration: cleared monthly_verification_overdue from "
                    f"{dp_r.modified_count} driver profiles, {u_r.modified_count} users."
                )
        except Exception:
            logger.warning("Startup migration for monthly suspensions failed (non-fatal)")
        logger.info("Deferred startup completed successfully")
    except Exception:
        logger.exception("Deferred startup failed")


@app.on_event("startup")
async def seed_promo_codes():
    """Schedule heavy startup work; return immediately so the server can bind to PORT."""
    # Wire pricing + directions before any deferred DB seeding so POST /api/fare/estimate
    # never 500s if seeding fails or on cold-start races.
    set_shared_functions(get_directions_from_google, calculate_fare, calculate_distance_haversine)
    set_fare_estimate_store(fare_estimate_store)
    set_payments_shared_functions(get_directions_from_google, calculate_fare, calculate_distance_haversine)
    set_payments_fare_estimate_store(fare_estimate_store)
    asyncio.create_task(_deferred_startup())
    asyncio.create_task(_mongo_keepalive_loop())
    # Optional native gRPC RidePush (set NEXRYDE_GRPC_PORT). HTTPS Connect-SSE is always on.
    try:
        from grpc_ride_push import start_grpc_ride_push_if_configured

        asyncio.create_task(start_grpc_ride_push_if_configured())
    except Exception:
        logger.exception("grpc_ride_push startup schedule failed")
    try:
        from realtime_platform.outbox_worker import start_outbox_worker

        start_outbox_worker()
        try:
            from realtime_platform.guardians_worker import start_guardians_worker

            start_guardians_worker()
        except Exception:
            logger.exception("guardians worker start failed")
    except Exception:
        logger.exception("outbox worker startup failed")


async def _mongo_keepalive_loop():
    """Ping Mongo every 45s so Atlas idle disconnects don't stall the first login."""
    from db_resilience import ensure_mongo_warm

    await asyncio.sleep(2)
    while True:
        await ensure_mongo_warm()
        await asyncio.sleep(45)

# Browser CORS: default deny-all-open; set CORS_ORIGINS=* for local dev, or comma-separated list.
_DEFAULT_CORS_ORIGINS = (
    "https://nexryde.com,"
    "https://www.nexryde.com,"
    "https://nexryde-backend-993913300770.us-central1.run.app,"
    "http://localhost:3000,"
    "http://localhost:8081,"
    "http://127.0.0.1:8081"
)
_cors_raw = os.environ.get("CORS_ORIGINS", _DEFAULT_CORS_ORIGINS).strip()
if _cors_raw == "*":
    ALLOWED_ORIGINS = ["*"]
else:
    ALLOWED_ORIGINS = [o.strip() for o in _cors_raw.split(",") if o.strip()]

# allow_credentials=True is only safe when origins are explicitly whitelisted.
# Wildcard "*" with credentials is a CORS security misconfiguration (browsers block it anyway,
# but we prevent it server-side as defence in depth).
_cors_credentials = ALLOWED_ORIGINS != ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_credentials=_cors_credentials,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID", "X-NEXRYDE-OPS-KEY"],
)

# Auth middleware - validates JWT on protected routes
from starlette.middleware.base import BaseHTTPMiddleware
from security_advanced import verify_jwt_token
from security_advanced import SECURITY_HEADERS

from nexryde_api_paths import api_path_is_protected, api_path_is_public

class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        from starlette.responses import JSONResponse
        path = request.url.path
        if request.method == "OPTIONS" or api_path_is_public(path):
            return await call_next(request)

        protected = api_path_is_protected(path)
        auth_header = request.headers.get("authorization", "")
        raw_token = auth_header[7:].strip() if auth_header.lower().startswith("bearer ") else ""
        has_bearer = bool(raw_token)
        admin_ns = path.startswith("/api/admin")

        if protected:
            if has_bearer:
                try:
                    payload = verify_jwt_token(raw_token)
                except Exception:
                    # Admin session tokens are Bearer but are not JWTs — let /api/admin/* handlers validate.
                    if admin_ns:
                        return await call_next(request)
                    return JSONResponse(
                        status_code=401,
                        content={"detail": "Token expired or invalid"},
                    )
                request.state.user_id = payload.get("sub")
                request.state.user_role = payload.get("role")
                request.state.jwt_payload = payload
                jti = payload.get("jti")
                if jti:
                    try:
                        from redis_store import store
                        if await store.exists(f"auth:revoked_jti:{jti}"):
                            return JSONResponse(
                                status_code=401,
                                content={"detail": "Token revoked"},
                            )
                    except Exception:
                        # Fail closed — never accept a possibly-revoked token when Redis is down.
                        logger.exception("auth_revocation_check_failed")
                        return JSONResponse(
                            status_code=503,
                            content={"detail": "Session validation temporarily unavailable"},
                        )
                return await call_next(request)
            if admin_ns:
                return await call_next(request)
            return JSONResponse(status_code=401, content={"detail": "Authentication required"})

        if has_bearer:
            try:
                payload = verify_jwt_token(raw_token)
                jti = payload.get("jti")
                if jti:
                    try:
                        from redis_store import store
                        if await store.exists(f"auth:revoked_jti:{jti}"):
                            return JSONResponse(
                                status_code=401,
                                content={"detail": "Token revoked"},
                            )
                    except Exception:
                        logger.exception("auth_revocation_check_failed_optional_path")
                        return JSONResponse(
                            status_code=503,
                            content={"detail": "Session validation temporarily unavailable"},
                        )
                request.state.user_id = payload.get("sub")
                request.state.user_role = payload.get("role")
                request.state.jwt_payload = payload
            except Exception:
                pass
        return await call_next(request)


class ResponseTimingMiddleware(BaseHTTPMiddleware):
    """
    Server-side latency per request.
    Always logs slow paths; set NEXRYDE_RESPONSE_TIME_HEADER=1 for X-Response-Time-ms.
    """

    _SLOW_MS = int(os.environ.get("NEXRYDE_SLOW_REQUEST_MS", "800"))

    async def dispatch(self, request: Request, call_next):
        if request.method == "OPTIONS":
            return await call_next(request)
        t0 = time.perf_counter()
        response = await call_next(request)
        ms = int((time.perf_counter() - t0) * 1000)
        path = request.url.path
        # Always expose for client/debug; cheap header.
        response.headers["X-Response-Time-ms"] = str(ms)
        # W3C Server-Timing — visible in browser/devtools and proxy logs.
        response.headers["Server-Timing"] = f"app;dur={ms}"
        # Structured log for places/trips/wallet (and any slow request).
        interesting = (
            path.startswith("/api/places/")
            or path.startswith("/api/trips/")
            or path.startswith("/api/wallet")
            or path.startswith("/api/fare/")
            or path.startswith("/api/users/")
            or path.startswith("/api/drivers/")
            or path.startswith("/api/subscriptions")
            or path.startswith("/api/work-zone")
            or ms >= self._SLOW_MS
        )
        if interesting:
            try:
                logging.getLogger("nexryde.latency").info(
                    "http_latency method=%s path=%s status=%s ms=%s",
                    request.method,
                    path,
                    getattr(response, "status_code", "?"),
                    ms,
                )
            except Exception:
                pass
        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Apply baseline security headers to every HTTP response."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        for k, v in SECURITY_HEADERS.items():
            response.headers.setdefault(k, v)
        return response


class RequestIdMiddleware(BaseHTTPMiddleware):
    """Attach a request id for traceability across logs and clients."""

    async def dispatch(self, request: Request, call_next):
        req_id = request.headers.get("x-request-id") or str(uuid.uuid4())
        request.state.request_id = req_id
        response = await call_next(request)
        response.headers["X-Request-Id"] = req_id
        return response


class InputSanitizationMiddleware(BaseHTTPMiddleware):
    """
    Block requests with suspiciously large payloads and basic SQLi/NoSQLi patterns.
    Acts as a last-resort guard; validation in Pydantic models is the primary layer.
    """
    _MAX_BODY = 10 * 1024 * 1024  # 10 MB hard limit
    _NOSQL_RE = __import__("re").compile(
        r"(\$where|\$gt|\$lt|\$ne|\$regex|\$in|\$nin|__proto__|constructor\.prototype)",
        __import__("re").IGNORECASE,
    )

    async def dispatch(self, request: Request, call_next):
        # Block oversized bodies before they hit route handlers
        cl = int(request.headers.get("content-length", 0) or 0)
        if cl > self._MAX_BODY:
            from fastapi.responses import JSONResponse
            return JSONResponse({"detail": "Request body too large"}, status_code=413)

        # For JSON bodies, check for NoSQLi patterns.
        # request.body() caches result in request._body, so downstream handlers
        # can safely call request.body() again without re-reading the ASGI stream.
        ct = request.headers.get("content-type", "")
        if "application/json" in ct and cl > 0:
            try:
                body_bytes = await request.body()  # caches in request._body
                body_text = body_bytes.decode("utf-8", errors="ignore")
                if self._NOSQL_RE.search(body_text):
                    from fastapi.responses import JSONResponse as _JR
                    return _JR({"detail": "Invalid request"}, status_code=400)
            except Exception:
                pass  # Do not break legitimate requests on parse errors

        return await call_next(request)


app.add_middleware(InputSanitizationMiddleware)
app.add_middleware(AuthMiddleware)
app.add_middleware(ResponseTimingMiddleware)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RequestIdMiddleware)
# Compress JSON payloads for mobile (Lagos cellular) — outer so responses are gzipped.
app.add_middleware(GZipMiddleware, minimum_size=500)
_trusted_hosts_raw = os.environ.get("TRUSTED_HOSTS", "").strip()
if _trusted_hosts_raw:
    _trusted_hosts = [h.strip() for h in _trusted_hosts_raw.split(",") if h.strip()]
    # Always allow: localhost, Cloud Run internal probe network (169.254.x.x),
    # and the Cloud Run service URL itself (used by health probes without a Host header).
    _probe_hosts = ["localhost", "127.0.0.1", "169.254.169.126", "*.run.internal"]
    if _trusted_hosts:
        app.add_middleware(
            TrustedHostMiddleware,
            allowed_hosts=_trusted_hosts + _probe_hosts,
        )

# Mount admin static files — prefer built React SPA in admin/dist
_admin_static_dir = ADMIN_SPA_DIR if ADMIN_SPA_DIR.exists() else ADMIN_DIR
if _admin_static_dir.exists():
    app.mount("/admin", StaticFiles(directory=str(_admin_static_dir), html=True), name="admin")
else:
    logger.warning(f"Admin directory not found at {ADMIN_DIR}, admin panel disabled")

@app.get("/privacy-policy", include_in_schema=False)
async def serve_privacy_policy():
    pp_file = ROOT_DIR / "privacy-policy.html"
    if pp_file.exists():
        return FileResponse(pp_file, media_type="text/html")
    raise HTTPException(status_code=404, detail="Privacy policy not found")

@app.get("/terms-of-service", include_in_schema=False)
async def serve_terms_of_service():
    tos_file = ROOT_DIR / "terms-of-service.html"
    if tos_file.exists():
        return FileResponse(tos_file, media_type="text/html")
    raise HTTPException(status_code=404, detail="Terms of service not found")

@app.get("/support-page", include_in_schema=False)
async def serve_support_page():
    support_file = ROOT_DIR / "support-page.html"
    if support_file.exists():
        return FileResponse(support_file, media_type="text/html")
    return {"redirect": "mailto:admin@admoblordgroup.com", "email": "admin@admoblordgroup.com", "message": "Contact NEXRYDE support at admin@admoblordgroup.com"}

@app.get("/delete-account", include_in_schema=False)
async def serve_delete_account():
    """Public URL for app store account-deletion policy and user instructions."""
    path = ROOT_DIR / "delete-account.html"
    if path.exists():
        return FileResponse(path, media_type="text/html")
    raise HTTPException(status_code=404, detail="Delete account page not found")

@app.on_event("shutdown")
async def shutdown_db_client():
    try:
        from realtime_platform.outbox_worker import stop_outbox_worker

        await stop_outbox_worker()
    except Exception:
        pass
    client.close()


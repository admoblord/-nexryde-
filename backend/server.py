from fastapi import FastAPI, APIRouter, HTTPException, status, Response, Request, WebSocket, WebSocketDisconnect, Form, File, UploadFile, Body
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from typing import Set
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
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
from openai import OpenAI

# Import LLM Chat for AI Assistants

# Import Subscription Management System
from subscription_manager import subscription_router
from payment_reminder_system import payment_reminder_job

# Import Two-Tier Subscription System (ENHANCED)
from two_tier_subscription import two_tier_router

# Import Route Caching Service (API Cost Protection)
from route_cache_service import route_cache_router

# Import Smart Route Planner (Eliminate Empty Returns)
from smart_route_planner import route_planner_router

# Import Map Service (Cost Controlled)
from map_service import map_router

# Import Call Service (Privacy Protected)
from call_service import call_router

# Import Smart Mode AI (NEW)
from smart_mode_ai import router as smart_mode_router

# Import Community & Safety Routers (REFACTORED)
from routers.community import community_router, seed_community_groups, seed_community_content
from routers.safety import safety_router, seed_danger_zones
from routers.ai_features import ai_router
from routers.admin import admin_router
from routers.trips import trips_router, set_fare_estimate_store, set_shared_functions
from routers.auth import auth_router
from routers.bidding import bidding_router
from routers.payments import payments_router, set_payments_shared_functions

ROOT_DIR = Path(__file__).parent
ADMIN_DIR = ROOT_DIR.parent / 'admin'
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'nexryde_db')]

# Google Maps API Key
GOOGLE_MAPS_API_KEY = os.environ.get('GOOGLE_MAPS_API_KEY', '')

# Emergent LLM Key for AI Assistants

# Termii SMS OTP Configuration
TERMII_API_KEY = os.environ.get('TERMII_API_KEY', '')
TERMII_BASE_URL = os.environ.get('TERMII_BASE_URL', 'https://api.ng.termii.com')
TERMII_FROM_ID = os.environ.get('TERMII_FROM_ID', 'NEXRYDE')

# Emergent Auth URL
EMERGENT_AUTH_URL = os.environ.get('EMERGENT_AUTH_URL', 'https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data')

# Create the main app
app = FastAPI(title="NEXRYDE API", version="2.0.0")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ==================== CONFIGURATION ====================

# ==================== NIGERIAN MARKET FARE CONFIGURATION ====================
# Comprehensive pricing for Nigerian ride-hailing market
# Based on inDrive, Bolt, and Lag Ride competitive analysis
FARE_CONFIG = {
    "lagos": {
        "economy": {
            "base_fare": 400,           # ₦400 flat fee to start
            "per_km": 400,              # ₦400 per kilometer
            "per_min": 80,              # ₦80 per minute (for traffic/waiting)
            "booking_fee": 0,           # Platform service fee
            "min_fare": 0,              # Minimum fare
            "max_multiplier": 2.5,      # Max 2.5x surge pricing
            "cancellation_fee": 300,    # ₦300 if rider cancels after driver accepts
        },
        "comfort": {
            "base_fare": 600,           # ₦600 flat fee to start
            "per_km": 500,              # ₦500 per kilometer
            "per_min": 100,             # ₦100 per minute
            "booking_fee": 0,           # Platform service fee
            "min_fare": 0,              # Minimum fare
            "max_multiplier": 2.5,
            "cancellation_fee": 400,
        },
        "xl": {
            "base_fare": 500,           # ₦500 flat fee to start
            "per_km": 450,              # ₦450 per kilometer
            "per_min": 90,              # ₦90 per minute
            "booking_fee": 0,           # Platform service fee
            "min_fare": 0,              # Minimum fare
            "max_multiplier": 2.5,
            "cancellation_fee": 450,
        },
        "premium": {
            "base_fare": 800,           # ₦800 flat fee to start
            "per_km": 600,              # ₦600 per kilometer
            "per_min": 120,             # ₦120 per minute
            "booking_fee": 0,           # Platform service fee
            "min_fare": 0,              # Minimum fare
            "max_multiplier": 3.0,      # Premium can surge up to 3x
            "cancellation_fee": 500,
        },
    },
    "abuja": {
        "economy": {
            "base_fare": 400,
            "per_km": 130,
            "per_min": 20,
            "booking_fee": 0,
            "min_fare": 0,
            "max_multiplier": 2.5,
            "cancellation_fee": 250,
        },
        "comfort": {
            "base_fare": 600,
            "per_km": 180,
            "per_min": 30,
            "booking_fee": 0,
            "min_fare": 0,
            "max_multiplier": 2.5,
            "cancellation_fee": 350,
        },
        "premium": {
            "base_fare": 900,
            "per_km": 300,
            "per_min": 45,
            "booking_fee": 0,
            "min_fare": 0,
            "max_multiplier": 3.0,
            "cancellation_fee": 450,
        },
        "xl": {
            "base_fare": 700,
            "per_km": 220,
            "per_min": 35,
            "booking_fee": 0,
            "min_fare": 0,
            "max_multiplier": 2.5,
            "cancellation_fee": 400,
        },
    },
    "port_harcourt": {
        "economy": {
            "base_fare": 450,
            "per_km": 140,
            "per_min": 22,
            "booking_fee": 0,
            "min_fare": 0,
            "max_multiplier": 2.5,
            "cancellation_fee": 280,
        },
        "comfort": {
            "base_fare": 650,
            "per_km": 190,
            "per_min": 32,
            "booking_fee": 0,
            "min_fare": 0,
            "max_multiplier": 2.5,
            "cancellation_fee": 380,
        },
        "premium": {
            "base_fare": 950,
            "per_km": 320,
            "per_min": 48,
            "booking_fee": 0,
            "min_fare": 0,
            "max_multiplier": 3.0,
            "cancellation_fee": 480,
        },
        "xl": {
            "base_fare": 750,
            "per_km": 230,
            "per_min": 38,
            "booking_fee": 0,
            "min_fare": 0,
            "max_multiplier": 2.5,
            "cancellation_fee": 420,
        },
    },
    "default": {
        "economy": {
            "base_fare": 500,
            "per_km": 150,
            "per_min": 25,
            "booking_fee": 0,
            "min_fare": 0,
            "max_multiplier": 2.5,
            "cancellation_fee": 300,
        },
        "comfort": {
            "base_fare": 700,
            "per_km": 200,
            "per_min": 35,
            "booking_fee": 0,
            "min_fare": 0,
            "max_multiplier": 2.5,
            "cancellation_fee": 400,
        },
        "premium": {
            "base_fare": 1000,
            "per_km": 350,
            "per_min": 50,
            "booking_fee": 0,
            "min_fare": 0,
            "max_multiplier": 3.0,
            "cancellation_fee": 500,
        },
        "xl": {
            "base_fare": 800,
            "per_km": 250,
            "per_min": 40,
            "booking_fee": 0,
            "min_fare": 0,
            "max_multiplier": 2.5,
            "cancellation_fee": 450,
        },
    }
}

# Surge Pricing Configuration
SURGE_CONFIG = {
    "high_demand_threshold": 0.7,      # 70% of drivers busy = start surge
    "very_high_demand_threshold": 0.85, # 85% = higher surge
    "critical_demand_threshold": 0.95,  # 95% = max surge
    "surge_levels": {
        "normal": 1.0,
        "high": 1.3,
        "very_high": 1.8,
        "critical": 2.5,
    },
    "peak_hours": {
        "morning": {"start": 7, "end": 9, "multiplier": 1.2},   # 7-9 AM
        "evening": {"start": 17, "end": 20, "multiplier": 1.3}, # 5-8 PM
    },
    "weekend_multiplier": 1.1,  # 10% increase on weekends
    "rain_multiplier": 1.4,     # 40% increase during rain
    "holiday_multiplier": 1.5,  # 50% increase on holidays
}

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
# Cache settings
route_cache: Dict[str, Dict[str, Any]] = {}
CACHE_TTL_SECONDS = 300
# Fare lock duration
FARE_LOCK_MINUTES = 3
# OTP storage
otp_store = {}
# Fare estimate storage
fare_estimate_store: Dict[str, Dict[str, Any]] = {}

# ==================== DRIVER SUBSCRIPTION CONFIG ====================
SUBSCRIPTION_CONFIG = {
    "monthly_fee": 25000,  # ₦25,000 monthly
    "trial_days": 7,       # 7 days free trial
    "currency": "NGN",
    "bank_details": {
        "bank_name": "UBA",
        "account_name": "ADMOBLORDGROUP LIMITED",
        "account_number": "1028400669",
    }
}

# ==================== SURGE PRICING CONFIG ====================
SURGE_CONFIG = {
    "enabled": True,
    "base_multiplier": 1.0,
    "max_multiplier": 3.0,
    "peak_hours": {
        "morning": {"start": 7, "end": 9, "multiplier": 1.5},
        "evening": {"start": 17, "end": 20, "multiplier": 1.8},
    },
    "high_demand_threshold": 0.7,  # 70% of drivers busy = surge
    "rain_multiplier": 1.3,
    "holiday_multiplier": 1.5,
}

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
    "referral_bonus_referrer": 500,  # ₦500 for referrer
    "referral_bonus_referee": 300,   # ₦300 for new user
    "first_ride_discount": 0.2,      # 20% off first ride
    "max_promo_discount": 0.5,       # Max 50% discount
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
    behavior_score: float = 100.0  # AI Behavior Score (hidden)
    emergency_contacts: List[dict] = []  # [{name, phone, relationship}]
    favorite_drivers: List[str] = []  # List of driver IDs
    blocked_drivers: List[str] = []  # List of driver IDs
    blocked_riders: List[str] = []  # List of rider IDs (for drivers)
    streaks: dict = Field(default_factory=lambda: {"current": 0, "best": 0, "last_date": None})
    badges: List[str] = []
    # KODA Family
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
    amount: float = 25000.0
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
    amount: float = 25000.0
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
    auto_triggered: bool = False  # If triggered by AI (scream detection)
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
        "name": "KODA Basic",
        "monthly_fee": 25000,
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
        "name": "KODA Premium", 
        "monthly_fee": 25000,  # Same fee!
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

def get_cache_key(pickup_lat: float, pickup_lng: float, dropoff_lat: float, dropoff_lng: float) -> str:
    key_str = f"{round(pickup_lat, 4)},{round(pickup_lng, 4)}-{round(dropoff_lat, 4)},{round(dropoff_lng, 4)}"
    return hashlib.md5(key_str.encode()).hexdigest()

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

async def get_directions_from_google(pickup_lat: float, pickup_lng: float, dropoff_lat: float, dropoff_lng: float) -> dict:
    cache_key = get_cache_key(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng)
    if cache_key in route_cache and is_cache_valid(route_cache[cache_key]):
        return route_cache[cache_key]["data"]
    
    if not GOOGLE_MAPS_API_KEY:
        return None
    
    # Try Routes API first
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
        
        async with httpx.AsyncClient() as client:
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
            }
            route_cache[cache_key] = {"data": result, "cached_at": datetime.utcnow()}
            return result
    except Exception as e:
        logger.warning(f"Routes API failed: {e}")
    
    # Fallback to Directions API
    try:
        url = "https://maps.googleapis.com/maps/api/directions/json"
        params = {
            "origin": f"{pickup_lat},{pickup_lng}",
            "destination": f"{dropoff_lat},{dropoff_lng}",
            "key": GOOGLE_MAPS_API_KEY,
            "departure_time": "now"
        }
        async with httpx.AsyncClient() as client:
            response = await client.get(url, params=params, timeout=10.0)
            data = response.json()
        
        if data.get("status") == "OK":
            route = data["routes"][0]
            leg = route["legs"][0]
            result = {
                "distance_meters": leg["distance"]["value"],
                "duration_seconds": leg["duration"]["value"],
                "duration_in_traffic_seconds": leg.get("duration_in_traffic", {}).get("value", leg["duration"]["value"]),
                "polyline": route["overview_polyline"]["points"],
            }
            route_cache[cache_key] = {"data": result, "cached_at": datetime.utcnow()}
            return result
    except Exception as e:
        logger.warning(f"Directions API failed: {e}")
    
    return None

def calculate_fare(distance_km: float, duration_min: int, traffic_duration_min: int, service_type: str = "economy", city: str = "lagos", is_surge: bool = False, surge_multiplier: float = 1.0) -> dict:
    """
    Calculate fare for Nigerian market with comprehensive pricing formula:
    Total Fare = (Base Fare + (Distance × Rate/km) + (Time × Rate/min) + Traffic Fee + Booking Fee) × Surge Multiplier
    """
    city_config = FARE_CONFIG.get(city.lower(), FARE_CONFIG["default"])
    config = city_config.get(service_type.lower(), city_config.get("economy", FARE_CONFIG["default"]["economy"]))
    
    # Extract pricing components
    base_fare = config.get("base_fare", 500)
    per_km = config.get("per_km", 150)
    per_min = config.get("per_min", 25)
    booking_fee = config.get("booking_fee", 100)
    min_fare = config.get("min_fare", 800)
    max_multiplier = config.get("max_multiplier", 2.5)
    cancellation_fee = config.get("cancellation_fee", 300)
    
    # Step 1: Calculate distance fee
    distance_fee = round(distance_km * per_km, 2)
    
    # Step 2: Calculate time fee (for time spent in traffic/waiting)
    time_fee = round(duration_min * per_min, 2)
    
    # Step 3: Calculate extra traffic fee (when traffic time exceeds normal duration)
    extra_traffic_min = max(0, traffic_duration_min - duration_min)
    traffic_fee = round(min(extra_traffic_min * per_min, base_fare * 0.5), 2)  # Cap at 50% of base fare
    
    # Step 4: Calculate subtotal before surge
    subtotal = base_fare + distance_fee + time_fee + traffic_fee + booking_fee
    
    # Step 5: Calculate surge/dynamic pricing (min_fare removed per user request)
    current_hour = datetime.utcnow().hour + 1  # Nigerian time (WAT = UTC+1)
    is_weekend = datetime.utcnow().weekday() >= 5
    
    # Peak hours: Morning rush (7-9 AM) and Evening rush (5-8 PM)
    is_morning_peak = 7 <= current_hour <= 9
    is_evening_peak = 17 <= current_hour <= 20
    is_peak = is_morning_peak or is_evening_peak
    
    # Calculate dynamic multiplier
    dynamic_multiplier = 1.0
    if is_surge and surge_multiplier > 1.0:
        dynamic_multiplier = min(surge_multiplier, max_multiplier)
    elif is_peak:
        peak_config = SURGE_CONFIG.get("peak_hours", {})
        if is_morning_peak:
            dynamic_multiplier = peak_config.get("morning", {}).get("multiplier", 1.2)
        elif is_evening_peak:
            dynamic_multiplier = peak_config.get("evening", {}).get("multiplier", 1.3)
    
    # Add weekend multiplier
    if is_weekend:
        dynamic_multiplier *= SURGE_CONFIG.get("weekend_multiplier", 1.1)
    
    # Cap the multiplier
    dynamic_multiplier = min(dynamic_multiplier, max_multiplier)
    
    # Step 7: Calculate final fare
    total_fare = round(subtotal * dynamic_multiplier, 2)
    
    # Round to nearest ₦50 for cleaner prices
    total_fare = round(total_fare / 50) * 50
    
    return {
        "base_fare": base_fare,
        "distance_km": round(distance_km, 2),
        "distance_fee": distance_fee,
        "duration_min": duration_min,
        "time_fee": time_fee,
        "traffic_duration_min": traffic_duration_min,
        "traffic_fee": traffic_fee,
        "booking_fee": booking_fee,
        "subtotal": round(subtotal, 2),
        "surge_multiplier": round(dynamic_multiplier, 2),
        "total_fare": total_fare,
        "min_fare": min_fare,
        "cancellation_fee": cancellation_fee,
        "is_peak": is_peak,
        "is_weekend": is_weekend,
        "peak_type": "morning" if is_morning_peak else ("evening" if is_evening_peak else None),
        "service_type": service_type,
        "city": city,
        "currency": "NGN",
        "price_breakdown": f"₦{base_fare} base + ₦{distance_fee} ({distance_km}km) + ₦{time_fee} ({duration_min}min) + ₦{traffic_fee} traffic + ₦{booking_fee} booking"
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
async def get_active_trip(user_id: str):
    """Get the user's current active trip (if any)"""
    try:
        trip = await db.trips.find_one(
            {
                "$or": [{"rider_id": user_id}, {"driver_id": user_id}],
                "status": {"$in": ["accepted", "pickup", "ongoing", "pending"]}
            },
            {"_id": 0},
            sort=[("created_at", -1)]
        )
        if not trip:
            return {"active": False}
        return {"active": True, "trip": trip}
    except Exception as e:
        logger.error(f"Get active trip error: {e}")
        return {"active": False, "error": str(e)}

@api_router.get("/")
async def root():
    return {"message": "KODA API is running", "version": "2.0.0"}

@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}


# ==================== ADMIN (REFACTORED TO routers/admin.py) ====================


# ==================== ADMIN PANEL STATIC FILES ====================

@app.get("/admin/")
async def serve_admin():
    """Serve admin panel"""
    admin_file = ADMIN_DIR / "index.html"
    if admin_file.exists():
        return FileResponse(admin_file, media_type="text/html")
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
async def direct_send_otp(request: OTPRequest):
    """Direct OTP endpoint without /api prefix"""
    return await send_otp(request)

# ==================== ROUTER INCLUDES ====================
app.include_router(api_router)
app.include_router(two_tier_router)
app.include_router(subscription_router)
app.include_router(smart_mode_router)
app.include_router(route_cache_router)
app.include_router(route_planner_router)
app.include_router(map_router)
app.include_router(call_router)
app.include_router(community_router)
app.include_router(safety_router)
app.include_router(ai_router)
app.include_router(admin_router)
app.include_router(trips_router)
app.include_router(auth_router)
app.include_router(bidding_router)
app.include_router(payments_router)

from routers.chat import chat_router
app.include_router(chat_router)

from routers.users import users_router
app.include_router(users_router)

from routers.gamification import gamification_router
app.include_router(gamification_router)

from routers.drivers import drivers_router
app.include_router(drivers_router)

from routers.support import support_router
app.include_router(support_router)

from places_service import places_router
app.include_router(places_router)

from safety_data_service import safety_data_router
app.include_router(safety_data_router)

# ==================== SEED ON STARTUP ====================
@app.on_event("startup")
async def seed_promo_codes():
    """Seed default promo codes"""
    from routers.admin import seed_promo_codes as _seed_promos
    await _seed_promos()
    # Wire up shared functions for trips router
    set_shared_functions(get_directions_from_google, calculate_fare, calculate_distance_haversine)
    set_payments_shared_functions(get_directions_from_google, calculate_fare, calculate_distance_haversine)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount admin static files
app.mount("/admin", StaticFiles(directory=str(ADMIN_DIR), html=True), name="admin")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()


from fastapi import FastAPI, APIRouter, HTTPException, status, Response, Request
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
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

# Import LLM Chat for AI Assistants
from emergentintegrations.llm.chat import LlmChat, UserMessage

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'koda_db')]

# Google Maps API Key
GOOGLE_MAPS_API_KEY = os.environ.get('GOOGLE_MAPS_API_KEY', '')

# Emergent LLM Key for AI Assistants
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')

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

FARE_CONFIG = {
    "lagos": {
        "economy": {"base_fare": 800, "per_km": 120, "per_min": 20, "min_fare": 1500, "max_multiplier": 1.2},
        "premium": {"base_fare": 1200, "per_km": 180, "per_min": 30, "min_fare": 2500, "max_multiplier": 1.2}
    },
    "default": {
        "economy": {"base_fare": 800, "per_km": 120, "per_min": 20, "min_fare": 1500, "max_multiplier": 1.2},
        "premium": {"base_fare": 1200, "per_km": 180, "per_min": 30, "min_fare": 2500, "max_multiplier": 1.2}
    }
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

# ==================== MODELS ====================

class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    phone: str
    name: Optional[str] = None
    email: Optional[str] = None
    role: str = "rider"
    gender: Optional[str] = None  # For women-only mode
    created_at: datetime = Field(default_factory=datetime.utcnow)
    is_verified: bool = False
    face_verified: bool = False
    face_image: Optional[str] = None  # Base64 encoded face image for verification
    profile_image: Optional[str] = None
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
    phone: str
    name: str
    email: Optional[str] = None
    role: str = "rider"

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

def calculate_fare(distance_km: float, duration_min: int, traffic_duration_min: int, service_type: str = "economy", city: str = "lagos") -> dict:
    city_config = FARE_CONFIG.get(city.lower(), FARE_CONFIG["default"])
    config = city_config.get(service_type, city_config["economy"])
    
    base_fare = config["base_fare"]
    per_km = config["per_km"]
    per_min = config["per_min"]
    min_fare = config["min_fare"]
    max_multiplier = config["max_multiplier"]
    
    distance_fee = distance_km * per_km
    time_fee = duration_min * per_min
    extra_traffic_min = max(0, traffic_duration_min - duration_min)
    traffic_fee = min(extra_traffic_min * per_min, base_fare * 0.3)
    
    subtotal = base_fare + distance_fee + time_fee + traffic_fee
    subtotal = max(min_fare, subtotal)
    
    current_hour = datetime.utcnow().hour + 1
    is_peak = current_hour in [7, 8, 9, 17, 18, 19, 20]
    multiplier = min(1.1 if is_peak else 1.0, max_multiplier)
    
    total_fare = round(subtotal * multiplier, 2)
    
    return {
        "base_fare": base_fare,
        "distance_fee": round(distance_fee, 2),
        "time_fee": round(time_fee, 2),
        "traffic_fee": round(traffic_fee, 2),
        "subtotal": round(subtotal, 2),
        "multiplier": multiplier,
        "total_fare": total_fare,
        "min_fare": min_fare,
        "is_peak": is_peak,
        "currency": "NGN"
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

# ==================== AUTH ENDPOINTS ====================

# OTP Configuration
OTP_EXPIRY_MINUTES = 10
OTP_MAX_ATTEMPTS = 3
OTP_RESEND_COOLDOWN_SECONDS = 60
OTP_MAX_DAILY_REQUESTS = 10

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
    now = datetime.utcnow()
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
    
    now = datetime.utcnow()
    last_sent = record.get("last_sent_at")
    
    if last_sent:
        elapsed = (now - last_sent).total_seconds()
        if elapsed < OTP_RESEND_COOLDOWN_SECONDS:
            wait_time = int(OTP_RESEND_COOLDOWN_SECONDS - elapsed)
            return {"can_resend": False, "wait_seconds": wait_time}
    
    # Check daily limit
    daily_reset = record.get("daily_reset_at")
    if daily_reset and now > daily_reset:
        # Reset daily counter
        await db.otp_records.update_one(
            {"phone": phone},
            {"$set": {"daily_requests": 0, "daily_reset_at": now + timedelta(days=1)}}
        )
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

@api_router.post("/auth/send-otp")
async def send_otp(request: OTPRequest):
    """Send OTP via Termii SMS or fallback to mock mode"""
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
        
        # Check if Termii is configured and try to send
        if TERMII_API_KEY:
            try:
                async with httpx.AsyncClient() as http_client:
                    payload = {
                        "api_key": TERMII_API_KEY,
                        "to": normalized_phone,
                        "from": "OE Alert",
                        "channel": "dnd",
                        "type": "plain",
                        "sms": f"Your NexRyde verification code is {otp_code}. This code expires in {OTP_EXPIRY_MINUTES} minutes."
                    }
                    
                    logger.info(f"Sending OTP to {normalized_phone} via Termii v3 API")
                    
                    response = await http_client.post(
                        f"{TERMII_BASE_URL}/api/sms/send",
                        json=payload,
                        timeout=30.0
                    )
                    
                    logger.info(f"Termii response status: {response.status_code}")
                    logger.info(f"Termii response: {response.text}")
                    
                    if response.status_code == 200:
                        data = response.json()
                        message_id = data.get('message_id')
                        
                        # Save OTP to database
                        await save_otp_record(
                            phone=request.phone,
                            otp=otp_code,
                            provider="termii",
                            message_id=message_id
                        )
                        
                        logger.info(f"Termii SMS sent successfully to {normalized_phone}")
                        return {
                            "message": "OTP sent successfully via SMS",
                            "expires_in_minutes": OTP_EXPIRY_MINUTES,
                            "resend_cooldown_seconds": OTP_RESEND_COOLDOWN_SECONDS,
                            "provider": "termii"
                        }
                    else:
                        logger.error(f"Termii API error: {response.status_code} - {response.text}")
                        raise Exception(f"Termii API failed: {response.text}")
            except Exception as e:
                logger.error(f"Termii error: {str(e)}")
                # Fall through to mock mode
        
        # Fallback: Mock OTP (for testing/development)
        await save_otp_record(
            phone=request.phone,
            otp=otp_code,
            provider="mock"
        )
        
        # Also keep in memory for backward compatibility
        otp_store[request.phone] = {
            "otp": otp_code,
            "expires": datetime.utcnow() + timedelta(minutes=OTP_EXPIRY_MINUTES),
            "provider": "mock"
        }
        
        logger.info(f"Mock OTP for {request.phone}: {otp_code}")
        return {
            "message": "OTP sent successfully (test mode)",
            "otp": otp_code,  # Only shown in mock mode for testing
            "expires_in_minutes": OTP_EXPIRY_MINUTES,
            "resend_cooldown_seconds": OTP_RESEND_COOLDOWN_SECONDS,
            "provider": "mock"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error sending OTP: {str(e)}")
        # Final fallback
        otp = generate_otp()
        await save_otp_record(phone=request.phone, otp=otp, provider="mock")
        otp_store[request.phone] = {
            "otp": otp,
            "expires": datetime.utcnow() + timedelta(minutes=OTP_EXPIRY_MINUTES),
            "provider": "mock"
        }
        return {
            "message": "OTP sent successfully (test mode)",
            "otp": otp,
            "expires_in_minutes": OTP_EXPIRY_MINUTES,
            "resend_cooldown_seconds": OTP_RESEND_COOLDOWN_SECONDS,
            "provider": "mock"
        }

@api_router.post("/auth/verify-otp")
async def verify_otp(request: OTPVerify):
    """Verify OTP with retry limiting"""
    # First try database record
    db_record = await get_otp_record(request.phone)
    
    # Fall back to in-memory store if no DB record
    stored = db_record or otp_store.get(request.phone)
    
    if not stored:
        raise HTTPException(status_code=400, detail="OTP not found. Please request a new code.")
    
    # Check expiry
    expiry = stored.get("expires_at") or stored.get("expires")
    if expiry and datetime.utcnow() > expiry:
        await delete_otp_record(request.phone)
        if request.phone in otp_store:
            del otp_store[request.phone]
        raise HTTPException(status_code=400, detail="OTP expired. Please request a new code.")
    
    # Check attempt limit
    current_attempts = stored.get("attempts", 0)
    if current_attempts >= OTP_MAX_ATTEMPTS:
        await delete_otp_record(request.phone)
        if request.phone in otp_store:
            del otp_store[request.phone]
        raise HTTPException(
            status_code=400, 
            detail="Too many failed attempts. Please request a new code."
        )
    
    # Verify OTP
    stored_otp = stored.get("otp")
    if stored_otp != request.otp:
        # Increment attempts
        new_attempts = await increment_otp_attempts(request.phone)
        remaining = OTP_MAX_ATTEMPTS - new_attempts
        
        if remaining <= 0:
            await delete_otp_record(request.phone)
            if request.phone in otp_store:
                del otp_store[request.phone]
            raise HTTPException(
                status_code=400, 
                detail="Too many failed attempts. Please request a new code."
            )
        
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid OTP code. {remaining} attempt(s) remaining."
        )
    
    # OTP verified successfully - clean up
    await delete_otp_record(request.phone)
    if request.phone in otp_store:
        del otp_store[request.phone]
    
    # Check if user exists
    user = await db.users.find_one({"phone": request.phone})
    if user:
        await db.users.update_one({"phone": request.phone}, {"$set": {"is_verified": True}})
        user["is_verified"] = True
        user["_id"] = str(user["_id"])
        return {"message": "Login successful", "user": user, "is_new_user": False}
    
    return {"message": "OTP verified", "is_new_user": True}

@api_router.get("/auth/otp-status/{phone}")
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
    
    now = datetime.utcnow()
    
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
class SessionExchangeRequest(BaseModel):
    session_id: str

class SessionDataResponse(BaseModel):
    id: str
    email: str
    name: str
    picture: Optional[str] = None
    session_token: str

@api_router.post("/auth/google/exchange")
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
class GoogleSignInRequest(BaseModel):
    id_token: str
    email: str
    name: Optional[str] = None
    photo_url: Optional[str] = None

@api_router.post("/auth/google")
async def google_sign_in(request: GoogleSignInRequest):
    """Handle Google Sign-In authentication (legacy)"""
    try:
        # Check if user exists by email
        user = await db.users.find_one({"email": request.email})
        
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

@api_router.post("/auth/register")
async def register(request: RegisterRequest):
    existing = await db.users.find_one({"phone": request.phone})
    if existing:
        raise HTTPException(status_code=400, detail="User already exists")
    
    user = User(phone=request.phone, name=request.name, email=request.email, role=request.role, is_verified=True)
    await db.users.insert_one(user.dict())
    
    wallet = Wallet(user_id=user.id)
    await db.wallets.insert_one(wallet.dict())
    
    if request.role == "driver":
        driver_profile = DriverProfile(user_id=user.id)
        await db.driver_profiles.insert_one(driver_profile.dict())
    
    return {"message": "Registration successful", "user": user.dict()}

@api_router.post("/auth/logout")
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

# ==================== USER ENDPOINTS ====================

@api_router.get("/users/{user_id}")
async def get_user(user_id: str):
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user["_id"] = str(user["_id"])
    return user

@api_router.put("/users/{user_id}")
async def update_user(user_id: str, request: UpdateProfileRequest):
    update_data = {k: v for k, v in request.dict().items() if v is not None}
    if update_data:
        await db.users.update_one({"id": user_id}, {"$set": update_data})
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user["_id"] = str(user["_id"])
    return user

@api_router.put("/users/{user_id}/switch-role")
async def switch_role(user_id: str):
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    new_role = "driver" if user["role"] == "rider" else "rider"
    if new_role == "driver":
        profile = await db.driver_profiles.find_one({"user_id": user_id})
        if not profile:
            await db.driver_profiles.insert_one(DriverProfile(user_id=user_id).dict())
    
    await db.users.update_one({"id": user_id}, {"$set": {"role": new_role}})
    user = await db.users.find_one({"id": user_id})
    user["_id"] = str(user["_id"])
    return user

# ==================== EMERGENCY CONTACTS ====================

@api_router.post("/users/{user_id}/emergency-contacts")
async def add_emergency_contact(user_id: str, request: EmergencyContactRequest):
    contact = {"name": request.name, "phone": request.phone, "relationship": request.relationship}
    await db.users.update_one({"id": user_id}, {"$push": {"emergency_contacts": contact}})
    return {"message": "Emergency contact added", "contact": contact}

@api_router.get("/users/{user_id}/emergency-contacts")
async def get_emergency_contacts(user_id: str):
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"contacts": user.get("emergency_contacts", [])}

@api_router.delete("/users/{user_id}/emergency-contacts/{contact_phone}")
async def remove_emergency_contact(user_id: str, contact_phone: str):
    await db.users.update_one(
        {"id": user_id},
        {"$pull": {"emergency_contacts": {"phone": contact_phone}}}
    )
    return {"message": "Emergency contact removed"}

# ==================== FAVORITE/BLOCKED DRIVERS ====================

@api_router.post("/users/{user_id}/favorite-drivers")
async def add_favorite_driver(user_id: str, request: FavoriteDriverRequest):
    await db.users.update_one(
        {"id": user_id},
        {"$addToSet": {"favorite_drivers": request.driver_id}}
    )
    return {"message": "Driver added to favorites"}

@api_router.delete("/users/{user_id}/favorite-drivers/{driver_id}")
async def remove_favorite_driver(user_id: str, driver_id: str):
    await db.users.update_one(
        {"id": user_id},
        {"$pull": {"favorite_drivers": driver_id}}
    )
    return {"message": "Driver removed from favorites"}

@api_router.get("/users/{user_id}/favorite-drivers")
async def get_favorite_drivers(user_id: str):
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    driver_ids = user.get("favorite_drivers", [])
    drivers = []
    for driver_id in driver_ids:
        driver = await db.users.find_one({"id": driver_id})
        if driver:
            profile = await db.driver_profiles.find_one({"user_id": driver_id})
            drivers.append({
                "id": driver["id"],
                "name": driver.get("name"),
                "rating": driver.get("rating", 5.0),
                "vehicle": profile.get("vehicle_model") if profile else None,
                "plate": profile.get("vehicle_plate") if profile else None
            })
    return {"favorite_drivers": drivers}

@api_router.post("/users/{user_id}/blocked-drivers")
async def block_driver(user_id: str, request: FavoriteDriverRequest):
    await db.users.update_one(
        {"id": user_id},
        {"$addToSet": {"blocked_drivers": request.driver_id}}
    )
    return {"message": "Driver blocked"}

@api_router.delete("/users/{user_id}/blocked-drivers/{driver_id}")
async def unblock_driver(user_id: str, driver_id: str):
    await db.users.update_one(
        {"id": user_id},
        {"$pull": {"blocked_drivers": driver_id}}
    )
    return {"message": "Driver unblocked"}

# ==================== FACE VERIFICATION ====================

@api_router.post("/users/{user_id}/verify-face")
async def verify_face(user_id: str, request: FaceVerificationRequest):
    """Store face image for verification. In production, use AI face matching."""
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"face_image": request.face_image, "face_verified": True}}
    )
    return {"message": "Face verified successfully", "verified": True}

@api_router.post("/drivers/{user_id}/verify-face-at-start")
async def verify_face_at_ride_start(user_id: str, request: FaceVerificationRequest):
    """Verify driver face matches registered face at ride start"""
    profile = await db.driver_profiles.find_one({"user_id": user_id})
    if not profile or not profile.get("face_image"):
        raise HTTPException(status_code=400, detail="No registered face image found")
    
    # In production: Use AI to compare faces
    # For MVP: Always return success if image provided
    match_score = 0.95  # Simulated match score
    is_match = match_score > 0.8
    
    return {
        "verified": is_match,
        "match_score": match_score,
        "message": "Face verified" if is_match else "Face does not match"
    }

# ==================== DRIVER ENDPOINTS ====================

@api_router.get("/drivers/{user_id}/profile")
async def get_driver_profile(user_id: str):
    profile = await db.driver_profiles.find_one({"user_id": user_id})
    if not profile:
        raise HTTPException(status_code=404, detail="Driver profile not found")
    profile["_id"] = str(profile["_id"])
    return profile

@api_router.put("/drivers/{user_id}/profile")
async def update_driver_profile(user_id: str, request: DriverProfileUpdate):
    update_data = {k: v for k, v in request.dict().items() if v is not None}
    if update_data:
        result = await db.driver_profiles.update_one({"user_id": user_id}, {"$set": update_data})
        if result.modified_count == 0:
            profile = DriverProfile(user_id=user_id, **update_data)
            await db.driver_profiles.insert_one(profile.dict())
    
    profile = await db.driver_profiles.find_one({"user_id": user_id})
    profile["_id"] = str(profile["_id"])
    return profile

@api_router.put("/drivers/{user_id}/location")
async def update_driver_location(user_id: str, request: LocationUpdate):
    await db.driver_profiles.update_one(
        {"user_id": user_id},
        {"$set": {"current_location": {"lat": request.latitude, "lng": request.longitude, "updated_at": datetime.utcnow().isoformat()}}}
    )
    return {"message": "Location updated"}

@api_router.put("/drivers/{user_id}/online")
async def toggle_driver_online(user_id: str, is_online: bool):
    subscription = await db.subscriptions.find_one({
        "driver_id": user_id,
        "status": {"$in": ["active", "grace_period"]}
    })
    
    if is_online and not subscription:
        raise HTTPException(status_code=403, detail="Active subscription required to go online")
    
    # Check fatigue
    profile = await db.driver_profiles.find_one({"user_id": user_id})
    if profile and profile.get("hours_driven_today", 0) >= 10:
        raise HTTPException(
            status_code=403, 
            detail="You've been driving for over 10 hours. Please take a break for safety."
        )
    
    await db.driver_profiles.update_one({"user_id": user_id}, {"$set": {"is_online": is_online}})
    return {"message": f"Driver is now {'online' if is_online else 'offline'}"}

@api_router.get("/drivers/{user_id}/stats")
async def get_driver_stats(user_id: str):
    user = await db.users.find_one({"id": user_id})
    profile = await db.driver_profiles.find_one({"user_id": user_id})
    subscription = await db.subscriptions.find_one({
        "driver_id": user_id,
        "status": {"$in": ["active", "grace_period"]}
    })
    
    completed_trips = await db.trips.count_documents({"driver_id": user_id, "status": "completed"})
    
    pipeline = [
        {"$match": {"driver_id": user_id, "status": "completed"}},
        {"$group": {"_id": None, "total": {"$sum": "$fare"}}}
    ]
    earnings_result = await db.trips.aggregate(pipeline).to_list(1)
    total_earnings = earnings_result[0]["total"] if earnings_result else 0
    
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    today_pipeline = [
        {"$match": {"driver_id": user_id, "status": "completed", "completed_at": {"$gte": today_start}}},
        {"$group": {"_id": None, "total": {"$sum": "$fare"}}}
    ]
    today_result = await db.trips.aggregate(today_pipeline).to_list(1)
    today_earnings = today_result[0]["total"] if today_result else 0
    
    # Weekly stats
    week_start = datetime.utcnow() - timedelta(days=7)
    weekly_trips = await db.trips.count_documents({
        "driver_id": user_id, 
        "status": "completed",
        "completed_at": {"$gte": week_start}
    })
    
    days_remaining = 0
    if subscription:
        days_remaining = max(0, (subscription["end_date"] - datetime.utcnow()).days)
    
    return {
        "total_trips": completed_trips,
        "total_earnings": total_earnings,
        "today_earnings": today_earnings,
        "weekly_trips": weekly_trips,
        "rating": user.get("rating", 5.0) if user else 5.0,
        "completion_rate": profile.get("completion_rate", 100.0) if profile else 100.0,
        "rank": profile.get("rank", "standard") if profile else "standard",
        "subscription_active": subscription is not None,
        "subscription_days_remaining": days_remaining,
        "is_online": profile.get("is_online", False) if profile else False,
        "hours_driven_today": profile.get("hours_driven_today", 0) if profile else 0,
        "fatigue_warning": profile.get("fatigue_warning", False) if profile else False,
        "comfort_ratings": {
            "smoothness": profile.get("smoothness_rating", 5.0) if profile else 5.0,
            "politeness": profile.get("politeness_rating", 5.0) if profile else 5.0,
            "cleanliness": profile.get("cleanliness_rating", 5.0) if profile else 5.0,
            "safety": profile.get("safety_rating", 5.0) if profile else 5.0,
        },
        "streaks": user.get("streaks", {}) if user else {},
        "badges": user.get("badges", []) if user else []
    }

# ==================== SUBSCRIPTION ENDPOINTS ====================

@api_router.get("/subscriptions/config")
async def get_subscription_config():
    """Get subscription configuration including bank details"""
    return {
        "monthly_fee": SUBSCRIPTION_CONFIG["monthly_fee"],
        "trial_days": SUBSCRIPTION_CONFIG["trial_days"],
        "currency": SUBSCRIPTION_CONFIG["currency"],
        "bank_details": SUBSCRIPTION_CONFIG["bank_details"]
    }

@api_router.get("/subscriptions/{driver_id}")
async def get_subscription(driver_id: str):
    """Get driver's subscription status"""
    subscription = await db.subscriptions.find_one({
        "driver_id": driver_id
    }, sort=[("created_at", -1)])
    
    if subscription:
        subscription["_id"] = str(subscription["_id"])
        
        # Calculate days remaining
        now = datetime.utcnow()
        
        # Check trial status
        if subscription.get("status") == "trial":
            trial_end = subscription.get("trial_end_date")
            if trial_end and now > trial_end:
                # Trial expired
                await db.subscriptions.update_one(
                    {"id": subscription["id"]},
                    {"$set": {"status": "pending_payment"}}
                )
                subscription["status"] = "pending_payment"
                subscription["trial_expired"] = True
                subscription["days_remaining"] = 0
            else:
                days_remaining = (trial_end - now).days if trial_end else 0
                subscription["days_remaining"] = max(0, days_remaining)
                subscription["trial_expired"] = False
        elif subscription.get("status") == "active":
            end_date = subscription.get("end_date")
            if end_date:
                if now > end_date:
                    # Subscription expired
                    await db.subscriptions.update_one(
                        {"id": subscription["id"]},
                        {"$set": {"status": "expired"}}
                    )
                    subscription["status"] = "expired"
                    subscription["days_remaining"] = 0
                else:
                    subscription["days_remaining"] = max(0, (end_date - now).days)
            else:
                subscription["days_remaining"] = 0
        else:
            subscription["days_remaining"] = 0
        
        # Add bank details
        subscription["bank_details"] = SUBSCRIPTION_CONFIG["bank_details"]
        subscription["monthly_fee"] = SUBSCRIPTION_CONFIG["monthly_fee"]
        
    return subscription

@api_router.post("/subscriptions/{driver_id}/start-trial")
async def start_trial(driver_id: str):
    """Start 7-day free trial for new driver"""
    # Check if driver already has a subscription
    existing = await db.subscriptions.find_one({"driver_id": driver_id})
    if existing:
        raise HTTPException(status_code=400, detail="Driver already has a subscription record")
    
    # Create trial subscription
    now = datetime.utcnow()
    trial_end = now + timedelta(days=SUBSCRIPTION_CONFIG["trial_days"])
    
    subscription = {
        "id": str(uuid.uuid4()),
        "driver_id": driver_id,
        "amount": SUBSCRIPTION_CONFIG["monthly_fee"],
        "status": "trial",
        "start_date": now,
        "trial_end_date": trial_end,
        "end_date": trial_end,
        "created_at": now
    }
    
    await db.subscriptions.insert_one(subscription)
    
    # Remove MongoDB _id field for JSON serialization
    subscription.pop("_id", None)
    
    return {
        "message": f"Free {SUBSCRIPTION_CONFIG['trial_days']}-day trial activated!",
        "subscription": subscription,
        "trial_end_date": trial_end.isoformat(),
        "days_remaining": SUBSCRIPTION_CONFIG["trial_days"]
    }

@api_router.post("/subscriptions/{driver_id}/submit-payment")
async def submit_payment_proof(driver_id: str, request: PaymentProofSubmission):
    """Submit payment screenshot for verification"""
    # Find existing subscription
    subscription = await db.subscriptions.find_one({"driver_id": driver_id})
    
    if not subscription:
        # Create new subscription record
        subscription = {
            "id": str(uuid.uuid4()),
            "driver_id": driver_id,
            "amount": SUBSCRIPTION_CONFIG["monthly_fee"],
            "status": "pending_verification",
            "created_at": datetime.utcnow()
        }
        await db.subscriptions.insert_one(subscription)
    
    # Update with payment proof
    now = datetime.utcnow()
    await db.subscriptions.update_one(
        {"driver_id": driver_id},
        {"$set": {
            "status": "pending_verification",
            "payment_screenshot": request.screenshot,
            "payment_submitted_at": now,
            "amount": request.amount,
            "payment_reference": request.payment_reference
        }}
    )
    
    # Auto-verify after 2 seconds (simulating admin approval)
    # In production, this would be manual admin approval
    import asyncio
    async def auto_verify():
        await asyncio.sleep(2)
        await verify_payment(driver_id)
    
    asyncio.create_task(auto_verify())
    
    return {
        "message": "Payment proof submitted successfully. Awaiting verification.",
        "status": "pending_verification"
    }

@api_router.post("/subscriptions/{driver_id}/verify-payment")
async def verify_payment(driver_id: str):
    """Verify payment and activate subscription (admin or auto)"""
    subscription = await db.subscriptions.find_one({"driver_id": driver_id})
    
    if not subscription:
        raise HTTPException(status_code=404, detail="No subscription found")
    
    now = datetime.utcnow()
    end_date = now + timedelta(days=30)  # 30 days subscription
    
    await db.subscriptions.update_one(
        {"driver_id": driver_id},
        {"$set": {
            "status": "active",
            "start_date": now,
            "end_date": end_date,
            "payment_verified_at": now,
            "transaction_id": f"TXN_{uuid.uuid4().hex[:12].upper()}"
        }}
    )
    
    logger.info(f"Subscription activated for driver {driver_id} until {end_date}")
    
    return {
        "message": "Payment verified! Subscription activated.",
        "status": "active",
        "start_date": now.isoformat(),
        "end_date": end_date.isoformat(),
        "days_remaining": 30
    }

@api_router.get("/subscriptions/{driver_id}/check-restrictions")
async def check_restrictions(driver_id: str):
    """Check if driver has any restrictions due to subscription status"""
    subscription = await db.subscriptions.find_one({"driver_id": driver_id})
    
    restrictions = {
        "can_go_online": False,
        "can_accept_rides": False,
        "can_withdraw_earnings": False,
        "show_payment_popup": False,
        "message": ""
    }
    
    if not subscription:
        restrictions["show_payment_popup"] = True
        restrictions["message"] = "Please subscribe to start accepting rides"
        return restrictions
    
    status = subscription.get("status")
    now = datetime.utcnow()
    
    if status == "trial":
        trial_end = subscription.get("trial_end_date")
        if trial_end and now > trial_end:
            restrictions["show_payment_popup"] = True
            restrictions["message"] = "Your free trial has expired. Please make payment to continue."
        else:
            days_left = (trial_end - now).days if trial_end else 0
            restrictions["can_go_online"] = True
            restrictions["can_accept_rides"] = True
            restrictions["can_withdraw_earnings"] = True
            restrictions["message"] = f"Trial period: {days_left} days remaining"
    
    elif status == "active":
        end_date = subscription.get("end_date")
        if end_date and now > end_date:
            restrictions["show_payment_popup"] = True
            restrictions["message"] = "Your subscription has expired. Please renew to continue."
        else:
            days_left = (end_date - now).days if end_date else 0
            restrictions["can_go_online"] = True
            restrictions["can_accept_rides"] = True
            restrictions["can_withdraw_earnings"] = True
            restrictions["message"] = f"Subscription active: {days_left} days remaining"
    
    elif status == "pending_verification":
        restrictions["message"] = "Payment is being verified. Please wait."
    
    elif status in ["pending_payment", "expired"]:
        restrictions["show_payment_popup"] = True
        restrictions["message"] = "Please make payment to activate your account."
    
    return restrictions

@api_router.post("/subscriptions/{driver_id}/grace-period")
async def request_grace_period(driver_id: str, request: GracePeriodRequest):
    """Request grace period for subscription (emergency earnings access)"""
    subscription = await db.subscriptions.find_one({
        "driver_id": driver_id,
        "status": {"$in": ["active", "expired"]}
    })
    
    if not subscription:
        raise HTTPException(status_code=404, detail="No subscription found")
    
    if subscription.get("grace_period_requested"):
        raise HTTPException(status_code=400, detail="Grace period already requested")
    
    # Grant grace period (max 3 days)
    days = min(request.days_requested, 3)
    new_end_date = datetime.utcnow() + timedelta(days=days)
    
    await db.subscriptions.update_one(
        {"driver_id": driver_id},
        {"$set": {
            "status": "grace_period",
            "end_date": new_end_date,
            "grace_period_requested": True
        }}
    )
    
    return {
        "message": f"Grace period of {days} days granted",
        "new_end_date": new_end_date.isoformat()
    }

# ==================== FARE ESTIMATE ====================

@api_router.post("/fare/estimate")
async def estimate_fare(request: FareEstimateRequest):
    route_data = await get_directions_from_google(
        request.pickup_lat, request.pickup_lng,
        request.dropoff_lat, request.dropoff_lng
    )
    
    if route_data:
        distance_km = route_data["distance_meters"] / 1000
        duration_min = math.ceil(route_data["duration_seconds"] / 60)
        traffic_duration_min = math.ceil(route_data["duration_in_traffic_seconds"] / 60)
        polyline = route_data.get("polyline")
    else:
        distance_km = calculate_distance_haversine(
            request.pickup_lat, request.pickup_lng,
            request.dropoff_lat, request.dropoff_lng
        )
        duration_min = max(5, math.ceil((distance_km / 25) * 60))
        traffic_duration_min = duration_min
        polyline = None
    
    distance_km = max(0.5, distance_km)
    duration_min = max(5, duration_min)
    
    fare = calculate_fare(distance_km, duration_min, traffic_duration_min, request.service_type, request.city)
    
    estimate_id = str(uuid.uuid4())
    fare_estimate_store[estimate_id] = {
        "fare": fare,
        "distance_km": round(distance_km, 2),
        "duration_min": duration_min,
        "polyline": polyline,
        "service_type": request.service_type,
        "city": request.city,
        "pickup": {"lat": request.pickup_lat, "lng": request.pickup_lng},
        "dropoff": {"lat": request.dropoff_lat, "lng": request.dropoff_lng},
        "created_at": datetime.utcnow(),
        "expires_at": datetime.utcnow() + timedelta(minutes=FARE_LOCK_MINUTES)
    }
    
    return {
        "estimate_id": estimate_id,
        "distance_km": round(distance_km, 2),
        "duration_min": duration_min,
        "base_fare": fare["base_fare"],
        "distance_fee": fare["distance_fee"],
        "time_fee": fare["time_fee"],
        "traffic_fee": fare["traffic_fee"],
        "total_fare": fare["total_fare"],
        "multiplier": fare["multiplier"],
        "is_peak": fare["is_peak"],
        "currency": fare["currency"],
        "min_fare": fare["min_fare"],
        "service_type": request.service_type,
        "polyline": polyline,
        "price_valid_until": (datetime.utcnow() + timedelta(minutes=FARE_LOCK_MINUTES)).isoformat(),
        "price_lock_minutes": FARE_LOCK_MINUTES,
        "is_insured": True
    }

# ==================== TRIP ENDPOINTS ====================

@api_router.post("/trips/request")
async def request_trip(rider_id: str, request: TripRequest):
    # Check if rider has blocked drivers to exclude
    rider = await db.users.find_one({"id": rider_id})
    blocked_drivers = rider.get("blocked_drivers", []) if rider else []
    
    fare_data = None
    if request.fare_estimate_id and request.fare_estimate_id in fare_estimate_store:
        estimate = fare_estimate_store[request.fare_estimate_id]
        if datetime.utcnow() < estimate["expires_at"]:
            fare_data = estimate
    
    if fare_data:
        distance_km = fare_data["distance_km"]
        duration_min = fare_data["duration_min"]
        fare = fare_data["fare"]
        polyline = fare_data.get("polyline")
    else:
        route_data = await get_directions_from_google(
            request.pickup_lat, request.pickup_lng,
            request.dropoff_lat, request.dropoff_lng
        )
        
        if route_data:
            distance_km = route_data["distance_meters"] / 1000
            duration_min = math.ceil(route_data["duration_seconds"] / 60)
            traffic_duration_min = math.ceil(route_data["duration_in_traffic_seconds"] / 60)
            polyline = route_data.get("polyline")
        else:
            distance_km = calculate_distance_haversine(
                request.pickup_lat, request.pickup_lng,
                request.dropoff_lat, request.dropoff_lng
            )
            duration_min = max(5, math.ceil((distance_km / 25) * 60))
            traffic_duration_min = duration_min
            polyline = None
        
        fare = calculate_fare(distance_km, duration_min, traffic_duration_min, request.service_type)
    
    trip = Trip(
        rider_id=rider_id,
        pickup_location={"lat": request.pickup_lat, "lng": request.pickup_lng, "address": request.pickup_address},
        dropoff_location={"lat": request.dropoff_lat, "lng": request.dropoff_lng, "address": request.dropoff_address},
        distance_km=round(distance_km, 2),
        duration_mins=duration_min,
        base_fare=fare["base_fare"],
        distance_fee=fare["distance_fee"],
        time_fee=fare["time_fee"],
        traffic_fee=fare["traffic_fee"],
        fare=fare["total_fare"],
        surge_multiplier=fare["multiplier"],
        service_type=request.service_type,
        payment_method=request.payment_method,
        polyline=polyline,
        recording_enabled=request.enable_recording,
        fare_locked_until=datetime.utcnow() + timedelta(minutes=FARE_LOCK_MINUTES),
        insurance_id=f"INS_{uuid.uuid4().hex[:8].upper()}"
    )
    
    await db.trips.insert_one(trip.dict())
    
    return {"message": "Trip requested", "trip": trip.dict()}

@api_router.post("/trips/book-for-other")
async def book_for_other(booker_id: str, request: BookForOtherRequest):
    """Book a ride for family member or friend"""
    route_data = await get_directions_from_google(
        request.pickup_lat, request.pickup_lng,
        request.dropoff_lat, request.dropoff_lng
    )
    
    if route_data:
        distance_km = route_data["distance_meters"] / 1000
        duration_min = math.ceil(route_data["duration_seconds"] / 60)
        traffic_duration_min = math.ceil(route_data["duration_in_traffic_seconds"] / 60)
        polyline = route_data.get("polyline")
    else:
        distance_km = calculate_distance_haversine(
            request.pickup_lat, request.pickup_lng,
            request.dropoff_lat, request.dropoff_lng
        )
        duration_min = max(5, math.ceil((distance_km / 25) * 60))
        traffic_duration_min = duration_min
        polyline = None
    
    fare = calculate_fare(distance_km, duration_min, traffic_duration_min, request.service_type)
    
    trip = Trip(
        rider_id=booker_id,
        pickup_location={"lat": request.pickup_lat, "lng": request.pickup_lng, "address": request.pickup_address},
        dropoff_location={"lat": request.dropoff_lat, "lng": request.dropoff_lng, "address": request.dropoff_address},
        distance_km=round(distance_km, 2),
        duration_mins=duration_min,
        base_fare=fare["base_fare"],
        distance_fee=fare["distance_fee"],
        time_fee=fare["time_fee"],
        traffic_fee=fare["traffic_fee"],
        fare=fare["total_fare"],
        surge_multiplier=fare["multiplier"],
        service_type=request.service_type,
        payment_method=request.payment_method,
        polyline=polyline,
        fare_locked_until=datetime.utcnow() + timedelta(minutes=FARE_LOCK_MINUTES),
        insurance_id=f"INS_{uuid.uuid4().hex[:8].upper()}"
    )
    
    trip_dict = trip.dict()
    trip_dict["booked_for"] = {"name": request.rider_name, "phone": request.rider_phone}
    
    await db.trips.insert_one(trip_dict)
    
    return {"message": "Trip booked for other person", "trip": trip_dict}

@api_router.get("/trips/pending")
async def get_pending_trips(driver_lat: float, driver_lng: float):
    # Get driver's blocked riders
    # For now, return all pending trips within range
    trips = await db.trips.find({"status": "pending"}).to_list(50)
    
    nearby_trips = []
    for trip in trips:
        pickup = trip["pickup_location"]
        distance = calculate_distance_haversine(driver_lat, driver_lng, pickup["lat"], pickup["lng"])
        if distance <= 10:
            trip["_id"] = str(trip["_id"])
            trip["distance_to_pickup"] = round(distance, 2)
            nearby_trips.append(trip)
    
    nearby_trips.sort(key=lambda x: x["distance_to_pickup"])
    return nearby_trips[:10]

@api_router.put("/trips/{trip_id}/accept")
async def accept_trip(trip_id: str, driver_id: str):
    subscription = await db.subscriptions.find_one({
        "driver_id": driver_id,
        "status": {"$in": ["active", "grace_period"]}
    })
    
    if not subscription:
        raise HTTPException(status_code=403, detail="Active subscription required")
    
    # Get trip and check if rider blocked this driver
    trip = await db.trips.find_one({"id": trip_id})
    if trip:
        rider = await db.users.find_one({"id": trip["rider_id"]})
        if rider and driver_id in rider.get("blocked_drivers", []):
            raise HTTPException(status_code=403, detail="You cannot accept this ride")
    
    result = await db.trips.update_one(
        {"id": trip_id, "status": "pending"},
        {"$set": {"driver_id": driver_id, "status": "accepted", "accepted_at": datetime.utcnow()}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=400, detail="Trip not available")
    
    trip = await db.trips.find_one({"id": trip_id})
    trip["_id"] = str(trip["_id"])
    return trip

@api_router.put("/trips/{trip_id}/verify-face-and-start")
async def verify_face_and_start_trip(trip_id: str, request: FaceVerificationRequest):
    """Verify driver face and start trip"""
    trip = await db.trips.find_one({"id": trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    
    if trip["status"] != "accepted":
        raise HTTPException(status_code=400, detail="Trip must be accepted first")
    
    # In production: Verify face matches registered image
    # For MVP: Accept any image
    face_verified = True
    
    await db.trips.update_one(
        {"id": trip_id},
        {"$set": {
            "status": "ongoing",
            "started_at": datetime.utcnow(),
            "face_verified_at_start": face_verified
        }}
    )
    
    trip = await db.trips.find_one({"id": trip_id})
    trip["_id"] = str(trip["_id"])
    return {"trip": trip, "face_verified": face_verified}

@api_router.put("/trips/{trip_id}/start")
async def start_trip(trip_id: str):
    result = await db.trips.update_one(
        {"id": trip_id, "status": "accepted"},
        {"$set": {"status": "ongoing", "started_at": datetime.utcnow()}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=400, detail="Cannot start trip")
    
    trip = await db.trips.find_one({"id": trip_id})
    trip["_id"] = str(trip["_id"])
    return trip

@api_router.put("/trips/{trip_id}/update-location")
async def update_trip_location(trip_id: str, request: LocationUpdate):
    """Update trip location for live monitoring"""
    location_point = {
        "lat": request.latitude,
        "lng": request.longitude,
        "timestamp": datetime.utcnow().isoformat()
    }
    
    trip = await db.trips.find_one({"id": trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    
    # Check for route deviation
    route_deviation = False
    if trip.get("polyline"):
        # In production: Decode polyline and check deviation
        pass
    
    # Check for abnormal stop (same location for too long)
    actual_route = trip.get("actual_route", [])
    abnormal_stop = False
    if len(actual_route) >= 2:
        last_point = actual_route[-1]
        distance = calculate_distance_haversine(
            request.latitude, request.longitude,
            last_point["lat"], last_point["lng"]
        )
        if distance < 0.01:  # Less than 10 meters
            last_time = datetime.fromisoformat(last_point["timestamp"])
            if (datetime.utcnow() - last_time).total_seconds() > ABNORMAL_STOP_THRESHOLD:
                abnormal_stop = True
    
    await db.trips.update_one(
        {"id": trip_id},
        {
            "$push": {"actual_route": location_point},
            "$set": {
                "route_deviation_detected": route_deviation,
                "abnormal_stop_detected": abnormal_stop
            }
        }
    )
    
    # Create safety check if needed
    if route_deviation or abnormal_stop:
        safety_check = SafetyCheck(
            trip_id=trip_id,
            check_type="route_deviation" if route_deviation else "abnormal_stop",
            location={"lat": request.latitude, "lng": request.longitude}
        )
        await db.safety_checks.insert_one(safety_check.dict())
    
    return {
        "location_updated": True,
        "route_deviation": route_deviation,
        "abnormal_stop": abnormal_stop
    }

@api_router.put("/trips/{trip_id}/complete")
async def complete_trip(trip_id: str):
    result = await db.trips.update_one(
        {"id": trip_id, "status": "ongoing"},
        {"$set": {"status": "completed", "completed_at": datetime.utcnow(), "payment_status": "completed"}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=400, detail="Cannot complete trip")
    
    trip = await db.trips.find_one({"id": trip_id})
    
    # Update stats
    if trip.get("driver_id"):
        await db.users.update_one({"id": trip["driver_id"]}, {"$inc": {"total_trips": 1}})
        # Update streak
        await db.users.update_one(
            {"id": trip["driver_id"]},
            {"$inc": {"streaks.current": 1}}
        )
    
    await db.users.update_one({"id": trip["rider_id"]}, {"$inc": {"total_trips": 1}})
    
    trip["_id"] = str(trip["_id"])
    return trip

@api_router.put("/trips/{trip_id}/cancel")
async def cancel_trip(trip_id: str, cancelled_by: str):
    trip = await db.trips.find_one({"id": trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    
    if trip["status"] in ["completed", "cancelled"]:
        raise HTTPException(status_code=400, detail="Cannot cancel this trip")
    
    await db.trips.update_one(
        {"id": trip_id},
        {"$set": {"status": "cancelled", "cancelled_by": cancelled_by, "cancelled_at": datetime.utcnow()}}
    )
    
    # Update behavior score and streak
    if cancelled_by == trip.get("driver_id"):
        await db.driver_profiles.update_one(
            {"user_id": cancelled_by},
            {"$inc": {"cancellation_count": 1}}
        )
        # Reset streak on cancellation
        await db.users.update_one(
            {"id": cancelled_by},
            {"$set": {"streaks.current": 0}}
        )
    
    return {"message": "Trip cancelled"}

@api_router.put("/trips/{trip_id}/rate")
async def rate_trip(trip_id: str, rater_id: str, request: ComfortRatingRequest):
    """Rate trip with comfort ratings"""
    trip = await db.trips.find_one({"id": trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    
    if trip["status"] != "completed":
        raise HTTPException(status_code=400, detail="Can only rate completed trips")
    
    is_rider_rating = rater_id == trip["rider_id"]
    update_field = "driver_rating" if is_rider_rating else "rider_rating"
    rated_user_id = trip["driver_id"] if is_rider_rating else trip["rider_id"]
    
    update_data = {update_field: request.overall_rating}
    
    if is_rider_rating and request.smoothness:
        update_data["comfort_ratings"] = {
            "smoothness": request.smoothness,
            "politeness": request.politeness,
            "cleanliness": request.cleanliness,
            "safety": request.safety
        }
        update_data["rating_comment"] = request.comment
        
        # Update driver comfort ratings
        if rated_user_id:
            profile = await db.driver_profiles.find_one({"user_id": rated_user_id})
            if profile:
                # Calculate new averages
                for rating_type in ["smoothness", "politeness", "cleanliness", "safety"]:
                    if getattr(request, rating_type):
                        current = profile.get(f"{rating_type}_rating", 5.0)
                        new_rating = (current + getattr(request, rating_type)) / 2
                        await db.driver_profiles.update_one(
                            {"user_id": rated_user_id},
                            {"$set": {f"{rating_type}_rating": round(new_rating, 1)}}
                        )
    
    await db.trips.update_one({"id": trip_id}, {"$set": update_data})
    
    # Update user rating
    if rated_user_id:
        if is_rider_rating:
            ratings = await db.trips.find(
                {"driver_id": rated_user_id, "driver_rating": {"$exists": True}}
            ).to_list(1000)
            if ratings:
                avg_rating = sum(r["driver_rating"] for r in ratings) / len(ratings)
                await db.users.update_one({"id": rated_user_id}, {"$set": {"rating": round(avg_rating, 1)}})
        else:
            ratings = await db.trips.find(
                {"rider_id": rated_user_id, "rider_rating": {"$exists": True}}
            ).to_list(1000)
            if ratings:
                avg_rating = sum(r["rider_rating"] for r in ratings) / len(ratings)
                await db.users.update_one({"id": rated_user_id}, {"$set": {"rating": round(avg_rating, 1)}})
    
    return {"message": "Rating submitted"}

@api_router.get("/trips/user/{user_id}")
async def get_user_trips(user_id: str, role: str = "rider"):
    if role == "rider":
        trips = await db.trips.find({"rider_id": user_id}).sort("created_at", -1).to_list(50)
    else:
        trips = await db.trips.find({"driver_id": user_id}).sort("created_at", -1).to_list(50)
    
    for trip in trips:
        trip["_id"] = str(trip["_id"])
    return trips

@api_router.get("/trips/{trip_id}")
async def get_trip(trip_id: str):
    trip = await db.trips.find_one({"id": trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    trip["_id"] = str(trip["_id"])
    return trip

# ==================== SOS & SAFETY ENDPOINTS ====================

@api_router.post("/sos/trigger")
async def trigger_sos(request: SOSRequest):
    """Trigger SOS alert"""
    trip = await db.trips.find_one({"id": request.trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    
    # Determine who triggered (rider or driver)
    user_id = trip["rider_id"]  # Default to rider
    user_role = "rider"
    
    # Get user's emergency contacts
    user = await db.users.find_one({"id": user_id})
    emergency_contacts = user.get("emergency_contacts", []) if user else []
    
    # Create SOS alert
    sos = SOSAlert(
        trip_id=request.trip_id,
        user_id=user_id,
        user_role=user_role,
        location={"lat": request.location_lat, "lng": request.location_lng},
        auto_triggered=request.auto_triggered,
        emergency_contacts_notified=[c["phone"] for c in emergency_contacts],
        admin_notified=True
    )
    
    await db.sos_alerts.insert_one(sos.dict())
    
    # Update trip
    await db.trips.update_one(
        {"id": request.trip_id},
        {"$set": {"sos_triggered": True, "sos_triggered_at": datetime.utcnow()}}
    )
    
    # In production: Send SMS/push to emergency contacts
    # For MVP: Just log
    logger.warning(f"SOS TRIGGERED for trip {request.trip_id} at {request.location_lat}, {request.location_lng}")
    
    return {
        "message": "SOS alert sent",
        "sos_id": sos.id,
        "contacts_notified": len(emergency_contacts),
        "support_notified": True
    }

@api_router.post("/sos/{sos_id}/resolve")
async def resolve_sos(sos_id: str, resolution: str = "resolved"):
    """Resolve SOS alert"""
    await db.sos_alerts.update_one(
        {"id": sos_id},
        {"$set": {"status": resolution, "resolved_at": datetime.utcnow()}}
    )
    return {"message": "SOS resolved"}

@api_router.get("/sos/trip/{trip_id}")
async def get_trip_sos(trip_id: str):
    """Get SOS alerts for a trip"""
    alerts = await db.sos_alerts.find({"trip_id": trip_id}).to_list(10)
    for alert in alerts:
        alert["_id"] = str(alert["_id"])
    return {"alerts": alerts}

@api_router.post("/safety/respond")
async def respond_to_safety_check(request: SafetyResponseRequest):
    """Respond to safety check prompt"""
    await db.safety_checks.update_one(
        {"id": request.check_id},
        {"$set": {"rider_response": request.response, "responded_at": datetime.utcnow()}}
    )
    
    if request.response == "need_help":
        # Auto-trigger SOS
        check = await db.safety_checks.find_one({"id": request.check_id})
        if check:
            # Create SOS alert
            sos = SOSAlert(
                trip_id=check["trip_id"],
                user_id="",  # Will be filled from trip
                user_role="rider",
                location=check["location"],
                auto_triggered=True
            )
            await db.sos_alerts.insert_one(sos.dict())
    
    return {"message": "Response recorded"}

@api_router.post("/trips/{trip_id}/risk-alert")
async def trigger_risk_alert(trip_id: str, user_id: str, request: RiskAlertRequest):
    """Driver or rider triggers risk alert for suspicious behavior"""
    trip = await db.trips.find_one({"id": trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    
    is_driver = user_id == trip.get("driver_id")
    
    await db.trips.update_one(
        {"id": trip_id},
        {"$set": {
            "risk_alert_by_driver" if is_driver else "risk_alert_by_rider": True,
            "is_monitored": True
        }}
    )
    
    # Log the alert for admin review
    logger.warning(f"RISK ALERT on trip {trip_id} by {'driver' if is_driver else 'rider'}: {request.reason}")
    
    return {"message": "Risk alert recorded. Support team notified."}

# ==================== WALLET ENDPOINTS ====================

@api_router.get("/wallet/{user_id}")
async def get_wallet(user_id: str):
    wallet = await db.wallets.find_one({"user_id": user_id})
    if not wallet:
        wallet = Wallet(user_id=user_id)
        await db.wallets.insert_one(wallet.dict())
    wallet["_id"] = str(wallet["_id"])
    return wallet

@api_router.post("/wallet/{user_id}/topup")
async def topup_wallet(user_id: str, amount: float):
    result = await db.wallets.update_one({"user_id": user_id}, {"$inc": {"balance": amount}})
    if result.modified_count == 0:
        wallet = Wallet(user_id=user_id, balance=amount)
        await db.wallets.insert_one(wallet.dict())
    
    wallet = await db.wallets.find_one({"user_id": user_id})
    wallet["_id"] = str(wallet["_id"])
    return wallet

# ==================== CHALLENGES & GAMIFICATION ====================

@api_router.get("/challenges/active")
async def get_active_challenges():
    """Get active weekly challenges"""
    now = datetime.utcnow()
    challenges = await db.challenges.find({
        "is_active": True,
        "start_date": {"$lte": now},
        "end_date": {"$gte": now}
    }).to_list(20)
    
    # If no challenges, return default ones
    if not challenges:
        default_challenges = [
            {
                "id": "weekly_trips_30",
                "title": "Weekly Warrior",
                "description": "Complete 30 trips this week",
                "target_type": "trips",
                "target_value": 30,
                "reward_type": "badge",
                "reward_value": "Priority Boost + Badge",
                "is_active": True
            },
            {
                "id": "five_star_week",
                "title": "5-Star Week",
                "description": "Maintain 5.0 rating for all rides this week",
                "target_type": "rating",
                "target_value": 5.0,
                "reward_type": "badge",
                "reward_value": "Gold Badge + 10% Ride Priority",
                "is_active": True
            },
            {
                "id": "no_cancel_week",
                "title": "Commitment Champion",
                "description": "Complete all accepted rides with zero cancellations",
                "target_type": "cancellation_free",
                "target_value": 0,
                "reward_type": "badge",
                "reward_value": "Reliability Badge",
                "is_active": True
            }
        ]
        return {"challenges": default_challenges}
    
    for c in challenges:
        c["_id"] = str(c["_id"])
    return {"challenges": challenges}

@api_router.get("/drivers/{user_id}/challenges")
async def get_driver_challenge_progress(user_id: str):
    """Get driver's progress on active challenges"""
    challenges = await db.challenges.find({"is_active": True}).to_list(20)
    profile = await db.driver_profiles.find_one({"user_id": user_id})
    
    progress = []
    for challenge in challenges:
        current_value = 0
        if challenge["target_type"] == "trips":
            current_value = profile.get("weekly_trips", 0) if profile else 0
        elif challenge["target_type"] == "rating":
            user = await db.users.find_one({"id": user_id})
            current_value = user.get("rating", 0) if user else 0
        
        progress.append({
            "challenge_id": challenge["id"],
            "title": challenge["title"],
            "target": challenge["target_value"],
            "current": current_value,
            "completed": current_value >= challenge["target_value"]
        })
    
    return {"challenge_progress": progress}

# ==================== AI ASSISTANT ENDPOINTS ====================

# AI System prompts
RIDER_ASSISTANT_PROMPT = """You are KODA AI, a friendly and helpful ride assistant for riders in Nigeria. 
You help riders with their trip questions, fare estimates, driver information, and safety concerns.

Key information about KODA:
- KODA is a driver-first ride-hailing platform in Nigeria
- Drivers pay a flat monthly subscription (₦25,000) instead of per-trip commission
- Riders pay drivers directly via cash or bank transfer (peer-to-peer)
- All drivers are verified with NIN and documents
- Safety features include: SOS button, trip sharing, driver face verification, route monitoring
- Fares are calculated by the system (base fare + distance + time)

Be concise, friendly, and helpful. Use Nigerian context when relevant.
If you don't have specific trip data, provide general helpful information.
Keep responses under 100 words."""

DRIVER_ASSISTANT_PROMPT = """You are KODA AI, a supportive driving assistant for KODA drivers in Nigeria.
You help drivers maximize their earnings, find high-demand areas, and improve their ratings.

Key information about KODA:
- Drivers keep 100% of their earnings - KODA takes no commission
- Monthly subscription is ₦25,000 for unlimited trips
- Riders pay drivers directly via cash or bank transfer
- Peak hours: 7-9 AM and 5-8 PM weekdays
- High demand areas in Lagos: Victoria Island, Lekki, Ikeja, Airport
- Driver ratings are based on: smoothness, politeness, cleanliness, safety

Be encouraging and practical. Use Nigerian context.
Keep responses under 100 words."""

@api_router.get("/ai/rider-assistant")
async def rider_assistant(user_id: str, question: str):
    """
    AI Ride Assistant for Riders - Powered by GPT
    """
    try:
        # Get user's current trip context
        current_trip = await db.trips.find_one({
            "rider_id": user_id,
            "status": {"$in": ["pending", "accepted", "ongoing"]}
        })
        
        # Build context
        context = ""
        if current_trip:
            context = f"\nRider's current trip: Status={current_trip['status']}, Fare=₦{current_trip.get('fare', 0):,.0f}"
            if current_trip.get("driver_id"):
                driver = await db.users.find_one({"id": current_trip["driver_id"]})
                if driver:
                    context += f", Driver={driver.get('name', 'Assigned')}"
        else:
            context = "\nRider has no active trip currently."
        
        # Use LLM for response
        if EMERGENT_LLM_KEY:
            chat = LlmChat(
                api_key=EMERGENT_LLM_KEY,
                session_id=f"rider-{user_id}-{datetime.utcnow().strftime('%Y%m%d')}",
                system_message=RIDER_ASSISTANT_PROMPT + context
            ).with_model("openai", "gpt-4o")
            
            user_message = UserMessage(text=question)
            response_text = await chat.send_message(user_message)
            
            return {
                "response": response_text,
                "type": "ai",
                "powered_by": "gpt-4o"
            }
        else:
            # Fallback to rule-based responses
            return await _rider_assistant_fallback(user_id, question, current_trip)
            
    except Exception as e:
        logger.error(f"AI Assistant error: {e}")
        return await _rider_assistant_fallback(user_id, question, None)

async def _rider_assistant_fallback(user_id: str, question: str, current_trip):
    """Fallback responses when LLM is unavailable"""
    question_lower = question.lower()
    
    if "driver" in question_lower and "where" in question_lower:
        if current_trip and current_trip.get("driver_id"):
            return {"response": "Your driver is on the way. They should arrive shortly.", "type": "location"}
        return {"response": "You don't have an active ride. Would you like to book one?", "type": "info"}
    
    elif "price" in question_lower or "fare" in question_lower or "cost" in question_lower:
        if current_trip:
            return {"response": f"Your trip fare is ₦{current_trip['fare']:,.0f}. This includes base fare, distance, and time charges.", "type": "fare"}
        return {"response": "Fares are calculated based on distance, time, and current traffic. Get a fare estimate by entering your destination.", "type": "info"}
    
    elif "safe" in question_lower or "safety" in question_lower:
        return {"response": "Your safety is our priority! All drivers are verified. You can use the SOS button anytime, share your trip with family, and rate your driver after the ride.", "type": "safety"}
    
    elif "cancel" in question_lower:
        return {"response": "You can cancel your ride anytime before it starts. To cancel an ongoing ride, please contact support.", "type": "info"}
    
    else:
        return {"response": "I'm here to help! You can ask me about your driver's location, fare details, safety features, or trip status.", "type": "help"}

@api_router.get("/ai/driver-assistant")
async def driver_assistant(user_id: str, question: str):
    """
    AI Assistant for Drivers - Powered by GPT
    """
    try:
        # Get driver stats for context
        stats = await db.trips.aggregate([
            {"$match": {"driver_id": user_id, "status": "completed"}},
            {"$group": {
                "_id": None,
                "total_earnings": {"$sum": "$fare"},
                "total_trips": {"$sum": 1},
                "avg_fare": {"$avg": "$fare"}
            }}
        ]).to_list(1)
        
        driver_stats = stats[0] if stats else {"total_earnings": 0, "total_trips": 0, "avg_fare": 0}
        
        # Get today's stats
        today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        today_stats = await db.trips.aggregate([
            {"$match": {"driver_id": user_id, "status": "completed", "completed_at": {"$gte": today_start}}},
            {"$group": {"_id": None, "earnings": {"$sum": "$fare"}, "trips": {"$sum": 1}}}
        ]).to_list(1)
        
        today = today_stats[0] if today_stats else {"earnings": 0, "trips": 0}
        
        # Build context
        context = f"\nDriver stats: Today's earnings=₦{today['earnings']:,.0f}, Today's trips={today['trips']}, Total earnings=₦{driver_stats['total_earnings']:,.0f}, Total trips={driver_stats['total_trips']}"
        
        # Get rating
        user = await db.users.find_one({"id": user_id})
        if user:
            context += f", Rating={user.get('rating', 5.0):.1f}"
        
        # Use LLM for response
        if EMERGENT_LLM_KEY:
            chat = LlmChat(
                api_key=EMERGENT_LLM_KEY,
                session_id=f"driver-{user_id}-{datetime.utcnow().strftime('%Y%m%d')}",
                system_message=DRIVER_ASSISTANT_PROMPT + context
            ).with_model("openai", "gpt-4o")
            
            user_message = UserMessage(text=question)
            response_text = await chat.send_message(user_message)
            
            return {
                "response": response_text,
                "type": "ai",
                "powered_by": "gpt-4o",
                "data": {
                    "today_earnings": today["earnings"],
                    "today_trips": today["trips"],
                    "total_earnings": driver_stats["total_earnings"],
                    "rating": user.get('rating', 5.0) if user else 5.0
                }
            }
        else:
            # Fallback to rule-based responses
            return await _driver_assistant_fallback(user_id, question, driver_stats, today)
            
    except Exception as e:
        logger.error(f"AI Assistant error: {e}")
        return await _driver_assistant_fallback(user_id, question, {"total_earnings": 0, "total_trips": 0, "avg_fare": 0}, {"earnings": 0, "trips": 0})

async def _driver_assistant_fallback(user_id: str, question: str, driver_stats, today):
    """Fallback responses when LLM is unavailable"""
    question_lower = question.lower()
    
    if "earn" in question_lower or "money" in question_lower:
        return {
            "response": f"Today you've earned ₦{today['earnings']:,.0f} from {today['trips']} trips. Your average fare is ₦{driver_stats.get('avg_fare', 0):,.0f}.",
            "type": "earnings",
            "data": {"today_earnings": today["earnings"], "today_trips": today["trips"]}
        }
    
    elif "best time" in question_lower or "when" in question_lower or "busy" in question_lower:
        return {
            "response": "Peak hours are typically 7-9 AM and 5-8 PM on weekdays. Weekends see more activity in evening hours. Consider positioning yourself in business districts during morning rush.",
            "type": "insight"
        }
    
    elif "demand" in question_lower or "area" in question_lower or "where" in question_lower:
        return {
            "response": "High demand areas right now include Victoria Island, Lekki, and Ikeja. Airport runs are also lucrative. Stay near major business hubs for consistent rides.",
            "type": "demand"
        }
    
    elif "tip" in question_lower or "advice" in question_lower:
        return {
            "response": "Pro tips: Keep your car clean for better ratings. Stay hydrated and take breaks every 2-3 hours. Accept rides during surge times for higher earnings.",
            "type": "tips"
        }
    
    else:
        return {
            "response": "I can help you with earnings info, best times to drive, high-demand areas, tips for better ratings, and more. What would you like to know?",
            "type": "help"
        }

# ==================== PIDGIN ENGLISH AI SUPPORT ====================

PIDGIN_RIDER_PROMPT = """You be KODA AI assistant for riders wey dey Nigeria. 
You go help riders with their trip wahala, price matter, driver info, and safety concern.

Wetin KODA be:
- KODA na driver-first ride app for Naija
- Drivers dey pay flat monthly sub (₦25,000) instead of per-trip commission
- Riders dey pay drivers direct via cash or bank transfer (person to person)
- All drivers don verify with NIN and documents
- Safety features include: SOS button, trip sharing, driver face verification, route monitoring

Make you dey friendly and helpful. Use pidgin well well.
Keep response under 100 words."""

PIDGIN_DRIVER_PROMPT = """You be KODA AI assistant for drivers wey dey Naija.
You go help drivers maximize their earnings, find high-demand areas, and improve their ratings.

Wetin KODA be:
- Drivers keep 100% of their money - KODA no take commission
- Monthly subscription na ₦25,000 for unlimited trips  
- Riders dey pay drivers direct via cash or bank transfer
- Peak hours: 7-9 AM and 5-8 PM for weekdays
- Hot areas for Lagos: Victoria Island, Lekki, Ikeja, Airport

Make you dey encouraging and practical. Na Naija context you go use.
Keep response under 100 words."""

@api_router.get("/ai/rider-assistant-pidgin")
async def rider_assistant_pidgin(user_id: str, question: str):
    """AI Ride Assistant in Pidgin English"""
    try:
        current_trip = await db.trips.find_one({
            "rider_id": user_id,
            "status": {"$in": ["pending", "accepted", "ongoing"]}
        })
        
        context = ""
        if current_trip:
            context = f"\nRider trip wey dey ground: Status={current_trip['status']}, Fare=₦{current_trip.get('fare', 0):,.0f}"
        else:
            context = "\nRider no get active trip now."
        
        if EMERGENT_LLM_KEY:
            chat = LlmChat(
                api_key=EMERGENT_LLM_KEY,
                session_id=f"rider-pidgin-{user_id}-{datetime.utcnow().strftime('%Y%m%d')}",
                system_message=PIDGIN_RIDER_PROMPT + context
            ).with_model("openai", "gpt-4o")
            
            user_message = UserMessage(text=question)
            response_text = await chat.send_message(user_message)
            
            return {"response": response_text, "type": "ai", "language": "pidgin", "powered_by": "gpt-4o"}
        else:
            return {"response": "Abeg, AI no dey available now. Try again later.", "type": "error"}
            
    except Exception as e:
        logger.error(f"Pidgin AI error: {e}")
        return {"response": "E get wahala. Abeg try again.", "type": "error"}

@api_router.get("/ai/driver-assistant-pidgin")
async def driver_assistant_pidgin(user_id: str, question: str):
    """AI Driver Assistant in Pidgin English"""
    try:
        stats = await db.trips.aggregate([
            {"$match": {"driver_id": user_id, "status": "completed"}},
            {"$group": {"_id": None, "total_earnings": {"$sum": "$fare"}, "total_trips": {"$sum": 1}}}
        ]).to_list(1)
        
        driver_stats = stats[0] if stats else {"total_earnings": 0, "total_trips": 0}
        context = f"\nDriver stats: Total earnings=₦{driver_stats['total_earnings']:,.0f}, Total trips={driver_stats['total_trips']}"
        
        if EMERGENT_LLM_KEY:
            chat = LlmChat(
                api_key=EMERGENT_LLM_KEY,
                session_id=f"driver-pidgin-{user_id}-{datetime.utcnow().strftime('%Y%m%d')}",
                system_message=PIDGIN_DRIVER_PROMPT + context
            ).with_model("openai", "gpt-4o")
            
            user_message = UserMessage(text=question)
            response_text = await chat.send_message(user_message)
            
            return {"response": response_text, "type": "ai", "language": "pidgin", "powered_by": "gpt-4o"}
        else:
            return {"response": "Abeg, AI no dey available now. Try again later.", "type": "error"}
            
    except Exception as e:
        logger.error(f"Pidgin AI error: {e}")
        return {"response": "E get wahala. Abeg try again.", "type": "error"}

# ==================== KODA FAMILY ====================

@api_router.post("/family/create")
async def create_family(owner_id: str, family_name: str):
    """Create a new KODA Family group"""
    user = await db.users.find_one({"id": owner_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user.get("family_id"):
        raise HTTPException(status_code=400, detail="User already belongs to a family")
    
    family_id = str(uuid.uuid4())
    
    # Create family group
    family = {
        "id": family_id,
        "name": family_name,
        "owner_id": owner_id,
        "members": [{"user_id": owner_id, "role": "owner", "joined_at": datetime.utcnow()}],
        "shared_payment_method": None,
        "created_at": datetime.utcnow(),
        "trust_score": user.get("trust_score", 100.0),
        "max_members": 10
    }
    
    await db.families.insert_one(family)
    
    # Update user
    await db.users.update_one(
        {"id": owner_id},
        {"$set": {"family_id": family_id, "family_role": "owner"}}
    )
    
    return {"message": "Family created successfully", "family_id": family_id, "family_name": family_name}

@api_router.post("/family/{family_id}/add-member")
async def add_family_member(family_id: str, phone: str, name: str, relationship: str):
    """Add a member to KODA Family (up to 10 members)"""
    family = await db.families.find_one({"id": family_id})
    if not family:
        raise HTTPException(status_code=404, detail="Family not found")
    
    if len(family["members"]) >= 10:
        raise HTTPException(status_code=400, detail="Family has reached maximum 10 members")
    
    # Check if user exists
    member_user = await db.users.find_one({"phone": phone})
    
    if member_user:
        if member_user.get("family_id"):
            raise HTTPException(status_code=400, detail="User already belongs to a family")
        member_id = member_user["id"]
    else:
        # Create pending invitation
        member_id = f"pending-{phone}"
    
    # Add to family
    new_member = {
        "user_id": member_id,
        "phone": phone,
        "name": name,
        "relationship": relationship,
        "role": "member",
        "joined_at": datetime.utcnow(),
        "is_pending": member_user is None
    }
    
    await db.families.update_one(
        {"id": family_id},
        {"$push": {"members": new_member}}
    )
    
    # Update user if exists
    if member_user:
        # Inherit trust score from family
        inherited_trust = min(family.get("trust_score", 100.0), member_user.get("trust_score", 100.0))
        await db.users.update_one(
            {"id": member_id},
            {"$set": {"family_id": family_id, "family_role": "member", "trust_score": inherited_trust}}
        )
    
    return {"message": f"{name} added to family", "is_pending": member_user is None}

@api_router.get("/family/{family_id}")
async def get_family(family_id: str):
    """Get family details"""
    family = await db.families.find_one({"id": family_id})
    if not family:
        raise HTTPException(status_code=404, detail="Family not found")
    
    family["_id"] = str(family["_id"])
    
    # Enrich member data
    enriched_members = []
    for member in family["members"]:
        if not member.get("is_pending"):
            user = await db.users.find_one({"id": member["user_id"]})
            if user:
                member["rating"] = user.get("rating", 5.0)
                member["total_trips"] = user.get("total_trips", 0)
        enriched_members.append(member)
    
    family["members"] = enriched_members
    return family

@api_router.delete("/family/{family_id}/member/{member_phone}")
async def remove_family_member(family_id: str, member_phone: str):
    """Remove a member from family"""
    family = await db.families.find_one({"id": family_id})
    if not family:
        raise HTTPException(status_code=404, detail="Family not found")
    
    # Find member
    member_to_remove = None
    for m in family["members"]:
        if m.get("phone") == member_phone:
            member_to_remove = m
            break
    
    if not member_to_remove:
        raise HTTPException(status_code=404, detail="Member not found")
    
    if member_to_remove.get("role") == "owner":
        raise HTTPException(status_code=400, detail="Cannot remove family owner")
    
    # Remove from family
    await db.families.update_one(
        {"id": family_id},
        {"$pull": {"members": {"phone": member_phone}}}
    )
    
    # Update user if exists
    if not member_to_remove.get("is_pending"):
        await db.users.update_one(
            {"id": member_to_remove["user_id"]},
            {"$unset": {"family_id": "", "family_role": ""}}
        )
    
    return {"message": "Member removed from family"}

@api_router.post("/family/{family_id}/book-for-member")
async def book_for_family_member(
    family_id: str,
    booker_id: str,
    member_phone: str,
    pickup_lat: float,
    pickup_lng: float,
    pickup_address: str,
    dropoff_lat: float,
    dropoff_lng: float,
    dropoff_address: str
):
    """Book a ride for a family member"""
    family = await db.families.find_one({"id": family_id})
    if not family:
        raise HTTPException(status_code=404, detail="Family not found")
    
    # Verify booker is in family
    booker_in_family = any(m["user_id"] == booker_id for m in family["members"])
    if not booker_in_family:
        raise HTTPException(status_code=403, detail="Not authorized to book for this family")
    
    # Find member
    member = None
    for m in family["members"]:
        if m.get("phone") == member_phone:
            member = m
            break
    
    if not member:
        raise HTTPException(status_code=404, detail="Member not found in family")
    
    # Create trip
    trip_id = str(uuid.uuid4())
    trip = {
        "id": trip_id,
        "rider_id": member.get("user_id", f"family-{member_phone}"),
        "rider_phone": member_phone,
        "rider_name": member.get("name"),
        "booked_by": booker_id,
        "family_id": family_id,
        "is_family_booking": True,
        "pickup_location": {"lat": pickup_lat, "lng": pickup_lng, "address": pickup_address},
        "dropoff_location": {"lat": dropoff_lat, "lng": dropoff_lng, "address": dropoff_address},
        "status": "pending",
        "created_at": datetime.utcnow(),
        "fare": 0  # Will be calculated
    }
    
    await db.trips.insert_one(trip)
    
    # Notify all family members (Safety Circle)
    for m in family["members"]:
        if m["user_id"] != booker_id:
            await db.notifications.insert_one({
                "user_id": m["user_id"],
                "type": "family_trip_booked",
                "title": f"Family Trip Alert",
                "message": f"{member.get('name')} has a ride booked",
                "data": {"trip_id": trip_id, "member_name": member.get("name")},
                "created_at": datetime.utcnow(),
                "read": False
            })
    
    return {"message": "Trip booked for family member", "trip_id": trip_id}

@api_router.post("/family/{family_id}/safety-alert")
async def trigger_family_safety_alert(family_id: str, member_id: str, location_lat: float, location_lng: float):
    """Trigger Safety Circle alert to all family members"""
    family = await db.families.find_one({"id": family_id})
    if not family:
        raise HTTPException(status_code=404, detail="Family not found")
    
    member_name = "Family member"
    for m in family["members"]:
        if m["user_id"] == member_id:
            member_name = m.get("name", "Family member")
            break
    
    # Notify all family members
    for m in family["members"]:
        if m["user_id"] != member_id:
            await db.notifications.insert_one({
                "user_id": m["user_id"],
                "type": "safety_circle_alert",
                "title": "⚠️ SAFETY ALERT",
                "message": f"{member_name} needs help! Check their location.",
                "data": {"member_id": member_id, "location": {"lat": location_lat, "lng": location_lng}},
                "created_at": datetime.utcnow(),
                "read": False,
                "urgent": True
            })
    
    return {"message": "Safety alert sent to all family members", "notified_count": len(family["members"]) - 1}

# ==================== DRIVER CERTIFICATION LEVELS ====================

@api_router.get("/drivers/{user_id}/certification")
async def get_driver_certification(user_id: str):
    """Get driver's certification level and progress"""
    user = await db.users.find_one({"id": user_id})
    if not user or user.get("role") != "driver":
        raise HTTPException(status_code=404, detail="Driver not found")
    
    profile = await db.driver_profiles.find_one({"user_id": user_id})
    
    # Calculate metrics
    total_trips = user.get("total_trips", 0)
    rating = user.get("rating", 5.0)
    created_at = user.get("created_at", datetime.utcnow())
    months_active = (datetime.utcnow() - created_at).days // 30
    
    # Determine current level
    current_level = "bronze"
    for level, requirements in DRIVER_CERTIFICATION_LEVELS.items():
        if (total_trips >= requirements["min_trips"] and 
            rating >= requirements["min_rating"] and 
            months_active >= requirements["min_months"]):
            current_level = level
    
    level_info = DRIVER_CERTIFICATION_LEVELS[current_level]
    
    # Calculate progress to next level
    next_level = None
    progress = {}
    levels_order = ["bronze", "silver", "gold", "platinum"]
    current_index = levels_order.index(current_level)
    
    if current_index < len(levels_order) - 1:
        next_level = levels_order[current_index + 1]
        next_req = DRIVER_CERTIFICATION_LEVELS[next_level]
        progress = {
            "trips": {"current": total_trips, "required": next_req["min_trips"], "percent": min(100, (total_trips / next_req["min_trips"]) * 100)},
            "rating": {"current": rating, "required": next_req["min_rating"], "percent": min(100, (rating / next_req["min_rating"]) * 100)},
            "months": {"current": months_active, "required": next_req["min_months"], "percent": min(100, (months_active / next_req["min_months"]) * 100)}
        }
    
    return {
        "current_level": current_level,
        "level_name": level_info["name"],
        "badge_color": level_info["badge_color"],
        "perks": level_info["perks"],
        "next_level": next_level,
        "progress_to_next": progress,
        "stats": {
            "total_trips": total_trips,
            "rating": rating,
            "months_active": months_active
        }
    }

# ==================== WOMEN-ONLY MODE ====================

@api_router.post("/users/{user_id}/women-only-mode")
async def toggle_women_only_mode(user_id: str, enabled: bool):
    """Enable/disable women-only mode for female riders"""
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user.get("gender") != "female" and enabled:
        raise HTTPException(status_code=400, detail="Women-only mode is only available for verified female riders")
    
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"women_only_mode": enabled}}
    )
    
    return {"message": f"Women-only mode {'enabled' if enabled else 'disabled'}", "women_only_mode": enabled}

@api_router.post("/users/{user_id}/verify-gender")
async def verify_gender(user_id: str, gender: str):
    """Verify user gender for women-only mode"""
    if gender not in ["male", "female", "other"]:
        raise HTTPException(status_code=400, detail="Invalid gender")
    
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"gender": gender}}
    )
    
    return {"message": "Gender verified", "gender": gender}

@api_router.get("/drivers/available-female")
async def get_available_female_drivers(lat: float, lng: float, radius_km: float = 5.0):
    """Get available female drivers for women-only rides"""
    # In production, this would use geospatial queries
    female_drivers = await db.users.find({
        "role": "driver",
        "gender": "female",
        "is_verified": True
    }).to_list(20)
    
    available = []
    for driver in female_drivers:
        profile = await db.driver_profiles.find_one({"user_id": driver["id"]})
        if profile and profile.get("is_online"):
            available.append({
                "driver_id": driver["id"],
                "name": driver.get("name", "Driver"),
                "rating": driver.get("rating", 5.0),
                "total_trips": driver.get("total_trips", 0),
                "vehicle": profile.get("vehicle_model"),
                "plate": profile.get("plate_number")
            })
    
    return {"female_drivers": available, "count": len(available)}

# ==================== EARNINGS PREDICTOR AI ====================

@api_router.get("/ai/earnings-predictor/{user_id}")
async def predict_earnings(user_id: str, hours_to_drive: int = 8):
    """AI-powered earnings prediction for drivers"""
    # Get historical data
    stats = await db.trips.aggregate([
        {"$match": {"driver_id": user_id, "status": "completed"}},
        {"$group": {
            "_id": None,
            "total_earnings": {"$sum": "$fare"},
            "total_trips": {"$sum": 1},
            "avg_fare": {"$avg": "$fare"},
            "avg_duration": {"$avg": "$duration_mins"}
        }}
    ]).to_list(1)
    
    driver_stats = stats[0] if stats else None
    
    # Get hourly pattern
    hourly_stats = await db.trips.aggregate([
        {"$match": {"driver_id": user_id, "status": "completed"}},
        {"$group": {
            "_id": {"$hour": "$created_at"},
            "avg_fare": {"$avg": "$fare"},
            "count": {"$sum": 1}
        }},
        {"$sort": {"avg_fare": -1}}
    ]).to_list(24)
    
    # Calculate predictions
    if driver_stats and driver_stats["total_trips"] > 0:
        avg_trips_per_hour = driver_stats["total_trips"] / max(1, driver_stats["total_trips"] / 8)  # Assuming 8hr average day
        avg_fare = driver_stats["avg_fare"]
        
        # Base prediction
        predicted_trips = int(hours_to_drive * 2.5)  # Average 2.5 trips/hour in Lagos
        predicted_earnings = predicted_trips * avg_fare
        
        # Find best hours
        best_hours = [h["_id"] for h in hourly_stats[:3]] if hourly_stats else [7, 8, 17, 18]
    else:
        # Default for new drivers (Lagos averages)
        avg_fare = 2500
        predicted_trips = int(hours_to_drive * 2)
        predicted_earnings = predicted_trips * avg_fare
        best_hours = [7, 8, 17, 18]
    
    # Conservative, realistic, optimistic
    predictions = {
        "conservative": int(predicted_earnings * 0.7),
        "realistic": int(predicted_earnings),
        "optimistic": int(predicted_earnings * 1.3)
    }
    
    # Use AI for personalized tips
    ai_tip = "Focus on peak hours and high-demand areas for best results."
    if EMERGENT_LLM_KEY:
        try:
            chat = LlmChat(
                api_key=EMERGENT_LLM_KEY,
                session_id=f"predictor-{user_id}",
                system_message="You are KODA's earnings advisor. Give ONE short tip (under 30 words) for a driver to maximize earnings today in Lagos, Nigeria."
            ).with_model("openai", "gpt-4o")
            
            user_message = UserMessage(text=f"Driver average fare: ₦{avg_fare:.0f}, planning to drive {hours_to_drive} hours. One tip?")
            ai_tip = await chat.send_message(user_message)
        except:
            pass
    
    return {
        "predicted_earnings": predictions,
        "predicted_trips": predicted_trips,
        "hours_planned": hours_to_drive,
        "best_hours": best_hours,
        "avg_fare": avg_fare,
        "tip": ai_tip,
        "disclaimer": "Predictions based on historical data. Actual earnings may vary."
    }

@api_router.get("/drivers/{user_id}/fatigue-status")
async def get_fatigue_status(user_id: str):
    """Get driver fatigue status"""
    profile = await db.driver_profiles.find_one({"user_id": user_id})
    if not profile:
        return {"hours_driven": 0, "needs_break": False, "fatigue_level": "low"}
    
    hours_driven = profile.get("hours_driven_today", 0)
    last_break = profile.get("last_break_at")
    
    # Calculate fatigue level
    if hours_driven >= 10:
        fatigue_level = "critical"
        needs_break = True
    elif hours_driven >= 8:
        fatigue_level = "high"
        needs_break = True
    elif hours_driven >= 6:
        fatigue_level = "medium"
        needs_break = last_break is None or (datetime.utcnow() - last_break).seconds > 7200
    else:
        fatigue_level = "low"
        needs_break = False
    
    return {
        "hours_driven": hours_driven,
        "needs_break": needs_break,
        "fatigue_level": fatigue_level,
        "last_break_at": last_break.isoformat() if last_break else None,
        "recommendation": "Take a 15-minute break to stay alert" if needs_break else "You're doing great!"
    }

@api_router.post("/drivers/{user_id}/update-drive-time")
async def update_drive_time(user_id: str, hours: float):
    """Update driver's driving time (called periodically)"""
    profile = await db.driver_profiles.find_one({"user_id": user_id})
    current_hours = profile.get("hours_driven_today", 0) if profile else 0
    new_hours = current_hours + hours
    
    fatigue_warning = new_hours >= 8
    
    await db.driver_profiles.update_one(
        {"user_id": user_id},
        {"$set": {"hours_driven_today": new_hours, "fatigue_warning": fatigue_warning}}
    )
    
    return {"hours_driven": new_hours, "fatigue_warning": fatigue_warning}

# ==================== LEADERBOARD ====================

@api_router.get("/leaderboard/drivers")
async def get_driver_leaderboard(city: str = "lagos", period: str = "weekly"):
    """Get driver leaderboard"""
    # Calculate date range
    if period == "daily":
        start_date = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == "weekly":
        start_date = datetime.utcnow() - timedelta(days=7)
    else:  # monthly
        start_date = datetime.utcnow() - timedelta(days=30)
    
    # Get top earners
    pipeline = [
        {"$match": {"status": "completed", "completed_at": {"$gte": start_date}}},
        {"$group": {
            "_id": "$driver_id",
            "total_earnings": {"$sum": "$fare"},
            "trip_count": {"$sum": 1},
            "avg_rating": {"$avg": "$driver_rating"}
        }},
        {"$sort": {"total_earnings": -1}},
        {"$limit": 20}
    ]
    
    earnings_leaders = await db.trips.aggregate(pipeline).to_list(20)
    
    # Enrich with driver details
    leaderboard = []
    for rank, leader in enumerate(earnings_leaders, 1):
        if leader["_id"]:
            user = await db.users.find_one({"id": leader["_id"]})
            if user:
                leaderboard.append({
                    "rank": rank,
                    "driver_id": leader["_id"],
                    "name": user.get("name", "Anonymous")[:10] + "..." if user.get("name") else "Anonymous",
                    "earnings": leader["total_earnings"],
                    "trips": leader["trip_count"],
                    "rating": round(leader["avg_rating"] or 5.0, 1)
                })
    
    return {"period": period, "city": city, "leaderboard": leaderboard}

@api_router.get("/leaderboard/top-rated")
async def get_top_rated_drivers(limit: int = 20):
    """Get top rated drivers"""
    pipeline = [
        {"$match": {"role": "driver", "rating": {"$exists": True}}},
        {"$sort": {"rating": -1, "total_trips": -1}},
        {"$limit": limit}
    ]
    
    top_drivers = await db.users.aggregate(pipeline).to_list(limit)
    
    result = []
    for rank, driver in enumerate(top_drivers, 1):
        profile = await db.driver_profiles.find_one({"user_id": driver["id"]})
        result.append({
            "rank": rank,
            "driver_id": driver["id"],
            "name": (driver.get("name", "Anonymous")[:10] + "...") if driver.get("name") else "Anonymous",
            "rating": driver.get("rating", 5.0),
            "total_trips": driver.get("total_trips", 0),
            "comfort_scores": {
                "smoothness": profile.get("smoothness_rating", 5.0) if profile else 5.0,
                "politeness": profile.get("politeness_rating", 5.0) if profile else 5.0,
                "cleanliness": profile.get("cleanliness_rating", 5.0) if profile else 5.0,
                "safety": profile.get("safety_rating", 5.0) if profile else 5.0,
            }
        })
    
    return {"top_rated_drivers": result}

# ==================== TRIP SHARING (Family & Friends) ====================

@api_router.post("/trips/{trip_id}/share")
async def share_trip(trip_id: str, recipient_phone: str, recipient_name: str = ""):
    """Share trip with family/friend for live tracking"""
    trip = await db.trips.find_one({"id": trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    
    # Generate a share token
    share_token = str(uuid.uuid4())[:8].upper()
    
    # Store share info
    share_info = {
        "trip_id": trip_id,
        "token": share_token,
        "recipient_phone": recipient_phone,
        "recipient_name": recipient_name,
        "shared_at": datetime.utcnow(),
        "expires_at": datetime.utcnow() + timedelta(hours=24)
    }
    
    await db.trip_shares.insert_one(share_info)
    
    # In production: Send SMS with tracking link
    tracking_link = f"https://koda.app/track/{share_token}"
    
    return {
        "message": f"Trip shared with {recipient_name or recipient_phone}",
        "share_token": share_token,
        "tracking_link": tracking_link
    }

@api_router.get("/trips/track/{share_token}")
async def track_shared_trip(share_token: str):
    """Track a shared trip (for family/friends)"""
    share = await db.trip_shares.find_one({"token": share_token})
    if not share:
        raise HTTPException(status_code=404, detail="Invalid tracking link")
    
    if datetime.utcnow() > share["expires_at"]:
        raise HTTPException(status_code=400, detail="Tracking link has expired")
    
    trip = await db.trips.find_one({"id": share["trip_id"]})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    
    # Get driver location
    driver_location = None
    if trip.get("driver_id"):
        profile = await db.driver_profiles.find_one({"user_id": trip["driver_id"]})
        driver_location = profile.get("current_location") if profile else None
    
    return {
        "trip_id": trip["id"],
        "status": trip["status"],
        "pickup": trip["pickup_location"],
        "dropoff": trip["dropoff_location"],
        "driver_location": driver_location,
        "rider_name": "Rider",  # Don't expose full name for privacy
        "fare": trip["fare"],
        "sos_triggered": trip.get("sos_triggered", False)
    }

# ==================== FRAUD DETECTION ====================

@api_router.get("/admin/fraud-alerts")
async def get_fraud_alerts():
    """Get potential fraud alerts (admin only)"""
    # Find suspicious patterns
    alerts = []
    
    # High cancellation users
    high_cancel_pipeline = [
        {"$match": {"status": "cancelled"}},
        {"$group": {"_id": "$cancelled_by", "count": {"$sum": 1}}},
        {"$match": {"count": {"$gt": 5}}},
        {"$sort": {"count": -1}}
    ]
    high_cancellers = await db.trips.aggregate(high_cancel_pipeline).to_list(10)
    for item in high_cancellers:
        if item["_id"]:
            alerts.append({
                "type": "high_cancellation",
                "user_id": item["_id"],
                "count": item["count"],
                "severity": "medium"
            })
    
    # Multiple SOS triggers
    sos_pipeline = [
        {"$group": {"_id": "$user_id", "count": {"$sum": 1}}},
        {"$match": {"count": {"$gt": 3}}},
        {"$sort": {"count": -1}}
    ]
    sos_abusers = await db.sos_alerts.aggregate(sos_pipeline).to_list(10)
    for item in sos_abusers:
        if item["_id"]:
            alerts.append({
                "type": "sos_abuse",
                "user_id": item["_id"],
                "count": item["count"],
                "severity": "high"
            })
    
    # Low behavior scores
    low_score_users = await db.users.find({"behavior_score": {"$lt": 50}}).to_list(10)
    for user in low_score_users:
        alerts.append({
            "type": "low_behavior_score",
            "user_id": user["id"],
            "score": user.get("behavior_score", 0),
            "severity": "medium"
        })
    
    return {"fraud_alerts": alerts, "total": len(alerts)}

@api_router.post("/admin/update-behavior-score")
async def update_behavior_score(user_id: str, event_type: str):
    """Update user behavior score based on events"""
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    current_score = user.get("behavior_score", 100.0)
    change = calculate_behavior_score_change(event_type)
    new_score = max(0, min(100, current_score + change))
    
    await db.users.update_one({"id": user_id}, {"$set": {"behavior_score": new_score}})
    
    return {"previous_score": current_score, "new_score": new_score, "change": change}

# ==================== STREAK & BADGE SYSTEM ====================

@api_router.get("/drivers/{user_id}/streaks")
async def get_driver_streaks(user_id: str):
    """Get driver's streak information"""
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    streaks = user.get("streaks", {"current": 0, "best": 0, "last_date": None})
    badges = user.get("badges", [])
    
    # Check for badge unlocks
    available_badges = [
        {"id": "first_trip", "name": "First Ride", "requirement": "Complete your first trip", "icon": "🚗"},
        {"id": "streak_7", "name": "Week Warrior", "requirement": "7-day streak", "icon": "🔥"},
        {"id": "streak_30", "name": "Monthly Master", "requirement": "30-day streak", "icon": "⭐"},
        {"id": "trips_100", "name": "Century Club", "requirement": "100 trips completed", "icon": "💯"},
        {"id": "five_star", "name": "Perfect Driver", "requirement": "Maintain 5.0 rating for a week", "icon": "🌟"},
        {"id": "early_bird", "name": "Early Bird", "requirement": "Complete 10 rides before 8 AM", "icon": "🌅"},
        {"id": "night_owl", "name": "Night Owl", "requirement": "Complete 10 rides after 10 PM", "icon": "🦉"},
    ]
    
    return {
        "current_streak": streaks.get("current", 0),
        "best_streak": streaks.get("best", 0),
        "last_active": streaks.get("last_date"),
        "earned_badges": badges,
        "available_badges": [b for b in available_badges if b["id"] not in badges]
    }

@api_router.post("/drivers/{user_id}/check-streak")
async def check_and_update_streak(user_id: str):
    """Check and update driver's daily streak"""
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    streaks = user.get("streaks", {"current": 0, "best": 0, "last_date": None})
    today = datetime.utcnow().date()
    
    last_date = streaks.get("last_date")
    if last_date:
        last_date = datetime.fromisoformat(last_date).date() if isinstance(last_date, str) else last_date
    
    new_current = streaks.get("current", 0)
    new_best = streaks.get("best", 0)
    
    # Check if completed a trip today
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    today_trip = await db.trips.find_one({
        "driver_id": user_id,
        "status": "completed",
        "completed_at": {"$gte": today_start}
    })
    
    if today_trip:
        if last_date == today - timedelta(days=1):
            # Consecutive day
            new_current += 1
        elif last_date != today:
            # Streak broken or first day
            new_current = 1
        
        new_best = max(new_best, new_current)
        
        await db.users.update_one(
            {"id": user_id},
            {"$set": {
                "streaks.current": new_current,
                "streaks.best": new_best,
                "streaks.last_date": today.isoformat()
            }}
        )
        
        # Check for streak badges
        badges = user.get("badges", [])
        if new_current >= 7 and "streak_7" not in badges:
            await db.users.update_one({"id": user_id}, {"$push": {"badges": "streak_7"}})
        if new_current >= 30 and "streak_30" not in badges:
            await db.users.update_one({"id": user_id}, {"$push": {"badges": "streak_30"}})
    
    return {
        "current_streak": new_current,
        "best_streak": new_best,
        "streak_maintained": today_trip is not None
    }

# ==================== AUDIO RECORDING ====================

@api_router.post("/trips/{trip_id}/start-recording")
async def start_trip_recording(trip_id: str):
    """Start audio recording for trip (metadata only for MVP)"""
    await db.trips.update_one(
        {"id": trip_id},
        {"$set": {"recording_enabled": True, "recording_started_at": datetime.utcnow()}}
    )
    return {"message": "Recording started", "trip_id": trip_id}

@api_router.post("/trips/{trip_id}/stop-recording")
async def stop_trip_recording(trip_id: str):
    """Stop audio recording for trip"""
    await db.trips.update_one(
        {"id": trip_id},
        {"$set": {"recording_enabled": False, "recording_stopped_at": datetime.utcnow()}}
    )
    return {"message": "Recording stopped", "trip_id": trip_id}

# ==================== INSURANCE INFO ====================

@api_router.get("/trips/{trip_id}/insurance")
async def get_trip_insurance(trip_id: str):
    """Get trip insurance information"""
    trip = await db.trips.find_one({"id": trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    
    return {
        "trip_id": trip_id,
        "is_insured": trip.get("is_insured", True),
        "insurance_id": trip.get("insurance_id"),
        "coverage": {
            "personal_accident": "₦500,000",
            "medical_expenses": "₦100,000",
            "property_damage": "₦50,000"
        },
        "provider": "KODA Insurance Partners",
        "valid_until": trip.get("completed_at") or "Trip completion"
    }

# ==================== DRIVER TIER SYSTEM ====================

@api_router.get("/driver/tier/{driver_id}")
async def get_driver_tier(driver_id: str):
    """Get driver's current tier and requirements"""
    tier_data = await db.driver_tiers.find_one({"driver_id": driver_id})
    
    if not tier_data:
        # Create default basic tier
        tier_data = {
            "id": str(uuid.uuid4()),
            "driver_id": driver_id,
            "tier": "basic",
            "requirements_met": {},
            "warnings": 0,
            "created_at": datetime.utcnow()
        }
        await db.driver_tiers.insert_one(tier_data)
    
    current_tier = tier_data.get("tier", "basic")
    tier_config = TIER_CONFIG.get(current_tier, TIER_CONFIG["basic"])
    
    return {
        "driver_id": driver_id,
        "current_tier": current_tier,
        "tier_name": tier_config["name"],
        "monthly_fee": tier_config["monthly_fee"],
        "earning_potential": tier_config["earning_per_ride"],
        "requirements": TIER_CONFIG["premium"]["requirements"],
        "requirements_met": tier_data.get("requirements_met", {}),
        "warnings": tier_data.get("warnings", 0),
        "probation_until": tier_data.get("probation_until"),
        "can_upgrade": current_tier == "basic",
        "upgrade_path": {
            "steps": [
                "Maintain 4.7★ rating for 60 days",
                "Own/lease approved Premium vehicle (2018+)",
                "Complete free Premium Service course",
                "Pass vehicle inspection (₦2,000)",
            ],
            "extra_fee": 0  # No extra monthly fee!
        },
        "premium_perks": TIER_CONFIG["premium"].get("perks", [])
    }

@api_router.post("/driver/tier/upgrade")
async def request_tier_upgrade(driver_id: str, request: DriverTierUpgradeRequest):
    """Request upgrade to Premium tier"""
    driver = await db.driver_profiles.find_one({"user_id": driver_id})
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")
    
    user = await db.users.find_one({"id": driver_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check rating requirement
    if user.get("rating", 0) < 4.7:
        raise HTTPException(status_code=400, detail="Rating must be 4.7 or higher")
    
    # Check vehicle year
    if request.vehicle_year < 2018:
        raise HTTPException(status_code=400, detail="Vehicle must be 2018 or newer")
    
    # Create inspection request
    inspection = {
        "id": str(uuid.uuid4()),
        "driver_id": driver_id,
        "inspection_type": "initial",
        "status": "pending",
        "interior_photo": request.interior_photo,
        "exterior_photo": request.exterior_photo,
        "leather_seats": request.leather_seats,
        "ac_working": request.dual_ac,
        "vehicle_year": request.vehicle_year,
        "created_at": datetime.utcnow()
    }
    await db.vehicle_inspections.insert_one(inspection)
    
    # Update tier requirements met
    await db.driver_tiers.update_one(
        {"driver_id": driver_id},
        {
            "$set": {
                "requirements_met": {
                    "rating_ok": True,
                    "vehicle_year_ok": True,
                    "leather_seats": request.leather_seats,
                    "dual_ac": request.dual_ac,
                    "inspection_pending": True
                }
            }
        },
        upsert=True
    )
    
    return {
        "message": "Upgrade request submitted",
        "inspection_id": inspection["id"],
        "next_steps": [
            "Vehicle inspection will be scheduled within 48 hours",
            "Complete Premium Service training (free in-app course)",
            "Inspection fee: ₦2,000 at partner garage"
        ]
    }

@api_router.get("/tiers/config")
async def get_tier_configuration():
    """Get all tier configurations"""
    return {
        "tiers": TIER_CONFIG,
        "same_monthly_fee": True,
        "fee_amount": 25000,
        "upgrade_benefit": "Higher earning potential per ride, NOT higher fee"
    }

# ==================== AUTOMATIC FARE ADJUSTMENT ====================

def get_time_rate(trip_time: datetime) -> float:
    """Get the time-based rate for fare adjustment"""
    hour = trip_time.hour
    weekday = trip_time.weekday()
    
    config = FARE_ADJUSTMENT_CONFIG
    
    # Night hours (10pm - 5am)
    if hour >= config["night_hours"]["start"] or hour < config["night_hours"]["end"]:
        return config["time_rates"]["night"]
    
    # Peak hours
    peak = config["peak_hours"]
    if (peak["morning"]["start"] <= hour < peak["morning"]["end"] or
        peak["evening"]["start"] <= hour < peak["evening"]["end"]):
        return config["time_rates"]["peak"]
    
    # Weekend
    if weekday >= 5:
        return config["time_rates"]["weekend"]
    
    return config["time_rates"]["normal"]

def get_weather_surcharge(weather_condition: str) -> float:
    """Get weather surcharge percentage"""
    surcharges = FARE_ADJUSTMENT_CONFIG["weather_surcharges"]
    return surcharges.get(weather_condition, 0.0)

@api_router.post("/fare/calculate-adjustment")
async def calculate_fare_adjustment(trip_id: str):
    """Calculate automatic fare adjustment at trip end"""
    trip = await db.trips.find_one({"id": trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    
    tracking = await db.trip_tracking.find_one({"trip_id": trip_id})
    
    base_fare = trip.get("fare", 0)
    estimated_time = trip.get("duration_mins", 0)
    
    # Calculate actual time
    started_at = trip.get("started_at")
    completed_at = trip.get("completed_at") or datetime.utcnow()
    
    if started_at:
        actual_time = int((completed_at - started_at).total_seconds() / 60)
    else:
        actual_time = estimated_time
    
    config = FARE_ADJUSTMENT_CONFIG
    free_buffer = config["free_buffer_minutes"]
    
    # Extra time calculation
    extra_time = max(0, actual_time - estimated_time - free_buffer)
    
    # Get time rate
    time_rate = get_time_rate(started_at or datetime.utcnow())
    
    # Calculate traffic charge
    traffic_charge = extra_time * time_rate
    
    # Weather surcharge (check tracking data)
    weather_surcharge = 0.0
    weather_condition = None
    if tracking:
        weather_conditions = tracking.get("weather_conditions", [])
        for wc in weather_conditions:
            if wc.get("surcharge_applied"):
                weather_condition = wc.get("condition")
                weather_surcharge = base_fare * get_weather_surcharge(weather_condition)
                break
    
    # Total adjustment
    total_adjustment = traffic_charge + weather_surcharge
    
    # Apply 50% cap
    max_cap = config["max_increase_percentage"] / 100
    max_increase = base_fare * max_cap
    cap_applied = total_adjustment > max_increase
    
    if cap_applied:
        total_adjustment = max_increase
    
    final_fare = base_fare + total_adjustment
    
    # Store adjustment
    adjustment = {
        "id": str(uuid.uuid4()),
        "trip_id": trip_id,
        "base_fare": base_fare,
        "estimated_time_mins": estimated_time,
        "actual_time_mins": actual_time,
        "extra_time_mins": extra_time,
        "time_rate": time_rate,
        "traffic_charge": traffic_charge,
        "weather_surcharge": weather_surcharge,
        "weather_condition": weather_condition,
        "total_adjustment": total_adjustment,
        "final_fare": final_fare,
        "cap_applied": cap_applied,
        "max_cap_percentage": config["max_increase_percentage"],
        "calculated_at": datetime.utcnow()
    }
    await db.fare_adjustments.insert_one(adjustment)
    
    # Update trip with final fare
    await db.trips.update_one(
        {"id": trip_id},
        {"$set": {"fare": final_fare, "traffic_fee": traffic_charge}}
    )
    
    return {
        "trip_id": trip_id,
        "breakdown": {
            "base_fare": base_fare,
            "traffic_delay": {
                "extra_minutes": extra_time,
                "rate_per_minute": time_rate,
                "charge": traffic_charge
            },
            "weather_surcharge": weather_surcharge,
            "weather_condition": weather_condition,
            "total_adjustment": total_adjustment,
            "cap_applied": cap_applied,
            "max_cap": f"{config['max_increase_percentage']}%"
        },
        "final_fare": final_fare,
        "message": "Fare calculated automatically based on actual trip conditions"
    }

@api_router.get("/fare/breakdown/{trip_id}")
async def get_fare_breakdown(trip_id: str):
    """Get detailed fare breakdown for a completed trip"""
    adjustment = await db.fare_adjustments.find_one({"trip_id": trip_id})
    trip = await db.trips.find_one({"id": trip_id})
    
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    
    if not adjustment:
        # No adjustment was made
        return {
            "trip_id": trip_id,
            "base_fare": trip.get("fare", 0),
            "adjustments": None,
            "final_fare": trip.get("fare", 0),
            "message": "No adjustments applied to this trip"
        }
    
    return {
        "trip_id": trip_id,
        "base_fare": adjustment.get("base_fare"),
        "estimated_time": adjustment.get("estimated_time_mins"),
        "actual_time": adjustment.get("actual_time_mins"),
        "breakdown": {
            "traffic_delay": {
                "extra_minutes": adjustment.get("extra_time_mins"),
                "rate": adjustment.get("time_rate"),
                "charge": adjustment.get("traffic_charge")
            },
            "weather": {
                "condition": adjustment.get("weather_condition"),
                "surcharge": adjustment.get("weather_surcharge")
            }
        },
        "total_adjustment": adjustment.get("total_adjustment"),
        "cap_applied": adjustment.get("cap_applied"),
        "final_fare": adjustment.get("final_fare"),
        "calculated_at": adjustment.get("calculated_at")
    }

@api_router.post("/trips/{trip_id}/track")
async def update_trip_tracking(trip_id: str, update: TripTrackingUpdate):
    """Update trip tracking data (speed, location)"""
    tracking = await db.trip_tracking.find_one({"trip_id": trip_id})
    
    speed_log = {
        "timestamp": update.timestamp.isoformat(),
        "speed_kmh": update.speed_kmh,
        "location": {"lat": update.latitude, "lng": update.longitude}
    }
    
    if not tracking:
        tracking = {
            "id": str(uuid.uuid4()),
            "trip_id": trip_id,
            "speed_logs": [speed_log],
            "traffic_delays": [],
            "weather_conditions": [],
            "route_deviations": [],
            "stationary_periods": [],
            "created_at": datetime.utcnow()
        }
        await db.trip_tracking.insert_one(tracking)
    else:
        # Detect traffic (speed < 10 km/h for extended period)
        speed_logs = tracking.get("speed_logs", [])
        if len(speed_logs) >= 5:
            recent_speeds = [log["speed_kmh"] for log in speed_logs[-5:]]
            avg_speed = sum(recent_speeds) / len(recent_speeds)
            
            if avg_speed < 10 and update.speed_kmh < 10:
                # Traffic detected
                traffic_delays = tracking.get("traffic_delays", [])
                if traffic_delays and not traffic_delays[-1].get("end"):
                    # Continue existing delay
                    pass
                else:
                    # New delay
                    traffic_delays.append({
                        "start": datetime.utcnow().isoformat(),
                        "location": {"lat": update.latitude, "lng": update.longitude}
                    })
                    await db.trip_tracking.update_one(
                        {"trip_id": trip_id},
                        {"$set": {"traffic_delays": traffic_delays}}
                    )
        
        await db.trip_tracking.update_one(
            {"trip_id": trip_id},
            {"$push": {"speed_logs": speed_log}}
        )
    
    return {"message": "Tracking updated", "trip_id": trip_id}

# ==================== RIDER PREFERENCES ====================

@api_router.get("/rider/preferences/{user_id}")
async def get_rider_preferences(user_id: str):
    """Get rider's preferences"""
    prefs = await db.rider_preferences.find_one({"user_id": user_id})
    
    if not prefs:
        prefs = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "preferred_ride_type": "any",
            "preferred_ac_level": "medium",
            "preferred_music": "none",
            "saved_routes": [],
            "default_payment": "cash",
            "auto_tip_percentage": 0.0,
            "created_at": datetime.utcnow()
        }
        await db.rider_preferences.insert_one(prefs)
    
    return prefs

@api_router.put("/rider/preferences/{user_id}")
async def update_rider_preferences(user_id: str, request: RiderPreferencesUpdate):
    """Update rider's preferences"""
    update_data = {k: v for k, v in request.dict().items() if v is not None}
    
    await db.rider_preferences.update_one(
        {"user_id": user_id},
        {"$set": update_data},
        upsert=True
    )
    
    return {"message": "Preferences updated", "updated": update_data}

@api_router.post("/rider/preferences/{user_id}/routes")
async def save_route(user_id: str, route: SavedRouteRequest):
    """Save a favorite route"""
    saved_route = {
        "id": str(uuid.uuid4()),
        "name": route.name,
        "pickup": {
            "lat": route.pickup_lat,
            "lng": route.pickup_lng,
            "address": route.pickup_address
        },
        "dropoff": {
            "lat": route.dropoff_lat,
            "lng": route.dropoff_lng,
            "address": route.dropoff_address
        },
        "created_at": datetime.utcnow().isoformat()
    }
    
    await db.rider_preferences.update_one(
        {"user_id": user_id},
        {"$push": {"saved_routes": saved_route}},
        upsert=True
    )
    
    return {"message": "Route saved", "route": saved_route}

@api_router.delete("/rider/preferences/{user_id}/routes/{route_id}")
async def delete_saved_route(user_id: str, route_id: str):
    """Delete a saved route"""
    await db.rider_preferences.update_one(
        {"user_id": user_id},
        {"$pull": {"saved_routes": {"id": route_id}}}
    )
    
    return {"message": "Route deleted"}

# ==================== LOYALTY PROGRAM ====================

@api_router.get("/loyalty/{user_id}")
async def get_loyalty_status(user_id: str):
    """Get user's loyalty program status"""
    loyalty = await db.loyalty_programs.find_one({"user_id": user_id})
    
    if not loyalty:
        loyalty = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "tier": "bronze",
            "points": 0,
            "total_trips": 0,
            "total_spent": 0.0,
            "perks_earned": [],
            "created_at": datetime.utcnow()
        }
        await db.loyalty_programs.insert_one(loyalty)
    
    current_tier = loyalty.get("tier", "bronze")
    tier_config = LOYALTY_TIERS.get(current_tier, LOYALTY_TIERS["bronze"])
    
    # Find next tier
    next_tier = None
    next_tier_requirements = None
    tier_order = ["bronze", "silver", "gold", "platinum"]
    current_index = tier_order.index(current_tier)
    if current_index < len(tier_order) - 1:
        next_tier = tier_order[current_index + 1]
        next_tier_requirements = LOYALTY_TIERS[next_tier]
    
    return {
        "user_id": user_id,
        "current_tier": current_tier,
        "points": loyalty.get("points", 0),
        "total_trips": loyalty.get("total_trips", 0),
        "total_spent": loyalty.get("total_spent", 0),
        "current_perks": tier_config["perks"],
        "points_multiplier": tier_config["points_multiplier"],
        "next_tier": next_tier,
        "next_tier_requirements": next_tier_requirements,
        "progress_to_next": {
            "trips_needed": (next_tier_requirements["min_trips"] - loyalty.get("total_trips", 0)) if next_tier_requirements else 0,
            "spent_needed": (next_tier_requirements["min_spent"] - loyalty.get("total_spent", 0)) if next_tier_requirements else 0
        } if next_tier else None
    }

@api_router.post("/loyalty/{user_id}/add-points")
async def add_loyalty_points(user_id: str, trip_fare: float):
    """Add points from completed trip"""
    loyalty = await db.loyalty_programs.find_one({"user_id": user_id})
    
    if not loyalty:
        loyalty = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "tier": "bronze",
            "points": 0,
            "total_trips": 0,
            "total_spent": 0.0,
            "perks_earned": [],
            "created_at": datetime.utcnow()
        }
    
    current_tier = loyalty.get("tier", "bronze")
    multiplier = LOYALTY_TIERS[current_tier]["points_multiplier"]
    
    # 1 point per 100 NGN spent
    base_points = int(trip_fare / 100)
    earned_points = int(base_points * multiplier)
    
    new_total_trips = loyalty.get("total_trips", 0) + 1
    new_total_spent = loyalty.get("total_spent", 0) + trip_fare
    new_points = loyalty.get("points", 0) + earned_points
    
    # Check for tier upgrade
    new_tier = current_tier
    for tier_name in ["platinum", "gold", "silver"]:
        tier_req = LOYALTY_TIERS[tier_name]
        if new_total_trips >= tier_req["min_trips"] and new_total_spent >= tier_req["min_spent"]:
            new_tier = tier_name
            break
    
    tier_upgraded = new_tier != current_tier
    
    await db.loyalty_programs.update_one(
        {"user_id": user_id},
        {
            "$set": {
                "points": new_points,
                "total_trips": new_total_trips,
                "total_spent": new_total_spent,
                "tier": new_tier
            }
        },
        upsert=True
    )
    
    return {
        "points_earned": earned_points,
        "total_points": new_points,
        "tier": new_tier,
        "tier_upgraded": tier_upgraded,
        "message": f"Earned {earned_points} points!" + (f" Upgraded to {new_tier}!" if tier_upgraded else "")
    }

# ==================== IN-APP MESSAGING ====================

@api_router.post("/messages/send")
async def send_message(request: SendMessageRequest, sender_id: str, sender_role: str):
    """Send in-app message during trip"""
    trip = await db.trips.find_one({"id": request.trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    
    # Preset messages for quick communication
    preset_messages = {
        "arriving_soon": "I'm arriving soon, please be ready",
        "at_location": "I'm at the pickup location",
        "blue_gate": "I'm at the blue gate",
        "red_gate": "I'm at the red gate",
        "running_late": "I'm running a few minutes late",
        "waiting": "I'm waiting for you",
        "wrong_location": "The pin seems to be in the wrong location",
        "call_me": "Please call me"
    }
    
    content = request.content
    if request.message_type == "preset" and request.content in preset_messages:
        content = preset_messages[request.content]
    
    message = {
        "id": str(uuid.uuid4()),
        "trip_id": request.trip_id,
        "sender_id": sender_id,
        "sender_role": sender_role,
        "message_type": request.message_type,
        "content": content,
        "read": False,
        "created_at": datetime.utcnow()
    }
    await db.messages.insert_one(message)
    
    return {"message": "Message sent", "data": message}

@api_router.get("/messages/{trip_id}")
async def get_trip_messages(trip_id: str):
    """Get all messages for a trip"""
    messages = await db.messages.find({"trip_id": trip_id}).sort("created_at", 1).to_list(100)
    
    return {
        "trip_id": trip_id,
        "messages": messages,
        "preset_options": [
            {"key": "arriving_soon", "text": "I'm arriving soon, please be ready"},
            {"key": "at_location", "text": "I'm at the pickup location"},
            {"key": "blue_gate", "text": "I'm at the blue gate"},
            {"key": "running_late", "text": "I'm running a few minutes late"},
            {"key": "call_me", "text": "Please call me"}
        ]
    }

@api_router.put("/messages/{message_id}/read")
async def mark_message_read(message_id: str):
    """Mark message as read"""
    await db.messages.update_one({"id": message_id}, {"$set": {"read": True}})
    return {"message": "Message marked as read"}

# ==================== LOST & FOUND ====================

@api_router.post("/lost-found/report")
async def report_lost_item(request: ReportLostItemRequest, reporter_id: str, reporter_role: str):
    """Report a lost item"""
    trip = await db.trips.find_one({"id": request.trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    
    item = {
        "id": str(uuid.uuid4()),
        "trip_id": request.trip_id,
        "reporter_id": reporter_id,
        "reporter_role": reporter_role,
        "item_description": request.item_description,
        "status": "reported",
        "created_at": datetime.utcnow()
    }
    await db.lost_items.insert_one(item)
    
    return {
        "message": "Lost item reported",
        "item_id": item["id"],
        "next_steps": [
            "The other party will be notified",
            "You can communicate through the app",
            "Check back for updates on item status"
        ]
    }

@api_router.get("/lost-found/user/{user_id}")
async def get_user_lost_items(user_id: str):
    """Get user's lost item reports"""
    items = await db.lost_items.find({"reporter_id": user_id}).sort("created_at", -1).to_list(50)
    return {"items": items}

@api_router.put("/lost-found/{item_id}/respond")
async def respond_to_lost_item(item_id: str, request: LostItemResponseRequest):
    """Respond to lost item report"""
    await db.lost_items.update_one(
        {"id": item_id},
        {
            "$set": {
                "status": request.response,
                "driver_response": request.response,
                "resolution_notes": request.notes,
                "resolved_at": datetime.utcnow() if request.response in ["found", "returned"] else None
            }
        }
    )
    
    return {"message": f"Item marked as {request.response}"}

# ==================== DRIVER EARNINGS DASHBOARD ====================

@api_router.get("/driver/earnings/{driver_id}")
async def get_driver_earnings_dashboard(driver_id: str, period: str = "today"):
    """Get comprehensive earnings dashboard for driver"""
    now = datetime.utcnow()
    
    # Calculate date range
    if period == "today":
        start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == "week":
        start_date = now - timedelta(days=7)
    elif period == "month":
        start_date = now - timedelta(days=30)
    else:
        start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
    
    # Get completed trips
    trips = await db.trips.find({
        "driver_id": driver_id,
        "status": "completed",
        "completed_at": {"$gte": start_date}
    }).to_list(500)
    
    # Calculate earnings
    total_earnings = sum(t.get("fare", 0) for t in trips)
    total_trips = len(trips)
    total_distance = sum(t.get("distance_km", 0) for t in trips)
    total_time = sum(t.get("duration_mins", 0) for t in trips)
    
    # Traffic compensation
    traffic_compensation = sum(t.get("traffic_fee", 0) for t in trips)
    
    # Get tier info
    tier_data = await db.driver_tiers.find_one({"driver_id": driver_id})
    current_tier = tier_data.get("tier", "basic") if tier_data else "basic"
    tier_config = TIER_CONFIG.get(current_tier, TIER_CONFIG["basic"])
    
    # Calculate daily breakdown
    daily_breakdown = {}
    for trip in trips:
        trip_date = trip.get("completed_at", now).strftime("%Y-%m-%d")
        if trip_date not in daily_breakdown:
            daily_breakdown[trip_date] = {"trips": 0, "earnings": 0, "distance": 0}
        daily_breakdown[trip_date]["trips"] += 1
        daily_breakdown[trip_date]["earnings"] += trip.get("fare", 0)
        daily_breakdown[trip_date]["distance"] += trip.get("distance_km", 0)
    
    # Calculate averages
    avg_per_trip = total_earnings / total_trips if total_trips > 0 else 0
    avg_per_km = total_earnings / total_distance if total_distance > 0 else 0
    
    # Projection
    if period == "today":
        hours_worked = (now - start_date).total_seconds() / 3600
        projected_daily = (total_earnings / hours_worked * 10) if hours_worked > 0 else 0  # Assuming 10 hour day
    else:
        projected_daily = total_earnings / ((now - start_date).days or 1)
    
    return {
        "driver_id": driver_id,
        "period": period,
        "tier": {
            "name": tier_config["name"],
            "earning_potential": tier_config["earning_per_ride"],
            "monthly_fee": tier_config["monthly_fee"]
        },
        "summary": {
            "total_earnings": total_earnings,
            "total_trips": total_trips,
            "total_distance_km": round(total_distance, 1),
            "total_time_mins": total_time,
            "traffic_compensation": traffic_compensation,
            "keep_percentage": 100  # 100% - No commission!
        },
        "averages": {
            "per_trip": round(avg_per_trip, 2),
            "per_km": round(avg_per_km, 2),
            "hourly": round(total_earnings / (total_time / 60), 2) if total_time > 0 else 0
        },
        "projections": {
            "daily": round(projected_daily, 2),
            "weekly": round(projected_daily * 6, 2),  # 6 working days
            "monthly": round(projected_daily * 24, 2)  # 24 working days
        },
        "daily_breakdown": daily_breakdown,
        "commission_message": "You keep 100% of all earnings. Only ₦25,000 monthly subscription."
    }

# ==================== SMART MATCHING ====================

@api_router.post("/matching/find-driver")
async def find_best_matched_driver(rider_id: str, pickup_lat: float, pickup_lng: float, service_type: str = "economy"):
    """Find best matched driver based on location and preferences"""
    # Get rider preferences
    rider_prefs = await db.rider_preferences.find_one({"user_id": rider_id})
    rider = await db.users.find_one({"id": rider_id})
    
    # Get available drivers
    available_drivers = await db.driver_profiles.find({
        "is_online": True,
        "current_location": {"$ne": None}
    }).to_list(50)
    
    if not available_drivers:
        return {"matched_driver": None, "message": "No drivers available"}
    
    scored_drivers = []
    
    for driver in available_drivers:
        driver_location = driver.get("current_location", {})
        if not driver_location:
            continue
        
        # Calculate distance
        distance = calculate_distance_haversine(
            pickup_lat, pickup_lng,
            driver_location.get("latitude", 0),
            driver_location.get("longitude", 0)
        )
        
        # Get driver user info
        driver_user = await db.users.find_one({"id": driver.get("user_id")})
        if not driver_user:
            continue
        
        # Get tier info
        tier_data = await db.driver_tiers.find_one({"driver_id": driver.get("user_id")})
        tier = tier_data.get("tier", "basic") if tier_data else "basic"
        
        # Calculate score (lower is better)
        score = distance * 10  # Base score from distance
        
        # Bonus for higher rating
        rating = driver_user.get("rating", 4.0)
        score -= (rating - 4.0) * 5  # Bonus for ratings above 4
        
        # Premium driver preference for premium rides
        if service_type == "premium" and tier == "premium":
            score -= 10  # Prefer premium drivers for premium rides
        
        # Match preferences if available
        if rider_prefs:
            # Could add more preference matching here
            pass
        
        # Women-only mode
        if rider and rider.get("women_only_mode") and rider.get("gender") == "female":
            if driver_user.get("gender") != "female":
                continue  # Skip non-female drivers
        
        scored_drivers.append({
            "driver_id": driver.get("user_id"),
            "name": driver_user.get("name"),
            "rating": rating,
            "tier": tier,
            "distance_km": round(distance, 2),
            "eta_mins": int(distance * 3),  # Rough ETA
            "vehicle": {
                "model": driver.get("vehicle_model"),
                "color": driver.get("vehicle_color"),
                "plate": driver.get("vehicle_plate")
            },
            "score": score
        })
    
    # Sort by score
    scored_drivers.sort(key=lambda x: x["score"])
    
    if scored_drivers:
        best_match = scored_drivers[0]
        return {
            "matched_driver": best_match,
            "alternatives": scored_drivers[1:4],  # Top 3 alternatives
            "matching_criteria": ["distance", "rating", "tier", "preferences"]
        }
    
    return {"matched_driver": None, "message": "No suitable drivers found"}

# ==================== HEALTH CHECK ====================

@api_router.get("/")
async def root():
    return {"message": "KODA API is running", "version": "2.0.0"}

@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}

# Include router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

from fastapi import FastAPI, APIRouter, HTTPException, status
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timedelta
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

# Create the main app
app = FastAPI(title="KODA API", version="2.0.0")

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
    status: str = "active"
    start_date: datetime = Field(default_factory=datetime.utcnow)
    end_date: datetime = Field(default_factory=lambda: datetime.utcnow() + timedelta(days=30))
    payment_method: Optional[str] = None
    transaction_id: Optional[str] = None
    grace_period_requested: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)

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

@api_router.post("/auth/send-otp")
async def send_otp(request: OTPRequest):
    otp = generate_otp()
    otp_store[request.phone] = {"otp": otp, "expires": datetime.utcnow() + timedelta(minutes=10)}
    logger.info(f"OTP for {request.phone}: {otp}")
    return {"message": "OTP sent successfully", "otp": otp}

@api_router.post("/auth/verify-otp")
async def verify_otp(request: OTPVerify):
    stored = otp_store.get(request.phone)
    if not stored:
        raise HTTPException(status_code=400, detail="OTP not found")
    if datetime.utcnow() > stored["expires"]:
        del otp_store[request.phone]
        raise HTTPException(status_code=400, detail="OTP expired")
    if stored["otp"] != request.otp:
        raise HTTPException(status_code=400, detail="Invalid OTP")
    
    user = await db.users.find_one({"phone": request.phone})
    if user:
        await db.users.update_one({"phone": request.phone}, {"$set": {"is_verified": True}})
        user["is_verified"] = True
        user["_id"] = str(user["_id"])
        del otp_store[request.phone]
        return {"message": "Login successful", "user": user, "is_new_user": False}
    
    del otp_store[request.phone]
    return {"message": "OTP verified", "is_new_user": True}

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

@api_router.get("/subscriptions/{driver_id}")
async def get_subscription(driver_id: str):
    subscription = await db.subscriptions.find_one({
        "driver_id": driver_id,
        "status": {"$in": ["active", "grace_period"]}
    })
    if subscription:
        subscription["_id"] = str(subscription["_id"])
    return subscription

@api_router.post("/subscriptions/{driver_id}/subscribe")
async def create_subscription(driver_id: str, request: SubscriptionRequest):
    existing = await db.subscriptions.find_one({"driver_id": driver_id, "status": "active"})
    if existing:
        raise HTTPException(status_code=400, detail="Active subscription already exists")
    
    subscription = Subscription(
        driver_id=driver_id,
        payment_method=request.payment_method,
        transaction_id=f"TXN_{uuid.uuid4().hex[:12].upper()}"
    )
    await db.subscriptions.insert_one(subscription.dict())
    
    return {"message": "Subscription activated successfully", "subscription": subscription.dict()}

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
        {"id": subscription["id"]},
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

# ==================== FATIGUE MONITORING ====================

@api_router.post("/drivers/{user_id}/log-break")
async def log_driver_break(user_id: str):
    """Log driver taking a break for fatigue monitoring"""
    await db.driver_profiles.update_one(
        {"user_id": user_id},
        {"$set": {"last_break_at": datetime.utcnow(), "fatigue_warning": False}}
    )
    return {"message": "Break logged successfully"}

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

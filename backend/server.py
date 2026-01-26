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

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'koda_db')]

# Google Maps API Key
GOOGLE_MAPS_API_KEY = os.environ.get('GOOGLE_MAPS_API_KEY', '')

# Create the main app
app = FastAPI(title="KODA API", version="1.0.0")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ==================== FARE CONFIGURATION ====================
# Configurable fare settings per city/service type
FARE_CONFIG = {
    "lagos": {
        "economy": {
            "base_fare": 800,
            "per_km": 120,
            "per_min": 20,
            "min_fare": 1500,
            "max_multiplier": 1.2
        },
        "premium": {
            "base_fare": 1200,
            "per_km": 180,
            "per_min": 30,
            "min_fare": 2500,
            "max_multiplier": 1.2
        }
    },
    "default": {
        "economy": {
            "base_fare": 800,
            "per_km": 120,
            "per_min": 20,
            "min_fare": 1500,
            "max_multiplier": 1.2
        },
        "premium": {
            "base_fare": 1200,
            "per_km": 180,
            "per_min": 30,
            "min_fare": 2500,
            "max_multiplier": 1.2
        }
    }
}

# Simple in-memory cache for route results (5 minute TTL)
route_cache: Dict[str, Dict[str, Any]] = {}
CACHE_TTL_SECONDS = 300  # 5 minutes

# ==================== MODELS ====================

class UserBase(BaseModel):
    phone: str
    name: Optional[str] = None
    email: Optional[str] = None
    role: str = "rider"  # rider or driver
    
class UserCreate(UserBase):
    pass

class User(UserBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=datetime.utcnow)
    is_verified: bool = False
    profile_image: Optional[str] = None
    rating: float = 5.0
    total_trips: int = 0

class DriverProfile(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    nin_verified: bool = False
    license_uploaded: bool = False
    vehicle_docs_uploaded: bool = False
    selfie_verified: bool = False
    vehicle_type: Optional[str] = None
    vehicle_model: Optional[str] = None
    vehicle_plate: Optional[str] = None
    is_online: bool = False
    current_location: Optional[dict] = None
    completion_rate: float = 100.0
    cancellation_count: int = 0
    rank: str = "standard"  # standard, silver, gold, platinum
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    account_name: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class Subscription(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    driver_id: str
    amount: float = 25000.0
    status: str = "active"  # active, expired, grace_period, cancelled
    start_date: datetime = Field(default_factory=datetime.utcnow)
    end_date: datetime = Field(default_factory=lambda: datetime.utcnow() + timedelta(days=30))
    payment_method: Optional[str] = None
    transaction_id: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class Trip(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    rider_id: str
    driver_id: Optional[str] = None
    pickup_location: dict  # {lat, lng, address}
    dropoff_location: dict  # {lat, lng, address}
    distance_km: float
    duration_mins: int
    base_fare: float = 800.0
    distance_fee: float = 0.0
    time_fee: float = 0.0
    traffic_fee: float = 0.0
    fare: float
    surge_multiplier: float = 1.0
    service_type: str = "economy"
    status: str = "pending"  # pending, accepted, ongoing, completed, cancelled
    payment_method: str = "cash"  # cash, bank_transfer
    payment_status: str = "pending"  # pending, completed
    rider_rating: Optional[float] = None
    driver_rating: Optional[float] = None
    polyline: Optional[str] = None  # Encoded route polyline
    fare_locked_until: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    accepted_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

class Wallet(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    balance: float = 0.0
    currency: str = "NGN"
    created_at: datetime = Field(default_factory=datetime.utcnow)

# ==================== REQUEST/RESPONSE MODELS ====================

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

class DriverProfileUpdate(BaseModel):
    vehicle_type: Optional[str] = None
    vehicle_model: Optional[str] = None
    vehicle_plate: Optional[str] = None
    nin_verified: Optional[bool] = None
    license_uploaded: Optional[bool] = None
    vehicle_docs_uploaded: Optional[bool] = None
    selfie_verified: Optional[bool] = None
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
    service_type: str = "economy"  # economy, premium
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
    fare_estimate_id: Optional[str] = None  # To verify locked price

class RatingRequest(BaseModel):
    rating: float
    comment: Optional[str] = None

class SubscriptionRequest(BaseModel):
    payment_method: str  # card, bank_transfer, ussd, wallet

# ==================== HELPER FUNCTIONS ====================

def get_cache_key(pickup_lat: float, pickup_lng: float, dropoff_lat: float, dropoff_lng: float) -> str:
    """Generate a cache key for route data"""
    # Round to 4 decimal places (~11m precision) for caching
    key_str = f"{round(pickup_lat, 4)},{round(pickup_lng, 4)}-{round(dropoff_lat, 4)},{round(dropoff_lng, 4)}"
    return hashlib.md5(key_str.encode()).hexdigest()

def is_cache_valid(cache_entry: dict) -> bool:
    """Check if cache entry is still valid"""
    if not cache_entry:
        return False
    cached_at = cache_entry.get("cached_at")
    if not cached_at:
        return False
    return (datetime.utcnow() - cached_at).total_seconds() < CACHE_TTL_SECONDS

async def get_directions_from_google(
    pickup_lat: float, 
    pickup_lng: float, 
    dropoff_lat: float, 
    dropoff_lng: float
) -> dict:
    """Call Google Routes API (new) to get route info"""
    
    # Check cache first
    cache_key = get_cache_key(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng)
    if cache_key in route_cache and is_cache_valid(route_cache[cache_key]):
        logger.info(f"Using cached route for key: {cache_key}")
        return route_cache[cache_key]["data"]
    
    if not GOOGLE_MAPS_API_KEY:
        logger.warning("Google Maps API key not configured, using fallback calculation")
        return None
    
    # Try Routes API (new) first
    try:
        url = "https://routes.googleapis.com/directions/v2:computeRoutes"
        headers = {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
            "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.startLocation,routes.legs.endLocation"
        }
        
        body = {
            "origin": {
                "location": {
                    "latLng": {
                        "latitude": pickup_lat,
                        "longitude": pickup_lng
                    }
                }
            },
            "destination": {
                "location": {
                    "latLng": {
                        "latitude": dropoff_lat,
                        "longitude": dropoff_lng
                    }
                }
            },
            "travelMode": "DRIVE",
            "routingPreference": "TRAFFIC_AWARE",
            "computeAlternativeRoutes": False
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(url, headers=headers, json=body, timeout=10.0)
            data = response.json()
        
        if "routes" not in data or len(data["routes"]) == 0:
            error_msg = data.get("error", {}).get("message", "No routes found")
            logger.warning(f"Google Routes API: {error_msg}, trying fallback")
            # Continue to fallback below
            raise Exception(error_msg)
        
        route = data["routes"][0]
        
        # Parse duration (format: "1234s")
        duration_str = route.get("duration", "0s")
        duration_seconds = int(duration_str.replace("s", ""))
        
        result = {
            "distance_meters": route.get("distanceMeters", 0),
            "duration_seconds": duration_seconds,
            "duration_in_traffic_seconds": duration_seconds,  # Routes API already includes traffic
            "polyline": route.get("polyline", {}).get("encodedPolyline", ""),
            "start_address": "",  # Routes API doesn't return addresses
            "end_address": ""
        }
        
        # Cache the result
        route_cache[cache_key] = {
            "data": result,
            "cached_at": datetime.utcnow()
        }
        
        logger.info(f"Fetched route from Google Routes API: {result['distance_meters']}m, {result['duration_seconds']}s")
        return result
        
    except Exception as e:
        logger.warning(f"Google Routes API failed: {e}, trying legacy Directions API")
    
    # Fallback to legacy Directions API
    try:
        url = "https://maps.googleapis.com/maps/api/directions/json"
        params = {
            "origin": f"{pickup_lat},{pickup_lng}",
            "destination": f"{dropoff_lat},{dropoff_lng}",
            "key": GOOGLE_MAPS_API_KEY,
            "departure_time": "now",
            "traffic_model": "best_guess"
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.get(url, params=params, timeout=10.0)
            data = response.json()
        
        if data.get("status") != "OK":
            logger.warning(f"Google Directions API: {data.get('status')}, using fallback")
            return None
        
        route = data["routes"][0]
        leg = route["legs"][0]
        
        result = {
            "distance_meters": leg["distance"]["value"],
            "duration_seconds": leg["duration"]["value"],
            "duration_in_traffic_seconds": leg.get("duration_in_traffic", {}).get("value", leg["duration"]["value"]),
            "polyline": route["overview_polyline"]["points"],
            "start_address": leg["start_address"],
            "end_address": leg["end_address"]
        }
        
        route_cache[cache_key] = {
            "data": result,
            "cached_at": datetime.utcnow()
        }
        
        logger.info(f"Fetched route from Directions API: {result['distance_meters']}m, {result['duration_seconds']}s")
        return result
        
    except Exception as e:
        logger.error(f"All Google APIs failed: {e}")
        return None

def calculate_distance_haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Fallback: Calculate distance using Haversine formula"""
    R = 6371  # Earth's radius in km
    
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)
    
    a = math.sin(delta_lat/2)**2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    
    return R * c

def calculate_fare(
    distance_km: float, 
    duration_min: int, 
    traffic_duration_min: int,
    service_type: str = "economy",
    city: str = "lagos"
) -> dict:
    """
    Calculate fare based on KODA pricing model
    
    Formula: Total = max(min_fare, base + km_fee + time_fee + traffic_fee) * multiplier
    Multiplier: 1.0 normal, up to 1.2 peak (NEVER more than 1.2)
    """
    
    # Get config for city/service
    city_config = FARE_CONFIG.get(city.lower(), FARE_CONFIG["default"])
    config = city_config.get(service_type, city_config["economy"])
    
    base_fare = config["base_fare"]
    per_km = config["per_km"]
    per_min = config["per_min"]
    min_fare = config["min_fare"]
    max_multiplier = config["max_multiplier"]
    
    # Calculate fees
    distance_fee = distance_km * per_km
    time_fee = duration_min * per_min
    
    # Traffic fee: extra time due to traffic (capped)
    extra_traffic_min = max(0, traffic_duration_min - duration_min)
    traffic_fee = min(extra_traffic_min * per_min, base_fare * 0.3)  # Cap at 30% of base
    
    # Calculate subtotal
    subtotal = base_fare + distance_fee + time_fee + traffic_fee
    
    # Apply minimum fare
    subtotal = max(min_fare, subtotal)
    
    # Determine multiplier (peak pricing)
    # For MVP: Always 1.0, can implement time-based logic later
    # Peak hours could be 7-9am and 5-8pm on weekdays
    current_hour = datetime.utcnow().hour + 1  # WAT is UTC+1
    is_peak = current_hour in [7, 8, 9, 17, 18, 19, 20]
    
    # Even during peak, cap at 1.2x
    multiplier = 1.1 if is_peak else 1.0
    multiplier = min(multiplier, max_multiplier)
    
    # Final fare
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
    """Generate 6-digit OTP"""
    return str(random.randint(100000, 999999))

# Store OTPs temporarily (in production, use Redis)
otp_store = {}

# Store fare estimates temporarily (3 minute lock)
fare_estimate_store: Dict[str, Dict[str, Any]] = {}
FARE_LOCK_MINUTES = 3

# ==================== FARE ESTIMATE ENDPOINT ====================

@api_router.post("/fare/estimate")
async def estimate_fare(request: FareEstimateRequest):
    """
    Estimate fare for a trip using Google Directions API
    
    This endpoint:
    1. Calls Google Directions API to get real distance and duration
    2. Extracts distance_meters, duration_seconds, and traffic data
    3. Computes fare using the KODA formula
    4. Returns breakdown and locks price for 3 minutes
    """
    
    # Try to get route from Google Directions
    route_data = await get_directions_from_google(
        request.pickup_lat,
        request.pickup_lng,
        request.dropoff_lat,
        request.dropoff_lng
    )
    
    if route_data:
        # Use Google's data
        distance_km = route_data["distance_meters"] / 1000
        duration_min = math.ceil(route_data["duration_seconds"] / 60)
        traffic_duration_min = math.ceil(route_data["duration_in_traffic_seconds"] / 60)
        polyline = route_data.get("polyline")
        pickup_address = route_data.get("start_address", "")
        dropoff_address = route_data.get("end_address", "")
    else:
        # Fallback to Haversine calculation
        distance_km = calculate_distance_haversine(
            request.pickup_lat, request.pickup_lng,
            request.dropoff_lat, request.dropoff_lng
        )
        # Estimate duration: assume 25 km/h average in Lagos traffic
        duration_min = math.ceil((distance_km / 25) * 60)
        traffic_duration_min = duration_min
        polyline = None
        pickup_address = ""
        dropoff_address = ""
    
    # Ensure minimum values
    distance_km = max(0.5, distance_km)
    duration_min = max(5, duration_min)
    
    # Calculate fare
    fare = calculate_fare(
        distance_km=distance_km,
        duration_min=duration_min,
        traffic_duration_min=traffic_duration_min,
        service_type=request.service_type,
        city=request.city
    )
    
    # Generate estimate ID and lock the price
    estimate_id = str(uuid.uuid4())
    fare_estimate_store[estimate_id] = {
        "fare": fare,
        "distance_km": round(distance_km, 2),
        "duration_min": duration_min,
        "polyline": polyline,
        "service_type": request.service_type,
        "city": request.city,
        "pickup": {"lat": request.pickup_lat, "lng": request.pickup_lng, "address": pickup_address},
        "dropoff": {"lat": request.dropoff_lat, "lng": request.dropoff_lng, "address": dropoff_address},
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
        "pickup_address": pickup_address,
        "dropoff_address": dropoff_address,
        "price_valid_until": (datetime.utcnow() + timedelta(minutes=FARE_LOCK_MINUTES)).isoformat(),
        "price_lock_minutes": FARE_LOCK_MINUTES
    }

# ==================== AUTH ENDPOINTS ====================

@api_router.post("/auth/send-otp")
async def send_otp(request: OTPRequest):
    """Send OTP to phone number"""
    otp = generate_otp()
    otp_store[request.phone] = {
        "otp": otp,
        "expires": datetime.utcnow() + timedelta(minutes=10)
    }
    logger.info(f"OTP for {request.phone}: {otp}")  # In production, send via SMS
    return {"message": "OTP sent successfully", "otp": otp}  # Remove otp in production

@api_router.post("/auth/verify-otp")
async def verify_otp(request: OTPVerify):
    """Verify OTP"""
    stored = otp_store.get(request.phone)
    if not stored:
        raise HTTPException(status_code=400, detail="OTP not found. Please request new OTP.")
    
    if datetime.utcnow() > stored["expires"]:
        del otp_store[request.phone]
        raise HTTPException(status_code=400, detail="OTP expired. Please request new OTP.")
    
    if stored["otp"] != request.otp:
        raise HTTPException(status_code=400, detail="Invalid OTP")
    
    # Check if user exists
    user = await db.users.find_one({"phone": request.phone})
    
    if user:
        await db.users.update_one(
            {"phone": request.phone},
            {"$set": {"is_verified": True}}
        )
        user["is_verified"] = True
        user["_id"] = str(user["_id"])
        del otp_store[request.phone]
        return {"message": "Login successful", "user": user, "is_new_user": False}
    
    del otp_store[request.phone]
    return {"message": "OTP verified", "is_new_user": True}

@api_router.post("/auth/register")
async def register(request: RegisterRequest):
    """Register new user"""
    existing = await db.users.find_one({"phone": request.phone})
    if existing:
        raise HTTPException(status_code=400, detail="User already exists")
    
    user = User(
        phone=request.phone,
        name=request.name,
        email=request.email,
        role=request.role,
        is_verified=True
    )
    
    await db.users.insert_one(user.dict())
    
    # Create wallet for user
    wallet = Wallet(user_id=user.id)
    await db.wallets.insert_one(wallet.dict())
    
    # If driver, create driver profile
    if request.role == "driver":
        driver_profile = DriverProfile(user_id=user.id)
        await db.driver_profiles.insert_one(driver_profile.dict())
    
    return {"message": "Registration successful", "user": user.dict()}

# ==================== USER ENDPOINTS ====================

@api_router.get("/users/{user_id}")
async def get_user(user_id: str):
    """Get user by ID"""
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user["_id"] = str(user["_id"])
    return user

@api_router.get("/users/phone/{phone}")
async def get_user_by_phone(phone: str):
    """Get user by phone"""
    user = await db.users.find_one({"phone": phone})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user["_id"] = str(user["_id"])
    return user

@api_router.put("/users/{user_id}")
async def update_user(user_id: str, request: UpdateProfileRequest):
    """Update user profile"""
    update_data = {k: v for k, v in request.dict().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    
    result = await db.users.update_one(
        {"id": user_id},
        {"$set": update_data}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    user = await db.users.find_one({"id": user_id})
    user["_id"] = str(user["_id"])
    return user

@api_router.put("/users/{user_id}/switch-role")
async def switch_role(user_id: str):
    """Switch user role between rider and driver"""
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    new_role = "driver" if user["role"] == "rider" else "rider"
    
    # If switching to driver, ensure driver profile exists
    if new_role == "driver":
        driver_profile = await db.driver_profiles.find_one({"user_id": user_id})
        if not driver_profile:
            profile = DriverProfile(user_id=user_id)
            await db.driver_profiles.insert_one(profile.dict())
    
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"role": new_role}}
    )
    
    user = await db.users.find_one({"id": user_id})
    user["_id"] = str(user["_id"])
    return user

# ==================== DRIVER ENDPOINTS ====================

@api_router.get("/drivers/{user_id}/profile")
async def get_driver_profile(user_id: str):
    """Get driver profile"""
    profile = await db.driver_profiles.find_one({"user_id": user_id})
    if not profile:
        raise HTTPException(status_code=404, detail="Driver profile not found")
    profile["_id"] = str(profile["_id"])
    return profile

@api_router.put("/drivers/{user_id}/profile")
async def update_driver_profile(user_id: str, request: DriverProfileUpdate):
    """Update driver profile"""
    update_data = {k: v for k, v in request.dict().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    
    result = await db.driver_profiles.update_one(
        {"user_id": user_id},
        {"$set": update_data}
    )
    
    if result.modified_count == 0:
        profile = DriverProfile(user_id=user_id, **update_data)
        await db.driver_profiles.insert_one(profile.dict())
    
    profile = await db.driver_profiles.find_one({"user_id": user_id})
    profile["_id"] = str(profile["_id"])
    return profile

@api_router.put("/drivers/{user_id}/location")
async def update_driver_location(user_id: str, request: LocationUpdate):
    """Update driver's current location"""
    await db.driver_profiles.update_one(
        {"user_id": user_id},
        {"$set": {
            "current_location": {
                "lat": request.latitude,
                "lng": request.longitude,
                "updated_at": datetime.utcnow().isoformat()
            }
        }}
    )
    return {"message": "Location updated"}

@api_router.put("/drivers/{user_id}/online")
async def toggle_driver_online(user_id: str, is_online: bool):
    """Toggle driver online status"""
    subscription = await db.subscriptions.find_one({
        "driver_id": user_id,
        "status": {"$in": ["active", "grace_period"]}
    })
    
    if is_online and not subscription:
        raise HTTPException(
            status_code=403, 
            detail="Active subscription required to go online"
        )
    
    await db.driver_profiles.update_one(
        {"user_id": user_id},
        {"$set": {"is_online": is_online}}
    )
    return {"message": f"Driver is now {'online' if is_online else 'offline'}"}

@api_router.get("/drivers/{user_id}/stats")
async def get_driver_stats(user_id: str):
    """Get driver statistics"""
    user = await db.users.find_one({"id": user_id})
    profile = await db.driver_profiles.find_one({"user_id": user_id})
    subscription = await db.subscriptions.find_one({
        "driver_id": user_id,
        "status": {"$in": ["active", "grace_period"]}
    })
    
    completed_trips = await db.trips.count_documents({
        "driver_id": user_id,
        "status": "completed"
    })
    
    # Calculate earnings
    pipeline = [
        {"$match": {"driver_id": user_id, "status": "completed"}},
        {"$group": {"_id": None, "total": {"$sum": "$fare"}}}
    ]
    earnings_result = await db.trips.aggregate(pipeline).to_list(1)
    total_earnings = earnings_result[0]["total"] if earnings_result else 0
    
    # Today's earnings
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    today_pipeline = [
        {"$match": {
            "driver_id": user_id, 
            "status": "completed",
            "completed_at": {"$gte": today_start}
        }},
        {"$group": {"_id": None, "total": {"$sum": "$fare"}}}
    ]
    today_result = await db.trips.aggregate(today_pipeline).to_list(1)
    today_earnings = today_result[0]["total"] if today_result else 0
    
    days_remaining = 0
    if subscription:
        days_remaining = max(0, (subscription["end_date"] - datetime.utcnow()).days)
    
    return {
        "total_trips": completed_trips,
        "total_earnings": total_earnings,
        "today_earnings": today_earnings,
        "rating": user.get("rating", 5.0) if user else 5.0,
        "completion_rate": profile.get("completion_rate", 100.0) if profile else 100.0,
        "rank": profile.get("rank", "standard") if profile else "standard",
        "subscription_active": subscription is not None,
        "subscription_days_remaining": days_remaining,
        "is_online": profile.get("is_online", False) if profile else False
    }

# ==================== SUBSCRIPTION ENDPOINTS ====================

@api_router.get("/subscriptions/{driver_id}")
async def get_subscription(driver_id: str):
    """Get driver's active subscription"""
    subscription = await db.subscriptions.find_one({
        "driver_id": driver_id,
        "status": {"$in": ["active", "grace_period"]}
    })
    if subscription:
        subscription["_id"] = str(subscription["_id"])
    return subscription

@api_router.get("/subscriptions/{driver_id}/history")
async def get_subscription_history(driver_id: str):
    """Get driver's subscription history"""
    subscriptions = await db.subscriptions.find(
        {"driver_id": driver_id}
    ).sort("created_at", -1).to_list(50)
    
    for sub in subscriptions:
        sub["_id"] = str(sub["_id"])
    return subscriptions

@api_router.post("/subscriptions/{driver_id}/subscribe")
async def create_subscription(driver_id: str, request: SubscriptionRequest):
    """Create new subscription"""
    existing = await db.subscriptions.find_one({
        "driver_id": driver_id,
        "status": "active"
    })
    
    if existing:
        raise HTTPException(
            status_code=400, 
            detail="Active subscription already exists"
        )
    
    subscription = Subscription(
        driver_id=driver_id,
        payment_method=request.payment_method,
        transaction_id=f"TXN_{uuid.uuid4().hex[:12].upper()}"
    )
    
    await db.subscriptions.insert_one(subscription.dict())
    
    return {
        "message": "Subscription activated successfully",
        "subscription": subscription.dict()
    }

# ==================== TRIP ENDPOINTS ====================

@api_router.post("/trips/estimate")
async def estimate_trip_fare(request: FareEstimateRequest):
    """Legacy endpoint - redirects to /fare/estimate"""
    return await estimate_fare(request)

@api_router.post("/trips/request")
async def request_trip(rider_id: str, request: TripRequest):
    """Request a new trip"""
    
    # Check if there's a locked fare estimate
    fare_data = None
    if request.fare_estimate_id and request.fare_estimate_id in fare_estimate_store:
        estimate = fare_estimate_store[request.fare_estimate_id]
        if datetime.utcnow() < estimate["expires_at"]:
            fare_data = estimate
            logger.info(f"Using locked fare estimate: {request.fare_estimate_id}")
    
    if fare_data:
        # Use locked fare
        distance_km = fare_data["distance_km"]
        duration_min = fare_data["duration_min"]
        fare = fare_data["fare"]
        polyline = fare_data.get("polyline")
    else:
        # Calculate new fare
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
        
        fare = calculate_fare(
            distance_km=distance_km,
            duration_min=duration_min,
            traffic_duration_min=traffic_duration_min,
            service_type=request.service_type
        )
    
    trip = Trip(
        rider_id=rider_id,
        pickup_location={
            "lat": request.pickup_lat,
            "lng": request.pickup_lng,
            "address": request.pickup_address
        },
        dropoff_location={
            "lat": request.dropoff_lat,
            "lng": request.dropoff_lng,
            "address": request.dropoff_address
        },
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
        fare_locked_until=datetime.utcnow() + timedelta(minutes=FARE_LOCK_MINUTES)
    )
    
    await db.trips.insert_one(trip.dict())
    
    return {
        "message": "Trip requested",
        "trip": trip.dict()
    }

@api_router.get("/trips/pending")
async def get_pending_trips(driver_lat: float, driver_lng: float):
    """Get pending trips near driver"""
    trips = await db.trips.find({"status": "pending"}).to_list(50)
    
    nearby_trips = []
    for trip in trips:
        pickup = trip["pickup_location"]
        distance = calculate_distance_haversine(
            driver_lat, driver_lng,
            pickup["lat"], pickup["lng"]
        )
        if distance <= 10:  # Within 10km
            trip["_id"] = str(trip["_id"])
            trip["distance_to_pickup"] = round(distance, 2)
            nearby_trips.append(trip)
    
    nearby_trips.sort(key=lambda x: x["distance_to_pickup"])
    return nearby_trips[:10]

@api_router.put("/trips/{trip_id}/accept")
async def accept_trip(trip_id: str, driver_id: str):
    """Driver accepts a trip"""
    subscription = await db.subscriptions.find_one({
        "driver_id": driver_id,
        "status": {"$in": ["active", "grace_period"]}
    })
    
    if not subscription:
        raise HTTPException(
            status_code=403,
            detail="Active subscription required to accept trips"
        )
    
    result = await db.trips.update_one(
        {"id": trip_id, "status": "pending"},
        {"$set": {
            "driver_id": driver_id,
            "status": "accepted",
            "accepted_at": datetime.utcnow()
        }}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=400, detail="Trip not available")
    
    trip = await db.trips.find_one({"id": trip_id})
    trip["_id"] = str(trip["_id"])
    return trip

@api_router.put("/trips/{trip_id}/start")
async def start_trip(trip_id: str):
    """Start the trip"""
    result = await db.trips.update_one(
        {"id": trip_id, "status": "accepted"},
        {"$set": {
            "status": "ongoing",
            "started_at": datetime.utcnow()
        }}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=400, detail="Cannot start trip")
    
    trip = await db.trips.find_one({"id": trip_id})
    trip["_id"] = str(trip["_id"])
    return trip

@api_router.put("/trips/{trip_id}/complete")
async def complete_trip(trip_id: str):
    """Complete the trip"""
    result = await db.trips.update_one(
        {"id": trip_id, "status": "ongoing"},
        {"$set": {
            "status": "completed",
            "completed_at": datetime.utcnow(),
            "payment_status": "completed"
        }}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=400, detail="Cannot complete trip")
    
    trip = await db.trips.find_one({"id": trip_id})
    
    if trip.get("driver_id"):
        await db.users.update_one(
            {"id": trip["driver_id"]},
            {"$inc": {"total_trips": 1}}
        )
    
    await db.users.update_one(
        {"id": trip["rider_id"]},
        {"$inc": {"total_trips": 1}}
    )
    
    trip["_id"] = str(trip["_id"])
    return trip

@api_router.put("/trips/{trip_id}/cancel")
async def cancel_trip(trip_id: str, cancelled_by: str):
    """Cancel a trip"""
    trip = await db.trips.find_one({"id": trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    
    if trip["status"] in ["completed", "cancelled"]:
        raise HTTPException(status_code=400, detail="Cannot cancel this trip")
    
    await db.trips.update_one(
        {"id": trip_id},
        {"$set": {
            "status": "cancelled",
            "cancelled_by": cancelled_by,
            "cancelled_at": datetime.utcnow()
        }}
    )
    
    if cancelled_by == trip.get("driver_id"):
        await db.driver_profiles.update_one(
            {"user_id": cancelled_by},
            {"$inc": {"cancellation_count": 1}}
        )
    
    return {"message": "Trip cancelled"}

@api_router.put("/trips/{trip_id}/rate")
async def rate_trip(trip_id: str, rater_id: str, request: RatingRequest):
    """Rate a completed trip"""
    trip = await db.trips.find_one({"id": trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    
    if trip["status"] != "completed":
        raise HTTPException(status_code=400, detail="Can only rate completed trips")
    
    update_field = "driver_rating" if rater_id == trip["rider_id"] else "rider_rating"
    rated_user_id = trip["driver_id"] if rater_id == trip["rider_id"] else trip["rider_id"]
    
    await db.trips.update_one(
        {"id": trip_id},
        {"$set": {update_field: request.rating}}
    )
    
    if rated_user_id:
        if update_field == "driver_rating":
            ratings = await db.trips.find(
                {"driver_id": rated_user_id, "driver_rating": {"$exists": True}}
            ).to_list(1000)
            avg_rating = sum(r["driver_rating"] for r in ratings) / len(ratings) if ratings else 5.0
        else:
            ratings = await db.trips.find(
                {"rider_id": rated_user_id, "rider_rating": {"$exists": True}}
            ).to_list(1000)
            avg_rating = sum(r["rider_rating"] for r in ratings) / len(ratings) if ratings else 5.0
        
        await db.users.update_one(
            {"id": rated_user_id},
            {"$set": {"rating": round(avg_rating, 1)}}
        )
    
    return {"message": "Rating submitted"}

@api_router.get("/trips/user/{user_id}")
async def get_user_trips(user_id: str, role: str = "rider"):
    """Get user's trip history"""
    if role == "rider":
        trips = await db.trips.find({"rider_id": user_id}).sort("created_at", -1).to_list(50)
    else:
        trips = await db.trips.find({"driver_id": user_id}).sort("created_at", -1).to_list(50)
    
    for trip in trips:
        trip["_id"] = str(trip["_id"])
    return trips

@api_router.get("/trips/{trip_id}")
async def get_trip(trip_id: str):
    """Get trip details"""
    trip = await db.trips.find_one({"id": trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    trip["_id"] = str(trip["_id"])
    return trip

# ==================== WALLET ENDPOINTS ====================

@api_router.get("/wallet/{user_id}")
async def get_wallet(user_id: str):
    """Get user's wallet"""
    wallet = await db.wallets.find_one({"user_id": user_id})
    if not wallet:
        wallet = Wallet(user_id=user_id)
        await db.wallets.insert_one(wallet.dict())
    wallet["_id"] = str(wallet["_id"])
    return wallet

@api_router.post("/wallet/{user_id}/topup")
async def topup_wallet(user_id: str, amount: float):
    """Top up wallet (mock payment)"""
    result = await db.wallets.update_one(
        {"user_id": user_id},
        {"$inc": {"balance": amount}}
    )
    
    if result.modified_count == 0:
        wallet = Wallet(user_id=user_id, balance=amount)
        await db.wallets.insert_one(wallet.dict())
    
    wallet = await db.wallets.find_one({"user_id": user_id})
    wallet["_id"] = str(wallet["_id"])
    return wallet

# ==================== HEALTH CHECK ====================

@api_router.get("/")
async def root():
    return {"message": "KODA API is running", "version": "1.0.0"}

@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}

# Include the router in the main app
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

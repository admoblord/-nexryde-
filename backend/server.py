from fastapi import FastAPI, APIRouter, HTTPException, status
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime, timedelta
import random
import math

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'koda_db')]

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
    per_km_rate: float = 120.0
    per_min_rate: float = 20.0
    fare: float
    surge_multiplier: float = 1.0
    status: str = "pending"  # pending, accepted, ongoing, completed, cancelled
    payment_method: str = "cash"  # cash, card, wallet
    payment_status: str = "pending"  # pending, completed
    rider_rating: Optional[float] = None
    driver_rating: Optional[float] = None
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

class LoginRequest(BaseModel):
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

class LocationUpdate(BaseModel):
    latitude: float
    longitude: float

class TripRequest(BaseModel):
    pickup_lat: float
    pickup_lng: float
    pickup_address: str
    dropoff_lat: float
    dropoff_lng: float
    dropoff_address: str
    payment_method: str = "cash"

class FareEstimateRequest(BaseModel):
    pickup_lat: float
    pickup_lng: float
    dropoff_lat: float
    dropoff_lng: float

class RatingRequest(BaseModel):
    rating: float
    comment: Optional[str] = None

class SubscriptionRequest(BaseModel):
    payment_method: str  # card, bank_transfer, ussd, wallet

# ==================== HELPER FUNCTIONS ====================

def calculate_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance between two points using Haversine formula"""
    R = 6371  # Earth's radius in km
    
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)
    
    a = math.sin(delta_lat/2)**2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    
    return R * c

def calculate_fare(distance_km: float, duration_mins: int, base_fare: float = 800.0, per_km: float = 120.0, per_min: float = 20.0) -> dict:
    """Calculate fare based on KODA pricing model"""
    distance_fare = distance_km * per_km
    time_fare = duration_mins * per_min
    total = base_fare + distance_fare + time_fare
    
    # Apply surge (capped at 20%)
    surge = 1.0
    # In real app, this would check demand/supply ratio
    
    final_fare = total * surge
    
    # Apply price band limits
    min_fare = total * 0.9
    max_fare = total * 1.2
    final_fare = max(min_fare, min(final_fare, max_fare))
    
    return {
        "base_fare": base_fare,
        "distance_fare": round(distance_fare, 2),
        "time_fare": round(time_fare, 2),
        "surge_multiplier": surge,
        "total_fare": round(final_fare, 2),
        "min_fare": round(min_fare, 2),
        "max_fare": round(max_fare, 2)
    }

def generate_otp() -> str:
    """Generate 6-digit OTP"""
    return str(random.randint(100000, 999999))

# Store OTPs temporarily (in production, use Redis)
otp_store = {}

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
        # Update user verification status
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
    # Check if user already exists
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
        # Create profile if doesn't exist
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
    # Check subscription status first
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
    
    # Get trip stats
    completed_trips = await db.trips.count_documents({
        "driver_id": user_id,
        "status": "completed"
    })
    
    # Calculate earnings (sum of all completed trip fares)
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
    # Check for existing active subscription
    existing = await db.subscriptions.find_one({
        "driver_id": driver_id,
        "status": "active"
    })
    
    if existing:
        raise HTTPException(
            status_code=400, 
            detail="Active subscription already exists"
        )
    
    # In production, process payment here
    # For MVP, we simulate successful payment
    
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
async def estimate_fare(request: FareEstimateRequest):
    """Estimate fare for a trip"""
    distance = calculate_distance(
        request.pickup_lat, request.pickup_lng,
        request.dropoff_lat, request.dropoff_lng
    )
    
    # Estimate duration (assuming average 30 km/h in Lagos traffic)
    duration_mins = int((distance / 30) * 60)
    duration_mins = max(5, duration_mins)  # Minimum 5 minutes
    
    fare_details = calculate_fare(distance, duration_mins)
    
    return {
        "distance_km": round(distance, 2),
        "duration_mins": duration_mins,
        **fare_details
    }

@api_router.post("/trips/request")
async def request_trip(rider_id: str, request: TripRequest):
    """Request a new trip"""
    # Calculate distance and fare
    distance = calculate_distance(
        request.pickup_lat, request.pickup_lng,
        request.dropoff_lat, request.dropoff_lng
    )
    
    duration_mins = int((distance / 30) * 60)
    duration_mins = max(5, duration_mins)
    
    fare_details = calculate_fare(distance, duration_mins)
    
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
        distance_km=round(distance, 2),
        duration_mins=duration_mins,
        fare=fare_details["total_fare"],
        surge_multiplier=fare_details["surge_multiplier"],
        payment_method=request.payment_method
    )
    
    await db.trips.insert_one(trip.dict())
    
    return {
        "message": "Trip requested",
        "trip": trip.dict()
    }

@api_router.get("/trips/pending")
async def get_pending_trips(driver_lat: float, driver_lng: float):
    """Get pending trips near driver"""
    # Get all pending trips
    trips = await db.trips.find({"status": "pending"}).to_list(50)
    
    # Filter and sort by distance from driver
    nearby_trips = []
    for trip in trips:
        pickup = trip["pickup_location"]
        distance = calculate_distance(
            driver_lat, driver_lng,
            pickup["lat"], pickup["lng"]
        )
        if distance <= 10:  # Within 10km
            trip["_id"] = str(trip["_id"])
            trip["distance_to_pickup"] = round(distance, 2)
            nearby_trips.append(trip)
    
    # Sort by distance
    nearby_trips.sort(key=lambda x: x["distance_to_pickup"])
    
    return nearby_trips[:10]  # Return top 10

@api_router.put("/trips/{trip_id}/accept")
async def accept_trip(trip_id: str, driver_id: str):
    """Driver accepts a trip"""
    # Check driver subscription
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
    
    # Update driver stats
    if trip.get("driver_id"):
        await db.users.update_one(
            {"id": trip["driver_id"]},
            {"$inc": {"total_trips": 1}}
        )
    
    # Update rider stats
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
    
    # Update driver cancellation count if driver cancelled
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
    
    # Determine if rater is rider or driver
    update_field = "driver_rating" if rater_id == trip["rider_id"] else "rider_rating"
    rated_user_id = trip["driver_id"] if rater_id == trip["rider_id"] else trip["rider_id"]
    
    await db.trips.update_one(
        {"id": trip_id},
        {"$set": {update_field: request.rating}}
    )
    
    # Update user's average rating
    if rated_user_id:
        # Get all ratings for this user
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
        # Create wallet if doesn't exist
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
        # Create wallet if doesn't exist
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

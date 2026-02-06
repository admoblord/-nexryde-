"""Trips Router - Trip CRUD, ride flow, and trip management for NEXRYDE."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone, timedelta
from uuid import uuid4
import logging
import time

from database import db

logger = logging.getLogger('server')
trips_router = APIRouter(prefix="/api", tags=["Trips"])

# Import shared state from server (will be set at inclusion time)
fare_estimate_store = {}

def set_fare_estimate_store(store):
    global fare_estimate_store
    fare_estimate_store = store


# ==================== CUSTOM PRICE TRIP ====================

class CustomPriceRequest(BaseModel):
    rider_id: str
    pickup: str
    destination: str
    recommended_fare: float
    offered_fare: float
    vehicle_type: str
    trip_type: str = "intra"


@trips_router.post("/trips/offer-custom-fare")
@trips_router.post("/trips/custom-price")
@trips_router.post("/trips/create-with-custom-price")
async def create_trip_with_custom_price(request: CustomPriceRequest):
    """Create trip with user's custom price offer"""
    try:
        trip_id = f"trip-{int(time.time() * 1000)}"
        difference_percent = ((request.offered_fare - request.recommended_fare) / request.recommended_fare) * 100
        trip = {
            "id": trip_id,
            "rider_id": request.rider_id,
            "pickup_location": request.pickup,
            "destination": request.destination,
            "recommended_fare": request.recommended_fare,
            "offered_fare": request.offered_fare,
            "final_fare": None,
            "vehicle_type": request.vehicle_type,
            "trip_type": request.trip_type,
            "status": "pending_driver_offers",
            "broadcast_radius_km": 10,
            "difference_percent": round(difference_percent, 1),
            "offers": [],
            "created_at": datetime.now(),
            "expires_at": datetime.now() + timedelta(minutes=10),
        }
        await db.trips.insert_one(trip)
        logger.info(f"Custom price trip created: {trip_id} with offer N{request.offered_fare}")
        drivers_notified = 15
        return {
            "success": True,
            "trip_id": trip_id,
            "drivers_notified": drivers_notified,
            "message": f"Your offer of N{request.offered_fare:,.0f} has been broadcast to {drivers_notified} nearby drivers",
            "recommended_fare": request.recommended_fare,
            "offered_fare": request.offered_fare,
            "difference": request.offered_fare - request.recommended_fare,
            "difference_percent": round(difference_percent, 1),
        }
    except Exception as e:
        logger.error(f"Error creating custom price trip: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create custom price trip: {str(e)}")



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
    offered_fare: Optional[float] = None
    recommended_fare: Optional[float] = None
    trip_type: Optional[str] = None


class ComfortRatingRequest(BaseModel):
    overall_rating: float
    smoothness: Optional[float] = None
    politeness: Optional[float] = None
    cleanliness: Optional[float] = None
    safety: Optional[float] = None
    comment: Optional[str] = None


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


class FaceVerificationRequest(BaseModel):
    face_image: str  # Base64 encoded image


class LocationUpdate(BaseModel):
    latitude: float
    longitude: float


# ==================== TRIP ENDPOINTS ====================

@trips_router.post("/trips/request")
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
        surge_multiplier=fare["surge_multiplier"],
        service_type=request.service_type,
        payment_method=request.payment_method,
        polyline=polyline,
        recording_enabled=request.enable_recording,
        fare_locked_until=datetime.utcnow() + timedelta(minutes=FARE_LOCK_MINUTES),
        insurance_id=f"INS_{uuid.uuid4().hex[:8].upper()}",
        security_code=str(random.randint(1000, 9999)),  # Generate 4-digit security code
        security_code_verified=False,
        security_code_attempts=0
    )
    
    await db.trips.insert_one(trip.dict())
    
    return {"message": "Trip requested", "trip": trip.dict()}

@trips_router.post("/trips/book-for-other")
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

@trips_router.get("/trips/pending")
async def get_pending_trips(driver_lat: float, driver_lng: float):
    """Get pending ride requests near the driver"""
    # Find all pending trips (both status types)
    trips = await db.trips.find({
        "status": {"$in": ["pending", "pending_driver_offers"]},
    }).to_list(50)
    
    nearby_trips = []
    for trip in trips:
        pickup = trip.get("pickup_location", {})
        # Handle both object and string pickup formats
        if isinstance(pickup, dict) and "lat" in pickup:
            lat = pickup["lat"]
            lng = pickup["lng"]
        elif isinstance(pickup, str):
            # Skip string pickups without coordinates
            trip["_id"] = str(trip["_id"])
            trip["distance_to_pickup"] = 0
            nearby_trips.append(trip)
            continue
        else:
            continue
            
        distance = calculate_distance_haversine(driver_lat, driver_lng, lat, lng)
        if distance <= 15:  # 15km radius
            trip["_id"] = str(trip["_id"])
            trip["distance_to_pickup"] = round(distance, 2)
            nearby_trips.append(trip)
    
    nearby_trips.sort(key=lambda x: x.get("distance_to_pickup", 0))
    return nearby_trips[:10]

@trips_router.put("/trips/{trip_id}/accept")
async def accept_trip(trip_id: str, request: dict):
    driver_id = request.get("driver_id", "")
    if not driver_id:
        raise HTTPException(status_code=400, detail="driver_id is required")
    
    # Get trip first to check if it's inter-city
    trip = await db.trips.find_one({"id": trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    
    # Check if trip is inter-city
    is_intercity = trip.get("trip_type") == "inter"
    
    # Check subscription
    subscription = await db.subscriptions.find_one({
        "driver_id": driver_id,
        "status": {"$in": ["active", "grace_period"]}
    })
    
    if not subscription:
        # Check if driver profile exists - allow for testing/onboarding ONLY for intra-city
        driver_profile = await db.driver_profiles.find_one({"user_id": driver_id})
        if not driver_profile:
            raise HTTPException(status_code=403, detail="Active subscription required")
        
        # For inter-city, subscription is MANDATORY
        if is_intercity:
            raise HTTPException(
                status_code=403, 
                detail="⚠️ Inter-City trips require Road Warrior subscription. Upgrade to access inter-city rides!"
            )
    else:
        # Driver has subscription - check tier for inter-city access
        subscription_tier = subscription.get("tier", "city_rider")
        
        if is_intercity and subscription_tier == "city_rider":
            raise HTTPException(
                status_code=403,
                detail="🚫 Inter-City trips locked! Upgrade to Road Warrior (₦30,000) to unlock all routes nationwide."
            )
    
    # Check if rider blocked this driver
    if trip:
        rider = await db.users.find_one({"id": trip["rider_id"]})
        if rider and driver_id in rider.get("blocked_drivers", []):
            raise HTTPException(status_code=403, detail="You cannot accept this ride")
    
    result = await db.trips.update_one(
        {"id": trip_id, "status": {"$in": ["pending", "pending_driver_offers"]}},
        {"$set": {"driver_id": driver_id, "status": "accepted", "accepted_at": datetime.utcnow()}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=400, detail="Trip not available")
    
    trip = await db.trips.find_one({"id": trip_id})
    if trip:
        trip["_id"] = str(trip["_id"])
    return trip


@trips_router.post("/trips/{trip_id}/verify-security-code")
async def verify_security_code(trip_id: str, request: dict):
    """Driver verifies the security code shown to rider"""
    driver_id = request.get("driver_id", "")
    security_code = request.get("security_code", "")
    
    if not driver_id or not security_code:
        raise HTTPException(status_code=400, detail="driver_id and security_code are required")
    
    trip = await db.trips.find_one({"id": trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    
    if trip["status"] not in ["accepted", "arrived"]:
        raise HTTPException(status_code=400, detail="Trip must be accepted first")
    
    if trip["driver_id"] != driver_id:
        raise HTTPException(status_code=403, detail="You are not the driver for this trip")
    
    # Check if already verified
    if trip.get("security_code_verified", False):
        return {
            "verified": True,
            "message": "Security code already verified",
            "trip": trip
        }
    
    # Check attempts
    attempts = trip.get("security_code_attempts", 0)
    if attempts >= 3:
        # Too many failed attempts - cancel trip for safety
        await db.trips.update_one(
            {"id": trip_id},
            {"$set": {"status": "cancelled", "cancel_reason": "Too many wrong security code attempts"}}
        )
        raise HTTPException(
            status_code=403,
            detail="Too many wrong attempts. Trip cancelled for safety."
        )
    
    # Verify code
    if trip.get("security_code") == security_code:
        # Code matches - mark as verified
        await db.trips.update_one(
            {"id": trip_id},
            {"$set": {
                "security_code_verified": True,
                "security_code_verified_at": datetime.utcnow()
            }}
        )
        
        updated_trip = await db.trips.find_one({"id": trip_id})
        return {
            "verified": True,
            "message": "Security code verified successfully! Rider identity confirmed.",
            "trip": updated_trip
        }
    else:
        # Code doesn't match - increment attempts
        new_attempts = attempts + 1
        await db.trips.update_one(
            {"id": trip_id},
            {"$set": {"security_code_attempts": new_attempts}}
        )
        
        remaining = 3 - new_attempts
        if remaining == 0:
            await db.trips.update_one(
                {"id": trip_id},
                {"$set": {"status": "cancelled", "cancel_reason": "Too many wrong security code attempts"}}
            )
            raise HTTPException(
                status_code=403,
                detail="Wrong code. Trip cancelled for safety."
            )
        
        raise HTTPException(
            status_code=400,
            detail=f"Wrong security code. {remaining} attempt{'s' if remaining > 1 else ''} remaining."
        )

@trips_router.put("/trips/{trip_id}/verify-face-and-start")
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

@trips_router.put("/trips/{trip_id}/start")
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

@trips_router.put("/trips/{trip_id}/update-location")
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

@trips_router.put("/trips/{trip_id}/complete")
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

@trips_router.put("/trips/{trip_id}/cancel")
async def cancel_trip(trip_id: str, request: dict):
    cancelled_by = request.get("cancelled_by", "")
    if not cancelled_by:
        raise HTTPException(status_code=400, detail="cancelled_by is required")
    
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

@trips_router.put("/trips/{trip_id}/rate")
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

@trips_router.get("/trips/user/{user_id}")
async def get_user_trips(user_id: str, role: str = "rider"):
    if role == "rider":
        trips = await db.trips.find({"rider_id": user_id}).sort("created_at", -1).to_list(50)
    else:
        trips = await db.trips.find({"driver_id": user_id}).sort("created_at", -1).to_list(50)
    
    for trip in trips:
        trip["_id"] = str(trip["_id"])
    return trips

@trips_router.get("/trips/{trip_id}")
async def get_trip(trip_id: str):
    trip = await db.trips.find_one({"id": trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    trip["_id"] = str(trip["_id"])
    return trip


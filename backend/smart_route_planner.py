"""
Smart Route Planner - Eliminate Empty Return Trips
Rule-based matching system to find return passengers for drivers
Maximizes driver earnings by ensuring they never travel empty
"""

from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel
import os
import asyncio
import json

# ==================== CONFIGURATION ====================

MATCH_EXPIRY_MINUTES = 5  # Driver has 5 minutes to accept match
WAIT_BONUS_TIERS = {
    60: 5000,   # Wait 1 hour → ₦5,000 bonus
    180: 10000  # Wait 3 hours → ₦10,000 bonus
}

# ==================== MODELS ====================

class DriverLocation(BaseModel):
    driver_id: str
    current_city: str
    current_lat: float
    current_lng: float
    available_for_return: bool = False
    arrived_at: datetime
    willing_to_wait: bool = False
    max_wait_hours: int = 0
    last_trip_origin: str
    last_trip_destination: str

class RouteBookingQueue(BaseModel):
    booking_id: str
    rider_id: str
    pickup_city: str
    pickup_lat: float
    pickup_lng: float
    dropoff_city: str
    dropoff_lat: float
    dropoff_lng: float
    requested_at: datetime
    flexible_time: bool = False
    max_wait_minutes: int = 0
    estimated_fare: float = 0.0
    status: str = "pending"  # pending, matched, expired

class RouteMatch(BaseModel):
    match_id: str
    driver_id: str
    booking_id: str
    origin_city: str
    destination_city: str
    match_score: float
    wait_time_minutes: int
    bonus_amount: int
    status: str = "pending"  # pending, accepted, declined, expired
    created_at: datetime
    expires_at: datetime

# ==================== ROUTER ====================

route_planner_router = APIRouter(prefix="/api/smart-route-planner", tags=["smart-route-planner"])

# Database helper
def get_db():
    mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
    client = AsyncIOMotorClient(mongo_url)
    return client[os.environ.get('DB_NAME', 'nexryde_db')]

# Active WebSocket connections for real-time notifications
active_connections: Dict[str, WebSocket] = {}

# ==================== SMART ROUTE PLANNER SERVICE ====================

class SmartRoutePlannerService:
    """
    Service to match drivers with return passengers
    """
    
    @staticmethod
    async def find_return_match(driver_id: str, completed_trip_id: str) -> Dict[str, Any]:
        """
        Find return passenger for driver after completing a trip
        """
        db = get_db()
        
        # Get completed trip details
        trip = await db.trips.find_one({"_id": completed_trip_id})
        if not trip:
            return {"success": False, "message": "Trip not found"}
        
        driver_destination = trip["dropoff_city"]
        driver_origin = trip["pickup_city"]
        driver_location = {
            "lat": trip["dropoff_lat"],
            "lng": trip["dropoff_lng"]
        }
        
        # Mark driver as available for return
        now = datetime.utcnow()
        await db.driver_locations.update_one(
            {"driver_id": driver_id},
            {
                "$set": {
                    "current_city": driver_destination,
                    "current_lat": driver_location["lat"],
                    "current_lng": driver_location["lng"],
                    "available_for_return": True,
                    "arrived_at": now,
                    "last_trip_origin": driver_origin,
                    "last_trip_destination": driver_destination,
                    "updated_at": now
                }
            },
            upsert=True
        )
        
        # Search for return bookings (destination → origin)
        return_bookings = await db.route_booking_queue.find({
            "pickup_city": driver_destination,
            "dropoff_city": driver_origin,
            "status": "pending"
        }).sort("requested_at", 1).to_list(10)
        
        if not return_bookings:
            # No exact match - search nearby cities (within 100km)
            return_bookings = await SmartRoutePlannerService.find_nearby_routes(
                db,
                driver_destination,
                driver_origin,
                driver_location
            )
        
        # Score and rank matches
        matches = []
        for booking in return_bookings:
            score = await SmartRoutePlannerService.calculate_match_score(
                db,
                driver_id,
                booking,
                driver_destination
            )
            matches.append({
                "booking": booking,
                "score": score
            })
        
        # Sort by score (highest first)
        matches.sort(key=lambda x: x["score"], reverse=True)
        
        if matches:
            best_match = matches[0]
            booking = best_match["booking"]
            
            # Calculate wait time and bonus
            booking_time = booking["requested_at"]
            wait_minutes = max(0, int((booking_time - now).total_seconds() / 60))
            
            # Offer bonus for waiting
            bonus = 0
            for wait_threshold, bonus_amount in sorted(WAIT_BONUS_TIERS.items()):
                if wait_minutes >= wait_threshold:
                    bonus = bonus_amount
            
            # Create match record
            match_id = f"MATCH-{driver_id}-{int(now.timestamp())}"
            match = {
                "match_id": match_id,
                "driver_id": driver_id,
                "booking_id": booking["booking_id"],
                "origin_city": driver_destination,
                "destination_city": driver_origin,
                "match_score": best_match["score"],
                "wait_time_minutes": wait_minutes,
                "bonus_amount": bonus,
                "estimated_fare": booking.get("estimated_fare", 0),
                "status": "pending",
                "created_at": now,
                "expires_at": now + timedelta(minutes=MATCH_EXPIRY_MINUTES)
            }
            
            await db.route_matches.insert_one(match)
            
            # Notify driver (real-time)
            await SmartRoutePlannerService.notify_driver_of_match(driver_id, match)
            
            return {
                "success": True,
                "match_found": True,
                "match": match
            }
        
        # No match found - offer wait options
        return await SmartRoutePlannerService.offer_wait_options(driver_id, driver_destination, driver_origin)
    
    @staticmethod
    async def find_nearby_routes(db, driver_city: str, driver_origin: str, location: dict) -> List[dict]:
        """
        Find bookings in nearby cities (within 100km radius)
        """
        # Simple distance calculation (approximate)
        # In production, use proper geospatial queries
        bookings = await db.route_booking_queue.find({
            "status": "pending",
            "dropoff_city": driver_origin  # Same destination
        }).to_list(20)
        
        # Filter by distance
        nearby = []
        for booking in bookings:
            distance = SmartRoutePlannerService.calculate_distance(
                location["lat"], location["lng"],
                booking["pickup_lat"], booking["pickup_lng"]
            )
            if distance <= 100:  # Within 100km
                booking["distance_km"] = distance
                nearby.append(booking)
        
        return nearby
    
    @staticmethod
    def calculate_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
        """
        Calculate distance between two points in kilometers
        """
        import math
        
        R = 6371  # Earth radius in km
        dLat = math.radians(lat2 - lat1)
        dLng = math.radians(lng2 - lng1)
        
        a = (math.sin(dLat / 2) ** 2 +
             math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
             math.sin(dLng / 2) ** 2)
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        
        return R * c
    
    @staticmethod
    async def calculate_match_score(db, driver_id: str, booking: dict, driver_location: str) -> float:
        """
        Calculate match score (0-100)
        Higher score = better match
        """
        score = 50  # Base score
        
        # Factor 1: Exact route match (+30)
        if booking["pickup_city"] == driver_location:
            score += 30
        
        # Factor 2: Time urgency (+20 if ASAP)
        if not booking.get("flexible_time", False):
            score += 20
        
        # Factor 3: High-value trip (+10 if ₦70K+)
        if booking.get("estimated_fare", 0) >= 70000:
            score += 10
        
        # Factor 4: Rider rating (+10 if 4.5+)
        rider = await db.users.find_one({"_id": booking["rider_id"]})
        if rider and rider.get("rating", 0) >= 4.5:
            score += 10
        
        # Factor 5: Driver preference (+15 if done this route before)
        past_trips = await db.trips.count_documents({
            "driver_id": driver_id,
            "pickup_city": booking["pickup_city"],
            "dropoff_city": booking["dropoff_city"]
        })
        if past_trips > 0:
            score += 15
        
        return min(100, score)
    
    @staticmethod
    async def notify_driver_of_match(driver_id: str, match: dict):
        """
        Send real-time notification to driver about match
        """
        bonus_text = f" + ₦{match['bonus_amount']:,} bonus" if match['bonus_amount'] > 0 else ""
        wait_text = f" (wait {match['wait_time_minutes']} min)" if match['wait_time_minutes'] > 0 else " (READY NOW)"
        
        notification = {
            "type": "route_match",
            "title": "🎉 Return Passenger Found!",
            "message": f"{match['origin_city']} → {match['destination_city']}{wait_text}{bonus_text}",
            "match_id": match["match_id"],
            "data": match,
            "expires_in_minutes": MATCH_EXPIRY_MINUTES
        }
        
        # Send via WebSocket if connected
        if driver_id in active_connections:
            try:
                await active_connections[driver_id].send_json(notification)
                print(f"✅ Sent match notification to driver {driver_id}")
            except Exception as e:
                print(f"❌ Failed to send notification: {str(e)}")
        
        # Also save to database for persistence
        db = get_db()
        await db.notifications.insert_one({
            "driver_id": driver_id,
            "notification": notification,
            "read": False,
            "created_at": datetime.utcnow()
        })
    
    @staticmethod
    async def offer_wait_options(driver_id: str, current_city: str, destination_city: str) -> Dict[str, Any]:
        """
        No immediate match - offer driver wait options with bonuses
        """
        options = [
            {
                "wait_hours": 1,
                "bonus": 5000,
                "message": "Wait 1 hour for ₦5,000 bonus?"
            },
            {
                "wait_hours": 3,
                "bonus": 10000,
                "message": "Wait 3 hours for ₦10,000 bonus?"
            },
            {
                "wait_hours": 0,
                "bonus": 0,
                "message": "Return empty (no bonus)"
            }
        ]
        
        # Send notification
        notification = {
            "type": "wait_offer",
            "title": "No immediate return match",
            "message": "Would you like to wait for a passenger?",
            "route": f"{current_city} → {destination_city}",
            "options": options
        }
        
        if driver_id in active_connections:
            try:
                await active_connections[driver_id].send_json(notification)
            except Exception as e:
                print(f"❌ Failed to send wait offer: {str(e)}")
        
        return {
            "success": True,
            "match_found": False,
            "wait_options": options,
            "message": "No immediate match available. Would you like to wait?"
        }


# ==================== API ENDPOINTS ====================

@route_planner_router.post("/find-return-match")
async def find_return_match_endpoint(driver_id: str, completed_trip_id: str):
    """
    Find return passenger for driver after completing a trip
    """
    result = await SmartRoutePlannerService.find_return_match(driver_id, completed_trip_id)
    return result


@route_planner_router.post("/accept-match/{match_id}")
async def accept_match(match_id: str, driver_id: str):
    """
    Driver accepts a route match
    """
    db = get_db()
    
    # Get match
    match = await db.route_matches.find_one({"match_id": match_id})
    if not match:
        raise HTTPException(404, "Match not found")
    
    # Check if expired
    if datetime.utcnow() > match["expires_at"]:
        await db.route_matches.update_one(
            {"match_id": match_id},
            {"$set": {"status": "expired"}}
        )
        raise HTTPException(410, "Match expired")
    
    # Check if already accepted/declined
    if match["status"] != "pending":
        raise HTTPException(400, f"Match already {match['status']}")
    
    # Accept match
    await db.route_matches.update_one(
        {"match_id": match_id},
        {"$set": {"status": "accepted", "accepted_at": datetime.utcnow()}}
    )
    
    # Update booking status
    await db.route_booking_queue.update_one(
        {"booking_id": match["booking_id"]},
        {"$set": {"status": "matched", "matched_driver_id": driver_id}}
    )
    
    # Create trip assignment
    trip_id = f"TRIP-{driver_id}-{int(datetime.utcnow().timestamp())}"
    # ... create trip in database ...
    
    return {
        "success": True,
        "message": "Match accepted! Trip assigned.",
        "trip_id": trip_id,
        "bonus_amount": match.get("bonus_amount", 0)
    }


@route_planner_router.post("/decline-match/{match_id}")
async def decline_match(match_id: str, driver_id: str):
    """
    Driver declines a route match
    """
    db = get_db()
    
    await db.route_matches.update_one(
        {"match_id": match_id},
        {"$set": {"status": "declined", "declined_at": datetime.utcnow()}}
    )
    
    return {
        "success": True,
        "message": "Match declined"
    }


@route_planner_router.post("/set-wait-preference")
async def set_wait_preference(driver_id: str, wait_hours: int):
    """
    Driver chooses to wait for a return passenger
    """
    db = get_db()
    
    await db.driver_locations.update_one(
        {"driver_id": driver_id},
        {
            "$set": {
                "willing_to_wait": True,
                "max_wait_hours": wait_hours,
                "wait_started_at": datetime.utcnow(),
                "wait_expires_at": datetime.utcnow() + timedelta(hours=wait_hours)
            }
        }
    )
    
    bonus = WAIT_BONUS_TIERS.get(wait_hours * 60, 0)
    
    return {
        "success": True,
        "message": f"Wait preference set: {wait_hours} hour(s)",
        "bonus_if_matched": bonus
    }


@route_planner_router.get("/driver/stats/{driver_id}")
async def get_driver_route_stats(driver_id: str):
    """
    Get driver's Smart Route Planner statistics
    """
    db = get_db()
    
    # Total matches
    total_matches = await db.route_matches.count_documents({"driver_id": driver_id})
    accepted_matches = await db.route_matches.count_documents({"driver_id": driver_id, "status": "accepted"})
    
    # Bonuses earned
    bonuses = await db.route_matches.aggregate([
        {"$match": {"driver_id": driver_id, "status": "accepted"}},
        {"$group": {"_id": None, "total_bonus": {"$sum": "$bonus_amount"}}}
    ]).to_list(1)
    
    total_bonus = bonuses[0]["total_bonus"] if bonuses else 0
    
    # Empty returns (trips without return match)
    total_trips = await db.trips.count_documents({"driver_id": driver_id, "status": "completed"})
    empty_returns = total_trips - accepted_matches
    
    return {
        "total_matches_offered": total_matches,
        "matches_accepted": accepted_matches,
        "acceptance_rate": (accepted_matches / total_matches * 100) if total_matches > 0 else 0,
        "total_bonus_earned": total_bonus,
        "empty_returns": max(0, empty_returns),
        "money_saved_on_fuel": accepted_matches * 40000  # Estimate ₦40K fuel saved per return trip
    }


@route_planner_router.websocket("/ws/{driver_id}")
async def websocket_endpoint(websocket: WebSocket, driver_id: str):
    """
    WebSocket connection for real-time route match notifications
    """
    await websocket.accept()
    active_connections[driver_id] = websocket
    
    print(f"✅ Driver {driver_id} connected to Smart Route Planner")
    
    try:
        while True:
            # Keep connection alive
            data = await websocket.receive_text()
            # Echo back (heartbeat)
            await websocket.send_json({"type": "heartbeat", "status": "connected"})
            
    except WebSocketDisconnect:
        print(f"❌ Driver {driver_id} disconnected")
        if driver_id in active_connections:
            del active_connections[driver_id]


# Export router
__all__ = ['route_planner_router', 'SmartRoutePlannerService']

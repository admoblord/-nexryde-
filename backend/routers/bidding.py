"""Bidding Router - Ride bidding, scheduling, split fare, and delivery for NEXRYDE."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone, timedelta
from uuid import uuid4
import logging
import uuid

from database import db

logger = logging.getLogger('server')
bidding_router = APIRouter(prefix="/api", tags=["Bidding"])

class BidRequest(BaseModel):
    rider_offered_price: float
    pickup_lat: float
    pickup_lng: float
    dropoff_lat: float
    dropoff_lng: float
    pickup_address: str
    dropoff_address: str
    ride_type: str = "economy"

@bidding_router.post("/rides/bid/create")
async def create_ride_bid(request: BidRequest, rider_id: str):
    """Rider creates a bid request with their offered price"""
    surge = calculate_surge_multiplier(request.pickup_lat, request.pickup_lng)
    
    bid = {
        "id": str(uuid.uuid4()),
        "rider_id": rider_id,
        "rider_offered_price": request.rider_offered_price,
        "pickup": {"lat": request.pickup_lat, "lng": request.pickup_lng, "address": request.pickup_address},
        "dropoff": {"lat": request.dropoff_lat, "lng": request.dropoff_lng, "address": request.dropoff_address},
        "ride_type": request.ride_type,
        "surge_multiplier": surge["multiplier"],
        "status": "open",
        "driver_bids": [],
        "accepted_driver_id": None,
        "accepted_price": None,
        "created_at": datetime.utcnow(),
        "expires_at": datetime.utcnow() + timedelta(minutes=5)
    }
    
    await db.ride_bids.insert_one(bid)
    
    return {"bid_id": bid["id"], "status": "open", "expires_in_minutes": 5, "surge_multiplier": surge["multiplier"]}

@bidding_router.post("/rides/bid/{bid_id}/driver-offer")
async def driver_make_offer(bid_id: str, driver_id: str, counter_price: float, message: Optional[str] = None):
    """Driver makes a counter-offer"""
    bid = await db.ride_bids.find_one({"id": bid_id, "status": "open"})
    if not bid:
        raise HTTPException(status_code=404, detail="Bid not found or closed")
    
    driver = await db.users.find_one({"id": driver_id, "role": "driver"})
    
    offer = {
        "offer_id": str(uuid.uuid4()),
        "driver_id": driver_id,
        "driver_name": driver.get("name", "Driver") if driver else "Driver",
        "driver_rating": driver.get("rating", 5.0) if driver else 5.0,
        "counter_price": counter_price,
        "message": message,
        "created_at": datetime.utcnow()
    }
    
    await db.ride_bids.update_one({"id": bid_id}, {"$push": {"driver_bids": offer}})
    return {"success": True, "offer_id": offer["offer_id"]}

@bidding_router.post("/rides/bid/{bid_id}/accept")
async def accept_driver_offer(bid_id: str, rider_id: str, offer_id: str):
    """Rider accepts a driver's offer"""
    bid = await db.ride_bids.find_one({"id": bid_id, "rider_id": rider_id})
    if not bid:
        raise HTTPException(status_code=404, detail="Bid not found")
    
    accepted_offer = next((o for o in bid.get("driver_bids", []) if o["offer_id"] == offer_id), None)
    if not accepted_offer:
        raise HTTPException(status_code=404, detail="Offer not found")
    
    await db.ride_bids.update_one({"id": bid_id}, {"$set": {
        "status": "accepted",
        "accepted_driver_id": accepted_offer["driver_id"],
        "accepted_price": accepted_offer["counter_price"]
    }})
    
    trip = {
        "id": str(uuid.uuid4()),
        "bid_id": bid_id,
        "rider_id": rider_id,
        "driver_id": accepted_offer["driver_id"],
        "pickup": bid["pickup"],
        "dropoff": bid["dropoff"],
        "fare": accepted_offer["counter_price"],
        "ride_type": bid["ride_type"],
        "status": "accepted",
        "created_at": datetime.utcnow()
    }
    await db.trips.insert_one(trip)
    
    return {"success": True, "trip_id": trip["id"], "agreed_price": accepted_offer["counter_price"]}

@bidding_router.get("/rides/bid/open")
async def get_open_bids(lat: float, lng: float):
    """Get open bids for drivers"""
    bids = await db.ride_bids.find({"status": "open", "expires_at": {"$gt": datetime.utcnow()}}).limit(20).to_list(20)
    return {"bids": [{"bid_id": b["id"], "rider_offered_price": b["rider_offered_price"], 
                      "pickup_address": b["pickup"]["address"], "dropoff_address": b["dropoff"]["address"]} for b in bids]}


class ScheduledRideRequest(BaseModel):
    pickup_lat: float
    pickup_lng: float
    pickup_address: str
    dropoff_lat: float
    dropoff_lng: float
    dropoff_address: str
    scheduled_time: datetime
    ride_type: str = "economy"

@bidding_router.post("/rides/schedule")
async def schedule_ride(request: ScheduledRideRequest, rider_id: str):
    """Schedule a ride for future"""
    if request.scheduled_time < datetime.utcnow() + timedelta(minutes=30):
        raise HTTPException(status_code=400, detail="Schedule at least 30 minutes ahead")
    
    scheduled = {
        "id": str(uuid.uuid4()),
        "rider_id": rider_id,
        "pickup": {"lat": request.pickup_lat, "lng": request.pickup_lng, "address": request.pickup_address},
        "dropoff": {"lat": request.dropoff_lat, "lng": request.dropoff_lng, "address": request.dropoff_address},
        "scheduled_time": request.scheduled_time,
        "ride_type": request.ride_type,
        "status": "scheduled",
        "created_at": datetime.utcnow()
    }
    await db.scheduled_rides.insert_one(scheduled)
    return {"scheduled_ride_id": scheduled["id"], "scheduled_time": request.scheduled_time.isoformat()}

@bidding_router.get("/rides/scheduled/{rider_id}")
async def get_scheduled_rides(rider_id: str):
    """Get scheduled rides"""
    rides = await db.scheduled_rides.find({"rider_id": rider_id, "status": "scheduled"}).to_list(50)
    return {"scheduled_rides": [{"id": r["id"], "pickup_address": r["pickup"]["address"], 
                                 "scheduled_time": r["scheduled_time"].isoformat()} for r in rides]}


@bidding_router.post("/rides/{trip_id}/split-fare")
async def split_fare(trip_id: str, rider_id: str, phones: List[str]):
    """Split fare with friends"""
    trip = await db.trips.find_one({"id": trip_id, "rider_id": rider_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    
    per_person = round(trip.get("fare", 0) / (len(phones) + 1), 2)
    split = {
        "id": str(uuid.uuid4()),
        "trip_id": trip_id,
        "total_fare": trip.get("fare", 0),
        "per_person": per_person,
        "participants": [{"phone": p, "paid": False} for p in phones],
        "created_at": datetime.utcnow()
    }
    await db.split_fares.insert_one(split)
    return {"split_id": split["id"], "per_person": per_person, "num_participants": len(phones) + 1}


class PackageRequest(BaseModel):
    pickup_lat: float
    pickup_lng: float
    pickup_address: str
    dropoff_lat: float
    dropoff_lng: float
    dropoff_address: str
    recipient_name: str
    recipient_phone: str
    package_description: str
    package_size: str = "small"

@bidding_router.post("/delivery/request")
async def request_delivery(request: PackageRequest, sender_id: str):
    """Request package delivery"""
    size_surcharge = {"small": 0, "medium": 200, "large": 500}
    base_fare = 1500 + size_surcharge.get(request.package_size, 0)
    
    delivery = {
        "id": str(uuid.uuid4()),
        "sender_id": sender_id,
        "pickup": {"lat": request.pickup_lat, "lng": request.pickup_lng, "address": request.pickup_address},
        "dropoff": {"lat": request.dropoff_lat, "lng": request.dropoff_lng, "address": request.dropoff_address},
        "recipient": {"name": request.recipient_name, "phone": request.recipient_phone},
        "package": {"description": request.package_description, "size": request.package_size},
        "fare": base_fare,
        "pickup_code": str(random.randint(1000, 9999)),
        "delivery_code": str(random.randint(1000, 9999)),
        "status": "pending",
        "created_at": datetime.utcnow()
    }
    await db.deliveries.insert_one(delivery)
    return {"delivery_id": delivery["id"], "fare": base_fare, "pickup_code": delivery["pickup_code"]}


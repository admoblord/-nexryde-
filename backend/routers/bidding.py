"""Bidding Router - Ride bidding, scheduling, split fare, and delivery for NEXRYDE."""
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone, timedelta
from uuid import uuid4
import logging
import random
import uuid

from database import db
from auth_guard import require_authenticated, verify_owner_strict

logger = logging.getLogger('server')
bidding_router = APIRouter(prefix="/api", tags=["Bidding"])


def calculate_surge_multiplier(lat: float, lng: float) -> dict:
    """Calculate surge multiplier based on time and demand"""
    import random
    now = datetime.now(timezone.utc)
    hour = now.hour
    base = 1.0
    reasons = []
    peak_hours = {"morning": {"start": 7, "end": 9, "multiplier": 1.5}, "evening": {"start": 17, "end": 20, "multiplier": 1.8}}
    for period, cfg in peak_hours.items():
        if cfg["start"] <= hour < cfg["end"]:
            base = max(base, cfg["multiplier"])
            reasons.append(f"{period.title()} rush hour")
    demand = random.uniform(0.3, 0.9)
    if demand > 0.7:
        ds = 1 + (demand - 0.7) * 2
        if ds > base:
            base = ds
            reasons.append("High demand in area")
    return {"multiplier": round(min(base, 3.0), 2), "is_surge": base > 1.0, "reasons": reasons or ["Normal pricing"], "expires_in_minutes": 5}

class BidRequest(BaseModel):
    rider_offered_price: float
    pickup_lat: float
    pickup_lng: float
    dropoff_lat: float
    dropoff_lng: float
    pickup_address: str
    dropoff_address: str
    ride_type: str = "economy"


class SplitFareRequest(BaseModel):
    rider_id: str
    phones: List[str]


def _normalize_phone(raw: str) -> str:
    value = (raw or "").strip().replace(" ", "")
    digits = ''.join(ch for ch in value if ch.isdigit())
    if not digits:
        return ""
    if value.startswith('+'):
        return f"+{digits}"
    if digits.startswith('0'):
        return f"+234{digits[1:]}"
    if digits.startswith('234'):
        return f"+{digits}"
    return f"+234{digits}"

@bidding_router.post("/rides/bid/create")
async def create_ride_bid(request: BidRequest, rider_id: str, http_request: Request):
    """Rider creates a bid request with their offered price"""
    verify_owner_strict(http_request, rider_id)
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
async def driver_make_offer(bid_id: str, driver_id: str, counter_price: float, request: Request, message: Optional[str] = None):
    """Driver makes a counter-offer"""
    actor_id = require_authenticated(request)
    if actor_id != driver_id:
        raise HTTPException(status_code=403, detail="Not authorized")
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
async def accept_driver_offer(bid_id: str, rider_id: str, offer_id: str, request: Request):
    """Rider accepts a driver's offer"""
    verify_owner_strict(request, rider_id)
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


@bidding_router.get("/rides/bid/{bid_id}/offers")
async def get_bid_offers(bid_id: str, request: Request):
    """Get all driver offers for a specific bid."""
    actor_id = require_authenticated(request)
    bid = await db.ride_bids.find_one({"id": bid_id})
    if not bid:
        raise HTTPException(status_code=404, detail="Bid not found")
    offered_driver_ids = {o.get("driver_id") for o in bid.get("driver_bids", [])}
    if actor_id != bid.get("rider_id") and actor_id not in offered_driver_ids:
        raise HTTPException(status_code=403, detail="Not authorized to view this bid")
    return {"bid_id": bid_id, "status": bid.get("status", "open"), "offers": bid.get("driver_bids", [])}

@bidding_router.get("/rides/bid/open")
async def get_open_bids(lat: float, lng: float, request: Request):
    """Get open bids for drivers"""
    actor_id = require_authenticated(request)
    actor = await db.users.find_one({"id": actor_id}, {"_id": 0, "role": 1})
    if (actor or {}).get("role") != "driver":
        raise HTTPException(status_code=403, detail="Only drivers can view open bids")
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
async def schedule_ride(request: ScheduledRideRequest, rider_id: str, http_request: Request):
    """Schedule a ride for future"""
    verify_owner_strict(http_request, rider_id)
    scheduled_at = request.scheduled_time
    if scheduled_at.tzinfo is None:
        scheduled_at = scheduled_at.replace(tzinfo=timezone.utc)
    else:
        scheduled_at = scheduled_at.astimezone(timezone.utc)
    if scheduled_at < datetime.now(timezone.utc) + timedelta(minutes=30):
        raise HTTPException(status_code=400, detail="Schedule at least 30 minutes ahead")
    
    scheduled = {
        "id": str(uuid.uuid4()),
        "rider_id": rider_id,
        "pickup": {"lat": request.pickup_lat, "lng": request.pickup_lng, "address": request.pickup_address},
        "dropoff": {"lat": request.dropoff_lat, "lng": request.dropoff_lng, "address": request.dropoff_address},
        "scheduled_time": scheduled_at,
        "ride_type": request.ride_type,
        "status": "scheduled",
        "created_at": datetime.utcnow()
    }
    await db.scheduled_rides.insert_one(scheduled)
    return {"scheduled_ride_id": scheduled["id"], "scheduled_time": scheduled_at.isoformat()}

@bidding_router.get("/rides/scheduled/{rider_id}")
async def get_scheduled_rides(rider_id: str, request: Request):
    """Get scheduled rides"""
    verify_owner_strict(request, rider_id)
    rides = await db.scheduled_rides.find({"rider_id": rider_id, "status": "scheduled"}).to_list(50)
    return {
        "scheduled_rides": [
            {
                "id": r["id"],
                "pickup_address": (r.get("pickup") or {}).get("address", ""),
                "dropoff_address": (r.get("dropoff") or {}).get("address", ""),
                "pickup_lat": (r.get("pickup") or {}).get("lat"),
                "pickup_lng": (r.get("pickup") or {}).get("lng"),
                "dropoff_lat": (r.get("dropoff") or {}).get("lat"),
                "dropoff_lng": (r.get("dropoff") or {}).get("lng"),
                "scheduled_time": r["scheduled_time"].isoformat(),
                "status": r.get("status", "scheduled"),
                "ride_type": r.get("ride_type", "economy"),
            }
            for r in rides
        ]
    }


@bidding_router.delete("/rides/scheduled/{ride_id}/cancel")
async def cancel_scheduled_ride(ride_id: str, rider_id: str, request: Request):
    """Cancel a scheduled ride."""
    verify_owner_strict(request, rider_id)
    scheduled = await db.scheduled_rides.find_one({"id": ride_id, "rider_id": rider_id})
    if not scheduled:
        raise HTTPException(status_code=404, detail="Scheduled ride not found")
    if scheduled.get("status") != "scheduled":
        raise HTTPException(status_code=400, detail="Scheduled ride can no longer be cancelled")

    await db.scheduled_rides.update_one(
        {"id": ride_id},
        {
            "$set": {
                "status": "cancelled",
                "cancelled_at": datetime.utcnow(),
            }
        },
    )
    return {"success": True, "ride_id": ride_id, "status": "cancelled"}


@bidding_router.post("/rides/{trip_id}/split-fare")
async def split_fare(trip_id: str, body: SplitFareRequest, request: Request):
    """Split fare with friends"""
    rider_id = body.rider_id
    verify_owner_strict(request, rider_id)
    trip = await db.trips.find_one({"id": trip_id, "rider_id": rider_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    normalized_phones = []
    seen = set()
    for raw in body.phones or []:
        phone = _normalize_phone(raw)
        if not phone or phone in seen:
            continue
        seen.add(phone)
        normalized_phones.append(phone)
    if not normalized_phones:
        raise HTTPException(status_code=400, detail="Provide at least one valid phone number")
    if len(normalized_phones) > 4:
        raise HTTPException(status_code=400, detail="Maximum 4 split-fare participants")

    per_person = round(trip.get("fare", 0) / (len(normalized_phones) + 1), 2)
    split = {
        "id": str(uuid.uuid4()),
        "trip_id": trip_id,
        "rider_id": rider_id,
        "total_fare": trip.get("fare", 0),
        "per_person": per_person,
        "participants": [{"phone": p, "paid": False} for p in normalized_phones],
        "created_at": datetime.utcnow()
    }
    await db.split_fares.insert_one(split)
    return {"split_id": split["id"], "per_person": per_person, "num_participants": len(normalized_phones) + 1}


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
async def request_delivery(request: PackageRequest, http_request: Request, sender_id: Optional[str] = None):
    """Request package delivery"""
    actor_id = require_authenticated(http_request)
    if sender_id and sender_id != actor_id:
        raise HTTPException(status_code=403, detail="Not authorized to create delivery for another user")
    size_surcharge = {"small": 0, "medium": 200, "large": 500}
    base_fare = 1500 + size_surcharge.get(request.package_size, 0)
    
    delivery = {
        "id": str(uuid.uuid4()),
        "sender_id": actor_id,
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


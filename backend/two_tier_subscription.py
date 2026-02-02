"""
NexRyde Two-Tier Subscription System
City Rider (Intra-City) + Road Warrior (Inter-City/Interstate)
Phased Pricing with Route Caching & API Cost Protection
"""

from datetime import datetime, timedelta
from enum import Enum
from typing import Optional, Dict, Any, List
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException
from motor.motor_asyncio import AsyncIOMotorClient
import os

# ==================== ENUMS & CONSTANTS ====================

class SubscriptionTier(str, Enum):
    CITY_RIDER = "city_rider"
    ROAD_WARRIOR = "road_warrior"

class SubscriptionPhase(str, Enum):
    LAUNCH = "launch"
    EARLY = "early"
    GROWTH = "growth"
    PREMIUM = "premium"

class SubscriptionStatus(str, Enum):
    TRIAL = "trial"
    ACTIVE = "active"
    PAYMENT_REQUIRED = "payment_required"
    OVERDUE = "overdue"
    SUSPENDED = "suspended"

# Pricing Configuration - Two Tiers
CITY_RIDER_PRICES = {
    "launch": 15000,   # First 500 drivers
    "early": 18000,    # Current
    "growth": 20000,   # Months 7-12
    "premium": 25000   # Year 2+
}

ROAD_WARRIOR_PRICES = {
    "launch": 25000,   # First 200 - LOCKED FOREVER
    "early": 30000,    # Next 300
    "growth": 35000,   # After 500
    "premium": 40000   # Long-term
}

# System Limits
CITY_RIDER_LAUNCH_LIMIT = 500
ROAD_WARRIOR_LAUNCH_LIMIT = 200
TRIAL_DURATION_HOURS = 24
TRIAL_TRIP_LIMIT = 3

# API Limits per tier
API_LIMITS = {
    "city_rider": {
        "google_maps_calls": 1000,  # per month
        "sms_messages": 50
    },
    "road_warrior": {
        "google_maps_calls": 3000,  # 3x more for long distances
        "sms_messages": 100
    }
}

# ==================== DATABASE MODELS ====================

class DriverSubscription(BaseModel):
    """Enhanced subscription model with two-tier system"""
    # Basic Info
    driver_id: str
    tier: SubscriptionTier
    phase: SubscriptionPhase
    monthly_price: int
    price_locked: bool = False  # True for first 200 Road Warriors
    
    # Status
    status: SubscriptionStatus
    subscription_start: datetime
    subscription_end: Optional[datetime] = None
    next_payment_due: Optional[datetime] = None
    
    # Trial
    trial_active: bool = True
    trial_start: datetime
    trial_end: datetime
    trial_trips_completed: int = 0
    trial_trips_limit: int = TRIAL_TRIP_LIMIT
    
    # Payment
    last_payment_date: Optional[datetime] = None
    payment_screenshot: Optional[str] = None
    payment_verified: bool = False
    total_payments_made: int = 0
    
    # Access Control
    can_do_intercity: bool
    can_do_intracity: bool
    max_api_calls_per_month: int
    api_calls_used: int = 0
    
    # Tier Tracking
    joined_tier_at: datetime
    tier_upgrade_count: int = 0
    upgrade_eligible: bool = False
    
    # Metadata
    created_at: datetime
    updated_at: datetime


class RouteCache(BaseModel):
    """Cached route data to minimize API costs"""
    route_id: str  # "Lagos-Abuja"
    origin_city: str
    origin_lat: float
    origin_lng: float
    destination_city: str
    destination_lat: float
    destination_lng: float
    
    # Route Data
    distance_km: float
    duration_minutes: int
    polyline: str
    waypoints: List[dict]
    
    # Caching Info
    cached_at: datetime
    last_updated: datetime
    api_call_cost: float = 200.0  # ₦200 per call
    times_used: int = 0
    money_saved: float = 0.0
    
    # Route Owner (Gamification)
    first_driver_id: str
    first_driver_name: str
    route_owner_bonus_paid: bool = False


class APICostTracker(BaseModel):
    """Track daily API costs"""
    date: str  # YYYY-MM-DD
    total_api_calls: int = 0
    cached_route_hits: int = 0
    new_route_calls: int = 0
    total_cost_naira: float = 0.0
    total_saved_naira: float = 0.0
    budget_limit: float = 50000.0  # ₦50K/day
    budget_remaining: float = 50000.0


# ==================== ROUTER ====================

two_tier_router = APIRouter(prefix="/api/subscription", tags=["two-tier-subscription"])

# Database connection helper
def get_db():
    mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
    client = AsyncIOMotorClient(mongo_url)
    return client[os.environ.get('DB_NAME', 'nexryde_db')]


# ==================== PRICING ENDPOINTS ====================

@two_tier_router.get("/pricing")
async def get_pricing_info():
    """
    Get current pricing for both City Rider and Road Warrior tiers
    """
    db = get_db()
    
    # Get system config (admin-controlled)
    config = await db.system_config.find_one({"key": "subscription_pricing"})
    
    if not config:
        # Default config
        config = {
            "current_phase": "early",
            "city_riders_count": 0,
            "road_warriors_count": 0
        }
    
    # Calculate available slots
    city_launch_slots = max(0, CITY_RIDER_LAUNCH_LIMIT - config.get("city_riders_count", 0))
    road_warrior_launch_slots = max(0, ROAD_WARRIOR_LAUNCH_LIMIT - config.get("road_warriors_count", 0))
    
    current_phase = config.get("current_phase", "early")
    
    return {
        "city_rider": {
            "tier": "city_rider",
            "name": "City Rider",
            "description": "Perfect for intra-city drivers",
            "current_price": CITY_RIDER_PRICES[current_phase],
            "current_phase": current_phase,
            "launch_slots_remaining": city_launch_slots,
            "pricing_phases": CITY_RIDER_PRICES,
            "features": [
                "Unlimited intra-city trips",
                "Keep 100% of earnings",
                "No commission fees",
                "24/7 support",
                "Standard route matching"
            ],
            "max_api_calls": API_LIMITS["city_rider"]["google_maps_calls"]
        },
        "road_warrior": {
            "tier": "road_warrior",
            "name": "Road Warrior",
            "description": "Unlock inter-city & interstate trips",
            "current_price": ROAD_WARRIOR_PRICES[current_phase],
            "current_phase": current_phase,
            "launch_slots_remaining": road_warrior_launch_slots,
            "price_locked_available": road_warrior_launch_slots > 0,
            "pricing_phases": ROAD_WARRIOR_PRICES,
            "features": [
                "✅ Unlimited inter-city trips",
                "✅ Unlimited intra-city trips",
                "✅ Priority route matching",
                "✅ Smart Route Planner (AI)",
                "✅ 3x API call allowance",
                "✅ Road Warrior badge",
                "✅ Price LOCKED FOREVER (first 200)"
            ],
            "max_api_calls": API_LIMITS["road_warrior"]["google_maps_calls"],
            "benefits_over_city": [
                "Inter-city/interstate access",
                "3x higher earnings potential",
                "Smart return passenger matching",
                "Route Owner bonuses"
            ]
        },
        "trial": {
            "duration_hours": TRIAL_DURATION_HOURS,
            "trip_limit": TRIAL_TRIP_LIMIT,
            "features": "All tier features unlocked during trial"
        },
        "upgrade_requirements": {
            "min_rating": 4.5,
            "min_trips": 50,
            "message": "City Riders can upgrade to Road Warrior after 50 trips with 4.5+ rating"
        }
    }


# ==================== SUBSCRIPTION ENDPOINTS ====================

@two_tier_router.post("/subscribe/{tier}")
async def subscribe_to_tier(tier: str, driver_id: str):
    """
    Subscribe driver to City Rider or Road Warrior tier
    """
    db = get_db()
    
    # Validate tier
    if tier not in ["city_rider", "road_warrior"]:
        raise HTTPException(400, "Invalid tier. Choose 'city_rider' or 'road_warrior'")
    
    # Check if already subscribed
    existing = await db.subscriptions.find_one({"driver_id": driver_id})
    if existing:
        raise HTTPException(400, "Driver already has a subscription")
    
    # Get system config
    config = await db.system_config.find_one({"key": "subscription_pricing"})
    if not config:
        config = {
            "current_phase": "early",
            "city_riders_count": 0,
            "road_warriors_count": 0
        }
    
    current_phase = config.get("current_phase", "early")
    
    # Determine pricing based on tier
    if tier == "city_rider":
        count = config.get("city_riders_count", 0)
        if count < CITY_RIDER_LAUNCH_LIMIT:
            price = CITY_RIDER_PRICES["launch"]
            phase = "launch"
        else:
            price = CITY_RIDER_PRICES[current_phase]
            phase = current_phase
        price_locked = False
        can_do_intercity = False
        max_api_calls = API_LIMITS["city_rider"]["google_maps_calls"]
        
    else:  # road_warrior
        count = config.get("road_warriors_count", 0)
        if count < ROAD_WARRIOR_LAUNCH_LIMIT:
            price = ROAD_WARRIOR_PRICES["launch"]
            phase = "launch"
            price_locked = True  # LOCKED FOREVER!
        elif count < 500:
            price = ROAD_WARRIOR_PRICES["early"]
            phase = "early"
            price_locked = False
        else:
            price = ROAD_WARRIOR_PRICES[current_phase]
            phase = current_phase
            price_locked = False
        can_do_intercity = True
        max_api_calls = API_LIMITS["road_warrior"]["google_maps_calls"]
    
    # Create subscription
    now = datetime.utcnow()
    subscription = {
        "driver_id": driver_id,
        "tier": tier,
        "phase": phase,
        "monthly_price": price,
        "price_locked": price_locked,
        "status": "trial",
        "subscription_start": now,
        "subscription_end": None,
        "next_payment_due": None,
        "trial_active": True,
        "trial_start": now,
        "trial_end": now + timedelta(hours=TRIAL_DURATION_HOURS),
        "trial_trips_completed": 0,
        "trial_trips_limit": TRIAL_TRIP_LIMIT,
        "last_payment_date": None,
        "payment_screenshot": None,
        "payment_verified": False,
        "total_payments_made": 0,
        "can_do_intercity": can_do_intercity,
        "can_do_intracity": True,
        "max_api_calls_per_month": max_api_calls,
        "api_calls_used": 0,
        "joined_tier_at": now,
        "tier_upgrade_count": 0,
        "upgrade_eligible": False,
        "created_at": now,
        "updated_at": now
    }
    
    # Save to database
    await db.subscriptions.insert_one(subscription)
    
    # Update count
    count_field = "city_riders_count" if tier == "city_rider" else "road_warriors_count"
    await db.system_config.update_one(
        {"key": "subscription_pricing"},
        {"$inc": {count_field: 1}},
        upsert=True
    )
    
    # Build response message
    tier_name = "City Rider" if tier == "city_rider" else "Road Warrior"
    tier_number = count + 1
    
    message = f"🎉 Welcome to {tier_name} #{tier_number} at ₦{price:,}/month!"
    
    if price_locked:
        message += "\n\n🔒 PRICE LOCKED FOREVER at ₦25,000! You're one of the first 200!"
    
    message += f"\n\n⏱️ 24-hour FREE trial active with {TRIAL_TRIP_LIMIT} trips included!"
    
    return {
        "success": True,
        "tier": tier,
        "tier_name": tier_name,
        "tier_number": tier_number,
        "price": price,
        "phase": phase,
        "price_locked": price_locked,
        "trial_hours": TRIAL_DURATION_HOURS,
        "trial_trips": TRIAL_TRIP_LIMIT,
        "can_do_intercity": can_do_intercity,
        "message": message
    }


@two_tier_router.post("/upgrade-to-road-warrior/{driver_id}")
async def upgrade_to_road_warrior(driver_id: str):
    """
    Upgrade City Rider to Road Warrior
    Requirements: 4.5+ rating, 50+ trips
    """
    db = get_db()
    
    # Get current subscription
    subscription = await db.subscriptions.find_one({"driver_id": driver_id})
    if not subscription:
        raise HTTPException(404, "No subscription found")
    
    if subscription["tier"] == "road_warrior":
        raise HTTPException(400, "Already a Road Warrior")
    
    # Get driver stats
    driver = await db.users.find_one({"_id": driver_id})
    if not driver:
        raise HTTPException(404, "Driver not found")
    
    # Check eligibility
    rating = driver.get("rating", 0)
    total_trips = driver.get("total_trips", 0)
    
    if rating < 4.5:
        raise HTTPException(400, f"Minimum 4.5★ rating required (you have {rating}★)")
    
    if total_trips < 50:
        raise HTTPException(400, f"Minimum 50 trips required (you have {total_trips})")
    
    # Get Road Warrior pricing
    config = await db.system_config.find_one({"key": "subscription_pricing"})
    road_warrior_count = config.get("road_warriors_count", 0) if config else 0
    
    if road_warrior_count < ROAD_WARRIOR_LAUNCH_LIMIT:
        price = ROAD_WARRIOR_PRICES["launch"]
        phase = "launch"
        price_locked = True
    elif road_warrior_count < 500:
        price = ROAD_WARRIOR_PRICES["early"]
        phase = "early"
        price_locked = False
    else:
        price = ROAD_WARRIOR_PRICES["growth"]
        phase = "growth"
        price_locked = False
    
    # Upgrade subscription
    now = datetime.utcnow()
    await db.subscriptions.update_one(
        {"driver_id": driver_id},
        {
            "$set": {
                "tier": "road_warrior",
                "phase": phase,
                "monthly_price": price,
                "price_locked": price_locked,
                "can_do_intercity": True,
                "max_api_calls_per_month": API_LIMITS["road_warrior"]["google_maps_calls"],
                "upgraded_at": now,
                "updated_at": now
            },
            "$inc": {"tier_upgrade_count": 1}
        }
    )
    
    # Update counts
    await db.system_config.update_one(
        {"key": "subscription_pricing"},
        {
            "$inc": {
                "road_warriors_count": 1,
                "city_riders_count": -1
            }
        },
        upsert=True
    )
    
    message = f"🚀 Upgraded to Road Warrior at ₦{price:,}/month!"
    if price_locked:
        message += "\n\n🔒 PRICE LOCKED FOREVER! You're in the first 200!"
    
    return {
        "success": True,
        "new_tier": "road_warrior",
        "new_price": price,
        "phase": phase,
        "price_locked": price_locked,
        "can_do_intercity": True,
        "message": message
    }


@two_tier_router.get("/status/{driver_id}")
async def get_subscription_status(driver_id: str):
    """
    Get driver's current subscription status
    """
    db = get_db()
    
    subscription = await db.subscriptions.find_one({"driver_id": driver_id})
    if not subscription:
        return {
            "subscribed": False,
            "message": "No active subscription"
        }
    
    # Check trial status
    if subscription.get("trial_active"):
        now = datetime.utcnow()
        trial_end = subscription["trial_end"]
        hours_remaining = (trial_end - now).total_seconds() / 3600
        trips_remaining = subscription["trial_trips_limit"] - subscription["trial_trips_completed"]
        
        trial_expired = hours_remaining <= 0 or trips_remaining <= 0
        
        if trial_expired:
            # Update status
            await db.subscriptions.update_one(
                {"driver_id": driver_id},
                {
                    "$set": {
                        "trial_active": False,
                        "status": "payment_required",
                        "updated_at": datetime.utcnow()
                    }
                }
            )
            subscription["trial_active"] = False
            subscription["status"] = "payment_required"
    
    # Calculate upgrade eligibility (City Rider only)
    upgrade_eligible = False
    if subscription["tier"] == "city_rider":
        driver = await db.users.find_one({"_id": driver_id})
        if driver:
            upgrade_eligible = (
                driver.get("rating", 0) >= 4.5 and 
                driver.get("total_trips", 0) >= 50
            )
    
    return {
        "subscribed": True,
        "tier": subscription["tier"],
        "tier_name": "City Rider" if subscription["tier"] == "city_rider" else "Road Warrior",
        "phase": subscription["phase"],
        "monthly_price": subscription["monthly_price"],
        "price_locked": subscription.get("price_locked", False),
        "status": subscription["status"],
        "can_do_intercity": subscription["can_do_intercity"],
        "can_do_intracity": subscription["can_do_intracity"],
        
        # Trial info
        "trial_active": subscription.get("trial_active", False),
        "trial_hours_remaining": max(0, (subscription["trial_end"] - datetime.utcnow()).total_seconds() / 3600) if subscription.get("trial_active") else 0,
        "trial_trips_remaining": subscription["trial_trips_limit"] - subscription["trial_trips_completed"] if subscription.get("trial_active") else 0,
        
        # Payment info
        "payment_verified": subscription.get("payment_verified", False),
        "next_payment_due": subscription.get("next_payment_due"),
        
        # Upgrade eligibility
        "upgrade_eligible": upgrade_eligible,
        "upgrade_message": "You're eligible to upgrade to Road Warrior!" if upgrade_eligible else None
    }


# Export router
__all__ = ['two_tier_router']

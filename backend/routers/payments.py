"""Payments Router - Wallet, subscriptions, fare, tiers, promos, receipts for NEXRYDE."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, timezone, timedelta
from uuid import uuid4
import logging
import os
import uuid
import math
import random

from database import db

logger = logging.getLogger('server')
payments_router = APIRouter(prefix="/api", tags=["Payments"])

# Import shared functions (set at startup)
_get_directions_fn = None
_calculate_fare_fn = None
_calculate_distance_fn = None

def set_payments_shared_functions(get_directions, calc_fare, calc_distance):
    global _get_directions_fn, _calculate_fare_fn, _calculate_distance_fn
    _get_directions_fn = get_directions
    _calculate_fare_fn = calc_fare
    _calculate_distance_fn = calc_distance

async def get_directions_from_google(p_lat, p_lng, d_lat, d_lng):
    if _get_directions_fn:
        return await _get_directions_fn(p_lat, p_lng, d_lat, d_lng)
    return None

def calculate_fare(dist, dur, traffic, svc="economy"):
    if _calculate_fare_fn:
        return _calculate_fare_fn(dist, dur, traffic, svc)
    base = max(700, dist * 150)
    return {"base_fare": 300, "distance_fee": dist * 100, "time_fee": dur * 20, "traffic_fee": 0, "total_fare": base, "surge_multiplier": 1.0}

def calculate_distance_haversine(lat1, lon1, lat2, lon2):
    if _calculate_distance_fn:
        return _calculate_distance_fn(lat1, lon1, lat2, lon2)
    from math import radians, sin, cos, sqrt, atan2
    R = 6371
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat/2)**2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon/2)**2
    return R * 2 * atan2(sqrt(a), sqrt(1-a))

# Subscription config
SUBSCRIPTION_CONFIG = {
    "monthly_fee": 25000,
    "trial_days": 7,
    "currency": "NGN",
    "bank_details": {
        "bank_name": "UBA",
        "account_name": "ADMOBLORDGROUP LIMITED",
        "account_number": "1028400669",
    }
}

# Surge pricing config
SURGE_CONFIG = {
    "enabled": True,
    "base_multiplier": 1.0,
    "max_multiplier": 3.0,
    "peak_hours": {
        "morning": {"start": 7, "end": 9, "multiplier": 1.5},
        "evening": {"start": 17, "end": 20, "multiplier": 1.8},
    },
    "high_demand_threshold": 0.7,
    "rain_multiplier": 1.3,
    "holiday_multiplier": 1.5,
}


# Payment-specific models
class PaymentProofSubmission(BaseModel):
    driver_id: str
    screenshot: str
    amount: float = 25000.0
    payment_reference: Optional[str] = None

class FareEstimateRequest(BaseModel):
    pickup_lat: float
    pickup_lng: float
    dropoff_lat: float
    dropoff_lng: float
    service_type: str = "economy"
    city: str = "lagos"

class DriverTierUpgradeRequest(BaseModel):
    vehicle_year: int
    leather_seats: bool
    dual_ac: bool
    interior_photo: str
    exterior_photo: str

class GracePeriodRequest(BaseModel):
    reason: str
    days_requested: int = 3


# Tier config (matches server.py exactly)
TIER_CONFIG = {
    "basic": {
        "name": "KODA Basic",
        "monthly_fee": 25000,
        "earning_per_ride": {"min": 200, "max": 300},
        "commission": 0.15,
        "requirements": {"vehicle_year_min": None, "leather_seats": False, "dual_ac": False, "min_rating": 4.3},
        "color": "#C9A9A6",
        "benefits": ["Standard rides"],
    },
    "premium": {
        "name": "KODA Premium",
        "monthly_fee": 25000,
        "earning_per_ride": {"min": 300, "max": 450},
        "commission": 0.10,
        "requirements": {"vehicle_year_min": 2018, "leather_seats": True, "dual_ac": True, "min_rating": 4.7, "premium_training": True},
        "color": "#D4AF37",
        "benefits": ["Priority support", "Early access to new features", "Free vehicle inspection vouchers", "Premium Driver badge"],
    },
    "silver": {"name": "Silver", "min_trips": 50, "commission": 0.12, "monthly_fee": 25000, "earning_per_ride": {"min": 250, "max": 350}, "benefits": ["Priority dispatch", "5% bonus"]},
    "gold": {"name": "Gold", "min_trips": 200, "commission": 0.10, "monthly_fee": 25000, "earning_per_ride": {"min": 300, "max": 400}, "benefits": ["Priority dispatch", "10% bonus", "Insurance"]},
    "platinum": {"name": "Platinum", "min_trips": 500, "commission": 0.08, "monthly_fee": 25000, "earning_per_ride": {"min": 350, "max": 450}, "benefits": ["VIP dispatch", "15% bonus", "Full Insurance"]},
    "diamond": {"name": "Diamond", "min_trips": 1000, "commission": 0.05, "monthly_fee": 25000, "earning_per_ride": {"min": 400, "max": 500}, "benefits": ["VIP everything", "20% bonus"]},
}

# Fare config
FARE_CONFIG = {
    "standard": {"base": 300, "per_km": 100, "per_min": 20, "min_fare": 700},
    "economy": {"base": 300, "per_km": 100, "per_min": 20, "min_fare": 700},
    "comfort": {"base": 500, "per_km": 150, "per_min": 30, "min_fare": 1000},
    "premium": {"base": 800, "per_km": 200, "per_min": 40, "min_fare": 1500},
    "xl": {"base": 600, "per_km": 170, "per_min": 35, "min_fare": 1200},
}

# ==================== SUBSCRIPTION ENDPOINTS ====================
@payments_router.get("/subscriptions/config")
async def get_subscription_config():
    """Get subscription configuration including bank details"""
    return {
        "monthly_fee": SUBSCRIPTION_CONFIG["monthly_fee"],
        "trial_days": SUBSCRIPTION_CONFIG["trial_days"],
        "currency": SUBSCRIPTION_CONFIG["currency"],
        "bank_details": SUBSCRIPTION_CONFIG["bank_details"]
    }

@payments_router.get("/subscriptions/{driver_id}")
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
    
    # No subscription found - return default data for new drivers
    return {
        "status": "none",
        "days_remaining": 0,
        "monthly_fee": SUBSCRIPTION_CONFIG["monthly_fee"],
        "bank_details": SUBSCRIPTION_CONFIG["bank_details"],
        "message": "No active subscription. Start your 7-day free trial!"
    }

@payments_router.post("/subscriptions/{driver_id}/start-trial")
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

@payments_router.post("/subscriptions/{driver_id}/submit-payment")
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

@payments_router.post("/subscriptions/{driver_id}/verify-payment")
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

@payments_router.get("/subscriptions/{driver_id}/check-restrictions")
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

@payments_router.post("/subscriptions/{driver_id}/grace-period")
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
@payments_router.post("/fare/estimate")
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
        "traffic_duration_min": traffic_duration_min,
        "base_fare": fare["base_fare"],
        "distance_fee": fare["distance_fee"],
        "time_fee": fare["time_fee"],
        "traffic_fee": fare["traffic_fee"],
        "booking_fee": fare["booking_fee"],
        "subtotal": fare["subtotal"],
        "total_fare": fare["total_fare"],
        "surge_multiplier": fare["surge_multiplier"],
        "is_peak": fare["is_peak"],
        "is_weekend": fare["is_weekend"],
        "peak_type": fare["peak_type"],
        "currency": fare["currency"],
        "min_fare": fare["min_fare"],
        "cancellation_fee": fare["cancellation_fee"],
        "service_type": request.service_type,
        "city": request.city if hasattr(request, 'city') else "lagos",
        "polyline": polyline,
        "price_breakdown": fare["price_breakdown"],
        "price_valid_until": (datetime.utcnow() + timedelta(minutes=FARE_LOCK_MINUTES)).isoformat(),
        "price_lock_minutes": FARE_LOCK_MINUTES,
        "is_insured": True
    }



# ==================== WALLET ENDPOINTS ====================
@payments_router.get("/wallet/{user_id}")
async def get_wallet_balance(user_id: str):
    """Get user wallet balance"""
    user = await db.users.find_one({"id": user_id})
    if not user:
        # Create user wallet with 0 balance
        return {"balance": 0, "currency": "NGN", "user_id": user_id}
    return {"balance": user.get("wallet_balance", 0), "currency": "NGN", "user_id": user_id}

@payments_router.post("/wallet/{user_id}/topup")
async def topup_wallet_balance(user_id: str, request: dict):
    """Top up wallet - ENHANCED with validation and logging"""
    amount = request.get("amount", 0)
    if not amount:
        raise HTTPException(status_code=400, detail="amount is required")
    
    # Validation
    if amount < 100:
        raise HTTPException(status_code=400, detail="Minimum top-up is ₦100")
    if amount > 1000000:
        raise HTTPException(status_code=400, detail="Maximum single top-up is ₦1,000,000. Contact support for larger amounts.")
    
    # Check if user exists
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Create transaction record for audit
    transaction = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "type": "topup",
        "amount": amount,
        "status": "completed",
        "timestamp": datetime.utcnow(),
        "payment_method": request.get("payment_method", "card"),
        "reference": f"TOP{uuid.uuid4().hex[:10].upper()}"
    }
    
    await db.transactions.insert_one(transaction)
    
    # Update wallet balance
    await db.users.update_one(
        {"id": user_id},
        {"$inc": {"wallet_balance": amount}}
    )
    
    user = await db.users.find_one({"id": user_id})
    new_balance = user.get("wallet_balance", amount)
    
    logger.info(f"💰 Wallet top-up: User {user_id} added ₦{amount:,.2f}. New balance: ₦{new_balance:,.2f}")
    
    return {
        "success": True,
        "message": f"Successfully added ₦{amount:,.2f} to wallet",
        "new_balance": new_balance,
        "amount_added": amount,
        "transaction_id": transaction["id"],
        "reference": transaction["reference"]
    }


# ==================== SURGE PRICING ====================
def calculate_surge_multiplier(lat: float, lng: float) -> dict:
    """Calculate surge multiplier based on time, demand, and conditions"""
    now = datetime.utcnow()
    hour = now.hour
    
    base_multiplier = SURGE_CONFIG["base_multiplier"]
    surge_reason = []
    
    # Check peak hours
    for period, config in SURGE_CONFIG["peak_hours"].items():
        if config["start"] <= hour < config["end"]:
            base_multiplier = max(base_multiplier, config["multiplier"])
            surge_reason.append(f"{period.title()} rush hour")
    
    # Simulate demand-based surge
    demand_ratio = random.uniform(0.3, 0.9)
    if demand_ratio > SURGE_CONFIG["high_demand_threshold"]:
        demand_surge = 1 + (demand_ratio - SURGE_CONFIG["high_demand_threshold"]) * 2
        if demand_surge > base_multiplier:
            base_multiplier = demand_surge
            surge_reason.append("High demand in area")
    
    final_multiplier = min(base_multiplier, SURGE_CONFIG["max_multiplier"])
    
    return {
        "multiplier": round(final_multiplier, 2),
        "is_surge": final_multiplier > 1.0,
        "reasons": surge_reason if surge_reason else ["Normal pricing"],
        "expires_in_minutes": 5
    }

@payments_router.get("/surge/check")
async def check_surge_pricing(lat: float, lng: float):
    """Check current surge pricing for a location"""
    return calculate_surge_multiplier(lat, lng)


# ==================== PROMO CODES ====================
@payments_router.post("/promo/apply")
async def apply_promo(rider_id: str, code: str):
    """Apply promo code"""
    promo = await db.promo_codes.find_one({"code": code.upper(), "active": True})
    if not promo:
        raise HTTPException(status_code=404, detail="Invalid promo code")
    
    await db.users.update_one({"id": rider_id}, {"$push": {"active_promos": {"code": code, "applied_at": datetime.utcnow()}}})
    return {"success": True, "discount_percent": promo.get("discount_percent", 10)}

@payments_router.get("/referral/code/{user_id}")
async def get_referral_code(user_id: str):
    """Get referral code"""
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    code = user.get("referral_code") or f"NEX{user.get('name', 'U')[:3].upper()}{random.randint(100, 999)}"
    if not user.get("referral_code"):
        await db.users.update_one({"id": user_id}, {"$set": {"referral_code": code}})
    
    return {"referral_code": code, "bonus_per_referral": 500}

# Wallet endpoints moved to line 3144 - removed duplicates


# ==================== TRIP RECEIPTS ====================
@payments_router.get("/trips/{trip_id}/receipt")
async def get_receipt(trip_id: str):
    """Get trip receipt"""
    trip = await db.trips.find_one({"id": trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    
    # Handle both dict and string pickup/dropoff formats
    pickup_loc = trip.get("pickup_location") or trip.get("pickup", {})
    dropoff_loc = trip.get("dropoff_location") or trip.get("dropoff", {})
    
    pickup_address = pickup_loc.get("address", pickup_loc) if isinstance(pickup_loc, dict) else str(pickup_loc)
    dropoff_address = dropoff_loc.get("address", dropoff_loc) if isinstance(dropoff_loc, dict) else str(dropoff_loc)
    
    return {
        "receipt_id": f"NXR-{trip_id[:8].upper()}",
        "trip_id": trip_id,
        "date": trip.get("created_at", datetime.utcnow()).isoformat() if isinstance(trip.get("created_at"), datetime) else str(trip.get("created_at", "")),
        "pickup": pickup_address,
        "dropoff": dropoff_address,
        "fare": trip.get("fare", 0),
        "payment_method": trip.get("payment_method", "cash"),
        "status": trip.get("status", "completed"),
        "distance_km": trip.get("distance_km", 0),
        "duration_mins": trip.get("duration_mins", 0)
    }


# ==================== DRIVER TIER SYSTEM ====================
@payments_router.get("/driver/tier/{driver_id}")
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

@payments_router.post("/driver/tier/upgrade")
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

@payments_router.get("/tiers/config")
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

@payments_router.post("/fare/calculate-adjustment")
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

@payments_router.get("/fare/breakdown/{trip_id}")
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


"""Payments Router - Wallet, subscriptions, fare, tiers, promos for NEXRYDE."""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, timezone, timedelta
from uuid import uuid4
import logging
import os
import uuid
import random
import math

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


# ==================== TRIPS (REFACTORED TO routers/trips.py) ====================

# ==================== SOS & SAFETY ENDPOINTS ====================

@payments_router.post("/sos/trigger")
async def trigger_sos(request: SOSRequest):
    """Trigger SOS alert - ENHANCED with real SMS notifications"""
    trip = await db.trips.find_one({"id": request.trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    
    # Determine who triggered (rider or driver)
    user_id = trip["rider_id"]  # Default to rider
    user_role = "rider"
    
    # Get user's emergency contacts
    user = await db.users.find_one({"id": user_id})
    emergency_contacts = user.get("emergency_contacts", []) if user else []
    user_name = user.get("name", "A user") if user else "A user"
    
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
    
    # ENHANCED: Send REAL SMS to emergency contacts via Termii
    contacts_successfully_notified = 0
    if TERMII_API_KEY and emergency_contacts:
        # Create Google Maps link for location
        location_link = f"https://maps.google.com/?q={request.location_lat},{request.location_lng}"
        
        async with httpx.AsyncClient() as http_client:
            for contact in emergency_contacts:
                try:
                    # Format phone number (remove + for Termii)
                    contact_phone = contact["phone"].lstrip('+')
                    
                    # Craft urgent SOS message
                    sms_text = (
                        f"🚨 EMERGENCY! {user_name} triggered SOS on NexRyde! "
                        f"Location: {location_link} "
                        f"Trip ID: {request.trip_id}. Please check on them immediately!"
                    )
                    
                    payload = {
                        "api_key": TERMII_API_KEY,
                        "to": contact_phone,
                        "from": TERMII_FROM_ID or "NexRyde",
                        "channel": "dnd",
                        "type": "plain",
                        "sms": sms_text
                    }
                    
                    response = await http_client.post(
                        f"{TERMII_BASE_URL}/api/sms/send",
                        json=payload,
                        timeout=10.0
                    )
                    
                    if response.status_code == 200:
                        contacts_successfully_notified += 1
                        logger.info(f"✅ SOS SMS sent to {contact['name']} ({contact_phone})")
                    else:
                        logger.error(f"❌ Failed to send SOS SMS to {contact_phone}: {response.text}")
                        
                except Exception as e:
                    logger.error(f"❌ Error sending SOS SMS to {contact.get('name', 'contact')}: {e}")
    
    # Log critical alert
    logger.critical(f"🚨 SOS TRIGGERED for trip {request.trip_id} by {user_name} at {request.location_lat}, {request.location_lng}")
    logger.critical(f"📱 Emergency SMS sent to {contacts_successfully_notified}/{len(emergency_contacts)} contacts")
    
    return {
        "success": True,
        "message": "SOS alert activated! Emergency contacts notified.",
        "sos_id": sos.id,
        "contacts_notified": contacts_successfully_notified,
        "total_contacts": len(emergency_contacts),
        "support_notified": True,
        "location_link": f"https://maps.google.com/?q={request.location_lat},{request.location_lng}"
    }

@payments_router.post("/sos/{sos_id}/resolve")
async def resolve_sos(sos_id: str, resolution: str = "resolved"):
    """Resolve SOS alert"""
    await db.sos_alerts.update_one(
        {"id": sos_id},
        {"$set": {"status": resolution, "resolved_at": datetime.utcnow()}}
    )
    return {"message": "SOS resolved"}

@payments_router.get("/sos/trip/{trip_id}")
async def get_trip_sos(trip_id: str):
    """Get SOS alerts for a trip"""
    alerts = await db.sos_alerts.find({"trip_id": trip_id}).to_list(10)
    for alert in alerts:
        alert["_id"] = str(alert["_id"])
    return {"alerts": alerts}

@payments_router.post("/safety/respond")
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

@payments_router.post("/trips/{trip_id}/risk-alert")
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


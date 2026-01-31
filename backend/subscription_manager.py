"""
NexRyde Subscription Management System
Handles phased pricing, trials, payments, and enforcement
"""

from datetime import datetime, timedelta
from enum import Enum
from typing import Optional, Dict, Any
from pydantic import BaseModel

class SubscriptionPhase(str, Enum):
    LAUNCH = "launch"  # ₦15,000 - First 500 drivers
    EARLY = "early"    # ₦18,000 - Months 4-6
    GROWTH = "growth"  # ₦20,000 - Months 7-12
    PREMIUM = "premium" # ₦25,000 - Year 2+

class SubscriptionStatus(str, Enum):
    TRIAL = "trial"
    ACTIVE = "active"
    LIMITED = "limited"  # Days 1-3 overdue
    SUSPENDED = "suspended"
    CANCELLED = "cancelled"

class PaymentMethod(str, Enum):
    BANK_TRANSFER = "bank_transfer"
    CARD = "card"
    USSD = "ussd"

# Pricing Configuration
SUBSCRIPTION_PRICES = {
    SubscriptionPhase.LAUNCH: 15000,
    SubscriptionPhase.EARLY: 18000,
    SubscriptionPhase.GROWTH: 20000,
    SubscriptionPhase.PREMIUM: 25000,
}

# System Configuration
LAUNCH_DRIVER_LIMIT = 500
TRIAL_DURATION_HOURS = 24
TRIAL_TRIP_LIMIT = 3
RECONNECTION_FEE = 2000
MAX_REFERRALS_PER_MONTH = 5
REFERRAL_MIN_TRIPS = 20

class SubscriptionConfig(BaseModel):
    """Current subscription phase configuration"""
    current_phase: SubscriptionPhase
    phase_start_date: datetime
    launch_drivers_count: int = 0
    is_launch_full: bool = False

class DriverSubscription(BaseModel):
    """Driver subscription details"""
    driver_id: str
    status: SubscriptionStatus
    current_price: int
    joined_phase: SubscriptionPhase
    
    # Trial
    trial_start: Optional[datetime] = None
    trial_trips_count: int = 0
    trial_expired: bool = False
    
    # Subscription
    subscription_start: Optional[datetime] = None
    subscription_end: Optional[datetime] = None
    last_payment_date: Optional[datetime] = None
    next_payment_due: Optional[datetime] = None
    
    # Payment tracking
    payment_overdue_days: int = 0
    reconnection_fee_required: bool = False
    total_payments_made: int = 0
    
    # Referrals
    referral_code: str
    referred_by: Optional[str] = None
    referral_count_this_month: int = 0
    free_months_earned: int = 0
    
    # Performance
    total_trips: int = 0
    acceptance_rate: float = 0.0
    cancellation_rate: float = 0.0
    average_rating: float = 0.0

class TrialManager:
    """Manages driver trials"""
    
    @staticmethod
    def start_trial(driver_id: str) -> Dict[str, Any]:
        """Start a new trial for driver"""
        now = datetime.utcnow()
        trial_end = now + timedelta(hours=TRIAL_DURATION_HOURS)
        
        return {
            "driver_id": driver_id,
            "trial_start": now,
            "trial_end": trial_end,
            "trips_allowed": TRIAL_TRIP_LIMIT,
            "trips_remaining": TRIAL_TRIP_LIMIT,
            "status": "active"
        }
    
    @staticmethod
    def check_trial_status(trial_start: datetime, trips_count: int) -> Dict[str, Any]:
        """Check if trial is still valid"""
        now = datetime.utcnow()
        hours_elapsed = (now - trial_start).total_seconds() / 3600
        
        time_expired = hours_elapsed >= TRIAL_DURATION_HOURS
        trips_expired = trips_count >= TRIAL_TRIP_LIMIT
        
        is_expired = time_expired or trips_expired
        
        expiry_reason = None
        if time_expired:
            expiry_reason = "24_hours_elapsed"
        elif trips_expired:
            expiry_reason = f"{TRIAL_TRIP_LIMIT}_trips_completed"
        
        return {
            "is_expired": is_expired,
            "expiry_reason": expiry_reason,
            "hours_elapsed": hours_elapsed,
            "trips_completed": trips_count,
            "time_remaining": max(0, TRIAL_DURATION_HOURS - hours_elapsed),
            "trips_remaining": max(0, TRIAL_TRIP_LIMIT - trips_count)
        }

class PricingManager:
    """Manages phased pricing"""
    
    def __init__(self):
        self.config = None  # Loaded from database
    
    def get_current_phase(self) -> SubscriptionPhase:
        """Get current subscription phase"""
        # This would query database for current phase
        # For now, return based on driver count and time
        if self.config and self.config.launch_drivers_count < LAUNCH_DRIVER_LIMIT:
            return SubscriptionPhase.LAUNCH
        return SubscriptionPhase.EARLY  # Adjust based on actual dates
    
    def get_current_price(self) -> int:
        """Get price for current phase"""
        phase = self.get_current_phase()
        return SUBSCRIPTION_PRICES[phase]
    
    def can_join_launch_phase(self) -> bool:
        """Check if launch phase is still available"""
        if not self.config:
            return True
        return self.config.launch_drivers_count < LAUNCH_DRIVER_LIMIT
    
    def get_pricing_info(self) -> Dict[str, Any]:
        """Get complete pricing information"""
        current_phase = self.get_current_phase()
        current_price = self.get_current_price()
        
        return {
            "current_phase": current_phase,
            "current_price": current_price,
            "launch_slots_remaining": max(0, LAUNCH_DRIVER_LIMIT - (self.config.launch_drivers_count if self.config else 0)),
            "phase_prices": SUBSCRIPTION_PRICES,
            "trial_duration_hours": TRIAL_DURATION_HOURS,
            "trial_trip_limit": TRIAL_TRIP_LIMIT
        }

class PaymentEnforcer:
    """Enforces payment rules and handles overdue accounts"""
    
    @staticmethod
    def check_payment_status(subscription: DriverSubscription) -> Dict[str, Any]:
        """Check if payment is due or overdue"""
        if not subscription.next_payment_due:
            return {"status": "no_payment_due"}
        
        now = datetime.utcnow()
        days_until_due = (subscription.next_payment_due - now).days
        
        if days_until_due > 0:
            return {
                "status": "active",
                "days_until_due": days_until_due,
                "amount_due": subscription.current_price,
                "due_date": subscription.next_payment_due
            }
        
        # Payment overdue
        days_overdue = abs(days_until_due)
        
        if days_overdue <= 3:
            status = "limited_access"
            message = "Payment overdue. Limited to accepting rides only."
        elif days_overdue <= 7:
            status = "warning"
            message = f"Account will be suspended in {8 - days_overdue} days."
        else:
            status = "suspended"
            message = "Account suspended. Pay subscription + reconnection fee."
        
        amount_due = subscription.current_price
        if days_overdue > 7:
            amount_due += RECONNECTION_FEE
        
        return {
            "status": status,
            "days_overdue": days_overdue,
            "amount_due": amount_due,
            "reconnection_fee": RECONNECTION_FEE if days_overdue > 7 else 0,
            "message": message
        }
    
    @staticmethod
    def process_payment(driver_id: str, amount: int, payment_method: PaymentMethod) -> Dict[str, Any]:
        """Process subscription payment"""
        now = datetime.utcnow()
        next_due = now + timedelta(days=30)
        
        return {
            "payment_id": f"PAY-{driver_id}-{int(now.timestamp())}",
            "driver_id": driver_id,
            "amount": amount,
            "payment_method": payment_method,
            "payment_date": now,
            "next_due_date": next_due,
            "status": "success",
            "receipt_url": f"/receipts/subscription/{driver_id}"
        }
    
    @staticmethod
    def send_payment_reminder(driver_id: str, days_before_due: int):
        """Send payment reminder notification"""
        messages = {
            5: "📅 Your NexRyde subscription renews in 5 days. Pay now to avoid interruption.",
            1: "⚠️ PAYMENT DUE TOMORROW! Avoid suspension - pay now.",
            0: "🚨 PAYMENT OVERDUE! Limited access active. Pay within 7 days.",
            -3: "🚨 ACCOUNT WILL BE SUSPENDED IN 4 DAYS! Pay immediately.",
            -7: "❌ ACCOUNT SUSPENDED. Pay subscription + ₦2,000 reconnection fee."
        }
        
        message = messages.get(days_before_due, "Payment reminder")
        
        return {
            "driver_id": driver_id,
            "message": message,
            "type": "payment_reminder",
            "priority": "high" if days_before_due <= 1 else "medium"
        }

class ReferralManager:
    """Manages driver referrals"""
    
    @staticmethod
    def generate_referral_code(driver_id: str) -> str:
        """Generate unique referral code"""
        import hashlib
        hash_input = f"{driver_id}-{datetime.utcnow().timestamp()}"
        return hashlib.md5(hash_input.encode()).hexdigest()[:8].upper()
    
    @staticmethod
    def process_referral(referrer_id: str, referee_id: str) -> Dict[str, Any]:
        """Process a successful referral"""
        # Check conditions:
        # 1. Referee has subscribed
        # 2. Referee completed 20+ trips
        # 3. Both have active subscriptions
        # 4. Referrer hasn't exceeded 5 referrals this month
        
        return {
            "referrer_id": referrer_id,
            "referee_id": referee_id,
            "reward": "1_month_free",
            "status": "pending",  # Activated after conditions met
            "conditions": {
                "referee_subscribed": True,
                "referee_trips": 0,  # Must reach 20
                "trips_required": REFERRAL_MIN_TRIPS,
                "referrer_subscription_active": True,
                "referee_subscription_active": True
            }
        }
    
    @staticmethod
    def activate_referral_reward(referrer_id: str):
        """Activate free month reward"""
        now = datetime.utcnow()
        return {
            "referrer_id": referrer_id,
            "reward_type": "free_month",
            "activation_date": now,
            "message": "🎉 Congratulations! You earned 1 month FREE subscription!"
        }

class SubscriptionManager:
    """Main subscription management class"""
    
    def __init__(self):
        self.pricing = PricingManager()
        self.trial = TrialManager()
        self.enforcer = PaymentEnforcer()
        self.referral = ReferralManager()
    
    def register_new_driver(self, driver_id: str, referred_by: Optional[str] = None) -> Dict[str, Any]:
        """Register new driver with trial"""
        trial_info = self.trial.start_trial(driver_id)
        pricing_info = self.pricing.get_pricing_info()
        referral_code = self.referral.generate_referral_code(driver_id)
        
        joined_phase = pricing_info["current_phase"]
        
        subscription = DriverSubscription(
            driver_id=driver_id,
            status=SubscriptionStatus.TRIAL,
            current_price=pricing_info["current_price"],
            joined_phase=joined_phase,
            trial_start=trial_info["trial_start"],
            referral_code=referral_code,
            referred_by=referred_by
        )
        
        return {
            "driver_id": driver_id,
            "subscription": subscription,
            "trial_info": trial_info,
            "pricing_info": pricing_info,
            "referral_code": referral_code,
            "message": f"Trial started! Valid for {TRIAL_DURATION_HOURS}hrs or {TRIAL_TRIP_LIMIT} trips."
        }
    
    def check_driver_access(self, driver_id: str, subscription: DriverSubscription) -> Dict[str, Any]:
        """Check if driver can access platform"""
        # Check trial
        if subscription.status == SubscriptionStatus.TRIAL:
            trial_status = self.trial.check_trial_status(
                subscription.trial_start,
                subscription.trial_trips_count
            )
            
            if trial_status["is_expired"]:
                return {
                    "access_granted": False,
                    "reason": "trial_expired",
                    "message": "Your trial has expired. Subscribe to continue.",
                    "trial_status": trial_status
                }
            
            return {
                "access_granted": True,
                "access_level": "trial",
                "trial_status": trial_status
            }
        
        # Check subscription payment
        payment_status = self.enforcer.check_payment_status(subscription)
        
        if payment_status["status"] == "suspended":
            return {
                "access_granted": False,
                "reason": "suspended",
                "message": payment_status["message"],
                "amount_due": payment_status["amount_due"]
            }
        
        if payment_status["status"] == "limited_access":
            return {
                "access_granted": True,
                "access_level": "limited",
                "message": "Can accept rides only. Pay subscription to restore full access.",
                "days_overdue": payment_status["days_overdue"]
            }
        
        return {
            "access_granted": True,
            "access_level": "full",
            "status": "active"
        }

# API Route Handlers
from fastapi import APIRouter, HTTPException, Depends
from typing import List

subscription_router = APIRouter(prefix="/api/subscription", tags=["subscription"])

@subscription_router.post("/register")
async def register_driver_subscription(
    driver_id: str,
    referred_by: Optional[str] = None
):
    """Register new driver with trial"""
    manager = SubscriptionManager()
    result = manager.register_new_driver(driver_id, referred_by)
    
    # Save to database
    # db.subscriptions.insert_one(result["subscription"].dict())
    
    return result

@subscription_router.get("/pricing")
async def get_pricing_info():
    """Get current pricing information"""
    manager = SubscriptionManager()
    return manager.pricing.get_pricing_info()

@subscription_router.get("/status/{driver_id}")
async def get_subscription_status(driver_id: str):
    """Get driver subscription status"""
    # subscription = db.subscriptions.find_one({"driver_id": driver_id})
    # if not subscription:
    #     raise HTTPException(404, "Subscription not found")
    
    manager = SubscriptionManager()
    # access_status = manager.check_driver_access(driver_id, subscription)
    
    return {
        "driver_id": driver_id,
        "status": "active",  # From DB
        "access_status": "full"  # From manager
    }

@subscription_router.post("/payment")
async def process_subscription_payment(
    driver_id: str,
    amount: int,
    payment_method: PaymentMethod
):
    """Process subscription payment"""
    enforcer = PaymentEnforcer()
    payment_result = enforcer.process_payment(driver_id, amount, payment_method)
    
    # Update database
    # db.subscriptions.update_one(
    #     {"driver_id": driver_id},
    #     {"$set": {"last_payment_date": payment_result["payment_date"]}}
    # )
    
    return payment_result

@subscription_router.post("/trial/trip-completed/{driver_id}")
async def record_trial_trip(driver_id: str):
    """Record a trial trip completion"""
    # subscription = db.subscriptions.find_one({"driver_id": driver_id})
    # subscription.trial_trips_count += 1
    # db.subscriptions.update_one(...)
    
    return {
        "driver_id": driver_id,
        "trial_trips_count": 1,  # From DB
        "trials_remaining": TRIAL_TRIP_LIMIT - 1
    }

@subscription_router.post("/referral/apply")
async def apply_referral_code(driver_id: str, referral_code: str):
    """Apply referral code during registration"""
    # Check if referral code exists
    # Link referee to referrer
    
    manager = SubscriptionManager()
    # result = manager.referral.process_referral(referrer_id, driver_id)
    
    return {
        "success": True,
        "message": "Referral applied! Referrer gets 1 month free after you complete 20 trips."
    }

@subscription_router.get("/referral/stats/{driver_id}")
async def get_referral_stats(driver_id: str):
    """Get driver referral statistics"""
    return {
        "driver_id": driver_id,
        "referral_code": "ABC12345",
        "total_referrals": 3,
        "pending_referrals": 1,
        "completed_referrals": 2,
        "free_months_earned": 2,
        "monthly_limit": MAX_REFERRALS_PER_MONTH,
        "remaining_this_month": 2
    }

# Include router in main app
# app.include_router(subscription_router)

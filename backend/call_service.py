"""
NexRyde Call/Communication System with Privacy Protection
Implements masked calls and secure communication
"""

from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from pydantic import BaseModel
from enum import Enum
import secrets
import string

class CallStatus(str, Enum):
    INITIATED = "initiated"
    RINGING = "ringing"
    CONNECTED = "connected"
    ENDED = "ended"
    FAILED = "failed"

class CallType(str, Enum):
    MASKED = "masked"
    IN_APP = "in_app"

class MaskedNumberConfig:
    """Configuration for masked call system"""
    
    # Mask configuration
    MASK_DURATION_HOURS = 2  # Temporary number valid for 2 hours
    MAX_CALL_DURATION_MINUTES = 15  # Max 15 minutes per call
    
    # Call permissions
    CALL_ALLOWED_AFTER_ACCEPTANCE = True
    CALL_DISABLED_AFTER_TRIP = True
    
    # Abuse protection
    MAX_CALLS_PER_TRIP = 5
    MIN_SECONDS_BETWEEN_CALLS = 30

class MaskedNumberGenerator:
    """Generates temporary masked phone numbers"""
    
    @staticmethod
    def generate_masked_number(
        real_number: str,
        ride_id: str
    ) -> str:
        """
        Generate a temporary masked number
        In production, integrate with Twilio or similar service
        """
        
        # Generate unique masked number
        # Format: +234XXX-RIDE-XXX
        random_digits = ''.join(secrets.choice(string.digits) for _ in range(6))
        masked = f"+234{random_digits[:3]}-RIDE-{random_digits[3:]}"
        
        return masked
    
    @staticmethod
    def create_call_mask(
        driver_id: str,
        rider_id: str,
        ride_id: str,
        driver_phone: str,
        rider_phone: str
    ) -> Dict[str, Any]:
        """
        Create masked numbers for both driver and rider
        """
        
        expiry_time = datetime.utcnow() + timedelta(
            hours=MaskedNumberConfig.MASK_DURATION_HOURS
        )
        
        return {
            "ride_id": ride_id,
            "driver_masked_number": MaskedNumberGenerator.generate_masked_number(
                driver_phone, ride_id
            ),
            "rider_masked_number": MaskedNumberGenerator.generate_masked_number(
                rider_phone, ride_id
            ),
            "expires_at": expiry_time,
            "status": "active",
            "created_at": datetime.utcnow()
        }

class CallAccessValidator:
    """Validates if call can be made"""
    
    @staticmethod
    def can_make_call(
        ride_status: str,
        subscription_status: str,
        trial_expired: bool,
        calls_made_this_trip: int,
        last_call_time: Optional[datetime] = None
    ) -> tuple[bool, str]:
        """Check if call is allowed"""
        
        # Rule 1: Ride must be accepted
        if ride_status not in ["accepted", "pickup", "ongoing"]:
            return False, "Calls only allowed during active trips"
        
        # Rule 2: Subscription must be active
        if subscription_status == "suspended":
            return False, "Subscription suspended. Cannot make calls."
        
        if subscription_status == "trial" and trial_expired:
            return False, "Trial expired. Subscribe to make calls."
        
        # Rule 3: Max calls per trip
        if calls_made_this_trip >= MaskedNumberConfig.MAX_CALLS_PER_TRIP:
            return False, f"Maximum {MaskedNumberConfig.MAX_CALLS_PER_TRIP} calls per trip reached"
        
        # Rule 4: Time between calls
        if last_call_time:
            seconds_since_last = (datetime.utcnow() - last_call_time).total_seconds()
            min_seconds = MaskedNumberConfig.MIN_SECONDS_BETWEEN_CALLS
            
            if seconds_since_last < min_seconds:
                return False, f"Wait {int(min_seconds - seconds_since_last)} seconds before calling again"
        
        return True, "Call allowed"

class CallTracker:
    """Tracks call usage and logs"""
    
    def __init__(self):
        self.call_logs = {}  # In production, use database
    
    async def record_call(
        self,
        ride_id: str,
        caller_id: str,
        caller_type: str,  # "driver" or "rider"
        call_duration_seconds: int,
        call_status: CallStatus
    ) -> Dict[str, Any]:
        """Record call details for safety and tracking"""
        
        call_record = {
            "ride_id": ride_id,
            "caller_id": caller_id,
            "caller_type": caller_type,
            "call_start": datetime.utcnow(),
            "duration_seconds": call_duration_seconds,
            "status": call_status,
            "timestamp": datetime.utcnow()
        }
        
        # Save to database
        # await db.call_logs.insert_one(call_record)
        
        return call_record
    
    def get_trip_call_count(self, ride_id: str) -> int:
        """Get number of calls made for this trip"""
        
        # In production, query database
        # count = await db.call_logs.count_documents({"ride_id": ride_id})
        
        return 0  # Placeholder

class CommunicationService:
    """Main communication service"""
    
    def __init__(self):
        self.validator = CallAccessValidator()
        self.tracker = CallTracker()
        self.number_generator = MaskedNumberGenerator()
    
    async def initiate_masked_call(
        self,
        ride_id: str,
        caller_id: str,
        caller_type: str,  # "driver" or "rider"
        driver_phone: str,
        rider_phone: str,
        ride_status: str,
        subscription_status: str,
        trial_expired: bool
    ) -> Dict[str, Any]:
        """
        Initiate a masked call between driver and rider
        """
        
        # Get call count for this trip
        calls_made = self.tracker.get_trip_call_count(ride_id)
        
        # Validate call permission
        can_call, reason = self.validator.can_make_call(
            ride_status=ride_status,
            subscription_status=subscription_status,
            trial_expired=trial_expired,
            calls_made_this_trip=calls_made
        )
        
        if not can_call:
            return {
                "success": False,
                "error": reason
            }
        
        # Create masked numbers
        mask_data = self.number_generator.create_call_mask(
            driver_id=caller_id if caller_type == "driver" else "receiver",
            rider_id=caller_id if caller_type == "rider" else "receiver",
            ride_id=ride_id,
            driver_phone=driver_phone,
            rider_phone=rider_phone
        )
        
        # In production, use Twilio or similar to connect call
        # connection = await self._connect_call_via_twilio(mask_data)
        
        return {
            "success": True,
            "call_id": f"CALL-{ride_id}-{int(datetime.utcnow().timestamp())}",
            "masked_number": (
                mask_data["driver_masked_number"] if caller_type == "driver"
                else mask_data["rider_masked_number"]
            ),
            "max_duration_minutes": MaskedNumberConfig.MAX_CALL_DURATION_MINUTES,
            "message": "Call connecting via masked number",
            "expires_at": mask_data["expires_at"]
        }
    
    async def end_call(
        self,
        ride_id: str,
        call_id: str,
        duration_seconds: int
    ) -> Dict[str, Any]:
        """End a call and record details"""
        
        # Record call log
        await self.tracker.record_call(
            ride_id=ride_id,
            caller_id="user",  # Get from call_id
            caller_type="driver",  # Get from call_id
            call_duration_seconds=duration_seconds,
            call_status=CallStatus.ENDED
        )
        
        return {
            "success": True,
            "call_id": call_id,
            "duration_seconds": duration_seconds,
            "message": "Call ended successfully"
        }
    
    async def get_call_logs(
        self,
        ride_id: str
    ) -> Dict[str, Any]:
        """Get call logs for a ride (for safety/support)"""
        
        # Query database
        # logs = await db.call_logs.find({"ride_id": ride_id}).to_list()
        
        logs = []  # Placeholder
        
        return {
            "ride_id": ride_id,
            "total_calls": len(logs),
            "calls": logs
        }

class InAppMessaging:
    """In-app chat alternative to calls"""
    
    @staticmethod
    async def send_message(
        ride_id: str,
        sender_id: str,
        sender_type: str,
        message: str
    ) -> Dict[str, Any]:
        """Send chat message (free alternative to calls)"""
        
        # Validate message
        if len(message) > 500:
            return {
                "success": False,
                "error": "Message too long (max 500 characters)"
            }
        
        message_record = {
            "ride_id": ride_id,
            "sender_id": sender_id,
            "sender_type": sender_type,
            "message": message,
            "timestamp": datetime.utcnow(),
            "read": False
        }
        
        # Save to database
        # await db.messages.insert_one(message_record)
        
        return {
            "success": True,
            "message_id": f"MSG-{int(datetime.utcnow().timestamp())}",
            "timestamp": message_record["timestamp"]
        }
    
    @staticmethod
    async def get_trip_messages(ride_id: str) -> list:
        """Get all messages for a trip"""
        
        # Query database
        # messages = await db.messages.find({"ride_id": ride_id}).to_list()
        
        return []  # Placeholder

# API Routes
from fastapi import APIRouter, HTTPException

call_router = APIRouter(prefix="/api/communication", tags=["communication"])

@call_router.post("/initiate-call")
async def initiate_call(
    ride_id: str,
    caller_id: str,
    caller_type: str,
    driver_phone: str,
    rider_phone: str
):
    """Initiate masked call between driver and rider"""
    
    # Get ride details (from database)
    ride_status = "accepted"  # Placeholder
    subscription_status = "active"  # Placeholder
    trial_expired = False
    
    comm_service = CommunicationService()
    
    result = await comm_service.initiate_masked_call(
        ride_id=ride_id,
        caller_id=caller_id,
        caller_type=caller_type,
        driver_phone=driver_phone,
        rider_phone=rider_phone,
        ride_status=ride_status,
        subscription_status=subscription_status,
        trial_expired=trial_expired
    )
    
    if not result["success"]:
        raise HTTPException(status_code=403, detail=result["error"])
    
    return result

@call_router.post("/end-call")
async def end_call(
    ride_id: str,
    call_id: str,
    duration_seconds: int
):
    """End call and record log"""
    
    comm_service = CommunicationService()
    result = await comm_service.end_call(ride_id, call_id, duration_seconds)
    
    return result

@call_router.get("/call-logs/{ride_id}")
async def get_call_logs(ride_id: str):
    """Get call logs for a ride"""
    
    comm_service = CommunicationService()
    logs = await comm_service.get_call_logs(ride_id)
    
    return logs

@call_router.post("/send-message")
async def send_chat_message(
    ride_id: str,
    sender_id: str,
    sender_type: str,
    message: str
):
    """Send in-app chat message"""
    
    result = await InAppMessaging.send_message(
        ride_id, sender_id, sender_type, message
    )
    
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    
    return result

@call_router.get("/messages/{ride_id}")
async def get_trip_messages(ride_id: str):
    """Get chat messages for a ride"""
    
    messages = await InAppMessaging.get_trip_messages(ride_id)
    
    return {
        "ride_id": ride_id,
        "messages": messages
    }

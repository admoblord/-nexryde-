"""
NexRyde Trial Abuse Prevention System
Prevents drivers from creating multiple trial accounts
"""

from datetime import datetime, timedelta
from typing import Optional, Dict, Any, Tuple
from motor.motor_asyncio import AsyncIOMotorClient
import hashlib
import logging

logger = logging.getLogger(__name__)

class TrialAbuseDetector:
    """Detects and prevents trial abuse"""
    
    def __init__(self, db):
        self.db = db
    
    async def check_phone_number(self, phone: str) -> Tuple[bool, str]:
        """
        Check if phone number has already used trial
        Returns: (is_allowed: bool, reason: str)
        """
        # Normalize phone number
        normalized_phone = phone.replace('+', '').replace(' ', '').replace('-', '')
        
        # Check if phone is blacklisted
        blacklisted = await self.db.trial_blacklist.find_one({
            "phone": normalized_phone,
            "reason": {"$in": ["trial_used", "abuse_detected"]}
        })
        
        if blacklisted:
            return False, "This phone number has already been used for a trial"
        
        # Check if phone has active or expired trial
        existing_trial = await self.db.subscriptions.find_one({
            "phone": normalized_phone,
            "status": {"$in": ["trial", "active", "expired"]}
        })
        
        if existing_trial:
            return False, "This phone number has already used a trial"
        
        return True, "Phone number eligible"
    
    async def check_nin_duplicate(self, nin: str) -> Tuple[bool, str]:
        """
        Check if NIN has already been used
        Returns: (is_allowed: bool, reason: str)
        """
        if not nin or len(nin) < 8:
            return True, "NIN validation skipped"
        
        # Hash NIN for privacy
        nin_hash = hashlib.sha256(nin.encode()).hexdigest()
        
        # Check if NIN exists in verified drivers
        existing_driver = await self.db.driver_verifications.find_one({
            "nin_hash": nin_hash,
            "status": {"$in": ["approved", "pending"]}
        })
        
        if existing_driver:
            return False, "This National Identity Number has already been registered"
        
        return True, "NIN eligible"
    
    async def check_drivers_license_duplicate(self, license_number: str) -> Tuple[bool, str]:
        """
        Check if driver's license has already been used
        Returns: (is_allowed: bool, reason: str)
        """
        if not license_number or len(license_number) < 5:
            return True, "License validation skipped"
        
        # Hash license for privacy
        license_hash = hashlib.sha256(license_number.upper().encode()).hexdigest()
        
        # Check if license exists
        existing_driver = await self.db.driver_verifications.find_one({
            "license_hash": license_hash,
            "status": {"$in": ["approved", "pending"]}
        })
        
        if existing_driver:
            return False, "This driver's license has already been registered"
        
        return True, "License eligible"
    
    async def check_device_fingerprint(self, device_id: Optional[str], ip_address: Optional[str]) -> Tuple[bool, str]:
        """
        Check device fingerprint for multiple account creation
        Returns: (is_allowed: bool, reason: str)
        """
        if not device_id and not ip_address:
            return True, "Device check skipped"
        
        # Check device ID
        if device_id:
            device_count = await self.db.subscriptions.count_documents({
                "device_id": device_id,
                "status": {"$in": ["trial", "active"]}
            })
            
            if device_count >= 2:
                return False, "Too many trials from this device"
        
        # Check IP address (more lenient - allow up to 5 from same IP)
        if ip_address:
            ip_count = await self.db.trial_attempts.count_documents({
                "ip_address": ip_address,
                "created_at": {"$gte": datetime.utcnow() - timedelta(days=30)}
            })
            
            if ip_count >= 5:
                return False, "Too many trial attempts from this network"
        
        return True, "Device eligible"
    
    async def comprehensive_trial_check(
        self,
        phone: str,
        nin: Optional[str] = None,
        license_number: Optional[str] = None,
        device_id: Optional[str] = None,
        ip_address: Optional[str] = None
    ) -> Tuple[bool, str, Dict[str, Any]]:
        """
        Comprehensive check for trial eligibility
        Returns: (is_allowed: bool, reason: str, details: dict)
        """
        checks = {
            "phone_check": {"passed": False, "message": ""},
            "nin_check": {"passed": False, "message": ""},
            "license_check": {"passed": False, "message": ""},
            "device_check": {"passed": False, "message": ""}
        }
        
        # Phone check (mandatory)
        phone_allowed, phone_reason = await self.check_phone_number(phone)
        checks["phone_check"] = {"passed": phone_allowed, "message": phone_reason}
        
        if not phone_allowed:
            return False, phone_reason, checks
        
        # NIN check (if provided)
        if nin:
            nin_allowed, nin_reason = await self.check_nin_duplicate(nin)
            checks["nin_check"] = {"passed": nin_allowed, "message": nin_reason}
            
            if not nin_allowed:
                await self.log_abuse_attempt(phone, "nin_duplicate", nin_reason)
                return False, nin_reason, checks
        
        # License check (if provided)
        if license_number:
            license_allowed, license_reason = await self.check_drivers_license_duplicate(license_number)
            checks["license_check"] = {"passed": license_allowed, "message": license_reason}
            
            if not license_allowed:
                await self.log_abuse_attempt(phone, "license_duplicate", license_reason)
                return False, license_reason, checks
        
        # Device check
        device_allowed, device_reason = await self.check_device_fingerprint(device_id, ip_address)
        checks["device_check"] = {"passed": device_allowed, "message": device_reason}
        
        if not device_allowed:
            await self.log_abuse_attempt(phone, "device_abuse", device_reason)
            return False, device_reason, checks
        
        # Log trial attempt
        await self.log_trial_attempt(phone, device_id, ip_address)
        
        return True, "Trial eligible", checks
    
    async def log_trial_attempt(self, phone: str, device_id: Optional[str], ip_address: Optional[str]):
        """Log trial attempt for tracking"""
        await self.db.trial_attempts.insert_one({
            "phone": phone.replace('+', '').replace(' ', ''),
            "device_id": device_id,
            "ip_address": ip_address,
            "created_at": datetime.utcnow(),
            "status": "allowed"
        })
    
    async def log_abuse_attempt(self, phone: str, abuse_type: str, reason: str):
        """Log abuse attempt for security monitoring"""
        await self.db.abuse_logs.insert_one({
            "phone": phone.replace('+', '').replace(' ', ''),
            "abuse_type": abuse_type,
            "reason": reason,
            "detected_at": datetime.utcnow(),
            "severity": "medium"
        })
        
        logger.warning(f"Trial abuse detected: {abuse_type} - {phone} - {reason}")
    
    async def blacklist_phone(self, phone: str, reason: str = "trial_used"):
        """Add phone number to blacklist"""
        normalized_phone = phone.replace('+', '').replace(' ', '').replace('-', '')
        
        await self.db.trial_blacklist.insert_one({
            "phone": normalized_phone,
            "reason": reason,
            "blacklisted_at": datetime.utcnow(),
            "status": "active"
        })
        
        logger.info(f"Phone {normalized_phone} blacklisted: {reason}")
    
    async def blacklist_after_trial_completion(self, phone: str):
        """
        Automatically blacklist phone after trial expires
        Call this when trial ends
        """
        await self.blacklist_phone(phone, reason="trial_used")
    
    async def get_abuse_statistics(self) -> Dict[str, Any]:
        """Get statistics on trial abuse attempts"""
        # Total abuse attempts in last 30 days
        total_attempts = await self.db.abuse_logs.count_documents({
            "detected_at": {"$gte": datetime.utcnow() - timedelta(days=30)}
        })
        
        # Abuse by type
        pipeline = [
            {
                "$match": {
                    "detected_at": {"$gte": datetime.utcnow() - timedelta(days=30)}
                }
            },
            {
                "$group": {
                    "_id": "$abuse_type",
                    "count": {"$sum": 1}
                }
            }
        ]
        
        abuse_by_type = await self.db.abuse_logs.aggregate(pipeline).to_list(100)
        
        # Total blacklisted numbers
        blacklisted_count = await self.db.trial_blacklist.count_documents({
            "status": "active"
        })
        
        return {
            "total_abuse_attempts_30d": total_attempts,
            "abuse_by_type": abuse_by_type,
            "total_blacklisted": blacklisted_count,
            "prevention_rate": f"{(total_attempts / max(total_attempts + blacklisted_count, 1)) * 100:.1f}%"
        }


# Helper function for easy integration
async def validate_trial_eligibility(
    phone: str,
    nin: Optional[str] = None,
    license_number: Optional[str] = None,
    device_id: Optional[str] = None,
    ip_address: Optional[str] = None,
    db=None
) -> Tuple[bool, str]:
    """
    Convenience function to validate trial eligibility
    Returns: (is_eligible: bool, reason: str)
    """
    detector = TrialAbuseDetector(db)
    is_allowed, reason, checks = await detector.comprehensive_trial_check(
        phone=phone,
        nin=nin,
        license_number=license_number,
        device_id=device_id,
        ip_address=ip_address
    )
    
    return is_allowed, reason

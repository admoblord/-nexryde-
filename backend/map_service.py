"""
NexRyde Map Service with Cost Controls
Prevents API abuse and controls Google Maps expenses
"""

from datetime import datetime, timedelta
from typing import Optional, Dict, Any, Tuple
from pydantic import BaseModel
from enum import Enum
import asyncio

class MapRequestType(str, Enum):
    DISTANCE_CALCULATION = "distance_calculation"
    ROUTE_PLANNING = "route_planning"
    NAVIGATION_UPDATE = "navigation_update"
    GEOCODING = "geocoding"

class RideStatus(str, Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    PICKUP = "pickup"
    ONGOING = "ongoing"
    COMPLETED = "completed"
    CANCELLED = "cancelled"

class MapUsageConfig:
    """Map API usage limits and throttling"""
    
    # Request limits
    MAX_REQUESTS_PER_HOUR = 100  # Per driver
    MAX_REQUESTS_PER_DAY = 500   # Per driver
    MAX_DISTANCE_CALCS_PER_TRIP = 1  # Only calculate once
    
    # Trial limitations
    TRIAL_MAX_REQUESTS_PER_DAY = 20
    TRIAL_MAX_DISTANCE_CALCS = 3  # 3 trips only
    
    # Navigation throttling
    NAVIGATION_UPDATE_INTERVAL_SECONDS = 30  # Update every 30 seconds max
    
    # Cache settings
    DISTANCE_CACHE_DURATION_HOURS = 1  # Cache distance results
    
    # Subscription check
    REQUIRE_ACTIVE_SUBSCRIPTION = True

class MapAccessValidator:
    """Validates if driver can access map services"""
    
    @staticmethod
    def can_use_map(
        driver_id: str,
        subscription_status: str,
        trial_expired: bool,
        is_driver_online: bool,
        has_active_ride: bool,
        request_type: MapRequestType
    ) -> Tuple[bool, str]:
        """
        Check if driver can use map services
        Returns: (allowed: bool, reason: str)
        """
        
        # Rule 1: Driver must be online
        if not is_driver_online:
            return False, "Driver must be online to use map services"
        
        # Rule 2: Subscription validation
        if subscription_status == "suspended":
            return False, "Subscription suspended. Please pay to continue."
        
        if subscription_status == "trial" and trial_expired:
            return False, "Trial expired. Subscribe to continue using map services."
        
        if subscription_status == "limited":
            return False, "Limited access. Pay subscription to restore map access."
        
        # Rule 3: Active ride requirement (except for initial distance calc)
        if request_type == MapRequestType.NAVIGATION_UPDATE and not has_active_ride:
            return False, "Navigation only available during active rides"
        
        # Rule 4: Trial limitations
        if subscription_status == "trial":
            # Check if trial limits exceeded (handled by rate limiter)
            pass
        
        return True, "Access granted"
    
    @staticmethod
    def validate_ride_status_for_map(ride_status: RideStatus) -> bool:
        """Check if ride status allows map usage"""
        allowed_statuses = [
            RideStatus.ACCEPTED,
            RideStatus.PICKUP,
            RideStatus.ONGOING
        ]
        return ride_status in allowed_statuses

class MapUsageTracker:
    """Tracks map API usage per driver"""
    
    def __init__(self):
        self.usage_cache = {}  # In production, use Redis
    
    async def record_request(
        self,
        driver_id: str,
        request_type: MapRequestType,
        ride_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Record a map API request"""
        
        timestamp = datetime.utcnow()
        
        # Get or create usage record
        if driver_id not in self.usage_cache:
            self.usage_cache[driver_id] = {
                "hourly_requests": [],
                "daily_requests": [],
                "total_requests": 0
            }
        
        usage = self.usage_cache[driver_id]
        
        # Add to tracking
        request_record = {
            "type": request_type,
            "timestamp": timestamp,
            "ride_id": ride_id
        }
        
        usage["hourly_requests"].append(request_record)
        usage["daily_requests"].append(request_record)
        usage["total_requests"] += 1
        
        # Clean old records
        self._cleanup_old_records(driver_id)
        
        # Save to database
        # await db.map_usage.insert_one(request_record)
        
        return {
            "driver_id": driver_id,
            "request_type": request_type,
            "timestamp": timestamp,
            "hourly_count": len(usage["hourly_requests"]),
            "daily_count": len(usage["daily_requests"])
        }
    
    def _cleanup_old_records(self, driver_id: str):
        """Remove old usage records"""
        now = datetime.utcnow()
        usage = self.usage_cache[driver_id]
        
        # Keep only last hour
        usage["hourly_requests"] = [
            r for r in usage["hourly_requests"]
            if (now - r["timestamp"]).total_seconds() < 3600
        ]
        
        # Keep only last 24 hours
        usage["daily_requests"] = [
            r for r in usage["daily_requests"]
            if (now - r["timestamp"]).total_seconds() < 86400
        ]
    
    async def check_rate_limit(
        self,
        driver_id: str,
        is_trial: bool = False
    ) -> Tuple[bool, str]:
        """Check if driver has exceeded rate limits"""
        
        if driver_id not in self.usage_cache:
            return True, "Within limits"
        
        usage = self.usage_cache[driver_id]
        hourly_count = len(usage["hourly_requests"])
        daily_count = len(usage["daily_requests"])
        
        # Check hourly limit
        max_hourly = MapUsageConfig.MAX_REQUESTS_PER_HOUR
        if hourly_count >= max_hourly:
            return False, f"Hourly limit reached ({max_hourly} requests/hour)"
        
        # Check daily limit
        max_daily = (
            MapUsageConfig.TRIAL_MAX_REQUESTS_PER_DAY if is_trial
            else MapUsageConfig.MAX_REQUESTS_PER_DAY
        )
        
        if daily_count >= max_daily:
            return False, f"Daily limit reached ({max_daily} requests/day)"
        
        return True, f"Usage: {hourly_count}/hr, {daily_count}/day"

class DistanceCache:
    """Caches distance calculations to avoid redundant API calls"""
    
    def __init__(self):
        self.cache = {}  # In production, use Redis
    
    def get_cached_distance(
        self,
        pickup_lat: float,
        pickup_lng: float,
        dropoff_lat: float,
        dropoff_lng: float
    ) -> Optional[Dict[str, Any]]:
        """Get cached distance if available"""
        
        cache_key = self._generate_cache_key(
            pickup_lat, pickup_lng, dropoff_lat, dropoff_lng
        )
        
        if cache_key in self.cache:
            cached_data = self.cache[cache_key]
            
            # Check if cache is still valid
            cache_age = (datetime.utcnow() - cached_data["timestamp"]).total_seconds()
            max_age = MapUsageConfig.DISTANCE_CACHE_DURATION_HOURS * 3600
            
            if cache_age < max_age:
                return cached_data["data"]
        
        return None
    
    def cache_distance(
        self,
        pickup_lat: float,
        pickup_lng: float,
        dropoff_lat: float,
        dropoff_lng: float,
        distance_km: float,
        duration_minutes: int,
        fare_estimate: float
    ):
        """Cache distance calculation result"""
        
        cache_key = self._generate_cache_key(
            pickup_lat, pickup_lng, dropoff_lat, dropoff_lng
        )
        
        self.cache[cache_key] = {
            "timestamp": datetime.utcnow(),
            "data": {
                "distance_km": distance_km,
                "duration_minutes": duration_minutes,
                "fare_estimate": fare_estimate
            }
        }
    
    def _generate_cache_key(
        self,
        pickup_lat: float,
        pickup_lng: float,
        dropoff_lat: float,
        dropoff_lng: float
    ) -> str:
        """Generate cache key from coordinates (rounded to 3 decimals)"""
        return f"{round(pickup_lat, 3)}_{round(pickup_lng, 3)}_" \
               f"{round(dropoff_lat, 3)}_{round(dropoff_lng, 3)}"

class MapService:
    """Main map service with cost controls"""
    
    def __init__(self):
        self.validator = MapAccessValidator()
        self.tracker = MapUsageTracker()
        self.cache = DistanceCache()
    
    async def calculate_distance_and_fare(
        self,
        driver_id: str,
        ride_id: str,
        pickup_coords: Dict[str, float],
        dropoff_coords: Dict[str, float],
        subscription_status: str,
        trial_expired: bool
    ) -> Dict[str, Any]:
        """
        Calculate distance and fare (ONLY ONCE per ride)
        This is the MAIN cost-controlled function
        """
        
        # Step 1: Check cache first (avoid API call)
        cached = self.cache.get_cached_distance(
            pickup_coords["lat"],
            pickup_coords["lng"],
            dropoff_coords["lat"],
            dropoff_coords["lng"]
        )
        
        if cached:
            return {
                "success": True,
                "source": "cache",
                "distance_km": cached["distance_km"],
                "duration_minutes": cached["duration_minutes"],
                "fare_estimate": cached["fare_estimate"],
                "message": "Retrieved from cache (no API cost)"
            }
        
        # Step 2: Validate access
        can_access, reason = self.validator.can_use_map(
            driver_id=driver_id,
            subscription_status=subscription_status,
            trial_expired=trial_expired,
            is_driver_online=True,
            has_active_ride=True,
            request_type=MapRequestType.DISTANCE_CALCULATION
        )
        
        if not can_access:
            return {
                "success": False,
                "error": reason
            }
        
        # Step 3: Check rate limits
        is_trial = subscription_status == "trial"
        within_limits, limit_msg = await self.tracker.check_rate_limit(
            driver_id, is_trial
        )
        
        if not within_limits:
            return {
                "success": False,
                "error": limit_msg
            }
        
        # Step 4: Call Google Maps API (ACTUAL COST HERE)
        distance_data = await self._call_google_maps_api(
            pickup_coords, dropoff_coords
        )
        
        # Step 5: Calculate fare
        fare = self._calculate_fare(distance_data["distance_km"])
        
        # Step 6: Cache result
        self.cache.cache_distance(
            pickup_coords["lat"],
            pickup_coords["lng"],
            dropoff_coords["lat"],
            dropoff_coords["lng"],
            distance_data["distance_km"],
            distance_data["duration_minutes"],
            fare
        )
        
        # Step 7: Record usage
        await self.tracker.record_request(
            driver_id,
            MapRequestType.DISTANCE_CALCULATION,
            ride_id
        )
        
        return {
            "success": True,
            "source": "google_maps_api",
            "distance_km": distance_data["distance_km"],
            "duration_minutes": distance_data["duration_minutes"],
            "fare_estimate": fare,
            "message": "Distance calculated successfully"
        }
    
    async def _call_google_maps_api(
        self,
        origin: Dict[str, float],
        destination: Dict[str, float]
    ) -> Dict[str, Any]:
        """
        Actual Google Maps API call
        In production, use Google Maps Distance Matrix API
        """
        
        # Placeholder - replace with actual Google Maps API call
        # import googlemaps
        # gmaps = googlemaps.Client(key='YOUR_API_KEY')
        # result = gmaps.distance_matrix(origin, destination)
        
        # For now, calculate straight-line distance
        import math
        
        lat1, lng1 = origin["lat"], origin["lng"]
        lat2, lng2 = destination["lat"], destination["lng"]
        
        # Haversine formula (approximate)
        R = 6371  # Earth radius in km
        
        dlat = math.radians(lat2 - lat1)
        dlng = math.radians(lng2 - lng1)
        
        a = (
            math.sin(dlat / 2) ** 2 +
            math.cos(math.radians(lat1)) *
            math.cos(math.radians(lat2)) *
            math.sin(dlng / 2) ** 2
        )
        
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        distance_km = R * c
        
        # Estimate duration (assuming 40 km/h average)
        duration_minutes = int((distance_km / 40) * 60)
        
        return {
            "distance_km": round(distance_km, 2),
            "duration_minutes": duration_minutes
        }
    
    def _calculate_fare(self, distance_km: float) -> float:
        """Calculate fare based on distance"""
        
        BASE_FARE = 500  # ₦500 base
        PER_KM = 200     # ₦200 per km
        
        fare = BASE_FARE + (distance_km * PER_KM)
        return round(fare, 2)
    
    async def get_navigation_update(
        self,
        driver_id: str,
        ride_id: str,
        current_location: Dict[str, float],
        destination: Dict[str, float],
        last_update_time: Optional[datetime] = None
    ) -> Dict[str, Any]:
        """
        Get navigation update (THROTTLED)
        Only updates every 30 seconds minimum
        """
        
        # Check if enough time has passed since last update
        if last_update_time:
            time_since_last = (datetime.utcnow() - last_update_time).total_seconds()
            min_interval = MapUsageConfig.NAVIGATION_UPDATE_INTERVAL_SECONDS
            
            if time_since_last < min_interval:
                return {
                    "success": False,
                    "error": f"Navigation updates limited to every {min_interval} seconds",
                    "retry_after": min_interval - time_since_last
                }
        
        # Return navigation data
        return {
            "success": True,
            "current_location": current_location,
            "destination": destination,
            "next_update_allowed_at": datetime.utcnow() + timedelta(seconds=30),
            "message": "Continue to destination"
        }

# API Routes
from fastapi import APIRouter, HTTPException, Depends

map_router = APIRouter(prefix="/api/map", tags=["map"])

@map_router.post("/calculate-distance")
async def calculate_ride_distance(
    driver_id: str,
    ride_id: str,
    pickup_lat: float,
    pickup_lng: float,
    dropoff_lat: float,
    dropoff_lng: float
):
    """Calculate distance and fare for a ride (ONCE per ride)"""
    
    # Get driver subscription status (from database)
    subscription_status = "active"  # Placeholder
    trial_expired = False
    
    map_service = MapService()
    
    result = await map_service.calculate_distance_and_fare(
        driver_id=driver_id,
        ride_id=ride_id,
        pickup_coords={"lat": pickup_lat, "lng": pickup_lng},
        dropoff_coords={"lat": dropoff_lat, "lng": dropoff_lng},
        subscription_status=subscription_status,
        trial_expired=trial_expired
    )
    
    if not result["success"]:
        raise HTTPException(status_code=403, detail=result["error"])
    
    return result

@map_router.get("/usage-stats/{driver_id}")
async def get_map_usage_stats(driver_id: str):
    """Get driver's map usage statistics"""
    
    tracker = MapUsageTracker()
    
    if driver_id not in tracker.usage_cache:
        return {
            "driver_id": driver_id,
            "hourly_requests": 0,
            "daily_requests": 0,
            "limits": {
                "hourly": MapUsageConfig.MAX_REQUESTS_PER_HOUR,
                "daily": MapUsageConfig.MAX_REQUESTS_PER_DAY
            }
        }
    
    usage = tracker.usage_cache[driver_id]
    
    return {
        "driver_id": driver_id,
        "hourly_requests": len(usage["hourly_requests"]),
        "daily_requests": len(usage["daily_requests"]),
        "total_requests": usage["total_requests"],
        "limits": {
            "hourly": MapUsageConfig.MAX_REQUESTS_PER_HOUR,
            "daily": MapUsageConfig.MAX_REQUESTS_PER_DAY
        }
    }

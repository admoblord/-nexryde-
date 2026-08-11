"""
Route Caching Service - API Cost Protection
Minimizes Google Maps API calls by caching popular routes
Implements Route Owner gamification system
"""

from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, HTTPException
from motor.motor_asyncio import AsyncIOMotorClient
import googlemaps
import os

# ==================== CONFIGURATION ====================

GOOGLE_MAPS_API_KEY = os.environ.get('GOOGLE_MAPS_API_KEY', '')
API_CALL_COST = 200  # ₦200 per Google Maps API call
DAILY_BUDGET_LIMIT = 50000  # ₦50,000/day safety limit
MONTHLY_BUDGET_LIMIT = 500000  # ₦500,000/month
CACHE_VALIDITY_DAYS = 30  # Routes expire after 30 days
ROUTE_OWNER_BONUS = 5000  # ₦5,000 bonus for discovering new routes

# Top 50 Nigerian Inter-City Routes (Pre-cache these)
TOP_50_ROUTES = [
    # Lagos routes
    {"origin": "Lagos", "destination": "Ibadan", "lat": [6.5244, 7.3775], "lng": [3.3792, 3.9470]},
    {"origin": "Lagos", "destination": "Abuja", "lat": [6.5244, 9.0765], "lng": [3.3792, 7.3986]},
    {"origin": "Lagos", "destination": "Port Harcourt", "lat": [6.5244, 4.8156], "lng": [3.3792, 7.0498]},
    {"origin": "Lagos", "destination": "Benin City", "lat": [6.5244, 6.3350], "lng": [3.3792, 5.6037]},
    {"origin": "Lagos", "destination": "Enugu", "lat": [6.5244, 6.4419], "lng": [3.3792, 7.4924]},
    {"origin": "Lagos", "destination": "Abeokuta", "lat": [6.5244, 7.1475], "lng": [3.3792, 3.3619]},
    {"origin": "Lagos", "destination": "Ife", "lat": [6.5244, 7.4815], "lng": [3.3792, 4.5600]},
    {"origin": "Lagos", "destination": "Akure", "lat": [6.5244, 7.2571], "lng": [3.3792, 5.2058]},
    {"origin": "Lagos", "destination": "Owerri", "lat": [6.5244, 5.4840], "lng": [3.3792, 7.0351]},
    {"origin": "Lagos", "destination": "Calabar", "lat": [6.5244, 4.9757], "lng": [3.3792, 8.3417]},
    
    # Abuja routes
    {"origin": "Abuja", "destination": "Kaduna", "lat": [9.0765, 10.5105], "lng": [7.3986, 7.4165]},
    {"origin": "Abuja", "destination": "Jos", "lat": [9.0765, 9.8965], "lng": [7.3986, 8.8583]},
    {"origin": "Abuja", "destination": "Kano", "lat": [9.0765, 12.0022], "lng": [7.3986, 8.5920]},
    {"origin": "Abuja", "destination": "Minna", "lat": [9.0765, 9.6139], "lng": [7.3986, 6.5569]},
    {"origin": "Abuja", "destination": "Makurdi", "lat": [9.0765, 7.7344], "lng": [7.3986, 8.5379]},
    
    # Ibadan routes
    {"origin": "Ibadan", "destination": "Ilorin", "lat": [7.3775, 8.4966], "lng": [3.9470, 4.5426]},
    {"origin": "Ibadan", "destination": "Osogbo", "lat": [7.3775, 7.7667], "lng": [3.9470, 4.5667]},
    {"origin": "Ibadan", "destination": "Ife", "lat": [7.3775, 7.4815], "lng": [3.9470, 4.5600]},
    
    # Port Harcourt routes
    {"origin": "Port Harcourt", "destination": "Aba", "lat": [4.8156, 5.1066], "lng": [7.0498, 7.3500]},
    {"origin": "Port Harcourt", "destination": "Uyo", "lat": [4.8156, 5.0380], "lng": [7.0498, 7.9074]},
    {"origin": "Port Harcourt", "destination": "Calabar", "lat": [4.8156, 4.9757], "lng": [7.0498, 8.3417]},
    
    # Reverse routes (for return trips)
    {"origin": "Ibadan", "destination": "Lagos", "lat": [7.3775, 6.5244], "lng": [3.9470, 3.3792]},
    {"origin": "Abuja", "destination": "Lagos", "lat": [9.0765, 6.5244], "lng": [7.3986, 3.3792]},
    {"origin": "Port Harcourt", "destination": "Lagos", "lat": [4.8156, 6.5244], "lng": [7.0498, 3.3792]},
    {"origin": "Benin City", "destination": "Lagos", "lat": [6.3350, 6.5244], "lng": [5.6037, 3.3792]},
    {"origin": "Kaduna", "destination": "Abuja", "lat": [10.5105, 9.0765], "lng": [7.4165, 7.3986]},
]

# ==================== ROUTER ====================

route_cache_router = APIRouter(prefix="/api/routes", tags=["route-caching"])

# Database helper
def get_db():
    mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
    client = AsyncIOMotorClient(mongo_url)
    return client[os.environ.get('DB_NAME', 'nexryde_db')]


# ==================== ROUTE CACHING SERVICE ====================

class RouteCacheService:
    """
    Core route caching service to minimize Google Maps API costs
    """
    
    def __init__(self):
        self.gmaps = googlemaps.Client(key=GOOGLE_MAPS_API_KEY) if GOOGLE_MAPS_API_KEY else None
        self.api_call_cost = API_CALL_COST
        self.daily_budget = DAILY_BUDGET_LIMIT
    
    async def get_route(self, origin: Dict[str, Any], destination: Dict[str, Any], driver_id: str) -> Dict[str, Any]:
        """
        Get route - use cache if available, otherwise call Google Maps API
        
        Args:
            origin: {"city": "Lagos", "lat": 6.5244, "lng": 3.3792}
            destination: {"city": "Abuja", "lat": 9.0765, "lng": 7.3986}
            driver_id: Driver requesting the route
        
        Returns:
            Route data with cost information
        """
        db = get_db()
        
        # Generate route ID
        route_id = f"{origin['city']}-{destination['city']}"
        
        # Check cache first (valid for 30 days)
        cache_cutoff = datetime.utcnow() - timedelta(days=CACHE_VALIDITY_DAYS)
        cached_route = await db.route_cache.find_one({
            "route_id": route_id,
            "last_updated": {"$gte": cache_cutoff}
        })
        
        if cached_route:
            # ✅ CACHE HIT - FREE!
            await db.route_cache.update_one(
                {"route_id": route_id},
                {
                    "$inc": {
                        "times_used": 1,
                        "money_saved": self.api_call_cost
                    }
                }
            )
            
            print(f"✅ CACHE HIT: {route_id} - SAVED ₦{self.api_call_cost}")
            
            return {
                "success": True,
                "from_cache": True,
                "cost": 0,
                "route": {
                    "route_id": cached_route["route_id"],
                    "origin": f"{origin['city']}",
                    "destination": f"{destination['city']}",
                    "distance_km": cached_route["distance_km"],
                    "duration_minutes": cached_route["duration_minutes"],
                    "polyline": cached_route.get("polyline", ""),
                    "route_owner": cached_route.get("first_driver_name", "System")
                },
                "message": f"Using cached route (saved ₦{self.api_call_cost})"
            }
        
        # CACHE MISS — Google disabled for gamification route-owner (Maps billing guardrail).
        # Trip legs use route_leg_service (Essentials, one call per leg) instead.
        print(f"⚠️ CACHE MISS: {route_id} — Google Directions blocked (maps billing guardrail)")
        raise HTTPException(
            503,
            "Route discovery Google calls are disabled. Use cached routes only.",
        )
    
    async def award_route_owner_bonus(self, db, driver_id: str, driver_name: str, route_id: str):
        """
        Award ₦5,000 bonus to first driver who discovers a new route
        """
        try:
            # Credit driver wallet
            await db.wallet.update_one(
                {"driver_id": driver_id},
                {
                    "$inc": {"balance": ROUTE_OWNER_BONUS},
                    "$push": {
                        "transactions": {
                            "type": "route_owner_bonus",
                            "amount": ROUTE_OWNER_BONUS,
                            "route_id": route_id,
                            "description": f"Route Owner Bonus for {route_id}",
                            "timestamp": datetime.utcnow()
                        }
                    }
                },
                upsert=True
            )
            
            # Mark bonus as paid
            await db.route_cache.update_one(
                {"route_id": route_id},
                {"$set": {"route_owner_bonus_paid": True}}
            )
            
            # Send notification (if notification system exists)
            # await send_notification(driver_id, {
            #     "title": "🏆 Route Owner Bonus!",
            #     "message": f"You're the first to complete {route_id}! +₦{ROUTE_OWNER_BONUS:,} credited.",
            #     "type": "route_owner_bonus"
            # })
            
            print(f"💰 Route Owner bonus paid: {driver_name} → ₦{ROUTE_OWNER_BONUS:,} for {route_id}")
            
        except Exception as e:
            print(f"⚠️ Failed to award Route Owner bonus: {str(e)}")
    
    async def get_today_api_cost(self, db) -> float:
        """Get today's total API spending"""
        today_str = datetime.utcnow().strftime("%Y-%m-%d")
        tracker = await db.api_cost_tracker.find_one({"date": today_str})
        return tracker.get("total_cost_naira", 0.0) if tracker else 0.0
    
    async def pre_cache_top_routes(self, db):
        """
        Pre-cache the top 50 Nigerian inter-city routes
        Run this once during initial setup
        """
        print("🚀 Starting pre-cache of top 50 routes...")
        
        cached_count = 0
        failed_count = 0
        
        for route in TOP_50_ROUTES:
            try:
                origin = {
                    "city": route["origin"],
                    "lat": route["lat"][0],
                    "lng": route["lng"][0]
                }
                destination = {
                    "city": route["destination"],
                    "lat": route["lat"][1],
                    "lng": route["lng"][1]
                }
                
                # Check if already cached
                route_id = f"{origin['city']}-{destination['city']}"
                existing = await db.route_cache.find_one({"route_id": route_id})
                
                if existing:
                    print(f"⏭️  Already cached: {route_id}")
                    continue
                
                # Cache it
                await self.get_route(origin, destination, driver_id="SYSTEM")
                cached_count += 1
                print(f"✅ Pre-cached ({cached_count}): {route_id}")
                
                # Small delay to avoid rate limiting
                import asyncio
                await asyncio.sleep(0.5)
                
            except Exception as e:
                failed_count += 1
                print(f"❌ Failed to cache {route['origin']} → {route['destination']}: {str(e)}")
        
        print(f"\n📊 Pre-caching complete!")
        print(f"✅ Successfully cached: {cached_count} routes")
        print(f"❌ Failed: {failed_count} routes")
        
        return {
            "success": True,
            "cached_count": cached_count,
            "failed_count": failed_count,
            "total_attempted": len(TOP_50_ROUTES)
        }


# ==================== API ENDPOINTS ====================

@route_cache_router.post("/get-route")
async def get_route_endpoint(
    origin_city: str,
    origin_lat: float,
    origin_lng: float,
    destination_city: str,
    destination_lat: float,
    destination_lng: float,
    driver_id: str
):
    """
    Get route between two cities
    Uses cache if available, otherwise calls Google Maps API
    """
    service = RouteCacheService()
    
    origin = {"city": origin_city, "lat": origin_lat, "lng": origin_lng}
    destination = {"city": destination_city, "lat": destination_lat, "lng": destination_lng}
    
    result = await service.get_route(origin, destination, driver_id)
    return result


@route_cache_router.get("/cache-stats")
async def get_cache_stats():
    """
    Get route caching statistics
    """
    db = get_db()
    
    # Total cached routes
    total_cached = await db.route_cache.count_documents({})
    
    # Most popular routes
    popular_routes = await db.route_cache.find().sort("times_used", -1).limit(10).to_list(10)
    
    # Today's API costs
    today_str = datetime.utcnow().strftime("%Y-%m-%d")
    today_tracker = await db.api_cost_tracker.find_one({"date": today_str})
    
    # This month's costs
    month_start = datetime.utcnow().replace(day=1).strftime("%Y-%m-%d")
    month_costs = await db.api_cost_tracker.find({
        "date": {"$gte": month_start}
    }).to_list(100)
    
    month_total_cost = sum(c.get("total_cost_naira", 0) for c in month_costs)
    month_total_saved = sum(c.get("total_saved_naira", 0) for c in month_costs)
    month_total_calls = sum(c.get("total_api_calls", 0) for c in month_costs)
    month_cache_hits = sum(c.get("cached_route_hits", 0) for c in month_costs)
    
    return {
        "total_cached_routes": total_cached,
        "today": {
            "api_calls": today_tracker.get("total_api_calls", 0) if today_tracker else 0,
            "cache_hits": today_tracker.get("cached_route_hits", 0) if today_tracker else 0,
            "cost_naira": today_tracker.get("total_cost_naira", 0) if today_tracker else 0,
            "saved_naira": today_tracker.get("total_saved_naira", 0) if today_tracker else 0,
            "budget_limit": DAILY_BUDGET_LIMIT,
            "budget_remaining": DAILY_BUDGET_LIMIT - (today_tracker.get("total_cost_naira", 0) if today_tracker else 0)
        },
        "this_month": {
            "total_api_calls": month_total_calls,
            "cache_hits": month_cache_hits,
            "cost_naira": month_total_cost,
            "saved_naira": month_total_saved,
            "budget_limit": MONTHLY_BUDGET_LIMIT,
            "cache_hit_rate": (month_cache_hits / month_total_calls * 100) if month_total_calls > 0 else 0
        },
        "top_routes": [
            {
                "route": f"{r['origin_city']} → {r['destination_city']}",
                "times_used": r["times_used"],
                "money_saved": r["money_saved"],
                "distance_km": r["distance_km"],
                "route_owner": r.get("first_driver_name", "Unknown")
            }
            for r in popular_routes
        ]
    }


@route_cache_router.post("/admin/pre-cache-routes")
async def pre_cache_routes_endpoint():
    """
    Admin endpoint to pre-cache top 50 Nigerian routes
    Run this once during initial setup
    """
    db = get_db()
    service = RouteCacheService()
    result = await service.pre_cache_top_routes(db)
    return result


@route_cache_router.get("/route-owners/leaderboard")
async def get_route_owners_leaderboard():
    """
    Get leaderboard of Route Owners (drivers who discovered new routes)
    """
    db = get_db()
    
    # Aggregate route owners by driver
    pipeline = [
        {"$group": {
            "_id": "$first_driver_id",
            "driver_name": {"$first": "$first_driver_name"},
            "routes_discovered": {"$sum": 1},
            "total_bonus_earned": {"$sum": ROUTE_OWNER_BONUS}
        }},
        {"$sort": {"routes_discovered": -1}},
        {"$limit": 20}
    ]
    
    leaderboard = await db.route_cache.aggregate(pipeline).to_list(20)
    
    return {
        "leaderboard": [
            {
                "rank": idx + 1,
                "driver_id": item["_id"],
                "driver_name": item["driver_name"],
                "routes_discovered": item["routes_discovered"],
                "bonus_earned": item["total_bonus_earned"]
            }
            for idx, item in enumerate(leaderboard)
        ]
    }


import math as _math

def _haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Straight-line distance in metres."""
    R = 6_371_000
    dlat = _math.radians(lat2 - lat1)
    dlng = _math.radians(lng2 - lng1)
    a = (_math.sin(dlat / 2) ** 2
         + _math.cos(_math.radians(lat1)) * _math.cos(_math.radians(lat2))
         * _math.sin(dlng / 2) ** 2)
    return R * 2 * _math.atan2(_math.sqrt(a), _math.sqrt(1 - a))


@route_cache_router.get("/deviation-check")
async def check_route_deviation(
    origin_lat: float,
    origin_lng: float,
    current_lat: float,
    current_lng: float,
    threshold_m: float = 150.0,
):
    """
    Returns whether the driver has deviated enough from the cached route origin
    to warrant a fresh Directions API call.

    The frontend calls this before fetchDirections() — if `should_recalculate`
    is False the caller keeps its cached polyline, saving an API request.

    Threshold default 150 m covers normal GPS jitter and slow traffic crawl.
    Raise to 300 m for highway trips where lane-level precision is unnecessary.
    """
    dist_m = _haversine_m(origin_lat, origin_lng, current_lat, current_lng)
    return {
        "should_recalculate": dist_m > threshold_m,
        "deviation_m": round(dist_m, 1),
        "threshold_m": threshold_m,
    }


# Export router
__all__ = ['route_cache_router', 'RouteCacheService']

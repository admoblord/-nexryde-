"""
Smart Mode AI - Intelligent Trip Auto-Accept System
Analyzes incoming trip requests and auto-accepts based on driver preferences
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import logging
from database import db

router = APIRouter(prefix="/api/smart-mode", tags=["Smart Mode AI"])

class SmartModeSettings(BaseModel):
    driver_id: str
    enabled: bool = False
    min_distance: float = 1.0  # km
    max_distance: float = 15.0  # km
    min_rating: float = 4.0  # 1-5
    accept_surge: bool = True
    min_surge_multiplier: float = 1.5
    avoid_low_rated: bool = True
    low_rating_threshold: float = 3.5
    preferred_areas: List[str] = []
    auto_reject_after_hours: bool = False
    max_wait_time: int = 10  # seconds

class TripRequest(BaseModel):
    trip_id: str
    rider_id: str
    rider_rating: float
    pickup_location: str
    destination: str
    distance_km: float
    estimated_fare: float
    surge_multiplier: float = 1.0
    pickup_area: str

class TripDecision(BaseModel):
    should_accept: bool
    confidence_score: float  # 0-100
    reasons: List[str]
    earnings_potential: str

@router.post("/settings/{driver_id}")
async def save_smart_mode_settings(driver_id: str, settings: SmartModeSettings):
    """
    Save driver's Smart Mode preferences
    """
    try:
        settings.driver_id = driver_id
        payload = settings.dict()
        payload["updated_at"] = datetime.utcnow()
        await db.smart_mode_settings.update_one(
            {"driver_id": driver_id},
            {"$set": payload},
            upsert=True,
        )
        
        logging.info(f"✅ Smart Mode settings saved for driver {driver_id}")
        
        return {
            "success": True,
            "message": "Smart Mode settings saved successfully",
            "settings": settings.dict()
        }
    except Exception as e:
        logging.error(f"❌ Error saving Smart Mode settings: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/settings/{driver_id}")
async def get_smart_mode_settings(driver_id: str):
    """
    Get driver's Smart Mode preferences
    """
    try:
        existing = await db.smart_mode_settings.find_one({"driver_id": driver_id}, {"_id": 0})
        if existing:
            return existing
        
        # Return default settings
        default_settings = SmartModeSettings(driver_id=driver_id)
        return default_settings.dict()
    except Exception as e:
        logging.error(f"❌ Error getting Smart Mode settings: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/analyze-trip/{driver_id}")
async def analyze_trip_request(driver_id: str, trip: TripRequest):
    """
    AI-powered trip analysis - Should driver accept this trip?
    """
    try:
        # Get driver's settings
        settings = await db.smart_mode_settings.find_one({"driver_id": driver_id}, {"_id": 0})
        
        if not settings or not settings.get('enabled'):
            return TripDecision(
                should_accept=False,
                confidence_score=0,
                reasons=["Smart Mode is disabled"],
                earnings_potential="Unknown"
            )
        
        reasons = []
        score = 100  # Start with perfect score, deduct for issues
        
        # 1. Check distance range
        if trip.distance_km < settings['min_distance']:
            score -= 30
            reasons.append(f"❌ Trip too short ({trip.distance_km:.1f}km < {settings['min_distance']}km minimum)")
        elif trip.distance_km > settings['max_distance']:
            score -= 40
            reasons.append(f"❌ Trip too long ({trip.distance_km:.1f}km > {settings['max_distance']}km maximum)")
        else:
            reasons.append(f"✅ Distance perfect ({trip.distance_km:.1f}km)")
        
        # 2. Check rider rating
        if settings['avoid_low_rated'] and trip.rider_rating < settings['low_rating_threshold']:
            score -= 35
            reasons.append(f"⚠️ Low-rated rider ({trip.rider_rating:.1f}⭐ < {settings['low_rating_threshold']}⭐ threshold)")
        elif trip.rider_rating >= settings['min_rating']:
            reasons.append(f"✅ Good rider rating ({trip.rider_rating:.1f}⭐)")
        
        # 3. Check surge pricing
        if trip.surge_multiplier > 1.0:
            if settings['accept_surge'] and trip.surge_multiplier >= settings['min_surge_multiplier']:
                score += 20  # Bonus for high surge
                reasons.append(f"💰 High surge ({trip.surge_multiplier}x multiplier)")
            elif not settings['accept_surge']:
                score -= 15
                reasons.append(f"⚠️ Surge pricing active but you prefer no-surge rides")
        
        # 4. Check preferred areas
        if settings['preferred_areas'] and len(settings['preferred_areas']) > 0:
            if trip.pickup_area in settings['preferred_areas']:
                score += 15
                reasons.append(f"✅ Preferred area: {trip.pickup_area}")
            else:
                score -= 10
                reasons.append(f"⚠️ Not in preferred areas")
        
        # 5. Calculate earnings potential
        fare_per_km = trip.estimated_fare / trip.distance_km if trip.distance_km > 0 else 0
        
        if fare_per_km > 500:
            earnings = "🔥 Excellent"
            score += 10
        elif fare_per_km > 350:
            earnings = "💰 Good"
        elif fare_per_km > 250:
            earnings = "👍 Fair"
        else:
            earnings = "⚠️ Low"
            score -= 15
        
        reasons.append(f"Earnings: ₦{fare_per_km:.0f}/km")
        
        # Final decision
        should_accept = score >= 50  # Accept if score is 50 or higher
        
        decision = TripDecision(
            should_accept=should_accept,
            confidence_score=max(0, min(100, score)),  # Clamp between 0-100
            reasons=reasons,
            earnings_potential=earnings
        )
        
        logging.info(f"🤖 Smart Mode Decision for driver {driver_id}: {'ACCEPT' if should_accept else 'REJECT'} (score: {score})")
        
        await db.smart_mode_decisions.insert_one(
            {
                "driver_id": driver_id,
                "trip_id": trip.trip_id,
                "should_accept": decision.should_accept,
                "confidence_score": decision.confidence_score,
                "reasons": decision.reasons,
                "earnings_potential": decision.earnings_potential,
                "pickup_area": trip.pickup_area,
                "created_at": datetime.utcnow(),
            }
        )
        return decision
        
    except Exception as e:
        logging.error(f"❌ Error analyzing trip: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/stats/{driver_id}")
async def get_smart_mode_stats(driver_id: str):
    """
    Get Smart Mode performance statistics
    """
    try:
        trips_analyzed = await db.smart_mode_decisions.count_documents({"driver_id": driver_id})
        trips_accepted = await db.smart_mode_decisions.count_documents(
            {"driver_id": driver_id, "should_accept": True}
        )
        trips_rejected = max(0, trips_analyzed - trips_accepted)
        acceptance_rate = round((trips_accepted / trips_analyzed) * 100, 1) if trips_analyzed else 0.0

        avg_confidence_agg = await db.smart_mode_decisions.aggregate(
            [
                {"$match": {"driver_id": driver_id}},
                {"$group": {"_id": None, "avg": {"$avg": "$confidence_score"}}},
            ]
        ).to_list(1)
        avg_confidence = round(avg_confidence_agg[0]["avg"], 1) if avg_confidence_agg else 0.0

        best_areas_agg = await db.smart_mode_decisions.aggregate(
            [
                {"$match": {"driver_id": driver_id, "pickup_area": {"$exists": True, "$ne": None}}},
                {"$group": {"_id": "$pickup_area", "count": {"$sum": 1}}},
                {"$sort": {"count": -1}},
                {"$limit": 3},
            ]
        ).to_list(3)
        best_areas = [row["_id"] for row in best_areas_agg if row.get("_id")]

        return {
            "trips_analyzed": trips_analyzed,
            "trips_accepted": trips_accepted,
            "trips_rejected": trips_rejected,
            "acceptance_rate": acceptance_rate,
            "avg_confidence_score": avg_confidence,
            "best_areas": best_areas,
        }
        
    except Exception as e:
        logging.error(f"❌ Error getting stats: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

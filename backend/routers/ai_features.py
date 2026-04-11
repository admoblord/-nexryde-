"""AI Features Router - All AI-powered endpoints for NEXRYDE."""
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone, timedelta
import os
import json
import re
import logging

from database import db, EMERGENT_LLM_KEY, GOOGLE_MAPS_API_KEY
from auth_guard import verify_owner_strict

logger = logging.getLogger('server')
ai_router = APIRouter(prefix="/api", tags=["AI Features"])

# Import LLM classes
try:
    from emergentintegrations.llm.chat import LlmChat, UserMessage
except ImportError:
    logger.warning("emergentintegrations not available")
    LlmChat = None
    UserMessage = None


# ==================== LOCATION HELPER ====================

# Nigerian city data - coordinates and common info for location detection
NIGERIAN_CITIES = {
    "lagos": {"lat": 6.5244, "lng": 3.3792, "state": "Lagos", "zones": ["Victoria Island", "Lekki", "Ikeja", "Surulere", "Oshodi", "Apapa"]},
    "abuja": {"lat": 9.0579, "lng": 7.4951, "state": "FCT", "zones": ["Wuse", "Maitama", "Garki", "Asokoro", "Gwarinpa", "Kubwa"]},
    "port harcourt": {"lat": 4.8156, "lng": 7.0498, "state": "Rivers", "zones": ["GRA", "Trans-Amadi", "Rumuola", "D-Line", "Eleme Junction", "Aba Road"]},
    "ibadan": {"lat": 7.3775, "lng": 3.9470, "state": "Oyo", "zones": ["Ring Road", "Challenge", "Dugbe", "Bodija", "UI", "Mokola"]},
    "kano": {"lat": 12.0022, "lng": 8.5920, "state": "Kano", "zones": ["Sabon Gari", "Nasarawa", "Fagge", "Tarauni", "Gwale", "Kumbotso"]},
    "benin": {"lat": 6.3350, "lng": 5.6037, "state": "Edo", "zones": ["Ring Road", "Sapele Road", "Airport Road", "Uselu", "Ugbowo", "GRA"]},
    "enugu": {"lat": 6.4584, "lng": 7.5464, "state": "Enugu", "zones": ["Independence Layout", "New Haven", "Ogui", "GRA", "Trans-Ekulu", "Abakpa"]},
    "owerri": {"lat": 5.4836, "lng": 7.0333, "state": "Imo", "zones": ["Wetheral Road", "Douglas Road", "Orji", "World Bank", "MCC Road", "Aladinma"]},
    "warri": {"lat": 5.5167, "lng": 5.7500, "state": "Delta", "zones": ["Effurun", "Jakpa", "Enerhen", "Airport Road", "PTI", "Ekpan"]},
    "calabar": {"lat": 4.9517, "lng": 8.3220, "state": "Cross River", "zones": ["Marian", "Watt Market", "Ekpo Abasi", "Satellite Town", "Atimbo", "8 Miles"]},
    "kaduna": {"lat": 10.5105, "lng": 7.4165, "state": "Kaduna", "zones": ["Barnawa", "Sabon Tasha", "Kawo", "Tudun Wada", "Rigasa", "Malali"]},
    "jos": {"lat": 9.8965, "lng": 8.8583, "state": "Plateau", "zones": ["Terminus", "Bukuru", "Anglo Jos", "Farin Gada", "Hwolshe", "Rayfield"]},
    "ilorin": {"lat": 8.4966, "lng": 4.5426, "state": "Kwara", "zones": ["GRA", "Tanke", "Fate", "Challenge", "Oja-Oba", "Unity Road"]},
    "abeokuta": {"lat": 7.1475, "lng": 3.3619, "state": "Ogun", "zones": ["Kuto", "Oke-Mosan", "Sapon", "Onikolobo", "Adatan", "Ibara"]},
    "uyo": {"lat": 5.0377, "lng": 7.9128, "state": "Akwa Ibom", "zones": ["Ikot Ekpene Road", "Oron Road", "Abak Road", "Udo Udoma", "IBB Way", "Ring Road"]},
    "asaba": {"lat": 6.1987, "lng": 6.7333, "state": "Delta", "zones": ["Nnebisi Road", "Okpanam Road", "DLA Road", "Summit Road", "Infant Jesus", "Cable Point"]},
}


def detect_city(lat: float = None, lng: float = None, city_name: str = None) -> dict:
    """Detect which Nigerian city based on coordinates or name"""
    if city_name:
        key = city_name.lower().strip()
        for city_key, data in NIGERIAN_CITIES.items():
            if key in city_key or city_key in key:
                return {"city": city_key.title(), **data}

    if lat and lng:
        closest = None
        min_dist = float('inf')
        for city_key, data in NIGERIAN_CITIES.items():
            dist = ((lat - data["lat"]) ** 2 + (lng - data["lng"]) ** 2) ** 0.5
            if dist < min_dist:
                min_dist = dist
                closest = {"city": city_key.title(), **data}
        if closest and min_dist < 1.5:  # ~150km radius
            return closest

    # Default to Lagos if can't detect
    return {"city": "Lagos", **NIGERIAN_CITIES["lagos"]}


# ==================== AI ASSISTANT ENDPOINTS ====================


@ai_router.post("/drivers/{user_id}/update-drive-time")
async def update_drive_time(user_id: str, hours: float, request: Request):
    """Update driver's driving time (called periodically)"""
    verify_owner_strict(request, user_id)
    profile = await db.driver_profiles.find_one({"user_id": user_id})
    current_hours = profile.get("hours_driven_today", 0) if profile else 0
    new_hours = current_hours + hours
    
    fatigue_warning = new_hours >= 8
    
    await db.driver_profiles.update_one(
        {"user_id": user_id},
        {"$set": {"hours_driven_today": new_hours, "fatigue_warning": fatigue_warning}}
    )
    
    return {"hours_driven": new_hours, "fatigue_warning": fatigue_warning}



# ==================== DRIVER AWARENESS AI ENDPOINT ====================

@ai_router.get("/driver/awareness")
async def get_driver_awareness(driver_id: str, lat: float = None, lng: float = None, city: str = None):
    """
    Driver awareness based on real profile/trip data.
    """
    try:
        profile = await db.driver_profiles.find_one({"user_id": driver_id}) or {}
        if not profile:
            raise HTTPException(status_code=404, detail="Driver profile not found")

        current_hour = datetime.utcnow().hour
        alerts = []

        driving_hours = float(profile.get("hours_driven_today", 0) or 0)
        fatigue_warning = bool(profile.get("fatigue_warning", False))
        if fatigue_warning or driving_hours >= 8:
            alerts.append({
                "type": "fatigue",
                "severity": "high",
                "title": "Fatigue Warning",
                "message": "High driving duration detected. Take a break before accepting new trips.",
                "icon": "moon",
                "color": "#8B5CF6",
            })
        elif driving_hours >= 5:
            alerts.append({
                "type": "fatigue",
                "severity": "medium",
                "title": "Break Suggested",
                "message": "You have driven for several hours today. Hydrate and rest briefly.",
                "icon": "cafe",
                "color": "#F59E0B",
            })

        if current_hour >= 22 or current_hour <= 5:
            alerts.append({
                "type": "time",
                "severity": "medium",
                "title": "Night Driving Alert",
                "message": "Night hours increase risk. Stay on well-lit major roads.",
                "icon": "moon",
                "color": "#3B82F6",
            })

        driver_score = max(0, min(100, int(100 - driving_hours * 3)))
        break_recommended = fatigue_warning or driving_hours >= 8

        return {
            "success": True,
            "alerts": alerts,
            "driver_score": driver_score,
            "driving_hours_today": driving_hours,
            "break_recommended": break_recommended,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Driver awareness error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to load driver awareness")


class CoachSuggestionRequest(BaseModel):
    driver_id: Optional[str] = None


@ai_router.post("/ai/coach/get-suggestions")
async def get_ai_coach_suggestions(request: Optional[CoachSuggestionRequest] = None, driver_id: Optional[str] = None):
    """Return actionable driver coaching suggestions using real driver/trip metrics."""
    resolved_driver_id = driver_id or (request.driver_id if request else None)
    if not resolved_driver_id:
        raise HTTPException(status_code=400, detail="driver_id is required")

    profile = await db.driver_profiles.find_one({"user_id": resolved_driver_id}, {"_id": 0}) or {}
    trips = await db.trips.find(
        {"driver_id": resolved_driver_id},
        {"_id": 0, "status": 1, "distance_km": 1, "fare": 1, "created_at": 1}
    ).sort("created_at", -1).limit(300).to_list(300)

    if not profile and not trips:
        return {
            "success": True,
            "suggestions": [],
            "generated_from": {"trips_analyzed": 0}
        }

    total_trips = len(trips)
    completed_trips = sum(1 for t in trips if t.get("status") == "completed")
    completion_rate = round((completed_trips / total_trips) * 100, 1) if total_trips else 0.0
    avg_fare = round(
        sum(float(t.get("fare") or 0) for t in trips if t.get("status") == "completed") / max(completed_trips, 1),
        2
    )
    avg_distance = round(
        sum(float(t.get("distance_km") or 0) for t in trips if t.get("status") == "completed") / max(completed_trips, 1),
        2
    )
    hours_driven = float(profile.get("hours_driven_today", 0) or 0)
    rating = float(profile.get("rating", 5.0) or 5.0)
    fatigue_warning = bool(profile.get("fatigue_warning", False))

    suggestions = []

    if completion_rate < 80:
        suggestions.append({
            "icon": "checkmark-circle",
            "color": "#EF4444",
            "title": "Improve completion rate",
            "description": f"Completion is {completion_rate}%. Aim for 85%+ by accepting only trips you can finish.",
            "impact": "Higher dispatch priority",
            "priority": "high",
        })
    else:
        suggestions.append({
            "icon": "trophy",
            "color": "#22C55E",
            "title": "Keep your completion consistency",
            "description": f"Strong completion rate ({completion_rate}%). Keep this to maintain rider trust.",
            "impact": "More repeat riders",
            "priority": "medium",
        })

    if fatigue_warning or hours_driven >= 8:
        suggestions.append({
            "icon": "moon",
            "color": "#8B5CF6",
            "title": "Take a short break now",
            "description": f"You have driven {round(hours_driven, 1)}h today. Rest improves safety and ratings.",
            "impact": "Reduce incident risk",
            "priority": "high",
        })

    suggestions.append({
        "icon": "cash",
        "color": "#3B82F6",
        "title": "Optimize high-value trip windows",
        "description": f"Average completed fare is ₦{avg_fare:,.0f} over ~{avg_distance}km trips.",
        "impact": "Better earnings per trip",
        "priority": "medium",
    })

    if rating < 4.7:
        suggestions.append({
            "icon": "star",
            "color": "#F59E0B",
            "title": "Boost rider rating",
            "description": f"Current rating is {rating:.1f}. Focus on smooth driving and polite communication.",
            "impact": "More accepted offers",
            "priority": "medium",
        })

    return {
        "success": True,
        "suggestions": suggestions[:6],
        "generated_from": {
            "trips_analyzed": total_trips,
            "completed_trips": completed_trips,
            "completion_rate": completion_rate,
            "hours_driven_today": round(hours_driven, 2),
            "rating": round(rating, 2),
        },
    }


# ==================== AI ASSISTANTS ====================

@ai_router.get("/ai/rider-assistant")
async def rider_assistant(user_id: str, question: str):
    return {"response": f"Thanks for your question! Our team is working on providing AI-powered assistance. For urgent help, please contact support.", "user_id": user_id}

@ai_router.get("/ai/driver-assistant")
async def driver_assistant(user_id: str, question: str):
    return {"response": f"Thanks for your question! Our team is working on providing AI-powered assistance. For urgent help, please contact support.", "user_id": user_id}

@ai_router.get("/ai/rider-assistant-pidgin")
async def rider_assistant_pidgin(user_id: str, question: str):
    return {"response": f"Thank you for your question! We dey work on AI wey go help you. If e urgent, contact support.", "user_id": user_id}

@ai_router.get("/ai/driver-assistant-pidgin")
async def driver_assistant_pidgin(user_id: str, question: str):
    return {"response": f"Thank you for your question! We dey work on AI wey go help you. If e urgent, contact support.", "user_id": user_id}

@ai_router.get("/ai/earnings-predictor/{user_id}")
async def predict_earnings(user_id: str, hours_to_drive: float = 8):
    profile = await db.driver_profiles.find_one({"user_id": user_id})
    completed = await db.trips.count_documents({"driver_id": user_id, "status": "completed"})
    avg_fare_cursor = db.trips.find({"driver_id": user_id, "status": "completed"}, {"fare": 1}).sort("created_at", -1).limit(20)
    recent_fares = [t.get("fare", 0) async for t in avg_fare_cursor]
    avg_fare = sum(recent_fares) / len(recent_fares) if recent_fares else 2500
    trips_per_hour = max(1, completed / max(1, (profile or {}).get("hours_driven_today", 8)))
    estimated_trips = round(hours_to_drive * min(trips_per_hour, 4))
    return {
        "estimated_earnings": round(estimated_trips * avg_fare),
        "estimated_trips": estimated_trips,
        "avg_fare": round(avg_fare),
        "hours": hours_to_drive,
    }


# ==================== FATIGUE MONITORING ====================

@ai_router.get("/drivers/{user_id}/fatigue-status")
async def get_fatigue_status(user_id: str):
    profile = await db.driver_profiles.find_one({"user_id": user_id})
    hours = float((profile or {}).get("hours_driven_today", 0))
    level = "rested" if hours < 4 else "moderate" if hours < 8 else "fatigued"
    return {
        "hours_driven": round(hours, 1),
        "fatigue_level": level,
        "should_rest": hours >= 8,
        "recommendation": "Take a 15-minute break" if hours >= 4 else "You're doing great!",
    }

@ai_router.post("/drivers/{user_id}/log-break")
async def log_driver_break(user_id: str, request: Request):
    verify_owner_strict(request, user_id)
    await db.driver_profiles.update_one(
        {"user_id": user_id},
        {"$set": {"last_break_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"message": "Break logged successfully", "break_time": datetime.now(timezone.utc).isoformat()}


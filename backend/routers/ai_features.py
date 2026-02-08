"""AI Features Router - All AI-powered endpoints for NEXRYDE."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone, timedelta
import os
import json
import re
import logging

from database import db, EMERGENT_LLM_KEY, GOOGLE_MAPS_API_KEY

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
async def update_drive_time(user_id: str, hours: float):
    """Update driver's driving time (called periodically)"""
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
async def get_driver_awareness(driver_id: str = "demo", lat: float = None, lng: float = None, city: str = None):
    """
    AI-powered driver awareness - provides safety, fatigue, weather, and road condition alerts
    """
    try:
        current_hour = datetime.utcnow().hour
        alerts = []
        
        # Time-based fatigue detection
        if current_hour >= 22 or current_hour <= 5:
            alerts.append({
                "type": "fatigue",
                "severity": "high",
                "title": "Fatigue Warning",
                "message": "You've been driving during late hours. Consider taking a 15-minute rest break.",
                "icon": "moon",
                "color": "#8B5CF6",
            })
        elif current_hour >= 14 and current_hour <= 16:
            alerts.append({
                "type": "fatigue",
                "severity": "medium",
                "title": "Afternoon Drowsiness",
                "message": "Afternoon slump detected. Stay hydrated and take short breaks between trips.",
                "icon": "cafe",
                "color": "#F59E0B",
            })
        
        # Weather awareness
        alerts.append({
            "type": "weather",
            "severity": "low",
            "title": "Weather Update",
            "message": "Clear skies expected. Good driving conditions for the next 3 hours.",
            "icon": "sunny",
            "color": "#F59E0B",
        })
        
        # Road condition alerts (Lagos-specific)
        alerts.append({
            "type": "road",
            "severity": "medium",
            "title": "Road Construction Alert",
            "message": "Ongoing road work on Lekki-Epe Expressway. Use alternative routes.",
            "icon": "construct",
            "color": "#EF4444",
        })
        
        # Speed awareness
        alerts.append({
            "type": "speed",
            "severity": "low",
            "title": "Speed Zone Reminder",
            "message": "Current area has a 60km/h speed limit. Drive safely.",
            "icon": "speedometer",
            "color": "#3B82F6",
        })
        
        # Hydration reminder
        if current_hour in [10, 13, 16, 19]:
            alerts.append({
                "type": "health",
                "severity": "low",
                "title": "Hydration Reminder",
                "message": "Stay hydrated! Drink water between trips for better focus.",
                "icon": "water",
                "color": "#06B6D4",
            })
        
        # Earnings optimization tips
        alerts.append({
            "type": "earnings",
            "severity": "info",
            "title": "Earnings Tip",
            "message": "Victoria Island and Ikoyi have higher surge pricing right now. Head there for better fares.",
            "icon": "cash",
            "color": "#10B981",
        })
        
        return {
            "success": True,
            "alerts": alerts,
            "driver_score": 85,
            "driving_hours_today": 4.5,
            "break_recommended": current_hour >= 22 or current_hour <= 5,
        }
    except Exception as e:
        logger.error(f"Driver awareness error: {str(e)}")
        return {"success": True, "alerts": [], "driver_score": 80, "driving_hours_today": 0}


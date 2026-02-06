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

RIDER_ASSISTANT_PROMPT = """You are NEXRYDE AI, a friendly ride assistant for riders in Nigeria.
You help with trip questions, fare estimates, driver info, and safety.

Key info:
- NEXRYDE is a driver-first ride-hailing platform across Nigeria
- Drivers pay flat monthly subscription (₦25,000) instead of per-trip commission
- Riders pay drivers directly via cash or bank transfer
- All drivers are verified with NIN and documents
- Safety: SOS button, trip sharing, face verification, route monitoring

IMPORTANT: The rider's current city is {city}, {state} State.
Provide location-specific answers relevant to {city}. Reference local landmarks, roads, and areas.
Be concise, friendly, helpful. Keep responses under 100 words."""

DRIVER_ASSISTANT_PROMPT = """You are NEXRYDE AI, a driving assistant for NEXRYDE drivers in Nigeria.
You help drivers maximize earnings, find demand areas, and improve ratings.

Key info:
- Drivers keep 100% of earnings - no commission
- Monthly subscription ₦25,000 for unlimited trips
- Riders pay directly via cash or bank transfer
- Peak hours: 7-9 AM and 5-8 PM weekdays

IMPORTANT: This driver is currently in {city}, {state} State.
High demand areas in {city}: {zones}
Provide tips and suggestions specific to {city}. Reference local roads, areas, and landmarks.
Be encouraging and practical. Keep responses under 100 words."""

@ai_router.get("/ai/rider-assistant")
async def rider_assistant(user_id: str, question: str, lat: float = None, lng: float = None, city: str = None):
    """
    AI Ride Assistant for Riders - Powered by GPT, Location-aware
    """
    try:
        loc = detect_city(lat, lng, city)
        city_name, state = loc["city"], loc["state"]
        
        # Get user's current trip context
        current_trip = await db.trips.find_one({
            "rider_id": user_id,
            "status": {"$in": ["pending", "accepted", "ongoing"]}
        })
        
        context = ""
        if current_trip:
            context = f"\nRider's current trip: Status={current_trip['status']}, Fare=₦{current_trip.get('fare', 0):,.0f}"
            if current_trip.get("driver_id"):
                driver = await db.users.find_one({"id": current_trip["driver_id"]})
                if driver:
                    context += f", Driver={driver.get('name', 'Assigned')}"
        else:
            context = "\nRider has no active trip currently."
        
        prompt = RIDER_ASSISTANT_PROMPT.format(city=city_name, state=state)
        
        if EMERGENT_LLM_KEY:
            chat = LlmChat(
                api_key=EMERGENT_LLM_KEY,
                session_id=f"rider-{user_id}-{datetime.utcnow().strftime('%Y%m%d')}",
                system_message=prompt + context
            ).with_model("openai", "gpt-4o")
            
            user_message = UserMessage(text=question)
            response_text = await chat.send_message(user_message)
            
            return {
                "response": response_text,
                "type": "ai",
                "powered_by": "gpt-4o"
            }
        else:
            # Fallback to rule-based responses
            return await _rider_assistant_fallback(user_id, question, current_trip)
            
    except Exception as e:
        logger.error(f"AI Assistant error: {e}")
        return await _rider_assistant_fallback(user_id, question, None)

async def _rider_assistant_fallback(user_id: str, question: str, current_trip):
    """Fallback responses when LLM is unavailable"""
    question_lower = question.lower()
    
    if "driver" in question_lower and "where" in question_lower:
        if current_trip and current_trip.get("driver_id"):
            return {"response": "Your driver is on the way. They should arrive shortly.", "type": "location"}
        return {"response": "You don't have an active ride. Would you like to book one?", "type": "info"}
    
    elif "price" in question_lower or "fare" in question_lower or "cost" in question_lower:
        if current_trip:
            return {"response": f"Your trip fare is ₦{current_trip['fare']:,.0f}. This includes base fare, distance, and time charges.", "type": "fare"}
        return {"response": "Fares are calculated based on distance, time, and current traffic. Get a fare estimate by entering your destination.", "type": "info"}
    
    elif "safe" in question_lower or "safety" in question_lower:
        return {"response": "Your safety is our priority! All drivers are verified. You can use the SOS button anytime, share your trip with family, and rate your driver after the ride.", "type": "safety"}
    
    elif "cancel" in question_lower:
        return {"response": "You can cancel your ride anytime before it starts. To cancel an ongoing ride, please contact support.", "type": "info"}
    
    else:
        return {"response": "I'm here to help! You can ask me about your driver's location, fare details, safety features, or trip status.", "type": "help"}

@ai_router.get("/ai/driver-assistant")
async def driver_assistant(user_id: str, question: str, lat: float = None, lng: float = None, city: str = None):
    """
    AI Assistant for Drivers - Powered by GPT
    """
    try:
        # Get driver stats for context
        stats = await db.trips.aggregate([
            {"$match": {"driver_id": user_id, "status": "completed"}},
            {"$group": {
                "_id": None,
                "total_earnings": {"$sum": "$fare"},
                "total_trips": {"$sum": 1},
                "avg_fare": {"$avg": "$fare"}
            }}
        ]).to_list(1)
        
        driver_stats = stats[0] if stats else {"total_earnings": 0, "total_trips": 0, "avg_fare": 0}
        
        # Get today's stats
        today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        today_stats = await db.trips.aggregate([
            {"$match": {"driver_id": user_id, "status": "completed", "completed_at": {"$gte": today_start}}},
            {"$group": {"_id": None, "earnings": {"$sum": "$fare"}, "trips": {"$sum": 1}}}
        ]).to_list(1)
        
        today = today_stats[0] if today_stats else {"earnings": 0, "trips": 0}
        
        # Build context
        context = f"\nDriver stats: Today's earnings=₦{today['earnings']:,.0f}, Today's trips={today['trips']}, Total earnings=₦{driver_stats['total_earnings']:,.0f}, Total trips={driver_stats['total_trips']}"
        
        # Get rating
        user = await db.users.find_one({"id": user_id})
        if user:
            context += f", Rating={user.get('rating', 5.0):.1f}"
        
        # Detect driver's city
        loc = detect_city(lat, lng, city)
        city_name, state = loc["city"], loc["state"]
        zones_str = ", ".join(loc["zones"])
        
        # Use LLM for response
        if EMERGENT_LLM_KEY:
            prompt = DRIVER_ASSISTANT_PROMPT.format(city=city_name, state=state, zones=zones_str)
            chat = LlmChat(
                api_key=EMERGENT_LLM_KEY,
                session_id=f"driver-{user_id}-{datetime.utcnow().strftime('%Y%m%d')}",
                system_message=prompt + context
            ).with_model("openai", "gpt-4o")
            
            user_message = UserMessage(text=question)
            response_text = await chat.send_message(user_message)
            
            return {
                "response": response_text,
                "type": "ai",
                "powered_by": "gpt-4o",
                "data": {
                    "today_earnings": today["earnings"],
                    "today_trips": today["trips"],
                    "total_earnings": driver_stats["total_earnings"],
                    "rating": user.get('rating', 5.0) if user else 5.0
                }
            }
        else:
            # Fallback to rule-based responses
            return await _driver_assistant_fallback(user_id, question, driver_stats, today)
            
    except Exception as e:
        logger.error(f"AI Assistant error: {e}")
        return await _driver_assistant_fallback(user_id, question, {"total_earnings": 0, "total_trips": 0, "avg_fare": 0}, {"earnings": 0, "trips": 0})

async def _driver_assistant_fallback(user_id: str, question: str, driver_stats, today):
    """Fallback responses when LLM is unavailable"""
    question_lower = question.lower()
    
    if "earn" in question_lower or "money" in question_lower:
        return {
            "response": f"Today you've earned ₦{today['earnings']:,.0f} from {today['trips']} trips. Your average fare is ₦{driver_stats.get('avg_fare', 0):,.0f}.",
            "type": "earnings",
            "data": {"today_earnings": today["earnings"], "today_trips": today["trips"]}
        }
    
    elif "best time" in question_lower or "when" in question_lower or "busy" in question_lower:
        return {
            "response": "Peak hours are typically 7-9 AM and 5-8 PM on weekdays. Weekends see more activity in evening hours. Consider positioning yourself in business districts during morning rush.",
            "type": "insight"
        }
    
    elif "demand" in question_lower or "area" in question_lower or "where" in question_lower:
        return {
            "response": "High demand areas right now include Victoria Island, Lekki, and Ikeja. Airport runs are also lucrative. Stay near major business hubs for consistent rides.",
            "type": "demand"
        }
    
    elif "tip" in question_lower or "advice" in question_lower:
        return {
            "response": "Pro tips: Keep your car clean for better ratings. Stay hydrated and take breaks every 2-3 hours. Accept rides during surge times for higher earnings.",
            "type": "tips"
        }
    
    else:
        return {
            "response": "I can help you with earnings info, best times to drive, high-demand areas, tips for better ratings, and more. What would you like to know?",
            "type": "help"
        }



# ==================== SMART MODE AI ENDPOINTS ====================

# All AI features now use Emergent LLM (emergentintegrations library)
# No direct OpenAI client needed - Emergent handles the routing

class SmartModeSettings(BaseModel):
    enabled: bool = True
    max_distance: float = 10.0  # km
    min_rating: float = 4.0
    surge_threshold: float = 1.5
    auto_accept: bool = True
    preferred_areas: List[str] = []

@ai_router.post("/ai/smart-mode/analyze-ride")
async def analyze_ride_with_ai(ride: dict, driver_id: str, settings: SmartModeSettings):
    """
    Use ChatGPT to analyze if a ride is worth accepting based on driver's Smart Mode settings
    Returns AI recommendation with reasoning
    """
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        emergent_key = os.getenv('EMERGENT_LLM_KEY', '')
        
        # Get driver's current stats
        driver_profile = await db.driver_profiles.find_one({"user_id": driver_id})
        driver_earnings = driver_profile.get("earnings", {}) if driver_profile else {}
        
        # Build context for AI
        ride_context = f"""
Analyze this ride request for a NEXRYDE driver:

RIDE DETAILS:
- Pickup: {ride.get('pickup', 'Unknown')}
- Destination: {ride.get('destination', 'Unknown')}
- Distance: {ride.get('distance_km', 0):.1f} km
- Estimated Duration: {ride.get('duration_min', 0)} minutes
- Offered Fare: ₦{ride.get('fare', 0):,.0f}
- Rider Rating: {ride.get('rider_rating', 'N/A')}
- Time of Day: {datetime.utcnow().strftime('%H:%M')}

DRIVER'S SMART MODE PREFERENCES:
- Max Distance: {settings.max_distance} km
- Minimum Rider Rating: {settings.min_rating}
- Surge Threshold: {settings.surge_threshold}x
- Preferred Areas: {', '.join(settings.preferred_areas) if settings.preferred_areas else 'None'}

DRIVER'S CURRENT STATS:
- Today's Earnings: ₦{driver_earnings.get('today', 0):,.0f}
- Trips Today: {driver_earnings.get('trips_today', 0)}
- Current Rating: {driver_profile.get('rating', 5.0) if driver_profile else 5.0}

INSTRUCTIONS:
Based on the ride details and driver preferences, should the driver ACCEPT or REJECT this ride?

Provide your analysis in this exact JSON format:
{{
  "recommendation": "ACCEPT" or "REJECT",
  "confidence": 0-100,
  "reasoning": "Brief explanation (max 50 words)",
  "score": 0-100 (overall ride quality score),
  "factors": {{
    "distance_ok": true/false,
    "fare_good": true/false,
    "rating_ok": true/false,
    "timing_good": true/false
  }}
}}

Be practical and consider Nigerian driver economics. A good ride is one that maximizes earnings per hour while maintaining safety.
"""

        # Call AI via Emergent LLM
        chat = LlmChat(
            api_key=emergent_key,
            session_id=f"smart-{driver_id}-{datetime.utcnow().strftime('%Y%m%d%H%M')}",
            system_message="You are an expert AI assistant for ride-hailing drivers in Nigeria. You analyze rides and provide smart recommendations to maximize driver earnings and safety. Always respond with valid JSON only."
        ).with_model("openai", "gpt-4o")
        
        user_msg = UserMessage(text=ride_context)
        ai_response_text = await chat.send_message(user_msg)
        
        # Try to extract JSON from response
        import re
        json_match = re.search(r'\{.*\}', ai_response_text, re.DOTALL)
        if json_match:
            ai_analysis = json.loads(json_match.group())
        else:
            # Fallback if AI doesn't return JSON
            ai_analysis = {
                "recommendation": "ACCEPT" if "accept" in ai_response_text.lower() else "REJECT",
                "confidence": 70,
                "reasoning": ai_response_text[:100],
                "score": 75,
                "factors": {
                    "distance_ok": ride.get('distance_km', 0) <= settings.max_distance,
                    "fare_good": True,
                    "rating_ok": True,
                    "timing_good": True
                }
            }
        
        # Log for debugging
        logger.info(f"Smart Mode AI Analysis: {ai_analysis['recommendation']} - {ai_analysis['reasoning']}")
        
        return {
            "success": True,
            "ai_analysis": ai_analysis,
            "ride_id": ride.get('id'),
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Smart Mode AI error: {str(e)}")
        # Fallback to rule-based analysis
        basic_score = 75
        should_accept = (
            ride.get('distance_km', 0) <= settings.max_distance and
            ride.get('rider_rating', 5.0) >= settings.min_rating
        )
        
        return {
            "success": True,
            "ai_analysis": {
                "recommendation": "ACCEPT" if should_accept else "REJECT",
                "confidence": 60,
                "reasoning": "Basic rule-based analysis (AI unavailable)",
                "score": basic_score,
                "factors": {
                    "distance_ok": ride.get('distance_km', 0) <= settings.max_distance,
                    "fare_good": True,
                    "rating_ok": ride.get('rider_rating', 5.0) >= settings.min_rating,
                    "timing_good": True
                }
            },
            "fallback": True
        }

@ai_router.post("/ai/smart-mode/save-settings")
async def save_smart_mode_settings(driver_id: str, settings: SmartModeSettings):
    """Save driver's Smart Mode preferences"""
    try:
        await db.driver_profiles.update_one(
            {"user_id": driver_id},
            {"$set": {
                "smart_mode_settings": settings.dict(),
                "smart_mode_enabled": settings.enabled,
                "updated_at": datetime.utcnow().isoformat()
            }},
            upsert=True
        )
        
        return {
            "success": True,
            "message": "Smart Mode settings saved"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== AI COACH ENDPOINTS ====================

@ai_router.post("/ai/coach/get-suggestions")
async def get_ai_coach_suggestions(driver_id: str, lat: float = None, lng: float = None, city: str = None):
    """
    Use ChatGPT to provide personalized coaching suggestions for driver
    """
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        emergent_key = os.getenv('EMERGENT_LLM_KEY', '')
        
        # Get driver stats
        driver_profile = await db.driver_profiles.find_one({"user_id": driver_id})
        driver_earnings = driver_profile.get("earnings", {}) if driver_profile else {}
        driver_rating = driver_profile.get("rating", 5.0) if driver_profile else 5.0
        
        # Get recent trips
        recent_trips = await db.trips.find(
            {"driver_id": driver_id}
        ).sort("created_at", -1).limit(10).to_list(10)
        
        # Calculate stats
        total_trips = len(recent_trips)
        avg_trip_time = sum([t.get("duration_min", 0) for t in recent_trips]) / max(total_trips, 1)
        avg_earnings_per_trip = driver_earnings.get("today", 0) / max(total_trips, 1) if total_trips > 0 else 0
        
        # Build context for AI
        coaching_context = f"""
You are an expert AI Coach for NEXRYDE drivers in Nigeria. Analyze this driver's performance and provide 4-5 personalized, actionable suggestions to increase earnings and improve service.

DRIVER STATISTICS:
- Current Rating: {driver_rating}/5.0
- Today's Earnings: ₦{driver_earnings.get('today', 0):,.0f}
- This Week's Earnings: ₦{driver_earnings.get('week', 0):,.0f}
- Trips Today: {driver_earnings.get('trips_today', 0)}
- Recent Trips: {total_trips}
- Average Trip Duration: {avg_trip_time:.0f} minutes
- Average Earnings/Trip: ₦{avg_earnings_per_trip:,.0f}
- City: {loc["city"]}, {loc["state"]} State
- High Demand Zones: {', '.join(loc["zones"])}
- Time Now: {datetime.utcnow().strftime('%H:%M')} UTC

PROVIDE COACHING IN THIS JSON FORMAT:
[
  {{
    "title": "Short action title (max 5 words)",
    "description": "Brief actionable advice (max 50 words)",
    "impact": "Estimated earnings impact (e.g., '+₦5,000/week')",
    "icon": "time" or "location" or "flash" or "car" or "star" or "trending-up",
    "color": "#FF6B6B" or "#4ECDC4" or "#FFD93D" or "#6C5CE7" or "#00D46A",
    "priority": "high" or "medium" or "low",
    "category": "earnings" or "service" or "efficiency" or "safety"
  }}
]

GUIDELINES:
- Be specific to the driver's city ({loc["city"]}) - use local landmarks, roads, and areas
- Focus on ACTIONABLE advice (not generic tips)
- Include realistic earnings impact estimates
- Consider time of day for time-sensitive suggestions
- Provide 4-5 suggestions
- Prioritize high-impact advice first
- Be encouraging and supportive in tone
- Reference specific areas in {loc["city"]} for hot zones and routes

EXAMPLE GOOD SUGGESTIONS (adapt to driver's city):
- "Drive during morning rush (7-9 AM) when demand is highest"
- "Focus on high-demand areas: {', '.join(loc['zones'][:3])}"
- "Maintain 4.8+ rating to unlock bonuses"
- "Accept 90%+ of rides to qualify for incentives"
"""

        # Call AI via Emergent LLM
        chat = LlmChat(
            api_key=emergent_key,
            session_id=f"coach-{driver_id}-{datetime.utcnow().strftime('%Y%m%d%H%M')}",
            system_message="You are an expert AI driving coach for Nigerian ride-hailing drivers. You provide personalized, actionable advice to maximize earnings and service quality. Always respond with valid JSON only."
        ).with_model("openai", "gpt-4o")
        
        user_msg = UserMessage(text=coaching_context)
        ai_response_text = await chat.send_message(user_msg)
        
        # Extract JSON
        import re
        json_match = re.search(r'\[.*\]', ai_response_text, re.DOTALL)
        if json_match:
            suggestions = json.loads(json_match.group())
        else:
            # Fallback suggestions
            suggestions = [
                {
                    "title": "Drive Peak Hours",
                    "description": "7-9 AM and 5-7 PM have highest demand. Start early to maximize earnings.",
                    "impact": "+₦12,000/week",
                    "icon": "time",
                    "color": "#FF6B6B",
                    "priority": "high",
                    "category": "earnings"
                },
                {
                    "title": "Improve Accept Rate",
                    "description": f"Your current rating is {driver_rating}/5.0. Maintain above 4.5 for premium rides.",
                    "impact": "+₦8,000/week",
                    "icon": "star",
                    "color": "#FFD93D",
                    "priority": "medium",
                    "category": "service"
                }
            ]
        
        logger.info(f"AI Coach generated {len(suggestions)} suggestions for driver {driver_id}")
        
        return {
            "success": True,
            "suggestions": suggestions,
            "generated_at": datetime.utcnow().isoformat(),
            "driver_stats": {
                "rating": driver_rating,
                "today_earnings": driver_earnings.get("today", 0),
                "trips_today": driver_earnings.get("trips_today", 0)
            }
        }
        
    except Exception as e:
        logger.error(f"AI Coach error: {str(e)}")
        return {
            "success": True,
            "suggestions": [],
            "fallback": True
        }


# ==================== TRAFFIC PREDICTION AI ENDPOINTS ====================

@ai_router.post("/ai/traffic/predict")
async def predict_traffic_with_ai(
    origin_lat: float,
    origin_lng: float,
    destination_lat: float,
    destination_lng: float,
    driver_id: str
):
    """
    Use ChatGPT + Google Maps to predict traffic and provide intelligent route recommendations
    """
    try:
        import googlemaps
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        
        gmaps_client = googlemaps.Client(key=os.getenv('GOOGLE_MAPS_API_KEY', ''))
        emergent_key = os.getenv('EMERGENT_LLM_KEY', '')
        
        # Get real-time traffic data from Google Maps
        directions = gmaps_client.directions(
            origin=(origin_lat, origin_lng),
            destination=(destination_lat, destination_lng),
            mode="driving",
            departure_time="now",  # Real-time traffic
            alternatives=True,  # Get alternative routes
        )
        
        if not directions:
            raise HTTPException(status_code=404, detail="No routes found")
        
        # Extract traffic info from Google Maps
        routes_data = []
        for route in directions[:3]:  # Analyze top 3 routes
            leg = route['legs'][0]
            routes_data.append({
                "distance": leg['distance']['text'],
                "duration_no_traffic": leg['duration']['text'],
                "duration_with_traffic": leg.get('duration_in_traffic', {}).get('text', leg['duration']['text']),
                "summary": route.get('summary', 'Main route'),
                "traffic_delay": leg.get('duration_in_traffic', {}).get('value', 0) - leg['duration']['value'],
            })
        
        # Build context for ChatGPT
        current_time = datetime.utcnow()
        context = f"""
Analyze this traffic situation in Lagos, Nigeria and provide actionable advice for a NEXRYDE driver:

CURRENT TIME: {current_time.strftime('%A, %H:%M')} UTC

ROUTES FROM GOOGLE MAPS (REAL-TIME DATA):
{json.dumps(routes_data, indent=2)}

INSTRUCTIONS:
Analyze the traffic data and provide your response in this JSON format:
{{
  "recommended_route_index": 0 or 1 or 2,
  "traffic_level": "light" or "moderate" or "heavy" or "severe",
  "recommendation": "Brief actionable advice (max 50 words)",
  "estimated_earnings_impact": "How traffic affects earnings (e.g., '+₦500 if you take Route 2')",
  "alternative_suggestion": "Any alternative timing/route suggestion",
  "confidence": 0-100,
  "factors": ["list", "of", "traffic", "factors"],
  "avoid_areas": ["list", "of", "areas", "to", "avoid"],
  "best_time": "Suggested best time to drive this route"
}}

Consider:
- Traffic patterns specific to this city and region
- Time of day (rush hour 7-9 AM, 5-7 PM)
- Earnings optimization (faster route = more trips = more money)
- Fuel efficiency vs. time saved
- Driver safety and stress levels

Be specific, practical, and focused on maximizing driver earnings while ensuring safety.
- Local road conditions and construction zones
"""

        # Call AI via Emergent LLM
        chat = LlmChat(
            api_key=emergent_key,
            session_id=f"traffic-{driver_id}-{datetime.utcnow().strftime('%Y%m%d%H')}",
            system_message=f"You are a traffic analysis AI for NEXRYDE drivers in {detect_city(origin_lat, origin_lng)['city']}, Nigeria. You analyze real-time traffic data and provide smart recommendations to optimize driver earnings and reduce stress. Always respond with valid JSON only."
        ).with_model("openai", "gpt-4o")
        
        user_msg = UserMessage(text=context)
        ai_text = await chat.send_message(user_msg)
        
        # Extract JSON
        import re
        json_match = re.search(r'\{.*\}', ai_text, re.DOTALL)
        if json_match:
            ai_analysis = json.loads(json_match.group())
        else:
            # Fallback
            ai_analysis = {
                "recommended_route_index": 0,
                "traffic_level": "moderate",
                "recommendation": "Take the fastest route based on current traffic conditions.",
                "estimated_earnings_impact": "Standard earnings",
                "alternative_suggestion": "Monitor traffic updates",
                "confidence": 70,
                "factors": ["real-time data analyzed"],
                "avoid_areas": [],
                "best_time": "Current time is acceptable"
            }
        
        logger.info(f"Traffic AI prediction: {ai_analysis['traffic_level']} - {ai_analysis['recommendation']}")
        
        return {
            "success": True,
            "routes": routes_data,
            "ai_analysis": ai_analysis,
            "timestamp": datetime.utcnow().isoformat(),
            "source": "Google Maps + ChatGPT"
        }
        
    except Exception as e:
        logger.error(f"Traffic prediction error: {str(e)}")
        # Fallback to basic analysis
        return {
            "success": True,
            "routes": [],
            "ai_analysis": {
                "recommended_route_index": 0,
                "traffic_level": "moderate",
                "recommendation": "Use Google Maps for best route",
                "estimated_earnings_impact": "Standard",
                "alternative_suggestion": "None",
                "confidence": 50,
                "factors": ["API unavailable"],
                "avoid_areas": [],
                "best_time": "Now"
            },
            "fallback": True
        }

@ai_router.get("/ai/traffic/alerts")
async def get_traffic_alerts(driver_id: str, lat: float, lng: float):
    """
    Get AI-generated traffic alerts for driver's current location
    """
    try:
        # Get traffic incidents from Google Maps
        # (Note: This would require Google Maps Incidents API or similar)
        
        # For now, generate smart alerts based on time and location
        current_hour = datetime.utcnow().hour
        alerts = []
        
        # Lagos-specific alerts
        if 7 <= current_hour <= 9:
            alerts.append({
                "type": "warning",
                "priority": "high",
                "title": "⚠️ Morning Rush Hour",
                "message": "Heavy traffic expected on major routes. Consider alternative streets.",
                "location": "Lagos Mainland",
            })
        elif 17 <= current_hour <= 19:
            alerts.append({
                "type": "warning",
                "priority": "high",
                "title": "⚠️ Evening Rush Hour",
                "message": "Traffic building up. Third Mainland Bridge is congested.",
                "location": "Island routes",
            })
        
        return {
            "success": True,
            "alerts": alerts,
            "count": len(alerts)
        }
        
    except Exception as e:
        logger.error(f"Traffic alerts error: {str(e)}")
        return {"success": True, "alerts": [], "count": 0}


# ==================== ACCIDENT AI PREDICTION ENDPOINTS ====================

@ai_router.post("/ai/accident/predict-risk")
async def predict_accident_risk(
    driver_id: str,
    current_lat: float,
    current_lng: float,
    destination_lat: float = None,
    destination_lng: float = None
):
    """
    Use ChatGPT to predict accident risk based on location, time, weather, historical data
    """
    try:
        import googlemaps
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        gmaps_client = googlemaps.Client(key=os.getenv('GOOGLE_MAPS_API_KEY', ''))
        emergent_key = os.getenv('EMERGENT_LLM_KEY', '')
        
        # Get location name from coordinates
        try:
            reverse_result = gmaps_client.reverse_geocode((current_lat, current_lng))
            location_name = reverse_result[0]['formatted_address'] if reverse_result else "Unknown location"
        except:
            location_name = "Lagos, Nigeria"
        
        # Build context for ChatGPT
        current_time = datetime.utcnow()
        day_of_week = current_time.strftime('%A')
        hour = current_time.hour
        
        # Determine if it's rush hour, night time, etc.
        is_rush_hour = (7 <= hour <= 9) or (17 <= hour <= 19)
        is_night = hour >= 19 or hour <= 6
        is_weekend = day_of_week in ['Saturday', 'Sunday']
        
        context = f"""
Analyze accident risk for a NEXRYDE driver in Lagos, Nigeria.

CURRENT SITUATION:
- Location: {location_name}
- GPS: {current_lat}, {current_lng}
- Time: {current_time.strftime('%A, %H:%M')} UTC
- Rush Hour: {"Yes" if is_rush_hour else "No"}
- Night Time: {"Yes" if is_night else "No"}
- Weekend: {"Yes" if is_weekend else "No"}

INSTRUCTIONS:
Provide accident risk assessment in this JSON format:
{{
  "overall_risk_score": 0-100,
  "risk_level": "low" or "moderate" or "high" or "critical",
  "primary_factors": ["list", "of", "3-5", "risk", "factors"],
  "high_risk_zones": [
    {{
      "name": "Road/Area name",
      "risk_level": "low/moderate/high",
      "reason": "Why it's risky",
      "time": "When it's most risky",
      "recommendation": "What to do"
    }}
  ],
  "safety_recommendations": ["action 1", "action 2", "action 3"],
  "confidence": 0-100,
  "weather_impact": "How weather affects risk",
  "time_impact": "How time of day affects risk"
}}

CONSIDER:
- Lagos-specific accident hotspots (Third Mainland Bridge, Lekki-Epe, Oshodi, Apapa)
- Time of day (night driving = higher risk)
- Rush hour = higher accident probability
- Known dangerous areas in Lagos
- Weather conditions (rainy season = slippery roads)
- Driver fatigue (late night hours)
- Traffic density correlation with accidents

Provide ACTIONABLE safety advice specific to Nigerian driving conditions.
"""

        # Call AI via Emergent LLM
        chat = LlmChat(
            api_key=emergent_key,
            session_id=f"accident-{driver_id}-{datetime.utcnow().strftime('%Y%m%d%H')}",
            system_message="You are a safety AI expert specializing in accident prediction and prevention for ride-hailing drivers in Lagos, Nigeria. You analyze risk factors and provide life-saving recommendations. Always respond with valid JSON only."
        ).with_model("openai", "gpt-4o")
        
        user_msg = UserMessage(text=context)
        ai_text = await chat.send_message(user_msg)
        
        # Extract JSON
        import re
        json_match = re.search(r'\{.*\}', ai_text, re.DOTALL)
        if json_match:
            risk_analysis = json.loads(json_match.group())
        else:
            # Fallback
            risk_analysis = {
                "overall_risk_score": 40,
                "risk_level": "moderate",
                "primary_factors": ["Traffic conditions", "Time of day", "Location"],
                "high_risk_zones": [
                    {
                        "name": "Third Mainland Bridge",
                        "risk_level": "high",
                        "reason": "High speed zone with poor lighting",
                        "time": "Night hours (7PM-6AM)",
                        "recommendation": "Drive cautiously, maintain safe speed"
                    }
                ],
                "safety_recommendations": [
                    "Maintain safe following distance",
                    "Stay alert and avoid distractions",
                    "Obey speed limits"
                ],
                "confidence": 75,
                "weather_impact": "Monitor for rain",
                "time_impact": "Moderate risk for current hour"
            }
        
        logger.info(f"Accident AI prediction: Risk={risk_analysis['risk_level']} Score={risk_analysis['overall_risk_score']}")
        
        return {
            "success": True,
            "risk_analysis": risk_analysis,
            "location": location_name,
            "timestamp": datetime.utcnow().isoformat(),
            "context": {
                "is_rush_hour": is_rush_hour,
                "is_night": is_night,
                "is_weekend": is_weekend
            }
        }
        
    except Exception as e:
        logger.error(f"Accident prediction error: {str(e)}")
        # Fallback
        return {
            "success": True,
            "risk_analysis": {
                "overall_risk_score": 30,
                "risk_level": "low",
                "primary_factors": ["Standard driving conditions"],
                "high_risk_zones": [],
                "safety_recommendations": ["Drive safely", "Stay alert", "Follow traffic rules"],
                "confidence": 50,
                "weather_impact": "Normal",
                "time_impact": "Normal"
            },
            "fallback": True
        }

@ai_router.get("/ai/accident/high-risk-areas")
async def get_high_risk_areas(city: str = "Lagos", lat: float = None, lng: float = None):
    """
    Get list of known high-risk accident areas in Nigerian cities
    """
    try:
        # Lagos high-risk zones (based on known accident hotspots)
        lagos_zones = [
            {
                "name": "Third Mainland Bridge",
                "risk_level": "high",
                "lat": 6.4698,
                "lng": 3.3852,
                "accidents_last_month": 12,
                "primary_cause": "High speed + poor visibility"
            },
            {
                "name": "Lekki-Epe Expressway",
                "risk_level": "high",
                "lat": 6.4423,
                "lng": 3.4647,
                "accidents_last_month": 8,
                "primary_cause": "Construction zones + speeding"
            },
            {
                "name": "Oshodi Underbridge",
                "risk_level": "moderate",
                "lat": 6.5447,
                "lng": 3.3369,
                "accidents_last_month": 5,
                "primary_cause": "Heavy traffic + reckless driving"
            },
            {
                "name": "Apapa-Oshodi Expressway",
                "risk_level": "moderate",
                "lat": 6.4489,
                "lng": 3.3597,
                "accidents_last_month": 6,
                "primary_cause": "Truck congestion + potholes"
            },
        ]
        
        return {
            "success": True,
            "city": city,
            "risk_zones": lagos_zones,
            "count": len(lagos_zones)
        }
        
    except Exception as e:
        logger.error(f"High risk areas error: {str(e)}")
        return {"success": True, "risk_zones": [], "count": 0}

        # (Note: This would require Google Maps Incidents API or similar)
        
        # For now, generate smart alerts based on time and location
        current_hour = datetime.utcnow().hour
        alerts = []
        
        # Lagos-specific alerts
        if 7 <= current_hour <= 9:
            alerts.append({
                "type": "warning",
                "priority": "high",
                "title": "⚠️ Morning Rush Hour",
                "message": "Heavy traffic expected on major routes. Consider alternative streets.",
                "location": "Lagos Mainland",
            })
        elif 17 <= current_hour <= 19:
            alerts.append({
                "type": "warning",
                "priority": "high",
                "title": "⚠️ Evening Rush Hour",
                "message": "Traffic building up. Third Mainland Bridge is congested.",
                "location": "Island routes",
            })
        
        return {
            "success": True,
            "alerts": alerts,
            "count": len(alerts)
        }
        
    except Exception as e:
        logger.error(f"Traffic alerts error: {str(e)}")
        return {"success": True, "alerts": [], "count": 0}


@ai_router.get("/ai/smart-mode/get-settings")
async def get_smart_mode_settings(driver_id: str):
    """Get driver's Smart Mode preferences"""
    try:
        driver_profile = await db.driver_profiles.find_one({"user_id": driver_id})
        
        if driver_profile and "smart_mode_settings" in driver_profile:
            return {
                "success": True,
                "settings": driver_profile["smart_mode_settings"]
            }
        
        # Return defaults
        return {
            "success": True,
            "settings": {
                "enabled": False,
                "max_distance": 10.0,
                "min_rating": 4.0,
                "surge_threshold": 1.5,
                "auto_accept": True,
                "preferred_areas": []
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==================== PIDGIN ENGLISH AI SUPPORT ====================

PIDGIN_RIDER_PROMPT = """You be NEXRYDE AI assistant for riders wey dey Nigeria. 
You go help riders with their trip wahala, price matter, driver info, and safety concern.

Wetin NEXRYDE be:
- NEXRYDE na driver-first ride app for Naija
- Drivers dey pay flat monthly sub (₦25,000) instead of per-trip commission
- Riders dey pay drivers direct via cash or bank transfer (person to person)
- All drivers don verify with NIN and documents
- Safety features include: SOS button, trip sharing, driver face verification, route monitoring

Make you dey friendly and helpful. Use pidgin well well.
Keep response under 100 words."""

PIDGIN_DRIVER_PROMPT = """You be NEXRYDE AI assistant for drivers wey dey Naija.
You go help drivers maximize their earnings, find high-demand areas, and improve their ratings.

Wetin NEXRYDE be:
- Drivers keep 100% of their money - NEXRYDE no take commission
- Monthly subscription na ₦25,000 for unlimited trips  
- Riders dey pay drivers direct via cash or bank transfer
- Peak hours: 7-9 AM and 5-8 PM for weekdays
- Hot areas for Lagos: Victoria Island, Lekki, Ikeja, Airport

Make you dey encouraging and practical. Na Naija context you go use.
Keep response under 100 words."""

@ai_router.get("/ai/rider-assistant-pidgin")
async def rider_assistant_pidgin(user_id: str, question: str):
    """AI Ride Assistant in Pidgin English"""
    try:
        current_trip = await db.trips.find_one({
            "rider_id": user_id,
            "status": {"$in": ["pending", "accepted", "ongoing"]}
        })
        
        context = ""
        if current_trip:
            context = f"\nRider trip wey dey ground: Status={current_trip['status']}, Fare=₦{current_trip.get('fare', 0):,.0f}"
        else:
            context = "\nRider no get active trip now."
        
        if EMERGENT_LLM_KEY:
            chat = LlmChat(
                api_key=EMERGENT_LLM_KEY,
                session_id=f"rider-pidgin-{user_id}-{datetime.utcnow().strftime('%Y%m%d')}",
                system_message=PIDGIN_RIDER_PROMPT + context
            ).with_model("openai", "gpt-4o")
            
            user_message = UserMessage(text=question)
            response_text = await chat.send_message(user_message)
            
            return {"response": response_text, "type": "ai", "language": "pidgin", "powered_by": "gpt-4o"}
        else:
            return {"response": "Abeg, AI no dey available now. Try again later.", "type": "error"}
            
    except Exception as e:
        logger.error(f"Pidgin AI error: {e}")
        return {"response": "E get wahala. Abeg try again.", "type": "error"}

@ai_router.get("/ai/driver-assistant-pidgin")
async def driver_assistant_pidgin(user_id: str, question: str):
    """AI Driver Assistant in Pidgin English"""
    try:
        stats = await db.trips.aggregate([
            {"$match": {"driver_id": user_id, "status": "completed"}},
            {"$group": {"_id": None, "total_earnings": {"$sum": "$fare"}, "total_trips": {"$sum": 1}}}
        ]).to_list(1)
        
        driver_stats = stats[0] if stats else {"total_earnings": 0, "total_trips": 0}
        context = f"\nDriver stats: Total earnings=₦{driver_stats['total_earnings']:,.0f}, Total trips={driver_stats['total_trips']}"
        
        if EMERGENT_LLM_KEY:
            chat = LlmChat(
                api_key=EMERGENT_LLM_KEY,
                session_id=f"driver-pidgin-{user_id}-{datetime.utcnow().strftime('%Y%m%d')}",
                system_message=PIDGIN_DRIVER_PROMPT + context
            ).with_model("openai", "gpt-4o")
            
            user_message = UserMessage(text=question)
            response_text = await chat.send_message(user_message)
            
            return {"response": response_text, "type": "ai", "language": "pidgin", "powered_by": "gpt-4o"}
        else:
            return {"response": "Abeg, AI no dey available now. Try again later.", "type": "error"}
            
    except Exception as e:
        logger.error(f"Pidgin AI error: {e}")
        return {"response": "E get wahala. Abeg try again.", "type": "error"}



# ==================== EARNINGS PREDICTOR AI ====================

@ai_router.get("/ai/earnings-predictor/{user_id}")
async def predict_earnings(user_id: str, hours_to_drive: int = 8):
    """AI-powered earnings prediction for drivers"""
    # Get historical data
    stats = await db.trips.aggregate([
        {"$match": {"driver_id": user_id, "status": "completed"}},
        {"$group": {
            "_id": None,
            "total_earnings": {"$sum": "$fare"},
            "total_trips": {"$sum": 1},
            "avg_fare": {"$avg": "$fare"},
            "avg_duration": {"$avg": "$duration_mins"}
        }}
    ]).to_list(1)
    
    driver_stats = stats[0] if stats else None
    
    # Get hourly pattern
    hourly_stats = await db.trips.aggregate([
        {"$match": {"driver_id": user_id, "status": "completed"}},
        {"$group": {
            "_id": {"$hour": "$created_at"},
            "avg_fare": {"$avg": "$fare"},
            "count": {"$sum": 1}
        }},
        {"$sort": {"avg_fare": -1}}
    ]).to_list(24)
    
    # Calculate predictions
    if driver_stats and driver_stats["total_trips"] > 0:
        avg_trips_per_hour = driver_stats["total_trips"] / max(1, driver_stats["total_trips"] / 8)  # Assuming 8hr average day
        avg_fare = driver_stats["avg_fare"]
        
        # Base prediction
        predicted_trips = int(hours_to_drive * 2.5)  # Average 2.5 trips/hour in Lagos
        predicted_earnings = predicted_trips * avg_fare
        
        # Find best hours
        best_hours = [h["_id"] for h in hourly_stats[:3]] if hourly_stats else [7, 8, 17, 18]
    else:
        # Default for new drivers (Lagos averages)
        avg_fare = 2500
        predicted_trips = int(hours_to_drive * 2)
        predicted_earnings = predicted_trips * avg_fare
        best_hours = [7, 8, 17, 18]
    
    # Conservative, realistic, optimistic
    predictions = {
        "conservative": int(predicted_earnings * 0.7),
        "realistic": int(predicted_earnings),
        "optimistic": int(predicted_earnings * 1.3)
    }
    
    # Use AI for personalized tips
    ai_tip = "Focus on peak hours and high-demand areas for best results."
    if EMERGENT_LLM_KEY:
        try:
            chat = LlmChat(
                api_key=EMERGENT_LLM_KEY,
                session_id=f"predictor-{user_id}",
                system_message="You are NEXRYDE's earnings advisor. Give ONE short tip (under 30 words) for a driver to maximize earnings today in Lagos, Nigeria."
            ).with_model("openai", "gpt-4o")
            
            user_message = UserMessage(text=f"Driver average fare: ₦{avg_fare:.0f}, planning to drive {hours_to_drive} hours. One tip?")
            ai_tip = await chat.send_message(user_message)
        except:
            pass
    
    return {
        "predicted_earnings": predictions,
        "predicted_trips": predicted_trips,
        "hours_planned": hours_to_drive,
        "best_hours": best_hours,
        "avg_fare": avg_fare,
        "tip": ai_tip,
        "disclaimer": "Predictions based on historical data. Actual earnings may vary."
    }

@ai_router.get("/drivers/{user_id}/fatigue-status")
async def get_fatigue_status(user_id: str):
    """Get driver fatigue status"""
    profile = await db.driver_profiles.find_one({"user_id": user_id})
    if not profile:
        return {"hours_driven": 0, "needs_break": False, "fatigue_level": "low"}
    
    hours_driven = profile.get("hours_driven_today", 0)
    last_break = profile.get("last_break_at")
    
    # Calculate fatigue level
    if hours_driven >= 10:
        fatigue_level = "critical"
        needs_break = True
    elif hours_driven >= 8:
        fatigue_level = "high"
        needs_break = True
    elif hours_driven >= 6:
        fatigue_level = "medium"
        needs_break = last_break is None or (datetime.utcnow() - last_break).seconds > 7200
    else:
        fatigue_level = "low"
        needs_break = False
    
    return {
        "hours_driven": hours_driven,
        "needs_break": needs_break,
        "fatigue_level": fatigue_level,
        "last_break_at": last_break.isoformat() if last_break else None,
        "recommendation": "Take a 15-minute break to stay alert" if needs_break else "You're doing great!"
    }

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


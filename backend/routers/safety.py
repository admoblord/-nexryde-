"""Safety router - Area Boys, Danger Zones, Safety Alerts."""
from fastapi import APIRouter, HTTPException
from datetime import datetime, timezone
import os
import json
import re
import logging

from database import db, EMERGENT_LLM_KEY

logger = logging.getLogger('server')
safety_router = APIRouter(prefix="/api/safety", tags=["Safety"])


@safety_router.get("/danger-zones")
async def get_danger_zones(lat: float = 6.5244, lng: float = 3.3792, radius: int = 10000):
    """Get danger zones near a location"""
    try:
        zones = await db.danger_zones.find({}, {"_id": 0}).to_list(length=50)
        return {"success": True, "zones": zones, "count": len(zones)}
    except Exception as e:
        logger.error(f"Get danger zones error: {str(e)}")
        return {"success": True, "zones": [], "count": 0}


@safety_router.post("/report")
async def report_danger_zone(request: dict):
    """Report a new danger zone or update existing one"""
    try:
        zone_type = request.get("type", "area_boys")
        location = request.get("location", "")
        description = request.get("description", "")
        latitude = request.get("latitude", 0)
        longitude = request.get("longitude", 0)

        existing = await db.danger_zones.find_one({
            "location.address": {"$regex": location, "$options": "i"}
        })

        if existing:
            await db.danger_zones.update_one(
                {"_id": existing["_id"]},
                {
                    "$inc": {"verified_reports": 1},
                    "$set": {"last_report_time": datetime.now(timezone.utc).isoformat()}
                }
            )
            report_id = str(existing["_id"])
        else:
            new_zone = {
                "zone_id": f"dz-user-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}",
                "location": {
                    "latitude": latitude,
                    "longitude": longitude,
                    "address": location,
                },
                "type": zone_type,
                "severity": request.get("severity", "moderate"),
                "description": description,
                "verified_reports": 1,
                "ai_confidence": 50,
                "community_rating": 3.0,
                "affected_radius": 300,
                "safe_alternatives": [],
                "last_report_time": datetime.now(timezone.utc).isoformat(),
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            result = await db.danger_zones.insert_one(new_zone)
            report_id = str(result.inserted_id)

        return {"success": True, "report_id": report_id, "message": "Thank you for keeping drivers safe!"}
    except Exception as e:
        logger.error(f"Report danger zone error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@safety_router.get("/alerts")
async def get_safety_alerts(lat: float = 6.5244, lng: float = 3.3792, driver_id: str = "unknown"):
    """Get AI-enhanced safety alerts for a driver's location - CACHED to save credits"""
    try:
        # Cache key based on rounded location (same area = same alerts)
        cache_key = f"safety_{round(lat,2)}_{round(lng,2)}"
        
        # Check cache first (1 hour TTL)
        cached = await db.ai_cache.find_one({"key": cache_key})
        if cached:
            cache_age = (datetime.now(timezone.utc) - cached.get("created_at", datetime.min.replace(tzinfo=timezone.utc))).total_seconds()
            if cache_age < 3600:  # 1 hour cache
                return {"success": True, "alerts": cached["data"], "location": {"lat": lat, "lng": lng}, "cached": True}

        zones = await db.danger_zones.find({}, {"_id": 0}).to_list(length=20)
        zone_summaries = []
        for z in zones[:5]:
            zone_summaries.append(f"{z.get('location', {}).get('address', 'Unknown')}: {z.get('type', 'general')} - {z.get('description', '')[:80]}")

        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"safety-{cache_key}",
            system_message="You are a safety AI for ride-hailing drivers in Lagos, Nigeria. Generate concise safety alerts based on known danger zones. Respond with JSON array of alerts."
        ).with_model("openai", "gpt-4o-mini")
        prompt = f"""Based on these danger zones near coordinates ({lat}, {lng}):
{chr(10).join(zone_summaries)}

Generate 3-4 safety alerts as a JSON array. Each alert should have:
- type: "danger", "warning", or "info"
- priority: "critical", "high", "medium", or "low"
- title: short alert title
- message: brief safety message
- zone_type: area_boys, checkpoint, robbery, flooding, or general"""

        response = await chat.send_message(UserMessage(text=prompt))
        json_match = re.search(r'\[.*\]', response, re.DOTALL)
        if json_match:
            alerts = json.loads(json_match.group())
        else:
            alerts = [{"type": "info", "priority": "medium", "title": "Stay Alert", "message": "Drive carefully in this area.", "zone_type": "general"}]

        # Save to cache
        await db.ai_cache.update_one(
            {"key": cache_key},
            {"$set": {"key": cache_key, "data": alerts, "created_at": datetime.now(timezone.utc)}},
            upsert=True
        )

        return {"success": True, "alerts": alerts, "location": {"lat": lat, "lng": lng}, "cached": False}
    except Exception as e:
        logger.error(f"Safety alerts error: {str(e)}")
        return {"success": True, "alerts": [{"type": "info", "priority": "low", "title": "Stay Safe", "message": "No specific alerts for this area.", "zone_type": "general"}], "location": {"lat": lat, "lng": lng}}


# ==================== SEED FUNCTIONS ====================

async def seed_danger_zones(db_ref):
    """Seed Lagos danger zones if not already in DB"""
    count = await db_ref.danger_zones.count_documents({})
    if count == 0:
        zones = [
            {
                "zone_id": "dz-oshodi",
                "location": {"latitude": 6.5566, "longitude": 3.3515, "address": "Oshodi Under Bridge", "landmark": "Oshodi Bus Stop"},
                "type": "area_boys", "severity": "critical",
                "active_time": {"start": 6, "end": 22, "all_day": False},
                "description": "Heavy area boy presence at traffic lights. Reports of window smashing and phone snatching.",
                "verified_reports": 156, "ai_confidence": 95, "community_rating": 4.5, "affected_radius": 500,
                "safe_alternatives": ["Use Agege Motor Road", "Pass through Isolo"],
                "last_report_time": datetime.utcnow().isoformat(), "created_at": datetime.utcnow().isoformat(),
            },
            {
                "zone_id": "dz-obalende",
                "location": {"latitude": 6.4541, "longitude": 3.3947, "address": "Obalende Junction", "landmark": "Obalende Bus Terminal"},
                "type": "checkpoint", "severity": "moderate",
                "active_time": {"start": 0, "end": 23, "all_day": True},
                "description": "Police checkpoint, usual delay 10-15 minutes.",
                "verified_reports": 87, "ai_confidence": 88, "community_rating": 3.8, "affected_radius": 300,
                "safe_alternatives": [],
                "last_report_time": datetime.utcnow().isoformat(), "created_at": datetime.utcnow().isoformat(),
            },
            {
                "zone_id": "dz-cms",
                "location": {"latitude": 6.4968, "longitude": 3.3731, "address": "CMS Under Bridge", "landmark": "CMS Bus Stop"},
                "type": "harassment", "severity": "high",
                "active_time": {"start": 18, "end": 6, "all_day": False},
                "description": "Area boys active especially after dark. Demand money from drivers stuck in traffic.",
                "verified_reports": 134, "ai_confidence": 91, "community_rating": 4.2, "affected_radius": 400,
                "safe_alternatives": ["Use Marina route", "Take Broad Street"],
                "last_report_time": datetime.utcnow().isoformat(), "created_at": datetime.utcnow().isoformat(),
            },
            {
                "zone_id": "dz-ojuelegba",
                "location": {"latitude": 6.5089, "longitude": 3.3696, "address": "Ojuelegba Junction", "landmark": "Ojuelegba Roundabout"},
                "type": "robbery", "severity": "critical",
                "active_time": {"start": 20, "end": 5, "all_day": False},
                "description": "Known hotspot for robbery. Armed groups target vehicles at night.",
                "verified_reports": 78, "ai_confidence": 93, "community_rating": 4.8, "affected_radius": 600,
                "safe_alternatives": ["Use Western Avenue", "Divert through Lawanson"],
                "last_report_time": datetime.utcnow().isoformat(), "created_at": datetime.utcnow().isoformat(),
            },
            {
                "zone_id": "dz-mile2",
                "location": {"latitude": 6.4639, "longitude": 3.3148, "address": "Mile 2", "landmark": "Mile 2 Bus Stop"},
                "type": "area_boys", "severity": "high",
                "active_time": {"start": 7, "end": 21, "all_day": False},
                "description": "Area boys control the bus stop area. Drivers forced to pay tolls.",
                "verified_reports": 112, "ai_confidence": 89, "community_rating": 4.1, "affected_radius": 350,
                "safe_alternatives": ["Use Festac link bridge"],
                "last_report_time": datetime.utcnow().isoformat(), "created_at": datetime.utcnow().isoformat(),
            },
        ]
        await db_ref.danger_zones.insert_many(zones)
        logger.info(f"Seeded {len(zones)} danger zones")

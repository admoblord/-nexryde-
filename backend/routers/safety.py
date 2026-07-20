"""Safety router - Area Boys, Danger Zones, Safety Alerts."""
from fastapi import APIRouter, HTTPException
from datetime import datetime, timezone
import os
import json
import re
import logging
import math

from database import db

logger = logging.getLogger('server')
safety_router = APIRouter(prefix="/api/safety", tags=["Safety"])


def _distance_meters(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Haversine distance in meters."""
    r = 6371000.0
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(d_lng / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return r * c


def _city_advisory_zone(lat: float, lng: float) -> dict:
    """Return a baseline advisory zone nearest to major Nigerian cities."""
    cities = [
        {"name": "Lagos Mainland", "lat": 6.5244, "lng": 3.3792, "risk": "high"},
        {"name": "Abuja Central", "lat": 9.0765, "lng": 7.3986, "risk": "moderate"},
        {"name": "Port Harcourt", "lat": 4.8156, "lng": 7.0498, "risk": "moderate"},
        {"name": "Kano Municipal", "lat": 12.0022, "lng": 8.5920, "risk": "moderate"},
        {"name": "Ibadan North", "lat": 7.3775, "lng": 3.9470, "risk": "moderate"},
        {"name": "Enugu Urban", "lat": 6.4499, "lng": 7.5000, "risk": "moderate"},
        {"name": "Benin City", "lat": 6.3350, "lng": 5.6037, "risk": "moderate"},
        {"name": "Kaduna Central", "lat": 10.5105, "lng": 7.4165, "risk": "moderate"},
        {"name": "Jos City", "lat": 9.8965, "lng": 8.8583, "risk": "moderate"},
        {"name": "Owerri", "lat": 5.4833, "lng": 7.0333, "risk": "moderate"},
    ]
    nearest = min(cities, key=lambda c: _distance_meters(lat, lng, c["lat"], c["lng"]))
    severity = "high" if nearest["risk"] == "high" else "moderate"
    return {
        "zone_id": f"advisory-{nearest['name'].lower().replace(' ', '-')}",
        "location": {
            "latitude": nearest["lat"],
            "longitude": nearest["lng"],
            "address": nearest["name"],
            "landmark": "City safety advisory",
        },
        "type": "checkpoint",
        "severity": severity,
        "active_time": {"start": 0, "end": 23, "all_day": True},
        "description": "General city safety advisory. Stay alert, avoid isolated stops, and share your trip.",
        "verified_reports": 0,
        "ai_confidence": 60,
        "community_rating": 3.2,
        "affected_radius": 1200,
        "safe_alternatives": [],
        "last_report_time": datetime.utcnow().isoformat(),
        "created_at": datetime.utcnow().isoformat(),
    }


@safety_router.get("/danger-zones")
async def get_danger_zones(lat: float = 6.5244, lng: float = 3.3792, radius: int = 10000):
    """Get danger zones near a location across Nigerian cities."""
    try:
        safe_radius = max(1000, min(int(radius or 10000), 50000))
        zones = await db.danger_zones.find({}, {"_id": 0}).to_list(length=500)
        nearby: list[dict] = []
        for zone in zones:
            loc = zone.get("location") or {}
            z_lat = loc.get("latitude")
            z_lng = loc.get("longitude")
            if z_lat is None or z_lng is None:
                continue
            try:
                distance = _distance_meters(float(lat), float(lng), float(z_lat), float(z_lng))
            except Exception:
                continue
            zone_radius = float(zone.get("affected_radius") or 300)
            if distance <= safe_radius + zone_radius:
                z = dict(zone)
                z["distance_meters"] = round(distance, 1)
                nearby.append(z)

        if not nearby:
            nearby = [_city_advisory_zone(float(lat), float(lng))]
        nearby.sort(key=lambda z: float(z.get("distance_meters", 1e12)))
        return {"success": True, "zones": nearby[:120], "count": len(nearby[:120])}
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


# ==================== SEED FUNCTIONS ====================

async def seed_danger_zones(db_ref):
    """Seed danger zones across multiple Nigerian cities (idempotent)."""
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
            {
                "zone_id": "dz-abuja-wuse",
                "location": {"latitude": 9.0785, "longitude": 7.4756, "address": "Wuse Market Axis, Abuja", "landmark": "Wuse Market"},
                "type": "checkpoint", "severity": "moderate",
                "active_time": {"start": 6, "end": 22, "all_day": False},
                "description": "Frequent checkpoint and congestion around market hours.",
                "verified_reports": 48, "ai_confidence": 82, "community_rating": 3.6, "affected_radius": 450,
                "safe_alternatives": ["Use Aminu Kano Crescent alternate"],
                "last_report_time": datetime.utcnow().isoformat(), "created_at": datetime.utcnow().isoformat(),
            },
            {
                "zone_id": "dz-phc-rumuokoro",
                "location": {"latitude": 4.8576, "longitude": 7.0352, "address": "Rumuokoro Roundabout, Port Harcourt", "landmark": "Rumuokoro"},
                "type": "harassment", "severity": "high",
                "active_time": {"start": 18, "end": 6, "all_day": False},
                "description": "Night harassment reports near junction gridlocks.",
                "verified_reports": 34, "ai_confidence": 79, "community_rating": 3.9, "affected_radius": 500,
                "safe_alternatives": ["Use GRA inner roads when possible"],
                "last_report_time": datetime.utcnow().isoformat(), "created_at": datetime.utcnow().isoformat(),
            },
            {
                "zone_id": "dz-kano-sabongari",
                "location": {"latitude": 11.9977, "longitude": 8.5317, "address": "Sabon Gari, Kano", "landmark": "Sabon Gari Market"},
                "type": "checkpoint", "severity": "moderate",
                "active_time": {"start": 7, "end": 21, "all_day": False},
                "description": "Heavy compliance checks and traffic slowdowns.",
                "verified_reports": 28, "ai_confidence": 75, "community_rating": 3.5, "affected_radius": 400,
                "safe_alternatives": [],
                "last_report_time": datetime.utcnow().isoformat(), "created_at": datetime.utcnow().isoformat(),
            },
            {
                "zone_id": "dz-ibadan-iwo",
                "location": {"latitude": 7.3818, "longitude": 3.8869, "address": "Iwo Road Interchange, Ibadan", "landmark": "Iwo Road"},
                "type": "accident_prone", "severity": "high",
                "active_time": {"start": 5, "end": 23, "all_day": False},
                "description": "Accident-prone merging lanes during peak movement.",
                "verified_reports": 42, "ai_confidence": 84, "community_rating": 4.0, "affected_radius": 550,
                "safe_alternatives": ["Use Mokola diversion"],
                "last_report_time": datetime.utcnow().isoformat(), "created_at": datetime.utcnow().isoformat(),
            },
            {
                "zone_id": "dz-enugu-otigba",
                "location": {"latitude": 6.4576, "longitude": 7.5121, "address": "Ogui/OTIGBA axis, Enugu", "landmark": "Ogui Road"},
                "type": "robbery", "severity": "high",
                "active_time": {"start": 20, "end": 5, "all_day": False},
                "description": "Night robbery-risk reports on low-light stretches.",
                "verified_reports": 19, "ai_confidence": 73, "community_rating": 3.7, "affected_radius": 450,
                "safe_alternatives": ["Use brighter arterial roads"],
                "last_report_time": datetime.utcnow().isoformat(), "created_at": datetime.utcnow().isoformat(),
            },
    ]
    inserted = 0
    for zone in zones:
        result = await db_ref.danger_zones.update_one(
            {"zone_id": zone["zone_id"]},
            {"$setOnInsert": zone},
            upsert=True,
        )
        if result.upserted_id:
            inserted += 1
    if inserted > 0:
        logger.info(f"Seeded {inserted} new danger zones")

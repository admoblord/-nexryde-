"""
NEXRYDE AI Intelligence & Smart Mobility System
Sections: Trip Assistant, Smart Matching, Predictive Demand,
          Safety Monitor, Trusted Circle, Women Preference,
          Earnings Prediction, Driver Level System
"""
from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, timedelta, timezone
from bson import ObjectId
import math
import random
import logging
from auth_guard import require_authenticated, verify_trip_participant
from admin_guard import require_admin_request

logger = logging.getLogger("server")

ai_intelligence_router = APIRouter(prefix="/api/ai-intelligence", tags=["AI Intelligence"])

# will be set from server.py
_db = None


def set_ai_intelligence_db(db):
    global _db
    _db = db


def _utcnow():
    return datetime.now(timezone.utc)


async def _require_org_admin(request: Request, org_id: str):
    if not _db:
        raise HTTPException(500, "Database not available")

    actor_id = require_authenticated(request)
    actor = await _db.users.find_one({"id": actor_id})
    if not actor:
        raise HTTPException(401, "User not found")

    org = await _db.organizations.find_one({"org_id": org_id, "status": "active"})
    if not org:
        raise HTTPException(404, "Organization not found")

    actor_email = (actor.get("email") or "").strip().lower()
    org_admin_email = (org.get("admin_email") or "").strip().lower()
    if not actor_email or actor_email != org_admin_email:
        raise HTTPException(403, "Organization admin access required")

    return actor_id, org


def _haversine_km(lat1, lng1, lat2, lng2):
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
         * math.sin(dlng / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# ═══════════════════════════════════════════════════════════════
# SECTION 1 — AI TRIP ASSISTANT (rule-based)
# ═══════════════════════════════════════════════════════════════

RIDER_EVENTS = {
    "driver_arrived": "Your driver has arrived safely. Please confirm pickup.",
    "trip_started": "Trip started. Enjoy your ride! Tap SOS anytime if needed.",
    "route_deviation": "Route looks longer than expected. Is everything okay?",
    "long_stop": "Vehicle has been stopped for a while. Everything okay?",
    "trip_midpoint": "You're halfway there. Need anything?",
    "nearing_destination": "Almost at your destination. Get ready!",
    "emergency_prompt": "Need emergency help? Tap SOS for immediate assistance.",
}

DRIVER_EVENTS = {
    "trip_started": "Trip started. Drive safely!",
    "traffic_ahead": "Traffic detected ahead. Consider alternative routes.",
    "high_demand_nearby": "High demand zone nearby after drop-off.",
    "surge_area_close": "You are close to a surge-demand area.",
    "long_trip_break": "You've been driving for a while. Consider a short break.",
    "nearing_destination": "Approaching drop-off. Prepare to end trip.",
}


class TripAssistantEvent(BaseModel):
    trip_id: str
    event_type: str
    role: str = "rider"
    lat: Optional[float] = None
    lng: Optional[float] = None
    extra: Optional[dict] = None


@ai_intelligence_router.post("/trip-assistant/evaluate")
async def evaluate_trip_assistant(payload: TripAssistantEvent):
    """Evaluate trip state and return AI assistant messages."""
    messages = []
    event = payload.event_type.lower()
    role = payload.role.lower()

    event_map = RIDER_EVENTS if role == "rider" else DRIVER_EVENTS
    if event in event_map:
        messages.append({
            "type": event,
            "message": event_map[event],
            "priority": "high" if event in ("route_deviation", "long_stop", "emergency_prompt") else "normal",
            "timestamp": _utcnow().isoformat(),
        })

    # Auto-detect additional events from trip data
    if payload.trip_id and _db:
        trip = await _db.trips.find_one({"id": payload.trip_id})
        if trip:
            # Check route deviation
            if trip.get("actual_distance_km") and trip.get("estimated_distance_km"):
                deviation = (trip["actual_distance_km"] - trip["estimated_distance_km"]) / max(trip["estimated_distance_km"], 0.1)
                if deviation > 0.20 and "route_deviation" not in event:
                    messages.append({
                        "type": "route_deviation",
                        "message": RIDER_EVENTS["route_deviation"] if role == "rider" else "Route deviation detected. Are you taking an alternate route?",
                        "priority": "high",
                        "deviation_pct": round(deviation * 100),
                        "timestamp": _utcnow().isoformat(),
                    })

            # Check idle time
            guardian = trip.get("guardian_state", {})
            idle_seconds = guardian.get("idle_seconds", 0)
            if idle_seconds > 300 and "long_stop" not in event:
                messages.append({
                    "type": "long_stop",
                    "message": RIDER_EVENTS["long_stop"] if role == "rider" else "Vehicle stopped for over 5 minutes.",
                    "priority": "high",
                    "idle_minutes": round(idle_seconds / 60, 1),
                    "timestamp": _utcnow().isoformat(),
                })

    # Store event
    if _db and messages:
        await _db.trip_assistant_events.insert_one({
            "trip_id": payload.trip_id,
            "event_type": event,
            "role": role,
            "messages": messages,
            "lat": payload.lat,
            "lng": payload.lng,
            "created_at": _utcnow(),
        })

    return {"success": True, "messages": messages, "count": len(messages)}


@ai_intelligence_router.get("/trip-assistant/{trip_id}/notifications")
async def get_trip_notifications(trip_id: str, role: str = "rider"):
    """Get all AI assistant notifications for a trip."""
    if not _db:
        raise HTTPException(500, "Database not available")
    events = await _db.trip_assistant_events.find(
        {"trip_id": trip_id, "role": role}
    ).sort("created_at", -1).limit(20).to_list(20)
    for e in events:
        e.pop("_id", None)
    return {"success": True, "notifications": events}


# ═══════════════════════════════════════════════════════════════
# SECTION 2 — SMART MATCHING SYSTEM
# ═══════════════════════════════════════════════════════════════

class RiderPreferences(BaseModel):
    rider_id: str
    quiet_ride: bool = False
    conversation_allowed: bool = True
    preferred_driver_gender: Optional[str] = None  # "male", "female", None
    female_driver_preferred: bool = False
    preferred_vehicle_type: Optional[str] = None


@ai_intelligence_router.post("/matching/preferences")
async def save_rider_preferences(prefs: RiderPreferences):
    """Save rider matching preferences."""
    if not _db:
        raise HTTPException(500, "Database not available")
    data = prefs.dict()
    data["updated_at"] = _utcnow()
    await _db.rider_preferences.update_one(
        {"rider_id": prefs.rider_id},
        {"$set": data},
        upsert=True,
    )
    return {"success": True, "message": "Preferences saved"}


@ai_intelligence_router.get("/matching/preferences/{rider_id}")
async def get_rider_preferences(rider_id: str):
    if not _db:
        raise HTTPException(500, "Database not available")
    prefs = await _db.rider_preferences.find_one({"rider_id": rider_id})
    if prefs:
        prefs.pop("_id", None)
    return {"success": True, "preferences": prefs or {}}


@ai_intelligence_router.post("/matching/find-best-driver")
async def find_best_matched_driver(
    rider_id: str,
    pickup_lat: float,
    pickup_lng: float,
    service_type: str = "economy",
    radius_km: float = 10.0,
):
    """Smart matching: score drivers by rating, behavior, distance, and rider prefs."""
    if not _db:
        raise HTTPException(500, "Database not available")

    rider_prefs = await _db.rider_preferences.find_one({"rider_id": rider_id}) or {}
    rider_profile = await _db.users.find_one({"id": rider_id}) or {}
    rider_rating = rider_profile.get("rating", 4.5)

    drivers = await _db.users.find({
        "role": "driver",
        "is_online": True,
        "verified": True,
    }).to_list(200)

    scored = []
    for d in drivers:
        d_loc = d.get("location", {})
        d_lat = d_loc.get("lat") or d_loc.get("latitude", 0)
        d_lng = d_loc.get("lng") or d_loc.get("longitude", 0)
        if not d_lat or not d_lng:
            continue

        dist = _haversine_km(pickup_lat, pickup_lng, d_lat, d_lng)
        if dist > radius_km:
            continue

        d_rating = d.get("rating", 4.0)
        d_cancel = d.get("cancellation_rate", 0)
        d_trips = d.get("trips_completed", 0)
        d_gender = d.get("gender", "").lower()

        # Distance score (closer = higher, max 1.0)
        distance_score = max(0, 1.0 - (dist / radius_km))

        # Behavior compatibility
        behavior_score = 1.0
        if rider_prefs.get("quiet_ride") and d.get("driving_style") == "chatty":
            behavior_score *= 0.5
        if rider_prefs.get("conversation_allowed") and d.get("driving_style") == "quiet":
            behavior_score *= 0.8
        if d_cancel > 0.3:
            behavior_score *= 0.6

        # Gender preference
        gender_bonus = 0
        if rider_prefs.get("female_driver_preferred") or rider_prefs.get("preferred_driver_gender") == "female":
            if d_gender == "female":
                gender_bonus = 0.3
            else:
                gender_bonus = -0.2

        # Driver level bonus
        level_data = await _db.driver_levels.find_one({"driver_id": d.get("id", "")})
        level_bonus = {"bronze": 0, "silver": 0.05, "gold": 0.1, "elite": 0.2}.get(
            (level_data or {}).get("level", "bronze"), 0
        )

        match_score = (
            (d_rating / 5.0) * 0.4
            + behavior_score * 0.3
            + distance_score * 0.3
            + gender_bonus
            + level_bonus
        )

        scored.append({
            "driver_id": d.get("id"),
            "name": d.get("name", "Driver"),
            "rating": d_rating,
            "distance_km": round(dist, 2),
            "match_score": round(match_score, 3),
            "vehicle": d.get("vehicle_type", service_type),
            "plate": d.get("plate_number", ""),
            "gender": d_gender,
            "level": (level_data or {}).get("level", "bronze"),
            "trips_completed": d_trips,
        })

    scored.sort(key=lambda x: x["match_score"], reverse=True)
    return {"success": True, "matches": scored[:5], "total_candidates": len(scored)}


# ═══════════════════════════════════════════════════════════════
# SECTION 3 — PREDICTIVE DEMAND AI
# ═══════════════════════════════════════════════════════════════

LAGOS_HOTSPOTS = [
    {"zone": "Lekki Phase 1", "lat": 6.4375, "lng": 3.4705},
    {"zone": "Victoria Island", "lat": 6.4281, "lng": 3.4219},
    {"zone": "Ikeja", "lat": 6.6018, "lng": 3.3515},
    {"zone": "Ajah", "lat": 6.4681, "lng": 3.5773},
    {"zone": "Surulere", "lat": 6.5009, "lng": 3.3500},
    {"zone": "Yaba", "lat": 6.5095, "lng": 3.3795},
    {"zone": "Ikoyi", "lat": 6.4486, "lng": 3.4382},
    {"zone": "Oshodi", "lat": 6.5568, "lng": 3.3420},
    {"zone": "Festac", "lat": 6.4678, "lng": 3.2838},
    {"zone": "Apapa", "lat": 6.4488, "lng": 3.3599},
]


@ai_intelligence_router.get("/demand/predict")
async def predict_demand(
    lat: float = Query(6.45),
    lng: float = Query(3.42),
):
    """Predict demand for the next 15-60 minutes using historical patterns."""
    now = _utcnow()
    hour = now.hour
    weekday = now.weekday()
    is_weekend = weekday >= 5

    # Time-based demand multiplier
    if 7 <= hour <= 9:
        time_mult = 1.8  # morning rush
    elif 16 <= hour <= 19:
        time_mult = 2.0  # evening rush
    elif 12 <= hour <= 14:
        time_mult = 1.3  # lunch
    elif 21 <= hour <= 23:
        time_mult = 1.5  # nightlife
    else:
        time_mult = 0.7

    if is_weekend:
        time_mult *= 0.85

    # Historical trip counts from DB
    trip_count_1h = 0
    if _db:
        one_hour_ago = now - timedelta(hours=1)
        trip_count_1h = await _db.trips.count_documents({
            "created_at": {"$gte": one_hour_ago},
            "pickup_lat": {"$gte": lat - 0.05, "$lte": lat + 0.05},
            "pickup_lng": {"$gte": lng - 0.05, "$lte": lng + 0.05},
        })

    zones = []
    for spot in LAGOS_HOTSPOTS:
        dist = _haversine_km(lat, lng, spot["lat"], spot["lng"])
        if dist > 30:
            continue
        proximity = max(0.3, 1.0 - dist / 30)
        intensity = min(1.0, proximity * time_mult * (1 + trip_count_1h * 0.05))
        demand_level = "low" if intensity < 0.4 else "medium" if intensity < 0.7 else "high"
        surge = round(1.0 + intensity * 0.5, 2)

        zones.append({
            "zone_name": spot["zone"],
            "lat": spot["lat"],
            "lng": spot["lng"],
            "intensity": round(intensity, 3),
            "demand_level": demand_level,
            "surge_multiplier": surge,
            "predicted_requests_15m": max(1, int(intensity * 12)),
            "distance_km": round(dist, 1),
        })

    zones.sort(key=lambda z: z["intensity"], reverse=True)

    # Build driver notifications
    notifications = []
    for z in zones[:3]:
        if z["demand_level"] in ("medium", "high"):
            notifications.append(
                f"High demand expected in {z['zone_name']} within 15 minutes."
            )

    return {
        "success": True,
        "predicted_zones": zones,
        "notifications": notifications,
        "analysis": {
            "current_hour": hour,
            "is_weekend": is_weekend,
            "time_multiplier": time_mult,
            "recent_trips_nearby": trip_count_1h,
        },
        "generated_at": now.isoformat(),
    }


# ═══════════════════════════════════════════════════════════════
# SECTION 4 — SMART SAFETY MONITOR
# ═══════════════════════════════════════════════════════════════

SAFETY_THRESHOLDS = {
    "stop_duration_seconds": 300,     # 5 minutes
    "route_deviation_pct": 0.20,      # 20%
    "max_speed_kmh": 160,
    "gps_inactivity_seconds": 180,    # 3 minutes
    "response_timeout_seconds": 60,
}


class SafetyCheckTrigger(BaseModel):
    trip_id: str
    trigger_type: str  # "long_stop", "route_deviation", "speed_anomaly", "gps_inactive"
    lat: Optional[float] = None
    lng: Optional[float] = None
    details: Optional[dict] = None


@ai_intelligence_router.post("/safety/monitor/check")
async def trigger_safety_monitor(payload: SafetyCheckTrigger, request: Request):
    """Detect and flag safety issues during active trips."""
    if not _db:
        raise HTTPException(500, "Database not available")

    trip = await _db.trips.find_one({"id": payload.trip_id})
    if not trip:
        raise HTTPException(404, "Trip not found")
    verify_trip_participant(request, trip)

    check_id = f"sc-{payload.trip_id}-{int(_utcnow().timestamp())}"
    check_doc = {
        "check_id": check_id,
        "trip_id": payload.trip_id,
        "rider_id": trip.get("rider_id"),
        "driver_id": trip.get("driver_id"),
        "trigger_type": payload.trigger_type,
        "status": "pending_response",
        "lat": payload.lat,
        "lng": payload.lng,
        "details": payload.details or {},
        "created_at": _utcnow(),
        "response_deadline": _utcnow() + timedelta(seconds=SAFETY_THRESHOLDS["response_timeout_seconds"]),
    }
    await _db.safety_checks.insert_one(check_doc)

    # Update trip with active safety alert
    message_map = {
        "long_stop": "Vehicle has been stopped for over 5 minutes. Everything okay?",
        "route_deviation": "Route deviation detected. Are you safe?",
        "speed_anomaly": "Unusual speed detected. Is everything alright?",
        "gps_inactive": "GPS signal lost. Are you okay?",
    }
    await _db.trips.update_one(
        {"id": payload.trip_id},
        {"$set": {
            "guardian_alert": {
                "active": True,
                "check_id": check_id,
                "message": message_map.get(payload.trigger_type, "Safety check — are you okay?"),
                "trigger": payload.trigger_type,
                "created_at": _utcnow().isoformat(),
            }
        }}
    )

    return {
        "success": True,
        "check_id": check_id,
        "message": message_map.get(payload.trigger_type, "Safety check triggered"),
        "response_deadline_seconds": SAFETY_THRESHOLDS["response_timeout_seconds"],
    }


@ai_intelligence_router.post("/safety/monitor/respond")
async def respond_to_safety_monitor(check_id: str, request: Request, response: str = "safe"):
    """Rider/Driver responds to safety check."""
    if not _db:
        raise HTTPException(500, "Database not available")

    actor_id = require_authenticated(request)
    check = await _db.safety_checks.find_one({"check_id": check_id})
    if not check:
        raise HTTPException(404, "Safety check not found")
    if actor_id not in [check.get("rider_id"), check.get("driver_id")]:
        raise HTTPException(403, "Not authorized to respond to this safety check")

    result = await _db.safety_checks.update_one(
        {"check_id": check_id, "status": "pending_response"},
        {"$set": {
            "status": "resolved" if response == "safe" else "escalated",
            "response": response,
            "responded_at": _utcnow(),
            "responded_by": actor_id,
        }}
    )
    if result.modified_count == 0:
        raise HTTPException(404, "Safety check not found or already resolved")

    # Clear trip guardian alert
    if check:
        await _db.trips.update_one(
            {"id": check.get("trip_id")},
            {"$set": {"guardian_alert": {"active": False}}}
        )

    if response == "need_help":
        # Auto-escalate to SOS
        sos_doc = {
            "id": f"sos-{check_id}",
            "trip_id": check.get("trip_id"),
            "rider_id": check.get("rider_id"),
            "driver_id": check.get("driver_id"),
            "trigger": "safety_monitor_escalation",
            "lat": check.get("lat"),
            "lng": check.get("lng"),
            "status": "active",
            "created_at": _utcnow(),
        }
        await _db.sos_alerts.insert_one(sos_doc)
        return {"success": True, "status": "escalated_to_sos", "sos_id": sos_doc["id"]}

    return {"success": True, "status": "resolved"}


@ai_intelligence_router.get("/safety/monitor/pending/{trip_id}")
async def get_pending_safety_checks(trip_id: str, request: Request):
    """Get active safety checks for a trip."""
    if not _db:
        raise HTTPException(500, "Database not available")
    trip = await _db.trips.find_one({"id": trip_id})
    if not trip:
        raise HTTPException(404, "Trip not found")
    verify_trip_participant(request, trip)
    checks = await _db.safety_checks.find(
        {"trip_id": trip_id, "status": "pending_response"}
    ).sort("created_at", -1).limit(5).to_list(5)
    for c in checks:
        c.pop("_id", None)
    return {"success": True, "pending_checks": checks}


# ═══════════════════════════════════════════════════════════════
# SECTION 5 — TRUSTED CIRCLE
# ═══════════════════════════════════════════════════════════════

class TrustedContact(BaseModel):
    rider_id: str
    contact_name: str
    phone_number: str


@ai_intelligence_router.post("/trusted-circle/add")
async def add_trusted_contact(contact: TrustedContact):
    """Add a trusted contact (max 3)."""
    if not _db:
        raise HTTPException(500, "Database not available")

    existing = await _db.trusted_contacts.count_documents({"rider_id": contact.rider_id})
    if existing >= 3:
        raise HTTPException(400, "Maximum 3 trusted contacts allowed")

    dup = await _db.trusted_contacts.find_one({
        "rider_id": contact.rider_id,
        "phone_number": contact.phone_number,
    })
    if dup:
        raise HTTPException(400, "Contact already exists")

    doc = contact.dict()
    doc["created_at"] = _utcnow()
    doc["auto_share"] = True
    await _db.trusted_contacts.insert_one(doc)
    return {"success": True, "message": f"{contact.contact_name} added to trusted circle"}


@ai_intelligence_router.get("/trusted-circle/{rider_id}")
async def get_trusted_contacts(rider_id: str):
    if not _db:
        raise HTTPException(500, "Database not available")
    contacts = await _db.trusted_contacts.find({"rider_id": rider_id}).to_list(3)
    for c in contacts:
        c.pop("_id", None)
    return {"success": True, "contacts": contacts}


@ai_intelligence_router.delete("/trusted-circle/{rider_id}/{phone_number}")
async def remove_trusted_contact(rider_id: str, phone_number: str):
    if not _db:
        raise HTTPException(500, "Database not available")
    result = await _db.trusted_contacts.delete_one({
        "rider_id": rider_id,
        "phone_number": phone_number,
    })
    if result.deleted_count == 0:
        raise HTTPException(404, "Contact not found")
    return {"success": True, "message": "Contact removed"}


@ai_intelligence_router.post("/trusted-circle/auto-share/{trip_id}")
async def auto_share_trip_with_circle(trip_id: str, rider_id: str):
    """Auto-share trip tracking link with all trusted contacts on trip start."""
    if not _db:
        raise HTTPException(500, "Database not available")

    contacts = await _db.trusted_contacts.find({
        "rider_id": rider_id, "auto_share": True
    }).to_list(3)

    if not contacts:
        return {"success": True, "shared_count": 0, "message": "No trusted contacts to share with"}

    trip = await _db.trips.find_one({"id": trip_id})
    if not trip:
        raise HTTPException(404, "Trip not found")

    import uuid as _uuid
    shares = []
    for c in contacts:
        share_token = str(_uuid.uuid4())[:12]
        share_doc = {
            "trip_id": trip_id,
            "rider_id": rider_id,
            "recipient_name": c["contact_name"],
            "recipient_phone": c["phone_number"],
            "share_token": share_token,
            "status": "active",
            "created_at": _utcnow(),
        }
        await _db.trip_shares.insert_one(share_doc)
        shares.append({
            "contact": c["contact_name"],
            "phone": c["phone_number"],
            "tracking_link": f"https://nexryde.com/track/{share_token}",
        })

    return {
        "success": True,
        "shared_count": len(shares),
        "shares": shares,
        "message": f"Trip shared with {len(shares)} trusted contact(s)",
    }


# ═══════════════════════════════════════════════════════════════
# SECTION 6 — WOMEN PREFERENCE MODE (integrated into matching)
# ═══════════════════════════════════════════════════════════════

class WomenPreferenceSettings(BaseModel):
    rider_id: str
    female_driver_preferred: bool = False
    quiet_mode: bool = False
    conversation_allowed: bool = True


@ai_intelligence_router.post("/women-preference/save")
async def save_women_preference(settings: WomenPreferenceSettings):
    """Save women preference mode settings."""
    if not _db:
        raise HTTPException(500, "Database not available")
    data = settings.dict()
    data["updated_at"] = _utcnow()
    await _db.rider_preferences.update_one(
        {"rider_id": settings.rider_id},
        {"$set": data},
        upsert=True,
    )
    return {"success": True, "message": "Women preference settings saved"}


@ai_intelligence_router.get("/women-preference/{rider_id}")
async def get_women_preference(rider_id: str):
    if not _db:
        raise HTTPException(500, "Database not available")
    prefs = await _db.rider_preferences.find_one({"rider_id": rider_id})
    if prefs:
        prefs.pop("_id", None)
    return {
        "success": True,
        "female_driver_preferred": (prefs or {}).get("female_driver_preferred", False),
        "quiet_mode": (prefs or {}).get("quiet_ride", False),
        "conversation_allowed": (prefs or {}).get("conversation_allowed", True),
    }


# ═══════════════════════════════════════════════════════════════
# SECTION 7 — DRIVER EARNINGS PREDICTION DASHBOARD
# ═══════════════════════════════════════════════════════════════

@ai_intelligence_router.get("/earnings/predict/{driver_id}")
async def predict_driver_earnings(driver_id: str, hours: int = Query(8, ge=1, le=24)):
    """Predict driver earnings using last 30 days of trip data."""
    if not _db:
        raise HTTPException(500, "Database not available")

    thirty_days_ago = _utcnow() - timedelta(days=30)
    trips = await _db.trips.find({
        "driver_id": driver_id,
        "status": "completed",
        "created_at": {"$gte": thirty_days_ago},
    }).to_list(1000)

    total_earnings = sum(t.get("fare", t.get("offered_fare", 0)) or 0 for t in trips)
    total_trips = len(trips)
    active_days = len(set(
        (t.get("created_at") or _utcnow()).strftime("%Y-%m-%d") for t in trips
        if isinstance(t.get("created_at"), datetime)
    )) or 1

    avg_per_trip = total_earnings / max(total_trips, 1)
    avg_trips_per_day = total_trips / active_days
    avg_daily_earnings = total_earnings / active_days

    # Estimate trips per hour from trip durations
    total_duration_min = sum(t.get("duration_min", 25) or 25 for t in trips)
    avg_trip_duration_min = total_duration_min / max(total_trips, 1)
    trips_per_hour = 60 / max(avg_trip_duration_min, 10)

    predicted_earnings = round(avg_per_trip * trips_per_hour * hours)

    # Best work hours analysis
    hour_earnings = {}
    for t in trips:
        ca = t.get("created_at")
        if isinstance(ca, datetime):
            h = ca.hour
            hour_earnings.setdefault(h, []).append(t.get("fare", t.get("offered_fare", 0)) or 0)
    best_hours = sorted(
        [{"hour": h, "avg_fare": round(sum(fares) / len(fares)), "trip_count": len(fares)}
         for h, fares in hour_earnings.items()],
        key=lambda x: x["avg_fare"], reverse=True
    )[:5]

    # Hot zones from recent trips
    zone_counts = {}
    for t in trips:
        addr = t.get("pickup_address", "Unknown")
        short = addr.split(",")[0].strip() if addr else "Unknown"
        zone_counts[short] = zone_counts.get(short, 0) + 1
    hot_zones = sorted(
        [{"zone": z, "trips": c} for z, c in zone_counts.items()],
        key=lambda x: x["trips"], reverse=True
    )[:5]

    return {
        "success": True,
        "driver_id": driver_id,
        "prediction": {
            "predicted_daily_income": predicted_earnings,
            "predicted_weekly_income": predicted_earnings * 6,
            "predicted_monthly_income": predicted_earnings * 26,
            "hours_assumed": hours,
            "avg_per_trip": round(avg_per_trip),
            "est_trips_per_hour": round(trips_per_hour, 1),
        },
        "historical": {
            "total_earnings_30d": round(total_earnings),
            "total_trips_30d": total_trips,
            "active_days": active_days,
            "avg_daily_earnings": round(avg_daily_earnings),
        },
        "best_work_hours": best_hours,
        "hot_zones": hot_zones,
    }


# ═══════════════════════════════════════════════════════════════
# SECTION 8 — DRIVER LEVEL SYSTEM
# ═══════════════════════════════════════════════════════════════

DRIVER_LEVELS = {
    "bronze": {"min_trips": 0, "min_rating": 0, "max_cancel": 1.0, "min_hours": 0,
               "dispatch_priority": 1.0, "intercity_access": False, "subscription_discount": 0},
    "silver": {"min_trips": 50, "min_rating": 4.0, "max_cancel": 0.15, "min_hours": 40,
               "dispatch_priority": 1.15, "intercity_access": False, "subscription_discount": 5},
    "gold": {"min_trips": 200, "min_rating": 4.5, "max_cancel": 0.10, "min_hours": 200,
             "dispatch_priority": 1.3, "intercity_access": True, "subscription_discount": 10},
    "elite": {"min_trips": 500, "min_rating": 4.7, "max_cancel": 0.05, "min_hours": 500,
              "dispatch_priority": 1.5, "intercity_access": True, "subscription_discount": 15},
}


def _calculate_driver_level(trips_completed: int, rating: float, cancellation_rate: float, online_hours: float) -> str:
    level = "bronze"
    for lvl in ["silver", "gold", "elite"]:
        req = DRIVER_LEVELS[lvl]
        if (trips_completed >= req["min_trips"]
                and rating >= req["min_rating"]
                and cancellation_rate <= req["max_cancel"]
                and online_hours >= req["min_hours"]):
            level = lvl
    return level


@ai_intelligence_router.get("/driver-level/{driver_id}")
async def get_driver_level(driver_id: str):
    """Get driver's current level and progress."""
    if not _db:
        raise HTTPException(500, "Database not available")

    user = await _db.users.find_one({"id": driver_id, "role": "driver"})
    if not user:
        raise HTTPException(404, "Driver not found")

    trips_completed = user.get("trips_completed", 0)
    rating = user.get("rating", 4.0)
    cancel_rate = user.get("cancellation_rate", 0)
    online_hours = user.get("online_hours", 0)

    # Also check trip history for accurate counts
    if _db:
        actual_trips = await _db.trips.count_documents({
            "driver_id": driver_id, "status": "completed"
        })
        if actual_trips > trips_completed:
            trips_completed = actual_trips

    level = _calculate_driver_level(trips_completed, rating, cancel_rate, online_hours)
    config = DRIVER_LEVELS[level]

    # Calculate progress to next level
    next_levels = {"bronze": "silver", "silver": "gold", "gold": "elite", "elite": None}
    next_level = next_levels[level]
    progress = {}
    if next_level:
        next_req = DRIVER_LEVELS[next_level]
        progress = {
            "next_level": next_level,
            "trips_needed": max(0, next_req["min_trips"] - trips_completed),
            "rating_needed": max(0, round(next_req["min_rating"] - rating, 2)),
            "hours_needed": max(0, round(next_req["min_hours"] - online_hours, 1)),
            "cancel_rate_max": next_req["max_cancel"],
        }

    # Save/update level
    await _db.driver_levels.update_one(
        {"driver_id": driver_id},
        {"$set": {
            "driver_id": driver_id,
            "level": level,
            "trips_completed": trips_completed,
            "rating": rating,
            "cancellation_rate": cancel_rate,
            "online_hours": online_hours,
            "dispatch_priority": config["dispatch_priority"],
            "intercity_access": config["intercity_access"],
            "subscription_discount": config["subscription_discount"],
            "updated_at": _utcnow(),
        }},
        upsert=True,
    )

    return {
        "success": True,
        "driver_id": driver_id,
        "level": level,
        "benefits": {
            "dispatch_priority_multiplier": config["dispatch_priority"],
            "intercity_access": config["intercity_access"],
            "subscription_discount_pct": config["subscription_discount"],
        },
        "metrics": {
            "trips_completed": trips_completed,
            "rating": rating,
            "cancellation_rate": cancel_rate,
            "online_hours": online_hours,
        },
        "progress_to_next": progress,
    }


@ai_intelligence_router.post("/driver-level/refresh-all")
async def refresh_all_driver_levels(request: Request):
    """Weekly batch: recalculate all driver levels."""
    await require_admin_request(request)
    if not _db:
        raise HTTPException(500, "Database not available")

    drivers = await _db.users.find({"role": "driver"}).to_list(5000)
    updated = 0
    for d in drivers:
        driver_id = d.get("id", "")
        if not driver_id:
            continue
        trips_completed = await _db.trips.count_documents({
            "driver_id": driver_id, "status": "completed"
        })
        rating = d.get("rating", 4.0)
        cancel_rate = d.get("cancellation_rate", 0)
        online_hours = d.get("online_hours", 0)

        level = _calculate_driver_level(trips_completed, rating, cancel_rate, online_hours)
        config = DRIVER_LEVELS[level]

        await _db.driver_levels.update_one(
            {"driver_id": driver_id},
            {"$set": {
                "driver_id": driver_id,
                "level": level,
                "trips_completed": trips_completed,
                "rating": rating,
                "cancellation_rate": cancel_rate,
                "online_hours": online_hours,
                "dispatch_priority": config["dispatch_priority"],
                "intercity_access": config["intercity_access"],
                "subscription_discount": config["subscription_discount"],
                "updated_at": _utcnow(),
            }},
            upsert=True,
        )
        updated += 1

    return {"success": True, "drivers_updated": updated}


# ═══════════════════════════════════════════════════════════════
# FEATURE FLAGS — all features gated
# ═══════════════════════════════════════════════════════════════

import os as _os

_FEATURE_FLAGS = {
    "trip_assistant": _os.environ.get("FF_TRIP_ASSISTANT", "true").lower() == "true",
    "smart_matching": _os.environ.get("FF_SMART_MATCHING", "true").lower() == "true",
    "predictive_demand": _os.environ.get("FF_PREDICTIVE_DEMAND", "true").lower() == "true",
    "smart_safety": _os.environ.get("FF_SMART_SAFETY", "true").lower() == "true",
    "trusted_circle": _os.environ.get("FF_TRUSTED_CIRCLE", "true").lower() == "true",
    "women_preference": _os.environ.get("FF_WOMEN_PREFERENCE", "true").lower() == "true",
    "earnings_prediction": _os.environ.get("FF_EARNINGS_PREDICTION", "true").lower() == "true",
    "driver_levels": _os.environ.get("FF_DRIVER_LEVELS", "true").lower() == "true",
    "earning_windows": _os.environ.get("FF_EARNING_WINDOWS", "true").lower() == "true",
    "intercity_smart": _os.environ.get("FF_INTERCITY_SMART", "true").lower() == "true",
    "favorite_driver": _os.environ.get("FF_FAVORITE_DRIVER", "true").lower() == "true",
    "package_delivery": _os.environ.get("FF_PACKAGE_DELIVERY", "true").lower() == "true",
    "corporate_accounts": _os.environ.get("FF_CORPORATE_ACCOUNTS", "true").lower() == "true",
    "pickup_intelligence": _os.environ.get("FF_PICKUP_INTELLIGENCE", "true").lower() == "true",
}


def _check_flag(name: str):
    if not _FEATURE_FLAGS.get(name, True):
        raise HTTPException(503, f"Feature '{name}' is currently disabled")


@ai_intelligence_router.get("/feature-flags")
async def get_feature_flags():
    return {"success": True, "flags": _FEATURE_FLAGS}


# ═══════════════════════════════════════════════════════════════
# SECTION 9 — GUARANTEED EARNING WINDOWS
# ═══════════════════════════════════════════════════════════════

class EarningWindowCreate(BaseModel):
    city: str = "Lagos"
    zone: str = "Mainland"
    start_hour: int = Field(ge=0, le=23)
    end_hour: int = Field(ge=0, le=23)
    days: List[str] = Field(default_factory=lambda: ["mon", "tue", "wed", "thu", "fri"])
    priority_boost: float = 1.5
    label: Optional[str] = None


@ai_intelligence_router.post("/earning-windows/create")
async def create_earning_window(window: EarningWindowCreate, request: Request):
    """Admin creates a guaranteed earning window."""
    await require_admin_request(request)
    _check_flag("earning_windows")
    if not _db:
        raise HTTPException(500, "Database not available")

    import uuid as _uuid
    window_id = f"ew-{str(_uuid.uuid4())[:8]}"
    doc = window.dict()
    doc["window_id"] = window_id
    doc["label"] = window.label or f"{window.city} {window.zone} {window.start_hour}:00-{window.end_hour}:00"
    doc["active"] = True
    doc["created_at"] = _utcnow()
    await _db.earning_windows.insert_one(doc)

    logger.info(f"Earning window created: {window_id} — {doc['label']}")
    return {"success": True, "window_id": window_id, "label": doc["label"]}


@ai_intelligence_router.get("/earning-windows/active")
async def get_active_earning_windows():
    _check_flag("earning_windows")
    if not _db:
        raise HTTPException(500, "Database not available")
    windows = await _db.earning_windows.find({"active": True}).to_list(50)
    for w in windows:
        w.pop("_id", None)
    return {"success": True, "windows": windows}


@ai_intelligence_router.get("/earning-windows/check-priority/{driver_id}")
async def check_earning_window_priority(driver_id: str):
    """Check if driver is eligible for earning window dispatch priority right now."""
    _check_flag("earning_windows")
    if not _db:
        raise HTTPException(500, "Database not available")

    now = _utcnow()
    current_hour = now.hour
    day_map = {0: "mon", 1: "tue", 2: "wed", 3: "thu", 4: "fri", 5: "sat", 6: "sun"}
    current_day = day_map[now.weekday()]

    driver = await _db.users.find_one({"id": driver_id, "role": "driver"})
    if not driver or not driver.get("is_online"):
        return {"success": True, "in_window": False, "reason": "Driver not online"}

    windows = await _db.earning_windows.find({"active": True}).to_list(50)
    matched = []
    for w in windows:
        if current_day in w.get("days", []):
            s, e = w.get("start_hour", 0), w.get("end_hour", 0)
            in_range = (s <= current_hour < e) if s < e else (current_hour >= s or current_hour < e)
            if in_range:
                matched.append({
                    "window_id": w["window_id"],
                    "label": w.get("label"),
                    "priority_boost": w.get("priority_boost", 1.5),
                })

    if matched:
        best = max(matched, key=lambda m: m["priority_boost"])
        await _db.ai_decisions_log.insert_one({
            "type": "earning_window_match",
            "driver_id": driver_id,
            "window_id": best["window_id"],
            "boost": best["priority_boost"],
            "timestamp": _utcnow(),
        })
        return {"success": True, "in_window": True, "windows": matched, "best_boost": best["priority_boost"]}

    return {"success": True, "in_window": False, "windows": []}


@ai_intelligence_router.delete("/earning-windows/{window_id}")
async def deactivate_earning_window(window_id: str, request: Request):
    await require_admin_request(request)
    _check_flag("earning_windows")
    if not _db:
        raise HTTPException(500, "Database not available")
    result = await _db.earning_windows.update_one(
        {"window_id": window_id}, {"$set": {"active": False}}
    )
    if result.modified_count == 0:
        raise HTTPException(404, "Window not found")
    return {"success": True, "message": "Earning window deactivated"}


# ═══════════════════════════════════════════════════════════════
# SECTION 10 — INTERCITY SMART BOOKING
# ═══════════════════════════════════════════════════════════════

INTERCITY_ROUTES = {
    "lagos_ibadan": {"from": "Lagos", "to": "Ibadan", "distance_km": 128, "base_fare": 8000, "min_riders": 3, "max_riders": 4},
    "lagos_abeokuta": {"from": "Lagos", "to": "Abeokuta", "distance_km": 77, "base_fare": 5000, "min_riders": 3, "max_riders": 4},
    "lagos_benin": {"from": "Lagos", "to": "Benin City", "distance_km": 312, "base_fare": 15000, "min_riders": 3, "max_riders": 4},
    "abuja_kaduna": {"from": "Abuja", "to": "Kaduna", "distance_km": 200, "base_fare": 10000, "min_riders": 3, "max_riders": 4},
    "abuja_jos": {"from": "Abuja", "to": "Jos", "distance_km": 290, "base_fare": 12000, "min_riders": 3, "max_riders": 4},
}


class IntercityScheduleRequest(BaseModel):
    rider_id: str
    route_key: str
    departure_date: str  # ISO date, e.g. "2026-02-15"
    departure_hour: int = Field(ge=0, le=23)
    vehicle_preference: str = "comfort"


@ai_intelligence_router.post("/intercity/schedule")
async def schedule_intercity_trip(req: IntercityScheduleRequest):
    """Schedule a future intercity trip. System groups riders automatically."""
    _check_flag("intercity_smart")
    if not _db:
        raise HTTPException(500, "Database not available")

    route = INTERCITY_ROUTES.get(req.route_key)
    if not route:
        raise HTTPException(400, f"Unknown route. Available: {list(INTERCITY_ROUTES.keys())}")

    import uuid as _uuid
    booking_key = f"{req.route_key}_{req.departure_date}_{req.departure_hour}"

    existing_group = await _db.intercity_bookings.find_one({
        "booking_key": booking_key,
        "status": {"$in": ["open", "confirmed"]},
    })

    if existing_group:
        already_joined = any(r["rider_id"] == req.rider_id for r in existing_group.get("riders", []))
        if already_joined:
            raise HTTPException(400, "You already joined this trip")

        if len(existing_group.get("riders", [])) >= route["max_riders"]:
            raise HTTPException(400, "This trip slot is full")

        await _db.intercity_bookings.update_one(
            {"booking_key": booking_key, "status": {"$in": ["open", "confirmed"]}},
            {"$push": {"riders": {
                "rider_id": req.rider_id,
                "joined_at": _utcnow().isoformat(),
                "vehicle_preference": req.vehicle_preference,
            }}}
        )
        updated = await _db.intercity_bookings.find_one({"booking_key": booking_key})
        rider_count = len(updated.get("riders", []))

        if rider_count >= route["min_riders"] and updated.get("status") == "open":
            await _db.intercity_bookings.update_one(
                {"booking_key": booking_key},
                {"$set": {"status": "confirmed", "confirmed_at": _utcnow()}}
            )
            return {
                "success": True,
                "booking_id": existing_group["booking_id"],
                "status": "confirmed",
                "riders": rider_count,
                "message": f"Trip confirmed! {rider_count} riders joined. {route['from']} → {route['to']}",
                "fare_per_rider": round(route["base_fare"] / rider_count),
            }

        return {
            "success": True,
            "booking_id": existing_group["booking_id"],
            "status": "open",
            "riders": rider_count,
            "needed": route["min_riders"] - rider_count,
            "message": f"Joined! {route['min_riders'] - rider_count} more rider(s) needed to confirm.",
        }

    booking_id = f"ic-{str(_uuid.uuid4())[:8]}"
    doc = {
        "booking_id": booking_id,
        "booking_key": booking_key,
        "route_key": req.route_key,
        "route": route,
        "departure_date": req.departure_date,
        "departure_hour": req.departure_hour,
        "riders": [{
            "rider_id": req.rider_id,
            "joined_at": _utcnow().isoformat(),
            "vehicle_preference": req.vehicle_preference,
        }],
        "status": "open",
        "created_at": _utcnow(),
        "auto_cancel_at": _utcnow() + timedelta(hours=24),
    }
    await _db.intercity_bookings.insert_one(doc)

    return {
        "success": True,
        "booking_id": booking_id,
        "status": "open",
        "riders": 1,
        "needed": route["min_riders"] - 1,
        "route": f"{route['from']} → {route['to']}",
        "fare_per_rider_est": round(route["base_fare"] / route["min_riders"]),
        "message": f"Trip scheduled! {route['min_riders'] - 1} more rider(s) needed to confirm.",
    }


@ai_intelligence_router.get("/intercity/available")
async def get_available_intercity_trips():
    _check_flag("intercity_smart")
    if not _db:
        raise HTTPException(500, "Database not available")
    bookings = await _db.intercity_bookings.find(
        {"status": {"$in": ["open", "confirmed"]}}
    ).sort("departure_date", 1).to_list(50)
    for b in bookings:
        b.pop("_id", None)
        b["rider_count"] = len(b.get("riders", []))
        b.pop("riders", None)
    return {"success": True, "bookings": bookings, "routes": INTERCITY_ROUTES}


@ai_intelligence_router.post("/intercity/{booking_id}/join")
async def join_intercity_trip(booking_id: str, rider_id: str):
    """Join an existing intercity booking."""
    _check_flag("intercity_smart")
    if not _db:
        raise HTTPException(500, "Database not available")
    booking = await _db.intercity_bookings.find_one({"booking_id": booking_id, "status": "open"})
    if not booking:
        raise HTTPException(404, "Booking not found or already full/confirmed")

    route = booking.get("route", {})
    if len(booking.get("riders", [])) >= route.get("max_riders", 4):
        raise HTTPException(400, "Trip is full")

    already = any(r["rider_id"] == rider_id for r in booking.get("riders", []))
    if already:
        raise HTTPException(400, "Already joined")

    await _db.intercity_bookings.update_one(
        {"booking_id": booking_id},
        {"$push": {"riders": {"rider_id": rider_id, "joined_at": _utcnow().isoformat()}}}
    )

    updated = await _db.intercity_bookings.find_one({"booking_id": booking_id})
    count = len(updated.get("riders", []))
    if count >= route.get("min_riders", 3):
        await _db.intercity_bookings.update_one(
            {"booking_id": booking_id},
            {"$set": {"status": "confirmed", "confirmed_at": _utcnow()}}
        )
        return {"success": True, "status": "confirmed", "riders": count}

    return {"success": True, "status": "open", "riders": count, "needed": route.get("min_riders", 3) - count}


@ai_intelligence_router.post("/intercity/process-pending")
async def process_pending_intercity():
    """Auto-cancel expired unconfirmed bookings and notify riders."""
    _check_flag("intercity_smart")
    if not _db:
        raise HTTPException(500, "Database not available")
    now = _utcnow()
    expired = await _db.intercity_bookings.find({
        "status": "open",
        "auto_cancel_at": {"$lte": now},
    }).to_list(100)

    cancelled_ids = []
    for b in expired:
        await _db.intercity_bookings.update_one(
            {"booking_id": b["booking_id"]},
            {"$set": {"status": "cancelled", "cancelled_at": now, "cancel_reason": "insufficient_riders"}}
        )
        cancelled_ids.append(b["booking_id"])

    return {"success": True, "cancelled": len(cancelled_ids), "booking_ids": cancelled_ids}


# ═══════════════════════════════════════════════════════════════
# SECTION 12 — FAVORITE DRIVER SYSTEM
# ═══════════════════════════════════════════════════════════════

@ai_intelligence_router.post("/favorites/add")
async def add_favorite_driver(rider_id: str, driver_id: str):
    """Rider marks a driver as favorite."""
    _check_flag("favorite_driver")
    if not _db:
        raise HTTPException(500, "Database not available")

    existing = await _db.favorite_drivers.count_documents({"rider_id": rider_id})
    if existing >= 10:
        raise HTTPException(400, "Maximum 10 favorite drivers allowed")

    dup = await _db.favorite_drivers.find_one({"rider_id": rider_id, "driver_id": driver_id})
    if dup:
        raise HTTPException(400, "Driver already in favorites")

    driver = await _db.users.find_one({"id": driver_id, "role": "driver"})
    await _db.favorite_drivers.insert_one({
        "rider_id": rider_id,
        "driver_id": driver_id,
        "driver_name": (driver or {}).get("name", "Driver"),
        "driver_rating": (driver or {}).get("rating", 4.0),
        "created_at": _utcnow(),
    })

    await _db.ai_decisions_log.insert_one({
        "type": "favorite_driver_added",
        "rider_id": rider_id,
        "driver_id": driver_id,
        "timestamp": _utcnow(),
    })

    return {"success": True, "message": "Driver added to favorites"}


@ai_intelligence_router.get("/favorites/{rider_id}")
async def get_favorite_drivers(rider_id: str):
    _check_flag("favorite_driver")
    if not _db:
        raise HTTPException(500, "Database not available")
    favs = await _db.favorite_drivers.find({"rider_id": rider_id}).to_list(10)
    for f in favs:
        f.pop("_id", None)
    return {"success": True, "favorites": favs}


@ai_intelligence_router.delete("/favorites/{rider_id}/{driver_id}")
async def remove_favorite_driver(rider_id: str, driver_id: str):
    _check_flag("favorite_driver")
    if not _db:
        raise HTTPException(500, "Database not available")
    result = await _db.favorite_drivers.delete_one({"rider_id": rider_id, "driver_id": driver_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Favorite not found")
    return {"success": True, "message": "Driver removed from favorites"}


# ═══════════════════════════════════════════════════════════════
# SECTION 13 — PACKAGE DELIVERY MODE
# ═══════════════════════════════════════════════════════════════

class DeliveryRequest(BaseModel):
    sender_id: str
    pickup_address: str
    pickup_lat: float
    pickup_lng: float
    dropoff_address: str
    dropoff_lat: float
    dropoff_lng: float
    package_description: str = "Standard package"
    package_size: str = "small"  # small, medium, large
    recipient_name: str
    recipient_phone: str
    offered_fare: float = 0


@ai_intelligence_router.post("/delivery/toggle")
async def toggle_delivery_mode(driver_id: str, enabled: bool = True):
    """Driver toggles delivery mode on/off."""
    _check_flag("package_delivery")
    if not _db:
        raise HTTPException(500, "Database not available")
    await _db.users.update_one(
        {"id": driver_id, "role": "driver"},
        {"$set": {"delivery_mode": enabled, "delivery_updated_at": _utcnow()}}
    )
    return {"success": True, "delivery_mode": enabled}


@ai_intelligence_router.post("/delivery/request")
async def create_delivery_request(req: DeliveryRequest):
    """Create a package delivery request (reuses ride dispatch logic)."""
    _check_flag("package_delivery")
    if not _db:
        raise HTTPException(500, "Database not available")

    import uuid as _uuid
    delivery_id = f"del-{str(_uuid.uuid4())[:8]}"
    dist = _haversine_km(req.pickup_lat, req.pickup_lng, req.dropoff_lat, req.dropoff_lng)

    SIZE_RATES = {"small": 200, "medium": 350, "large": 500}
    base_rate = SIZE_RATES.get(req.package_size, 200)
    calculated_fare = round(base_rate + dist * 150)  # base + ₦150/km
    fare = max(req.offered_fare, calculated_fare) if req.offered_fare > 0 else calculated_fare

    doc = {
        "delivery_id": delivery_id,
        "sender_id": req.sender_id,
        "pickup_address": req.pickup_address,
        "pickup_lat": req.pickup_lat,
        "pickup_lng": req.pickup_lng,
        "dropoff_address": req.dropoff_address,
        "dropoff_lat": req.dropoff_lat,
        "dropoff_lng": req.dropoff_lng,
        "distance_km": round(dist, 2),
        "package_description": req.package_description,
        "package_size": req.package_size,
        "recipient_name": req.recipient_name,
        "recipient_phone": req.recipient_phone,
        "fare": fare,
        "status": "pending",
        "driver_id": None,
        "created_at": _utcnow(),
    }
    await _db.delivery_requests.insert_one(doc)

    return {
        "success": True,
        "delivery_id": delivery_id,
        "fare": fare,
        "distance_km": round(dist, 2),
        "status": "pending",
    }


@ai_intelligence_router.get("/delivery/active/{user_id}")
async def get_active_deliveries(user_id: str):
    _check_flag("package_delivery")
    if not _db:
        raise HTTPException(500, "Database not available")
    deliveries = await _db.delivery_requests.find({
        "$or": [{"sender_id": user_id}, {"driver_id": user_id}],
        "status": {"$in": ["pending", "accepted", "picked_up", "in_transit"]},
    }).sort("created_at", -1).to_list(20)
    for d in deliveries:
        d.pop("_id", None)
    return {"success": True, "deliveries": deliveries}


# ═══════════════════════════════════════════════════════════════
# SECTION 14 — CORPORATE ACCOUNTS
# ═══════════════════════════════════════════════════════════════

class CreateOrganization(BaseModel):
    name: str
    admin_email: str
    admin_name: str
    initial_balance: float = 0


class AddEmployee(BaseModel):
    employee_name: str
    employee_email: str
    monthly_limit: float = 50000


@ai_intelligence_router.post("/corporate/create")
async def create_organization(org: CreateOrganization):
    """Create a corporate organization account."""
    _check_flag("corporate_accounts")
    if not _db:
        raise HTTPException(500, "Database not available")

    import uuid as _uuid
    org_id = f"org-{str(_uuid.uuid4())[:8]}"

    await _db.organizations.insert_one({
        "org_id": org_id,
        "name": org.name,
        "admin_email": org.admin_email,
        "admin_name": org.admin_name,
        "status": "active",
        "created_at": _utcnow(),
    })

    await _db.organization_wallet.insert_one({
        "org_id": org_id,
        "balance": org.initial_balance,
        "total_spent": 0,
        "currency": "NGN",
        "updated_at": _utcnow(),
    })

    return {"success": True, "org_id": org_id, "name": org.name, "balance": org.initial_balance}


@ai_intelligence_router.post("/corporate/{org_id}/add-employee")
async def add_organization_employee(org_id: str, emp: AddEmployee, request: Request):
    _check_flag("corporate_accounts")
    await _require_org_admin(request, org_id)
    if not _db:
        raise HTTPException(500, "Database not available")

    org = await _db.organizations.find_one({"org_id": org_id, "status": "active"})
    if not org:
        raise HTTPException(404, "Organization not found")

    dup = await _db.organization_users.find_one({"org_id": org_id, "employee_email": emp.employee_email})
    if dup:
        raise HTTPException(400, "Employee already added")

    await _db.organization_users.insert_one({
        "org_id": org_id,
        "employee_name": emp.employee_name,
        "employee_email": emp.employee_email,
        "monthly_limit": emp.monthly_limit,
        "spent_this_month": 0,
        "status": "active",
        "added_at": _utcnow(),
    })
    return {"success": True, "message": f"{emp.employee_name} added to {org['name']}"}


@ai_intelligence_router.get("/corporate/{org_id}")
async def get_organization(org_id: str, request: Request):
    _check_flag("corporate_accounts")
    await _require_org_admin(request, org_id)
    if not _db:
        raise HTTPException(500, "Database not available")
    org = await _db.organizations.find_one({"org_id": org_id})
    if not org:
        raise HTTPException(404, "Organization not found")
    org.pop("_id", None)

    wallet = await _db.organization_wallet.find_one({"org_id": org_id})
    if wallet:
        wallet.pop("_id", None)

    employees = await _db.organization_users.find({"org_id": org_id, "status": "active"}).to_list(500)
    for e in employees:
        e.pop("_id", None)

    return {
        "success": True,
        "organization": org,
        "wallet": wallet or {"balance": 0},
        "employees": employees,
        "employee_count": len(employees),
    }


@ai_intelligence_router.post("/corporate/{org_id}/topup")
async def topup_organization_wallet(org_id: str, request: Request, amount: float = 100000):
    _check_flag("corporate_accounts")
    await _require_org_admin(request, org_id)
    if not _db:
        raise HTTPException(500, "Database not available")
    result = await _db.organization_wallet.update_one(
        {"org_id": org_id},
        {"$inc": {"balance": amount}, "$set": {"updated_at": _utcnow()}}
    )
    if result.modified_count == 0:
        raise HTTPException(404, "Organization wallet not found")
    wallet = await _db.organization_wallet.find_one({"org_id": org_id})
    return {"success": True, "new_balance": wallet.get("balance", 0)}


@ai_intelligence_router.get("/corporate/{org_id}/rides")
async def get_organization_rides(org_id: str, request: Request, month: Optional[str] = None):
    """Get ride reports for a corporate organization."""
    _check_flag("corporate_accounts")
    await _require_org_admin(request, org_id)
    if not _db:
        raise HTTPException(500, "Database not available")

    employees = await _db.organization_users.find({"org_id": org_id}).to_list(500)
    employee_emails = [e["employee_email"] for e in employees]

    users = await _db.users.find({"email": {"$in": employee_emails}}).to_list(500)
    user_ids = [u.get("id") for u in users if u.get("id")]

    query: dict = {"rider_id": {"$in": user_ids}, "status": "completed"}
    if month:
        try:
            year, mo = int(month[:4]), int(month[5:7])
            start = datetime(year, mo, 1, tzinfo=timezone.utc)
            end = datetime(year, mo + 1, 1, tzinfo=timezone.utc) if mo < 12 else datetime(year + 1, 1, 1, tzinfo=timezone.utc)
            query["created_at"] = {"$gte": start, "$lt": end}
        except (ValueError, IndexError):
            pass

    rides = await _db.trips.find(query).sort("created_at", -1).limit(500).to_list(500)
    total_spent = sum(r.get("fare", 0) or 0 for r in rides)
    for r in rides:
        r.pop("_id", None)

    return {
        "success": True,
        "org_id": org_id,
        "total_rides": len(rides),
        "total_spent": round(total_spent),
        "rides": rides[:50],
    }


# ═══════════════════════════════════════════════════════════════
# SECTION 15 — PICKUP INTELLIGENCE
# ═══════════════════════════════════════════════════════════════

ROAD_ACCESSIBILITY = {
    "highway": 1.0,
    "main_road": 0.9,
    "side_street": 0.6,
    "alley": 0.3,
    "one_way": 0.5,
}


class PickupSuggestionRequest(BaseModel):
    lat: float
    lng: float
    address: str = ""


@ai_intelligence_router.post("/pickup/suggest")
async def suggest_better_pickup(req: PickupSuggestionRequest):
    """AI suggests better pickup point based on traffic, history, and accessibility."""
    _check_flag("pickup_intelligence")
    if not _db:
        raise HTTPException(500, "Database not available")

    # Analyze historical pickup success at nearby locations
    nearby_radius = 0.003  # ~300m in degrees
    successful_pickups = await _db.trips.find({
        "status": "completed",
        "pickup_lat": {"$gte": req.lat - nearby_radius, "$lte": req.lat + nearby_radius},
        "pickup_lng": {"$gte": req.lng - nearby_radius, "$lte": req.lng + nearby_radius},
    }).to_list(100)

    # Calculate success clusters
    clusters: dict = {}
    for trip in successful_pickups:
        p_lat = round(trip.get("pickup_lat", 0), 4)
        p_lng = round(trip.get("pickup_lng", 0), 4)
        key = f"{p_lat},{p_lng}"
        if key not in clusters:
            clusters[key] = {"lat": p_lat, "lng": p_lng, "count": 0, "avg_wait_min": 0, "total_wait": 0}
        clusters[key]["count"] += 1
        wait = trip.get("pickup_wait_min", 3)
        clusters[key]["total_wait"] += wait

    for k, c in clusters.items():
        c["avg_wait_min"] = round(c["total_wait"] / max(c["count"], 1), 1)

    # Find best nearby point
    best_point = None
    best_score = 0
    for c in clusters.values():
        dist_m = _haversine_km(req.lat, req.lng, c["lat"], c["lng"]) * 1000
        if dist_m > 200:
            continue
        pickup_score = c["count"] * 0.6 + (1.0 / max(c["avg_wait_min"], 0.5)) * 0.4
        if pickup_score > best_score:
            best_score = pickup_score
            best_point = c

    suggestions = []
    if best_point:
        offset_m = _haversine_km(req.lat, req.lng, best_point["lat"], best_point["lng"]) * 1000
        if offset_m > 20:
            direction = "ahead" if best_point["lat"] > req.lat else "back"
            suggestions.append({
                "type": "better_pickup",
                "message": f"Move {int(offset_m)}m {direction} for faster pickup.",
                "suggested_lat": best_point["lat"],
                "suggested_lng": best_point["lng"],
                "reason": f"{best_point['count']} successful pickups nearby, avg wait {best_point['avg_wait_min']} min",
                "improvement_pct": min(40, int(best_score * 10)),
            })

    # Time-based suggestion
    now = _utcnow()
    if 7 <= now.hour <= 9 or 16 <= now.hour <= 19:
        suggestions.append({
            "type": "traffic_advisory",
            "message": "Rush hour — consider a pickup point on a main road for faster driver access.",
            "reason": "Peak traffic hours",
        })

    # Log decision
    await _db.pickup_suggestions_log.insert_one({
        "lat": req.lat,
        "lng": req.lng,
        "address": req.address,
        "suggestions_count": len(suggestions),
        "best_score": best_score,
        "timestamp": _utcnow(),
    })

    return {
        "success": True,
        "original": {"lat": req.lat, "lng": req.lng, "address": req.address},
        "suggestions": suggestions,
        "nearby_pickup_data": {
            "successful_pickups_nearby": len(successful_pickups),
            "clusters": len(clusters),
        },
    }


# ═══════════════════════════════════════════════════════════════
# HEALTH & OVERVIEW
# ═══════════════════════════════════════════════════════════════

@ai_intelligence_router.get("/overview")
async def ai_intelligence_overview():
    """Overview of all AI Intelligence system capabilities."""
    return {
        "system": "NexRyde AI Intelligence & Smart Mobility",
        "version": "1.0",
        "sections": {
            "1_trip_assistant": {
                "status": "active",
                "endpoints": [
                    "POST /api/ai-intelligence/trip-assistant/evaluate",
                    "GET /api/ai-intelligence/trip-assistant/{trip_id}/notifications",
                ],
            },
            "2_smart_matching": {
                "status": "active",
                "endpoints": [
                    "POST /api/ai-intelligence/matching/find-best-driver",
                    "POST /api/ai-intelligence/matching/preferences",
                    "GET /api/ai-intelligence/matching/preferences/{rider_id}",
                ],
            },
            "3_predictive_demand": {
                "status": "active",
                "endpoints": [
                    "GET /api/ai-intelligence/demand/predict",
                ],
            },
            "4_smart_safety": {
                "status": "active",
                "endpoints": [
                    "POST /api/ai-intelligence/safety/monitor/check",
                    "POST /api/ai-intelligence/safety/monitor/respond",
                    "GET /api/ai-intelligence/safety/monitor/pending/{trip_id}",
                ],
            },
            "5_trusted_circle": {
                "status": "active",
                "endpoints": [
                    "POST /api/ai-intelligence/trusted-circle/add",
                    "GET /api/ai-intelligence/trusted-circle/{rider_id}",
                    "DELETE /api/ai-intelligence/trusted-circle/{rider_id}/{phone}",
                    "POST /api/ai-intelligence/trusted-circle/auto-share/{trip_id}",
                ],
            },
            "6_women_preference": {
                "status": "active",
                "endpoints": [
                    "POST /api/ai-intelligence/women-preference/save",
                    "GET /api/ai-intelligence/women-preference/{rider_id}",
                ],
            },
            "7_earnings_prediction": {
                "status": "active",
                "endpoints": [
                    "GET /api/ai-intelligence/earnings/predict/{driver_id}",
                ],
            },
            "8_driver_levels": {
                "status": "active",
                "endpoints": [
                    "GET /api/ai-intelligence/driver-level/{driver_id}",
                    "POST /api/ai-intelligence/driver-level/refresh-all",
                ],
            },
            "9_earning_windows": {
                "status": "active",
                "endpoints": [
                    "POST /api/ai-intelligence/earning-windows/create",
                    "GET /api/ai-intelligence/earning-windows/active",
                    "GET /api/ai-intelligence/earning-windows/check-priority/{driver_id}",
                    "DELETE /api/ai-intelligence/earning-windows/{window_id}",
                ],
            },
            "10_intercity_smart_booking": {
                "status": "active",
                "endpoints": [
                    "POST /api/ai-intelligence/intercity/schedule",
                    "GET /api/ai-intelligence/intercity/available",
                    "POST /api/ai-intelligence/intercity/{booking_id}/join",
                    "POST /api/ai-intelligence/intercity/process-pending",
                ],
            },
            "12_favorite_driver": {
                "status": "active",
                "endpoints": [
                    "POST /api/ai-intelligence/favorites/add",
                    "GET /api/ai-intelligence/favorites/{rider_id}",
                    "DELETE /api/ai-intelligence/favorites/{rider_id}/{driver_id}",
                ],
            },
            "13_package_delivery": {
                "status": "active",
                "endpoints": [
                    "POST /api/ai-intelligence/delivery/toggle",
                    "POST /api/ai-intelligence/delivery/request",
                    "GET /api/ai-intelligence/delivery/active/{user_id}",
                ],
            },
            "14_corporate_accounts": {
                "status": "active",
                "endpoints": [
                    "POST /api/ai-intelligence/corporate/create",
                    "POST /api/ai-intelligence/corporate/{org_id}/add-employee",
                    "GET /api/ai-intelligence/corporate/{org_id}",
                    "POST /api/ai-intelligence/corporate/{org_id}/topup",
                    "GET /api/ai-intelligence/corporate/{org_id}/rides",
                ],
            },
            "15_pickup_intelligence": {
                "status": "active",
                "endpoints": [
                    "POST /api/ai-intelligence/pickup/suggest",
                ],
            },
        },
        "feature_flags": _FEATURE_FLAGS,
        "collections": [
            "trip_assistant_events",
            "rider_preferences",
            "safety_checks",
            "trusted_contacts",
            "trip_shares",
            "driver_levels",
            "earning_windows",
            "intercity_bookings",
            "favorite_drivers",
            "delivery_requests",
            "organizations",
            "organization_users",
            "organization_wallet",
            "pickup_suggestions_log",
        ],
    }

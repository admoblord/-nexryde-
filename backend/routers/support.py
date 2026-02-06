"""Support Router - SOS/Safety, Family, Trip Sharing, Messaging, Lost & Found, Rider Prefs, Audio, Insurance, Fraud, Matching, Multi-Language."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, timezone, timedelta
import logging
import os
import uuid
import math

import httpx

from database import db

logger = logging.getLogger('server')
support_router = APIRouter(prefix="/api", tags=["Support"])

TERMII_API_KEY = os.environ.get('TERMII_API_KEY', '')
TERMII_BASE_URL = os.environ.get('TERMII_BASE_URL', 'https://v3.api.termii.com')
TERMII_FROM_ID = os.environ.get('TERMII_FROM_ID', 'OE Alert')

SUPPORTED_LANGUAGES = [
    {"code": "en", "name": "English", "flag": "🇬🇧"},
    {"code": "pcm", "name": "Pidgin", "flag": "🇳🇬"},
    {"code": "yo", "name": "Yoruba", "flag": "🇳🇬"},
    {"code": "ig", "name": "Igbo", "flag": "🇳🇬"},
    {"code": "ha", "name": "Hausa", "flag": "🇳🇬"},
]

TRANSLATIONS = {
    "en": {"welcome": "Welcome to NEXRYDE", "book_ride": "Book a Ride", "where_to": "Where to?"},
    "pcm": {"welcome": "Welcome to NEXRYDE", "book_ride": "Book Ride", "where_to": "Where you dey go?"},
    "yo": {"welcome": "Ẹ káàbọ̀ sí NEXRYDE", "book_ride": "Bẹ̀rẹ̀ Ìrìn-àjò", "where_to": "Níbo ni o ń lọ?"},
    "ig": {"welcome": "Nnọọ na NEXRYDE", "book_ride": "Nweta Ụgbọ ala", "where_to": "Ebee ka ị na-aga?"},
    "ha": {"welcome": "Barka da zuwa NEXRYDE", "book_ride": "Nemi Mota", "where_to": "Ina za ka?"},
}

# ==================== MODELS ====================

class SOSRequest(BaseModel):
    trip_id: str
    location_lat: float
    location_lng: float
    auto_triggered: bool = False

class SafetyResponseRequest(BaseModel):
    check_id: str
    response: str

class RiskAlertRequest(BaseModel):
    trip_id: str
    reason: Optional[str] = None

class SOSAlert(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    trip_id: str
    user_id: str
    user_role: str = "rider"
    location: dict = {}
    auto_triggered: bool = False
    status: str = "active"
    emergency_contacts_notified: list = []
    admin_notified: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class RiderPreferencesUpdate(BaseModel):
    preferred_vehicle: Optional[str] = None
    preferred_music: Optional[str] = None
    temperature: Optional[str] = None
    conversation: Optional[str] = None
    special_needs: Optional[str] = None

class SavedRouteRequest(BaseModel):
    name: str
    pickup_lat: float
    pickup_lng: float
    pickup_address: str
    dropoff_lat: float
    dropoff_lng: float
    dropoff_address: str

class SendMessageRequest(BaseModel):
    trip_id: str
    content: str
    message_type: str = "text"

class ReportLostItemRequest(BaseModel):
    trip_id: str
    description: str

class LostItemResponseRequest(BaseModel):
    response: str
    found: bool = False

class TripTrackingUpdate(BaseModel):
    speed_kmh: float
    latitude: float
    longitude: float
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# ==================== SOS & SAFETY ====================

@support_router.post("/sos/trigger")
async def trigger_sos(request: SOSRequest):
    trip = await db.trips.find_one({"id": request.trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    user_id = trip["rider_id"]
    user = await db.users.find_one({"id": user_id})
    emergency_contacts = user.get("emergency_contacts", []) if user else []
    user_name = user.get("name", "A user") if user else "A user"
    sos = SOSAlert(trip_id=request.trip_id, user_id=user_id, user_role="rider", location={"lat": request.location_lat, "lng": request.location_lng}, auto_triggered=request.auto_triggered, emergency_contacts_notified=[c["phone"] for c in emergency_contacts])
    await db.sos_alerts.insert_one(sos.dict())
    await db.trips.update_one({"id": request.trip_id}, {"$set": {"sos_triggered": True, "sos_triggered_at": datetime.now(timezone.utc)}})
    contacts_notified = 0
    if TERMII_API_KEY and emergency_contacts:
        location_link = f"https://maps.google.com/?q={request.location_lat},{request.location_lng}"
        async with httpx.AsyncClient() as http_client:
            for contact in emergency_contacts:
                try:
                    phone = contact["phone"].lstrip('+')
                    sms_text = f"EMERGENCY! {user_name} triggered SOS on NexRyde! Location: {location_link} Trip: {request.trip_id}"
                    payload = {"api_key": TERMII_API_KEY, "to": phone, "from": TERMII_FROM_ID or "NexRyde", "channel": "dnd", "type": "plain", "sms": sms_text}
                    resp = await http_client.post(f"{TERMII_BASE_URL}/api/sms/send", json=payload, timeout=10.0)
                    if resp.status_code == 200:
                        contacts_notified += 1
                except Exception as e:
                    logger.error(f"SOS SMS error: {e}")
    return {"success": True, "message": "SOS alert activated!", "sos_id": sos.id, "contacts_notified": contacts_notified, "total_contacts": len(emergency_contacts), "support_notified": True}

@support_router.post("/sos/{sos_id}/resolve")
async def resolve_sos(sos_id: str, resolution: str = "resolved"):
    await db.sos_alerts.update_one({"id": sos_id}, {"$set": {"status": resolution, "resolved_at": datetime.now(timezone.utc)}})
    return {"message": "SOS resolved"}

@support_router.get("/sos/trip/{trip_id}")
async def get_trip_sos(trip_id: str):
    alerts = await db.sos_alerts.find({"trip_id": trip_id}).to_list(10)
    for alert in alerts:
        alert["_id"] = str(alert["_id"])
    return {"alerts": alerts}

@support_router.post("/safety/respond")
async def respond_to_safety_check(request: SafetyResponseRequest):
    await db.safety_checks.update_one({"id": request.check_id}, {"$set": {"rider_response": request.response, "responded_at": datetime.now(timezone.utc)}})
    if request.response == "need_help":
        check = await db.safety_checks.find_one({"id": request.check_id})
        if check:
            sos = SOSAlert(trip_id=check["trip_id"], user_id="", user_role="rider", location=check["location"], auto_triggered=True)
            await db.sos_alerts.insert_one(sos.dict())
    return {"message": "Response recorded"}

@support_router.post("/trips/{trip_id}/risk-alert")
async def trigger_risk_alert(trip_id: str, user_id: str, request: RiskAlertRequest):
    trip = await db.trips.find_one({"id": trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    is_driver = user_id == trip.get("driver_id")
    await db.trips.update_one({"id": trip_id}, {"$set": {"risk_alert_by_driver" if is_driver else "risk_alert_by_rider": True, "is_monitored": True}})
    return {"message": "Risk alert recorded"}

# ==================== MULTI-LANGUAGE ====================

@support_router.get("/languages")
async def get_languages():
    return {"languages": SUPPORTED_LANGUAGES, "default": "en"}

@support_router.get("/translations/{lang}")
async def get_translations(lang: str):
    return {"language": lang, "translations": TRANSLATIONS.get(lang, TRANSLATIONS["en"])}

# ==================== KODA FAMILY ====================

@support_router.post("/family/create")
async def create_family(owner_id: str, family_name: str):
    user = await db.users.find_one({"id": owner_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.get("family_id"):
        raise HTTPException(status_code=400, detail="User already belongs to a family")
    family_id = str(uuid.uuid4())
    family = {"id": family_id, "name": family_name, "owner_id": owner_id, "members": [{"user_id": owner_id, "role": "owner", "joined_at": datetime.now(timezone.utc)}], "shared_payment_method": None, "created_at": datetime.now(timezone.utc), "trust_score": user.get("trust_score", 100.0), "max_members": 10}
    await db.families.insert_one(family)
    await db.users.update_one({"id": owner_id}, {"$set": {"family_id": family_id, "family_role": "owner"}})
    return {"message": "Family created successfully", "family_id": family_id, "family_name": family_name}

@support_router.post("/family/{family_id}/add-member")
async def add_family_member(family_id: str, phone: str, name: str, relationship: str):
    family = await db.families.find_one({"id": family_id})
    if not family:
        raise HTTPException(status_code=404, detail="Family not found")
    if len(family["members"]) >= 10:
        raise HTTPException(status_code=400, detail="Family has reached maximum 10 members")
    member_user = await db.users.find_one({"phone": phone})
    member_id = member_user["id"] if member_user else f"pending-{phone}"
    if member_user and member_user.get("family_id"):
        raise HTTPException(status_code=400, detail="User already belongs to a family")
    new_member = {"user_id": member_id, "phone": phone, "name": name, "relationship": relationship, "role": "member", "joined_at": datetime.now(timezone.utc), "is_pending": member_user is None}
    await db.families.update_one({"id": family_id}, {"$push": {"members": new_member}})
    if member_user:
        inherited_trust = min(family.get("trust_score", 100.0), member_user.get("trust_score", 100.0))
        await db.users.update_one({"id": member_id}, {"$set": {"family_id": family_id, "family_role": "member", "trust_score": inherited_trust}})
    return {"message": f"{name} added to family", "is_pending": member_user is None}

@support_router.get("/family/{family_id}")
async def get_family(family_id: str):
    family = await db.families.find_one({"id": family_id})
    if not family:
        raise HTTPException(status_code=404, detail="Family not found")
    family["_id"] = str(family["_id"])
    for member in family["members"]:
        if not member.get("is_pending"):
            user = await db.users.find_one({"id": member["user_id"]})
            if user:
                member["rating"] = user.get("rating", 5.0)
                member["total_trips"] = user.get("total_trips", 0)
    return family

@support_router.delete("/family/{family_id}/member/{member_phone}")
async def remove_family_member(family_id: str, member_phone: str):
    family = await db.families.find_one({"id": family_id})
    if not family:
        raise HTTPException(status_code=404, detail="Family not found")
    member_to_remove = next((m for m in family["members"] if m.get("phone") == member_phone), None)
    if not member_to_remove:
        raise HTTPException(status_code=404, detail="Member not found")
    if member_to_remove.get("role") == "owner":
        raise HTTPException(status_code=400, detail="Cannot remove family owner")
    await db.families.update_one({"id": family_id}, {"$pull": {"members": {"phone": member_phone}}})
    if not member_to_remove.get("is_pending"):
        await db.users.update_one({"id": member_to_remove["user_id"]}, {"$unset": {"family_id": "", "family_role": ""}})
    return {"message": "Member removed from family"}

@support_router.post("/family/{family_id}/book-for-member")
async def book_for_family_member(family_id: str, booker_id: str, member_phone: str, pickup_lat: float, pickup_lng: float, pickup_address: str, dropoff_lat: float, dropoff_lng: float, dropoff_address: str):
    family = await db.families.find_one({"id": family_id})
    if not family:
        raise HTTPException(status_code=404, detail="Family not found")
    if not any(m["user_id"] == booker_id for m in family["members"]):
        raise HTTPException(status_code=403, detail="Not authorized to book for this family")
    member = next((m for m in family["members"] if m.get("phone") == member_phone), None)
    if not member:
        raise HTTPException(status_code=404, detail="Member not found in family")
    trip_id = str(uuid.uuid4())
    trip = {"id": trip_id, "rider_id": member.get("user_id", f"family-{member_phone}"), "rider_phone": member_phone, "rider_name": member.get("name"), "booked_by": booker_id, "family_id": family_id, "is_family_booking": True, "pickup_location": {"lat": pickup_lat, "lng": pickup_lng, "address": pickup_address}, "dropoff_location": {"lat": dropoff_lat, "lng": dropoff_lng, "address": dropoff_address}, "status": "pending", "created_at": datetime.now(timezone.utc), "fare": 0}
    await db.trips.insert_one(trip)
    for m in family["members"]:
        if m["user_id"] != booker_id:
            await db.notifications.insert_one({"user_id": m["user_id"], "type": "family_trip_booked", "title": "Family Trip Alert", "message": f"{member.get('name')} has a ride booked", "data": {"trip_id": trip_id}, "created_at": datetime.now(timezone.utc), "read": False})
    return {"message": "Trip booked for family member", "trip_id": trip_id}

@support_router.post("/family/{family_id}/safety-alert")
async def trigger_family_safety_alert(family_id: str, member_id: str, location_lat: float, location_lng: float):
    family = await db.families.find_one({"id": family_id})
    if not family:
        raise HTTPException(status_code=404, detail="Family not found")
    member_name = next((m.get("name", "Family member") for m in family["members"] if m["user_id"] == member_id), "Family member")
    for m in family["members"]:
        if m["user_id"] != member_id:
            await db.notifications.insert_one({"user_id": m["user_id"], "type": "safety_circle_alert", "title": "SAFETY ALERT", "message": f"{member_name} needs help!", "data": {"member_id": member_id, "location": {"lat": location_lat, "lng": location_lng}}, "created_at": datetime.now(timezone.utc), "read": False, "urgent": True})
    return {"message": "Safety alert sent to all family members", "notified_count": len(family["members"]) - 1}

# ==================== TRIP SHARING ====================

@support_router.post("/trips/{trip_id}/share")
async def share_trip(trip_id: str, recipient_phone: str, recipient_name: str = ""):
    trip = await db.trips.find_one({"id": trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    share_token = str(uuid.uuid4())[:8].upper()
    await db.trip_shares.insert_one({"trip_id": trip_id, "token": share_token, "recipient_phone": recipient_phone, "recipient_name": recipient_name, "shared_at": datetime.now(timezone.utc), "expires_at": datetime.now(timezone.utc) + timedelta(hours=24)})
    return {"message": f"Trip shared with {recipient_name or recipient_phone}", "share_token": share_token, "tracking_link": f"https://koda.app/track/{share_token}"}

@support_router.get("/trips/track/{share_token}")
async def track_shared_trip(share_token: str):
    share = await db.trip_shares.find_one({"token": share_token})
    if not share:
        raise HTTPException(status_code=404, detail="Invalid tracking link")
    if datetime.utcnow() > share["expires_at"]:
        raise HTTPException(status_code=400, detail="Tracking link has expired")
    trip = await db.trips.find_one({"id": share["trip_id"]})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    driver_location = None
    if trip.get("driver_id"):
        profile = await db.driver_profiles.find_one({"user_id": trip["driver_id"]})
        driver_location = profile.get("current_location") if profile else None
    return {"trip_id": trip["id"], "status": trip["status"], "pickup": trip["pickup_location"], "dropoff": trip["dropoff_location"], "driver_location": driver_location, "fare": trip["fare"], "sos_triggered": trip.get("sos_triggered", False)}

# ==================== FRAUD DETECTION ====================

@support_router.get("/admin/fraud-alerts")
async def get_fraud_alerts():
    alerts = []
    high_cancel_pipeline = [{"$match": {"status": "cancelled"}}, {"$group": {"_id": "$cancelled_by", "count": {"$sum": 1}}}, {"$match": {"count": {"$gt": 5}}}, {"$sort": {"count": -1}}]
    for item in await db.trips.aggregate(high_cancel_pipeline).to_list(10):
        if item["_id"]:
            alerts.append({"type": "high_cancellation", "user_id": item["_id"], "count": item["count"], "severity": "medium"})
    sos_pipeline = [{"$group": {"_id": "$user_id", "count": {"$sum": 1}}}, {"$match": {"count": {"$gt": 3}}}, {"$sort": {"count": -1}}]
    for item in await db.sos_alerts.aggregate(sos_pipeline).to_list(10):
        if item["_id"]:
            alerts.append({"type": "sos_abuse", "user_id": item["_id"], "count": item["count"], "severity": "high"})
    for user in await db.users.find({"behavior_score": {"$lt": 50}}).to_list(10):
        alerts.append({"type": "low_behavior_score", "user_id": user["id"], "score": user.get("behavior_score", 0), "severity": "medium"})
    return {"fraud_alerts": alerts, "total": len(alerts)}

@support_router.post("/admin/update-behavior-score")
async def update_behavior_score(user_id: str, event_type: str):
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    changes = {"completed_trip": 0.5, "five_star_rating": 1.0, "low_rating": -2.0, "cancellation": -3.0, "sos_triggered": -5.0, "false_sos": -10.0, "risk_alert": -2.0, "on_time_pickup": 0.5, "late_pickup": -1.0}
    change = changes.get(event_type, 0)
    current_score = user.get("behavior_score", 100.0)
    new_score = max(0, min(100, current_score + change))
    await db.users.update_one({"id": user_id}, {"$set": {"behavior_score": new_score}})
    return {"previous_score": current_score, "new_score": new_score, "change": change}

# ==================== AUDIO RECORDING ====================

@support_router.post("/trips/{trip_id}/start-recording")
async def start_trip_recording(trip_id: str):
    await db.trips.update_one({"id": trip_id}, {"$set": {"recording_enabled": True, "recording_started_at": datetime.now(timezone.utc)}})
    return {"message": "Recording started", "trip_id": trip_id}

@support_router.post("/trips/{trip_id}/stop-recording")
async def stop_trip_recording(trip_id: str):
    await db.trips.update_one({"id": trip_id}, {"$set": {"recording_enabled": False, "recording_stopped_at": datetime.now(timezone.utc)}})
    return {"message": "Recording stopped", "trip_id": trip_id}

# ==================== INSURANCE ====================

@support_router.get("/trips/{trip_id}/insurance")
async def get_trip_insurance(trip_id: str):
    trip = await db.trips.find_one({"id": trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    return {"trip_id": trip_id, "is_insured": True, "coverage": {"personal_accident": "₦500,000", "medical_expenses": "₦100,000", "property_damage": "₦50,000"}, "provider": "KODA Insurance Partners"}

@support_router.post("/trips/{trip_id}/track")
async def update_trip_tracking(trip_id: str, update: TripTrackingUpdate):
    tracking = await db.trip_tracking.find_one({"trip_id": trip_id})
    speed_log = {"timestamp": update.timestamp.isoformat(), "speed_kmh": update.speed_kmh, "location": {"lat": update.latitude, "lng": update.longitude}}
    if not tracking:
        tracking = {"id": str(uuid.uuid4()), "trip_id": trip_id, "speed_logs": [speed_log], "traffic_delays": [], "created_at": datetime.now(timezone.utc)}
        await db.trip_tracking.insert_one(tracking)
    else:
        speed_logs = tracking.get("speed_logs", [])
        if len(speed_logs) >= 5:
            avg_speed = sum(log["speed_kmh"] for log in speed_logs[-5:]) / 5
            if avg_speed < 10 and update.speed_kmh < 10:
                traffic_delays = tracking.get("traffic_delays", [])
                if not traffic_delays or traffic_delays[-1].get("end"):
                    traffic_delays.append({"start": datetime.now(timezone.utc).isoformat(), "location": {"lat": update.latitude, "lng": update.longitude}})
                    await db.trip_tracking.update_one({"trip_id": trip_id}, {"$set": {"traffic_delays": traffic_delays}})
        await db.trip_tracking.update_one({"trip_id": trip_id}, {"$push": {"speed_logs": speed_log}})
    return {"message": "Tracking updated", "trip_id": trip_id}

# ==================== RIDER PREFERENCES ====================

@support_router.get("/rider/preferences/{user_id}")
async def get_rider_preferences(user_id: str):
    prefs = await db.rider_preferences.find_one({"user_id": user_id}, {"_id": 0})
    if not prefs:
        prefs = {"user_id": user_id, "preferred_vehicle": "economy", "preferred_music": "any", "temperature": "normal", "conversation": "moderate", "special_needs": None, "saved_routes": []}
    return prefs

@support_router.put("/rider/preferences/{user_id}")
async def update_rider_preferences(user_id: str, request: RiderPreferencesUpdate):
    update_data = {k: v for k, v in request.dict().items() if v is not None}
    if update_data:
        await db.rider_preferences.update_one({"user_id": user_id}, {"$set": update_data}, upsert=True)
    prefs = await db.rider_preferences.find_one({"user_id": user_id}, {"_id": 0})
    return prefs or {"user_id": user_id}

@support_router.post("/rider/preferences/{user_id}/routes")
async def save_route(user_id: str, route: SavedRouteRequest):
    route_data = {"id": str(uuid.uuid4()), "name": route.name, "pickup": {"lat": route.pickup_lat, "lng": route.pickup_lng, "address": route.pickup_address}, "dropoff": {"lat": route.dropoff_lat, "lng": route.dropoff_lng, "address": route.dropoff_address}, "use_count": 0, "created_at": datetime.now(timezone.utc).isoformat()}
    await db.rider_preferences.update_one({"user_id": user_id}, {"$push": {"saved_routes": route_data}}, upsert=True)
    return {"message": "Route saved", "route": route_data}

@support_router.delete("/rider/preferences/{user_id}/routes/{route_id}")
async def delete_saved_route(user_id: str, route_id: str):
    await db.rider_preferences.update_one({"user_id": user_id}, {"$pull": {"saved_routes": {"id": route_id}}})
    return {"message": "Route deleted"}

# ==================== IN-APP MESSAGING ====================

@support_router.post("/messages/send")
async def send_message(request: SendMessageRequest, sender_id: str, sender_role: str):
    trip = await db.trips.find_one({"id": request.trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    preset_messages = {"arriving_soon": "I'm arriving soon, please be ready", "at_location": "I'm at the pickup location", "running_late": "I'm running a few minutes late", "waiting": "I'm waiting for you", "call_me": "Please call me"}
    content = preset_messages.get(request.content, request.content) if request.message_type == "preset" else request.content
    message = {"id": str(uuid.uuid4()), "trip_id": request.trip_id, "sender_id": sender_id, "sender_role": sender_role, "message_type": request.message_type, "content": content, "read": False, "created_at": datetime.now(timezone.utc)}
    await db.messages.insert_one(message)
    return {"message": "Message sent", "data": message}

@support_router.get("/messages/{trip_id}")
async def get_trip_inapp_messages(trip_id: str):
    messages = await db.messages.find({"trip_id": trip_id}).sort("created_at", 1).to_list(100)
    for m in messages:
        m["_id"] = str(m["_id"])
    return {"trip_id": trip_id, "messages": messages, "preset_options": [{"key": "arriving_soon", "text": "I'm arriving soon"}, {"key": "at_location", "text": "I'm at the pickup location"}, {"key": "running_late", "text": "I'm running late"}, {"key": "call_me", "text": "Please call me"}]}

@support_router.put("/messages/{message_id}/read")
async def mark_message_read(message_id: str):
    await db.messages.update_one({"id": message_id}, {"$set": {"read": True}})
    return {"message": "Message marked as read"}

# ==================== LOST & FOUND ====================

@support_router.post("/lost-found/report")
async def report_lost_item(request: ReportLostItemRequest, reporter_id: str, reporter_role: str):
    trip = await db.trips.find_one({"id": request.trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    item = {"id": str(uuid.uuid4()), "trip_id": request.trip_id, "reporter_id": reporter_id, "reporter_role": reporter_role, "description": request.description, "status": "reported", "other_party_id": trip.get("driver_id") if reporter_role == "rider" else trip.get("rider_id"), "created_at": datetime.now(timezone.utc)}
    await db.lost_items.insert_one(item)
    return {"message": "Lost item reported", "item_id": item["id"]}

@support_router.get("/lost-found/user/{user_id}")
async def get_user_lost_items(user_id: str):
    items = await db.lost_items.find({"$or": [{"reporter_id": user_id}, {"other_party_id": user_id}]}, {"_id": 0}).to_list(50)
    return {"items": items}

@support_router.put("/lost-found/{item_id}/respond")
async def respond_to_lost_item(item_id: str, request: LostItemResponseRequest):
    update = {"response": request.response, "responded_at": datetime.now(timezone.utc)}
    if request.found:
        update["status"] = "found"
    await db.lost_items.update_one({"id": item_id}, {"$set": update})
    return {"message": "Response recorded", "found": request.found}

# ==================== SMART MATCHING ====================

@support_router.post("/matching/find-driver")
async def find_best_matched_driver(rider_id: str, pickup_lat: float, pickup_lng: float, service_type: str = "economy"):
    rider_prefs = await db.rider_preferences.find_one({"user_id": rider_id})
    rider = await db.users.find_one({"id": rider_id})
    available_drivers = await db.driver_profiles.find({"is_online": True, "verification_status": "approved"}).to_list(50)
    scored_drivers = []
    for driver in available_drivers:
        subscription = await db.subscriptions.find_one({"driver_id": driver.get("user_id"), "status": {"$in": ["active", "grace_period"]}})
        if not subscription:
            continue
        score = 50.0
        if driver.get("current_location"):
            dlat = driver["current_location"].get("lat", 0)
            dlng = driver["current_location"].get("lng", 0)
            R = 6371
            d_lat = math.radians(dlat - pickup_lat)
            d_lng = math.radians(dlng - pickup_lng)
            a = math.sin(d_lat/2)**2 + math.cos(math.radians(pickup_lat)) * math.cos(math.radians(dlat)) * math.sin(d_lng/2)**2
            c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
            distance = R * c
            score += max(0, 30 - distance * 10)
        user_data = await db.users.find_one({"id": driver.get("user_id")})
        rating = user_data.get("rating", 4.5) if user_data else 4.5
        score += rating * 4
        if rider and rider.get("blocked_drivers") and driver.get("user_id") in rider["blocked_drivers"]:
            continue
        if rider and rider.get("favorite_drivers") and driver.get("user_id") in rider["favorite_drivers"]:
            score += 15
        scored_drivers.append({"driver_id": driver.get("user_id"), "name": driver.get("name", "Driver"), "rating": rating, "vehicle_type": driver.get("vehicle_type", "economy"), "score": round(score, 1), "distance_km": round(distance, 2) if driver.get("current_location") else None, "eta_minutes": round(distance * 2.5) if driver.get("current_location") else None})
    scored_drivers.sort(key=lambda d: d["score"], reverse=True)
    return {"matched_drivers": scored_drivers[:5], "total_available": len(scored_drivers)}

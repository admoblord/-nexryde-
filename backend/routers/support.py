"""Support Router - SOS/Safety, Family, Trip Sharing, Messaging, Lost & Found, Rider Prefs, Audio, Insurance, Fraud, Matching, Multi-Language."""
from fastapi import APIRouter, HTTPException, Request, UploadFile, File, Form
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, timezone, timedelta
import logging
import os
import uuid
import math
import base64
import hashlib
from openai import OpenAI

import httpx
from cryptography.fernet import Fernet

from database import db
from shield_network import broadcast_sos_to_nearby_nexryde_drivers
from auth_guard import require_authenticated, verify_owner_strict, verify_trip_participant
from admin_guard import require_admin_request

logger = logging.getLogger('server')
support_router = APIRouter(prefix="/api", tags=["Support"])

TERMII_API_KEY = os.environ.get('TERMII_API_KEY', '')
TERMII_BASE_URL = os.environ.get('TERMII_BASE_URL', 'https://v3.api.termii.com')
TERMII_FROM_ID = os.environ.get('TERMII_FROM_ID', 'NEXRYDE')
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
POLICE_ALERT_NUMBERS = [n.strip() for n in (os.environ.get("NEXRYDE_POLICE_ALERT_NUMBERS", "")).split(",") if n.strip()]
MAX_TRIP_VIDEO_BYTES = 25 * 1024 * 1024  # 25MB guard for in-DB payload storage

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


class PoliceConnectRequest(BaseModel):
    trip_id: str
    location_lat: float
    location_lng: float

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
    police_station_map_url: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class RiderPreferencesUpdate(BaseModel):
    preferred_vehicle: Optional[str] = None
    preferred_music: Optional[str] = None
    temperature: Optional[str] = None
    conversation: Optional[str] = None
    special_needs: Optional[str] = None
    estate_gate_code: Optional[str] = Field(default=None, max_length=64)
    estate_name: Optional[str] = Field(default=None, max_length=120)

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


class TripIssueReportRequest(BaseModel):
    trip_id: str
    user_id: str
    role: str = "rider"
    category: str = "general"  # safety | fare | behavior | route | payment | general
    description: str


class DriverWitnessReportRequest(BaseModel):
    trip_id: str
    incident_type: str  # crime | accident | medical | fire | violence | other
    description: str = Field(..., min_length=12, max_length=2000)
    location_lat: Optional[float] = None
    location_lng: Optional[float] = None
    occurred_at: Optional[str] = None
    anonymous: bool = True
    evidence_notes: Optional[str] = Field(default=None, max_length=600)


class SupportBotRequest(BaseModel):
    message: str
    user_id: Optional[str] = None
    trip_id: Optional[str] = None
    language: str = "auto"  # auto | en | pcm


class RadioStation(BaseModel):
    id: str
    name: str
    description: str
    icon: str = "radio"
    stream_url: str
    frequency: str = "Live"
    is_active: bool = True
    sort_order: int = 0


def _prefs_fernet() -> Fernet:
    raw = (os.environ.get("RIDER_PREFS_FERNET_KEY") or os.environ.get("JWT_SECRET") or "nexryde-rider-prefs-dev").encode()
    key = base64.urlsafe_b64encode(hashlib.sha256(raw).digest())
    return Fernet(key)


def _encrypt_pref_secret(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    clean = value.strip()
    if not clean:
        return None
    return _prefs_fernet().encrypt(clean.encode()).decode()


def _decrypt_pref_secret(value: Optional[str]) -> Optional[str]:
    if not value:
        return None


def _normalize_phone(raw: str) -> str:
    value = (raw or "").strip().replace(" ", "")
    digits = "".join(ch for ch in value if ch.isdigit())
    if not digits:
        return ""
    if value.startswith("+"):
        return f"+{digits}"
    if digits.startswith("0"):
        return f"+234{digits[1:]}"
    if digits.startswith("234"):
        return f"+{digits}"
    return f"+234{digits}"
    try:
        return _prefs_fernet().decrypt(value.encode()).decode()
    except Exception:
        return None


async def _log_trip_event_safe(trip_id: str, event_type: str, actor_id: str, data: Optional[dict] = None) -> None:
    """Best-effort event logger from support router without failing caller."""
    try:
        created_at = datetime.now(timezone.utc).isoformat()
        event_payload = {
            "trip_id": trip_id,
            "event_type": event_type,
            "actor_id": actor_id,
            "data": data or {},
            "created_at": created_at,
        }
        event_hash = hashlib.sha256(str(event_payload).encode()).hexdigest()
        await db.trip_events.insert_one(
            {
                "id": str(uuid.uuid4()),
                "trip_id": trip_id,
                "event_type": event_type,
                "actor_id": actor_id,
                "data": data or {},
                "created_at": created_at,
                "event_hash": event_hash,
            }
        )
    except Exception as e:
        logger.warning("support trip event log failed: %s", e)

# ==================== SOS & SAFETY ====================

@support_router.post("/sos/trigger")
async def trigger_sos(request: SOSRequest, http_request: Request):
    actor_id = require_authenticated(http_request)
    trip = await db.trips.find_one({"id": request.trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    if actor_id not in {trip.get("rider_id"), trip.get("driver_id")}:
        raise HTTPException(status_code=403, detail="Not authorized for this trip")
    user_id = actor_id
    user = await db.users.find_one({"id": user_id})
    emergency_contacts = user.get("emergency_contacts", []) if user else []
    user_name = user.get("name", "A user") if user else "A user"
    user_role = "driver" if actor_id == trip.get("driver_id") else "rider"
    police_station_map_url = (
        f"https://www.google.com/maps/search/?api=1&query=police+station&query_place_id=&center="
        f"{request.location_lat},{request.location_lng}"
    )
    sos = SOSAlert(
        trip_id=request.trip_id,
        user_id=user_id,
        user_role=user_role,
        location={"lat": request.location_lat, "lng": request.location_lng},
        auto_triggered=request.auto_triggered,
        emergency_contacts_notified=[c["phone"] for c in emergency_contacts],
        police_station_map_url=police_station_map_url,
    )
    await db.sos_alerts.insert_one(sos.model_dump() if hasattr(sos, "model_dump") else sos.dict())
    await db.trips.update_one({"id": request.trip_id}, {"$set": {"sos_triggered": True, "sos_triggered_at": datetime.now(timezone.utc)}})
    contacts_notified = 0
    if TERMII_API_KEY and emergency_contacts:
        location_link = f"https://maps.google.com/?q={request.location_lat},{request.location_lng}"
        async with httpx.AsyncClient() as http_client:
            for contact in emergency_contacts:
                try:
                    phone = contact["phone"].lstrip('+')
                    sms_text = f"EMERGENCY! {user_name} triggered SOS on NexRyde! Location: {location_link} Trip: {request.trip_id}"
                    payload = {"api_key": TERMII_API_KEY, "to": phone, "from": "NEXRYDE", "channel": "dnd", "type": "plain", "sms": sms_text}
                    resp = await http_client.post(f"{TERMII_BASE_URL}/api/sms/send", json=payload, timeout=10.0)
                    if resp.status_code == 200:
                        contacts_notified += 1
                except Exception as e:
                    logger.error(f"SOS SMS error: {e}")
    # NEXRYDE Shield: notify other online drivers within 2km (rider or driver SOS).
    nearby_driver_alerts = await broadcast_sos_to_nearby_nexryde_drivers(
        request.location_lat,
        request.location_lng,
        user_id,
        request.trip_id,
        sos.id,
        user_name,
    )
    return {
        "success": True,
        "message": "SOS alert activated!",
        "sos_id": sos.id,
        "contacts_notified": contacts_notified,
        "total_contacts": len(emergency_contacts),
        "support_notified": True,
        "police_station_map_url": police_station_map_url,
        "nearby_driver_alerts_sent": nearby_driver_alerts,
    }


@support_router.post("/sos/police-connect")
async def one_touch_police_connect(request: PoliceConnectRequest, http_request: Request):
    actor_id = require_authenticated(http_request)
    trip = await db.trips.find_one({"id": request.trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    if actor_id != trip.get("driver_id"):
        raise HTTPException(status_code=403, detail="Only the assigned driver can use Police Connect")

    driver = await db.users.find_one({"id": actor_id}, {"_id": 0, "id": 1, "name": 1, "phone": 1}) or {}
    profile = await db.driver_profiles.find_one(
        {"user_id": actor_id},
        {"_id": 0, "vehicle_model": 1, "vehicle_plate": 1, "vehicle_color": 1},
    ) or {}
    now_iso = datetime.now(timezone.utc).isoformat()
    maps_query = f"https://www.google.com/maps/search/?api=1&query=police+station+near+{request.location_lat},{request.location_lng}"
    dial_number = "+234199"
    dial_uri = f"tel:{dial_number}"
    alert_id = str(uuid.uuid4())

    alert_payload = {
        "id": alert_id,
        "type": "one_touch_police_connect",
        "status": "active",
        "trip_id": request.trip_id,
        "driver_id": actor_id,
        "triggered_at": now_iso,
        "location": {"lat": request.location_lat, "lng": request.location_lng},
        "police_station_map_url": maps_query,
        "driver_details": {
            "name": driver.get("name", "Driver"),
            "phone": driver.get("phone"),
            "vehicle_model": profile.get("vehicle_model"),
            "vehicle_plate": profile.get("vehicle_plate"),
            "vehicle_color": profile.get("vehicle_color"),
        },
    }
    await db.sos_alerts.insert_one(alert_payload)
    await db.trips.update_one(
        {"id": request.trip_id},
        {"$set": {"police_connect_triggered": True, "police_connect_triggered_at": now_iso}},
    )

    sms_sent = 0
    if TERMII_API_KEY and POLICE_ALERT_NUMBERS:
        message = (
            "NEXRYDE POLICE CONNECT ALERT\n"
            f"Driver: {driver.get('name', 'Driver')}\n"
            f"Vehicle: {profile.get('vehicle_model', 'Vehicle')} / {profile.get('vehicle_plate', 'N/A')}\n"
            f"Trip: {request.trip_id}\n"
            f"Location: https://maps.google.com/?q={request.location_lat},{request.location_lng}"
        )
        async with httpx.AsyncClient() as http_client:
            for number in POLICE_ALERT_NUMBERS:
                try:
                    payload = {
                        "api_key": TERMII_API_KEY,
                        "to": number.lstrip("+"),
                        "from": TERMII_FROM_ID,
                        "channel": "dnd",
                        "type": "plain",
                        "sms": message,
                    }
                    resp = await http_client.post(f"{TERMII_BASE_URL}/api/sms/send", json=payload, timeout=10.0)
                    if resp.status_code == 200:
                        sms_sent += 1
                except Exception as e:
                    logger.warning("Police connect SMS failed for %s: %s", number, e)

    return {
        "success": True,
        "message": "Police Connect activated",
        "alert_id": alert_id,
        "dial_uri": dial_uri,
        "dial_number": dial_number,
        "nearest_police_station_map_url": maps_query,
        "structured_alert": alert_payload,
        "police_sms_sent": sms_sent,
    }

@support_router.post("/sos/{sos_id}/resolve")
async def resolve_sos(sos_id: str, request: Request, resolution: str = "resolved"):
    actor_id = require_authenticated(request)
    sos = await db.sos_alerts.find_one({"id": sos_id})
    if not sos:
        raise HTTPException(status_code=404, detail="SOS not found")
    trip = await db.trips.find_one({"id": sos.get("trip_id")}) or {}
    if actor_id not in {sos.get("user_id"), trip.get("rider_id"), trip.get("driver_id")}:
        raise HTTPException(status_code=403, detail="Not authorized to resolve this SOS")
    await db.sos_alerts.update_one({"id": sos_id}, {"$set": {"status": resolution, "resolved_at": datetime.now(timezone.utc)}})
    return {"message": "SOS resolved"}

@support_router.get("/sos/trip/{trip_id}")
async def get_trip_sos(trip_id: str, request: Request):
    trip = await db.trips.find_one({"id": trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    verify_trip_participant(request, trip)
    alerts = await db.sos_alerts.find({"trip_id": trip_id}).to_list(10)
    for alert in alerts:
        alert["_id"] = str(alert["_id"])
    return {"alerts": alerts}

@support_router.post("/safety/respond")
async def respond_to_safety_check(request: SafetyResponseRequest, http_request: Request):
    actor_id = require_authenticated(http_request)
    now = datetime.now(timezone.utc)
    check = await db.safety_checks.find_one({"id": request.check_id})
    if not check:
        raise HTTPException(status_code=404, detail="Safety check not found")
    trip = await db.trips.find_one({"id": check.get("trip_id")})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    verify_trip_participant(http_request, trip)
    if actor_id != trip.get("rider_id"):
        raise HTTPException(status_code=403, detail="Only rider can respond to safety check")

    await db.safety_checks.update_one(
        {"id": request.check_id},
        {"$set": {"rider_response": request.response, "responded_at": now, "status": "resolved"}}
    )

    # Clear active guardian prompt once rider responds.
    await db.trips.update_one(
        {"id": check.get("trip_id")},
        {"$set": {"guardian_alert": None, "guardian_state.pending_check_id": None}}
    )

    if request.response == "need_help":
        trip = await db.trips.find_one({"id": check.get("trip_id")}) or {}
        sos = SOSAlert(
            trip_id=check["trip_id"],
            user_id=trip.get("rider_id", ""),
            user_role="rider",
            location=check.get("location", {}),
            auto_triggered=True
        )
        await db.sos_alerts.insert_one(sos.model_dump() if hasattr(sos, "model_dump") else sos.dict())
    return {"message": "Response recorded"}


def _detect_support_language(text: str, preferred: str = "auto") -> str:
    if preferred in {"en", "pcm"}:
        return preferred
    lower = (text or "").lower()
    pidgin_markers = [
        "abeg", "dey", "wetin", "wahala", "no dey", "make i", "una", "fit", "wan", "na", "how far"
    ]
    return "pcm" if any(marker in lower for marker in pidgin_markers) else "en"


def _rule_support_answer(message: str, language: str) -> dict:
    lower = (message or "").lower()
    intent = "general_support"
    quick_actions = ["call_support", "open_chat", "report_issue"]
    escalate = False

    if any(k in lower for k in ["stop", "stopped", "driver stop", "not moving", "safety"]):
        intent = "trip_guardian"
        quick_actions = ["safety_check", "trigger_sos", "call_support"]
    elif any(k in lower for k in ["otp", "sms", "code", "verification"]):
        intent = "otp_issue"
        quick_actions = ["resend_otp", "verify_number", "call_support"]
    elif any(k in lower for k in ["payment", "wallet", "charge", "refund"]):
        intent = "payment_issue"
        quick_actions = ["payment_history", "raise_dispute", "call_support"]
    elif any(k in lower for k in ["cancel", "driver no come", "no show"]):
        intent = "trip_cancellation"
        quick_actions = ["cancel_trip", "find_new_driver", "contact_support"]
    elif any(k in lower for k in ["accident", "emergency", "help me", "danger"]):
        intent = "emergency"
        quick_actions = ["trigger_sos", "call_support", "share_trip"]
        escalate = True

    if language == "pcm":
        responses = {
            "trip_guardian": "I don hear you. If motor stop too long, tap 'I Need Help' make we trigger SOS sharp sharp.",
            "otp_issue": "No wahala. Check say your number correct (+234 format), then tap resend OTP. If e still fail, I fit escalate am now.",
            "payment_issue": "For payment wahala, open receipt/wallet first. If charge no correct, raise dispute and support go check am fast.",
            "trip_cancellation": "If driver no show, you fit cancel and request another ride. If fare don deduct, open support ticket immediately.",
            "emergency": "Emergency detected. Tap SOS now and call support immediately. We go follow up your trip live.",
            "general_support": "I dey here to help. Tell me wetin happen for your trip, OTP, payment, or safety issue.",
        }
    else:
        responses = {
            "trip_guardian": "Understood. If the car stops for too long, tap 'I Need Help' so we can trigger SOS immediately.",
            "otp_issue": "Please confirm your phone is in +234 format and tap resend OTP. If it still fails, I can escalate this now.",
            "payment_issue": "Open your receipt/wallet first. If a charge is incorrect, raise a dispute and support will review quickly.",
            "trip_cancellation": "If the driver is a no-show, cancel and request another ride. If you were charged, open a support ticket immediately.",
            "emergency": "Emergency detected. Trigger SOS now and call support immediately. We will monitor your trip live.",
            "general_support": "I can help with trip, OTP, payment, and safety issues. Tell me what happened.",
        }

    return {
        "intent": intent,
        "response": responses[intent],
        "quick_actions": quick_actions,
        "escalate": escalate,
    }


@support_router.post("/support/voice-bot/reply")
async def support_voice_bot_reply(request: SupportBotRequest, http_request: Request):
    actor_id = require_authenticated(http_request)
    if request.user_id and request.user_id != actor_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    message = (request.message or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="message is required")

    language = _detect_support_language(message, request.language)
    rule_answer = _rule_support_answer(message, language)

    # Add realtime context from current trip for faster, practical guidance.
    trip_context = None
    if request.trip_id:
        trip = await db.trips.find_one({"id": request.trip_id}, {"_id": 0})
        if trip:
            if actor_id not in {trip.get("rider_id"), trip.get("driver_id")}:
                raise HTTPException(status_code=403, detail="Not authorized for this trip")
            trip_context = {
                "trip_id": trip.get("id"),
                "status": trip.get("status"),
                "guardian_alert_active": bool(trip.get("guardian_alert")),
                "sos_triggered": bool(trip.get("sos_triggered")),
            }

    if OPENAI_API_KEY:
        try:
            client = OpenAI(api_key=OPENAI_API_KEY)
            system_prompt = (
                "You are NEXRYDE support voice bot. Reply very briefly (max 3 short sentences), "
                "action-focused, with clear next steps. "
                f"Respond in {'Nigerian Pidgin' if language == 'pcm' else 'English'}."
            )
            context_text = f"Trip context: {trip_context}" if trip_context else "Trip context: none"
            llm = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"{context_text}\nUser issue: {message}"},
                ],
                temperature=0.2,
                max_tokens=180,
            )
            llm_text = (llm.choices[0].message.content or "").strip()
            if llm_text:
                rule_answer["response"] = llm_text
        except Exception as e:
            logger.warning(f"Support voice bot LLM fallback to rules: {e}")

    return {
        "success": True,
        "language": language,
        "intent": rule_answer["intent"],
        "response": rule_answer["response"],
        "quick_actions": rule_answer["quick_actions"],
        "escalate": rule_answer["escalate"],
        "trip_context": trip_context,
    }

@support_router.post("/trips/{trip_id}/risk-alert")
async def trigger_risk_alert(trip_id: str, user_id: str, request: RiskAlertRequest, http_request: Request):
    actor_id = require_authenticated(http_request)
    if actor_id != user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    trip = await db.trips.find_one({"id": trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    if actor_id not in {trip.get("rider_id"), trip.get("driver_id")}:
        raise HTTPException(status_code=403, detail="Not authorized for this trip")
    is_driver = user_id == trip.get("driver_id")
    await db.trips.update_one({"id": trip_id}, {"$set": {"risk_alert_by_driver" if is_driver else "risk_alert_by_rider": True, "is_monitored": True}})
    return {"message": "Risk alert recorded"}


@support_router.post("/support/trip-issues/report")
async def report_trip_issue(request: TripIssueReportRequest, http_request: Request):
    actor_id = require_authenticated(http_request)
    if actor_id != request.user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    trip = await db.trips.find_one({"id": request.trip_id}, {"_id": 0})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    role = (request.role or "").strip().lower()
    if role not in {"rider", "driver"}:
        raise HTTPException(status_code=400, detail="role must be rider or driver")
    if role == "rider" and request.user_id != trip.get("rider_id"):
        raise HTTPException(status_code=403, detail="Not authorized for this trip")
    if role == "driver" and request.user_id != trip.get("driver_id"):
        raise HTTPException(status_code=403, detail="Not authorized for this trip")

    # Pull trust ledger context so support can resolve issues instantly.
    events = await db.trip_events.find(
        {"trip_id": request.trip_id},
        {"_id": 0}
    ).sort("created_at", -1).limit(80).to_list(80)

    issue_doc = {
        "id": str(uuid.uuid4()),
        "trip_id": request.trip_id,
        "reporter_id": request.user_id,
        "reporter_role": role,
        "category": (request.category or "general").lower(),
        "description": request.description.strip(),
        "trip_status": trip.get("status"),
        "pickup": trip.get("pickup_location"),
        "dropoff": trip.get("dropoff_location"),
        "fare": trip.get("fare"),
        "driver_id": trip.get("driver_id"),
        "rider_id": trip.get("rider_id"),
        "events_context": events,
        "status": "open",
        "priority": "high" if (request.category or "").lower() in {"safety", "payment"} else "normal",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.trip_issue_reports.insert_one(issue_doc)
    return {"success": True, "issue_id": issue_doc["id"], "status": issue_doc["status"]}


@support_router.get("/support/trip-issues/{trip_id}")
async def get_trip_issues(trip_id: str, request: Request):
    trip = await db.trips.find_one({"id": trip_id}, {"_id": 0})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    verify_trip_participant(request, trip)
    issues = await db.trip_issue_reports.find(
        {"trip_id": trip_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    return {"success": True, "trip_id": trip_id, "issues": issues}


@support_router.post("/support/driver-witness/report")
async def submit_driver_witness_report(request: DriverWitnessReportRequest, http_request: Request):
    actor_id = require_authenticated(http_request)
    trip = await db.trips.find_one({"id": request.trip_id}, {"_id": 0})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    if actor_id != trip.get("driver_id"):
        raise HTTPException(status_code=403, detail="Only the assigned driver can submit witness report")

    driver = await db.users.find_one({"id": actor_id}, {"_id": 0, "id": 1, "name": 1, "phone": 1}) or {}
    driver_profile = await db.driver_profiles.find_one(
        {"user_id": actor_id},
        {"_id": 0, "vehicle_model": 1, "vehicle_plate": 1, "vehicle_color": 1},
    ) or {}
    now_iso = datetime.now(timezone.utc).isoformat()
    public_driver_identity = {
        "driver_alias": f"driver_{str(actor_id)[-6:]}",
        "vehicle_model": driver_profile.get("vehicle_model"),
        "vehicle_plate": driver_profile.get("vehicle_plate"),
        "vehicle_color": driver_profile.get("vehicle_color"),
    }
    full_driver_identity = {
        **public_driver_identity,
        "driver_id": actor_id,
        "driver_name": driver.get("name"),
        "driver_phone": driver.get("phone"),
    }
    witness_report = {
        "id": str(uuid.uuid4()),
        "trip_id": request.trip_id,
        "reporter_role": "driver",
        "reporter_id": actor_id,
        "anonymous": bool(request.anonymous),
        "incident_type": (request.incident_type or "other").strip().lower(),
        "description": request.description.strip(),
        "evidence_notes": (request.evidence_notes or "").strip() or None,
        "location": {
            "lat": request.location_lat,
            "lng": request.location_lng,
        },
        "occurred_at": request.occurred_at or now_iso,
        "trip_context": {
            "status": trip.get("status"),
            "pickup": trip.get("pickup_location"),
            "dropoff": trip.get("dropoff_location"),
            "driver_id": trip.get("driver_id"),
            "rider_id": trip.get("rider_id"),
        },
        "authority_payload": {
            "report_id": None,  # filled after insert
            "incident_type": (request.incident_type or "other").strip().lower(),
            "description": request.description.strip(),
            "occurred_at": request.occurred_at or now_iso,
            "location": {"lat": request.location_lat, "lng": request.location_lng},
            "trip_id": request.trip_id,
            "driver_identity": public_driver_identity if request.anonymous else full_driver_identity,
        },
        "retaliation_protection": {
            "enabled": True,
            "status": "active",
            "shielded_reporter_identity": bool(request.anonymous),
        },
        "authority_forwarding_status": "queued",
        "created_at": now_iso,
    }

    await db.driver_witness_reports.insert_one(witness_report)
    report_id = witness_report["id"]
    await db.driver_witness_reports.update_one(
        {"id": report_id},
        {"$set": {"authority_payload.report_id": report_id}},
    )
    await db.authority_forward_queue.insert_one(
        {
            "id": str(uuid.uuid4()),
            "source": "driver_witness_programme",
            "report_id": report_id,
            "trip_id": request.trip_id,
            "status": "pending",
            "payload": {**witness_report["authority_payload"], "report_id": report_id},
            "created_at": now_iso,
            "last_attempt_at": None,
            "attempt_count": 0,
        }
    )
    reward_points = 25
    await db.users.update_one(
        {"id": actor_id},
        {"$inc": {"safety_points": reward_points, "trust_score": 1.5}},
    )
    await _log_trip_event_safe(
        request.trip_id,
        "driver_witness_report_submitted",
        actor_id,
        {
            "report_id": report_id,
            "incident_type": witness_report["incident_type"],
            "anonymous": bool(request.anonymous),
            "reward_points": reward_points,
        },
    )
    return {
        "success": True,
        "report_id": report_id,
        "authority_forwarding_status": "queued",
        "retaliation_protection": witness_report["retaliation_protection"],
        "reward_points_earned": reward_points,
        "message": "Witness report submitted securely. Nexryde queued it for authority forwarding.",
    }

# ==================== MULTI-LANGUAGE ====================

@support_router.get("/languages")
async def get_languages():
    return {"languages": SUPPORTED_LANGUAGES, "default": "en"}

@support_router.get("/translations/{lang}")
async def get_translations(lang: str):
    return {"language": lang, "translations": TRANSLATIONS.get(lang, TRANSLATIONS["en"])}

# ==================== KODA FAMILY ====================

@support_router.post("/family/create")
async def create_family(owner_id: str, family_name: str, request: Request):
    verify_owner_strict(request, owner_id)
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
async def add_family_member(family_id: str, phone: str, name: str, relationship: str, request: Request):
    actor_id = require_authenticated(request)
    family = await db.families.find_one({"id": family_id})
    if not family:
        raise HTTPException(status_code=404, detail="Family not found")
    if actor_id != family.get("owner_id"):
        raise HTTPException(status_code=403, detail="Only family owner can add members")
    if len(family["members"]) >= 10:
        raise HTTPException(status_code=400, detail="Family has reached maximum 10 members")
    normalized_phone = _normalize_phone(phone)
    if not normalized_phone:
        raise HTTPException(status_code=400, detail="Invalid phone number")
    member_user = await db.users.find_one({"phone": normalized_phone})
    member_id = member_user["id"] if member_user else f"pending-{phone}"
    if member_user and member_user.get("family_id"):
        raise HTTPException(status_code=400, detail="User already belongs to a family")
    new_member = {"user_id": member_id, "phone": normalized_phone, "name": name, "relationship": relationship, "role": "member", "joined_at": datetime.now(timezone.utc), "is_pending": member_user is None}
    await db.families.update_one({"id": family_id}, {"$push": {"members": new_member}})
    if member_user:
        inherited_trust = min(family.get("trust_score", 100.0), member_user.get("trust_score", 100.0))
        await db.users.update_one({"id": member_id}, {"$set": {"family_id": family_id, "family_role": "member", "trust_score": inherited_trust}})
    return {"message": f"{name} added to family", "is_pending": member_user is None}

@support_router.get("/family/{family_id}")
async def get_family(family_id: str, request: Request):
    actor_id = require_authenticated(request)
    family = await db.families.find_one({"id": family_id})
    if not family:
        raise HTTPException(status_code=404, detail="Family not found")
    if not any(m.get("user_id") == actor_id for m in family.get("members", [])):
        raise HTTPException(status_code=403, detail="Not authorized to view this family")
    family["_id"] = str(family["_id"])
    for member in family["members"]:
        if not member.get("is_pending"):
            user = await db.users.find_one({"id": member["user_id"]})
            if user:
                member["rating"] = user.get("rating", 5.0)
                member["total_trips"] = user.get("total_trips", 0)
    return family

@support_router.delete("/family/{family_id}/member/{member_phone}")
async def remove_family_member(family_id: str, member_phone: str, request: Request):
    actor_id = require_authenticated(request)
    family = await db.families.find_one({"id": family_id})
    if not family:
        raise HTTPException(status_code=404, detail="Family not found")
    if actor_id != family.get("owner_id"):
        raise HTTPException(status_code=403, detail="Only family owner can remove members")
    normalized_phone = _normalize_phone(member_phone)
    member_to_remove = next((m for m in family["members"] if _normalize_phone(str(m.get("phone") or "")) == normalized_phone), None)
    if not member_to_remove:
        raise HTTPException(status_code=404, detail="Member not found")
    if member_to_remove.get("role") == "owner":
        raise HTTPException(status_code=400, detail="Cannot remove family owner")
    await db.families.update_one({"id": family_id}, {"$pull": {"members": {"phone": member_to_remove.get("phone")}}})
    if not member_to_remove.get("is_pending"):
        await db.users.update_one({"id": member_to_remove["user_id"]}, {"$unset": {"family_id": "", "family_role": ""}})
    return {"message": "Member removed from family"}

@support_router.post("/family/{family_id}/book-for-member")
async def book_for_family_member(family_id: str, booker_id: str, member_phone: str, pickup_lat: float, pickup_lng: float, pickup_address: str, dropoff_lat: float, dropoff_lng: float, dropoff_address: str, request: Request):
    actor_id = require_authenticated(request)
    if actor_id != booker_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    family = await db.families.find_one({"id": family_id})
    if not family:
        raise HTTPException(status_code=404, detail="Family not found")
    if not any(m["user_id"] == booker_id for m in family["members"]):
        raise HTTPException(status_code=403, detail="Not authorized to book for this family")
    normalized_phone = _normalize_phone(member_phone)
    member = next((m for m in family["members"] if _normalize_phone(str(m.get("phone") or "")) == normalized_phone), None)
    if not member:
        raise HTTPException(status_code=404, detail="Member not found in family")
    trip_id = str(uuid.uuid4())
    trip = {"id": trip_id, "rider_id": member.get("user_id", f"family-{normalized_phone}"), "rider_phone": normalized_phone, "rider_name": member.get("name"), "booked_by": booker_id, "family_id": family_id, "is_family_booking": True, "pickup_location": {"lat": pickup_lat, "lng": pickup_lng, "address": pickup_address}, "dropoff_location": {"lat": dropoff_lat, "lng": dropoff_lng, "address": dropoff_address}, "status": "pending", "created_at": datetime.now(timezone.utc), "fare": 0}
    await db.trips.insert_one(trip)
    for m in family["members"]:
        if m["user_id"] != booker_id:
            await db.notifications.insert_one({"user_id": m["user_id"], "type": "family_trip_booked", "title": "Family Trip Alert", "message": f"{member.get('name')} has a ride booked", "data": {"trip_id": trip_id}, "created_at": datetime.now(timezone.utc), "read": False})
    return {"message": "Trip booked for family member", "trip_id": trip_id}

@support_router.post("/family/{family_id}/safety-alert")
async def trigger_family_safety_alert(family_id: str, member_id: str, location_lat: float, location_lng: float, request: Request):
    actor_id = require_authenticated(request)
    if actor_id != member_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    family = await db.families.find_one({"id": family_id})
    if not family:
        raise HTTPException(status_code=404, detail="Family not found")
    if not any(m.get("user_id") == actor_id for m in family.get("members", [])):
        raise HTTPException(status_code=403, detail="Not a family member")
    member_name = next((m.get("name", "Family member") for m in family["members"] if m["user_id"] == member_id), "Family member")
    for m in family["members"]:
        if m["user_id"] != member_id:
            await db.notifications.insert_one({"user_id": m["user_id"], "type": "safety_circle_alert", "title": "SAFETY ALERT", "message": f"{member_name} needs help!", "data": {"member_id": member_id, "location": {"lat": location_lat, "lng": location_lng}}, "created_at": datetime.now(timezone.utc), "read": False, "urgent": True})
    return {"message": "Safety alert sent to all family members", "notified_count": len(family["members"]) - 1}

# ==================== TRIP SHARING ====================

@support_router.post("/trips/{trip_id}/share")
async def share_trip(trip_id: str, recipient_phone: str, request: Request, recipient_name: str = ""):
    trip = await db.trips.find_one({"id": trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    verify_trip_participant(request, trip)
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
async def get_fraud_alerts(request: Request):
    await require_admin_request(request)
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
async def update_behavior_score(user_id: str, event_type: str, request: Request):
    await require_admin_request(request)
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
async def start_trip_recording(trip_id: str, request: Request):
    trip = await db.trips.find_one({"id": trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    verify_trip_participant(request, trip)
    await db.trips.update_one({"id": trip_id}, {"$set": {"recording_enabled": True, "recording_started_at": datetime.now(timezone.utc)}})
    return {"message": "Recording started", "trip_id": trip_id}

@support_router.post("/trips/{trip_id}/stop-recording")
async def stop_trip_recording(trip_id: str, request: Request):
    trip = await db.trips.find_one({"id": trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    verify_trip_participant(request, trip)
    await db.trips.update_one({"id": trip_id}, {"$set": {"recording_enabled": False, "recording_stopped_at": datetime.now(timezone.utc)}})
    return {"message": "Recording stopped", "trip_id": trip_id}


@support_router.post("/trips/{trip_id}/recordings/upload")
async def upload_trip_recording_video(
    trip_id: str,
    request: Request,
    video: UploadFile = File(...),
    duration_seconds: float = Form(default=0),
    started_at: Optional[str] = Form(default=None),
    stopped_at: Optional[str] = Form(default=None),
    source: str = Form(default="mobile_app"),
):
    actor_id = require_authenticated(request)
    trip = await db.trips.find_one({"id": trip_id}, {"_id": 0})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    if actor_id not in {trip.get("rider_id"), trip.get("driver_id")}:
        raise HTTPException(status_code=403, detail="Not authorized for this trip")

    content_type = (video.content_type or "").lower()
    if content_type and not content_type.startswith("video/"):
        raise HTTPException(status_code=400, detail="Uploaded file must be a video")

    blob = await video.read()
    if not blob:
        raise HTTPException(status_code=400, detail="Video file is empty")
    if len(blob) > MAX_TRIP_VIDEO_BYTES:
        raise HTTPException(status_code=413, detail="Video too large. Max allowed is 25MB")

    now_iso = datetime.now(timezone.utc).isoformat()
    role = "driver" if actor_id == trip.get("driver_id") else "rider"
    recording_doc = {
        "id": str(uuid.uuid4()),
        "trip_id": trip_id,
        "uploader_id": actor_id,
        "uploader_role": role,
        "filename": video.filename or f"trip-video-{trip_id}.mp4",
        "mime_type": content_type or "video/mp4",
        "size_bytes": len(blob),
        "video_base64": base64.b64encode(blob).decode("utf-8"),
        "duration_seconds": max(0, float(duration_seconds or 0)),
        "started_at": started_at,
        "stopped_at": stopped_at,
        "source": source.strip() or "mobile_app",
        "trip_status": trip.get("status"),
        "created_at": now_iso,
        "admin_review_status": "pending",
    }
    await db.trip_recordings.insert_one(recording_doc)
    await db.trips.update_one(
        {"id": trip_id},
        {
            "$set": {
                "recording_enabled": False,
                "recording_stopped_at": datetime.now(timezone.utc),
                "last_recording_upload_at": now_iso,
            }
        },
    )

    return {
        "success": True,
        "recording_id": recording_doc["id"],
        "trip_id": trip_id,
        "size_bytes": recording_doc["size_bytes"],
        "duration_seconds": recording_doc["duration_seconds"],
    }


@support_router.get("/support/trips/{trip_id}/recordings")
async def list_trip_recordings_for_participants(trip_id: str, request: Request):
    trip = await db.trips.find_one({"id": trip_id}, {"_id": 0})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    verify_trip_participant(request, trip)
    rows = await db.trip_recordings.find(
        {"trip_id": trip_id},
        {"_id": 0, "video_base64": 0},
    ).sort("created_at", -1).to_list(50)
    return {"success": True, "trip_id": trip_id, "recordings": rows}


@support_router.get("/admin/trip-recordings")
async def list_trip_recordings_for_admin(request: Request, trip_id: Optional[str] = None, limit: int = 100):
    await require_admin_request(request)
    safe_limit = max(1, min(limit, 200))
    query = {"trip_id": trip_id} if trip_id else {}
    rows = await db.trip_recordings.find(
        query,
        {"_id": 0, "video_base64": 0},
    ).sort("created_at", -1).to_list(safe_limit)
    return {"success": True, "count": len(rows), "recordings": rows}

# ==================== INSURANCE ====================

@support_router.get("/trips/{trip_id}/insurance")
async def get_trip_insurance(trip_id: str, request: Request):
    trip = await db.trips.find_one({"id": trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    verify_trip_participant(request, trip)
    return {"trip_id": trip_id, "is_insured": True, "coverage": {"personal_accident": "₦500,000", "medical_expenses": "₦100,000", "property_damage": "₦50,000"}, "provider": "KODA Insurance Partners"}

@support_router.post("/trips/{trip_id}/track")
async def update_trip_tracking(trip_id: str, update: TripTrackingUpdate, request: Request):
    actor_id = require_authenticated(request)
    trip = await db.trips.find_one({"id": trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    if actor_id != trip.get("driver_id"):
        raise HTTPException(status_code=403, detail="Only assigned driver can send trip tracking updates")
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
async def get_rider_preferences(user_id: str, request: Request):
    verify_owner_strict(request, user_id)
    prefs = await db.rider_preferences.find_one({"user_id": user_id}, {"_id": 0})
    if not prefs:
        prefs = {"user_id": user_id, "preferred_vehicle": "economy", "preferred_music": "any", "temperature": "normal", "conversation": "moderate", "special_needs": None, "saved_routes": [], "estate_name": None, "estate_gate_code": None, "has_estate_gate_code": False}
        return prefs
    prefs["estate_gate_code"] = _decrypt_pref_secret(prefs.get("estate_gate_code_cipher"))
    prefs["has_estate_gate_code"] = bool(prefs.get("estate_gate_code"))
    prefs.pop("estate_gate_code_cipher", None)
    return prefs

@support_router.put("/rider/preferences/{user_id}")
async def update_rider_preferences(user_id: str, request: RiderPreferencesUpdate, http_request: Request):
    verify_owner_strict(http_request, user_id)
    update_data = {k: v for k, v in request.dict().items() if v is not None}
    if "estate_gate_code" in update_data:
        update_data["estate_gate_code_cipher"] = _encrypt_pref_secret(update_data.pop("estate_gate_code"))
    if "estate_name" in update_data and update_data["estate_name"] is not None:
        update_data["estate_name"] = update_data["estate_name"].strip() or None
    if update_data:
        await db.rider_preferences.update_one({"user_id": user_id}, {"$set": update_data}, upsert=True)
    prefs = await db.rider_preferences.find_one({"user_id": user_id}, {"_id": 0})
    if not prefs:
        return {"user_id": user_id}
    prefs["estate_gate_code"] = _decrypt_pref_secret(prefs.get("estate_gate_code_cipher"))
    prefs["has_estate_gate_code"] = bool(prefs.get("estate_gate_code"))
    prefs.pop("estate_gate_code_cipher", None)
    return prefs

@support_router.post("/rider/preferences/{user_id}/routes")
async def save_route(user_id: str, route: SavedRouteRequest, request: Request):
    verify_owner_strict(request, user_id)
    route_data = {"id": str(uuid.uuid4()), "name": route.name, "pickup": {"lat": route.pickup_lat, "lng": route.pickup_lng, "address": route.pickup_address}, "dropoff": {"lat": route.dropoff_lat, "lng": route.dropoff_lng, "address": route.dropoff_address}, "use_count": 0, "created_at": datetime.now(timezone.utc).isoformat()}
    await db.rider_preferences.update_one({"user_id": user_id}, {"$push": {"saved_routes": route_data}}, upsert=True)
    return {"message": "Route saved", "route": route_data}

@support_router.delete("/rider/preferences/{user_id}/routes/{route_id}")
async def delete_saved_route(user_id: str, route_id: str, request: Request):
    verify_owner_strict(request, user_id)
    await db.rider_preferences.update_one({"user_id": user_id}, {"$pull": {"saved_routes": {"id": route_id}}})
    return {"message": "Route deleted"}

# ==================== IN-APP MESSAGING ====================

@support_router.post("/messages/send")
async def send_message(request: SendMessageRequest, http_request: Request):
    actor_id = require_authenticated(http_request)
    trip = await db.trips.find_one({"id": request.trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    if actor_id not in {trip.get("rider_id"), trip.get("driver_id")}:
        raise HTTPException(status_code=403, detail="Not authorized for this trip")
    actor_role = "driver" if actor_id == trip.get("driver_id") else "rider"
    preset_messages = {"arriving_soon": "I'm arriving soon, please be ready", "at_location": "I'm at the pickup location", "running_late": "I'm running a few minutes late", "waiting": "I'm waiting for you", "call_me": "Please call me"}
    content = preset_messages.get(request.content, request.content) if request.message_type == "preset" else request.content
    message = {"id": str(uuid.uuid4()), "trip_id": request.trip_id, "sender_id": actor_id, "sender_role": actor_role, "message_type": request.message_type, "content": content, "read": False, "created_at": datetime.now(timezone.utc)}
    await db.messages.insert_one(message)
    return {"message": "Message sent", "data": message}

@support_router.get("/messages/{trip_id}")
async def get_trip_inapp_messages(trip_id: str, request: Request):
    trip = await db.trips.find_one({"id": trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    verify_trip_participant(request, trip)
    messages = await db.messages.find({"trip_id": trip_id}).sort("created_at", 1).to_list(100)
    for m in messages:
        m["_id"] = str(m["_id"])
    return {"trip_id": trip_id, "messages": messages, "preset_options": [{"key": "arriving_soon", "text": "I'm arriving soon"}, {"key": "at_location", "text": "I'm at the pickup location"}, {"key": "running_late", "text": "I'm running late"}, {"key": "call_me", "text": "Please call me"}]}

@support_router.put("/messages/{message_id}/read")
async def mark_message_read(message_id: str, request: Request):
    actor_id = require_authenticated(request)
    message = await db.messages.find_one({"id": message_id})
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    trip = await db.trips.find_one({"id": message.get("trip_id")})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    if actor_id not in {trip.get("rider_id"), trip.get("driver_id")}:
        raise HTTPException(status_code=403, detail="Not authorized")
    await db.messages.update_one({"id": message_id}, {"$set": {"read": True}})
    return {"message": "Message marked as read"}

# ==================== LOST & FOUND ====================

@support_router.post("/lost-found/report")
async def report_lost_item(request: ReportLostItemRequest, http_request: Request):
    actor_id = require_authenticated(http_request)
    trip = await db.trips.find_one({"id": request.trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    if actor_id not in {trip.get("rider_id"), trip.get("driver_id")}:
        raise HTTPException(status_code=403, detail="Not authorized for this trip")
    actor_role = "driver" if actor_id == trip.get("driver_id") else "rider"
    item = {"id": str(uuid.uuid4()), "trip_id": request.trip_id, "reporter_id": actor_id, "reporter_role": actor_role, "description": request.description, "status": "reported", "other_party_id": trip.get("driver_id") if actor_role == "rider" else trip.get("rider_id"), "created_at": datetime.now(timezone.utc)}
    await db.lost_items.insert_one(item)
    return {"message": "Lost item reported", "item_id": item["id"]}

@support_router.get("/lost-found/user/{user_id}")
async def get_user_lost_items(user_id: str, request: Request):
    verify_owner_strict(request, user_id)
    items = await db.lost_items.find({"$or": [{"reporter_id": user_id}, {"other_party_id": user_id}]}, {"_id": 0}).to_list(50)
    return {"items": items}

@support_router.put("/lost-found/{item_id}/respond")
async def respond_to_lost_item(item_id: str, request: LostItemResponseRequest, http_request: Request):
    actor_id = require_authenticated(http_request)
    item = await db.lost_items.find_one({"id": item_id})
    if not item:
        raise HTTPException(status_code=404, detail="Lost item record not found")
    if actor_id not in {item.get("reporter_id"), item.get("other_party_id")}:
        raise HTTPException(status_code=403, detail="Not authorized to respond")
    update = {"response": request.response, "responded_at": datetime.now(timezone.utc)}
    if request.found:
        update["status"] = "found"
    await db.lost_items.update_one({"id": item_id}, {"$set": update})
    return {"message": "Response recorded", "found": request.found}


# ==================== RADIO STATIONS ====================

@support_router.get("/radio/stations")
async def get_radio_stations():
    """Return active radio stations configured for driver radio."""
    rows = await db.radio_stations.find(
        {"is_active": True},
        {"_id": 0}
    ).sort("sort_order", 1).to_list(100)
    return {"stations": rows}


@support_router.get("/support/contacts")
async def get_support_contacts():
    police_numbers = [n.strip() for n in (os.environ.get("NEXRYDE_PUBLIC_POLICE_NUMBERS", "+234199")).split(",") if n.strip()]
    return {
        "support_phone": "+2348089297811",
        "support_email": "support@nexryde.com",
        "nigerian_police_numbers": police_numbers,
        "emergency_line": "+234199",
    }


@support_router.get("/notifications/feature-announcements")
async def get_feature_announcements(request: Request):
    """Company-curated in-app feature updates for rider/driver notification center."""
    actor_id = require_authenticated(request)
    user = await db.users.find_one({"id": actor_id}, {"_id": 0, "role": 1})
    role = (user or {}).get("role", "rider")
    rows = await db.feature_announcements.find(
        {
            "is_active": True,
            "$or": [
                {"audience": "all"},
                {"audience": role},
            ],
        },
        {"_id": 0},
    ).sort("created_at", -1).to_list(200)

    if not rows:
        now_iso = datetime.now(timezone.utc).isoformat()
        rows = [
            {
                "id": "feat-schedule-booking",
                "title": "Scheduled Rides in Booking",
                "message": "You can now schedule rides directly from booking and manage upcoming rides quickly.",
                "feature_route": "/rider/schedule",
                "audience": "rider",
                "version": "2026.4",
                "created_at": now_iso,
                "is_active": True,
            },
            {
                "id": "feat-live-driver-state",
                "title": "Live Driver Movement Status",
                "message": "Track if your driver is moving or paused in real-time on the trip map.",
                "feature_route": "/rider/tracking",
                "audience": "rider",
                "version": "2026.4",
                "created_at": now_iso,
                "is_active": True,
            },
            {
                "id": "feat-stop-safety-check",
                "title": "Auto Stop Safety Check",
                "message": "If a trip stops abnormally, riders receive a safety prompt and drivers can share stop reasons.",
                "feature_route": "/(rider-tabs)/rider-safety",
                "audience": "all",
                "version": "2026.4",
                "created_at": now_iso,
                "is_active": True,
            },
            {
                "id": "feat-nigeria-scan",
                "title": "Nationwide Area Safety Scan",
                "message": "Area safety check now scans unsafe zones across Nigerian cities, not only Lagos.",
                "feature_route": "/rider/safety-check",
                "audience": "all",
                "version": "2026.4",
                "created_at": now_iso,
                "is_active": True,
            },
        ]
    return {"success": True, "announcements": rows}

# ==================== SMART MATCHING ====================

@support_router.post("/matching/find-driver")
async def find_best_matched_driver(rider_id: str, pickup_lat: float, pickup_lng: float, service_type: str = "economy"):
    rider_prefs = await db.rider_preferences.find_one({"user_id": rider_id})
    rider = await db.users.find_one({"id": rider_id})
    available_drivers = await db.driver_profiles.find({"is_online": True, "verification_status": "approved"}).to_list(50)
    scored_drivers = []
    for driver in available_drivers:
        subscription = await db.subscriptions.find_one({"driver_id": driver.get("user_id"), "status": {"$in": ["active", "trial", "grace_period"]}})
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

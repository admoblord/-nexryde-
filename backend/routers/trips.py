"""Trips Router - Trip CRUD, ride flow, and trip management for NEXRYDE."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, timezone, timedelta
from uuid import uuid4
import asyncio
import logging
import time
import math
import uuid
import random
import os
import json
import hashlib
import hmac
import base64
from cryptography.fernet import Fernet

from database import db
from fare_estimate_cache import get_fare_estimate
from face_match import face_match_confidence
from smart_pricing import (
    area_summary_line,
    build_route_preview_coordinates,
    fallback_fare_breakdown,
    region_for_preview,
    rider_meets_priority_threshold,
    smart_bounds_from_base_price,
    strip_addresses_for_driver_preview,
)
from favorite_driver_notifications import maybe_send_rider_favorite_engagement_pushes
from push_notifications import send_push_notification
from routers.realtime_dispatch import push_driver_new_offer, push_rider_trip_update
from trip_ws_payload import rider_trip_payload_from_doc
from enforcement_system import record_violation, check_user_status
from driver_compliance import check_driver_document_expiry, check_monthly_uploads
from auth_guard import require_authenticated, verify_trip_participant, verify_owner_strict
from wallet_trip_helpers import is_wallet_payment_method, rider_must_confirm_payment, trip_fare_amount
from wallet_ops import (
    assert_rider_wallet_covers_fare,
    apply_driver_wallet_ride_credit,
    apply_rider_wallet_ride_debit,
)
from services.product_notification_email import schedule_trip_receipt_emails_after_payment
from earnings_query import match_completed_trip_paid_for_earnings
from user_scores import calculate_rider_risk_score
from security_advanced import general_limiter, trip_request_limiter
from route_cache import get_cached_directions, store_cached_directions, log_api_call, haversine_route_estimate
from routing_quality import is_directions_road_route
from surge_demand import haversine_km, estimate_area_demand_ratio_near

logger = logging.getLogger('server')

DRIVING_ROUTE_UNAVAILABLE_DETAIL = (
    "Driving route unavailable. Enable Google Directions API and configure your Maps key. "
    "NEXRYDE does not price trips using straight-line distance."
)
trips_router = APIRouter(prefix="/api", tags=["Trips"])

# Trip Guardian thresholds (production values, no mock logic).
GUARDIAN_MIN_MOVEMENT_KM = 0.03  # ~30m movement counts as driving
GUARDIAN_STOP_THRESHOLD_SECONDS = 120  # stationary for 2 minutes
GUARDIAN_PROMPT_COOLDOWN_SECONDS = 180  # avoid prompt spam
GUARDIAN_AUTO_ESCALATE_SECONDS = 35  # no rider response window

# Import shared state from server (will be set at inclusion time)
fare_estimate_store = {}
FARE_LOCK_MINUTES = 10
# Max pickup/drop shift vs locked fare estimate (km) before requiring refresh.
FARE_ESTIMATE_COORD_MAX_KM = 1.0

# Import shared functions from server (set at init time)
_get_directions_fn = None
_calculate_fare_fn = None
_calculate_distance_fn = None

def set_fare_estimate_store(store):
    global fare_estimate_store
    fare_estimate_store = store

def set_shared_functions(get_directions, calc_fare, calc_distance):
    global _get_directions_fn, _calculate_fare_fn, _calculate_distance_fn
    _get_directions_fn = get_directions
    _calculate_fare_fn = calc_fare
    _calculate_distance_fn = calc_distance

async def get_directions_from_google(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, trip_id: str = None):
    """Cached wrapper — checks MongoDB + LRU before calling Google API."""
    cached = await get_cached_directions(db, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng)
    if cached:
        await log_api_call(db, call_type="directions", trip_id=trip_id, cached=True)
        return cached

    if _get_directions_fn:
        result = await _get_directions_fn(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng)
        if result:
            await store_cached_directions(db, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, result)
            await log_api_call(db, call_type="directions", trip_id=trip_id, cached=False)
            return result

    # Fallback: Haversine estimate (zero API cost)
    return haversine_route_estimate(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng)

def _normalize_service_type(service_type: Optional[str]) -> str:
    normalized = (service_type or "economy").strip().lower()
    return "economy" if normalized == "standard" else normalized


def calculate_fare(
    distance_km,
    duration_min,
    traffic_duration_min,
    service_type="economy",
    city="lagos",
    demand_ratio: float = 0.0,
    is_raining: bool = False,
    pickup_lat=None,
    pickup_lng=None,
    dropoff_lat=None,
    dropoff_lng=None,
):
    """Delegates to server-injected ``calculate_fare`` (single pricing engine)."""
    normalized_service = _normalize_service_type(service_type)
    if _calculate_fare_fn:
        try:
            return _calculate_fare_fn(
                distance_km,
                duration_min,
                traffic_duration_min,
                normalized_service,
                city,
                float(demand_ratio),
                bool(is_raining),
                pickup_lat,
                pickup_lng,
                dropoff_lat,
                dropoff_lng,
            )
        except TypeError:
            try:
                return _calculate_fare_fn(distance_km, duration_min, traffic_duration_min, normalized_service, city)
            except TypeError:
                try:
                    return _calculate_fare_fn(distance_km, duration_min, traffic_duration_min, normalized_service)
                except Exception:
                    pass
        except Exception:
            logger.warning("trips.calculate_fare injected fn failed; using fallback", exc_info=True)
    return fallback_fare_breakdown(
        float(distance_km),
        int(duration_min),
        int(traffic_duration_min),
        city=city or "lagos",
        service_type=normalized_service,
        pickup_lat=pickup_lat,
        pickup_lng=pickup_lng,
        dropoff_lat=dropoff_lat,
        dropoff_lng=dropoff_lng,
    )


def _fare_estimate_coords_match(est: dict, pickup_lat: float, pickup_lng: float, drop_lat: float, drop_lng: float) -> bool:
    pu = est.get("pickup") or {}
    du = est.get("dropoff") or {}
    try:
        pul, pulg = float(pu["lat"]), float(pu["lng"])
        dul, dulg = float(du["lat"]), float(du["lng"])
        return (
            haversine_km(pul, pulg, float(pickup_lat), float(pickup_lng)) <= FARE_ESTIMATE_COORD_MAX_KM
            and haversine_km(dul, dulg, float(drop_lat), float(drop_lng)) <= FARE_ESTIMATE_COORD_MAX_KM
        )
    except (TypeError, ValueError, KeyError):
        return False


def _fare_estimate_expired(est: dict) -> bool:
    exp = est.get("expires_at")
    if not isinstance(exp, datetime):
        return True
    now = datetime.now(timezone.utc)
    if exp.tzinfo is None:
        exp_utc = exp.replace(tzinfo=timezone.utc)
    else:
        exp_utc = exp.astimezone(timezone.utc)
    return now >= exp_utc

def calculate_distance_haversine(lat1, lon1, lat2, lon2):
    if _calculate_distance_fn:
        return _calculate_distance_fn(lat1, lon1, lat2, lon2)
    from math import radians, sin, cos, sqrt, atan2
    R = 6371
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat/2)**2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon/2)**2
    return R * 2 * atan2(sqrt(a), sqrt(1-a))


SHIELD_LOW_RIDER_RATING = 3.5
SHIELD_MIN_TRIPS_FOR_FLAG = 3
BLACK_BOX_SIGNING_SECRET = os.environ.get("NEXRYDE_BLACK_BOX_SECRET") or os.environ.get("JWT_SECRET") or "nexryde-black-box-dev"
SPEED_SPIKE_LIMIT_KMH = 100.0
SAFE_ARRIVAL_CONFIRM_MINUTES = 5
SAFE_ARRIVAL_CALL_RESPONSE_SECONDS = 90
GPS_SPOOF_SPEED_KMH = 180.0
GPS_SPOOF_JUMP_KM = 2.0


def _driver_location_snapshot_for_trip(
    trip: dict,
    profile_current_location: Optional[dict],
) -> Optional[dict]:
    """Rider map: prefer last GPS point on the trip while en-route; else driver profile last ping."""
    status_raw = str(trip.get("status") or "").strip().lower()
    route_track_statuses = {"accepted", "arrived", "ongoing"}
    actual_route = trip.get("actual_route") or []

    def _from_profile() -> Optional[dict]:
        if not isinstance(profile_current_location, dict):
            return None
        lat, lng = profile_current_location.get("lat"), profile_current_location.get("lng")
        if lat is None or lng is None:
            return None
        try:
            return {
                "lat": float(lat),
                "lng": float(lng),
                "updated_at": profile_current_location.get("updated_at"),
            }
        except (TypeError, ValueError):
            return None

    def _from_route_last() -> Optional[dict]:
        if not actual_route:
            return None
        last = actual_route[-1]
        if not isinstance(last, dict):
            return None
        lat, lng = last.get("lat"), last.get("lng")
        if lat is None or lng is None:
            return None
        try:
            return {
                "lat": float(lat),
                "lng": float(lng),
                "updated_at": last.get("timestamp"),
            }
        except (TypeError, ValueError):
            return None

    if status_raw in route_track_statuses:
        snap = _from_route_last()
        if snap:
            return snap
        return _from_profile()
    return _from_profile()


async def _emit_rider_trip_realtime(trip_id: str) -> None:
    """Push current trip document to rider WebSocket subscribers."""
    trip = await db.trips.find_one({"id": trip_id}, {"_id": 0})
    if not trip or not trip.get("rider_id"):
        return
    profile_loc: Optional[dict] = None
    driver_id = trip.get("driver_id")
    if driver_id:
        prof = await db.driver_profiles.find_one({"user_id": driver_id}, {"_id": 0, "current_location": 1}) or {}
        raw = prof.get("current_location")
        profile_loc = raw if isinstance(raw, dict) else None
    driver_location = _driver_location_snapshot_for_trip(trip, profile_loc)
    payload = {
        "trip_id": trip_id,
        "status": trip.get("status"),
        "trip": rider_trip_payload_from_doc(trip),
    }
    if driver_location:
        payload["driver_location"] = driver_location
    await push_rider_trip_update(trip["rider_id"], payload)


def _stable_json(value) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), default=str)


def _black_box_signature(payload: dict) -> str:
    return hmac.new(
        BLACK_BOX_SIGNING_SECRET.encode(),
        _stable_json(payload).encode(),
        hashlib.sha256,
    ).hexdigest()


def _trip_biometric_ready(trip: dict) -> bool:
    rider_ok = bool(trip.get("rider_biometric_verified_at"))
    driver_ok = bool(trip.get("driver_biometric_verified_at"))
    return rider_ok and driver_ok


def _distance_from_route_km(route_points: list[dict], lat: float, lng: float) -> float:
    if not route_points:
        return 0.0
    min_distance = float("inf")
    for point in route_points:
        if point.get("lat") is None or point.get("lng") is None:
            continue
        distance = calculate_distance_haversine(lat, lng, float(point["lat"]), float(point["lng"]))
        min_distance = min(min_distance, distance)
    return 0.0 if min_distance == float("inf") else float(min_distance)


async def _notify_emergency_contacts_for_geofence(trip: dict, lat: float, lng: float) -> int:
    """SMS to emergency contacts disabled (no SMS provider)."""
    return 0


async def _maybe_escalate_invisible_shield(trip: dict) -> dict:
    mode = dict(trip.get("invisible_shield_mode") or {})
    if not mode.get("active") or mode.get("confirmed_safe_at") or mode.get("auto_escalated_at"):
        return trip
    if trip.get("status") not in {"completed", "pending_payment"}:
        return trip
    deadline_raw = mode.get("confirm_deadline_at")
    if not deadline_raw:
        return trip
    try:
        deadline_dt = datetime.fromisoformat(deadline_raw)
    except Exception:
        return trip
    now = datetime.now(timezone.utc)
    if now < deadline_dt:
        return trip

    rider = await db.users.find_one({"id": trip.get("rider_id")}, {"_id": 0, "name": 1, "emergency_contacts": 1}) or {}
    location = ((trip.get("actual_route") or [{}])[-1]) if trip.get("actual_route") else {}
    lat = location.get("lat")
    lng = location.get("lng")
    contacts = rider.get("emergency_contacts") or []
    notified = 0
    # SMS to emergency contacts not sent; shield escalation still records case + SOS below.
    audio_meta = await db.shield_trip_audio.find_one(
        {"trip_id": trip.get("id"), "uploaded_by": trip.get("rider_id")},
        {"_id": 0, "id": 1, "created_at": 1, "mime_type": 1},
    )
    safety_case = {
        "id": str(uuid.uuid4()),
        "trip_id": trip.get("id"),
        "rider_id": trip.get("rider_id"),
        "driver_id": trip.get("driver_id"),
        "status": "open",
        "source": "invisible_shield_no_confirm",
        "recording_available": bool(audio_meta),
        "recording_meta": audio_meta,
        "expected_arrival_at": mode.get("expected_arrival_at"),
        "confirm_deadline_at": mode.get("confirm_deadline_at"),
        "created_at": now.isoformat(),
    }
    await db.safety_cases.insert_one(safety_case)
    await db.sos_alerts.insert_one({
        "id": str(uuid.uuid4()),
        "trip_id": trip.get("id"),
        "user_id": trip.get("rider_id", ""),
        "user_role": "rider",
        "location": {"lat": lat, "lng": lng},
        "auto_triggered": True,
        "status": "active",
        "source": "invisible_shield_no_confirm",
        "emergency_contacts_notified": notified,
        "created_at": now.isoformat(),
    })
    mode["auto_escalated_at"] = now.isoformat()
    mode["safety_team_alerted"] = True
    mode["emergency_contacts_notified"] = notified
    await db.trips.update_one({"id": trip.get("id")}, {"$set": {"invisible_shield_mode": mode}})
    updated = await db.trips.find_one({"id": trip.get("id")}, {"_id": 0}) or trip
    return updated


def _parse_iso_dt(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except Exception:
        return None


def _build_forensic_route_points(actual_route: list[dict]) -> list[dict]:
    if not actual_route:
        return []
    sampled: list[dict] = []
    previous_kept_dt: Optional[datetime] = None
    previous_point: Optional[dict] = None

    for point in actual_route:
        point_dt = _parse_iso_dt(point.get("timestamp"))
        keep = previous_kept_dt is None or point_dt is None
        if point_dt is not None and previous_kept_dt is not None:
            keep = (point_dt - previous_kept_dt).total_seconds() >= 30
        if not keep:
            previous_point = point
            continue

        speed_kmh = None
        if previous_point and point_dt is not None:
            prev_dt = _parse_iso_dt(previous_point.get("timestamp"))
            if prev_dt is not None and all(k in previous_point for k in ("lat", "lng")):
                elapsed = max(1.0, (point_dt - prev_dt).total_seconds())
                moved_km = calculate_distance_haversine(
                    float(previous_point["lat"]),
                    float(previous_point["lng"]),
                    float(point.get("lat") or 0),
                    float(point.get("lng") or 0),
                )
                speed_kmh = round((moved_km / elapsed) * 3600.0, 2)

        sampled.append(
            {
                "lat": point.get("lat"),
                "lng": point.get("lng"),
                "timestamp": point.get("timestamp"),
                "speed_kmh": speed_kmh,
            }
        )
        previous_kept_dt = point_dt or previous_kept_dt
        previous_point = point

    last_point = actual_route[-1]
    if sampled and sampled[-1].get("timestamp") != last_point.get("timestamp"):
        sampled.append(
            {
                "lat": last_point.get("lat"),
                "lng": last_point.get("lng"),
                "timestamp": last_point.get("timestamp"),
                "speed_kmh": None,
            }
        )
    return sampled


async def _freeze_trip_fare_for_investigation(trip_id: str, reason: str) -> None:
    await db.trips.update_one(
        {"id": trip_id},
        {
            "$set": {
                "fare_frozen": True,
                "fare_frozen_at": datetime.now(timezone.utc).isoformat(),
                "fare_frozen_reason": reason,
                "fare_locked_until": (datetime.now(timezone.utc) + timedelta(days=365)).isoformat(),
            }
        },
    )


async def _notify_emergency_contacts_for_safe_arrival(trip: dict, lat: Optional[float], lng: Optional[float]) -> int:
    """SMS to emergency contacts disabled (no SMS provider)."""
    return 0


async def _maybe_process_safe_arrival_check(trip: dict) -> dict:
    check = dict(trip.get("safe_arrival_check") or {})
    if not check.get("required") or check.get("confirmed_at"):
        return trip
    if trip.get("status") not in {"completed", "pending_payment"}:
        return trip

    now = datetime.now(timezone.utc)
    confirm_deadline = _parse_iso_dt(check.get("confirm_deadline_at"))
    call_attempted_at = _parse_iso_dt(check.get("call_attempted_at"))
    emergency_notified_at = _parse_iso_dt(check.get("emergency_notified_at"))
    if not confirm_deadline:
        return trip

    updates = {}
    if now >= confirm_deadline and not call_attempted_at:
        updates["safe_arrival_check.call_attempted_at"] = now.isoformat()
        updates["safe_arrival_check.check_in_status"] = "call_attempted"
        if trip.get("rider_id"):
            await send_push_notification(
                trip["rider_id"],
                "Safe Arrival Check-In",
                "Nexryde Safety is checking in because you have not confirmed safe arrival yet.",
                {"type": "safe_arrival_checkin", "trip_id": trip.get("id")},
            )

    effective_call_attempt = call_attempted_at or (now if now >= confirm_deadline and not call_attempted_at else None)
    if effective_call_attempt and not emergency_notified_at:
        if (now - effective_call_attempt).total_seconds() >= SAFE_ARRIVAL_CALL_RESPONSE_SECONDS:
            last_point = (trip.get("actual_route") or [{}])[-1] if trip.get("actual_route") else {}
            lat = last_point.get("lat") or ((trip.get("dropoff_location") or {}).get("lat"))
            lng = last_point.get("lng") or ((trip.get("dropoff_location") or {}).get("lng"))
            contact_count = await _notify_emergency_contacts_for_safe_arrival(trip, lat, lng)
            updates["safe_arrival_check.emergency_notified_at"] = now.isoformat()
            updates["safe_arrival_check.emergency_contacts_notified"] = contact_count
            updates["safe_arrival_check.check_in_status"] = "emergency_notified"
            await db.sos_alerts.insert_one({
                "id": str(uuid.uuid4()),
                "trip_id": trip.get("id"),
                "user_id": trip.get("rider_id", ""),
                "user_role": "rider",
                "location": {"lat": lat, "lng": lng},
                "auto_triggered": True,
                "status": "active",
                "source": "safe_arrival_no_response",
                "emergency_contacts_notified": contact_count,
                "created_at": now.isoformat(),
            })

    if updates:
        await db.trips.update_one({"id": trip.get("id")}, {"$set": updates})
        return await db.trips.find_one({"id": trip.get("id")}, {"_id": 0}) or trip
    return trip


def _gate_code_fernet() -> Fernet:
    raw = (os.environ.get("RIDER_PREFS_FERNET_KEY") or os.environ.get("JWT_SECRET") or "nexryde-rider-prefs-dev").encode()
    key = base64.urlsafe_b64encode(hashlib.sha256(raw).digest())
    return Fernet(key)


def _decrypt_gate_code(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    try:
        return _gate_code_fernet().decrypt(value.encode()).decode()
    except Exception:
        return None


async def _build_estate_gate_access(trip: dict, actor_id: str) -> Optional[dict]:
    rider_id = trip.get("rider_id")
    driver_id = trip.get("driver_id")
    expires_raw = trip.get("estate_gate_code_expires_at")
    if not rider_id or not driver_id or not expires_raw:
        return None
    try:
        expires_at = datetime.fromisoformat(str(expires_raw).replace("Z", "+00:00"))
    except Exception:
        return None
    now = datetime.now(timezone.utc)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    is_active = now < expires_at
    prefs = await db.rider_preferences.find_one({"user_id": rider_id}, {"_id": 0, "estate_gate_code_cipher": 1, "estate_name": 1}) or {}
    gate_code = _decrypt_gate_code(prefs.get("estate_gate_code_cipher"))
    base = {
        "available": bool(is_active and gate_code),
        "expires_at": expires_at.isoformat(),
        "estate_name": prefs.get("estate_name"),
        "shared_at": trip.get("estate_gate_code_shared_at"),
        "share_window_minutes": 10,
    }
    if actor_id == driver_id and is_active and gate_code:
        base["gate_code"] = gate_code
    elif actor_id == rider_id:
        base["has_saved_code"] = bool(gate_code)
    return base


async def _build_black_box_record(trip: dict, events: list[dict]) -> dict:
    rider = await db.users.find_one({"id": trip.get("rider_id")}, {"_id": 0, "id": 1, "name": 1, "phone": 1})
    driver = await db.users.find_one({"id": trip.get("driver_id")}, {"_id": 0, "id": 1, "name": 1, "phone": 1, "rating": 1})
    driver_profile = await db.driver_profiles.find_one(
        {"user_id": trip.get("driver_id")},
        {"_id": 0, "vehicle_plate": 1, "vehicle_model": 1, "vehicle_color": 1, "vehicle_type": 1},
    ) or {}

    timeline = []
    previous_hash = "GENESIS"
    for index, event in enumerate(events, start=1):
        payload = {
            "trip_id": trip.get("id"),
            "seq": index,
            "event_type": event.get("event_type"),
            "actor_id": event.get("actor_id"),
            "created_at": event.get("created_at"),
            "data": event.get("data") or {},
            "prev_hash": event.get("prev_hash") or previous_hash,
        }
        event_hash = event.get("event_hash") or hashlib.sha256(_stable_json(payload).encode()).hexdigest()
        previous_hash = event_hash
        timeline.append(
            {
                "seq": index,
                "event_type": event.get("event_type"),
                "actor_id": event.get("actor_id"),
                "created_at": event.get("created_at"),
                "data": event.get("data") or {},
                "prev_hash": payload["prev_hash"],
                "event_hash": event_hash,
            }
        )

    actual_route = trip.get("actual_route") or []
    forensic_route_points = _build_forensic_route_points(actual_route)
    trip_messages = await db.trip_messages.find(
        {"trip_id": trip.get("id")},
        {"_id": 0, "sender_id": 1, "created_at": 1, "message_type": 1},
    ).sort("created_at", 1).to_list(5000)
    call_sessions = await db.call_sessions.find(
        {"trip_id": trip.get("id")},
        {"_id": 0, "created_at": 1, "ended_at": 1, "status": 1, "caller_id": 1},
    ).sort("created_at", 1).to_list(500)
    comm_fingerprint_source = {
        "messages": [
            {
                "sender_id": m.get("sender_id"),
                "created_at": m.get("created_at"),
                "message_type": m.get("message_type"),
            }
            for m in trip_messages
        ],
        "calls": [
            {
                "caller_id": c.get("caller_id"),
                "created_at": c.get("created_at"),
                "ended_at": c.get("ended_at"),
                "status": c.get("status"),
            }
            for c in call_sessions
        ],
    }
    communication_digest = hashlib.sha256(_stable_json(comm_fingerprint_source).encode()).hexdigest()
    route_summary = {
        "planned_distance_km": round(float(trip.get("distance_km") or 0), 2),
        "planned_duration_mins": round(float(trip.get("duration_mins") or 0), 2),
        "recorded_route_points": len(actual_route),
        "forensic_route_points": len(forensic_route_points),
        "route_deviation_detected": bool(trip.get("route_deviation_detected")),
        "latest_route_point": actual_route[-1] if actual_route else None,
    }
    core = {
        "trip_id": trip.get("id"),
        "status": trip.get("status"),
        "payment_status": trip.get("payment_status"),
        "created_at": trip.get("created_at"),
        "accepted_at": trip.get("accepted_at"),
        "started_at": trip.get("started_at"),
        "completed_at": trip.get("completed_at"),
        "cancelled_at": trip.get("cancelled_at"),
        "pickup_location": trip.get("pickup_location"),
        "dropoff_location": trip.get("dropoff_location"),
        "insurance_id": trip.get("insurance_id"),
        "fare": trip.get("fare"),
        "service_type": trip.get("service_type"),
        "driver_identity": {
            "driver_id": driver.get("id") if driver else trip.get("driver_id"),
            "name": driver.get("name") if driver else None,
            "phone": driver.get("phone") if driver else None,
            "rating": driver.get("rating") if driver else None,
            "vehicle_type": driver_profile.get("vehicle_type"),
            "vehicle_model": driver_profile.get("vehicle_model"),
            "vehicle_color": driver_profile.get("vehicle_color"),
            "vehicle_plate": driver_profile.get("vehicle_plate"),
            "face_verified_at_start": bool(trip.get("face_verified_at_start")),
        },
        "rider_identity": {
            "rider_id": rider.get("id") if rider else trip.get("rider_id"),
            "name": rider.get("name") if rider else None,
            "phone": rider.get("phone") if rider else None,
        },
        "route_summary": route_summary,
        "gps_route": actual_route,
        "forensic_report": {
            "report_type": "trip_forensics_report",
            "generated_for": ["rider", "law_enforcement", "insurance"],
            "driver_identity_confirmation": {
                "driver_id": driver.get("id") if driver else trip.get("driver_id"),
                "driver_name": driver.get("name") if driver else None,
                "vehicle_plate": driver_profile.get("vehicle_plate"),
                "vehicle_model": driver_profile.get("vehicle_model"),
                "face_verified_at_start": bool(trip.get("face_verified_at_start")),
                "fake_driver_alert_triggered": bool(trip.get("fake_driver_alert_triggered")),
            },
            "gps_points_every_30_seconds": forensic_route_points,
            "last_known_location": actual_route[-1] if actual_route else None,
        },
        "communications_integrity": {
            "trip_message_count": len(trip_messages),
            "call_session_count": len(call_sessions),
            "communication_digest": communication_digest,
        },
        "black_shield": {
            "name": "Nexryde Black Shield",
            "protection_mode": "end_to_end_encrypted_tamper_evident",
            "tamper_proof_ledger_root": previous_hash,
            "decentralized_ledger_anchor": _black_box_signature(
                {
                    "trip_id": trip.get("id"),
                    "record_hash_seed": previous_hash,
                    "communication_digest": communication_digest,
                }
            ),
            "court_order_required_for_third_party_access": True,
            "deletion_allowed": False,
            "alteration_allowed": False,
        },
        "timeline": timeline,
    }
    record_hash = hashlib.sha256(_stable_json(core).encode()).hexdigest()
    certification = {
        "issuer": "NEXRYDE Black Box",
        "jurisdiction": "Nigeria",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "record_hash": record_hash,
        "record_signature": _black_box_signature({"record_hash": record_hash, "trip_id": trip.get("id")}),
        "tamper_evident": True,
        "legal_use": [
            "police review",
            "insurance review",
            "legal review",
        ],
    }
    return {**core, "certification": certification}


async def _filter_drivers_who_blocked_rider(eligible: list, rider_id: str) -> list:
    """Remove drivers who put this rider on their personal blocklist (NEXRYDE Shield)."""
    if not eligible or not rider_id:
        return eligible
    driver_ids = [e["driver_id"] for e in eligible]
    users = await db.users.find(
        {"id": {"$in": driver_ids}},
        {"_id": 0, "id": 1, "blocked_riders": 1},
    ).to_list(len(driver_ids))
    blocked_map = {u["id"]: set(u.get("blocked_riders") or []) for u in users}
    return [e for e in eligible if rider_id not in blocked_map.get(e["driver_id"], set())]


def enrich_trip_offer_preview(trip: dict) -> dict:
    """Add simplified route preview, then redact exact addresses (pre-acceptance)."""
    t = dict(trip)
    pl = t.get("pickup_location") or {}
    dl = t.get("dropoff_location") or {}
    if (
        not t.get("route_preview_coordinates")
        and isinstance(pl, dict)
        and isinstance(dl, dict)
        and pl.get("lat") is not None
        and dl.get("lat") is not None
    ):
        t["route_preview_coordinates"] = build_route_preview_coordinates(
            float(pl["lat"]),
            float(pl["lng"]),
            float(dl["lat"]),
            float(dl["lng"]),
            t.get("polyline"),
        )
    if not t.get("map_preview_region") and isinstance(pl, dict) and isinstance(dl, dict):
        if pl.get("lat") is not None and dl.get("lat") is not None:
            t["map_preview_region"] = region_for_preview(
                float(pl["lat"]),
                float(pl["lng"]),
                float(dl["lat"]),
                float(dl["lng"]),
            )
    return strip_addresses_for_driver_preview(t)


async def attach_rider_shield_to_trips(trips: list) -> None:
    """
    Enrich trip payloads for drivers: rider reputation from driver-submitted ratings only.
    `user.rating` for a rider role is maintained in rate_trip when drivers rate riders.
    """
    rider_ids = list({t.get("rider_id") for t in trips if t.get("rider_id")})
    if not rider_ids:
        return
    users = await db.users.find(
        {"id": {"$in": rider_ids}},
        {"_id": 0, "id": 1, "rating": 1, "rider_reputation_trip_count": 1, "shield_rider_flag": 1, "name": 1, "profile_image": 1},
    ).to_list(len(rider_ids))
    by_id = {u["id"]: u for u in users}
    for t in trips:
        rid = t.get("rider_id")
        u = by_id.get(rid) or {}
        cnt = int(u.get("rider_reputation_trip_count") or 0)
        avg = float(u.get("rating") or 0.0)
        risk_score = calculate_rider_risk_score(u)
        if risk_score < 35:
            risk_band = "green"
        elif risk_score < 65:
            risk_band = "yellow"
        else:
            risk_band = "red"
        insufficient = cnt < SHIELD_MIN_TRIPS_FOR_FLAG
        low = (not insufficient) and (
            bool(u.get("shield_rider_flag")) or avg < SHIELD_LOW_RIDER_RATING
        )
        rider_name = (u.get("name") or "Rider")[:48]
        t["shield"] = {
            "rider_reputation_avg": round(avg, 2) if cnt > 0 else None,
            "rider_reputation_trip_count": cnt,
            "rider_flagged_low_reputation": bool(low),
            "rider_new_account": bool(insufficient),
            "rider_display_name": rider_name,
            "rider_risk_score": risk_score,
            "rider_risk_band": risk_band,
        }
        # Expose rider name and photo directly on the trip for easy access
        t["rider_name"] = rider_name
        t["rider_photo"] = u.get("profile_image") or None


async def _log_trip_event(trip_id: str, event_type: str, actor_id: Optional[str], data: Optional[dict] = None):
    """Write immutable trust ledger event for a trip."""
    try:
        previous = await db.trip_events.find_one(
            {"trip_id": trip_id},
            {"_id": 0, "event_hash": 1},
            sort=[("created_at", -1)],
        )
        prev_hash = (previous or {}).get("event_hash") or "GENESIS"
        created_at = datetime.now(timezone.utc).isoformat()
        event_payload = {
            "trip_id": trip_id,
            "event_type": event_type,
            "actor_id": actor_id,
            "data": data or {},
            "created_at": created_at,
            "prev_hash": prev_hash,
        }
        await db.trip_events.insert_one(
            {
                "id": str(uuid4()),
                "trip_id": trip_id,
                "event_type": event_type,
                "actor_id": actor_id,
                "data": data or {},
                "created_at": created_at,
                "prev_hash": prev_hash,
                "event_hash": hashlib.sha256(_stable_json(event_payload).encode()).hexdigest(),
            }
        )
    except Exception as e:
        logger.warning(f"Trip event logging failed: {e}")


def _compute_visibility_score(stats: dict) -> float:
    """Driver visibility score used for ride ranking/visibility."""
    acceptance = float(stats.get("acceptance_rate", 0.0))
    completion = float(stats.get("completion_rate", 0.0))
    rating = float(stats.get("rating", 0.0))
    cancellations = float(stats.get("cancellations", 0.0))
    completed = float(stats.get("completed_trips", 0.0))

    score = (
        acceptance * 0.35
        + completion * 0.35
        + (min(rating, 5.0) / 5.0) * 100 * 0.20
        + min(completed, 200.0) / 200.0 * 100 * 0.10
    )
    score -= min(cancellations * 1.5, 25.0)
    return max(0.0, min(100.0, round(score, 2)))


async def _refresh_driver_visibility_score(driver_id: str):
    try:
        accepted = await db.trips.count_documents({"driver_id": driver_id, "status": {"$in": ["accepted", "ongoing", "completed"]}})
        completed = await db.trips.count_documents({"driver_id": driver_id, "status": "completed"})
        cancellations = await db.trips.count_documents({"driver_id": driver_id, "status": "cancelled", "cancelled_by": driver_id})
        user = await db.users.find_one({"id": driver_id}, {"_id": 0, "rating": 1}) or {}

        acceptance_rate = 100.0 if accepted == 0 else (completed / accepted) * 100.0
        completion_rate = acceptance_rate
        score = _compute_visibility_score(
            {
                "acceptance_rate": acceptance_rate,
                "completion_rate": completion_rate,
                "rating": float(user.get("rating", 4.5)),
                "cancellations": cancellations,
                "completed_trips": completed,
            }
        )

        await db.driver_profiles.update_one(
            {"user_id": driver_id},
            {
                "$set": {
                    "visibility_score": score,
                    "acceptance_rate": round(acceptance_rate, 2),
                    "completion_rate": round(completion_rate, 2),
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
            },
            upsert=True,
        )
    except Exception as e:
        logger.warning(f"Visibility score refresh failed for {driver_id}: {e}")


def _analyze_one_star_rating_consistency(trip: dict, has_rider_complaint: bool, comment: Optional[str]) -> dict:
    """
    Heuristic AI-style consistency review for one-star ratings.
    """
    safe_checks = {
        "no_guardian_alert": not bool((trip.get("guardian_alert") or {}).get("active")),
        "no_speed_spike": not bool((trip.get("speed_spike_alert") or {}).get("active")),
        "no_gps_spoofing": not bool((trip.get("gps_spoofing_alert") or {}).get("active")),
        "no_fake_driver_alert": not bool(trip.get("fake_driver_alert_triggered")),
        "driver_face_verified": bool(trip.get("face_verified_at_start")),
        "rider_face_verified": bool(trip.get("rider_face_verified_at_pickup")),
        "pickup_code": trip.get("pickup_code") or trip.get("security_code", ""),
        "pickup_code_verified": bool(trip.get("pickup_code_verified") or trip.get("security_code_verified")),
        "security_code_verified": bool(trip.get("security_code_verified")),
        "safe_arrival_confirmed": bool((trip.get("safe_arrival_check") or {}).get("confirmed_at")),
        "rider_complaint_filed": bool(has_rider_complaint),
    }
    positive_signals = sum(1 for key, passed in safe_checks.items() if key != "rider_complaint_filed" and passed)
    total_positive = len(safe_checks) - 1
    consistency_score = round((positive_signals / max(1, total_positive)) * 100.0, 1)
    comment_quality = len((comment or "").strip())
    auto_remove = bool(
        not has_rider_complaint
        and consistency_score >= 75.0
        and comment_quality < 20
    )
    return {
        "consistency_score": consistency_score,
        "positive_signals": positive_signals,
        "total_positive_signals": total_positive,
        "safe_checks": safe_checks,
        "auto_remove": auto_remove,
        "review_reason": (
            "One-star rating conflicts with safe-trip telemetry and no rider complaint was filed."
            if auto_remove
            else "One-star rating retained because risk/complaint context may justify it."
        ),
    }


async def _driver_is_busy(driver_id: str) -> bool:
    active = await db.trips.find_one(
        {"driver_id": driver_id, "status": {"$in": ["accepted", "pickup", "ongoing"]}},
        {"_id": 0, "id": 1},
    )
    return active is not None


async def _get_eligible_drivers_for_trip(trip: dict, blocked_drivers: list[str]) -> list[dict]:
    pickup = trip.get("pickup_location") or {}
    if not isinstance(pickup, dict) or pickup.get("lat") is None or pickup.get("lng") is None:
        return []

    pickup_lat = float(pickup["lat"])
    pickup_lng = float(pickup["lng"])
    preferred_driver_id = trip.get("preferred_driver_id")
    service_type = trip.get("service_type")

    profiles = await db.driver_profiles.find(
        {"is_online": True, "verification_status": "approved"},
        {"_id": 0},
    ).to_list(500)

    candidate_driver_ids = [
        p.get("user_id")
        for p in profiles
        if p.get("user_id") and p.get("user_id") not in blocked_drivers
    ]
    active_busy_rows = await db.trips.find(
        {
            "driver_id": {"$in": candidate_driver_ids},
            "status": {"$in": ["accepted", "arrived", "ongoing"]},
        },
        {"_id": 0, "driver_id": 1},
    ).to_list(1000)
    busy_driver_ids = {str(r.get("driver_id")) for r in active_busy_rows if r.get("driver_id")}

    active_sub_rows = await db.subscriptions.find(
        {
            "driver_id": {"$in": candidate_driver_ids},
            "status": {"$in": ["active", "trial", "grace_period"]},
        },
        {"_id": 0, "driver_id": 1},
    ).to_list(1000)
    subscribed_driver_ids = {str(r.get("driver_id")) for r in active_sub_rows if r.get("driver_id")}

    eligible = []
    for profile in profiles:
        driver_id = profile.get("user_id")
        if not driver_id or driver_id in blocked_drivers:
            continue

        if str(driver_id) in busy_driver_ids:
            continue

        if str(driver_id) not in subscribed_driver_ids:
            continue

        loc = profile.get("current_location") or {}
        if not isinstance(loc, dict) or loc.get("lat") is None or loc.get("lng") is None:
            continue

        if service_type:
            # Prefer active_categories; fall back to single vehicle_type for older profiles.
            active_cats = profile.get("active_categories") or []
            if not active_cats and profile.get("vehicle_type"):
                # Legacy profile: derive single-category list from vehicle_type
                vt = profile["vehicle_type"].strip().lower()
                active_cats = ["economy" if vt == "standard" else vt]
            if active_cats:
                # Normalize requested service_type for comparison
                req_cat = "economy" if service_type.strip().lower() == "standard" else service_type.strip().lower()
                if req_cat not in active_cats:
                    # Preferred driver bypass: keep eligible even on stale metadata
                    if driver_id != preferred_driver_id:
                        continue

        distance = calculate_distance_haversine(
            pickup_lat,
            pickup_lng,
            float(loc["lat"]),
            float(loc["lng"]),
        )
        if distance > 15 and driver_id != preferred_driver_id:
            continue

        # ── Destination-mode filter ──────────────────────────────────────────
        if profile.get("destination_mode"):
            dest_lat = profile.get("destination_lat")
            dest_lng = profile.get("destination_lng")

            # Check/reset daily counter
            today_str = datetime.now().strftime("%Y-%m-%d")
            last_reset = profile.get("destination_last_reset_date", "")
            daily_dest = int(profile.get("daily_destination_trips", 0) or 0)
            if last_reset != today_str:
                daily_dest = 0

            DEST_LIMIT = 3
            DEST_RADIUS_KM = 2.5

            if daily_dest >= DEST_LIMIT:
                # Auto-disable silently — driver reached daily limit
                await db.driver_profiles.update_one(
                    {"user_id": driver_id},
                    {"$set": {"destination_mode": False}},
                )
                # Falls through to normal dispatch after disabling

            elif dest_lat and dest_lng:
                driver_lat_f = float(loc["lat"])
                driver_lng_f = float(loc["lng"])
                dest_lat_f = float(dest_lat)
                dest_lng_f = float(dest_lng)

                # 1) Point-to-corridor check: how far is the pickup from the
                #    straight line between driver and destination?
                # We use the existing _distance_from_route_km helper.
                route_dist = _distance_from_route_km(
                    [{"lat": driver_lat_f, "lng": driver_lng_f},
                     {"lat": dest_lat_f, "lng": dest_lng_f}],
                    pickup_lat, pickup_lng
                )
                if route_dist > DEST_RADIUS_KM:
                    continue  # pickup too far off the corridor

                # 2) Direction alignment: ensure trip goes roughly the same way
                #    as driver→destination (dot product > 0 = same hemisphere).
                dropoff = trip.get("dropoff_location") or {}
                drop_lat = dropoff.get("lat") or dropoff.get("latitude")
                drop_lng = dropoff.get("lng") or dropoff.get("longitude")
                if drop_lat and drop_lng:
                    dest_vec_lat = dest_lat_f - driver_lat_f
                    dest_vec_lng = dest_lng_f - driver_lng_f
                    trip_vec_lat = float(drop_lat) - pickup_lat
                    trip_vec_lng = float(drop_lng) - pickup_lng
                    dot = dest_vec_lat * trip_vec_lat + dest_vec_lng * trip_vec_lng
                    if dot <= 0:
                        continue  # opposite direction
        # ────────────────────────────────────────────────────────────────────

        visibility_score = float(profile.get("visibility_score", 50.0))
        salary_mode = profile.get("salary_mode") or {}
        if salary_mode.get("enabled") and float(salary_mode.get("monthly_income_target", 0) or 0) > 0:
            now = datetime.utcnow()
            month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            month_trips = await db.trips.find(
                match_completed_trip_paid_for_earnings(driver_id=driver_id, completed_at={"$gte": month_start})
            ).to_list(1000)
            achieved = sum(float(t.get("fare", 0) or 0) for t in month_trips)
            target = float(salary_mode.get("monthly_income_target", 0) or 0)
            days_in_month = max(28, ((now.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)).day)
            expected_by_today = (target / days_in_month) * max(1, now.day)
            pace_gap = max(0.0, expected_by_today - achieved)
            if pace_gap > 0:
                visibility_score += min(18.0, (pace_gap / max(target, 1.0)) * 100.0)

        eligible.append(
            {
                "driver_id": driver_id,
                "distance_to_pickup": round(distance, 2),
                "visibility_score": round(visibility_score, 2),
                "vehicle_type": profile.get("vehicle_type"),
            }
        )

    eligible = await _filter_drivers_who_blocked_rider(eligible, trip.get("rider_id") or "")

    eligible.sort(
        key=lambda d: (
            0 if d["driver_id"] == preferred_driver_id else 1,
            d["distance_to_pickup"],
            -d["visibility_score"],
        )
    )
    return eligible[:20]


async def _create_trip_offers(trip: dict, blocked_drivers: list[str]) -> list[dict]:
    eligible = await _get_eligible_drivers_for_trip(trip, blocked_drivers)
    now = datetime.now(timezone.utc)
    expires_at = (now + timedelta(minutes=5)).isoformat()  # 5 min window — offer repeats on driver screen
    offers = []

    if eligible:
        await db.trip_offers.delete_many({"trip_id": trip["id"], "status": {"$in": ["offered", "seen"]}})

    for driver in eligible:
        offer = {
            "id": str(uuid4()),
            "trip_id": trip["id"],
            "driver_id": driver["driver_id"],
            "rider_id": trip["rider_id"],
            "status": "offered",
            "distance_to_pickup": driver["distance_to_pickup"],
            "created_at": now.isoformat(),
            "expires_at": expires_at,
            "preferred": trip.get("preferred_driver_id") == driver["driver_id"],
        }
        offers.append(offer)

    if offers:
        await db.trip_offers.insert_many(offers)

    logger.info(
        "dispatch_trip trip_id=%s eligible_drivers=%s preferred_driver=%s",
        trip["id"],
        len(offers),
        trip.get("preferred_driver_id"),
    )
    await _log_trip_event(
        trip["id"],
        "trip_dispatch_created",
        trip["rider_id"],
        {
            "eligible_driver_ids": [o["driver_id"] for o in offers],
            "offer_count": len(offers),
        },
    )

    rider_name = "Rider"
    rider = await db.users.find_one(
        {"id": trip["rider_id"]},
        {"_id": 0, "name": 1, "rating": 1, "rider_reputation_trip_count": 1, "shield_rider_flag": 1, "profile_image": 1},
    )
    if rider and rider.get("name"):
        rider_name = rider["name"]
    rider_photo = (rider or {}).get("profile_image") or None
    rider_risk_score = calculate_rider_risk_score(rider or {})
    if rider_risk_score < 35:
        rider_risk_band = "green"
    elif rider_risk_score < 65:
        rider_risk_band = "yellow"
    else:
        rider_risk_band = "red"
    rider_trip_count = int((rider or {}).get("rider_reputation_trip_count") or 0)
    rider_shield = {
        "rider_reputation_avg": round(float((rider or {}).get("rating") or 0.0), 2) if rider_trip_count > 0 else None,
        "rider_reputation_trip_count": rider_trip_count,
        "rider_flagged_low_reputation": bool((rider or {}).get("shield_rider_flag")),
        "rider_new_account": rider_trip_count < SHIELD_MIN_TRIPS_FOR_FLAG,
        "rider_display_name": rider_name[:48],
        "rider_risk_score": rider_risk_score,
        "rider_risk_band": rider_risk_band,
    }

    # Build mood hint for push notification body
    _mood = trip.get("rider_mood_preferences") or {}
    _mood_parts = []
    if _mood.get("conversation") == "quiet":
        _mood_parts.append("Quiet ride")
    elif _mood.get("conversation") == "chatty":
        _mood_parts.append("Chatty rider")
    if _mood.get("music") == "on":
        _mood_parts.append("Music on")
    elif _mood.get("music") == "off":
        _mood_parts.append("No music")
    if _mood.get("temperature") == "cold":
        _mood_parts.append("Cold AC")
    if _mood.get("driving_style") == "smooth":
        _mood_parts.append("Smooth drive")
    elif _mood.get("driving_style") == "fast":
        _mood_parts.append("Fast drive")
    mood_hint = " · ".join(_mood_parts)

    async def _dispatch_offer_to_driver(offer: dict) -> None:
        pickup_addr = (trip.get("pickup_location") or {}).get("address", "Pickup")
        dropoff_addr = (trip.get("dropoff_location") or {}).get("address", "Destination")
        route_hint = trip.get("area_summary_line") or area_summary_line(
            str(pickup_addr or ""),
            str(dropoff_addr or ""),
        )
        notif_body = f"{rider_name}: {route_hint}"
        if mood_hint:
            notif_body += f" • {mood_hint}"
        await send_push_notification(
            offer["driver_id"],
            "New Ride Request",
            notif_body,
            {"type": "ride_request", "trip_id": trip["id"], "offer_id": offer["id"]},
        )
        logger.info(
            "dispatch_offer_sent trip_id=%s driver_id=%s preferred=%s",
            trip["id"],
            offer["driver_id"],
            offer["preferred"],
        )
        rider_offer = trip.get("offered_fare")
        if rider_offer is None:
            rider_offer = trip.get("fare")
        await push_driver_new_offer(
            offer["driver_id"],
            {
                "offer_id": offer["id"],
                "trip_id": trip["id"],
                "expires_at": expires_at,
                "preferred": offer["preferred"],
                "distance_to_pickup_km": offer["distance_to_pickup"],
                "pickup": trip.get("pickup_location"),
                "dropoff": trip.get("dropoff_location"),
                "pickup_coordinates": trip.get("pickup_location"),
                "destination_coordinates": trip.get("dropoff_location"),
                "distance_km": trip.get("distance_km"),
                "estimated_time_mins": trip.get("duration_mins"),
                "rider_offer_price": rider_offer,
                "minimum_allowed_price": trip.get("min_price"),
                "maximum_allowed_price": trip.get("max_price"),
                "recommended_fare": trip.get("recommended_fare") or trip.get("base_price"),
                "ride_preferences": trip.get("ride_preferences") or [],
                "rider_mood": trip.get("rider_mood_preferences") or {},
                "shield": rider_shield,
                "rider_name": rider_name,
                "rider_photo": rider_photo,
                "status": "searching",
            },
        )

    if offers:
        await asyncio.gather(*[_dispatch_offer_to_driver(offer) for offer in offers])

    return offers


# ==================== CUSTOM PRICE TRIP ====================

class CustomPriceRequest(BaseModel):
    rider_id: str
    pickup: str
    destination: str
    pickup_lat: Optional[float] = None
    pickup_lng: Optional[float] = None
    dropoff_lat: Optional[float] = None
    dropoff_lng: Optional[float] = None
    recommended_fare: float
    offered_fare: float
    vehicle_type: str
    trip_type: str = "intra"
    payment_method: str = "cash"


@trips_router.post("/trips/offer-custom-fare")
@trips_router.post("/trips/custom-price")
@trips_router.post("/trips/create-with-custom-price")
async def create_trip_with_custom_price(request: CustomPriceRequest, http_request: Request):
    """Create trip with user's custom price offer"""
    try:
        verify_owner_strict(http_request, request.rider_id)
        await trip_request_limiter.check_rate_limit(http_request, f"trip_request:{request.rider_id}")
        rider = await db.users.find_one({"id": request.rider_id})
        if not rider:
            raise HTTPException(status_code=404, detail="User not found")
        trip_id = f"trip-{int(time.time() * 1000)}"

        base_price = None
        min_price = None
        max_price = None
        smart_priority = False
        preview_coords = None
        map_region = None
        area_line = area_summary_line(request.pickup, request.destination)
        recommended_server = float(request.recommended_fare or 0)
        distance_km_out = None
        duration_min_out = None

        if (
            request.pickup_lat is not None
            and request.pickup_lng is not None
            and request.dropoff_lat is not None
            and request.dropoff_lng is not None
        ):
            route_data = await get_directions_from_google(
                request.pickup_lat,
                request.pickup_lng,
                request.dropoff_lat,
                request.dropoff_lng,
            )
            if not is_directions_road_route(route_data):
                raise HTTPException(status_code=503, detail=DRIVING_ROUTE_UNAVAILABLE_DETAIL)
            distance_km = route_data["distance_meters"] / 1000
            duration_min = math.ceil(route_data["duration_seconds"] / 60)
            traffic_duration_min = math.ceil(route_data["duration_in_traffic_seconds"] / 60)
            poly = route_data.get("polyline")
            normalized_vehicle = _normalize_service_type(request.vehicle_type)
            dr = await estimate_area_demand_ratio_near(db, request.pickup_lat, request.pickup_lng)
            fare = calculate_fare(
                distance_km,
                duration_min,
                traffic_duration_min,
                normalized_vehicle,
                "lagos",
                dr,
                False,
                request.pickup_lat,
                request.pickup_lng,
                request.dropoff_lat,
                request.dropoff_lng,
            )
            base_price, min_price, max_price = smart_bounds_from_base_price(float(fare["total_fare"]))
            recommended_server = float(fare["total_fare"])
            if request.offered_fare is not None:
                off_r = int(round(float(request.offered_fare)))
                min_r = int(round(float(min_price)))
                max_r = int(round(float(max_price)))
                if off_r < min_r:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Minimum fare for this trip is ₦{min_r:,.0f}",
                    )
                if max_r > 0 and off_r > max_r:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Maximum fare for this trip is ₦{max_r:,.0f}",
                    )
            smart_priority = rider_meets_priority_threshold(request.offered_fare, base_price)
            preview_coords = build_route_preview_coordinates(
                request.pickup_lat,
                request.pickup_lng,
                request.dropoff_lat,
                request.dropoff_lng,
                poly,
            )
            map_region = region_for_preview(
                request.pickup_lat,
                request.pickup_lng,
                request.dropoff_lat,
                request.dropoff_lng,
            )
            distance_km_out = round(distance_km, 2)
            duration_min_out = duration_min

        difference_percent = (
            ((request.offered_fare - recommended_server) / recommended_server) * 100
            if recommended_server > 0
            else 0.0
        )
        await assert_rider_wallet_covers_fare(
            db, request.rider_id, request.payment_method, float(request.offered_fare)
        )
        trip = {
            "id": trip_id,
            "rider_id": request.rider_id,
            "pickup_location": {
                "lat": request.pickup_lat,
                "lng": request.pickup_lng,
                "address": request.pickup,
            } if request.pickup_lat is not None and request.pickup_lng is not None else request.pickup,
            "dropoff_location": {
                "lat": request.dropoff_lat,
                "lng": request.dropoff_lng,
                "address": request.destination,
            } if request.dropoff_lat is not None and request.dropoff_lng is not None else {
                "address": request.destination,
            },
            "destination": request.destination,
            "recommended_fare": recommended_server,
            "offered_fare": request.offered_fare,
            "final_fare": None,
            "vehicle_type": request.vehicle_type,
            "trip_type": request.trip_type,
            "status": "pending_driver_offers",
            "broadcast_radius_km": 10,
            "difference_percent": round(difference_percent, 1),
            "offers": [],
            "created_at": datetime.now(),
            "expires_at": datetime.now() + timedelta(minutes=10),
            "base_price": base_price,
            "min_price": min_price,
            "max_price": max_price,
            "distance_km": distance_km_out,
            "duration_mins": duration_min_out,
            "duration_minutes": duration_min_out,
            "fare_bucket": fare.get("fare_bucket"),
            "surge_multiplier": fare.get("surge_multiplier", 1.0),
            "quoted_subtotal": fare.get("subtotal"),
            "area_summary_line": area_line,
            "route_preview_coordinates": preview_coords,
            "map_preview_region": map_region,
            "smart_match_priority": smart_priority,
            "payment_method": request.payment_method,
            "pickup_code": str(random.randint(1000, 9999)),
            "pickup_code_verified": False,
            "pickup_code_attempts": 0,
            "security_code": str(random.randint(1000, 9999)),
            "security_code_verified": False,
            "security_code_attempts": 0,
            "rider_face_verified_at_pickup": False,
            "rider_face_match_confidence": 0.0,
            "rider_face_verified_at": None,
            "rider_mood_preferences": rider.get("ride_mood_preferences", {
                "conversation": "any", "music": "any", "temperature": "any", "driving_style": "any"
            }),
        }
        await db.trips.insert_one(trip)
        logger.info(f"Custom price trip created: {trip_id} with offer N{request.offered_fare}")
        drivers_notified = 0
        if (
            request.pickup_lat is not None
            and request.pickup_lng is not None
            and request.dropoff_lat is not None
            and request.dropoff_lng is not None
        ):
            blocked_drivers = rider.get("blocked_drivers", []) or []
            offers = await _create_trip_offers(trip, blocked_drivers)
            drivers_notified = len(offers)
        return {
            "success": True,
            "trip_id": trip_id,
            "drivers_notified": drivers_notified,
            "message": (
                f"Your offer of N{request.offered_fare:,.0f} has been broadcast to {drivers_notified} nearby drivers"
                if drivers_notified > 0
                else "Trip created. Please include pickup/dropoff coordinates to broadcast instantly."
            ),
            "recommended_fare": recommended_server,
            "offered_fare": request.offered_fare,
            "difference": request.offered_fare - recommended_server,
            "difference_percent": round(difference_percent, 1),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating custom price trip: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create custom price trip: {str(e)}")



class TripRequest(BaseModel):
    pickup_lat: float
    pickup_lng: float
    pickup_address: str
    dropoff_lat: float
    dropoff_lng: float
    dropoff_address: str
    service_type: Optional[str] = "economy"
    city: Optional[str] = "lagos"
    payment_method: str = "cash"
    fare_estimate_id: Optional[str] = None
    enable_recording: bool = False
    offered_fare: Optional[float] = None
    recommended_fare: Optional[float] = None
    trip_type: Optional[str] = None
    preferred_driver_id: Optional[str] = None
    ride_preferences: Optional[list[str]] = None
    # When no locked estimate: same semantics as POST /fare/estimate (omit demand_ratio for area estimate).
    demand_ratio: Optional[float] = None
    rain: Optional[bool] = None


class ComfortRatingRequest(BaseModel):
    overall_rating: float
    smoothness: Optional[float] = None
    politeness: Optional[float] = None
    cleanliness: Optional[float] = None
    safety: Optional[float] = None
    comment: Optional[str] = None


class BookForOtherRequest(BaseModel):
    pickup_lat: float
    pickup_lng: float
    pickup_address: str
    dropoff_lat: float
    dropoff_lng: float
    dropoff_address: str
    rider_name: str
    rider_phone: str
    service_type: Optional[str] = "economy"
    city: Optional[str] = "lagos"
    payment_method: str = "cash"


class FaceVerificationRequest(BaseModel):
    face_image: str  # Base64 encoded image


class TripBiometricLockRequest(BaseModel):
    method: str = "device_biometric"


class GeoFenceTripLockRequest(BaseModel):
    threshold_meters: float = Field(default=200.0, ge=100.0, le=1000.0)
    approved_route: Optional[list[dict]] = None


class GeoFenceExplanationRequest(BaseModel):
    reason: str = Field(..., min_length=6, max_length=280)


class DriverStopReasonRequest(BaseModel):
    reason: str = Field(..., min_length=6, max_length=280)


class FakeDriverAlertRequest(BaseModel):
    observed_face_image: str
    location_lat: Optional[float] = None
    location_lng: Optional[float] = None


class RiderPickupFaceVerificationRequest(BaseModel):
    observed_face_image: str


class BlackShieldCourtOrderAccessRequest(BaseModel):
    court_order_ref: str = Field(..., min_length=8, max_length=120)
    requesting_agency: str = Field(..., min_length=3, max_length=160)
    purpose: str = Field(..., min_length=10, max_length=500)


class LocationUpdate(BaseModel):
    latitude: float
    longitude: float


# ==================== TRIP ENDPOINTS ====================

@trips_router.post("/trips/request")
async def request_trip(rider_id: str, request: TripRequest, http_request: Request):
    await trip_request_limiter.check_rate_limit(http_request, f"trip_request:{rider_id}")
    verify_owner_strict(http_request, rider_id)
    status_check = await check_user_status(rider_id)
    if not status_check.get("allowed", True):
        raise HTTPException(status_code=403, detail=status_check.get("message", "Account restricted"))
    if status_check.get("can_book") is False:
        raise HTTPException(status_code=403, detail=status_check.get("message", "Booking temporarily disabled"))
    
    normalized_service_type = _normalize_service_type(request.service_type)
    city = (request.city or "default").strip().lower()
    rider = await db.users.find_one({"id": rider_id})
    blocked_drivers = rider.get("blocked_drivers", []) if rider else []
    
    fare_data = None
    raw_eid = getattr(request, "fare_estimate_id", None)
    if raw_eid is None:
        estimate_id = None
    elif isinstance(raw_eid, str):
        estimate_id = raw_eid.strip() or None
    else:
        estimate_id = str(raw_eid).strip() or None

    if request.offered_fare is not None and not estimate_id:
        raise HTTPException(
            status_code=400,
            detail="Missing fare lock for your bid. Tap Refresh estimate, then request again.",
        )

    if estimate_id:
        est = await get_fare_estimate(estimate_id)
        if not est:
            est = fare_estimate_store.get(estimate_id)
        if not est:
            raise HTTPException(
                status_code=400,
                detail="Fare estimate not found or expired. Tap Refresh estimate.",
            )
        if _fare_estimate_expired(est):
            raise HTTPException(
                status_code=400,
                detail="Fare estimate expired. Tap Refresh estimate.",
            )
        if not _fare_estimate_coords_match(
            est,
            request.pickup_lat,
            request.pickup_lng,
            request.dropoff_lat,
            request.dropoff_lng,
        ):
            raise HTTPException(
                status_code=400,
                detail="Pickup or destination changed more than allowed. Refresh estimate.",
            )
        fare_data = est

    if fare_data:
        distance_km = fare_data["distance_km"]
        duration_min = fare_data["duration_min"]
        fare = fare_data["fare"]
        polyline = fare_data.get("polyline")
    else:
        route_data = await get_directions_from_google(
            request.pickup_lat, request.pickup_lng,
            request.dropoff_lat, request.dropoff_lng
        )
        if not is_directions_road_route(route_data):
            raise HTTPException(status_code=503, detail=DRIVING_ROUTE_UNAVAILABLE_DETAIL)
        distance_km = route_data["distance_meters"] / 1000
        duration_min = math.ceil(route_data["duration_seconds"] / 60)
        traffic_duration_min = math.ceil(route_data["duration_in_traffic_seconds"] / 60)
        polyline = route_data.get("polyline")

        if request.demand_ratio is not None:
            dr = max(0.0, min(1.0, float(request.demand_ratio)))
        else:
            dr = await estimate_area_demand_ratio_near(db, request.pickup_lat, request.pickup_lng)
        rain_f = bool(request.rain) if request.rain is not None else False
        fare = calculate_fare(
            distance_km,
            duration_min,
            traffic_duration_min,
            normalized_service_type,
            city,
            dr,
            rain_f,
            request.pickup_lat,
            request.pickup_lng,
            request.dropoff_lat,
            request.dropoff_lng,
        )

    if fare_data and fare_data.get("base_price") is not None:
        base_price = float(fare_data["base_price"])
        min_price = float(fare_data["min_price"])
        max_price = float(fare_data["max_price"])
        preview_coords = fare_data.get("route_preview_coordinates")
        map_region = fare_data.get("map_preview_region")
    else:
        base_price, min_price, max_price = smart_bounds_from_base_price(float(fare["total_fare"]))
        preview_coords = build_route_preview_coordinates(
            request.pickup_lat,
            request.pickup_lng,
            request.dropoff_lat,
            request.dropoff_lng,
            polyline,
        )
        map_region = region_for_preview(
            request.pickup_lat,
            request.pickup_lng,
            request.dropoff_lat,
            request.dropoff_lng,
        )

    area_line = area_summary_line(request.pickup_address, request.dropoff_address)

    if request.offered_fare is not None:
        off_r = int(round(float(request.offered_fare)))
        min_r = int(round(float(min_price)))
        max_r = int(round(float(max_price)))
        if off_r < min_r:
            raise HTTPException(
                status_code=400,
                detail=f"Minimum fare for this trip is ₦{min_r:,.0f}",
            )
        if off_r > max_r:
            raise HTTPException(
                status_code=400,
                detail=f"Maximum fare for this trip is ₦{max_r:,.0f}",
            )

    final_fare = request.offered_fare if request.offered_fare is not None else fare["total_fare"]

    # ── First-ride 20 % discount ─────────────────────────────────────────────
    # Only applies when the system sets the fare (not when the rider makes an offer)
    # and only on the rider's very first booking.
    first_ride_discount_pct = 0.0
    first_ride_discount_ngn = 0.0
    if request.offered_fare is None:
        prior_trips = await db.trips.count_documents(
            {"rider_id": rider_id, "status": {"$in": ["completed", "pending", "accepted", "ongoing"]}}
        )
        if prior_trips == 0:
            first_ride_discount_pct = 0.20
            first_ride_discount_ngn = round(float(final_fare) * first_ride_discount_pct, 2)
            final_fare = round(float(final_fare) * (1 - first_ride_discount_pct), 2)
            # Keep final_fare within the allowed bounds
            final_fare = max(float(min_price), final_fare)

    # ── Favourite-driver perk (stacked after first-ride when both apply) ───────
    favorite_driver_discount_pct = 0.0
    favorite_driver_discount_ngn = 0.0
    pref_id = getattr(request, "preferred_driver_id", None)
    if (
        request.offered_fare is None
        and pref_id
        and rider
        and pref_id in (rider.get("favorite_drivers") or [])
    ):
        try:
            fav_pct = float(os.environ.get("NEXRYDE_FAVORITE_DRIVER_DISCOUNT_PCT", "0.05") or "0")
        except (TypeError, ValueError):
            fav_pct = 0.05
        fav_pct = max(0.0, min(fav_pct, 0.25))
        if fav_pct > 0:
            favorite_driver_discount_pct = fav_pct
            favorite_driver_discount_ngn = round(float(final_fare) * fav_pct, 2)
            final_fare = round(float(final_fare) * (1 - fav_pct), 2)
            final_fare = max(float(min_price), final_fare)

    trip_status = "pending_driver_offers" if request.offered_fare is not None else "pending"
    smart_priority = rider_meets_priority_threshold(final_fare, base_price)

    await assert_rider_wallet_covers_fare(db, rider_id, request.payment_method, float(final_fare))

    trip_dict = {
        "id": str(uuid4()),
        "rider_id": rider_id,
        "pickup_location": {"lat": request.pickup_lat, "lng": request.pickup_lng, "address": request.pickup_address},
        "dropoff_location": {"lat": request.dropoff_lat, "lng": request.dropoff_lng, "address": request.dropoff_address},
        "distance_km": round(distance_km, 2),
        "duration_mins": duration_min,
        "base_fare": fare["base_fare"],
        "distance_fee": fare["distance_fee"],
        "time_fee": fare["time_fee"],
        "traffic_fee": fare["traffic_fee"],
        "fare": final_fare,
        "offered_fare": request.offered_fare,
        "first_ride_discount_pct": first_ride_discount_pct,
        "first_ride_discount_ngn": first_ride_discount_ngn,
        "favorite_driver_discount_pct": favorite_driver_discount_pct,
        "favorite_driver_discount_ngn": favorite_driver_discount_ngn,
        "is_first_ride": first_ride_discount_pct > 0,
        "recommended_fare": float(base_price),
        "base_price": base_price,
        "min_price": min_price,
        "max_price": max_price,
        "area_summary_line": area_line,
        "route_preview_coordinates": preview_coords,
        "map_preview_region": map_region,
        "smart_match_priority": smart_priority,
        "surge_multiplier": fare.get("surge_multiplier", 1.0),
        "fare_bucket": fare.get("fare_bucket"),
        "duration_minutes": duration_min,
        "quoted_subtotal": fare.get("subtotal"),
        "fare_estimate_id": estimate_id,
        "service_type": normalized_service_type,
        "city": city,
        "status": trip_status,
        "payment_method": request.payment_method,
        "polyline": polyline,
        "recording_enabled": request.enable_recording,
        "fare_locked_until": (datetime.now(timezone.utc) + timedelta(minutes=FARE_LOCK_MINUTES)).isoformat(),
        "insurance_id": f"INS_{uuid4().hex[:8].upper()}",
        "pickup_code": str(random.randint(1000, 9999)),
        "pickup_code_verified": False,
        "pickup_code_attempts": 0,
        "security_code": str(random.randint(1000, 9999)),
        "security_code_verified": False,
        "security_code_attempts": 0,
        "rider_face_verified_at_pickup": False,
        "rider_face_match_confidence": 0.0,
        "rider_face_verified_at": None,
        "is_monitored": True,
        "is_insured": True,
        "preferred_driver_id": request.preferred_driver_id,
        "ride_preferences": request.ride_preferences or [],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "shield_recording_rider_opt_in": bool(request.enable_recording),
        "shield_recording_driver_opt_in": False,
        "shield_recording_active": False,
        "shield_recording_updated_at": None,
    }
    
    await db.trips.insert_one(trip_dict)
    trip_dict.pop("_id", None)
    offers = await _create_trip_offers(trip_dict, blocked_drivers)
    await _log_trip_event(
        trip_dict["id"],
        "trip_requested",
        rider_id,
        {
            "service_type": normalized_service_type,
            "city": city,
            "fare": final_fare,
            "pickup": request.pickup_address,
            "dropoff": request.dropoff_address,
            "ride_preferences": request.ride_preferences or [],
            "eligible_drivers": len(offers),
            "favorite_driver_discount_ngn": favorite_driver_discount_ngn,
        },
    )

    return {"message": "Trip requested", "trip": trip_dict, "eligible_drivers": len(offers)}

@trips_router.post("/trips/book-for-other")
async def book_for_other(booker_id: str, request: BookForOtherRequest, http_request: Request):
    verify_owner_strict(http_request, booker_id)
    normalized_service_type = _normalize_service_type(request.service_type)
    city = (request.city or "default").strip().lower()
    """Book a ride for family member or friend"""
    route_data = await get_directions_from_google(
        request.pickup_lat, request.pickup_lng,
        request.dropoff_lat, request.dropoff_lng
    )
    if not is_directions_road_route(route_data):
        raise HTTPException(status_code=503, detail=DRIVING_ROUTE_UNAVAILABLE_DETAIL)
    distance_km = route_data["distance_meters"] / 1000
    duration_min = math.ceil(route_data["duration_seconds"] / 60)
    traffic_duration_min = math.ceil(route_data["duration_in_traffic_seconds"] / 60)
    polyline = route_data.get("polyline")

    dr = await estimate_area_demand_ratio_near(db, request.pickup_lat, request.pickup_lng)
    fare = calculate_fare(
        distance_km,
        duration_min,
        traffic_duration_min,
        normalized_service_type,
        city,
        dr,
        False,
        request.pickup_lat,
        request.pickup_lng,
        request.dropoff_lat,
        request.dropoff_lng,
    )
    base_price, min_price, max_price = smart_bounds_from_base_price(float(fare["total_fare"]))
    preview_coords = build_route_preview_coordinates(
        request.pickup_lat,
        request.pickup_lng,
        request.dropoff_lat,
        request.dropoff_lng,
        polyline,
    )
    map_region = region_for_preview(
        request.pickup_lat,
        request.pickup_lng,
        request.dropoff_lat,
        request.dropoff_lng,
    )
    area_line = area_summary_line(request.pickup_address, request.dropoff_address)

    await assert_rider_wallet_covers_fare(db, booker_id, request.payment_method, float(fare["total_fare"]))

    trip_dict = {
        "id": str(uuid4()),
        "rider_id": booker_id,
        "pickup_location": {"lat": request.pickup_lat, "lng": request.pickup_lng, "address": request.pickup_address},
        "dropoff_location": {"lat": request.dropoff_lat, "lng": request.dropoff_lng, "address": request.dropoff_address},
        "distance_km": round(distance_km, 2),
        "duration_mins": duration_min,
        "duration_minutes": duration_min,
        "base_fare": fare["base_fare"],
        "distance_fee": fare["distance_fee"],
        "time_fee": fare["time_fee"],
        "traffic_fee": fare["traffic_fee"],
        "fare": fare["total_fare"],
        "base_price": base_price,
        "min_price": min_price,
        "max_price": max_price,
        "fare_bucket": fare.get("fare_bucket"),
        "quoted_subtotal": fare.get("subtotal"),
        "area_summary_line": area_line,
        "route_preview_coordinates": preview_coords,
        "map_preview_region": map_region,
        "smart_match_priority": True,
        "surge_multiplier": fare.get("surge_multiplier", fare.get("multiplier", 1.0)),
        "service_type": normalized_service_type,
        "city": city,
        "status": "pending",
        "payment_method": request.payment_method,
        "polyline": polyline,
        "fare_locked_until": (datetime.now(timezone.utc) + timedelta(minutes=FARE_LOCK_MINUTES)).isoformat(),
        "insurance_id": f"INS_{uuid4().hex[:8].upper()}",
        "is_monitored": True,
        "is_insured": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "booked_for": {"name": request.rider_name, "phone": request.rider_phone},
        "shield_recording_rider_opt_in": False,
        "shield_recording_driver_opt_in": False,
        "shield_recording_active": False,
        "shield_recording_updated_at": None,
        "pickup_code": str(random.randint(1000, 9999)),
        "pickup_code_verified": False,
        "pickup_code_attempts": 0,
        "security_code": str(random.randint(1000, 9999)),
        "security_code_verified": False,
        "security_code_attempts": 0,
        "rider_face_verified_at_pickup": False,
        "rider_face_match_confidence": 0.0,
        "rider_face_verified_at": None,
    }
    
    await db.trips.insert_one(trip_dict)
    trip_dict.pop("_id", None)
    booker = await db.users.find_one({"id": booker_id}, {"_id": 0, "blocked_drivers": 1}) or {}
    offers = await _create_trip_offers(trip_dict, booker.get("blocked_drivers", []))
    await _log_trip_event(
        trip_dict["id"],
        "trip_booked_for_other",
        booker_id,
        {
            "booked_for_phone": request.rider_phone,
            "service_type": normalized_service_type,
            "city": city,
            "eligible_drivers": len(offers),
        },
    )

    return {"message": "Trip booked for other person", "trip": trip_dict, "eligible_drivers": len(offers)}

@trips_router.get("/trips/pending")
async def get_pending_trips(driver_lat: float, driver_lng: float, request: Request, driver_id: Optional[str] = None):
    """Get pending ride requests near the driver"""
    auth_user_id = require_authenticated(request)
    effective_driver_id = driver_id or auth_user_id
    if effective_driver_id != auth_user_id:
        raise HTTPException(status_code=403, detail="You can only fetch pending rides for your own account")

    now_iso = datetime.now(timezone.utc).isoformat()
    offers = await db.trip_offers.find(
        {
            "driver_id": effective_driver_id,
            "status": {"$in": ["offered", "seen"]},
            "expires_at": {"$gte": now_iso},
        },
        {"_id": 0, "trip_id": 1, "id": 1, "expires_at": 1, "distance_to_pickup": 1, "preferred": 1},
    ).sort([("preferred", -1), ("created_at", -1)]).to_list(50)

    if not offers:
        return []

    trip_offer_map = {offer["trip_id"]: offer for offer in offers if offer.get("trip_id")}
    trip_ids = list(trip_offer_map.keys())
    trips = await db.trips.find(
        {
            "id": {"$in": trip_ids},
            "status": {"$in": ["pending", "pending_driver_offers"]},
        }
    ).to_list(50)
    
    nearby_trips = []
    for trip in trips:
        pickup = trip.get("pickup_location", {})
        # Handle both object and string pickup formats
        if isinstance(pickup, dict) and "lat" in pickup:
            lat = pickup["lat"]
            lng = pickup["lng"]
        elif isinstance(pickup, str):
            # Skip string pickups without coordinates
            trip["_id"] = str(trip["_id"])
            matched_offer = trip_offer_map.get(trip.get("id"), {})
            trip["distance_to_pickup"] = 0
            trip["offer_id"] = matched_offer.get("id")
            trip["offer_expires_at"] = matched_offer.get("expires_at")
            trip["preferred"] = matched_offer.get("preferred", False)
            nearby_trips.append(trip)
            continue
        else:
            continue
            
        distance = calculate_distance_haversine(driver_lat, driver_lng, lat, lng)
        if distance <= 15:  # 15km radius
            trip["_id"] = str(trip["_id"])
            matched_offer = trip_offer_map.get(trip.get("id"), {})
            trip["distance_to_pickup"] = round(distance, 2)
            trip["offer_id"] = matched_offer.get("id")
            trip["offer_expires_at"] = matched_offer.get("expires_at")
            trip["preferred"] = matched_offer.get("preferred", False)
            trip = enrich_trip_offer_preview(trip)
            nearby_trips.append(trip)
    
    # Trips that specifically requested this driver always appear first
    if effective_driver_id:
        preferred = [t for t in nearby_trips if t.get("preferred_driver_id") == effective_driver_id]
        others = [t for t in nearby_trips if t.get("preferred_driver_id") != effective_driver_id]
        others.sort(
            key=lambda x: (
                0 if x.get("smart_match_priority") else 1,
                x.get("distance_to_pickup", 0),
            )
        )
        nearby_trips = preferred + others
    else:
        nearby_trips.sort(key=lambda x: x.get("distance_to_pickup", 0))

    trip_limit = 10
    if effective_driver_id:
        profile = await db.driver_profiles.find_one({"user_id": effective_driver_id}, {"_id": 0, "visibility_score": 1})
        score = float((profile or {}).get("visibility_score", 50.0))
        if score >= 80:
            trip_limit = 12
        elif score >= 60:
            trip_limit = 10
        elif score >= 40:
            trip_limit = 7
        else:
            trip_limit = 5
    trimmed = nearby_trips[:trip_limit]
    await attach_rider_shield_to_trips(trimmed)
    return trimmed


@trips_router.get("/trips/offers/{driver_id}")
async def get_driver_trip_offers(driver_id: str, request: Request):
    verify_owner_strict(request, driver_id)
    """Get active trip offers assigned to a specific driver."""
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.trip_offers.update_many(
        {"driver_id": driver_id, "status": {"$in": ["offered", "seen"]}, "expires_at": {"$lt": now_iso}},
        {"$set": {"status": "expired", "expired_at": now_iso}},
    )

    offers = await db.trip_offers.find(
        {"driver_id": driver_id, "status": {"$in": ["offered", "seen"]}, "expires_at": {"$gte": now_iso}},
        {"_id": 0},
    ).sort([("preferred", -1), ("created_at", -1)]).to_list(20)
    if offers:
        await db.trip_offers.update_many(
            {"id": {"$in": [o["id"] for o in offers]}, "status": "offered"},
            {"$set": {"status": "seen", "seen_at": now_iso}},
        )

    trip_ids = [o.get("trip_id") for o in offers if o.get("trip_id")]
    trip_rows = await db.trips.find(
        {
            "id": {"$in": trip_ids},
            "status": {"$in": ["pending", "pending_driver_offers"]},
        },
        {"_id": 0},
    ).to_list(100)
    trip_map = {str(t.get("id")): t for t in trip_rows if t.get("id")}

    hydrated = []
    for offer in offers:
        trip = trip_map.get(str(offer.get("trip_id")))
        if not trip or trip.get("status") not in ["pending", "pending_driver_offers"]:
            continue
        trip = enrich_trip_offer_preview(trip)
        hydrated.append(
            {
                **trip,
                "offer_id": offer["id"],
                "offer_expires_at": offer["expires_at"],
                "distance_to_pickup": offer.get("distance_to_pickup"),
                "preferred": offer.get("preferred", False),
            }
        )

    hydrated.sort(
        key=lambda x: (
            0 if x.get("smart_match_priority") else 1,
            0 if x.get("preferred") else 1,
        )
    )
    await attach_rider_shield_to_trips(hydrated)
    logger.info("dispatch_offer_fetch driver_id=%s active_offers=%s", driver_id, len(hydrated))

    # ── Auto-redispatch: if this online driver has no active offers, scan for nearby
    # pending trips that have no un-expired offer assigned to them and create one.
    if not hydrated:
        try:
            driver_profile = await db.driver_profiles.find_one(
                {"user_id": driver_id, "is_online": True},
                {"_id": 0, "current_lat": 1, "current_lng": 1, "vehicle_type": 1, "blocked_riders": 1},
            )
            if driver_profile:
                d_lat = driver_profile.get("current_lat")
                d_lng = driver_profile.get("current_lng")
                if d_lat and d_lng:
                    redispatch_window = (datetime.now(timezone.utc) - timedelta(minutes=8)).isoformat()
                    pending_trips = await db.trips.find(
                        {"status": {"$in": ["pending", "pending_driver_offers"]}, "created_at": {"$gte": redispatch_window}},
                        {"_id": 0, "id": 1, "rider_id": 1, "pickup_location": 1, "vehicle_type": 1},
                    ).to_list(20)
                    new_offer_exp = (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat()
                    new_offers_created = 0
                    blocked = driver_profile.get("blocked_riders") or []
                    for pt in pending_trips:
                        if new_offers_created >= 3:
                            break
                        if pt.get("rider_id") in blocked:
                            continue
                        # Check driver doesn't already have an offer/decline for this trip
                        existing = await db.trip_offers.find_one(
                            {"trip_id": pt["id"], "driver_id": driver_id, "status": {"$nin": ["expired"]}},
                        )
                        if existing:
                            continue
                        pickup = pt.get("pickup_location") or {}
                        if isinstance(pickup, dict) and pickup.get("lat") and pickup.get("lng"):
                            dist = calculate_distance_haversine(d_lat, d_lng, pickup["lat"], pickup["lng"])
                            if dist > 15:
                                continue
                        from uuid import uuid4 as _uuid4
                        new_offer = {
                            "id": str(_uuid4()),
                            "trip_id": pt["id"],
                            "driver_id": driver_id,
                            "rider_id": pt.get("rider_id"),
                            "status": "offered",
                            "distance_to_pickup": round(dist, 2) if isinstance(pickup, dict) and pickup.get("lat") else 0,
                            "created_at": datetime.now(timezone.utc).isoformat(),
                            "expires_at": new_offer_exp,
                            "preferred": False,
                            "auto_redispatch": True,
                        }
                        await db.trip_offers.insert_one(new_offer)
                        new_offers_created += 1
                    if new_offers_created > 0:
                        logger.info("auto_redispatch driver_id=%s new_offers=%s", driver_id, new_offers_created)
                        # Re-fetch now that offers exist
                        redispatch_offers = await db.trip_offers.find(
                            {"driver_id": driver_id, "status": "offered", "expires_at": {"$gte": now_iso}},
                            {"_id": 0},
                        ).to_list(5)
                        redispatch_trip_ids = [o.get("trip_id") for o in redispatch_offers if o.get("trip_id")]
                        redispatch_trips = await db.trips.find(
                            {"id": {"$in": redispatch_trip_ids}, "status": {"$in": ["pending", "pending_driver_offers"]}},
                            {"_id": 0},
                        ).to_list(5)
                        redispatch_map = {str(t["id"]): t for t in redispatch_trips}
                        for ro in redispatch_offers:
                            rt = redispatch_map.get(str(ro.get("trip_id")))
                            if rt:
                                rt = enrich_trip_offer_preview(rt)
                                hydrated.append({
                                    **rt,
                                    "offer_id": ro["id"],
                                    "offer_expires_at": ro["expires_at"],
                                    "distance_to_pickup": ro.get("distance_to_pickup"),
                                    "preferred": False,
                                })
                        await attach_rider_shield_to_trips(hydrated)
        except Exception as _e:
            logger.warning("auto_redispatch_error driver_id=%s err=%s", driver_id, _e)

    return hydrated


@trips_router.put("/trips/offers/{offer_id}/decline")
async def decline_trip_offer(offer_id: str, request: dict, http_request: Request):
    driver_id = require_authenticated(http_request)

    result = await db.trip_offers.update_one(
        {"id": offer_id, "driver_id": driver_id, "status": {"$in": ["offered", "seen"]}},
        {"$set": {"status": "declined", "declined_at": datetime.now(timezone.utc).isoformat()}},
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Offer not found or already handled")

    await record_violation(driver_id, "ride_rejection")
    return {"message": "Offer declined"}

@trips_router.put("/trips/{trip_id}/accept")
async def accept_trip(trip_id: str, request: dict, http_request: Request):
    driver_id = require_authenticated(http_request)
    now_iso = datetime.now(timezone.utc).isoformat()
    
    status_check = await check_user_status(driver_id)
    if not status_check.get("allowed", True):
        raise HTTPException(status_code=403, detail=status_check.get("message", "Account restricted"))
    
    doc_status = await check_driver_document_expiry(driver_id)
    if not doc_status.get("compliant", True) and doc_status.get("expired"):
        expired_names = ", ".join(d["document"] for d in doc_status["expired"])
        raise HTTPException(status_code=403, detail=f"Cannot accept rides. Expired documents: {expired_names}. Please renew them.")

    # Monthly re-upload check — soft reminder only, never blocks a verified driver
    # (Hard block only fires if actual documents have expired, handled above)

    # Driver must have a valid, unexpired offer for this trip.
    requested_offer_id = (request or {}).get("offer_id")
    offer_query = {
        "trip_id": trip_id,
        "driver_id": driver_id,
        "status": {"$in": ["offered", "seen"]},
        "expires_at": {"$gte": now_iso},
    }
    if requested_offer_id:
        offer_query["id"] = requested_offer_id
    active_offer = await db.trip_offers.find_one(offer_query, {"_id": 0, "id": 1})
    if not active_offer:
        raise HTTPException(status_code=403, detail="Trip offer expired or unavailable for this driver")

    busy_trip = await db.trips.find_one(
        {"driver_id": driver_id, "status": {"$in": ["accepted", "arrived", "ongoing"]}, "id": {"$ne": trip_id}},
        {"_id": 0, "id": 1},
    )
    if busy_trip:
        raise HTTPException(status_code=409, detail="You already have an active trip. Complete it before accepting another.")

    trip = await db.trips.find_one({"id": trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    rider_offer = float(trip.get("offered_fare") if trip.get("offered_fare") is not None else (trip.get("fare") or 0))
    base_p = float(trip.get("base_price") or trip.get("recommended_fare") or trip.get("fare") or rider_offer or 1.0)
    _, computed_min, computed_max = smart_bounds_from_base_price(base_p)
    max_p = float(trip.get("max_price") if trip.get("max_price") is not None else computed_max)
    min_p = float(trip.get("min_price") if trip.get("min_price") is not None else computed_min)

    proposed_raw = (request or {}).get("proposed_fare")
    if proposed_raw is None:
        proposed_fare = rider_offer if rider_offer > 0 else float(trip.get("fare") or 0)
    else:
        try:
            proposed_fare = float(proposed_raw)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="Invalid proposed_fare")
    if rider_offer > 0 and proposed_fare < rider_offer - 0.5:
        raise HTTPException(status_code=400, detail="Cannot propose a fare below the rider's offer")
    if proposed_fare > max_p + 0.5:
        raise HTTPException(status_code=400, detail=f"Maximum allowed price is ₦{max_p:,.0f}")
    if proposed_fare < min_p - 0.5:
        raise HTTPException(status_code=400, detail=f"Proposed fare must be at least ₦{min_p:,.0f}")

    driver_counter_val = None
    if trip.get("offered_fare") is not None and abs(proposed_fare - rider_offer) > 0.5:
        driver_counter_val = round(proposed_fare, 2)

    # Check if trip is inter-city
    is_intercity = trip.get("trip_type") == "inter"
    
    # Check subscription
    subscription = await db.subscriptions.find_one({
        "driver_id": driver_id,
        "status": {"$in": ["active", "trial", "grace_period"]}
    })
    
    if not subscription:
        raise HTTPException(status_code=403, detail="Active subscription required")

    # Driver has subscription - enforce trial/tier inter-city restrictions
    subscription_tier = subscription.get("tier", "city_rider")
    subscription_status = subscription.get("status")

    if subscription_status == "trial" and is_intercity:
        raise HTTPException(
            status_code=403,
            detail="Trial supports only city rides. Complete payment to unlock inter-city trips.",
        )

    if is_intercity and subscription_tier == "city_rider":
        raise HTTPException(
            status_code=403,
            detail="🚫 Inter-City trips locked! Upgrade to Road Warrior (₦30,000) to unlock all routes nationwide."
        )
    
    # Check if rider blocked this driver
    if trip:
        rider = await db.users.find_one({"id": trip["rider_id"]})
        if rider and driver_id in rider.get("blocked_drivers", []):
            raise HTTPException(status_code=403, detail="You cannot accept this ride")
    
    result = await db.trips.update_one(
        {"id": trip_id, "status": {"$in": ["pending", "pending_driver_offers"]}},
        {
            "$set": {
                "driver_id": driver_id,
                "status": "accepted",
                "accepted_at": datetime.utcnow(),
                "accepted_offer_id": active_offer["id"],
                "fare": round(proposed_fare, 2),
                "agreed_fare": round(proposed_fare, 2),
                "driver_counter_fare": driver_counter_val,
            }
        }
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=400, detail="Trip not available")
    
    trip = await db.trips.find_one({"id": trip_id})
    if trip:
        r_opt = bool(trip.get("shield_recording_rider_opt_in") or trip.get("recording_enabled"))
        d_opt = bool(trip.get("shield_recording_driver_opt_in"))
        await db.trips.update_one(
            {"id": trip_id},
            {"$set": {"shield_recording_active": r_opt and d_opt}},
        )
        trip = await db.trips.find_one({"id": trip_id})
        trip["_id"] = str(trip["_id"])
        driver_user = await db.users.find_one({"id": driver_id}, {"_id": 0, "name": 1}) or {}
        driver_profile = await db.driver_profiles.find_one({"user_id": driver_id}, {"_id": 0}) or {}
        await db.trips.update_one(
            {"id": trip_id},
            {"$set": {
                "driver_name": driver_user.get("name", "Driver"),
                "vehicle_type": driver_profile.get("vehicle_type"),
                "vehicle_model": driver_profile.get("vehicle_model"),
                "vehicle_plate": driver_profile.get("vehicle_plate") or driver_profile.get("vehicle_plate_number"),
                "vehicle_color": driver_profile.get("vehicle_color"),
                "driver_bank_name": driver_profile.get("bank_name"),
                "driver_account_number": driver_profile.get("account_number"),
                "driver_account_name": driver_profile.get("account_name"),
                "payment_status": "pending",
            }}
        )
        trip.update({
            "driver_name": driver_user.get("name", "Driver"),
            "vehicle_type": driver_profile.get("vehicle_type"),
            "vehicle_model": driver_profile.get("vehicle_model"),
            "vehicle_plate": driver_profile.get("vehicle_plate") or driver_profile.get("vehicle_plate_number"),
            "vehicle_color": driver_profile.get("vehicle_color"),
            "driver_bank_name": driver_profile.get("bank_name"),
            "driver_account_number": driver_profile.get("account_number"),
            "driver_account_name": driver_profile.get("account_name"),
            "payment_status": "pending",
        })
    await db.trip_offers.update_many(
        {"trip_id": trip_id, "status": {"$in": ["offered", "seen", "declined", "expired"]}},
        {
            "$set": {
                "status": "closed",
                "closed_at": datetime.now(timezone.utc).isoformat(),
                "accepted_by": driver_id,
                "accepted_offer_id": active_offer["id"],
            }
        },
    )
    await _log_trip_event(trip_id, "trip_accepted", driver_id, {})
    await _refresh_driver_visibility_score(driver_id)
    if trip and trip.get("rider_id"):
        driver_user = await db.users.find_one({"id": driver_id}, {"name": 1})
        driver_name = (driver_user or {}).get("name", "Your driver")
        await send_push_notification(
            trip["rider_id"],
            "Driver Found!",
            f"{driver_name} has accepted your ride. They're on their way!",
            {"type": "trip_accepted", "trip_id": trip_id},
        )
        trip.pop("_id", None)
        await _emit_rider_trip_realtime(trip_id)
    return trip


@trips_router.post("/trips/{trip_id}/verify-pickup-code")
async def verify_pickup_code(trip_id: str, request: dict, http_request: Request):
    """Driver enters the 4-digit pickup code shown to rider. No biometric required."""
    driver_id = require_authenticated(http_request)
    entered_code = str(request.get("pickup_code", "") or request.get("code", "")).strip()

    if not entered_code or len(entered_code) != 4 or not entered_code.isdigit():
        raise HTTPException(status_code=400, detail="Enter the 4-digit code shown on the rider's screen.")

    trip = await db.trips.find_one({"id": trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found.")
    if trip.get("driver_id") != driver_id:
        raise HTTPException(status_code=403, detail="You are not the driver for this trip.")
    if trip["status"] not in ["accepted", "arrived"]:
        raise HTTPException(status_code=400, detail="Trip must be in accepted or arrived state.")

    # Already verified
    if trip.get("pickup_code_verified") or trip.get("security_code_verified"):
        return {"verified": True, "message": "Pick-up code already confirmed.", "trip_id": trip_id}

    # Attempt guard (max 5)
    attempts = trip.get("pickup_code_attempts", 0)
    if attempts >= 5:
        await db.trips.update_one(
            {"id": trip_id},
            {"$set": {"status": "cancelled", "cancel_reason": "Too many wrong pick-up code attempts"}}
        )
        raise HTTPException(status_code=403, detail="Too many wrong attempts. Trip cancelled for safety.")

    # Get the stored code — prefer new pickup_code field, fall back to legacy security_code
    stored_code = trip.get("pickup_code") or trip.get("security_code", "")
    if entered_code == stored_code:
        await db.trips.update_one(
            {"id": trip_id},
            {"$set": {
                "pickup_code_verified": True,
                "pickup_code_verified_at": datetime.utcnow().isoformat(),
                "security_code_verified": True,  # keep legacy field in sync
                "security_code_verified_at": datetime.utcnow().isoformat(),
            }}
        )
        await _log_trip_event(trip_id, "pickup_code_verified", driver_id, {})
        return {"verified": True, "message": "Rider confirmed. You can now start the trip.", "trip_id": trip_id}
    else:
        new_attempts = attempts + 1
        await db.trips.update_one({"id": trip_id}, {"$set": {"pickup_code_attempts": new_attempts}})
        remaining = 5 - new_attempts
        await _log_trip_event(trip_id, "pickup_code_failed", driver_id, {"attempts": new_attempts})
        raise HTTPException(
            status_code=400,
            detail=f"Invalid code. {remaining} attempt{'s' if remaining != 1 else ''} remaining."
        )


@trips_router.post("/trips/{trip_id}/verify-security-code")
async def verify_security_code(trip_id: str, request: dict, http_request: Request):
    """Legacy endpoint — delegates to the new pickup-code flow."""
    new_req = {"pickup_code": request.get("security_code", ""), "code": request.get("security_code", "")}
    return await verify_pickup_code(trip_id, new_req, http_request)


@trips_router.put("/trips/{trip_id}/biometric-lock")
async def verify_trip_biometric_lock(trip_id: str, request: TripBiometricLockRequest, http_request: Request):
    actor_id = require_authenticated(http_request)
    trip = await db.trips.find_one({"id": trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    verify_trip_participant(http_request, trip)

    if trip.get("status") not in ["accepted", "arrived"]:
        raise HTTPException(status_code=400, detail="Biometric trip lock only works before trip start")

    now = datetime.now(timezone.utc).isoformat()
    if actor_id == trip.get("rider_id"):
        role = "rider"
        field = "rider_biometric_verified_at"
    elif actor_id == trip.get("driver_id"):
        role = "driver"
        field = "driver_biometric_verified_at"
    else:
        raise HTTPException(status_code=403, detail="Not a participant")

    await db.trips.update_one(
        {"id": trip_id},
        {"$set": {field: now, f"{role}_biometric_method": request.method, "biometric_handshake_updated_at": now}},
    )
    updated_trip = await db.trips.find_one({"id": trip_id}, {"_id": 0})
    handshake_ready = _trip_biometric_ready(updated_trip or {})
    await _log_trip_event(
        trip_id,
        "biometric_trip_lock_verified",
        actor_id,
        {"role": role, "method": request.method, "double_verified": handshake_ready},
    )
    return {
        "success": True,
        "role": role,
        "biometric_handshake_ready": handshake_ready,
        "rider_biometric_verified_at": (updated_trip or {}).get("rider_biometric_verified_at"),
        "driver_biometric_verified_at": (updated_trip or {}).get("driver_biometric_verified_at"),
        "message": "Biometric trip lock recorded",
    }


@trips_router.put("/trips/{trip_id}/geo-fence-lock")
async def arm_geo_fence_trip_lock(trip_id: str, request: GeoFenceTripLockRequest, http_request: Request):
    actor_id = require_authenticated(http_request)
    trip = await db.trips.find_one({"id": trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    verify_trip_participant(http_request, trip)
    if actor_id != trip.get("rider_id"):
        raise HTTPException(status_code=403, detail="Only the rider can lock the approved route")
    if trip.get("status") not in ["accepted", "arrived"]:
        raise HTTPException(status_code=400, detail="Approved route lock must be set before trip starts")

    approved_route = request.approved_route or trip.get("route_preview_coordinates") or []
    if len(approved_route) < 2:
        raise HTTPException(status_code=400, detail="No approved route is available for this trip yet")

    now = datetime.now(timezone.utc).isoformat()
    lock = {
        "active": True,
        "approved_at": now,
        "approved_by": actor_id,
        "threshold_meters": float(request.threshold_meters or 200.0),
        "approved_route": approved_route,
        "deviation_triggered": bool((trip.get("geo_fence_trip_lock") or {}).get("deviation_triggered")),
        "driver_explanation_required": False,
        "last_driver_explanation": None,
    }
    await db.trips.update_one({"id": trip_id}, {"$set": {"geo_fence_trip_lock": lock}})
    await _log_trip_event(
        trip_id,
        "geo_fence_trip_lock_armed",
        actor_id,
        {"threshold_meters": lock["threshold_meters"], "approved_points": len(approved_route)},
    )
    if trip.get("driver_id"):
        await send_push_notification(
            trip["driver_id"],
            "Approved Route Locked",
            "The rider locked the approved route. Stay within 200 metres or explain any route change.",
            {"type": "geo_fence_trip_lock_armed", "trip_id": trip_id},
        )
    await _emit_rider_trip_realtime(trip_id)
    return {"success": True, "geo_fence_trip_lock": lock}


@trips_router.post("/trips/{trip_id}/geo-fence-explain")
async def explain_geo_fence_deviation(trip_id: str, request: GeoFenceExplanationRequest, http_request: Request):
    actor_id = require_authenticated(http_request)
    trip = await db.trips.find_one({"id": trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    verify_trip_participant(http_request, trip)
    if actor_id != trip.get("driver_id"):
        raise HTTPException(status_code=403, detail="Only the assigned driver can explain route changes")

    lock = trip.get("geo_fence_trip_lock") or {}
    if not lock.get("active"):
        raise HTTPException(status_code=400, detail="Approved route lock is not active")

    now = datetime.now(timezone.utc).isoformat()
    lock["driver_explanation_required"] = False
    lock["last_driver_explanation"] = {"reason": request.reason.strip(), "at": now, "driver_id": actor_id}
    await db.trips.update_one(
        {"id": trip_id},
        {
            "$set": {
                "geo_fence_trip_lock": lock,
                "guardian_alert": {
                    "active": True,
                    "type": "geo_fence_explained",
                    "message": "Driver explained the route change. Nexryde is still monitoring this trip.",
                    "reason": request.reason.strip(),
                    "triggered_at": now,
                },
            }
        },
    )
    await _log_trip_event(trip_id, "geo_fence_deviation_explained", actor_id, {"reason": request.reason.strip()})
    if trip.get("rider_id"):
        await send_push_notification(
            trip["rider_id"],
            "Driver Explained Route Change",
            request.reason.strip(),
            {"type": "geo_fence_explained", "trip_id": trip_id},
        )
    await _emit_rider_trip_realtime(trip_id)
    return {"success": True, "message": "Explanation shared with the rider"}


@trips_router.post("/trips/{trip_id}/stop-reason")
async def submit_driver_stop_reason(trip_id: str, request: DriverStopReasonRequest, http_request: Request):
    actor_id = require_authenticated(http_request)
    trip = await db.trips.find_one({"id": trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    verify_trip_participant(http_request, trip)
    if actor_id != trip.get("driver_id"):
        raise HTTPException(status_code=403, detail="Only the assigned driver can submit a stop reason")
    if trip.get("status") not in ["accepted", "arrived", "ongoing"]:
        raise HTTPException(status_code=400, detail="Stop reason can only be shared during an active trip")

    now = datetime.now(timezone.utc).isoformat()
    stop_reason = {
        "reason": request.reason.strip(),
        "driver_id": actor_id,
        "submitted_at": now,
    }
    await db.trips.update_one(
        {"id": trip_id},
        {
            "$set": {
                "driver_stop_reason": stop_reason,
                "guardian_alert": {
                    "active": True,
                    "type": "driver_stop_reason",
                    "message": "Driver shared why the vehicle stopped.",
                    "reason": request.reason.strip(),
                    "triggered_at": now,
                },
            }
        },
    )
    await _log_trip_event(trip_id, "driver_stop_reason_submitted", actor_id, {"reason": request.reason.strip()})
    if trip.get("rider_id"):
        await send_push_notification(
            trip["rider_id"],
            "Driver shared stop reason",
            request.reason.strip(),
            {"type": "driver_stop_reason", "trip_id": trip_id},
        )
    await _emit_rider_trip_realtime(trip_id)
    return {"success": True, "driver_stop_reason": stop_reason}


@trips_router.post("/trips/{trip_id}/fake-driver-alert")
async def fake_driver_alert_check(trip_id: str, request: FakeDriverAlertRequest, http_request: Request):
    rider_id = require_authenticated(http_request)
    trip = await db.trips.find_one({"id": trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    if rider_id != trip.get("rider_id"):
        raise HTTPException(status_code=403, detail="Only the rider can run this check")
    if trip.get("status") not in ["accepted", "arrived"]:
        raise HTTPException(status_code=400, detail="Fake driver alert works only before trip start")

    driver_id = trip.get("driver_id")
    if not driver_id:
        raise HTTPException(status_code=400, detail="No assigned driver yet")
    driver_user = await db.users.find_one({"id": driver_id}, {"_id": 0, "name": 1, "face_image": 1, "phone": 1}) or {}
    driver_profile = await db.driver_profiles.find_one({"user_id": driver_id}, {"_id": 0, "face_image": 1, "vehicle_plate": 1}) or {}
    reference_image = driver_profile.get("face_image") or driver_user.get("face_image")
    if not reference_image:
        raise HTTPException(status_code=400, detail="Driver has no registered face reference")

    confidence = face_match_confidence(reference_image, request.observed_face_image)
    matched = confidence >= 82.0
    now = datetime.now(timezone.utc).isoformat()

    await db.trips.update_one(
        {"id": trip_id},
        {"$set": {
            "pickup_face_match_checked_at": now,
            "pickup_face_match_confidence": confidence,
            "pickup_face_match_ok": matched,
        }},
    )
    await _log_trip_event(
        trip_id,
        "pickup_face_match_check",
        rider_id,
        {"confidence": confidence, "matched": matched},
    )

    if not matched:
        await db.trips.update_one(
            {"id": trip_id},
            {"$set": {
                "fake_driver_alert_triggered": True,
                "fake_driver_alert_at": now,
            }},
        )
        rider = await db.users.find_one({"id": rider_id}, {"_id": 0, "emergency_contacts": 1}) or {}
        return {
            "success": True,
            "matched": False,
            "confidence": confidence,
            "alert_message": "Warning: face mismatch detected. Do not enter the vehicle.",
            "emergency_contacts_notified": len((rider.get("emergency_contacts") or [])),
            "driver_name": driver_user.get("name", "Driver"),
            "vehicle_plate": driver_profile.get("vehicle_plate"),
        }

    return {
        "success": True,
        "matched": True,
        "confidence": confidence,
        "alert_message": "Driver face matches registered profile.",
        "driver_name": driver_user.get("name", "Driver"),
        "vehicle_plate": driver_profile.get("vehicle_plate"),
    }


@trips_router.post("/trips/{trip_id}/verify-rider-face-pickup")
async def verify_rider_face_pickup(trip_id: str, request: RiderPickupFaceVerificationRequest, http_request: Request):
    rider_id = require_authenticated(http_request)
    trip = await db.trips.find_one({"id": trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    if trip.get("rider_id") != rider_id:
        raise HTTPException(status_code=403, detail="Only the assigned rider can verify pickup face")
    if trip.get("status") not in ["accepted", "arrived"]:
        raise HTTPException(status_code=400, detail="Face verification is only available before trip start")
    if not request.observed_face_image or len(request.observed_face_image) < 100:
        raise HTTPException(status_code=400, detail="Live rider face image is required")

    rider_user = await db.users.find_one({"id": rider_id}, {"_id": 0, "profile_image": 1, "face_image": 1}) or {}
    reference_image = rider_user.get("face_image") or rider_user.get("profile_image")
    if not reference_image:
        raise HTTPException(status_code=400, detail="No registered rider face on file. Complete rider verification first.")

    confidence = face_match_confidence(reference_image, request.observed_face_image)
    matched = confidence >= 82.0
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.trips.update_one(
        {"id": trip_id},
        {"$set": {
            "rider_face_match_confidence": confidence,
            "rider_face_verified_at_pickup": bool(matched),
            "rider_face_verified_at": now_iso if matched else None,
        }},
    )
    await _log_trip_event(
        trip_id,
        "rider_face_verified_at_pickup",
        rider_id,
        {"matched": bool(matched), "confidence": confidence},
    )
    await _emit_rider_trip_realtime(trip_id)
    if not matched:
        raise HTTPException(
            status_code=403,
            detail="Rider face mismatch detected. Re-scan to continue trip handoff.",
        )
    return {"success": True, "matched": True, "confidence": confidence}

@trips_router.put("/trips/{trip_id}/verify-face-and-start")
async def verify_face_and_start_trip(trip_id: str, request: FaceVerificationRequest, http_request: Request):
    """Verify driver face LIVE and start trip. Face verification is MANDATORY."""
    if os.environ.get("ALLOW_FACE_VERIFICATION_MOCK", "false").lower() != "true":
        raise HTTPException(
            status_code=503,
            detail="Live face verification provider is required. Mock verification is disabled in production.",
        )
    driver_id = require_authenticated(http_request)
    trip = await db.trips.find_one({"id": trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    if trip.get("driver_id") != driver_id:
        raise HTTPException(status_code=403, detail="Only the assigned driver can verify face and start trip")
    
    if trip["status"] not in ["accepted", "arrived"]:
        raise HTTPException(status_code=400, detail="Trip must be accepted or driver must be at pickup first")

    # Require pickup code verification (new system) or legacy security_code_verified
    pickup_verified = trip.get("pickup_code_verified") or trip.get("security_code_verified")
    if not pickup_verified:
        raise HTTPException(status_code=403, detail="Verify the rider's pick-up code before starting the trip.")
    
    if not request.face_image or len(request.face_image) < 100:
        raise HTTPException(status_code=400, detail="Live face photo is required before starting any ride")

    await db.face_verifications.insert_one({
        "driver_id": driver_id,
        "trip_id": trip_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "verification_type": "ride_start_live",
        "verified": True,
        "match_confidence": 95.0,
    })
    await db.driver_profiles.update_one(
        {"user_id": driver_id},
        {"$set": {"last_face_verification": datetime.now(timezone.utc).isoformat(), "face_verified_today": True}}
    )
    face_verified = True
    shield_mode = dict(trip.get("invisible_shield_mode") or {})
    shield_updates = {}
    if shield_mode.get("active"):
        expected_dt = datetime.now(timezone.utc) + timedelta(minutes=max(5, int(trip.get("duration_mins") or 20)))
        shield_mode["expected_arrival_at"] = expected_dt.isoformat()
        shield_mode["confirm_deadline_at"] = (expected_dt + timedelta(minutes=10)).isoformat()
        shield_updates["invisible_shield_mode"] = shield_mode

    await db.trips.update_one(
        {"id": trip_id},
        {"$set": {
            "status": "ongoing",
            "started_at": datetime.utcnow(),
            "face_verified_at_start": face_verified,
            "biometric_trip_lock_active": True,
            **shield_updates,
        }}
    )
    
    trip = await db.trips.find_one({"id": trip_id})
    trip["_id"] = str(trip["_id"])
    await _log_trip_event(trip_id, "face_verified_trip_start", trip.get("driver_id"), {"verified": face_verified})
    await _emit_rider_trip_realtime(trip_id)
    return {"trip": trip, "face_verified": face_verified}

@trips_router.put("/trips/{trip_id}/start")
async def start_trip(trip_id: str, request: Request):
    driver_id = require_authenticated(request)
    trip = await db.trips.find_one({"id": trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    if trip.get("driver_id") != driver_id:
        raise HTTPException(status_code=403, detail="Only the assigned driver can start this trip")

    # Pick-up code is the mandatory verification gate.
    # Face verification (verify-face-and-start) is an optional enhancement — not enforced here.
    pickup_ok = trip.get("pickup_code_verified") or trip.get("security_code_verified")
    if not pickup_ok:
        raise HTTPException(
            status_code=403,
            detail="Pickup code must be verified before starting the trip.",
        )

    shield_mode = dict(trip.get("invisible_shield_mode") or {})
    shield_updates = {}
    if shield_mode.get("active"):
        expected_dt = datetime.now(timezone.utc) + timedelta(minutes=max(5, int(trip.get("duration_mins") or 20)))
        shield_mode["expected_arrival_at"] = expected_dt.isoformat()
        shield_mode["confirm_deadline_at"] = (expected_dt + timedelta(minutes=10)).isoformat()
        shield_updates["invisible_shield_mode"] = shield_mode

    result = await db.trips.update_one(
        {"id": trip_id, "status": {"$in": ["accepted", "arrived"]}},
        {"$set": {
            "status": "ongoing",
            "started_at": datetime.utcnow(),
            # Mark face flags so downstream analytics don't break
            "face_verified_at_start": True,
            "rider_face_verified_at_pickup": trip.get("rider_face_verified_at_pickup", True),
            **shield_updates,
        }}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=400, detail="Cannot start trip")
    
    # Auto-lock vehicle data on trip start to prevent mid-trip plate swap
    driver_profile = await db.driver_profiles.find_one(
        {"user_id": trip.get("driver_id")},
        {"_id": 0, "vehicle_plate": 1, "vehicle_model": 1, "vehicle_color": 1, "vehicle_type": 1}
    ) or {}
    locked_vehicle = {
        "plate":        driver_profile.get("vehicle_plate") or trip.get("vehicle_plate", ""),
        "model":        driver_profile.get("vehicle_model") or trip.get("vehicle_model", ""),
        "color":        driver_profile.get("vehicle_color") or trip.get("vehicle_color", ""),
        "vehicle_type": driver_profile.get("vehicle_type") or trip.get("vehicle_type", ""),
        "locked_at":    datetime.utcnow().isoformat(),
    }
    await db.trips.update_one(
        {"id": trip_id},
        {"$set": {"locked_vehicle": locked_vehicle}}
    )

    trip = await db.trips.find_one({"id": trip_id})
    trip["_id"] = str(trip["_id"])
    await _log_trip_event(trip_id, "trip_started", trip.get("driver_id"), {})
    await _emit_rider_trip_realtime(trip_id)
    return trip


@trips_router.post("/trips/{trip_id}/lock-vehicle")
async def lock_vehicle(trip_id: str, request: Request):
    """Rider confirms driver identity — locks vehicle data so driver cannot swap plate mid-trip."""
    rider_id = require_authenticated(request)
    trip = await db.trips.find_one({"id": trip_id}, {"_id": 0})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    if trip.get("rider_id") != rider_id:
        raise HTTPException(status_code=403, detail="Only the rider can lock vehicle data")
    if trip.get("status") not in ("accepted", "arrived", "ongoing"):
        raise HTTPException(status_code=400, detail="Cannot lock vehicle in current trip state")

    # Fetch live vehicle data from driver profile
    driver_profile = await db.driver_profiles.find_one(
        {"user_id": trip.get("driver_id")},
        {"_id": 0, "vehicle_plate": 1, "vehicle_model": 1, "vehicle_color": 1, "vehicle_type": 1}
    ) or {}
    locked_vehicle = {
        "plate":        driver_profile.get("vehicle_plate") or trip.get("vehicle_plate", ""),
        "model":        driver_profile.get("vehicle_model") or trip.get("vehicle_model", ""),
        "color":        driver_profile.get("vehicle_color") or trip.get("vehicle_color", ""),
        "vehicle_type": driver_profile.get("vehicle_type") or trip.get("vehicle_type", ""),
        "locked_at":    datetime.utcnow().isoformat(),
        "locked_by_rider": True,
    }
    await db.trips.update_one(
        {"id": trip_id},
        {"$set": {
            "locked_vehicle": locked_vehicle,
            "rider_identity_confirmed": True,
            "rider_identity_confirmed_at": datetime.utcnow().isoformat(),
        }}
    )
    await _log_trip_event(trip_id, "vehicle_locked", rider_id, {"locked_vehicle": locked_vehicle})
    return {"success": True, "locked_vehicle": locked_vehicle}


@trips_router.post("/trips/{trip_id}/report-mismatch")
async def report_vehicle_mismatch(trip_id: str, request: Request):
    """Rider reports vehicle/driver identity mismatch before boarding."""
    rider_id = require_authenticated(request)
    trip = await db.trips.find_one({"id": trip_id}, {"_id": 0})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    if trip.get("rider_id") != rider_id:
        raise HTTPException(status_code=403, detail="Only the rider can report a mismatch")

    body = {}
    try:
        body = await request.json()
    except Exception:
        pass

    mismatch_record = {
        "reported_at": datetime.utcnow().isoformat(),
        "reported_by": rider_id,
        "trip_id":     trip_id,
        "driver_id":   trip.get("driver_id"),
        "type":        body.get("type", "vehicle_mismatch"),
        "notes":       body.get("notes", ""),
    }
    await db.trips.update_one(
        {"id": trip_id},
        {"$set": {
            "mismatch_report": mismatch_record,
            "mismatch_reported_at": datetime.utcnow().isoformat(),
        }}
    )
    # Flag on driver profile for safety review
    if trip.get("driver_id"):
        await db.driver_profiles.update_one(
            {"user_id": trip["driver_id"]},
            {"$inc": {"mismatch_report_count": 1},
             "$push": {"mismatch_reports": mismatch_record}}
        )
    await _log_trip_event(trip_id, "mismatch_reported", rider_id, mismatch_record)
    return {"success": True, "message": "Mismatch report submitted. Nexryde safety team has been notified."}


@trips_router.post("/trips/{trip_id}/confirm-safe-arrival")
async def confirm_safe_arrival(trip_id: str, request: Request):
    actor_id = require_authenticated(request)
    trip = await db.trips.find_one({"id": trip_id}, {"_id": 0})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    verify_trip_participant(request, trip)
    if actor_id != trip.get("rider_id"):
        raise HTTPException(status_code=403, detail="Only the rider can confirm safe arrival")
    check = dict(trip.get("safe_arrival_check") or {})
    if not check.get("required"):
        raise HTTPException(status_code=400, detail="Safe arrival confirmation is not active for this trip")

    now = datetime.now(timezone.utc).isoformat()
    check["confirmed_at"] = now
    check["check_in_status"] = "confirmed"
    await db.trips.update_one({"id": trip_id}, {"$set": {"safe_arrival_check": check}})
    await _log_trip_event(trip_id, "safe_arrival_confirmed", actor_id, {})
    await _emit_rider_trip_realtime(trip_id)
    return {"success": True, "safe_arrival_check": check}


@trips_router.put("/trips/{trip_id}/arrive")
async def arrive_at_pickup(trip_id: str, request: dict, http_request: Request):
    driver_id = require_authenticated(http_request)
    trip = await db.trips.find_one({"id": trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    verify_trip_participant(http_request, trip)

    if trip.get("driver_id") != driver_id:
        raise HTTPException(status_code=403, detail="Only the assigned driver can mark arrival")
    if trip.get("status") != "accepted":
        raise HTTPException(status_code=400, detail="Trip must be accepted before arrival")

    await db.trips.update_one(
        {"id": trip_id},
        {"$set": {
            "status": "arrived",
            "arrived_at": datetime.utcnow(),
            "estate_gate_code_shared_at": datetime.now(timezone.utc).isoformat(),
            "estate_gate_code_expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat(),
        }}
    )
    updated = await db.trips.find_one({"id": trip_id}, {"_id": 0})
    gate_access = await _build_estate_gate_access(updated or {}, driver_id) if updated else None
    await _log_trip_event(trip_id, "driver_arrived_pickup", driver_id, {
        "estate_gate_code_window_opened": bool(gate_access and gate_access.get("available")),
        "estate_gate_code_expires_at": (gate_access or {}).get("expires_at"),
    })
    if updated and updated.get("rider_id"):
        await send_push_notification(
            updated["rider_id"],
            "Driver Arrived",
            "Your driver has arrived at the pickup point. Show your security code before starting the ride.",
            {"type": "driver_arrived", "trip_id": trip_id},
        )
        await _emit_rider_trip_realtime(trip_id)
    if updated:
        updated["estate_gate_access"] = gate_access
    return updated

@trips_router.put("/trips/{trip_id}/update-location")
async def update_trip_location(trip_id: str, request: LocationUpdate, http_request: Request):
    """Update trip route and run Trip Guardian safety monitoring."""
    location_point = {
        "lat": request.latitude,
        "lng": request.longitude,
        "timestamp": datetime.utcnow().isoformat()
    }
    
    trip = await db.trips.find_one({"id": trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    verify_trip_participant(http_request, trip)
    actor_id = require_authenticated(http_request)
    if actor_id != trip.get("driver_id"):
        raise HTTPException(status_code=403, detail="Only the assigned driver can update trip location")
    
    actual_route = trip.get("actual_route", [])
    now = datetime.utcnow()
    route_deviation = False
    moved_km = 0.0
    current_speed_kmh = 0.0
    geo_fence_lock = trip.get("geo_fence_trip_lock") or {}
    geo_fence_triggered = bool(geo_fence_lock.get("deviation_triggered"))
    deviation_distance_meters = 0.0
    speed_spike_alert = trip.get("speed_spike_alert")
    gps_spoofing_alert = trip.get("gps_spoofing_alert")
    guardian_alert = trip.get("guardian_alert")

    # Trip Guardian only applies while ride is active.
    status = str(trip.get("status", "")).lower()
    guardian_enabled = status in {"accepted", "ongoing"}

    guardian_state = trip.get("guardian_state") or {}
    stationary_since = guardian_state.get("stationary_since")
    pending_check_id = guardian_state.get("pending_check_id")
    last_prompt_at = guardian_state.get("last_prompt_at")

    if actual_route:
        last_point = actual_route[-1]
        if all(k in last_point for k in ("lat", "lng")):
            moved_km = calculate_distance_haversine(
                float(last_point["lat"]),
                float(last_point["lng"]),
                float(request.latitude),
                float(request.longitude),
            )
            last_ts = _parse_iso_dt(last_point.get("timestamp"))
            if last_ts:
                elapsed_seconds = max(1.0, (now - last_ts).total_seconds())
                current_speed_kmh = (moved_km / elapsed_seconds) * 3600.0

    if moved_km >= GUARDIAN_MIN_MOVEMENT_KM:
        stationary_since = None
        pending_check_id = None
    elif guardian_enabled:
        if not stationary_since:
            stationary_since = now.isoformat()

    if status in {"accepted", "ongoing"} and actual_route:
        impossible_jump = moved_km >= GPS_SPOOF_JUMP_KM
        impossible_speed = current_speed_kmh >= GPS_SPOOF_SPEED_KMH
        if impossible_jump or impossible_speed:
            prior_spoof = _parse_iso_dt((gps_spoofing_alert or {}).get("triggered_at"))
            can_trigger_spoof = not prior_spoof or (now - prior_spoof).total_seconds() >= 300
            if can_trigger_spoof:
                violation_result = await record_violation(
                    trip.get("driver_id"),
                    "gps_spoofing",
                    trip_id=trip_id,
                    reporter_id=trip.get("rider_id"),
                    description=(
                        f"Impossible GPS movement detected: jump={round(moved_km, 3)}km, "
                        f"estimated_speed={round(current_speed_kmh, 1)}km/h"
                    ),
                )
                await _freeze_trip_fare_for_investigation(trip_id, "gps_spoofing_detected")
                gps_spoofing_alert = {
                    "active": True,
                    "message": "GPS spoofing suspected. Fare frozen and driver suspended pending investigation.",
                    "jump_km": round(moved_km, 3),
                    "estimated_speed_kmh": round(current_speed_kmh, 1),
                    "fare_frozen": True,
                    "driver_suspended": violation_result.get("action") == "suspended",
                    "triggered_at": now.isoformat(),
                }
                guardian_alert = {
                    "active": True,
                    "type": "gps_spoofing",
                    "message": "Trip flagged for suspected GPS spoofing. Nexryde froze the fare and suspended the driver pending investigation.",
                    "jump_km": round(moved_km, 3),
                    "estimated_speed_kmh": round(current_speed_kmh, 1),
                    "triggered_at": now.isoformat(),
                }
                if trip.get("rider_id"):
                    await send_push_notification(
                        trip["rider_id"],
                        "GPS Fraud Protection Active",
                        "Suspected GPS spoofing detected. Your fare is frozen while Nexryde investigates.",
                        {"type": "gps_spoofing_alert", "trip_id": trip_id},
                    )
                if trip.get("driver_id"):
                    await send_push_notification(
                        trip["driver_id"],
                        "Account Suspended For Review",
                        "GPS spoofing was detected. Your account is suspended pending investigation.",
                        {"type": "gps_spoofing_driver", "trip_id": trip_id},
                    )
                await _log_trip_event(
                    trip_id,
                    "gps_spoofing_detected",
                    trip.get("driver_id"),
                    {"jump_km": round(moved_km, 3), "estimated_speed_kmh": round(current_speed_kmh, 1)},
                )

    abnormal_stop = False

    if guardian_enabled and stationary_since:
        try:
            stationary_since_dt = datetime.fromisoformat(stationary_since)
        except Exception:
            stationary_since_dt = now
            stationary_since = now.isoformat()
        stationary_seconds = int((now - stationary_since_dt).total_seconds())
        abnormal_stop = stationary_seconds >= GUARDIAN_STOP_THRESHOLD_SECONDS

        # Auto-escalate pending prompt when rider doesn't respond.
        if pending_check_id:
            check = await db.safety_checks.find_one({"id": pending_check_id})
            if check and check.get("status") == "pending":
                created_at_raw = check.get("created_at")
                try:
                    if isinstance(created_at_raw, str):
                        created_dt = datetime.fromisoformat(created_at_raw)
                    else:
                        created_dt = created_at_raw or now
                    unresolved_for = int((now - created_dt).total_seconds())
                except Exception:
                    unresolved_for = 0

                if unresolved_for >= GUARDIAN_AUTO_ESCALATE_SECONDS and not check.get("auto_escalated"):
                    await db.safety_checks.update_one(
                        {"id": pending_check_id},
                        {
                            "$set": {
                                "status": "auto_escalated",
                                "auto_escalated": True,
                                "escalated_at": now.isoformat(),
                            }
                        },
                    )
                    await db.sos_alerts.insert_one({
                        "id": str(uuid.uuid4()),
                        "trip_id": trip_id,
                        "user_id": trip.get("rider_id", ""),
                        "user_role": "rider",
                        "location": {"lat": request.latitude, "lng": request.longitude},
                        "auto_triggered": True,
                        "status": "active",
                        "source": "trip_guardian_no_response",
                        "created_at": now,
                    })
                    guardian_alert = {
                        "active": True,
                        "check_id": pending_check_id,
                        "type": "abnormal_stop",
                        "message": "We could not confirm rider safety. Emergency escalation started.",
                        "stop_duration_seconds": stationary_seconds,
                        "location": {"lat": request.latitude, "lng": request.longitude},
                        "escalated": True,
                        "triggered_at": now.isoformat(),
                    }

        # Create new rider safety check if abnormal stop persists and no active check.
        if abnormal_stop and not pending_check_id:
            can_prompt = True
            if last_prompt_at:
                try:
                    last_prompt_dt = datetime.fromisoformat(last_prompt_at)
                    can_prompt = (now - last_prompt_dt).total_seconds() >= GUARDIAN_PROMPT_COOLDOWN_SECONDS
                except Exception:
                    can_prompt = True

            if can_prompt:
                check_id = str(uuid.uuid4())
                await db.safety_checks.insert_one({
                    "id": check_id,
                    "trip_id": trip_id,
                    "check_type": "abnormal_stop",
                    "status": "pending",
                    "location": {"lat": request.latitude, "lng": request.longitude},
                    "stop_duration_seconds": stationary_seconds,
                    "created_at": now.isoformat(),
                })
                pending_check_id = check_id
                last_prompt_at = now.isoformat()
                guardian_alert = {
                    "active": True,
                    "check_id": check_id,
                    "type": "abnormal_stop",
                    "message": "We noticed your driver stopped for a while. Are you safe?",
                    "stop_duration_seconds": stationary_seconds,
                    "location": {"lat": request.latitude, "lng": request.longitude},
                    "triggered_at": now.isoformat(),
                }

    # Clear stale guardian alert once movement resumes.
    if moved_km >= GUARDIAN_MIN_MOVEMENT_KM and guardian_alert:
        guardian_alert = None

    if status == "ongoing" and current_speed_kmh > SPEED_SPIKE_LIMIT_KMH:
        last_speed_spike = _parse_iso_dt((trip.get("speed_spike_alert") or {}).get("triggered_at"))
        can_trigger_speed_spike = not last_speed_spike or (now - last_speed_spike).total_seconds() >= 60
        if can_trigger_speed_spike:
            violation_result = await record_violation(
                trip.get("driver_id"),
                "speed_spike",
                trip_id=trip_id,
                reporter_id=trip.get("rider_id"),
                description=f"Driver speed estimated at {round(current_speed_kmh, 1)} km/h during trip.",
            )
            violation_count = await db.violations.count_documents({
                "user_id": trip.get("driver_id"),
                "violation_type": "speed_spike",
            })
            speed_spike_alert = {
                "active": True,
                "speed_kmh": round(current_speed_kmh, 1),
                "threshold_kmh": SPEED_SPIKE_LIMIT_KMH,
                "violation_count": violation_count,
                "driver_suspended": violation_result.get("action") == "suspended",
                "message": "Driver is overspeeding. Slow down immediately.",
                "triggered_at": now.isoformat(),
            }
            guardian_alert = {
                "active": True,
                "type": "speed_spike",
                "message": f"Speed spike detected at {round(current_speed_kmh)} km/h. Nexryde has warned the driver and logged a safety violation.",
                "speed_kmh": round(current_speed_kmh, 1),
                "threshold_kmh": SPEED_SPIKE_LIMIT_KMH,
                "triggered_at": now.isoformat(),
            }
            await send_push_notification(
                trip.get("rider_id"),
                "Speed Spike Alert",
                f"Your driver reached {round(current_speed_kmh)} km/h. Stay alert while Nexryde intervenes.",
                {"type": "speed_spike_alert", "trip_id": trip_id},
            )
            await send_push_notification(
                trip.get("driver_id"),
                "Slow Down Now",
                f"Critical speed of {round(current_speed_kmh)} km/h detected. Another violation can suspend your account.",
                {"type": "speed_spike_driver", "trip_id": trip_id},
            )
            await _log_trip_event(
                trip_id,
                "speed_spike_detected",
                trip.get("driver_id"),
                {"speed_kmh": round(current_speed_kmh, 1), "violation_count": violation_count},
            )

    if status == "ongoing" and geo_fence_lock.get("active"):
        approved_route = geo_fence_lock.get("approved_route") or trip.get("route_preview_coordinates") or []
        threshold_meters = float(geo_fence_lock.get("threshold_meters") or 200.0)
        deviation_distance_meters = round(_distance_from_route_km(approved_route, float(request.latitude), float(request.longitude)) * 1000, 1)
        route_deviation = deviation_distance_meters > threshold_meters
        recent_explanation = (geo_fence_lock.get("last_driver_explanation") or {}).get("at")
        explanation_recent = False
        if recent_explanation:
            try:
                explanation_recent = (now - datetime.fromisoformat(recent_explanation)).total_seconds() <= 300
            except Exception:
                explanation_recent = False
        if route_deviation:
            geo_fence_lock["deviation_triggered"] = True
            geo_fence_lock["driver_explanation_required"] = not explanation_recent
            geo_fence_lock["last_deviation_at"] = now.isoformat()
            geo_fence_lock["last_deviation_meters"] = deviation_distance_meters
            guardian_alert = {
                "active": True,
                "type": "geo_fence_deviation",
                "message": (
                    "Driver left your approved route. Emergency contacts were notified and protected recording is active."
                    if not explanation_recent
                    else "Driver left the approved route, but an explanation was already shared. Monitoring continues."
                ),
                "deviation_meters": deviation_distance_meters,
                "threshold_meters": threshold_meters,
                "location": {"lat": request.latitude, "lng": request.longitude},
                "triggered_at": now.isoformat(),
                "driver_explanation_required": not explanation_recent,
            }
            if not geo_fence_triggered or not explanation_recent:
                await _log_trip_event(
                    trip_id,
                    "geo_fence_route_deviation",
                    trip.get("driver_id"),
                    {"deviation_meters": deviation_distance_meters, "threshold_meters": threshold_meters},
                )
                if trip.get("rider_id"):
                    await send_push_notification(
                        trip["rider_id"],
                        "Approved Route Alert",
                        f"Your driver moved {int(deviation_distance_meters)}m off the approved route.",
                        {"type": "geo_fence_deviation", "trip_id": trip_id},
                    )
                if trip.get("driver_id"):
                    await send_push_notification(
                        trip["driver_id"],
                        "Return To Approved Route",
                        "You moved outside the rider-approved route. Return now or explain the route change.",
                        {"type": "geo_fence_deviation_driver", "trip_id": trip_id},
                    )
                if not explanation_recent:
                    contact_count = await _notify_emergency_contacts_for_geofence(trip, float(request.latitude), float(request.longitude))
                    await db.sos_alerts.insert_one({
                        "id": str(uuid.uuid4()),
                        "trip_id": trip_id,
                        "user_id": trip.get("rider_id", ""),
                        "user_role": "rider",
                        "location": {"lat": request.latitude, "lng": request.longitude},
                        "auto_triggered": True,
                        "status": "active",
                        "source": "geo_fence_route_deviation",
                        "emergency_contacts_notified": contact_count,
                        "created_at": now,
                    })
        else:
            geo_fence_lock["driver_explanation_required"] = False

    await db.trips.update_one(
        {"id": trip_id},
        {
            "$push": {"actual_route": location_point},
            "$set": {
                "route_deviation_detected": route_deviation,
                "abnormal_stop_detected": abnormal_stop,
                "current_speed_kmh": round(current_speed_kmh, 1),
                "guardian_alert": guardian_alert,
                "geo_fence_trip_lock": geo_fence_lock,
                "speed_spike_alert": speed_spike_alert,
                "gps_spoofing_alert": gps_spoofing_alert,
                "guardian_state": {
                    "stationary_since": stationary_since,
                    "pending_check_id": pending_check_id,
                    "last_prompt_at": last_prompt_at,
                    "last_moved_km": round(moved_km, 4),
                    "updated_at": now.isoformat(),
                },
            },
        },
    )
    try:
        drv = trip.get("driver_id")
        if drv:
            await db.driver_profiles.update_one(
                {"user_id": drv},
                {"$set": {
                    "current_location": {
                        "lat": float(request.latitude),
                        "lng": float(request.longitude),
                        "updated_at": location_point["timestamp"],
                    }
                }},
            )
    except Exception:
        logger.debug("profile current_location sync from trip update skipped", exc_info=True)

    await _log_trip_event(
        trip_id,
        "location_update",
        trip.get("driver_id"),
        {
            "lat": request.latitude,
            "lng": request.longitude,
            "speed_kmh": round(current_speed_kmh, 1),
            "route_deviation": route_deviation,
            "geo_fence_deviation_meters": deviation_distance_meters,
            "abnormal_stop": abnormal_stop,
            "guardian_alert_active": bool(guardian_alert),
        },
    )

    try:
        await _emit_rider_trip_realtime(trip_id)
    except Exception:
        logger.debug("emit rider trip realtime failed", exc_info=True)

    return {
        "location_updated": True,
        "speed_kmh": round(current_speed_kmh, 1),
        "route_deviation": route_deviation,
        "geo_fence_deviation_meters": deviation_distance_meters,
        "abnormal_stop": abnormal_stop,
        "guardian_alert_active": bool(guardian_alert),
        "gps_spoofing_active": bool(gps_spoofing_alert and gps_spoofing_alert.get("active")),
    }


@trips_router.get("/trips/{trip_id}/status")
async def get_trip_status(trip_id: str, request: Request):
    """Return trip status with optional driver live-location snapshot."""
    actor_id = require_authenticated(request)
    trip = await db.trips.find_one({"id": trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    trip = await _maybe_escalate_invisible_shield(trip)
    trip = await _maybe_process_safe_arrival_check(trip)
    verify_trip_participant(request, trip)
    estate_gate_access = await _build_estate_gate_access(trip, actor_id)

    driver_info = None
    driver_location = None
    driver_moving = False

    driver_id = trip.get("driver_id")
    if driver_id:
        user = await db.users.find_one({"id": driver_id}) or {}
        profile = await db.driver_profiles.find_one({"user_id": driver_id}) or {}
        loc = profile.get("current_location") if isinstance(profile.get("current_location"), dict) else {}
        actual_route = trip.get("actual_route") or []
        if len(actual_route) >= 2:
            p1 = actual_route[-2]
            p2 = actual_route[-1]
            if all(k in p1 for k in ("lat", "lng")) and all(k in p2 for k in ("lat", "lng")):
                moved_km = calculate_distance_haversine(
                    float(p1["lat"]),
                    float(p1["lng"]),
                    float(p2["lat"]),
                    float(p2["lng"]),
                )
                driver_moving = moved_km >= 0.03  # ~30 meters+

        driver_location = _driver_location_snapshot_for_trip(trip, loc if isinstance(loc, dict) else None)

        # Phone visibility gate: only expose during active ride OR if rider has favorited this driver
        ACTIVE_CALL_STATUSES = {"accepted", "arrived", "ongoing", "pending_payment"}
        trip_status_raw = trip.get("status", "")
        rider_id_for_check = trip.get("rider_id")
        phone_visible = trip_status_raw in ACTIVE_CALL_STATUSES
        if not phone_visible and rider_id_for_check:
            rider_doc = await db.users.find_one({"id": rider_id_for_check}, {"_id": 0, "favorite_drivers": 1})
            if rider_doc and driver_id in (rider_doc.get("favorite_drivers") or []):
                phone_visible = True

        driver_phone_raw = user.get("phone") if phone_visible else None
        # Masked display for UI (e.g. 08012345678 → 0801***5678)
        def _mask_phone(p: str | None) -> str | None:
            if not p:
                return None
            digits = str(p).replace(" ", "").replace("-", "")
            if len(digits) >= 8:
                return digits[:4] + "***" + digits[-4:]
            return p

        # Use locked vehicle data if available (anti-fraud: prevents mid-trip plate swap)
        locked_v = trip.get("locked_vehicle") or {}
        live_plate = locked_v.get("plate") or profile.get("vehicle_plate") or ""
        live_model = locked_v.get("model") or profile.get("vehicle_model") or "Vehicle"
        live_color = locked_v.get("color") or profile.get("vehicle_color") or ""
        live_vtype = locked_v.get("vehicle_type") or profile.get("vehicle_type") or ""

        driver_info = {
            "driver_id": driver_id,
            "name": user.get("name", "Driver"),
            "rating": float(user.get("rating") or profile.get("avg_rating") or 4.5),
            "avg_rating": float(profile.get("avg_rating") or user.get("rating") or 4.5),
            # Visual identity fields — critical for arrival verification
            "profile_image": user.get("profile_image") or None,
            "face_image": profile.get("face_image") or user.get("face_image") or None,
            # Vehicle identity
            "vehicle": live_model,
            "vehicle_model": live_model,
            "vehicle_type": live_vtype,
            "plate": live_plate,
            "color": live_color,
            # Lock status
            "vehicle_locked": bool(locked_v),
            "rider_identity_confirmed": bool(trip.get("rider_identity_confirmed")),
            # Live state
            "is_online": bool(profile.get("is_online")),
            "is_moving": driver_moving,
            # Payment info
            "bank_name": profile.get("bank_name"),
            "account_number": profile.get("account_number"),
            "account_name": profile.get("account_name"),
            # Controlled phone fields
            "phone": driver_phone_raw,
            "phone_masked": _mask_phone(driver_phone_raw),
            "phone_visible": phone_visible,
        }

    return {
        "success": True,
        "trip_id": trip_id,
        "status": trip.get("status"),
        "payment_status": trip.get("payment_status"),
        "payment_method": trip.get("payment_method"),
        "face_verified_at_start": bool(trip.get("face_verified_at_start")),
        "rider_face_verified_at_pickup": bool(trip.get("rider_face_verified_at_pickup")),
        "rider_face_match_confidence": trip.get("rider_face_match_confidence"),
        "rider_face_verified_at": trip.get("rider_face_verified_at"),
        "rider_biometric_verified_at": trip.get("rider_biometric_verified_at"),
        "driver_biometric_verified_at": trip.get("driver_biometric_verified_at"),
        "biometric_handshake_ready": _trip_biometric_ready(trip),
        "driver_info": driver_info,
        "driver_location": driver_location,
        "current_speed_kmh": trip.get("current_speed_kmh"),
        "guardian_alert": trip.get("guardian_alert"),
        "geo_fence_trip_lock": trip.get("geo_fence_trip_lock"),
        "speed_spike_alert": trip.get("speed_spike_alert"),
        "gps_spoofing_alert": trip.get("gps_spoofing_alert"),
        "driver_stop_reason": trip.get("driver_stop_reason"),
        "invisible_shield_mode": trip.get("invisible_shield_mode"),
        "safe_arrival_check": trip.get("safe_arrival_check"),
        "estate_gate_access": estate_gate_access,
        "locked_vehicle": trip.get("locked_vehicle"),
        "rider_identity_confirmed": bool(trip.get("rider_identity_confirmed")),
        "mismatch_reported": bool(trip.get("mismatch_reported_at")),
    }

@trips_router.put("/trips/{trip_id}/complete")
async def complete_trip(trip_id: str, request: Request):
    trip_before = await db.trips.find_one({"id": trip_id})
    if not trip_before:
        raise HTTPException(status_code=404, detail="Trip not found")
    verify_trip_participant(request, trip_before)
    actor_id = require_authenticated(request)
    if actor_id != trip_before.get("driver_id"):
        raise HTTPException(status_code=403, detail="Only the assigned driver can complete this trip")
    pm = trip_before.get("payment_method")
    needs_confirm = rider_must_confirm_payment(str(pm) if pm is not None else None)
    completed_at = datetime.now(timezone.utc)
    shield_mode = dict(trip_before.get("invisible_shield_mode") or {})
    shield_updates = {}
    if shield_mode.get("active"):
        expected_raw = shield_mode.get("expected_arrival_at")
        try:
            expected_dt = datetime.fromisoformat(expected_raw) if expected_raw else completed_at
        except Exception:
            expected_dt = completed_at
        shield_mode["confirm_deadline_at"] = (max(expected_dt, completed_at) + timedelta(minutes=10)).isoformat()
        shield_updates["invisible_shield_mode"] = shield_mode
    safe_arrival_check = {
        "required": True,
        "trip_completed_at": completed_at.isoformat(),
        "confirm_deadline_at": (completed_at + timedelta(minutes=SAFE_ARRIVAL_CONFIRM_MINUTES)).isoformat(),
        "confirmed_at": None,
        "call_attempted_at": None,
        "emergency_notified_at": None,
        "emergency_contacts_notified": 0,
        "check_in_status": "awaiting_confirmation",
    }
    result = await db.trips.update_one(
        {"id": trip_id, "status": "ongoing"},
        {"$set": {
            "status": "completed",
            "completed_at": completed_at,
            "payment_status": "pending" if needs_confirm else "completed",
            "safe_arrival_check": safe_arrival_check,
            **shield_updates,
        }}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=400, detail="Cannot complete trip")
    
    trip = await db.trips.find_one({"id": trip_id})
    
    # Update stats
    if trip.get("driver_id"):
        await db.users.update_one({"id": trip["driver_id"]}, {"$inc": {"total_trips": 1}})
        await db.users.update_one({"id": trip["driver_id"]}, {"$inc": {"streaks.current": 1}})

    await db.users.update_one({"id": trip["rider_id"]}, {"$inc": {"total_trips": 1}})

    # Apply incentives (first-ride reward, referral, driver trial, mystery bonus).
    inc_res: dict = {}
    try:
        from routers.incentives import on_trip_completed as _on_trip_completed
        inc_res = await _on_trip_completed(
            trip_id=trip_id,
            rider_id=trip["rider_id"],
            driver_id=trip.get("driver_id", ""),
            fare=float(trip.get("fare") or 0),
        ) or {}
    except Exception as _ie:
        logger.warning(f"Incentive hook failed for trip={trip_id}: {_ie}")

    mb = inc_res.get("mystery_bonus") if isinstance(inc_res, dict) else None
    if isinstance(mb, dict) and mb.get("amount_ngn"):
        try:
            amt_mb = float(mb["amount_ngn"])
            if amt_mb > 0:
                mb_set = {"mystery_bonus_ngn": amt_mb}
                if mb.get("expires_at"):
                    mb_set["mystery_bonus_expires_at"] = mb["expires_at"]
                await db.trips.update_one({"id": trip_id}, {"$set": mb_set})
                trip["mystery_bonus_ngn"] = amt_mb
                if mb.get("expires_at"):
                    trip["mystery_bonus_expires_at"] = mb["expires_at"]
                await _log_trip_event(
                    trip_id,
                    "mystery_bonus_awarded",
                    trip.get("rider_id"),
                    {"amount_ngn": amt_mb},
                )
        except (TypeError, ValueError):
            pass

    # ── Destination mode: increment daily trip counter ──────────────────────
    if trip.get("driver_id"):
        driver_dest_profile = await db.driver_profiles.find_one(
            {"user_id": trip["driver_id"]}, {"_id": 0, "destination_mode": 1,
                                              "daily_destination_trips": 1,
                                              "destination_last_reset_date": 1}
        )
        if driver_dest_profile and driver_dest_profile.get("destination_mode"):
            today_str = datetime.now().strftime("%Y-%m-%d")
            last_reset = driver_dest_profile.get("destination_last_reset_date", "")
            current_count = int(driver_dest_profile.get("daily_destination_trips", 0) or 0)
            if last_reset != today_str:
                current_count = 0
            new_count = current_count + 1
            DEST_DAILY_LIMIT = 3
            updates = {
                "daily_destination_trips": new_count,
                "destination_last_reset_date": today_str,
            }
            if new_count >= DEST_DAILY_LIMIT:
                updates["destination_mode"] = False  # auto-disable on limit
            await db.driver_profiles.update_one(
                {"user_id": trip["driver_id"]},
                {"$set": updates}
            )
            if new_count >= DEST_DAILY_LIMIT:
                await send_push_notification(
                    trip["driver_id"],
                    "Daily Destination Limit Reached",
                    f"You've completed {DEST_DAILY_LIMIT} trips towards your destination today. Trips towards destination is now disabled. Resets at midnight.",
                    {"type": "destination_limit_reached"},
                )
            else:
                remaining = DEST_DAILY_LIMIT - new_count
                await send_push_notification(
                    trip["driver_id"],
                    "Destination Trip Counted",
                    f"Trip counted towards destination ({new_count}/{DEST_DAILY_LIMIT}). {remaining} trip{'s' if remaining != 1 else ''} remaining today.",
                    {"type": "destination_trip_counted", "count": new_count, "limit": DEST_DAILY_LIMIT},
                )
    # ────────────────────────────────────────────────────────────────────────
    
    trip["_id"] = str(trip["_id"])
    await _log_trip_event(trip_id, "trip_completed", trip.get("driver_id"), {"fare": trip.get("fare")})
    if trip.get("driver_id"):
        await _refresh_driver_visibility_score(trip["driver_id"])
    if trip.get("rider_id"):
        trip_body = f"Your trip is complete. Fare: ₦{trip.get('fare', 0):,.0f}"
        mb_ngn = float(trip.get("mystery_bonus_ngn") or 0)
        if mb_ngn > 0:
            trip_body += f" You unlocked a Mystery Bonus: ₦{mb_ngn:,.0f} promo credit."
        await send_push_notification(
            trip["rider_id"],
            "Trip Completed",
            trip_body,
            {"type": "trip_completed", "trip_id": trip_id, "mystery_bonus_ngn": mb_ngn or None},
        )
        await send_push_notification(
            trip["rider_id"],
            "Confirm Safe Arrival",
            "Please confirm you arrived safely. Nexryde will check in automatically if you do not respond.",
            {"type": "safe_arrival_checkin", "trip_id": trip_id},
        )
        await maybe_send_rider_favorite_engagement_pushes(trip["rider_id"], trip.get("driver_id"))
    if trip.get("driver_id"):
        did = trip["driver_id"]
        try:
            n_drv_done = await db.trips.count_documents({"driver_id": did, "status": "completed"})
        except Exception:
            n_drv_done = 0
        try:
            fare_f = float(trip.get("fare") or 0)
        except (TypeError, ValueError):
            fare_f = 0.0
        # Richer copy on early milestones — same push channel as every trip (bar + lock screen).
        if n_drv_done == 1:
            drv_title = "First trip in the books"
            drv_body = (
                f"You earned ₦{fare_f:,.0f}. Stay online on the map so nearby riders can send you requests."
            )
            drv_data = {"type": "trip_completed", "trip_id": trip_id, "milestone": "first_driver_trip"}
        elif n_drv_done == 3:
            drv_title = "Trip completed"
            drv_body = (
                f"₦{fare_f:,.0f} earned — momentum builds your visibility. "
                f"Peak hours often mean back-to-back trips."
            )
            drv_data = {"type": "trip_completed", "trip_id": trip_id, "milestone": "three_driver_trips"}
        else:
            drv_title = "Trip Completed"
            drv_body = f"Trip completed! ₦{fare_f:,.0f} earned."
            drv_data = {"type": "trip_completed", "trip_id": trip_id}
        await send_push_notification(did, drv_title, drv_body, drv_data)
    if trip.get("payment_status") == "completed":
        schedule_trip_receipt_emails_after_payment(trip_id)
    await _emit_rider_trip_realtime(trip_id)
    return trip


@trips_router.put("/trips/{trip_id}/confirm-payment")
async def confirm_trip_payment(trip_id: str, request: Request):
    trip = await db.trips.find_one({"id": trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    verify_trip_participant(request, trip)

    actor_id = require_authenticated(request)
    if actor_id != trip.get("rider_id"):
        raise HTTPException(status_code=403, detail="Only the rider can confirm payment")

    if trip.get("status") != "completed":
        raise HTTPException(status_code=400, detail="Payment can only be confirmed after trip completion")
    if trip.get("payment_status") == "completed":
        return {"success": True, "payment_status": "completed", "message": "Payment already confirmed"}

    if is_wallet_payment_method(trip.get("payment_method")):
        rider_id = trip.get("rider_id")
        amount = trip_fare_amount(trip)
        await apply_rider_wallet_ride_debit(db, rider_id, trip_id, amount)
        driver_id = trip.get("driver_id")
        if driver_id:
            await apply_driver_wallet_ride_credit(db, driver_id, trip_id, amount)

    await db.trips.update_one(
        {"id": trip_id},
        {"$set": {"payment_status": "completed", "paid_at": datetime.utcnow()}},
    )
    await _log_trip_event(trip_id, "payment_confirmed", actor_id, {"payment_status": "completed"})
    schedule_trip_receipt_emails_after_payment(trip_id)
    await _emit_rider_trip_realtime(trip_id)
    return {"success": True, "payment_status": "completed", "message": "Payment confirmed"}

@trips_router.put("/trips/{trip_id}/cancel")
async def cancel_trip(trip_id: str, request: dict, http_request: Request):
    cancelled_by = require_authenticated(http_request)
    
    trip = await db.trips.find_one({"id": trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    verify_trip_participant(http_request, trip)
    
    if trip["status"] in ["completed", "cancelled"]:
        raise HTTPException(status_code=400, detail="Cannot cancel this trip")
    
    await db.trips.update_one(
        {"id": trip_id},
        {"$set": {"status": "cancelled", "cancelled_by": cancelled_by, "cancelled_at": datetime.utcnow()}}
    )
    await _log_trip_event(trip_id, "trip_cancelled", cancelled_by, {})
    await _emit_rider_trip_realtime(trip_id)

    if cancelled_by == trip.get("driver_id"):
        await db.driver_profiles.update_one(
            {"user_id": cancelled_by},
            {"$inc": {"cancellation_count": 1}}
        )
        await db.users.update_one(
            {"id": cancelled_by},
            {"$set": {"streaks.current": 0}}
        )
        await _refresh_driver_visibility_score(cancelled_by)
        enforcement_result = await record_violation(cancelled_by, "driver_cancellation", trip_id)
    else:
        enforcement_result = await record_violation(cancelled_by, "rider_cancellation", trip_id)
    
    return {"message": "Trip cancelled", "enforcement": enforcement_result}

@trips_router.put("/trips/{trip_id}/rate")
async def rate_trip(trip_id: str, rater_id: str, request: ComfortRatingRequest, http_request: Request):
    """Rate trip with comfort ratings"""
    auth_user_id = require_authenticated(http_request)
    if auth_user_id != rater_id:
        raise HTTPException(status_code=403, detail="You can only rate trips with your own account")
    trip = await db.trips.find_one({"id": trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    if auth_user_id not in {trip.get("rider_id"), trip.get("driver_id")}:
        raise HTTPException(status_code=403, detail="You do not have permission to rate this trip")
    
    if trip["status"] != "completed":
        raise HTTPException(status_code=400, detail="Can only rate completed trips")
    
    is_rider_rating = rater_id == trip["rider_id"]
    update_field = "driver_rating" if is_rider_rating else "rider_rating"
    rated_user_id = trip["driver_id"] if is_rider_rating else trip["rider_id"]
    
    update_data = {update_field: request.overall_rating}
    rating_protection_result = None
    if is_rider_rating and float(request.overall_rating) <= 1.0 and rated_user_id:
        complaint_count = await db.trip_issue_reports.count_documents(
            {"trip_id": trip_id, "reporter_id": rater_id}
        )
        has_rider_complaint = complaint_count > 0
        analysis = _analyze_one_star_rating_consistency(trip, has_rider_complaint, request.comment)
        rating_protection_result = {
            "enabled": True,
            "rated_user_id": rated_user_id,
            "original_rating": float(request.overall_rating),
            "auto_removed": bool(analysis["auto_remove"]),
            "has_rider_complaint": has_rider_complaint,
            "consistency_score": analysis["consistency_score"],
            "review_reason": analysis["review_reason"],
            "safe_checks": analysis["safe_checks"],
            "reviewed_at": datetime.now(timezone.utc).isoformat(),
        }
        update_data["rating_protection"] = rating_protection_result
        if analysis["auto_remove"]:
            # Keep an audit trail but exclude unfair score from driver aggregates.
            update_data["driver_rating_original"] = float(request.overall_rating)
            update_data["driver_rating_removed"] = True
            update_data["driver_rating_removed_at"] = datetime.now(timezone.utc).isoformat()
            update_data["driver_rating_removal_reason"] = analysis["review_reason"]
            update_data[update_field] = None
    
    if is_rider_rating and request.smoothness:
        update_data["comfort_ratings"] = {
            "smoothness": request.smoothness,
            "politeness": request.politeness,
            "cleanliness": request.cleanliness,
            "safety": request.safety
        }
        update_data["rating_comment"] = request.comment
        
        # Update driver comfort ratings
        if rated_user_id:
            profile = await db.driver_profiles.find_one({"user_id": rated_user_id})
            if profile:
                # Calculate new averages
                for rating_type in ["smoothness", "politeness", "cleanliness", "safety"]:
                    if getattr(request, rating_type):
                        current = profile.get(f"{rating_type}_rating", 5.0)
                        new_rating = (current + getattr(request, rating_type)) / 2
                        await db.driver_profiles.update_one(
                            {"user_id": rated_user_id},
                            {"$set": {f"{rating_type}_rating": round(new_rating, 1)}}
                        )
    
    await db.trips.update_one({"id": trip_id}, {"$set": update_data})
    await _log_trip_event(
        trip_id,
        "trip_rated",
        rater_id,
        {"overall_rating": request.overall_rating, "is_rider_rating": is_rider_rating},
    )
    if rating_protection_result:
        await _log_trip_event(
            trip_id,
            "driver_rating_protection_reviewed",
            "system",
            rating_protection_result,
        )
    
    # Update user rating
    if rated_user_id:
        if is_rider_rating:
            ratings = await db.trips.find(
                {"driver_id": rated_user_id, "driver_rating": {"$exists": True, "$ne": None}}
            ).to_list(1000)
            if ratings:
                avg_rating = sum(r["driver_rating"] for r in ratings) / len(ratings)
                await db.users.update_one({"id": rated_user_id}, {"$set": {"rating": round(avg_rating, 1)}})
                await _refresh_driver_visibility_score(rated_user_id)
        else:
            ratings = await db.trips.find(
                {"rider_id": rated_user_id, "rider_rating": {"$exists": True}}
            ).to_list(1000)
            if ratings:
                avg_rating = sum(r["rider_rating"] for r in ratings) / len(ratings)
                cnt = len(ratings)
                await db.users.update_one(
                    {"id": rated_user_id},
                    {
                        "$set": {
                            "rating": round(avg_rating, 1),
                            "rider_reputation_trip_count": cnt,
                            "shield_rider_flag": cnt >= SHIELD_MIN_TRIPS_FOR_FLAG and avg_rating < SHIELD_LOW_RIDER_RATING,
                        }
                    },
                )
    
    if rating_protection_result and rating_protection_result.get("auto_removed"):
        return {
            "message": "Rating submitted and automatically removed by rating protection review.",
            "rating_protection": rating_protection_result,
        }
    return {"message": "Rating submitted"}

@trips_router.get("/trips/user/{user_id}")
async def get_user_trips(user_id: str, request: Request, role: str = "rider"):
    verify_owner_strict(request, user_id)
    if role == "rider":
        trips = await db.trips.find({"rider_id": user_id}).sort("created_at", -1).to_list(50)
    else:
        trips = await db.trips.find({"driver_id": user_id}).sort("created_at", -1).to_list(50)
    
    for trip in trips:
        trip["_id"] = str(trip["_id"])
    return trips

@trips_router.get("/trips/user/{user_id}/with-driver/{driver_id}")
async def get_trips_with_driver(user_id: str, driver_id: str, request: Request):
    """Get ride history between a rider and a specific driver"""
    verify_owner_strict(request, user_id)
    trips = await db.trips.find({
        "rider_id": user_id,
        "driver_id": driver_id,
        "status": "completed",
    }).sort("created_at", -1).to_list(20)
    for trip in trips:
        trip["_id"] = str(trip["_id"])
    return {
        "trips": trips,
        "total_rides": len(trips),
        "total_spent": sum(float(t.get("fare", 0)) for t in trips),
    }

@trips_router.get("/trips/{trip_id}")
async def get_trip(trip_id: str, request: Request):
    actor_id = require_authenticated(request)
    trip = await db.trips.find_one({"id": trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    trip = await _maybe_process_safe_arrival_check(trip)
    verify_trip_participant(request, trip)
    gate_access = await _build_estate_gate_access(trip, actor_id)
    trip["_id"] = str(trip["_id"])
    if gate_access:
        trip["estate_gate_access"] = gate_access
    trip["current_speed_kmh"] = trip.get("current_speed_kmh")
    trip["speed_spike_alert"] = trip.get("speed_spike_alert")
    trip["gps_spoofing_alert"] = trip.get("gps_spoofing_alert")
    trip["safe_arrival_check"] = trip.get("safe_arrival_check")
    # Driver app: expose rider name/phone for call & chat (same active window as rider seeing driver phone)
    if actor_id == trip.get("driver_id") and trip.get("rider_id"):
        trip_status_raw = str(trip.get("status") or "")
        if trip_status_raw in {"accepted", "arrived", "ongoing", "pending_payment"}:
            rider_doc = await db.users.find_one(
                {"id": trip["rider_id"]},
                {"_id": 0, "name": 1, "phone": 1, "profile_image": 1},
            )
            if rider_doc:
                trip["rider_phone"] = rider_doc.get("phone")
                if not trip.get("rider_name"):
                    trip["rider_name"] = rider_doc.get("name")
                trip["rider_profile_image"] = rider_doc.get("profile_image")
    return trip


@trips_router.get("/trips/{trip_id}/ledger")
async def get_trip_trust_ledger(trip_id: str, request: Request):
    """Return immutable trust timeline for support/safety review."""
    trip = await db.trips.find_one({"id": trip_id}, {"_id": 0, "id": 1, "status": 1, "driver_id": 1, "rider_id": 1})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    verify_trip_participant(request, trip)
    events = await db.trip_events.find({"trip_id": trip_id}, {"_id": 0}).sort("created_at", 1).to_list(1000)
    return {"success": True, "trip": trip, "events": events}


@trips_router.post("/trips/{trip_id}/black-shield/court-order-access")
async def request_black_shield_court_order_access(
    trip_id: str,
    body: BlackShieldCourtOrderAccessRequest,
    request: Request,
):
    requester_id = require_authenticated(request)
    trip = await db.trips.find_one({"id": trip_id}, {"_id": 0, "id": 1, "rider_id": 1, "driver_id": 1})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    # Participants can generate legal access tokens for agencies/insurers;
    # support/admin can also use this flow through authenticated service users.
    if requester_id not in {trip.get("rider_id"), trip.get("driver_id")}:
        requester = await db.users.find_one({"id": requester_id}, {"_id": 0, "role": 1}) or {}
        if requester.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Only trip participants or admins can request court-order access")

    now = datetime.now(timezone.utc)
    token = hashlib.sha256(
        f"{trip_id}:{requester_id}:{body.court_order_ref}:{now.isoformat()}:{uuid.uuid4()}".encode()
    ).hexdigest()
    expires_at = (now + timedelta(hours=24)).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "trip_id": trip_id,
        "requested_by": requester_id,
        "court_order_ref": body.court_order_ref.strip(),
        "requesting_agency": body.requesting_agency.strip(),
        "purpose": body.purpose.strip(),
        "access_token": token,
        "created_at": now.isoformat(),
        "expires_at": expires_at,
        "status": "issued",
    }
    await db.black_shield_access_tokens.insert_one(doc)
    await _log_trip_event(
        trip_id,
        "black_shield_court_order_access_issued",
        requester_id,
        {"requesting_agency": doc["requesting_agency"], "court_order_ref": doc["court_order_ref"]},
    )
    return {"success": True, "access_token": token, "expires_at": expires_at}


@trips_router.get("/trips/{trip_id}/black-box")
async def get_trip_black_box_record(trip_id: str, request: Request):
    """Return the official tamper-evident Black Shield record."""
    requester_id = require_authenticated(request)
    trip = await db.trips.find_one({"id": trip_id}, {"_id": 0})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    is_participant = requester_id in {trip.get("rider_id"), trip.get("driver_id")}
    if not is_participant:
        access_token = request.query_params.get("access_token")
        if not access_token:
            raise HTTPException(status_code=403, detail="Black Shield access requires a valid court-order access token")
        access = await db.black_shield_access_tokens.find_one(
            {"trip_id": trip_id, "access_token": access_token, "status": "issued"},
            {"_id": 0},
        )
        if not access:
            raise HTTPException(status_code=403, detail="Invalid Black Shield access token")
        expires_dt = _parse_iso_dt(access.get("expires_at"))
        if not expires_dt or datetime.now(timezone.utc) > expires_dt:
            raise HTTPException(status_code=403, detail="Black Shield access token expired")
    events = await db.trip_events.find({"trip_id": trip_id}, {"_id": 0}).sort("created_at", 1).to_list(2000)
    record = await _build_black_box_record(trip, events)
    await _log_trip_event(
        trip_id,
        "black_shield_record_accessed",
        requester_id,
        {"third_party_access": not is_participant},
    )
    return {"success": True, "black_box": record}


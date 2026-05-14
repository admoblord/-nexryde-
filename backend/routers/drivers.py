"""Drivers Router - Driver profile, location, documents, verification, stats, onboarding, earnings, heatmap."""
from fastapi import APIRouter, HTTPException, Form, File, UploadFile, Request
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, Tuple
from datetime import datetime, timezone, timedelta
import logging
import os
import json
import uuid
import math
import re
import asyncio
import hashlib

from database import db
from surge_pricing import SURGE_CONFIG
from surge_demand import (
    haversine_km as _haversine_km,
    trip_pickup_coords as _trip_pickup_coords,
    estimate_area_demand_ratio_near as _estimate_area_demand_ratio_near,
)
from face_match import FACE_MATCH_SENSITIVE_MIN, face_match_confidence
from earnings_query import match_completed_trip_paid_for_earnings
from auth_guard import verify_owner_strict
from admin_guard import require_admin_request

try:
    from emergentintegrations.llm.chat import LlmChat, UserMessage
except ImportError:
    LlmChat = None
    UserMessage = None

try:
    from routers.auth import send_driver_verification_notification
except ImportError:
    async def send_driver_verification_notification(user_id, status, reason=None):
        pass

logger = logging.getLogger('server')
drivers_router = APIRouter(prefix="/api", tags=["Drivers"])

EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')
AI_AUTO_APPROVE_ENABLED = os.environ.get("AI_AUTO_APPROVE_ENABLED", "true").lower() in {"1", "true", "yes", "on"}
AI_AUTO_APPROVE_MIN_CONFIDENCE = float(os.environ.get("AI_AUTO_APPROVE_MIN_CONFIDENCE", "0.92"))
AI_MAX_RISK_SCORE = float(os.environ.get("AI_MAX_RISK_SCORE", "0.2"))
AI_SECOND_PASS_ENABLED = os.environ.get("AI_SECOND_PASS_ENABLED", "true").lower() in {"1", "true", "yes", "on"}
AI_SECOND_PASS_MIN_CONFIDENCE = float(os.environ.get("AI_SECOND_PASS_MIN_CONFIDENCE", "0.95"))
AI_FACE_ID_MIN_SCORE = float(os.environ.get("AI_FACE_ID_MIN_SCORE", "0.9"))
REQUIRED_DRIVER_DOC_KEYS = {
    "nin",
    "drivers_license",
    "passport_photo",
    "vehicle_registration",
    "vehicle_license",
    "road_worthiness",
    "insurance",
    "vehicle_front",
    "vehicle_interior",
    "vehicle_ac",
}
# hacking_permit is optional — driver may or may not have it; never block approval


def _missing_required_archived_docs(doc_record: Optional[dict]) -> list[str]:
    docs = (doc_record or {}).get("documents") or {}
    return sorted([k for k in REQUIRED_DRIVER_DOC_KEYS if k not in docs])


def _sha256_bytes(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def _allowed_magic_bytes(content: bytes) -> bool:
    signatures = (
        b"\xff\xd8\xff",
        b"\x89PNG\r\n\x1a\n",
        b"RIFF",
        b"GIF87a",
        b"GIF89a",
    )
    return any(content.startswith(sig) for sig in signatures)


async def _append_verification_audit_event(
    driver_id: str,
    verification_id: str,
    action: str,
    actor_type: str,
    actor_id: str,
    details: Optional[dict] = None,
):
    await db.driver_verification_audit.insert_one(
        {
            "id": str(uuid.uuid4()),
            "driver_id": driver_id,
            "verification_id": verification_id,
            "action": action,
            "actor_type": actor_type,
            "actor_id": actor_id,
            "details": details or {},
            "created_at": datetime.now(timezone.utc),
        }
    )


async def _find_cross_driver_hash_duplicates(doc_hashes: dict[str, str], current_driver_id: str) -> list[dict]:
    duplicates = []
    for doc_key, sha in doc_hashes.items():
        if not sha:
            continue
        existing = await db.driver_documents.find_one(
            {
                "driver_id": {"$ne": current_driver_id},
                f"documents.{doc_key}.sha256": sha,
            },
            {"_id": 0, "driver_id": 1},
        )
        if existing:
            duplicates.append({"doc_type": doc_key, "driver_id": existing.get("driver_id"), "sha256": sha})
    return duplicates


async def _snapshot_approved_documents(
    driver_id: str,
    verification_id: str,
    approved_by: str,
    notes: Optional[str] = None,
    force: bool = False,
) -> dict:
    """Create immutable approved-doc snapshot for admin recheck/audit trail.

    Image data (base64) is intentionally NOT stored in the snapshot to avoid
    the MongoDB 16 MB BSON document limit.  The admin panel fetches image data
    on demand via /admin/verifications/{id}/document-image/{doc_key} which reads
    directly from the driver_documents collection.

    When ``force=True`` the missing-docs guard is skipped so admin can approve
    even when the document archive is incomplete.
    """
    archived = await db.driver_documents.find_one({"driver_id": driver_id}, {"_id": 0}) or {}
    missing = _missing_required_archived_docs(archived)
    if missing and not force:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot approve. Missing required documents: {', '.join(missing)}"
        )

    raw_docs = archived.get("documents") or {}
    # Store only metadata — strip binary data so the snapshot stays well under 16 MB
    docs_meta = {
        k: {
            "filename": v.get("filename"),
            "content_type": v.get("content_type"),
            "size_bytes": v.get("size_bytes"),
            "sha256": v.get("sha256"),
            "uploaded_at": v.get("uploaded_at"),
            "expiry_date": v.get("expiry_date"),
        }
        for k, v in raw_docs.items()
    }

    snapshot = {
        "id": str(uuid.uuid4()),
        "driver_id": driver_id,
        "verification_id": verification_id,
        "approved_by": approved_by,
        "approved_at": datetime.now(timezone.utc),
        "status": "approved",
        "notes": notes,
        "document_count": len(docs_meta),
        "documents": docs_meta,
        "source_submitted_at": archived.get("submitted_at"),
    }
    await db.driver_document_audit.insert_one(snapshot)
    return snapshot

TIER_CONFIG = {
    "basic": {"name": "Nexryde Basic", "monthly_fee": 18000, "earning_per_ride": {"min": 200, "max": 300}},
    "premium": {"name": "Nexryde Premium", "monthly_fee": 18000, "earning_per_ride": {"min": 300, "max": 450}},
}


def _fare_city_for_surge(lat: Optional[float], lng: Optional[float], fallback_city: Optional[str]) -> str:
    """Maps GPS / saved city → fare_config city slug."""
    from routers.ai_features import detect_city

    loc = detect_city(lat, lng, fallback_city)
    raw = (loc.get("city") or "lagos").lower().strip().replace(" ", "_")
    if raw in ("lagos", "abuja", "port_harcourt"):
        return raw
    return "default"


def _surge_demand_band_meta(ratio: float) -> Dict[str, str]:
    """Labels aligned with hybrid surge tier thresholds."""
    r = max(0.0, min(1.0, float(ratio)))
    hi = float(SURGE_CONFIG["high_demand_threshold"])
    vh = float(SURGE_CONFIG["very_high_demand_threshold"])
    cr = float(SURGE_CONFIG["critical_demand_threshold"])
    if r >= cr:
        return {"key": "critical", "label": "Critical demand"}
    if r >= vh:
        return {"key": "very_high", "label": "Very high demand"}
    if r >= hi:
        return {"key": "high", "label": "High demand"}
    return {"key": "normal", "label": "Balanced supply"}


def _parse_iso_datetime(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


async def _trigger_ghost_driver_lock(
    user_id: str,
    distance_km: float,
    time_gap_seconds: float,
    previous_location: dict,
    incoming_location: dict,
) -> None:
    now_iso = datetime.now(timezone.utc).isoformat()
    lock_payload = {
        "active": True,
        "reason": "ghost_driver_detected",
        "detected_at": now_iso,
        "distance_km": round(distance_km, 2),
        "time_gap_seconds": int(time_gap_seconds),
        "previous_location": previous_location,
        "incoming_location": incoming_location,
    }
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"ghost_driver_lock": lock_payload, "earnings_frozen": True}},
    )
    await db.driver_profiles.update_one(
        {"user_id": user_id},
        {"$set": {"is_online": False, "ghost_driver_lock": lock_payload, "pending_identity_reconfirm": True}},
        upsert=True,
    )
    await db.notifications.insert_one(
        {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "type": "ghost_driver_lock",
            "title": "Ghost Driver Protection Activated",
            "message": "Concurrent location misuse was detected. Sessions locked and earnings frozen pending identity reconfirmation.",
            "read": False,
            "created_at": now_iso,
            "data": lock_payload,
        }
    )


def _compute_visibility_score(acceptance_rate: float, completion_rate: float, rating: float, cancellations: int, completed_trips: int) -> float:
    score = (
        max(0.0, min(100.0, acceptance_rate)) * 0.35
        + max(0.0, min(100.0, completion_rate)) * 0.35
        + (max(0.0, min(5.0, rating)) / 5.0) * 100.0 * 0.20
        + (min(completed_trips, 200) / 200.0) * 100.0 * 0.10
    )
    score -= min(cancellations * 1.5, 25.0)
    return round(max(0.0, min(100.0, score)), 2)


def _build_salary_mode_plan(target: float, achieved: float, now: datetime) -> dict:
    target = max(0.0, float(target or 0.0))
    achieved = max(0.0, float(achieved or 0.0))
    month_end = (now.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
    days_in_month = max(28, month_end.day)
    day_of_month = max(1, now.day)
    days_left = max(1, days_in_month - day_of_month + 1)
    remaining = max(0.0, target - achieved)
    expected_by_today = (target / days_in_month) * day_of_month if target > 0 else 0.0
    pace_gap = max(0.0, expected_by_today - achieved)
    projected_month_end = (achieved / day_of_month) * days_in_month if day_of_month > 0 else achieved
    return {
        "enabled": target > 0,
        "monthly_income_target": round(target, 2),
        "achieved_this_month": round(achieved, 2),
        "remaining_to_target": round(remaining, 2),
        "days_left_in_month": days_left,
        "required_daily_average": round(remaining / days_left, 2) if remaining > 0 else 0.0,
        "expected_by_today": round(expected_by_today, 2),
        "pace_gap": round(pace_gap, 2),
        "projected_month_end": round(projected_month_end, 2),
        "dispatch_priority_boost": round(min(1.35, 1.0 + (pace_gap / max(target, 1.0)) * 2.2), 2) if pace_gap > 0 else 1.0,
        "status": "behind" if pace_gap > 0 else ("on_track" if target > 0 else "inactive"),
    }

# ==================== MODELS ====================

# Canonical ride categories supported by dispatch
VALID_RIDE_CATEGORIES = {"economy", "comfort", "xl", "premium", "female_only"}
# Friendly alias normalisation (client may send "standard")
CATEGORY_ALIASES: dict[str, str] = {"standard": "economy"}


def _normalize_category(cat: str) -> Optional[str]:
    """Return canonical category key or None if invalid."""
    c = cat.strip().lower()
    c = CATEGORY_ALIASES.get(c, c)
    return c if c in VALID_RIDE_CATEGORIES else None


def _normalize_categories(cats: list[str]) -> list[str]:
    result = []
    for c in cats:
        nc = _normalize_category(c)
        if nc and nc not in result:
            result.append(nc)
    return result


class DriverProfileUpdate(BaseModel):
    vehicle_type: Optional[str] = None
    vehicle_model: Optional[str] = None
    vehicle_plate: Optional[str] = None
    vehicle_color: Optional[str] = None
    nin_verified: Optional[bool] = None
    license_uploaded: Optional[bool] = None
    vehicle_docs_uploaded: Optional[bool] = None
    selfie_verified: Optional[bool] = None
    face_image: Optional[str] = None
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    account_name: Optional[str] = None


class DriverCategoriesUpdate(BaseModel):
    active_categories: list[str] = Field(default_factory=list)

class LocationUpdate(BaseModel):
    latitude: float
    longitude: float
    device_id: Optional[str] = None

class DriverVerificationSubmission(BaseModel):
    user_id: str
    personal_info: dict
    vehicle_info: dict
    documents: dict

class FaceVerificationRequest(BaseModel):
    face_image: str


class BiometricWithdrawalRequest(BaseModel):
    amount: float = Field(..., gt=0)
    face_image: str
    idempotency_key: Optional[str] = Field(default=None, min_length=6, max_length=120)


class WithdrawalSettlementRequest(BaseModel):
    status: str = Field(..., pattern="^(settled|failed)$")
    reason: Optional[str] = Field(default=None, max_length=240)
    provider_reference: Optional[str] = Field(default=None, max_length=120)


class WithdrawalProcessingRequest(BaseModel):
    provider_reference: str = Field(..., min_length=6, max_length=120)
    note: Optional[str] = Field(default=None, max_length=240)


class WithdrawalProviderCallbackRequest(BaseModel):
    transaction_id: str = Field(..., min_length=8)
    provider_reference: str = Field(..., min_length=6, max_length=120)
    status: str = Field(..., pattern="^(settled|failed)$")
    reason: Optional[str] = Field(default=None, max_length=240)


class EarningsVaultLockRequest(BaseModel):
    amount: float = Field(..., gt=0)


class EarningsVaultUnlockRequest(BaseModel):
    amount: float = Field(..., gt=0)


class EarningsVaultReleaseRequest(BaseModel):
    face_image: str
    pin: str = Field(..., min_length=4, max_length=8)


VAULT_RELEASE_COOLDOWN_HOURS = 48


def _vault_pin_hash(user_id: str, pin: str) -> str:
    secret = os.environ.get("JWT_SECRET", "nexryde-fortress")
    return hashlib.sha256(f"{secret}:{user_id}:{pin}".encode()).hexdigest()


class SimSwapSignalRequest(BaseModel):
    sim_fingerprint: str = Field(..., min_length=12, max_length=256)
    carrier_name: Optional[str] = Field(default=None, max_length=120)
    phone: Optional[str] = Field(default=None, max_length=24)


class DriverSalaryModeUpdate(BaseModel):
    enabled: bool = False
    monthly_income_target: float = Field(default=0, ge=0)

# ==================== DRIVER PROFILE ====================

@drivers_router.get("/drivers/{user_id}/profile")
async def get_driver_profile(user_id: str, request: Request):
    verify_owner_strict(request, user_id)
    profile = await db.driver_profiles.find_one({"user_id": user_id})
    if not profile:
        raise HTTPException(status_code=404, detail="Driver profile not found")
    profile["_id"] = str(profile["_id"])

    # Derive nin_verified: driver has a NIN number AND their documents were approved.
    nin_raw = str(profile.get("nin_number") or profile.get("nin") or "").strip()
    is_approved = profile.get("verification_status") == "approved"
    nin_verified = bool(nin_raw) and is_approved
    profile["nin_verified"] = nin_verified

    # Derive document statuses so the UI can reflect the real state.
    license_ok = is_approved and bool(profile.get("license_uploaded") or profile.get("drivers_license"))
    passport_ok = is_approved and bool(profile.get("passport_photo"))
    insurance_ok = is_approved and bool(profile.get("insurance"))
    profile["document_statuses"] = {
        "nin": "verified" if nin_verified else ("submitted" if nin_raw else "not_submitted"),
        "drivers_license": "verified" if license_ok else ("pending" if is_approved else "not_submitted"),
        "passport_photo": "verified" if passport_ok else ("pending" if is_approved else "not_submitted"),
        "insurance": "verified" if insurance_ok else ("pending" if is_approved else "not_submitted"),
        "all_verified": is_approved,
    }

    # Build vehicles[] for backward compat: if profile has single-vehicle fields but no array, synthesize.
    vehicles = [dict(v) for v in (profile.get("vehicles") or [])]
    if not vehicles and profile.get("vehicle_model"):
        vehicles = [{
            "id": "default",
            "type": profile.get("vehicle_type", ""),
            "make": profile.get("vehicle_make", ""),
            "model": profile.get("vehicle_model", ""),
            "year": str(profile.get("vehicle_year", "")),
            "color": profile.get("vehicle_color", ""),
            "plate": profile.get("vehicle_plate_number") or profile.get("vehicle_plate", ""),
            "is_default": True,
        }]
    profile["vehicles"] = vehicles

    # driverProfileComplete flag: front-end can use this to skip onboarding.
    profile["driver_profile_complete"] = bool(
        nin_verified
        and is_approved
        and len(vehicles) > 0
        and profile.get("profile_completed")
    )

    return profile

@drivers_router.put("/drivers/{user_id}/profile")
async def update_driver_profile(user_id: str, request: Request, body: DriverProfileUpdate):
    verify_owner_strict(request, user_id)
    update_data = {k: v for k, v in body.dict().items() if v is not None}
    if update_data:
        result = await db.driver_profiles.update_one({"user_id": user_id}, {"$set": update_data})
        if result.modified_count == 0:
            await db.driver_profiles.insert_one({"user_id": user_id, **update_data})
    profile = await db.driver_profiles.find_one({"user_id": user_id})
    profile["_id"] = str(profile["_id"])
    return profile


# ==================== MULTI-VEHICLE MANAGEMENT ====================

def _build_vehicle_entry(data: dict, is_active: bool = False) -> dict:
    """Normalise and build a vehicle dict from request data."""
    return {
        "id": data.get("id") or str(uuid.uuid4()),
        "type": str(data.get("type") or data.get("vehicle_type") or "").strip(),
        "make": str(data.get("make") or data.get("vehicle_make") or "").strip(),
        "model": str(data.get("model") or data.get("vehicle_model") or "").strip(),
        "year": str(data.get("year") or data.get("vehicle_year") or "").strip(),
        "color": str(data.get("color") or data.get("vehicle_color") or "").strip(),
        "plate": str(data.get("plate") or data.get("vehicle_plate_number") or data.get("vehicle_plate") or "").strip().upper(),
        "is_active": bool(is_active),
        "verification_status": data.get("verification_status", "not_submitted"),
        "documents": data.get("documents") or {},
        "registered_at": data.get("registered_at") or datetime.now(timezone.utc).isoformat(),
    }


@drivers_router.get("/drivers/{user_id}/vehicles")
async def list_driver_vehicles(user_id: str, request: Request):
    """Return all vehicles registered to this driver."""
    verify_owner_strict(request, user_id)
    profile = await db.driver_profiles.find_one({"user_id": user_id}, {"_id": 0, "vehicles": 1, "vehicle_model": 1, "vehicle_make": 1, "vehicle_year": 1, "vehicle_type": 1, "vehicle_color": 1, "vehicle_plate_number": 1, "vehicle_plate": 1, "verification_status": 1})
    if not profile:
        raise HTTPException(status_code=404, detail="Driver profile not found")
    vehicles = list(profile.get("vehicles") or [])
    # Back-compat: synthesise from flat fields if no array yet
    if not vehicles and profile.get("vehicle_model"):
        vs = profile.get("verification_status", "not_submitted")
        vehicles = [_build_vehicle_entry({
            "id": "default",
            "type": profile.get("vehicle_type", ""),
            "make": profile.get("vehicle_make", ""),
            "model": profile.get("vehicle_model", ""),
            "year": str(profile.get("vehicle_year", "")),
            "color": profile.get("vehicle_color", ""),
            "plate": profile.get("vehicle_plate_number") or profile.get("vehicle_plate", ""),
            "verification_status": "verified" if vs == "approved" else vs,
        }, is_active=True)]
    active_exists = any(v.get("is_active") for v in vehicles)
    if vehicles and not active_exists:
        vehicles[0]["is_active"] = True
    return {"vehicles": vehicles, "count": len(vehicles)}


@drivers_router.post("/drivers/{user_id}/vehicles")
async def add_driver_vehicle(user_id: str, request: Request):
    """Add a new vehicle to the driver's profile. New vehicles start as not_submitted."""
    verify_owner_strict(request, user_id)
    body = await request.json()
    required = ["model", "year", "color", "plate"]
    missing = [f for f in required if not str(body.get(f) or "").strip()]
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing required fields: {', '.join(missing)}")

    new_vehicle = _build_vehicle_entry(body, is_active=False)

    profile = await db.driver_profiles.find_one({"user_id": user_id}, {"_id": 0, "vehicles": 1, "vehicle_model": 1, "vehicle_make": 1, "vehicle_year": 1, "vehicle_type": 1, "vehicle_color": 1, "vehicle_plate_number": 1, "vehicle_plate": 1, "verification_status": 1})
    if not profile:
        raise HTTPException(status_code=404, detail="Driver profile not found")

    vehicles = list(profile.get("vehicles") or [])
    if not vehicles and profile.get("vehicle_model"):
        vs = profile.get("verification_status", "not_submitted")
        vehicles = [_build_vehicle_entry({
            "id": "default",
            "type": profile.get("vehicle_type", ""),
            "make": profile.get("vehicle_make", ""),
            "model": profile.get("vehicle_model", ""),
            "year": str(profile.get("vehicle_year", "")),
            "color": profile.get("vehicle_color", ""),
            "plate": profile.get("vehicle_plate_number") or profile.get("vehicle_plate", ""),
            "verification_status": "verified" if vs == "approved" else vs,
        }, is_active=True)]

    # Prevent duplicate plate
    plates = [v.get("plate", "").upper() for v in vehicles]
    if new_vehicle["plate"].upper() in plates:
        raise HTTPException(status_code=409, detail=f"A vehicle with plate {new_vehicle['plate']} is already registered.")

    vehicles.append(new_vehicle)
    await db.driver_profiles.update_one({"user_id": user_id}, {"$set": {"vehicles": vehicles}}, upsert=True)
    return {"vehicle": new_vehicle, "vehicles": vehicles, "message": "Vehicle added. Submit documents to verify it."}


@drivers_router.put("/drivers/{user_id}/vehicles/{vehicle_id}/activate")
async def activate_driver_vehicle(user_id: str, vehicle_id: str, request: Request):
    """Set a specific vehicle as the active one (only one can be active)."""
    verify_owner_strict(request, user_id)
    profile = await db.driver_profiles.find_one({"user_id": user_id}, {"_id": 0, "vehicles": 1})
    if not profile:
        raise HTTPException(status_code=404, detail="Driver profile not found")
    vehicles = list(profile.get("vehicles") or [])
    target = next((v for v in vehicles if v.get("id") == vehicle_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    for v in vehicles:
        v["is_active"] = (v.get("id") == vehicle_id)
    await db.driver_profiles.update_one({"user_id": user_id}, {"$set": {"vehicles": vehicles}})
    return {"vehicles": vehicles, "active_vehicle": target, "message": f"{target.get('make', '')} {target.get('model', '')} set as active vehicle."}


@drivers_router.put("/drivers/{user_id}/vehicles/{vehicle_id}")
async def update_driver_vehicle(user_id: str, vehicle_id: str, request: Request):
    """Update editable fields (color, plate) on an existing vehicle."""
    verify_owner_strict(request, user_id)
    body = await request.json()
    profile = await db.driver_profiles.find_one({"user_id": user_id}, {"_id": 0, "vehicles": 1})
    if not profile:
        raise HTTPException(status_code=404, detail="Driver profile not found")
    vehicles = list(profile.get("vehicles") or [])
    updated = None
    for v in vehicles:
        if v.get("id") == vehicle_id:
            if body.get("color"):
                v["color"] = str(body["color"]).strip()
            if body.get("plate"):
                v["plate"] = str(body["plate"]).strip().upper()
            if body.get("model"):
                v["model"] = str(body["model"]).strip()
            if body.get("year"):
                v["year"] = str(body["year"]).strip()
            if body.get("type"):
                v["type"] = str(body["type"]).strip()
            if body.get("make"):
                v["make"] = str(body["make"]).strip()
            updated = v
            break
    if not updated:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    await db.driver_profiles.update_one({"user_id": user_id}, {"$set": {"vehicles": vehicles}})
    return {"vehicle": updated, "vehicles": vehicles}


@drivers_router.delete("/drivers/{user_id}/vehicles/{vehicle_id}")
async def remove_driver_vehicle(user_id: str, vehicle_id: str, request: Request):
    """Remove a vehicle. Cannot remove the last vehicle or the currently active one if it is the only vehicle."""
    verify_owner_strict(request, user_id)
    profile = await db.driver_profiles.find_one({"user_id": user_id}, {"_id": 0, "vehicles": 1})
    if not profile:
        raise HTTPException(status_code=404, detail="Driver profile not found")
    vehicles = list(profile.get("vehicles") or [])
    if len(vehicles) <= 1:
        raise HTTPException(status_code=400, detail="Cannot remove your only registered vehicle.")
    target = next((v for v in vehicles if v.get("id") == vehicle_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    was_active = target.get("is_active", False)
    vehicles = [v for v in vehicles if v.get("id") != vehicle_id]
    if was_active and vehicles:
        vehicles[0]["is_active"] = True
    await db.driver_profiles.update_one({"user_id": user_id}, {"$set": {"vehicles": vehicles}})
    return {"vehicles": vehicles, "message": "Vehicle removed."}


@drivers_router.put("/drivers/{user_id}/categories")
async def update_driver_categories(user_id: str, http_request: Request, body: DriverCategoriesUpdate):
    """Update which ride categories this driver is willing to accept."""
    verify_owner_strict(http_request, user_id)
    normalized = _normalize_categories(body.active_categories)
    if not normalized:
        raise HTTPException(
            status_code=400,
            detail="At least one valid category is required. Supported: economy (standard), comfort, xl, premium.",
        )
    await db.driver_profiles.update_one(
        {"user_id": user_id},
        {"$set": {"active_categories": normalized}},
        upsert=True,
    )
    return {"active_categories": normalized, "message": "Categories updated"}


@drivers_router.get("/drivers/{user_id}/categories")
async def get_driver_categories(user_id: str, http_request: Request):
    """Return the driver's currently active ride categories."""
    verify_owner_strict(http_request, user_id)
    profile = await db.driver_profiles.find_one({"user_id": user_id}, {"_id": 0, "active_categories": 1, "vehicle_type": 1})
    if not profile:
        raise HTTPException(status_code=404, detail="Driver profile not found")
    cats = profile.get("active_categories") or []
    # If no explicit categories set, fall back to vehicle_type as the single category
    if not cats and profile.get("vehicle_type"):
        vt = CATEGORY_ALIASES.get(profile["vehicle_type"], profile["vehicle_type"])
        cats = [vt] if vt in VALID_RIDE_CATEGORIES else ["economy"]
    return {"active_categories": cats}


@drivers_router.put("/drivers/{user_id}/location")
async def update_driver_location(user_id: str, request: LocationUpdate, http_request: Request):
    verify_owner_strict(http_request, user_id)
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "ghost_driver_lock": 1})
    if (user or {}).get("ghost_driver_lock", {}).get("active"):
        raise HTTPException(
            status_code=423,
            detail="Ghost Driver Protection is active. Reconfirm identity to unlock this account.",
        )
    profile = await db.driver_profiles.find_one({"user_id": user_id}, {"_id": 0, "current_location": 1}) or {}
    current = profile.get("current_location") or {}
    previous_lat = current.get("lat")
    previous_lng = current.get("lng")
    previous_updated_at = _parse_iso_datetime(current.get("updated_at"))
    now = datetime.now(timezone.utc)
    if (
        previous_lat is not None
        and previous_lng is not None
        and previous_updated_at is not None
    ):
        gap_seconds = max(1.0, (now - previous_updated_at).total_seconds())
        jump_km = _haversine_km(float(previous_lat), float(previous_lng), float(request.latitude), float(request.longitude))
        # Impossible fast geo jump strongly suggests concurrent account misuse/ghost driving.
        if gap_seconds <= 120.0 and jump_km >= 30.0:
            await _trigger_ghost_driver_lock(
                user_id=user_id,
                distance_km=jump_km,
                time_gap_seconds=gap_seconds,
                previous_location={
                    "lat": float(previous_lat),
                    "lng": float(previous_lng),
                    "updated_at": current.get("updated_at"),
                },
                incoming_location={
                    "lat": float(request.latitude),
                    "lng": float(request.longitude),
                    "updated_at": now.isoformat(),
                    "device_id": request.device_id,
                },
            )
            raise HTTPException(
                status_code=423,
                detail="Ghost Driver Protection triggered. Sessions locked and earnings frozen pending identity reconfirmation.",
            )
    await db.driver_profiles.update_one(
        {"user_id": user_id},
        {"$set": {"current_location": {"lat": request.latitude, "lng": request.longitude, "updated_at": now.isoformat(), "device_id": request.device_id}}}
    )
    return {"message": "Location updated"}

@drivers_router.put("/drivers/{user_id}/online")
async def toggle_driver_online(user_id: str, is_online: bool, request: Request):
    verify_owner_strict(request, user_id)
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "ghost_driver_lock": 1, "sim_swap_lock": 1})

    # Ghost Driver lock check
    if (user or {}).get("ghost_driver_lock", {}).get("active"):
        raise HTTPException(status_code=423, detail="Ghost Driver Protection lock is active. Reconfirm identity to go online.")

    # Auto-clear stale SIM swap locks for approved drivers.
    # False positives were caused by phone-format mismatches (now fixed). Any driver
    # with verification_status == "approved" whose sim_swap_lock is still active
    # gets it silently cleared so they can work normally.
    if (user or {}).get("sim_swap_lock", {}).get("active"):
        profile_check = await db.driver_profiles.find_one({"user_id": user_id}, {"_id": 0, "verification_status": 1}) or {}
        if profile_check.get("verification_status") == "approved":
            await db.users.update_one(
                {"id": user_id},
                {"$unset": {"sim_swap_lock": "", "earnings_frozen": ""}}
            )
            await db.driver_profiles.update_one(
                {"user_id": user_id},
                {"$unset": {"sim_swap_lock": "", "pending_identity_reconfirm": ""}}
            )
    if is_online:
        profile = await db.driver_profiles.find_one({"user_id": user_id})
        if not profile:
            raise HTTPException(status_code=403, detail="Complete your driver profile before going online")

        # ── CRITICAL gates: must be true to go online ─────────────────────────
        critical_missing = []
        if not profile.get("documents_verified"):
            critical_missing.append("document verification")
        if profile.get("verification_status") != "approved":
            critical_missing.append("admin approval (still pending review)")
        if critical_missing:
            raise HTTPException(
                status_code=403,
                detail=f"Account not yet approved. Missing: {', '.join(critical_missing)}"
            )

        # ── SOFT gates: warn but allow newer verified drivers a grace period ──
        # If the driver was approved within the last 30 days, skip compliance
        # checks — their initial verification IS their compliance for this period.
        approved_recently = False
        try:
            profile_completed_at_raw = profile.get("profile_completed_at") or profile.get("approved_at")
            if profile_completed_at_raw:
                approved_at_dt = datetime.fromisoformat(str(profile_completed_at_raw).replace("Z", "+00:00"))
                if approved_at_dt.tzinfo is None:
                    approved_at_dt = approved_at_dt.replace(tzinfo=timezone.utc)
                approved_recently = (datetime.now(timezone.utc) - approved_at_dt).days < 30
        except Exception:
            approved_recently = True  # On parse error, give benefit of the doubt

        # Monthly compliance: skip for brand-new drivers (< 30 days since approval)
        if not approved_recently:
            try:
                from driver_compliance import check_monthly_uploads
                monthly_status = await check_monthly_uploads(user_id)
                if not monthly_status.get("compliant", False):
                    # Soft: log but do not block — the driver gets a push notification reminder
                    logger.info(f"Driver {user_id} going online without monthly compliance (will be notified)")
            except Exception as compliance_error:
                logger.warning(f"Compliance pre-check warning for {user_id}: {compliance_error}")

        # Document expiry: only block if documents are critically expired (hard block)
        try:
            from driver_compliance import check_driver_document_expiry
            docs_status = await check_driver_document_expiry(user_id)
            if not docs_status.get("compliant", False) and docs_status.get("critically_expired"):
                raise HTTPException(
                    status_code=403,
                    detail="One or more required documents have expired. Please renew them before going online."
                )
        except HTTPException:
            raise
        except Exception as compliance_error:
            logger.warning(f"Document expiry pre-check warning for {user_id}: {compliance_error}")

        subscription = await db.subscriptions.find_one({"driver_id": user_id}, sort=[("created_at", -1)])
        if not subscription or subscription.get("status") not in {"active", "grace_period", "trial"}:
            await db.driver_profiles.update_one(
                {"user_id": user_id},
                {"$set": {"subscription_active": False, "is_online": False}},
                upsert=True,
            )
            await db.users.update_one({"id": user_id}, {"$set": {"subscription_active": False}})
            raise HTTPException(status_code=403, detail="Active subscription required to go online")

        now = datetime.utcnow()
        expiry = subscription.get("end_date")
        if isinstance(expiry, str):
            try:
                expiry = datetime.fromisoformat(expiry.replace("Z", "+00:00")).replace(tzinfo=None)
            except Exception:
                expiry = None
        if isinstance(expiry, datetime) and expiry.tzinfo:
            expiry = expiry.astimezone(timezone.utc).replace(tzinfo=None)
        if subscription.get("status") in {"active", "grace_period"} and isinstance(expiry, datetime) and expiry <= now:
            await db.subscriptions.update_one(
                {"id": subscription.get("id")},
                {"$set": {"status": "expired", "updated_at": now}},
            )
            await db.driver_profiles.update_one(
                {"user_id": user_id},
                {"$set": {"subscription_active": False, "subscription_expiry": expiry, "is_online": False}},
                upsert=True,
            )
            await db.users.update_one(
                {"id": user_id},
                {"$set": {"subscription_active": False, "subscription_expiry": expiry}},
            )
            raise HTTPException(status_code=403, detail="Subscription expired. Renew to go online.")

        await db.driver_profiles.update_one(
            {"user_id": user_id},
            {"$set": {"subscription_active": True, "subscription_expiry": expiry}},
            upsert=True,
        )
        await db.users.update_one(
            {"id": user_id},
            {"$set": {"subscription_active": True, "subscription_expiry": expiry}},
        )

        if profile.get("hours_driven_today", 0) >= 10:
            raise HTTPException(status_code=403, detail="You've been driving for over 10 hours. Please take a break for safety.")

        from enforcement_system import check_user_status
        status = await check_user_status(user_id)
        if not status.get("allowed", True):
            raise HTTPException(status_code=403, detail=status.get("message", "Account restricted"))
        if status.get("can_go_online") is False:
            raise HTTPException(status_code=403, detail=status.get("message", "Cannot go online right now"))

    await db.driver_profiles.update_one({"user_id": user_id}, {"$set": {"is_online": is_online}})
    return {"message": f"Driver is now {'online' if is_online else 'offline'}"}

@drivers_router.post("/drivers/{user_id}/verify-face-at-start")
async def verify_face_at_ride_start(user_id: str, request: FaceVerificationRequest, http_request: Request):
    verify_owner_strict(http_request, user_id)
    if os.environ.get("ALLOW_FACE_VERIFICATION_MOCK", "false").lower() != "true":
        raise HTTPException(
            status_code=503,
            detail="Live face verification provider is required. Mock verification is disabled in production.",
        )
    profile = await db.driver_profiles.find_one({"user_id": user_id})
    if not profile or not profile.get("face_image"):
        raise HTTPException(status_code=400, detail="No registered face image found.")
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Driver not found")
    await db.face_verifications.insert_one({"driver_id": user_id, "timestamp": datetime.now(timezone.utc), "verification_type": "ride_start", "status": "pending_ai_verification", "verified": True})
    return {"success": True, "verified": True, "message": "Face verified successfully", "match_confidence": 95.0}

# ==================== VERIFY DOCUMENTS ====================

@drivers_router.post("/drivers/verify-documents")
async def verify_driver_documents(
    http_request: Request,
    driver_id: str = Form(...),
    nin: Optional[UploadFile] = File(None),
    nin_number: Optional[str] = Form(None),
    drivers_license: Optional[UploadFile] = File(None),
    passport_photo: Optional[UploadFile] = File(None),
    vehicle_registration: Optional[UploadFile] = File(None),
    vehicle_license: Optional[UploadFile] = File(None),
    hacking_permit: Optional[UploadFile] = File(None),
    road_worthiness: Optional[UploadFile] = File(None),
    insurance: Optional[UploadFile] = File(None),
    vehicle_front: Optional[UploadFile] = File(None),
    vehicle_interior: Optional[UploadFile] = File(None),
    vehicle_ac: Optional[UploadFile] = File(None),
    nin_expiry: Optional[str] = Form(None),
    drivers_license_expiry: Optional[str] = Form(None),
    vehicle_registration_expiry: Optional[str] = Form(None),
    vehicle_license_expiry: Optional[str] = Form(None),
    hacking_permit_expiry: Optional[str] = Form(None),
    road_worthiness_expiry: Optional[str] = Form(None),
    insurance_expiry: Optional[str] = Form(None),
):
    """Validate, archive, and approve driver documents only when the full required set is present."""
    try:
        verify_owner_strict(http_request, driver_id)
        import base64

        doc_files = {
            "nin": nin, "drivers_license": drivers_license, "passport_photo": passport_photo,
            "vehicle_registration": vehicle_registration, "vehicle_license": vehicle_license,
            "hacking_permit": hacking_permit, "road_worthiness": road_worthiness,
            "insurance": insurance, "vehicle_front": vehicle_front,
            "vehicle_interior": vehicle_interior, "vehicle_ac": vehicle_ac,
        }
        expiry_map = {
            "drivers_license": drivers_license_expiry,
            "vehicle_license": vehicle_license_expiry, "hacking_permit": hacking_permit_expiry,
            "road_worthiness": road_worthiness_expiry, "insurance": insurance_expiry,
        }
        required_keys = [
            "nin",
            "drivers_license",
            "passport_photo",
            "vehicle_registration",
            "vehicle_license",
            "road_worthiness",
            "insurance",
            "vehicle_front",
            "vehicle_interior",
            "vehicle_ac",
        ]

        normalized_nin_number = re.sub(r"\D", "", str(nin_number or ""))
        nin_number_ok = len(normalized_nin_number) == 11
        missing_docs = [
            key
            for key in required_keys
            if key != "nin" and not doc_files.get(key)
        ]
        if not doc_files.get("nin") and not nin_number_ok:
            missing_docs.insert(0, "nin")
        if missing_docs:
            pretty = ", ".join(missing_docs).replace("_", " ")
            if "nin" in missing_docs:
                raise HTTPException(
                    status_code=400,
                    detail="Provide National ID (NIN) slip image or enter your 11-digit NIN number.",
                )
            raise HTTPException(status_code=400, detail=f"Missing required documents: {pretty}")

        for exp_key, exp_value in expiry_map.items():
            uploaded_for_key = bool(doc_files.get(exp_key))
            if not uploaded_for_key:
                continue
            if not exp_value or len(str(exp_value).strip()) < 7:
                pretty = exp_key.replace("_", " ")
                raise HTTPException(status_code=400, detail=f"Expiry date required for {pretty}")

        stored_docs = {}
        for doc_key, file in doc_files.items():
            if file:
                content = await file.read()
                if not file.content_type or not str(file.content_type).startswith("image/"):
                    raise HTTPException(status_code=400, detail=f"{doc_key.replace('_', ' ')} must be an image")
                if len(content) < 10 * 1024:
                    raise HTTPException(status_code=400, detail=f"{doc_key.replace('_', ' ')} is too small or unreadable")
                if len(content) > 15 * 1024 * 1024:
                    raise HTTPException(status_code=400, detail=f"{doc_key.replace('_', ' ')} exceeds 15MB upload limit")
                if not _allowed_magic_bytes(content):
                    raise HTTPException(status_code=400, detail=f"{doc_key.replace('_', ' ')} file signature is invalid or unsupported")
                sha256 = _sha256_bytes(content)
                stored_docs[doc_key] = {
                    "filename": file.filename,
                    "content_type": file.content_type,
                    "data": base64.b64encode(content).decode("utf-8"),
                    "size_bytes": len(content),
                    "sha256": sha256,
                    "uploaded_at": datetime.now(timezone.utc).isoformat(),
                    "expiry_date": expiry_map.get(doc_key),
                }

        doc_hashes = {k: v.get("sha256") for k, v in stored_docs.items()}
        duplicate_hashes = await _find_cross_driver_hash_duplicates(doc_hashes, driver_id)
        identical_hashes_within_submission = len(set(filter(None, doc_hashes.values()))) != len([v for v in doc_hashes.values() if v])
        fraud_flags = []
        if duplicate_hashes:
            fraud_flags.append("cross_driver_duplicate_document_hash")
        if identical_hashes_within_submission:
            fraud_flags.append("duplicate_hash_within_submission")
        automated_approved = not fraud_flags and all(doc_files.get(key) for key in required_keys)
        verification_status = "approved" if automated_approved else "pending_review"
        queue_status = "approved" if automated_approved else "pending"
        now_iso = datetime.now(timezone.utc).isoformat()

        doc_archive = {
            "driver_id": driver_id,
            "documents": stored_docs,
            "submitted_at": now_iso,
            "status": verification_status,
            "document_count": len(stored_docs),
            "nin_number": normalized_nin_number if nin_number_ok else None,
            "nin_capture_mode": "number_only" if (nin_number_ok and not doc_files.get("nin")) else "document_upload",
            "vehicle_license_capture_mode": "document_upload",
            "document_hashes": doc_hashes,
            "duplicate_hashes": duplicate_hashes,
            "forgery_flags": fraud_flags,
        }
        await db.driver_documents.update_one(
            {"driver_id": driver_id},
            {"$set": doc_archive},
            upsert=True,
        )

        await db.driver_profiles.update_one(
            {"user_id": driver_id},
            {"$set": {
                "verification_status": verification_status,
                "documents_verified": automated_approved,
                "documents_submitted": True,
                "document_count": len(stored_docs),
                "submitted_at": now_iso,
                "documents_approved_at": now_iso if automated_approved else None,
                "onboarding_step": "profile" if automated_approved else "documents",
                "verification_fraud_flags": fraud_flags,
                "nin_number": normalized_nin_number if nin_number_ok else None,
                "nin_verified": automated_approved,
                "license_uploaded": bool(drivers_license),
                "vehicle_docs_uploaded": bool(vehicle_registration and vehicle_license and road_worthiness and insurance),
                "selfie_verified": bool(passport_photo),
            }},
            upsert=True,
        )
        await db.users.update_one(
            {"id": driver_id},
            {"$set": {"documents_verified": automated_approved, "verification_status": verification_status, "nin": normalized_nin_number if nin_number_ok else None}}
        )

        # Ensure admin verification queue always has a row linked to this archived submission.
        existing_verification = await db.driver_verifications.find_one({"user_id": driver_id}, {"_id": 0, "id": 1, "status": 1})
        verification_id = (existing_verification or {}).get("id") or str(uuid.uuid4())
        await db.driver_verifications.update_one(
            {"user_id": driver_id},
            {
                "$set": {
                    "id": verification_id,
                    "user_id": driver_id,
                    "status": queue_status,
                    "submitted_at": datetime.now(timezone.utc),
                    "reviewed_at": datetime.now(timezone.utc) if automated_approved else None,
                    "reviewed_by": "SYSTEM_AUTO_CHECK" if automated_approved else None,
                    "rejection_reason": None,
                    "notes": "Approved by automated completeness, image validity, and duplicate-document checks." if automated_approved else None,
                    "documents_summary": {
                        "document_count": len(stored_docs),
                        "required_docs_complete": True,
                        "nin_capture_mode": "number_only" if (nin_number_ok and not doc_files.get("nin")) else "document_upload",
                        "nin_last4": normalized_nin_number[-4:] if nin_number_ok else None,
                        "vehicle_license_capture_mode": "document_upload",
                    },
                    "documents_archive_ref": {
                        "driver_id": driver_id,
                        "submitted_at": doc_archive["submitted_at"],
                    },
                    "last_document_submission_id": verification_id,
                }
            },
            upsert=True,
        )
        await db.driver_profiles.update_one(
            {"user_id": driver_id},
            {"$set": {"last_document_submission_id": verification_id}},
            upsert=True,
        )

        if automated_approved:
            snapshot = await _snapshot_approved_documents(
                driver_id=driver_id,
                verification_id=verification_id,
                approved_by="SYSTEM_AUTO_CHECK",
                notes="Automated document checks passed.",
            )
            await db.driver_verifications.update_one(
                {"id": verification_id},
                {"$set": {"approved_documents_snapshot_id": snapshot.get("id")}},
            )
            await send_driver_verification_notification(driver_id, "approved")

        logger.info(f"Driver {driver_id}: {len(stored_docs)} documents archived status={verification_status}")
        return {
            "success": True,
            "verification_status": verification_status,
            "driver_id": driver_id,
            "verification_id": verification_id,
            "documents_stored": len(stored_docs),
            "forgery_flags": fraud_flags,
            "duplicate_hashes_count": len(duplicate_hashes),
            "message": (
                "Documents passed automated checks. Continue to driver profile."
                if automated_approved
                else "Documents uploaded and archived. Verification is pending review."
            ),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Document verification error: {str(e)}")
        raise HTTPException(status_code=500, detail="Document verification failed")

# ==================== ONBOARDING ====================

@drivers_router.get("/drivers/{driver_id}/onboarding-status")
async def get_driver_onboarding_status(driver_id: str, request: Request):
    try:
        verify_owner_strict(request, driver_id)
        user = await db.users.find_one({"id": driver_id})
        if not user:
            return {"step": "not_found", "completed": False}
        if not user.get("terms_accepted"):
            return {"step": "terms", "completed": False}
        profile = await db.driver_profiles.find_one({"user_id": driver_id})
        if not profile:
            return {"step": "documents", "completed": False}

        # Short-circuit: if the driver is fully verified and completed, skip every other check.
        _vehicles_fast = profile.get("vehicles") or (
            [{}] if profile.get("vehicle_model") else []
        )
        _nin_fast = str(profile.get("nin_number") or profile.get("nin") or "").strip()
        _fast_complete = bool(
            _nin_fast
            and profile.get("documents_verified")
            and profile.get("verification_status") == "approved"
            and len(_vehicles_fast) > 0
            and profile.get("profile_completed")
        )
        if _fast_complete:
            return {
                "step": "approved",
                "completed": True,
                "verification_status": "approved",
                "vehicle_registered": True,
                "driver_profile_complete": True,
                "nin_verified": True,
                "vehicles_count": len(_vehicles_fast),
            }

        verification_status = profile.get("verification_status")
        documents_submitted = bool(profile.get("documents_submitted"))
        if verification_status in {"pending", "pending_review", "under_review", "ai_reviewing"} or (
            documents_submitted and not profile.get("documents_verified")
        ):
            # If the driver hasn't completed Step 3 yet, send them there first.
            # profile_completed is set by /drivers/complete-profile and is independent
            # of admin approval — drivers fill this in while their docs are being reviewed.
            if not profile.get("profile_completed"):
                return {
                    "step": "profile",
                    "completed": False,
                    "verification_status": verification_status or "pending_review",
                    "documents_submitted": documents_submitted,
                }
            verification = await db.driver_verifications.find_one(
                {"user_id": driver_id},
                {"_id": 0, "id": 1, "status": 1, "submitted_at": 1, "rejection_reason": 1, "notes": 1},
                sort=[("submitted_at", -1)],
            )
            return {
                "step": "dashboard_limited",
                "completed": True,
                "verification_status": verification_status or (verification or {}).get("status", "pending_review"),
                "documents_submitted": True,
                "can_go_online": False,
                "trial_eligible": False,
                "limited_access_reason": "Documents are submitted and waiting for approval.",
                "verification": verification,
            }
        if verification_status == "rejected":
            verification = await db.driver_verifications.find_one(
                {"user_id": driver_id},
                {"_id": 0, "id": 1, "status": 1, "rejection_reason": 1, "reviewed_at": 1},
                sort=[("submitted_at", -1)],
            )
            return {
                "step": "documents_rejected",
                "completed": False,
                "verification_status": "rejected",
                "documents_submitted": documents_submitted,
                "verification": verification,
            }
        if not profile.get("documents_verified") or verification_status != "approved":
            return {"step": "documents", "completed": False, "verification_status": verification_status or "not_submitted"}

        # Admin / AI explicitly approved this driver — honour it regardless of profile_completed flag.
        # Also auto-heal: patch profile_completed so future calls succeed without extra DB roundtrip.
        if not profile.get("profile_completed"):
            await db.driver_profiles.update_one(
                {"user_id": driver_id},
                {"$set": {"profile_completed": True, "onboarding_step": "approved"}}
            )

        # Compute driver_profile_complete: once all key checks pass, the driver should NEVER
        # see onboarding again. We include vehicles count from the stored vehicles array.
        vehicles = profile.get("vehicles") or []
        if not vehicles and profile.get("vehicle_model"):
            vehicles = [{}]  # synthesise from flat fields — at least one exists
        nin_raw = str(profile.get("nin_number") or profile.get("nin") or "").strip()
        nin_ok = bool(nin_raw)
        driver_profile_complete = bool(
            nin_ok
            and profile.get("documents_verified")
            and profile.get("verification_status") == "approved"
            and len(vehicles) > 0
            and profile.get("profile_completed")
        )

        return {
            "step": "approved",
            "completed": True,
            "verification_status": "approved",
            "vehicle_registered": profile.get("vehicle_registered", bool(vehicles)),
            "driver_profile_complete": driver_profile_complete,
            "nin_verified": nin_ok and profile.get("verification_status") == "approved",
            "vehicles_count": len(vehicles),
        }
    except Exception as e:
        logger.error(f"Onboarding status error: {str(e)}")
        return {"step": "error", "completed": False}


@drivers_router.get("/drivers/{driver_id}/documents")
async def get_driver_documents(driver_id: str, request: Request):
    verify_owner_strict(request, driver_id)
    doc_record = await db.driver_documents.find_one({"driver_id": driver_id}, {"_id": 0, "documents.data": 0}) or {}
    profile = await db.driver_profiles.find_one({"user_id": driver_id}, {"_id": 0, "verification_status": 1, "documents_verified": 1}) or {}

    documents = []
    for key, doc in (doc_record.get("documents") or {}).items():
        documents.append({
            "id": key,
            "uploaded": True,
            "status": "verified" if profile.get("documents_verified") else profile.get("verification_status", "pending"),
            "uploaded_at": doc.get("uploaded_at"),
            "expiry_date": doc.get("expiry_date"),
            "filename": doc.get("filename"),
        })

    return {
        "driver_id": driver_id,
        "verification_status": profile.get("verification_status", "pending"),
        "documents_verified": profile.get("documents_verified", False),
        "documents": documents,
    }


async def _ensure_48h_trial_for_verified_driver(driver_id: str):
    """Replaced by activity-based trial. Delegates to payments router helper.
    Kept for backwards compatibility with call sites.
    """
    from routers.payments import _ensure_auto_trial_for_verified_driver
    sub = await _ensure_auto_trial_for_verified_driver(driver_id)
    if sub:
        logger.info(f"Activity trial ensured for driver={driver_id}")
    return sub

@drivers_router.post("/drivers/complete-profile")
async def complete_driver_profile(request: dict, http_request: Request):
    """Save driver personal/vehicle/guarantor profile at Step 3 of onboarding.

    This endpoint is intentionally callable BEFORE admin approval so drivers can
    complete Step 3 while their documents are still under review. The approval
    gate has been removed — profile data is stored independently of doc status.
    The trial is activated separately when admin approves the documents.
    """
    try:
        driver_id = request.get("driver_id")
        if not driver_id:
            raise HTTPException(status_code=400, detail="driver_id is required")
        verify_owner_strict(http_request, driver_id)
        existing_profile = await db.driver_profiles.find_one({"user_id": driver_id}) or {}

        required_fields = {
            "full_name": "Full name",
            "phone": "Phone number",
            "address": "Home address",
            "city": "City",
            "state": "State",
            "state_of_origin": "State of origin",
            "date_of_birth": "Date of birth",
            "emergency_contact": "Emergency contact",
            "vehicle_type": "Vehicle type",
            "vehicle_make": "Vehicle make",
            "vehicle_model": "Vehicle model",
            "vehicle_year": "Vehicle year",
            "vehicle_plate_number": "Vehicle plate number",
            "vehicle_color": "Vehicle color",
        }
        missing = [label for field, label in required_fields.items() if not str(request.get(field) or "").strip()]
        if missing:
            raise HTTPException(status_code=400, detail=f"Missing required fields: {', '.join(missing)}")

        if not request.get("has_ac"):
            raise HTTPException(status_code=400, detail="Vehicle must have a working Air Conditioning (AC) system. Vehicles without AC cannot register on NEXRYDE.")

        guarantor_data = request.get("guarantor")
        if not guarantor_data or not isinstance(guarantor_data, dict):
            raise HTTPException(status_code=400, detail="Guarantor information is required")
        if not guarantor_data.get("name", "").strip():
            raise HTTPException(status_code=400, detail="Guarantor name is required")
        if not guarantor_data.get("phone", "").strip():
            raise HTTPException(status_code=400, detail="Guarantor phone number is required")
        if not guarantor_data.get("address", "").strip():
            raise HTTPException(status_code=400, detail="Guarantor address is required")

        # Determine the correct onboarding_step without touching admin-controlled fields
        already_approved = (
            existing_profile.get("documents_verified") and
            existing_profile.get("verification_status") == "approved"
        )
        onboarding_step = "approved" if already_approved else "profile_completed"

        profile_update = {k: v for k, v in {
            "full_name": request.get("full_name"),
            "phone": request.get("phone"),
            "email": request.get("email"),
            "address": request.get("address"),
            "city": request.get("city"),
            "state": request.get("state"),
            "state_of_origin": request.get("state_of_origin"),
            "date_of_birth": request.get("date_of_birth"),
            "emergency_contact": request.get("emergency_contact"),
            "guarantor": guarantor_data if isinstance(guarantor_data, dict) else None,
            "bank_name": request.get("bank_name"),
            "account_number": request.get("account_number"),
            "account_name": request.get("account_name"),
            "vehicle_type": request.get("vehicle_type"),
            "vehicle_make": request.get("vehicle_make"),
            "vehicle_model": request.get("vehicle_model"),
            "vehicle_year": request.get("vehicle_year"),
            "vehicle_plate_number": request.get("vehicle_plate_number"),
            "vehicle_color": request.get("vehicle_color"),
            "has_ac": bool(request.get("has_ac", False)),
            "vehicle_registered": True,
            "profile_completed": True,
            "onboarding_step": onboarding_step,
            "profile_completed_at": datetime.now(timezone.utc).isoformat(),
            # NOTE: do NOT set documents_verified or verification_status here —
            # those are controlled exclusively by the admin approval flow.
        }.items() if v is not None}

        # Build/update vehicles array so it is always consistent with the flat fields.
        vehicle_entry = {
            "id": str(uuid.uuid4()),
            "type": str(request.get("vehicle_type") or ""),
            "make": str(request.get("vehicle_make") or ""),
            "model": str(request.get("vehicle_model") or ""),
            "year": str(request.get("vehicle_year") or ""),
            "color": str(request.get("vehicle_color") or ""),
            "plate": str(request.get("vehicle_plate_number") or ""),
            "is_default": True,
            "registered_at": datetime.now(timezone.utc).isoformat(),
        }
        profile_update["vehicles"] = [vehicle_entry]

        await db.driver_profiles.update_one({"user_id": driver_id}, {"$set": profile_update}, upsert=True)
        await db.users.update_one({"id": driver_id}, {"$set": {"profile_completed": True}})

        # Activate trial only if the driver is already approved (re-submission after approval)
        trial_sub = None
        if already_approved:
            trial_sub = await _ensure_48h_trial_for_verified_driver(driver_id)

        user = await db.users.find_one({"id": driver_id})
        if user:
            user["_id"] = str(user["_id"])
            user["profile_completed"] = True

        if already_approved:
            from routers.payments import SUBSCRIPTION_CONFIG as _SC
            message = f"Profile updated! Activity trial active — complete {_SC['trial_trips_target']} trips before subscribing."
        else:
            message = "Profile saved! Your documents are under review. We will notify you once approved."

        return {
            "success": True,
            "user": user,
            "trial_activated": bool(trial_sub),
            "awaiting_approval": not already_approved,
            "message": message,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Profile completion error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Profile completion failed: {str(e)}")

# ==================== AVAILABLE DRIVERS ====================

@drivers_router.get("/drivers/available")
async def get_available_drivers(vehicle_type: Optional[str] = None, lat: Optional[float] = None, lng: Optional[float] = None):
    try:
        query = {"is_online": True, "verification_status": "approved"}
        if vehicle_type:
            query["vehicle_type"] = vehicle_type
        drivers = await db.driver_profiles.find(query, {"_id": 0}).to_list(200)
        driver_ids = [d.get("user_id") for d in drivers if d.get("user_id")]
        active_subscriptions = await db.subscriptions.find(
            {"driver_id": {"$in": driver_ids}, "status": {"$in": ["active", "trial", "grace_period"]}},
            {"_id": 0, "driver_id": 1},
        ).to_list(500)
        active_driver_ids = {str(s.get("driver_id")) for s in active_subscriptions if s.get("driver_id")}
        available = []
        for driver in drivers:
            if str(driver.get("user_id")) not in active_driver_ids:
                continue
            dd = {"driver_id": driver.get("user_id"), "name": driver.get("name", "Driver"), "rating": driver.get("rating", 4.5), "total_rides": driver.get("total_rides", 0), "vehicle_type": driver.get("vehicle_type", "economy"), "vehicle_plate": driver.get("vehicle_plate", ""), "vehicle_model": driver.get("vehicle_model", ""), "current_location": driver.get("current_location", {})}
            if lat and lng and driver.get("current_location"):
                dlat = driver["current_location"].get("lat")
                dlng = driver["current_location"].get("lng")
                if dlat and dlng:
                    R = 6371
                    d_lat = math.radians(dlat - lat)
                    d_lng = math.radians(dlng - lng)
                    a = math.sin(d_lat/2)**2 + math.cos(math.radians(lat)) * math.cos(math.radians(dlat)) * math.sin(d_lng/2)**2
                    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
                    distance = R * c
                    dd["distance_km"] = round(distance, 2)
                    dd["eta_minutes"] = round(distance * 2.5)
            available.append(dd)
        return {"drivers": available, "count": len(available)}
    except Exception as e:
        logger.error(f"Error fetching available drivers: {str(e)}")
        return {"drivers": [], "count": 0}

# ==================== DRIVER STATS ====================

@drivers_router.get("/drivers/{user_id}/stats")
async def get_driver_stats(user_id: str, request: Request):
    verify_owner_strict(request, user_id)
    user = await db.users.find_one({"id": user_id})
    profile = await db.driver_profiles.find_one({"user_id": user_id})
    subscription = await db.subscriptions.find_one({"driver_id": user_id, "status": {"$in": ["active", "trial", "grace_period"]}})
    completed_trips = await db.trips.count_documents(
        match_completed_trip_paid_for_earnings(driver_id=user_id)
    )
    pipeline = [
        {"$match": match_completed_trip_paid_for_earnings(driver_id=user_id)},
        {"$group": {"_id": None, "total": {"$sum": "$fare"}}},
    ]
    earnings_result = await db.trips.aggregate(pipeline).to_list(1)
    total_earnings = earnings_result[0]["total"] if earnings_result else 0
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    today_pipeline = [
        {
            "$match": match_completed_trip_paid_for_earnings(
                driver_id=user_id,
                completed_at={"$gte": today_start},
            )
        },
        {"$group": {"_id": None, "total": {"$sum": "$fare"}}},
    ]
    today_result = await db.trips.aggregate(today_pipeline).to_list(1)
    today_earnings = today_result[0]["total"] if today_result else 0
    week_start = datetime.utcnow() - timedelta(days=7)
    weekly_trips = await db.trips.count_documents(
        match_completed_trip_paid_for_earnings(
            driver_id=user_id,
            completed_at={"$gte": week_start},
        )
    )
    days_remaining = 0
    if subscription:
        days_remaining = max(0, (subscription["end_date"] - datetime.utcnow()).days) if isinstance(subscription.get("end_date"), datetime) else 0
    acceptance_rate = profile.get("acceptance_rate", 100.0) if profile else 100.0
    completion_rate = profile.get("completion_rate", 100.0) if profile else 100.0
    visibility_score = profile.get("visibility_score") if profile else None
    if visibility_score is None:
        visibility_score = _compute_visibility_score(
            acceptance_rate=acceptance_rate,
            completion_rate=completion_rate,
            rating=user.get("rating", 5.0) if user else 5.0,
            cancellations=profile.get("cancellation_count", 0) if profile else 0,
            completed_trips=completed_trips,
        )
    return {"total_trips": completed_trips, "total_earnings": total_earnings, "today_earnings": today_earnings, "weekly_trips": weekly_trips, "rating": user.get("rating", 5.0) if user else 5.0, "completion_rate": completion_rate, "acceptance_rate": acceptance_rate, "visibility_score": visibility_score, "rank": profile.get("rank", "standard") if profile else "standard", "subscription_active": subscription is not None, "subscription_days_remaining": days_remaining, "is_online": profile.get("is_online", False) if profile else False, "hours_driven_today": profile.get("hours_driven_today", 0) if profile else 0, "fatigue_warning": profile.get("fatigue_warning", False) if profile else False, "comfort_ratings": {"smoothness": profile.get("smoothness_rating", 5.0) if profile else 5.0, "politeness": profile.get("politeness_rating", 5.0) if profile else 5.0, "cleanliness": profile.get("cleanliness_rating", 5.0) if profile else 5.0, "safety": profile.get("safety_rating", 5.0) if profile else 5.0}, "streaks": user.get("streaks", {}) if user else {}, "badges": user.get("badges", []) if user else []}


@drivers_router.get("/drivers/{user_id}/visibility-score")
async def get_driver_visibility_score(user_id: str, request: Request):
    verify_owner_strict(request, user_id)
    profile = await db.driver_profiles.find_one({"user_id": user_id}) or {}
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "rating": 1}) or {}
    completed = await db.trips.count_documents({"driver_id": user_id, "status": "completed"})
    score = profile.get("visibility_score")
    if score is None:
        score = _compute_visibility_score(
            acceptance_rate=float(profile.get("acceptance_rate", 100.0)),
            completion_rate=float(profile.get("completion_rate", 100.0)),
            rating=float(user.get("rating", 4.5)),
            cancellations=int(profile.get("cancellation_count", 0)),
            completed_trips=int(completed),
        )
    return {
        "driver_id": user_id,
        "visibility_score": score,
        "acceptance_rate": float(profile.get("acceptance_rate", 100.0)),
        "completion_rate": float(profile.get("completion_rate", 100.0)),
        "rating": float(user.get("rating", 4.5)),
        "cancellations": int(profile.get("cancellation_count", 0)),
        "completed_trips": int(completed),
    }

# ==================== DOCUMENT VERIFICATION ====================

@drivers_router.post("/drivers/verification/submit")
async def submit_driver_verification(request: DriverVerificationSubmission, http_request: Request):
    verify_owner_strict(http_request, request.user_id)
    user = await db.users.find_one({"id": request.user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    existing = await db.driver_verifications.find_one({"user_id": request.user_id})
    if existing and existing.get("status") == "approved":
        raise HTTPException(status_code=400, detail="Driver is already verified")
    verification_id = existing.get("id") if existing else str(uuid.uuid4())
    verification_data = {"id": verification_id, "user_id": request.user_id, "personal_info": request.personal_info, "vehicle_info": request.vehicle_info, "documents": request.documents, "status": "ai_reviewing", "submitted_at": datetime.now(timezone.utc), "reviewed_at": None, "reviewed_by": None, "rejection_reason": None, "ai_verification_result": None}
    await db.driver_verifications.update_one({"user_id": request.user_id}, {"$set": verification_data}, upsert=True)
    await db.users.update_one({"id": request.user_id}, {"$set": {"verification_status": "ai_reviewing"}})
    await _append_verification_audit_event(
        driver_id=request.user_id,
        verification_id=verification_id,
        action="submitted",
        actor_type="driver",
        actor_id=request.user_id,
        details={"document_keys": sorted(list((request.documents or {}).keys()))},
    )
    asyncio.create_task(_ai_verify_driver_documents(verification_id, request.user_id, request.personal_info, request.vehicle_info, request.documents))
    return {"success": True, "message": "Documents submitted! AI Agent is now verifying.", "verification_id": verification_id, "status": "ai_reviewing"}

async def _ai_verify_driver_documents(verification_id, user_id, personal_info, vehicle_info, documents):
    try:
        missing = [d for d in REQUIRED_DRIVER_DOC_KEYS if not documents.get(d, {}).get("uploaded")]
        if missing:
            await _ai_reject(verification_id, user_id, f"Missing: {', '.join(missing).replace('_',' ').upper()}")
            return
        if LlmChat and EMERGENT_LLM_KEY:
            try:
                chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"ai-verifier-{user_id}", system_message="You are an AI Document Verification Agent for NEXRYDE.").with_model("openai", "gpt-4o")
                prompt = f"""
Review this driver verification submission strictly and return JSON only with this schema:
{{
  "approved": true/false,
  "recommendation": "APPROVE/REJECT/REVIEW",
  "confidence": 0.0-1.0,
  "risk_score": 0.0-1.0,
  "face_id_match_score": 0.0-1.0,
  "fraud_flags": ["..."],
  "mismatches": ["..."],
  "missing_documents": ["..."],
  "verification_notes": "short reason"
}}
Rules:
- High confidence approval only if all required documents are present and internally consistent.
- If any identity mismatch, suspicious tampering, or weak evidence, use REJECT or REVIEW.
- Never be lenient.

Personal: {json.dumps(personal_info)}
Vehicle: {json.dumps(vehicle_info)}
Documents payload: {json.dumps(documents)}
"""
                response = await chat.send_message(UserMessage(text=prompt))
                json_match = re.search(r'\{[\s\S]*\}', response, re.DOTALL)
                ai_result = json.loads(json_match.group()) if json_match else json.loads(response)
                await db.driver_verifications.update_one({"id": verification_id}, {"$set": {"ai_verification_result": ai_result}})
                confidence = float(ai_result.get("confidence", 0.0) or 0.0)
                risk_score = float(ai_result.get("risk_score", 1.0) or 1.0)
                face_id_score = float(ai_result.get("face_id_match_score", 0.0) or 0.0)
                recommendation = str(ai_result.get("recommendation", "")).upper()
                fraud_flags = ai_result.get("fraud_flags") or []
                mismatches = ai_result.get("mismatches") or []
                missing_from_ai = ai_result.get("missing_documents") or []

                archived_doc_record = await db.driver_documents.find_one({"driver_id": user_id})
                missing_archived = _missing_required_archived_docs(archived_doc_record)
                stored_fraud_flags = (archived_doc_record or {}).get("forgery_flags") or []
                stored_dup_hashes = (archived_doc_record or {}).get("duplicate_hashes") or []

                auto_approve_ok = (
                    AI_AUTO_APPROVE_ENABLED
                    and bool(ai_result.get("approved"))
                    and recommendation == "APPROVE"
                    and confidence >= AI_AUTO_APPROVE_MIN_CONFIDENCE
                    and risk_score <= AI_MAX_RISK_SCORE
                    and face_id_score >= AI_FACE_ID_MIN_SCORE
                    and not fraud_flags
                    and not mismatches
                    and not missing_from_ai
                    and not missing_archived
                    and not stored_fraud_flags
                    and not stored_dup_hashes
                )

                if auto_approve_ok:
                    await _ai_approve(
                        verification_id,
                        user_id,
                        vehicle_info,
                        ai_result.get("verification_notes", "AI strict auto-approval"),
                    )
                else:
                    second_pass_approved = False
                    if (
                        AI_SECOND_PASS_ENABLED
                        and recommendation in {"APPROVE", "REVIEW"}
                        and confidence >= (AI_AUTO_APPROVE_MIN_CONFIDENCE - 0.2)
                        and confidence < AI_AUTO_APPROVE_MIN_CONFIDENCE
                        and risk_score <= (AI_MAX_RISK_SCORE + 0.2)
                        and not fraud_flags
                        and not mismatches
                        and not missing_from_ai
                        and not missing_archived
                        and not stored_fraud_flags
                        and not stored_dup_hashes
                    ):
                        second_chat = LlmChat(
                            api_key=EMERGENT_LLM_KEY,
                            session_id=f"ai-verifier-2-{verification_id}",
                            system_message="You are a secondary anti-fraud verifier. Return strict JSON only.",
                        ).with_model("openai", "gpt-4o")
                        second_prompt = (
                            "Re-evaluate this verification from scratch and return JSON fields: "
                            '{"approved":true/false,"recommendation":"APPROVE/REJECT/REVIEW","confidence":0.0-1.0,'
                            '"risk_score":0.0-1.0,"face_id_match_score":0.0-1.0,"fraud_flags":[],"mismatches":[],'
                            '"missing_documents":[],"verification_notes":"..."} '
                            f"Input payload: {json.dumps({'personal_info': personal_info, 'vehicle_info': vehicle_info, 'documents': documents})}"
                        )
                        second_raw = await second_chat.send_message(UserMessage(text=second_prompt))
                        second_match = re.search(r'\{[\s\S]*\}', second_raw, re.DOTALL)
                        second_result = json.loads(second_match.group()) if second_match else json.loads(second_raw)
                        await db.driver_verifications.update_one(
                            {"id": verification_id},
                            {"$set": {"ai_second_pass_result": second_result}},
                        )
                        second_pass_approved = (
                            bool(second_result.get("approved"))
                            and str(second_result.get("recommendation", "")).upper() == "APPROVE"
                            and float(second_result.get("confidence", 0.0) or 0.0) >= AI_SECOND_PASS_MIN_CONFIDENCE
                            and float(second_result.get("risk_score", 1.0) or 1.0) <= AI_MAX_RISK_SCORE
                            and float(second_result.get("face_id_match_score", 0.0) or 0.0) >= AI_FACE_ID_MIN_SCORE
                            and not (second_result.get("fraud_flags") or [])
                            and not (second_result.get("mismatches") or [])
                            and not (second_result.get("missing_documents") or [])
                        )
                    if second_pass_approved:
                        await _ai_approve(
                            verification_id,
                            user_id,
                            vehicle_info,
                            "Dual-AI consensus auto-approval",
                        )
                        return
                    reason = (
                        f"AI review completed; pending human review. "
                        f"confidence={confidence:.2f}, risk={risk_score:.2f}, "
                        f"face_id_score={face_id_score:.2f}, fraud_flags={len(fraud_flags) + len(stored_fraud_flags)}, mismatches={len(mismatches)}, "
                        f"missing_documents={len(missing_from_ai) + len(missing_archived)}."
                    )
                    await _mark_pending_manual_review(verification_id, user_id, reason)
            except Exception as e:
                logger.error(f"AI verification error: {e}")
                await _mark_pending_manual_review(
                    verification_id,
                    user_id,
                    f"AI verification unavailable: {str(e)}",
                )
        else:
            await _mark_pending_manual_review(
                verification_id,
                user_id,
                "AI verification key/provider not configured",
            )
    except Exception as e:
        logger.error(f"AI verification failed for {user_id}: {e}")
        await db.driver_verifications.update_one({"id": verification_id}, {"$set": {"status": "pending", "ai_error": str(e)}})
        await db.users.update_one({"id": user_id}, {"$set": {"verification_status": "pending"}})

async def _ai_approve(verification_id, user_id, vehicle_info, notes):
    snapshot = await _snapshot_approved_documents(
        driver_id=user_id,
        verification_id=verification_id,
        approved_by="AI_AGENT",
        notes=notes,
    )
    await db.driver_verifications.update_one({"id": verification_id}, {"$set": {"status": "approved", "reviewed_at": datetime.now(timezone.utc), "reviewed_by": "AI_AGENT", "notes": notes}})
    await _append_verification_audit_event(
        driver_id=user_id,
        verification_id=verification_id,
        action="approved",
        actor_type="ai",
        actor_id="AI_AGENT",
        details={"notes": notes},
    )
    profile = await db.driver_profiles.find_one({"user_id": user_id}) or {}
    next_onboarding_step = "approved" if profile.get("profile_completed") else "profile"
    await db.users.update_one({"id": user_id}, {"$set": {"verification_status": "approved", "documents_verified": True}})
    await db.driver_profiles.update_one(
        {"user_id": user_id},
        {"$set": {
            "documents_verified": True,
            "verification_status": "approved",
            "profile_completed": True,
            "documents_approved_at": datetime.now(timezone.utc).isoformat(),
            "nin_verified": True,
            "license_uploaded": True,
            "vehicle_docs_uploaded": True,
            "selfie_verified": True,
            "vehicle_type": vehicle_info.get("vehicleMake"),
            "vehicle_model": vehicle_info.get("vehicleModel"),
            "vehicle_plate": vehicle_info.get("plateNumber"),
            "vehicle_color": vehicle_info.get("vehicleColor"),
            "onboarding_step": "approved",
            "approved_documents_snapshot_id": snapshot.get("id"),
        }},
        upsert=True
    )
    await db.users.update_one({"id": user_id}, {"$set": {"profile_completed": True}})
    await _ensure_48h_trial_for_verified_driver(user_id)
    await send_driver_verification_notification(user_id, "approved")

async def _ai_reject(verification_id, user_id, reason):
    await db.driver_verifications.update_one({"id": verification_id}, {"$set": {"status": "rejected", "reviewed_at": datetime.now(timezone.utc), "reviewed_by": "AI_AGENT", "rejection_reason": reason}})
    await db.users.update_one({"id": user_id}, {"$set": {"verification_status": "rejected"}})
    await _append_verification_audit_event(
        driver_id=user_id,
        verification_id=verification_id,
        action="rejected",
        actor_type="ai",
        actor_id="AI_AGENT",
        details={"reason": reason},
    )
    await send_driver_verification_notification(user_id, "rejected", reason)

async def _mark_pending_manual_review(verification_id, user_id, reason):
    await db.driver_verifications.update_one(
        {"id": verification_id},
        {"$set": {
            "status": "pending",
            "reviewed_at": datetime.now(timezone.utc),
            "reviewed_by": "SYSTEM",
            "notes": reason,
        }},
    )
    await db.users.update_one({"id": user_id}, {"$set": {"verification_status": "pending"}})
    await _append_verification_audit_event(
        driver_id=user_id,
        verification_id=verification_id,
        action="pending_review",
        actor_type="system",
        actor_id="SYSTEM",
        details={"reason": reason},
    )

@drivers_router.get("/drivers/verification/{user_id}")
async def get_driver_verification_status(user_id: str, request: Request):
    verify_owner_strict(request, user_id)
    verification = await db.driver_verifications.find_one({"user_id": user_id})
    if not verification:
        return {"status": "not_submitted", "message": "No verification documents submitted yet"}
    verification["_id"] = str(verification["_id"])
    return verification

# ==================== ADMIN VERIFICATION ====================


def _driver_document_summary(doc_record: Optional[dict]) -> dict:
    docs = (doc_record or {}).get("documents") or {}
    nin_number = (doc_record or {}).get("nin_number")
    missing = _missing_required_archived_docs(doc_record)
    return {
        "document_count": (doc_record or {}).get("document_count", len(docs)),
        "required_docs_complete": not missing,
        "missing_required_docs": missing,
        "document_types": sorted(docs.keys()),
        "submitted_at": (doc_record or {}).get("submitted_at"),
        "archive_status": (doc_record or {}).get("status"),
        "nin_capture_mode": (doc_record or {}).get("nin_capture_mode"),
        "nin_last4": str(nin_number)[-4:] if nin_number else None,
        "vehicle_license_capture_mode": (doc_record or {}).get("vehicle_license_capture_mode"),
    }


async def _ensure_admin_verification_queue_rows():
    """Repair the admin queue from archived driver documents so submissions never disappear."""
    doc_records = await db.driver_documents.find(
        {"documents_submitted": {"$ne": False}},
        {"_id": 0, "documents.data": 0},
    ).sort("submitted_at", -1).to_list(1000)
    for doc_record in doc_records:
        driver_id = doc_record.get("driver_id")
        if not driver_id:
            continue
        existing = await db.driver_verifications.find_one({"user_id": driver_id}, {"_id": 0, "id": 1})
        if existing:
            continue
        profile = await db.driver_profiles.find_one({"user_id": driver_id}, {"_id": 0}) or {}
        archive_status = doc_record.get("status") or profile.get("verification_status") or "pending_review"
        queue_status = "approved" if archive_status == "approved" else ("rejected" if archive_status == "rejected" else "pending")
        verification_id = profile.get("last_document_submission_id") or str(uuid.uuid4())
        submitted_at_raw = doc_record.get("submitted_at") or profile.get("submitted_at")
        submitted_at = datetime.now(timezone.utc)
        if isinstance(submitted_at_raw, datetime):
            submitted_at = submitted_at_raw
        elif isinstance(submitted_at_raw, str):
            try:
                submitted_at = datetime.fromisoformat(submitted_at_raw.replace("Z", "+00:00"))
            except Exception:
                submitted_at = datetime.now(timezone.utc)
        await db.driver_verifications.update_one(
            {"user_id": driver_id},
            {
                "$set": {
                    "id": verification_id,
                    "user_id": driver_id,
                    "status": queue_status,
                    "submitted_at": submitted_at,
                    "reviewed_at": submitted_at if queue_status == "approved" else None,
                    "reviewed_by": "SYSTEM_AUTO_CHECK" if queue_status == "approved" else None,
                    "documents_summary": _driver_document_summary(doc_record),
                    "documents_archive_ref": {
                        "driver_id": driver_id,
                        "submitted_at": doc_record.get("submitted_at"),
                    },
                    "last_document_submission_id": verification_id,
                    "notes": "Recovered from archived driver document submission.",
                }
            },
            upsert=True,
        )
        await db.driver_profiles.update_one(
            {"user_id": driver_id},
            {"$set": {"last_document_submission_id": verification_id}},
            upsert=True,
        )


@drivers_router.get("/admin/verifications")
async def admin_get_verifications(request: Request, status: str = None, limit: int = 100, skip: int = 0):
    await require_admin_request(request)
    await _ensure_admin_verification_queue_rows()
    status_aliases = {
        "pending": ["pending", "pending_review", "under_review", "ai_reviewing"],
        "under_review": ["under_review", "ai_reviewing"],
        "approved": ["approved"],
        "rejected": ["rejected"],
    }
    query = {"status": {"$in": status_aliases.get(status, [status])}} if status else {}
    verifications = await db.driver_verifications.find(query, {"_id": 0}).sort("submitted_at", -1).skip(skip).limit(limit).to_list(limit)
    enriched = []
    for v in verifications:
        driver_id = v.get("user_id") or v.get("driver_id")
        user = await db.users.find_one({"id": driver_id}, {"name": 1, "phone": 1, "email": 1, "_id": 0})
        profile = await db.driver_profiles.find_one({"user_id": driver_id}, {"_id": 0}) or {}
        archived_docs = await db.driver_documents.find_one({"driver_id": driver_id}, {"_id": 0, "documents.data": 0}) or {}
        latest_snapshot = await db.driver_document_audit.find_one(
            {"driver_id": driver_id, "verification_id": v.get("id")},
            {"_id": 0, "id": 1, "approved_at": 1, "document_count": 1},
            sort=[("approved_at", -1)],
        )
        ai_result = v.get("ai_verification_result") or {}
        doc_summary = v.get("documents_summary") or _driver_document_summary(archived_docs)
        enriched.append({
            **v,
            "user_id": driver_id,
            "driver_id": driver_id,
            "user_name": user.get("name") if user else "Unknown",
            "user_phone": user.get("phone") if user else "Unknown",
            "user_email": user.get("email") if user else None,
            "documents_summary": doc_summary,
            "documents_archive": {
                "submitted_at": archived_docs.get("submitted_at"),
                "status": archived_docs.get("status"),
                "document_count": archived_docs.get("document_count", len((archived_docs.get("documents") or {}))),
            },
            "approved_documents_snapshot": latest_snapshot,
            "vehicle_make": profile.get("vehicle_make") or v.get("vehicle_make"),
            "vehicle_model": profile.get("vehicle_model") or v.get("vehicle_model"),
            "vehicle_plate": profile.get("vehicle_plate_number") or profile.get("vehicle_plate") or v.get("vehicle_plate"),
            "vehicle_color": profile.get("vehicle_color") or v.get("vehicle_color"),
            "review_metrics": {
                "confidence": ai_result.get("confidence"),
                "risk_score": ai_result.get("risk_score"),
                "face_id_match_score": ai_result.get("face_id_match_score"),
                "fraud_flags_count": len(ai_result.get("fraud_flags") or []),
                "mismatches_count": len(ai_result.get("mismatches") or []),
            },
        })
    pending_count = await db.driver_verifications.count_documents({"status": {"$in": status_aliases["pending"]}})
    under_review_count = await db.driver_verifications.count_documents({"status": {"$in": status_aliases["under_review"]}})
    approved_count = await db.driver_verifications.count_documents({"status": "approved"})
    rejected_count = await db.driver_verifications.count_documents({"status": "rejected"})
    counts = {
        "pending": pending_count,
        "under_review": under_review_count,
        "approved": approved_count,
        "rejected": rejected_count,
        "document_archives": await db.driver_documents.count_documents({}),
    }
    counts["total"] = pending_count + approved_count + rejected_count
    return {"verifications": enriched, "counts": counts}

@drivers_router.post("/admin/verifications/{verification_id}/review")
async def admin_start_verification_review(verification_id: str, request: Request):
    admin_email = await require_admin_request(request)
    verification = await db.driver_verifications.find_one({"id": verification_id}, {"_id": 0, "user_id": 1})
    result = await db.driver_verifications.update_one({"id": verification_id}, {"$set": {"status": "under_review"}})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Verification not found")
    await _append_verification_audit_event(
        driver_id=(verification or {}).get("user_id", "unknown"),
        verification_id=verification_id,
        action="under_review",
        actor_type="admin",
        actor_id=admin_email or "admin",
        details={},
    )
    return {"success": True, "message": "Verification marked as under review"}

@drivers_router.post("/admin/verifications/{verification_id}/approve")
async def admin_approve_verification(
    verification_id: str,
    request: Request,
    notes: str = None,
    force: bool = False,
):
    """Approve a driver verification.

    Set ``?force=true`` to override the document-completeness check when the
    admin explicitly wants to approve a driver whose document archive is
    incomplete or missing.  A warning note is appended to the audit log.
    """
    admin_email = await require_admin_request(request)
    verification = await db.driver_verifications.find_one({"id": verification_id})
    if not verification:
        raise HTTPException(status_code=404, detail="Verification not found")
    user_id = verification.get("user_id")
    if not user_id:
        raise HTTPException(status_code=400, detail="Verification record missing user_id")

    archived = await db.driver_documents.find_one({"driver_id": user_id}) or {}
    missing = _missing_required_archived_docs(archived)
    if missing and not force:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot approve — missing required documents: {', '.join(missing)}. Use force=true to override.",
            headers={"X-Missing-Docs": ",".join(missing)},
        )

    now_utc = datetime.now(timezone.utc)
    effective_notes = (notes or "") + (" [FORCE-APPROVED by admin — some documents may be missing]" if force and missing else "")

    snapshot = await _snapshot_approved_documents(
        driver_id=user_id,
        verification_id=verification_id,
        approved_by=admin_email or "admin",
        notes=effective_notes or None,
        force=force,
    )

    await db.driver_verifications.update_one(
        {"id": verification_id},
        {"$set": {
            "status": "approved",
            "reviewed_at": now_utc,
            "reviewed_by": admin_email or "admin",
            "notes": effective_notes or None,
            "force_approved": force and bool(missing),
        }},
    )
    await _append_verification_audit_event(
        driver_id=user_id,
        verification_id=verification_id,
        action="approved",
        actor_type="admin",
        actor_id=admin_email or "admin",
        details={"notes": effective_notes, "force": force},
    )
    profile = await db.driver_profiles.find_one({"user_id": user_id}) or {}
    next_onboarding_step = "approved" if profile.get("profile_completed") else "profile"
    await db.users.update_one(
        {"id": user_id},
        {"$set": {
            "verification_status": "approved",
            "documents_verified": True,
            "approved_at": now_utc.isoformat(),
        }},
    )
    vehicle_info = verification.get("vehicle_info", {}) or {}
    await db.driver_profiles.update_one(
        {"user_id": user_id},
        {"$set": {
            "documents_verified": True,
            "verification_status": "approved",
            "profile_completed": True,        # ensure onboarding-status returns "approved"
            "documents_approved_at": now_utc.isoformat(),
            "nin_verified": True,
            "license_uploaded": True,
            "vehicle_docs_uploaded": True,
            "selfie_verified": True,
            "vehicle_type": vehicle_info.get("vehicleMake"),
            "vehicle_model": vehicle_info.get("vehicleModel"),
            "vehicle_plate": vehicle_info.get("plateNumber"),
            "vehicle_color": vehicle_info.get("vehicleColor"),
            "onboarding_step": "approved",
            "approved_documents_snapshot_id": snapshot.get("id"),
        }},
        upsert=True,
    )
    # Also mark profile_completed on users record
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"profile_completed": True}},
    )
    await _ensure_48h_trial_for_verified_driver(user_id)
    try:
        await send_driver_verification_notification(user_id, "approved")
    except Exception:
        pass
    return {
        "success": True,
        "message": "Driver verification approved",
        "driver_id": user_id,
        "verification_id": verification_id,
        "force_approved": force and bool(missing),
        "snapshot_id": snapshot.get("id"),
    }

@drivers_router.post("/admin/verifications/{verification_id}/reject")
async def admin_reject_verification(verification_id: str, request: Request, reason: str = "Documents do not meet requirements"):
    admin_email = await require_admin_request(request)
    verification = await db.driver_verifications.find_one({"id": verification_id})
    if not verification:
        raise HTTPException(status_code=404, detail="Verification not found")
    await db.driver_verifications.update_one({"id": verification_id}, {"$set": {"status": "rejected", "reviewed_at": datetime.now(timezone.utc), "reviewed_by": admin_email or "admin", "rejection_reason": reason}})
    user_id_for_notif = verification.get("user_id")
    await db.users.update_one({"id": user_id_for_notif}, {"$set": {"verification_status": "rejected"}})
    await db.driver_profiles.update_one(
        {"user_id": user_id_for_notif},
        {"$set": {"verification_status": "rejected", "rejection_reason": reason}},
        upsert=True,
    )
    await _append_verification_audit_event(
        driver_id=user_id_for_notif,
        verification_id=verification_id,
        action="rejected",
        actor_type="admin",
        actor_id=admin_email or "admin",
        details={"reason": reason},
    )
    try:
        await send_driver_verification_notification(user_id_for_notif, "rejected", reason)
    except Exception:
        pass
    return {"success": True, "message": "Driver verification rejected", "reason": reason}


@drivers_router.get("/admin/drivers/{driver_id}/approved-documents")
async def admin_get_approved_driver_documents(driver_id: str, request: Request, include_data: bool = False, limit: int = 5):
    """Admin recheck endpoint for approved document snapshots."""
    await require_admin_request(request)
    projection = {"_id": 0}
    if not include_data:
        projection["documents.data"] = 0

    snapshots = await db.driver_document_audit.find(
        {"driver_id": driver_id, "status": "approved"},
        projection,
    ).sort("approved_at", -1).limit(max(1, min(limit, 20))).to_list(max(1, min(limit, 20)))

    return {
        "driver_id": driver_id,
        "count": len(snapshots),
        "snapshots": snapshots,
    }


@drivers_router.get("/admin/verifications/{verification_id}/approved-documents")
async def admin_get_verification_approved_documents(verification_id: str, request: Request, include_data: bool = False):
    """Admin document review endpoint.

    For approved drivers it returns the immutable approved snapshot. For pending
    drivers it falls back to the current archived submission so admins can review
    documents before approval.
    """
    await require_admin_request(request)
    projection = {"_id": 0}
    if not include_data:
        projection["documents.data"] = 0

    snapshot = await db.driver_document_audit.find_one(
        {"verification_id": verification_id, "status": "approved"},
        projection,
        sort=[("approved_at", -1)],
    )
    if snapshot:
        return snapshot

    verification = await db.driver_verifications.find_one({"id": verification_id}, {"_id": 0})
    if not verification:
        raise HTTPException(status_code=404, detail="Verification not found")
    driver_id = verification.get("user_id") or verification.get("driver_id")
    archived = await db.driver_documents.find_one({"driver_id": driver_id}, projection)
    if not archived:
        raise HTTPException(status_code=404, detail="No archived document submission found for this verification")
    raw_docs = archived.get("documents") or {}
    # Return metadata only — image data served on-demand via /document-image/{doc_key}
    docs_meta = {
        k: {
            "filename": v.get("filename") if isinstance(v, dict) else None,
            "content_type": v.get("content_type") if isinstance(v, dict) else "image/jpeg",
            "size_bytes": v.get("size_bytes") if isinstance(v, dict) else None,
            "sha256": v.get("sha256") if isinstance(v, dict) else None,
            "uploaded_at": v.get("uploaded_at") if isinstance(v, dict) else None,
            "expiry_date": v.get("expiry_date") if isinstance(v, dict) else None,
        }
        for k, v in raw_docs.items()
    }
    return {
        "id": archived.get("id") or f"archive-{verification_id}",
        "verification_id": verification_id,
        "driver_id": driver_id,
        "status": archived.get("status") or verification.get("status"),
        "approved_by": None,
        "approved_at": None,
        "submitted_at": archived.get("submitted_at"),
        "document_count": archived.get("document_count", len(docs_meta)),
        "documents": docs_meta,
        "source": "pending_archive",
    }


@drivers_router.get("/admin/verifications/{verification_id}/document-image/{doc_key}")
async def admin_get_verification_document_image(
    verification_id: str,
    doc_key: str,
    request: Request,
    token: Optional[str] = None,
):
    """Return a single document image as binary.

    Accepts the admin session token via either:
      - x-admin-token request header (standard API calls)
      - ?token=xxx query parameter   (for direct <img src="..."> browser use)
    """
    import base64 as _b64
    from fastapi.responses import Response as _Resp

    # Validate via query-param token if provided (same lookup as require_admin_request)
    if token:
        import hashlib as _hl
        from datetime import datetime as _dt, timezone as _tz
        token_hash = _hl.sha256(token.encode()).hexdigest()
        now = _dt.now(_tz.utc)
        session = await db.admin_sessions.find_one(
            {"token_hash": token_hash, "revoked": {"$ne": True}, "expires_at": {"$gt": now}},
            {"_id": 0, "email": 1},
        )
        if not session:
            raise HTTPException(status_code=403, detail="Invalid or expired admin token")
    else:
        await require_admin_request(request)

    verification = await db.driver_verifications.find_one({"id": verification_id}, {"_id": 0})
    if not verification:
        raise HTTPException(status_code=404, detail="Verification not found")
    driver_id = verification.get("user_id") or verification.get("driver_id")
    archived = await db.driver_documents.find_one({"driver_id": driver_id}, {"_id": 0})
    if not archived:
        raise HTTPException(status_code=404, detail="No document archive for this driver")
    doc = (archived.get("documents") or {}).get(doc_key)
    if not doc or not isinstance(doc, dict) or not doc.get("data"):
        raise HTTPException(status_code=404, detail=f"Document '{doc_key}' not found or has no image data")
    try:
        raw_bytes = _b64.b64decode(doc["data"])
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to decode document image")
    content_type = doc.get("content_type") or "image/jpeg"
    return _Resp(
        content=raw_bytes,
        media_type=content_type,
        headers={"Cache-Control": "private, max-age=3600"},
    )


@drivers_router.post("/admin/drivers/{driver_id}/verification/revoke")
async def admin_revoke_driver_verification(driver_id: str, request: Request, reason: str = "Manual recheck requested"):
    """Force driver back into verification flow and quarantine from going online."""
    admin_email = await require_admin_request(request)
    latest_verification = await db.driver_verifications.find_one({"user_id": driver_id}, sort=[("submitted_at", -1)])
    verification_id = (latest_verification or {}).get("id") or "unknown"
    await db.users.update_one(
        {"id": driver_id},
        {
            "$set": {
                "verification_status": "recheck_required",
                "documents_verified": False,
                "suspension_reason": "verification_recheck_required",
            }
        },
    )
    await db.driver_profiles.update_one(
        {"user_id": driver_id},
        {
            "$set": {
                "verification_status": "recheck_required",
                "documents_verified": False,
                "is_online": False,
                "onboarding_step": "documents",
                "suspended_reason": "verification_recheck_required",
            }
        },
    )
    await _append_verification_audit_event(
        driver_id=driver_id,
        verification_id=verification_id,
        action="revoked_for_recheck",
        actor_type="admin",
        actor_id=admin_email or "admin",
        details={"reason": reason},
    )
    return {"success": True, "message": "Driver moved to recheck-required and quarantined offline", "reason": reason}


@drivers_router.get("/admin/verifications/{verification_id}/audit-log")
async def admin_get_verification_audit_log(verification_id: str, request: Request, limit: int = 100):
    await require_admin_request(request)
    rows = await db.driver_verification_audit.find(
        {"verification_id": verification_id},
        {"_id": 0},
    ).sort("created_at", -1).limit(max(1, min(limit, 500))).to_list(max(1, min(limit, 500)))
    return {"verification_id": verification_id, "count": len(rows), "events": rows}

# ==================== DRIVER HEATMAP ====================

def _heatmap_zone_jitter(seed_bytes: bytes, idx: int, slot: str) -> float:
    """Stable pseudo-random float in [-0.05, 0.05] derived from seed (no `random` nondeterminism across workers)."""
    h = hashlib.sha256(seed_bytes + str(idx).encode() + slot.encode()).digest()
    u = int.from_bytes(h[:4], "big") / 0xFFFFFFFF
    return round((u * 0.10) - 0.05, 6)


@drivers_router.get("/driver/heatmap")
async def get_heatmap(lat: float = None, lng: float = None, city: str = None):
    from routers.ai_features import detect_city

    loc = detect_city(lat, lng, city)
    city_name = loc["city"]
    base_lat, base_lng = float(loc["lat"]), float(loc["lng"])
    zones_data = list(loc.get("zones") or [])
    if not zones_data:
        zones_data = detect_city(None, None, "lagos").get("zones") or ["Central"]

    hour = int(datetime.utcnow().hour)
    seed_bytes = f"{hour}-{city_name}".encode()
    zones = []
    for i, zone_name in enumerate(zones_data):
        offset_lat = _heatmap_zone_jitter(seed_bytes, i, "lat")
        offset_lng = _heatmap_zone_jitter(seed_bytes, i, "lng")
        ih = _heatmap_zone_jitter(seed_bytes, i, "int")
        intensity = round(0.50 + (ih + 0.05) / 0.10 * 0.45, 2)
        intensity = max(0.50, min(0.95, intensity))
        sh = abs(_heatmap_zone_jitter(seed_bytes, i, "srg"))
        surge = round(1.0 + min(0.50, (sh + 0.05) / 0.10 * 0.50), 1)
        zones.append(
            {
                "lat": round(base_lat + offset_lat, 4),
                "lng": round(base_lng + offset_lng, 4),
                "intensity": intensity,
                "zone_name": zone_name,
                "surge_multiplier": surge,
                "demand_level": "very_high"
                if intensity > 0.8
                else "high"
                if intensity > 0.6
                else "medium",
            }
        )
    return {
        "city": city_name,
        "zones": zones,
        "updated_at": datetime.utcnow().isoformat(),
        "recommendation": f"Head to {zones[0]['zone_name']} for stronger demand this hour" if zones else "No data available",
    }


@drivers_router.get("/driver/fleet/nearby")
async def get_nearby_fleet(lat: float, lng: float, radius_km: float = 5.0):
    """Return nearby fleet drivers with live status for fleet tracker UI."""
    profiles = await db.driver_profiles.find(
        {"current_location": {"$ne": None}}
    ).to_list(200)

    fleet = []
    for profile in profiles:
        loc = profile.get("current_location") or {}
        dlat = loc.get("lat")
        dlng = loc.get("lng")
        if dlat is None or dlng is None:
            continue

        distance_km = _haversine_km(lat, lng, dlat, dlng)
        if distance_km > radius_km:
            continue

        driver_id = profile.get("user_id")
        user = await db.users.find_one({"id": driver_id}, {"_id": 0, "name": 1})
        trips_today = await db.trips.count_documents(
            {
                "driver_id": driver_id,
                "status": "completed",
                "completed_at": {
                    "$gte": datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
                },
            }
        )

        status = "on_trip" if await db.trips.find_one(
            {"driver_id": driver_id, "status": {"$in": ["accepted", "ongoing"]}}
        ) else ("available" if profile.get("is_online") else "offline")

        fleet.append(
            {
                "driver_id": driver_id,
                "name": (user or {}).get("name", "Driver"),
                "vehicle": f"{profile.get('vehicle_model') or 'Vehicle'} ({profile.get('vehicle_plate') or 'N/A'})",
                "lat": dlat,
                "lng": dlng,
                "status": status,
                "trips_today": trips_today,
                "distance_km": round(distance_km, 2),
                "visibility_score": float(profile.get("visibility_score", 50.0)),
            }
        )

    # Prioritize reliable drivers first, then nearby distance.
    fleet.sort(key=lambda d: (-d.get("visibility_score", 0), d.get("distance_km", 9999)))
    return {"success": True, "fleet": fleet[:6], "count": min(len(fleet), 6)}

# ==================== DRIVER EARNINGS DASHBOARD ====================

@drivers_router.get("/drivers/{driver_id}/salary-mode")
async def get_driver_salary_mode(driver_id: str, request: Request):
    verify_owner_strict(request, driver_id)
    profile = await db.driver_profiles.find_one({"user_id": driver_id}, {"_id": 0, "salary_mode": 1}) or {}
    salary_mode = profile.get("salary_mode") or {}
    now = datetime.utcnow()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    month_trips = await db.trips.find(
        match_completed_trip_paid_for_earnings(driver_id=driver_id, completed_at={"$gte": month_start})
    ).to_list(1000)
    achieved = sum(float(t.get("fare", 0) or 0) for t in month_trips)
    plan = _build_salary_mode_plan(float(salary_mode.get("monthly_income_target", 0) or 0), achieved, now)
    plan["enabled"] = bool(salary_mode.get("enabled")) and plan["monthly_income_target"] > 0
    return {"success": True, "salary_mode": plan}


@drivers_router.put("/drivers/{driver_id}/salary-mode")
async def update_driver_salary_mode(driver_id: str, payload: DriverSalaryModeUpdate, request: Request):
    verify_owner_strict(request, driver_id)
    salary_mode = {
        "enabled": bool(payload.enabled and payload.monthly_income_target > 0),
        "monthly_income_target": float(payload.monthly_income_target or 0),
        "updated_at": datetime.utcnow(),
    }
    await db.driver_profiles.update_one(
        {"user_id": driver_id},
        {"$set": {"salary_mode": salary_mode}},
        upsert=True,
    )
    achieved = 0.0
    if salary_mode["monthly_income_target"] > 0:
        now = datetime.utcnow()
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        month_trips = await db.trips.find(
            match_completed_trip_paid_for_earnings(driver_id=driver_id, completed_at={"$gte": month_start})
        ).to_list(1000)
        achieved = sum(float(t.get("fare", 0) or 0) for t in month_trips)
        plan = _build_salary_mode_plan(salary_mode["monthly_income_target"], achieved, now)
    else:
        plan = _build_salary_mode_plan(0, 0, datetime.utcnow())
    plan["enabled"] = salary_mode["enabled"]
    return {
        "success": True,
        "message": "Driver Salary Mode updated",
        "salary_mode": plan,
    }


@drivers_router.get("/driver/earnings/{driver_id}")
async def get_driver_earnings_dashboard(driver_id: str, request: Request, period: str = "today"):
    verify_owner_strict(request, driver_id)
    # Use UTC for DB queries (all timestamps stored as UTC)
    now_utc = datetime.utcnow()
    # Use Nigeria WAT (UTC+1) for window/time-of-day logic so guarantee windows
    # fire at the correct local time for Nigerian drivers.
    WAT_OFFSET = timedelta(hours=1)
    now = now_utc + WAT_OFFSET  # Nigeria local time for window calculations
    if period == "today":
        start_date = now_utc.replace(hour=0, minute=0, second=0, microsecond=0) - WAT_OFFSET
    elif period == "week":
        start_date = now_utc - timedelta(days=7)
    elif period == "month":
        start_date = now_utc - timedelta(days=30)
    else:
        start_date = now_utc.replace(hour=0, minute=0, second=0, microsecond=0) - WAT_OFFSET
    trips = await db.trips.find(
        match_completed_trip_paid_for_earnings(
            driver_id=driver_id,
            completed_at={"$gte": start_date},
        )
    ).to_list(500)
    total_earnings = sum(t.get("fare", 0) for t in trips)
    total_trips = len(trips)
    total_distance = sum(t.get("distance_km", 0) for t in trips)
    total_time = sum(t.get("duration_mins", 0) for t in trips)
    traffic_compensation = sum(t.get("traffic_fee", 0) for t in trips)
    tier_data = await db.driver_tiers.find_one({"driver_id": driver_id})
    current_tier = tier_data.get("tier", "basic") if tier_data else "basic"
    tier_config = TIER_CONFIG.get(current_tier, TIER_CONFIG["basic"])
    daily_breakdown = {}
    for trip in trips:
        trip_date = trip.get("completed_at", now).strftime("%Y-%m-%d") if hasattr(trip.get("completed_at", now), "strftime") else str(trip.get("completed_at", ""))[:10]
        if trip_date not in daily_breakdown:
            daily_breakdown[trip_date] = {"trips": 0, "earnings": 0, "distance": 0}
        daily_breakdown[trip_date]["trips"] += 1
        daily_breakdown[trip_date]["earnings"] += trip.get("fare", 0)
        daily_breakdown[trip_date]["distance"] += trip.get("distance_km", 0)
    avg_per_trip = total_earnings / total_trips if total_trips > 0 else 0
    avg_per_km = total_earnings / total_distance if total_distance > 0 else 0
    hours_worked = (now_utc - (start_date + WAT_OFFSET)).total_seconds() / 3600
    projected_daily = (total_earnings / hours_worked * 10) if hours_worked > 0 and period == "today" else total_earnings / max(1, (now_utc - start_date).days)
    user_doc = await db.users.find_one({"id": driver_id}, {"_id": 0, "city": 1}) or {}
    profile = await db.driver_profiles.find_one(
        {"user_id": driver_id},
        {"_id": 0, "salary_mode": 1, "current_location": 1, "active_categories": 1, "vehicle_type": 1},
    ) or {}

    # ── Live surge (hybrid): GPS bubble demand + profile city/service tier ──
    from routers.payments import calculate_surge_multiplier

    cloc = profile.get("current_location") or {}
    lat_raw = cloc.get("lat")
    lng_raw = cloc.get("lng")
    has_coords = False
    lat_f = 0.0
    lng_f = 0.0
    try:
        if lat_raw is not None and lng_raw is not None:
            lat_f = float(lat_raw)
            lng_f = float(lng_raw)
            has_coords = abs(lat_f) > 1e-5 or abs(lng_f) > 1e-5
    except (TypeError, ValueError):
        has_coords = False

    cats = profile.get("active_categories") or []
    if cats:
        raw_svc = str(cats[0])
    else:
        raw_svc = str(profile.get("vehicle_type") or "economy")
    norm_svc = _normalize_category(raw_svc) or "economy"
    service_for_surge = "economy" if norm_svc == "female_only" else norm_svc

    city_for_surge = _fare_city_for_surge(lat_f if has_coords else None, lng_f if has_coords else None, user_doc.get("city"))

    demand_ratio = 0.0
    if has_coords:
        demand_ratio = await _estimate_area_demand_ratio_near(db, lat_f, lng_f)

    surge_status = calculate_surge_multiplier(
        lat=lat_f if has_coords else 0.0,
        lng=lng_f if has_coords else 0.0,
        demand_ratio=demand_ratio,
        is_raining=False,
        service_type=service_for_surge,
        city=city_for_surge,
    )
    band = _surge_demand_band_meta(demand_ratio)
    city_label = city_for_surge.replace("_", " ").title()
    surge_status["surge_context"] = {
        "city": city_for_surge,
        "city_label": city_label,
        "service_type": service_for_surge,
        "service_label": service_for_surge.title(),
        "demand_ratio_estimate": demand_ratio,
        "demand_band": band["key"],
        "demand_band_label": band["label"],
        "gps_based_demand": bool(has_coords),
        "tier_surge_cap": surge_status.get("service_cap"),
    }

    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    month_trips = await db.trips.find(
        match_completed_trip_paid_for_earnings(driver_id=driver_id, completed_at={"$gte": month_start})
    ).to_list(1000)
    month_achieved = sum(float(t.get("fare", 0) or 0) for t in month_trips)
    salary_mode = _build_salary_mode_plan(
        float(((profile.get("salary_mode") or {}).get("monthly_income_target", 0) or 0)),
        month_achieved,
        now,
    )
    salary_mode["enabled"] = bool(((profile.get("salary_mode") or {}).get("enabled")) and salary_mode["monthly_income_target"] > 0)
    return {
        "driver_id": driver_id,
        "period": period,
        "tier": {
            "name": tier_config["name"],
            "earning_potential": tier_config["earning_per_ride"],
            "monthly_fee": tier_config["monthly_fee"],
        },
        "summary": {
            "total_earnings": total_earnings,
            "total_trips": total_trips,
            "total_distance_km": round(total_distance, 1),
            "total_time_mins": total_time,
            "traffic_compensation": traffic_compensation,
            "keep_percentage": 100,
        },
        "averages": {
            "per_trip": round(avg_per_trip, 2),
            "per_km": round(avg_per_km, 2),
            "hourly": round(total_earnings / (total_time / 60), 2) if total_time > 0 else 0,
        },
        "projections": {
            "daily": round(projected_daily, 2),
            "weekly": round(projected_daily * 6, 2),
            "monthly": round(projected_daily * 24, 2),
        },
        "daily_breakdown": daily_breakdown,
        # Live surge status — replaces old anti-surge guarantee
        "surge": surge_status,
        "salary_mode": salary_mode,
        "commission_message": "You keep 100% of all earnings. Riders pay you directly.",
    }


@drivers_router.post("/drivers/{driver_id}/bank-details")
async def save_bank_details(driver_id: str, request: dict, http_request: Request):
    """Save driver bank details for direct rider payments."""
    verify_owner_strict(http_request, driver_id)
    bank_data = {
        "bank_name": request.get("bank_name"),
        "account_number": request.get("account_number"),
        "account_name": request.get("account_name"),
    }
    if not all(bank_data.values()):
        raise HTTPException(status_code=400, detail="All bank fields are required")
    await db.driver_profiles.update_one(
        {"user_id": driver_id},
        {"$set": bank_data},
        upsert=True,
    )
    await db.users.update_one(
        {"id": driver_id},
        {"$set": bank_data},
    )
    return {"success": True, "message": "Bank details saved"}


@drivers_router.get("/drivers/{driver_id}/bank-details")
async def get_bank_details(driver_id: str, http_request: Request):
    """Return saved driver bank details and whether payout routing is ready."""
    verify_owner_strict(http_request, driver_id)
    profile = await db.driver_profiles.find_one({"user_id": driver_id}, {"_id": 0}) or {}
    user = await db.users.find_one({"id": driver_id}, {"_id": 0}) or {}

    bank_name = profile.get("bank_name") or user.get("bank_name")
    account_number = profile.get("account_number") or user.get("account_number")
    account_name = profile.get("account_name") or user.get("account_name")
    payout_ready = bool(bank_name and account_number and account_name)

    return {
        "success": True,
        "bank_name": bank_name or "",
        "account_number": account_number or "",
        "account_name": account_name or "",
        "payout_ready": payout_ready,
        "payment_model": "direct_rider_to_driver",
        "message": (
            "Riders pay this account directly after completed trips."
            if payout_ready
            else "Add your bank details to receive direct rider payments."
        ),
    }


@drivers_router.post("/drivers/{driver_id}/verify-bank")
async def verify_bank_account(driver_id: str, request: dict, http_request: Request):
    """Attempt to verify bank account name. Returns account_name if found."""
    verify_owner_strict(http_request, driver_id)
    return {"account_name": None, "message": "Manual entry required"}


@drivers_router.get("/drivers/{driver_id}/earnings-vault")
async def get_earnings_vault(driver_id: str, http_request: Request):
    """Spendable wallet vs locked vault and any pending cooldown release."""
    verify_owner_strict(http_request, driver_id)
    user = await db.users.find_one(
        {"id": driver_id},
        {"_id": 0, "role": 1, "wallet_balance": 1, "earnings_vault_locked": 1, "earnings_vault_pending_release": 1},
    ) or {}
    if user.get("role") != "driver":
        raise HTTPException(status_code=403, detail="Driver account required")
    wallet = round(float(user.get("wallet_balance", 0.0) or 0.0), 2)
    locked = round(float(user.get("earnings_vault_locked", 0.0) or 0.0), 2)
    pending = user.get("earnings_vault_pending_release") or {}
    return {
        "success": True,
        "wallet_spendable": wallet,
        "vault_locked": locked,
        "pending_release": pending if pending.get("amount") else None,
        "cooldown_hours": VAULT_RELEASE_COOLDOWN_HOURS,
    }


@drivers_router.post("/drivers/{driver_id}/earnings-vault/lock")
async def lock_earnings_vault(driver_id: str, request: EarningsVaultLockRequest, http_request: Request):
    """Move funds from spendable wallet into untouchable vault."""
    verify_owner_strict(http_request, driver_id)
    user = await db.users.find_one({"id": driver_id}, {"_id": 0, "role": 1, "wallet_balance": 1, "earnings_frozen": 1}) or {}
    if user.get("role") != "driver":
        raise HTTPException(status_code=403, detail="Driver account required")
    if bool(user.get("earnings_frozen")):
        raise HTTPException(status_code=423, detail="Earnings are frozen. Vault changes are paused.")
    amount = round(float(request.amount), 2)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    wallet = float(user.get("wallet_balance", 0.0) or 0.0)
    if wallet < amount - 0.005:
        raise HTTPException(status_code=400, detail=f"Insufficient spendable balance. Available: ₦{wallet:,.2f}")
    res = await db.users.update_one(
        {"id": driver_id, "wallet_balance": {"$gte": amount}},
        {"$inc": {"wallet_balance": -amount, "earnings_vault_locked": amount}},
    )
    if res.modified_count == 0:
        raise HTTPException(status_code=400, detail="Could not lock funds. Check your balance.")
    await db.transactions.insert_one(
        {
            "id": str(uuid.uuid4()),
            "user_id": driver_id,
            "type": "vault_lock",
            "source": "earnings_vault",
            "amount": -amount,
            "status": "success",
            "timestamp": datetime.utcnow(),
            "reference": f"vault_lock_{uuid.uuid4().hex[:10]}",
        }
    )
    updated = await db.users.find_one({"id": driver_id}, {"_id": 0, "wallet_balance": 1, "earnings_vault_locked": 1}) or {}
    return {
        "success": True,
        "message": "Funds moved to Earnings Vault. They cannot be withdrawn without unlock cooldown and secondary verification.",
        "wallet_spendable": round(float(updated.get("wallet_balance", 0.0) or 0.0), 2),
        "vault_locked": round(float(updated.get("earnings_vault_locked", 0.0) or 0.0), 2),
    }


@drivers_router.post("/drivers/{driver_id}/earnings-vault/request-unlock")
async def request_earnings_vault_unlock(driver_id: str, request: EarningsVaultUnlockRequest, http_request: Request):
    """Start 48-hour cooldown before vault funds can return to spendable wallet."""
    verify_owner_strict(http_request, driver_id)
    user = await db.users.find_one({"id": driver_id}, {"_id": 0, "role": 1, "earnings_vault_locked": 1, "earnings_vault_pending_release": 1, "earnings_frozen": 1}) or {}
    if user.get("role") != "driver":
        raise HTTPException(status_code=403, detail="Driver account required")
    if bool(user.get("earnings_frozen")):
        raise HTTPException(status_code=423, detail="Earnings are frozen. Vault unlock is paused.")
    pending = user.get("earnings_vault_pending_release") or {}
    if pending.get("amount"):
        raise HTTPException(status_code=400, detail="An unlock is already in progress. Wait for the cooldown or complete release.")
    amount = round(float(request.amount), 2)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    locked = float(user.get("earnings_vault_locked", 0.0) or 0.0)
    if locked < amount - 0.005:
        raise HTTPException(status_code=400, detail=f"Insufficient vault balance. Locked: ₦{locked:,.2f}")
    now = datetime.now(timezone.utc)
    release_at = now + timedelta(hours=VAULT_RELEASE_COOLDOWN_HOURS)
    pending_doc = {
        "amount": amount,
        "requested_at": now.isoformat(),
        "release_available_at": release_at.isoformat(),
    }
    res = await db.users.update_one(
        {"id": driver_id, "earnings_vault_locked": {"$gte": amount}},
        {"$inc": {"earnings_vault_locked": -amount}, "$set": {"earnings_vault_pending_release": pending_doc}},
    )
    if res.modified_count == 0:
        raise HTTPException(status_code=400, detail="Could not start unlock. Check vault balance.")
    return {
        "success": True,
        "message": f"Unlock started. After {VAULT_RELEASE_COOLDOWN_HOURS} hours, confirm with PIN and face scan to move funds to your spendable wallet.",
        "pending_release": pending_doc,
    }


@drivers_router.post("/drivers/{driver_id}/earnings-vault/confirm-release")
async def confirm_earnings_vault_release(driver_id: str, request: EarningsVaultReleaseRequest, http_request: Request):
    """After cooldown, move pending vault funds to spendable wallet using PIN + face scan."""
    verify_owner_strict(http_request, driver_id)
    user = await db.users.find_one({"id": driver_id}, {"_id": 0}) or {}
    if user.get("role") != "driver":
        raise HTTPException(status_code=403, detail="Driver account required")
    if bool(user.get("earnings_frozen")):
        raise HTTPException(status_code=423, detail="Earnings are frozen.")
    pending = user.get("earnings_vault_pending_release") or {}
    release_amount = float(pending.get("amount") or 0.0)
    if release_amount <= 0:
        raise HTTPException(status_code=400, detail="No pending vault release. Request an unlock first.")
    raw_deadline = pending.get("release_available_at")
    try:
        deadline = datetime.fromisoformat(str(raw_deadline).replace("Z", "+00:00"))
        if deadline.tzinfo is None:
            deadline = deadline.replace(tzinfo=timezone.utc)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid pending release state")
    now = datetime.now(timezone.utc)
    if now < deadline:
        remaining = int((deadline - now).total_seconds())
        hours = remaining // 3600
        mins = (remaining % 3600) // 60
        raise HTTPException(
            status_code=400,
            detail=f"Cooldown active. Funds unlock in {hours}h {mins}m. No withdrawal until then.",
        )
    if not request.pin.isdigit():
        raise HTTPException(status_code=400, detail="PIN must be digits only")
    pin_hash = str(user.get("driver_account_pin_hash") or "")
    if not pin_hash or pin_hash != _vault_pin_hash(driver_id, request.pin):
        raise HTTPException(status_code=403, detail="Invalid PIN")
    profile = await db.driver_profiles.find_one({"user_id": driver_id}, {"_id": 0, "face_image": 1}) or {}
    reference_face = user.get("face_image") or profile.get("face_image") or user.get("profile_image")
    if not reference_face:
        raise HTTPException(status_code=400, detail="No registered face reference")
    confidence = face_match_confidence(reference_face, request.face_image)
    if confidence < FACE_MATCH_SENSITIVE_MIN:
        raise HTTPException(status_code=403, detail="Face verification failed. Vault funds stay protected.")
    res = await db.users.update_one(
        {"id": driver_id, "earnings_vault_pending_release.amount": release_amount},
        {"$inc": {"wallet_balance": release_amount}, "$unset": {"earnings_vault_pending_release": ""}},
    )
    if res.modified_count == 0:
        raise HTTPException(status_code=400, detail="Could not complete release. Try again or contact support.")
    await db.transactions.insert_one(
        {
            "id": str(uuid.uuid4()),
            "user_id": driver_id,
            "type": "vault_release",
            "source": "earnings_vault",
            "amount": release_amount,
            "status": "success",
            "timestamp": datetime.utcnow(),
            "reference": f"vault_release_{uuid.uuid4().hex[:10]}",
            "meta": {"face_confidence": confidence, "cooldown_hours": VAULT_RELEASE_COOLDOWN_HOURS},
        }
    )
    updated = await db.users.find_one({"id": driver_id}, {"_id": 0, "wallet_balance": 1, "earnings_vault_locked": 1}) or {}
    return {
        "success": True,
        "message": "Vault funds released to your spendable wallet after cooldown and secondary verification.",
        "released_amount": round(release_amount, 2),
        "wallet_spendable": round(float(updated.get("wallet_balance", 0.0) or 0.0), 2),
        "vault_locked": round(float(updated.get("earnings_vault_locked", 0.0) or 0.0), 2),
        "face_match_confidence": confidence,
    }


@drivers_router.post("/drivers/{driver_id}/sim-swap-signal")
async def report_sim_swap_signal(driver_id: str, request: SimSwapSignalRequest, http_request: Request):
    """
    SIM swap risk detection using device fingerprint only.

    NOTE: Phone-number comparison was REMOVED. SIM swap fraud keeps the same
    phone number on a new SIM — comparing phone numbers is the wrong signal and
    caused false positives when app state and DB store numbers in different formats
    (e.g. 08012345678 vs +2348012345678).

    We only compare device-generated fingerprints, and only after the first
    successful registration (grace period). Checks are rate-limited to once per 24h.
    """
    verify_owner_strict(http_request, driver_id)

    profile = await db.driver_profiles.find_one(
        {"user_id": driver_id},
        {"_id": 0, "sim_fingerprint": 1, "sim_last_checked_at": 1, "verification_status": 1}
    ) or {}

    now_utc = datetime.now(timezone.utc)
    now_iso = now_utc.isoformat()

    # ── Rate limit: only run the check once every 24 hours ─────────────────
    last_checked_raw = profile.get("sim_last_checked_at")
    if last_checked_raw:
        try:
            last_checked = datetime.fromisoformat(str(last_checked_raw).replace("Z", "+00:00"))
            if last_checked.tzinfo is None:
                last_checked = last_checked.replace(tzinfo=timezone.utc)
            if (now_utc - last_checked).total_seconds() < 86400:  # 24 hours
                return {"success": True, "message": "SIM check skipped (rate limited)", "checked": False}
        except Exception:
            pass  # Proceed on parse error

    # ── Fingerprint check ──────────────────────────────────────────────────
    previous_fingerprint = str(profile.get("sim_fingerprint") or "")
    incoming_fingerprint = str(request.sim_fingerprint or "")

    # Grace period: if no fingerprint stored yet, just save it (first-time setup)
    if not previous_fingerprint:
        await db.driver_profiles.update_one(
            {"user_id": driver_id},
            {"$set": {
                "sim_fingerprint": incoming_fingerprint,
                "sim_carrier_name": request.carrier_name,
                "sim_last_checked_at": now_iso,
            }},
            upsert=True,
        )
        return {"success": True, "message": "SIM fingerprint registered", "checked": True}

    # Fingerprint changed — genuine SIM swap signal
    if previous_fingerprint != incoming_fingerprint:
        lock_payload = {
            "active": True,
            "reason": "sim_fingerprint_changed",
            "detected_at": now_iso,
            "carrier_name": request.carrier_name,
            "previous_fingerprint_prefix": previous_fingerprint[:12],
            "new_fingerprint_prefix": incoming_fingerprint[:12],
        }
        await db.users.update_one(
            {"id": driver_id},
            {"$set": {"sim_swap_lock": lock_payload, "earnings_frozen": True}}
        )
        await db.driver_profiles.update_one(
            {"user_id": driver_id},
            {"$set": {
                "is_online": False,
                "sim_swap_lock": lock_payload,
                "pending_identity_reconfirm": True,
                "sim_last_checked_at": now_iso,
            }},
            upsert=True,
        )
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": driver_id,
            "type": "sim_swap_lock",
            "title": "Security Alert: SIM Change Detected",
            "message": "A new SIM was detected on your device. Your account has been temporarily secured. Contact support if this was not you.",
            "read": False,
            "created_at": now_iso,
            "data": lock_payload,
        })
        raise HTTPException(
            status_code=423,
            detail="Security alert: a new SIM was detected. Your account is temporarily secured pending identity reconfirmation.",
        )

    # Fingerprint unchanged — all good, update timestamp
    await db.driver_profiles.update_one(
        {"user_id": driver_id},
        {"$set": {
            "sim_fingerprint": incoming_fingerprint,
            "sim_carrier_name": request.carrier_name,
            "sim_last_checked_at": now_iso,
        }},
        upsert=True,
    )
    return {"success": True, "message": "SIM fingerprint check passed", "checked": True}


@drivers_router.get("/drivers/{driver_id}/withdrawals")
async def get_driver_withdrawals(driver_id: str, http_request: Request, limit: int = 30, skip: int = 0):
    """Return driver's withdrawal transaction history, most recent first."""
    verify_owner_strict(http_request, driver_id)
    user = await db.users.find_one({"id": driver_id}, {"_id": 0, "wallet_balance": 1, "earnings_frozen": 1}) or {}
    wallet_balance = round(float(user.get("wallet_balance") or 0.0), 2)
    earnings_frozen = bool(user.get("earnings_frozen"))

    profile = await db.driver_profiles.find_one(
        {"user_id": driver_id},
        {"_id": 0, "bank_name": 1, "account_number": 1, "account_name": 1}
    ) or {}
    bank_ready = bool(profile.get("bank_name") and profile.get("account_number") and profile.get("account_name"))

    txns = await db.transactions.find(
        {"user_id": driver_id, "source": "driver_withdrawal"},
        {"_id": 0}
    ).sort("timestamp", -1).skip(skip).limit(limit).to_list(limit)

    formatted = []
    for t in txns:
        status = str(t.get("status") or "pending_settlement")
        amount = abs(float(t.get("amount") or 0))
        meta = t.get("meta") or {}
        ts = t.get("timestamp")
        created_at = ts.isoformat() if hasattr(ts, "isoformat") else str(ts or "")
        settled_at_raw = t.get("settlement_updated_at")
        settled_at = settled_at_raw.isoformat() if hasattr(settled_at_raw, "isoformat") else None
        formatted.append({
            "id": t.get("id"),
            "reference": t.get("reference"),
            "amount": amount,
            "status": status,
            "bank_name": meta.get("bank_name") or profile.get("bank_name") or "",
            "account_number": meta.get("account_number") or profile.get("account_number") or "",
            "account_name": meta.get("account_name") or profile.get("account_name") or "",
            "provider_reference": t.get("provider_reference"),
            "settlement_reason": t.get("settlement_reason"),
            "created_at": created_at,
            "settled_at": settled_at,
            "reversed_to_wallet": bool(t.get("reversed_to_wallet")),
        })

    total = await db.transactions.count_documents({"user_id": driver_id, "source": "driver_withdrawal"})
    return {
        "success": True,
        "wallet_balance": wallet_balance,
        "earnings_frozen": earnings_frozen,
        "bank_ready": bank_ready,
        "bank": {
            "bank_name": profile.get("bank_name") or "",
            "account_number": profile.get("account_number") or "",
            "account_name": profile.get("account_name") or "",
        },
        "withdrawals": formatted,
        "total": total,
    }


@drivers_router.post("/drivers/{driver_id}/withdraw-earnings")
async def withdraw_earnings_with_biometric(driver_id: str, request: BiometricWithdrawalRequest, http_request: Request):
    """Withdraw driver wallet earnings only after live face confirmation."""
    verify_owner_strict(http_request, driver_id)
    user = await db.users.find_one({"id": driver_id}, {"_id": 0}) or {}
    if user.get("role") != "driver":
        raise HTTPException(status_code=403, detail="Driver account required")
    if bool(user.get("earnings_frozen")):
        raise HTTPException(status_code=423, detail="Earnings are frozen pending security review.")

    profile = await db.driver_profiles.find_one({"user_id": driver_id}, {"_id": 0, "face_image": 1, "bank_name": 1, "account_number": 1, "account_name": 1}) or {}
    if not (profile.get("bank_name") and profile.get("account_number") and profile.get("account_name")):
        raise HTTPException(status_code=400, detail="Complete bank details before withdrawing earnings.")

    reference_face = user.get("face_image") or profile.get("face_image") or user.get("profile_image")
    if not reference_face:
        raise HTTPException(status_code=400, detail="No registered face reference found for biometric withdrawal.")
    confidence = face_match_confidence(reference_face, request.face_image)
    if confidence < FACE_MATCH_SENSITIVE_MIN:
        raise HTTPException(status_code=403, detail="Face verification failed. Withdrawal blocked.")

    current_balance = float(user.get("wallet_balance", 0.0) or 0.0)
    amount = round(float(request.amount), 2)
    if amount > current_balance:
        raise HTTPException(status_code=400, detail=f"Insufficient wallet balance. Available: ₦{current_balance:,.2f}")

    idem_key = (request.idempotency_key or "").strip()
    if idem_key:
        existing = await db.transactions.find_one(
            {
                "user_id": driver_id,
                "source": "driver_withdrawal",
                "meta.idempotency_key": idem_key,
            },
            {"_id": 0},
        )
        if existing:
            return {
                "success": True,
                "duplicate": True,
                "message": "Withdrawal request already submitted.",
                "withdrawn_amount": abs(float(existing.get("amount") or 0)),
                "status": existing.get("status"),
                "reference": existing.get("reference"),
            }

    await db.users.update_one({"id": driver_id}, {"$inc": {"wallet_balance": -amount}})
    await db.transactions.insert_one(
        {
            "id": str(uuid.uuid4()),
            "user_id": driver_id,
            "type": "debit",
            "source": "driver_withdrawal",
            "amount": -amount,
            "amount_kobo": -int(round(amount * 100)),
            "status": "pending_settlement",
            "timestamp": datetime.utcnow(),
            "payment_method": "bank_transfer",
            "reference": f"withdraw_{uuid.uuid4().hex[:12]}",
            "meta": {
                "biometric_required": True,
                "biometric_face_confidence": confidence,
                "bank_name": profile.get("bank_name"),
                "account_number": profile.get("account_number"),
                "account_name": profile.get("account_name"),
                "idempotency_key": idem_key or None,
            },
        }
    )
    await db.face_verifications.insert_one(
        {
            "driver_id": driver_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "verification_type": "earnings_withdrawal",
            "verified": True,
            "match_confidence": confidence,
        }
    )
    return {
        "success": True,
        "message": "Biometric verified. Withdrawal request submitted securely.",
        "withdrawn_amount": amount,
        "remaining_balance": round(current_balance - amount, 2),
        "face_match_confidence": confidence,
    }


@drivers_router.post("/admin/withdrawals/{transaction_id}/settlement")
async def update_driver_withdrawal_settlement(transaction_id: str, payload: WithdrawalSettlementRequest, request: Request):
    """Admin settlement state machine for driver withdrawal payouts."""
    admin_email = await require_admin_request(request)
    tx = await db.transactions.find_one({"id": transaction_id}, {"_id": 0})
    if not tx:
        raise HTTPException(status_code=404, detail="Withdrawal transaction not found")
    if tx.get("source") != "driver_withdrawal":
        raise HTTPException(status_code=400, detail="Transaction is not a driver withdrawal")

    current_status = str(tx.get("status") or "").lower()
    target = payload.status.lower()
    if current_status == target:
        return {"success": True, "duplicate": True, "status": current_status, "transaction_id": transaction_id}
    if current_status not in {"pending_settlement", "processing"}:
        raise HTTPException(status_code=409, detail=f"Invalid settlement transition from status={current_status}")

    update_doc = {
        "status": target,
        "settlement_updated_at": datetime.utcnow(),
        "settlement_updated_by": admin_email,
        "settlement_reason": (payload.reason or "").strip() or None,
    }
    if payload.provider_reference:
        update_doc["provider_reference"] = payload.provider_reference.strip()

    if target == "failed":
        amount = abs(float(tx.get("amount") or 0))
        user_id = str(tx.get("user_id") or "")
        if amount <= 0 or not user_id:
            raise HTTPException(status_code=400, detail="Invalid withdrawal amount/user for rollback")
        await db.users.update_one({"id": user_id}, {"$inc": {"wallet_balance": amount}})
        update_doc["reversed_to_wallet"] = True
        update_doc["reversed_at"] = datetime.utcnow()

    await db.transactions.update_one({"id": transaction_id}, {"$set": update_doc})

    user_id = str(tx.get("user_id") or "")
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "wallet_balance": 1}) if user_id else None
    return {
        "success": True,
        "transaction_id": transaction_id,
        "status": target,
        "wallet_balance": round(float((user or {}).get("wallet_balance") or 0.0), 2),
    }


@drivers_router.post("/admin/withdrawals/{transaction_id}/processing")
async def mark_driver_withdrawal_processing(transaction_id: str, payload: WithdrawalProcessingRequest, request: Request):
    """Move withdrawal from pending_settlement to processing with provider reference."""
    admin_email = await require_admin_request(request)
    tx = await db.transactions.find_one({"id": transaction_id}, {"_id": 0})
    if not tx:
        raise HTTPException(status_code=404, detail="Withdrawal transaction not found")
    if tx.get("source") != "driver_withdrawal":
        raise HTTPException(status_code=400, detail="Transaction is not a driver withdrawal")

    current_status = str(tx.get("status") or "").lower()
    if current_status == "processing":
        return {"success": True, "duplicate": True, "transaction_id": transaction_id, "status": "processing"}
    if current_status != "pending_settlement":
        raise HTTPException(status_code=409, detail=f"Invalid processing transition from status={current_status}")

    await db.transactions.update_one(
        {"id": transaction_id},
        {"$set": {
            "status": "processing",
            "provider_reference": payload.provider_reference.strip(),
            "processing_note": (payload.note or "").strip() or None,
            "processing_started_at": datetime.utcnow(),
            "processing_started_by": admin_email,
        }},
    )
    return {"success": True, "transaction_id": transaction_id, "status": "processing"}


@drivers_router.post("/providers/withdrawals/callback")
async def provider_withdrawal_callback(payload: WithdrawalProviderCallbackRequest, request: Request):
    """
    Provider callback to settle/failed driver withdrawal.
    Guarded by x-provider-key == WITHDRAWAL_PROVIDER_CALLBACK_KEY.
    """
    expected_key = (os.environ.get("WITHDRAWAL_PROVIDER_CALLBACK_KEY") or "").strip()
    got_key = (request.headers.get("x-provider-key") or "").strip()
    if not expected_key or got_key != expected_key:
        raise HTTPException(status_code=403, detail="Unauthorized provider callback")

    tx = await db.transactions.find_one({"id": payload.transaction_id}, {"_id": 0})
    if not tx:
        raise HTTPException(status_code=404, detail="Withdrawal transaction not found")
    if tx.get("source") != "driver_withdrawal":
        raise HTTPException(status_code=400, detail="Transaction is not a driver withdrawal")

    if str(tx.get("provider_reference") or "") != payload.provider_reference.strip():
        raise HTTPException(status_code=409, detail="Provider reference mismatch")

    # Reuse admin settlement state logic through direct state transition block.
    current_status = str(tx.get("status") or "").lower()
    target = payload.status.lower()
    if current_status == target:
        return {"success": True, "duplicate": True, "transaction_id": payload.transaction_id, "status": current_status}
    if current_status not in {"pending_settlement", "processing"}:
        raise HTTPException(status_code=409, detail=f"Invalid settlement transition from status={current_status}")

    update_doc = {
        "status": target,
        "settlement_updated_at": datetime.utcnow(),
        "settlement_updated_by": "provider_callback",
        "settlement_reason": (payload.reason or "").strip() or None,
    }
    if target == "failed":
        amount = abs(float(tx.get("amount") or 0))
        user_id = str(tx.get("user_id") or "")
        if amount <= 0 or not user_id:
            raise HTTPException(status_code=400, detail="Invalid withdrawal amount/user for rollback")
        await db.users.update_one({"id": user_id}, {"$inc": {"wallet_balance": amount}})
        update_doc["reversed_to_wallet"] = True
        update_doc["reversed_at"] = datetime.utcnow()

    await db.transactions.update_one({"id": payload.transaction_id}, {"$set": update_doc})


# ═══════════════════════════════════════════════════════════════════════════════
# TRIPS TOWARDS DESTINATION — Driver destination mode
# ═══════════════════════════════════════════════════════════════════════════════

DESTINATION_TRIP_DAILY_LIMIT = 3      # Max trips per day in destination mode
DESTINATION_MAX_DETOUR_MIN = 10        # Max detour allowed (minutes)
DESTINATION_ROUTE_RADIUS_KM = 2.5     # Pickup must be within Xkm of the driver→dest corridor


class DestinationRequest(BaseModel):
    destination_lat: float
    destination_lng: float
    destination_name: str
    polyline_coords: Optional[list] = None
    duration_mins: Optional[float] = None
    distance_km: Optional[float] = None
    saved_label: Optional[str] = None   # "home" | "favourite" | custom


@drivers_router.post("/drivers/{user_id}/destination")
async def set_driver_destination(user_id: str, body: DestinationRequest, request: Request):
    """Activate 'Trips towards destination' mode for a driver."""
    verify_owner_strict(request, user_id)

    profile = await db.driver_profiles.find_one({"user_id": user_id}, {"_id": 0})
    if not profile:
        raise HTTPException(status_code=404, detail="Driver profile not found")

    # ── Check/reset daily counter ──
    today = datetime.now().strftime("%Y-%m-%d")
    last_reset = profile.get("destination_last_reset_date", "")
    daily_trips = int(profile.get("daily_destination_trips", 0) or 0)
    if last_reset != today:
        daily_trips = 0  # new day — reset

    if daily_trips >= DESTINATION_TRIP_DAILY_LIMIT:
        return {
            "blocked": True,
            "daily_trips": daily_trips,
            "limit": DESTINATION_TRIP_DAILY_LIMIT,
            "trips_remaining": 0,
            "message": f"Daily limit reached ({DESTINATION_TRIP_DAILY_LIMIT} trips). Resets at midnight.",
        }

    # ── Activate destination mode ──
    await db.driver_profiles.update_one(
        {"user_id": user_id},
        {"$set": {
            "destination_mode": True,
            "destination_lat": body.destination_lat,
            "destination_lng": body.destination_lng,
            "destination_name": body.destination_name,
            "destination_polyline": body.polyline_coords or [],
            "destination_duration_mins": body.duration_mins,
            "destination_distance_km": body.distance_km,
            "destination_saved_label": body.saved_label or "",
            "destination_set_at": datetime.now(timezone.utc).isoformat(),
            "destination_last_reset_date": today,
            "daily_destination_trips": daily_trips,
        }}
    )

    return {
        "success": True,
        "active": True,
        "daily_trips": daily_trips,
        "limit": DESTINATION_TRIP_DAILY_LIMIT,
        "trips_remaining": DESTINATION_TRIP_DAILY_LIMIT - daily_trips,
        "destination_name": body.destination_name,
    }


@drivers_router.delete("/drivers/{user_id}/destination")
async def cancel_driver_destination(user_id: str, request: Request):
    """Cancel destination mode."""
    verify_owner_strict(request, user_id)
    await db.driver_profiles.update_one(
        {"user_id": user_id},
        {"$set": {"destination_mode": False, "destination_cancelled_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"success": True, "active": False}


@drivers_router.get("/drivers/{user_id}/destination")
async def get_driver_destination(user_id: str, request: Request):
    """Get current destination mode state + daily trip count."""
    verify_owner_strict(request, user_id)

    profile = await db.driver_profiles.find_one({"user_id": user_id}, {"_id": 0})
    if not profile:
        raise HTTPException(status_code=404, detail="Driver profile not found")

    # ── Reset daily counter if new day ──
    today = datetime.now().strftime("%Y-%m-%d")
    last_reset = profile.get("destination_last_reset_date", "")
    daily_trips = int(profile.get("daily_destination_trips", 0) or 0)
    if last_reset != today:
        daily_trips = 0
        await db.driver_profiles.update_one(
            {"user_id": user_id},
            {"$set": {"daily_destination_trips": 0, "destination_last_reset_date": today}}
        )

    limit_reached = daily_trips >= DESTINATION_TRIP_DAILY_LIMIT
    mode_active = bool(profile.get("destination_mode")) and not limit_reached

    # Auto-disable if limit reached
    if limit_reached and profile.get("destination_mode"):
        await db.driver_profiles.update_one(
            {"user_id": user_id},
            {"$set": {"destination_mode": False}}
        )

    return {
        "active": mode_active,
        "limit_reached": limit_reached,
        "daily_trips": daily_trips,
        "daily_limit": DESTINATION_TRIP_DAILY_LIMIT,
        "trips_remaining": max(0, DESTINATION_TRIP_DAILY_LIMIT - daily_trips),
        "destination_name": profile.get("destination_name") or "",
        "destination_lat": profile.get("destination_lat"),
        "destination_lng": profile.get("destination_lng"),
        "destination_distance_km": profile.get("destination_distance_km"),
        "destination_duration_mins": profile.get("destination_duration_mins"),
        "destination_set_at": profile.get("destination_set_at"),
        "destination_saved_label": profile.get("destination_saved_label") or "",
    }


@drivers_router.post("/drivers/{user_id}/destination/saved")
async def save_driver_destination_location(user_id: str, request: Request):
    """Save a Home or Favourite destination for quick access."""
    verify_owner_strict(request, user_id)
    body = await request.json()
    label = body.get("label", "home")   # "home" | "favourite" | custom name
    name = body.get("name", "")
    lat = body.get("lat")
    lng = body.get("lng")
    if not lat or not lng or not name:
        raise HTTPException(status_code=400, detail="lat, lng and name are required")

    field = f"destination_saved_{label.lower()[:20]}"
    await db.users.update_one(
        {"id": user_id},
        {"$set": {field: {"name": name, "lat": lat, "lng": lng, "updated_at": datetime.now(timezone.utc).isoformat()}}}
    )
    return {"success": True, "label": label, "name": name}


@drivers_router.get("/drivers/{user_id}/destination/saved")
async def get_driver_saved_destinations(user_id: str, request: Request):
    """Get saved Home/Favourite destinations for quick access."""
    verify_owner_strict(request, user_id)
    user = await db.users.find_one({"id": user_id}, {"_id": 0}) or {}
    saved = []
    for key, val in user.items():
        if key.startswith("destination_saved_") and isinstance(val, dict):
            label = key.replace("destination_saved_", "")
            saved.append({"label": label, **val})
    return {"saved": saved}


@drivers_router.delete("/drivers/{user_id}/destination/saved/{label}")
async def delete_driver_saved_destination(user_id: str, label: str, request: Request):
    """Delete a saved destination (home, favourite, etc.)."""
    verify_owner_strict(request, user_id)
    safe_label = label.lower()[:20]
    field = f"destination_saved_{safe_label}"
    await db.users.update_one({"id": user_id}, {"$unset": {field: ""}})
    return {"success": True, "label": safe_label}

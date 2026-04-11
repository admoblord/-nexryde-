"""Drivers Router - Driver profile, location, documents, verification, stats, onboarding, earnings, heatmap."""
from fastapi import APIRouter, HTTPException, Form, File, UploadFile, Request
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
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
    "hacking_permit",
    "road_worthiness",
    "insurance",
    "vehicle_front",
    "vehicle_interior",
    "vehicle_ac",
}


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


async def _snapshot_approved_documents(driver_id: str, verification_id: str, approved_by: str, notes: Optional[str] = None) -> dict:
    """Create immutable approved-doc snapshot for admin recheck/audit trail."""
    archived = await db.driver_documents.find_one({"driver_id": driver_id}, {"_id": 0}) or {}
    missing = _missing_required_archived_docs(archived)
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot snapshot approved docs. Missing required archived documents: {', '.join(missing)}"
        )

    snapshot = {
        "id": str(uuid.uuid4()),
        "driver_id": driver_id,
        "verification_id": verification_id,
        "approved_by": approved_by,
        "approved_at": datetime.now(timezone.utc),
        "status": "approved",
        "notes": notes,
        "document_count": len((archived.get("documents") or {}).keys()),
        "documents": archived.get("documents") or {},
        "source_submitted_at": archived.get("submitted_at"),
    }
    await db.driver_document_audit.insert_one(snapshot)
    return snapshot

TIER_CONFIG = {
    "basic": {"name": "KODA Basic", "monthly_fee": 18000, "earning_per_ride": {"min": 200, "max": 300}},
    "premium": {"name": "KODA Premium", "monthly_fee": 18000, "earning_per_ride": {"min": 300, "max": 450}},
}


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Calculate great-circle distance in kilometers."""
    r = 6371.0
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


def _compute_visibility_score(acceptance_rate: float, completion_rate: float, rating: float, cancellations: int, completed_trips: int) -> float:
    score = (
        max(0.0, min(100.0, acceptance_rate)) * 0.35
        + max(0.0, min(100.0, completion_rate)) * 0.35
        + (max(0.0, min(5.0, rating)) / 5.0) * 100.0 * 0.20
        + (min(completed_trips, 200) / 200.0) * 100.0 * 0.10
    )
    score -= min(cancellations * 1.5, 25.0)
    return round(max(0.0, min(100.0, score)), 2)

# ==================== MODELS ====================

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

class LocationUpdate(BaseModel):
    latitude: float
    longitude: float

class DriverVerificationSubmission(BaseModel):
    user_id: str
    personal_info: dict
    vehicle_info: dict
    documents: dict

class FaceVerificationRequest(BaseModel):
    face_image: str

# ==================== DRIVER PROFILE ====================

@drivers_router.get("/drivers/{user_id}/profile")
async def get_driver_profile(user_id: str, request: Request):
    verify_owner_strict(request, user_id)
    profile = await db.driver_profiles.find_one({"user_id": user_id})
    if not profile:
        raise HTTPException(status_code=404, detail="Driver profile not found")
    profile["_id"] = str(profile["_id"])
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

@drivers_router.put("/drivers/{user_id}/location")
async def update_driver_location(user_id: str, request: LocationUpdate, http_request: Request):
    verify_owner_strict(http_request, user_id)
    await db.driver_profiles.update_one(
        {"user_id": user_id},
        {"$set": {"current_location": {"lat": request.latitude, "lng": request.longitude, "updated_at": datetime.now(timezone.utc).isoformat()}}}
    )
    return {"message": "Location updated"}

@drivers_router.put("/drivers/{user_id}/online")
async def toggle_driver_online(user_id: str, is_online: bool, request: Request):
    verify_owner_strict(request, user_id)
    if is_online:
        profile = await db.driver_profiles.find_one({"user_id": user_id})
        if not profile:
            raise HTTPException(status_code=403, detail="Complete your driver profile before going online")

        missing = []
        if not profile.get("profile_completed"):
            missing.append("driver profile")
        if not profile.get("documents_verified"):
            missing.append("document verification")
        if profile.get("verification_status") != "approved":
            missing.append("driver approval")
        if not profile.get("vehicle_model"):
            missing.append("vehicle details")
        if not profile.get("vehicle_plate") and not profile.get("vehicle_plate_number"):
            missing.append("vehicle plate number")
        if not profile.get("vehicle_type"):
            missing.append("vehicle type")
        if not profile.get("bank_name") or not profile.get("account_number"):
            missing.append("bank account details")
        if not profile.get("has_ac"):
            missing.append("AC confirmation (vehicle must have working AC)")
        if not profile.get("full_name") and not profile.get("name"):
            missing.append("full name")
        if not profile.get("address"):
            missing.append("home address")
        if not profile.get("guarantor"):
            missing.append("guarantor information")
        if profile.get("monthly_verification_complete") is False:
            missing.append("monthly compliance verification")
        try:
            from driver_compliance import check_monthly_uploads, check_driver_document_expiry
            monthly_status = await check_monthly_uploads(user_id)
            docs_status = await check_driver_document_expiry(user_id)
            if not monthly_status.get("compliant", False):
                missing.append("monthly interior/selfie verification")
            if not docs_status.get("compliant", False):
                missing.append("valid (non-expired) vehicle/legal documents")
        except Exception as compliance_error:
            logger.warning(f"Compliance pre-check warning for {user_id}: {compliance_error}")

        if missing:
            raise HTTPException(
                status_code=403,
                detail=f"Complete your registration first. Missing: {', '.join(missing)}"
            )

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
            "drivers_license": drivers_license_expiry, "vehicle_registration": vehicle_registration_expiry,
            "vehicle_license": vehicle_license_expiry, "hacking_permit": hacking_permit_expiry,
            "road_worthiness": road_worthiness_expiry, "insurance": insurance_expiry,
        }
        required_keys = [
            "nin",
            "drivers_license",
            "passport_photo",
            "vehicle_registration",
            "vehicle_license",
            "hacking_permit",
            "road_worthiness",
            "insurance",
            "vehicle_front",
            "vehicle_interior",
            "vehicle_ac",
        ]

        missing_docs = [key for key in required_keys if not doc_files.get(key)]
        if missing_docs:
            pretty = ", ".join(missing_docs).replace("_", " ")
            raise HTTPException(status_code=400, detail=f"Missing required documents: {pretty}")

        for exp_key, exp_value in expiry_map.items():
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

        doc_archive = {
            "driver_id": driver_id,
            "documents": stored_docs,
            "submitted_at": datetime.now(timezone.utc).isoformat(),
            "status": "pending_review",
            "document_count": len(stored_docs),
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
                "verification_status": "pending_review",
                "documents_verified": False,
                "documents_submitted": True,
                "document_count": len(stored_docs),
                "submitted_at": datetime.now(timezone.utc).isoformat(),
                "onboarding_step": "documents",
                "verification_fraud_flags": fraud_flags,
            }},
            upsert=True,
        )
        await db.users.update_one(
            {"id": driver_id},
            {"$set": {"documents_verified": False, "verification_status": "pending_review"}}
        )

        logger.info(f"Driver {driver_id}: {len(stored_docs)} documents archived pending admin review")
        return {
            "success": True,
            "verification_status": "pending_review",
            "driver_id": driver_id,
            "documents_stored": len(stored_docs),
            "forgery_flags": fraud_flags,
            "duplicate_hashes_count": len(duplicate_hashes),
            "message": "Documents uploaded and archived. Verification is pending admin review.",
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
        if not profile.get("documents_verified"):
            return {"step": "documents", "completed": False}
        if profile.get("verification_status") != "approved":
            return {"step": "documents", "completed": False}
        if not profile.get("profile_completed"):
            return {"step": "profile", "completed": False}

        incomplete = []
        if not profile.get("vehicle_model"):
            incomplete.append("vehicle details")
        if not profile.get("vehicle_type"):
            incomplete.append("vehicle type")
        if not profile.get("guarantor"):
            incomplete.append("guarantor information")
        if not profile.get("bank_name"):
            incomplete.append("bank account")
        if not profile.get("address"):
            incomplete.append("home address")
        if incomplete:
            return {"step": "profile", "completed": False, "missing": incomplete}

        return {"step": "approved", "completed": True, "verification_status": profile.get("verification_status", "approved"), "vehicle_registered": profile.get("vehicle_registered", False)}
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


async def _ensure_48h_trial_for_verified_driver(driver_id: str) -> Optional[datetime]:
    """Automatically grant trial once driver has completed verification stage."""
    latest = await db.subscriptions.find_one({"driver_id": driver_id}, sort=[("created_at", -1)])
    if latest:
        if latest.get("status") == "trial":
            return latest.get("trial_end_date")
        return None

    profile = await db.driver_profiles.find_one({"user_id": driver_id}, {"_id": 0}) or {}
    is_eligible = (profile.get("verification_status") == "approved") and bool(profile.get("profile_completed"))
    if not is_eligible:
        return None

    trial_start = datetime.utcnow()
    trial_end = trial_start + timedelta(hours=48)
    await db.subscriptions.insert_one({
        "id": str(uuid.uuid4()),
        "driver_id": driver_id,
        "amount": 18000,
        "tier": "city_rider",
        "status": "trial",
        "start_date": trial_start,
        "trial_end_date": trial_end,
        "trial_unlimited_city_only": True,
        "end_date": trial_end,
        "is_trial": True,
        "created_at": trial_start,
        "updated_at": trial_start,
    })
    await db.driver_profiles.update_one(
        {"user_id": driver_id},
        {"$set": {"subscription_active": True, "subscription_expiry": trial_end}},
    )
    await db.users.update_one(
        {"id": driver_id},
        {"$set": {"subscription_active": True, "subscription_expiry": trial_end}},
    )
    logger.info(f"48-hour trial auto-activated for verified driver={driver_id}")
    return trial_end

@drivers_router.post("/drivers/complete-profile")
async def complete_driver_profile(request: dict, http_request: Request):
    try:
        driver_id = request.get("driver_id")
        if not driver_id:
            raise HTTPException(status_code=400, detail="driver_id is required")
        verify_owner_strict(http_request, driver_id)
        existing_profile = await db.driver_profiles.find_one({"user_id": driver_id}) or {}
        if not existing_profile.get("documents_verified") or existing_profile.get("verification_status") != "approved":
            raise HTTPException(
                status_code=403,
                detail="Driver documents must be approved before profile completion and trial activation."
            )

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
        missing = [label for field, label in required_fields.items() if not request.get(field, "").strip()]
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
        profile_update = {k: v for k, v in {
            "full_name": request.get("full_name"), "phone": request.get("phone"), "email": request.get("email"),
            "address": request.get("address"), "city": request.get("city"), "state": request.get("state"),
            "state_of_origin": request.get("state_of_origin"),
            "date_of_birth": request.get("date_of_birth"), "emergency_contact": request.get("emergency_contact"),
            "guarantor": guarantor_data if isinstance(guarantor_data, dict) else None,
            "bank_name": request.get("bank_name"), "account_number": request.get("account_number"), "account_name": request.get("account_name"),
            "vehicle_type": request.get("vehicle_type"), "vehicle_make": request.get("vehicle_make"), "vehicle_model": request.get("vehicle_model"),
            "vehicle_year": request.get("vehicle_year"), "vehicle_plate_number": request.get("vehicle_plate_number"), "vehicle_color": request.get("vehicle_color"),
            "has_ac": bool(request.get("has_ac", False)),
            "vehicle_registered": True, "profile_completed": True, "onboarding_step": "approved", "verification_status": "approved",
            "profile_completed_at": datetime.now(timezone.utc).isoformat(),
        }.items() if v is not None}
        await db.driver_profiles.update_one({"user_id": driver_id}, {"$set": profile_update}, upsert=True)
        await db.users.update_one({"id": driver_id}, {"$set": {"is_verified": True, "profile_completed": True, "onboarding_complete": True}})
        trial_end = await _ensure_48h_trial_for_verified_driver(driver_id)
        user = await db.users.find_one({"id": driver_id})
        if user:
            user["_id"] = str(user["_id"])
            user["onboarding_complete"] = True
        return {"success": True, "user": user, "trial_activated": bool(trial_end), "trial_expires_at": trial_end.isoformat() if isinstance(trial_end, datetime) else None, "message": "Profile completed! 48-hour unlimited city-rides trial activated."}
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
        drivers = await db.driver_profiles.find(query).to_list(100)
        available = []
        for driver in drivers:
            subscription = await db.subscriptions.find_one({"driver_id": driver.get("user_id"), "status": {"$in": ["active", "trial", "grace_period"]}})
            if subscription:
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
    completed_trips = await db.trips.count_documents({"driver_id": user_id, "status": "completed"})
    pipeline = [{"$match": {"driver_id": user_id, "status": "completed"}}, {"$group": {"_id": None, "total": {"$sum": "$fare"}}}]
    earnings_result = await db.trips.aggregate(pipeline).to_list(1)
    total_earnings = earnings_result[0]["total"] if earnings_result else 0
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    today_pipeline = [{"$match": {"driver_id": user_id, "status": "completed", "completed_at": {"$gte": today_start}}}, {"$group": {"_id": None, "total": {"$sum": "$fare"}}}]
    today_result = await db.trips.aggregate(today_pipeline).to_list(1)
    today_earnings = today_result[0]["total"] if today_result else 0
    week_start = datetime.utcnow() - timedelta(days=7)
    weekly_trips = await db.trips.count_documents({"driver_id": user_id, "status": "completed", "completed_at": {"$gte": week_start}})
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
            "documents_approved_at": datetime.now(timezone.utc).isoformat(),
            "nin_verified": True,
            "license_uploaded": True,
            "vehicle_docs_uploaded": True,
            "selfie_verified": True,
            "vehicle_type": vehicle_info.get("vehicleMake"),
            "vehicle_model": vehicle_info.get("vehicleModel"),
            "vehicle_plate": vehicle_info.get("plateNumber"),
            "vehicle_color": vehicle_info.get("vehicleColor"),
            "onboarding_step": next_onboarding_step,
            "approved_documents_snapshot_id": snapshot.get("id"),
        }},
        upsert=True
    )
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

@drivers_router.get("/admin/verifications")
async def admin_get_verifications(request: Request, status: str = None, limit: int = 100, skip: int = 0):
    await require_admin_request(request)
    query = {"status": status} if status else {}
    verifications = await db.driver_verifications.find(query, {"_id": 0}).sort("submitted_at", -1).skip(skip).limit(limit).to_list(limit)
    enriched = []
    for v in verifications:
        user = await db.users.find_one({"id": v.get("user_id")}, {"name": 1, "phone": 1, "_id": 0})
        latest_snapshot = await db.driver_document_audit.find_one(
            {"driver_id": v.get("user_id"), "verification_id": v.get("id")},
            {"_id": 0, "id": 1, "approved_at": 1, "document_count": 1},
            sort=[("approved_at", -1)],
        )
        ai_result = v.get("ai_verification_result") or {}
        enriched.append({
            **v,
            "user_name": user.get("name") if user else "Unknown",
            "user_phone": user.get("phone") if user else "Unknown",
            "approved_documents_snapshot": latest_snapshot,
            "review_metrics": {
                "confidence": ai_result.get("confidence"),
                "risk_score": ai_result.get("risk_score"),
                "face_id_match_score": ai_result.get("face_id_match_score"),
                "fraud_flags_count": len(ai_result.get("fraud_flags") or []),
                "mismatches_count": len(ai_result.get("mismatches") or []),
            },
        })
    counts = {s: await db.driver_verifications.count_documents({"status": s}) for s in ["pending", "under_review", "approved", "rejected"]}
    counts["total"] = sum(counts.values())
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
async def admin_approve_verification(verification_id: str, request: Request, notes: str = None):
    admin_email = await require_admin_request(request)
    verification = await db.driver_verifications.find_one({"id": verification_id})
    if not verification:
        raise HTTPException(status_code=404, detail="Verification not found")
    user_id = verification.get("user_id")
    if not user_id:
        raise HTTPException(status_code=400, detail="Verification record missing user_id")

    archived = await db.driver_documents.find_one({"driver_id": user_id}) or {}
    missing = _missing_required_archived_docs(archived)
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot approve. Missing required archived documents: {', '.join(missing)}"
        )

    snapshot = await _snapshot_approved_documents(
        driver_id=user_id,
        verification_id=verification_id,
        approved_by=admin_email or "admin",
        notes=notes,
    )

    await db.driver_verifications.update_one({"id": verification_id}, {"$set": {"status": "approved", "reviewed_at": datetime.now(timezone.utc), "reviewed_by": admin_email or "admin", "notes": notes}})
    await _append_verification_audit_event(
        driver_id=user_id,
        verification_id=verification_id,
        action="approved",
        actor_type="admin",
        actor_id=admin_email or "admin",
        details={"notes": notes},
    )
    profile = await db.driver_profiles.find_one({"user_id": user_id}) or {}
    next_onboarding_step = "approved" if profile.get("profile_completed") else "profile"
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"verification_status": "approved", "documents_verified": True}}
    )
    await db.driver_profiles.update_one(
        {"user_id": user_id},
        {"$set": {
            "documents_verified": True,
            "verification_status": "approved",
            "documents_approved_at": datetime.now(timezone.utc).isoformat(),
            "nin_verified": True,
            "license_uploaded": True,
            "vehicle_docs_uploaded": True,
            "selfie_verified": True,
            "vehicle_type": verification.get("vehicle_info", {}).get("vehicleMake"),
            "vehicle_model": verification.get("vehicle_info", {}).get("vehicleModel"),
            "vehicle_plate": verification.get("vehicle_info", {}).get("plateNumber"),
            "vehicle_color": verification.get("vehicle_info", {}).get("vehicleColor"),
            "onboarding_step": next_onboarding_step,
            "approved_documents_snapshot_id": snapshot.get("id"),
        }},
        upsert=True
    )
    await _ensure_48h_trial_for_verified_driver(user_id)
    return {"success": True, "message": "Driver verification approved"}

@drivers_router.post("/admin/verifications/{verification_id}/reject")
async def admin_reject_verification(verification_id: str, request: Request, reason: str = "Documents do not meet requirements"):
    admin_email = await require_admin_request(request)
    verification = await db.driver_verifications.find_one({"id": verification_id})
    if not verification:
        raise HTTPException(status_code=404, detail="Verification not found")
    await db.driver_verifications.update_one({"id": verification_id}, {"$set": {"status": "rejected", "reviewed_at": datetime.now(timezone.utc), "reviewed_by": admin_email or "admin", "rejection_reason": reason}})
    await db.users.update_one({"id": verification.get("user_id")}, {"$set": {"verification_status": "rejected"}})
    await _append_verification_audit_event(
        driver_id=verification.get("user_id"),
        verification_id=verification_id,
        action="rejected",
        actor_type="admin",
        actor_id=admin_email or "admin",
        details={"reason": reason},
    )
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
    """Admin recheck endpoint for one approved verification snapshot."""
    await require_admin_request(request)
    projection = {"_id": 0}
    if not include_data:
        projection["documents.data"] = 0

    snapshot = await db.driver_document_audit.find_one(
        {"verification_id": verification_id, "status": "approved"},
        projection,
        sort=[("approved_at", -1)],
    )
    if not snapshot:
        raise HTTPException(status_code=404, detail="No approved document snapshot found for this verification")
    return snapshot


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

@drivers_router.get("/driver/heatmap")
async def get_heatmap(lat: float = None, lng: float = None, city: str = None):
    from routers.ai_features import detect_city
    import random
    loc = detect_city(lat, lng, city)
    city_name = loc["city"]
    base_lat, base_lng = loc["lat"], loc["lng"]
    zones_data = loc["zones"]
    random.seed(int(datetime.utcnow().hour))
    zones = []
    for i, zone_name in enumerate(zones_data):
        offset_lat = random.uniform(-0.05, 0.05)
        offset_lng = random.uniform(-0.05, 0.05)
        intensity = round(random.uniform(0.5, 0.95), 2)
        surge = round(1.0 + random.uniform(0, 0.5), 1)
        zones.append({"lat": round(base_lat + offset_lat, 4), "lng": round(base_lng + offset_lng, 4), "intensity": intensity, "zone_name": zone_name, "surge_multiplier": surge, "demand_level": "very_high" if intensity > 0.8 else "high" if intensity > 0.6 else "medium"})
    return {"city": city_name, "zones": zones, "updated_at": datetime.utcnow().isoformat(), "recommendation": f"Head to {zones[0]['zone_name']} for best earnings" if zones else "No data available"}


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

@drivers_router.get("/driver/earnings/{driver_id}")
async def get_driver_earnings_dashboard(driver_id: str, request: Request, period: str = "today"):
    verify_owner_strict(request, driver_id)
    now = datetime.utcnow()
    if period == "today":
        start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == "week":
        start_date = now - timedelta(days=7)
    elif period == "month":
        start_date = now - timedelta(days=30)
    else:
        start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
    trips = await db.trips.find({"driver_id": driver_id, "status": "completed", "completed_at": {"$gte": start_date}}).to_list(500)
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
    hours_worked = (now - start_date).total_seconds() / 3600
    projected_daily = (total_earnings / hours_worked * 10) if hours_worked > 0 and period == "today" else total_earnings / max(1, (now - start_date).days)
    return {"driver_id": driver_id, "period": period, "tier": {"name": tier_config["name"], "earning_potential": tier_config["earning_per_ride"], "monthly_fee": tier_config["monthly_fee"]}, "summary": {"total_earnings": total_earnings, "total_trips": total_trips, "total_distance_km": round(total_distance, 1), "total_time_mins": total_time, "traffic_compensation": traffic_compensation, "keep_percentage": 100}, "averages": {"per_trip": round(avg_per_trip, 2), "per_km": round(avg_per_km, 2), "hourly": round(total_earnings / (total_time / 60), 2) if total_time > 0 else 0}, "projections": {"daily": round(projected_daily, 2), "weekly": round(projected_daily * 6, 2), "monthly": round(projected_daily * 24, 2)}, "daily_breakdown": daily_breakdown, "commission_message": "You keep 100% of all earnings. Riders pay you directly."}


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


@drivers_router.post("/drivers/{driver_id}/verify-bank")
async def verify_bank_account(driver_id: str, request: dict, http_request: Request):
    """Attempt to verify bank account name. Returns account_name if found."""
    verify_owner_strict(http_request, driver_id)
    return {"account_name": None, "message": "Manual entry required"}

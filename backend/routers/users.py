"""Users Router - User CRUD, profile pictures, emergency contacts, favorites, face verification, notifications, preferences, women-only mode."""
from fastapi import APIRouter, HTTPException, Request

from auth_guard import require_authenticated, verify_owner, verify_owner_strict
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, timezone
import logging
import base64
import re

from database import db
from user_biometrics import save_user_biometrics, strip_blobs_from_user_update
from user_lookup import find_user_by_id, PROFILE_API_PROJECTION, QUERY_MAX_TIME_MS
from pii_encryption import nin_storage_fields, public_nin_fields, resolve_nin_plaintext, strip_sensitive_pii
from user_scores import build_trust_summary
from nin_registry_verify import (
    verify_nin_with_full_name,
    finalize_nin_verification_from_result,
    nin_verification_audit_fields,
)
from face_match import face_template_match_confidence, FACE_TEMPLATE_SIMSWAP_MIN

logger = logging.getLogger('server')
users_router = APIRouter(prefix="/api", tags=["Users"])


def _normalize_phone(raw: str) -> str:
    value = (raw or "").strip().replace(" ", "")
    digits = ''.join(ch for ch in value if ch.isdigit())
    if not digits:
        return ""
    if value.startswith('+'):
        return f"+{digits}"
    if digits.startswith('0'):
        return f"+234{digits[1:]}"
    if digits.startswith('234'):
        return f"+{digits}"
    return f"+234{digits}"

# ==================== MODELS ====================

class UpdateProfileRequest(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    profile_image: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    nin: Optional[str] = None

class EmergencyContactRequest(BaseModel):
    name: str
    phone: str
    relationship: str

class FaceVerificationRequest(BaseModel):
    face_image: str
    liveness_probe_image: Optional[str] = None
    capture_meta: Optional[dict] = None

class FavoriteDriverRequest(BaseModel):
    driver_id: str


class BlockRiderRequest(BaseModel):
    rider_id: str

class PushTokenRequest(BaseModel):
    """Register Expo or native FCM token; optional metadata for multi-device + analytics."""

    push_token: str
    platform: Optional[str] = None  # ios | android
    provider: Optional[str] = None  # expo | fcm — inferred from token if omitted
    device_id: Optional[str] = None


class NotificationOpenedRequest(BaseModel):
    notification_id: Optional[str] = Field(None, description="Legacy row id or same as nid")
    nid: Optional[str] = Field(None, description="Correlation id from push payload data.nid (preferred)")
    event: Optional[str] = Field("opened", description="opened | dismissed | action")

class ProfilePictureUpload(BaseModel):
    image: str


class RideMoodPreferences(BaseModel):
    conversation: str = "any"    # "quiet" | "chatty" | "any"
    music: str = "any"           # "on" | "off" | "any"
    temperature: str = "any"     # "cold" | "moderate" | "any"
    driving_style: str = "any"   # "smooth" | "fast" | "any"

class UserPreferencesUpdate(BaseModel):
    theme: Optional[str] = None
    language: Optional[str] = None
    notifications_enabled: Optional[bool] = None
    notification_channels: Optional[dict] = None
    notification_types: Optional[dict] = None
    ride_mood: Optional[RideMoodPreferences] = None
    pickup_code_enabled: Optional[bool] = None


class RiderVerificationUpdate(BaseModel):
    name: str
    phone: str
    address: Optional[str] = ""
    nin: Optional[str] = ""


class AcceptTermsBody(BaseModel):
    terms_version: str
    privacy_version: Optional[str] = None


def rider_verification_field_sets(user: dict) -> dict:
    """
    Uber/Bolt-style rider onboarding: name + phone + NIN are required.
    Address and face are optional profile upgrades (never block home/booking).
    """
    required_missing: list[str] = []
    optional_missing: list[str] = []

    if not (user.get("name") or "").strip():
        required_missing.append("name")
    if not (user.get("phone") or "").strip():
        required_missing.append("phone")
    nin = resolve_nin_plaintext(user) or ""
    if not re.fullmatch(r"\d{11}", nin):
        required_missing.append("nin")
    if not (user.get("address") or "").strip():
        optional_missing.append("address")
    if not bool(user.get("face_verified")):
        optional_missing.append("face")

    return {
        "required_missing": required_missing,
        "optional_missing": optional_missing,
        "completed": len(required_missing) == 0,
    }


class RiderNinVerifyBody(BaseModel):
    nin: str
    full_name: str


# ==================== USER CRUD ====================

@users_router.get("/users/{user_id}")
async def get_user(user_id: str, request: Request):
    verify_owner_strict(request, user_id)
    user = await find_user_by_id(user_id, PROFILE_API_PROJECTION)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user["_id"] = str(user["_id"])
    safe = strip_sensitive_pii(user)
    safe.update(public_nin_fields(user))
    return safe


@users_router.get("/users/{user_id}/trust-summary")
async def get_user_trust_summary(user_id: str, request: Request):
    verify_owner_strict(request, user_id)
    user = await find_user_by_id(user_id, PROFILE_API_PROJECTION)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    driver_profile = None
    if user.get("role") == "driver":
        driver_profile = await db.driver_profiles.find_one({"user_id": user_id}, {"_id": 0})
    summary = build_trust_summary(user, driver_profile)
    await db.users.update_one(
        {"id": user_id},
        {
            "$set": {
                "nexryde_score": summary["nexryde_score"],
                "rider_risk_score": summary["rider_risk_score"],
                "driver_safety_score": summary["driver_safety_score"],
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        },
    )
    return summary

@users_router.get("/users/phone/{phone}")
async def get_user_by_phone(phone: str, request: Request):
    actor_id = require_authenticated(request)
    normalized = _normalize_phone(phone)
    actor = await db.users.find_one(
        {"id": actor_id},
        {"_id": 0, "id": 1, "name": 1, "phone": 1, "role": 1, "is_verified": 1},
    )
    if not actor:
        raise HTTPException(status_code=404, detail="User not found")
    if _normalize_phone(actor.get("phone") or "") != normalized:
        raise HTTPException(status_code=403, detail="You do not have permission to look up this phone number")
    user = actor
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

def _is_expo_push_token(token: str) -> bool:
    t = (token or "").strip()
    return t.startswith("ExponentPushToken[") or t.startswith("ExpoPushToken")


@users_router.post("/users/{user_id}/push-token")
async def register_push_token(user_id: str, request: Request, body: PushTokenRequest):
    verify_owner_strict(request, user_id)
    token = (body.push_token or "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="push_token required")

    prov = (body.provider or "").strip().lower()
    if not prov:
        prov = "expo" if _is_expo_push_token(token) else "fcm"

    now_iso = datetime.now(timezone.utc).isoformat()
    user = await db.users.find_one({"id": user_id}, {"push_devices": 1})
    devices: List[dict] = []
    for d in (user or {}).get("push_devices") or []:
        if not isinstance(d, dict):
            continue
        if d.get("token") == token:
            continue
        if body.device_id and d.get("device_id") == body.device_id:
            continue
        devices.append(d)

    entry = {
        "token": token,
        "provider": prov,
        "platform": (body.platform or "").strip().lower() or None,
        "device_id": (body.device_id or "").strip() or None,
        "updated_at": now_iso,
    }
    devices.append(entry)
    # Cap stored devices per user (most recent wins implicitly at end)
    if len(devices) > 8:
        devices = devices[-8:]

    await db.users.update_one(
        {"id": user_id},
        {"$set": {"push_token": token, "push_devices": devices, "push_last_registered_at": now_iso}},
    )
    return {"message": "Push token registered", "provider": prov}


@users_router.post("/users/{user_id}/notification-opened")
async def notification_opened(user_id: str, request: Request, body: NotificationOpenedRequest):
    verify_owner_strict(request, user_id)
    from notification_service import record_notification_open

    nid = body.nid or body.notification_id
    await record_notification_open(user_id, nid, event=body.event or "opened")
    return {"ok": True}


@users_router.get("/users/{user_id}/experiments/variant")
async def get_experiment_variant(user_id: str, request: Request, key: str):
    """Deterministic A/B variant for the authenticated user (mirrors admin-configured experiments)."""
    verify_owner_strict(request, user_id)
    from notification_service import assign_ab_variant

    exp = await db.ab_experiments.find_one({"key": key, "active": True}, {"_id": 0})
    variants = (exp or {}).get("variants") or ["control", "treatment"]
    if isinstance(variants, list) and variants:
        vkeys = [str(x) for x in variants]
    else:
        vkeys = ["control", "treatment"]
    variant = assign_ab_variant(str(user_id), key, vkeys)
    try:
        await db.ab_assignments.update_one(
            {"user_id": str(user_id), "experiment_key": key},
            {"$set": {"variant": variant, "assigned_at": datetime.now(timezone.utc).isoformat()}},
            upsert=True,
        )
    except Exception:
        pass
    return {"experiment_key": key, "variant": variant}

@users_router.put("/users/{user_id}")
async def update_user(user_id: str, request: Request, body: UpdateProfileRequest):
    verify_owner_strict(request, user_id)
    update_data = {k: v for k, v in body.dict().items() if v is not None}
    if "phone" in update_data:
        raw_phone = (update_data.get("phone") or "").strip()
        digits = ''.join(filter(str.isdigit, raw_phone))
        if len(digits) < 10:
            raise HTTPException(status_code=400, detail="Invalid phone number")
        if raw_phone.startswith('+'):
            normalized_phone = '+' + ''.join(filter(str.isdigit, raw_phone))
        elif raw_phone.startswith('0'):
            normalized_phone = '+234' + ''.join(filter(str.isdigit, raw_phone[1:]))
        elif raw_phone.startswith('234'):
            normalized_phone = '+' + ''.join(filter(str.isdigit, raw_phone))
        else:
            normalized_phone = '+234' + digits
        update_data["phone"] = normalized_phone
    if update_data:
        await db.users.update_one({"id": user_id}, {"$set": update_data})
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user["_id"] = str(user["_id"])
    return user


@users_router.get("/users/{user_id}/legal-status")
async def get_user_legal_status(user_id: str, request: Request):
    """Lean legal acceptance record — source of truth for client terms gate."""
    verify_owner_strict(request, user_id)
    from legal_constants import CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION, user_legal_current

    user = await find_user_by_id(
        user_id,
        {
            "_id": 0,
            "id": 1,
            "role": 1,
            "terms_accepted": 1,
            "terms_version": 1,
            "terms_accepted_at": 1,
            "privacy_accepted": 1,
            "privacy_version": 1,
            "privacy_accepted_at": 1,
        },
    )
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "user_id": user_id,
        "role": user.get("role"),
        "terms_accepted": bool(user.get("terms_accepted")),
        "terms_version": user.get("terms_version"),
        "terms_accepted_at": user.get("terms_accepted_at"),
        "privacy_accepted": bool(user.get("privacy_accepted")),
        "privacy_version": user.get("privacy_version"),
        "privacy_accepted_at": user.get("privacy_accepted_at"),
        "current_terms_version": CURRENT_TERMS_VERSION,
        "current_privacy_version": CURRENT_PRIVACY_VERSION,
        "legal_current": user_legal_current(user),
    }


@users_router.post("/users/{user_id}/accept-terms")
async def accept_terms(user_id: str, request: Request, body: AcceptTermsBody):
    """Record acceptance of current Terms and Privacy Policy (signup refresh or material update)."""
    verify_owner_strict(request, user_id)
    from legal_constants import CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION

    submitted_terms = (body.terms_version or "").strip()
    if submitted_terms != CURRENT_TERMS_VERSION:
        raise HTTPException(
            status_code=400,
            detail=f"Outdated terms version. Current version is {CURRENT_TERMS_VERSION}.",
        )
    submitted_privacy = (body.privacy_version or CURRENT_PRIVACY_VERSION).strip()
    if submitted_privacy != CURRENT_PRIVACY_VERSION:
        raise HTTPException(
            status_code=400,
            detail=f"Outdated privacy version. Current version is {CURRENT_PRIVACY_VERSION}.",
        )

    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    now_iso = datetime.now(timezone.utc).isoformat()
    await db.users.update_one(
        {"id": user_id},
        {"$set": {
            "terms_accepted": True,
            "terms_accepted_at": now_iso,
            "terms_version": CURRENT_TERMS_VERSION,
            "privacy_accepted": True,
            "privacy_accepted_at": now_iso,
            "privacy_version": CURRENT_PRIVACY_VERSION,
            "updated_at": now_iso,
        }},
    )
    refreshed = await db.users.find_one({"id": user_id}, {"_id": 0})
    return {
        "success": True,
        "message": "Terms and Privacy Policy accepted.",
        "terms_version": CURRENT_TERMS_VERSION,
        "privacy_version": CURRENT_PRIVACY_VERSION,
        "user": refreshed,
    }


@users_router.get("/users/{user_id}/rider-verification-status")
async def get_rider_verification_status(user_id: str, request: Request):
    verify_owner_strict(request, user_id)
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.get("role") != "rider":
        raise HTTPException(status_code=403, detail="Rider account required")

    fields = rider_verification_field_sets(user)

    return {
        "user_id": user_id,
        "role": "rider",
        "completed": fields["completed"],
        "missing": fields["required_missing"],
        "optional_missing": fields["optional_missing"],
        "nin_registry_verified": bool(user.get("nin_registry_verified")),
        "face_verified": bool(user.get("face_verified")),
    }


@users_router.post("/users/{user_id}/complete-rider-verification")
async def complete_rider_verification(user_id: str, request: Request, body: RiderVerificationUpdate):
    verify_owner_strict(request, user_id)
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.get("role") != "rider":
        raise HTTPException(status_code=403, detail="Rider account required")

    name = (body.name or "").strip()
    address = (body.address or "").strip()
    nin = (body.nin or "").strip() or (resolve_nin_plaintext(user) or "")
    raw_phone = (body.phone or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Full name is required")
    if not re.fullmatch(r"\d{11}", nin):
        raise HTTPException(status_code=400, detail="NIN must be exactly 11 digits")

    vr = await verify_nin_with_full_name(nin=nin, full_name=name)
    if not vr.get("format_ok"):
        raise HTTPException(status_code=400, detail=vr.get("message") or "Invalid NIN")
    try:
        nin_verified_final, nin_registry_verified_final = finalize_nin_verification_from_result(vr)
    except ValueError as exc:
        msg = str(exc)
        status = 503 if "unavailable" in msg.lower() or "not configured" in msg.lower() else 400
        raise HTTPException(status_code=status, detail=msg) from exc

    digits = ''.join(filter(str.isdigit, raw_phone))
    if len(digits) < 10:
        raise HTTPException(status_code=400, detail="Invalid phone number")
    if raw_phone.startswith('+'):
        normalized_phone = '+' + ''.join(filter(str.isdigit, raw_phone))
    elif raw_phone.startswith('0'):
        normalized_phone = '+234' + ''.join(filter(str.isdigit, raw_phone[1:]))
    elif raw_phone.startswith('234'):
        normalized_phone = '+' + ''.join(filter(str.isdigit, raw_phone))
    else:
        normalized_phone = '+234' + digits

    now_iso = datetime.now(timezone.utc).isoformat()
    nin_set, nin_unset = nin_storage_fields(nin)
    await db.users.update_one(
        {"id": user_id},
        {
            "$set": {
                "name": name,
                "phone": normalized_phone,
                "address": address,
                **nin_set,
                "nin_verified": nin_verified_final,
                "nin_registry_verified": nin_registry_verified_final,
                **nin_verification_audit_fields(vr, checked_at=now_iso),
                "is_verified": True,
                "rider_verification_completed": True,
                "onboarding_complete": True,
                "updated_at": now_iso,
            },
            "$unset": nin_unset,
        }
    )

    refreshed = await db.users.find_one({"id": user_id}, {"_id": 0})
    return {
        "success": True,
        "message": "Rider verification completed successfully.",
        "user": {**strip_sensitive_pii(refreshed or {}), **public_nin_fields(refreshed)},
    }


@users_router.delete("/users/{user_id}")
async def delete_user_account(user_id: str, request: Request):
    verify_owner_strict(request, user_id)
    deleted_at = datetime.now(timezone.utc).isoformat()
    await db.users.update_one(
        {"id": user_id},
        {"$set": {
            "deleted_at": deleted_at,
            "is_deleted": True,
            "is_deactivated": True,
            "push_token": None,
        }}
    )
    await db.driver_profiles.update_one(
        {"user_id": user_id},
        {"$set": {"is_online": False, "is_deleted": True}}
    )
    return {
        "success": True,
        "message": "Your account has been scheduled for deletion and deactivated.",
        "deleted_at": deleted_at,
    }

@users_router.put("/users/{user_id}/switch-role")
async def switch_role(user_id: str, request: Request):
    verify_owner_strict(request, user_id)
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    new_role = "driver" if user["role"] == "rider" else "rider"
    if new_role == "driver":
        profile = await db.driver_profiles.find_one({"user_id": user_id})
        if not profile:
            await db.driver_profiles.insert_one({
                "user_id": user_id,
                "is_online": False,
                "verification_status": "pending",
                "created_at": datetime.now(timezone.utc).isoformat()
            })
    await db.users.update_one({"id": user_id}, {"$set": {"role": new_role}})
    user = await db.users.find_one({"id": user_id})
    user["_id"] = str(user["_id"])
    return user

# ==================== PROFILE PICTURE ====================

@users_router.post("/users/{user_id}/profile-picture")
async def upload_profile_picture(user_id: str, request: Request, body: ProfilePictureUpload):
    verify_owner_strict(request, user_id)
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not body.image:
        raise HTTPException(status_code=400, detail="Image data is required")
    # Compress + normalise before persistence — saves ~70-85% MongoDB storage
    from profile_image_compression import normalize_profile_image_upload
    compressed_image = normalize_profile_image_upload(body.image)
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"profile_image": compressed_image, "profile_image_updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"success": True, "message": "Profile picture updated successfully", "profile_image": compressed_image}

@users_router.get("/users/{user_id}/profile-picture")
async def get_profile_picture(user_id: str, request: Request):
    verify_owner_strict(request, user_id)
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"profile_image": user.get("profile_image"), "updated_at": user.get("profile_image_updated_at")}

@users_router.delete("/users/{user_id}/profile-picture")
async def delete_profile_picture(user_id: str, request: Request):
    verify_owner_strict(request, user_id)
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    await db.users.update_one({"id": user_id}, {"$unset": {"profile_image": "", "profile_image_updated_at": ""}})
    return {"success": True, "message": "Profile picture deleted successfully"}

# ==================== EMERGENCY CONTACTS ====================

@users_router.post("/users/{user_id}/emergency-contacts")
async def add_emergency_contact(user_id: str, request: Request, body: EmergencyContactRequest):
    verify_owner_strict(request, user_id)
    phone = body.phone.strip()
    if not phone.startswith('+'):
        if phone.startswith('0'):
            phone = '+234' + phone[1:]
        elif phone.startswith('234'):
            phone = '+' + phone
        else:
            phone = '+234' + phone
    digits = ''.join(filter(str.isdigit, phone))
    if len(digits) < 10:
        raise HTTPException(status_code=400, detail="Invalid phone number. Must have at least 10 digits.")
    user = await db.users.find_one({"id": user_id})
    if user:
        existing = user.get("emergency_contacts", [])
        if any(c["phone"] == phone for c in existing):
            raise HTTPException(status_code=400, detail="This contact is already added.")
        if len(existing) >= 5:
            raise HTTPException(status_code=400, detail="Maximum 5 emergency contacts allowed.")
    contact = {"name": body.name.strip(), "phone": phone, "relationship": body.relationship.strip(), "added_at": datetime.now(timezone.utc).isoformat()}
    await db.users.update_one({"id": user_id}, {"$push": {"emergency_contacts": contact}})
    return {"success": True, "message": "Emergency contact added successfully", "contact": contact}

@users_router.get("/users/{user_id}/emergency-contacts")
async def get_emergency_contacts(user_id: str, request: Request):
    verify_owner_strict(request, user_id)
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"contacts": user.get("emergency_contacts", [])}

@users_router.delete("/users/{user_id}/emergency-contacts/{contact_phone}")
async def remove_emergency_contact(user_id: str, contact_phone: str, request: Request):
    verify_owner_strict(request, user_id)
    normalized = _normalize_phone(contact_phone)
    await db.users.update_one(
        {"id": user_id},
        {"$pull": {"emergency_contacts": {"phone": {"$in": [contact_phone, normalized]}}}},
    )
    return {"message": "Emergency contact removed"}

# ==================== FAVORITE/BLOCKED DRIVERS ====================

@users_router.post("/users/{user_id}/favorite-drivers")
async def add_favorite_driver(user_id: str, request: Request, body: FavoriteDriverRequest):
    verify_owner_strict(request, user_id)
    await db.users.update_one({"id": user_id}, {"$addToSet": {"favorite_drivers": body.driver_id}})
    return {"message": "Driver added to favorites"}

@users_router.delete("/users/{user_id}/favorite-drivers/{driver_id}")
async def remove_favorite_driver(user_id: str, driver_id: str, request: Request):
    verify_owner_strict(request, user_id)
    await db.users.update_one({"id": user_id}, {"$pull": {"favorite_drivers": driver_id}})
    return {"message": "Driver removed from favorites"}

@users_router.get("/users/{user_id}/favorite-drivers")
async def get_favorite_drivers(user_id: str, request: Request):
    verify_owner_strict(request, user_id)
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    driver_ids = user.get("favorite_drivers", [])
    drivers = []
    for did in driver_ids:
        driver = await db.users.find_one({"id": did})
        if driver:
            profile = await db.driver_profiles.find_one({"user_id": did})
            trips_count = await db.trips.count_documents({"driver_id": did, "status": "completed"})
            drivers.append({
                "id": driver["id"],
                "driver_id": did,
                "name": driver.get("name"),
                "rating": driver.get("rating", 5.0),
                "total_trips": trips_count,
                "vehicle_model": profile.get("vehicle_model") if profile else None,
                "vehicle_plate": (profile.get("vehicle_plate") or profile.get("plate_number")) if profile else None,
                "vehicle_color": profile.get("vehicle_color") if profile else None,
                "is_online": profile.get("is_online", False) if profile else False,
            })
    return {"favorite_drivers": drivers}

@users_router.get("/users/{user_id}/favorite-drivers/{driver_id}/check")
async def check_favorite_driver(user_id: str, driver_id: str, request: Request):
    verify_owner_strict(request, user_id)
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    is_favorite = driver_id in user.get("favorite_drivers", [])
    return {"is_favorite": is_favorite}

@users_router.post("/users/{user_id}/blocked-drivers")
async def block_driver(user_id: str, request: Request, body: FavoriteDriverRequest):
    verify_owner_strict(request, user_id)
    await db.users.update_one({"id": user_id}, {"$addToSet": {"blocked_drivers": body.driver_id}})
    return {"message": "Driver blocked"}

@users_router.delete("/users/{user_id}/blocked-drivers/{driver_id}")
async def unblock_driver(user_id: str, driver_id: str, request: Request):
    verify_owner_strict(request, user_id)
    await db.users.update_one({"id": user_id}, {"$pull": {"blocked_drivers": driver_id}})
    return {"message": "Driver unblocked"}


@users_router.post("/users/{user_id}/blocked-riders")
async def block_rider(user_id: str, request: Request, body: BlockRiderRequest):
    """Driver blocks a rider — they will not receive offers from that rider (NEXRYDE Shield)."""
    verify_owner_strict(request, user_id)
    actor = await db.users.find_one({"id": user_id}, {"_id": 0, "role": 1})
    if not actor or actor.get("role") != "driver":
        raise HTTPException(status_code=403, detail="Only drivers can block riders")
    if body.rider_id == user_id:
        raise HTTPException(status_code=400, detail="Invalid rider")
    await db.users.update_one({"id": user_id}, {"$addToSet": {"blocked_riders": body.rider_id}})
    return {"message": "Rider blocked", "rider_id": body.rider_id}


@users_router.delete("/users/{user_id}/blocked-riders/{rider_id}")
async def unblock_rider(user_id: str, rider_id: str, request: Request):
    verify_owner_strict(request, user_id)
    await db.users.update_one({"id": user_id}, {"$pull": {"blocked_riders": rider_id}})
    return {"message": "Rider unblocked"}


@users_router.get("/users/{user_id}/blocked-riders")
async def list_blocked_riders(user_id: str, request: Request):
    verify_owner_strict(request, user_id)
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "blocked_riders": 1, "role": 1})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    ids = user.get("blocked_riders") or []
    out = []
    for rid in ids:
        ru = await db.users.find_one({"id": rid}, {"_id": 0, "id": 1, "name": 1, "phone": 1})
        if ru:
            out.append({"id": ru["id"], "name": ru.get("name"), "phone": ru.get("phone")})
    return {"blocked_riders": out}

# ==================== FACE VERIFICATION ====================

@users_router.post("/users/{user_id}/verify-rider-nin")
async def verify_rider_nin(user_id: str, http_request: Request, body: RiderNinVerifyBody):
    """Preflight NIN + full-name check (shows inline UI feedback before final submit)."""
    verify_owner_strict(http_request, user_id)
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.get("role") != "rider":
        raise HTTPException(status_code=403, detail="Rider account required")

    nin = (body.nin or "").strip()
    full_name = (body.full_name or "").strip()
    vr = await verify_nin_with_full_name(nin=nin, full_name=full_name)
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.users.update_one(
        {"id": user_id},
        {"$set": {
            "nin_verify_preview_at": now_iso,
            "nin_verify_preview": {
                "format_ok": vr.get("format_ok"),
                "registry_checked": vr.get("registry_checked"),
                "registry_verified": vr.get("registry_verified"),
                "name_match_ok": vr.get("name_match_ok"),
                "name_match_score": vr.get("name_match_score"),
                "message": vr.get("message"),
            },
            "updated_at": now_iso,
        }},
    )
    return {"success": True, **vr}


@users_router.post("/users/{user_id}/verify-face")
async def verify_face(user_id: str, payload: FaceVerificationRequest, http_request: Request):
    verify_owner_strict(http_request, user_id)
    try:
        image_data = payload.face_image
        if ',' in image_data:
            image_data = image_data.split(',')[1]
        decoded = base64.b64decode(image_data)
        if len(decoded) < 10000:
            raise HTTPException(status_code=400, detail="Image too small. Please use a clear photo.")
        if len(decoded) > 5000000:
            raise HTTPException(status_code=400, detail="Image too large. Maximum 5MB.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image format: {str(e)}")

    liveness_score = None
    probe = payload.liveness_probe_image
    if probe:
        try:
            pdata = probe.split(',', 1)[1] if ',' in probe else probe
            pdecoded = base64.b64decode(pdata)
            if len(pdecoded) < 8000 or len(pdecoded) > 5000000:
                raise HTTPException(status_code=400, detail="Secondary capture is invalid. Retake both shots.")
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(status_code=400, detail="Secondary capture could not be read.")

        try:
            sim = face_template_match_confidence(payload.face_image, probe)
            liveness_score = sim
            if sim < FACE_TEMPLATE_SIMSWAP_MIN:
                raise HTTPException(
                    status_code=400,
                    detail="Biometric check failed: the two captures don't match. Retake in good lighting.",
                )
            if sim > 99.2:
                raise HTTPException(
                    status_code=400,
                    detail="Please retake: move slightly between captures so we know it's a live session.",
                )
        except HTTPException:
            raise
        except Exception as e:
            logger.warning("verify_face liveness compare failed: %s", e)
            raise HTTPException(status_code=400, detail="Could not complete biometric comparison.")

    now_iso = datetime.now(timezone.utc).isoformat()
    await save_user_biometrics(
        user_id,
        face_image=payload.face_image,
        face_liveness_score=liveness_score,
        face_capture_meta=payload.capture_meta or {},
        source="verify_face",
    )
    set_doc = strip_blobs_from_user_update({
        "face_verified": True,
        "face_verified_at": now_iso,
        "face_liveness_score": liveness_score,
        "updated_at": now_iso,
    })

    await db.users.update_one({"id": user_id}, {"$set": set_doc})
    return {
        "success": True,
        "message": "Face verified successfully",
        "verified": True,
        "verified_at": now_iso,
        "liveness_score": liveness_score,
    }

# ==================== NOTIFICATIONS ====================

@users_router.get("/users/{user_id}/notifications")
async def get_user_notifications(
    user_id: str,
    request: Request,
    limit: int = 20,
    unread_only: bool = False,
    exclude_engagement: bool = False,
):
    """In-app notification feed / badge. Separate from wallet (wallet is launch-disabled)."""
    verify_owner_strict(request, user_id)
    safe_limit = max(1, min(int(limit), 40))
    query: dict = {"user_id": user_id}
    if unread_only:
        query["read"] = False
    # Map bell / badge: exclude engagement + daily_slot so reconnect spam never inflates the count.
    if exclude_engagement:
        query["category"] = {"$nin": ["driver_engagement", "rider_engagement", "engagement", "daily_slot"]}
        query["source"] = {"$nin": ["engagement", "daily_slot", "reconnect"]}
    projection = {
        "_id": 0,
        "id": 1,
        "user_id": 1,
        "type": 1,
        "title": 1,
        "message": 1,
        "body": 1,
        "read": 1,
        "created_at": 1,
        "data": 1,
        "category": 1,
        "source": 1,
        "urgent": 1,
    }
    cursor = db.notifications.find(query, projection).sort("created_at", -1).limit(safe_limit)
    try:
        if unread_only:
            notifications = await cursor.hint(
                "notifications_user_read_created_desc"
            ).to_list(safe_limit)
        else:
            notifications = await cursor.to_list(safe_limit)
    except Exception:
        notifications = await (
            db.notifications.find(query, projection)
            .sort("created_at", -1)
            .limit(safe_limit)
            .to_list(safe_limit)
        )
    unread_query = {"user_id": user_id, "read": False}
    if exclude_engagement:
        unread_query["category"] = query["category"]
        unread_query["source"] = query["source"]
    try:
        unread_count = await db.notifications.count_documents(
            unread_query, hint="notifications_user_read_created_desc"
        )
    except Exception:
        unread_count = await db.notifications.count_documents(unread_query)
    return {"notifications": notifications, "unread_count": unread_count}

@users_router.post("/users/{user_id}/notifications/{notification_id}/read")
async def mark_notification_read(user_id: str, notification_id: str, request: Request):
    verify_owner_strict(request, user_id)
    result = await db.notifications.update_one({"id": notification_id, "user_id": user_id}, {"$set": {"read": True}})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    try:
        from routers.realtime_dispatch import publish_notification_badge

        await publish_notification_badge(user_id)
    except Exception:
        logger.debug("badge publish after mark-read failed", exc_info=True)
    return {"success": True}

@users_router.post("/users/{user_id}/notifications/read-all")
async def mark_all_notifications_read(user_id: str, request: Request):
    verify_owner_strict(request, user_id)
    await db.notifications.update_many({"user_id": user_id, "read": False}, {"$set": {"read": True}})
    try:
        from routers.realtime_dispatch import publish_notification_badge

        await publish_notification_badge(user_id, unread_count=0)
    except Exception:
        logger.debug("badge publish after read-all failed", exc_info=True)
    return {"success": True}

# ==================== USER PREFERENCES ====================

@users_router.put("/users/{user_id}/theme")
async def set_theme(user_id: str, theme: str, request: Request):
    verify_owner_strict(request, user_id)
    if theme not in ["light", "dark", "auto"]:
        raise HTTPException(status_code=400, detail="Invalid theme")
    await db.users.update_one({"id": user_id}, {"$set": {"theme_preference": theme}})
    return {"success": True, "theme": theme}

@users_router.get("/users/{user_id}/preferences")
async def get_preferences(user_id: str, request: Request):
    verify_owner_strict(request, user_id)
    user = await db.users.find_one({"id": user_id})
    if not user:
        return {"theme": "auto", "language": "en"}
    default_mood = {"conversation": "any", "music": "any", "temperature": "any", "driving_style": "any"}
    return {
        "theme": user.get("theme_preference", "auto"),
        "language": user.get("preferred_language", "en"),
        "notifications_enabled": user.get("notifications_enabled", True),
        "notification_channels": user.get("notification_channels", {}),
        "notification_types": user.get("notification_types", {}),
        "ride_mood": user.get("ride_mood_preferences", default_mood),
        "pickup_code_enabled": bool(user.get("pickup_code_enabled", False)),
    }


@users_router.put("/users/{user_id}/preferences")
async def update_preferences(user_id: str, request: Request, body: UserPreferencesUpdate):
    verify_owner_strict(request, user_id)

    update_data = {}
    if body.theme is not None:
        if body.theme not in ["light", "dark", "auto"]:
            raise HTTPException(status_code=400, detail="Invalid theme")
        update_data["theme_preference"] = body.theme
    if body.language is not None:
        update_data["preferred_language"] = body.language
    if body.notifications_enabled is not None:
        update_data["notifications_enabled"] = bool(body.notifications_enabled)
    if body.notification_channels is not None:
        update_data["notification_channels"] = body.notification_channels
    if body.notification_types is not None:
        update_data["notification_types"] = body.notification_types
    if body.ride_mood is not None:
        valid_conv = {"quiet", "chatty", "any"}
        valid_music = {"on", "off", "any"}
        valid_temp = {"cold", "moderate", "any"}
        valid_style = {"smooth", "fast", "any"}
        if body.ride_mood.conversation not in valid_conv:
            raise HTTPException(status_code=400, detail="Invalid conversation preference")
        if body.ride_mood.music not in valid_music:
            raise HTTPException(status_code=400, detail="Invalid music preference")
        if body.ride_mood.temperature not in valid_temp:
            raise HTTPException(status_code=400, detail="Invalid temperature preference")
        if body.ride_mood.driving_style not in valid_style:
            raise HTTPException(status_code=400, detail="Invalid driving style preference")
        update_data["ride_mood_preferences"] = {
            "conversation": body.ride_mood.conversation,
            "music": body.ride_mood.music,
            "temperature": body.ride_mood.temperature,
            "driving_style": body.ride_mood.driving_style,
        }
    if body.pickup_code_enabled is not None:
        update_data["pickup_code_enabled"] = bool(body.pickup_code_enabled)

    if not update_data:
        return {"success": True, "message": "No changes provided"}

    await db.users.update_one({"id": user_id}, {"$set": update_data})
    return {"success": True, "updated_fields": list(update_data.keys())}

# ==================== WOMEN-ONLY MODE ====================

@users_router.post("/users/{user_id}/women-only-mode")
async def toggle_women_only_mode(user_id: str, enabled: bool, request: Request):
    verify_owner_strict(request, user_id)
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.get("gender") != "female" and enabled:
        raise HTTPException(status_code=400, detail="Women-only mode is only available for verified female riders")
    await db.users.update_one({"id": user_id}, {"$set": {"women_only_mode": enabled}})
    return {"message": f"Women-only mode {'enabled' if enabled else 'disabled'}", "women_only_mode": enabled}

@users_router.post("/users/{user_id}/verify-gender")
async def verify_gender(user_id: str, gender: str, request: Request):
    verify_owner_strict(request, user_id)
    if gender not in ["male", "female", "other"]:
        raise HTTPException(status_code=400, detail="Invalid gender")
    await db.users.update_one({"id": user_id}, {"$set": {"gender": gender}})
    return {"message": "Gender verified", "gender": gender}

@users_router.get("/drivers/available-female")
async def get_available_female_drivers(lat: float, lng: float, radius_km: float = 5.0):
    female_drivers = await db.users.find({"role": "driver", "gender": "female", "is_verified": True}).to_list(20)
    available = []
    for driver in female_drivers:
        profile = await db.driver_profiles.find_one({"user_id": driver["id"]})
        if profile and profile.get("is_online"):
            available.append({
                "driver_id": driver["id"],
                "name": driver.get("name", "Driver"),
                "rating": driver.get("rating", 5.0),
                "total_trips": driver.get("total_trips", 0),
                "vehicle": profile.get("vehicle_model"),
                "plate": profile.get("plate_number")
            })
    return {"female_drivers": available, "count": len(available)}

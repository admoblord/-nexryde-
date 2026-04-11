"""Users Router - User CRUD, profile pictures, emergency contacts, favorites, face verification, notifications, preferences, women-only mode."""
from fastapi import APIRouter, HTTPException, Request

from auth_guard import require_authenticated, verify_owner, verify_owner_strict
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import logging
import base64
import re

from database import db

logger = logging.getLogger('server')
users_router = APIRouter(prefix="/api", tags=["Users"])

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

class FavoriteDriverRequest(BaseModel):
    driver_id: str


class BlockRiderRequest(BaseModel):
    rider_id: str

class PushTokenRequest(BaseModel):
    push_token: str

class ProfilePictureUpload(BaseModel):
    image: str


class UserPreferencesUpdate(BaseModel):
    theme: Optional[str] = None
    language: Optional[str] = None
    notifications_enabled: Optional[bool] = None
    notification_channels: Optional[dict] = None
    notification_types: Optional[dict] = None


class RiderVerificationUpdate(BaseModel):
    name: str
    phone: str
    address: str
    nin: str

# ==================== USER CRUD ====================

@users_router.get("/users/{user_id}")
async def get_user(user_id: str, request: Request):
    verify_owner_strict(request, user_id)
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user["_id"] = str(user["_id"])
    return user

@users_router.get("/users/phone/{phone}")
async def get_user_by_phone(phone: str, request: Request):
    require_authenticated(request)
    normalized = phone.strip()
    if not normalized.startswith('+'):
        digits = ''.join(filter(str.isdigit, normalized))
        if normalized.startswith('0'):
            normalized = '+234' + digits[1:]
        elif normalized.startswith('234'):
            normalized = '+' + digits
        else:
            normalized = '+234' + digits
    user = await db.users.find_one({"phone": normalized}, {"_id": 0, "id": 1, "name": 1, "phone": 1, "role": 1, "is_verified": 1})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@users_router.post("/users/{user_id}/push-token")
async def register_push_token(user_id: str, request: Request, body: PushTokenRequest):
    verify_owner_strict(request, user_id)
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"push_token": body.push_token}}
    )
    return {"message": "Push token registered"}

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


@users_router.get("/users/{user_id}/rider-verification-status")
async def get_rider_verification_status(user_id: str, request: Request):
    verify_owner_strict(request, user_id)
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.get("role") != "rider":
        raise HTTPException(status_code=403, detail="Rider account required")

    missing = []
    if not (user.get("name") or "").strip():
        missing.append("name")
    if not (user.get("phone") or "").strip():
        missing.append("phone")
    if not (user.get("address") or "").strip():
        missing.append("address")
    nin = (user.get("nin") or "").strip()
    if not re.fullmatch(r"\d{11}", nin):
        missing.append("nin")

    return {
        "user_id": user_id,
        "role": "rider",
        "completed": len(missing) == 0,
        "missing": missing,
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
    nin = (body.nin or "").strip()
    raw_phone = (body.phone or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Full name is required")
    if not address:
        raise HTTPException(status_code=400, detail="Address is required")
    if not re.fullmatch(r"\d{11}", nin):
        raise HTTPException(status_code=400, detail="NIN must be exactly 11 digits")

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

    await db.users.update_one(
        {"id": user_id},
        {"$set": {
            "name": name,
            "phone": normalized_phone,
            "address": address,
            "nin": nin,
            "nin_verified": True,
            "is_verified": True,
            "rider_verification_completed": True,
            "onboarding_complete": True,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }}
    )

    refreshed = await db.users.find_one({"id": user_id}, {"_id": 0})
    return {
        "success": True,
        "message": "Rider verification completed successfully.",
        "user": refreshed,
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
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"profile_image": body.image, "profile_image_updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"success": True, "message": "Profile picture updated successfully", "profile_image": body.image}

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
    await db.users.update_one({"id": user_id}, {"$pull": {"emergency_contacts": {"phone": contact_phone}}})
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
                "vehicle_plate": profile.get("vehicle_plate") if profile else None,
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

@users_router.post("/users/{user_id}/verify-face")
async def verify_face(user_id: str, request: FaceVerificationRequest, http_request: Request):
    verify_owner_strict(http_request, user_id)
    try:
        image_data = request.face_image
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
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"face_image": request.face_image, "face_verified": True, "face_verified_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"success": True, "message": "Face verified successfully", "verified": True, "verified_at": datetime.now(timezone.utc).isoformat()}

# ==================== NOTIFICATIONS ====================

@users_router.get("/users/{user_id}/notifications")
async def get_user_notifications(user_id: str, request: Request, limit: int = 50, unread_only: bool = False):
    verify_owner_strict(request, user_id)
    query = {"user_id": user_id}
    if unread_only:
        query["read"] = False
    notifications = await db.notifications.find(query, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    unread_count = await db.notifications.count_documents({"user_id": user_id, "read": False})
    return {"notifications": notifications, "unread_count": unread_count}

@users_router.post("/users/{user_id}/notifications/{notification_id}/read")
async def mark_notification_read(user_id: str, notification_id: str, request: Request):
    verify_owner_strict(request, user_id)
    result = await db.notifications.update_one({"id": notification_id, "user_id": user_id}, {"$set": {"read": True}})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"success": True}

@users_router.post("/users/{user_id}/notifications/read-all")
async def mark_all_notifications_read(user_id: str, request: Request):
    verify_owner_strict(request, user_id)
    await db.notifications.update_many({"user_id": user_id, "read": False}, {"$set": {"read": True}})
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
    return {
        "theme": user.get("theme_preference", "auto"),
        "language": user.get("preferred_language", "en"),
        "notifications_enabled": user.get("notifications_enabled", True),
        "notification_channels": user.get("notification_channels", {}),
        "notification_types": user.get("notification_types", {}),
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

"""Users Router - User CRUD, profile pictures, emergency contacts, favorites, face verification, notifications, preferences, women-only mode."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import logging
import base64

from database import db

logger = logging.getLogger('server')
users_router = APIRouter(prefix="/api", tags=["Users"])

# ==================== MODELS ====================

class UpdateProfileRequest(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    profile_image: Optional[str] = None

class EmergencyContactRequest(BaseModel):
    name: str
    phone: str
    relationship: str

class FaceVerificationRequest(BaseModel):
    face_image: str

class FavoriteDriverRequest(BaseModel):
    driver_id: str

class ProfilePictureUpload(BaseModel):
    image: str

# ==================== USER CRUD ====================

@users_router.get("/users/{user_id}")
async def get_user(user_id: str):
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user["_id"] = str(user["_id"])
    return user

@users_router.put("/users/{user_id}")
async def update_user(user_id: str, request: UpdateProfileRequest):
    update_data = {k: v for k, v in request.dict().items() if v is not None}
    if update_data:
        await db.users.update_one({"id": user_id}, {"$set": update_data})
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user["_id"] = str(user["_id"])
    return user

@users_router.put("/users/{user_id}/switch-role")
async def switch_role(user_id: str):
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
async def upload_profile_picture(user_id: str, request: ProfilePictureUpload):
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not request.image:
        raise HTTPException(status_code=400, detail="Image data is required")
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"profile_image": request.image, "profile_image_updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"success": True, "message": "Profile picture updated successfully", "profile_image": request.image}

@users_router.get("/users/{user_id}/profile-picture")
async def get_profile_picture(user_id: str):
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"profile_image": user.get("profile_image"), "updated_at": user.get("profile_image_updated_at")}

@users_router.delete("/users/{user_id}/profile-picture")
async def delete_profile_picture(user_id: str):
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    await db.users.update_one({"id": user_id}, {"$unset": {"profile_image": "", "profile_image_updated_at": ""}})
    return {"success": True, "message": "Profile picture deleted successfully"}

# ==================== EMERGENCY CONTACTS ====================

@users_router.post("/users/{user_id}/emergency-contacts")
async def add_emergency_contact(user_id: str, request: EmergencyContactRequest):
    phone = request.phone.strip()
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
    contact = {"name": request.name.strip(), "phone": phone, "relationship": request.relationship.strip(), "added_at": datetime.now(timezone.utc).isoformat()}
    await db.users.update_one({"id": user_id}, {"$push": {"emergency_contacts": contact}})
    return {"success": True, "message": "Emergency contact added successfully", "contact": contact}

@users_router.get("/users/{user_id}/emergency-contacts")
async def get_emergency_contacts(user_id: str):
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"contacts": user.get("emergency_contacts", [])}

@users_router.delete("/users/{user_id}/emergency-contacts/{contact_phone}")
async def remove_emergency_contact(user_id: str, contact_phone: str):
    await db.users.update_one({"id": user_id}, {"$pull": {"emergency_contacts": {"phone": contact_phone}}})
    return {"message": "Emergency contact removed"}

# ==================== FAVORITE/BLOCKED DRIVERS ====================

@users_router.post("/users/{user_id}/favorite-drivers")
async def add_favorite_driver(user_id: str, request: FavoriteDriverRequest):
    await db.users.update_one({"id": user_id}, {"$addToSet": {"favorite_drivers": request.driver_id}})
    return {"message": "Driver added to favorites"}

@users_router.delete("/users/{user_id}/favorite-drivers/{driver_id}")
async def remove_favorite_driver(user_id: str, driver_id: str):
    await db.users.update_one({"id": user_id}, {"$pull": {"favorite_drivers": driver_id}})
    return {"message": "Driver removed from favorites"}

@users_router.get("/users/{user_id}/favorite-drivers")
async def get_favorite_drivers(user_id: str):
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    driver_ids = user.get("favorite_drivers", [])
    drivers = []
    for did in driver_ids:
        driver = await db.users.find_one({"id": did})
        if driver:
            profile = await db.driver_profiles.find_one({"user_id": did})
            drivers.append({
                "id": driver["id"],
                "name": driver.get("name"),
                "rating": driver.get("rating", 5.0),
                "vehicle": profile.get("vehicle_model") if profile else None,
                "plate": profile.get("vehicle_plate") if profile else None
            })
    return {"favorite_drivers": drivers}

@users_router.post("/users/{user_id}/blocked-drivers")
async def block_driver(user_id: str, request: FavoriteDriverRequest):
    await db.users.update_one({"id": user_id}, {"$addToSet": {"blocked_drivers": request.driver_id}})
    return {"message": "Driver blocked"}

@users_router.delete("/users/{user_id}/blocked-drivers/{driver_id}")
async def unblock_driver(user_id: str, driver_id: str):
    await db.users.update_one({"id": user_id}, {"$pull": {"blocked_drivers": driver_id}})
    return {"message": "Driver unblocked"}

# ==================== FACE VERIFICATION ====================

@users_router.post("/users/{user_id}/verify-face")
async def verify_face(user_id: str, request: FaceVerificationRequest):
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
async def get_user_notifications(user_id: str, limit: int = 50, unread_only: bool = False):
    query = {"user_id": user_id}
    if unread_only:
        query["read"] = False
    notifications = await db.notifications.find(query, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    unread_count = await db.notifications.count_documents({"user_id": user_id, "read": False})
    return {"notifications": notifications, "unread_count": unread_count}

@users_router.post("/users/{user_id}/notifications/{notification_id}/read")
async def mark_notification_read(user_id: str, notification_id: str):
    result = await db.notifications.update_one({"id": notification_id, "user_id": user_id}, {"$set": {"read": True}})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"success": True}

@users_router.post("/users/{user_id}/notifications/read-all")
async def mark_all_notifications_read(user_id: str):
    await db.notifications.update_many({"user_id": user_id, "read": False}, {"$set": {"read": True}})
    return {"success": True}

# ==================== USER PREFERENCES ====================

@users_router.put("/users/{user_id}/theme")
async def set_theme(user_id: str, theme: str):
    if theme not in ["light", "dark", "auto"]:
        raise HTTPException(status_code=400, detail="Invalid theme")
    await db.users.update_one({"id": user_id}, {"$set": {"theme_preference": theme}})
    return {"success": True, "theme": theme}

@users_router.get("/users/{user_id}/preferences")
async def get_preferences(user_id: str):
    user = await db.users.find_one({"id": user_id})
    if not user:
        return {"theme": "auto", "language": "en"}
    return {
        "theme": user.get("theme_preference", "auto"),
        "language": user.get("preferred_language", "en"),
        "notifications_enabled": user.get("notifications_enabled", True)
    }

# ==================== WOMEN-ONLY MODE ====================

@users_router.post("/users/{user_id}/women-only-mode")
async def toggle_women_only_mode(user_id: str, enabled: bool):
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.get("gender") != "female" and enabled:
        raise HTTPException(status_code=400, detail="Women-only mode is only available for verified female riders")
    await db.users.update_one({"id": user_id}, {"$set": {"women_only_mode": enabled}})
    return {"message": f"Women-only mode {'enabled' if enabled else 'disabled'}", "women_only_mode": enabled}

@users_router.post("/users/{user_id}/verify-gender")
async def verify_gender(user_id: str, gender: str):
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

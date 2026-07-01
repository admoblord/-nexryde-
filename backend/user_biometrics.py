"""
User biometric blobs — stored outside `users` so login/auth queries stay fast.

Collection: user_biometrics (keyed by user_id — drivers and riders).
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from database import db

COLLECTION = "user_biometrics"

# Fields that must never live on `users` (multi-KB blobs).
USER_BLOB_UNSET_FIELDS = [
    "face_image",
    "face_anchor_image",
    "liveness_probe_image",
    "face_capture_meta",
]

# Exclude blobs when loading user docs (defense-in-depth after migration).
USER_BLOB_EXCLUDE_PROJECTION = {field: 0 for field in USER_BLOB_UNSET_FIELDS}

LOGIN_MAX_TIME_MS = 4000

# Also strip from driver_profiles after migration (blobs live in user_biometrics).
PROFILE_BLOB_UNSET_FIELDS = [
    "face_image",
    "face_anchor_image",
    "liveness_probe_image",
    "face_capture_meta",
]


async def save_user_biometrics(
    user_id: str,
    *,
    face_image: Optional[str] = None,
    liveness_probe_image: Optional[str] = None,
    face_liveness_score: Optional[float] = None,
    face_capture_meta: Optional[dict] = None,
    source: Optional[str] = None,
    extra: Optional[dict[str, Any]] = None,
) -> None:
    """Upsert biometric blobs — never writes them onto users."""
    if not user_id:
        return
    now = datetime.now(timezone.utc)
    set_doc: dict[str, Any] = {"user_id": user_id, "updated_at": now}
    if face_image is not None:
        set_doc["face_image"] = face_image
    if liveness_probe_image is not None:
        set_doc["liveness_probe_image"] = liveness_probe_image
    if face_liveness_score is not None:
        set_doc["face_liveness_score"] = face_liveness_score
    if face_capture_meta is not None:
        set_doc["face_capture_meta"] = face_capture_meta
    if source:
        set_doc["last_write_source"] = source
    if extra:
        set_doc.update(extra)
    await db[COLLECTION].update_one({"user_id": user_id}, {"$set": set_doc}, upsert=True)


async def get_reference_face_image(user_id: str) -> Optional[str]:
    """Load reference face for matching — user_biometrics → driver_profiles (legacy) → profile_image."""
    if not user_id:
        return None
    bio = await db[COLLECTION].find_one(
        {"user_id": user_id},
        {"_id": 0, "face_image": 1},
    )
    if bio and bio.get("face_image"):
        return bio["face_image"]
    profile = await db.driver_profiles.find_one(
        {"user_id": user_id},
        {"_id": 0, "face_image": 1},
    )
    if profile and profile.get("face_image"):
        return profile["face_image"]
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "profile_image": 1})
    return (user or {}).get("profile_image")


async def has_stored_face(user_id: str) -> bool:
    ref = await get_reference_face_image(user_id)
    return bool(ref and len(str(ref)) > 100)


async def upsert_face_template(
    user_id: str,
    face_image: str,
    *,
    source: str,
    confidence: Optional[float] = None,
    user_meta: Optional[dict[str, Any]] = None,
    profile_meta: Optional[dict[str, Any]] = None,
) -> None:
    """Save face blob to user_biometrics; only light metadata on users / driver_profiles."""
    now_iso = datetime.now(timezone.utc).isoformat()
    await save_user_biometrics(
        user_id,
        face_image=face_image,
        face_liveness_score=confidence,
        source=source,
    )
    user_set: dict[str, Any] = {
        "face_verified": True,
        "face_unlock_enrolled": True,
        "face_template_stored_at": now_iso,
    }
    if confidence is not None:
        user_set["face_last_confidence"] = confidence
    if user_meta:
        user_set.update(user_meta)
    user_set = strip_blobs_from_user_update(user_set)
    await db.users.update_one({"id": user_id}, {"$set": user_set})

    profile_set: dict[str, Any] = {"face_template_stored_at": now_iso}
    if profile_meta:
        profile_set.update(profile_meta)
    for key in PROFILE_BLOB_UNSET_FIELDS:
        profile_set.pop(key, None)
    await db.driver_profiles.update_one({"user_id": user_id}, {"$set": profile_set}, upsert=True)


async def get_user_biometrics(user_id: str) -> dict[str, Any]:
    doc = await db[COLLECTION].find_one({"user_id": user_id}, {"_id": 0}) or {}
    return doc


def strip_blobs_from_user_update(update: dict[str, Any]) -> dict[str, Any]:
    """Defense-in-depth: remove blob keys from a $set payload targeting users."""
    if not update:
        return update
    for key in USER_BLOB_UNSET_FIELDS:
        update.pop(key, None)
    return update

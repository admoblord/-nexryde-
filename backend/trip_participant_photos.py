"""Rider/driver portrait URLs and driver_info for trip API + WebSocket payloads."""
from __future__ import annotations

from typing import Any, Optional

from user_biometrics import get_reference_face_image

ACTIVE_CALL_STATUSES = frozenset({
    "accepted",
    "arrived",
    "ongoing",
    "pending_payment",
    "pickup",
    "in_progress",
    "started",
    "picked_up",
    "driver_arriving",
})


def mask_phone(p: str | None) -> str | None:
    if not p:
        return None
    digits = str(p).replace(" ", "").replace("-", "")
    if len(digits) >= 8:
        return digits[:4] + "***" + digits[-4:]
    return p


async def phone_visible_for_trip(trip: dict, db) -> bool:
    status = str(trip.get("status") or "")
    if status in ACTIVE_CALL_STATUSES:
        return True
    rider_id = trip.get("rider_id")
    driver_id = trip.get("driver_id")
    if rider_id and driver_id:
        rider_doc = await db.users.find_one(
            {"id": rider_id},
            {"_id": 0, "favorite_drivers": 1},
        )
        if rider_doc and driver_id in (rider_doc.get("favorite_drivers") or []):
            return True
    return False


async def build_driver_info_from_trip(
    trip: dict,
    db,
    *,
    phone_visible: bool | None = None,
) -> Optional[dict[str, Any]]:
    driver_id = trip.get("driver_id")
    if not driver_id:
        return None

    user = await db.users.find_one(
        {"id": driver_id},
        {"_id": 0, "name": 1, "phone": 1, "profile_image": 1, "rating": 1, "total_trips": 1, "completed_trips": 1},
    ) or {}
    profile = await db.driver_profiles.find_one({"user_id": driver_id}, {"face_image": 0}) or {}

    if phone_visible is None:
        phone_visible = await phone_visible_for_trip(trip, db)

    driver_phone_raw = user.get("phone") if phone_visible else None
    locked_v = trip.get("locked_vehicle") or {}
    live_plate = (
        locked_v.get("plate")
        or profile.get("vehicle_plate")
        or profile.get("vehicle_plate_number")
        or trip.get("vehicle_plate")
        or ""
    )
    live_model = (
        locked_v.get("model")
        or profile.get("vehicle_model")
        or trip.get("vehicle_model")
        or "Vehicle"
    )
    live_color = locked_v.get("color") or profile.get("vehicle_color") or trip.get("vehicle_color") or ""
    live_vtype = locked_v.get("vehicle_type") or profile.get("vehicle_type") or trip.get("vehicle_type") or ""

    profile_image = user.get("profile_image") or trip.get("driver_profile_image")
    face_image = await get_reference_face_image(driver_id)
    if not face_image and trip.get("driver_face_image"):
        from trip_face_storage import _breadcrumb_inline_fallback

        _breadcrumb_inline_fallback(trip.get("id") or str(trip.get("_id") or ""))
        face_image = trip.get("driver_face_image")

    return {
        "driver_id": driver_id,
        "name": user.get("name") or trip.get("driver_name") or "Driver",
        "rating": float(user.get("rating") or profile.get("avg_rating") or 4.5),
        "avg_rating": float(profile.get("avg_rating") or user.get("rating") or 4.5),
        "profile_image": profile_image,
        "face_image": face_image,
        "vehicle": live_model,
        "vehicle_model": live_model,
        "vehicle_type": live_vtype,
        "plate": live_plate,
        "color": live_color,
        "vehicle_locked": bool(locked_v),
        "rider_identity_confirmed": bool(trip.get("rider_identity_confirmed")),
        "is_online": bool(profile.get("is_online")),
        "bank_name": profile.get("bank_name"),
        "account_number": profile.get("account_number"),
        "account_name": profile.get("account_name"),
        "phone": driver_phone_raw,
        "phone_masked": mask_phone(driver_phone_raw),
        "phone_visible": phone_visible,
        "total_trips": profile.get("total_trips") or user.get("total_trips"),
        "completed_trips": profile.get("completed_trips") or user.get("completed_trips"),
    }


async def enrich_trip_with_participant_photos(
    trip: Optional[dict],
    db,
    *,
    include_driver_info: bool = True,
) -> dict:
    """Attach rider_photo, portrait URLs, and optional driver_info to a trip dict."""
    if not trip:
        return {}
    out = dict(trip)

    rider_id = out.get("rider_id")
    if rider_id:
        rider_doc = await db.users.find_one(
            {"id": rider_id},
            {"_id": 0, "name": 1, "phone": 1, "profile_image": 1},
        ) or {}
        img = rider_doc.get("profile_image")
        if img:
            out["rider_profile_image"] = img
            out["rider_photo"] = out.get("rider_photo") or img
        rider_face = await get_reference_face_image(rider_id)
        if rider_face:
            out["rider_face_image"] = rider_face
        if not out.get("rider_name"):
            out["rider_name"] = rider_doc.get("name")

    driver_id = out.get("driver_id")
    if driver_id:
        user = await db.users.find_one(
            {"id": driver_id},
            {"_id": 0, "name": 1, "phone": 1, "profile_image": 1, "rating": 1},
        ) or {}
        profile = await db.driver_profiles.find_one({"user_id": driver_id}, {"face_image": 0}) or {}
        prof_img = user.get("profile_image") or out.get("driver_profile_image")
        face_img = await get_reference_face_image(driver_id)
        if not face_img and out.get("driver_face_image"):
            from trip_face_storage import _breadcrumb_inline_fallback

            _breadcrumb_inline_fallback(out.get("id") or str(out.get("_id") or ""))
            face_img = out.get("driver_face_image")
        if prof_img:
            out["driver_profile_image"] = prof_img
        # Face binary is no longer embedded on trips; expose the GCS-backed URL.
        if out.get("driver_face_key"):
            out["driver_face_image_url"] = f"/api/trips/{out.get('id')}/driver-face-image"
        if face_img:
            out["driver_face_image"] = face_img
        if include_driver_info:
            out["driver_info"] = await build_driver_info_from_trip(out, db)

    return out

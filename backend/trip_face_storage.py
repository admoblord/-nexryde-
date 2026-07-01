"""Trip driver-face binary storage — keep `trips` documents tiny.

Background
----------
Legacy trips embedded `driver_face_image` (a 2.4 MB base64 copy of the driver's
enrolled face, captured from get_reference_face_image() at trip-creation time).
`trips` grows with every ride, so an embedded multi-MB blob is the highest-risk
bloat in the system.

Design
------
The face is an ENROLLED-face copy, not a fresh per-trip safety capture, so the
forward design is a *reference*: readers resolve the driver's face live via
get_reference_face_image(driver_id) and nothing is persisted on the trip. The
current write path already does this (no code persists driver_face_image).

For the existing legacy blobs the live reference is not always resolvable (a
driver may have an empty user_biometrics.face_image), so to avoid losing the
only displayable copy the migration preserves each blob as a PRIVATE GCS object
(`trips/{trip_id}/driver-face.jpg`) and stores only the key on the trip:

    driver_face_key: "trips/<trip_id>/driver-face.jpg"
    driver_face_storage: "gcs"

`driver_face_image` (the inline base64) is removed. A reader resolves bytes via
fetch_trip_driver_face(): GCS key first, legacy inline base64 as a last resort —
and the inline path emits a Sentry/log breadcrumb so a silent GCS outage cannot
quietly re-bloat trips.
"""
from __future__ import annotations

import base64
import logging
from typing import Optional

logger = logging.getLogger("trip_face_storage")


def trip_face_gcs_key(trip_id: str) -> str:
    return f"trips/{trip_id}/driver-face.jpg"


def _decode_face_payload(value: str) -> Optional[bytes]:
    """Decode a stored face string to raw bytes. Handles data URIs and plain
    base64. Returns None when the value is not base64 (e.g. a URL/file path)."""
    if not isinstance(value, str) or not value:
        return None
    payload = value
    if payload.startswith("data:") and "," in payload:
        payload = payload.split(",", 1)[1]
    try:
        return base64.b64decode(payload, validate=False)
    except Exception:
        return None


def _breadcrumb_inline_fallback(trip_id: str) -> None:
    """Alert when a reader has to use the inline base64 — signals un-migrated or
    re-bloated trips so a silent GCS outage cannot go unnoticed."""
    msg = f"trip {trip_id}: served driver face from INLINE base64 (GCS miss/un-migrated)"
    logger.warning(msg)
    try:
        import sentry_sdk  # type: ignore

        sentry_sdk.add_breadcrumb(category="trip_face", level="warning", message=msg)
        sentry_sdk.capture_message(msg, level="warning")
    except Exception:
        pass


async def fetch_trip_driver_face(trip: dict) -> Optional[bytes]:
    """Resolve a trip's driver-face bytes: GCS key first, inline base64 fallback."""
    if not isinstance(trip, dict):
        return None
    trip_id = trip.get("id") or str(trip.get("_id") or "")

    key = trip.get("driver_face_key")
    if key:
        from gcs_cdn import download_bytes

        data = await download_bytes(key)
        if data is not None:
            return data
        logger.warning("trip %s: GCS key %s missing; trying inline", trip_id, key)

    inline = trip.get("driver_face_image")
    if inline:
        _breadcrumb_inline_fallback(trip_id)
        return _decode_face_payload(inline)
    return None


async def run_trip_face_migration(dry_run: bool = True) -> dict:
    """Move inline trips.driver_face_image → private GCS, idempotently.

    Verify-before-unset: upload → confirm object exists → set key → unset blob.
    Re-running is safe (already-migrated trips are skipped).
    """
    import os

    from gcs_cdn import GCS_BUCKET, gcs_object_exists, upload_bytes_private

    COLLECTION = "trips"

    from motor.motor_asyncio import AsyncIOMotorClient

    _mongo_url = os.environ.get("MONGODB_URI") or os.environ.get("MONGO_URL")
    _db_name = os.environ.get("DB_NAME", "nexryde_db")
    _client = AsyncIOMotorClient(
        _mongo_url,
        serverSelectionTimeoutMS=8000,
        connectTimeoutMS=8000,
        socketTimeoutMS=120000,
    )
    db = _client[_db_name]

    async def _max_kb() -> float:
        pipe = [
            {"$project": {"sizeKB": {"$divide": [{"$bsonSize": "$$ROOT"}, 1024]}}},
            {"$group": {"_id": None, "maxKB": {"$max": "$sizeKB"}}},
        ]
        rows = await db[COLLECTION].aggregate(pipe, allowDiskUse=True).to_list(1)
        return round(rows[0]["maxKB"], 1) if rows else 0.0

    async def _count_inline() -> int:
        pipe = [
            {"$match": {"driver_face_image": {"$exists": True, "$ne": None}}},
            {"$count": "n"},
        ]
        rows = await db[COLLECTION].aggregate(pipe).to_list(1)
        return int(rows[0]["n"]) if rows else 0

    summary: dict = {"bucket": GCS_BUCKET, "dry_run": dry_run}
    summary["max_kb_before"] = await _max_kb()
    summary["inline_before"] = await _count_inline()

    if not GCS_BUCKET:
        summary["error"] = "GCS_MEDIA_BUCKET not set"
        _client.close()
        return summary
    if dry_run:
        _client.close()
        return summary

    migrated = skipped = failed = 0
    # Only the ids first (tiny) — fetch each big blob one at a time.
    ids = await db[COLLECTION].find(
        {"driver_face_image": {"$exists": True, "$ne": None}}, {"_id": 0, "id": 1}
    ).to_list(1000)
    for row in ids:
        trip_id = row.get("id")
        if not trip_id:
            continue
        one = await db[COLLECTION].find_one(
            {"id": trip_id}, {"_id": 0, "driver_face_image": 1, "driver_face_key": 1}
        )
        if not one or one.get("driver_face_key"):
            skipped += 1
            continue
        inline = one.get("driver_face_image")
        raw = _decode_face_payload(inline) if inline else None
        if raw is None:
            # Not binary (e.g. a URL/file path): just drop the inline value.
            await db[COLLECTION].update_one(
                {"id": trip_id}, {"$unset": {"driver_face_image": ""}}
            )
            skipped += 1
            continue
        key = trip_face_gcs_key(trip_id)
        uploaded = await upload_bytes_private(key, raw, "image/jpeg")
        if not uploaded or not gcs_object_exists(key):
            failed += 1
            continue
        await db[COLLECTION].update_one(
            {"id": trip_id},
            {
                "$set": {"driver_face_key": key, "driver_face_storage": "gcs"},
                "$unset": {"driver_face_image": ""},
            },
        )
        migrated += 1

    summary.update(migrated=migrated, skipped=skipped, failed=failed)
    summary["max_kb_after"] = await _max_kb()
    summary["inline_after"] = await _count_inline()
    _client.close()
    return summary

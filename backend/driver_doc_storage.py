"""Driver document binary storage — binaries live in GCS, metadata in Mongo.

The `driver_documents` collection stores ONLY light metadata per document:

    documents.<doc_key> = {
        filename, content_type, size_bytes, sha256, uploaded_at,
        expiry_date, capture_mode,
        gcs_key,            # object key in the private media bucket
        storage: "gcs",     # marker; legacy docs use "inline" (base64 in `data`)
    }

The actual image/PDF bytes are uploaded to a PRIVATE GCS bucket and served back
only through authenticated endpoints (admin doc review). Nothing reads the binary
on the go-online / earnings / expiry hot paths.

Legacy fallback: older documents may still carry base64 in `documents.<key>.data`.
fetch_document_binary() transparently falls back to that until migration completes.
"""
from __future__ import annotations

import base64
import logging
from typing import Optional

logger = logging.getLogger("driver_doc_storage")


def document_gcs_key(driver_id: str, doc_key: str, sha256: Optional[str] = None) -> str:
    """Deterministic object key. Includes a short sha to avoid stale-cache reuse."""
    suffix = f"-{sha256[:12]}" if sha256 else ""
    return f"driver-documents/{driver_id}/{doc_key}{suffix}"


async def store_document_binary(
    driver_id: str,
    doc_key: str,
    data_bytes: bytes,
    content_type: str,
    *,
    sha256: Optional[str] = None,
) -> Optional[str]:
    """Upload a document binary to private GCS. Returns the object key, or None
    if GCS is unavailable (caller then falls back to inline base64 storage)."""
    from gcs_cdn import upload_bytes_private

    object_name = document_gcs_key(driver_id, doc_key, sha256)
    return await upload_bytes_private(object_name, data_bytes, content_type)


async def fetch_document_binary(driver_id: str, doc_key: str, doc_meta: dict) -> Optional[bytes]:
    """Resolve a document's raw bytes from GCS (preferred) or legacy inline base64."""
    if not isinstance(doc_meta, dict):
        return None

    # Prefer gcs_key; older rows may use file_key for the same private object path.
    gcs_key = doc_meta.get("gcs_key") or doc_meta.get("file_key")
    if gcs_key:
        from gcs_cdn import download_bytes

        data = await download_bytes(gcs_key)
        if data is not None:
            return data
        logger.warning("GCS fetch miss for %s/%s key=%s; trying inline", driver_id, doc_key, gcs_key)

    inline = doc_meta.get("data")
    if inline:
        try:
            return base64.b64decode(inline)
        except Exception:
            logger.error("Inline base64 decode failed for %s/%s", driver_id, doc_key)
    return None


async def run_document_binary_migration(dry_run: bool = True) -> dict:
    """Move driver_documents inline base64 binaries → private GCS, idempotently.

    For each documents.<doc_key> still carrying inline `.data`:
      upload to GCS → verify object exists → set gcs_key/storage → $unset `.data`.
    NIN number-only payloads (tiny text) stay inline. Re-running is safe.

    Returns a summary dict with before/after size stats and counts.
    """
    import os

    from gcs_cdn import GCS_BUCKET, gcs_object_exists, upload_bytes_private

    COLLECTION = "driver_documents"

    # Dedicated client with a generous socket timeout: reading a legacy multi-MB
    # binary field can exceed the app's default 20s socketTimeoutMS.
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

    async def _size_stats() -> dict:
        pipeline = [
            {"$project": {"sizeKB": {"$divide": [{"$bsonSize": "$$ROOT"}, 1024]}}},
            {"$group": {"_id": None, "maxKB": {"$max": "$sizeKB"}, "avgKB": {"$avg": "$sizeKB"}, "count": {"$sum": 1}}},
        ]
        rows = await db[COLLECTION].aggregate(pipeline, allowDiskUse=True).to_list(1)
        r = rows[0] if rows else {"maxKB": 0, "avgKB": 0, "count": 0}
        return {"count": r.get("count", 0), "maxKB": round(r.get("maxKB", 0), 1), "avgKB": round(r.get("avgKB", 0), 1)}

    async def _count_inline() -> int:
        # Compute server-side — NEVER transfer the binary `data` over the wire.
        pipeline = [
            {"$project": {"docs": {"$objectToArray": {"$ifNull": ["$documents", {}]}}}},
            {"$project": {"inline": {"$size": {"$filter": {
                "input": "$docs",
                "as": "d",
                "cond": {"$and": [
                    {"$ne": [{"$ifNull": ["$$d.v.data", None]}, None]},
                    {"$eq": [{"$ifNull": ["$$d.v.gcs_key", None]}, None]},
                ]},
            }}}}},
            {"$group": {"_id": None, "total": {"$sum": "$inline"}}},
        ]
        rows = await db[COLLECTION].aggregate(pipeline, allowDiskUse=True).to_list(1)
        return int(rows[0]["total"]) if rows else 0

    async def _doc_key_metadata(driver_id: str) -> list[dict]:
        # Per-key metadata flags only (no `data`) so this read stays tiny.
        pipeline = [
            {"$match": {"driver_id": driver_id}},
            {"$project": {"docs": {"$objectToArray": {"$ifNull": ["$documents", {}]}}}},
            {"$unwind": "$docs"},
            {"$project": {
                "_id": 0,
                "key": "$docs.k",
                "has_data": {"$ne": [{"$ifNull": ["$docs.v.data", None]}, None]},
                "gcs_key": "$docs.v.gcs_key",
                "content_type": "$docs.v.content_type",
                "sha256": "$docs.v.sha256",
                "capture_mode": "$docs.v.capture_mode",
            }},
        ]
        return await db[COLLECTION].aggregate(pipeline, allowDiskUse=True).to_list(100)

    summary: dict = {"bucket": GCS_BUCKET, "dry_run": dry_run}
    summary["before"] = await _size_stats()
    summary["inline_before"] = await _count_inline()

    if not GCS_BUCKET:
        summary["error"] = "GCS_MEDIA_BUCKET not set"
        return summary
    if dry_run:
        return summary

    migrated = skipped = failed = 0
    driver_ids = await db[COLLECTION].distinct("driver_id")
    for driver_id in driver_ids:
        for row in await _doc_key_metadata(driver_id):
            doc_key = row.get("key")
            if not doc_key:
                continue
            if row.get("gcs_key") or not row.get("has_data"):
                skipped += 1
                continue
            if doc_key == "nin" and row.get("capture_mode") == "number_only":
                skipped += 1
                continue
            # Fetch ONLY this one key's binary — keeps each read small.
            one = await db[COLLECTION].find_one(
                {"driver_id": driver_id}, {"_id": 0, f"documents.{doc_key}.data": 1}
            )
            inline = (((one or {}).get("documents") or {}).get(doc_key) or {}).get("data")
            if not inline:
                skipped += 1
                continue
            try:
                raw = base64.b64decode(inline)
            except Exception:
                failed += 1
                continue
            content_type = row.get("content_type") or "image/jpeg"
            object_name = document_gcs_key(driver_id, doc_key, row.get("sha256"))
            uploaded = await upload_bytes_private(object_name, raw, content_type)
            if not uploaded or not gcs_object_exists(object_name):
                failed += 1
                continue
            await db[COLLECTION].update_one(
                {"driver_id": driver_id},
                {
                    "$set": {
                        f"documents.{doc_key}.gcs_key": object_name,
                        f"documents.{doc_key}.storage": "gcs",
                    },
                    "$unset": {f"documents.{doc_key}.data": ""},
                },
            )
            migrated += 1

    summary.update(migrated=migrated, skipped=skipped, failed=failed)
    summary["after"] = await _size_stats()
    summary["inline_after"] = await _count_inline()
    _client.close()
    return summary

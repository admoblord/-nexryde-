#!/usr/bin/env python3
"""
Migrate face/biometric blobs off `users` and `driver_profiles` into `user_biometrics`.

Uses server-side $merge (blobs never round-trip through Node/Python).

Usage:
  cd backend && python -m scripts.migrate_user_biometrics --dry-run
  cd backend && python -m scripts.migrate_user_biometrics --execute

BACK UP FIRST:
  mongodump --uri "$MONGODB_URI" --db nexryde_db --collection users --out ./backup-users-$(date +%F)
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from database import db  # noqa: E402
from user_biometrics import (  # noqa: E402
    COLLECTION,
    PROFILE_BLOB_UNSET_FIELDS,
    USER_BLOB_UNSET_FIELDS,
)

USER_BLOB_QUERY = {
    "$or": [{field: {"$exists": True, "$nin": [None, ""]}} for field in USER_BLOB_UNSET_FIELDS]
}
PROFILE_BLOB_QUERY = {
    "$or": [{field: {"$exists": True, "$nin": [None, ""]}} for field in PROFILE_BLOB_UNSET_FIELDS]
}


async def _doc_size_kb(collection: str, query: dict | None = None) -> dict:
    match = {"$match": query} if query else {"$match": {}}
    pipeline = [
        match,
        {"$project": {"sizeKB": {"$divide": [{"$bsonSize": "$$ROOT"}, 1024]}}},
        {"$group": {"_id": None, "maxKB": {"$max": "$sizeKB"}, "avgKB": {"$avg": "$sizeKB"}, "count": {"$sum": 1}}},
    ]
    rows = await db[collection].aggregate(pipeline, allowDiskUse=True).to_list(1)
    return rows[0] if rows else {"maxKB": 0, "avgKB": 0, "count": 0}


async def _ensure_biometrics_index() -> None:
    await db[COLLECTION].create_index("user_id", unique=True)


async def _merge_users_from_server() -> None:
    project_fields = {field: f"${field}" for field in USER_BLOB_UNSET_FIELDS}
    # Store all blob fields on user_biometrics; face_image is the primary reference.
    pipeline = [
        {"$match": USER_BLOB_QUERY},
        {
            "$project": {
                "_id": 0,
                "user_id": "$id",
                **project_fields,
                "updated_at": "$$NOW",
                "migrated_from": "users",
            }
        },
        {
            "$merge": {
                "into": COLLECTION,
                "on": "user_id",
                "whenMatched": "replace",
                "whenNotMatched": "insert",
            }
        },
    ]
    await db.users.aggregate(pipeline, allowDiskUse=True).to_list(0)


async def _merge_profiles_from_server() -> None:
    project_fields = {field: f"${field}" for field in PROFILE_BLOB_UNSET_FIELDS}
    pipeline = [
        {"$match": PROFILE_BLOB_QUERY},
        {
            "$project": {
                "_id": 0,
                "user_id": 1,
                **project_fields,
                "updated_at": "$$NOW",
                "migrated_from": "driver_profiles",
            }
        },
        {
            "$merge": {
                "into": COLLECTION,
                "on": "user_id",
                "whenMatched": "merge",
                "whenNotMatched": "insert",
            }
        },
    ]
    await db.driver_profiles.aggregate(pipeline, allowDiskUse=True).to_list(0)


async def _unset_user_blobs() -> int:
    unset = {field: "" for field in USER_BLOB_UNSET_FIELDS}
    result = await db.users.update_many(USER_BLOB_QUERY, {"$unset": unset})
    return result.modified_count


async def _unset_profile_blobs() -> int:
    unset = {field: "" for field in PROFILE_BLOB_UNSET_FIELDS}
    result = await db.driver_profiles.update_many(
        PROFILE_BLOB_QUERY,
        {"$unset": unset},
    )
    return result.modified_count


async def main() -> None:
    parser = argparse.ArgumentParser(description="Migrate biometric blobs off users collection")
    parser.add_argument("--dry-run", action="store_true", help="Report only, no writes")
    parser.add_argument("--execute", action="store_true", help="Run migration")
    args = parser.parse_args()
    if not args.dry_run and not args.execute:
        parser.error("Pass --dry-run or --execute")

    dry_run = args.dry_run
    print("=== BEFORE ===")
    users_stats = await _doc_size_kb("users")
    print(
        f"users: count={users_stats.get('count', 0)} "
        f"avgKB={users_stats.get('avgKB', 0):.1f} maxKB={users_stats.get('maxKB', 0):.1f}"
    )
    users_with_blobs = await db.users.count_documents(USER_BLOB_QUERY)
    profiles_with_blobs = await db.driver_profiles.count_documents(PROFILE_BLOB_QUERY)
    print(f"users with blob fields: {users_with_blobs}")
    print(f"driver_profiles with face_image: {profiles_with_blobs}")

    if dry_run:
        print("[dry-run] would $merge users -> user_biometrics (server-side)")
        print("[dry-run] would $merge driver_profiles -> user_biometrics (keepExisting)")
        print(f"[dry-run] would $unset blob fields on {users_with_blobs} users")
        print(f"[dry-run] would $unset face_image on {profiles_with_blobs} profiles")
        print("done")
        return

    print("=== ENSURE user_biometrics.user_id unique index ===")
    await _ensure_biometrics_index()
    print("=== MERGE users -> user_biometrics (server-side) ===")
    await _merge_users_from_server()
    print("=== MERGE driver_profiles -> user_biometrics (keepExisting) ===")
    await _merge_profiles_from_server()

    bio_count = await db[COLLECTION].count_documents(
        {"face_image": {"$exists": True, "$nin": [None, ""]}}
    )
    print(f"user_biometrics with face_image: {bio_count}")

    if users_with_blobs > 0 and bio_count < users_with_blobs:
        print(
            f"WARNING: migrated face count ({bio_count}) < users with blobs ({users_with_blobs})"
        )
        print("Aborting unset — verify user_biometrics manually before re-running.")
        sys.exit(1)

    print("=== UNSET blobs from users ===")
    users_unset = await _unset_user_blobs()
    print(f"users modified: {users_unset}")
    print("=== UNSET face_image from driver_profiles ===")
    profiles_unset = await _unset_profile_blobs()
    print(f"profiles modified: {profiles_unset}")

    print("=== AFTER ===")
    users_stats = await _doc_size_kb("users")
    print(
        f"users: avgKB={users_stats.get('avgKB', 0):.1f} maxKB={users_stats.get('maxKB', 0):.1f}"
    )
    remaining = await db.users.count_documents(USER_BLOB_QUERY)
    print(f"users still with blobs: {remaining}")
    if remaining > 0:
        print("WARNING: some users still have blob fields")
        sys.exit(1)
    print("done")


if __name__ == "__main__":
    asyncio.run(main())

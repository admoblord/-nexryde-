#!/usr/bin/env python3
"""
Move trips.driver_face_image binaries out of MongoDB into private GCS.

driver_face_image is an enrolled-face copy embedded on legacy trips. The forward
design is a live reference (current code no longer persists it); this migration
preserves existing blobs as private GCS objects (trips/{tripId}/driver-face.jpg)
and stores only the key, so trips stay single-digit KB and never re-bloat.

Idempotent. Verify-before-unset. Re-running is safe.

BACK UP FIRST (affected trips only):
  mongodump --uri "$MONGODB_URI" --db nexryde_db --collection trips \
    --query '{"driver_face_image":{"$exists":true,"$ne":null}}' \
    --out ./backup-trips-faces-$(date +%F)

Usage:
  cd backend && GCS_MEDIA_BUCKET=nexryde-media python -m scripts.migrate_trip_face_binaries --dry-run
  cd backend && GCS_MEDIA_BUCKET=nexryde-media python -m scripts.migrate_trip_face_binaries --execute
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from trip_face_storage import run_trip_face_migration  # noqa: E402


async def main() -> None:
    parser = argparse.ArgumentParser(description="Migrate trips.driver_face_image to GCS")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--execute", action="store_true")
    args = parser.parse_args()
    if not args.dry_run and not args.execute:
        parser.error("Pass --dry-run or --execute")
    summary = await run_trip_face_migration(dry_run=args.dry_run)
    print(json.dumps(summary, indent=2))
    if summary.get("failed"):
        print("WARNING: some binaries could not be migrated — they remain inline (safe).")
        sys.exit(1)
    print("done")


if __name__ == "__main__":
    asyncio.run(main())

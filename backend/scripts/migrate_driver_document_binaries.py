#!/usr/bin/env python3
"""
Move driver_documents image/PDF binaries out of MongoDB into private GCS.

For every `driver_documents.documents.<doc_key>` that still holds inline base64
in `.data`, this:
  1. decodes the bytes,
  2. uploads them to the PRIVATE media bucket (no public ACL),
  3. VERIFIES the GCS object exists,
  4. only then sets `gcs_key`/`storage="gcs"` and $unset the inline `.data`.

Idempotent: re-running skips docs already migrated (storage == "gcs" / no data).
Batched: processes one driver document at a time, one doc_key at a time.
NIN number-only payloads (tiny text) are left inline — they are not binaries.

BACK UP FIRST:
  mongodump --uri "$MONGODB_URI" --db nexryde_db --collection driver_documents \
    --out ./backup-driver_documents-$(date +%F)

Usage:
  cd backend && GCS_MEDIA_BUCKET=nexryde-media python -m scripts.migrate_driver_document_binaries --dry-run
  cd backend && GCS_MEDIA_BUCKET=nexryde-media python -m scripts.migrate_driver_document_binaries --execute
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from driver_doc_storage import run_document_binary_migration  # noqa: E402


async def main() -> None:
    parser = argparse.ArgumentParser(description="Migrate driver_documents binaries to GCS")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--execute", action="store_true")
    args = parser.parse_args()
    if not args.dry_run and not args.execute:
        parser.error("Pass --dry-run or --execute")
    summary = await run_document_binary_migration(dry_run=args.dry_run)
    import json
    print(json.dumps(summary, indent=2))
    if summary.get("failed"):
        print("WARNING: some binaries could not be migrated — they remain inline (safe).")
        sys.exit(1)
    print("done")


if __name__ == "__main__":
    asyncio.run(main())

#!/usr/bin/env python3
"""
Mark riders with NIN already on file as nin_verified (format-valid, on file at signup).

Run after migrate_encrypt_nin.py:
  cd backend && python scripts/backfill_nin_verified.py [--dry-run]
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from database import db  # noqa: E402
from pii_encryption import resolve_nin_plaintext  # noqa: E402
from nin_registry_verify import (  # noqa: E402
    verify_nin_with_full_name,
    finalize_nin_verification_from_result,
    nin_verification_audit_fields,
)


async def backfill(*, dry_run: bool) -> tuple[int, int]:
    updated = 0
    skipped = 0
    now_iso = datetime.now(timezone.utc).isoformat()
    cursor = db.users.find(
        {
            "role": "rider",
            "nin_verified": {"$ne": True},
            "$or": [
                {"nin_cipher": {"$exists": True, "$ne": None, "$ne": ""}},
                {"nin_hash": {"$exists": True, "$ne": None, "$ne": ""}},
            ],
        },
        {"_id": 0, "id": 1, "name": 1, "nin": 1, "nin_cipher": 1},
    )
    async for user in cursor:
        nin = resolve_nin_plaintext(user)
        name = (user.get("name") or "").strip()
        if not nin or not name:
            skipped += 1
            continue
        vr = await verify_nin_with_full_name(nin=nin, full_name=name)
        try:
            nin_verified, nin_registry_verified = finalize_nin_verification_from_result(vr)
        except ValueError:
            skipped += 1
            continue
        payload = {
            "nin_verified": nin_verified,
            "nin_registry_verified": nin_registry_verified,
            **nin_verification_audit_fields(vr, checked_at=now_iso),
            "updated_at": now_iso,
        }
        if dry_run:
            print(f"[dry-run] {user['id']} -> nin_verified={nin_verified}")
        else:
            await db.users.update_one({"id": user["id"]}, {"$set": payload})
        updated += 1
    return updated, skipped


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    updated, skipped = await backfill(dry_run=args.dry_run)
    mode = "dry-run" if args.dry_run else "applied"
    print(f"Backfill {mode}: updated={updated}, skipped={skipped}")


if __name__ == "__main__":
    asyncio.run(main())

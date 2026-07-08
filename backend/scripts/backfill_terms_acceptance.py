#!/usr/bin/env python3
"""
Backfill terms_version / privacy_version for users who accepted before version tracking.

Usage:
  cd backend && python scripts/backfill_terms_acceptance.py
  cd backend && python scripts/backfill_terms_acceptance.py --email loopy9ice@gmail.com
  cd backend && python scripts/backfill_terms_acceptance.py --dry-run
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from legal_constants import CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION


async def run(*, email: str | None, dry_run: bool) -> None:
    from database import db

    now_iso = datetime.now(timezone.utc).isoformat()
    query: dict = {"terms_accepted": True}
    if email:
        query["email"] = email.strip().lower()

    cursor = db.users.find(
        query,
        {
            "_id": 0,
            "id": 1,
            "email": 1,
            "role": 1,
            "terms_accepted": 1,
            "terms_version": 1,
            "terms_accepted_at": 1,
            "privacy_accepted": 1,
            "privacy_version": 1,
            "privacy_accepted_at": 1,
        },
    )

    updated = 0
    skipped = 0
    async for user in cursor:
        uid = user.get("id")
        accepted_version = (user.get("terms_version") or "").strip()
        privacy_version = (user.get("privacy_version") or "").strip()
        needs_terms = accepted_version != CURRENT_TERMS_VERSION
        needs_privacy = user.get("privacy_accepted") and privacy_version != CURRENT_PRIVACY_VERSION
        needs_privacy = needs_privacy or (
            not user.get("privacy_accepted") and accepted_version == CURRENT_TERMS_VERSION
        )

        if not needs_terms and not needs_privacy:
            if user.get("privacy_accepted") and privacy_version == CURRENT_PRIVACY_VERSION:
                skipped += 1
                continue
            if not user.get("privacy_accepted") and accepted_version == CURRENT_TERMS_VERSION:
                # Legacy bundle: terms current, privacy not tracked — backfill privacy only
                needs_privacy = True

        if not needs_terms and not needs_privacy:
            skipped += 1
            continue

        patch = {
            "terms_version": CURRENT_TERMS_VERSION,
            "terms_accepted": True,
            "terms_accepted_at": user.get("terms_accepted_at") or now_iso,
            "privacy_accepted": True,
            "privacy_version": CURRENT_PRIVACY_VERSION,
            "privacy_accepted_at": user.get("privacy_accepted_at")
            or user.get("terms_accepted_at")
            or now_iso,
            "updated_at": now_iso,
        }

        print(
            f"{'[dry-run] ' if dry_run else ''}update {uid} "
            f"email={user.get('email')} role={user.get('role')} "
            f"terms_version: {accepted_version!r} -> {CURRENT_TERMS_VERSION}"
        )
        if not dry_run:
            await db.users.update_one({"id": uid}, {"$set": patch})
        updated += 1

    print(f"Done. updated={updated} skipped={skipped} dry_run={dry_run}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--email", default=None, help="Backfill a single account by email")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    asyncio.run(run(email=args.email, dry_run=args.dry_run))


if __name__ == "__main__":
    main()

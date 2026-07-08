#!/usr/bin/env python3
"""
Encrypt legacy plaintext NIN / license fields at rest.

Run once after deploying pii_encryption.py:
  cd backend && python scripts/migrate_encrypt_nin.py [--dry-run]
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from database import db  # noqa: E402
from pii_encryption import (  # noqa: E402
    encrypt_pii_value,
    license_storage_fields,
    nin_storage_fields,
)


def _normalize_nin(value: str | None) -> str | None:
    digits = re.sub(r"\D", "", (value or "").strip())
    return digits if re.fullmatch(r"\d{11}", digits or "") else None


async def migrate_users(*, dry_run: bool) -> tuple[int, int]:
    updated = 0
    skipped = 0
    cursor = db.users.find(
        {
            "$or": [
                {"nin": {"$type": "string", "$ne": ""}},
                {"nin_cipher": {"$exists": False}, "nin": {"$exists": True, "$ne": None, "$ne": ""}},
            ]
        },
        {"_id": 0, "id": 1, "nin": 1, "nin_cipher": 1, "role": 1},
    )
    async for user in cursor:
        if user.get("nin_cipher"):
            continue
        plaintext = _normalize_nin(user.get("nin"))
        legacy = (user.get("nin") or "").strip()
        if not legacy:
            continue
        if not plaintext:
            skipped += 1
            print(f"[skip-invalid] users {user['id']} ({user.get('role')}) — legacy NIN not 11 digits, clearing plaintext")
            if not dry_run:
                await db.users.update_one({"id": user["id"]}, {"$unset": {"nin": ""}})
            continue
        nin_set, nin_unset = nin_storage_fields(plaintext)
        if dry_run:
            print(f"[dry-run] users {user['id']} ({user.get('role')})")
        else:
            await db.users.update_one(
                {"id": user["id"]},
                {"$set": nin_set, "$unset": nin_unset},
            )
        updated += 1
    return updated, skipped


async def migrate_driver_documents(*, dry_run: bool) -> int:
    updated = 0
    cursor = db.driver_documents.find(
        {},
        {"_id": 0, "driver_id": 1, "nin_number": 1, "nin_cipher": 1, "documents": 1,
         "license_number": 1, "license_number_cipher": 1},
    )
    async for doc in cursor:
        driver_id = doc.get("driver_id")
        if not driver_id:
            continue
        set_fields: dict = {}
        unset_fields: dict = {}

        plaintext = _normalize_nin(doc.get("nin_number"))
        if (doc.get("nin_number") or "").strip() and not doc.get("nin_cipher"):
            if plaintext:
                nin_set, nin_unset = nin_storage_fields(plaintext)
                set_fields.update(nin_set)
                unset_fields.update(nin_unset)
            else:
                print(f"[skip-invalid] driver_documents {driver_id} — nin_number not 11 digits, clearing")
                unset_fields["nin_number"] = ""

        license_plain = (doc.get("license_number") or "").strip()
        if license_plain and not doc.get("license_number_cipher"):
            lic_set, lic_unset = license_storage_fields(license_plain)
            set_fields.update(lic_set)
            unset_fields.update(lic_unset)

        documents = doc.get("documents") or {}
        nin_doc = documents.get("nin") or {}
        if nin_doc.get("capture_mode") == "number_only" and nin_doc.get("data") and not nin_doc.get("nin_cipher"):
            try:
                raw = base64.b64decode(nin_doc["data"]).decode("utf-8").strip()
            except Exception:
                raw = ""
            if raw:
                normalized = _normalize_nin(raw)
                if not normalized:
                    print(f"[skip-invalid] driver_documents {driver_id} — documents.nin data not 11 digits, stripping data")
                    set_fields["documents.nin"] = {
                        k: v for k, v in nin_doc.items() if k not in ("data",)
                    }
                else:
                    enc = encrypt_pii_value(normalized, kind="nin")
                    documents["nin"] = {
                        k: v for k, v in nin_doc.items()
                        if k not in ("data",)
                    }
                    documents["nin"]["nin_cipher"] = enc["cipher"]
                    documents["nin"]["nin_last4"] = enc["last4"]
                    documents["nin"]["size_bytes"] = 0
                    set_fields["documents.nin"] = documents["nin"]
                    if not set_fields.get("nin_cipher"):
                        nin_set, nin_unset = nin_storage_fields(normalized)
                        set_fields.update(nin_set)
                        unset_fields.update(nin_unset)

        if not set_fields and not unset_fields:
            continue

        if dry_run:
            print(f"[dry-run] driver_documents {driver_id}")
        else:
            await db.driver_documents.update_one(
                {"driver_id": driver_id},
                {"$set": set_fields, "$unset": {**unset_fields, "nin_number": ""}},
            )
            if set_fields.get("nin_hash"):
                await db.driver_profiles.update_one(
                    {"user_id": driver_id},
                    {
                        "$set": {
                            "nin_last4": set_fields.get("nin_last4"),
                            "nin_hash": set_fields.get("nin_hash"),
                        },
                        "$unset": {"nin_number": ""},
                    },
                )
                await db.driver_verifications.update_one(
                    {"user_id": driver_id},
                    {"$set": {"nin_hash": set_fields.get("nin_hash")}},
                )
        updated += 1
    return updated


async def main() -> None:
    parser = argparse.ArgumentParser(description="Encrypt legacy plaintext NIN fields")
    parser.add_argument("--dry-run", action="store_true", help="Print actions without writing")
    args = parser.parse_args()

    users_n, users_skipped = await migrate_users(dry_run=args.dry_run)
    docs_n = await migrate_driver_documents(dry_run=args.dry_run)
    mode = "dry-run" if args.dry_run else "applied"
    print(f"Migration {mode}: users={users_n}, users_skipped_invalid={users_skipped}, driver_documents={docs_n}")


if __name__ == "__main__":
    asyncio.run(main())

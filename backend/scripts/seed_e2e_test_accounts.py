#!/usr/bin/env python3
"""Seed non-production rider + driver accounts for live trip e2e.

Flags users with ``is_test_account=true`` and ``non_production=true`` so
``e2e_live_trip_flow.py`` can run request→accept→complete safely.

Usage (from backend/, with MONGODB_URI set — prefer staging URI):
  python scripts/seed_e2e_test_accounts.py [--apply]

Default is dry-run. Never point at prod unless you intentionally accept risk.
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from database import db  # noqa: E402

RIDER_EMAIL = os.environ.get("E2E_RIDER_EMAIL", "e2e.rider@nexryde.test")
DRIVER_EMAIL = os.environ.get("E2E_DRIVER_EMAIL", "e2e.driver@nexryde.test")
RIDER_PHONE = os.environ.get("E2E_RIDER_PHONE", "+2348100000001")
DRIVER_PHONE = os.environ.get("E2E_DRIVER_PHONE", "+2348100000002")


async def _upsert_user(*, role: str, email: str, phone: str, name: str) -> str:
    existing = await db.users.find_one({"email": email}, {"_id": 0, "id": 1})
    user_id = (existing or {}).get("id") or str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    payload = {
        "id": user_id,
        "email": email,
        "phone": phone,
        "name": name,
        "role": role,
        "is_verified": True,
        "is_test_account": True,
        "non_production": True,
        "terms_accepted": True,
        "privacy_accepted": True,
        "updated_at": now,
    }
    await db.users.update_one({"id": user_id}, {"$set": payload, "$setOnInsert": {"created_at": now}}, upsert=True)
    return user_id


async def seed(*, apply: bool) -> dict:
    if not apply:
        return {
            "dry_run": True,
            "rider_email": RIDER_EMAIL,
            "driver_email": DRIVER_EMAIL,
            "hint": "Re-run with --apply against staging Mongo (MONGODB_URI_STAGING).",
        }

    rider_id = await _upsert_user(role="rider", email=RIDER_EMAIL, phone=RIDER_PHONE, name="E2E Rider")
    driver_id = await _upsert_user(role="driver", email=DRIVER_EMAIL, phone=DRIVER_PHONE, name="E2E Driver")

    now = datetime.now(timezone.utc)
    month_key = now.strftime("%Y-%m")
    await db.driver_profiles.update_one(
        {"user_id": driver_id},
        {
            "$set": {
                "user_id": driver_id,
                "verification_status": "approved",
                "documents_verified": True,
                "documents_submitted": True,
                "profile_completed": True,
                "vehicle_registered": True,
                "has_ac": True,
                "vehicle_model": "Corolla",
                "vehicle_make": "Toyota",
                "vehicle_plate": "E2E 001 TEST",
                "vehicle_type": "economy",
                "nin_last4": "0001",
                "nin_hash": "e2e_test_nin_hash",
                "is_test_account": True,
                "non_production": True,
                "subscription_active": True,
                "updated_at": now.isoformat(),
            }
        },
        upsert=True,
    )
    await db.monthly_verifications.update_one(
        {"driver_id": driver_id, "month": month_key},
        {
            "$set": {
                "driver_id": driver_id,
                "month": month_key,
                "interior_photo": "e2e_placeholder",
                "selfie_photo": "e2e_placeholder",
                "updated_at": now.isoformat(),
            }
        },
        upsert=True,
    )
    await db.subscriptions.update_one(
        {"driver_id": driver_id, "status": "trial"},
        {
            "$set": {
                "driver_id": driver_id,
                "status": "trial",
                "tier": "city_rider",
                "subscription_active": True,
                "expires_at": (now + timedelta(days=30)).isoformat(),
                "is_test_account": True,
                "updated_at": now.isoformat(),
            },
            "$setOnInsert": {"created_at": now.isoformat(), "id": str(uuid.uuid4())},
        },
        upsert=True,
    )
    await db.users.update_one(
        {"id": rider_id},
        {
            "$set": {
                "rider_verification_completed": True,
                "onboarding_complete": True,
                "nin_verified": True,
                "is_test_account": True,
                "non_production": True,
            }
        },
    )
    return {"dry_run": False, "rider_id": rider_id, "driver_id": driver_id, "month": month_key}


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    result = await seed(apply=args.apply)
    print(result)


if __name__ == "__main__":
    asyncio.run(main())

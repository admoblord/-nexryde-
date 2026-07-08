#!/usr/bin/env python3
"""Grant document compliance grace to a driver (e.g. expired licence — 1 week)."""
from __future__ import annotations

import argparse
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import db
from driver_compliance import check_driver_document_expiry, grant_document_grace


async def main() -> int:
    parser = argparse.ArgumentParser(description="Grant NexRyde document grace to a driver")
    parser.add_argument("--email", help="Driver email")
    parser.add_argument("--driver-id", help="Driver user id")
    parser.add_argument("--document", default="drivers_license", help="Document type key")
    parser.add_argument("--days", type=int, default=7, help="Grace period in days")
    parser.add_argument("--no-notify", action="store_true", help="Skip push + inbox notification")
    args = parser.parse_args()

    if not args.email and not args.driver_id:
        parser.error("Provide --email or --driver-id")

    query = {"id": args.driver_id} if args.driver_id else {"email": args.email}
    user = await db.users.find_one(query, {"_id": 0, "id": 1, "name": 1, "email": 1, "role": 1})
    if not user:
        print(f"Driver not found: {query}")
        return 1
    if user.get("role") != "driver":
        print(f"User {user.get('email')} is role={user.get('role')}, not driver")
        return 1

    driver_id = user["id"]
    before = await check_driver_document_expiry(driver_id)
    print(f"Driver: {user.get('name')} <{user.get('email')}> ({driver_id})")
    print(f"Before: expired={[d['document'] for d in before.get('expired', [])]}")

    result = await grant_document_grace(
        driver_id,
        args.document,
        days=args.days,
        reason="admin_one_week_grace",
        granted_by="admin_script",
        notify=not args.no_notify,
    )
    after = await check_driver_document_expiry(driver_id)
    print(f"Granted grace until {result['grace_until']}")
    print(f"After: expired={[d['document'] for d in after.get('expired', [])]} on_grace={[d['document'] for d in after.get('expiring_soon', []) if d.get('on_grace')]}")
    print("Notification sent:", result.get("notified"))
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))

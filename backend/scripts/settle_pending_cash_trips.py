#!/usr/bin/env python3
"""Settle completed cash/transfer trips still sitting on payment_status=pending.

Trips completed before cash/transfer settled at completion time kept
payment_status="pending" until someone tapped "Cash collected". When that tap
never happened the trip stayed "active" for both rider and driver, blocking new
bookings. This sweeps those trips to paid.

Wallet and unknown payment methods are never touched — real money still has to
move for those, so they keep their confirmation step.

    python scripts/settle_pending_cash_trips.py --dry-run
    python scripts/settle_pending_cash_trips.py
    python scripts/settle_pending_cash_trips.py --rider-email a@b.com --driver-email c@d.com
"""
from __future__ import annotations

import argparse
import asyncio
import hashlib
import os
import sys
import uuid
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import db
from wallet_trip_helpers import payment_status_after_completion


async def _user_id_for_email(email: str) -> str | None:
    user = await db.users.find_one({"email": email}, {"_id": 0, "id": 1})
    return user.get("id") if user else None


async def main() -> int:
    parser = argparse.ArgumentParser(description="Settle stuck pending-payment trips")
    parser.add_argument("--dry-run", action="store_true", help="Report without writing")
    parser.add_argument("--trip-id", help="Limit to a single trip id")
    parser.add_argument("--rider-email", help="Limit to trips for this rider")
    parser.add_argument("--driver-email", help="Limit to trips for this driver")
    args = parser.parse_args()

    query: dict = {"status": "completed", "payment_status": {"$ne": "completed"}}
    if args.trip_id:
        query["id"] = args.trip_id
    for email, field in ((args.rider_email, "rider_id"), (args.driver_email, "driver_id")):
        if not email:
            continue
        user_id = await _user_id_for_email(email)
        if not user_id:
            print(f"No user found for {email}")
            return 1
        query[field] = user_id

    settled = 0
    skipped = 0
    async for trip in db.trips.find(
        query,
        {"_id": 0, "id": 1, "payment_method": 1, "payment_status": 1, "fare": 1, "completed_at": 1},
    ):
        method = trip.get("payment_method") or "cash"
        if payment_status_after_completion(method) != "completed":
            skipped += 1
            print(f"skip  {trip.get('id')} method={method} (needs confirmation)")
            continue

        print(
            f"settle {trip.get('id')} method={method} "
            f"fare={trip.get('fare')} completed_at={trip.get('completed_at')}"
        )
        if args.dry_run:
            settled += 1
            continue

        now = datetime.now(timezone.utc)
        result = await db.trips.update_one(
            {"id": trip["id"], "payment_status": {"$ne": "completed"}},
            {"$set": {"payment_status": "completed", "paid_at": now}},
        )
        if result.modified_count:
            settled += 1
            event = {
                "trip_id": trip["id"],
                "event_type": "payment_confirmed",
                "actor_id": "ops_script",
                "data": {
                    "payment_status": "completed",
                    "payment_method": method,
                    "reason": "backfill_settle_pending_cash_trips",
                },
                "created_at": now.isoformat(),
            }
            await db.trip_events.insert_one(
                {
                    "id": str(uuid.uuid4()),
                    **event,
                    "event_hash": hashlib.sha256(str(event).encode()).hexdigest(),
                }
            )

    print(f"\n{'Would settle' if args.dry_run else 'Settled'}: {settled}   Skipped: {skipped}")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))

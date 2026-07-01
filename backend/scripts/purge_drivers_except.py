#!/usr/bin/env python3
"""Delete all driver accounts except one keep email. Cleans related collections."""
from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from database import db  # noqa: E402

KEEP_EMAIL = "loopy9ice@gmail.com"

# Collections keyed by user_id / driver_id to purge for removed drivers.
USER_ID_COLLECTIONS = [
    "driver_profiles",
    "user_biometrics",
    "wallets",
    "notifications",
    "refresh_tokens",
    "wallet_virtual_accounts",
    "wallet_payment_intents",
    "face_verifications",
    "monthly_verifications",
    "driver_login_fortress_challenges",
]
DRIVER_ID_COLLECTIONS = [
    "subscriptions",
    "subscription_payment_intents",
]


async def _driver_ids_to_delete(keep_id: str) -> list[str]:
    cursor = db.users.find({"role": "driver", "id": {"$ne": keep_id}}, {"_id": 0, "id": 1, "email": 1})
    return [d["id"] async for d in cursor if d.get("id")]


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--keep-email", default=KEEP_EMAIL)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--execute", action="store_true")
    args = parser.parse_args()
    if not args.dry_run and not args.execute:
        parser.error("Pass --dry-run or --execute")

    keep = await db.users.find_one({"email": args.keep_email, "role": "driver"}, {"_id": 0, "id": 1, "email": 1, "name": 1})
    if not keep:
        print(f"ERROR: keep driver not found: {args.keep_email}")
        sys.exit(1)

    keep_id = keep["id"]
    delete_ids = await _driver_ids_to_delete(keep_id)
    print(f"KEEP: {keep.get('name')} ({keep.get('email')}) id={keep_id}")
    print(f"DELETE: {len(delete_ids)} driver account(s)")

    if not delete_ids:
        print("Nothing to delete.")
        return

    if args.dry_run:
        sample = await db.users.find(
            {"id": {"$in": delete_ids[:10]}},
            {"_id": 0, "email": 1, "phone": 1, "name": 1},
        ).to_list(10)
        print("Sample accounts to delete:")
        for u in sample:
            print(f"  {u.get('email') or u.get('phone')} | {u.get('name')}")
        trips = await db.trips.count_documents({"driver_id": {"$in": delete_ids}})
        print(f"Related trips to delete: {trips}")
        return

    q_user = {"user_id": {"$in": delete_ids}}
    q_driver = {"driver_id": {"$in": delete_ids}}
    q_txn = {"user_id": {"$in": delete_ids}}

    results: dict[str, int] = {}
    results["trips"] = (await db.trips.delete_many({"driver_id": {"$in": delete_ids}})).deleted_count
    results["transactions"] = (await db.transactions.delete_many(q_txn)).deleted_count
    for coll in USER_ID_COLLECTIONS:
        try:
            results[coll] = (await db[coll].delete_many(q_user)).deleted_count
        except Exception as exc:
            results[coll] = f"skip: {exc}"
    for coll in DRIVER_ID_COLLECTIONS:
        try:
            results[coll] = (await db[coll].delete_many(q_driver)).deleted_count
        except Exception as exc:
            results[coll] = f"skip: {exc}"
    results["users"] = (await db.users.delete_many({"id": {"$in": delete_ids}})).deleted_count

    remaining_drivers = await db.users.count_documents({"role": "driver"})
    print("Deleted:")
    for k, v in results.items():
        print(f"  {k}: {v}")
    print(f"Remaining drivers: {remaining_drivers}")
    if remaining_drivers != 1:
        print("WARNING: expected exactly 1 driver remaining")
        sys.exit(1)
    print("done")


if __name__ == "__main__":
    asyncio.run(main())

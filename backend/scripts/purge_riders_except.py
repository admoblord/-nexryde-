#!/usr/bin/env python3
"""Delete all rider accounts except one keep email. Cleans related collections."""
from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from database import db  # noqa: E402

KEEP_EMAIL = "josephbbs12@gmail.com"

USER_ID_COLLECTIONS = [
    "user_biometrics",
    "wallets",
    "notifications",
    "refresh_tokens",
    "wallet_virtual_accounts",
    "wallet_payment_intents",
    "email_otp_records",
    "email_verifications",
]


async def _rider_ids_to_delete(keep_id: str) -> list[str]:
    cursor = db.users.find({"role": "rider", "id": {"$ne": keep_id}}, {"_id": 0, "id": 1})
    return [d["id"] async for d in cursor if d.get("id")]


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--keep-email", default=KEEP_EMAIL)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--execute", action="store_true")
    args = parser.parse_args()
    if not args.dry_run and not args.execute:
        parser.error("Pass --dry-run or --execute")

    keep_email = args.keep_email.strip().lower()
    keep = await db.users.find_one(
        {"email": {"$regex": f"^{keep_email}$", "$options": "i"}, "role": "rider"},
        {"_id": 0, "id": 1, "email": 1, "name": 1},
    )
    if not keep:
        print(f"ERROR: keep rider not found: {args.keep_email}")
        sys.exit(1)

    keep_id = keep["id"]
    delete_ids = await _rider_ids_to_delete(keep_id)
    print(f"KEEP: {keep.get('name')} ({keep.get('email')}) id={keep_id}")
    print(f"DELETE: {len(delete_ids)} rider account(s)")

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
        trips = await db.trips.count_documents({"rider_id": {"$in": delete_ids}})
        print(f"Related trips to delete: {trips}")
        return

    q_user = {"user_id": {"$in": delete_ids}}
    q_txn = {"user_id": {"$in": delete_ids}}

    results: dict[str, int] = {}
    results["trips"] = (await db.trips.delete_many({"rider_id": {"$in": delete_ids}})).deleted_count
    results["transactions"] = (await db.transactions.delete_many(q_txn)).deleted_count
    for coll in USER_ID_COLLECTIONS:
        try:
            if coll in ("email_otp_records", "email_verifications"):
                key = "email" if coll == "email_otp_records" else "email"
                emails = [
                    u.get("email", "").lower()
                    async for u in db.users.find({"id": {"$in": delete_ids}}, {"email": 1})
                    if u.get("email")
                ]
                if emails:
                    results[coll] = (await db[coll].delete_many({key: {"$in": emails}})).deleted_count
                else:
                    results[coll] = 0
            else:
                results[coll] = (await db[coll].delete_many(q_user)).deleted_count
        except Exception as exc:
            results[coll] = f"skip: {exc}"

    # Remove deleted riders from favorite_drivers / blocked lists on surviving users
    results["favorite_drivers_pull"] = (
        await db.users.update_many({}, {"$pull": {"favorite_drivers": {"$in": delete_ids}}})
    ).modified_count
    results["blocked_drivers_pull"] = (
        await db.users.update_many({}, {"$pull": {"blocked_drivers": {"$in": delete_ids}}})
    ).modified_count
    results["blocked_riders_pull"] = (
        await db.users.update_many({}, {"$pull": {"blocked_riders": {"$in": delete_ids}}})
    ).modified_count

    results["users"] = (await db.users.delete_many({"id": {"$in": delete_ids}})).deleted_count

    remaining_riders = await db.users.count_documents({"role": "rider"})
    print("Deleted:")
    for k, v in results.items():
        print(f"  {k}: {v}")
    print(f"Remaining riders: {remaining_riders}")
    if remaining_riders != 1:
        print("WARNING: expected exactly 1 rider remaining")
        sys.exit(1)
    print("done")


if __name__ == "__main__":
    asyncio.run(main())

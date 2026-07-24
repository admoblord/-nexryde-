"""Read-only: print loopy's live trial snapshot (used/limit/left) from the DB.

Usage: python scripts/query_loopy_trial.py [email]
Prints ONLY trial numbers — no secrets.
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from database import db  # noqa: E402
from driver_trial_policy import compute_trial_snapshot, resolve_trial_config  # noqa: E402


async def main() -> None:
    email = (sys.argv[1] if len(sys.argv) > 1 else "loopy9ice@gmail.com").strip().lower()
    user = await db.users.find_one({"email": email}, {"_id": 0, "id": 1, "email": 1, "role": 1, "name": 1})
    if not user:
        print(f"NO_USER for {email}")
        return
    driver_id = user["id"]
    print(f"user: email={user.get('email')} role={user.get('role')} id={driver_id}")

    profile = await db.driver_profiles.find_one({"user_id": driver_id}, {"_id": 0, "trial_config": 1}) or {}
    print(f"driver_profiles.trial_config (raw) = {profile.get('trial_config')}")
    print(f"resolve_trial_config = {resolve_trial_config(profile)}")

    sub = await db.subscriptions.find_one(
        {"driver_id": driver_id, "status": {"$in": ["trial", "active", "grace_period", "pending_payment"]}},
        {"_id": 0, "status": 1, "trial_trips_target": 1, "trial_trips_completed": 1},
    )
    print(f"subscription doc = {sub}")

    snap = await compute_trial_snapshot(driver_id)
    print("---- LIVE compute_trial_snapshot ----")
    for k in (
        "trial_trips_completed",
        "trial_trips_target",
        "trial_trips_remaining",
        "trial_day_limit",
        "trial_days_remaining",
    ):
        print(f"  {k} = {snap.get(k)}")


if __name__ == "__main__":
    asyncio.run(main())

#!/usr/bin/env python3
"""Apply grandfather trial_config (e.g. loopy9ice@gmail.com → 20 trips, no day cap)."""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from driver_trial_policy import ensure_system_trial_defaults, seed_grandfathered_trial_configs


async def main() -> None:
    from database import db

    await db.command("ping")
    await ensure_system_trial_defaults()
    n = await seed_grandfathered_trial_configs()

    print(f"Grandfather trial configs updated: {n}")
    print("--- verification ---")
    for email in ("loopy9ice@gmail.com", "timothy_okunola@yahoo.com"):
        user = await db.users.find_one({"email": email}, {"_id": 0, "id": 1, "email": 1, "work_zone_early_access": 1})
        print(f"db.users.findOne({{ email: '{email}' }}, {{ id: 1 }})")
        print(user if user else "NOT FOUND")
        if user and user.get("id"):
            profile = await db.driver_profiles.find_one(
                {"user_id": user["id"]},
                {"_id": 0, "trial_config": 1},
            )
            sub = await db.subscriptions.find_one(
                {"driver_id": user["id"], "status": {"$in": ["active", "trial", "grace_period"]}},
                {"_id": 0, "status": 1, "trial_active": 1, "trial_trips_target": 1},
            )
            print(f'db.driver_profiles.findOne({{ user_id: "{user["id"]}" }}, {{ trial_config: 1 }})')
            print(profile if profile else "PROFILE NOT FOUND")
            print(sub if sub else "SUBSCRIPTION NOT FOUND")


if __name__ == "__main__":
    asyncio.run(main())

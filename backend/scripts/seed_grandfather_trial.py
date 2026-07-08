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

    user = await db.users.find_one({"email": "loopy9ice@gmail.com"}, {"_id": 0, "id": 1, "email": 1})
    print(f"Grandfather trial configs updated: {n}")
    print("--- verification ---")
    print("db.users.findOne({ email: 'loopy9ice@gmail.com' }, { id: 1 })")
    print(user if user else "NOT FOUND")
    if user and user.get("id"):
        profile = await db.driver_profiles.find_one(
            {"user_id": user["id"]},
            {"_id": 0, "trial_config": 1},
        )
        print(f'db.driver_profiles.findOne({{ user_id: "{user["id"]}" }}, {{ trial_config: 1 }})')
        print(profile if profile else "PROFILE NOT FOUND")


if __name__ == "__main__":
    asyncio.run(main())

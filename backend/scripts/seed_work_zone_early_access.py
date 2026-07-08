#!/usr/bin/env python3
"""
Grant Work Zone early-access flag to founding drivers (rollout when WORK_ZONE_ENABLED=false).

Usage:
  cd backend && python3 scripts/seed_work_zone_early_access.py
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from database import db

# Add Timmaj's email when known
EARLY_ACCESS_EMAILS = [
    "loopy9ice@gmail.com",
]


async def main() -> None:
    for email in EARLY_ACCESS_EMAILS:
        email_norm = email.strip().lower()
        result = await db.users.update_one(
            {"email": {"$regex": f"^{email_norm}$", "$options": "i"}},
            {"$set": {"work_zone_early_access": True}},
        )
        if result.matched_count:
            print(f"✓ early access: {email_norm}")
        else:
            print(f"✗ no user found: {email_norm}")


if __name__ == "__main__":
    asyncio.run(main())

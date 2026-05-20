#!/usr/bin/env python3
"""Unsuspend a NexRyde user by email (same logic as POST /admin/users/unsuspend-by-email)."""
import asyncio
import re
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from database import db  # noqa: E402


async def unsuspend_by_email(email: str, *, pardoned_by: str = "script") -> dict:
    raw = (email or "").strip()
    if not raw or "@" not in raw:
        raise ValueError("Valid email required")
    safe = re.escape(raw.lower())
    user = await db.users.find_one({"email": {"$regex": f"^{safe}$", "$options": "i"}})
    if not user:
        raise ValueError(f"No user found for {raw}")

    user_id = user["id"]
    now_iso = datetime.utcnow().isoformat()

    result = await db.users.update_one(
        {"id": user_id},
        {
            "$unset": {
                "suspended_until": "",
                "suspension_reason": "",
                "booking_blocked_until": "",
                "block_reason": "",
                "forced_offline_until": "",
                "deactivated_at": "",
                "deactivation_reason": "",
                "rider_cancellation_penalty_tier": "",
                "driver_cancellation_penalty_tier": "",
            },
            "$set": {
                "is_deactivated": False,
                "unsuspended_at": now_iso,
                "unsuspended_by": pardoned_by,
            },
        },
    )
    viol = await db.violations.update_many(
        {"user_id": user_id, "status": "active"},
        {"$set": {"status": "pardoned", "pardoned_at": now_iso, "pardoned_by": pardoned_by}},
    )
    prof = await db.driver_profiles.update_one(
        {"user_id": user_id},
        {
            "$unset": {"forced_offline_until": "", "suspended_reason": ""},
            "$set": {"is_online": False},
        },
    )

    return {
        "user_id": user_id,
        "email": user.get("email"),
        "role": user.get("role"),
        "matched": result.matched_count,
        "modified": result.modified_count,
        "violations_pardoned": viol.modified_count,
        "driver_profile_updated": prof.modified_count,
        "had_suspended_until": bool(user.get("suspended_until")),
        "had_is_deactivated": bool(user.get("is_deactivated")),
        "had_suspended_reason": user.get("suspension_reason") or user.get("suspended_reason"),
    }


async def main() -> None:
    email = sys.argv[1] if len(sys.argv) > 1 else ""
    if not email:
        print("Usage: python scripts/unsuspend_user_by_email.py user@example.com")
        sys.exit(1)
    try:
        out = await unsuspend_by_email(email)
        print("Unsuspended successfully:")
        for k, v in out.items():
            print(f"  {k}: {v}")
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())

#!/usr/bin/env python3
"""Verify Firebase Admin credentials and optionally send a test FCM message.

Usage:
  python backend/scripts/verify_fcm_push.py
  FCM_TEST_TOKEN=<device-token> python backend/scripts/verify_fcm_push.py
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


async def main() -> int:
    from dotenv import load_dotenv

    load_dotenv(ROOT / ".env")

    from notification_service import send_to_token, validate_firebase_admin_config

    try:
        status = validate_firebase_admin_config(require=True)
        print(f"PASS Firebase Admin initialized: {status.get('initialized')}")
    except Exception as exc:
        print(f"FAIL Firebase Admin initialized: {exc}")
        return 1

    token = os.environ.get("FCM_TEST_TOKEN", "").strip()
    if not token:
        print("SKIP FCM send: set FCM_TEST_TOKEN to send a live test notification")
        return 0

    ok, channel = await send_to_token(
        "fcm-smoke-test",
        token,
        "fcm",
        "NexRyde FCM test",
        "Firebase Cloud Messaging is configured correctly.",
        {
            "type": "admin_broadcast",
            "priority": "high",
            "channel_id": "engagement_high",
            "action": "open_app",
        },
    )
    if ok:
        print(f"PASS FCM send succeeded via {channel}")
        return 0
    print(f"FAIL FCM send failed via {channel}")
    return 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))

"""Server-side Work Zone configuration (env-tunable, no redeploy for cap tweaks)."""
from __future__ import annotations

import os
from typing import Any

# Feature flag — default OFF; early-access drivers can test when OFF.
WORK_ZONE_ENABLED = os.getenv("WORK_ZONE_ENABLED", "false").lower() in ("1", "true", "yes", "on")

# End-of-day expiry in West Africa Time (hour 0–23). Default 23:59 WAT ≈ hour 23.
WORK_ZONE_EXPIRY_HOUR_WAT = int(os.getenv("WORK_ZONE_EXPIRY_HOUR_WAT", "23"))

# Marketplace guardrails
WORK_ZONE_MAX_ZONED_SHARE = float(os.getenv("WORK_ZONE_MAX_ZONED_SHARE", "0.3"))
WORK_ZONE_MIN_ONLINE_DRIVERS = int(os.getenv("WORK_ZONE_MIN_ONLINE_DRIVERS", "5"))

# Comma-separated emails with rollout early access (global flag OFF still allows these).
_raw_early = os.getenv(
    "WORK_ZONE_EARLY_ACCESS_EMAILS",
    "loopy9ice@gmail.com",
)
WORK_ZONE_EARLY_ACCESS_EMAILS = {
    e.strip().lower() for e in _raw_early.split(",") if e.strip()
}

WORK_ZONE_MAX_AREAS = int(os.getenv("WORK_ZONE_MAX_AREAS", "4"))


def work_zone_public_config() -> dict[str, Any]:
    return {
        "enabled": WORK_ZONE_ENABLED,
        "included_with_subscription": True,
        "no_additional_fee": True,
        "expiry_hour_wat": WORK_ZONE_EXPIRY_HOUR_WAT,
        "max_areas": WORK_ZONE_MAX_AREAS,
        "max_zoned_share": WORK_ZONE_MAX_ZONED_SHARE,
        "min_online_drivers": WORK_ZONE_MIN_ONLINE_DRIVERS,
        "idle_suggestion_minutes": 30,
        "copy": {
            "title": "Work Zone",
            "subtitle": "Included with your NexRyde driver plan",
            "tagline": "Know your area. Know your money. Before you start your engine.",
            "subscription_note": (
                "No additional fee — included for every driver on an active trial or subscription."
            ),
        },
    }

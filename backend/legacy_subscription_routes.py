"""Compatibility shim for the retired /api/subscription/* routers (audit 7.1).

There used to be THREE conflicting trial models mounted at once:
  1. driver_trial_policy.py       — 15 trips / 14 days (per-driver config)  ← CANONICAL
  2. subscription_manager.py      — 24 h / 3 trips (stub handlers, fake "active" status)
  3. two_tier_subscription.py     — 48 h / 0 trips (wrote real db.subscriptions docs)

Models 2 and 3 are deleted. This shim keeps the old public paths answering:
  * GET /api/subscription/pricing            → canonical pricing + trial numbers
  * GET /api/subscription/status/{driver_id} → canonical live trial snapshot
  * everything else under /api/subscription  → 410 Gone (points to the real endpoint)
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from auth_guard import verify_owner_strict
from database import db

legacy_subscription_router = APIRouter(prefix="/api/subscription", tags=["subscription-legacy"])

_CANONICAL_STATUS_ENDPOINT = "/api/driver/subscription-status"


@legacy_subscription_router.get("/pricing")
async def legacy_pricing():
    """Canonical pricing — sourced from driver_trial_policy defaults (single source)."""
    from driver_trial_policy import get_trial_defaults

    defaults = await get_trial_defaults()
    return {
        "current_price": int(defaults["monthly_fee_ngn"]),
        "currency": "NGN",
        "trial_trip_limit": int(defaults["default_trial_trip_limit"]),
        "trial_day_limit": int(defaults["default_trial_day_limit"]),
        "early_subscribe_discount_ngn": int(defaults["early_subscribe_discount_ngn"]),
        "early_subscribe_first_month_fee_ngn": int(defaults["early_subscribe_first_month_fee_ngn"]),
        "source": "driver_trial_policy",
    }


@legacy_subscription_router.get("/status/{driver_id}")
async def legacy_subscription_status(driver_id: str, request: Request):
    """Redirect-in-place: answers with the CANONICAL trial snapshot."""
    verify_owner_strict(request, driver_id)
    from driver_trial_policy import compute_trial_snapshot

    subscription = await db.subscriptions.find_one(
        {"driver_id": driver_id}, {"_id": 0}, sort=[("created_at", -1)]
    )
    snapshot = await compute_trial_snapshot(driver_id, subscription)
    return {
        "driver_id": driver_id,
        "status": (subscription or {}).get("status", "none"),
        **snapshot,
        "legacy_route": True,
        "canonical_endpoint": _CANONICAL_STATUS_ENDPOINT,
    }


@legacy_subscription_router.api_route(
    "/{rest:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"]
)
async def legacy_subscription_gone(rest: str):
    raise HTTPException(
        status_code=410,
        detail=(
            "This subscription endpoint has been retired. "
            f"Use {_CANONICAL_STATUS_ENDPOINT} for status and "
            "/api/payment/subscription/initiate-checkout to subscribe."
        ),
    )

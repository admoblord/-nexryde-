"""Payments Router - Wallet, subscriptions, fare, tiers, promos, receipts for NEXRYDE."""
from __future__ import annotations

from fastapi import APIRouter, Body, HTTPException, Request
from fastapi.responses import JSONResponse, HTMLResponse
from pydantic import BaseModel, Field, ConfigDict
from typing import Any, Optional, List
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError
from datetime import datetime, timezone, timedelta
from uuid import uuid4
import logging
import os
import uuid
import math
import random
import re
import json
import base64
import httpx
import hashlib
import hmac

from squad_checkout_parse import (
    extract_squad_checkout_url,
    extract_squad_field,
    generate_nexryde_squad_transaction_ref,
    normalize_squad_transaction_ref,
    sanitize_squad_transaction_initiate_payload,
    squad_dynamic_va_response_ok,
    squad_initiate_response_ok,
    build_squad_checkout_url,
)
from database import db
from user_lookup import find_user_by_id, QUERY_MAX_TIME_MS
from fare_estimate_cache import save_fare_estimate
from fare_config import (
    FARE_CONFIG,
    NEXRYDE_DRIVER_PAYOUT_POLICY_NOTE,
    NEXRYDE_ESTIMATE_SURGE_MODEL,
    NEXRYDE_NATIONWIDE_POSITIONING_BULLETS,
    NEXRYDE_NATIONWIDE_POSITIONING_SUMMARY,
    normalize_fare_city_key,
)
from surge_pricing import SURGE_CONFIG, compute_max_style_surge_multiplier
from surge_demand import estimate_area_demand_ratio_near
from smart_pricing import (
    area_summary_line,
    build_route_preview_coordinates,
    fallback_fare_breakdown,
    region_for_preview,
    smart_bounds_from_base_price,
)
from auth_guard import verify_owner_strict, verify_trip_participant, require_authenticated
from admin_guard import require_admin_request
from security_advanced import general_limiter, verify_jwt_token
from route_cache import get_cached_directions, store_cached_directions, log_api_call, haversine_route_estimate
from routing_quality import is_directions_road_route

logger = logging.getLogger('server')
payments_router = APIRouter(prefix="/api", tags=["Payments"])
PAYSTACK_SECRET_KEY = os.environ.get("PAYSTACK_SECRET_KEY", "")
SQUAD_SECRET_KEY = os.environ.get("SQUAD_SECRET_KEY", "")
SQUAD_PUBLIC_KEY = os.environ.get("SQUAD_PUBLIC_KEY", "")
SQUAD_WEBHOOK_SECRET = os.environ.get("SQUAD_WEBHOOK_SECRET", "")
# Squad live: SQUAD_BASE_URL (default https://api-d.squadco.com), SQUAD_SECRET_KEY, SQUAD_PUBLIC_KEY.
# Optional: SQUAD_INITIATE_URL if checkout POST host differs; NEXRYDE_PUBLIC_BACKEND_URL for CallBack_URL.
# Live: https://api-d.squadco.com — NEVER use https://api.squadco.com (not the payment API).
def _normalize_squad_live_base(url: str) -> str:
    u = (url or "").strip().rstrip("/")
    if not u:
        return "https://api-d.squadco.com"
    if u.lower() in ("https://api.squadco.com", "http://api.squadco.com"):
        return "https://api-d.squadco.com"
    return u


SQUAD_BASE_URL = _normalize_squad_live_base(
    os.environ.get("SQUAD_BASE_URL", "https://api-d.squadco.com")
)
# Optional override if Squad uses a different host for inline checkout initiate.
SQUAD_INITIATE_URL = (os.environ.get("SQUAD_INITIATE_URL") or "").rstrip("/")
NEXRYDE_PUBLIC_URL = (
    os.environ.get("NEXRYDE_PUBLIC_BACKEND_URL")
    or os.environ.get("NEXRYDE_BACKEND_URL")
    or os.environ.get("PUBLIC_API_URL")
    or ""
).rstrip("/")
SQUAD_CALLBACK_URL = (os.environ.get("SQUAD_CALLBACK_URL") or "").strip()
# Controls the Squad inline checkout page base URL.
# Live:    https://pay.squadco.com   (default)
# Sandbox: https://sandbox-pay.squadco.com
SQUAD_CHECKOUT_BASE_URL = (os.environ.get("SQUAD_CHECKOUT_BASE_URL") or "").rstrip("/")
_SQUAD_IS_SANDBOX = "sandbox" in SQUAD_BASE_URL.lower()

def _squad_dynamic_va_duration_seconds() -> int:
    """Squad dynamic VA `duration` (seconds); minimum 60."""
    try:
        v = int(os.environ.get("SQUAD_DYNAMIC_VA_DURATION_SECONDS", "86400") or "86400")
    except (TypeError, ValueError):
        v = 86400
    return max(60, v)


def _squad_dynamic_va_pass_charge() -> bool:
    return os.environ.get("SQUAD_DYNAMIC_VA_PASS_CHARGE", "").strip().lower() in ("1", "true", "yes")

# Import shared functions (set at startup)
_get_directions_fn = None
_calculate_fare_fn = None
_calculate_distance_fn = None

def set_payments_shared_functions(get_directions, calc_fare, calc_distance):
    global _get_directions_fn, _calculate_fare_fn, _calculate_distance_fn
    _get_directions_fn = get_directions
    _calculate_fare_fn = calc_fare
    _calculate_distance_fn = calc_distance


def set_payments_fare_estimate_store(store):
    global fare_estimate_store
    fare_estimate_store = store

async def get_directions_from_google(
    p_lat, p_lng, d_lat, d_lng, trip_id: str = None, stop_lat=None, stop_lng=None
):
    """Cached wrapper — checks MongoDB + LRU before calling Google API."""
    has_stop = stop_lat is not None and stop_lng is not None
    try:
        if not has_stop:
            cached = await get_cached_directions(db, p_lat, p_lng, d_lat, d_lng)
        else:
            cached = await get_cached_directions(
                db, p_lat, p_lng, d_lat, d_lng, stop_lat=stop_lat, stop_lng=stop_lng
            )
        # Never serve haversine from cache — it blocks fare estimates when the client cannot
        # supply Directions (e.g. Android-restricted Maps keys on device REST calls).
        if cached and is_directions_road_route(cached):
            await log_api_call(db, call_type="directions", trip_id=trip_id, cached=True)
            return cached

        if _get_directions_fn:
            if has_stop:
                result = await _get_directions_fn(p_lat, p_lng, d_lat, d_lng, stop_lat=stop_lat, stop_lng=stop_lng)
            else:
                result = await _get_directions_fn(p_lat, p_lng, d_lat, d_lng)
            if result:
                if is_directions_road_route(result):
                    if has_stop:
                        await store_cached_directions(
                            db,
                            p_lat,
                            p_lng,
                            d_lat,
                            d_lng,
                            result,
                            stop_lat=stop_lat,
                            stop_lng=stop_lng,
                        )
                    else:
                        await store_cached_directions(db, p_lat, p_lng, d_lat, d_lng, result)
                await log_api_call(db, call_type="directions", trip_id=trip_id, cached=False)
                return result

        if has_stop:
            leg1 = haversine_route_estimate(p_lat, p_lng, stop_lat, stop_lng)
            leg2 = haversine_route_estimate(stop_lat, stop_lng, d_lat, d_lng)
            return {
                "distance_meters": int(leg1.get("distance_meters", 0)) + int(leg2.get("distance_meters", 0)),
                "duration_seconds": int(leg1.get("duration_seconds", 0)) + int(leg2.get("duration_seconds", 0)),
                "duration_in_traffic_seconds": int(leg1.get("duration_in_traffic_seconds", 0))
                + int(leg2.get("duration_in_traffic_seconds", 0)),
                "polyline": "",
                "source": "haversine",
            }
        return haversine_route_estimate(p_lat, p_lng, d_lat, d_lng)
    except Exception:
        logger.warning(
            "get_directions_from_google failed; using haversine fallback",
            exc_info=True,
        )
        if has_stop:
            leg1 = haversine_route_estimate(p_lat, p_lng, stop_lat, stop_lng)
            leg2 = haversine_route_estimate(stop_lat, stop_lng, d_lat, d_lng)
            return {
                "distance_meters": int(leg1.get("distance_meters", 0)) + int(leg2.get("distance_meters", 0)),
                "duration_seconds": int(leg1.get("duration_seconds", 0)) + int(leg2.get("duration_seconds", 0)),
                "duration_in_traffic_seconds": int(leg1.get("duration_in_traffic_seconds", 0))
                + int(leg2.get("duration_in_traffic_seconds", 0)),
                "polyline": "",
                "source": "haversine",
            }
        return haversine_route_estimate(p_lat, p_lng, d_lat, d_lng)

def calculate_fare(
    dist,
    dur,
    traffic,
    svc="economy",
    city="lagos",
    demand_ratio=0.0,
    is_raining=False,
    pickup_lat=None,
    pickup_lng=None,
    dropoff_lat=None,
    dropoff_lng=None,
    has_intermediate_stop=False,
):
    if _calculate_fare_fn:
        try:
            return _calculate_fare_fn(
                dist,
                dur,
                traffic,
                svc,
                city,
                demand_ratio,
                is_raining,
                pickup_lat,
                pickup_lng,
                dropoff_lat,
                dropoff_lng,
                has_intermediate_stop=bool(has_intermediate_stop),
            )
        except TypeError:
            try:
                return _calculate_fare_fn(dist, dur, traffic, svc, city)
            except TypeError:
                try:
                    return _calculate_fare_fn(dist, dur, traffic, svc)
                except Exception:
                    pass
        except Exception:
            logger.warning("injected calculate_fare failed; using fallback breakdown", exc_info=True)
    svc_n = (svc or "economy").strip().lower()
    if svc_n == "standard":
        svc_n = "economy"
    return fallback_fare_breakdown(
        float(dist),
        int(dur),
        int(traffic),
        city=city or "lagos",
        service_type=svc_n,
        has_intermediate_stop=bool(has_intermediate_stop),
    )

def calculate_distance_haversine(lat1, lon1, lat2, lon2):
    if _calculate_distance_fn:
        return _calculate_distance_fn(lat1, lon1, lat2, lon2)
    from math import radians, sin, cos, sqrt, atan2
    R = 6371
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat/2)**2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon/2)**2
    return R * 2 * atan2(sqrt(a), sqrt(1-a))

# Subscription config (static fallbacks — live trial defaults in system_config.driver_trial_defaults)
SUBSCRIPTION_CONFIG = {
    "monthly_fee": 18000,
    "trial_trips_target": 15,
    "trial_day_limit": 14,
    "currency": "NGN",
    "bank_details": {
        "provider": "SquadCo",
        "mode": "virtual_account_and_checkout",
        "message": "Each driver gets a dedicated virtual account (bank transfer) and optional Squad card checkout. Activation is automatic after verified payment.",
    }
}

# Surge config lives in surge_pricing.py (single source of truth).

fare_estimate_store = {}
# Fare estimate TTL — must match trip-side validation for locked quotes.
FARE_LOCK_MINUTES = 10
FARE_ADJUSTMENT_CONFIG = {
    "free_buffer_minutes": 5,
    "max_increase_percentage": 50,
    "time_rates": {
        "normal": 20,
        "peak": 25,
        "night": 30,
        "weekend": 25,
    },
    "weather_surcharges": {
        "heavy_rain": 0.10,
        "flooding": 0.15,
        "extreme_heat": 0.05,
    },
    "peak_hours": {
        "morning": {"start": 7, "end": 10},
        "evening": {"start": 16, "end": 20},
    },
    "night_hours": {"start": 22, "end": 5},
}


# Payment-specific models
class PaymentProofSubmission(BaseModel):
    driver_id: str
    screenshot: str
    amount: Optional[float] = None
    payment_reference: Optional[str] = None
    tier: Optional[str] = None

class CreateVirtualAccountRequest(BaseModel):
    driver_id: str
    plan_amount: float
    tier: Optional[str] = "city_rider"
    model_config = ConfigDict(extra="forbid")

class FareEstimateRequest(BaseModel):
    pickup_lat: float
    pickup_lng: float
    dropoff_lat: float
    dropoff_lng: float
    stop_lat: Optional[float] = None
    stop_lng: Optional[float] = None
    stop_address: Optional[str] = None
    service_type: Optional[str] = "economy"
    city: Optional[str] = "lagos"
    trip_type: Optional[str] = None
    pickup_address: Optional[str] = None
    dropoff_address: Optional[str] = None
    rider_id: Optional[str] = None  # supplied by frontend to check first-ride discount
    preferred_driver_id: Optional[str] = None  # if in rider favourites, favourite-driver fare perk may apply
    demand_ratio: Optional[float] = None  # 0–1 driver-busy proxy for surge tier
    rain: Optional[bool] = None  # when true, applies rain multiplier from surge_pricing
    # When server routing falls back to haversine (no Maps key / API error), validated client
    # Google Directions leg metrics replace straight-line distance for fare (see estimate_fare).
    google_route_distance_meters: Optional[float] = None
    google_route_duration_seconds: Optional[float] = None

    class Config:
        extra = "ignore"

class DriverTierUpgradeRequest(BaseModel):
    vehicle_year: int
    leather_seats: bool
    dual_ac: bool
    interior_photo: str
    exterior_photo: str

class GracePeriodRequest(BaseModel):
    reason: str
    days_requested: int = 3

class CreateSubscriptionRequest(BaseModel):
    payment_method: Optional[str] = None
    tier: Optional[str] = None


class SubscriptionCheckoutInitRequest(BaseModel):
    """Only tier is accepted; transaction_ref must never be sent by clients."""

    tier: Optional[str] = "city_rider"
    model_config = ConfigDict(extra="forbid")


class RiderWalletTopupAmountBody(BaseModel):
    """Rider (or any user) wallet top-up via Squad — amount in NGN. Ref is always server-generated."""

    amount: float = Field(..., gt=0)
    replace_pending: bool = False
    model_config = ConfigDict(extra="forbid")


class VerifyRiderWalletBody(BaseModel):
    """Optional reference; defaults to latest pending checkout for this user."""

    transaction_ref: Optional[str] = None
    model_config = ConfigDict(extra="forbid")


class WalletTopupInitKoboBody(BaseModel):
    amountKobo: int = Field(..., ge=50000, le=20000000)
    model_config = ConfigDict(extra="forbid")


class WalletReferenceBody(BaseModel):
    reference: str = Field(..., min_length=6)
    model_config = ConfigDict(extra="forbid")


class VerifySubscriptionCheckoutBody(BaseModel):
    """Optional Squad ref; defaults to latest pending subscription checkout for this driver."""

    transaction_ref: Optional[str] = None
    model_config = ConfigDict(extra="forbid")


class WalletRefundRequestBody(BaseModel):
    user_id: str = Field(..., min_length=8)
    transaction_id: str = Field(..., min_length=8)
    reason: str = Field(..., min_length=3, max_length=300)
    idempotency_key: Optional[str] = Field(default=None, min_length=6, max_length=120)
    model_config = ConfigDict(extra="forbid")


CITY_RIDER_PRICES = {
    "launch": 15000,  # first 500 drivers
    "early": 18000,
    "growth": 18000,
    "premium": 18000,
}

ROAD_WARRIOR_PRICES = {
    "launch": 30000,
    "early": 30000,
    "growth": 35000,
    "premium": 40000,
}

CITY_RIDER_LAUNCH_LIMIT = 500
ROAD_WARRIOR_LAUNCH_LIMIT = 200


async def _get_dynamic_tier_price(tier: str) -> int:
    config = await db.system_config.find_one({"key": "subscription_pricing"})
    current_phase = (config or {}).get("current_phase", "early")
    city_riders_count = int((config or {}).get("city_riders_count", 0))
    road_warriors_count = int((config or {}).get("road_warriors_count", 0))

    if tier == "road_warrior":
        if road_warriors_count < ROAD_WARRIOR_LAUNCH_LIMIT:
            return ROAD_WARRIOR_PRICES["launch"]
        return ROAD_WARRIOR_PRICES.get(current_phase, ROAD_WARRIOR_PRICES["early"])

    # Default: city rider
    if city_riders_count < CITY_RIDER_LAUNCH_LIMIT:
        return CITY_RIDER_PRICES["launch"]
    return CITY_RIDER_PRICES.get(current_phase, CITY_RIDER_PRICES["early"])


async def _assert_driver_account(driver_id: str):
    """Ensure subscription endpoints are only used by driver accounts."""
    user = await find_user_by_id(driver_id, {"_id": 0, "id": 1, "role": 1})
    profile = await db.driver_profiles.find_one(
        {"user_id": driver_id},
        {"_id": 0, "user_id": 1},
        max_time_ms=QUERY_MAX_TIME_MS,
    )
    if profile or (user and user.get("role") == "driver"):
        return
    raise HTTPException(status_code=403, detail="Driver account required")


async def _assert_wallet_user_exists(user_id: str):
    user = await find_user_by_id(user_id, {"_id": 0, "id": 1})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")


async def _rider_wallet_topup_idempotent(
    user_id: str,
    amount: float,
    reference: str,
    payment_method: str,
    verify_result: dict,
    webhook_payload: Optional[dict] = None,
) -> dict:
    """Credit wallet once per reference; used by Squad webhook and verify-pending."""
    existing = await db.transactions.find_one(
        {
            "user_id": user_id,
            "reference": reference,
            "type": {"$in": ["topup", "credit"]},
        }
    )
    if existing:
        user = await db.users.find_one({"id": user_id})
        return {"duplicate": True, "new_balance": (user or {}).get("wallet_balance", 0)}
    await db.transactions.insert_one(
        {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "type": "credit",
            "source": "squad",
            "amount": amount,
            "status": "success",
            "timestamp": datetime.utcnow(),
            "payment_method": payment_method,
            "reference": reference,
            "provider": "squad",
            "provider_verification": verify_result,
            "webhook_payload": webhook_payload,
        }
    )
    await db.users.update_one({"id": user_id}, {"$inc": {"wallet_balance": amount}})
    user = await db.users.find_one({"id": user_id})
    return {"duplicate": False, "new_balance": (user or {}).get("wallet_balance", amount)}


def _intent_is_expired(intent: Optional[dict]) -> bool:
    if not intent:
        return False
    exp = intent.get("expires_at")
    if isinstance(exp, datetime):
        return _to_utc_naive(exp) <= datetime.utcnow()
    created = intent.get("created_at")
    if isinstance(created, datetime):
        return _to_utc_naive(created) <= datetime.utcnow() - timedelta(minutes=30)
    return False


def _extract_paid_kobo_from_verify_result(verify_result: dict) -> Optional[int]:
    raw = verify_result.get("raw") if isinstance(verify_result, dict) else {}
    data = raw.get("data") if isinstance(raw, dict) else {}
    value = None
    if isinstance(data, dict):
        value = data.get("transaction_amount") or data.get("amount_paid") or data.get("amount")
    if value is None and isinstance(raw, dict):
        value = raw.get("amount_paid") or raw.get("amount")
    if value is None:
        paid_amount = verify_result.get("paid_amount")
        try:
            if paid_amount is not None:
                return int(round(float(paid_amount) * 100))
        except Exception:
            return None
        return None
    try:
        as_float = float(value)
    except Exception:
        return None
    # Squad verify normally returns kobo integer-like values.
    if as_float > 10000:
        return int(round(as_float))
    return int(round(as_float * 100))


async def _expire_stale_wallet_payment_intents(user_id: Optional[str] = None) -> int:
    now = datetime.utcnow()
    expired_cutoff = now - timedelta(minutes=30)
    stuck_cutoff = now - timedelta(minutes=5)

    # Expire old pending intents
    q_expire: dict = {"status": "pending", "created_at": {"$lt": expired_cutoff}}
    if user_id:
        q_expire["user_id"] = user_id
    res = await db.wallet_payment_intents.update_many(
        q_expire,
        {"$set": {"status": "expired", "updated_at": now, "failed_reason": "expired"}},
    )

    # Reset stuck "processing" intents back to "pending" so future verify calls can find them.
    # Processing intents older than 5 min means the prior verify attempt failed (Squad not confirmed yet).
    q_stuck: dict = {"status": "processing", "updated_at": {"$lt": stuck_cutoff}}
    if user_id:
        q_stuck["user_id"] = user_id
    await db.wallet_payment_intents.update_many(
        q_stuck,
        {"$set": {"status": "pending", "updated_at": now, "_processing_reset_at": now.isoformat()}},
    )

    return int(res.modified_count)


async def _credit_wallet_checkout_intent(
    *,
    intent: dict,
    verify_result: dict,
    webhook_payload: Optional[dict] = None,
    source: str = "verify_pending",
) -> dict:
    intent_id = str(intent.get("id") or "")
    if not intent_id:
        return {"credited": False, "duplicate": False, "reason": "missing_intent_id"}

    if hasattr(db.wallet_payment_intents, "find_one_and_update"):
        # Accept both "pending" and "processing" so stuck intents (Squad not confirmed on
        # a prior verify attempt) are retried instead of raising intent_not_pending.
        fresh = await db.wallet_payment_intents.find_one_and_update(
            {"id": intent_id, "status": {"$in": ["pending", "processing"]}},
            {"$set": {"status": "processing", "updated_at": datetime.utcnow()}},
            return_document=ReturnDocument.BEFORE,
        )
        if not fresh:
            fresh2 = await db.wallet_payment_intents.find_one({"id": intent_id})
            if fresh2 and (fresh2.get("status") == "completed" or fresh2.get("credited_at")):
                user = await db.users.find_one({"id": fresh2.get("user_id")})
                return {
                    "credited": False,
                    "duplicate": True,
                    "new_balance": float((user or {}).get("wallet_balance") or 0),
                }
            return {"credited": False, "duplicate": False, "reason": "intent_not_pending"}
    else:
        fresh = await db.wallet_payment_intents.find_one({"id": intent_id})
    if not fresh:
        return {"credited": False, "duplicate": False, "reason": "intent_not_found"}
    status = str(fresh.get("status") or "pending")
    if status == "completed" or fresh.get("credited_at"):
        user = await db.users.find_one({"id": fresh.get("user_id")})
        return {"credited": False, "duplicate": True, "new_balance": float((user or {}).get("wallet_balance") or 0)}
    if status in {"cancelled", "failed", "expired"}:
        ledger_status = "cancelled" if status == "cancelled" else "failed"
        await _upsert_wallet_topup_transaction(
            user_id=str(fresh.get("user_id") or ""),
            amount_ngn=float(fresh.get("amount_ngn") or 0),
            transaction_ref=str(fresh.get("transaction_ref") or ""),
            status=ledger_status,
        )
        return {"credited": False, "duplicate": False, "reason": f"intent_{status}"}
    if _intent_is_expired(fresh):
        await db.wallet_payment_intents.update_one(
            {"id": fresh["id"], "status": "pending"},
            {
                "$set": {
                    "status": "expired",
                    "updated_at": datetime.utcnow(),
                    "failed_reason": "expired",
                    "failure_reason": "expired",
                }
            },
        )
        await _upsert_wallet_topup_transaction(
            user_id=str(fresh.get("user_id") or ""),
            amount_ngn=float(fresh.get("amount_ngn") or 0),
            transaction_ref=str(fresh.get("transaction_ref") or ""),
            status="failed",
        )
        return {"credited": False, "duplicate": False, "reason": "intent_expired"}

    if not verify_result or not verify_result.get("verified"):
        # Squad hasn't confirmed yet — reset intent from "processing" back to "pending"
        # so the next verify attempt (user taps "Verify Payment" again) can find it.
        await db.wallet_payment_intents.update_one(
            {"id": intent_id, "status": "processing"},
            {"$set": {"status": "pending", "updated_at": datetime.utcnow(), "_last_verify_failed_at": datetime.utcnow().isoformat()}},
        )
        return {"credited": False, "duplicate": False, "reason": "squad_not_confirmed_yet"}

    tx_ref = str(fresh.get("transaction_ref") or "")
    if tx_ref:
        prior = await db.transactions.find_one(
            {
                "reference": tx_ref,
                "user_id": fresh.get("user_id"),
                "type": "credit",
                "status": "success",
            }
        )
        if prior:
            user = await db.users.find_one({"id": fresh.get("user_id")})
            await db.wallet_payment_intents.update_one(
                {"id": fresh["id"], "status": {"$in": ["pending", "processing"]}},
                {
                    "$set": {
                        "status": "completed",
                        "credited_at": prior.get("timestamp") or datetime.utcnow(),
                        "completed_at": prior.get("timestamp") or datetime.utcnow(),
                        "updated_at": datetime.utcnow(),
                        "verify_payload": verify_result,
                    }
                },
            )
            logger.info(
                "WALLET CREDIT SOURCE: %s (already_credited_tx) %s",
                source,
                tx_ref,
            )
            return {
                "credited": False,
                "duplicate": True,
                "new_balance": float((user or {}).get("wallet_balance") or 0),
            }

    expected_kobo = int(fresh.get("amount_kobo") or 0)
    paid_kobo = _extract_paid_kobo_from_verify_result(verify_result)
    if expected_kobo <= 0 or paid_kobo is None or paid_kobo != expected_kobo:
        await db.wallet_payment_intents.update_one(
            {"id": fresh["id"]},
            {
                "$set": {
                    "status": "failed",
                    "failed_reason": "amount_mismatch",
                    "failure_reason": "amount_mismatch",
                    "updated_at": datetime.utcnow(),
                    "verify_payload": verify_result,
                }
            },
        )
        await _upsert_wallet_topup_transaction(
            user_id=str(fresh.get("user_id") or ""),
            amount_ngn=float(fresh.get("amount_ngn") or 0),
            transaction_ref=str(fresh.get("transaction_ref") or ""),
            status="failed",
        )
        return {"credited": False, "duplicate": False, "reason": "amount_mismatch"}

    amount_ngn = round(expected_kobo / 100.0, 2)
    tx_doc = {
        "id": str(uuid.uuid4()),
        "user_id": fresh.get("user_id"),
        "type": "credit",
        "direction": "credit",
        "source": "squad",
        "amount": amount_ngn,
        "amount_kobo": expected_kobo,
        "status": "success",
        "timestamp": datetime.utcnow(),
        "payment_method": "squad_checkout",
        "reference": str(fresh.get("transaction_ref") or ""),
        "provider": "squad",
        "provider_verification": verify_result,
        "webhook_payload": webhook_payload,
        "payment_intent_id": fresh.get("id"),
        "description": f"Top-up via Squad ({source})",
    }
    try:
        await db.transactions.insert_one(tx_doc)
    except DuplicateKeyError:
        user = await db.users.find_one({"id": fresh.get("user_id")})
        logger.info(
            "WALLET CREDIT SOURCE: %s (duplicate_key) %s",
            source,
            str(fresh.get("transaction_ref") or ""),
        )
        return {"credited": False, "duplicate": True, "new_balance": float((user or {}).get("wallet_balance") or 0)}

    logger.info(
        "WALLET CREDIT SOURCE: %s %s",
        source,
        str(fresh.get("transaction_ref") or ""),
    )
    await db.users.update_one({"id": fresh.get("user_id")}, {"$inc": {"wallet_balance": amount_ngn}})
    await db.wallet_payment_intents.update_one(
        {"id": fresh.get("id")},
        {
            "$set": {
                "status": "completed",
                "paid_amount_ngn": amount_ngn,
                "paid_amount_kobo": expected_kobo,
                "completed_at": datetime.utcnow(),
                "credited_at": datetime.utcnow(),
                "verify_payload": verify_result,
                "webhook_payload": webhook_payload,
                "updated_at": datetime.utcnow(),
            }
        },
    )
    await _upsert_wallet_topup_transaction(
        user_id=str(fresh.get("user_id") or ""),
        amount_ngn=float(amount_ngn),
        transaction_ref=str(fresh.get("transaction_ref") or ""),
        status="success",
    )
    user = await db.users.find_one({"id": fresh.get("user_id")})
    return {"credited": True, "duplicate": False, "new_balance": float((user or {}).get("wallet_balance") or 0)}


async def _ensure_auto_trial_for_verified_driver(driver_id: str) -> Optional[dict]:
    """Auto-provision trial once driver verification is complete (per-driver trial_config).

    Gate matches go-online: ``verification_status == approved`` and ``documents_verified``.
    ``profile_completed`` alone must not block trial — admin-approved drivers with docs
    verified should be able to Activate / go online without a stuck "Activate to Drive".
    """
    existing = await db.subscriptions.find_one({"driver_id": driver_id}, sort=[("created_at", -1)])
    if existing:
        return existing

    profile = await db.driver_profiles.find_one(
        {"user_id": driver_id},
        {
            "_id": 0,
            "verification_status": 1,
            "documents_verified": 1,
            "profile_completed": 1,
            "trial_config": 1,
        },
    ) or {}
    is_verified = (
        profile.get("verification_status") == "approved"
        and bool(profile.get("documents_verified"))
    )
    if not is_verified:
        return None

    from driver_trial_policy import ensure_profile_trial_config

    cfg = await ensure_profile_trial_config(driver_id, profile)
    now = datetime.utcnow()
    city_price = await _get_dynamic_tier_price("city_rider")
    trial_doc = {
        "id": str(uuid.uuid4()),
        "driver_id": driver_id,
        "amount": city_price,
        "tier": "city_rider",
        "status": "trial",
        "start_date": now,
        "trial_start_date": now,
        "trial_trips_target": int(cfg["trip_limit"]),
        "trial_day_limit": cfg.get("day_limit"),
        "trial_trips_completed": 0,
        "trial_completed": False,
        "trial_active": True,
        "is_trial": True,
        "created_at": now,
        "updated_at": now,
    }
    await db.subscriptions.insert_one(trial_doc)
    logger.info(
        "Trial activated for verified driver=%s trips=%s days=%s",
        driver_id,
        cfg["trip_limit"],
        cfg.get("day_limit"),
    )
    return trial_doc


async def _evaluate_driver_trial(driver_id: str, subscription: dict) -> dict:
    """Delegate to driver_trial_policy (trips + day limits, per-driver config)."""
    from driver_trial_policy import evaluate_driver_trial

    return await evaluate_driver_trial(driver_id, subscription)


def _extract_data_url_payload(data_url: str) -> tuple[str, bytes]:
    if not data_url.startswith("data:image"):
        raise HTTPException(status_code=400, detail="Screenshot must be a valid base64 image")

    try:
        header, encoded = data_url.split(",", 1)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid screenshot format") from exc

    mime_match = re.search(r"data:(image\/[a-zA-Z0-9.+-]+);base64", header)
    if not mime_match:
        raise HTTPException(status_code=400, detail="Invalid screenshot image type")

    mime_type = mime_match.group(1)
    try:
        image_bytes = base64.b64decode(encoded)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Could not decode screenshot image") from exc

    if len(image_bytes) < 1024:
        raise HTTPException(status_code=400, detail="Screenshot image looks invalid or too small")

    return mime_type, image_bytes


def _normalize_amount(value: Optional[float]) -> Optional[float]:
    if value is None:
        return None
    return round(float(value), 2)


def _naira_to_kobo(amount_ngn: float) -> int:
    return int(round(float(amount_ngn) * 100))


def _coerce_squad_paid_to_ngn(paid: Optional[float], expected_ngn: float) -> Optional[float]:
    """Squad often returns amounts in kobo; virtual-account flow stores NGN."""
    if paid is None:
        return None
    p = float(paid)
    e = float(expected_ngn)
    if e <= 0:
        return round(p / 100.0, 2) if p > 1000 else round(p, 2)
    if abs(p - e) <= max(0.05, e * 0.002):
        return round(e, 2)
    if abs(p / 100.0 - e) <= max(0.05, e * 0.002):
        return round(e, 2)
    if p > e * 50:
        return round(p / 100.0, 2)
    return round(p, 2)


def _wallet_intent_ref_candidates(ref: Optional[str]) -> list[str]:
    """Match DB transaction_ref (alnum + underscore) and rare raw variants."""
    if not ref or not str(ref).strip():
        return []
    raw = str(ref).strip()
    cleaned = "".join(c for c in raw if c.isalnum() or c == "_")
    out: list[str] = []
    for x in (raw, cleaned):
        if x and x not in out:
            out.append(x)
    return out


def _squad_event_status_success(event_status: Any) -> bool:
    return str(event_status or "").strip().lower() in {
        "success",
        "successful",
        "paid",
        "completed",
        "complete",
        "approved",
    }


def _reconcile_squad_amount_with_intent(
    expected_amount: Optional[float],
    paid_raw: Optional[float],
    *,
    verify_ok: bool,
) -> Optional[float]:
    """
    Map Squad-reported amount to our intent NGN. When verify_ok, trust intent amount if API omits amount
    or differs slightly (fees / kobo rounding), so wallet and subscription activate after dashboard success.
    """
    if expected_amount is None:
        return None
    e = round(float(expected_amount), 2)
    coerced = _coerce_squad_paid_to_ngn(paid_raw, e)
    if coerced is not None and abs(coerced - e) <= max(0.01, max(0.05, e * 0.002)):
        return e
    if verify_ok:
        if coerced is None:
            logger.info("Squad reconcile: verify ok, no paid amount — using expected NGN %s", e)
            return e
        if abs(coerced - e) <= max(5.0, e * 0.02):
            logger.info("Squad reconcile: verify ok, paid=%s expected=%s — using expected", coerced, e)
            return e
    return None


def _to_utc_naive(dt_value: datetime) -> datetime:
    if dt_value.tzinfo:
        return dt_value.astimezone(timezone.utc).replace(tzinfo=None)
    return dt_value


_extract_squad_field = extract_squad_field


def _squad_headers() -> dict:
    return {
        "Authorization": f"Bearer {SQUAD_SECRET_KEY}",
        "Content-Type": "application/json",
    }


_squad_extract_checkout_url = extract_squad_checkout_url


def _resolve_squad_checkout_url(provider_payload: dict, data: dict, transaction_ref: str) -> str:
    """Return the Squad checkout URL for a given transaction.

    Priority:
    1. URL explicitly returned by Squad in the initiate response (only if Squad domain).
    2. SQUAD_CHECKOUT_BASE_URL env var override (e.g. for sandbox).
    3. Constructed URL from known Squad inline checkout pattern:
       https://pay.squadco.com/{transaction_ref}

    The callback URL (our own backend URL) is NEVER used as a checkout URL.
    """
    # 1. Try Squad's response
    from_response = _squad_extract_checkout_url(provider_payload, data)
    if from_response:
        return from_response

    # 2. Env-var override
    if SQUAD_CHECKOUT_BASE_URL:
        return f"{SQUAD_CHECKOUT_BASE_URL}/{transaction_ref}"

    # 3. Construct from well-known Squad URL pattern
    return build_squad_checkout_url(transaction_ref, sandbox=_SQUAD_IS_SANDBOX)


async def _verify_squad_transaction(reference: str) -> dict:
    if not SQUAD_SECRET_KEY:
        return {"verified": False, "reason": "SQUAD_SECRET_KEY not configured", "provider": "squad"}
    if not reference:
        return {"verified": False, "reason": "Missing reference", "provider": "squad"}

    verify_url = f"{SQUAD_BASE_URL}/transaction/verify/{reference}"
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.get(verify_url, headers=_squad_headers())
            status_code = response.status_code
            try:
                payload = response.json()
            except Exception:
                payload = {}
    except Exception as exc:
        return {"verified": False, "reason": f"Squad verify request failed: {str(exc)}", "provider": "squad"}

    data = payload.get("data") if isinstance(payload, dict) else {}
    data = data if isinstance(data, dict) else {}
    # Paid-success must come from a real transaction status field, not HTTP 200 or message text alone.
    status_value = data.get("transaction_status") or data.get("status")
    if status_value is None and isinstance(payload, dict):
        status_value = payload.get("status")
    status_norm = str(status_value or "").strip().lower()
    if status_norm.isdigit():
        status_norm = ""
    success_statuses = {"success", "successful", "paid", "completed", "complete", "approved"}

    amount_raw = (
        data.get("transaction_amount")
        or data.get("amount")
        or _extract_squad_field(payload, "transaction_amount", "amount")
    )
    try:
        paid_amount = round(float(amount_raw), 2) if amount_raw is not None else None
    except Exception:
        paid_amount = None

    verified = status_norm in success_statuses

    return {
        "verified": verified,
        "provider": "squad",
        "provider_status": status_value,
        "paid_amount": paid_amount,
        "currency": data.get("transaction_currency_id") or data.get("currency") or "NGN",
        "http_status": status_code,
        "raw": payload,
    }


async def _read_driver_subscription_flags(driver_id: str) -> dict:
    """Read-only subscription flags for GET endpoints — no writes on read."""
    user = await find_user_by_id(
        driver_id,
        {"_id": 0, "subscription_active": 1, "subscription_expiry": 1},
    ) or {}
    expiry = user.get("subscription_expiry")
    if isinstance(expiry, datetime):
        expiry = expiry.isoformat()
    return {
        "subscription_active": bool(user.get("subscription_active")),
        "subscription_expiry": expiry,
    }


async def _sync_driver_subscription_flags(driver_id: str) -> dict:
    now = datetime.utcnow()
    subscription = await db.subscriptions.find_one({"driver_id": driver_id}, sort=[("created_at", -1)])
    subscription_active = False
    expiry = None

    if subscription:
        status = subscription.get("status")
        expiry = subscription.get("end_date")
        if isinstance(expiry, str):
            try:
                expiry = datetime.fromisoformat(expiry.replace("Z", "+00:00")).replace(tzinfo=None)
            except Exception:
                expiry = None
        if isinstance(expiry, datetime):
            expiry = _to_utc_naive(expiry)

        if status == "trial":
            # Activity-based trial: active while trips < target.
            evaluated = await _evaluate_driver_trial(driver_id, subscription)
            status = evaluated.get("status", "trial")
            subscription_active = status == "trial"
        elif status in {"active", "grace_period"}:
            if expiry and expiry <= now:
                await db.subscriptions.update_one(
                    {"id": subscription.get("id")},
                    {"$set": {"status": "expired", "updated_at": now}},
                )
                status = "expired"
            subscription_active = status in {"active", "grace_period"}
        else:
            subscription_active = False

    await db.users.update_one(
        {"id": driver_id},
        {"$set": {"subscription_active": subscription_active, "subscription_expiry": expiry}},
    )
    await db.driver_profiles.update_one(
        {"user_id": driver_id},
        {"$set": {"subscription_active": subscription_active, "subscription_expiry": expiry}},
        upsert=True,
    )
    if not subscription_active:
        await db.driver_profiles.update_one({"user_id": driver_id}, {"$set": {"is_online": False}})

    return {
        "subscription_active": subscription_active,
        "subscription_expiry": expiry.isoformat() if isinstance(expiry, datetime) else None,
    }


async def _verify_reference_with_paystack(reference: str, expected_amount: float) -> dict:
    if not PAYSTACK_SECRET_KEY:
        return {"verified": False, "reason": "PAYSTACK_SECRET_KEY not configured", "provider": "paystack"}

    url = f"https://api.paystack.co/transaction/verify/{reference}"
    headers = {"Authorization": f"Bearer {PAYSTACK_SECRET_KEY}"}

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(url, headers=headers)
            payload = response.json()
    except Exception as exc:
        return {"verified": False, "reason": f"Paystack verification failed: {str(exc)}", "provider": "paystack"}

    data = payload.get("data", {})
    status_ok = payload.get("status") is True and data.get("status") == "success"
    paid_kobo = data.get("amount")
    paid_ngn = round((paid_kobo or 0) / 100, 2) if isinstance(paid_kobo, (int, float)) else None
    amount_match = paid_ngn is not None and abs(paid_ngn - expected_amount) <= 500

    return {
        "verified": bool(status_ok and amount_match),
        "provider": "paystack",
        "provider_status": data.get("status"),
        "paid_amount": paid_ngn,
        "currency": data.get("currency"),
        "amount_match": amount_match,
        "gateway_response": data.get("gateway_response"),
    }


# Tier config (matches fare_config.py / server.calculate_fare)
TIER_CONFIG = {
    "basic": {
        "name": "NEXRYDE Basic",
        "monthly_fee": 18000,
        "earning_per_ride": {"min": 200, "max": 300},
        "commission": 0.15,
        "requirements": {"vehicle_year_min": None, "leather_seats": False, "dual_ac": False, "min_rating": 4.3},
        "color": "#C9A9A6",
        "benefits": ["Standard rides"],
    },
    "premium": {
        "name": "NEXRYDE Premium",
        "monthly_fee": 18000,
        "earning_per_ride": {"min": 300, "max": 450},
        "commission": 0.10,
        "requirements": {"vehicle_year_min": 2018, "leather_seats": True, "dual_ac": True, "min_rating": 4.7, "premium_training": True},
        "color": "#D4AF37",
        "benefits": ["Priority support", "Early access to new features", "Free vehicle inspection vouchers", "Premium Driver badge"],
    },
    "silver": {"name": "Silver", "min_trips": 50, "commission": 0.12, "monthly_fee": 18000, "earning_per_ride": {"min": 250, "max": 350}, "benefits": ["Priority dispatch", "5% bonus"]},
    "gold": {"name": "Gold", "min_trips": 200, "commission": 0.10, "monthly_fee": 18000, "earning_per_ride": {"min": 300, "max": 400}, "benefits": ["Priority dispatch", "10% bonus", "Insurance"]},
    "platinum": {"name": "Platinum", "min_trips": 500, "commission": 0.08, "monthly_fee": 18000, "earning_per_ride": {"min": 350, "max": 450}, "benefits": ["VIP dispatch", "15% bonus", "Full Insurance"]},
    "diamond": {"name": "Diamond", "min_trips": 1000, "commission": 0.05, "monthly_fee": 18000, "earning_per_ride": {"min": 400, "max": 500}, "benefits": ["VIP everything", "20% bonus"]},
}

# Legacy flat fare table (kept for backward compatibility helpers only).
# IMPORTANT: do not shadow imported `fare_config.FARE_CONFIG` used by surge caps.
LEGACY_FARE_CONFIG = {
    "standard": {"base": 300, "per_km": 100, "per_min": 20, "min_fare": 700},
    "economy": {"base": 300, "per_km": 100, "per_min": 20, "min_fare": 700},
    "comfort": {"base": 500, "per_km": 150, "per_min": 30, "min_fare": 1000},
    "premium": {"base": 800, "per_km": 200, "per_min": 40, "min_fare": 1500},
    "xl": {"base": 600, "per_km": 170, "per_min": 35, "min_fare": 1200},
}

# ==================== SUBSCRIPTION ENDPOINTS ====================
async def _assert_driver_can_activate_subscription(driver_id: str):
    profile = await db.driver_profiles.find_one({"user_id": driver_id}) or {}
    if not profile.get("documents_verified") or profile.get("verification_status") != "approved":
        raise HTTPException(
            status_code=403,
            detail="Driver documents must be approved before subscription or payment activation.",
        )


async def _road_warrior_upgrade_requirements(driver_id: str) -> dict:
    user = await find_user_by_id(
        driver_id,
        {"_id": 0, "rating": 1, "total_trips": 1},
    ) or {}
    rating = float(user.get("rating") or 0)
    trips = int(user.get("total_trips") or 0)
    return {
        "rating_met": rating >= 4.5,
        "trips_met": trips >= 50,
        "current_rating": rating,
        "current_trips": trips,
    }


async def _assert_subscription_tier_allowed(driver_id: str, tier: str):
    if tier != "road_warrior":
        return
    requirements = await _road_warrior_upgrade_requirements(driver_id)
    if not requirements["rating_met"] or not requirements["trips_met"]:
        raise HTTPException(
            status_code=403,
            detail="Road Warrior unlocks after 50 trips and a 4.5+ driver rating.",
        )


@payments_router.get("/subscriptions/config")
async def get_subscription_config():
    """Get subscription configuration including dynamic tier pricing."""
    city_rider_price = await _get_dynamic_tier_price("city_rider")
    road_warrior_price = await _get_dynamic_tier_price("road_warrior")

    # Determine phase + slot counts for display
    config = await db.system_config.find_one({"key": "subscription_pricing"})
    current_phase = (config or {}).get("current_phase", "early")
    city_riders_count = int((config or {}).get("city_riders_count", 0))
    road_warriors_count = int((config or {}).get("road_warriors_count", 0))
    city_slots = max(0, CITY_RIDER_LAUNCH_LIMIT - city_riders_count)
    road_slots = max(0, ROAD_WARRIOR_LAUNCH_LIMIT - road_warriors_count)

    return {
        # Legacy field — kept so existing clients using city_rider price don't break
        "monthly_fee": city_rider_price,
        "current_price": city_rider_price,
        "current_phase": current_phase,
        "launch_slots_remaining": city_slots,
        # Explicit per-tier pricing
        "city_rider_price": city_rider_price,
        "city_rider_phase": current_phase,
        "city_rider_launch_slots_remaining": city_slots,
        "road_warrior_price": road_warrior_price,
        "road_warrior_phase": current_phase,
        "road_warrior_launch_slots_remaining": road_slots,
        "currency": SUBSCRIPTION_CONFIG["currency"],
        "bank_details": SUBSCRIPTION_CONFIG["bank_details"],
        **(await _trial_config_for_api()),
    }


async def _trial_config_for_api() -> dict:
    from driver_trial_policy import get_trial_defaults

    defaults = await get_trial_defaults()
    return {
        "trial_trips_target": int(defaults["default_trial_trip_limit"]),
        "trial_day_limit": defaults.get("default_trial_day_limit"),
        "monthly_fee_ngn": int(defaults["monthly_fee_ngn"]),
        "early_subscribe_discount_ngn": int(defaults["early_subscribe_discount_ngn"]),
        "early_subscribe_first_month_fee_ngn": int(defaults["early_subscribe_first_month_fee_ngn"]),
    }


@payments_router.post("/payment/create-virtual-account")
async def create_virtual_account(request: CreateVirtualAccountRequest, http_request: Request):
    verify_owner_strict(http_request, request.driver_id)
    await _assert_driver_account(request.driver_id)
    await _assert_driver_can_activate_subscription(request.driver_id)
    await _assert_subscription_tier_allowed(request.driver_id, request.tier or "city_rider")

    if request.plan_amount <= 0:
        raise HTTPException(status_code=400, detail="plan_amount must be greater than zero")
    if not SQUAD_SECRET_KEY:
        raise HTTPException(status_code=500, detail="Squad payment service is not configured")

    driver = await db.users.find_one({"id": request.driver_id}) or {}
    profile = await db.driver_profiles.find_one({"user_id": request.driver_id}) or {}
    full_name_raw = (
        profile.get("full_name")
        or driver.get("name")
        or "NEXRYDE Driver"
    ).strip()
    full_name = _squad_require_customer_name_for_va(full_name_raw)
    email = _squad_require_va_email(driver.get("email") or f"{request.driver_id}@nexryde.app")

    tier = request.tier or "city_rider"
    base_amount = float(await _get_dynamic_tier_price(tier))
    from driver_trial_policy import resolve_subscription_checkout_amount

    amount_expected, _discount_meta = await resolve_subscription_checkout_amount(
        request.driver_id, tier, base_amount
    )
    amount_expected = round(float(amount_expected), 2)
    amount_kobo = int(round(amount_expected * 100))
    transaction_ref = normalize_squad_transaction_ref(generate_nexryde_squad_transaction_ref())
    metadata = {
        "driver_id": request.driver_id,
        "plan_amount": amount_expected,
        "tier": request.tier or "city_rider",
        "transaction_ref": transaction_ref,
        "provider_reference": transaction_ref,
    }
    init_body: dict = {
        "amount": amount_kobo,
        "duration": _squad_dynamic_va_duration_seconds(),
        "email": email,
        "transaction_ref": transaction_ref,
    }
    if _squad_dynamic_va_pass_charge():
        init_body["pass_charge"] = True

    logger.info(
        "Squad driver dynamic VA initiate driver=%s amount_kobo=%s transaction_ref=%s",
        request.driver_id,
        amount_kobo,
        transaction_ref,
    )
    provider_payload, last_error = await _post_squad_initiate_dynamic_virtual_account(init_body)

    if not provider_payload:
        logger.error(
            "Squad driver dynamic VA failed driver=%s error=%s",
            request.driver_id,
            last_error,
        )
        raise HTTPException(
            status_code=502,
            detail="Unable to generate bank account. Please try again or use card payment.",
        )

    account_number, bank_name, account_name_api, returned_reference, amount_display = _parse_squad_dynamic_va_response(
        provider_payload,
        transaction_ref=transaction_ref,
        fallback_amount_ngn=amount_expected,
    )
    provider_reference = transaction_ref
    account_name = account_name_api or full_name

    now = datetime.utcnow()
    await db.subscription_virtual_accounts.update_one(
        {"driver_id": request.driver_id},
        {"$set": {
            "id": str(uuid.uuid4()),
            "driver_id": request.driver_id,
            "tier": request.tier or "city_rider",
            "account_number": str(account_number),
            "bank_name": str(bank_name),
            "account_name": str(account_name),
            "reference": str(returned_reference),
            "provider_reference": provider_reference,
            "transaction_ref": transaction_ref,
            "status": "pending",
            "amount_expected": amount_display,
            "metadata": metadata,
            "provider_response": provider_payload,
            "updated_at": now,
            "created_at": now,
        }},
        upsert=True,
    )

    subscription = await db.subscriptions.find_one({"driver_id": request.driver_id}, sort=[("created_at", -1)])
    if subscription:
        await db.subscriptions.update_one(
            {"id": subscription.get("id")},
            {"$set": {
                "status": "pending_payment",
                "tier": request.tier or subscription.get("tier", "city_rider"),
                "amount": amount_display,
                "payment_provider": "squad",
                "payment_method": "virtual_account",
                "virtual_account_number": str(account_number),
                "payment_reference": str(returned_reference),
                "updated_at": now,
            }},
        )
    else:
        await db.subscriptions.insert_one(
            {
                "id": str(uuid.uuid4()),
                "driver_id": request.driver_id,
                "tier": request.tier or "city_rider",
                "amount": amount_display,
                "status": "pending_payment",
                "payment_provider": "squad",
                "payment_method": "virtual_account",
                "virtual_account_number": str(account_number),
                "payment_reference": str(returned_reference),
                "created_at": now,
                "updated_at": now,
            }
        )

    await _sync_driver_subscription_flags(request.driver_id)
    logger.info(
        f"Squad dynamic virtual account created for driver={request.driver_id} "
        f"acct={account_number} ref={returned_reference} amount={amount_display}"
    )
    return {
        "account_number": str(account_number),
        "bank_name": str(bank_name),
        "account_name": str(account_name),
        "reference": str(returned_reference),
        "status": "pending",
        "amount_expected": amount_display,
    }


def _squad_secret_is_sandbox() -> bool:
    sk = (SQUAD_SECRET_KEY or "").strip()
    return sk.startswith("sandbox_sk_") or sk.startswith("test_sk_")


def _squad_url_looks_sandbox(url: str) -> bool:
    return "sandbox" in (url or "").lower()


def _squad_checkout_initiate_bases() -> list[str]:
    """
    Do not mix sandbox and live Squad hosts on the same initiate flow.
    Sandbox secret → sandbox API only (+ optional SQUAD_INITIATE_URL if URL contains 'sandbox').
    Live secret → live API only (skip sandbox-looking SQUAD_INITIATE_URL).
    """
    bases: list[str] = []
    live_default = _normalize_squad_live_base(SQUAD_BASE_URL or "https://api-d.squadco.com")

    if _squad_secret_is_sandbox():
        if SQUAD_INITIATE_URL:
            u = SQUAD_INITIATE_URL.rstrip("/")
            if _squad_url_looks_sandbox(u):
                bases.append(u)
        if "https://sandbox-api-d.squadco.com" not in bases:
            bases.append("https://sandbox-api-d.squadco.com")
        logger.info("Squad checkout bases (sandbox secret, no live host): %s", bases)
        return bases

    if SQUAD_INITIATE_URL:
        u = SQUAD_INITIATE_URL.rstrip("/")
        if _squad_url_looks_sandbox(u):
            logger.warning(
                "Squad: SQUAD_INITIATE_URL is sandbox-shaped but secret is live — ignoring %s",
                u,
            )
        else:
            bases.append(_normalize_squad_live_base(u))
    if live_default not in bases:
        bases.append(live_default)
    # Always keep the canonical live host as a fallback if someone set a wrong custom base.
    if "https://api-d.squadco.com" not in bases and not any(_squad_url_looks_sandbox(b) for b in bases):
        bases.append("https://api-d.squadco.com")
    logger.info("Squad checkout bases (live secret, no sandbox host): %s", bases)
    return bases


def _squad_checkout_initiate_urls() -> list[str]:
    return [f"{b}/transaction/initiate" for b in _squad_checkout_initiate_bases()]


def _squad_dynamic_va_initiate_urls() -> list[str]:
    """Squad dynamic VA (per-payment bank details) — not the B2C /virtual-account KYC endpoint."""
    return [
        f"{b.rstrip('/')}/virtual-account/initiate-dynamic-virtual-account"
        for b in _squad_checkout_initiate_bases()
    ]


async def _post_squad_initiate_dynamic_virtual_account(init_body: dict) -> tuple[Optional[dict], str]:
    """
    POST initiate-dynamic-virtual-account (amount in kobo, duration seconds, email, transaction_ref).
    Tries each configured Squad API base (sandbox vs live).
    """
    last_err = ""
    for url in _squad_dynamic_va_initiate_urls():
        try:
            async with httpx.AsyncClient(timeout=45.0) as client:
                response = await client.post(url, headers=_squad_headers(), json=init_body)
                payload, raw = _squad_parse_initiate_response(response)
                if payload is None:
                    last_err = f"{url} HTTP {response.status_code} (not JSON): {raw}"
                    logger.error(
                        "Squad dynamic VA non-JSON response url=%s status=%s raw=%s",
                        url,
                        response.status_code,
                        raw,
                    )
                    continue
                try:
                    payload_str = json.dumps(payload, default=str)
                except Exception:
                    payload_str = str(payload)
                logger.info(
                    "Squad dynamic VA request url=%s payload=%s http_status=%s response=%s",
                    url,
                    json.dumps(init_body, default=str),
                    response.status_code,
                    payload_str[:12000],
                )
                data = payload.get("data") if isinstance(payload, dict) else {}
                data = data if isinstance(data, dict) else {}
                acct = _extract_squad_field(
                    data,
                    "account_number",
                    "virtual_account_number",
                    "accountNo",
                )
                if response.status_code in (200, 201) and squad_dynamic_va_response_ok(payload) and acct:
                    return payload, ""
                err_hint = None
                if isinstance(payload, dict):
                    err_hint = payload.get("message") or payload.get("title") or payload.get("detail")
                last_err = f"{url} HTTP {response.status_code}: {err_hint or payload_str[:800]}"
                logger.error("Squad dynamic VA failed: %s", last_err)
        except Exception as exc:
            last_err = f"{url}: {exc}"
            logger.exception("Squad dynamic VA request exception url=%s", url)
    return None, last_err


def _squad_require_va_email(email: str) -> str:
    e = (email or "").strip()
    if not e or "@" not in e:
        raise HTTPException(
            status_code=400,
            detail="A valid email is required for bank transfer. Update your email in your profile.",
        )
    return e


def _squad_require_customer_name_for_va(full_name: str) -> str:
    n = (full_name or "").strip()
    if len(n) < 2:
        raise HTTPException(
            status_code=400,
            detail="Your name is required for bank transfer. Please update your profile name.",
        )
    return n


def _parse_squad_dynamic_va_response(
    provider_payload: dict,
    *,
    transaction_ref: str,
    fallback_amount_ngn: float,
) -> tuple[str, str, str, str, float]:
    """Returns account_number, bank_name, account_name, returned_reference, amount_ngn for wallet/subscription VA."""
    data = provider_payload.get("data") if isinstance(provider_payload, dict) else {}
    data = data if isinstance(data, dict) else {}
    account_number = _extract_squad_field(
        data,
        "account_number",
        "virtual_account_number",
        "accountNo",
    )
    bank_name = _extract_squad_field(
        data,
        "bank",
        "bank_name",
        "bankName",
    )
    account_name = (
        _extract_squad_field(
            data,
            "account_name",
            "accountName",
            "customer_name",
        )
        or ""
    )
    returned_reference = (
        _extract_squad_field(data, "transaction_reference", "transaction_ref", "reference")
        or transaction_ref
    )
    amount_ngn = fallback_amount_ngn
    exp_raw = data.get("expected_amount")
    if exp_raw is not None:
        try:
            amount_ngn = round(float(str(exp_raw).replace(",", "")), 2)
        except Exception:
            pass
    if not account_number:
        logger.error(
            "Squad dynamic VA parsed missing account_number full_response=%s",
            json.dumps(provider_payload, default=str)[:12000],
        )
        raise HTTPException(
            status_code=502,
            detail="Virtual account not generated: Squad did not return an account number.",
        )
    if not bank_name or not str(bank_name).strip():
        logger.error(
            "Squad dynamic VA parsed missing bank_name full_response=%s",
            json.dumps(provider_payload, default=str)[:12000],
        )
        raise HTTPException(
            status_code=502,
            detail="Virtual account not generated: Squad did not return a bank name.",
        )
    return (
        str(account_number).strip(),
        str(bank_name).strip(),
        str(account_name).strip(),
        str(returned_reference).strip(),
        amount_ngn,
    )


def _squad_callback_url() -> Optional[str]:
    """Wallet payment callback URL."""
    if SQUAD_CALLBACK_URL:
        return SQUAD_CALLBACK_URL
    if not NEXRYDE_PUBLIC_URL:
        return None
    return f"{NEXRYDE_PUBLIC_URL.rstrip('/')}/api/wallet/callback"


def _squad_subscription_callback_url() -> Optional[str]:
    """Subscription-specific callback URL — redirects driver back to the subscription screen."""
    if not NEXRYDE_PUBLIC_URL:
        return _squad_callback_url()
    return f"{NEXRYDE_PUBLIC_URL.rstrip('/')}/api/payment/subscription/callback"


def _squad_inline_checkout_transaction_ref(prefix: str = "NXWR") -> str:
    """Server-generated Squad reference (NEXRYDE_* format). Prefix arg ignored."""
    del prefix
    return generate_nexryde_squad_transaction_ref()


def _squad_initiate_inline_body(
    *,
    amount_kobo: int,
    email: str,
    transaction_ref: str,
    customer_name: str,
    metadata: dict,
    callback_url_override: Optional[str] = None,
) -> dict:
    """
    Squad POST /transaction/initiate (inline checkout).
    Use snake_case `transaction_ref` only. Payload is allow-listed before HTTP (see sanitize_squad_transaction_initiate_payload).
    Pass `callback_url_override` to use a context-specific callback (e.g. subscription vs wallet).
    """
    if int(amount_kobo) <= 0:
        raise HTTPException(status_code=400, detail="Invalid payment amount")
    em = (email or "").strip()
    if not em or "@" not in em:
        em = "customer@nexryde.app"
    tr = normalize_squad_transaction_ref(transaction_ref)
    if not tr or len(tr) < 6 or len(tr) > 50:
        raise HTTPException(status_code=500, detail="Invalid payment reference")
    body: dict = {
        "amount": int(amount_kobo),
        "email": em,
        "currency": "NGN",
        "initiate_type": "inline",
        "transaction_ref": tr,
    }
    meta = metadata if isinstance(metadata, dict) else {}
    if meta:
        body["metadata"] = meta
    name = (customer_name or "").strip()
    if name:
        body["customer_name"] = name[:200]
    cb = callback_url_override or _squad_callback_url()
    if cb:
        body["callback_url"] = cb
    body["payment_channels"] = ["card", "bank", "ussd", "transfer"]
    return sanitize_squad_transaction_initiate_payload(body)


def _squad_parse_initiate_response(response: httpx.Response) -> tuple[Optional[dict], Optional[str]]:
    """Parse JSON body; return (payload, raw_text_or_none_on_json_error)."""
    try:
        return response.json(), None
    except Exception:
        try:
            return None, (response.text or "")[:800]
        except Exception:
            return None, "non-json response"


async def _post_squad_transaction_initiate_once(init_body: dict) -> tuple[Optional[dict], str]:
    """POST /transaction/initiate on each configured base URL until one succeeds."""
    last_err = ""
    for url in _squad_checkout_initiate_urls():
        try:
            safe_body = sanitize_squad_transaction_initiate_payload(init_body)
            try:
                req_log = json.dumps(safe_body, default=str)
            except Exception:
                req_log = str(safe_body)
            logger.info("Squad POST /transaction/initiate url=%s payload=%s", url, req_log)
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(url, headers=_squad_headers(), json=safe_body)
                payload, raw = _squad_parse_initiate_response(response)
                if payload is None:
                    logger.error(
                        "Squad /transaction/initiate non-JSON url=%s status=%s raw=%s",
                        url,
                        response.status_code,
                        raw,
                    )
                    last_err = f"{url} HTTP {response.status_code} (not JSON): {raw}"
                    continue
                try:
                    resp_log = json.dumps(payload, default=str)
                except Exception:
                    resp_log = str(payload)
                logger.info(
                    "Squad /transaction/initiate response url=%s http=%s body=%s",
                    url,
                    response.status_code,
                    resp_log[:12000],
                )
                if response.status_code in (200, 201) and squad_initiate_response_ok(payload):
                    return payload, ""
                err_hint = payload.get("message") or payload.get("title") or payload.get("detail")
                errs = payload.get("errors")
                if errs and not err_hint:
                    err_hint = str(errs)[:400]
                last_err = f"{url} HTTP {response.status_code}: {err_hint or payload}"
                logger.error("Squad /transaction/initiate failed: %s", last_err)
        except Exception as exc:
            last_err = f"{url}: {exc}"
            logger.exception("Squad /transaction/initiate exception url=%s", url)
    return None, last_err


async def _post_squad_transaction_initiate(init_body: dict) -> tuple[Optional[dict], str]:
    """Try official payload (no public key in body); retry with `key` if some environments require it."""
    base = sanitize_squad_transaction_initiate_payload(init_body)
    p, e = await _post_squad_transaction_initiate_once(base)
    if p:
        return p, ""
    if SQUAD_PUBLIC_KEY and "key" not in base:
        retry_body = sanitize_squad_transaction_initiate_payload({**base, "key": SQUAD_PUBLIC_KEY})
        p2, e2 = await _post_squad_transaction_initiate_once(retry_body)
        if p2:
            return p2, ""
        return None, f"{e} | retry_with_key: {e2}"
    return None, e


@payments_router.post("/payment/subscription/initiate-checkout")
async def initiate_subscription_checkout(
    http_request: Request,
    body: SubscriptionCheckoutInitRequest = SubscriptionCheckoutInitRequest(),
):
    """
    Start Squad inline checkout (card / bank channels in Squad modal) for driver subscription.
    Stores a row in subscription_payment_intents; webhook or verify-pending completes activation.
    """
    driver_id = require_authenticated(http_request)
    await _assert_driver_account(driver_id)
    await _assert_driver_can_activate_subscription(driver_id)
    if not SQUAD_SECRET_KEY or not SQUAD_PUBLIC_KEY:
        raise HTTPException(
            status_code=500,
            detail="Squad is not configured (SQUAD_SECRET_KEY and SQUAD_PUBLIC_KEY required)",
        )

    tier = body.tier or "city_rider"
    if tier not in {"city_rider", "road_warrior"}:
        tier = "city_rider"
    await _assert_subscription_tier_allowed(driver_id, tier)

    existing = await db.subscriptions.find_one({"driver_id": driver_id}, sort=[("created_at", -1)])
    if existing and existing.get("status") in {"active", "grace_period"}:
        raise HTTPException(status_code=400, detail="Subscription already active")

    amount_ngn = float(await _get_dynamic_tier_price(tier))
    from driver_trial_policy import resolve_subscription_checkout_amount

    amount_ngn, discount_meta = await resolve_subscription_checkout_amount(driver_id, tier, amount_ngn)
    amount_kobo = int(round(amount_ngn * 100))

    driver = await db.users.find_one({"id": driver_id}) or {}
    profile = await db.driver_profiles.find_one({"user_id": driver_id}) or {}
    full_name = (profile.get("full_name") or driver.get("name") or "NEXRYDE Driver").strip()
    email = driver.get("email") or f"{driver_id}@nexryde.app"

    transaction_ref, intent_id = await _reserve_subscription_payment_intent(
        driver_id=driver_id,
        tier=tier,
        amount_ngn=amount_ngn,
        amount_kobo=amount_kobo,
        discount_meta=discount_meta,
    )

    init_body = _squad_initiate_inline_body(
        amount_kobo=amount_kobo,
        email=email,
        transaction_ref=transaction_ref,
        customer_name=full_name,
        metadata={
            "driver_id": driver_id,
            "tier": tier,
            "purpose": "driver_subscription",
        },
        callback_url_override=_squad_subscription_callback_url(),
    )
    logger.info(
        "squad_subscription_init: driver=%s tier=%s ref=%s callback_url=%s",
        driver_id, tier, transaction_ref, init_body.get("callback_url", "(none)"),
    )
    transaction_ref = str(init_body["transaction_ref"])

    provider_payload, last_error = await _post_squad_transaction_initiate(init_body)

    if not provider_payload or not squad_initiate_response_ok(provider_payload):
        logger.error("Squad checkout initiate failed: %s", last_error)
        safe = (last_error or "unknown")[:500]
        fail_at = datetime.utcnow()
        await db.subscription_payment_intents.update_one(
            {"id": intent_id},
            {
                "$set": {
                    "status": "failed",
                    "failed_reason": safe,
                    "initiate_error": safe,
                    "updated_at": fail_at,
                }
            },
        )
        raise HTTPException(
            status_code=502,
            detail=f"Could not start Squad checkout. {safe}",
        )

    data = provider_payload.get("data") if isinstance(provider_payload, dict) else {}
    data = data if isinstance(data, dict) else {}
    checkout_url = _resolve_squad_checkout_url(provider_payload, data, transaction_ref)
    logger.info(
        "Squad subscription checkout_url resolved driver=%s ref=%s url=%s",
        driver_id, transaction_ref, checkout_url,
    )
    if not checkout_url:
        logger.error(
            "Squad checkout success but no URL resolved; data keys=%s",
            list(data.keys()) if isinstance(data, dict) else type(data),
        )
        fail_at = datetime.utcnow()
        await db.subscription_payment_intents.update_one(
            {"id": intent_id},
            {
                "$set": {
                    "status": "failed",
                    "failed_reason": "no_checkout_url",
                    "initiate_response": provider_payload,
                    "updated_at": fail_at,
                }
            },
        )
        raise HTTPException(
            status_code=502,
            detail="Squad did not return a checkout URL. Try again or contact support.",
        )

    now = datetime.utcnow()
    await db.subscription_payment_intents.update_one(
        {"id": intent_id},
        {
            "$set": {
                "checkout_url": checkout_url,
                "initiate_response": provider_payload,
                "updated_at": now,
            }
        },
    )

    sub_update = {
        "status": "pending_payment",
        "tier": tier,
        "amount": amount_ngn,
        "payment_provider": "squad_checkout",
        "payment_method": "card_or_transfer",
        "payment_reference": transaction_ref,
        "updated_at": now,
    }
    if existing and existing.get("id"):
        await db.subscriptions.update_one({"id": existing["id"]}, {"$set": sub_update})
    else:
        await db.subscriptions.insert_one(
            {
                "id": str(uuid4()),
                "driver_id": driver_id,
                **sub_update,
                "created_at": now,
            }
        )
    await _sync_driver_subscription_flags(driver_id)

    return {
        "transaction_ref": transaction_ref,
        "checkout_url": checkout_url,
        "amount_kobo": amount_kobo,
        "amount_ngn": amount_ngn,
        "public_key": SQUAD_PUBLIC_KEY,
        "tier": tier,
        "hint": "Open checkout_url in an in-app browser, or use Squad SDK with public_key and amount (kobo).",
        "squad_data": data,
    }


@payments_router.post("/payment/subscription/verify-pending")
async def verify_pending_subscription_checkout(
    http_request: Request,
    body: VerifySubscriptionCheckoutBody = Body(default_factory=VerifySubscriptionCheckoutBody),
):
    """After Squad shows success (dashboard or app): verify with Squad API and activate subscription."""
    driver_id = require_authenticated(http_request)
    await general_limiter.check_rate_limit(http_request, f"sub_verify:{driver_id}")
    await _assert_driver_account(driver_id)
    await _assert_driver_can_activate_subscription(driver_id)
    logger.info("sub_verify_pending: driver=%s ref=%s", driver_id, body.transaction_ref or "(none)")

    ref_filter: dict = {}
    if body.transaction_ref and str(body.transaction_ref).strip():
        candidates = _wallet_intent_ref_candidates(str(body.transaction_ref).strip())
        if not candidates:
            raise HTTPException(status_code=404, detail="No pending subscription checkout for that reference")
        ref_filter = {"transaction_ref": {"$in": candidates}}

    intent = None
    if ref_filter:
        intent = await db.subscription_payment_intents.find_one(
            {"driver_id": driver_id, "status": "pending", **ref_filter},
        )
    else:
        intent = await db.subscription_payment_intents.find_one(
            {"driver_id": driver_id, "status": "pending"},
            sort=[("created_at", -1)],
        )

    if not intent and ref_filter:
        intent = await db.subscription_payment_intents.find_one(
            {"driver_id": driver_id, "status": "completed", **ref_filter},
            sort=[("completed_at", -1)],
        )
        if intent:
            await _sync_driver_subscription_flags(driver_id)
            return {
                "verified": True,
                "duplicate": True,
                "activated": False,
                "subscription_active": True,
                "already_settled": True,
            }

    if not intent and not ref_filter:
        since = datetime.utcnow() - timedelta(hours=24)
        intent = await db.subscription_payment_intents.find_one(
            {
                "driver_id": driver_id,
                "status": "completed",
                "completed_at": {"$gte": since},
            },
            sort=[("completed_at", -1)],
        )
        if intent:
            await _sync_driver_subscription_flags(driver_id)
            return {
                "verified": True,
                "duplicate": True,
                "activated": False,
                "subscription_active": True,
                "already_settled": True,
            }

    if not intent:
        raise HTTPException(
            status_code=404,
            detail="No pending subscription checkout. If payment shows in Squad, wait a moment and try again.",
        )

    if intent.get("status") == "completed":
        await _sync_driver_subscription_flags(driver_id)
        return {
            "verified": True,
            "duplicate": True,
            "activated": False,
            "subscription_active": True,
            "already_settled": True,
        }

    ref = str(intent.get("transaction_ref") or "")
    logger.info("sub_verify_squad_call: driver=%s ref=%s", driver_id, ref)
    verify_result = await _verify_squad_transaction(ref)
    logger.info("sub_verify_squad_result: driver=%s ref=%s verified=%s reason=%s",
                driver_id, ref, verify_result.get("verified"), verify_result.get("reason"))
    if not verify_result.get("verified"):
        reason_txt = str(verify_result.get("reason") or "").lower()
        tx_status = str(verify_result.get("transaction_status") or "").lower()
        if "timeout" in reason_txt or "connect" in reason_txt:
            reason_code = "network_timeout"
        elif tx_status in ("pending", "processing"):
            reason_code = "payment_pending"
        elif tx_status in ("failed", "declined", "reversed"):
            reason_code = "payment_failed"
        else:
            reason_code = "gateway_failed"
        logger.info(
            "sub_verify_not_verified: driver=%s ref=%s reason=%s tx_status=%s",
            driver_id, ref, reason_code, tx_status,
        )
        await db.subscription_payment_intents.update_one(
            {"id": intent.get("id"), "status": "pending"},
            {
                "$set": {
                    "failed_reason": reason_code,
                    "failure_reason": reason_code,
                    "last_verify_result": verify_result,
                    "updated_at": datetime.utcnow(),
                }
            },
        )
        return {
            "verified": False,
            "reason": reason_code,
            "verify_result": verify_result,
            "transaction_status": tx_status or None,
        }

    expected_amount = _normalize_amount(intent.get("amount_ngn"))
    paid_amount = _reconcile_squad_amount_with_intent(
        expected_amount,
        verify_result.get("paid_amount"),
        verify_ok=True,
    )
    if paid_amount is None or expected_amount is None:
        return {
            "verified": False,
            "detail": "amount_mismatch",
            "paid_amount": verify_result.get("paid_amount"),
            "expected_amount": expected_amount,
        }

    ref_cands = _wallet_intent_ref_candidates(ref) or [ref]
    existing_success = await db.subscription_transactions.find_one(
        {"provider": "squad", "reference": {"$in": ref_cands}, "status": "success"}
    )
    if existing_success:
        await _sync_driver_subscription_flags(driver_id)
        return {"verified": True, "duplicate": True, "subscription_active": True}

    activation = await _activate_subscription(
        driver_id=driver_id,
        payment_reference=ref,
        provider="squad_checkout",
        paid_amount=paid_amount,
    )
    await db.subscription_payment_intents.update_one(
        {"id": intent["id"]},
        {
            "$set": {
                "status": "completed",
                "paid_amount_ngn": paid_amount,
                "completed_at": datetime.utcnow(),
            }
        },
    )
    await db.subscription_transactions.insert_one(
        {
            "id": str(uuid4()),
            "provider": "squad",
            "driver_id": driver_id,
            "reference": ref,
            "status": "success",
            "paid_amount": paid_amount,
            "expected_amount": expected_amount,
            "verified": True,
            "activation_result": activation,
            "verify_result": verify_result,
            "source": "verify_pending_endpoint",
            "created_at": datetime.utcnow(),
        }
    )
    return {"verified": True, "activated": True, "activation": activation, "subscription_active": True}


def _validate_wallet_topup_amount(amount: float) -> float:
    a = round(float(amount), 2)
    if a < 100:
        raise HTTPException(status_code=400, detail="Minimum top-up is ₦100")
    if a > 1_000_000:
        raise HTTPException(
            status_code=400,
            detail="Maximum single top-up is ₦1,000,000. Contact support for larger amounts.",
        )
    return a


_WALLET_CHECKOUT_EMAIL_RE = re.compile(
    r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,63}$"
)


def _validate_rider_wallet_checkout_email(email: str) -> str:
    e = (email or "").strip()
    if not e or any(c.isspace() for c in e):
        raise HTTPException(
            status_code=400,
            detail="A valid email is required for payment. Update your email in your profile.",
        )
    if not _WALLET_CHECKOUT_EMAIL_RE.match(e):
        raise HTTPException(
            status_code=400,
            detail="A valid email is required for payment. Update your email in your profile.",
        )
    return e


def _json_safe_for_response(obj: Any) -> Any:
    try:
        return json.loads(json.dumps(obj, default=str))
    except Exception:
        return {"_serialization_note": str(obj)[:800]}


def _wallet_checkout_squad_failed_response(
    *,
    user_id: str,
    intent_id: str,
    init_body: dict,
    provider_payload: Optional[dict],
    last_error: str,
    fail_reason: str,
) -> JSONResponse:
    """502 JSON body for clients; full context logged server-side."""
    safe_body = sanitize_squad_transaction_initiate_payload(init_body)
    try:
        req_json = json.dumps(safe_body, default=str)
    except Exception:
        req_json = str(safe_body)
    sq = provider_payload if isinstance(provider_payload, dict) else None
    try:
        sq_log = json.dumps(sq, default=str) if sq else last_error
    except Exception:
        sq_log = str(sq) if sq else last_error
    logger.error(
        "Squad wallet checkout init FAILED user=%s intent=%s reason=%s last_error=%s "
        "request_payload=%s full_squad_response=%s",
        user_id,
        intent_id,
        fail_reason,
        last_error,
        req_json[:8000],
        sq_log[:14000],
    )
    squad_out: Any = _json_safe_for_response(sq) if sq is not None else {"error": last_error}
    return JSONResponse(
        status_code=502,
        content={
            "success": False,
            "message": "Squad init failed",
            "squad_response": squad_out,
        },
    )


async def _latest_pending_wallet_checkout_intent(user_id: str) -> Optional[dict]:
    """Newest pending Squad inline checkout with a URL (resumable session)."""
    return await db.wallet_payment_intents.find_one(
        {
            "user_id": user_id,
            "status": "pending",
            "checkout_url": {"$ne": None, "$exists": True},
        },
        sort=[("created_at", -1)],
    )


def _wallet_checkout_client_payload(*, checkout_url: str, transaction_ref: str, resumed: bool = False) -> dict:
    """Minimal client response: no bank/VA fields, no Squad raw payload."""
    return {
        "success": True,
        "checkout_url": checkout_url,
        "transaction_ref": transaction_ref,
        "transactionRef": transaction_ref,
        "resumed": resumed,
    }


async def _cancel_all_pending_wallet_intents(user_id: str) -> int:
    now = datetime.utcnow()
    result = await db.wallet_payment_intents.update_many(
        {"user_id": user_id, "status": "pending"},
        {
            "$set": {
                "status": "cancelled",
                "cancelled_at": now,
                "updated_at": now,
                "failed_reason": "user_cancelled",
                "failure_reason": "user_cancelled",
            }
        },
    )
    await db.wallet_topup_transactions.update_many(
        {"userId": user_id, "status": "pending"},
        {"$set": {"status": "cancelled", "updatedAt": now, "failure_reason": "user_cancelled"}},
    )
    return int(result.modified_count)


async def _cancel_pending_wallet_intent_by_reference(user_id: str, reference: str) -> int:
    refs = _wallet_intent_ref_candidates(reference)
    if not refs:
        return 0
    result = await db.wallet_payment_intents.update_many(
        {"user_id": user_id, "status": "pending", "transaction_ref": {"$in": refs}},
        {
            "$set": {
                "status": "cancelled",
                "cancelled_at": datetime.utcnow(),
                "updated_at": datetime.utcnow(),
                "failed_reason": "user_cancelled",
                "failure_reason": "user_cancelled",
            }
        },
    )
    await db.wallet_topup_transactions.update_many(
        {"userId": user_id, "transactionRef": {"$in": refs}, "status": "pending"},
        {"$set": {"status": "cancelled", "updatedAt": datetime.utcnow(), "failure_reason": "user_cancelled"}},
    )
    return int(result.modified_count)


async def _upsert_wallet_topup_transaction(*, user_id: str, amount_ngn: float, transaction_ref: str, status: str) -> None:
    now = datetime.utcnow()
    await db.wallet_topup_transactions.update_one(
        {"transactionRef": transaction_ref},
        {
            "$setOnInsert": {
                "id": str(uuid.uuid4()),
                "userId": user_id,
                "amount": float(amount_ngn),
                "transactionRef": transaction_ref,
                "createdAt": now,
            },
            "$set": {
                "status": status,
                "updatedAt": now,
            },
        },
        upsert=True,
    )


async def _reserve_wallet_payment_intent(
    *,
    user_id: str,
    amount_ngn: float,
    amount_kobo: int,
) -> tuple[str, str]:
    """
    Persist a pending wallet payment before calling Squad (unique transaction_ref).
    Returns (transaction_ref, intent_id).
    """
    last_exc: Optional[Exception] = None
    for _ in range(12):
        transaction_ref = generate_nexryde_squad_transaction_ref()
        intent_id = str(uuid4())
        now = datetime.utcnow()
        doc = {
            "id": intent_id,
            "user_id": user_id,
            "amount_ngn": amount_ngn,
            "amount_kobo": amount_kobo,
            "transaction_ref": transaction_ref,
            "status": "pending",
            "payment_provider": "squad",
            "checkout_url": None,
            "initiate_response": None,
            "expires_at": now + timedelta(minutes=30),
            "created_at": now,
            "updated_at": now,
        }
        try:
            await db.wallet_payment_intents.insert_one(doc)
            await _upsert_wallet_topup_transaction(
                user_id=user_id,
                amount_ngn=amount_ngn,
                transaction_ref=transaction_ref,
                status="pending",
            )
            return transaction_ref, intent_id
        except DuplicateKeyError as exc:
            last_exc = exc
            continue
    logger.error("wallet_payment_intents could not allocate unique transaction_ref: %s", last_exc)
    raise HTTPException(
        status_code=503,
        detail="Could not allocate a payment reference. Please try again.",
    )


async def _reserve_subscription_payment_intent(
    *,
    driver_id: str,
    tier: str,
    amount_ngn: float,
    amount_kobo: int,
    discount_meta: Optional[dict] = None,
) -> tuple[str, str]:
    """Persist pending driver subscription checkout before Squad initiate."""
    last_exc: Optional[Exception] = None
    for _ in range(12):
        transaction_ref = generate_nexryde_squad_transaction_ref()
        intent_id = str(uuid4())
        now = datetime.utcnow()
        doc = {
            "id": intent_id,
            "driver_id": driver_id,
            "tier": tier,
            "amount_ngn": amount_ngn,
            "amount_kobo": amount_kobo,
            "transaction_ref": transaction_ref,
            "status": "pending",
            "payment_provider": "squad",
            "checkout_url": None,
            "initiate_response": None,
            "created_at": now,
            "updated_at": now,
        }
        if discount_meta:
            doc["discount_meta"] = discount_meta
        try:
            await db.subscription_payment_intents.insert_one(doc)
            return transaction_ref, intent_id
        except DuplicateKeyError as exc:
            last_exc = exc
            continue
    logger.error("subscription_payment_intents could not allocate unique transaction_ref: %s", last_exc)
    raise HTTPException(
        status_code=503,
        detail="Could not allocate a payment reference. Please try again.",
    )


@payments_router.post("/payment/wallet/initiate-checkout")
async def initiate_rider_wallet_checkout(
    http_request: Request,
    body: RiderWalletTopupAmountBody,
):
    """
    Squad inline checkout (card / bank in Squad UI) to credit rider wallet.
    Completes via webhook or POST /payment/wallet/verify-pending.
    """
    user_id = require_authenticated(http_request)
    from feature_flags import is_wallet_enabled
    if not await is_wallet_enabled(db):
        raise HTTPException(
            status_code=403,
            detail="Wallet top-up is currently unavailable. Pay your driver directly with cash or bank transfer.",
        )
    await general_limiter.check_rate_limit(http_request, f"wallet_init:{user_id}")
    verify_owner_strict(http_request, user_id)
    await _assert_wallet_user_exists(user_id)
    await _expire_stale_wallet_payment_intents(user_id)
    if not SQUAD_SECRET_KEY or not SQUAD_PUBLIC_KEY:
        raise HTTPException(
            status_code=500,
            detail="Squad is not configured (SQUAD_SECRET_KEY and SQUAD_PUBLIC_KEY required)",
        )
    amount_ngn = _validate_wallet_topup_amount(body.amount)
    amount_kobo = int(round(amount_ngn * 100))

    user = await db.users.find_one({"id": user_id}) or {}
    full_name = (user.get("name") or "NEXRYDE User").strip()
    raw_email = (user.get("email") or "").strip()
    if raw_email:
        email = _validate_rider_wallet_checkout_email(raw_email)
    else:
        email = f"{user_id}@nexryde.app"

    if body.replace_pending:
        await _cancel_all_pending_wallet_intents(user_id)
    else:
        pending = await _latest_pending_wallet_checkout_intent(user_id)
        if pending:
            prev_amt = _normalize_amount(pending.get("amount_ngn"))
            checkout_url = pending.get("checkout_url")
            prev_ref = str(pending.get("transaction_ref") or "")
            if checkout_url and isinstance(checkout_url, str):
                if prev_amt is not None and abs(float(prev_amt) - float(amount_ngn)) <= 0.01:
                    return _wallet_checkout_client_payload(
                        checkout_url=checkout_url,
                        transaction_ref=prev_ref,
                        resumed=True,
                    )
                raise HTTPException(
                    status_code=409,
                    detail={
                        "code": "pending_checkout_exists",
                        "message": (
                            "You already have a pending top-up. Open the same checkout, verify payment, "
                            "or cancel it to use a different amount."
                        ),
                        "pending_amount_ngn": prev_amt,
                        "transaction_ref": prev_ref,
                        "checkout_url": checkout_url,
                    },
                )

    transaction_ref, intent_id = await _reserve_wallet_payment_intent(
        user_id=user_id,
        amount_ngn=amount_ngn,
        amount_kobo=amount_kobo,
    )

    init_body = _squad_initiate_inline_body(
        amount_kobo=amount_kobo,
        email=email,
        transaction_ref=transaction_ref,
        customer_name=full_name,
        metadata={
            "user_id": user_id,
            "purpose": "rider_wallet_topup",
        },
    )
    transaction_ref = str(init_body["transaction_ref"])

    provider_payload, last_error = await _post_squad_transaction_initiate(init_body)

    pp_dict = provider_payload if isinstance(provider_payload, dict) else None
    if not pp_dict or not squad_initiate_response_ok(pp_dict):
        safe = (last_error or "unknown")[:500]
        fail_at = datetime.utcnow()
        await db.wallet_payment_intents.update_one(
            {"id": intent_id},
            {
                "$set": {
                    "status": "failed",
                    "failed_reason": safe,
                    "initiate_error": safe,
                    "updated_at": fail_at,
                }
            },
        )
        await _upsert_wallet_topup_transaction(
            user_id=user_id,
            amount_ngn=amount_ngn,
            transaction_ref=transaction_ref,
            status="failed",
        )
        return _wallet_checkout_squad_failed_response(
            user_id=user_id,
            intent_id=intent_id,
            init_body=init_body,
            provider_payload=pp_dict,
            last_error=last_error or safe,
            fail_reason="squad_reject_or_invalid_response",
        )

    data = pp_dict.get("data") if isinstance(pp_dict.get("data"), dict) else {}
    data = data if isinstance(data, dict) else {}
    # Resolve checkout URL: Squad's response if it's a genuine Squad domain URL,
    # otherwise construct from the transaction_ref (Squad's pay.squadco.com/{ref} pattern).
    checkout_url = _resolve_squad_checkout_url(pp_dict, data, transaction_ref)
    logger.info(
        "Squad wallet checkout_url resolved user=%s ref=%s url=%s",
        user_id, transaction_ref, checkout_url,
    )
    if not checkout_url:
        fail_at = datetime.utcnow()
        await db.wallet_payment_intents.update_one(
            {"id": intent_id},
            {
                "$set": {
                    "status": "failed",
                    "failed_reason": "no_checkout_url",
                    "initiate_response": pp_dict,
                    "updated_at": fail_at,
                }
            },
        )
        await _upsert_wallet_topup_transaction(
            user_id=user_id,
            amount_ngn=amount_ngn,
            transaction_ref=transaction_ref,
            status="failed",
        )
        return _wallet_checkout_squad_failed_response(
            user_id=user_id,
            intent_id=intent_id,
            init_body=init_body,
            provider_payload=pp_dict,
            last_error="Squad response missing checkout_url",
            fail_reason="no_checkout_url",
        )

    now = datetime.utcnow()
    await db.wallet_payment_intents.update_one(
        {"id": intent_id},
        {
            "$set": {
                "checkout_url": checkout_url,
                "initiate_response": pp_dict,
                "updated_at": now,
            }
        },
    )

    logger.info(
        "Squad wallet checkout init OK user=%s ref=%s amount_kobo=%s checkout_url_present=1",
        user_id,
        transaction_ref,
        amount_kobo,
    )

    return _wallet_checkout_client_payload(
        checkout_url=checkout_url,
        transaction_ref=transaction_ref,
        resumed=False,
    )


@payments_router.get("/payment/wallet/pending-checkout")
async def get_pending_rider_wallet_checkout(http_request: Request):
    """Source of truth for an in-progress Squad checkout (app resume / sync)."""
    user_id = require_authenticated(http_request)
    verify_owner_strict(http_request, user_id)
    await _expire_stale_wallet_payment_intents(user_id)
    intent = await _latest_pending_wallet_checkout_intent(user_id)
    if not intent:
        return {"pending": False}
    return {
        "pending": True,
        "transaction_ref": intent.get("transaction_ref"),
        "checkout_url": intent.get("checkout_url"),
        "amount_ngn": intent.get("amount_ngn"),
        "amount_kobo": intent.get("amount_kobo"),
    }


@payments_router.post("/payment/wallet/cancel-pending")
async def cancel_pending_rider_wallet_checkout(http_request: Request):
    """Abandon in-app checkout so a new amount/session can be started (wallet not credited)."""
    user_id = require_authenticated(http_request)
    verify_owner_strict(http_request, user_id)
    n = await _cancel_all_pending_wallet_intents(user_id)
    return {"cancelled": n}


@payments_router.post("/payment/wallet/create-virtual-account")
async def create_rider_wallet_virtual_account(http_request: Request):
    """Removed: wallet top-up uses Squad checkout only (no per-user bank transfer VA)."""
    require_authenticated(http_request)
    raise HTTPException(
        status_code=410,
        detail="Wallet bank-transfer virtual accounts are disabled. Use card/bank checkout (Squad) only.",
    )


@payments_router.post("/payment/wallet/verify-pending")
async def verify_pending_rider_wallet_checkout(
    http_request: Request,
    body: VerifyRiderWalletBody = Body(default_factory=VerifyRiderWalletBody),
):
    """Poll after paying if webhook was delayed; verifies reference with Squad API."""
    user_id = require_authenticated(http_request)
    await general_limiter.check_rate_limit(http_request, f"wallet_verify:{user_id}")
    verify_owner_strict(http_request, user_id)
    await _expire_stale_wallet_payment_intents(user_id)

    since = datetime.utcnow() - timedelta(hours=24)
    intent: Optional[dict] = None

    if body.transaction_ref and str(body.transaction_ref).strip():
        candidates = _wallet_intent_ref_candidates(str(body.transaction_ref).strip())
        if not candidates:
            raise HTTPException(status_code=404, detail="No pending wallet checkout for that reference")
        # Search pending + processing (processing = a prior verify attempt started but Squad hadn't confirmed yet)
        intent = await db.wallet_payment_intents.find_one(
            {"user_id": user_id, "status": {"$in": ["pending", "processing"]}, "transaction_ref": {"$in": candidates}},
        )
        if not intent:
            intent = await db.wallet_payment_intents.find_one(
                {"user_id": user_id, "status": "completed", "transaction_ref": {"$in": candidates}},
                sort=[("completed_at", -1)],
            )
        if not intent:
            raise HTTPException(status_code=404, detail="No pending wallet checkout for that reference")
    else:
        intent = await db.wallet_payment_intents.find_one(
            {"user_id": user_id, "status": {"$in": ["pending", "processing"]}},
            sort=[("created_at", -1)],
        )
        if not intent:
            intent = await db.wallet_payment_intents.find_one(
                {
                    "user_id": user_id,
                    "status": "completed",
                    "completed_at": {"$gte": since},
                },
                sort=[("completed_at", -1)],
            )
        if not intent:
            raise HTTPException(
                status_code=404,
                detail="No pending wallet checkout. If you already paid, pull to refresh balance or try again in a moment.",
            )

    ref = str(intent.get("transaction_ref") or "")
    if not ref:
        raise HTTPException(status_code=404, detail="No pending wallet checkout for that reference")

    if str(intent.get("status") or "") in {"cancelled", "failed", "expired"} or _intent_is_expired(intent):
        return {
            "verified": False,
            "terminal": True,
            "status": str(intent.get("status") or "expired"),
            "detail": "Payment intent is no longer payable. Start a new top-up.",
        }

    verify_result = await _verify_squad_transaction(ref)
    if not verify_result.get("verified"):
        return {"verified": False, "verify_result": verify_result}

    if intent.get("status") == "completed" or intent.get("credited_at"):
        user = await db.users.find_one({"id": user_id})
        bal = float((user or {}).get("wallet_balance") or 0)
        return {
            "verified": True,
            "credited": False,
            "duplicate": True,
            "new_balance": bal,
            "already_settled": True,
        }

    expected_amount = _normalize_amount(intent.get("amount_ngn"))
    paid_amount = _reconcile_squad_amount_with_intent(
        expected_amount,
        verify_result.get("paid_amount"),
        verify_ok=True,
    )
    if paid_amount is None or expected_amount is None:
        return {
            "verified": False,
            "detail": "amount_mismatch",
            "paid_amount": verify_result.get("paid_amount"),
            "expected_amount": expected_amount,
        }
    res = await _credit_wallet_checkout_intent(
        intent=intent,
        verify_result=verify_result,
        webhook_payload=None,
        source="verify_pending_endpoint",
    )
    return {
        "verified": bool(res.get("credited") or res.get("duplicate")),
        "credited": bool(res.get("credited")),
        "duplicate": bool(res.get("duplicate")),
        "new_balance": res.get("new_balance"),
        "already_settled": bool(res.get("duplicate")),
        "reason": res.get("reason"),
    }


@payments_router.get("/payments/verify/{transaction_ref}")
async def verify_wallet_payment_by_reference(transaction_ref: str, request: Request):
    """
    Verification fallback endpoint.
    Calls provider verify and credits wallet only after confirmed success.
    """
    user_id = require_authenticated(request)
    verify_owner_strict(request, user_id)
    body = VerifyRiderWalletBody(transaction_ref=transaction_ref)
    return await verify_pending_rider_wallet_checkout(request, body)


@payments_router.get("/subscriptions/{driver_id}")
async def get_subscription(driver_id: str, request: Request):
    """Get driver's subscription status (activity-based trial)."""
    verify_owner_strict(request, driver_id)
    await _assert_driver_account(driver_id)
    subscription = await _ensure_auto_trial_for_verified_driver(driver_id)
    if not subscription:
        subscription = await db.subscriptions.find_one(
            {"driver_id": driver_id},
            sort=[("created_at", -1)],
            max_time_ms=QUERY_MAX_TIME_MS,
        )
    flag_state = await _read_driver_subscription_flags(driver_id)

    if subscription:
        if subscription.get("_id") is not None:
            subscription["_id"] = str(subscription["_id"])

        now = datetime.utcnow()

        if subscription.get("status") == "trial":
            # Evaluate live trip-count based trial state.
            subscription = await _evaluate_driver_trial(driver_id, subscription)
        elif subscription.get("status") == "active":
            end_date = subscription.get("end_date")
            if isinstance(end_date, str):
                try:
                    end_date = datetime.fromisoformat(end_date.replace("Z", "+00:00")).replace(tzinfo=None)
                except Exception:
                    end_date = None
            if end_date:
                if now > end_date:
                    await db.subscriptions.update_one(
                        {"id": subscription["id"]}, {"$set": {"status": "expired"}}
                    )
                    subscription["status"] = "expired"
                    subscription["days_remaining"] = 0
                else:
                    subscription["days_remaining"] = max(0, (end_date - now).days)
            else:
                subscription["days_remaining"] = 0
        else:
            subscription["days_remaining"] = 0

        subscription["bank_details"] = SUBSCRIPTION_CONFIG["bank_details"]
        subscription["monthly_fee"] = await _get_dynamic_tier_price(subscription.get("tier", "city_rider"))
        # An active trial / paid / grace subscription is always "active" for gating,
        # even if the cached users.subscription_active flag is stale.
        live_active = subscription.get("status") in {"trial", "active", "grace_period"}
        subscription["subscription_active"] = flag_state["subscription_active"] or live_active
        subscription["subscription_expiry"] = flag_state["subscription_expiry"]
        return subscription

    # No subscription yet — driver hasn't completed verification or profile.
    return {
        "status": "none",
        "days_remaining": 0,
        "trial_trips_target": SUBSCRIPTION_CONFIG["trial_trips_target"],
        "trial_trips_completed": 0,
        "trial_trips_remaining": SUBSCRIPTION_CONFIG["trial_trips_target"],
        "trial_active": False,
        "monthly_fee": await _get_dynamic_tier_price("city_rider"),
        "bank_details": SUBSCRIPTION_CONFIG["bank_details"],
        "subscription_active": False,
        "subscription_expiry": None,
        "message": await _trial_unlock_message(),
    }


async def _trial_unlock_message() -> str:
    from driver_trial_policy import trial_unlock_message

    return await trial_unlock_message()


@payments_router.get("/driver/subscription-status")
async def get_driver_subscription_status(request: Request):
    driver_id = require_authenticated(request)
    await _assert_driver_account(driver_id)

    # ── Critical: resolve the real subscription FIRST (never masked by enrichment errors).
    # An already-active trial must always report status="trial" so the app does not
    # wrongly prompt the driver to activate/subscribe again.
    subscription = await _ensure_auto_trial_for_verified_driver(driver_id)
    if not subscription:
        subscription = await db.subscriptions.find_one(
            {"driver_id": driver_id},
            {"_id": 0},
            sort=[("created_at", -1)],
            max_time_ms=QUERY_MAX_TIME_MS,
        )

    # Live-evaluate trial trip count. If this fails, keep the RAW trial status
    # rather than collapsing the driver to "none" (which would show "Activate to Drive").
    if subscription and subscription.get("status") == "trial":
        try:
            subscription = await _evaluate_driver_trial(driver_id, subscription)
        except Exception as exc:
            logger.warning("trial evaluation failed driver=%s (keeping raw status): %s", driver_id, exc)

    flag_state = await _read_driver_subscription_flags(driver_id)
    status = (subscription or {}).get("status", "none")
    tier = (subscription or {}).get("tier")

    # ── Enrichment (best-effort — failures must NOT change the reported status).
    virtual_account = None
    try:
        virtual_account = await db.subscription_virtual_accounts.find_one(
            {"driver_id": driver_id},
            {"_id": 0, "provider_response": 0},
            max_time_ms=QUERY_MAX_TIME_MS,
        )
        if virtual_account:
            virtual_account.pop("_id", None)
    except Exception as exc:
        logger.warning("subscription VA lookup failed driver=%s: %s", driver_id, exc)

    upgrade_requirements = {
        "rating_met": False,
        "trips_met": False,
        "current_rating": 0,
        "current_trips": 0,
    }
    try:
        upgrade_requirements = await _road_warrior_upgrade_requirements(driver_id)
    except Exception as exc:
        logger.warning("upgrade requirements failed driver=%s: %s", driver_id, exc)

    can_upgrade = (
        tier == "city_rider"
        and status in {"trial", "active", "grace_period"}
        and upgrade_requirements["rating_met"]
        and upgrade_requirements["trips_met"]
    )

    sub = subscription or {}
    trial_trips_target = sub.get("trial_trips_target") or SUBSCRIPTION_CONFIG["trial_trips_target"]
    trial_trips_completed = sub.get("trial_trips_completed", 0)
    trial_trips_remaining = sub.get("trial_trips_remaining", trial_trips_target)
    trial_progress_pct = round(trial_trips_completed / trial_trips_target * 100) if trial_trips_target > 0 else 0

    return {
        "driver_id": driver_id,
        "subscription_active": flag_state["subscription_active"] or status in {"trial", "active", "grace_period"},
        "subscription_expiry": flag_state["subscription_expiry"],
        "status": status,
        "tier": tier,
        "amount_expected": sub.get("amount"),
        "days_remaining": sub.get("days_remaining", 0),
        "trial_active": sub.get("trial_active", status == "trial"),
        "trial_trips_completed": trial_trips_completed,
        "trial_trips_remaining": trial_trips_remaining,
        "trial_trips_target": trial_trips_target,
        "trial_progress_pct": trial_progress_pct,
        "trial_extended": sub.get("trial_extended", False),
        "trial_extension_count": sub.get("trial_extension_count", 0),
        "trial_completed": sub.get("trial_completed", False),
        "trial_urgency": sub.get("trial_urgency", "normal"),
        "trial_message": sub.get("trial_message", ""),
        "trial_day_limit": sub.get("trial_day_limit"),
        "trial_days_remaining": sub.get("trial_days_remaining", sub.get("days_remaining", 0)),
        "trial_emphasis": sub.get("trial_emphasis", "trips"),
        "early_subscribe_discount_ngn": sub.get("early_subscribe_discount_ngn"),
        "early_subscribe_first_month_fee_ngn": sub.get("early_subscribe_first_month_fee_ngn"),
        "early_subscribe_message": sub.get("early_subscribe_message"),
        "can_upgrade": can_upgrade,
        "upgrade_requirements": upgrade_requirements,
        "virtual_account": virtual_account,
    }


async def _process_squad_webhook_payload(payload: dict) -> dict:
    """Apply verified Squad subscription webhook (virtual account or checkout). Idempotent."""
    event_reference = _extract_squad_field(
        payload,
        "transaction_ref",
        "transaction_reference",
        "reference",
        "data.transaction_ref",
        "data.reference",
    )
    account_number = _extract_squad_field(
        payload,
        "account_number",
        "virtual_account_number",
        "data.account_number",
        "data.virtual_account_number",
    )
    amount = _extract_squad_field(payload, "amount", "data.amount", "transaction_amount", "data.transaction_amount")
    event_status = _extract_squad_field(payload, "status", "transaction_status", "data.status", "data.transaction_status")
    logger.info(
        f"Squad webhook received ref={event_reference} account={account_number} "
        f"amount={amount} status={event_status}"
    )

    verify_result = await _verify_squad_transaction(str(event_reference or ""))
    logger.info(f"Squad verification response for ref={event_reference}: {verify_result}")
    # Strict money safety: never trust webhook status alone for credit.
    # Wallet/subscription funds must come only from provider verify confirmation.

    if not verify_result.get("verified"):
        ref_s = str(event_reference or "").strip()
        ps = str(verify_result.get("provider_status") or "").strip().lower()
        ev = str(event_status or "").strip().lower()
        terminal_fail = {
            "failed",
            "failure",
            "abandoned",
            "cancelled",
            "canceled",
            "reversed",
            "declined",
            "expired",
        }
        if ref_s and (ps in terminal_fail or ev in terminal_fail):
            fail_at = datetime.utcnow()
            reason = ps or ev or verify_result.get("reason") or "verification_failed"
            await db.wallet_payment_intents.update_many(
                {"transaction_ref": ref_s, "status": "pending"},
                {
                    "$set": {
                        "status": "failed",
                        "failed_at": fail_at,
                        "failed_reason": reason,
                        "updated_at": fail_at,
                    }
                },
            )
            await db.wallet_topup_transactions.update_many(
                {"transactionRef": {"$in": _wallet_intent_ref_candidates(ref_s)}, "status": "pending"},
                {"$set": {"status": "failed", "updatedAt": fail_at, "failure_reason": reason}},
            )
            await db.subscription_payment_intents.update_many(
                {"transaction_ref": ref_s, "status": "pending"},
                {
                    "$set": {
                        "status": "failed",
                        "failed_at": fail_at,
                        "failed_reason": reason,
                        "updated_at": fail_at,
                    }
                },
            )
        await db.subscription_transactions.insert_one(
            {
                "id": str(uuid.uuid4()),
                "provider": "squad",
                "reference": event_reference,
                "account_number": account_number,
                "status": "failed_verification",
                "verify_result": verify_result,
                "webhook_payload": payload,
                "created_at": datetime.utcnow(),
            }
        )
        return {"received": True, "processed": False}

    # --- Rider wallet top-up (before driver subscription matching) ---
    wva = None
    wva_or: list = []
    if event_reference:
        er = str(event_reference)
        wva_or.extend([{"reference": er}, {"provider_reference": er}])
    if account_number:
        wva_or.append({"account_number": str(account_number)})
    if wva_or:
        wva = await db.wallet_virtual_accounts.find_one({"$and": [{"$or": wva_or}, {"status": "pending"}]})

    wpi = None
    if not wva and event_reference:
        wpi_candidates = _wallet_intent_ref_candidates(str(event_reference))
        if wpi_candidates:
            wpi = await db.wallet_payment_intents.find_one(
                {"transaction_ref": {"$in": wpi_candidates}, "status": "pending"}
            )
            if not wpi:
                done_w = await db.wallet_payment_intents.find_one(
                    {"transaction_ref": {"$in": wpi_candidates}, "status": "completed"},
                    sort=[("completed_at", -1)],
                )
                if done_w:
                    logger.info(
                        "Squad webhook: wallet checkout already completed ref=%s (duplicate event)",
                        event_reference,
                    )
                    return {"received": True, "processed": True, "wallet_topup": True, "duplicate": True}

    if wva:
        uid = wva.get("user_id")
        expected_amount = _normalize_amount(wva.get("amount_expected"))
        paid_amount = _reconcile_squad_amount_with_intent(
            expected_amount,
            verify_result.get("paid_amount"),
            verify_ok=bool(verify_result.get("verified")),
        )
        if paid_amount is None or expected_amount is None:
            logger.warning(
                f"Squad wallet VA amount mismatch user={uid} paid={verify_result.get('paid_amount')} expected={expected_amount}"
            )
            await db.subscription_transactions.insert_one(
                {
                    "id": str(uuid.uuid4()),
                    "provider": "squad",
                    "reference": event_reference,
                    "status": "wallet_va_amount_mismatch",
                    "paid_amount": paid_amount,
                    "expected_amount": expected_amount,
                    "verify_result": verify_result,
                    "webhook_payload": payload,
                    "created_at": datetime.utcnow(),
                }
            )
            return {"received": True, "processed": False}
        ref_key = str(event_reference or wva.get("reference") or "")
        res = await _rider_wallet_topup_idempotent(
            uid,
            paid_amount,
            ref_key,
            "squad_virtual_account",
            verify_result,
            payload,
        )
        await db.wallet_virtual_accounts.update_one(
            {"id": wva["id"]},
            {
                "$set": {
                    "status": "success",
                    "paid_amount": paid_amount,
                    "verified_at": datetime.utcnow(),
                    "last_webhook_status": event_status,
                    "last_reference": ref_key,
                }
            },
        )
        logger.info(f"Squad wallet VA credited user={uid} ref={ref_key} dup={res.get('duplicate')}")
        return {"received": True, "processed": True, "wallet_topup": True}

    if wpi:
        uid = wpi.get("user_id")
        if str(wpi.get("status") or "") in {"cancelled", "failed", "expired"} or _intent_is_expired(wpi):
            logger.info("Squad webhook skipped terminal/expired wallet intent ref=%s", event_reference)
            return {"received": True, "processed": True, "wallet_topup": False, "skipped": True}
        expected_amount = _normalize_amount(wpi.get("amount_ngn"))
        paid_amount = _reconcile_squad_amount_with_intent(
            expected_amount,
            verify_result.get("paid_amount"),
            verify_ok=bool(verify_result.get("verified")),
        )
        if paid_amount is None or expected_amount is None:
            logger.warning(
                f"Squad wallet checkout amount mismatch user={uid} raw_paid={verify_result.get('paid_amount')} expected={expected_amount}"
            )
            await db.subscription_transactions.insert_one(
                {
                    "id": str(uuid.uuid4()),
                    "provider": "squad",
                    "reference": event_reference,
                    "status": "wallet_checkout_amount_mismatch",
                    "paid_amount": paid_amount,
                    "expected_amount": expected_amount,
                    "verify_result": verify_result,
                    "webhook_payload": payload,
                    "created_at": datetime.utcnow(),
                }
            )
            return {"received": True, "processed": False}
        ref_key = str(event_reference or "")
        res = await _credit_wallet_checkout_intent(
            intent=wpi,
            verify_result=verify_result,
            webhook_payload=payload,
            source="squad_webhook",
        )
        logger.info(f"Squad wallet checkout credited user={uid} ref={ref_key} dup={res.get('duplicate')}")
        return {"received": True, "processed": True, "wallet_topup": True}

    virtual_account = await db.subscription_virtual_accounts.find_one(
        {"$or": [
            {"reference": str(event_reference)},
            {"provider_reference": str(event_reference)},
            {"account_number": str(account_number) if account_number else ""},
        ]}
    )
    checkout_intent = None
    if not virtual_account and event_reference:
        sub_cands = _wallet_intent_ref_candidates(str(event_reference))
        if sub_cands:
            checkout_intent = await db.subscription_payment_intents.find_one(
                {"transaction_ref": {"$in": sub_cands}, "status": "pending"}
            )

    if not virtual_account and not checkout_intent:
        logger.warning(f"Squad verified payment could not be mapped ref={event_reference}")
        await db.subscription_transactions.insert_one(
            {
                "id": str(uuid.uuid4()),
                "provider": "squad",
                "reference": event_reference,
                "account_number": account_number,
                "status": "unmapped",
                "paid_amount": verify_result.get("paid_amount"),
                "verify_result": verify_result,
                "webhook_payload": payload,
                "created_at": datetime.utcnow(),
            }
        )
        return {"received": True, "processed": False}

    if virtual_account:
        driver_id = virtual_account.get("driver_id")
        expected_amount = _normalize_amount(virtual_account.get("amount_expected"))
        paid_amount = _reconcile_squad_amount_with_intent(
            expected_amount,
            verify_result.get("paid_amount"),
            verify_ok=bool(verify_result.get("verified")),
        )
    else:
        driver_id = checkout_intent.get("driver_id")
        expected_amount = _normalize_amount(checkout_intent.get("amount_ngn"))
        paid_amount = _reconcile_squad_amount_with_intent(
            expected_amount,
            verify_result.get("paid_amount"),
            verify_ok=bool(verify_result.get("verified")),
        )

    if paid_amount is None or expected_amount is None:
        logger.warning(
            f"Squad amount mismatch driver={driver_id} raw_paid={verify_result.get('paid_amount')} expected={expected_amount}"
        )
        await db.subscription_transactions.insert_one(
            {
                "id": str(uuid.uuid4()),
                "provider": "squad",
                "driver_id": driver_id,
                "reference": event_reference,
                "account_number": (virtual_account or {}).get("account_number"),
                "status": "amount_mismatch",
                "paid_amount": paid_amount,
                "expected_amount": expected_amount,
                "verify_result": verify_result,
                "webhook_payload": payload,
                "created_at": datetime.utcnow(),
            }
        )
        return {"received": True, "processed": False}

    _er = str(event_reference or "").strip()
    dup_refs = _wallet_intent_ref_candidates(_er) or ([_er] if _er else [])
    existing_success = await db.subscription_transactions.find_one(
        {"provider": "squad", "reference": {"$in": dup_refs}, "status": "success"}
    )
    if existing_success:
        logger.info(f"Duplicate Squad webhook ignored ref={event_reference}")
        return {"received": True, "processed": True, "duplicate": True}

    provider_label = "squad" if virtual_account else "squad_checkout"
    activation = await _activate_subscription(
        driver_id=driver_id,
        payment_reference=str(event_reference),
        provider=provider_label,
        paid_amount=paid_amount,
    )

    if virtual_account:
        await db.subscription_virtual_accounts.update_one(
            {"driver_id": driver_id},
            {"$set": {
                "status": "success",
                "paid_amount": paid_amount,
                "verified": True,
                "verified_at": datetime.utcnow(),
                "last_webhook_status": event_status,
                "last_reference": str(event_reference),
            }}
        )
    if checkout_intent:
        await db.subscription_payment_intents.update_one(
            {"id": checkout_intent["id"]},
            {"$set": {
                "status": "completed",
                "paid_amount_ngn": paid_amount,
                "completed_at": datetime.now(timezone.utc),
                "last_webhook_status": event_status,
            }},
        )

    await db.subscription_transactions.insert_one(
        {
            "id": str(uuid.uuid4()),
            "provider": "squad",
            "driver_id": driver_id,
            "reference": str(event_reference),
            "account_number": (virtual_account or {}).get("account_number"),
            "status": "success",
            "paid_amount": paid_amount,
            "expected_amount": expected_amount,
            "verified": True,
            "activation_result": activation,
            "verify_result": verify_result,
            "webhook_payload": payload,
            "created_at": datetime.utcnow(),
        }
    )
    logger.info(f"Squad activation success driver={driver_id} ref={event_reference}")
    return {"received": True, "processed": True}


@payments_router.post("/squad/webhook")
async def handle_squad_webhook(request: Request):
    raw_body = await request.body()
    signature = request.headers.get("x-squad-encrypted-body", "")

    if not SQUAD_WEBHOOK_SECRET:
        logger.error("Squad webhook received but SQUAD_WEBHOOK_SECRET is not configured — rejecting")
        raise HTTPException(status_code=503, detail="Webhook processor not configured")

    expected_signature = hmac.new(
        SQUAD_WEBHOOK_SECRET.encode("utf-8"),
        raw_body,
        hashlib.sha512,
    ).hexdigest().upper()
    if not signature:
        logger.warning("Squad webhook rejected: missing signature header")
        raise HTTPException(status_code=401, detail="Missing webhook signature")
    sig_bytes = signature.upper().encode("utf-8")
    expected_bytes = expected_signature.encode("utf-8")
    if len(sig_bytes) != len(expected_bytes) or not hmac.compare_digest(sig_bytes, expected_bytes):
        logger.warning("Squad webhook rejected due to signature mismatch")
        raise HTTPException(status_code=401, detail="Invalid webhook signature")

    try:
        payload = json.loads(raw_body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        logger.error("Invalid Squad webhook JSON")
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    try:
        return await _process_squad_webhook_payload(payload)
    except Exception:
        logger.exception("Squad webhook processing failed; queued for manual replay")
        dlq_id = str(uuid.uuid4())
        await db.squad_webhook_dlq.insert_one(
            {
                "id": dlq_id,
                "payload": payload,
                "status": "pending",
                "attempts": 0,
                "created_at": datetime.now(timezone.utc),
            }
        )
        return {"received": True, "processed": False, "queued_for_retry": True, "dlq_id": dlq_id}


@payments_router.post("/payments/webhook/squad")
async def handle_squad_webhook_alias(request: Request):
    """
    Alias endpoint for Squad webhook.
    Security and processing are identical to /api/squad/webhook.
    """
    return await handle_squad_webhook(request)


@payments_router.get("/payment/squad-webhook-dlq")
async def list_squad_webhook_dlq(request: Request, limit: int = 40):
    """Admin: list failed Squad webhooks (exceptions during processing)."""
    await require_admin_request(request)
    items = (
        await db.squad_webhook_dlq.find({}, {"_id": 0})
        .sort("created_at", -1)
        .limit(min(limit, 100))
        .to_list(min(limit, 100))
    )
    return {"items": items}


@payments_router.post("/payment/squad-webhook-dlq/{dlq_id}/replay")
async def replay_squad_webhook_dlq(dlq_id: str, request: Request):
    """Admin: re-run processing for a DLQ payload (idempotent)."""
    await require_admin_request(request)
    doc = await db.squad_webhook_dlq.find_one({"id": dlq_id})
    if not doc or not isinstance(doc.get("payload"), dict):
        raise HTTPException(status_code=404, detail="DLQ entry not found")
    result = await _process_squad_webhook_payload(doc["payload"])
    await db.squad_webhook_dlq.update_one(
        {"id": dlq_id},
        {
            "$set": {
                "status": "replayed",
                "replayed_at": datetime.now(timezone.utc),
                "last_result": result,
            },
            "$inc": {"attempts": 1},
        },
    )
    return {"dlq_id": dlq_id, **result}


@payments_router.get("/subscriptions/{driver_id}/history")
async def get_subscription_history(driver_id: str, request: Request):
    """Get driver's subscription payment and plan history"""
    verify_owner_strict(request, driver_id)
    subscriptions = await db.subscriptions.find(
        {"driver_id": driver_id}
    ).sort("start_date", -1).to_list(50)
    for s in subscriptions:
        s["_id"] = str(s["_id"])
    return {"history": subscriptions}

@payments_router.post("/subscriptions/{driver_id}/start-trial")
async def start_trial(driver_id: str, request: Request):
    """Trial is auto-activated on verification approval. This endpoint ensures it exists."""
    verify_owner_strict(request, driver_id)
    await _assert_driver_account(driver_id)
    existing = await db.subscriptions.find_one({"driver_id": driver_id}, sort=[("created_at", -1)])
    if existing:
        if existing.get("_id") is not None:
            existing["_id"] = str(existing["_id"])
        if existing.get("status") == "trial":
            existing = await _evaluate_driver_trial(driver_id, existing)
        return {
            "message": "Activity trial already active.",
            "subscription": existing,
        }

    subscription = await _ensure_auto_trial_for_verified_driver(driver_id)
    if not subscription:
        raise HTTPException(
            status_code=403,
            detail=await _trial_unlock_message(),
        )

    from driver_trial_policy import get_trial_defaults

    defaults = await get_trial_defaults()
    trip_limit = int(subscription.get("trial_trips_target") or defaults["default_trial_trip_limit"])
    day_limit = subscription.get("trial_day_limit", defaults.get("default_trial_day_limit"))
    if day_limit is not None:
        trial_desc = f"{trip_limit} trips or {int(day_limit)} days from first go-online"
    else:
        trial_desc = f"{trip_limit} trips"

    return {
        "message": f"Free trial activated! {trial_desc}.",
        "subscription": subscription,
        "trial_trips_target": trip_limit,
        "trial_day_limit": day_limit,
        "trial_active": True,
    }


@payments_router.post("/subscriptions/{driver_id}/subscribe")
async def create_or_renew_subscription(driver_id: str, request: Request, body: Optional[CreateSubscriptionRequest] = None):
    """
    Compatibility endpoint used by frontend.
    Creates/updates a subscription record and sets it to pending_payment.
    """
    verify_owner_strict(request, driver_id)
    await _assert_driver_account(driver_id)
    await _assert_driver_can_activate_subscription(driver_id)

    requested_tier = (body.tier if body else None) or "city_rider"
    if requested_tier not in {"city_rider", "road_warrior"}:
        requested_tier = "city_rider"
    await _assert_subscription_tier_allowed(driver_id, requested_tier)

    dynamic_price = await _get_dynamic_tier_price(requested_tier)
    payment_method = (body.payment_method if body else None) or "bank_transfer"

    existing = await db.subscriptions.find_one({"driver_id": driver_id}, sort=[("created_at", -1)])

    if existing and existing.get("status") in {"active", "trial", "grace_period"}:
        return {
            "message": "Subscription already active.",
            "status": existing.get("status"),
            "subscription_id": existing.get("id"),
            "tier": existing.get("tier", requested_tier),
            "amount": existing.get("amount", dynamic_price),
            "bank_details": SUBSCRIPTION_CONFIG["bank_details"],
        }

    now = datetime.utcnow()
    payload = {
        "tier": requested_tier,
        "amount": dynamic_price,
        "status": "pending_payment",
        "payment_method": payment_method,
        "updated_at": now,
    }

    if existing:
        await db.subscriptions.update_one({"driver_id": driver_id}, {"$set": payload})
        subscription_id = existing.get("id")
    else:
        subscription_id = str(uuid.uuid4())
        await db.subscriptions.insert_one(
            {
                "id": subscription_id,
                "driver_id": driver_id,
                "created_at": now,
                **payload,
            }
        )

    return {
        "message": "Subscription created. Please submit payment proof to activate.",
        "status": "pending_payment",
        "subscription_id": subscription_id,
        "tier": requested_tier,
        "amount": dynamic_price,
        "bank_details": SUBSCRIPTION_CONFIG["bank_details"],
    }

@payments_router.post("/subscriptions/{driver_id}/submit-payment")
async def submit_payment_proof(driver_id: str, request: PaymentProofSubmission, http_request: Request):
    """Submit payment screenshot and run provider verification when a reference is available."""
    verify_owner_strict(http_request, driver_id)
    await _assert_driver_account(driver_id)
    await _assert_driver_can_activate_subscription(driver_id)
    if request.driver_id != driver_id:
        raise HTTPException(status_code=400, detail="driver_id mismatch")

    # Validate screenshot format early
    _extract_data_url_payload(request.screenshot)

    # Find existing subscription
    subscription = await db.subscriptions.find_one({"driver_id": driver_id})
    
    if not subscription:
        # Create new subscription record
        inferred_tier = request.tier or "city_rider"
        dynamic_price = await _get_dynamic_tier_price(inferred_tier)
        subscription = {
            "id": str(uuid.uuid4()),
            "driver_id": driver_id,
            "amount": dynamic_price,
            "status": "pending_verification",
            "tier": inferred_tier,
            "created_at": datetime.utcnow()
        }
        await db.subscriptions.insert_one(subscription)
    
    # Save proof first for traceability
    now = datetime.utcnow()
    inferred_tier = request.tier or subscription.get("tier", "city_rider")
    await _assert_subscription_tier_allowed(driver_id, inferred_tier)
    dynamic_price = await _get_dynamic_tier_price(inferred_tier)
    expected_amount = float(dynamic_price)
    await db.subscriptions.update_one(
        {"driver_id": driver_id},
        {"$set": {
            "status": "pending_verification",
            "payment_screenshot": request.screenshot,
            "payment_submitted_at": now,
            "amount": expected_amount,
            "payment_reference": request.payment_reference,
            "tier": inferred_tier,
        }}
    )

    provider_result = None
    if request.payment_reference:
        provider_result = await _verify_reference_with_paystack(request.payment_reference, expected_amount)

    provider_verified = bool(provider_result and provider_result.get("verified"))

    # Fast path: if gateway confirms payment + amount, activate immediately.
    if provider_verified:
        verified = await _activate_subscription(driver_id)
        instant_audit = {
            "verified_at": datetime.utcnow(),
            "provider_result": provider_result,
            "verification_mode": "provider_instant",
            "approved": True,
        }
        await db.subscriptions.update_one(
            {"driver_id": driver_id},
            {"$set": {"payment_verification": instant_audit}}
        )
        return {
            "message": "Payment verified successfully via gateway. Subscription activated.",
            "status": "active",
            "verification": instant_audit,
            "subscription": verified,
        }

    audit_payload = {
        "verified_at": datetime.utcnow(),
        "provider_result": provider_result,
        "verification_mode": "manual_review",
        "approved": False,
        "reason": "Gateway verification was unavailable or did not confirm the payment.",
    }

    await db.subscriptions.update_one(
        {"driver_id": driver_id},
        {"$set": {"status": "pending_verification", "payment_verification": audit_payload}}
    )
    return {
        "message": "Payment submitted. Verification pending admin review.",
        "status": "pending_verification",
        "verification": audit_payload,
    }

async def _activate_subscription(
    driver_id: str,
    payment_reference: Optional[str] = None,
    provider: Optional[str] = None,
    paid_amount: Optional[float] = None,
):
    """Activate subscription after verified payment."""
    await _assert_driver_account(driver_id)
    subscription = await db.subscriptions.find_one({"driver_id": driver_id})
    
    if not subscription:
        raise HTTPException(status_code=404, detail="No subscription found")
    
    now = datetime.utcnow()
    end_date = now + timedelta(days=30)  # 30 days subscription

    update_fields: dict = {
        "status": "active",
        "start_date": now,
        "end_date": end_date,
        "payment_verified_at": now,
        "transaction_id": f"TXN_{uuid.uuid4().hex[:12].upper()}",
        "payment_reference": payment_reference or subscription.get("payment_reference"),
        "payment_provider": provider or subscription.get("payment_provider"),
        "paid_amount": paid_amount if paid_amount is not None else subscription.get("paid_amount"),
        "trial_active": False,
        "trial_completed": True,
    }
    if payment_reference:
        intent = await db.subscription_payment_intents.find_one(
            {"transaction_ref": payment_reference, "driver_id": driver_id},
        )
        if intent and (intent.get("discount_meta") or {}).get("early_subscribe_discount_applied"):
            update_fields["first_subscription_discount_applied"] = True
            from driver_trial_policy import mark_first_subscription_discount_used

            await mark_first_subscription_discount_used(driver_id)

    await db.subscriptions.update_one(
        {"driver_id": driver_id},
        {"$set": update_fields},
    )
    await _sync_driver_subscription_flags(driver_id)
    
    logger.info(f"Subscription activated for driver {driver_id} until {end_date}")
    
    return {
        "message": "Payment verified! Subscription activated.",
        "status": "active",
        "start_date": now.isoformat(),
        "end_date": end_date.isoformat(),
        "days_remaining": 30,
        "subscription_active": True,
        "subscription_expiry": end_date.isoformat(),
    }

@payments_router.post("/subscriptions/{driver_id}/verify-payment")
async def verify_payment(driver_id: str, request: Request):
    """Verify payment and activate subscription."""
    await require_admin_request(request)
    return await _activate_subscription(driver_id)


@payments_router.get("/subscriptions/{driver_id}/payment-verification")
async def get_payment_verification_status(driver_id: str, request: Request):
    """Get latest provider/manual verification payload for subscription payment."""
    verify_owner_strict(request, driver_id)
    await _assert_driver_account(driver_id)
    subscription = await db.subscriptions.find_one({"driver_id": driver_id})
    if not subscription:
        raise HTTPException(status_code=404, detail="No subscription found")

    verification = subscription.get("payment_verification") or subscription.get("ai_verification")
    if not verification:
        return {
            "driver_id": driver_id,
            "status": subscription.get("status", "none"),
            "verification": None,
            "message": "No verification record yet",
        }

    return {
        "driver_id": driver_id,
        "status": subscription.get("status", "none"),
        "verification": verification,
    }

@payments_router.get("/subscriptions/{driver_id}/check-restrictions")
async def check_restrictions(driver_id: str, request: Request):
    """Check if driver has any restrictions due to subscription status"""
    verify_owner_strict(request, driver_id)
    await _assert_driver_account(driver_id)
    subscription = await db.subscriptions.find_one({"driver_id": driver_id})
    
    restrictions = {
        "can_go_online": False,
        "can_accept_rides": False,
        "can_withdraw_earnings": False,
        "show_payment_popup": False,
        "message": ""
    }
    
    if not subscription:
        restrictions["show_payment_popup"] = True
        restrictions["message"] = "Please subscribe to start accepting rides"
        return restrictions
    
    status = subscription.get("status")
    now = datetime.utcnow()
    
    if status == "trial":
        # Activity-based trial: check trip count, not time.
        evaluated = await _evaluate_driver_trial(driver_id, subscription)
        if evaluated.get("status") == "pending_payment":
            restrictions["show_payment_popup"] = True
            restrictions["message"] = "Your free trial has ended. Subscribe to keep receiving trips."
        else:
            trips_done = evaluated.get("trial_trips_completed", 0)
            target = evaluated.get("trial_trips_target", SUBSCRIPTION_CONFIG["trial_trips_target"])
            days_left = evaluated.get("trial_days_remaining")
            restrictions["can_go_online"] = True
            restrictions["can_accept_rides"] = True
            restrictions["can_withdraw_earnings"] = True
            if days_left is not None:
                restrictions["message"] = evaluated.get("trial_message") or (
                    f"Free trial: {trips_done}/{target} trips · {days_left} days left"
                )
            else:
                remaining = max(0, target - trips_done)
                restrictions["message"] = evaluated.get("trial_message") or (
                    f"Free trial: {trips_done}/{target} trips · {remaining} left"
                )
    
    elif status == "active":
        end_date = subscription.get("end_date")
        if end_date and now > end_date:
            restrictions["show_payment_popup"] = True
            restrictions["message"] = "Your subscription has expired. Please renew to continue."
        else:
            days_left = (end_date - now).days if end_date else 0
            restrictions["can_go_online"] = True
            restrictions["can_accept_rides"] = True
            restrictions["can_withdraw_earnings"] = True
            restrictions["message"] = f"Subscription active: {days_left} days remaining"
    
    elif status == "pending_verification":
        restrictions["message"] = "Payment is being verified. Please wait."
    
    elif status in ["pending_payment", "expired"]:
        restrictions["show_payment_popup"] = True
        restrictions["message"] = (
            "Your free trial has ended. Subscribe to keep receiving trips."
            if status == "pending_payment"
            else "Please make payment to activate your account."
        )
    
    return restrictions

@payments_router.post("/subscriptions/{driver_id}/grace-period")
async def request_grace_period(driver_id: str, request: GracePeriodRequest, http_request: Request):
    """Request grace period for subscription (emergency earnings access)"""
    verify_owner_strict(http_request, driver_id)
    await _assert_driver_account(driver_id)
    subscription = await db.subscriptions.find_one({
        "driver_id": driver_id,
        "status": {"$in": ["active", "expired"]}
    })
    
    if not subscription:
        raise HTTPException(status_code=404, detail="No subscription found")
    
    if subscription.get("grace_period_requested"):
        raise HTTPException(status_code=400, detail="Grace period already requested")
    
    # Grant grace period (max 3 days)
    days = min(request.days_requested, 3)
    new_end_date = datetime.utcnow() + timedelta(days=days)
    
    await db.subscriptions.update_one(
        {"driver_id": driver_id},
        {"$set": {
            "status": "grace_period",
            "end_date": new_end_date,
            "grace_period_requested": True
        }}
    )
    
    return {
        "message": f"Grace period of {days} days granted",
        "new_end_date": new_end_date.isoformat()
    }


def _client_google_route_plausible(straight_km: float, distance_m: float, duration_s: float) -> bool:
    """Reject impossible client-reported Directions legs vs great-circle distance."""
    if distance_m is None or duration_s is None:
        return False
    try:
        dm = float(distance_m)
        ds = float(duration_s)
    except (TypeError, ValueError):
        return False
    if dm < 80 or ds < 10:
        return False
    cd_km = dm / 1000.0
    if straight_km < 0.02:
        return cd_km <= 2.0
    if cd_km < straight_km * 0.6:
        return False
    if cd_km > straight_km * 6.0:
        return False
    dur_min = max(ds / 60.0, 1 / 60.0)
    implied_kmh = cd_km / (dur_min / 60.0)
    if implied_kmh > 140:
        return False
    # Allow very slow traffic; only reject implausibly low speeds (likely unit / data errors).
    if straight_km >= 2.0 and implied_kmh < 0.35:
        return False
    return True


# ==================== FARE ESTIMATE ====================
@payments_router.post("/fare/estimate")
async def estimate_fare(request: FareEstimateRequest, http_request: Request):
    svc = (request.service_type or "economy").strip().lower()
    if svc == "standard":
        svc = "economy"
    city = (request.city or "lagos").strip().lower()
    city_norm = normalize_fare_city_key(city)
    rain_flag = bool(request.rain) if request.rain is not None else False

    if request.demand_ratio is not None:
        demand_effective = max(0.0, min(1.0, float(request.demand_ratio)))
        demand_source = "client"
    else:
        demand_effective = await estimate_area_demand_ratio_near(
            db, float(request.pickup_lat), float(request.pickup_lng)
        )
        demand_source = "area_estimate"

    route_data = await get_directions_from_google(
        request.pickup_lat,
        request.pickup_lng,
        request.dropoff_lat,
        request.dropoff_lng,
        stop_lat=request.stop_lat,
        stop_lng=request.stop_lng,
    )

    straight_km = calculate_distance_haversine(
        request.pickup_lat,
        request.pickup_lng,
        request.dropoff_lat,
        request.dropoff_lng,
    )

    distance_km = 0.0
    duration_min = 5
    traffic_duration_min = 5
    polyline = None
    route_metrics_source = "none"
    road_ok = False

    if is_directions_road_route(route_data):
        try:
            distance_km = float(route_data["distance_meters"]) / 1000.0
            duration_min = math.ceil(float(route_data["duration_seconds"]) / 60.0)
            dit = route_data.get("duration_in_traffic_seconds")
            if dit is None:
                dit = route_data["duration_seconds"]
            traffic_duration_min = math.ceil(float(dit) / 60.0)
            polyline = route_data.get("polyline")
            route_metrics_source = str(route_data.get("source") or "google")
            road_ok = True
        except (TypeError, ValueError, KeyError):
            road_ok = False

    # Server could not produce usable road metrics (no key, API error, bad cache, parse error).
    # If the app has a real Directions leg, accept it when plausibility vs great-circle holds.
    if not road_ok:
        cm = request.google_route_distance_meters
        cs = request.google_route_duration_seconds
        if cm is not None and cs is not None and _client_google_route_plausible(straight_km, cm, cs):
            distance_km = max(0.5, float(cm) / 1000.0)
            duration_min = max(5, math.ceil(float(cs) / 60.0))
            traffic_duration_min = max(
                duration_min,
                math.ceil(float(cs) / 60.0 * 1.08),
            )
            route_metrics_source = "client_google_directions"
            road_ok = True
            logger.info(
                "fare_estimate using client Google Directions (server route unusable; source=%s) km=%.2f min=%s",
                str((route_data or {}).get("source") if isinstance(route_data, dict) else ""),
                distance_km,
                duration_min,
            )

    if not road_ok:
        raise HTTPException(
            status_code=503,
            detail=(
                "Driving route unavailable. Enable Google Directions API and configure your Maps key. "
                "NEXRYDE does not price rides using straight-line distance."
            ),
        )

    distance_km = max(0.5, distance_km)
    duration_min = max(5, duration_min)
    
    has_stop = (
        request.stop_lat is not None
        and request.stop_lng is not None
        and math.isfinite(float(request.stop_lat))
        and math.isfinite(float(request.stop_lng))
    )

    fare = calculate_fare(
        distance_km,
        duration_min,
        traffic_duration_min,
        svc,
        city,
        demand_effective,
        rain_flag,
        request.pickup_lat,
        request.pickup_lng,
        request.dropoff_lat,
        request.dropoff_lng,
        has_intermediate_stop=has_stop,
    )

    # Same hybrid surge path as driver earnings / GET /surge/check (per-service cap from FARE_CONFIG).
    surge_details = calculate_surge_multiplier(
        float(request.pickup_lat),
        float(request.pickup_lng),
        demand_effective,
        rain_flag,
        svc,
        city,
    )
    rain_mult = float(SURGE_CONFIG.get("rain_multiplier", 1.4)) if rain_flag else 1.0

    # ── First-ride discount: 20% off total fare for riders with 0 completed trips ──
    first_ride_discount_applied = False
    original_total_fare = fare["total_fare"]
    rider_id_for_discount = (str(request.rider_id).strip() if request.rider_id is not None else "") or None
    if rider_id_for_discount:
        auth_header = http_request.headers.get("authorization", "")
        raw_token = auth_header[7:].strip() if auth_header.lower().startswith("bearer ") else ""
        if not raw_token:
            raise HTTPException(status_code=401, detail="Authentication required for rider-specific fare discounts")
        payload = verify_jwt_token(raw_token)
        if payload.get("sub") != rider_id_for_discount:
            raise HTTPException(status_code=403, detail="You do not have permission to estimate this rider's discounts")
        try:
            prior_completed = await db.trips.count_documents({
                "rider_id": rider_id_for_discount,
                "status": "completed",
            })
            if prior_completed == 0:
                discount_amount = round(fare["total_fare"] * 0.20)
                fare = {**fare, "total_fare": max(300, fare["total_fare"] - discount_amount)}
                first_ride_discount_applied = True
        except Exception:
            pass  # silently skip on DB error — never block a fare estimate

    favorite_driver_discount_applied = False
    favorite_driver_discount_pct: Optional[float] = None
    pref_est = (getattr(request, "preferred_driver_id", None) or "").strip() or None
    if rider_id_for_discount and pref_est:
        try:
            rider_doc = await db.users.find_one({"id": rider_id_for_discount})
            fav_ids = (rider_doc or {}).get("favorite_drivers") or []
            if pref_est in fav_ids:
                try:
                    fav_pct_est = float(os.environ.get("NEXRYDE_FAVORITE_DRIVER_DISCOUNT_PCT", "0.05") or "0")
                except (TypeError, ValueError):
                    fav_pct_est = 0.05
                fav_pct_est = max(0.0, min(fav_pct_est, 0.25))
                if fav_pct_est > 0:
                    amt = round(float(fare["total_fare"]) * fav_pct_est)
                    fare = {**fare, "total_fare": max(300, float(fare["total_fare"]) - amt)}
                    favorite_driver_discount_applied = True
                    favorite_driver_discount_pct = fav_pct_est
        except Exception:
            pass

    base_price, min_price, max_price = smart_bounds_from_base_price(float(fare["total_fare"]))
    preview_coords = build_route_preview_coordinates(
        request.pickup_lat,
        request.pickup_lng,
        request.dropoff_lat,
        request.dropoff_lng,
        polyline,
    )
    map_region = region_for_preview(
        request.pickup_lat,
        request.pickup_lng,
        request.dropoff_lat,
        request.dropoff_lng,
    )
    area_line = area_summary_line(
        request.pickup_address or "",
        request.dropoff_address or "",
    )

    comp_summary: str | None = None
    comp_bullets: list[str] | None = None
    if city_norm != "lagos":
        comp_summary = NEXRYDE_NATIONWIDE_POSITIONING_SUMMARY
        comp_bullets = list(NEXRYDE_NATIONWIDE_POSITIONING_BULLETS)

    lagride_profile_out: dict | None = None
    _lp = fare.get("lagride_profile")
    if city_norm == "lagos" and isinstance(_lp, dict):
        lagride_profile_out = {
            **_lp,
            "route_metrics_source": route_metrics_source,
            "road_route_ok": bool(road_ok),
        }
        if first_ride_discount_applied:
            lagride_profile_out["first_ride_discount_applied"] = True
            lagride_profile_out["rider_total_after_discount"] = float(fare["total_fare"])

    estimate_id = str(uuid.uuid4())
    _now_utc = datetime.now(timezone.utc)
    _lock_until_utc = _now_utc + timedelta(minutes=FARE_LOCK_MINUTES)
    _lock_doc = {
        "fare": fare,
        "distance_km": round(distance_km, 2),
        "duration_min": duration_min,
        "polyline": polyline,
        "service_type": svc,
        "city": city,
        "pickup": {"lat": request.pickup_lat, "lng": request.pickup_lng},
        "dropoff": {"lat": request.dropoff_lat, "lng": request.dropoff_lng},
        **(
            {"stop": {"lat": request.stop_lat, "lng": request.stop_lng}}
            if request.stop_lat is not None and request.stop_lng is not None
            else {}
        ),
        "created_at": _now_utc,
        "expires_at": _lock_until_utc,
        "base_price": base_price,
        "min_price": min_price,
        "max_price": max_price,
        "route_preview_coordinates": preview_coords,
        "map_preview_region": map_region,
        "area_summary_line": area_line,
        "demand_ratio": demand_effective,
        "demand_ratio_source": demand_source,
        "rain_applied": rain_flag,
        "rain_multiplier": rain_mult,
        "surge_details": surge_details,
        "route_metrics_source": route_metrics_source,
        "lagride_profile": lagride_profile_out,
        "competitive_positioning_summary": comp_summary,
        "competitive_positioning_bullets": comp_bullets,
        "surge_model": NEXRYDE_ESTIMATE_SURGE_MODEL,
        "driver_payout_policy_note": NEXRYDE_DRIVER_PAYOUT_POLICY_NOTE,
    }
    try:
        await save_fare_estimate(estimate_id, _lock_doc)
    except Exception:
        logger.exception("Mongo fare lock save failed; using in-process store only")
    fare_estimate_store[estimate_id] = _lock_doc

    return {
        "estimate_id": estimate_id,
        "distance_km": round(distance_km, 2),
        "duration_min": duration_min,
        "estimated_time_minutes": duration_min,
        "traffic_duration_min": traffic_duration_min,
        "route_metrics_source": route_metrics_source,
        "road_route_ok": bool(road_ok),
        "fare_rate_model": fare.get("fare_rate_model"),
        **({"lagride_profile": lagride_profile_out} if lagride_profile_out is not None else {}),
        "pricing_route_minutes": fare.get("pricing_route_minutes"),
        "base_fare": fare["base_fare"],
        "distance_fee": fare["distance_fee"],
        "time_fee": fare["time_fee"],
        "has_intermediate_stop": fare.get("has_intermediate_stop", False),
        "stop_time_fee_applied": fare.get("stop_time_fee_applied", False),
        "stop_time_per_min": fare.get("stop_time_per_min", 0),
        "traffic_fee": fare["traffic_fee"],
        "booking_fee": fare["booking_fee"],
        "subtotal": fare["subtotal"],
        "location_multiplier": fare.get("location_multiplier"),
        "location_zone": fare.get("location_zone"),
        "service_multiplier": fare.get("service_multiplier"),
        "total_fare": fare["total_fare"],
        "base_price": base_price,
        "min_price": min_price,
        "max_price": max_price,
        "smart_pricing_note": (
            "Lagos: your fare is route-based (distance × area × tier × surge)—see breakdown. "
            "Offers near the suggested fare match faster."
            if city_norm == "lagos"
            else "Rides at or above 95% of suggested price are prioritized for matching."
        ),
        "competitive_positioning_summary": comp_summary,
        "competitive_positioning_bullets": comp_bullets,
        "surge_model": NEXRYDE_ESTIMATE_SURGE_MODEL,
        "driver_payout_policy_note": NEXRYDE_DRIVER_PAYOUT_POLICY_NOTE,
        "first_ride_discount_applied": first_ride_discount_applied,
        "original_total_fare": original_total_fare if first_ride_discount_applied else None,
        "favorite_driver_discount_applied": favorite_driver_discount_applied,
        "favorite_driver_discount_pct": favorite_driver_discount_pct,
        "surge_multiplier": fare["surge_multiplier"],
        "surge_uncapped": fare.get("surge_uncapped"),
        "surge_factors": fare.get("surge_factors"),
        "surge_details": surge_details,
        "demand_ratio": demand_effective,
        "demand_ratio_source": demand_source,
        "rain_applied": rain_flag,
        "rain_multiplier": rain_mult,
        "is_peak": fare["is_peak"],
        "is_weekend": fare["is_weekend"],
        "peak_type": fare["peak_type"],
        "currency": fare["currency"],
        "min_fare": fare["min_fare"],
        "cancellation_fee": fare["cancellation_fee"],
        "fare_bucket": fare.get("fare_bucket"),
        "short_trip_threshold_km": fare.get("short_trip_threshold_km"),
        "service_type": svc,
        "city": city,
        "polyline": polyline,
        "encoded_polyline": polyline,
        "distance_meters": int(round(distance_km * 1000)),
        "duration_seconds": int(duration_min * 60),
        "route_preview_coordinates": preview_coords,
        "map_preview_region": map_region,
        "area_summary_line": area_line,
        "price_breakdown": fare["price_breakdown"],
        "price_valid_until": _lock_until_utc.isoformat().replace("+00:00", "Z"),
        "price_lock_minutes": FARE_LOCK_MINUTES,
        "is_insured": True,
    }



# ==================== WALLET ENDPOINTS ====================
@payments_router.get("/wallet/me")
async def get_wallet_me(request: Request, limit: int = 25):
    """Authenticated user: balance + recent transactions (must be before /wallet/{user_id})."""
    user_id = require_authenticated(request)
    verify_owner_strict(request, user_id)
    user = await find_user_by_id(user_id, {"_id": 0, "wallet_balance": 1})
    safe_limit = max(1, min(limit, 100))
    rows = (
        await db.transactions.find({"user_id": user_id}, {"_id": 0})
        .sort("timestamp", -1)
        .limit(safe_limit)
        .to_list(safe_limit)
    )
    for tx in rows:
        ts = tx.get("timestamp")
        if hasattr(ts, "isoformat"):
            tx["timestamp"] = ts.isoformat()
    return {
        "currency": "NGN",
        "user_id": user_id,
        "balance": float((user or {}).get("wallet_balance") or 0),
        "transactions": rows,
    }


@payments_router.get("/wallet")
async def get_wallet_v2(request: Request, limit: int = 20):
    payload = await get_wallet_me(request, limit=limit)
    return {
        "data": {
            "balanceKobo": int(round(float(payload.get("balance") or 0) * 100)),
            "currency": payload.get("currency", "NGN"),
            "recentTxns": payload.get("transactions", []),
        }
    }


@payments_router.get("/wallet/pending-intents")
async def get_wallet_pending_intents_v2(request: Request):
    user_id = require_authenticated(request)
    verify_owner_strict(request, user_id)
    await _expire_stale_wallet_payment_intents(user_id)
    rows = (
        await db.wallet_payment_intents.find(
            {"user_id": user_id, "status": "pending"},
            {"_id": 0, "transaction_ref": 1, "expires_at": 1, "status": 1, "amount_kobo": 1},
        )
        .sort("created_at", -1)
        .limit(20)
        .to_list(20)
    )
    out = []
    for row in rows:
        exp = row.get("expires_at")
        out.append(
            {
                "squadReference": row.get("transaction_ref"),
                "status": row.get("status"),
                "amountKobo": int(row.get("amount_kobo") or 0),
                "expiresAt": exp.isoformat() if isinstance(exp, datetime) else None,
            }
        )
    return {"data": out}


@payments_router.post("/wallet/topup/init")
async def wallet_topup_init_v2(request: Request, body: WalletTopupInitKoboBody):
    amount_ngn = round(body.amountKobo / 100.0, 2)
    result = await initiate_rider_wallet_checkout(
        request,
        RiderWalletTopupAmountBody(amount=amount_ngn, replace_pending=False),
    )
    return {
        "data": {
            "reference": result.get("transaction_ref"),
            "checkoutUrl": result.get("checkout_url"),
            "expiresAt": (datetime.utcnow() + timedelta(minutes=30)).isoformat(),
        }
    }


@payments_router.post("/wallet/topup/verify")
async def wallet_topup_verify_v2(request: Request, body: WalletReferenceBody):
    result = await verify_pending_rider_wallet_checkout(
        request,
        VerifyRiderWalletBody(transaction_ref=body.reference),
    )
    user_id = require_authenticated(request)
    user = await db.users.find_one({"id": user_id})
    intent = await db.wallet_payment_intents.find_one(
        {"user_id": user_id, "transaction_ref": {"$in": _wallet_intent_ref_candidates(body.reference)}},
        sort=[("updated_at", -1)],
    )
    return {
        "data": {
            "intent": {
                "reference": body.reference,
                "status": str((intent or {}).get("status") or "pending"),
                "verified": bool(result.get("verified")),
                "credited": bool(result.get("credited")),
                "reason": result.get("reason"),
            },
            "wallet": {
                "balanceKobo": int(round(float((user or {}).get("wallet_balance") or 0) * 100)),
                "currency": "NGN",
            },
        }
    }


@payments_router.post("/wallet/topup/cancel")
async def wallet_topup_cancel_v2(request: Request, body: WalletReferenceBody):
    user_id = require_authenticated(request)
    verify_owner_strict(request, user_id)
    cancelled = await _cancel_pending_wallet_intent_by_reference(user_id, body.reference)
    return {"data": {"cancelled": cancelled >= 0}}


@payments_router.get("/wallet/callback")
async def wallet_callback_v2(reference: Optional[str] = None):
    ref = (reference or "").strip()
    deep_link = f"nexryde://wallet/return?reference={ref}" if ref else "nexryde://wallet/return"
    html = f"""
<!doctype html>
<html>
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
  <body style="font-family: sans-serif; padding: 24px;">
    <h3>Returning to NEXRYDE Wallet</h3>
    <p>Payment verification continues securely in-app.</p>
    <a href="{deep_link}">Tap here if the app did not open automatically</a>
    <script>window.location.href = "{deep_link}";</script>
  </body>
</html>
"""
    return HTMLResponse(content=html)


@payments_router.get("/payment/subscription/callback")
async def subscription_payment_callback(reference: Optional[str] = None):
    """
    Squad redirects here after driver subscription checkout completes (success, cancel, or failure).
    We redirect back to the app via deep link so the in-app browser (WebBrowser.openBrowserAsync)
    closes and the subscription screen auto-verifies the payment.
    """
    ref = (reference or "").strip()
    deep_link = f"nexryde://subscription/return?reference={ref}" if ref else "nexryde://subscription/return"
    html = f"""
<!doctype html>
<html>
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
  <body style="background:#0A0A0A;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center;padding:24px;box-sizing:border-box;">
    <div>
      <div style="font-size:48px;margin-bottom:16px;">✅</div>
      <h2 style="margin:0 0 8px;font-size:22px;">Returning to NEXRYDE</h2>
      <p style="color:#aaa;margin:0 0 24px;">Your payment is being verified. Please wait…</p>
      <a href="{deep_link}" style="display:inline-block;background:#00D084;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;">
        Tap here if app did not open
      </a>
    </div>
    <script>
      setTimeout(function() {{ window.location.href = "{deep_link}"; }}, 800);
    </script>
  </body>
</html>
"""
    logger.info("subscription_payment_callback: ref=%s deep_link=%s", ref or "(none)", deep_link)
    return HTMLResponse(content=html)


@payments_router.get("/wallet/{user_id}")
async def get_wallet_balance(user_id: str, request: Request):
    """Get user wallet balance"""
    verify_owner_strict(request, user_id)
    user = await db.users.find_one({"id": user_id})
    base: dict = {"currency": "NGN", "user_id": user_id}
    if not user:
        base["balance"] = 0
        base["balance_kobo"] = 0
        return base
    bal = float(user.get("wallet_balance", 0) or 0)
    base["balance"] = bal
    base["balance_kobo"] = _naira_to_kobo(bal)
    return base


@payments_router.get("/wallet/{user_id}/transactions")
async def get_wallet_transactions(user_id: str, request: Request, limit: int = 30):
    """Get recent wallet transactions for a user."""
    verify_owner_strict(request, user_id)
    safe_limit = max(1, min(limit, 100))
    rows = await db.transactions.find(
        {"user_id": user_id},
        {"_id": 0}
    ).sort("timestamp", -1).limit(safe_limit).to_list(safe_limit)
    for tx in rows:
        ts = tx.get("timestamp")
        if hasattr(ts, "isoformat"):
            tx["timestamp"] = ts.isoformat()
        if "amount_kobo" not in tx and tx.get("amount") is not None:
            try:
                tx["amount_kobo"] = _naira_to_kobo(float(tx.get("amount") or 0))
            except Exception:
                pass
    return {"user_id": user_id, "transactions": rows}

@payments_router.post("/wallet/{user_id}/topup")
async def topup_wallet_balance(user_id: str, request: dict, http_request: Request):
    """Top up wallet - ENHANCED with validation and logging"""
    from feature_flags import is_wallet_enabled
    if not await is_wallet_enabled(db):
        raise HTTPException(
            status_code=403,
            detail="Wallet top-up is currently unavailable. Pay your driver directly with cash or bank transfer.",
        )
    verify_owner_strict(http_request, user_id)
    amount = request.get("amount", 0)
    if not amount:
        raise HTTPException(status_code=400, detail="amount is required")
    
    # Validation
    if amount < 100:
        raise HTTPException(status_code=400, detail="Minimum top-up is ₦100")
    if amount > 1000000:
        raise HTTPException(status_code=400, detail="Maximum single top-up is ₦1,000,000. Contact support for larger amounts.")
    
    # Check if user exists
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    payment_reference = (request.get("payment_reference") or "").strip()
    if not payment_reference:
        raise HTTPException(status_code=400, detail="payment_reference is required")

    provider_result = await _verify_reference_with_paystack(payment_reference, float(amount))
    if not provider_result.get("verified"):
        raise HTTPException(status_code=400, detail="Payment could not be verified")
    
    # Create transaction record for audit
    transaction = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "type": "topup",
        "amount": amount,
        "amount_kobo": _naira_to_kobo(float(amount)),
        "status": "completed",
        "timestamp": datetime.utcnow(),
        "payment_method": request.get("payment_method", "card"),
        "reference": payment_reference,
        "provider_verification": provider_result,
    }
    
    await db.transactions.insert_one(transaction)
    
    # Update wallet balance
    await db.users.update_one(
        {"id": user_id},
        {"$inc": {"wallet_balance": amount}}
    )
    
    user = await db.users.find_one({"id": user_id})
    new_balance = user.get("wallet_balance", amount)
    
    logger.info(f"💰 Wallet top-up: User {user_id} added ₦{amount:,.2f}. New balance: ₦{new_balance:,.2f}")
    
    return {
        "success": True,
        "message": f"Successfully added ₦{amount:,.2f} to wallet",
        "new_balance": new_balance,
        "amount_added": amount,
        "transaction_id": transaction["id"],
        "reference": transaction["reference"]
    }


@payments_router.post("/wallet/refund")
async def refund_wallet_transaction(body: WalletRefundRequestBody, request: Request):
    """Admin-only deterministic refund for completed wallet top-up transactions."""
    await require_admin_request(request)
    user_id = body.user_id.strip()
    tx_id = body.transaction_id.strip()
    reason = body.reason.strip()
    idem_key = (body.idempotency_key or "").strip() or f"refund:{tx_id}"

    source_tx = await db.transactions.find_one({"id": tx_id, "user_id": user_id}, {"_id": 0})
    if not source_tx:
        raise HTTPException(status_code=404, detail="Source transaction not found")

    src_type = str(source_tx.get("type") or "").lower()
    src_status = str(source_tx.get("status") or "").lower()
    src_source = str(source_tx.get("source") or "").lower()

    # Real Squad-funded top-ups are stored as type="credit"/status="success"
    # (see _credit_wallet_for_squad_reference), while legacy/manual top-ups use
    # type="topup"/status="completed". Accept both shapes so a genuinely funded
    # balance can actually be refunded.
    is_legacy_topup = src_type in {"topup", "wallet_topup"}
    is_squad_credit = src_type == "credit" and src_source == "squad"
    if not (is_legacy_topup or is_squad_credit):
        raise HTTPException(status_code=400, detail="Only completed wallet top-up transactions can be refunded")
    if src_status not in {"completed", "success"}:
        raise HTTPException(status_code=400, detail="Source transaction is not in a completed/success status")

    amount_ngn = _normalize_amount(source_tx.get("amount"))
    if amount_ngn is None or amount_ngn <= 0:
        raise HTTPException(status_code=400, detail="Invalid source amount for refund")

    existing = await db.transactions.find_one(
        {
            "type": "refund",
            "$or": [
                {"meta.source_transaction_id": tx_id},
                {"meta.idempotency_key": idem_key},
            ],
            "status": "completed",
        },
        {"_id": 0},
    )
    if existing:
        return {
            "success": True,
            "duplicate": True,
            "refund_transaction_id": existing.get("id"),
            "refunded_amount": existing.get("amount"),
        }

    user = await db.users.find_one({"id": user_id}, {"_id": 0, "wallet_balance": 1})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    debit_result = await db.users.update_one(
        {"id": user_id, "wallet_balance": {"$gte": float(amount_ngn)}},
        {"$inc": {"wallet_balance": -float(amount_ngn)}},
    )
    if debit_result.modified_count != 1:
        raise HTTPException(status_code=409, detail="Refund blocked: insufficient current wallet balance")

    refund_tx = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "type": "refund",
        "amount": float(amount_ngn),
        "amount_kobo": _naira_to_kobo(float(amount_ngn)),
        "status": "completed",
        "timestamp": datetime.utcnow(),
        "reference": f"refund_{uuid.uuid4().hex[:12]}",
        "meta": {
            "source_transaction_id": tx_id,
            "source_reference": source_tx.get("reference"),
            "reason": reason,
            "idempotency_key": idem_key,
            "refunded_by": request.headers.get("x-admin-email") or "admin",
        },
    }
    await db.transactions.insert_one(refund_tx)

    updated_user = await db.users.find_one({"id": user_id}, {"_id": 0, "wallet_balance": 1})
    return {
        "success": True,
        "duplicate": False,
        "refund_transaction_id": refund_tx["id"],
        "refunded_amount": float(amount_ngn),
        "new_balance": float((updated_user or {}).get("wallet_balance") or 0),
    }


@payments_router.get("/wallet/reconcile")
async def wallet_reconcile(request: Request, tolerance: float = 1.0, limit: int = 1000):
    """Admin-only: flag wallets whose stored balance diverges from the ledger.

    Read-only — reports divergence, never writes corrections. Run periodically
    (or before widening past the pilot) to catch double-credits/debits and the
    stale db.wallets parallel store.
    """
    await require_admin_request(request)
    from wallet_reconciliation import reconcile_wallets
    return await reconcile_wallets(db, tolerance=float(tolerance), limit=int(limit))


# ==================== SURGE PRICING ====================
def _service_surge_cap(city: str, service_type: str) -> float:
    city_key = normalize_fare_city_key(city or "default")
    svc = (service_type or "economy").strip().lower()
    if svc == "standard":
        svc = "economy"
    if svc == "pro":
        svc = "premium"
    city_cfg = FARE_CONFIG.get(city_key, FARE_CONFIG["default"])
    tier = city_cfg.get(svc) or city_cfg.get("economy") or FARE_CONFIG["default"]["economy"]
    return float(tier.get("max_multiplier", 2.5))


def calculate_surge_multiplier(
    lat: float = 0.0,
    lng: float = 0.0,
    demand_ratio: float = 0.0,
    is_raining: bool = False,
    service_type: str = "economy",
    city: str = "lagos",
) -> dict:
    """
    Rider-facing surge: max(Normal, High demand, Rain, Peak) in WAT — matches nationwide product card
    and Lagos Lagride fare engine. Capped by ``FARE_CONFIG`` tier ``max_multiplier``.
    """
    cap = _service_surge_cap(city, service_type)
    return compute_max_style_surge_multiplier(
        lat=lat,
        lng=lng,
        demand_ratio=demand_ratio,
        is_raining=is_raining,
        service_max_multiplier=cap,
    )


@payments_router.get("/surge/check")
async def check_surge_pricing(
    lat: float = 0.0,
    lng: float = 0.0,
    demand_ratio: float = 0.0,
    rain: int = 0,
    service_type: str = "economy",
    city: str = "lagos",
):
    """Check current surge pricing for a location."""
    return calculate_surge_multiplier(lat, lng, demand_ratio, bool(rain), service_type, city)


# ==================== PROMO CODES ====================
@payments_router.post("/promo/apply")
async def apply_promo(rider_id: str, code: str, request: Request):
    """Apply promo code"""
    verify_owner_strict(request, rider_id)
    promo = await db.promo_codes.find_one({"code": code.upper(), "active": True})
    if not promo:
        raise HTTPException(status_code=404, detail="Invalid promo code")
    
    await db.users.update_one({"id": rider_id}, {"$push": {"active_promos": {"code": code, "applied_at": datetime.utcnow()}}})
    return {"success": True, "discount_percent": promo.get("discount_percent", 10)}

@payments_router.get("/referral/code/{user_id}")
async def get_referral_code(user_id: str, request: Request):
    """Get referral code"""
    verify_owner_strict(request, user_id)
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    code = user.get("referral_code") or f"NEX{user.get('name', 'U')[:3].upper()}{random.randint(100, 999)}"
    if not user.get("referral_code"):
        await db.users.update_one({"id": user_id}, {"$set": {"referral_code": code}})
    
    return {"referral_code": code, "bonus_per_referral": 500}

# Wallet endpoints moved to line 3144 - removed duplicates


# ==================== TRIP RECEIPTS ====================
@payments_router.get("/trips/{trip_id}/receipt")
async def get_receipt(trip_id: str, request: Request):
    """Get trip receipt"""
    trip = await db.trips.find_one({"id": trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    verify_trip_participant(request, trip)
    
    # Handle both dict and string pickup/dropoff formats
    pickup_loc = trip.get("pickup_location") or trip.get("pickup", {})
    dropoff_loc = trip.get("dropoff_location") or trip.get("dropoff", {})
    
    pickup_address = pickup_loc.get("address", pickup_loc) if isinstance(pickup_loc, dict) else str(pickup_loc)
    dropoff_address = dropoff_loc.get("address", dropoff_loc) if isinstance(dropoff_loc, dict) else str(dropoff_loc)
    
    return {
        "receipt_id": f"NXR-{trip_id[:8].upper()}",
        "trip_id": trip_id,
        "date": trip.get("created_at", datetime.utcnow()).isoformat() if isinstance(trip.get("created_at"), datetime) else str(trip.get("created_at", "")),
        "pickup": pickup_address,
        "dropoff": dropoff_address,
        "fare": trip.get("fare", 0),
        "payment_method": trip.get("payment_method", "cash"),
        "status": trip.get("status", "completed"),
        "distance_km": trip.get("distance_km", 0),
        "duration_mins": trip.get("duration_mins", 0)
    }


# ==================== DRIVER TIER SYSTEM ====================
@payments_router.get("/driver/tier/{driver_id}")
async def get_driver_tier(driver_id: str, request: Request):
    """Get driver's current tier and requirements"""
    verify_owner_strict(request, driver_id)
    tier_data = await db.driver_tiers.find_one({"driver_id": driver_id})
    
    if not tier_data:
        # Create default basic tier
        tier_data = {
            "id": str(uuid.uuid4()),
            "driver_id": driver_id,
            "tier": "basic",
            "requirements_met": {},
            "warnings": 0,
            "created_at": datetime.utcnow()
        }
        await db.driver_tiers.insert_one(tier_data)
    
    current_tier = tier_data.get("tier", "basic")
    tier_config = TIER_CONFIG.get(current_tier, TIER_CONFIG["basic"])
    
    return {
        "driver_id": driver_id,
        "current_tier": current_tier,
        "tier_name": tier_config["name"],
        "monthly_fee": tier_config["monthly_fee"],
        "earning_potential": tier_config["earning_per_ride"],
        "requirements": TIER_CONFIG["premium"]["requirements"],
        "requirements_met": tier_data.get("requirements_met", {}),
        "warnings": tier_data.get("warnings", 0),
        "probation_until": tier_data.get("probation_until"),
        "can_upgrade": current_tier == "basic",
        "upgrade_path": {
            "steps": [
                "Maintain 4.7★ rating for 60 days",
                "Own/lease approved Premium vehicle (2018+)",
                "Complete free Premium Service course",
                "Pass vehicle inspection (₦2,000)",
            ],
            "extra_fee": 0  # No extra monthly fee!
        },
        "premium_perks": TIER_CONFIG["premium"].get("perks", [])
    }

@payments_router.post("/driver/tier/upgrade")
async def request_tier_upgrade(driver_id: str, request: DriverTierUpgradeRequest, http_request: Request):
    """Request upgrade to Premium tier"""
    verify_owner_strict(http_request, driver_id)
    driver = await db.driver_profiles.find_one({"user_id": driver_id})
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")
    
    user = await db.users.find_one({"id": driver_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check rating requirement
    if user.get("rating", 0) < 4.7:
        raise HTTPException(status_code=400, detail="Rating must be 4.7 or higher")
    
    # Check vehicle year
    if request.vehicle_year < 2018:
        raise HTTPException(status_code=400, detail="Vehicle must be 2018 or newer")
    
    # Create inspection request
    inspection = {
        "id": str(uuid.uuid4()),
        "driver_id": driver_id,
        "inspection_type": "initial",
        "status": "pending",
        "interior_photo": request.interior_photo,
        "exterior_photo": request.exterior_photo,
        "leather_seats": request.leather_seats,
        "ac_working": request.dual_ac,
        "vehicle_year": request.vehicle_year,
        "created_at": datetime.utcnow()
    }
    await db.vehicle_inspections.insert_one(inspection)
    
    # Update tier requirements met
    await db.driver_tiers.update_one(
        {"driver_id": driver_id},
        {
            "$set": {
                "requirements_met": {
                    "rating_ok": True,
                    "vehicle_year_ok": True,
                    "leather_seats": request.leather_seats,
                    "dual_ac": request.dual_ac,
                    "inspection_pending": True
                }
            }
        },
        upsert=True
    )
    
    return {
        "message": "Upgrade request submitted",
        "inspection_id": inspection["id"],
        "next_steps": [
            "Vehicle inspection will be scheduled within 48 hours",
            "Complete Premium Service training (free in-app course)",
            "Inspection fee: ₦2,000 at partner garage"
        ]
    }

@payments_router.get("/tiers/config")
async def get_tier_configuration():
    """Get all tier configurations"""
    return {
        "tiers": TIER_CONFIG,
        "same_monthly_fee": True,
        "fee_amount": 18000,
        "upgrade_benefit": "Higher earning potential per ride, NOT higher fee"
    }


# ==================== AUTOMATIC FARE ADJUSTMENT ====================
def get_time_rate(trip_time: datetime) -> float:
    """Get the time-based rate for fare adjustment"""
    hour = trip_time.hour
    weekday = trip_time.weekday()
    
    config = FARE_ADJUSTMENT_CONFIG
    
    # Night hours (10pm - 5am)
    if hour >= config["night_hours"]["start"] or hour < config["night_hours"]["end"]:
        return config["time_rates"]["night"]
    
    # Peak hours
    peak = config["peak_hours"]
    if (peak["morning"]["start"] <= hour < peak["morning"]["end"] or
        peak["evening"]["start"] <= hour < peak["evening"]["end"]):
        return config["time_rates"]["peak"]
    
    # Weekend
    if weekday >= 5:
        return config["time_rates"]["weekend"]
    
    return config["time_rates"]["normal"]

def get_weather_surcharge(weather_condition: str) -> float:
    """Get weather surcharge percentage"""
    surcharges = FARE_ADJUSTMENT_CONFIG["weather_surcharges"]
    return surcharges.get(weather_condition, 0.0)

@payments_router.post("/fare/calculate-adjustment")
async def calculate_fare_adjustment(trip_id: str, request: Request):
    """Calculate automatic fare adjustment at trip end"""
    trip = await db.trips.find_one({"id": trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    verify_trip_participant(request, trip)
    if trip.get("status") != "completed":
        raise HTTPException(status_code=400, detail="Fare adjustment can only run after trip completion")

    existing_adjustment = await db.fare_adjustments.find_one({"trip_id": trip_id}, {"_id": 0})
    if existing_adjustment:
        return {
            "trip_id": trip_id,
            "breakdown": {
                "base_fare": existing_adjustment.get("base_fare"),
                "traffic_delay": {
                    "extra_minutes": existing_adjustment.get("extra_time_mins"),
                    "rate_per_minute": existing_adjustment.get("time_rate"),
                    "charge": existing_adjustment.get("traffic_charge"),
                },
                "weather_surcharge": existing_adjustment.get("weather_surcharge"),
                "weather_condition": existing_adjustment.get("weather_condition"),
                "total_adjustment": existing_adjustment.get("total_adjustment"),
                "cap_applied": existing_adjustment.get("cap_applied"),
                "max_cap": f"{existing_adjustment.get('max_cap_percentage', FARE_ADJUSTMENT_CONFIG['max_increase_percentage'])}%",
            },
            "final_fare": existing_adjustment.get("final_fare"),
            "message": "Fare adjustment already calculated for this trip",
        }
    
    tracking = await db.trip_tracking.find_one({"trip_id": trip_id})
    
    base_fare = trip.get("fare", 0)
    estimated_time = trip.get("duration_mins", 0)
    
    # Calculate actual time
    started_at = trip.get("started_at")
    completed_at = trip.get("completed_at") or datetime.utcnow()
    
    if started_at:
        actual_time = int((completed_at - started_at).total_seconds() / 60)
    else:
        actual_time = estimated_time
    
    config = FARE_ADJUSTMENT_CONFIG
    free_buffer = config["free_buffer_minutes"]
    
    # Extra time calculation
    extra_time = max(0, actual_time - estimated_time - free_buffer)
    
    # Get time rate
    time_rate = get_time_rate(started_at or datetime.utcnow())
    
    # Calculate traffic charge
    traffic_charge = extra_time * time_rate
    
    # Weather surcharge (check tracking data)
    weather_surcharge = 0.0
    weather_condition = None
    if tracking:
        weather_conditions = tracking.get("weather_conditions", [])
        for wc in weather_conditions:
            if wc.get("surcharge_applied"):
                weather_condition = wc.get("condition")
                weather_surcharge = base_fare * get_weather_surcharge(weather_condition)
                break
    
    # Total adjustment
    total_adjustment = traffic_charge + weather_surcharge
    
    # Apply 50% cap
    max_cap = config["max_increase_percentage"] / 100
    max_increase = base_fare * max_cap
    cap_applied = total_adjustment > max_increase
    
    if cap_applied:
        total_adjustment = max_increase
    
    final_fare = base_fare + total_adjustment
    
    # Store adjustment
    adjustment = {
        "id": str(uuid.uuid4()),
        "trip_id": trip_id,
        "base_fare": base_fare,
        "estimated_time_mins": estimated_time,
        "actual_time_mins": actual_time,
        "extra_time_mins": extra_time,
        "time_rate": time_rate,
        "traffic_charge": traffic_charge,
        "weather_surcharge": weather_surcharge,
        "weather_condition": weather_condition,
        "total_adjustment": total_adjustment,
        "final_fare": final_fare,
        "cap_applied": cap_applied,
        "max_cap_percentage": config["max_increase_percentage"],
        "calculated_at": datetime.utcnow()
    }
    await db.fare_adjustments.insert_one(adjustment)
    
    # Update trip with final fare
    await db.trips.update_one(
        {"id": trip_id},
        {"$set": {"fare": final_fare, "traffic_fee": traffic_charge}}
    )
    
    return {
        "trip_id": trip_id,
        "breakdown": {
            "base_fare": base_fare,
            "traffic_delay": {
                "extra_minutes": extra_time,
                "rate_per_minute": time_rate,
                "charge": traffic_charge
            },
            "weather_surcharge": weather_surcharge,
            "weather_condition": weather_condition,
            "total_adjustment": total_adjustment,
            "cap_applied": cap_applied,
            "max_cap": f"{config['max_increase_percentage']}%"
        },
        "final_fare": final_fare,
        "message": "Fare calculated automatically based on actual trip conditions"
    }

@payments_router.get("/fare/breakdown/{trip_id}")
async def get_fare_breakdown(trip_id: str, request: Request):
    """Get detailed fare breakdown for a completed trip"""
    require_authenticated(request)
    adjustment = await db.fare_adjustments.find_one({"trip_id": trip_id})
    trip = await db.trips.find_one({"id": trip_id})
    
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    verify_trip_participant(request, trip)
    
    if not adjustment:
        # No adjustment was made
        return {
            "trip_id": trip_id,
            "base_fare": trip.get("fare", 0),
            "adjustments": None,
            "final_fare": trip.get("fare", 0),
            "message": "No adjustments applied to this trip"
        }
    
    return {
        "trip_id": trip_id,
        "base_fare": adjustment.get("base_fare"),
        "estimated_time": adjustment.get("estimated_time_mins"),
        "actual_time": adjustment.get("actual_time_mins"),
        "breakdown": {
            "traffic_delay": {
                "extra_minutes": adjustment.get("extra_time_mins"),
                "rate": adjustment.get("time_rate"),
                "charge": adjustment.get("traffic_charge")
            },
            "weather": {
                "condition": adjustment.get("weather_condition"),
                "surcharge": adjustment.get("weather_surcharge")
            }
        },
        "total_adjustment": adjustment.get("total_adjustment"),
        "cap_applied": adjustment.get("cap_applied"),
        "final_fare": adjustment.get("final_fare"),
        "calculated_at": adjustment.get("calculated_at")
    }


"""Payments Router - Wallet, subscriptions, fare, tiers, promos, receipts for NEXRYDE."""
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from typing import Optional, List
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

from openai import OpenAI

from database import db
from smart_pricing import (
    area_summary_line,
    build_route_preview_coordinates,
    region_for_preview,
    smart_bounds_from_base_price,
)
from auth_guard import verify_owner_strict, verify_trip_participant, require_authenticated
from admin_guard import require_admin_request

logger = logging.getLogger('server')
payments_router = APIRouter(prefix="/api", tags=["Payments"])
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
PAYSTACK_SECRET_KEY = os.environ.get("PAYSTACK_SECRET_KEY", "")
SQUAD_SECRET_KEY = os.environ.get("SQUAD_SECRET_KEY", "")
SQUAD_PUBLIC_KEY = os.environ.get("SQUAD_PUBLIC_KEY", "")
SQUAD_BASE_URL = os.environ.get("SQUAD_BASE_URL", "https://api-d.squadco.com").rstrip("/")

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

async def get_directions_from_google(p_lat, p_lng, d_lat, d_lng):
    if _get_directions_fn:
        return await _get_directions_fn(p_lat, p_lng, d_lat, d_lng)
    return None

def calculate_fare(dist, dur, traffic, svc="economy", city="lagos"):
    if _calculate_fare_fn:
        try:
            return _calculate_fare_fn(dist, dur, traffic, svc, city)
        except TypeError:
            return _calculate_fare_fn(dist, dur, traffic, svc)
    base = max(700, dist * 150)
    return {"base_fare": 300, "distance_fee": dist * 100, "time_fee": dur * 20, "traffic_fee": 0, "total_fare": base, "surge_multiplier": 1.0}

def calculate_distance_haversine(lat1, lon1, lat2, lon2):
    if _calculate_distance_fn:
        return _calculate_distance_fn(lat1, lon1, lat2, lon2)
    from math import radians, sin, cos, sqrt, atan2
    R = 6371
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat/2)**2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon/2)**2
    return R * 2 * atan2(sqrt(a), sqrt(1-a))

# Subscription config
SUBSCRIPTION_CONFIG = {
    "monthly_fee": 18000,
    "trial_hours": 48,
    "trial_trips": 0,
    "currency": "NGN",
    "bank_details": {
        "provider": "SquadCo",
        "mode": "virtual_account_only",
        "message": "Virtual account is generated per driver. No manual company transfer account.",
    }
}

# Surge pricing config
SURGE_CONFIG = {
    "enabled": True,
    "base_multiplier": 1.0,
    "max_multiplier": 2.5,
    "peak_hours": {
        "morning": {"start": 7, "end": 9, "multiplier": 1.2},
        "evening": {"start": 17, "end": 20, "multiplier": 1.3},
    },
    "high_demand_threshold": 0.7,
    "very_high_demand_threshold": 0.85,
    "critical_demand_threshold": 0.95,
    "surge_levels": {
        "normal": 1.0,
        "high": 1.3,
        "very_high": 1.5,
        "critical": 2.5,
    },
    "rain_multiplier": 1.3,
    "holiday_multiplier": 1.5,
}

fare_estimate_store = {}
FARE_LOCK_MINUTES = 3
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

class FareEstimateRequest(BaseModel):
    pickup_lat: float
    pickup_lng: float
    dropoff_lat: float
    dropoff_lng: float
    service_type: Optional[str] = "economy"
    city: Optional[str] = "lagos"
    trip_type: Optional[str] = None
    pickup_address: Optional[str] = None
    dropoff_address: Optional[str] = None

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
    user = await db.users.find_one({"id": driver_id})
    profile = await db.driver_profiles.find_one({"user_id": driver_id})
    if profile or (user and user.get("role") == "driver"):
        return
    raise HTTPException(status_code=403, detail="Driver account required")


async def _ensure_auto_trial_for_verified_driver(driver_id: str) -> Optional[dict]:
    """Auto-provision a 48-hour trial once driver verification/profile is complete."""
    existing = await db.subscriptions.find_one({"driver_id": driver_id}, sort=[("created_at", -1)])
    if existing:
        return existing

    profile = await db.driver_profiles.find_one({"user_id": driver_id}, {"_id": 0}) or {}
    is_verified = (profile.get("verification_status") == "approved") and bool(profile.get("profile_completed"))
    if not is_verified:
        return None

    now = datetime.utcnow()
    trial_end = now + timedelta(hours=SUBSCRIPTION_CONFIG["trial_hours"])
    city_price = await _get_dynamic_tier_price("city_rider")
    trial_doc = {
        "id": str(uuid.uuid4()),
        "driver_id": driver_id,
        "amount": city_price,
        "tier": "city_rider",
        "status": "trial",
        "start_date": now,
        "trial_end_date": trial_end,
        "trial_unlimited_city_only": True,
        "end_date": trial_end,
        "is_trial": True,
        "created_at": now,
        "updated_at": now,
    }
    await db.subscriptions.insert_one(trial_doc)
    logger.info(f"Auto-trial activated for verified driver={driver_id} trial_end={trial_end.isoformat()}")
    return trial_doc


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


def _to_utc_naive(dt_value: datetime) -> datetime:
    if dt_value.tzinfo:
        return dt_value.astimezone(timezone.utc).replace(tzinfo=None)
    return dt_value


def _extract_squad_field(payload: dict, *keys: str):
    for key in keys:
        if "." in key:
            current = payload
            ok = True
            for part in key.split("."):
                if isinstance(current, dict) and part in current:
                    current = current[part]
                else:
                    ok = False
                    break
            if ok:
                return current
            continue
        if key in payload:
            return payload.get(key)
    return None


def _squad_headers() -> dict:
    return {
        "Authorization": f"Bearer {SQUAD_SECRET_KEY}",
        "Content-Type": "application/json",
    }


async def _verify_squad_transaction(reference: str) -> dict:
    if not SQUAD_SECRET_KEY:
        return {"verified": False, "reason": "SQUAD_SECRET_KEY not configured", "provider": "squad"}
    if not reference:
        return {"verified": False, "reason": "Missing reference", "provider": "squad"}

    verify_url = f"{SQUAD_BASE_URL}/transaction/verify/{reference}"
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.get(verify_url, headers=_squad_headers())
            payload = response.json()
    except Exception as exc:
        return {"verified": False, "reason": f"Squad verify request failed: {str(exc)}", "provider": "squad"}

    data = payload.get("data") if isinstance(payload, dict) else {}
    data = data if isinstance(data, dict) else {}
    status_value = (
        data.get("transaction_status")
        or data.get("status")
        or payload.get("status")
    )
    status_norm = str(status_value or "").strip().lower()
    success_statuses = {"success", "successful", "paid", "completed"}

    amount_raw = (
        data.get("transaction_amount")
        or data.get("amount")
        or _extract_squad_field(payload, "transaction_amount", "amount")
    )
    try:
        paid_amount = round(float(amount_raw), 2) if amount_raw is not None else None
    except Exception:
        paid_amount = None

    return {
        "verified": status_norm in success_statuses,
        "provider": "squad",
        "provider_status": status_value,
        "paid_amount": paid_amount,
        "currency": data.get("transaction_currency_id") or data.get("currency") or "NGN",
        "raw": payload,
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

        if status in {"active", "trial", "grace_period"}:
            if status in {"active", "grace_period"} and expiry and expiry <= now:
                await db.subscriptions.update_one(
                    {"id": subscription.get("id")},
                    {"$set": {"status": "expired", "updated_at": now}},
                )
                status = "expired"
            subscription_active = status in {"active", "trial", "grace_period"}

        if status != subscription.get("status"):
            await db.subscriptions.update_one(
                {"id": subscription.get("id")},
                {"$set": {"status": status, "updated_at": now}},
            )

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


async def _run_ai_payment_review(screenshot_data_url: str, expected_amount: float, payment_reference: Optional[str]) -> dict:
    if not OPENAI_API_KEY:
        return {
            "ai_available": False,
            "approved": False,
            "confidence": 0.0,
            "reason": "OPENAI_API_KEY not configured",
        }

    client = OpenAI(api_key=OPENAI_API_KEY)
    prompt = (
        "You are a payment proof verification system for NEXRYDE subscriptions in Nigeria. "
        "Extract transfer evidence from the screenshot and return STRICT JSON only.\n"
        "Rules:\n"
        "1) Confirm if this is a real bank transfer/payment receipt screenshot.\n"
        "2) Extract transferred amount in NGN if visible.\n"
        "3) Check whether amount approximately matches expected amount.\n"
        "4) Detect transfer reference if visible.\n"
        "5) Verify beneficiary appears to match a SquadCo-generated virtual account for this driver.\n"
        "6) Set confidence 0.0-1.0 and approved true only when evidence is strong.\n"
        "Return JSON with keys: is_receipt, extracted_amount, amount_match, extracted_reference, "
        "reference_match, beneficiary_match, confidence, approved, issues, summary.\n"
        f"Expected amount: {expected_amount}\n"
        f"Provided reference: {payment_reference or ''}"
    )

    try:
        completion = client.chat.completions.create(
            model="gpt-4o-mini",
            temperature=0,
            response_format={"type": "json_object"},
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": screenshot_data_url}},
                    ],
                }
            ],
        )
        raw_content = completion.choices[0].message.content or "{}"
        parsed = json.loads(raw_content)
    except Exception as exc:
        return {
            "ai_available": True,
            "approved": False,
            "confidence": 0.0,
            "reason": f"AI verification failed: {str(exc)}",
        }

    extracted_amount = _normalize_amount(parsed.get("extracted_amount"))
    amount_match = bool(parsed.get("amount_match", False))
    if extracted_amount is not None:
        amount_match = amount_match or abs(extracted_amount - expected_amount) <= 500

    extracted_reference = (parsed.get("extracted_reference") or "").strip()
    reference_match = bool(parsed.get("reference_match", False))
    if payment_reference and extracted_reference:
        reference_match = reference_match or (payment_reference.lower() in extracted_reference.lower())
    beneficiary_match = bool(parsed.get("beneficiary_match", False))
    is_receipt = bool(parsed.get("is_receipt", False))
    confidence = float(parsed.get("confidence", 0.0) or 0.0)
    confidence = max(0.0, min(1.0, confidence))

    approved = bool(parsed.get("approved", False))
    approved = approved and is_receipt and amount_match and beneficiary_match and confidence >= 0.75

    return {
        "ai_available": True,
        "approved": approved,
        "confidence": confidence,
        "is_receipt": is_receipt,
        "beneficiary_match": beneficiary_match,
        "amount_match": amount_match,
        "extracted_amount": extracted_amount,
        "extracted_reference": extracted_reference or None,
        "reference_match": reference_match,
        "issues": parsed.get("issues", []),
        "summary": parsed.get("summary", "No summary returned"),
    }


# Tier config (matches server.py exactly)
TIER_CONFIG = {
    "basic": {
        "name": "KODA Basic",
        "monthly_fee": 18000,
        "earning_per_ride": {"min": 200, "max": 300},
        "commission": 0.15,
        "requirements": {"vehicle_year_min": None, "leather_seats": False, "dual_ac": False, "min_rating": 4.3},
        "color": "#C9A9A6",
        "benefits": ["Standard rides"],
    },
    "premium": {
        "name": "KODA Premium",
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

# Fare config
FARE_CONFIG = {
    "standard": {"base": 300, "per_km": 100, "per_min": 20, "min_fare": 700},
    "economy": {"base": 300, "per_km": 100, "per_min": 20, "min_fare": 700},
    "comfort": {"base": 500, "per_km": 150, "per_min": 30, "min_fare": 1000},
    "premium": {"base": 800, "per_km": 200, "per_min": 40, "min_fare": 1500},
    "xl": {"base": 600, "per_km": 170, "per_min": 35, "min_fare": 1200},
}

# ==================== SUBSCRIPTION ENDPOINTS ====================
@payments_router.get("/subscriptions/config")
async def get_subscription_config():
    """Get subscription configuration including bank details"""
    return {
        "monthly_fee": SUBSCRIPTION_CONFIG["monthly_fee"],
        "trial_hours": SUBSCRIPTION_CONFIG["trial_hours"],
        "trial_trips": SUBSCRIPTION_CONFIG["trial_trips"],
        "currency": SUBSCRIPTION_CONFIG["currency"],
        "bank_details": SUBSCRIPTION_CONFIG["bank_details"]
    }


@payments_router.post("/payment/create-virtual-account")
async def create_virtual_account(request: CreateVirtualAccountRequest, http_request: Request):
    verify_owner_strict(http_request, request.driver_id)
    await _assert_driver_account(request.driver_id)

    if request.plan_amount <= 0:
        raise HTTPException(status_code=400, detail="plan_amount must be greater than zero")
    if not SQUAD_SECRET_KEY:
        raise HTTPException(status_code=500, detail="Squad payment service is not configured")

    driver = await db.users.find_one({"id": request.driver_id}) or {}
    profile = await db.driver_profiles.find_one({"user_id": request.driver_id}) or {}
    full_name = (
        profile.get("full_name")
        or driver.get("name")
        or "Nexryde Driver"
    ).strip()
    first_name = full_name.split(" ")[0] if full_name else "Nexryde"
    last_name = " ".join(full_name.split(" ")[1:]) if len(full_name.split(" ")) > 1 else "Driver"
    email = driver.get("email") or f"{request.driver_id}@nexryde.app"
    phone = profile.get("phone") or driver.get("phone") or "0000000000"

    provider_reference = f"NXRVA_{request.driver_id}_{uuid4().hex[:10].upper()}"
    amount_expected = round(float(request.plan_amount), 2)
    metadata = {
        "driver_id": request.driver_id,
        "plan_amount": amount_expected,
        "tier": request.tier or "city_rider",
        "provider_reference": provider_reference,
    }
    payload = {
        "customer_identifier": request.driver_id,
        "first_name": first_name,
        "last_name": last_name,
        "mobile_num": str(phone),
        "email": email,
        "amount": amount_expected,
        "reference": provider_reference,
        "metadata": metadata,
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            provider_response = await client.post(
                f"{SQUAD_BASE_URL}/virtual-account",
                headers=_squad_headers(),
                json=payload,
            )
            provider_payload = provider_response.json()
    except Exception as exc:
        logger.error(f"Squad virtual account creation failed for {request.driver_id}: {exc}")
        raise HTTPException(status_code=502, detail="Could not create virtual account")

    data = provider_payload.get("data") if isinstance(provider_payload, dict) else {}
    data = data if isinstance(data, dict) else {}

    account_number = _extract_squad_field(
        data,
        "account_number",
        "virtual_account_number",
        "accountNo",
        "customer.account_number",
    )
    bank_name = _extract_squad_field(
        data,
        "bank_name",
        "bank",
        "bankName",
        "bank_details.bank_name",
    ) or "SQUAD"
    account_name = _extract_squad_field(
        data,
        "account_name",
        "accountName",
        "customer_name",
        "customer.account_name",
    ) or full_name
    returned_reference = (
        _extract_squad_field(data, "reference", "transaction_ref", "customer_identifier")
        or provider_reference
    )

    if not account_number:
        logger.error(f"Squad virtual account response missing account number: {provider_payload}")
        raise HTTPException(status_code=502, detail="Squad did not return a virtual account number")

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
            "status": "pending",
            "amount_expected": amount_expected,
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
                "amount": amount_expected,
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
                "amount": amount_expected,
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
        f"Squad virtual account created for driver={request.driver_id} "
        f"acct={account_number} ref={returned_reference} amount={amount_expected}"
    )
    return {
        "account_number": str(account_number),
        "bank_name": str(bank_name),
        "account_name": str(account_name),
        "reference": str(returned_reference),
        "status": "pending",
        "amount_expected": amount_expected,
    }

@payments_router.get("/subscriptions/{driver_id}")
async def get_subscription(driver_id: str, request: Request):
    """Get driver's subscription status"""
    verify_owner_strict(request, driver_id)
    await _assert_driver_account(driver_id)
    subscription = await _ensure_auto_trial_for_verified_driver(driver_id)
    if not subscription:
        subscription = await db.subscriptions.find_one({
            "driver_id": driver_id
        }, sort=[("created_at", -1)])
    flag_state = await _sync_driver_subscription_flags(driver_id)
    
    if subscription:
        if subscription.get("_id") is not None:
            subscription["_id"] = str(subscription["_id"])
        
        # Calculate days remaining
        now = datetime.utcnow()
        trial_end = subscription.get("trial_end_date")
        end_date = subscription.get("end_date")
        if isinstance(trial_end, str):
            try:
                subscription["trial_end_date"] = datetime.fromisoformat(trial_end.replace("Z", "+00:00")).replace(tzinfo=None)
            except Exception:
                pass
        if isinstance(end_date, str):
            try:
                subscription["end_date"] = datetime.fromisoformat(end_date.replace("Z", "+00:00")).replace(tzinfo=None)
            except Exception:
                pass
        
        # Check trial status
        if subscription.get("status") == "trial":
            trial_end = subscription.get("trial_end_date")
            trial_expired_by_time = bool(trial_end and now > trial_end)
            if trial_expired_by_time:
                # Trial expired
                await db.subscriptions.update_one(
                    {"id": subscription["id"]},
                    {"$set": {"status": "pending_payment"}}
                )
                subscription["status"] = "pending_payment"
                subscription["trial_expired"] = True
                subscription["days_remaining"] = 0
            else:
                hours_remaining = int(max(0, (trial_end - now).total_seconds() // 3600)) if trial_end else 0
                subscription["trial_hours_remaining"] = hours_remaining
                subscription["trial_unlimited_city_only"] = True
                subscription["days_remaining"] = 0
                subscription["trial_expired"] = False
        elif subscription.get("status") == "active":
            end_date = subscription.get("end_date")
            if end_date:
                if now > end_date:
                    # Subscription expired
                    await db.subscriptions.update_one(
                        {"id": subscription["id"]},
                        {"$set": {"status": "expired"}}
                    )
                    subscription["status"] = "expired"
                    subscription["days_remaining"] = 0
                else:
                    subscription["days_remaining"] = max(0, (end_date - now).days)
            else:
                subscription["days_remaining"] = 0
        else:
            subscription["days_remaining"] = 0
        
        # Add bank details
        subscription["bank_details"] = SUBSCRIPTION_CONFIG["bank_details"]
        subscription["monthly_fee"] = await _get_dynamic_tier_price(subscription.get("tier", "city_rider"))
        
        subscription["subscription_active"] = flag_state["subscription_active"]
        subscription["subscription_expiry"] = flag_state["subscription_expiry"]
        return subscription
    
    # No subscription found - return default data for new drivers
    return {
        "status": "none",
        "days_remaining": 0,
        "monthly_fee": await _get_dynamic_tier_price("city_rider"),
        "bank_details": SUBSCRIPTION_CONFIG["bank_details"],
        "subscription_active": False,
        "subscription_expiry": None,
        "message": "Complete verification to get an automatic 48-hour unlimited city-rides trial."
    }


@payments_router.get("/driver/subscription-status")
async def get_driver_subscription_status(request: Request):
    driver_id = require_authenticated(request)
    await _assert_driver_account(driver_id)
    flag_state = await _sync_driver_subscription_flags(driver_id)
    subscription = await _ensure_auto_trial_for_verified_driver(driver_id)
    if not subscription:
        subscription = await db.subscriptions.find_one({"driver_id": driver_id}, sort=[("created_at", -1)])
    virtual_account = await db.subscription_virtual_accounts.find_one({"driver_id": driver_id})
    if virtual_account:
        virtual_account.pop("_id", None)
        virtual_account.pop("provider_response", None)

    return {
        "driver_id": driver_id,
        "subscription_active": flag_state["subscription_active"],
        "subscription_expiry": flag_state["subscription_expiry"],
        "status": (subscription or {}).get("status", "none"),
        "tier": (subscription or {}).get("tier"),
        "amount_expected": (subscription or {}).get("amount"),
        "trial_unlimited_city_only": bool((subscription or {}).get("status") == "trial"),
        "virtual_account": virtual_account,
    }


@payments_router.post("/squad/webhook")
async def handle_squad_webhook(request: Request):
    raw_body = await request.body()
    signature = request.headers.get("x-squad-encrypted-body", "")

    if not SQUAD_SECRET_KEY:
        logger.error("Squad webhook received but SQUAD_SECRET_KEY is not configured")
        return {"received": False}

    expected_signature = hmac.new(
        SQUAD_SECRET_KEY.encode("utf-8"),
        raw_body,
        hashlib.sha512,
    ).hexdigest().upper()
    if not signature:
        logger.warning("Squad webhook rejected: missing signature header")
        raise HTTPException(status_code=401, detail="Missing webhook signature")
    if signature.upper() != expected_signature:
        logger.warning("Squad webhook rejected due to signature mismatch")
        raise HTTPException(status_code=401, detail="Invalid webhook signature")

    try:
        payload = await request.json()
    except Exception:
        logger.error("Invalid Squad webhook payload")
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

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
    if not verify_result.get("verified"):
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

    paid_amount = _normalize_amount(verify_result.get("paid_amount"))
    virtual_account = await db.subscription_virtual_accounts.find_one(
        {"$or": [
            {"reference": str(event_reference)},
            {"provider_reference": str(event_reference)},
            {"account_number": str(account_number) if account_number else ""},
        ]}
    )
    if not virtual_account:
        logger.warning(f"Squad verified payment could not be mapped ref={event_reference}")
        await db.subscription_transactions.insert_one(
            {
                "id": str(uuid.uuid4()),
                "provider": "squad",
                "reference": event_reference,
                "account_number": account_number,
                "status": "unmapped",
                "paid_amount": paid_amount,
                "verify_result": verify_result,
                "webhook_payload": payload,
                "created_at": datetime.utcnow(),
            }
        )
        return {"received": True, "processed": False}

    driver_id = virtual_account.get("driver_id")
    expected_amount = _normalize_amount(virtual_account.get("amount_expected"))
    if paid_amount is None or expected_amount is None or abs(paid_amount - expected_amount) > 0.01:
        logger.warning(
            f"Squad amount mismatch driver={driver_id} paid={paid_amount} expected={expected_amount}"
        )
        await db.subscription_transactions.insert_one(
            {
                "id": str(uuid.uuid4()),
                "provider": "squad",
                "driver_id": driver_id,
                "reference": event_reference,
                "account_number": virtual_account.get("account_number"),
                "status": "amount_mismatch",
                "paid_amount": paid_amount,
                "expected_amount": expected_amount,
                "verify_result": verify_result,
                "webhook_payload": payload,
                "created_at": datetime.utcnow(),
            }
        )
        return {"received": True, "processed": False}

    existing_success = await db.subscription_transactions.find_one(
        {"provider": "squad", "reference": str(event_reference), "status": "success"}
    )
    if existing_success:
        logger.info(f"Duplicate Squad webhook ignored ref={event_reference}")
        return {"received": True, "processed": True, "duplicate": True}

    activation = await _activate_subscription(
        driver_id=driver_id,
        payment_reference=str(event_reference),
        provider="squad",
        paid_amount=paid_amount,
    )

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
    await db.subscription_transactions.insert_one(
        {
            "id": str(uuid.uuid4()),
            "provider": "squad",
            "driver_id": driver_id,
            "reference": str(event_reference),
            "account_number": virtual_account.get("account_number"),
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
    """Legacy endpoint: trial is auto-activated after verification."""
    verify_owner_strict(request, driver_id)
    await _assert_driver_account(driver_id)
    existing = await db.subscriptions.find_one({"driver_id": driver_id}, sort=[("created_at", -1)])
    if existing:
        if existing.get("_id") is not None:
            existing["_id"] = str(existing["_id"])
        return {
            "message": "Subscription record already exists. Trial activation is automatic after verification.",
            "subscription": existing,
        }

    subscription = await _ensure_auto_trial_for_verified_driver(driver_id)
    if not subscription:
        raise HTTPException(
            status_code=403,
            detail="Driver must complete verification stage to receive automatic 48-hour trial.",
        )

    return {
        "message": f"Free {SUBSCRIPTION_CONFIG['trial_hours']}-hour unlimited city-rides trial activated!",
        "subscription": subscription,
        "trial_end_date": subscription.get("trial_end_date").isoformat() if isinstance(subscription.get("trial_end_date"), datetime) else None,
        "trial_hours_remaining": SUBSCRIPTION_CONFIG["trial_hours"],
        "trial_unlimited_city_only": True
    }


@payments_router.post("/subscriptions/{driver_id}/subscribe")
async def create_or_renew_subscription(driver_id: str, request: Request, body: Optional[CreateSubscriptionRequest] = None):
    """
    Compatibility endpoint used by frontend.
    Creates/updates a subscription record and sets it to pending_payment.
    """
    verify_owner_strict(request, driver_id)
    await _assert_driver_account(driver_id)

    requested_tier = (body.tier if body else None) or "city_rider"
    if requested_tier not in {"city_rider", "road_warrior"}:
        requested_tier = "city_rider"

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
    """Submit payment screenshot and run AI + provider verification."""
    verify_owner_strict(http_request, driver_id)
    await _assert_driver_account(driver_id)
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
            "ai_result": None,
            "provider_result": provider_result,
            "verification_mode": "provider_instant",
            "approved": True,
        }
        await db.subscriptions.update_one(
            {"driver_id": driver_id},
            {"$set": {"ai_verification": instant_audit}}
        )
        return {
            "message": "Payment verified successfully via gateway. Subscription activated.",
            "status": "active",
            "verification": instant_audit,
            "subscription": verified,
        }

    # Slow path fallback: run AI review only when provider check is missing/failed.
    ai_result = await _run_ai_payment_review(
        screenshot_data_url=request.screenshot,
        expected_amount=expected_amount,
        payment_reference=request.payment_reference,
    )
    ai_approved = bool(ai_result.get("approved"))

    # Approval policy fallback:
    # approve on strong AI evidence when provider check is unavailable/failed.
    should_approve = (
        ai_approved
        and bool(ai_result.get("beneficiary_match"))
        and bool(ai_result.get("amount_match"))
        and float(ai_result.get("confidence", 0.0)) >= 0.88
    )

    audit_payload = {
        "verified_at": datetime.utcnow(),
        "ai_result": ai_result,
        "provider_result": provider_result,
        "verification_mode": "ai_fallback",
        "approved": should_approve,
    }

    if should_approve:
        verified = await _activate_subscription(driver_id)
        await db.subscriptions.update_one(
            {"driver_id": driver_id},
            {"$set": {"ai_verification": audit_payload}}
        )
        return {
            "message": "Payment verified successfully. Subscription activated.",
            "status": "active",
            "verification": audit_payload,
            "subscription": verified,
        }

    await db.subscriptions.update_one(
        {"driver_id": driver_id},
        {"$set": {"status": "pending_verification", "ai_verification": audit_payload}}
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
    
    await db.subscriptions.update_one(
        {"driver_id": driver_id},
        {"$set": {
            "status": "active",
            "start_date": now,
            "end_date": end_date,
            "payment_verified_at": now,
            "transaction_id": f"TXN_{uuid.uuid4().hex[:12].upper()}",
            "payment_reference": payment_reference or subscription.get("payment_reference"),
            "payment_provider": provider or subscription.get("payment_provider"),
            "paid_amount": paid_amount if paid_amount is not None else subscription.get("paid_amount"),
        }}
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
    """Get latest AI/provider verification payload for subscription payment."""
    verify_owner_strict(request, driver_id)
    await _assert_driver_account(driver_id)
    subscription = await db.subscriptions.find_one({"driver_id": driver_id})
    if not subscription:
        raise HTTPException(status_code=404, detail="No subscription found")

    verification = subscription.get("ai_verification")
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
        trial_end = subscription.get("trial_end_date")
        if trial_end and now > trial_end:
            restrictions["show_payment_popup"] = True
            restrictions["message"] = "Your free trial has expired. Please make payment to continue."
        else:
            days_left = (trial_end - now).days if trial_end else 0
            restrictions["can_go_online"] = True
            restrictions["can_accept_rides"] = True
            restrictions["can_withdraw_earnings"] = True
            restrictions["message"] = f"Trial period: {days_left} days remaining"
    
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
        restrictions["message"] = "Please make payment to activate your account."
    
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


# ==================== FARE ESTIMATE ====================
@payments_router.post("/fare/estimate")
async def estimate_fare(request: FareEstimateRequest):
    svc = (request.service_type or "economy").strip().lower()
    if svc == "standard":
        svc = "economy"
    city = (request.city or "lagos").strip().lower()

    route_data = await get_directions_from_google(
        request.pickup_lat, request.pickup_lng,
        request.dropoff_lat, request.dropoff_lng
    )
    
    if route_data:
        distance_km = route_data["distance_meters"] / 1000
        duration_min = math.ceil(route_data["duration_seconds"] / 60)
        traffic_duration_min = math.ceil(route_data["duration_in_traffic_seconds"] / 60)
        polyline = route_data.get("polyline")
    else:
        distance_km = calculate_distance_haversine(
            request.pickup_lat, request.pickup_lng,
            request.dropoff_lat, request.dropoff_lng
        )
        duration_min = max(5, math.ceil((distance_km / 25) * 60))
        traffic_duration_min = duration_min
        polyline = None
    
    distance_km = max(0.5, distance_km)
    duration_min = max(5, duration_min)
    
    fare = calculate_fare(distance_km, duration_min, traffic_duration_min, svc, city)
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

    estimate_id = str(uuid.uuid4())
    fare_estimate_store[estimate_id] = {
        "fare": fare,
        "distance_km": round(distance_km, 2),
        "duration_min": duration_min,
        "polyline": polyline,
        "service_type": svc,
        "city": city,
        "pickup": {"lat": request.pickup_lat, "lng": request.pickup_lng},
        "dropoff": {"lat": request.dropoff_lat, "lng": request.dropoff_lng},
        "created_at": datetime.utcnow(),
        "expires_at": datetime.utcnow() + timedelta(minutes=FARE_LOCK_MINUTES),
        "base_price": base_price,
        "min_price": min_price,
        "max_price": max_price,
        "route_preview_coordinates": preview_coords,
        "map_preview_region": map_region,
        "area_summary_line": area_line,
    }

    return {
        "estimate_id": estimate_id,
        "distance_km": round(distance_km, 2),
        "duration_min": duration_min,
        "estimated_time_minutes": duration_min,
        "traffic_duration_min": traffic_duration_min,
        "base_fare": fare["base_fare"],
        "distance_fee": fare["distance_fee"],
        "time_fee": fare["time_fee"],
        "traffic_fee": fare["traffic_fee"],
        "booking_fee": fare["booking_fee"],
        "subtotal": fare["subtotal"],
        "total_fare": fare["total_fare"],
        "base_price": base_price,
        "min_price": min_price,
        "max_price": max_price,
        "smart_pricing_note": "Rides at or above 95% of suggested price are prioritized for matching.",
        "surge_multiplier": fare["surge_multiplier"],
        "is_peak": fare["is_peak"],
        "is_weekend": fare["is_weekend"],
        "peak_type": fare["peak_type"],
        "currency": fare["currency"],
        "min_fare": fare["min_fare"],
        "cancellation_fee": fare["cancellation_fee"],
        "service_type": svc,
        "city": city,
        "polyline": polyline,
        "route_preview_coordinates": preview_coords,
        "map_preview_region": map_region,
        "area_summary_line": area_line,
        "price_breakdown": fare["price_breakdown"],
        "price_valid_until": (datetime.utcnow() + timedelta(minutes=FARE_LOCK_MINUTES)).isoformat(),
        "price_lock_minutes": FARE_LOCK_MINUTES,
        "is_insured": True,
    }



# ==================== WALLET ENDPOINTS ====================
@payments_router.get("/wallet/{user_id}")
async def get_wallet_balance(user_id: str, request: Request):
    """Get user wallet balance"""
    verify_owner_strict(request, user_id)
    user = await db.users.find_one({"id": user_id})
    if not user:
        # Create user wallet with 0 balance
        return {"balance": 0, "currency": "NGN", "user_id": user_id}
    return {"balance": user.get("wallet_balance", 0), "currency": "NGN", "user_id": user_id}


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
    return {"user_id": user_id, "transactions": rows}

@payments_router.post("/wallet/{user_id}/topup")
async def topup_wallet_balance(user_id: str, request: dict, http_request: Request):
    """Top up wallet - ENHANCED with validation and logging"""
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


# ==================== SURGE PRICING ====================
def calculate_surge_multiplier(lat: float, lng: float) -> dict:
    """Calculate surge multiplier based on time, demand, and conditions"""
    now = datetime.utcnow()
    hour = now.hour
    
    base_multiplier = SURGE_CONFIG["base_multiplier"]
    surge_reason = []
    
    # Check peak hours
    for period, config in SURGE_CONFIG["peak_hours"].items():
        if config["start"] <= hour < config["end"]:
            base_multiplier = max(base_multiplier, config["multiplier"])
            surge_reason.append(f"{period.title()} rush hour")
    
    # Demand-based surge thresholds:
    # 70% busy => 1.3x, 85% => 1.5x, 95% => max.
    # NOTE: demand ratio should come from real driver/rider load metrics;
    # this endpoint currently defaults to normal demand until wired.
    demand_ratio = 0.0
    surge_levels = SURGE_CONFIG.get("surge_levels", {})
    if demand_ratio >= SURGE_CONFIG.get("critical_demand_threshold", 0.95):
        base_multiplier = max(base_multiplier, surge_levels.get("critical", SURGE_CONFIG["max_multiplier"]))
        surge_reason.append("Critical demand in area")
    elif demand_ratio >= SURGE_CONFIG.get("very_high_demand_threshold", 0.85):
        base_multiplier = max(base_multiplier, surge_levels.get("very_high", 1.5))
        surge_reason.append("Very high demand in area")
    elif demand_ratio >= SURGE_CONFIG.get("high_demand_threshold", 0.7):
        base_multiplier = max(base_multiplier, surge_levels.get("high", 1.3))
        surge_reason.append("High demand in area")
    
    final_multiplier = min(base_multiplier, SURGE_CONFIG["max_multiplier"])
    
    return {
        "multiplier": round(final_multiplier, 2),
        "is_surge": final_multiplier > 1.0,
        "reasons": surge_reason if surge_reason else ["Normal pricing"],
        "expires_in_minutes": 5
    }

@payments_router.get("/surge/check")
async def check_surge_pricing(lat: float, lng: float):
    """Check current surge pricing for a location"""
    return calculate_surge_multiplier(lat, lng)


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
async def request_tier_upgrade(driver_id: str, request: DriverTierUpgradeRequest):
    """Request upgrade to Premium tier"""
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


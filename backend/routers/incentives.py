"""NEXRYDE Incentives — Rider first-ride reward, referral system, credit rules.

Core rule (enforced everywhere):
    NO RIDE → NO REWARD → NO COST

Credits are ONLY granted after a verified completed trip.
No signup bonuses. No credit on cancelled trips.
"""
import re
import uuid
import os
import random
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from database import db
from auth_guard import require_authenticated

logger = logging.getLogger("server")

incentives_router = APIRouter(prefix="/api", tags=["Incentives"])

# ── Credit rules ──────────────────────────────────────────────────────────────
FIRST_RIDE_REWARD_NGN = 500          # credited to rider after their first completed trip
REFERRAL_REWARD_INVITER_NGN = 500    # credited to the person who shared the referral
REFERRAL_REWARD_INVITEE_NGN = 500    # credited to the new rider who completes their first trip
MAX_CREDIT_PER_RIDE_NGN = 500        # cap: credit usable per ride
MAX_RIDE_COVERAGE_PCT = 0.40         # credit can cover at most 40 % of a ride fare
CREDIT_EXPIRY_DAYS = 7               # wallet credit expires in 7 days
MAX_TOTAL_CREDIT_NGN = 1000          # per-user cap on outstanding promotional credit

# Mystery bonus: small random promo credit on a subset of completed rides (rider only).
MYSTERY_BONUS_CHANCE = float(os.environ.get("NEXRYDE_MYSTERY_BONUS_CHANCE", "0.05") or "0.05")
MYSTERY_BONUS_MIN_NGN = int(os.environ.get("NEXRYDE_MYSTERY_BONUS_MIN_NGN", "100") or "100")
MYSTERY_BONUS_MAX_NGN = int(os.environ.get("NEXRYDE_MYSTERY_BONUS_MAX_NGN", "1000") or "1000")


# ── Internal helpers ──────────────────────────────────────────────────────────

async def _get_promo_balance(user_id: str) -> float:
    """Sum of all non-expired, unused promotional credits for a user."""
    now = datetime.now(timezone.utc)
    pipeline = [
        {"$match": {
            "user_id": user_id,
            "type": "promo_credit",
            "used": {"$ne": True},
            "expires_at": {"$gt": now},
        }},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]
    result = await db.promo_credits.aggregate(pipeline).to_list(1)
    return float(result[0]["total"]) if result else 0.0


async def _grant_promo_credit(
    user_id: str,
    amount: float,
    reason: str,
    trip_id: Optional[str] = None,
    referral_code: Optional[str] = None,
) -> dict:
    """Grant promotional credit respecting the MAX_TOTAL_CREDIT_NGN cap.

    Only grants if the user's current outstanding promo balance is below the
    per-user cap.  Returns the credit document (or None if cap reached).
    """
    current = await _get_promo_balance(user_id)
    if current >= MAX_TOTAL_CREDIT_NGN:
        logger.info(f"Promo credit capped for user={user_id} current={current}")
        return {"granted": False, "reason": "max_credit_cap_reached", "current_balance": current}

    # Clamp to not exceed cap.
    grantable = min(amount, MAX_TOTAL_CREDIT_NGN - current)
    if grantable <= 0:
        return {"granted": False, "reason": "max_credit_cap_reached", "current_balance": current}

    now = datetime.now(timezone.utc)
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "amount": grantable,
        "type": "promo_credit",
        "reason": reason,
        "trip_id": trip_id,
        "referral_code": referral_code,
        "used": False,
        "expires_at": now + timedelta(days=CREDIT_EXPIRY_DAYS),
        "created_at": now,
    }
    await db.promo_credits.insert_one(doc)

    # Also reflect in the user's wallet_balance for convenience (non-spendable promo field).
    await db.users.update_one(
        {"id": user_id},
        {"$inc": {"promo_credit_balance": grantable}},
    )
    logger.info(f"Promo credit granted user={user_id} amount={grantable} reason={reason}")
    return {"granted": True, "amount": grantable, "expires_at": doc["expires_at"].isoformat()}


async def _generate_referral_code(user_id: str) -> str:
    """Return the user's referral code, creating one if absent."""
    user = await db.users.find_one({"id": user_id}, {"referral_code": 1})
    if user and user.get("referral_code"):
        return user["referral_code"]
    code = f"NX{user_id[:6].upper()}"
    await db.users.update_one({"id": user_id}, {"$set": {"referral_code": code}})
    return code


async def generate_unique_username(name: str, user_id: str) -> str:
    """Derive a unique, slug-safe username from a user's full name.

    Rules:
    - Lowercase only, letters+digits, no spaces or special chars
    - "Funny Bony" → "funnybony"
    - If taken: funnybony1, funnybony2, …
    - Fallback (empty name): "user" + first 6 chars of user_id
    """
    base = re.sub(r"[^a-z0-9]", "", (name or "").lower())
    if not base:
        base = f"user{user_id[:6].lower()}"

    # Check base
    if not await db.users.find_one({"username": base, "id": {"$ne": user_id}}):
        return base

    # Try numeric suffixes
    for i in range(1, 10_000):
        candidate = f"{base}{i}"
        if not await db.users.find_one({"username": candidate, "id": {"$ne": user_id}}):
            return candidate

    # Ultimate fallback
    return f"{base}{user_id[:4].lower()}"


async def _ensure_username(user_id: str) -> Optional[str]:
    """Return the user's username, generating one if absent."""
    user = await db.users.find_one({"id": user_id}, {"username": 1, "name": 1})
    if not user:
        return None
    if user.get("username"):
        return user["username"]
    username = await generate_unique_username(user.get("name") or "", user_id)
    await db.users.update_one({"id": user_id}, {"$set": {"username": username}})
    return username


async def _resolve_referral_identifier(raw: str, caller_user_id: str) -> Optional[dict]:
    """Resolve a raw identifier (username OR referral code) to a referrer user doc.

    Returns the referrer's user doc (id, referral_code, username, name) or None.
    Does NOT allow self-referral.
    """
    if not raw:
        return None

    # Try as username first (lowercase slug)
    referrer = await db.users.find_one(
        {"username": raw.lower()},
        {"_id": 0, "id": 1, "referral_code": 1, "username": 1, "name": 1},
    )
    if not referrer:
        # Try as referral code (uppercase)
        referrer = await db.users.find_one(
            {"referral_code": raw.upper()},
            {"_id": 0, "id": 1, "referral_code": 1, "username": 1, "name": 1},
        )
    if not referrer:
        return None
    if referrer["id"] == caller_user_id:
        return None  # self-referral silently dropped
    return referrer


# ── Post-trip hook (called from trips.complete_trip) ─────────────────────────

async def on_trip_completed(trip_id: str, rider_id: str, driver_id: str, fare: float) -> dict:
    """Apply all incentive rules after a trip is confirmed completed.

    This is the ONLY place rewards are granted.  Never called on cancellation.
    """
    results = {}

    # 1. First-ride reward for rider.
    prior_trips = await db.trips.count_documents({
        "rider_id": rider_id,
        "status": "completed",
        "id": {"$ne": trip_id},
    })
    if prior_trips == 0:
        res = await _grant_promo_credit(
            rider_id,
            FIRST_RIDE_REWARD_NGN,
            reason="first_ride",
            trip_id=trip_id,
        )
        results["first_ride_reward"] = res

    # 2. Referral reward — only on the new rider's FIRST trip.
    if prior_trips == 0:
        rider = await db.users.find_one({"id": rider_id}, {"referred_by": 1})
        referrer_code = (rider or {}).get("referred_by")
        if referrer_code:
            inviter = await db.users.find_one({"referral_code": referrer_code}, {"id": 1})
            if inviter:
                inviter_id = inviter["id"]
                # Reward the invitee (the new rider).
                res_invitee = await _grant_promo_credit(
                    rider_id,
                    REFERRAL_REWARD_INVITEE_NGN,
                    reason="referral_invitee",
                    trip_id=trip_id,
                    referral_code=referrer_code,
                )
                # Reward the inviter.
                res_inviter = await _grant_promo_credit(
                    inviter_id,
                    REFERRAL_REWARD_INVITER_NGN,
                    reason="referral_inviter",
                    trip_id=trip_id,
                    referral_code=referrer_code,
                )
                results["referral_invitee_reward"] = res_invitee
                results["referral_inviter_reward"] = res_inviter

    # 3. Update driver trial trip count.
    await _update_driver_trial_progress(driver_id)

    # 4. Mystery bonus — random chance each completed trip; ₦100–₦1,000 promo credit (surprise & delight).
    try:
        chance = max(0.0, min(1.0, MYSTERY_BONUS_CHANCE))
        lo = max(1, min(MYSTERY_BONUS_MIN_NGN, MYSTERY_BONUS_MAX_NGN))
        hi = max(lo, MYSTERY_BONUS_MAX_NGN)
        if rider_id and chance > 0 and random.random() < chance:
            roll = random.randint(lo, hi)
            res_mb = await _grant_promo_credit(
                rider_id,
                float(roll),
                reason="mystery_bonus",
                trip_id=trip_id,
            )
            granted = float(res_mb.get("amount") or 0)
            if res_mb.get("granted") and granted > 0:
                results["mystery_bonus"] = {
                    "amount_ngn": granted,
                    "expires_at": res_mb.get("expires_at"),
                }
    except Exception as _mb_exc:
        logger.warning("mystery_bonus hook failed trip=%s rider=%s: %s", trip_id, rider_id, _mb_exc)

    return results


async def _update_driver_trial_progress(driver_id: str):
    """Re-evaluate trial after a completed trip (completed trips only)."""
    sub = await db.subscriptions.find_one(
        {"driver_id": driver_id, "status": "trial"},
        sort=[("created_at", -1)],
    )
    if not sub:
        return
    from driver_trial_policy import evaluate_driver_trial

    await evaluate_driver_trial(driver_id, sub)


# ── Credit application at ride checkout ──────────────────────────────────────

async def calculate_applicable_credit(user_id: str, fare: float) -> float:
    """Return how much promo credit can be applied to this fare.

    Rules:
    - Max ₦500 per ride.
    - Max 40 % of the fare.
    - Must not exceed available balance.
    """
    available = await _get_promo_balance(user_id)
    if available <= 0:
        return 0.0
    cap_by_fare = fare * MAX_RIDE_COVERAGE_PCT
    cap_by_rule = MAX_CREDIT_PER_RIDE_NGN
    return min(available, cap_by_fare, cap_by_rule)


async def apply_credit_to_trip(user_id: str, trip_id: str, fare: float) -> dict:
    """Consume promo credits (FIFO, oldest first) and return amount applied."""
    applicable = await calculate_applicable_credit(user_id, fare)
    if applicable <= 0:
        return {"applied": 0.0, "remaining_balance": await _get_promo_balance(user_id)}

    remaining_to_apply = applicable
    now = datetime.now(timezone.utc)
    credits = await db.promo_credits.find({
        "user_id": user_id,
        "type": "promo_credit",
        "used": {"$ne": True},
        "expires_at": {"$gt": now},
    }).sort("created_at", 1).to_list(50)

    total_applied = 0.0
    for credit in credits:
        if remaining_to_apply <= 0:
            break
        use_amount = min(credit["amount"], remaining_to_apply)
        await db.promo_credits.update_one(
            {"id": credit["id"]},
            {"$set": {"used": True, "used_amount": use_amount, "used_at": now, "used_on_trip": trip_id}},
        )
        remaining_to_apply -= use_amount
        total_applied += use_amount

    # Sync the promo_credit_balance field on the user.
    new_balance = await _get_promo_balance(user_id)
    await db.users.update_one({"id": user_id}, {"$set": {"promo_credit_balance": new_balance}})

    return {"applied": total_applied, "remaining_balance": new_balance}


# ── API endpoints ─────────────────────────────────────────────────────────────

@incentives_router.get("/incentives/my-credits")
async def get_my_credits(request: Request):
    """Get the caller's promo credit balance and recent credits."""
    user_id = require_authenticated(request)
    now = datetime.now(timezone.utc)
    credits = await db.promo_credits.find({
        "user_id": user_id,
        "used": {"$ne": True},
        "expires_at": {"$gt": now},
    }).sort("created_at", -1).to_list(20)
    for c in credits:
        c.pop("_id", None)
    balance = sum(c["amount"] for c in credits)
    return {
        "promo_credit_balance": balance,
        "max_per_ride": MAX_CREDIT_PER_RIDE_NGN,
        "max_ride_coverage_pct": int(MAX_RIDE_COVERAGE_PCT * 100),
        "credit_expiry_days": CREDIT_EXPIRY_DAYS,
        "credits": credits,
    }


NEXRYDE_INVITE_BASE_URL = "https://nexryde.app/invite"


def _build_invite_url(username: Optional[str], code: str) -> str:
    """Return the canonical invite URL — username path preferred, code query fallback."""
    if username:
        return f"{NEXRYDE_INVITE_BASE_URL}/{username}"
    return f"{NEXRYDE_INVITE_BASE_URL}?code={code}"


@incentives_router.get("/incentives/referral-code")
async def get_referral_code(request: Request):
    """Get or create the caller's personal referral code, username, and invite link."""
    user_id = require_authenticated(request)
    code = await _generate_referral_code(user_id)
    username = await _ensure_username(user_id)
    invite_url = _build_invite_url(username, code)
    handle = (username + "'s") if username else "my"
    share_message = (
        "🚗 Join NEXRYDE — Nigeria's smartest ride app!\n\n"
        f"Use {handle} invite link and we BOTH earn "
        f"₦{REFERRAL_REWARD_INVITEE_NGN:,.0f} after your first ride:\n{invite_url}"
    )
    return {
        "referral_code": code,
        "username": username,
        "invite_url": invite_url,
        "inviter_reward": REFERRAL_REWARD_INVITER_NGN,
        "invitee_reward": REFERRAL_REWARD_INVITEE_NGN,
        "message": f"Join NEXRYDE via {invite_url} and get ₦{REFERRAL_REWARD_INVITEE_NGN:,.0f} after your first ride.",
        "share_message": share_message,
    }


@incentives_router.get("/incentives/referral-stats")
async def get_referral_stats(request: Request):
    """Referral performance stats: invited count, rewarded count, total earnings."""
    user_id = require_authenticated(request)
    code = await _generate_referral_code(user_id)
    username = await _ensure_username(user_id)
    invite_url = _build_invite_url(username, code)

    invited_count = await db.users.count_documents({"referred_by": code})
    rewarded_credits = await db.promo_credits.count_documents({
        "referral_code": code,
        "reason": "referral_inviter",
    })
    pipeline = [
        {"$match": {"referral_code": code, "reason": "referral_inviter"}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]
    res = await db.promo_credits.aggregate(pipeline).to_list(1)
    total_earned = float(res[0]["total"]) if res else 0.0

    recent_cursor = db.promo_credits.find(
        {"referral_code": code, "reason": "referral_inviter"},
        {"_id": 0, "amount": 1, "created_at": 1, "trip_id": 1},
    ).sort("created_at", -1).limit(10)
    recent = await recent_cursor.to_list(10)

    return {
        "referral_code": code,
        "username": username,
        "invite_url": invite_url,
        "invited_count": invited_count,
        "rewarded_count": rewarded_credits,
        "pending_count": max(0, invited_count - rewarded_credits),
        "total_earned_ngn": total_earned,
        "reward_per_referral": REFERRAL_REWARD_INVITER_NGN,
        "recent_rewards": [
            {"amount": r.get("amount", 0), "date": r["created_at"].isoformat() if isinstance(r.get("created_at"), datetime) else str(r.get("created_at", ""))}
            for r in recent
        ],
    }


@incentives_router.get("/incentives/resolve-identifier/{identifier}")
async def resolve_referral_identifier(identifier: str, request: Request):
    """Resolve a username or referral code to the referrer's public profile.

    Used by the signup screen to display "You were invited by funnybony".
    Does NOT require authentication (called before the user has an account).
    """
    raw = (identifier or "").strip()
    if not raw:
        raise HTTPException(status_code=400, detail="identifier is required")

    referrer = await db.users.find_one(
        {"$or": [{"username": raw.lower()}, {"referral_code": raw.upper()}]},
        {"_id": 0, "id": 1, "referral_code": 1, "username": 1, "name": 1},
    )
    if not referrer:
        raise HTTPException(status_code=404, detail="Referral not found")

    return {
        "referral_code": referrer.get("referral_code", ""),
        "username": referrer.get("username") or "",
        "display_name": referrer.get("name", "").split()[0] if referrer.get("name") else referrer.get("username", ""),
    }


@incentives_router.post("/incentives/apply-referral-code")
async def apply_referral_code(request: Request):
    """Apply a referral by username OR referral code before first trip."""
    user_id = require_authenticated(request)
    body = await request.json()
    raw = (body.get("referral_code") or "").strip()
    if not raw:
        raise HTTPException(status_code=400, detail="referral_code is required")

    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.get("referred_by"):
        raise HTTPException(status_code=400, detail="You have already applied a referral code")

    # Resolve identifier — accepts username or code
    referrer = await _resolve_referral_identifier(raw, user_id)
    if not referrer:
        raise HTTPException(status_code=404, detail="Invalid referral username or code")

    # Ensure referrer has a code (should always be true at this point)
    referrer_code = referrer.get("referral_code")
    if not referrer_code:
        referrer_code = await _generate_referral_code(referrer["id"])

    # Check the user hasn't completed any trips yet.
    prior = await db.trips.count_documents({"rider_id": user_id, "status": "completed"})
    if prior > 0:
        raise HTTPException(status_code=400, detail="Referral can only be applied before your first trip")

    await db.users.update_one({"id": user_id}, {"$set": {"referred_by": referrer_code}})
    display = referrer.get("username") or referrer.get("name", "").split()[0] or "your friend"
    return {
        "success": True,
        "referrer_username": referrer.get("username") or "",
        "referrer_display": display,
        "message": f"You're now linked to {display}! Complete your first trip to both earn ₦{REFERRAL_REWARD_INVITEE_NGN:,.0f}.",
    }


@incentives_router.get("/incentives/first-ride-status")
async def get_first_ride_status(request: Request):
    """Check whether the caller has completed their first ride and earned the reward."""
    user_id = require_authenticated(request)
    completed = await db.trips.count_documents({"rider_id": user_id, "status": "completed"})
    reward_granted = await db.promo_credits.find_one({"user_id": user_id, "reason": "first_ride"}) is not None
    return {
        "first_ride_completed": completed > 0,
        "reward_granted": reward_granted,
        "reward_amount": FIRST_RIDE_REWARD_NGN,
        "message": (
            "🎉 First ride reward already credited!"
            if reward_granted
            else f"Complete your first ride to earn ₦{FIRST_RIDE_REWARD_NGN:,.0f}!"
        ),
    }


@incentives_router.get("/admin/incentives/overview")
async def admin_incentives_overview(request: Request):
    """Admin view of incentives stats."""
    from admin_guard import require_admin_request
    await require_admin_request(request)
    total_credits = await db.promo_credits.count_documents({})
    unused = await db.promo_credits.count_documents({"used": {"$ne": True}})
    pipeline = [{"$group": {"_id": None, "total": {"$sum": "$amount"}}}]
    res = await db.promo_credits.aggregate(pipeline).to_list(1)
    total_value = res[0]["total"] if res else 0
    return {
        "total_credits_issued": total_credits,
        "unused_credits": unused,
        "total_value_ngn": total_value,
        "first_ride_reward": FIRST_RIDE_REWARD_NGN,
        "referral_reward": REFERRAL_REWARD_INVITER_NGN,
        "max_credit_per_ride": MAX_CREDIT_PER_RIDE_NGN,
        "max_ride_coverage_pct": int(MAX_RIDE_COVERAGE_PCT * 100),
        "credit_expiry_days": CREDIT_EXPIRY_DAYS,
        "max_total_credit_per_user": MAX_TOTAL_CREDIT_NGN,
    }

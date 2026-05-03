"""Nexryde Incentives — Rider first-ride reward, referral system, credit rules.

Core rule (enforced everywhere):
    NO RIDE → NO REWARD → NO COST

Credits are ONLY granted after a verified completed trip.
No signup bonuses. No credit on cancelled trips.
"""
import uuid
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

    return results


async def _update_driver_trial_progress(driver_id: str):
    """Increment trial_trips_completed on the active trial subscription."""
    sub = await db.subscriptions.find_one(
        {"driver_id": driver_id, "status": "trial"},
        sort=[("created_at", -1)],
    )
    if not sub:
        return
    completed = await db.trips.count_documents({"driver_id": driver_id, "status": "completed"})
    target = sub.get("trial_trips_target", 20)
    now = datetime.now(timezone.utc)
    update: dict = {"trial_trips_completed": completed}
    if completed >= target:
        update["trial_completed"] = True
        update["trial_active"] = False
        update["status"] = "pending_payment"
    await db.subscriptions.update_one({"id": sub["id"]}, {"$set": {**update, "updated_at": now}})


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


@incentives_router.get("/incentives/referral-code")
async def get_referral_code(request: Request):
    """Get or create the caller's personal referral code + invite link."""
    user_id = require_authenticated(request)
    code = await _generate_referral_code(user_id)
    invite_url = f"{NEXRYDE_INVITE_BASE_URL}?code={code}"
    return {
        "referral_code": code,
        "invite_url": invite_url,
        "inviter_reward": REFERRAL_REWARD_INVITER_NGN,
        "invitee_reward": REFERRAL_REWARD_INVITEE_NGN,
        "message": f"Join Nexryde with my link and get ₦{REFERRAL_REWARD_INVITEE_NGN:,.0f} after your first ride: {invite_url}",
        "share_message": f"🚗 Join Nexryde — Nigeria's smartest ride app!\n\nUse my invite link and we BOTH earn ₦{REFERRAL_REWARD_INVITEE_NGN:,.0f} after your first ride:\n{invite_url}",
    }


@incentives_router.get("/incentives/referral-stats")
async def get_referral_stats(request: Request):
    """Referral performance stats: invited count, rewarded count, total earnings."""
    user_id = require_authenticated(request)
    code = await _generate_referral_code(user_id)

    # Count users who applied this referral code
    invited_count = await db.users.count_documents({"referred_by": code})

    # Count those who completed at least one ride (i.e. reward was triggered)
    rewarded_credits = await db.promo_credits.count_documents({
        "referral_code": code,
        "reason": "referral_inviter",
    })

    # Total earnings from this referral code
    pipeline = [
        {"$match": {"referral_code": code, "reason": "referral_inviter"}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]
    res = await db.promo_credits.aggregate(pipeline).to_list(1)
    total_earned = float(res[0]["total"]) if res else 0.0

    # Recent referral events
    recent_cursor = db.promo_credits.find(
        {"referral_code": code, "reason": "referral_inviter"},
        {"_id": 0, "amount": 1, "created_at": 1, "trip_id": 1},
    ).sort("created_at", -1).limit(10)
    recent = await recent_cursor.to_list(10)

    invite_url = f"{NEXRYDE_INVITE_BASE_URL}?code={code}"
    return {
        "referral_code": code,
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


@incentives_router.post("/incentives/apply-referral-code")
async def apply_referral_code(request: Request):
    """A new user registers their referral code before their first ride."""
    user_id = require_authenticated(request)
    body = await request.json()
    code = (body.get("referral_code") or "").strip().upper()
    if not code:
        raise HTTPException(status_code=400, detail="referral_code is required")

    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.get("referred_by"):
        raise HTTPException(status_code=400, detail="You have already applied a referral code")

    # Check the code belongs to someone else and they exist.
    referrer = await db.users.find_one({"referral_code": code})
    if not referrer:
        raise HTTPException(status_code=404, detail="Invalid referral code")
    if referrer["id"] == user_id:
        raise HTTPException(status_code=400, detail="You cannot use your own referral code")

    # Check the user hasn't completed any trips yet.
    prior = await db.trips.count_documents({"rider_id": user_id, "status": "completed"})
    if prior > 0:
        raise HTTPException(status_code=400, detail="Referral code can only be applied before your first trip")

    await db.users.update_one({"id": user_id}, {"$set": {"referred_by": code}})
    return {
        "success": True,
        "message": f"Referral code applied! Complete your first trip to earn ₦{REFERRAL_REWARD_INVITEE_NGN:,.0f}.",
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

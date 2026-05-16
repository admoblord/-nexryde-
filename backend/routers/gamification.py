"""Gamification Router - Challenges, Leaderboard, Loyalty Program, Streaks & Badges for NEXRYDE."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from datetime import datetime, timezone, timedelta
import logging
import uuid

from database import db

logger = logging.getLogger('server')
gamification_router = APIRouter(prefix="/api", tags=["Gamification"])
DRIVER_OF_MONTH_CASH_BONUS = 50000

LOYALTY_TIERS = {
    "bronze": {"min_trips": 0, "min_spent": 0, "perks": ["Basic support"], "points_multiplier": 1.0},
    "silver": {"min_trips": 20, "min_spent": 50000, "perks": ["Priority support", "5% discount on 10th ride"], "points_multiplier": 1.2},
    "gold": {"min_trips": 50, "min_spent": 150000, "perks": ["Premium support", "10% discount every 5th ride", "Free cancellation"], "points_multiplier": 1.5},
    "platinum": {"min_trips": 100, "min_spent": 500000, "perks": ["Dedicated support", "15% off always", "Priority matching", "Free upgrades"], "points_multiplier": 2.0}
}

DRIVER_CERTIFICATION_LEVELS = {
    "bronze": {"name": "Bronze", "min_trips": 0, "min_rating": 0, "min_months": 0, "perks": ["Basic support", "Standard matching"], "badge_color": "#CD7F32"},
    "silver": {"name": "Silver", "min_trips": 50, "min_rating": 4.5, "min_months": 3, "perks": ["Priority support", "Early features", "5% subscription discount"], "badge_color": "#C0C0C0"},
    "gold": {"name": "Gold", "min_trips": 200, "min_rating": 4.7, "min_months": 6, "perks": ["Premium support", "Fee waiver days", "Premium matching", "10% subscription discount"], "badge_color": "#FFD700"},
    "platinum": {"name": "Platinum", "min_trips": 500, "min_rating": 4.9, "min_months": 12, "perks": ["Dedicated support", "Profit sharing", "First access to new features", "15% subscription discount", "Free subscription month yearly"], "badge_color": "#E5E4E2"}
}


def _current_month_key(now: datetime | None = None) -> str:
    current = now or datetime.utcnow()
    return current.strftime("%Y-%m")


async def _driver_of_month_candidates(limit: int = 3) -> list[dict]:
    start_date = datetime.utcnow() - timedelta(days=30)
    pipeline = [
        {
            "$match": {
                "status": "completed",
                "completed_at": {"$gte": start_date},
                "driver_id": {"$exists": True, "$ne": None},
                "$or": [
                    {"payment_status": "completed"},
                    {"payment_status": {"$exists": False}},
                ],
            }
        },
        {
            "$group": {
                "_id": "$driver_id",
                "trip_count": {"$sum": 1},
                "avg_rating": {"$avg": "$driver_rating"},
                "total_earnings": {"$sum": "$fare"},
            }
        },
        {"$sort": {"avg_rating": -1, "trip_count": -1, "total_earnings": -1}},
        {"$limit": max(3, limit)},
    ]
    leaders = await db.trips.aggregate(pipeline).to_list(limit)
    driver_ids = [row["_id"] for row in leaders if row.get("_id")]
    users = await db.users.find({"id": {"$in": driver_ids}}, {"_id": 0, "id": 1, "name": 1, "rating": 1}).to_list(100)
    users_map = {u["id"]: u for u in users}
    candidates = []
    for row in leaders:
        driver_id = row.get("_id")
        if not driver_id or driver_id not in users_map:
            continue
        user = users_map[driver_id]
        candidates.append(
            {
                "driver_id": driver_id,
                "name": user.get("name") or "Anonymous Driver",
                "rating": round(float(row.get("avg_rating") or user.get("rating") or 5.0), 1),
                "trip_count": int(row.get("trip_count") or 0),
                "total_earnings": round(float(row.get("total_earnings") or 0), 2),
                "campaign_story": "Top-rated driver with standout rider love this month.",
            }
        )
    return candidates[:limit]


async def _build_driver_of_month_payload(month_key: str) -> dict:
    campaign = await db.driver_of_month_campaigns.find_one({"month_key": month_key}, {"_id": 0})
    if not campaign:
        candidates = await _driver_of_month_candidates(limit=3)
        campaign = {
            "month_key": month_key,
            "title": "Driver of the Month",
            "subtitle": "Community votes decide who gets featured, cash bonus, and a home-delivered trophy.",
            "cash_bonus": DRIVER_OF_MONTH_CASH_BONUS,
            "trophy_delivery": "Physical trophy delivered to the winner's home",
            "social_hook": "Built for viral hometown pride and shareable Nexryde moments.",
            "candidates": candidates,
            "created_at": datetime.utcnow().isoformat(),
        }
        await db.driver_of_month_campaigns.update_one({"month_key": month_key}, {"$set": campaign}, upsert=True)

    votes = await db.driver_of_month_votes.find({"month_key": month_key}, {"_id": 0}).to_list(5000)
    vote_totals: dict[str, int] = {}
    for vote in votes:
        driver_id = vote.get("driver_id")
        if driver_id:
            vote_totals[driver_id] = vote_totals.get(driver_id, 0) + 1

    ranked = []
    for candidate in campaign.get("candidates", []):
        enriched = dict(candidate)
        enriched["votes"] = vote_totals.get(candidate.get("driver_id"), 0)
        ranked.append(enriched)
    ranked.sort(key=lambda item: (-int(item.get("votes", 0)), -float(item.get("rating", 0)), -int(item.get("trip_count", 0))))

    featured = ranked[0] if ranked else None
    return {
        "month_key": month_key,
        "title": campaign.get("title", "Driver of the Month"),
        "subtitle": campaign.get("subtitle", ""),
        "cash_bonus": campaign.get("cash_bonus", DRIVER_OF_MONTH_CASH_BONUS),
        "trophy_delivery": campaign.get("trophy_delivery", "Physical trophy delivered to the winner's home"),
        "social_hook": campaign.get("social_hook", ""),
        "candidates": ranked,
        "featured_driver": featured,
        "total_votes": sum(vote_totals.values()),
    }

# ==================== CHALLENGES ====================

@gamification_router.get("/challenges/active")
async def get_active_challenges():
    now = datetime.utcnow()
    challenges = await db.challenges.find({"is_active": True, "start_date": {"$lte": now}, "end_date": {"$gte": now}}).to_list(20)
    if not challenges:
        return {"challenges": []}
    for c in challenges:
        c["_id"] = str(c["_id"])
    return {"challenges": challenges}

@gamification_router.get("/drivers/{user_id}/challenges")
async def get_driver_challenge_progress(user_id: str):
    challenges = await db.challenges.find({"is_active": True}).to_list(20)
    profile = await db.driver_profiles.find_one({"user_id": user_id})
    progress = []
    for challenge in challenges:
        current_value = 0
        if challenge["target_type"] == "trips":
            current_value = profile.get("weekly_trips", 0) if profile else 0
        elif challenge["target_type"] == "rating":
            user = await db.users.find_one({"id": user_id})
            current_value = user.get("rating", 0) if user else 0
        progress.append({"challenge_id": challenge["id"], "title": challenge["title"], "target": challenge["target_value"], "current": current_value, "completed": current_value >= challenge["target_value"]})
    return {"challenge_progress": progress}

# ==================== LEADERBOARD ====================

@gamification_router.get("/leaderboard/drivers")
async def get_driver_leaderboard(city: str = "lagos", period: str = "weekly"):
    if period == "daily":
        start_date = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == "weekly":
        start_date = datetime.utcnow() - timedelta(days=7)
    else:
        start_date = datetime.utcnow() - timedelta(days=30)
    pipeline = [
        {
            "$match": {
                "status": "completed",
                "completed_at": {"$gte": start_date},
                "$or": [
                    {"payment_status": "completed"},
                    {"payment_status": {"$exists": False}},
                ],
            }
        },
        {"$group": {"_id": "$driver_id", "total_earnings": {"$sum": "$fare"}, "trip_count": {"$sum": 1}, "avg_rating": {"$avg": "$driver_rating"}}},
        {"$sort": {"total_earnings": -1}},
        {"$limit": 20}
    ]
    earnings_leaders = await db.trips.aggregate(pipeline).to_list(20)
    # Batch fetch all users in one query
    leader_ids = [l["_id"] for l in earnings_leaders if l["_id"]]
    users_list = await db.users.find({"id": {"$in": leader_ids}}, {"_id": 0, "id": 1, "name": 1}).to_list(100)
    users_map = {u["id"]: u for u in users_list}
    leaderboard = []
    for rank, leader in enumerate(earnings_leaders, 1):
        if leader["_id"] and leader["_id"] in users_map:
            user = users_map[leader["_id"]]
            leaderboard.append({"rank": rank, "driver_id": leader["_id"], "name": user.get("name", "Anonymous")[:10] + "..." if user.get("name") else "Anonymous", "earnings": leader["total_earnings"], "trips": leader["trip_count"], "rating": round(leader["avg_rating"] or 5.0, 1)})
    return {"period": period, "city": city, "leaderboard": leaderboard}

@gamification_router.get("/leaderboard/top-rated")
async def get_top_rated_drivers(limit: int = 20):
    pipeline = [
        {"$match": {"role": "driver", "rating": {"$exists": True}}},
        {"$sort": {"rating": -1, "total_trips": -1}},
        {"$limit": limit}
    ]
    top_drivers = await db.users.aggregate(pipeline).to_list(limit)
    # Batch fetch all profiles in one query
    driver_ids = [d["id"] for d in top_drivers]
    profiles_list = await db.driver_profiles.find({"user_id": {"$in": driver_ids}}, {"_id": 0}).to_list(100)
    profiles_map = {p["user_id"]: p for p in profiles_list}
    result = []
    for rank, driver in enumerate(top_drivers, 1):
        profile = profiles_map.get(driver["id"])
        result.append({"rank": rank, "driver_id": driver["id"], "name": (driver.get("name", "Anonymous")[:10] + "...") if driver.get("name") else "Anonymous", "rating": driver.get("rating", 5.0), "total_trips": driver.get("total_trips", 0), "comfort_scores": {"smoothness": profile.get("smoothness_rating", 5.0) if profile else 5.0, "politeness": profile.get("politeness_rating", 5.0) if profile else 5.0, "cleanliness": profile.get("cleanliness_rating", 5.0) if profile else 5.0, "safety": profile.get("safety_rating", 5.0) if profile else 5.0}})
    return {"top_rated_drivers": result}


@gamification_router.get("/driver-of-the-month/current")
async def get_driver_of_the_month_current():
    payload = await _build_driver_of_month_payload(_current_month_key())
    return {"success": True, **payload}


@gamification_router.post("/driver-of-the-month/vote")
async def vote_for_driver_of_the_month(request: dict):
    voter_id = str(request.get("user_id") or "").strip()
    driver_id = str(request.get("driver_id") or "").strip()
    if not voter_id:
        raise HTTPException(status_code=400, detail="User id is required")
    if not driver_id:
        raise HTTPException(status_code=400, detail="Driver id is required")

    month_key = _current_month_key()
    payload = await _build_driver_of_month_payload(month_key)
    candidate_ids = {candidate.get("driver_id") for candidate in payload.get("candidates", [])}
    if driver_id not in candidate_ids:
        raise HTTPException(status_code=400, detail="Driver is not in this month's shortlist")

    existing = await db.driver_of_month_votes.find_one({"month_key": month_key, "voter_id": voter_id}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="You already voted this month")

    await db.driver_of_month_votes.insert_one(
        {
            "vote_id": str(uuid.uuid4()),
            "month_key": month_key,
            "voter_id": voter_id,
            "driver_id": driver_id,
            "created_at": datetime.utcnow().isoformat(),
        }
    )
    updated = await _build_driver_of_month_payload(month_key)
    return {"success": True, "message": "Vote recorded", **updated}

# ==================== DRIVER CERTIFICATION ====================

@gamification_router.get("/drivers/{user_id}/certification")
async def get_driver_certification(user_id: str):
    user = await db.users.find_one({"id": user_id})
    if not user or user.get("role") != "driver":
        raise HTTPException(status_code=404, detail="Driver not found")
    total_trips = user.get("total_trips", 0)
    rating = user.get("rating", 5.0)
    created_at = user.get("created_at", datetime.utcnow())
    months_active = (datetime.utcnow() - created_at).days // 30
    current_level = "bronze"
    for level, requirements in DRIVER_CERTIFICATION_LEVELS.items():
        if total_trips >= requirements["min_trips"] and rating >= requirements["min_rating"] and months_active >= requirements["min_months"]:
            current_level = level
    level_info = DRIVER_CERTIFICATION_LEVELS[current_level]
    next_level = None
    progress = {}
    levels_order = ["bronze", "silver", "gold", "platinum"]
    current_index = levels_order.index(current_level)
    if current_index < len(levels_order) - 1:
        next_level = levels_order[current_index + 1]
        next_req = DRIVER_CERTIFICATION_LEVELS[next_level]
        progress = {
            "trips": {"current": total_trips, "required": next_req["min_trips"], "percent": min(100, (total_trips / next_req["min_trips"]) * 100) if next_req["min_trips"] else 100},
            "rating": {"current": rating, "required": next_req["min_rating"], "percent": min(100, (rating / next_req["min_rating"]) * 100) if next_req["min_rating"] else 100},
            "months": {"current": months_active, "required": next_req["min_months"], "percent": min(100, (months_active / next_req["min_months"]) * 100) if next_req["min_months"] else 100}
        }
    return {"current_level": current_level, "level_name": level_info["name"], "badge_color": level_info["badge_color"], "perks": level_info["perks"], "next_level": next_level, "progress_to_next": progress, "stats": {"total_trips": total_trips, "rating": rating, "months_active": months_active}}

# ==================== STREAKS & BADGES ====================

@gamification_router.get("/drivers/{user_id}/streaks")
async def get_driver_streaks(user_id: str):
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    streaks = user.get("streaks", {"current": 0, "best": 0, "last_date": None})
    badges = user.get("badges", [])
    available_badges = [
        {"id": "first_trip", "name": "First Ride", "requirement": "Complete your first trip", "icon": "🚗"},
        {"id": "streak_7", "name": "Week Warrior", "requirement": "7-day streak", "icon": "🔥"},
        {"id": "streak_30", "name": "Monthly Master", "requirement": "30-day streak", "icon": "⭐"},
        {"id": "trips_100", "name": "Century Club", "requirement": "100 trips completed", "icon": "💯"},
        {"id": "five_star", "name": "Perfect Driver", "requirement": "Maintain 5.0 rating for a week", "icon": "🌟"},
        {"id": "early_bird", "name": "Early Bird", "requirement": "Complete 10 rides before 8 AM", "icon": "🌅"},
        {"id": "night_owl", "name": "Night Owl", "requirement": "Complete 10 rides after 10 PM", "icon": "🦉"},
    ]
    return {"current_streak": streaks.get("current", 0), "best_streak": streaks.get("best", 0), "last_active": streaks.get("last_date"), "earned_badges": badges, "available_badges": [b for b in available_badges if b["id"] not in badges]}

@gamification_router.post("/drivers/{user_id}/check-streak")
async def check_and_update_streak(user_id: str):
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    streaks = user.get("streaks", {"current": 0, "best": 0, "last_date": None})
    today = datetime.utcnow().date()
    last_date = streaks.get("last_date")
    if last_date:
        last_date = datetime.fromisoformat(last_date).date() if isinstance(last_date, str) else last_date
    new_current = streaks.get("current", 0)
    new_best = streaks.get("best", 0)
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    today_trip = await db.trips.find_one({"driver_id": user_id, "status": "completed", "completed_at": {"$gte": today_start}})
    if today_trip:
        if last_date == today - timedelta(days=1):
            new_current += 1
        elif last_date != today:
            new_current = 1
        new_best = max(new_best, new_current)
        await db.users.update_one({"id": user_id}, {"$set": {"streaks.current": new_current, "streaks.best": new_best, "streaks.last_date": today.isoformat()}})
        badges = user.get("badges", [])
        if new_current >= 7 and "streak_7" not in badges:
            await db.users.update_one({"id": user_id}, {"$push": {"badges": "streak_7"}})
        if new_current >= 30 and "streak_30" not in badges:
            await db.users.update_one({"id": user_id}, {"$push": {"badges": "streak_30"}})
    return {"current_streak": new_current, "best_streak": new_best, "streak_maintained": today_trip is not None}

# ==================== LOYALTY PROGRAM ====================

@gamification_router.get("/loyalty/{user_id}")
async def get_loyalty_status(user_id: str):
    loyalty = await db.loyalty_programs.find_one({"user_id": user_id})
    if not loyalty:
        loyalty = {"id": str(uuid.uuid4()), "user_id": user_id, "tier": "bronze", "points": 0, "total_trips": 0, "total_spent": 0.0, "perks_earned": [], "created_at": datetime.utcnow()}
        await db.loyalty_programs.insert_one(loyalty)
    current_tier = loyalty.get("tier", "bronze")
    tier_config = LOYALTY_TIERS.get(current_tier, LOYALTY_TIERS["bronze"])
    next_tier = None
    next_tier_requirements = None
    tier_order = ["bronze", "silver", "gold", "platinum"]
    current_index = tier_order.index(current_tier)
    if current_index < len(tier_order) - 1:
        next_tier = tier_order[current_index + 1]
        next_tier_requirements = LOYALTY_TIERS[next_tier]
    return {"user_id": user_id, "current_tier": current_tier, "points": loyalty.get("points", 0), "total_trips": loyalty.get("total_trips", 0), "total_spent": loyalty.get("total_spent", 0), "current_perks": tier_config["perks"], "points_multiplier": tier_config["points_multiplier"], "next_tier": next_tier, "next_tier_requirements": next_tier_requirements, "progress_to_next": {"trips_needed": (next_tier_requirements["min_trips"] - loyalty.get("total_trips", 0)) if next_tier_requirements else 0, "spent_needed": (next_tier_requirements["min_spent"] - loyalty.get("total_spent", 0)) if next_tier_requirements else 0} if next_tier else None}

@gamification_router.post("/loyalty/{user_id}/add-points")
async def add_loyalty_points(user_id: str, trip_fare: float):
    loyalty = await db.loyalty_programs.find_one({"user_id": user_id})
    if not loyalty:
        loyalty = {"id": str(uuid.uuid4()), "user_id": user_id, "tier": "bronze", "points": 0, "total_trips": 0, "total_spent": 0.0, "perks_earned": [], "created_at": datetime.utcnow()}
    current_tier = loyalty.get("tier", "bronze")
    multiplier = LOYALTY_TIERS[current_tier]["points_multiplier"]
    base_points = int(trip_fare / 100)
    earned_points = int(base_points * multiplier)
    new_total_trips = loyalty.get("total_trips", 0) + 1
    new_total_spent = loyalty.get("total_spent", 0) + trip_fare
    new_points = loyalty.get("points", 0) + earned_points
    new_tier = current_tier
    for tier_name in ["platinum", "gold", "silver"]:
        tier_req = LOYALTY_TIERS[tier_name]
        if new_total_trips >= tier_req["min_trips"] and new_total_spent >= tier_req["min_spent"]:
            new_tier = tier_name
            break
    tier_upgraded = new_tier != current_tier
    await db.loyalty_programs.update_one({"user_id": user_id}, {"$set": {"points": new_points, "total_trips": new_total_trips, "total_spent": new_total_spent, "tier": new_tier}}, upsert=True)
    return {"points_earned": earned_points, "total_points": new_points, "tier": new_tier, "tier_upgraded": tier_upgraded, "message": f"Earned {earned_points} points!" + (f" Upgraded to {new_tier}!" if tier_upgraded else "")}

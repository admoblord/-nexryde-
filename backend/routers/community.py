"""Community router - Groups, Messages, Polls, Pinned Messages, Events."""
from fastapi import APIRouter, HTTPException
from datetime import datetime, timedelta, timezone
import uuid
import logging

from database import db

logger = logging.getLogger('server')
community_router = APIRouter(prefix="/api/community", tags=["Community"])


# ==================== COMMUNITY GROUPS ====================

@community_router.get("/groups")
async def get_community_groups():
    """Get all community groups"""
    try:
        groups = await db.community_groups.find({}).to_list(length=50)
        # Batch count recent messages for all groups in one aggregation
        cutoff = (datetime.utcnow() - timedelta(hours=24)).isoformat()
        group_ids = [g["group_id"] for g in groups]
        counts_pipeline = [
            {"$match": {"group_id": {"$in": group_ids}, "created_at": {"$gte": cutoff}}},
            {"$group": {"_id": "$group_id", "count": {"$sum": 1}}}
        ]
        counts = await db.community_messages.aggregate(counts_pipeline).to_list(100)
        counts_map = {c["_id"]: c["count"] for c in counts}
        for g in groups:
            g["_id"] = str(g["_id"])
            g["recent_messages"] = counts_map.get(g["group_id"], 0)
        return {"success": True, "groups": groups}
    except Exception as e:
        logger.error(f"Get groups error: {str(e)}")
        return {"success": True, "groups": []}


@community_router.get("/groups/{group_id}/messages")
async def get_group_messages(group_id: str, limit: int = 50):
    """Get messages for a specific group"""
    try:
        cursor = db.community_messages.find(
            {"group_id": group_id}
        ).sort("created_at", -1).limit(limit)
        messages = await cursor.to_list(length=limit)
        messages.reverse()
        for m in messages:
            m["_id"] = str(m["_id"])
        return {"success": True, "messages": messages, "group_id": group_id}
    except Exception as e:
        logger.error(f"Get messages error: {str(e)}")
        return {"success": True, "messages": [], "group_id": group_id}


@community_router.post("/groups/{group_id}/messages")
async def post_group_message(group_id: str, request: dict):
    """Post a message to a community group"""
    try:
        message = {
            "group_id": group_id,
            "user_id": request.get("user_id", "anonymous"),
            "user_name": request.get("user_name", "Anonymous Driver"),
            "user_role": request.get("user_role", "driver"),
            "text": request.get("text", ""),
            "likes": 0,
            "replies": 0,
            "created_at": datetime.utcnow().isoformat(),
        }
        if not message["text"].strip():
            raise HTTPException(status_code=400, detail="Message cannot be empty")
        result = await db.community_messages.insert_one(message)
        message["_id"] = str(result.inserted_id)
        await db.community_groups.update_one(
            {"group_id": group_id},
            {"$addToSet": {"member_ids": request.get("user_id")}}
        )
        return {"success": True, "message": message}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Post message error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@community_router.post("/messages/{message_id}/like")
async def like_community_message(message_id: str):
    """Like a community message"""
    try:
        from bson import ObjectId
        await db.community_messages.update_one(
            {"_id": ObjectId(message_id)},
            {"$inc": {"likes": 1}}
        )
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}


@community_router.post("/messages/{message_id}/reply")
async def reply_to_community_message(message_id: str, request: dict):
    """Reply to a community message"""
    try:
        from bson import ObjectId
        reply = {
            "parent_id": message_id,
            "group_id": request.get("group_id", "general"),
            "user_id": request.get("user_id", "anonymous"),
            "user_name": request.get("user_name", "Anonymous"),
            "user_role": request.get("user_role", "driver"),
            "text": request.get("text", ""),
            "likes": 0,
            "is_reply": True,
            "created_at": datetime.utcnow().isoformat(),
        }
        result = await db.community_messages.insert_one(reply)
        reply["_id"] = str(result.inserted_id)
        await db.community_messages.update_one(
            {"_id": ObjectId(message_id)},
            {"$inc": {"replies": 1}}
        )
        return {"success": True, "reply": reply}
    except Exception as e:
        return {"success": False, "error": str(e)}


# ==================== POLLS ====================

@community_router.post("/groups/{group_id}/polls")
async def create_poll(group_id: str, request: dict):
    """Create a poll in a community group"""
    try:
        options = request.get("options", [])
        if len(options) < 2 or len(options) > 6:
            raise HTTPException(status_code=400, detail="Poll needs 2-6 options")
        poll = {
            "poll_id": str(uuid.uuid4()),
            "group_id": group_id,
            "user_id": request.get("user_id", "anonymous"),
            "user_name": request.get("user_name", "Anonymous"),
            "question": request.get("question", ""),
            "options": [{"text": o, "votes": 0, "voter_ids": []} for o in options],
            "total_votes": 0,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "expires_at": (datetime.now(timezone.utc) + timedelta(hours=int(request.get("duration_hours", 24)))).isoformat(),
            "is_active": True,
        }
        if not poll["question"].strip():
            raise HTTPException(status_code=400, detail="Question cannot be empty")
        await db.community_polls.insert_one(poll)
        poll.pop("_id", None)
        return {"success": True, "poll": poll}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Create poll error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@community_router.get("/groups/{group_id}/polls")
async def get_group_polls(group_id: str):
    """Get polls for a community group"""
    try:
        polls = await db.community_polls.find(
            {"group_id": group_id}, {"_id": 0}
        ).sort("created_at", -1).to_list(length=20)
        now = datetime.now(timezone.utc).isoformat()
        for p in polls:
            if p.get("expires_at", "") < now:
                p["is_active"] = False
            for opt in p.get("options", []):
                opt.pop("voter_ids", None)
        return {"success": True, "polls": polls}
    except Exception as e:
        logger.error(f"Get polls error: {str(e)}")
        return {"success": True, "polls": []}


@community_router.post("/polls/{poll_id}/vote")
async def vote_on_poll(poll_id: str, request: dict):
    """Vote on a community poll"""
    try:
        user_id = request.get("user_id", "anonymous")
        option_index = request.get("option_index", 0)
        poll = await db.community_polls.find_one({"poll_id": poll_id}, {"_id": 0})
        if not poll:
            raise HTTPException(status_code=404, detail="Poll not found")
        for opt in poll.get("options", []):
            if user_id in opt.get("voter_ids", []):
                raise HTTPException(status_code=400, detail="Already voted")
        if option_index < 0 or option_index >= len(poll.get("options", [])):
            raise HTTPException(status_code=400, detail="Invalid option")
        await db.community_polls.update_one(
            {"poll_id": poll_id},
            {
                "$inc": {f"options.{option_index}.votes": 1, "total_votes": 1},
                "$push": {f"options.{option_index}.voter_ids": user_id}
            }
        )
        return {"success": True, "message": "Vote recorded"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Vote error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== PINNED MESSAGES ====================

@community_router.post("/messages/{message_id}/pin")
async def pin_community_message(message_id: str, request: dict):
    """Pin/unpin a community message"""
    try:
        from bson import ObjectId
        action = request.get("action", "pin")
        is_pinned = action == "pin"
        await db.community_messages.update_one(
            {"_id": ObjectId(message_id)},
            {"$set": {"is_pinned": is_pinned, "pinned_at": datetime.now(timezone.utc).isoformat() if is_pinned else None}}
        )
        return {"success": True, "pinned": is_pinned}
    except Exception as e:
        return {"success": False, "error": str(e)}


@community_router.get("/groups/{group_id}/pinned")
async def get_pinned_messages(group_id: str):
    """Get pinned messages for a group"""
    try:
        pinned = await db.community_messages.find(
            {"group_id": group_id, "is_pinned": True}
        ).sort("pinned_at", -1).to_list(length=10)
        for m in pinned:
            m["_id"] = str(m["_id"])
        return {"success": True, "pinned_messages": pinned}
    except Exception as e:
        return {"success": True, "pinned_messages": []}


# ==================== EVENTS ====================

@community_router.post("/events")
async def create_community_event(request: dict):
    """Create a community event"""
    try:
        event = {
            "event_id": str(uuid.uuid4()),
            "group_id": request.get("group_id", "general"),
            "title": request.get("title", ""),
            "description": request.get("description", ""),
            "event_type": request.get("event_type", "meetup"),
            "location": request.get("location", ""),
            "date": request.get("date", ""),
            "time": request.get("time", ""),
            "created_by": request.get("user_id", "system"),
            "created_by_name": request.get("user_name", "NEXRYDE"),
            "rsvp_count": 0,
            "rsvp_users": [],
            "is_featured": request.get("is_featured", False),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        if not event["title"].strip():
            raise HTTPException(status_code=400, detail="Event title required")
        await db.community_events.insert_one(event)
        event.pop("_id", None)
        return {"success": True, "event": event}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Create event error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@community_router.get("/events")
async def get_community_events(group_id: str = None):
    """Get community events, optionally filtered by group"""
    try:
        query = {}
        if group_id:
            query["group_id"] = group_id
        events = await db.community_events.find(query, {"_id": 0}).sort("created_at", -1).to_list(length=30)
        return {"success": True, "events": events}
    except Exception as e:
        return {"success": True, "events": []}


@community_router.post("/events/{event_id}/rsvp")
async def rsvp_to_event(event_id: str, request: dict):
    """RSVP to a community event"""
    try:
        user_id = request.get("user_id", "anonymous")
        event = await db.community_events.find_one({"event_id": event_id}, {"_id": 0})
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")
        if user_id in event.get("rsvp_users", []):
            await db.community_events.update_one(
                {"event_id": event_id},
                {"$pull": {"rsvp_users": user_id}, "$inc": {"rsvp_count": -1}}
            )
            return {"success": True, "action": "removed", "message": "RSVP removed"}
        else:
            await db.community_events.update_one(
                {"event_id": event_id},
                {"$push": {"rsvp_users": user_id}, "$inc": {"rsvp_count": 1}}
            )
            return {"success": True, "action": "added", "message": "RSVP confirmed!"}
    except HTTPException:
        raise
    except Exception as e:
        return {"success": False, "error": str(e)}


# ==================== SEED FUNCTIONS ====================

async def seed_community_groups(db_ref):
    """Seed default community groups"""
    count = await db_ref.community_groups.count_documents({})
    if count < 15:
        if count > 0:
            await db_ref.community_groups.drop()
        groups = [
            {"group_id": "announcements", "name": "NEXRYDE Announcements", "description": "Official updates from the NEXRYDE team", "icon": "megaphone", "color": "#0EA5E9", "members": 0, "is_official": True, "created_at": datetime.utcnow().isoformat()},
            {"group_id": "general", "name": "General Discussion", "description": "Chat about anything NEXRYDE related", "icon": "chatbubbles", "color": "#3B82F6", "members": 0, "created_at": datetime.utcnow().isoformat()},
            {"group_id": "tips-tricks", "name": "Tips & Tricks", "description": "Share driving tips, hacks and strategies", "icon": "bulb", "color": "#F59E0B", "members": 0, "created_at": datetime.utcnow().isoformat()},
            {"group_id": "safety-zone", "name": "Safety Zone", "description": "Report dangerous areas and safety concerns", "icon": "shield-checkmark", "color": "#EF4444", "members": 0, "created_at": datetime.utcnow().isoformat()},
            {"group_id": "earnings-talk", "name": "Earnings Talk", "description": "Discuss fares, surge pricing and earning strategies", "icon": "cash", "color": "#10B981", "members": 0, "created_at": datetime.utcnow().isoformat()},
            {"group_id": "vehicle-maintenance", "name": "Vehicle Maintenance", "description": "Car repair tips, mechanic recommendations, parts deals", "icon": "build", "color": "#6366F1", "members": 0, "created_at": datetime.utcnow().isoformat()},
            {"group_id": "new-drivers", "name": "New Drivers Hub", "description": "Help and support for new NEXRYDE drivers", "icon": "school", "color": "#8B5CF6", "members": 0, "created_at": datetime.utcnow().isoformat()},
            {"group_id": "lagos-drivers", "name": "Lagos Drivers", "description": "For drivers in Lagos - Nigeria's biggest market", "icon": "car", "color": "#22C55E", "members": 0, "created_at": datetime.utcnow().isoformat()},
            {"group_id": "abuja-drivers", "name": "Abuja (FCT) Drivers", "description": "Federal Capital Territory drivers community", "icon": "car", "color": "#8B5CF6", "members": 0, "created_at": datetime.utcnow().isoformat()},
            {"group_id": "port-harcourt", "name": "Port Harcourt Drivers", "description": "Rivers State - Garden City drivers", "icon": "car", "color": "#F59E0B", "members": 0, "created_at": datetime.utcnow().isoformat()},
            {"group_id": "ibadan-drivers", "name": "Ibadan Drivers", "description": "Oyo State capital drivers community", "icon": "car", "color": "#EC4899", "members": 0, "created_at": datetime.utcnow().isoformat()},
            {"group_id": "kano-drivers", "name": "Kano Drivers", "description": "Northern Nigeria's commercial capital", "icon": "car", "color": "#EF4444", "members": 0, "created_at": datetime.utcnow().isoformat()},
            {"group_id": "benin-drivers", "name": "Benin City Drivers", "description": "Edo State drivers community", "icon": "car", "color": "#14B8A6", "members": 0, "created_at": datetime.utcnow().isoformat()},
            {"group_id": "enugu-drivers", "name": "Enugu Drivers", "description": "Coal City drivers community", "icon": "car", "color": "#0EA5E9", "members": 0, "created_at": datetime.utcnow().isoformat()},
            {"group_id": "owerri-drivers", "name": "Owerri Drivers", "description": "Imo State capital drivers", "icon": "car", "color": "#A855F7", "members": 0, "created_at": datetime.utcnow().isoformat()},
            {"group_id": "warri-drivers", "name": "Warri Drivers", "description": "Delta State oil city drivers", "icon": "car", "color": "#F97316", "members": 0, "created_at": datetime.utcnow().isoformat()},
            {"group_id": "abeokuta-drivers", "name": "Abeokuta Drivers", "description": "Ogun State capital drivers", "icon": "car", "color": "#84CC16", "members": 0, "created_at": datetime.utcnow().isoformat()},
            {"group_id": "uyo-drivers", "name": "Uyo Drivers", "description": "Akwa Ibom State drivers", "icon": "car", "color": "#06B6D4", "members": 0, "created_at": datetime.utcnow().isoformat()},
            {"group_id": "calabar-drivers", "name": "Calabar Drivers", "description": "Cross River State drivers", "icon": "car", "color": "#D946EF", "members": 0, "created_at": datetime.utcnow().isoformat()},
            {"group_id": "kaduna-drivers", "name": "Kaduna Drivers", "description": "Kaduna State drivers community", "icon": "car", "color": "#FB923C", "members": 0, "created_at": datetime.utcnow().isoformat()},
            {"group_id": "jos-drivers", "name": "Jos Drivers", "description": "Plateau State - Tin City drivers", "icon": "car", "color": "#4ADE80", "members": 0, "created_at": datetime.utcnow().isoformat()},
            {"group_id": "ilorin-drivers", "name": "Ilorin Drivers", "description": "Kwara State capital drivers", "icon": "car", "color": "#818CF8", "members": 0, "created_at": datetime.utcnow().isoformat()},
            {"group_id": "asaba-drivers", "name": "Asaba Drivers", "description": "Delta State capital drivers", "icon": "car", "color": "#F472B6", "members": 0, "created_at": datetime.utcnow().isoformat()},
        ]
        await db_ref.community_groups.insert_many(groups)
        logger.info(f"Seeded {len(groups)} community groups")


async def seed_community_content(db_ref):
    """Seed polls, events, and engaging messages"""
    poll_count = await db_ref.community_polls.count_documents({})
    if poll_count == 0:
        polls = [
            {
                "poll_id": str(uuid.uuid4()), "group_id": "general", "user_id": "system",
                "user_name": "NEXRYDE Team",
                "question": "What time of day do you earn the most?",
                "options": [
                    {"text": "Morning rush (6-9 AM)", "votes": 45, "voter_ids": []},
                    {"text": "Afternoon (12-3 PM)", "votes": 23, "voter_ids": []},
                    {"text": "Evening rush (5-8 PM)", "votes": 67, "voter_ids": []},
                    {"text": "Night owl (9 PM - 2 AM)", "votes": 34, "voter_ids": []},
                ],
                "total_votes": 169,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
                "is_active": True,
            },
            {
                "poll_id": str(uuid.uuid4()), "group_id": "lagos-drivers", "user_id": "system",
                "user_name": "Lagos Community",
                "question": "Worst traffic spot in Lagos right now?",
                "options": [
                    {"text": "Lekki-Ikoyi Link Bridge", "votes": 89, "voter_ids": []},
                    {"text": "Third Mainland Bridge", "votes": 56, "voter_ids": []},
                    {"text": "Ojota/Ketu axis", "votes": 72, "voter_ids": []},
                    {"text": "Oshodi-Apapa Expressway", "votes": 95, "voter_ids": []},
                ],
                "total_votes": 312,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "expires_at": (datetime.now(timezone.utc) + timedelta(days=5)).isoformat(),
                "is_active": True,
            },
            {
                "poll_id": str(uuid.uuid4()), "group_id": "earnings-talk", "user_id": "system",
                "user_name": "Earnings Talk",
                "question": "How much do you target daily (before fuel)?",
                "options": [
                    {"text": "Below \u20a615,000", "votes": 18, "voter_ids": []},
                    {"text": "\u20a615,000 - \u20a625,000", "votes": 54, "voter_ids": []},
                    {"text": "\u20a625,000 - \u20a640,000", "votes": 41, "voter_ids": []},
                    {"text": "Above \u20a640,000", "votes": 22, "voter_ids": []},
                ],
                "total_votes": 135,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
                "is_active": True,
            },
            {
                "poll_id": str(uuid.uuid4()), "group_id": "vehicle-maintenance", "user_id": "system",
                "user_name": "Vehicle Hub",
                "question": "Which fuel type gives you the best mileage?",
                "options": [
                    {"text": "PMS (Petrol)", "votes": 78, "voter_ids": []},
                    {"text": "CNG (Gas)", "votes": 112, "voter_ids": []},
                    {"text": "Hybrid", "votes": 15, "voter_ids": []},
                ],
                "total_votes": 205,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
                "is_active": True,
            },
            {
                "poll_id": str(uuid.uuid4()), "group_id": "safety-zone", "user_id": "system",
                "user_name": "Safety Zone",
                "question": "Have you ever had an encounter with area boys while driving?",
                "options": [
                    {"text": "Yes, multiple times", "votes": 134, "voter_ids": []},
                    {"text": "Yes, once or twice", "votes": 89, "voter_ids": []},
                    {"text": "No, never", "votes": 45, "voter_ids": []},
                    {"text": "I avoid those areas completely", "votes": 67, "voter_ids": []},
                ],
                "total_votes": 335,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
                "is_active": True,
            },
        ]
        await db_ref.community_polls.insert_many(polls)
        logger.info(f"Seeded {len(polls)} community polls")

    event_count = await db_ref.community_events.count_documents({})
    if event_count == 0:
        events = [
            {
                "event_id": str(uuid.uuid4()), "group_id": "announcements",
                "title": "NEXRYDE Lagos Driver Meetup",
                "description": "Join fellow NEXRYDE drivers for networking, tips sharing, and refreshments.",
                "event_type": "meetup", "location": "Ikeja City Mall, Lagos",
                "date": (datetime.now(timezone.utc) + timedelta(days=14)).strftime("%Y-%m-%d"),
                "time": "2:00 PM",
                "created_by": "system", "created_by_name": "NEXRYDE Official",
                "rsvp_count": 87, "rsvp_users": [], "is_featured": True,
                "created_at": datetime.now(timezone.utc).isoformat(),
            },
            {
                "event_id": str(uuid.uuid4()), "group_id": "announcements",
                "title": "Fuel Subsidy Awareness Workshop",
                "description": "Learn about the latest fuel subsidy changes and CNG conversion benefits.",
                "event_type": "training", "location": "Online (Zoom)",
                "date": (datetime.now(timezone.utc) + timedelta(days=7)).strftime("%Y-%m-%d"),
                "time": "11:00 AM",
                "created_by": "system", "created_by_name": "NEXRYDE Official",
                "rsvp_count": 156, "rsvp_users": [], "is_featured": True,
                "created_at": datetime.now(timezone.utc).isoformat(),
            },
            {
                "event_id": str(uuid.uuid4()), "group_id": "abuja-drivers",
                "title": "Abuja Drivers End of Year Party",
                "description": "Celebrate the year with fellow Abuja drivers! Food, music, and prizes.",
                "event_type": "meetup", "location": "Jabi Lake Mall, Abuja",
                "date": (datetime.now(timezone.utc) + timedelta(days=21)).strftime("%Y-%m-%d"),
                "time": "4:00 PM",
                "created_by": "system", "created_by_name": "Abuja Community",
                "rsvp_count": 43, "rsvp_users": [], "is_featured": False,
                "created_at": datetime.now(timezone.utc).isoformat(),
            },
            {
                "event_id": str(uuid.uuid4()), "group_id": "announcements",
                "title": "Weekend Bonus: 20% Extra on All Trips!",
                "description": "This weekend only - earn 20% extra on every completed trip.",
                "event_type": "promotion", "location": "All cities",
                "date": (datetime.now(timezone.utc) + timedelta(days=3)).strftime("%Y-%m-%d"),
                "time": "All day",
                "created_by": "system", "created_by_name": "NEXRYDE Official",
                "rsvp_count": 234, "rsvp_users": [], "is_featured": True,
                "created_at": datetime.now(timezone.utc).isoformat(),
            },
            {
                "event_id": str(uuid.uuid4()), "group_id": "new-drivers",
                "title": "New Driver Orientation Session",
                "description": "Everything you need to know to start earning big on NEXRYDE.",
                "event_type": "training", "location": "Online (Google Meet)",
                "date": (datetime.now(timezone.utc) + timedelta(days=5)).strftime("%Y-%m-%d"),
                "time": "10:00 AM",
                "created_by": "system", "created_by_name": "NEXRYDE Support",
                "rsvp_count": 67, "rsvp_users": [], "is_featured": False,
                "created_at": datetime.now(timezone.utc).isoformat(),
            },
        ]
        await db_ref.community_events.insert_many(events)
        logger.info(f"Seeded {len(events)} community events")

    pinned_count = await db_ref.community_messages.count_documents({"is_pinned": True})
    if pinned_count == 0:
        for gid in ["announcements", "earnings-talk", "tips-tricks", "safety-zone", "new-drivers"]:
            first_msg = await db_ref.community_messages.find_one({"group_id": gid}, sort=[("created_at", 1)])
            if first_msg:
                await db_ref.community_messages.update_one(
                    {"_id": first_msg["_id"]},
                    {"$set": {"is_pinned": True, "pinned_at": datetime.now(timezone.utc).isoformat()}}
                )
        logger.info("Pinned important messages in key groups")

    msg_count = await db_ref.community_messages.count_documents({})
    if msg_count < 30:
        seed_messages = [
            {"group_id": "announcements", "user_id": "system", "user_name": "NEXRYDE Official", "user_role": "admin",
             "text": "Welcome to NEXRYDE Community! Connect with fellow drivers, share tips, and stay updated.", "likes": 45, "replies": 12, "is_pinned": True, "pinned_at": datetime.now(timezone.utc).isoformat(), "created_at": datetime.now(timezone.utc).isoformat()},
            {"group_id": "general", "user_id": "driver_001", "user_name": "Chinedu O.", "user_role": "driver",
             "text": "Good morning drivers! Who else is hitting the road early today?", "likes": 34, "replies": 8, "created_at": datetime.now(timezone.utc).isoformat()},
            {"group_id": "earnings-talk", "user_id": "driver_003", "user_name": "Emeka N.", "user_role": "driver",
             "text": "Pro tip: VI to Lekki Phase 1 during morning rush is always a goldmine!", "likes": 89, "replies": 22, "is_pinned": True, "pinned_at": datetime.now(timezone.utc).isoformat(), "created_at": datetime.now(timezone.utc).isoformat()},
            {"group_id": "tips-tricks", "user_id": "driver_005", "user_name": "Blessing A.", "user_role": "driver",
             "text": "Always keep your AC on and car clean. Riders tip more when comfortable!", "likes": 72, "replies": 18, "is_pinned": True, "pinned_at": datetime.now(timezone.utc).isoformat(), "created_at": datetime.now(timezone.utc).isoformat()},
            {"group_id": "safety-zone", "user_id": "driver_007", "user_name": "Kola S.", "user_role": "driver",
             "text": "Alert: Area boys very active around Oshodi under bridge this evening.", "likes": 112, "replies": 27, "is_pinned": True, "pinned_at": datetime.now(timezone.utc).isoformat(), "created_at": datetime.now(timezone.utc).isoformat()},
            {"group_id": "lagos-drivers", "user_id": "driver_008", "user_name": "Femi O.", "user_role": "driver",
             "text": "Third Mainland Bridge traffic is crazy this morning! Use Carter Bridge.", "likes": 67, "replies": 14, "created_at": datetime.now(timezone.utc).isoformat()},
            {"group_id": "vehicle-maintenance", "user_id": "driver_011", "user_name": "Segun D.", "user_role": "driver",
             "text": "Good mechanic in Surulere - Baba Ade at 23 Bode Thomas Street.", "likes": 134, "replies": 42, "created_at": datetime.now(timezone.utc).isoformat()},
            {"group_id": "new-drivers", "user_id": "driver_012", "user_name": "NEXRYDE Support", "user_role": "admin",
             "text": "Welcome new drivers! 3 golden rules: 1) Verify rider identity. 2) Keep documents updated. 3) Use AI Coach!", "likes": 156, "replies": 38, "is_pinned": True, "pinned_at": datetime.now(timezone.utc).isoformat(), "created_at": datetime.now(timezone.utc).isoformat()},
        ]
        await db_ref.community_messages.insert_many(seed_messages)
        logger.info(f"Seeded {len(seed_messages)} community messages")

"""Admin push broadcasts, schedules, analytics summary, A/B experiments."""
import asyncio
import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from database import db
from notification_catalog import NOTIFICATION_KIND_META, get_kind_meta, list_kind_audiences, list_known_kinds, normalize_audience
from notification_service import get_user_ids_for_broadcast_target, send_push_notification

logger = logging.getLogger("server")

admin_notifications_router = APIRouter(prefix="/api", tags=["Admin Notifications"])


class BroadcastBody(BaseModel):
    title: str
    body: str
    target: str = "all"
    type: str = "info"


class ScheduleBody(BaseModel):
    title: str
    body: str
    target: str = "all"
    type: str = "info"
    run_at: str = Field(..., description="ISO-8601 UTC datetime")


class ExperimentBody(BaseModel):
    key: str
    variants: list[str] = Field(default_factory=lambda: ["control", "treatment"])
    weights: Optional[list[float]] = None
    active: bool = True


class EngagementConfigBody(BaseModel):
    rules: list[dict[str, Any]]


@admin_notifications_router.post("/admin/notifications/broadcast")
async def admin_notifications_broadcast(request: Request, body: BroadcastBody):
    """Send immediate push to selected audience (Expo + FCM tokens per user)."""
    title = body.title.strip()
    msg = body.body.strip()
    if not title or not msg:
        raise HTTPException(status_code=400, detail="title and body required")
    notif_type = (body.type or "info").strip() or "info"
    if notif_type not in NOTIFICATION_KIND_META:
        raise HTTPException(status_code=400, detail=f"Unknown notification type: {notif_type}")
    uids = await get_user_ids_for_broadcast_target(body.target)
    data = {"type": notif_type, "source": "admin"}
    sem = asyncio.Semaphore(50)

    async def one(uid: str):
        async with sem:
            await send_push_notification(uid, title, msg, data, source="admin_broadcast")

    await asyncio.gather(*(one(uid) for uid in uids[:25_000]), return_exceptions=True)

    await db.admin_broadcasts.insert_one(
        {
            "id": str(uuid.uuid4()),
            "title": title,
            "body": msg,
            "target": body.target,
            "notif_type": notif_type,
            "recipient_count": len(uids),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "admin_email": getattr(request.state, "admin_email", None),
        }
    )
    return {"success": True, "queued_users": len(uids)}


@admin_notifications_router.post("/admin/notifications/schedule")
async def admin_notifications_schedule(request: Request, body: ScheduleBody):
    try:
        raw = body.run_at.replace("Z", "+00:00")
        run_at = datetime.fromisoformat(raw)
        if run_at.tzinfo is None:
            run_at = run_at.replace(tzinfo=timezone.utc)
        else:
            run_at = run_at.astimezone(timezone.utc)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid run_at ISO datetime")

    if run_at <= datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="run_at must be in the future")
    notif_type = (body.type or "info").strip() or "info"
    if notif_type not in NOTIFICATION_KIND_META:
        raise HTTPException(status_code=400, detail=f"Unknown notification type: {notif_type}")

    doc = {
        "id": str(uuid.uuid4()),
        "title": body.title.strip(),
        "body": body.body.strip(),
        "target": body.target,
        "notif_type": notif_type,
        "data": {"type": notif_type},
        "run_at": run_at,
        "sent_at": None,
        "created_at": datetime.now(timezone.utc),
        "created_by": getattr(request.state, "admin_email", None),
    }
    await db.scheduled_notifications.insert_one(doc)
    return {"success": True, "id": doc["id"], "run_at": run_at.isoformat()}


@admin_notifications_router.get("/admin/notifications/scheduled")
async def admin_list_scheduled(limit: int = 50):
    rows = (
        await db.scheduled_notifications.find({"sent_at": None})
        .sort("run_at", 1)
        .limit(min(limit, 200))
        .to_list(min(limit, 200))
    )
    out = []
    for r in rows:
        r.pop("_id", None)
        if isinstance(r.get("run_at"), datetime):
            r["run_at"] = r["run_at"].isoformat()
        if isinstance(r.get("created_at"), datetime):
            r["created_at"] = r["created_at"].isoformat()
        out.append(r)
    return {"scheduled": out}


@admin_notifications_router.get("/admin/notifications/kinds")
async def admin_notification_kinds():
    """Registered push `data.type` values + Android channel metadata (for ops / copy decks)."""
    return {"kinds": list_known_kinds(), "meta": NOTIFICATION_KIND_META}


@admin_notifications_router.get("/admin/notifications/audiences")
async def admin_notification_audiences():
    """Registered push templates with enforced audience/category metadata."""
    return {"templates": list_kind_audiences()}


@admin_notifications_router.get("/admin/notifications/engagement-config")
async def admin_get_engagement_config():
    """Current backend-owned engagement schedule/copy rules."""
    from engagement_push_service import DEFAULT_RULES

    doc = await db.engagement_notification_config.find_one({"id": "active"}, {"_id": 0})
    return {
        "source": "database" if doc else "default",
        "config": doc or {"id": "active", "rules": DEFAULT_RULES},
    }


@admin_notifications_router.put("/admin/notifications/engagement-config")
async def admin_update_engagement_config(request: Request, body: EngagementConfigBody):
    """Replace engagement notification schedule/copy without an app release."""
    allowed_roles = {"driver", "rider"}
    required = {"id", "role", "kind", "start", "end"}
    normalized: list[dict[str, Any]] = []
    for idx, rule in enumerate(body.rules):
        missing = sorted(k for k in required if not str(rule.get(k) or "").strip())
        if missing:
            raise HTTPException(status_code=400, detail=f"Rule {idx} missing: {', '.join(missing)}")
        role = str(rule.get("role") or "").strip()
        if role not in allowed_roles:
            raise HTTPException(status_code=400, detail=f"Rule {idx} has invalid role")
        kind = str(rule.get("kind") or "").strip()
        if kind not in NOTIFICATION_KIND_META:
            raise HTTPException(status_code=400, detail=f"Rule {idx} has unknown notification kind: {kind}")
        audience = normalize_audience(get_kind_meta(kind).get("audience"))
        if audience.value != role:
            raise HTTPException(status_code=400, detail=f"Rule {idx} kind {kind} is audience={audience.value}, not role={role}")
        variants = rule.get("variants")
        if not isinstance(variants, list) or len(variants) < 2:
            raise HTTPException(status_code=400, detail=f"Rule {idx} must include at least 2 notification variants")
        for v_idx, variant in enumerate(variants):
            if not isinstance(variant, dict) or not str(variant.get("title") or "").strip() or not str(variant.get("body") or "").strip():
                raise HTTPException(status_code=400, detail=f"Rule {idx} variant {v_idx} requires title and body")
        normalized.append({**rule, "role": role, "enabled": rule.get("enabled", True) is not False})

    doc = {
        "id": "active",
        "rules": normalized,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_by": getattr(request.state, "admin_email", None),
    }
    await db.engagement_notification_config.update_one({"id": "active"}, {"$set": doc}, upsert=True)
    return {"success": True, "config": doc}


@admin_notifications_router.get("/admin/notifications/analytics")
async def admin_notification_analytics(days: int = 7):
    since = datetime.now(timezone.utc) - timedelta(days=max(1, min(days, 90)))
    pipeline = [
        {"$match": {"created_at": {"$gte": since.isoformat()}}},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}},
    ]
    try:
        by_status = await db.notification_events.aggregate(pipeline).to_list(20)
    except Exception:
        by_status = []
    sent_today = await db.notification_events.count_documents(
        {"created_at": {"$gte": datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()}}
    )
    return {
        "since_days": days,
        "by_status": {row["_id"]: row["count"] for row in by_status},
        "approx_sent_today": sent_today,
    }


@admin_notifications_router.post("/admin/experiments")
async def admin_create_experiment(body: ExperimentBody):
    doc = {
        "id": str(uuid.uuid4()),
        "key": body.key.strip(),
        "variants": body.variants,
        "weights": body.weights,
        "active": body.active,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.ab_experiments.update_one(
        {"key": doc["key"]},
        {"$set": doc},
        upsert=True,
    )
    return {"success": True, "experiment": doc}


@admin_notifications_router.get("/admin/experiments")
async def admin_list_experiments():
    rows = await db.ab_experiments.find({}, {"_id": 0}).to_list(100)
    return {"experiments": rows}

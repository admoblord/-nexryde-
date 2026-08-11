"""
Admin Driver Profile — full operations view for the admin panel.
"""
from __future__ import annotations

import asyncio
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from database import db
from pii_encryption import driver_nin_public_fields, public_license_fields, public_nin_fields
from routers.admin import require_admin_access
from routers.admin_ops import _coerce_date_expr, _log_audit, _safe_aggregate, _safe_count, _admin_email

admin_driver_profile_router = APIRouter(
    prefix="/api",
    tags=["Admin Driver Profile"],
    dependencies=[Depends(require_admin_access)],
)

DOC_LABELS = {
    "nin": "National ID (NIN)",
    "drivers_license": "Driver's License",
    "passport_photo": "Profile Selfie",
    "vehicle_registration": "Vehicle Registration",
    "vehicle_license": "Proof of Ownership",
    "insurance": "Vehicle Insurance",
    "road_worthiness": "Road Worthiness Certificate",
    "vehicle_front": "Vehicle Front",
    "vehicle_back": "Vehicle Rear",
    "vehicle_left": "Vehicle Left",
    "vehicle_right": "Vehicle Right",
    "vehicle_interior": "Vehicle Interior",
    "vehicle_ac": "Vehicle A/C",
    "hacking_permit": "Hacking Permit",
}


def _driver_nin_public(docs_row: dict, user: dict, profile: dict) -> dict[str, Any]:
    return driver_nin_public_fields(docs_row, user, profile)


def _doc_has_data(doc_key: str, meta: dict, docs_row: dict) -> bool:
    if meta.get("size_bytes") or meta.get("file_key") or meta.get("gcs_key") or meta.get("data"):
        return True
    if meta.get("storage") in ("inline", "gcs"):
        return True
    if doc_key == "nin":
        if meta.get("nin_cipher") or meta.get("capture_mode") == "number_only":
            return True
        if docs_row.get("nin_hash") or docs_row.get("nin_last4") or docs_row.get("nin_cipher"):
            return True
    # Uploaded metadata present (binary may still be fetchable).
    return bool(meta.get("uploaded_at") and meta.get("filename"))


def _account_status(user: dict, profile: dict) -> str:
    if user.get("blocked"):
        return "banned"
    if user.get("is_deactivated"):
        return "deactivated"
    susp = user.get("suspended_until") or profile.get("suspended_until")
    if susp:
        try:
            if isinstance(susp, str):
                susp_dt = datetime.fromisoformat(susp.replace("Z", "+00:00"))
            else:
                susp_dt = susp
            if susp_dt > datetime.now(timezone.utc):
                return "suspended"
        except Exception:
            return "suspended"
    return "active"


@admin_driver_profile_router.get("/admin/drivers/{driver_id}/operations-profile")
async def driver_operations_profile(driver_id: str):
    """Complete driver profile for admin operations dashboard (all tabs)."""
    user = await db.users.find_one({"id": driver_id}, {"_id": 0})
    if not user or user.get("role") != "driver":
        raise HTTPException(status_code=404, detail="Driver not found")

    profile = await db.driver_profiles.find_one({"user_id": driver_id}, {"_id": 0}) or {}
    docs_row = await db.driver_documents.find_one(
        {"driver_id": driver_id},
        {"_id": 0, "documents.data": 0, "nin_cipher": 0, "license_number_cipher": 0},
    ) or {}
    verification = await db.driver_verifications.find_one(
        {"user_id": driver_id},
        {"_id": 0},
        sort=[("submitted_at", -1)],
    ) or await db.driver_verifications.find_one(
        {"driver_id": driver_id},
        {"_id": 0},
        sort=[("submitted_at", -1)],
    ) or {}

    verification_id = verification.get("id")
    audit_history = []
    if verification_id:
        audit_history = await db.driver_verification_audit.find(
            {"$or": [{"verification_id": verification_id}, {"driver_id": driver_id}]},
            {"_id": 0},
        ).sort("created_at", -1).limit(50).to_list(50)

    doc_items = []
    for key, meta in (docs_row.get("documents") or {}).items():
        if not isinstance(meta, dict):
            continue
        doc_items.append({
            "document_type": key,
            "label": DOC_LABELS.get(key, key.replace("_", " ").title()),
            "filename": meta.get("filename"),
            "content_type": meta.get("content_type"),
            "uploaded_at": meta.get("uploaded_at"),
            "expiry_date": meta.get("expiry_date"),
            "admin_status": meta.get("admin_status", "pending"),
            "has_data": _doc_has_data(key, meta, docs_row),
            "capture_mode": meta.get("capture_mode"),
            "rejection_reason": meta.get("rejection_reason"),
        })

    subscriptions = await db.subscriptions.find(
        {"driver_id": driver_id},
        {"_id": 0},
    ).sort("created_at", -1).limit(20).to_list(20)
    active_sub = next((s for s in subscriptions if s.get("status") in ("active", "trial", "grace_period")), None)

    wallet_doc = await db.wallets.find_one({"user_id": driver_id}, {"_id": 0}) or {}
    balance = float(wallet_doc.get("balance") or user.get("wallet_balance") or 0)

    tx_pipeline_match = {"user_id": driver_id}
    transactions = await db.transactions.find(
        tx_pipeline_match,
        {"_id": 0},
    ).sort("created_at", -1).limit(50).to_list(50)

    withdrawals = [t for t in transactions if t.get("type") == "withdrawal" or t.get("source") == "driver_withdrawal"]
    pending_withdrawal = sum(
        float(t.get("amount") or 0)
        for t in withdrawals
        if t.get("status") in ("pending", "processing")
    )

    now = datetime.now(timezone.utc)
    week_start = now - timedelta(days=7)
    month_start = now - timedelta(days=30)

    (
        completed_trips,
        cancelled_trips,
        total_assigned,
        recent_trips,
    ) = await asyncio.gather(
        _safe_count(lambda: db.trips.count_documents({"driver_id": driver_id, "status": "completed"})),
        _safe_count(lambda: db.trips.count_documents({"driver_id": driver_id, "status": "cancelled"})),
        _safe_count(lambda: db.trips.count_documents({"driver_id": driver_id})),
        db.trips.find(
            {"driver_id": driver_id},
            {"_id": 0, "id": 1, "status": 1, "fare": 1, "created_at": 1, "pickup_location": 1, "dropoff_location": 1, "rider_id": 1},
        ).sort("created_at", -1).limit(25).to_list(25),
    )

    acceptance_rate = round((completed_trips / max(total_assigned, 1)) * 100, 1)
    cancellation_rate = round((cancelled_trips / max(total_assigned, 1)) * 100, 1)

    earnings_daily = await _safe_aggregate(
        db.trips,
        [
            {"$match": {"driver_id": driver_id, "status": "completed"}},
            {"$addFields": {"_created": _coerce_date_expr("$created_at")}},
            {"$match": {"_created": {"$ne": None, "$gte": week_start}}},
            {"$group": {
                "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$_created"}},
                "earnings": {"$sum": "$fare"},
                "trips": {"$sum": 1},
            }},
            {"$sort": {"_id": 1}},
        ],
        limit=14,
    )

    earnings_monthly = await _safe_aggregate(
        db.trips,
        [
            {"$match": {"driver_id": driver_id, "status": "completed"}},
            {"$addFields": {"_created": _coerce_date_expr("$created_at")}},
            {"$match": {"_created": {"$ne": None, "$gte": month_start}}},
            {"$group": {"_id": None, "earnings": {"$sum": "$fare"}, "trips": {"$sum": 1}}},
        ],
        limit=1,
    )

    active_trip = await db.trips.find_one(
        {"driver_id": driver_id, "status": {"$in": ["accepted", "arrived", "ongoing", "picked_up", "in_progress"]}},
        {"_id": 0},
    )

    violations = await db.violations.find({"user_id": driver_id}, {"_id": 0}).sort("created_at", -1).limit(20).to_list(20)
    admin_notes = await db.admin_driver_notes.find(
        {"driver_id": driver_id},
        {"_id": 0},
    ).sort("created_at", -1).limit(50).to_list(50)
    reports = await db.driver_reports.find(
        {"driver_id": driver_id},
        {"_id": 0},
    ).sort("created_at", -1).limit(20).to_list(20)

    nin_public = _driver_nin_public(docs_row, user, profile)
    if nin_public.get("has_nin") and not any(d.get("document_type") == "nin" for d in doc_items):
        nin_meta = (docs_row.get("documents") or {}).get("nin") or {}
        doc_items.insert(0, {
            "document_type": "nin",
            "label": DOC_LABELS["nin"],
            "filename": nin_meta.get("filename"),
            "content_type": nin_meta.get("content_type"),
            "uploaded_at": nin_meta.get("uploaded_at") or docs_row.get("submitted_at"),
            "expiry_date": None,
            "admin_status": nin_meta.get("admin_status", "pending"),
            "has_data": True,
            "capture_mode": docs_row.get("nin_capture_mode") or nin_meta.get("capture_mode") or "number_only",
            "rejection_reason": nin_meta.get("rejection_reason"),
        })
    license_public = public_license_fields(docs_row)
    verification_result = verification.get("verification_result") or verification.get("ai_verification_result") or {}

    founding = any(
        "founding" in str(s.get("plan_type", "")).lower() or "founding" in str(s.get("plan", "")).lower()
        for s in subscriptions
    )

    earnings_month_row = earnings_monthly[0] if earnings_monthly else {}

    rating_rows = await db.trips.find(
        {"driver_id": driver_id, "driver_rating": {"$exists": True, "$ne": None}},
        {"_id": 0, "id": 1, "driver_rating": 1, "rider_id": 1, "created_at": 1},
    ).sort("created_at", -1).limit(30).to_list(30)

    peak_hours = await _safe_aggregate(
        db.trips,
        [
            {"$match": {"driver_id": driver_id, "status": "completed"}},
            {"$addFields": {"_created": _coerce_date_expr("$created_at")}},
            {"$match": {"_created": {"$ne": None}}},
            {"$group": {"_id": {"$hour": "$_created"}, "trips": {"$sum": 1}}},
            {"$sort": {"trips": -1}},
        ],
        limit=24,
    )

    timeline = []
    if user.get("created_at"):
        timeline.append({"type": "registered", "label": "Registered on NEXRYDE", "timestamp": user.get("created_at")})
    if docs_row.get("submitted_at"):
        timeline.append({"type": "documents_submitted", "label": "Documents submitted", "timestamp": docs_row.get("submitted_at")})
    for ev in audit_history:
        timeline.append({
            "type": ev.get("action", "verification"),
            "label": f"Verification: {ev.get('action')}",
            "timestamp": ev.get("created_at"),
            "actor": ev.get("actor_id"),
        })
    if profile.get("approved_at"):
        timeline.append({"type": "approved", "label": "Driver approved", "timestamp": profile.get("approved_at")})
    if active_sub and active_sub.get("created_at"):
        timeline.append({"type": "subscription", "label": f"Subscription {active_sub.get('status')}", "timestamp": active_sub.get("created_at")})
    if profile.get("is_online"):
        timeline.append({"type": "online", "label": "Currently online", "timestamp": profile.get("last_location_at")})
    for tx in withdrawals[:5]:
        if tx.get("status") == "pending":
            timeline.append({"type": "withdrawal", "label": f"Withdrawal requested ₦{tx.get('amount')}", "timestamp": tx.get("created_at")})
    if completed_trips > 0:
        first_trip = await db.trips.find_one({"driver_id": driver_id, "status": "completed"}, {"created_at": 1}, sort=[("created_at", 1)])
        if first_trip:
            timeline.append({"type": "first_trip", "label": "Completed first trip", "timestamp": first_trip.get("created_at")})
    timeline.sort(key=lambda e: str(e.get("timestamp") or ""), reverse=True)

    insurance_doc = (docs_row.get("documents") or {}).get("insurance") or {}
    road_doc = (docs_row.get("documents") or {}).get("road_worthiness") or {}

    return {
        "profile": {
            "id": user.get("id"),
            "name": user.get("name") or profile.get("full_name"),
            "phone": user.get("phone"),
            "email": user.get("email"),
            "gender": user.get("gender") or profile.get("gender"),
            "date_of_birth": profile.get("date_of_birth"),
            "address": profile.get("address"),
            "city": profile.get("city"),
            "state": profile.get("state"),
            "profile_image": user.get("profile_image") or profile.get("profile_image"),
            "created_at": user.get("created_at"),
            "account_status": _account_status(user, profile),
            "verification_status": profile.get("verification_status") or user.get("verification_status"),
            "is_online": profile.get("is_online", False),
            "last_active": profile.get("last_location_at") or user.get("last_seen_at"),
            "rating": user.get("rating"),
            "blocked": user.get("blocked", False),
            "current_location": profile.get("current_location"),
            "active_trip_id": (active_trip or {}).get("id"),
            "work_zone_area_ids": profile.get("work_zone_area_ids") or [],
            "work_zone_zones": profile.get("work_zone_zones") or [],
        },
        "ratings": {
            "average": user.get("rating"),
            "recent": rating_rows,
            "count": len(rating_rows),
        },
        "work_zone": {
            "active": profile.get("work_zone_active", False),
            "area_ids": profile.get("work_zone_area_ids") or [],
            "zones": profile.get("work_zone_zones") or [],
            "expires_at": profile.get("work_zone_expires_at"),
            "label": profile.get("work_zone_label"),
        },
        "activity_timeline": timeline,
        "verification": {
            "verification_id": verification_id,
            "status": verification.get("status") or profile.get("verification_status"),
            "nin": nin_public,
            "license": license_public,
            "face_verification": {
                "score": verification_result.get("face_match_score") or verification_result.get("confidence"),
                "status": verification_result.get("face_verification_status", "unknown"),
            },
            "background_check": verification.get("background_check_status", "not_available"),
            "documents": doc_items,
            "audit_history": audit_history,
            "review_score": verification_result.get("verification_score"),
        },
        "vehicle": {
            "make": profile.get("vehicle_make") or profile.get("vehicle_type"),
            "model": profile.get("vehicle_model"),
            "year": profile.get("vehicle_year"),
            "color": profile.get("vehicle_color"),
            "plate": profile.get("vehicle_plate_number") or profile.get("vehicle_plate"),
            "category": profile.get("vehicle_type") or profile.get("vehicle_category"),
            "seat_capacity": profile.get("seat_capacity") or profile.get("vehicle_seats"),
            "photos": [d for d in doc_items if d["document_type"].startswith("vehicle_")],
            "registration_status": profile.get("vehicle_verified", "pending"),
            "insurance_expiry": insurance_doc.get("expiry_date"),
            "roadworthiness_expiry": road_doc.get("expiry_date"),
        },
        "subscription": {
            "current": active_sub,
            "history": subscriptions,
            "trial_active": (active_sub or {}).get("status") == "trial",
            "trial_trips_remaining": max(
                0,
                int((active_sub or {}).get("trial_trips_target", 0)) - int((active_sub or {}).get("trial_trips_completed", 0)),
            ),
            "expiry": (active_sub or {}).get("end_date"),
            "founding_driver": founding,
            "work_zone": {
                "active": profile.get("work_zone_active", False),
                "area_ids": profile.get("work_zone_area_ids") or [],
                "zones": profile.get("work_zone_zones") or [],
                "expires_at": profile.get("work_zone_expires_at"),
            },
        },
        "wallet": {
            "balance_ngn": balance,
            "pending_withdrawal_ngn": pending_withdrawal,
            "transactions": transactions,
            "withdrawals": withdrawals[:20],
        },
        "trips": {
            "completed": completed_trips,
            "cancelled": cancelled_trips,
            "acceptance_rate_pct": acceptance_rate,
            "cancellation_rate_pct": cancellation_rate,
            "recent": recent_trips,
            "avg_rating": user.get("rating"),
        },
        "analytics": {
            "daily_earnings": earnings_daily,
            "weekly_earnings_ngn": round(sum(float(r.get("earnings") or 0) for r in earnings_daily), 2),
            "monthly_earnings_ngn": round(float(earnings_month_row.get("earnings") or 0), 2),
            "monthly_trips": int(earnings_month_row.get("trips") or 0),
            "hours_online": profile.get("online_hours_today") or profile.get("total_online_hours"),
            "peak_hours": peak_hours,
        },
        "live": {
            "is_online": profile.get("is_online", False),
            "current_location": profile.get("current_location"),
            "last_location_at": profile.get("last_location_at"),
            "active_trip": active_trip,
            "work_zone_area_ids": profile.get("work_zone_area_ids") or [],
            "work_zone_zones": profile.get("work_zone_zones") or [],
            "battery_level": profile.get("battery_level"),
            "network_status": profile.get("network_status", "unknown"),
        },
        "notes": {
            "admin_notes": admin_notes,
            "violations": violations,
            "support_reports": reports,
        },
        "guarantor": profile.get("guarantor"),
        "bank_details": {
            "bank_name": profile.get("bank_name"),
            "account_number": profile.get("account_number"),
            "account_name": profile.get("account_name"),
        },
    }


class AdminNoteBody(BaseModel):
    note: str = Field(..., min_length=1)


@admin_driver_profile_router.post("/admin/drivers/{driver_id}/notes")
async def add_driver_admin_note(driver_id: str, body: AdminNoteBody, request: Request):
    user = await db.users.find_one({"id": driver_id, "role": "driver"}, {"_id": 1})
    if not user:
        raise HTTPException(status_code=404, detail="Driver not found")
    doc = {
        "id": uuid.uuid4().hex,
        "driver_id": driver_id,
        "note": body.note.strip(),
        "created_by": await _admin_email(request),
        "created_at": datetime.now(timezone.utc),
    }
    await db.admin_driver_notes.insert_one(doc)
    await _log_audit(request, "driver_note_added", "driver", driver_id, {"note": body.note[:200]})
    doc.pop("_id", None)
    return {"success": True, "note": doc}


class SuspendBody(BaseModel):
    days: int = Field(7, ge=1, le=365)
    reason: str = "admin_suspend"


@admin_driver_profile_router.post("/admin/drivers/{driver_id}/suspend")
async def suspend_driver(driver_id: str, body: SuspendBody, request: Request):
    until = datetime.now(timezone.utc) + timedelta(days=body.days)
    result = await db.users.update_one(
        {"id": driver_id, "role": "driver"},
        {"$set": {"suspended_until": until.isoformat(), "suspension_reason": body.reason}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Driver not found")
    await db.driver_profiles.update_one(
        {"user_id": driver_id},
        {"$set": {"is_online": False, "suspended_until": until.isoformat(), "suspension_reason": body.reason}},
    )
    from driver_presence import clear_driver_presence_safe
    await clear_driver_presence_safe(driver_id)
    await _log_audit(request, "driver_suspended", "driver", driver_id, body.model_dump())
    return {"success": True, "suspended_until": until.isoformat()}


class WalletAdjustBody(BaseModel):
    amount: float = Field(..., gt=0)
    direction: str = Field(..., pattern="^(credit|debit)$")
    reason: str = "admin_adjustment"


@admin_driver_profile_router.post("/admin/drivers/{driver_id}/wallet-adjust")
async def adjust_driver_wallet(driver_id: str, body: WalletAdjustBody, request: Request):
    user = await db.users.find_one({"id": driver_id, "role": "driver"}, {"_id": 0, "wallet_balance": 1})
    if not user:
        raise HTTPException(status_code=404, detail="Driver not found")
    amount = float(body.amount)
    delta = amount if body.direction == "credit" else -amount
    if body.direction == "debit" and float(user.get("wallet_balance") or 0) < amount:
        raise HTTPException(status_code=400, detail="Insufficient wallet balance")
    await db.users.update_one({"id": driver_id}, {"$inc": {"wallet_balance": delta}})
    await db.wallets.update_one({"user_id": driver_id}, {"$inc": {"balance": delta}}, upsert=True)
    tx = {
        "id": uuid.uuid4().hex,
        "user_id": driver_id,
        "type": body.direction,
        "amount": amount,
        "source": "admin_adjustment",
        "reason": body.reason,
        "status": "completed",
        "created_at": datetime.now(timezone.utc),
        "admin_email": await _admin_email(request),
    }
    await db.transactions.insert_one(tx)
    await _log_audit(request, f"wallet_{body.direction}", "driver", driver_id, {"amount": amount, "reason": body.reason})
    return {"success": True, "transaction": {k: v for k, v in tx.items() if k != "_id"}}


class DocumentReviewBody(BaseModel):
    action: str = Field(..., pattern="^(approve|reject|request_reupload)$")
    reason: str = ""


@admin_driver_profile_router.post("/admin/drivers/{driver_id}/documents/{doc_type}/review")
async def review_driver_document(
    driver_id: str,
    doc_type: str,
    body: DocumentReviewBody,
    request: Request,
):
    status_map = {"approve": "approved", "reject": "rejected", "request_reupload": "reupload_requested"}
    new_status = status_map[body.action]
    result = await db.driver_documents.update_one(
        {"driver_id": driver_id},
        {"$set": {
            f"documents.{doc_type}.admin_status": new_status,
            f"documents.{doc_type}.reviewed_at": datetime.now(timezone.utc),
            f"documents.{doc_type}.reviewed_by": await _admin_email(request),
            f"documents.{doc_type}.rejection_reason": body.reason if body.action != "approve" else None,
        }},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Driver documents not found")
    await _log_audit(request, f"document_{body.action}", "driver", driver_id, {"doc_type": doc_type, "reason": body.reason})
    return {"success": True, "document_type": doc_type, "status": new_status}


class NotifyDriverBody(BaseModel):
    title: str
    body: str


class DocumentGraceBody(BaseModel):
    document_type: str = Field(default="drivers_license")
    days: int = Field(default=7, ge=1, le=30)
    reason: str = "admin_grace"
    notify: bool = True


@admin_driver_profile_router.post("/admin/drivers/{driver_id}/document-grace")
async def admin_grant_document_grace(driver_id: str, body: DocumentGraceBody, request: Request):
    """Grant one-off grace for an expired document (e.g. expired licence — 7 days to renew)."""
    from driver_compliance import DOCUMENT_NAMES, grant_document_grace

    if body.document_type not in DOCUMENT_NAMES:
        raise HTTPException(status_code=400, detail=f"Invalid document_type. Use one of: {', '.join(DOCUMENT_NAMES)}")
    try:
        result = await grant_document_grace(
            driver_id,
            body.document_type,
            days=body.days,
            reason=body.reason,
            granted_by=await _admin_email(request),
            notify=body.notify,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    await _log_audit(
        request,
        "document_grace_granted",
        "driver",
        driver_id,
        {"document_type": body.document_type, "days": body.days, "grace_until": result["grace_until"]},
    )
    return {"success": True, **result}


@admin_driver_profile_router.post("/admin/drivers/{driver_id}/notify")
async def notify_driver(driver_id: str, body: NotifyDriverBody, request: Request):
    import uuid
    from notification_service import send_push_notification
    user = await db.users.find_one({"id": driver_id}, {"_id": 1, "role": 1})
    if not user:
        raise HTTPException(status_code=404, detail="Driver not found")
    if user.get("role") != "driver":
        raise HTTPException(status_code=400, detail="Target user is not a driver")
    now_iso = datetime.now(timezone.utc).isoformat()
    from user_inbox_notifications import insert_user_notification

    await insert_user_notification(
        user_id=driver_id,
        type="admin_message",
        title=body.title,
        message=body.body,
        id=str(uuid.uuid4()),
        created_at=now_iso,
        data={"source": "admin"},
    )
    await send_push_notification(driver_id, body.title, body.body, {"type": "admin_message", "source": "admin"})
    await _log_audit(request, "driver_notification_sent", "driver", driver_id, {"title": body.title})
    return {"success": True}

"""Rider operations profile for admin panel."""
from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from database import db
from pii_encryption import public_nin_fields, strip_sensitive_pii
from routers.admin import require_admin_access
from routers.admin_ops import _coerce_date_expr, _safe_aggregate, _safe_count, _log_audit, _admin_email

admin_rider_profile_router = APIRouter(
    prefix="/api",
    tags=["Admin Rider Profile"],
    dependencies=[Depends(require_admin_access)],
)


def _build_rider_timeline(user: dict, trips: list, transactions: list) -> list[dict]:
    events = []
    if user.get("created_at"):
        events.append({"type": "registered", "label": "Registered on NEXRYDE", "timestamp": user.get("created_at")})
    if public_nin_fields(user).get("has_nin"):
        events.append({
            "type": "nin_on_file",
            "label": "NIN submitted",
            "timestamp": user.get("nin_verify_checked_at") or user.get("created_at"),
        })
    if user.get("nin_verified"):
        events.append({
            "type": "nin_verified",
            "label": "NIN verified",
            "timestamp": user.get("nin_verify_checked_at"),
        })
    for t in trips[:10]:
        events.append({
            "type": f"trip_{t.get('status')}",
            "label": f"Trip {str(t.get('id', ''))[:8]} — {t.get('status')}",
            "timestamp": t.get("created_at"),
        })
    for tx in transactions[:10]:
        events.append({
            "type": "wallet",
            "label": f"Wallet {tx.get('type')} ₦{tx.get('amount')}",
            "timestamp": tx.get("created_at"),
        })
    events.sort(key=lambda e: str(e.get("timestamp") or ""), reverse=True)
    return events


@admin_rider_profile_router.get("/admin/riders/{rider_id}/operations-profile")
async def rider_operations_profile(rider_id: str):
    rider = await db.users.find_one({"id": rider_id, "role": "rider"}, {"_id": 0})
    if not rider:
        raise HTTPException(status_code=404, detail="Rider not found")

    wallet_doc = await db.wallets.find_one({"user_id": rider_id}, {"_id": 0}) or {}
    balance = float(wallet_doc.get("balance") or rider.get("wallet_balance") or 0)

    transactions = await db.transactions.find({"user_id": rider_id}, {"_id": 0}).sort("created_at", -1).limit(50).to_list(50)
    recent_trips = await db.trips.find(
        {"rider_id": rider_id},
        {"_id": 0},
    ).sort("created_at", -1).limit(30).to_list(30)

    completed = await _safe_count(lambda: db.trips.count_documents({"rider_id": rider_id, "status": "completed"}))
    cancelled = await _safe_count(lambda: db.trips.count_documents({"rider_id": rider_id, "status": "cancelled"}))
    total = await _safe_count(lambda: db.trips.count_documents({"rider_id": rider_id}))

    reports = await db.driver_reports.find({"rider_id": rider_id}, {"_id": 0}).sort("created_at", -1).limit(20).to_list(20)
    admin_notes = await db.admin_rider_notes.find({"rider_id": rider_id}, {"_id": 0}).sort("created_at", -1).limit(50).to_list(50)

    fav_drivers = rider.get("favourite_drivers") or rider.get("favorite_drivers") or []
    saved_locations = rider.get("saved_locations") or rider.get("saved_places") or []

    spend_agg = await _safe_aggregate(
        db.trips,
        [
            {"$match": {"rider_id": rider_id, "status": "completed"}},
            {"$group": {"_id": None, "total": {"$sum": "$fare"}, "count": {"$sum": 1}}},
        ],
        limit=1,
    )

    spend_row = spend_agg[0] if spend_agg else {}

    rider_safe = strip_sensitive_pii(rider)
    nin_public = public_nin_fields(rider)
    nin_public["nin_verify_method"] = rider.get("nin_verify_method") or (
        "nexryde" if rider.get("nin_verified") else None
    )

    return {
        "profile": {
            **rider_safe,
            "wallet_balance": balance,
            "account_status": "banned" if rider.get("blocked") else ("suspended" if rider.get("suspended_until") else "active"),
            "total_trips": total,
            "completed_trips": completed,
            "cancelled_trips": cancelled,
            "total_spend_ngn": round(float(spend_row.get("total") or 0), 2),
            **nin_public,
        },
        "verification": {
            "nin": nin_public,
            "face_verified": bool(rider.get("face_verified")),
            "face_liveness_score": rider.get("face_liveness_score"),
            "is_verified": bool(rider.get("is_verified")),
        },
        "wallet": {"balance_ngn": balance, "transactions": transactions},
        "trips": {"recent": recent_trips, "completed": completed, "cancelled": cancelled, "total": total},
        "payments": [t for t in transactions if t.get("source") in ("ride_payment", "wallet_topup", "refund")],
        "favourite_drivers": fav_drivers,
        "saved_locations": saved_locations,
        "complaints": reports,
        "ratings": {"average_given": rider.get("rating")},
        "timeline": _build_rider_timeline(rider, recent_trips, transactions),
        "notes": {"admin_notes": admin_notes},
    }


class RiderNoteBody(BaseModel):
    note: str = Field(..., min_length=1)


class WalletAdjustBody(BaseModel):
    amount: float = Field(..., gt=0)
    direction: str = Field(..., pattern="^(credit|debit)$")
    reason: str = "admin_adjustment"


@admin_rider_profile_router.post("/admin/riders/{rider_id}/wallet-adjust")
async def adjust_rider_wallet(rider_id: str, body: WalletAdjustBody, request: Request):
    raise HTTPException(status_code=410, detail="Customer/driver wallet adjustments are disabled. NexRyde does not hold funds.")

@admin_rider_profile_router.post("/admin/riders/{rider_id}/notes")
async def add_rider_note(rider_id: str, body: RiderNoteBody, request: Request):
    if not await db.users.find_one({"id": rider_id, "role": "rider"}, {"_id": 1}):
        raise HTTPException(status_code=404, detail="Rider not found")
    doc = {
        "id": uuid.uuid4().hex,
        "rider_id": rider_id,
        "note": body.note.strip(),
        "created_by": await _admin_email(request),
        "created_at": datetime.now(timezone.utc),
    }
    await db.admin_rider_notes.insert_one(doc)
    await _log_audit(request, "rider_note_added", "rider", rider_id, {"note": body.note[:200]})
    return {"success": True, "note": doc}

"""
NEXRYDE Shield — disputes (due process), trip audio evidence (48h TTL), recording consent.
"""
from __future__ import annotations

import base64
import hashlib
import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from cryptography.fernet import Fernet
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field

from auth_guard import require_authenticated, verify_trip_participant
from database import db
from push_notifications import send_push_notification

logger = logging.getLogger("server")
shield_router = APIRouter(prefix="/api/shield", tags=["NEXRYDE Shield"])

AUDIO_TTL_HOURS = 48
MAX_AUDIO_BYTES = 4 * 1024 * 1024  # 4 MiB raw binary after decode


def _fernet() -> Fernet:
    raw = (os.environ.get("SHIELD_AUDIO_FERNET_KEY") or os.environ.get("JWT_SECRET") or "nexryde-shield-dev").encode()
    key = base64.urlsafe_b64encode(hashlib.sha256(raw).digest())
    return Fernet(key)


class CreateDisputeRequest(BaseModel):
    trip_id: str
    statement: str = Field(..., min_length=10, max_length=8000)
    category: Optional[str] = Field(None, max_length=120)


class RespondDisputeRequest(BaseModel):
    statement: str = Field(..., min_length=10, max_length=8000)


class RecordingConsentBody(BaseModel):
    opt_in: bool


class TripAudioUpload(BaseModel):
    """Base64-encoded audio (e.g. AAC/M4A from device)."""
    audio_base64: str = Field(..., min_length=20)
    mime_type: str = Field(default="audio/aac", max_length=80)


class InvisibleShieldActivationBody(BaseModel):
    expected_arrival_minutes: Optional[int] = Field(default=None, ge=5, le=240)


class InvisibleShieldConfirmBody(BaseModel):
    safe: bool = True


def _other_party_id(trip: dict, uid: str) -> Optional[str]:
    rid, did = trip.get("rider_id"), trip.get("driver_id")
    if uid == rid:
        return did
    if uid == did:
        return rid
    return None


def _invisible_shield_payload(trip: dict) -> dict:
    mode = dict(trip.get("invisible_shield_mode") or {})
    return {
        "active": bool(mode.get("active")),
        "armed_at": mode.get("armed_at"),
        "armed_by": mode.get("armed_by"),
        "expected_arrival_at": mode.get("expected_arrival_at"),
        "confirm_deadline_at": mode.get("confirm_deadline_at"),
        "confirmed_safe_at": mode.get("confirmed_safe_at"),
        "auto_escalated_at": mode.get("auto_escalated_at"),
        "server_audio_uploaded": bool(mode.get("server_audio_uploaded")),
        "server_audio_expires_at": mode.get("server_audio_expires_at"),
        "safety_team_alerted": bool(mode.get("safety_team_alerted")),
    }


VALID_ISSUE_TYPES = {
    "driver_behavior": "Driver Behavior",
    "wrong_fare": "Wrong Fare",
    "route_issue": "Route Issue",
    "safety_concern": "Safety Concern",
    "other": "Other",
}

VALID_DECISIONS = {
    "no_action", "warning", "refund_partial", "refund_full",
    "account_restriction", "account_suspension",
}


def _build_trip_evidence(trip: dict) -> dict:
    """Extract immutable trip data to attach as evidence — no manual editing."""
    pl = trip.get("pickup_location") or {}
    dl = trip.get("dropoff_location") or {}
    return {
        "fare": trip.get("fare") or trip.get("offered_fare"),
        "distance_km": trip.get("distance_km"),
        "duration_mins": trip.get("duration_mins"),
        "service_type": trip.get("service_type"),
        "payment_method": trip.get("payment_method"),
        "trip_start_time": trip.get("accepted_at") or trip.get("started_at"),
        "trip_end_time": trip.get("completed_at"),
        "pickup_address": pl.get("address") if isinstance(pl, dict) else str(pl),
        "dropoff_address": dl.get("address") if isinstance(dl, dict) else str(dl),
        "pickup_lat": pl.get("lat") if isinstance(pl, dict) else None,
        "pickup_lng": pl.get("lng") if isinstance(pl, dict) else None,
        "dropoff_lat": dl.get("lat") if isinstance(dl, dict) else None,
        "dropoff_lng": dl.get("lng") if isinstance(dl, dict) else None,
        "surge_multiplier": trip.get("surge_multiplier"),
        "trip_status_at_report": trip.get("status"),
    }


@shield_router.post("/disputes")
async def shield_create_dispute(body: CreateDisputeRequest, request: Request):
    """Open a Shield case; other party notified and may respond — no automatic bans."""
    uid = require_authenticated(request)
    trip = await db.trips.find_one({"id": body.trip_id}, {"_id": 0})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    if uid not in {trip.get("rider_id"), trip.get("driver_id")}:
        raise HTTPException(status_code=403, detail="Not a participant on this trip")
    if trip.get("status") in ("pending", "pending_driver_offers"):
        raise HTTPException(status_code=400, detail="Trip has not started yet")

    existing = await db.shield_disputes.find_one(
        {"trip_id": body.trip_id, "status": {"$nin": ["resolved", "dismissed"]}},
        {"_id": 0, "id": 1},
    )
    if existing:
        raise HTTPException(status_code=400, detail="An open Shield case already exists for this trip")

    role = "rider" if uid == trip.get("rider_id") else "driver"
    other = _other_party_id(trip, uid)
    now = datetime.now(timezone.utc).isoformat()

    # Normalise category / issue type
    raw_cat = (body.category or "other").strip().lower()
    issue_type = raw_cat if raw_cat in VALID_ISSUE_TYPES else "other"

    doc = {
        "id": str(uuid.uuid4()),
        "trip_id": body.trip_id,
        "rider_id": trip.get("rider_id"),
        "driver_id": trip.get("driver_id"),
        "opened_by": uid,
        "opened_by_role": role,
        "issue_type": issue_type,
        "issue_type_label": VALID_ISSUE_TYPES[issue_type],
        "rider_statement": body.statement.strip() if role == "rider" else None,
        "driver_statement": body.statement.strip() if role == "driver" else None,
        # Keep legacy field for backwards compat
        "complainant_statement": body.statement.strip(),
        "respondent_id": other,
        "respondent_statement": None,
        "status": "awaiting_response" if other else "under_review",
        "decision": None,
        "decision_reason": None,
        "created_at": now,
        "updated_at": now,
        "resolved_at": None,
        "resolution_notes": None,
        "auto_enforcement": False,
        # Auto-attached trip evidence — immutable
        "trip_evidence": _build_trip_evidence(trip),
    }
    await db.shield_disputes.insert_one(doc)
    doc.pop("_id", None)

    # Notify the other party
    if other:
        other_role = "driver" if role == "rider" else "rider"
        await send_push_notification(
            other,
            "Nexryde Shield — Response Required",
            f"A report was filed for your recent trip. Please respond within 24 hours.",
            {"type": "shield_case_created", "dispute_id": doc["id"], "trip_id": body.trip_id},
        )
        logger.info(f"Shield case {doc['id']} created by {role} {uid}; notified {other_role} {other}")

    return {"success": True, "dispute": doc}


@shield_router.put("/disputes/{dispute_id}/respond")
async def shield_respond_dispute(dispute_id: str, body: RespondDisputeRequest, request: Request):
    uid = require_authenticated(request)
    d = await db.shield_disputes.find_one({"id": dispute_id}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Dispute not found")
    if d.get("status") in ("resolved", "dismissed"):
        raise HTTPException(status_code=400, detail="This Shield case is already closed")
    if uid not in {d.get("respondent_id"), d.get("rider_id"), d.get("driver_id")}:
        raise HTTPException(status_code=403, detail="Not a participant on this case")
    if uid == d.get("opened_by"):
        raise HTTPException(status_code=400, detail="You opened this case — wait for the other party to respond")
    if d.get("respondent_statement"):
        raise HTTPException(status_code=400, detail="Your response has already been submitted")

    # Determine which statement field to update
    role = "rider" if uid == d.get("rider_id") else "driver"
    stmt_field = "rider_statement" if role == "rider" else "driver_statement"

    now = datetime.now(timezone.utc).isoformat()
    await db.shield_disputes.update_one(
        {"id": dispute_id},
        {"$set": {
            "respondent_statement": body.statement.strip(),
            stmt_field: body.statement.strip(),
            "status": "under_review",
            "updated_at": now,
        }},
    )
    updated = await db.shield_disputes.find_one({"id": dispute_id}, {"_id": 0})

    # Notify the opener that the case moved to under_review
    opener = d.get("opened_by")
    if opener:
        await send_push_notification(
            opener,
            "Nexryde Shield — Response Received",
            "The other party has responded to your report. Our team will now review the case.",
            {"type": "shield_case_responded", "dispute_id": dispute_id},
        )

    return {"success": True, "dispute": updated}


# ─── Admin Shield endpoints ──────────────────────────────────────────────────

class AdminShieldDecision(BaseModel):
    decision: str = Field(..., description="One of: no_action, warning, refund_partial, refund_full, account_restriction, account_suspension")
    decision_reason: str = Field(..., min_length=10, max_length=4000)


@shield_router.get("/admin/disputes")
async def admin_list_shield_disputes(
    request: Request,
    status: Optional[str] = None,
    limit: int = 50,
    skip: int = 0,
):
    """Admin: list all Shield cases, optionally filtered by status."""
    from admin_guard import require_admin_request
    require_admin_request(request)
    query: dict = {}
    if status and status in ("awaiting_response", "under_review", "resolved", "dismissed"):
        query["status"] = status
    lim = max(1, min(limit, 200))
    cursor = db.shield_disputes.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(lim)
    items = await cursor.to_list(lim)
    total = await db.shield_disputes.count_documents(query)
    return {"disputes": items, "total": total, "skip": skip, "limit": lim}


@shield_router.get("/admin/disputes/{dispute_id}")
async def admin_get_shield_dispute(dispute_id: str, request: Request):
    """Admin: get single Shield case with full trip evidence."""
    from admin_guard import require_admin_request
    require_admin_request(request)
    d = await db.shield_disputes.find_one({"id": dispute_id}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Case not found")

    # Enrich with rider/driver display names
    rider_doc = await db.users.find_one({"id": d.get("rider_id")}, {"_id": 0, "name": 1, "phone": 1}) or {}
    driver_doc = await db.users.find_one({"id": d.get("driver_id")}, {"_id": 0, "name": 1, "phone": 1}) or {}
    d["rider_name"] = rider_doc.get("name") or d.get("rider_id", "")
    d["driver_name"] = driver_doc.get("name") or d.get("driver_id", "")
    return {"dispute": d}


@shield_router.put("/admin/disputes/{dispute_id}/decision")
async def admin_resolve_shield_dispute(
    dispute_id: str,
    body: AdminShieldDecision,
    request: Request,
):
    """Admin: record decision and resolve a Shield case."""
    from admin_guard import require_admin_request
    require_admin_request(request)

    if body.decision not in VALID_DECISIONS:
        raise HTTPException(status_code=400, detail=f"Invalid decision. Must be one of: {', '.join(sorted(VALID_DECISIONS))}")

    d = await db.shield_disputes.find_one({"id": dispute_id}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Case not found")
    if d.get("status") == "resolved":
        raise HTTPException(status_code=400, detail="Case is already resolved")

    now = datetime.now(timezone.utc).isoformat()
    await db.shield_disputes.update_one(
        {"id": dispute_id},
        {"$set": {
            "status": "resolved",
            "decision": body.decision,
            "decision_reason": body.decision_reason.strip(),
            "resolved_at": now,
            "updated_at": now,
            "resolution_notes": body.decision_reason.strip(),
        }},
    )
    updated = await db.shield_disputes.find_one({"id": dispute_id}, {"_id": 0})

    # Notify both parties
    decision_label = body.decision.replace("_", " ").title()
    for party_id in filter(None, {d.get("rider_id"), d.get("driver_id")}):
        await send_push_notification(
            party_id,
            "Nexryde Shield — Case Resolved",
            f"Your Shield case has been reviewed and resolved: {decision_label}.",
            {"type": "shield_case_resolved", "dispute_id": dispute_id, "decision": body.decision},
        )

    logger.info(f"Shield case {dispute_id} resolved with decision '{body.decision}' by admin")
    return {"success": True, "dispute": updated}


@shield_router.get("/disputes/mine")
async def shield_list_my_disputes(request: Request, limit: int = 30):
    uid = require_authenticated(request)
    lim = max(1, min(limit, 100))
    cur = (
        db.shield_disputes.find(
            {"$or": [{"opened_by": uid}, {"respondent_id": uid}]},
            {"_id": 0},
        )
        .sort("created_at", -1)
        .limit(lim)
    )
    items = await cur.to_list(lim)
    return {"disputes": items}


@shield_router.get("/disputes/{dispute_id}")
async def shield_get_dispute(dispute_id: str, request: Request):
    uid = require_authenticated(request)
    d = await db.shield_disputes.find_one({"id": dispute_id}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Dispute not found")
    if uid not in {d.get("opened_by"), d.get("respondent_id")}:
        raise HTTPException(status_code=403, detail="Not authorized")
    return {"dispute": d}


@shield_router.put("/trips/{trip_id}/recording-consent")
async def shield_recording_consent(trip_id: str, body: RecordingConsentBody, request: Request):
    """Per-role opt-in for Shield trip audio (both must opt in for active dual consent flag)."""
    uid = require_authenticated(request)
    trip = await db.trips.find_one({"id": trip_id}, {"_id": 0, "rider_id": 1, "driver_id": 1, "status": 1})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    verify_trip_participant(request, trip)
    if trip.get("status") in ("completed", "cancelled"):
        raise HTTPException(status_code=400, detail="Trip has ended")

    field = None
    if uid == trip.get("rider_id"):
        field = "shield_recording_rider_opt_in"
    elif uid == trip.get("driver_id"):
        field = "shield_recording_driver_opt_in"
    else:
        raise HTTPException(status_code=403, detail="Not a participant")

    now = datetime.now(timezone.utc).isoformat()
    await db.trips.update_one(
        {"id": trip_id},
        {"$set": {field: body.opt_in, "shield_recording_updated_at": now}},
    )
    t2 = await db.trips.find_one({"id": trip_id}, {"_id": 0, "shield_recording_rider_opt_in": 1, "shield_recording_driver_opt_in": 1, "recording_enabled": 1})
    r_ok = bool(t2.get("shield_recording_rider_opt_in") or t2.get("recording_enabled"))
    d_ok = bool(t2.get("shield_recording_driver_opt_in"))
    dual = r_ok and d_ok
    await db.trips.update_one({"id": trip_id}, {"$set": {"shield_recording_active": dual}})
    return {
        "success": True,
        "shield_recording_rider_opt_in": r_ok,
        "shield_recording_driver_opt_in": d_ok,
        "shield_recording_active": dual,
    }


@shield_router.put("/trips/{trip_id}/invisible-mode")
async def activate_invisible_shield_mode(trip_id: str, body: InvisibleShieldActivationBody, request: Request):
    uid = require_authenticated(request)
    trip = await db.trips.find_one({"id": trip_id}, {"_id": 0})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    verify_trip_participant(request, trip)
    if uid != trip.get("rider_id"):
        raise HTTPException(status_code=403, detail="Only the rider can activate Invisible Shield Mode")
    if trip.get("status") not in {"accepted", "arrived", "ongoing", "pending_payment"}:
        raise HTTPException(status_code=400, detail="Invisible Shield Mode is only available for active trips")

    now = datetime.now(timezone.utc)
    duration_mins = max(5, int(body.expected_arrival_minutes or trip.get("duration_mins") or 20))
    expected_arrival_at = None
    confirm_deadline_at = None
    if trip.get("status") in {"ongoing", "pending_payment"}:
        expected_dt = now + timedelta(minutes=duration_mins)
        expected_arrival_at = expected_dt.isoformat()
        confirm_deadline_at = (expected_dt + timedelta(minutes=10)).isoformat()

    mode = {
        "active": True,
        "armed_at": now.isoformat(),
        "armed_by": uid,
        "expected_arrival_at": expected_arrival_at,
        "confirm_deadline_at": confirm_deadline_at,
        "confirmed_safe_at": None,
        "auto_escalated_at": None,
        "server_audio_uploaded": False,
        "server_audio_expires_at": None,
        "last_server_audio_at": None,
        "safety_team_alerted": False,
        "emergency_contacts_notified": 0,
    }
    await db.trips.update_one({"id": trip_id}, {"$set": {"invisible_shield_mode": mode}})
    if trip.get("driver_id"):
        await send_push_notification(
            trip["driver_id"],
            "Trip Protection Enabled",
            "Nexryde late-night trip protection is active for this ride.",
            {"type": "invisible_shield_mode", "trip_id": trip_id},
        )
    updated = await db.trips.find_one({"id": trip_id}, {"_id": 0, "invisible_shield_mode": 1})
    return {"success": True, "invisible_shield_mode": _invisible_shield_payload(updated or {})}


@shield_router.post("/trips/{trip_id}/invisible-mode/audio")
async def upload_invisible_shield_audio(trip_id: str, body: TripAudioUpload, request: Request):
    uid = require_authenticated(request)
    trip = await db.trips.find_one({"id": trip_id}, {"_id": 0})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    verify_trip_participant(request, trip)
    if uid != trip.get("rider_id"):
        raise HTTPException(status_code=403, detail="Only the rider can upload Invisible Shield audio")
    mode = dict(trip.get("invisible_shield_mode") or {})
    if not mode.get("active"):
        raise HTTPException(status_code=400, detail="Invisible Shield Mode is not active for this trip")

    try:
        raw = base64.b64decode(body.audio_base64, validate=True)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 audio payload")
    if len(raw) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=400, detail="Audio file too large (max 4MB)")

    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(hours=AUDIO_TTL_HOURS)
    blob = _fernet().encrypt(raw)
    doc = {
        "id": str(uuid.uuid4()),
        "trip_id": trip_id,
        "uploaded_by": uid,
        "mime_type": body.mime_type[:80],
        "cipher_blob": blob,
        "created_at": now,
        "expires_at": expires_at,
        "mode": "invisible_shield",
    }
    await db.shield_trip_audio.replace_one({"trip_id": trip_id, "uploaded_by": uid}, doc, upsert=True)
    mode["server_audio_uploaded"] = True
    mode["server_audio_expires_at"] = expires_at.isoformat()
    mode["last_server_audio_at"] = now.isoformat()
    await db.trips.update_one({"id": trip_id}, {"$set": {"invisible_shield_mode": mode}})
    return {
        "success": True,
        "audio_id": doc["id"],
        "expires_at": expires_at.isoformat(),
        "invisible_shield_mode": _invisible_shield_payload({"invisible_shield_mode": mode}),
    }


@shield_router.post("/trips/{trip_id}/invisible-mode/confirm-safe")
async def confirm_invisible_shield_safe_arrival(trip_id: str, body: InvisibleShieldConfirmBody, request: Request):
    uid = require_authenticated(request)
    trip = await db.trips.find_one({"id": trip_id}, {"_id": 0})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    verify_trip_participant(request, trip)
    if uid != trip.get("rider_id"):
        raise HTTPException(status_code=403, detail="Only the rider can confirm safe arrival")
    mode = dict(trip.get("invisible_shield_mode") or {})
    if not mode.get("active"):
        raise HTTPException(status_code=400, detail="Invisible Shield Mode is not active")
    if not body.safe:
        raise HTTPException(status_code=400, detail="Use SOS or support escalation if you are not safe")

    now = datetime.now(timezone.utc).isoformat()
    mode["confirmed_safe_at"] = now
    mode["active"] = False
    await db.trips.update_one({"id": trip_id}, {"$set": {"invisible_shield_mode": mode}})
    await db.shield_trip_audio.delete_many({"trip_id": trip_id, "uploaded_by": uid})
    return {
        "success": True,
        "message": "Safe arrival confirmed. Invisible Shield audio was deleted from secure storage.",
        "invisible_shield_mode": _invisible_shield_payload({"invisible_shield_mode": mode}),
    }

@shield_router.post("/trips/{trip_id}/audio")
async def shield_upload_trip_audio(trip_id: str, body: TripAudioUpload, request: Request):
    """Upload encrypted trip audio; expires after AUDIO_TTL_HOURS (Mongo TTL)."""
    uid = require_authenticated(request)
    trip = await db.trips.find_one({"id": trip_id}, {"_id": 0})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    verify_trip_participant(request, trip)

    if not trip.get("shield_recording_active"):
        raise HTTPException(
            status_code=400,
            detail="Trip audio requires active Shield recording consent from both rider and driver.",
        )

    try:
        raw = base64.b64decode(body.audio_base64, validate=True)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 audio payload")
    if len(raw) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=400, detail="Audio file too large (max 4MB)")

    f = _fernet()
    blob = f.encrypt(raw)
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(hours=AUDIO_TTL_HOURS)
    doc = {
        "id": str(uuid.uuid4()),
        "trip_id": trip_id,
        "uploaded_by": uid,
        "mime_type": body.mime_type[:80],
        "cipher_blob": blob,
        "created_at": now,
        "expires_at": expires_at,
    }
    await db.shield_trip_audio.replace_one(
        {"trip_id": trip_id, "uploaded_by": uid},
        doc,
        upsert=True,
    )
    return {
        "success": True,
        "audio_id": doc["id"],
        "expires_at": expires_at.isoformat(),
        "retention_hours": AUDIO_TTL_HOURS,
    }


@shield_router.get("/trips/{trip_id}/audio/meta")
async def shield_trip_audio_meta(trip_id: str, request: Request):
    """Confirm whether audio evidence exists (no download URL in-listing)."""
    uid = require_authenticated(request)
    trip = await db.trips.find_one({"id": trip_id}, {"_id": 0, "rider_id": 1, "driver_id": 1})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    verify_trip_participant(request, trip)
    rows = await db.shield_trip_audio.find({"trip_id": trip_id}, {"_id": 0, "cipher_blob": 0}).to_list(10)
    return {"recordings": rows}


@shield_router.get("/trips/{trip_id}/audio/download")
async def shield_download_own_trip_audio(trip_id: str, request: Request):
    """Decrypt and return participant's own uploaded audio (for dispute packs / support)."""
    uid = require_authenticated(request)
    trip = await db.trips.find_one({"id": trip_id}, {"_id": 0, "rider_id": 1, "driver_id": 1})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    verify_trip_participant(request, trip)
    row = await db.shield_trip_audio.find_one({"trip_id": trip_id, "uploaded_by": uid}, {"_id": 0})
    if not row:
        raise HTTPException(status_code=404, detail="No audio uploaded by you for this trip")
    try:
        raw = _fernet().decrypt(row["cipher_blob"])
    except Exception:
        raise HTTPException(status_code=500, detail="Could not decrypt audio")

    return Response(
        content=raw,
        media_type=row.get("mime_type") or "application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="nexryde-trip-{trip_id}.bin"'},
    )

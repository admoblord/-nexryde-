"""Admin Router - All admin panel and management endpoints for NEXRYDE."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, Dict, List, Any
from datetime import datetime, timezone, timedelta
from pathlib import Path
import asyncio
import hashlib
import hmac
import logging
import os
import re
import secrets
import uuid

ADMIN_DIR = Path(__file__).resolve().parent.parent / "admin"

from database import db, SUBSCRIPTION_CONFIG
from user_biometrics import get_user_biometrics, has_stored_face
from auth_guard import require_authenticated, verify_owner_strict
from route_cache import get_api_usage_summary
from admin_guard import require_admin_request
from pii_encryption import (
    license_storage_fields,
    mask_last4,
    nin_storage_fields,
    driver_nin_public_fields,
    public_license_fields,
    public_nin_fields,
    resolve_driver_nin_plaintext,
    resolve_license_plaintext,
    resolve_nin_plaintext,
    pii_search_hash,
    strip_sensitive_pii,
)
from pii_audit import log_pii_access
from security_advanced import auth_limiter

logger = logging.getLogger('server')
admin_router = APIRouter(prefix="/api", tags=["Admin"])

# ==================== ADMIN ENDPOINTS ====================

_admin_email = os.environ.get("ADMIN_EMAIL", "admin@admoblordgroup.com")
_admin_password = os.environ.get("ADMIN_PASSWORD")
if not _admin_password:
    # Never log the generated password — doing so leaks credentials into logs.
    # In production ADMIN_PASSWORD must be set in Secret Manager / env vars.
    _admin_password = secrets.token_urlsafe(24)
    _nexryde_env = os.environ.get("NEXRYDE_ENV", "production")
    if _nexryde_env == "production":
        # Fail loudly in production so the misconfiguration is caught immediately.
        import sys as _sys
        logger.error("ADMIN_PASSWORD is not set — refusing to start in production with a random credential")
        _sys.exit(1)
    else:
        logger.warning("ADMIN_PASSWORD not set; using a generated fallback for this %s run (set the env var)", _nexryde_env)
ADMIN_CREDENTIALS = {_admin_email: _admin_password}
ADMIN_SESSION_TTL_HOURS = int(os.environ.get("ADMIN_SESSION_TTL_HOURS", "72"))
ADMIN_REVOKE_OLD_SESSIONS = os.environ.get("ADMIN_REVOKE_OLD_SESSIONS", "true").lower() == "true"


def _is_production() -> bool:
    return os.environ.get("NEXRYDE_ENV", os.environ.get("ENVIRONMENT", "production")).strip().lower() == "production"


def _extract_admin_token(request: Request) -> str:
    auth_header = request.headers.get("authorization", "").strip()
    if auth_header.lower().startswith("bearer "):
        return auth_header[7:].strip()
    return (request.headers.get("x-admin-token") or "").strip()


async def _validate_admin_session(request: Request):
    raw_token = _extract_admin_token(request)
    if not raw_token:
        raise HTTPException(status_code=401, detail="Admin authentication required")

    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    now = datetime.now(timezone.utc)
    session = await db.admin_sessions.find_one(
        {
            "token_hash": token_hash,
            "revoked": {"$ne": True},
            "expires_at": {"$gt": now},
        },
        {"_id": 0, "email": 1, "role": 1},
    )
    if not session:
        raise HTTPException(status_code=401, detail="Invalid or expired admin session")

    request.state.admin_email = session.get("email")
    request.state.admin_role = session.get("role") or "super_admin"
    await db.admin_sessions.update_one(
        {"token_hash": token_hash},
        {"$set": {"last_seen_at": now}},
    )


async def require_admin_access(request: Request):
    """
    Enforce admin session token for admin-only routes.
    Public exception: /api/admin/login.
    """
    path = request.url.path
    if path == "/api/admin/login":
        return

    # Apply strict admin auth to all admin namespace actions.
    if not (path == "/api/admin" or path.startswith("/api/admin/") or path.startswith("/api/admin-panel")):
        return
    await _validate_admin_session(request)


admin_router.dependencies.append(Depends(require_admin_access))


async def _log_admin_action(
    request: Request,
    action: str,
    target_type: str = "",
    target_id: str = "",
    details: Optional[dict] = None,
) -> None:
    try:
        ip = request.client.host if request.client else ""
        await db.admin_audit_log.insert_one({
            "admin_email": getattr(request.state, "admin_email", None) or "admin",
            "admin_role": getattr(request.state, "admin_role", None) or "super_admin",
            "action": action,
            "target_type": target_type,
            "target_id": target_id,
            "details": details or {},
            "ip_address": ip,
            "user_agent": request.headers.get("user-agent", ""),
            "created_at": datetime.now(timezone.utc),
        })
    except Exception as exc:
        logger.warning("admin audit log failed: %s", exc)


def _require_admin_test_tools_enabled() -> None:
    if _is_production() and os.environ.get("ALLOW_ADMIN_TEST_UTILS", "false").lower() != "true":
        raise HTTPException(status_code=403, detail="Admin test utilities are disabled in production")

class AdminLoginRequest(BaseModel):
    email: str
    password: str


class PiiRevealRequest(BaseModel):
    reason: str


def _normalize_reveal_reason(reason: str) -> str:
    cleaned = (reason or "").strip()
    if len(cleaned) < 8:
        raise HTTPException(
            status_code=400,
            detail="A reason is required (minimum 8 characters), e.g. security incident #123",
        )
    return cleaned


def _sniff_document_content_type(raw: bytes, declared: str | None) -> str:
    """Prefer magic-byte sniff so admin <img> gets a browser-safe MIME."""
    declared_norm = (declared or "").split(";")[0].strip().lower()
    if declared_norm == "image/jpg":
        declared_norm = "image/jpeg"
    if raw.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if raw.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if raw.startswith(b"RIFF") and raw[8:12] == b"WEBP":
        return "image/webp"
    if raw.startswith(b"%PDF"):
        return "application/pdf"
    if declared_norm in ("image/jpeg", "image/png", "image/webp", "application/pdf"):
        return declared_norm
    return declared_norm or "application/octet-stream"


def _sanitize_rider_for_admin(rider: dict) -> dict:
    out = strip_sensitive_pii(rider)
    out.update(public_nin_fields(rider))
    return out


def _build_rider_search_filter(search: str) -> list[dict]:
    """Search riders without exposing or regex-matching encrypted NIN plaintext."""
    pat = {"$regex": search.strip(), "$options": "i"}
    clauses: list[dict] = [
        {"name": pat},
        {"phone": pat},
        {"email": pat},
        {"username": pat},
        {"referral_code": pat},
    ]
    digits = re.sub(r"\D", "", search.strip())
    if re.fullmatch(r"\d{11}", digits):
        clauses.append({"nin_hash": pii_search_hash(digits, prefix="nin")})
    elif re.fullmatch(r"\d{4}", digits):
        clauses.append({"nin_last4": digits})
    return clauses

@admin_router.post("/admin/login")
async def admin_login(request: AdminLoginRequest, http_request: Request):
    """Admin login endpoint"""
    client_ip = http_request.client.host if http_request.client else "unknown"
    email_key = request.email.strip().lower() or "unknown"
    await auth_limiter.check_rate_limit(http_request, f"admin_login_ip:{client_ip}")
    await auth_limiter.check_rate_limit(http_request, f"admin_login_email:{email_key}")
    expected_password = ADMIN_CREDENTIALS.get(email_key) or ADMIN_CREDENTIALS.get(request.email)
    if expected_password and hmac.compare_digest(expected_password, request.password):
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(hours=ADMIN_SESSION_TTL_HOURS)
        token = secrets.token_urlsafe(48)
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        if ADMIN_REVOKE_OLD_SESSIONS:
            await db.admin_sessions.update_many(
                {"email": email_key, "revoked": {"$ne": True}},
                {"$set": {"revoked": True, "revoked_at": now, "revocation_reason": "new_login"}},
            )
        await db.admin_sessions.insert_one(
            {
                "id": str(uuid.uuid4()),
                "email": email_key,
                "role": "super_admin",
                "token_hash": token_hash,
                "ip_address": client_ip,
                "user_agent": http_request.headers.get("user-agent", ""),
                "created_at": now,
                "last_seen_at": now,
                "expires_at": expires_at,
                "revoked": False,
            }
        )
        await db.admin_audit_log.insert_one({
            "admin_email": email_key,
            "admin_role": "super_admin",
            "action": "admin_login_success",
            "target_type": "admin_session",
            "target_id": token_hash[:12],
            "details": {"revoked_old_sessions": ADMIN_REVOKE_OLD_SESSIONS},
            "ip_address": client_ip,
            "user_agent": http_request.headers.get("user-agent", ""),
            "created_at": now,
        })
        return {
            "success": True,
            "token": token,
            "email": email_key,
            "role": "super_admin",
            "expires_at": expires_at.isoformat(),
        }
    await db.admin_audit_log.insert_one({
        "admin_email": email_key,
        "admin_role": "unknown",
        "action": "admin_login_failed",
        "target_type": "admin_login",
        "target_id": email_key,
        "details": {},
        "ip_address": client_ip,
        "user_agent": http_request.headers.get("user-agent", ""),
        "created_at": datetime.now(timezone.utc),
    })
    raise HTTPException(status_code=401, detail="Invalid credentials")


@admin_router.post("/admin/logout")
async def admin_logout(request: Request):
    token = _extract_admin_token(request)
    if not token:
        raise HTTPException(status_code=400, detail="Admin token is required")
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    await db.admin_sessions.update_one(
        {"token_hash": token_hash},
        {"$set": {"revoked": True, "revoked_at": datetime.now(timezone.utc)}},
    )
    await _log_admin_action(request, "admin_logout", "admin_session", token_hash[:12])
    return {"success": True, "message": "Admin session revoked"}

@admin_router.get("/admin/overview")
async def admin_overview():
    """Get dashboard overview stats"""
    total_riders = await db.users.count_documents({"role": "rider"})
    total_drivers = await db.users.count_documents({"role": "driver"})
    total_trips = await db.trips.count_documents({})
    completed_trips = await db.trips.count_documents({"status": "completed"})
    
    # Calculate revenue from completed trips
    revenue_pipeline = [
        {"$match": {"status": "completed"}},
        {"$group": {"_id": None, "total": {"$sum": "$fare"}}}
    ]
    revenue_result = await db.trips.aggregate(revenue_pipeline).to_list(1)
    total_revenue = revenue_result[0]["total"] if revenue_result else 0
    
    # Subscription revenue
    active_subs = await db.subscriptions.count_documents({"status": "active"})
    subscription_revenue = active_subs * SUBSCRIPTION_CONFIG["monthly_fee"]
    
    # Today's stats
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    today_trips = await db.trips.count_documents({"created_at": {"$gte": today_start}})
    today_signups = await db.users.count_documents({"created_at": {"$gte": today_start}})
    
    return {
        "total_riders": total_riders,
        "total_drivers": total_drivers,
        "total_trips": total_trips,
        "completed_trips": completed_trips,
        "total_revenue": total_revenue,
        "subscription_revenue": subscription_revenue,
        "active_subscriptions": active_subs,
        "today_trips": today_trips,
        "today_signups": today_signups
    }

@admin_router.get("/admin/riders")
async def admin_get_riders(limit: int = 200, skip: int = 0, search: str = ""):
    """Get all riders — single aggregation pipeline, no N+1 trip counts."""
    match_filter: dict = {"role": "rider"}
    if search and search.strip():
        match_filter["$or"] = _build_rider_search_filter(search)

    total = await db.users.count_documents(match_filter)

    pipeline = [
        {"$match": match_filter},
        {"$sort": {"created_at": -1}},
        {"$skip": skip},
        {"$limit": limit},
        {"$project": {
            "_id": 0,
            "face_image": 0,
            "profile_image": 0,
            "nin": 0,
            "nin_cipher": 0,
            "nin_hash": 0,
        }},
        {"$addFields": {
            "has_nin": {
                "$gt": [{"$strLenCP": {"$ifNull": ["$nin_last4", ""]}}, 0],
            },
            "has_face_image": {"$gt": [{"$strLenCP": {"$ifNull": ["$face_image", ""]}}, 0]},
        }},
        {"$lookup": {
            "from": "trips",
            "let": {"uid": "$id"},
            "pipeline": [
                {"$match": {"$expr": {"$eq": ["$rider_id", "$$uid"]}}},
                {"$count": "n"},
            ],
            "as": "_tc",
        }},
        {"$addFields": {
            "total_trips": {"$ifNull": [{"$arrayElemAt": ["$_tc.n", 0]}, 0]},
        }},
        {"$project": {"_tc": 0}},
    ]

    riders_raw = await db.users.aggregate(pipeline).to_list(limit)
    riders = [_sanitize_rider_for_admin(r) for r in riders_raw]
    return {"riders": riders, "total": total, "skip": skip, "page_size": limit}


@admin_router.get("/admin/riders/{rider_id}/identity")
async def admin_get_rider_identity(rider_id: str):
    """
    Rider identity photos + masked NIN for admin verification.
    Full NIN requires POST /admin/riders/{id}/reveal-nin with audit reason.
    """
    rider = await db.users.find_one(
        {"id": rider_id},
        {"_id": 0, "id": 1, "name": 1, "email": 1, "phone": 1,
         "nin_last4": 1, "nin_cipher": 1, "nin_hash": 1, "nin": 1,
         "profile_image": 1, "face_verified": 1,
         "nin_verified": 1, "nin_registry_verified": 1, "nin_verify_checked_at": 1, "nin_verify_method": 1,
         "face_liveness_score": 1,
         "address": 1, "gender": 1, "created_at": 1,
         "is_verified": 1, "suspended_until": 1, "blocked": 1,
         "referral_code": 1, "username": 1},
    )
    if not rider:
        raise HTTPException(status_code=404, detail="Rider not found")

    biometrics = await get_user_biometrics(rider_id)
    face_image = biometrics.get("face_image")
    nin_public = public_nin_fields(rider)

    return {
        "id":              rider.get("id"),
        "name":            rider.get("name"),
        "email":           rider.get("email"),
        "phone":           rider.get("phone"),
        "address":         rider.get("address"),
        "gender":          rider.get("gender"),
        "created_at":      rider.get("created_at"),
        "is_verified":     rider.get("is_verified"),
        "face_verified":   rider.get("face_verified"),
        "nin_verified":    rider.get("nin_verified"),
        "nin_registry_verified": rider.get("nin_registry_verified", False),
        "nin_verify_checked_at": rider.get("nin_verify_checked_at"),
        "nin_verify_method": rider.get("nin_verify_method", "nexryde" if rider.get("nin_verified") else None),
        **nin_public,
        "face_image":      face_image,
        "profile_image":   rider.get("profile_image"),
        "has_face_image":  bool(face_image),
        "face_capture_meta": biometrics.get("face_capture_meta"),
        "has_profile_image": bool(rider.get("profile_image")),
        "face_liveness_score": rider.get("face_liveness_score") or biometrics.get("face_liveness_score"),
        "suspended_until": rider.get("suspended_until"),
        "blocked":         rider.get("blocked", False),
        "referral_code":   rider.get("referral_code"),
        "username":        rider.get("username"),
    }


@admin_router.get("/admin/riders/{rider_id}")
async def admin_get_rider_profile(rider_id: str):
    """Full rider profile for admin panel drawer — enriched with wallet + trip stats."""
    rider = await db.users.find_one(
        {"id": rider_id, "role": "rider"},
        {"_id": 0, "face_image": 0, "profile_image": 0},
    )
    if not rider:
        raise HTTPException(status_code=404, detail="Rider not found")

    # Wallet
    wallet = await db.wallets.find_one({"user_id": rider_id}, {"_id": 0}) or {}
    wallet_balance = wallet.get("balance", rider.get("wallet_balance", 0))

    # Trip stats (aggregation: counts + total spend in one pass)
    stats_pipeline = [
        {"$match": {"rider_id": rider_id}},
        {"$group": {
            "_id": "$status",
            "count": {"$sum": 1},
            "spend": {"$sum": {"$cond": [{"$eq": ["$status", "completed"]}, "$fare", 0]}},
        }},
    ]
    stats_raw = await db.trips.aggregate(stats_pipeline).to_list(20)
    total_trips = sum(s["count"] for s in stats_raw)
    completed = next((s["count"] for s in stats_raw if s["_id"] == "completed"), 0)
    cancelled = next((s["count"] for s in stats_raw if s["_id"] == "cancelled"), 0)
    total_spend = sum(s["spend"] for s in stats_raw)

    # Recent trips (last 5)
    recent_trips = await db.trips.find(
        {"rider_id": rider_id},
        {"_id": 0, "id": 1, "status": 1, "fare": 1, "created_at": 1,
         "pickup_location": 1, "dropoff_location": 1, "driver_info": 1},
    ).sort("created_at", -1).limit(5).to_list(5)

    # Flag if images exist (heavy — don't include data in this endpoint)
    has_profile_image = bool(
        await db.users.find_one(
            {"id": rider_id, "profile_image": {"$exists": True, "$ne": None, "$ne": ""}},
            {"_id": 0, "id": 1},
        )
    )
    has_face_image = await has_stored_face(rider_id)
    nin_public = public_nin_fields(rider)
    rider_safe = strip_sensitive_pii(rider)
    rider_safe.update(nin_public)

    return {
        "rider": {
            **rider_safe,
            "face_verified":    rider.get("face_verified", False),
            "is_verified":      rider.get("is_verified", False),
        },
        "wallet_balance": wallet_balance,
        "stats": {
            "total_trips": total_trips,
            "completed_trips": completed,
            "cancelled_trips": cancelled,
            "total_spend": round(total_spend, 2),
        },
        "recent_trips": recent_trips,
        "has_profile_image": has_profile_image,
        "has_face_image": has_face_image,
    }


@admin_router.post("/admin/riders/{rider_id}/reveal-nin")
async def admin_reveal_rider_nin(
    rider_id: str,
    body: PiiRevealRequest,
    request: Request,
    admin_email: str = Depends(require_admin_request),
):
    """Reveal full rider NIN — requires admin auth, reason, and audit log entry."""
    reason = _normalize_reveal_reason(body.reason)
    rider = await db.users.find_one(
        {"id": rider_id, "role": "rider"},
        {"_id": 0, "id": 1, "name": 1, "nin_cipher": 1, "nin": 1},
    )
    if not rider:
        raise HTTPException(status_code=404, detail="Rider not found")

    plaintext = resolve_nin_plaintext(rider)
    if not plaintext:
        raise HTTPException(status_code=404, detail="No NIN on file for this rider")

    await log_pii_access(
        admin_email=admin_email,
        subject_user_id=rider_id,
        subject_role="rider",
        pii_type="nin",
        action="reveal",
        reason=reason,
        request=request,
        subject_name=rider.get("name"),
    )
    return {
        "nin": plaintext,
        "subject_user_id": rider_id,
        "subject_name": rider.get("name"),
        "revealed_at": datetime.now(timezone.utc).isoformat(),
    }


@admin_router.post("/admin/drivers/{driver_id}/reveal-nin")
async def admin_reveal_driver_nin(
    driver_id: str,
    body: PiiRevealRequest,
    request: Request,
    admin_email: str = Depends(require_admin_request),
):
    """Reveal full driver NIN — requires admin auth, reason, and audit log entry."""
    reason = _normalize_reveal_reason(body.reason)
    user = await db.users.find_one(
        {"id": driver_id, "role": "driver"},
        {"_id": 0, "id": 1, "name": 1, "nin_cipher": 1, "nin": 1},
    )
    if not user:
        raise HTTPException(status_code=404, detail="Driver not found")

    # Include nested documents.nin — modern uploads store nin_cipher there AND top-level.
    docs = await db.driver_documents.find_one(
        {"driver_id": driver_id},
        {
            "_id": 0,
            "nin_cipher": 1,
            "nin_number": 1,
            "nin_last4": 1,
            "documents.nin": 1,
        },
    ) or {}
    plaintext = resolve_driver_nin_plaintext(docs, user)
    if not plaintext:
        raise HTTPException(status_code=404, detail="No NIN on file for this driver")

    await log_pii_access(
        admin_email=admin_email,
        subject_user_id=driver_id,
        subject_role="driver",
        pii_type="nin",
        action="reveal",
        reason=reason,
        request=request,
        subject_name=user.get("name"),
    )
    return {
        "nin": plaintext,
        "subject_user_id": driver_id,
        "subject_name": user.get("name"),
        "revealed_at": datetime.now(timezone.utc).isoformat(),
    }


@admin_router.post("/admin/drivers/{driver_id}/reveal-license")
async def admin_reveal_driver_license(
    driver_id: str,
    body: PiiRevealRequest,
    request: Request,
    admin_email: str = Depends(require_admin_request),
):
    """Reveal driver license number when stored — requires admin auth, reason, and audit."""
    reason = _normalize_reveal_reason(body.reason)
    user = await db.users.find_one(
        {"id": driver_id, "role": "driver"},
        {"_id": 0, "id": 1, "name": 1},
    )
    if not user:
        raise HTTPException(status_code=404, detail="Driver not found")

    docs = await db.driver_documents.find_one(
        {"driver_id": driver_id},
        {"_id": 0, "license_number_cipher": 1, "license_number": 1},
    ) or {}
    profile = await db.driver_profiles.find_one(
        {"user_id": driver_id},
        {"_id": 0, "license_number_cipher": 1, "license_number": 1},
    ) or {}
    plaintext = resolve_license_plaintext(docs) or resolve_license_plaintext(profile)
    if not plaintext:
        raise HTTPException(status_code=404, detail="No license number on file for this driver")

    await log_pii_access(
        admin_email=admin_email,
        subject_user_id=driver_id,
        subject_role="driver",
        pii_type="drivers_license",
        action="reveal",
        reason=reason,
        request=request,
        subject_name=user.get("name"),
    )
    return {
        "license_number": plaintext,
        "subject_user_id": driver_id,
        "subject_name": user.get("name"),
        "revealed_at": datetime.now(timezone.utc).isoformat(),
    }


@admin_router.get("/admin/pii-access-log")
async def admin_get_pii_access_log(
    limit: int = 100,
    skip: int = 0,
    subject_user_id: str = "",
    pii_type: str = "",
):
    """NIN / government ID access audit trail for admin panel."""
    query: dict = {}
    if subject_user_id.strip():
        query["subject_user_id"] = subject_user_id.strip()
    if pii_type.strip():
        query["pii_type"] = pii_type.strip()

    total = await db.admin_pii_access_log.count_documents(query)
    rows = await db.admin_pii_access_log.find(
        query,
        {"_id": 0},
    ).sort("accessed_at", -1).skip(skip).limit(min(limit, 500)).to_list(min(limit, 500))
    return {"entries": rows, "total": total, "skip": skip, "page_size": limit}


@admin_router.get("/admin/drivers")
async def admin_get_drivers(limit: int = 100, skip: int = 0):
    """Get all drivers with their details"""
    drivers = await db.users.find(
        {"role": "driver"},
        {"_id": 0}
    ).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    # Enrich with profile and subscription data
    enriched_drivers = []
    for driver in drivers:
        profile = await db.driver_profiles.find_one({"user_id": driver["id"]}, {"_id": 0})
        docs_row = await db.driver_documents.find_one(
            {"driver_id": driver["id"]},
            {"_id": 0, "nin_hash": 1, "nin_last4": 1, "nin_capture_mode": 1, "nin_number": 1, "documents.nin": 1},
        ) or {}
        subscription = await db.subscriptions.find_one(
            {"driver_id": driver["id"]},
            {"_id": 0},
            sort=[("created_at", -1)]
        )
        
        driver_safe = strip_sensitive_pii(driver)
        driver_safe.update(driver_nin_public_fields(docs_row, driver, profile or {}))
        enriched_drivers.append({
            **driver_safe,
            "vehicle": {
                "make": profile.get("vehicle_type") if profile else None,
                "model": profile.get("vehicle_model") if profile else None,
                "plate": profile.get("vehicle_plate") if profile else None,
            } if profile else None,
            "subscription_status": subscription.get("status") if subscription else "none",
            "is_online": profile.get("is_online", False) if profile else False,
            "total_trips": await db.trips.count_documents({"driver_id": driver["id"]}),
            "blocked": driver.get("blocked", False)
        })
    
    return {"drivers": enriched_drivers, "total": len(enriched_drivers)}


# ==================== DRIVER DOCUMENTS ARCHIVE ====================

@admin_router.get("/admin/drivers/{driver_id}/full-profile")
async def admin_get_driver_full_profile(driver_id: str):
    """Get complete driver profile including all documents, guarantor, violations."""
    user = await db.users.find_one({"id": driver_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Driver not found")

    profile = await db.driver_profiles.find_one({"user_id": driver_id}, {"_id": 0}) or {}
    # Admin profile view lists document metadata only; the binary is fetched
    # on demand via /admin/drivers/{id}/document/{type}. Never load blobs here.
    docs = await db.driver_documents.find_one(
        {"driver_id": driver_id},
        {
            "_id": 0,
            "documents.data": 0,
            "nin_number": 0,
            "nin_cipher": 0,
            "license_number": 0,
            "license_number_cipher": 0,
        },
    ) or {}
    violations = await db.violations.find({"user_id": driver_id}).sort("created_at", -1).to_list(50)
    for v in violations:
        v["_id"] = str(v["_id"])
    trips_count = await db.trips.count_documents({"driver_id": driver_id, "status": "completed"})
    subscription = await db.subscriptions.find_one({"driver_id": driver_id, "status": {"$in": ["active", "trial", "grace_period"]}})

    doc_list = []
    for key, doc_data in (docs.get("documents") or {}).items():
        entry = {
            "document_type": key,
            "filename": doc_data.get("filename"),
            "content_type": doc_data.get("content_type"),
            "size_bytes": doc_data.get("size_bytes"),
            "uploaded_at": doc_data.get("uploaded_at"),
            "expiry_date": doc_data.get("expiry_date"),
            "capture_mode": doc_data.get("capture_mode"),
            "has_data": bool(doc_data.get("size_bytes") or doc_data.get("file_key") or doc_data.get("gcs_key")),
        }
        if key == "nin" and doc_data.get("capture_mode") == "number_only":
            entry["has_encrypted_nin"] = bool(doc_data.get("nin_cipher"))
        doc_list.append(entry)

    nin_public = public_nin_fields({**docs, **user})
    license_public = public_license_fields(docs)

    return {
        "driver": {
            "id": user.get("id"),
            "name": user.get("name"),
            "phone": user.get("phone"),
            "email": user.get("email"),
            "role": user.get("role"),
            "rating": user.get("rating"),
            "created_at": user.get("created_at"),
            "is_verified": user.get("is_verified"),
            "is_deactivated": user.get("is_deactivated", False),
            "suspended_until": user.get("suspended_until"),
        },
        "profile": {
            "full_name": profile.get("full_name"),
            "address": profile.get("address"),
            "city": profile.get("city"),
            "state": profile.get("state"),
            "state_of_origin": profile.get("state_of_origin"),
            "date_of_birth": profile.get("date_of_birth"),
            "emergency_contact": profile.get("emergency_contact"),
            "has_ac": profile.get("has_ac", False),
            "vehicle_type": profile.get("vehicle_type"),
            "vehicle_make": profile.get("vehicle_make"),
            "vehicle_model": profile.get("vehicle_model"),
            "vehicle_year": profile.get("vehicle_year"),
            "vehicle_plate": profile.get("vehicle_plate_number") or profile.get("vehicle_plate"),
            "vehicle_color": profile.get("vehicle_color"),
            "is_online": profile.get("is_online", False),
            "documents_verified": profile.get("documents_verified", False),
            "profile_completed": profile.get("profile_completed", False),
            "profile_completed_at": profile.get("profile_completed_at"),
            # verification_status: prefer profile copy, fall back to users record.
            "verification_status": profile.get("verification_status") or user.get("verification_status"),
        },
        "guarantor": profile.get("guarantor"),
        "bank_details": {
            "bank_name": profile.get("bank_name"),
            "account_number": profile.get("account_number"),
            "account_name": profile.get("account_name"),
        },
        "documents": {
            "total_submitted": len(doc_list),
            "submitted_at": docs.get("submitted_at"),
            "nin_capture_mode": docs.get("nin_capture_mode"),
            "nin_number_stored": nin_public.get("has_nin", False),
            **nin_public,
            **license_public,
            "items": doc_list,
        },
        "violations": {
            "total": len(violations),
            "records": violations,
        },
        "stats": {
            "completed_trips": trips_count,
            "subscription_active": subscription is not None,
            "subscription_status": subscription.get("status") if subscription else "none",
            "subscription_plan": subscription.get("tier") if subscription else None,
            "trial_trips_completed": (subscription or {}).get("trial_trips_completed", trips_count),
            "trial_trips_target": (subscription or {}).get("trial_trips_target", 15),
            "trial_active": (subscription or {}).get("trial_active", False),
        },
    }


@admin_router.get("/admin/drivers/{driver_id}/document/{doc_type}")
async def admin_get_driver_document(driver_id: str, doc_type: str):
    """Get a specific document file for a driver (returns base64 data)."""
    # Project only the requested document's metadata — never the whole archive.
    docs = await db.driver_documents.find_one(
        {"driver_id": driver_id}, {"_id": 0, f"documents.{doc_type}": 1}
    )
    if not docs:
        raise HTTPException(status_code=404, detail="No documents found for this driver")

    doc_data = (docs.get("documents") or {}).get(doc_type)
    if not doc_data:
        raise HTTPException(status_code=404, detail=f"Document '{doc_type}' not found")

    # NIN number-only has no image — admin should use Reveal NIN.
    if doc_type == "nin" and doc_data.get("capture_mode") == "number_only":
        raise HTTPException(
            status_code=400,
            detail="NIN is number-only on file. Use Reveal NIN (not View) on the Verification tab.",
        )

    # Binary now lives in private GCS; resolve bytes by key (legacy inline fallback).
    import base64 as _b64
    from driver_doc_storage import fetch_document_binary
    raw = await fetch_document_binary(driver_id, doc_type, doc_data)
    if raw is None:
        storage = doc_data.get("storage") or ("gcs" if doc_data.get("gcs_key") or doc_data.get("file_key") else "unknown")
        raise HTTPException(
            status_code=404,
            detail=(
                f"Document '{doc_type}' metadata exists but binary is unavailable "
                f"(storage={storage}). Check GCS_MEDIA_BUCKET / object access, or ask the driver to re-upload."
            ),
        )
    content_type = _sniff_document_content_type(raw, doc_data.get("content_type"))
    data_b64 = _b64.b64encode(raw).decode("ascii")

    return {
        "driver_id": driver_id,
        "document_type": doc_type,
        "filename": doc_data.get("filename"),
        "content_type": content_type,
        "size_bytes": doc_data.get("size_bytes") or len(raw),
        "uploaded_at": doc_data.get("uploaded_at"),
        "expiry_date": doc_data.get("expiry_date"),
        "data": data_b64,
    }


@admin_router.get("/admin/documents/all")
async def admin_get_all_driver_documents(limit: int = 50, skip: int = 0):
    """Get document submission overview for all drivers."""
    doc_records = await db.driver_documents.find(
        {}, {"_id": 0, "documents.data": 0}
    ).sort("submitted_at", -1).skip(skip).limit(limit).to_list(limit)

    result = []
    for record in doc_records:
        driver_id = record.get("driver_id")
        user = await db.users.find_one({"id": driver_id}, {"_id": 0, "name": 1, "phone": 1})
        doc_summary = []
        for key, doc in (record.get("documents") or {}).items():
            doc_summary.append({
                "type": key,
                "uploaded_at": doc.get("uploaded_at"),
                "expiry_date": doc.get("expiry_date"),
                "size_bytes": doc.get("size_bytes"),
                "capture_mode": doc.get("capture_mode"),
            })
        result.append({
            "driver_id": driver_id,
            "driver_name": (user or {}).get("name", "Unknown"),
            "driver_phone": (user or {}).get("phone", "N/A"),
            "submitted_at": record.get("submitted_at"),
            "document_count": record.get("document_count", len(doc_summary)),
            "documents": doc_summary,
        })

    total = await db.driver_documents.count_documents({})
    return {"drivers": result, "total": total}


@admin_router.get("/admin/documents/expiring")
async def admin_get_expiring_documents(days: int = 30):
    """Get documents expiring within the next N days for compliance tracking."""
    from dateutil.relativedelta import relativedelta
    cutoff = (datetime.now(timezone.utc) + timedelta(days=days)).strftime("%m/%Y")
    
    all_docs = await db.driver_documents.find({}, {"_id": 0, "documents.data": 0}).to_list(500)
    expiring = []
    
    for record in all_docs:
        driver_id = record.get("driver_id")
        for key, doc in (record.get("documents") or {}).items():
            exp = doc.get("expiry_date")
            if exp and exp <= cutoff:
                user = await db.users.find_one({"id": driver_id}, {"_id": 0, "name": 1, "phone": 1})
                expiring.append({
                    "driver_id": driver_id,
                    "driver_name": (user or {}).get("name", "Unknown"),
                    "driver_phone": (user or {}).get("phone"),
                    "document_type": key,
                    "expiry_date": exp,
                })
    
    expiring.sort(key=lambda x: x.get("expiry_date", ""))
    return {"expiring_documents": expiring, "total": len(expiring), "within_days": days}


@admin_router.get("/admin/trips")
async def admin_get_trips(limit: int = 100, skip: int = 0, status: str = None):
    """Get all trips with details"""
    query = {}
    if status:
        query["status"] = status
    
    trips = await db.trips.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    # Enrich with user names
    enriched_trips = []
    for trip in trips:
        rider = await db.users.find_one({"id": trip.get("rider_id")}, {"name": 1, "_id": 0})
        driver = await db.users.find_one({"id": trip.get("driver_id")}, {"name": 1, "_id": 0}) if trip.get("driver_id") else None
        
        enriched_trips.append({
            **trip,
            "rider_name": rider.get("name") if rider else "Unknown",
            "driver_name": driver.get("name") if driver else None,
            "pickup": {"address": trip.get("pickup_location", {}).get("address", "N/A")},
            "dropoff": {"address": trip.get("dropoff_location", {}).get("address", "N/A")}
        })
    
    return {"trips": enriched_trips, "total": len(enriched_trips)}

@admin_router.get("/admin/payments")
async def admin_get_payments(limit: int = 100, skip: int = 0):
    """Get subscription payments"""
    subscriptions = await db.subscriptions.find(
        {},
        {"_id": 0}
    ).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    # Enrich with driver names
    payments = []
    approved_count = 0
    pending_count = 0
    total_revenue = 0
    
    for sub in subscriptions:
        driver = await db.users.find_one({"id": sub.get("driver_id")}, {"name": 1, "_id": 0})
        
        status = "approved" if sub.get("status") == "active" else sub.get("status", "pending")
        if status == "approved" or status == "active":
            approved_count += 1
            total_revenue += sub.get("amount", SUBSCRIPTION_CONFIG["monthly_fee"])
        elif status in ["pending", "pending_verification"]:
            pending_count += 1
        
        payments.append({
            "id": sub.get("id"),
            "driver_id": sub.get("driver_id"),
            "driver_name": driver.get("name") if driver else "Unknown",
            "amount": sub.get("amount", SUBSCRIPTION_CONFIG["monthly_fee"]),
            "status": status,
            "screenshot": sub.get("payment_screenshot"),
            "created_at": sub.get("created_at", datetime.utcnow()).isoformat() if isinstance(sub.get("created_at"), datetime) else sub.get("created_at"),
            "payment_submitted_at": sub.get("payment_submitted_at"),
            "auto_approved": sub.get("auto_approved", False)
        })
    
    return {
        "payments": payments,
        "approved_count": approved_count,
        "pending_count": pending_count,
        "total_revenue": total_revenue
    }

@admin_router.post("/admin/subscriptions/{subscription_id}/approve")
async def admin_approve_subscription(subscription_id: str, request: Request):
    """Manually approve a subscription payment"""
    result = await db.subscriptions.update_one(
        {"id": subscription_id},
        {"$set": {
            "status": "active",
            "payment_verified_at": datetime.utcnow(),
            "end_date": datetime.utcnow() + timedelta(days=30)
        }}
    )
    
    if result.modified_count > 0:
        await _log_admin_action(request, "subscription_approved", "subscription", subscription_id)
        return {"success": True, "message": "Subscription approved"}
    return {"success": False, "message": "Subscription not found"}

@admin_router.post("/admin/subscriptions/{subscription_id}/reject")
async def admin_reject_subscription(subscription_id: str, request: Request, reason: str = "Payment verification failed"):
    """Reject a subscription payment"""
    result = await db.subscriptions.update_one(
        {"id": subscription_id},
        {"$set": {
            "status": "rejected",
            "rejection_reason": reason,
            "payment_verified_at": datetime.utcnow()
        }}
    )
    
    if result.modified_count > 0:
        await _log_admin_action(request, "subscription_rejected", "subscription", subscription_id, {"reason": reason})
        return {"success": True, "message": "Subscription rejected"}
    return {"success": False, "message": "Subscription not found"}

@admin_router.post("/admin/users/{user_id}/block")
async def admin_block_user(user_id: str, request: Request, block: bool = True):
    """Block or unblock a user"""
    result = await db.users.update_one(
        {"id": user_id},
        {"$set": {"blocked": block}}
    )
    
    if result.modified_count > 0:
        await _log_admin_action(request, "user_blocked" if block else "user_unblocked", "user", user_id)
        return {"success": True, "message": f"User {'blocked' if block else 'unblocked'}"}
    return {"success": False, "message": "User not found"}

@admin_router.get("/admin/promos")
async def admin_get_promos():
    """Get all promo codes"""
    promos = await db.promo_codes.find({}, {"_id": 0}).to_list(100)
    return {"promos": promos}

@admin_router.post("/admin/promo/create")
async def create_promo_code(code: str, discount_percent: int = 10, max_uses: int = 1000):
    """Create a new promo code"""
    promo = {
        "code": code.upper(),
        "discount_percent": discount_percent,
        "max_uses": max_uses,
        "active": True,
        "used_by": [],
        "created_at": datetime.utcnow()
    }
    await db.promo_codes.update_one(
        {"code": code.upper()},
        {"$set": promo},
        upsert=True
    )
    return {"success": True, "code": code.upper(), "discount_percent": discount_percent}

@admin_router.post("/admin/promo/{code}/toggle")
async def admin_toggle_promo(code: str):
    """Toggle promo code active status"""
    promo = await db.promo_codes.find_one({"code": code.upper()})
    if promo:
        new_status = not promo.get("active", True)
        await db.promo_codes.update_one(
            {"code": code.upper()},
            {"$set": {"active": new_status}}
        )
        return {"success": True, "active": new_status}
    return {"success": False, "message": "Promo code not found"}


# ============================================================================
# ADMIN PRICING CONTROL ENDPOINTS (NEXRYDE DYNAMIC PRICING)
# ============================================================================

@admin_router.get("/admin/pricing/current")
async def admin_get_current_pricing():
    """Get current subscription pricing configuration"""
    config = await db.system_config.find_one({"key": "subscription_pricing"})
    
    if not config:
        # Return default configuration
        return {
            "current_phase": "early",
            "current_price": 18000,
            "launch_drivers_count": 0,
            "launch_driver_limit": 500,
            "phase_prices": {
                "launch": 15000,
                "early": 18000,
                "growth": 18000,
                "premium": 18000
            },
            "trial_duration_hours": 24,
            "trial_trip_limit": 3,
            "phase_start_date": datetime.utcnow().isoformat()
        }
    
    config.pop("_id", None)
    return config

@admin_router.post("/admin/pricing/set-phase")
async def admin_set_pricing_phase(request: Dict[str, Any]):
    """
    Change the current subscription phase
    Body: {"phase": "launch|early|growth|premium"}
    """
    phase = request.get("phase")
    valid_phases = ["launch", "early", "growth", "premium"]
    
    if phase not in valid_phases:
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid phase. Must be one of: {', '.join(valid_phases)}"
        )
    
    # Map phase to price
    phase_prices = {
        "launch": 15000,
        "early": 18000,
        "growth": 18000,
        "premium": 18000
    }
    
    new_price = phase_prices[phase]
    
    # Update system configuration
    await db.system_config.update_one(
        {"key": "subscription_pricing"},
        {
            "$set": {
                "current_phase": phase,
                "current_price": new_price,
                "phase_start_date": datetime.utcnow(),
                "updated_at": datetime.utcnow()
            }
        },
        upsert=True
    )
    
    # Log activity
    await db.admin_activity.insert_one({
        "action": "pricing_phase_changed",
        "old_phase": request.get("old_phase"),
        "new_phase": phase,
        "new_price": new_price,
        "timestamp": datetime.utcnow(),
        "admin_note": f"Pricing phase changed to {phase.upper()} (₦{new_price:,})"
    })
    
    return {
        "success": True,
        "message": f"Pricing phase updated to {phase.upper()}",
        "current_phase": phase,
        "current_price": new_price,
        "phase_prices": phase_prices
    }

@admin_router.post("/admin/pricing/update-price")
async def admin_update_phase_price(request: Dict[str, Any]):
    """
    Update price for a specific phase
    Body: {"phase": "launch", "new_price": 15000}
    """
    phase = request.get("phase")
    new_price = request.get("new_price")
    
    valid_phases = ["launch", "early", "growth", "premium"]
    
    if phase not in valid_phases:
        raise HTTPException(status_code=400, detail="Invalid phase")
    
    if not isinstance(new_price, int) or new_price < 5000 or new_price > 50000:
        raise HTTPException(
            status_code=400, 
            detail="Price must be between ₦5,000 and ₦50,000"
        )
    
    # Update the phase price in system config
    config = await db.system_config.find_one({"key": "subscription_pricing"})
    
    if config:
        phase_prices = config.get("phase_prices", {})
        phase_prices[phase] = new_price
        
        await db.system_config.update_one(
            {"key": "subscription_pricing"},
            {
                "$set": {
                    f"phase_prices.{phase}": new_price,
                    "updated_at": datetime.utcnow()
                }
            }
        )
        
        # If updating current phase, also update current_price
        if config.get("current_phase") == phase:
            await db.system_config.update_one(
                {"key": "subscription_pricing"},
                {"$set": {"current_price": new_price}}
            )
    
    # Log activity
    await db.admin_activity.insert_one({
        "action": "phase_price_updated",
        "phase": phase,
        "new_price": new_price,
        "timestamp": datetime.utcnow(),
        "admin_note": f"{phase.upper()} phase price updated to ₦{new_price:,}"
    })
    
    return {
        "success": True,
        "message": f"{phase.upper()} phase price updated to ₦{new_price:,}",
        "phase": phase,
        "new_price": new_price
    }

@admin_router.get("/admin/pricing/usage-stats")
async def admin_get_pricing_usage_stats():
    """Get statistics on map and SMS usage for cost monitoring"""
    # Map usage stats
    map_usage_today = await db.map_usage.count_documents({
        "timestamp": {"$gte": datetime.utcnow().replace(hour=0, minute=0, second=0)}
    })
    
    # SMS/OTP usage stats
    otp_usage_today = await db.otp_records.count_documents({
        "created_at": {"$gte": datetime.utcnow().replace(hour=0, minute=0, second=0)}
    })
    
    # Get top drivers by map usage
    pipeline = [
        {
            "$match": {
                "timestamp": {"$gte": datetime.utcnow() - timedelta(days=7)}
            }
        },
        {
            "$group": {
                "_id": "$driver_id",
                "total_requests": {"$sum": 1}
            }
        },
        {
            "$sort": {"total_requests": -1}
        },
        {
            "$limit": 10
        }
    ]
    
    top_map_users = await db.map_usage.aggregate(pipeline).to_list(10)
    
    return {
        "map_usage": {
            "today": map_usage_today,
            "estimated_cost_today": map_usage_today * 0.005,  # $0.005 per request estimate
            "top_users_7days": top_map_users
        },
        "otp_usage": {
            "today": otp_usage_today,
            "estimated_cost_today": otp_usage_today * 0.05,  # $0.05 per SMS estimate
        },
        "total_estimated_cost_today": (map_usage_today * 0.005) + (otp_usage_today * 0.05)
    }

@admin_router.post("/admin/pricing/set-driver-limit")
async def admin_set_driver_limit(request: Dict[str, Any]):
    """
    Set maximum driver limit for launch phase
    Body: {"limit": 500}
    """
    limit = request.get("limit")
    
    if not isinstance(limit, int) or limit < 0 or limit > 10000:
        raise HTTPException(
            status_code=400,
            detail="Limit must be between 0 and 10,000"
        )
    
    await db.system_config.update_one(
        {"key": "subscription_pricing"},
        {
            "$set": {
                "launch_driver_limit": limit,
                "updated_at": datetime.utcnow()
            }
        },
        upsert=True
    )
    
    return {
        "success": True,
        "message": f"Launch phase driver limit set to {limit}",
        "launch_driver_limit": limit
    }

@admin_router.get("/admin/sos-alerts")
async def admin_get_sos_alerts():
    """Get all SOS alerts"""
    alerts = await db.sos_alerts.find({}, {"_id": 0}).sort("triggered_at", -1).to_list(100)
    return {"alerts": alerts}

# Serve admin panel via /api/admin-panel for external access through ingress
@admin_router.get("/admin-panel")
async def serve_admin_via_api():
    """Serve admin panel via API route"""
    spa_file = ADMIN_DIR / "dist" / "index.html"
    legacy_file = ADMIN_DIR / "index.legacy.html"
    fallback_file = ADMIN_DIR / "index.html"
    admin_file = spa_file if spa_file.exists() else (legacy_file if legacy_file.exists() else fallback_file)
    if admin_file.exists():
        return FileResponse(admin_file, media_type="text/html")
    raise HTTPException(status_code=404, detail="Admin panel not found")

@admin_router.get("/admin/activity-log")
async def admin_get_activity_log(limit: int = 50):
    """Get recent app activity"""
    # Get recent trips
    recent_trips = await db.trips.find(
        {},
        {"_id": 0, "id": 1, "status": 1, "created_at": 1, "rider_id": 1}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    
    # Get recent subscriptions
    recent_subs = await db.subscriptions.find(
        {},
        {"_id": 0, "id": 1, "status": 1, "created_at": 1, "driver_id": 1}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    
    # Combine and sort
    activities = []
    for trip in recent_trips:
        activities.append({
            "type": "trip",
            "action": f"Trip {trip.get('status', 'created')}",
            "user_id": trip.get("rider_id"),
            "timestamp": trip.get("created_at"),
            "details": {"trip_id": trip.get("id")}
        })
    
    for sub in recent_subs:
        activities.append({
            "type": "subscription",
            "action": f"Subscription {sub.get('status', 'created')}",
            "user_id": sub.get("driver_id"),
            "timestamp": sub.get("created_at"),
            "details": {"subscription_id": sub.get("id")}
        })
    
    # Sort by timestamp
    activities.sort(key=lambda x: x.get("timestamp", datetime.min), reverse=True)
    
    return {"activities": activities[:limit]}



# ============================================================================
# PERFORMANCE REWARDS SYSTEM ENDPOINTS
# ============================================================================

from performance_rewards import PerformanceRewardsManager

@admin_router.get("/admin/rewards/top-drivers")
async def admin_get_top_drivers(period: str = "monthly", limit: int = 10):
    """Get top performing drivers for rewards"""
    rewards_manager = PerformanceRewardsManager(db)
    
    if period == "monthly":
        top_drivers = await rewards_manager.get_top_drivers_monthly(limit=limit)
    else:
        top_drivers = await rewards_manager.get_top_drivers_monthly(limit=limit)
    
    return {
        "period": period,
        "top_drivers": top_drivers,
        "total_qualified": len(top_drivers)
    }

@admin_router.post("/admin/rewards/grant-free-month")
async def admin_grant_free_month(request: Dict[str, Any]):
    """Manually grant free month to a driver"""
    driver_id = request.get("driver_id")
    reason = request.get("reason", "admin_grant")
    
    if not driver_id:
        raise HTTPException(status_code=400, detail="driver_id required")
    
    rewards_manager = PerformanceRewardsManager(db)
    result = await rewards_manager.grant_free_month(driver_id, reason=reason)
    
    return result

@admin_router.post("/admin/rewards/process-monthly")
async def admin_process_monthly_rewards():
    """Process monthly performance rewards (top 10 drivers)"""
    rewards_manager = PerformanceRewardsManager(db)
    result = await rewards_manager.process_monthly_rewards()
    
    return result

@admin_router.get("/drivers/{driver_id}/rewards")
async def get_driver_rewards(driver_id: str, request: Request):
    """Get driver's reward history"""
    verify_owner_strict(request, driver_id)
    rewards = await db.rewards_log.find({"driver_id": driver_id}).sort("granted_at", -1).to_list(100)
    
    for reward in rewards:
        reward.pop("_id", None)
    
    return {
        "driver_id": driver_id,
        "total_rewards": len(rewards),
        "rewards": rewards
    }

# ============================================================================
# TRIAL ABUSE PREVENTION ENDPOINTS
# ============================================================================

from trial_abuse_prevention import TrialAbuseDetector, validate_trial_eligibility

@admin_router.post("/auth/validate-trial-eligibility")
async def validate_trial(request: Dict[str, Any]):
    """
    Validate if user is eligible for trial
    Prevents abuse by checking phone, NIN, license, device
    """
    phone = request.get("phone")
    nin = request.get("nin")
    license_number = request.get("license_number")
    device_id = request.get("device_id")
    ip_address = request.get("ip_address")
    
    if not phone:
        raise HTTPException(status_code=400, detail="Phone number required")
    
    detector = TrialAbuseDetector(db)
    is_allowed, reason, checks = await detector.comprehensive_trial_check(
        phone=phone,
        nin=nin,
        license_number=license_number,
        device_id=device_id,
        ip_address=ip_address
    )
    
    return {
        "eligible": is_allowed,
        "reason": reason,
        "checks": checks
    }

@admin_router.get("/admin/abuse-prevention/stats")
async def admin_get_abuse_stats():
    """Get trial abuse prevention statistics"""
    detector = TrialAbuseDetector(db)
    stats = await detector.get_abuse_statistics()
    
    return stats

@admin_router.post("/admin/abuse-prevention/blacklist")
async def admin_blacklist_phone(request: Dict[str, Any]):
    """Manually blacklist a phone number"""
    phone = request.get("phone")
    reason = request.get("reason", "admin_blacklist")
    
    if not phone:
        raise HTTPException(status_code=400, detail="Phone number required")
    
    detector = TrialAbuseDetector(db)
    await detector.blacklist_phone(phone, reason=reason)
    
    return {
        "success": True,
        "message": f"Phone {phone} has been blacklisted"
    }

@admin_router.get("/admin/abuse-prevention/blacklist")
async def admin_get_blacklist(limit: int = 100):
    """Get blacklisted phone numbers"""
    blacklist = await db.trial_blacklist.find({"status": "active"}).sort("blacklisted_at", -1).to_list(limit)
    
    for entry in blacklist:
        entry.pop("_id", None)
    
    return {
        "total": len(blacklist),
        "blacklist": blacklist
    }

# ============================================================================
# DRIVER REPORT SYSTEM ENDPOINTS
# ============================================================================

from driver_report_system import DriverReportSystem, ReportCategory, ReportSeverity

@admin_router.post("/reports/submit")
async def submit_driver_report(request: Dict[str, Any], http_request: Request):
    """
    Submit a report against a driver
    Available to riders only
    """
    rider_id = request.get("rider_id")
    driver_id = request.get("driver_id")
    trip_id = request.get("trip_id")
    category = request.get("category")
    description = request.get("description", "")
    evidence_urls = request.get("evidence_urls", [])
    
    # Validate required fields
    if not all([rider_id, driver_id, trip_id, category]):
        raise HTTPException(
            status_code=400,
            detail="rider_id, driver_id, trip_id, and category are required"
        )
    
    # Validate category
    valid_categories = [c.value for c in ReportCategory]
    if category not in valid_categories:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid category. Must be one of: {', '.join(valid_categories)}"
        )
    
    actor_id = require_authenticated(http_request)
    if actor_id != rider_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    report_system = DriverReportSystem(db)
    result = await report_system.submit_report(
        rider_id=rider_id,
        driver_id=driver_id,
        trip_id=trip_id,
        category=category,
        description=description,
        evidence_urls=evidence_urls
    )
    
    return result

@admin_router.get("/reports/driver/{driver_id}")
async def get_driver_reports(driver_id: str, request: Request, include_resolved: bool = False):
    """Get all reports for a specific driver"""
    verify_owner_strict(request, driver_id)
    report_system = DriverReportSystem(db)
    reports = await report_system.get_driver_reports(driver_id, include_resolved=include_resolved)
    
    return {
        "driver_id": driver_id,
        "total_reports": len(reports),
        "reports": reports
    }

@admin_router.get("/reports/driver/{driver_id}/statistics")
async def get_driver_report_statistics(driver_id: str, request: Request):
    """Get report statistics for a driver"""
    verify_owner_strict(request, driver_id)
    report_system = DriverReportSystem(db)
    stats = await report_system.get_report_statistics(driver_id)
    
    return stats

@admin_router.get("/admin/reports/all")
async def admin_get_all_reports(
    status: Optional[str] = None,
    severity: Optional[str] = None,
    limit: int = 100
):
    """Get all driver reports (admin only)"""
    query = {}
    
    if status:
        query["status"] = status
    
    if severity:
        query["severity"] = severity
    
    reports = await db.driver_reports.find(query).sort("created_at", -1).to_list(limit)
    
    for report in reports:
        report.pop("_id", None)
    
    return {
        "total": len(reports),
        "reports": reports
    }

@admin_router.post("/admin/reports/{report_id}/resolve")
async def admin_resolve_report(report_id: str, request: Dict[str, Any]):
    """Resolve a driver report (admin only)"""
    resolution_notes = request.get("resolution_notes", "")
    action_taken = request.get("action_taken", "none")
    
    result = await db.driver_reports.update_one(
        {"report_id": report_id},
        {
            "$set": {
                "status": "resolved",
                "resolution_notes": resolution_notes,
                "action_taken": action_taken,
                "resolved_at": datetime.utcnow(),
                "reviewed_by": "admin",
                "updated_at": datetime.utcnow()
            }
        }
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Report not found")
    
    return {
        "success": True,
        "message": "Report resolved successfully",
        "report_id": report_id
    }

@admin_router.get("/admin/reports/categories")
async def get_report_categories():
    """Get available report categories"""
    categories = [
        {
            "value": cat.value,
            "label": cat.value.replace('_', ' ').title(),
            "severity": CATEGORY_SEVERITY_MAP.get(cat, ReportSeverity.MEDIUM).value
        }
        for cat in ReportCategory
    ]
    
    return {"categories": categories}

# ==================== VEHICLE REGISTRATION ENDPOINT ====================

class VehicleRegistrationRequest(BaseModel):
    """Request model for driver vehicle registration"""
    make: str
    model: str
    year: int
    color: str
    plate_number: str
    category: str  # economy, comfort, premium, xl

# Vehicle category requirements - Updated to be more inclusive
VEHICLE_CATEGORY_REQUIREMENTS = {
    "economy": {
        "name": "Economy",
        "min_year": 2005,  # Accept older vehicles
        "luxury_only": False,
        "earnings_per_km": 150,
    },
    "comfort": {
        "name": "Comfort",
        "min_year": 2015,  # Lowered from 2018
        "luxury_only": False,
        "earnings_per_km": 200,
    },
    "premium": {
        "name": "Premium",
        "min_year": 2020,
        "luxury_only": True,
        "luxury_brands": ["mercedes", "bmw", "lexus", "audi", "porsche", "range rover", "jaguar", "bentley", "rolls royce"],
        "earnings_per_km": 350,
    },
    "xl": {
        "name": "SUV / XL",
        "min_year": 2015,  # Lowered from 2017
        "luxury_only": False,
        "earnings_per_km": 250,
    },
}

@admin_router.post("/drivers/{driver_id}/vehicle")
async def register_driver_vehicle(driver_id: str, request: VehicleRegistrationRequest, http_request: Request):
    """Register or update driver's vehicle with category validation"""
    verify_owner_strict(http_request, driver_id)
    
    # Verify driver exists
    user = await db.users.find_one({"id": driver_id})
    if not user:
        raise HTTPException(status_code=404, detail="Driver not found")
    
    if user.get("role") != "driver":
        raise HTTPException(status_code=400, detail="User is not a driver")
    
    # Validate category
    category_lower = request.category.lower()
    if category_lower not in VEHICLE_CATEGORY_REQUIREMENTS:
        raise HTTPException(status_code=400, detail=f"Invalid category. Must be one of: {', '.join(VEHICLE_CATEGORY_REQUIREMENTS.keys())}")
    
    category_reqs = VEHICLE_CATEGORY_REQUIREMENTS[category_lower]
    current_year = datetime.utcnow().year
    
    # Validate year
    if request.year < category_reqs["min_year"]:
        raise HTTPException(
            status_code=400, 
            detail=f"Vehicle too old for {category_reqs['name']} category. Must be {category_reqs['min_year']} or newer."
        )
    
    if request.year > current_year + 1:
        raise HTTPException(status_code=400, detail="Invalid vehicle year")
    
    # Validate luxury brand for premium category
    if category_reqs.get("luxury_only"):
        make_lower = request.make.lower()
        is_luxury = any(brand in make_lower for brand in category_reqs.get("luxury_brands", []))
        if not is_luxury:
            raise HTTPException(
                status_code=400,
                detail=f"Premium category requires a luxury brand (Mercedes, BMW, Lexus, Audi, etc.). Your {request.make} does not qualify."
            )
    
    # Create vehicle registration record
    vehicle_data = {
        "make": request.make.strip(),
        "model": request.model.strip(),
        "year": request.year,
        "color": request.color.strip(),
        "plate_number": request.plate_number.strip().upper(),
        "category": category_lower,
        "category_name": category_reqs["name"],
        "earnings_per_km": category_reqs["earnings_per_km"],
        "status": "pending_verification",  # pending_verification, verified, rejected
        "registered_at": datetime.utcnow(),
        "verified_at": None,
        "rejection_reason": None,
    }
    
    # Update driver profile
    await db.driver_profiles.update_one(
        {"user_id": driver_id},
        {
            "$set": {
                "vehicle_type": category_lower,
                "vehicle_model": f"{request.make} {request.model}",
                "vehicle_plate": request.plate_number.strip().upper(),
                "vehicle_color": request.color.strip(),
                "vehicle_year": request.year,
                "vehicle": vehicle_data,
            }
        },
        upsert=True
    )
    
    # Also store in vehicle_registrations collection for admin tracking
    registration_record = {
        "id": str(uuid.uuid4()),
        "driver_id": driver_id,
        "driver_name": user.get("name", "Unknown"),
        "driver_phone": user.get("phone", ""),
        **vehicle_data,
        "created_at": datetime.utcnow(),
    }
    await db.vehicle_registrations.insert_one(registration_record)
    
    logger.info(f"✅ Vehicle registered for driver {driver_id}: {request.make} {request.model} ({category_lower})")
    
    return {
        "success": True,
        "message": f"Vehicle registered successfully in {category_reqs['name']} category",
        "vehicle": vehicle_data,
        "status": "pending_verification",
        "note": "Our team will verify your vehicle within 24-48 hours."
    }

@admin_router.get("/drivers/{driver_id}/vehicle")
async def get_driver_vehicle(driver_id: str, request: Request):
    """Get driver's registered vehicle"""
    verify_owner_strict(request, driver_id)
    profile = await db.driver_profiles.find_one({"user_id": driver_id})
    
    if not profile or not profile.get("vehicle"):
        return {
            "has_vehicle": False,
            "message": "No vehicle registered"
        }
    
    return {
        "has_vehicle": True,
        "vehicle": profile.get("vehicle")
    }

@admin_router.get("/admin/vehicle-registrations")
async def get_pending_vehicle_registrations(status: str = None):
    """Admin: Get vehicle registrations (optionally filtered by status)"""
    query = {}
    if status:
        query["status"] = status
    
    registrations = await db.vehicle_registrations.find(query).sort("created_at", -1).to_list(100)
    
    for reg in registrations:
        reg.pop("_id", None)
    
    return {
        "registrations": registrations,
        "total": len(registrations)
    }

@admin_router.put("/admin/vehicle-registrations/{registration_id}/verify")
async def verify_vehicle_registration(
    registration_id: str,
    request: Request,
    approved: bool = True,
    rejection_reason: str = None,
):
    """Admin: Verify or reject a vehicle registration"""
    registration = await db.vehicle_registrations.find_one({"id": registration_id})
    
    if not registration:
        raise HTTPException(status_code=404, detail="Registration not found")
    
    new_status = "verified" if approved else "rejected"
    
    update_data = {
        "status": new_status,
        "verified_at": datetime.utcnow() if approved else None,
        "rejection_reason": rejection_reason if not approved else None,
    }
    
    # Update registration record
    await db.vehicle_registrations.update_one(
        {"id": registration_id},
        {"$set": update_data}
    )
    
    # Update driver profile
    driver_id = registration.get("driver_id")
    if driver_id:
        await db.driver_profiles.update_one(
            {"user_id": driver_id},
            {"$set": {
                "vehicle.status": new_status,
                "vehicle.verified_at": update_data["verified_at"],
                "vehicle.rejection_reason": update_data["rejection_reason"],
            }}
        )
        
        # Send notification to driver
        user = await db.users.find_one({"id": driver_id})
        if user:
            if approved:
                message = f"🎉 Great news! Your {registration.get('make')} {registration.get('model')} has been verified for {registration.get('category_name')} rides. You can now start accepting trips!"
            else:
                message = f"Your vehicle registration was not approved. Reason: {rejection_reason or 'Did not meet category requirements'}. Please update your vehicle details."
            
            # Store notification
            await db.notifications.insert_one({
                "id": str(uuid.uuid4()),
                "user_id": driver_id,
                "type": "vehicle_verification",
                "title": "Vehicle Verification " + ("Approved ✅" if approved else "Rejected ❌"),
                "message": message,
                "read": False,
                "created_at": datetime.utcnow()
            })

            from services.product_notification_email import schedule_notify_user_brevo_email

            vtitle = "Vehicle verification approved" if approved else "Vehicle verification update"
            schedule_notify_user_brevo_email(
                driver_id,
                subject=f"NEXRYDE — {vtitle}",
                body_plain=message,
                tags=["nexryde-vehicle-verification", "approved" if approved else "rejected"],
                respect_notification_channels=False,
            )
    
    logger.info(f"Vehicle registration {registration_id} {'approved' if approved else 'rejected'}")
    await _log_admin_action(
        request,
        "vehicle_registration_approved" if approved else "vehicle_registration_rejected",
        "vehicle_registration",
        registration_id,
        {"driver_id": driver_id, "reason": rejection_reason},
    )
    
    return {
        "success": True,
        "status": new_status,
        "message": f"Vehicle registration {'approved' if approved else 'rejected'}"
    }

@admin_router.get("/drivers/{driver_id}/suspension-status")
async def get_driver_suspension_status(driver_id: str, request: Request):
    """Check if driver is suspended"""
    verify_owner_strict(request, driver_id)
    suspension = await db.driver_suspensions.find_one({
        "driver_id": driver_id,
        "status": "active"
    })
    
    if not suspension:
        return {
            "is_suspended": False,
            "message": "Driver is in good standing"
        }
    
    suspension.pop("_id", None)
    
    return {
        "is_suspended": True,
        "suspension": suspension
    }

# Import for category severity map
from driver_report_system import CATEGORY_SEVERITY_MAP

@admin_router.get("/admin/dashboard-stats")
async def get_admin_dashboard():
    """Get admin dashboard statistics"""
    try:
        # Get counts
        total_users = await db.users.count_documents({})
        total_drivers = await db.driver_profiles.count_documents({})
        online_drivers = await db.driver_profiles.count_documents({"is_online": True})
        total_trips = await db.trips.count_documents({})
        active_trips = await db.trips.count_documents({"status": {"$in": ["accepted", "picked_up", "in_progress"]}})
        completed_trips = await db.trips.count_documents({"status": "completed"})
        
        # Get revenue (sum of all completed trip fares)
        revenue_pipeline = [
            {"$match": {"status": "completed"}},
            {"$group": {"_id": None, "total": {"$sum": "$fare"}}}
        ]
        revenue_result = await db.trips.aggregate(revenue_pipeline).to_list(1)
        total_revenue = revenue_result[0]["total"] if revenue_result else 0
        
        # Get pending verifications
        pending_verifications = await db.driver_profiles.count_documents({"verification_status": "pending"})
        
        # Get pending vehicle registrations
        pending_registrations = await db.vehicle_registrations.count_documents({"status": "pending"})
        
        return {
            "users": {
                "total": total_users,
                "drivers": total_drivers,
                "riders": total_users - total_drivers,
            },
            "drivers": {
                "total": total_drivers,
                "online": online_drivers,
                "offline": total_drivers - online_drivers,
            },
            "trips": {
                "total": total_trips,
                "active": active_trips,
                "completed": completed_trips,
            },
            "revenue": {
                "total": total_revenue,
                "currency": "NGN",
            },
            "pending": {
                "driver_verifications": pending_verifications,
                "vehicle_registrations": pending_registrations,
            }
        }
    except Exception as e:
        logging.error(f"Admin dashboard error: {str(e)}")
        return {
            "users": {"total": 0, "drivers": 0, "riders": 0},
            "drivers": {"total": 0, "online": 0, "offline": 0},
            "trips": {"total": 0, "active": 0, "completed": 0},
            "revenue": {"total": 0, "currency": "NGN"},
            "pending": {"driver_verifications": 0, "vehicle_registrations": 0}
        }

# Seed default promo codes on startup
async def seed_promo_codes():
    """Seed default promo codes"""
    default_promos = [
        {"code": "FIRST10", "discount_percent": 10, "max_uses": 10000},
        {"code": "WELCOME20", "discount_percent": 20, "max_uses": 5000},
        {"code": "NEXRYDE50", "discount_percent": 50, "max_uses": 100},
    ]
    for promo in default_promos:
        await db.promo_codes.update_one(
            {"code": promo["code"]},
            {"$setOnInsert": {**promo, "active": True, "used_by": [], "created_at": datetime.utcnow()}},
            upsert=True
        )
    logger.info("Default promo codes seeded")


@admin_router.delete("/admin/cleanup-test-data")
async def cleanup_test_data(request: Request):
    """Remove ALL test/dummy data from the database — thorough sweep."""
    _require_admin_test_tools_enabled()
    test_rider_patterns = {"$regex": "^(TEST_|fav_|test-|pin-|e2e-|SMOKE|smoke|demo-|sample-)", "$options": "i"}
    test_driver_patterns = {"$regex": "^(TEST_|fav_|test-|pin-|e2e-|SMOKE|smoke|demo-|sample-)", "$options": "i"}
    test_address = {"$regex": "test|dummy|sample|placeholder|fake", "$options": "i"}

    t1 = await db.trips.delete_many({"$or": [
        {"rider_id": test_rider_patterns},
        {"driver_id": test_driver_patterns},
        {"pickup_location": test_address},
        {"destination": test_address},
        {"pickup_location.address": test_address},
        {"dropoff_location.address": test_address},
    ]})

    t2 = await db.users.delete_many({"$or": [
        {"id": test_rider_patterns},
        {"id": test_driver_patterns},
        {"name": {"$regex": "^(TestRider|TestDriver|FavRider|FavDriver|Test User|E2E)", "$options": "i"}},
    ]})

    t3 = await db.driver_profiles.delete_many({"user_id": test_driver_patterns})
    t4 = await db.subscriptions.delete_many({"driver_id": test_driver_patterns})
    t5 = await db.wallets.delete_many({"user_id": {"$regex": "^(TEST_|fav_|test-|pin-|e2e-)", "$options": "i"}})

    remaining_pending = await db.trips.count_documents({"status": {"$in": ["pending", "pending_driver_offers"]}})

    deleted = {
        "trips": t1.deleted_count,
        "users": t2.deleted_count,
        "driver_profiles": t3.deleted_count,
        "subscriptions": t4.deleted_count,
        "wallets": t5.deleted_count,
    }
    await _log_admin_action(request, "cleanup_test_data", "test_data", "", deleted)

    return {
        "deleted": deleted,
        "remaining_pending_trips": remaining_pending,
    }


@admin_router.get("/admin/api-usage")
async def get_api_usage(days: int = 7, http_request: Request = None):
    """Return Google Maps API usage stats and cache hit rates for the last N days."""
    from admin_guard import require_admin_request
    await require_admin_request(http_request)
    rows = await get_api_usage_summary(db, days=days)
    total_real = sum(r.get("real_calls", 0) for r in rows)
    total_cached = sum(r.get("cached_hits", 0) for r in rows)
    total_all = total_real + total_cached
    cache_hit_rate = round((total_cached / total_all * 100) if total_all else 0, 1)

    # Estimated cost: Google Maps Directions API ~$0.005 per request ≈ ₦8
    cost_per_call_ngn = 8
    estimated_cost_ngn = total_real * cost_per_call_ngn

    return {
        "period_days": days,
        "total_api_calls": total_all,
        "real_google_calls": total_real,
        "cached_hits": total_cached,
        "cache_hit_rate_pct": cache_hit_rate,
        "estimated_cost_ngn": estimated_cost_ngn,
        "daily_breakdown": rows,
    }


class UnsuspendByEmailBody(BaseModel):
    email: str


async def _perform_admin_unsuspend(user_id: str, *, pardoned_by: str) -> dict:
    """Shared unsuspend: users + violations + driver_profiles."""
    now_iso = datetime.utcnow().isoformat()
    result = await db.users.update_one(
        {"id": user_id},
        {
            "$unset": {
                "suspended_until": "",
                "suspension_reason": "",
                "booking_blocked_until": "",
                "block_reason": "",
                "forced_offline_until": "",
                "deactivated_at": "",
                "deactivation_reason": "",
            },
            "$set": {
                "is_deactivated": False,
                "unsuspended_at": now_iso,
                "unsuspended_by": pardoned_by,
            },
        },
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    await db.violations.update_many(
        {"user_id": user_id, "status": "active"},
        {"$set": {"status": "pardoned", "pardoned_at": now_iso, "pardoned_by": pardoned_by}},
    )
    await db.driver_profiles.update_one(
        {"user_id": user_id},
        {"$unset": {"forced_offline_until": "", "suspended_reason": ""}},
    )
    return {
        "success": True,
        "message": "User fully reactivated and all violations cleared.",
        "user_id": user_id,
    }


@admin_router.post("/admin/users/{user_id}/unsuspend")
async def admin_unsuspend_user(user_id: str, request: Request):
    """Admin: fully reactivate a user — clears suspension, deactivation, bans,
    booking blocks, forced-offline, and all active violations."""
    from admin_guard import require_admin_request
    await require_admin_request(request)
    out = await _perform_admin_unsuspend(user_id, pardoned_by="admin")
    await _log_admin_action(request, "user_unsuspended", "user", user_id)
    return out


@admin_router.post("/admin/users/unsuspend-by-email")
async def admin_unsuspend_by_email(request: Request, body: UnsuspendByEmailBody):
    """Admin: same as ``/unsuspend`` but lookup by email (case-insensitive)."""
    from admin_guard import require_admin_request
    await require_admin_request(request)
    raw = (body.email or "").strip()
    if not raw or "@" not in raw:
        raise HTTPException(status_code=400, detail="Valid email required")
    safe = re.escape(raw.lower())
    user = await db.users.find_one({"email": {"$regex": f"^{safe}$", "$options": "i"}})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    uid = user["id"]
    out = await _perform_admin_unsuspend(uid, pardoned_by="admin")
    out["email"] = user.get("email")
    await _log_admin_action(request, "user_unsuspended_by_email", "user", uid, {"email": user.get("email")})
    return out


@admin_router.post("/admin/create-test-driver")
async def admin_create_test_driver(request: Request):
    """Admin: create a fully ready test driver account (approved docs, no SIM lock).
    Accepts optional JSON body: {"email": "you@gmail.com", "name": "Test Driver"}
    Returns email and user_id so you can log in immediately via email OTP."""
    from admin_guard import require_admin_request
    await require_admin_request(request)
    _require_admin_test_tools_enabled()

    import uuid as _uuid
    now_iso = datetime.utcnow().isoformat()
    user_id = str(_uuid.uuid4())

    body = {}
    try:
        body = await request.json()
    except Exception:
        pass

    test_email = (body.get("email") or "testdriver@nexryde.app").strip().lower()
    test_name  = (body.get("name")  or "Test Driver").strip()
    test_phone = "+2340000000001"

    existing = await db.users.find_one({"$or": [{"email": test_email}, {"phone": test_phone}]})
    if existing:
        # Update email on existing account in case it changed
        await db.users.update_one(
            {"id": existing["id"]},
            {
                "$unset": {"suspended_until": "", "suspension_reason": ""},
                "$set": {
                    "email": test_email,
                    "name": test_name,
                    "verification_status": "approved",
                    "documents_verified": True,
                    "is_verified": True,
                    "fortress_exempt": True,
                },
            },
        )
        await db.driver_profiles.update_one(
            {"user_id": existing["id"]},
            {"$set": {"verification_status": "approved", "documents_verified": True}},
        )
        await _log_admin_action(request, "test_driver_updated", "driver", existing["id"], {"email": test_email})
        return {
            "success": True,
            "message": "Test driver account updated",
            "user_id": existing["id"],
            "email": test_email,
            "name": test_name,
            "note": "Open the app, enter this email, get OTP in your inbox, log in.",
        }

    user = {
        "id": user_id,
        "phone": test_phone,
        "name": test_name,
        "email": test_email,
        "role": "driver",
        "gender": "male",
        "created_at": now_iso,
        "is_verified": True,
        "face_verified": True,
        "face_image": None,
        "profile_image": None,
        "google_id": None,
        "rating": 5.0,
        "total_trips": 0,
        "behavior_score": 100.0,
        "nexryde_score": 100.0,
        "verification_status": "approved",
        "documents_verified": True,
        "fortress_exempt": True,
        "force_approved_at": now_iso,
    }
    await db.users.insert_one(user)

    # Wallet
    await db.wallets.insert_one({
        "id": str(_uuid.uuid4()),
        "user_id": user_id,
        "balance": 5000.0,
        "currency": "NGN",
        "transactions": [],
        "created_at": now_iso,
    })

    # Driver profile — approved
    await db.driver_profiles.insert_one({
        "id": str(_uuid.uuid4()),
        "user_id": user_id,
        "verification_status": "approved",
        "documents_verified": True,
        "nin_verified": True,
        "license_uploaded": True,
        "vehicle_docs_uploaded": True,
        "selfie_verified": True,
        "vehicle_type": "sedan",
        "vehicle_make": "Toyota",
        "vehicle_model": "Corolla",
        "vehicle_year": "2020",
        "vehicle_color": "Black",
        "vehicle_plate_number": "TEST-001",
        "approved_at": now_iso,
        "approved_by": "admin_test_account",
        "created_at": now_iso,
    })
    await _log_admin_action(request, "test_driver_created", "driver", user_id, {"email": test_email})

    return {
        "success": True,
        "message": "Test driver account created successfully",
        "user_id": user_id,
        "email": test_email,
        "name": test_name,
        "note": "Open the app, enter this email, get OTP in your inbox, log in as driver.",
    }


@admin_router.post("/admin/drivers/{driver_id}/force-approve")
async def admin_force_approve_driver(driver_id: str, request: Request):
    """Admin: force-approve a driver's documents and clear all suspension locks,
    allowing them to go online immediately. SIM swap lock is intentionally NOT cleared
    here — use /admin/drivers/{id}/clear-sim-swap to lift that separately.
    Useful for test accounts and emergency unblocks."""
    from admin_guard import require_admin_request
    await require_admin_request(request)

    user = await db.users.find_one({"id": driver_id}, {"_id": 0, "id": 1, "name": 1, "phone": 1, "role": 1})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.get("role") != "driver":
        raise HTTPException(status_code=400, detail="User is not a driver")

    now_iso = datetime.utcnow().isoformat()

    # Approve documents and clear any active suspension — SIM swap lock is intentionally left untouched
    await db.users.update_one(
        {"id": driver_id},
        {
            "$unset": {"suspended_until": "", "suspension_reason": ""},
            "$set": {
                "verification_status": "approved",
                "documents_verified": True,
                "force_approved_at": now_iso,
            },
        },
    )

    # Approve the driver profile documents only
    await db.driver_profiles.update_one(
        {"user_id": driver_id},
        {
            "$set": {
                "verification_status": "approved",
                "documents_verified": True,
                "profile_completed": True,
                "subscription_active": True,
                "approved_at": now_iso,
                "approved_by": "admin_force_approve",
            },
        },
        upsert=True,
    )

    # Auto-create a lifetime trial subscription so the driver can go online immediately
    # without having to activate separately — critical for test accounts.
    import uuid as _uuid
    existing_sub = await db.subscriptions.find_one(
        {"driver_id": driver_id, "status": {"$in": ["active", "trial", "grace_period"]}}
    )
    if not existing_sub:
        from driver_trial_policy import ensure_profile_trial_config

        cfg = await ensure_profile_trial_config(driver_id)
        trial_end = (datetime.utcnow() + timedelta(days=3650)).isoformat()  # 10-year trial for test accounts
        await db.subscriptions.insert_one({
            "id": str(_uuid.uuid4()),
            "driver_id": driver_id,
            "status": "trial",
            "plan": "force_approved_trial",
            "trial_trips_completed": 0,
            "trial_trips_target": int(cfg["trip_limit"]),
            "trial_day_limit": cfg.get("day_limit"),
            "start_date": now_iso,
            "end_date": trial_end,
            "created_at": now_iso,
            "notes": "Auto-created by admin force-approve",
        })
        await db.users.update_one(
            {"id": driver_id},
            {"$set": {"subscription_active": True}},
        )
    await _log_admin_action(request, "driver_force_approved", "driver", driver_id, {"created_trial": not bool(existing_sub)})

    notified = False
    try:
        from routers.auth import send_driver_verification_notification
        await send_driver_verification_notification(driver_id, "approved")
        notified = True
    except Exception as exc:  # notification must never block the admin action
        logger.warning("Driver force-approve notification skipped: %s", exc)

    return {
        "success": True,
        "message": f"Driver '{user.get('name', driver_id)}' force-approved with active trial. They can go online immediately.",
        "driver_id": driver_id,
        "approved_at": now_iso,
        "notified": notified,
    }


@admin_router.post("/admin/drivers/clear-monthly-suspensions")
async def clear_monthly_verification_suspensions(http_request: Request):
    """One-shot: unblock all drivers suspended solely for monthly_verification_overdue.
    Verified drivers should never be hard-blocked by monthly photo reminders."""
    from admin_guard import require_admin_request
    await require_admin_request(http_request)
    now_iso = datetime.utcnow().isoformat()

    # Clear from driver_profiles
    dp_result = await db.driver_profiles.update_many(
        {"suspended_reason": "monthly_verification_overdue"},
        {"$unset": {"suspended_reason": ""}, "$set": {"monthly_verification_complete": True, "unblocked_at": now_iso}}
    )
    # Clear from users
    u_result = await db.users.update_many(
        {"suspension_reason": "monthly_verification_overdue"},
        {"$unset": {"suspension_reason": "", "suspended_until": ""}}
    )
    await _log_admin_action(
        http_request,
        "monthly_verification_suspensions_cleared",
        "driver",
        "",
        {"driver_profiles": dp_result.modified_count, "users": u_result.modified_count},
    )
    return {
        "success": True,
        "driver_profiles_cleared": dp_result.modified_count,
        "users_cleared": u_result.modified_count,
        "message": "All monthly-verification suspensions lifted. Drivers may go online again.",
    }


@admin_router.get("/admin/live-stats")
async def get_admin_live_stats(http_request: Request):
    """
    Comprehensive real-time dashboard stats.
    Returns everything the admin control-center needs in a single request.
    """
    from admin_guard import require_admin_request
    await require_admin_request(http_request)

    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start  = today_start - timedelta(days=today_start.weekday())
    month_start = today_start.replace(day=1)

    # ── Parallel queries ─────────────────────────────────────────────────────
    (
        online_drivers,
        total_drivers,
        pending_verification,
        total_riders,
        active_riders,
        today_trips_docs,
        week_trips_docs,
        active_trips_count,
        wallet_agg,
        sub_revenue_agg,
        support_open,
        support_total,
        sos_active,
        failed_payments,
    ) = await asyncio.gather(
        db.driver_profiles.count_documents({"is_online": True}),
        db.driver_profiles.count_documents({}),
        db.driver_profiles.count_documents({"verification_status": "pending"}),
        db.users.count_documents({"role": "rider"}),
        db.trips.count_documents({"status": {"$in": ["accepted", "arrived", "ongoing"]}, "created_at": {"$gte": today_start}}),
        db.trips.aggregate([
            {"$match": {"created_at": {"$gte": today_start}}},
            {"$group": {"_id": "$status", "count": {"$sum": 1}, "fare_sum": {"$sum": "$fare"}}},
        ]).to_list(20),
        db.trips.aggregate([
            {"$match": {"created_at": {"$gte": week_start}}},
            {"$group": {"_id": None, "total": {"$sum": 1}, "completed": {"$sum": {"$cond": [{"$eq": ["$status", "completed"]}, 1, 0]}}, "revenue": {"$sum": {"$cond": [{"$eq": ["$status", "completed"]}, "$fare", 0]}}}},
        ]).to_list(1),
        db.trips.count_documents({"status": {"$in": ["accepted", "arrived", "ongoing"]}}),
        db.wallets.aggregate([
            {"$group": {"_id": None, "total_balance": {"$sum": "$balance"}, "total_wallets": {"$sum": 1}, "avg_balance": {"$avg": "$balance"}}},
        ]).to_list(1),
        db.subscriptions.aggregate([
            {"$match": {"status": {"$in": ["active", "trial"]}}},
            {"$group": {"_id": "$plan_type", "count": {"$sum": 1}, "revenue": {"$sum": "$amount_paid"}}},
        ]).to_list(20),
        db.support_tickets.count_documents({"status": {"$in": ["open", "pending"]}}),
        db.support_tickets.count_documents({}),
        db.sos_alerts.count_documents({"status": {"$ne": "resolved"}}),
        db.transactions.count_documents({"status": "failed", "created_at": {"$gte": today_start}}),
    )

    # ── Today trip breakdown ─────────────────────────────────────────────────
    today_by_status: dict[str, int] = {}
    today_fare_sum = 0.0
    for row in today_trips_docs:
        s = str(row.get("_id") or "unknown")
        c = int(row.get("count", 0))
        today_by_status[s] = c
        if s == "completed":
            today_fare_sum = float(row.get("fare_sum") or 0)

    today_total    = sum(today_by_status.values())
    today_complete = today_by_status.get("completed", 0)
    today_cancel   = today_by_status.get("cancelled", 0)
    today_failed   = today_by_status.get("failed", 0)
    today_success_rate = round((today_complete / today_total * 100) if today_total > 0 else 0, 1)

    # ── Week summary ─────────────────────────────────────────────────────────
    week_row = week_trips_docs[0] if week_trips_docs else {}
    week_total     = int(week_row.get("total", 0))
    week_completed = int(week_row.get("completed", 0))
    week_revenue   = float(week_row.get("revenue") or 0)

    # ── Wallet totals ─────────────────────────────────────────────────────────
    w = wallet_agg[0] if wallet_agg else {}
    wallet_total_balance = float(w.get("total_balance") or 0)
    wallet_count         = int(w.get("total_wallets") or 0)
    wallet_avg           = float(w.get("avg_balance") or 0)

    # ── Subscription revenue ─────────────────────────────────────────────────
    sub_active_count = sum(int(r.get("count", 0)) for r in sub_revenue_agg)
    sub_total_revenue = sum(float(r.get("revenue") or 0) for r in sub_revenue_agg)

    # ── 7-day rides sparkline (last 7 days, one data point per day) ──────────
    sparkline_pipeline = [
        {"$match": {"created_at": {"$gte": today_start - timedelta(days=6)}}},
        {"$group": {"_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}}, "total": {"$sum": 1}, "completed": {"$sum": {"$cond": [{"$eq": ["$status", "completed"]}, 1, 0]}}}},
        {"$sort": {"_id": 1}},
    ]
    sparkline_raw = await db.trips.aggregate(sparkline_pipeline).to_list(7)
    sparkline = [{"date": r["_id"], "total": r["total"], "completed": r["completed"]} for r in sparkline_raw]

    return {
        "ts": now.isoformat(),
        "drivers": {
            "online":       online_drivers,
            "total":        total_drivers,
            "offline":      total_drivers - online_drivers,
            "pending_verification": pending_verification,
            "utilisation_pct": round((online_drivers / total_drivers * 100) if total_drivers > 0 else 0, 1),
        },
        "riders": {
            "total":        total_riders,
            "active_today": active_riders,
        },
        "trips": {
            "active_now":       active_trips_count,
            "today_total":      today_total,
            "today_completed":  today_complete,
            "today_cancelled":  today_cancel,
            "today_failed":     today_failed + failed_payments,
            "today_revenue_ngn": round(today_fare_sum, 2),
            "today_success_rate": today_success_rate,
            "week_total":       week_total,
            "week_completed":   week_completed,
            "week_revenue_ngn": round(week_revenue, 2),
        },
        "subscriptions": {
            "active":       sub_active_count,
            "total_revenue_ngn": round(sub_total_revenue, 2),
            "by_plan":      [{"plan": r.get("_id"), "count": r.get("count"), "revenue": r.get("revenue")} for r in sub_revenue_agg],
        },
        "wallets": {
            "total_balance_ngn": round(wallet_total_balance, 2),
            "wallet_count":      wallet_count,
            "avg_balance_ngn":   round(wallet_avg, 2),
        },
        "support": {
            "open_tickets":  support_open,
            "total_tickets": support_total,
            "sos_active":    sos_active,
        },
        "sparkline_7d": sparkline,
    }


@admin_router.get("/admin/route-cache/stats")
async def get_route_cache_stats(http_request: Request = None):
    """Return current route cache size and expiry info."""
    from admin_guard import require_admin_request
    from route_cache import _lru
    await require_admin_request(http_request)
    cached_count = await db.route_cache.count_documents({})
    lru_count = len(_lru)
    # Purge expired entries from MongoDB
    now_iso = datetime.utcnow().isoformat()
    purge_result = await db.route_cache.delete_many({"expires_at": {"$lt": now_iso}})
    return {
        "mongo_cached_routes": cached_count,
        "lru_cached_routes": lru_count,
        "purged_expired": purge_result.deleted_count,
    }


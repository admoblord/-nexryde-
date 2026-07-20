from datetime import datetime, timezone
import hashlib

from fastapi import HTTPException, Request

from database import db


def extract_admin_token(request: Request) -> str:
    auth_header = request.headers.get("authorization", "").strip()
    if auth_header.lower().startswith("bearer "):
        return auth_header[7:].strip()
    return (request.headers.get("x-admin-token") or "").strip()


async def require_admin_request(request: Request) -> str:
    raw_token = extract_admin_token(request)
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

    await db.admin_sessions.update_one(
        {"token_hash": token_hash},
        {"$set": {"last_seen_at": now}},
    )
    request.state.admin_email = session.get("email")
    request.state.admin_role = session.get("role") or "super_admin"
    return str(session.get("email") or "")

"""
Unified push delivery: Expo Push (default) + optional FCM native tokens.
Analytics events stored in ``notification_events``. Used by trips + admin broadcasts.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

import httpx

from database import db
from notification_catalog import enrich_push_data

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"

_fcm_app_initialized = False


def _truthy_env(name: str) -> bool:
    return os.environ.get(name, "").strip().lower() in ("1", "true", "yes", "on")


def _notification_email_mirror_enabled() -> bool:
    """Duplicate selected pushes to inbox via Brevo when configured (see ``NOTIFICATION_EMAIL_MIRROR_TRIPS``)."""
    return _truthy_env("NOTIFICATION_EMAIL_MIRROR")


def _mirror_includes_trip_source() -> bool:
    """Trip/driver-assignment pings are high-volume; opt-in explicitly."""
    return _truthy_env("NOTIFICATION_EMAIL_MIRROR_TRIPS")


def _should_mirror_push_source(source: str) -> bool:
    if not _notification_email_mirror_enabled():
        return False
    s = (source or "trip").strip().lower()
    if s == "trip" and not _mirror_includes_trip_source():
        return False
    return True


def _user_allows_notification_email(channels: Any) -> bool:
    """Matches app default: email on unless user turns it off in notification_channels."""
    if not isinstance(channels, dict):
        return True
    return channels.get("email", True) is not False


async def _mirror_push_to_email(
    user_id: str,
    recipient: str,
    title: str,
    body: str,
    source: str,
) -> None:
    try:
        from services.brevo_transactional_mail import (
            BrevoMailError,
            brevo_is_configured,
            brevo_send_transactional,
            brevo_simple_notification_html,
        )

        if not brevo_is_configured():
            return
        subj = (title or "NEXRYDE")[:200]
        text = f"{title}\n\n{body}" if title else (body or "")
        tag_src = "".join(c if c.isalnum() else "-" for c in (source or "app")[:48]).strip("-") or "app"
        await brevo_send_transactional(
            recipients=[recipient],
            subject=subj,
            text_content=text,
            html_content=brevo_simple_notification_html(title=subj, body_plain=body or ""),
            tags=["nexryde-push-mirror", tag_src],
        )
    except BrevoMailError as exc:
        logger.debug("Push→email mirror skipped for %s: %s", user_id, exc)
    except Exception:
        logger.warning("Push→email mirror failed user=%s", user_id, exc_info=True)


def _schedule_push_email_mirror(
    user_id: str,
    user: dict[str, Any],
    title: str,
    body: str,
    source: str,
) -> None:
    if not _should_mirror_push_source(source):
        return
    addr = (user.get("email") or "").strip()
    if not addr or not _user_allows_notification_email(user.get("notification_channels")):
        return
    asyncio.create_task(_mirror_push_to_email(user_id, addr, title, body, source))


def _is_expo_token(token: str) -> bool:
    t = (token or "").strip()
    return t.startswith("ExponentPushToken[") or t.startswith("ExpoPushToken")


def _ensure_fcm_app() -> bool:
    """Initialize Firebase app once; returns True if native FCM sends are possible."""
    global _fcm_app_initialized
    if _fcm_app_initialized:
        return True
    try:
        import firebase_admin
        from firebase_admin import credentials

        cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "").strip()
        if not cred_path or not os.path.isfile(cred_path):
            logger.info("FCM: GOOGLE_APPLICATION_CREDENTIALS not set — native FCM sends disabled")
            return False
        try:
            firebase_admin.get_app()
        except ValueError:
            firebase_admin.initialize_app(credentials.Certificate(cred_path))
        _fcm_app_initialized = True
        logger.info("FCM: firebase_admin initialized for native FCM tokens")
        return True
    except ImportError:
        logger.info("FCM: firebase_admin not installed — add `firebase-admin` for native FCM")
        return False
    except Exception as e:
        logger.warning("FCM init failed: %s", e)
        return False


def _flatten_data_for_expo(data: Optional[dict]) -> Optional[dict]:
    """Expo requires string values in `data` (dict/list JSON-encoded)."""
    if not data:
        return None
    out: dict[str, str] = {}
    for k, v in data.items():
        if v is None:
            continue
        key = str(k)
        if isinstance(v, (dict, list)):
            out[key] = json.dumps(v)
        else:
            out[key] = str(v)
    return out


_EXPO_MAX_RETRIES = 2


async def _send_expo_push(token: str, title: str, body: str, data: Optional[dict]) -> tuple[bool, bool]:
    """Returns (success, should_invalidate_token).

    Retries transient network errors up to _EXPO_MAX_RETRIES times with
    exponential back-off. Does NOT retry on definitive token errors.
    """
    payload: dict = {
        "to": token,
        "title": title,
        "body": body,
        "sound": "default",
        "priority": "high",
        "badge": 1,
    }
    if data:
        ch = data.get("channel_id") or data.get("android_channel")
        if ch:
            payload["channelId"] = str(ch)
        # Forward badge count from data if explicitly set
        badge_val = data.get("badge")
        if badge_val is not None:
            try:
                payload["badge"] = int(badge_val)
            except (TypeError, ValueError):
                pass
        flat = _flatten_data_for_expo(data)
        if flat:
            payload["data"] = flat

    last_exc: Optional[Exception] = None
    for attempt in range(_EXPO_MAX_RETRIES + 1):
        if attempt > 0:
            await asyncio.sleep(2 ** attempt)
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(EXPO_PUSH_URL, json=payload)
                if resp.status_code != 200:
                    logger.warning("Expo push HTTP %s attempt %s: %s", resp.status_code, attempt + 1, resp.text[:200])
                    # 5xx — retryable; 4xx — not
                    if resp.status_code < 500:
                        return False, False
                    last_exc = RuntimeError(f"HTTP {resp.status_code}")
                    continue
                body_json = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
                ticket_data = body_json.get("data") if isinstance(body_json, dict) else None
                ticket = ticket_data if isinstance(ticket_data, dict) else {}
                ticket_status = str(ticket.get("status") or "").lower()
                ticket_details = ticket.get("details") if isinstance(ticket.get("details"), dict) else {}
                if ticket_status == "error":
                    err = str(ticket.get("message") or "")
                    code = str(ticket_details.get("error") or "")
                    logger.warning("Expo ticket error: %s %s", err, code)
                    inv = code in {"DeviceNotRegistered", "InvalidCredentials"}
                    return False, inv
                return True, False
        except Exception as exc:
            logger.warning("Expo push error attempt %s: %s", attempt + 1, exc)
            last_exc = exc

    logger.warning("Expo push failed after %s attempts: %s", _EXPO_MAX_RETRIES + 1, last_exc)
    return False, False


async def _send_fcm_native(token: str, title: str, body: str, data: Optional[dict]) -> bool:
    if not _ensure_fcm_app():
        return False
    try:
        import firebase_admin.messaging as messaging

        data_str = {str(k): str(v) for k, v in (data or {}).items() if v is not None}
        ch = None
        if data:
            ch = data.get("channel_id") or data.get("android_channel")
        android_cfg = None
        if ch:
            android_cfg = messaging.AndroidConfig(
                notification=messaging.AndroidNotification(
                    title=title,
                    body=body,
                    channel_id=str(ch),
                ),
            )
        msg = messaging.Message(
            notification=messaging.Notification(title=title, body=body),
            data=data_str,
            token=token,
            android=android_cfg,
        )

        await asyncio.to_thread(messaging.send, msg)
        return True
    except Exception as e:
        logger.warning("FCM send failed: %s", e)
        return False


async def _invalidate_user_push_token(user_id: str, token: str) -> None:
    await db.users.update_one(
        {"id": user_id, "push_token": token},
        {"$unset": {"push_token": ""}, "$set": {"push_token_invalidated_at": datetime.utcnow()}},
    )


async def send_to_token(
    user_id: str,
    token: str,
    provider_hint: Optional[str],
    title: str,
    body: str,
    data: Optional[dict],
) -> tuple[bool, str]:
    """Returns (success, channel_used)."""
    prov = (provider_hint or "").lower()
    use_fcm = prov == "fcm" or (not _is_expo_token(token) and len((token or "").strip()) > 60)
    if use_fcm:
        ok = await _send_fcm_native(token, title, body, data)
        return ok, "fcm"
    ok, inv = await _send_expo_push(token, title, body, data)
    if not ok and inv and token:
        await _invalidate_user_push_token(user_id, token)
    return ok, "expo"


_NOTIFICATION_EVENTS_TTL_DAYS = 30


async def _record_event(
    user_id: str,
    title: str,
    body: str,
    channel: str,
    status: str,
    source: str,
    extra: Optional[dict] = None,
) -> None:
    try:
        from datetime import timedelta
        now = datetime.now(timezone.utc)
        doc = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "channel": channel,
            "title": title,
            "body_preview": (body or "")[:160],
            "status": status,
            "source": source,
            "created_at": now.isoformat(),
            # TTL index on this field: docs auto-deleted after 30 days.
            "expires_at": now + timedelta(days=_NOTIFICATION_EVENTS_TTL_DAYS),
        }
        if extra:
            doc.update({k: v for k, v in extra.items() if v is not None})
        await db.notification_events.insert_one(doc)
    except Exception as e:
        logger.debug("notification_events insert skipped: %s", e)


async def send_push_notification(
    user_id: str,
    title: str,
    body: str,
    data: Optional[dict] = None,
    *,
    source: str = "trip",
    experiment_key: Optional[str] = None,
    variant: Optional[str] = None,
) -> bool:
    """Send to all registered tokens for user (legacy push_token + push_devices).

    Injects ``nid`` (correlation id) into the data payload for analytics / open tracking.
    """
    merged: dict = enrich_push_data(data)
    nid = str(uuid.uuid4())
    merged["nid"] = nid
    if merged.get("type") is not None:
        merged["type"] = str(merged["type"])

    user = await db.users.find_one(
        {"id": user_id},
        {"push_token": 1, "push_devices": 1, "email": 1, "notification_channels": 1},
    )
    if not user:
        await _record_event(
            user_id,
            title,
            body,
            "none",
            "no_user",
            source,
            {"nid": nid, **({"experiment_key": experiment_key} if experiment_key else {}), **({"variant": variant} if variant else {})},
        )
        return False

    _schedule_push_email_mirror(user_id, user, title, body, source)

    tokens_todo: list[tuple[str, Optional[str]]] = []
    seen: set[str] = set()

    pt = user.get("push_token")
    if pt and isinstance(pt, str) and pt not in seen:
        seen.add(pt)
        tokens_todo.append((pt, "expo" if _is_expo_token(pt) else None))

    for d in user.get("push_devices") or []:
        if not isinstance(d, dict):
            continue
        t = d.get("token")
        if not t or t in seen:
            continue
        seen.add(t)
        tokens_todo.append((str(t), d.get("provider")))

    if not tokens_todo:
        await _record_event(
            user_id,
            title,
            body,
            "none",
            "no_token",
            source,
            {"nid": nid, **({"experiment_key": experiment_key} if experiment_key else {}), **({"variant": variant} if variant else {})},
        )
        return False

    extra: dict[str, Any] = {"nid": nid}
    if experiment_key:
        extra["experiment_key"] = experiment_key
    if variant:
        extra["variant"] = variant

    any_ok = False
    for token, prov in tokens_todo:
        ok, channel = await send_to_token(user_id, token, prov, title, body, merged)
        if ok:
            any_ok = True
        await _record_event(
            user_id,
            title,
            body,
            channel,
            "sent" if ok else "failed",
            source,
            extra,
        )
    return any_ok


def assign_ab_variant(user_id: str, experiment_key: str, variant_keys: list[str]) -> str:
    """Deterministic bucket from user id (stateless; same user always same variant)."""
    if not variant_keys:
        return "control"
    h = hashlib.sha256(f"{experiment_key}:{user_id}".encode()).hexdigest()
    idx = int(h[:12], 16) % len(variant_keys)
    return variant_keys[idx]


async def get_user_ids_for_broadcast_target(target: str) -> list[str]:
    """Admin broadcast audience selection (same semantics as admin panel)."""
    t = (target or "all").lower()
    if t == "drivers":
        cur = await db.users.find({"role": "driver"}, {"id": 1}).to_list(50_000)
        return [u["id"] for u in cur]
    if t == "riders":
        cur = await db.users.find({"role": "rider"}, {"id": 1}).to_list(50_000)
        return [u["id"] for u in cur]
    if t == "verified_drivers":
        cur = await db.users.find({"role": "driver", "is_verified": True}, {"id": 1}).to_list(50_000)
        return [u["id"] for u in cur]
    if t == "online_drivers":
        profs = await db.driver_profiles.find({"is_online": True}, {"user_id": 1}).to_list(20_000)
        return list({p["user_id"] for p in profs if p.get("user_id")})
    cur = await db.users.find({}, {"id": 1}).to_list(100_000)
    return [u["id"] for u in cur]


async def record_notification_open(user_id: str, notification_id: Optional[str] = None) -> None:
    """Client calls when user opens a push (optional analytics).

    Pass ``nid`` from the push payload (preferred); legacy ``notification_events.id`` still works.
    """
    ts = datetime.now(timezone.utc).isoformat()
    try:
        if notification_id:
            res = await db.notification_events.update_many(
                {"user_id": user_id, "nid": notification_id},
                {"$set": {"opened_at": ts}},
            )
            if res.modified_count:
                return
            res2 = await db.notification_events.update_one(
                {"user_id": user_id, "id": notification_id},
                {"$set": {"opened_at": ts}},
            )
            if res2.matched_count:
                return
        await db.notification_events.insert_one(
            {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "status": "opened",
                "channel": "client",
                "source": "client_open",
                "related_notification_id": notification_id,
                "nid": notification_id,
                "created_at": ts,
                "opened_at": ts,
            }
        )
    except Exception:
        pass

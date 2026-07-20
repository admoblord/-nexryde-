"""
Unified push delivery: Expo Push (default) + optional FCM native tokens.
Analytics events stored in ``notification_events``. Used by trips + admin broadcasts.
"""
from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import logging
import os
import stat
import tempfile
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

import httpx

from database import db
from notification_catalog import (
    NotificationAudience,
    NotificationCategory,
    enrich_push_data,
    get_kind_meta,
    normalize_audience,
    normalize_category,
)
from notification_delivery_ledger import (
    claim_notification_delivery,
    infer_delivery_window,
    infer_time_slot,
    log_notification_decision,
    mark_notification_delivery,
    should_dedupe_notification,
)

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"

_fcm_app_initialized = False


def _resolve_google_application_credentials() -> Optional[str]:
    """Resolve Firebase Admin credentials from a mounted secret file or base64 secret env.

    Preferred production setup: mount the Firebase service account JSON as a
    Cloud Run secret volume and set GOOGLE_APPLICATION_CREDENTIALS to that path.
    FIREBASE_SERVICE_ACCOUNT_JSON_BASE64 is a fallback for platforms that cannot
    mount files; it is written to /tmp with owner-only permissions.
    """
    cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "").strip()
    if cred_path and os.path.isfile(cred_path):
        return cred_path

    encoded = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON_BASE64", "").strip()
    if not encoded:
        return None
    try:
        raw = base64.b64decode(encoded)
        parsed = json.loads(raw.decode("utf-8"))
        if not isinstance(parsed, dict) or parsed.get("type") != "service_account":
            logger.warning("FCM: FIREBASE_SERVICE_ACCOUNT_JSON_BASE64 is not a service account JSON")
            return None
        out_path = os.path.join(tempfile.gettempdir(), "nexryde-firebase-service-account.json")
        with open(out_path, "wb") as fh:
            fh.write(raw)
        os.chmod(out_path, stat.S_IRUSR | stat.S_IWUSR)
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = out_path
        return out_path
    except Exception as exc:
        logger.warning("FCM: failed to materialize FIREBASE_SERVICE_ACCOUNT_JSON_BASE64: %s", exc)
        return None


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

        cred_path = _resolve_google_application_credentials()
        if not cred_path:
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


def validate_firebase_admin_config(*, require: bool = False) -> dict[str, Any]:
    """Validate Firebase Admin readiness for startup checks and ops diagnostics."""
    cred_path = _resolve_google_application_credentials()
    configured = bool(cred_path and os.path.isfile(cred_path))
    initialized = _ensure_fcm_app() if configured else False
    status_info = {
        "configured": configured,
        "initialized": initialized,
        "credential_path": cred_path if configured else None,
    }
    if require and not initialized:
        raise RuntimeError(
            "Firebase Admin SDK is required because ENGAGEMENT_LOOP_ENABLED=true, "
            "but credentials could not be loaded. Mount the service account JSON and set "
            "GOOGLE_APPLICATION_CREDENTIALS, or provide FIREBASE_SERVICE_ACCOUNT_JSON_BASE64."
        )
    return status_info


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
        snd = data.get("sound")
        if snd:
            payload["sound"] = str(snd)
        if str(data.get("type") or "") == "ride_request":
            payload["priority"] = "high"
            payload["_contentAvailable"] = True
        if str(data.get("priority") or "").lower() in {"critical", "high"}:
            payload["priority"] = "high"
        category = data.get("category_id") or data.get("categoryId")
        if category:
            payload["categoryId"] = str(category)
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
        android_priority = "high" if str((data or {}).get("priority") or "").lower() in {"critical", "high"} else "normal"
        android_cfg = None
        if ch:
            android_cfg = messaging.AndroidConfig(
                priority=android_priority,
                notification=messaging.AndroidNotification(
                    title=title,
                    body=body,
                    channel_id=str(ch),
                    color="#00D47E",
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


def _parse_iso_datetime(raw: Any) -> Optional[datetime]:
    if isinstance(raw, datetime):
        return raw if raw.tzinfo else raw.replace(tzinfo=timezone.utc)
    if isinstance(raw, str) and raw.strip():
        try:
            dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except Exception:
            return None
    return None


def _audience_matches_role(audience: NotificationAudience, role: str) -> bool:
    normalized_role = (role or "").strip().lower()
    if audience == NotificationAudience.BOTH:
        return normalized_role in {"driver", "rider"}
    return normalized_role == audience.value


def _account_status(user: dict[str, Any]) -> str:
    if user.get("is_deactivated") is True or user.get("blocked") is True or user.get("is_active") is False:
        return "deactivated"
    suspended_until = _parse_iso_datetime(user.get("suspended_until"))
    if suspended_until and suspended_until > datetime.now(timezone.utc):
        return "suspended"
    return "active"


async def _driver_account_status(user_id: str, user: dict[str, Any]) -> dict[str, Any]:
    base = {"status": _account_status(user), "profile_exists": False, "profile_completed": False, "is_online": False}
    profile = await db.driver_profiles.find_one(
        {"user_id": user_id},
        {"_id": 0, "profile_completed": 1, "approved_at": 1, "verification_status": 1, "is_online": 1, "suspended_until": 1},
    )
    if not profile:
        return base
    status = base["status"]
    profile_suspended_until = _parse_iso_datetime(profile.get("suspended_until"))
    if status == "active" and profile_suspended_until and profile_suspended_until > datetime.now(timezone.utc):
        status = "suspended"
    return {
        "status": status,
        "profile_exists": True,
        "profile_completed": bool(profile.get("profile_completed") or profile.get("approved_at")),
        "verification_status": profile.get("verification_status"),
        "is_online": bool(profile.get("is_online")),
    }


def _rider_account_status(user: dict[str, Any]) -> dict[str, Any]:
    return {
        "status": _account_status(user),
        "verified": bool(user.get("is_verified")),
    }


def _category_allowed(user: dict[str, Any], category: NotificationCategory) -> tuple[bool, str]:
    channels = user.get("notification_channels") if isinstance(user.get("notification_channels"), dict) else {}
    if channels.get("push", True) is False:
        return False, "push_channel_disabled"

    types = user.get("notification_types") if isinstance(user.get("notification_types"), dict) else {}
    category_key = category.value
    if types.get(category_key, True) is False:
        return False, f"{category_key}_disabled"

    if category == NotificationCategory.DRIVER_ENGAGEMENT:
        if types.get("engagement", True) is False:
            return False, "engagement_disabled"
        if types.get("driver_engagement", True) is False:
            return False, "driver_engagement_disabled"
    elif category == NotificationCategory.RIDER_ENGAGEMENT:
        if types.get("engagement", True) is False:
            return False, "engagement_disabled"
        if types.get("rider_engagement", True) is False:
            return False, "rider_engagement_disabled"
    elif category == NotificationCategory.MARKETING:
        if types.get("promotions", True) is False:
            return False, "promotions_disabled"

    return True, ""


async def _trip_participant_allows(
    user_id: str,
    trip_id: str,
    kind: str,
) -> tuple[bool, str]:
    """Ride/safety pushes with trip_id must only reach trip participants.

    ``ride_request`` is offered before assignment — allow any recipient when the
    trip exists (callers already target offer ``driver_id`` only).
    """
    trip = await db.trips.find_one(
        {"id": trip_id},
        {"_id": 0, "rider_id": 1, "driver_id": 1},
    )
    if not trip:
        return False, "trip_not_found"
    if kind == "ride_request":
        return True, ""
    rider_id = trip.get("rider_id")
    driver_id = trip.get("driver_id")
    if user_id not in {rider_id, driver_id}:
        return False, "not_trip_participant"
    return True, ""


async def _validate_push_delivery(
    user_id: str,
    user: dict[str, Any],
    kind: str,
    source: str,
    *,
    trip_id: Optional[str] = None,
) -> tuple[bool, dict[str, Any]]:
    meta = get_kind_meta(kind)
    audience = normalize_audience(meta.get("audience"))
    category = normalize_category(meta.get("category"))
    role = str(user.get("role") or "").strip().lower()
    base = {
        "template": kind,
        "audience": audience.value,
        "category": category.value,
        "user_role": role or None,
        "source": source,
        "unknown_template": bool(meta.get("unknown")),
        "trip_id": trip_id,
    }

    if not kind or meta.get("unknown"):
        return False, {**base, "skip_reason": "unknown_notification_template"}
    if not _audience_matches_role(audience, role):
        return False, {**base, "skip_reason": "audience_role_mismatch"}
    # Fail closed: engagement categories must never cross role boundaries.
    if category == NotificationCategory.DRIVER_ENGAGEMENT and role != "driver":
        return False, {**base, "skip_reason": "driver_engagement_role_blocked"}
    if category in {NotificationCategory.RIDER_ENGAGEMENT, NotificationCategory.MARKETING} and role == "driver":
        # Drivers must not receive rider engagement / marketing pushes.
        if audience == NotificationAudience.RIDER:
            return False, {**base, "skip_reason": "rider_engagement_role_blocked"}
    if user.get("notifications_enabled", True) is False:
        return False, {**base, "skip_reason": "notifications_disabled"}

    allowed, reason = _category_allowed(user, category)
    if not allowed:
        return False, {**base, "skip_reason": reason}

    if trip_id and category in {
        NotificationCategory.RIDES,
        NotificationCategory.SAFETY,
        NotificationCategory.PAYMENTS,
    }:
        ok_part, part_reason = await _trip_participant_allows(user_id, trip_id, kind)
        if not ok_part:
            return False, {**base, "skip_reason": part_reason}

    rider_status: Optional[dict[str, Any]] = None
    driver_status: Optional[dict[str, Any]] = None
    if role == "driver":
        driver_status = await _driver_account_status(user_id, user)
        base["driver_account_status"] = driver_status.get("status")
        base["driver_profile_completed"] = driver_status.get("profile_completed")
        if driver_status.get("status") == "deactivated":
            return False, {**base, "skip_reason": "driver_account_deactivated"}
        if kind == "ride_request":
            if driver_status.get("status") != "active":
                return False, {**base, "skip_reason": "driver_account_not_active"}
            if not driver_status.get("profile_exists"):
                return False, {**base, "skip_reason": "driver_profile_missing"}
        if category in {NotificationCategory.DRIVER_ENGAGEMENT, NotificationCategory.EARNINGS, NotificationCategory.WORK_ZONE}:
            if driver_status.get("status") != "active":
                return False, {**base, "skip_reason": "driver_account_not_active"}
            if not driver_status.get("profile_exists"):
                return False, {**base, "skip_reason": "driver_profile_missing"}
    elif role == "rider":
        rider_status = _rider_account_status(user)
        base["rider_account_status"] = rider_status.get("status")
        if rider_status.get("status") == "deactivated":
            return False, {**base, "skip_reason": "rider_account_deactivated"}
        if category in {NotificationCategory.RIDER_ENGAGEMENT, NotificationCategory.MARKETING, NotificationCategory.RIDER_OPS}:
            if rider_status.get("status") != "active":
                return False, {**base, "skip_reason": "rider_account_not_active"}

    return True, {**base, "delivery_guard": "passed"}


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
    raw_data = dict(data or {})
    if not str(raw_data.get("type") or "").strip() and source in {"admin_broadcast", "scheduled"}:
        raw_data["type"] = "admin_broadcast"
    merged: dict = enrich_push_data(raw_data)
    nid = str(merged.get("nid") or uuid.uuid4())
    merged["nid"] = nid
    if merged.get("type") is not None:
        merged["type"] = str(merged["type"])
    template = str(merged.get("type") or "").strip()
    trip_id = str(merged.get("trip_id") or "").strip() or None

    user = await db.users.find_one(
        {"id": user_id},
        {
            "push_token": 1,
            "push_devices": 1,
            "email": 1,
            "role": 1,
            "is_active": 1,
            "is_deactivated": 1,
            "blocked": 1,
            "suspended_until": 1,
            "is_verified": 1,
            "notifications_enabled": 1,
            "notification_channels": 1,
            "notification_types": 1,
            "timezone": 1,
            "time_zone": 1,
        },
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
        log_notification_decision(
            user_id=user_id,
            role=None,
            notification_type=template,
            audience="unknown",
            template=template,
            delivered=False,
            skipped_reason="no_user",
            source=source,
            trip_id=trip_id,
        )
        return False

    delivery_allowed, guard = await _validate_push_delivery(
        user_id, user, template, source, trip_id=trip_id
    )
    event_base = {
        "nid": nid,
        "template": template or None,
        "notification_type": template or None,
        "audience": guard.get("audience"),
        "user_role": guard.get("user_role"),
        "category": guard.get("category"),
        "delivery_guard": guard.get("delivery_guard"),
        "skip_reason": guard.get("skip_reason"),
        "driver_account_status": guard.get("driver_account_status"),
        "rider_account_status": guard.get("rider_account_status"),
        "trip_id": trip_id,
        **({"experiment_key": experiment_key} if experiment_key else {}),
        **({"variant": variant} if variant else {}),
    }
    if not delivery_allowed:
        reason = str(guard.get("skip_reason") or "delivery_guard_blocked")
        log_notification_decision(
            user_id=user_id,
            role=guard.get("user_role"),
            notification_type=template,
            audience=str(guard.get("audience") or ""),
            template=template,
            delivered=False,
            skipped_reason=reason,
            source=source,
            trip_id=trip_id,
        )
        await _record_event(user_id, title, body, "none", "skipped", source, event_base)
        return False

    intended_role = str(merged.get("role") or "").strip().lower()
    user_role = str(user.get("role") or "").strip().lower()
    if intended_role in {"driver", "rider"} and user_role and intended_role != user_role:
        reason = "payload_role_mismatch"
        log_notification_decision(
            user_id=user_id,
            role=user_role,
            notification_type=template,
            audience=str(guard.get("audience") or ""),
            template=template,
            delivered=False,
            skipped_reason=reason,
            source=source,
            trip_id=trip_id,
        )
        await _record_event(
            user_id,
            title,
            body,
            "none",
            "skipped",
            source,
            {**event_base, "skip_reason": reason},
        )
        return False

    delivery_key: Optional[str] = None
    category = normalize_category(guard.get("category"))
    if should_dedupe_notification(
        category=category, source=source, notification_type=template, trip_id=trip_id
    ):
        local_now = datetime.now(timezone.utc)
        tz_name = str(user.get("timezone") or user.get("time_zone") or "").strip() or "Africa/Lagos"
        try:
            from zoneinfo import ZoneInfo

            local_now = datetime.now(ZoneInfo(tz_name))
        except Exception:
            pass
        weekend = local_now.weekday() >= 5
        explicit_slot = (
            str(
                merged.get("slot")
                or merged.get("time_slot")
                or merged.get("offer_id")
                or merged.get("delivery_slot")
                or ""
            ).strip()
            or None
        )
        time_slot = infer_time_slot(local_now.hour, weekend=weekend, explicit=explicit_slot) if not trip_id else (
            explicit_slot or "event"
        )
        delivery_window = str(
            merged.get("delivery_window")
            or (f"trip:{trip_id}" if trip_id else infer_delivery_window(local_now.hour, weekend=weekend))
        )
        local_date = str(merged.get("local_date") or local_now.strftime("%Y-%m-%d"))
        claimed, claim_meta = await claim_notification_delivery(
            user_id=user_id,
            role=user_role,
            notification_type=template,
            audience=str(guard.get("audience") or ""),
            template=template,
            local_date=local_date,
            time_slot=time_slot,
            delivery_window=delivery_window,
            source=source,
            title=title,
            body=body,
            trip_id=trip_id,
        )
        if not claimed:
            reason = str(claim_meta.get("skip_reason") or "duplicate_delivery_key")
            event_base["skip_reason"] = reason
            event_base["delivery_key"] = claim_meta.get("delivery_key")
            await _record_event(user_id, title, body, "none", "skipped", source, event_base)
            return False
        delivery_key = str(claim_meta["delivery_key"])
        merged["delivery_key"] = delivery_key
        merged["local_date"] = local_date
        merged["time_slot"] = time_slot
        event_base["delivery_key"] = delivery_key

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
        if delivery_key:
            await mark_notification_delivery(delivery_key, delivered=False, skip_reason="no_token")
        log_notification_decision(
            user_id=user_id,
            role=user_role,
            notification_type=template,
            audience=str(guard.get("audience") or ""),
            template=template,
            delivered=False,
            skipped_reason="no_token",
            delivery_key=delivery_key,
            source=source,
            trip_id=trip_id,
        )
        await _record_event(
            user_id,
            title,
            body,
            "none",
            "no_token",
            source,
            event_base,
        )
        return False

    extra: dict[str, Any] = dict(event_base)
    extra["delivery_guard"] = "passed"
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

    if delivery_key:
        await mark_notification_delivery(delivery_key, delivered=any_ok)
    log_notification_decision(
        user_id=user_id,
        role=user_role,
        notification_type=template,
        audience=str(guard.get("audience") or ""),
        template=template,
        delivered=any_ok,
        skipped_reason=None if any_ok else "delivery_failed",
        delivery_key=delivery_key,
        source=source,
        trip_id=trip_id,
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


async def record_notification_open(user_id: str, notification_id: Optional[str] = None, *, event: str = "opened") -> None:
    """Client calls when user opens a push (optional analytics).

    Pass ``nid`` from the push payload (preferred); legacy ``notification_events.id`` still works.
    """
    ts = datetime.now(timezone.utc).isoformat()
    event_name = event if event in {"opened", "dismissed", "action"} else "opened"
    try:
        if notification_id:
            engagement_update = (
                {"dismissed_at": ts, "dismissed": True}
                if event_name == "dismissed"
                else {"opened_at": ts, "opened": True}
            )
            await db.engagement_notification_log.update_many(
                {"user_id": user_id, "id": notification_id},
                {"$set": engagement_update},
            )
            event_update = {"dismissed_at": ts} if event_name == "dismissed" else {"opened_at": ts}
            res = await db.notification_events.update_many({"user_id": user_id, "nid": notification_id}, {"$set": event_update})
            if res.modified_count:
                return
            res2 = await db.notification_events.update_one(
                {"user_id": user_id, "id": notification_id},
                {"$set": event_update},
            )
            if res2.matched_count:
                return
        await db.notification_events.insert_one(
            {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "status": event_name,
                "event": event_name,
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

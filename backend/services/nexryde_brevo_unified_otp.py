"""
In-memory Brevo transactional email OTP for NEXRYDE (any userType).
Replace _store with Redis in production.
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import re
import secrets
import time
from typing import Any, Optional, Tuple

from services.brevo_transactional_mail import BrevoMailError, brevo_send_transactional

logger = logging.getLogger("server")

OTP_EXPIRY_SECONDS = 600  # 10 minutes
RESEND_COOLDOWN_SECONDS = 60  # 1 per minute per email (per spec)
MAX_VERIFY_ATTEMPTS = 5
OTP_LENGTH = 6

GENERIC_VERIFY_FAIL = (
    "Verification could not be completed. Check your code or request a new one."
)
GENERIC_REQUEST_RATE = "Too many requests. Please wait before requesting another code."
GENERIC_SERVER = "Unable to send the code right now. Please try again shortly."

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")

_store: dict[str, dict[str, Any]] = {}
_lock = asyncio.Lock()


def _normalize_email(email: str) -> str:
    return (email or "").strip().lower()


def _pepper() -> str:
    return (os.environ.get("BREVO_OTP_PEPPER") or os.environ.get("JWT_SECRET") or "nexryde-brevo-otp-dev").strip()


def _hash_otp(code: str) -> str:
    return hashlib.sha256(f"{_pepper()}:{code}".encode()).hexdigest()


def _display_user_type(user_type: str) -> str:
    u = (user_type or "user").strip()
    if not u:
        return "Account"
    return u.replace("_", " ").replace("-", " ").title()


def _generate_code() -> str:
    return "".join(str(secrets.randbelow(10)) for _ in range(OTP_LENGTH))


def _build_email_html(*, code: str, user_type_label: str, expiry_minutes: int = 10) -> str:
    # NEXRYDE brand (matches app)
    green = "#3AD173"
    blue = "#3A8CD1"
    midnight = "#0D1420"
    surface = "#19253F"
    text_muted = "#94A3B8"
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>NEXRYDE verification</title>
</head>
<body style="margin:0;padding:0;background:{midnight};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:{midnight};padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:520px;background:linear-gradient(145deg,{surface},{midnight});border-radius:24px;border:1px solid rgba(255,255,255,.12);overflow:hidden;">
          <tr>
            <td style="padding:28px 28px 8px;text-align:center;">
              <table role="presentation" align="center" cellspacing="8" cellpadding="0">
                <tr>
                  <td style="width:28px;height:56px;background:linear-gradient(180deg,{green},{green});border-radius:6px 0 0 6px;"></td>
                  <td style="width:8px;"></td>
                  <td style="width:28px;height:56px;background:linear-gradient(180deg,{blue},#1A5AA6);border-radius:0 6px 6px 0;"></td>
                </tr>
              </table>
              <p style="margin:20px 0 4px;font-size:13px;font-weight:700;color:{text_muted};letter-spacing:.06em;text-transform:uppercase;">Welcome to</p>
              <h1 style="margin:0;font-size:28px;font-weight:900;letter-spacing:-.5px;">
                <span style="color:#fff;">NEX</span><span style="color:{green};">RYDE</span>
              </h1>
              <p style="margin:8px 0 0;font-size:14px;color:{text_muted};font-weight:600;">{user_type_label} verification</p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 28px;">
              <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#E2E8F0;">
                Use this one-time code to continue. It expires in <strong style="color:#fff;">{expiry_minutes} minutes</strong>.
              </p>
              <div style="text-align:center;margin:24px 0;">
                <span style="display:inline-block;padding:16px 32px;font-size:28px;font-weight:800;letter-spacing:8px;color:#fff;background:rgba(13,20,32,.85);border-radius:16px;border:1px solid rgba(58,209,115,.45);">
                  {code}
                </span>
              </div>
              <p style="margin:0 0 12px;font-size:13px;line-height:1.55;color:{text_muted};">
                <strong style="color:#CBD5E1;">Security tips</strong><br>
                Never share this code. NEXRYDE staff will never ask for it.<br>
                If you didn't request this, you can safely ignore this email.
              </p>
              <hr style="border:none;border-top:1px solid rgba(255,255,255,.1);margin:20px 0;">
              <p style="margin:0;font-size:12px;color:{text_muted};text-align:center;">
                Nigeria's Premium Ride Experience • <span style="color:{green};">nexrydeapp.com</span>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""


async def send_brevo_otp_email(*, recipient: str, code: str, user_type: str) -> None:
    label = _display_user_type(user_type)
    subject = f"NEXRYDE {label} — verification code"
    text_body = (
        f"Your NEXRYDE {label} verification code is {code}. "
        f"It expires in {OTP_EXPIRY_SECONDS // 60} minutes.\n\n"
        "Never share this code. If you did not request this, ignore this email."
    )
    try:
        await brevo_send_transactional(
            recipients=[recipient],
            subject=subject,
            html_content=_build_email_html(
                code=code, user_type_label=label, expiry_minutes=OTP_EXPIRY_SECONDS // 60
            ),
            text_content=text_body,
            tags=["nexryde-otp", "unified-email-otp"],
        )
    except BrevoMailError:
        logger.error("Brevo unified OTP send failed (misconfigured API or upstream error)")
        raise RuntimeError(GENERIC_SERVER) from None


async def request_otp(*, email_raw: str, user_type_raw: str) -> Tuple[bool, Optional[str]]:
    """
    Stores OTP (hashed). Returns (success, None) or (False, generic_error_detail).
    """
    email = _normalize_email(email_raw)
    ut = (user_type_raw if user_type_raw is not None else "user").strip() or "user"

    if not EMAIL_RE.fullmatch(email):
        return False, "Invalid email format."

    now = time.time()
    code = _generate_code()
    rec = {
        "otp_hash": _hash_otp(code),
        "expires_at": now + OTP_EXPIRY_SECONDS,
        "attempts": 0,
        "last_sent_at": now,
        "user_type": ut,
    }

    async with _lock:
        existing = _store.get(email)
        if existing:
            last = float(existing.get("last_sent_at", 0))
            if now - last < RESEND_COOLDOWN_SECONDS:
                return False, GENERIC_REQUEST_RATE
        _store[email] = rec

    try:
        await send_brevo_otp_email(recipient=email, code=code, user_type=ut)
    except RuntimeError as e:
        async with _lock:
            _store.pop(email, None)
        msg = str(e) if str(e) else GENERIC_SERVER
        return False, msg
    except Exception:
        logger.exception("Brevo unified OTP unexpected send error")
        async with _lock:
            _store.pop(email, None)
        return False, GENERIC_SERVER

    return True, None


async def verify_otp(*, email_raw: str, code_raw: str) -> Tuple[bool, Optional[str], Optional[str]]:
    """
    Returns (ok, session_token_or_none, error_message_or_none).
    """
    email = _normalize_email(email_raw)
    code = (code_raw or "").strip()

    if not EMAIL_RE.fullmatch(email):
        return False, None, GENERIC_VERIFY_FAIL

    if not code.isdigit() or len(code) != OTP_LENGTH:
        return False, None, GENERIC_VERIFY_FAIL

    async with _lock:
        rec = _store.get(email)
        now = time.time()

        if not rec:
            return False, None, GENERIC_VERIFY_FAIL

        if now > float(rec["expires_at"]):
            _store.pop(email, None)
            return False, None, GENERIC_VERIFY_FAIL

        if not secrets.compare_digest(rec["otp_hash"], _hash_otp(code)):
            rec["attempts"] = int(rec.get("attempts", 0)) + 1
            if rec["attempts"] >= MAX_VERIFY_ATTEMPTS:
                _store.pop(email, None)
            return False, None, GENERIC_VERIFY_FAIL

        _store.pop(email, None)

    token = secrets.token_urlsafe(48)
    return True, token, None


async def otp_status(*, email_raw: str) -> dict[str, Any]:
    """Debug/read-only status for pending OTP."""
    email = _normalize_email(email_raw)
    if not EMAIL_RE.fullmatch(email):
        return {
            "ok": False,
            "pending": False,
            "message": "Invalid email format.",
        }

    async with _lock:
        rec = _store.get(email)
        now = time.time()

        if not rec:
            return {
                "ok": True,
                "pending": False,
                "expires_in_seconds": None,
                "verification_attempts_remaining": None,
                "resend_available_in_seconds": None,
                "user_type_hint": None,
            }

        exp = float(rec["expires_at"])
        pending = now <= exp
        attempts_used = int(rec.get("attempts", 0))
        remaining = max(0, MAX_VERIFY_ATTEMPTS - attempts_used)
        ttl = max(0, int(exp - now)) if pending else 0

        last = float(rec.get("last_sent_at", 0))
        resend_cd = max(0, int(RESEND_COOLDOWN_SECONDS - (now - last)))

        return {
            "ok": True,
            "pending": pending,
            "expires_in_seconds": ttl if pending else None,
            "verification_attempts_remaining": remaining if pending else None,
            "resend_available_in_seconds": resend_cd if resend_cd > 0 else 0,
            "user_type_hint": rec.get("user_type"),
        }


def purge_expired(now: Optional[float] = None) -> int:
    """Best-effort sync cleanup (called from debug or optional ticker). Sync only — use sparingly."""

    def _purge():
        ts = now if now is not None else time.time()
        dead = [k for k, v in _store.items() if ts > float(v.get("expires_at", 0))]
        for k in dead:
            _store.pop(k, None)
        return len(dead)

    try:
        return _purge()
    except Exception:
        return 0

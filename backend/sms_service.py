"""Outbound SMS for OTP/emergency — Termii (NG) or Twilio.

Env:
  SMS_PROVIDER=termii|twilio|mock|off  (default: auto-detect from keys, else off)
  TERMII_API_KEY, TERMII_SENDER_ID (default: NEXRYDE)
  TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER
  SMS_OTP_MOCK=true → mock success (logs body, does not send)
"""
from __future__ import annotations

import logging
import os
import re
from typing import Optional

import httpx

logger = logging.getLogger(__name__)


def _env_truthy(name: str) -> bool:
    return (os.environ.get(name) or "").strip().lower() in {"1", "true", "yes", "on"}


def normalize_ng_phone(phone: str) -> Optional[str]:
    """Return E.164-ish digits for Nigeria when possible (234…)."""
    digits = re.sub(r"\D", "", str(phone or ""))
    if not digits:
        return None
    if digits.startswith("234") and len(digits) >= 13:
        return digits
    if digits.startswith("0") and len(digits) == 11:
        return "234" + digits[1:]
    if len(digits) == 10:
        return "234" + digits
    if digits.startswith("234"):
        return digits
    return digits


def _resolve_provider() -> str:
    explicit = (os.environ.get("SMS_PROVIDER") or "").strip().lower()
    if explicit in {"termii", "twilio", "mock", "off"}:
        return explicit
    if _env_truthy("SMS_OTP_MOCK"):
        return "mock"
    if (os.environ.get("TERMII_API_KEY") or "").strip():
        return "termii"
    if (os.environ.get("TWILIO_ACCOUNT_SID") or "").strip() and (
        os.environ.get("TWILIO_AUTH_TOKEN") or ""
    ).strip():
        return "twilio"
    return "off"


async def send_sms(phone: str, message: str, *, purpose: str = "notify") -> bool:
    """Send SMS. Returns True on accepted/sent; False if skipped or failed."""
    to = normalize_ng_phone(phone)
    if not to or not (message or "").strip():
        return False

    provider = _resolve_provider()
    body = str(message).strip()[:640]

    if provider in {"off", ""}:
        logger.info("sms_skipped provider=off purpose=%s to=%s…", purpose, to[:6])
        return False

    if provider == "mock":
        logger.warning("[SMS_MOCK] purpose=%s to=%s body=%s", purpose, to, body[:120])
        return True

    try:
        if provider == "termii":
            return await _send_termii(to, body, purpose=purpose)
        if provider == "twilio":
            return await _send_twilio(to, body, purpose=purpose)
    except Exception:
        logger.exception("sms_send_failed provider=%s purpose=%s to=%s…", provider, purpose, to[:6])
        return False
    return False


async def _send_termii(to: str, body: str, *, purpose: str) -> bool:
    api_key = (os.environ.get("TERMII_API_KEY") or "").strip()
    sender = (os.environ.get("TERMII_SENDER_ID") or "NEXRYDE").strip() or "NEXRYDE"
    if not api_key:
        return False
    payload = {
        "to": to,
        "from": sender[:11],
        "sms": body,
        "type": "plain",
        "channel": "generic",
        "api_key": api_key,
    }
    async with httpx.AsyncClient(timeout=12.0) as client:
        res = await client.post("https://api.ng.termii.com/api/sms/send", json=payload)
    if res.status_code >= 400:
        logger.warning(
            "termii_sms_fail purpose=%s status=%s body=%s",
            purpose,
            res.status_code,
            (res.text or "")[:200],
        )
        return False
    logger.info("termii_sms_ok purpose=%s to=%s…", purpose, to[:6])
    return True


async def _send_twilio(to: str, body: str, *, purpose: str) -> bool:
    sid = (os.environ.get("TWILIO_ACCOUNT_SID") or "").strip()
    token = (os.environ.get("TWILIO_AUTH_TOKEN") or "").strip()
    from_num = (os.environ.get("TWILIO_FROM_NUMBER") or "").strip()
    if not sid or not token or not from_num:
        return False
    url = f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json"
    data = {"To": f"+{to}" if not to.startswith("+") else to, "From": from_num, "Body": body}
    async with httpx.AsyncClient(timeout=12.0) as client:
        res = await client.post(url, data=data, auth=(sid, token))
    if res.status_code >= 400:
        logger.warning(
            "twilio_sms_fail purpose=%s status=%s body=%s",
            purpose,
            res.status_code,
            (res.text or "")[:200],
        )
        return False
    logger.info("twilio_sms_ok purpose=%s to=%s…", purpose, to[:6])
    return True

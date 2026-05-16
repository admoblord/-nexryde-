"""
Single entry point for Brevo transactional email (SMTP API v3).
All product emails should go through ``brevo_send_transactional`` when Brevo is configured.
"""
from __future__ import annotations

import html
import logging
import os
from typing import Sequence

import httpx

logger = logging.getLogger(__name__)


class BrevoMailError(RuntimeError):
    """Brevo API misconfiguration or rejected send."""


def brevo_api_key_and_base() -> tuple[str, str]:
    key = os.environ.get("BREVO_API_KEY", "").strip()
    base = (os.environ.get("BREVO_API_BASE") or "https://api.brevo.com/v3").rstrip("/")
    return key, base


def brevo_default_sender() -> tuple[str, str]:
    sender_email = (
        os.environ.get("BREVO_SENDER_EMAIL") or os.environ.get("EMAIL_OTP_FROM") or ""
    ).strip()
    sender_name = (os.environ.get("BREVO_SENDER_NAME") or "NEXRYDE").strip()
    return sender_email, sender_name


def brevo_is_configured() -> bool:
    key, _ = brevo_api_key_and_base()
    se, _ = brevo_default_sender()
    return bool(key and se)


def brevo_simple_notification_html(*, title: str, body_plain: str) -> str:
    """Branded transactional wrapper for non-OTP alerts (push mirrors, account mail)."""
    green = "#3AD173"
    midnight = "#0D1420"
    surface = "#19253F"
    muted = "#94A3B8"
    safe_title = html.escape((title or "NEXRYDE").strip() or "NEXRYDE")
    body = html.escape((body_plain or "").rstrip()).replace("\n", "<br />\n")
    return f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{safe_title}</title></head>
<body style="margin:0;padding:0;background:{midnight};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:{midnight};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:520px;background:linear-gradient(145deg,{surface},{midnight});border-radius:20px;border:1px solid rgba(255,255,255,.12);">
        <tr><td style="padding:24px 24px 8px;text-align:center;">
          <h1 style="margin:0;font-size:22px;font-weight:800;color:#fff;">{safe_title}</h1>
        </td></tr>
        <tr><td style="padding:8px 24px 28px;font-size:15px;line-height:1.55;color:#E2E8F0;">
          {body}
        </td></tr>
        <tr><td style="padding:0 24px 20px;font-size:12px;color:{muted};text-align:center;">
          <span style="color:{green};">NEXRYDE</span> · Nigeria's Premium Ride Experience
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


async def brevo_send_transactional(
    *,
    recipients: Sequence[str],
    subject: str,
    text_content: str | None = None,
    html_content: str | None = None,
    sender_email: str | None = None,
    sender_name: str | None = None,
    tags: list[str] | None = None,
) -> None:
    """
    POST /smtp/email.

    Raises BrevoMailError if not configured or Brevo returns an error status.
    """
    key, base = brevo_api_key_and_base()
    if not key:
        logger.error("Brevo transactional send skipped — BREVO_API_KEY missing")
        raise BrevoMailError("Email service not configured (BREVO_API_KEY missing).")

    def_se, def_sn = brevo_default_sender()
    from_email = (sender_email if sender_email is not None else def_se).strip()
    from_name = (sender_name if sender_name is not None else def_sn).strip()
    if not from_email:
        raise BrevoMailError("Set BREVO_SENDER_EMAIL or EMAIL_OTP_FROM to a Brevo-verified sender.")

    to_list = [{"email": e.strip()} for e in recipients if (e or "").strip()]
    if not to_list:
        raise BrevoMailError("No email recipients.")

    if not text_content and not html_content:
        raise BrevoMailError("Provide text_content and/or html_content.")

    payload: dict = {
        "sender": {"name": from_name, "email": from_email},
        "to": to_list,
        "subject": (subject or "NEXRYDE")[:998],
    }
    if html_content:
        payload["htmlContent"] = html_content
    if text_content:
        payload["textContent"] = text_content
    if tags:
        payload["tags"] = list(tags)[:16]

    url = f"{base}/smtp/email"
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(
            url,
            headers={"api-key": key, "Content-Type": "application/json"},
            json=payload,
        )

    if r.status_code >= 400:
        logger.error(
            "Brevo transactional email failed: %s %s",
            r.status_code,
            (r.text or "")[:500],
        )
        raise BrevoMailError(f"Brevo API returned HTTP {r.status_code}")

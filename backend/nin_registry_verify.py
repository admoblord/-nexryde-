"""
Nigerian NIN verification helpers.

Production authenticity requires a licensed provider (NIMC partner, YouVerify, Smile ID, etc.).
Configure ``NIN_VERIFY_WEBHOOK_URL`` with an HTTPS endpoint that accepts JSON::

    POST {"nin": "...", "full_name": "..."}
    Headers: Authorization: Bearer <NIN_VERIFY_WEBHOOK_SECRET> (optional)

Expected JSON response (flexible keys)::

    {"verified": true, "registered_name": "Surname Firstname Middlename"}
    # or {"success": true, "data": {"name": "..."}}

When no webhook is configured:
  - ``NIN_RELAX_VERIFICATION=true`` (default): format validation only — registry_checked=false.
  - ``NIN_RELAX_VERIFICATION=false``: verification fails until webhook is configured.
"""

from __future__ import annotations

import logging
import os
import re
from difflib import SequenceMatcher
from typing import Any, Dict, Optional, Tuple

import httpx

logger = logging.getLogger("server")

# Minimum similarity between submitted full_name and provider-returned name (0–1).
_NAME_MATCH_MIN = float(os.getenv("NIN_NAME_MATCH_MIN", "0.72"))


def normalize_person_name(name: str) -> str:
    return " ".join((name or "").strip().lower().split())


def name_match_ratio(submitted: str, registered: Optional[str]) -> float:
    if not registered or not str(registered).strip():
        return 1.0  # provider didn't return a name — don't block on ratio
    a, b = normalize_person_name(submitted), normalize_person_name(str(registered))
    if not a:
        return 0.0
    return SequenceMatcher(None, a, b).ratio()


def validate_nin_format(nin: str) -> Tuple[bool, str]:
    raw = (nin or "").strip()
    if not re.fullmatch(r"\d{11}", raw):
        return False, "NIN must be exactly 11 digits"
    if raw == raw[0] * 11:
        return False, "This NIN is not valid"
    return True, "ok"


def webhook_configured() -> bool:
    return bool(os.getenv("NIN_VERIFY_WEBHOOK_URL", "").strip())


async def verify_nin_with_full_name(*, nin: str, full_name: str) -> Dict[str, Any]:
    """
    Returns dict keys:
      format_ok, registry_checked, registry_verified, name_match_ok, name_match_score,
      message, provider_raw (optional small excerpt)
    """
    ok, msg = validate_nin_format(nin)
    if not ok:
        return {
            "format_ok": False,
            "registry_checked": False,
            "registry_verified": False,
            "name_match_ok": False,
            "name_match_score": 0.0,
            "message": msg,
        }

    url = os.getenv("NIN_VERIFY_WEBHOOK_URL", "").strip()
    secret = os.getenv("NIN_VERIFY_WEBHOOK_SECRET", "").strip()
    relax = os.getenv("NIN_RELAX_VERIFICATION", "true").lower() in ("1", "true", "yes", "on")

    if url:
        payload = {"nin": nin.strip(), "full_name": (full_name or "").strip()}
        headers = {"Content-Type": "application/json"}
        if secret:
            headers["Authorization"] = f"Bearer {secret}"
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(30.0)) as client:
                r = await client.post(url, json=payload, headers=headers)
                r.raise_for_status()
                data = r.json() if r.content else {}
        except httpx.HTTPStatusError as e:
            logger.warning("NIN webhook HTTP error: %s", e)
            return {
                "format_ok": True,
                "registry_checked": True,
                "registry_verified": False,
                "name_match_ok": False,
                "name_match_score": 0.0,
                "message": "Identity service unavailable. Try again shortly.",
            }
        except Exception as e:
            logger.warning("NIN webhook failed: %s", e)
            return {
                "format_ok": True,
                "registry_checked": True,
                "registry_verified": False,
                "name_match_ok": False,
                "name_match_score": 0.0,
                "message": "Could not reach NIN verification service.",
            }

        verified = bool(data.get("verified") or data.get("success"))
        reg_name = data.get("registered_name") or data.get("name")
        if isinstance(data.get("data"), dict):
            reg_name = reg_name or data["data"].get("name") or data["data"].get("full_name")

        ratio = name_match_ratio(full_name or "", reg_name if isinstance(reg_name, str) else None)
        name_ok = ratio >= _NAME_MATCH_MIN or reg_name is None or str(reg_name).strip() == ""

        if verified and reg_name and str(reg_name).strip():
            name_ok = ratio >= _NAME_MATCH_MIN

        msg_out = "NIN verified with identity registry."
        if verified and not name_ok:
            msg_out = "NIN is valid but the name on record does not closely match what you entered."
        elif not verified:
            msg_out = data.get("message") or data.get("detail") or "NIN could not be verified."

        return {
            "format_ok": True,
            "registry_checked": True,
            "registry_verified": bool(verified and name_ok),
            "name_match_ok": bool(name_ok),
            "name_match_score": round(ratio, 3),
            "message": msg_out,
            "provider_raw": {"verified": verified, "has_registered_name": bool(reg_name)},
        }

    # No webhook
    if not relax:
        return {
            "format_ok": True,
            "registry_checked": False,
            "registry_verified": False,
            "name_match_ok": False,
            "name_match_score": 0.0,
            "message": "NIN registry verification is required but NIN_VERIFY_WEBHOOK_URL is not configured.",
        }

    return {
        "format_ok": True,
        "registry_checked": False,
        "registry_verified": False,
        "name_match_ok": True,
        "name_match_score": 1.0,
        "message": "NIN format is valid. Connect NIN_VERIFY_WEBHOOK_URL for live government verification.",
    }


def completion_requires_registry_match() -> bool:
    """When True, complete-rider-verification insists on registry_verified."""
    return os.getenv("NIN_REQUIRE_REGISTRY_MATCH", "").lower() in ("1", "true", "yes", "on")


def completion_allows_format_only() -> bool:
    relax = os.getenv("NIN_RELAX_VERIFICATION", "true").lower() in ("1", "true", "yes", "on")
    return relax and not completion_requires_registry_match()

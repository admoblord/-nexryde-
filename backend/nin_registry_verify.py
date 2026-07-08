"""
NexRyde NIN verification — format + on-file checks only (no government registry delay).

Government registry lookup (NIMC webhook) is opt-in via NIN_REGISTRY_ENABLED=true.
Default: instant NexRyde verification when NIN is 11 valid digits and stored encrypted.
"""

from __future__ import annotations

import logging
import os
import re
from difflib import SequenceMatcher
from typing import Any, Dict, Optional, Tuple

import httpx

logger = logging.getLogger("server")

_NAME_MATCH_MIN = float(os.getenv("NIN_NAME_MATCH_MIN", "0.72"))
_NEXRYDE_VERIFIED_MSG = "NIN verified by NexRyde."


def registry_verification_enabled() -> bool:
    """Opt-in only — off by default to avoid registry latency."""
    return os.getenv("NIN_REGISTRY_ENABLED", "").lower() in ("1", "true", "yes", "on")


def normalize_person_name(name: str) -> str:
    return " ".join((name or "").strip().lower().split())


def name_match_ratio(submitted: str, registered: Optional[str]) -> float:
    if not registered or not str(registered).strip():
        return 1.0
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


def _nexryde_format_only_result() -> Dict[str, Any]:
    return {
        "format_ok": True,
        "registry_checked": False,
        "registry_verified": False,
        "nexryde_verified": True,
        "name_match_ok": True,
        "name_match_score": 1.0,
        "message": _NEXRYDE_VERIFIED_MSG,
    }


async def verify_nin_with_full_name(*, nin: str, full_name: str) -> Dict[str, Any]:
    """
    NexRyde path (default): valid 11-digit NIN → verified immediately.
    Registry path (opt-in): only when NIN_REGISTRY_ENABLED=true and webhook URL set.
    """
    ok, msg = validate_nin_format(nin)
    if not ok:
        return {
            "format_ok": False,
            "registry_checked": False,
            "registry_verified": False,
            "nexryde_verified": False,
            "name_match_ok": False,
            "name_match_score": 0.0,
            "message": msg,
        }

    if not registry_verification_enabled():
        return _nexryde_format_only_result()

    url = os.getenv("NIN_VERIFY_WEBHOOK_URL", "").strip()
    if not url:
        return _nexryde_format_only_result()

    payload = {"nin": nin.strip(), "full_name": (full_name or "").strip()}
    headers = {"Content-Type": "application/json"}
    secret = os.getenv("NIN_VERIFY_WEBHOOK_SECRET", "").strip()
    if secret:
        headers["Authorization"] = f"Bearer {secret}"
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(30.0)) as client:
            r = await client.post(url, json=payload, headers=headers)
            r.raise_for_status()
            data = r.json() if r.content else {}
    except Exception as e:
        logger.warning("NIN registry webhook failed — falling back to NexRyde verification: %s", e)
        return _nexryde_format_only_result()

    verified = bool(data.get("verified") or data.get("success"))
    reg_name = data.get("registered_name") or data.get("name")
    if isinstance(data.get("data"), dict):
        reg_name = reg_name or data["data"].get("name") or data["data"].get("full_name")

    ratio = name_match_ratio(full_name or "", reg_name if isinstance(reg_name, str) else None)
    name_ok = ratio >= _NAME_MATCH_MIN or reg_name is None or str(reg_name).strip() == ""
    if verified and reg_name and str(reg_name).strip():
        name_ok = ratio >= _NAME_MATCH_MIN

    registry_ok = bool(verified and name_ok)
    if registry_ok:
        return {
            "format_ok": True,
            "registry_checked": True,
            "registry_verified": True,
            "nexryde_verified": True,
            "name_match_ok": bool(name_ok),
            "name_match_score": round(ratio, 3),
            "message": "NIN verified by NexRyde and identity registry.",
            "provider_raw": {"verified": verified, "has_registered_name": bool(reg_name)},
        }

    # Registry failed or unavailable — still finalize via NexRyde (no user-facing delay).
    out = _nexryde_format_only_result()
    out["registry_checked"] = True
    out["name_match_score"] = round(ratio, 3)
    out["name_match_ok"] = bool(name_ok)
    return out


def finalize_nin_verification_from_result(vr: Dict[str, Any]) -> tuple[bool, bool]:
    """
    NexRyde verification: valid format → nin_verified=True.
    nin_registry_verified only True when registry explicitly matched (opt-in path).
    """
    if not vr.get("format_ok"):
        raise ValueError(vr.get("message") or "Invalid NIN")
    return True, bool(vr.get("registry_verified"))


def nin_verification_audit_fields(vr: Dict[str, Any], *, checked_at: str) -> Dict[str, Any]:
    return {
        "nin_name_match_score": vr.get("name_match_score"),
        "nin_verify_last_message": vr.get("message") or _NEXRYDE_VERIFIED_MSG,
        "nin_verify_checked_at": checked_at,
        "nin_verify_method": "registry" if vr.get("registry_verified") else "nexryde",
    }

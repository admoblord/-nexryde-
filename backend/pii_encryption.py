"""
Field-level encryption for government identifiers (NIN, license numbers).

Key: NIN_FERNET_KEY from Secret Manager (falls back to JWT_SECRET in dev only).
Never log plaintext values. Use nin_hash / license_hash for exact-match lookups.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import os
import re
from functools import lru_cache
from typing import Any

from cryptography.fernet import Fernet, InvalidToken

_NIN_DIGITS_RE = re.compile(r"^\d{11}$")
_LICENSE_MIN_LEN = 5


def _hash_secret() -> bytes:
    raw = (os.environ.get("NIN_HASH_SECRET") or os.environ.get("JWT_SECRET") or "nexryde-pii-hash-dev").encode()
    return raw


@lru_cache(maxsize=1)
def _fernet() -> Fernet:
    raw = (os.environ.get("NIN_FERNET_KEY") or os.environ.get("JWT_SECRET") or "nexryde-nin-pii-dev").encode()
    try:
        return Fernet(raw)
    except Exception:
        # Derive a stable Fernet key from secret material when not already url-safe base64.
        digest = hashlib.sha256(raw).digest()
        return Fernet(base64.urlsafe_b64encode(digest))


def pii_search_hash(value: str, *, prefix: str = "nin") -> str:
    """HMAC-SHA256 for indexed exact-match lookups without storing plaintext."""
    normalized = value.strip()
    if prefix == "license":
        normalized = normalized.upper()
    msg = f"{prefix}:{normalized}".encode()
    return hmac.new(_hash_secret(), msg, hashlib.sha256).hexdigest()


def encrypt_pii_value(value: str, *, kind: str = "nin") -> dict[str, str]:
    """Returns cipher + last4 + search_hash. Does not include plaintext."""
    clean = value.strip()
    if kind == "nin" and not _NIN_DIGITS_RE.fullmatch(clean):
        raise ValueError("NIN must be exactly 11 digits")
    if kind == "license" and len(clean) < _LICENSE_MIN_LEN:
        raise ValueError("License number too short")
    cipher = _fernet().encrypt(clean.encode()).decode()
    last4 = clean[-4:] if len(clean) >= 4 else clean
    return {
        "cipher": cipher,
        "last4": last4,
        "search_hash": pii_search_hash(clean, prefix=kind),
    }


def decrypt_pii_cipher(cipher: str | None) -> str | None:
    if not cipher:
        return None
    try:
        return _fernet().decrypt(cipher.encode()).decode()
    except (InvalidToken, ValueError, TypeError):
        return None


def mask_last4(last4: str | None) -> str:
    """NDPA-friendly display: *******1234"""
    if not last4:
        return ""
    tail = str(last4)[-4:]
    return f"*******{tail}" if tail else ""


def resolve_nin_plaintext(doc: dict[str, Any] | None) -> str | None:
    """Decrypt nin_cipher or read legacy plaintext nin / nin_number (migration window)."""
    if not doc:
        return None
    decrypted = decrypt_pii_cipher(doc.get("nin_cipher"))
    if decrypted:
        return decrypted
    for key in ("nin", "nin_number"):
        legacy = (doc.get(key) or "").strip()
        if legacy:
            return legacy
    return None


def resolve_driver_nin_plaintext(
    docs_row: dict[str, Any] | None,
    user: dict[str, Any] | None = None,
) -> str | None:
    """Resolve driver NIN from archive top-level, nested documents.nin, then user."""
    import base64
    import re

    docs_row = docs_row or {}
    plaintext = resolve_nin_plaintext(docs_row)
    if plaintext:
        return plaintext

    nin_doc = (docs_row.get("documents") or {}).get("nin")
    if isinstance(nin_doc, dict):
        plaintext = resolve_nin_plaintext(nin_doc)
        if plaintext:
            return plaintext
        # Legacy number-only payloads sometimes stored tiny inline base64 text.
        inline = nin_doc.get("data")
        if inline and nin_doc.get("capture_mode") == "number_only":
            try:
                raw = base64.b64decode(inline).decode("utf-8", errors="ignore").strip()
                digits = re.sub(r"\D", "", raw)
                if len(digits) == 11:
                    return digits
            except Exception:
                pass

    return resolve_nin_plaintext(user)


def resolve_license_plaintext(doc: dict[str, Any] | None) -> str | None:
    if not doc:
        return None
    decrypted = decrypt_pii_cipher(doc.get("license_number_cipher"))
    if decrypted:
        return decrypted
    legacy = (doc.get("license_number") or "").strip()
    return legacy or None


def nin_storage_fields(plaintext: str | None) -> tuple[dict[str, Any], dict[str, Any]]:
    """
    Returns ($set fields, $unset fields) for Mongo updates.
    Clears legacy plaintext nin on write.
    """
    if not plaintext or not plaintext.strip():
        return {}, {}
    enc = encrypt_pii_value(plaintext.strip(), kind="nin")
    return (
        {
            "nin_cipher": enc["cipher"],
            "nin_last4": enc["last4"],
            "nin_hash": enc["search_hash"],
        },
        {"nin": ""},
    )


def license_storage_fields(plaintext: str | None) -> tuple[dict[str, Any], dict[str, Any]]:
    if not plaintext or not plaintext.strip():
        return {}, {}
    enc = encrypt_pii_value(plaintext.strip(), kind="license")
    return (
        {
            "license_number_cipher": enc["cipher"],
            "license_last4": enc["last4"],
            "license_hash": enc["search_hash"],
        },
        {"license_number": ""},
    )


def public_nin_fields(doc: dict[str, Any] | None) -> dict[str, Any]:
    """Safe fields for API responses — never includes plaintext or cipher."""
    if not doc:
        return {
            "has_nin": False,
            "nin_masked": "",
            "nin_verified": False,
            "nin_registry_verified": False,
            "nin_verify_checked_at": None,
        }
    last4 = doc.get("nin_last4")
    if not last4:
        legacy = (doc.get("nin") or "").strip()
        last4 = legacy[-4:] if len(legacy) >= 4 else None
    if not last4:
        legacy_num = (doc.get("nin_number") or "").strip()
        last4 = legacy_num[-4:] if len(legacy_num) >= 4 else None
    has_nin = bool(
        doc.get("nin_cipher")
        or doc.get("nin_hash")
        or (doc.get("nin") or "").strip()
        or (doc.get("nin_number") or "").strip()
        or last4
    )
    return {
        "has_nin": has_nin,
        "nin_masked": mask_last4(last4) if has_nin else "",
        "nin_verified": bool(doc.get("nin_verified")),
        "nin_registry_verified": bool(doc.get("nin_registry_verified")),
        "nin_verify_checked_at": doc.get("nin_verify_checked_at"),
    }


def driver_nin_public_fields(
    docs_row: dict[str, Any] | None,
    user: dict[str, Any] | None = None,
    profile: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Merge NIN metadata from driver_documents, nested documents.nin, profile, and user."""
    docs_row = docs_row or {}
    user = user or {}
    profile = profile or {}
    merged: dict[str, Any] = {**profile, **docs_row, **user}
    nin_doc = (docs_row.get("documents") or {}).get("nin")
    if isinstance(nin_doc, dict):
        for key in ("nin_last4", "nin_cipher", "nin_hash", "nin_verified", "capture_mode"):
            if nin_doc.get(key) is not None and merged.get(key) in (None, "", False):
                merged[key] = nin_doc[key]
    result = public_nin_fields(merged)
    result["nin_capture_mode"] = docs_row.get("nin_capture_mode") or (
        nin_doc.get("capture_mode") if isinstance(nin_doc, dict) else None
    )
    result["nin_verify_method"] = (
        profile.get("nin_verify_method")
        or user.get("nin_verify_method")
        or ("nexryde" if result.get("nin_verified") else None)
    )
    return result


def public_license_fields(doc: dict[str, Any] | None) -> dict[str, Any]:
    if not doc:
        return {"has_license_number": False, "license_masked": ""}
    last4 = doc.get("license_last4")
    legacy = (doc.get("license_number") or "").strip()
    if not last4 and legacy:
        last4 = legacy[-4:] if len(legacy) >= 4 else None
    has = bool(doc.get("license_number_cipher") or doc.get("license_hash") or legacy)
    return {
        "has_license_number": has,
        "license_masked": mask_last4(last4) if has else "",
    }


def strip_sensitive_pii(doc: dict[str, Any]) -> dict[str, Any]:
    """Remove plaintext + cipher fields from a user/document dict before returning."""
    if not doc:
        return {}
    out = dict(doc)
    for key in (
        "nin",
        "nin_cipher",
        "nin_hash",
        "license_number",
        "license_number_cipher",
        "license_hash",
    ):
        out.pop(key, None)
    return out

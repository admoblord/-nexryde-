"""Parse Squad payment API payloads (no FastAPI / httpx)."""
from __future__ import annotations

import secrets
import string
import time
from typing import Any, Optional

# Squad inline checkout returns URLs like https://pay.squadco.com/{transaction_ref} (ref is the path).
# Card step validates transactionRef length 6–50.
_SQUAD_REF_MIN = 6
_SQUAD_REF_MAX = 50

# api-d.squadco.com /transaction/initiate rejects unknown keys (e.g. camelCase "transactionRef").
SQUAD_TRANSACTION_INITIATE_ALLOWED_ORDER = (
    "amount",
    "email",
    "currency",
    "initiate_type",
    "transaction_ref",
    "customer_name",
    "callback_url",
    "metadata",
    "payment_channels",
    "key",
)


def sanitize_squad_transaction_initiate_payload(body: Any) -> dict:
    """Keep only allow-listed top-level keys for Squad POST /transaction/initiate."""
    if not isinstance(body, dict):
        return {}
    out: dict = {}
    for k in SQUAD_TRANSACTION_INITIATE_ALLOWED_ORDER:
        if k in body:
            out[k] = body[k]
    return out

NEXRYDE_REF_PREFIX = "NEXRYDE"
_REF_RANDOM_LEN = 6


def extract_squad_field(payload: dict, *keys: str) -> Any:
    for key in keys:
        if "." in key:
            current = payload
            ok = True
            for part in key.split("."):
                if isinstance(current, dict) and part in current:
                    current = current[part]
                else:
                    ok = False
                    break
            if ok:
                return current
            continue
        if key in payload:
            return payload.get(key)
    return None


def squad_dynamic_va_response_ok(provider_payload: Any) -> bool:
    """POST /virtual-account/initiate-dynamic-virtual-account success shape."""
    if not isinstance(provider_payload, dict):
        return False
    if provider_payload.get("success") is True:
        return True
    st = provider_payload.get("status")
    if st == 200 or st == "200":
        return True
    msg = str(provider_payload.get("message") or "").strip().lower()
    if msg in ("success", "successful", "ok"):
        return True
    return False


def squad_initiate_response_ok(provider_payload: Any) -> bool:
    """
    Squad POST /transaction/initiate may return:
    - { "success": true, ... } (some gateways), or
    - { "status": 200, "message": "success", "data": { "checkout_url": ... } } (documented Squad shape).
    """
    if not isinstance(provider_payload, dict):
        return False
    if provider_payload.get("success") is True:
        return True
    st = provider_payload.get("status")
    if st == 200 or st == "200":
        return True
    msg = str(provider_payload.get("message") or "").strip().lower()
    if msg in ("success", "successful", "ok"):
        return True
    data = provider_payload.get("data")
    data = data if isinstance(data, dict) else {}
    if extract_squad_checkout_url(provider_payload, data):
        return True
    return False


def generate_nexryde_squad_transaction_ref() -> str:
    """
    Backend-only unique reference for Squad (inline checkout URL path + card step).
    Format: NEXRYDE_{timestamp_ms}_{random6} — same idea as the product spec (JS example).
    Allowed characters: letters, digits, underscore. Length always in [6, 50].
    """
    ts = int(time.time() * 1000)
    alphabet = string.ascii_letters + string.digits
    rand = "".join(secrets.choice(alphabet) for _ in range(_REF_RANDOM_LEN))
    ref = f"{NEXRYDE_REF_PREFIX}_{ts}_{rand}"
    if len(ref) > _SQUAD_REF_MAX:
        # Keep prefix and timestamp; trim random (extremely long ts edge case).
        head = f"{NEXRYDE_REF_PREFIX}_{ts}_"
        room = _SQUAD_REF_MAX - len(head)
        if room < 2:
            ts = ts % (10**12)
            head = f"{NEXRYDE_REF_PREFIX}_{ts}_"
            room = _SQUAD_REF_MAX - len(head)
        ref = head + rand[: max(room, 0)]
    if len(ref) > _SQUAD_REF_MAX:
        ref = ref[:_SQUAD_REF_MAX]
    if len(ref) < _SQUAD_REF_MIN:
        raise RuntimeError("generated Squad transaction ref shorter than minimum (logic bug)")
    return ref


def normalize_squad_transaction_ref(value: str, *, prefix_fallback: str = "NXWR") -> str:
    """
    Enforce Squad rules: length 6–50, only [A-Za-z0-9_].
    If invalid, generate a fresh NEXRYDE ref (never trust client-supplied values).
    prefix_fallback is ignored; kept for backward-compatible call sites.
    """
    del prefix_fallback
    s = "".join(c for c in str(value or "") if c.isalnum() or c == "_")
    if _SQUAD_REF_MIN <= len(s) <= _SQUAD_REF_MAX:
        return s
    return generate_nexryde_squad_transaction_ref()


def generate_squad_inline_transaction_ref(prefix: str = "NXWR") -> str:
    """Deprecated: use generate_nexryde_squad_transaction_ref(). Kept for tests / older imports."""
    del prefix
    return generate_nexryde_squad_transaction_ref()


_SQUAD_CHECKOUT_DOMAINS = (
    "pay.squadco.com",
    "sandbox-pay.squadco.com",
    "checkout.squadco.com",
    "sandbox-checkout.squadco.com",
    "squadco.com",
    "squad.co",
)


def _is_squad_checkout_url(url: str) -> bool:
    """Return True only if the URL belongs to Squad's own payment domains."""
    try:
        s = str(url or "").strip().lower()
        if not s.startswith("https://"):
            return False
        host = s.split("/")[2]
        return any(host == d or host.endswith("." + d) for d in _SQUAD_CHECKOUT_DOMAINS)
    except Exception:
        return False


def build_squad_checkout_url(transaction_ref: str, *, sandbox: bool = False) -> str:
    """Construct the Squad inline checkout URL from a transaction reference.

    Squad's inline checkout URL is always:
      https://pay.squadco.com/{transaction_ref}          (live)
      https://sandbox-pay.squadco.com/{transaction_ref}  (sandbox)
    This is the AUTHORITATIVE URL — it doesn't depend on what Squad returns in the
    initiate response (which sometimes omits the URL or returns the callback_url).
    """
    base = "https://sandbox-pay.squadco.com" if sandbox else "https://pay.squadco.com"
    return f"{base}/{transaction_ref}"


def extract_squad_checkout_url(provider_payload: dict, data: dict) -> Optional[str]:
    """Resolve checkout / payment URL from Squad initiate responses (field names vary by API version).

    Only URLs belonging to Squad's own domains are returned — backend callback URLs
    (e.g. nexryde-backend-*.run.app) are rejected so they are never opened in-app.
    """
    candidates: list[str] = []

    if isinstance(data, dict):
        url = extract_squad_field(
            data,
            "checkout_url",
            "authorization_url",
            "auth_url",
            "url",
            "link",
            "payment_url",
            "payment_link",
            "paymant_link",
            "checkout_link",
        )
        if url:
            candidates.append(str(url).strip())

    if isinstance(provider_payload, dict):
        url = extract_squad_field(
            provider_payload,
            "checkout_url",
            "authorization_url",
            "auth_url",
        )
        if url:
            candidates.append(str(url).strip())

        nested = provider_payload.get("data")
        if isinstance(nested, list) and nested:
            first = nested[0]
            if isinstance(first, dict):
                u = extract_squad_field(first, "checkout_url", "authorization_url", "url", "link")
                if u:
                    candidates.append(str(u).strip())

    # Return only URLs that genuinely belong to Squad's payment domains.
    # This prevents backend callback/API URLs from being treated as checkout URLs.
    for c in candidates:
        if c and _is_squad_checkout_url(c):
            return c

    return None

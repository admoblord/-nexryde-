"""Admin document / NIN reveal contracts."""
from __future__ import annotations

import base64

from pii_encryption import resolve_driver_nin_plaintext, resolve_nin_plaintext


def test_resolve_nin_plaintext_accepts_legacy_nin_number():
    assert resolve_nin_plaintext({"nin_number": "12345678901"}) == "12345678901"


def test_resolve_driver_nin_from_nested_documents_nin():
    from pii_encryption import encrypt_pii_value

    enc = encrypt_pii_value("12345678901", kind="nin")
    docs = {
        "documents": {
            "nin": {
                "capture_mode": "number_only",
                "nin_cipher": enc["cipher"],
                "nin_last4": enc["last4"],
            }
        }
    }
    assert resolve_driver_nin_plaintext(docs, user=None) == "12345678901"


def test_resolve_driver_nin_from_inline_number_only_data():
    payload = base64.b64encode(b"12345678901").decode("utf-8")
    docs = {
        "documents": {
            "nin": {
                "capture_mode": "number_only",
                "data": payload,
            }
        }
    }
    assert resolve_driver_nin_plaintext(docs, user=None) == "12345678901"


def test_resolve_driver_nin_falls_back_to_user():
    from pii_encryption import encrypt_pii_value

    enc = encrypt_pii_value("10987654321", kind="nin")
    assert resolve_driver_nin_plaintext({}, user={"nin_cipher": enc["cipher"]}) == "10987654321"


def test_csp_allows_admin_document_blob_preview(monkeypatch):
    """Admin View photo uses blob: URLs; default-src 'self' alone breaks <img>."""
    import importlib
    import sys

    monkeypatch.setenv("ALLOW_INSECURE_JWT_FOR_TESTS", "1")
    monkeypatch.setenv("JWT_SECRET", "test-csp-jwt-secret")
    sys.modules.pop("security_advanced", None)
    sa = importlib.import_module("security_advanced")
    csp = sa.SECURITY_HEADERS["Content-Security-Policy"]
    assert "img-src" in csp and "blob:" in csp and "data:" in csp
    assert "frame-src" in csp

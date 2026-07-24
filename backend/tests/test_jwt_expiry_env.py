"""JWT_EXPIRY_HOURS must be honored (Cloud Run sets 24)."""
from __future__ import annotations

import importlib
import os


def test_jwt_expiry_hours_reads_env(monkeypatch):
    monkeypatch.setenv("JWT_EXPIRY_HOURS", "24")
    monkeypatch.setenv("JWT_SECRET", "test-secret-for-jwt-expiry-unit")
    monkeypatch.setenv("ALLOW_INSECURE_JWT_FOR_TESTS", "1")
    import security_advanced as sa

    importlib.reload(sa)
    assert sa.JWT_EXPIRY_HOURS == 24
    # restore defaults for other tests
    monkeypatch.setenv("JWT_EXPIRY_HOURS", "24")
    importlib.reload(sa)


def test_jwt_expiry_hours_caps_and_floors(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "test-secret-for-jwt-expiry-unit")
    monkeypatch.setenv("ALLOW_INSECURE_JWT_FOR_TESTS", "1")
    monkeypatch.setenv("JWT_EXPIRY_HOURS", "9999")
    import security_advanced as sa

    importlib.reload(sa)
    assert sa.JWT_EXPIRY_HOURS == 168
    monkeypatch.setenv("JWT_EXPIRY_HOURS", "0")
    importlib.reload(sa)
    assert sa.JWT_EXPIRY_HOURS == 1

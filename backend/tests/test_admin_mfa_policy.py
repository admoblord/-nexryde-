"""Admin MFA + IP helpers — Uber-grade admin gate."""
from __future__ import annotations

import importlib

from admin_auth_policy import admin_mfa_required


def test_admin_mfa_required_defaults_to_production(monkeypatch):
    monkeypatch.setenv("NEXRYDE_ENV", "production")
    monkeypatch.delenv("ADMIN_MFA_REQUIRED", raising=False)
    assert admin_mfa_required() is True


def test_admin_mfa_can_disable(monkeypatch):
    monkeypatch.setenv("NEXRYDE_ENV", "production")
    monkeypatch.setenv("ADMIN_MFA_REQUIRED", "false")
    assert admin_mfa_required() is False


def test_admin_mfa_off_outside_production(monkeypatch):
    monkeypatch.setenv("NEXRYDE_ENV", "staging")
    monkeypatch.delenv("ADMIN_MFA_REQUIRED", raising=False)
    assert admin_mfa_required() is False


def test_admin_ip_whitelist_from_env(monkeypatch):
    monkeypatch.setenv("ADMIN_IP_WHITELIST", "1.2.3.4, 5.6.7.8")
    monkeypatch.setenv("JWT_SECRET", "test-secret-admin-ip")
    monkeypatch.setenv("ALLOW_INSECURE_JWT_FOR_TESTS", "1")
    import security_advanced as sa

    importlib.reload(sa)
    assert "1.2.3.4" in sa.ADMIN_IP_WHITELIST
    assert "5.6.7.8" in sa.ADMIN_IP_WHITELIST

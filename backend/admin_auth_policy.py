"""Pure admin auth policy helpers (no FastAPI / DB imports)."""
from __future__ import annotations

import os


def is_production_env() -> bool:
    return os.environ.get("NEXRYDE_ENV", os.environ.get("ENVIRONMENT", "production")).strip().lower() == "production"


def admin_mfa_required() -> bool:
    """Uber-grade: MFA on by default in production; override with ADMIN_MFA_REQUIRED."""
    raw = (os.environ.get("ADMIN_MFA_REQUIRED") or "").strip().lower()
    if raw in {"1", "true", "yes", "on"}:
        return True
    if raw in {"0", "false", "no", "off"}:
        return False
    return is_production_env()

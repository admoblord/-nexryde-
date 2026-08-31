#!/usr/bin/env python3
"""Validate that a non-Cloud-Run host has the env vars cutover needs.

Run on the Emergent box after copying .env.emergent.example → .env:

    cd backend && python scripts/check_emergent_env.py

Exit 0 = ready to take traffic (Mongo allowlist still must include this host's IP).
Exit 1 = missing or Cloud-Run-shaped values that would take the API down.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

# Load backend/.env if present (Emergent hosts typically use python-dotenv elsewhere,
# but this script must work without importing the full FastAPI app).
_env_path = Path(__file__).resolve().parents[1] / ".env"
if _env_path.is_file():
    for line in _env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip().strip("'").strip('"')
        os.environ.setdefault(key, val)


def _get(name: str) -> str:
    return (os.environ.get(name) or "").strip()


def main() -> int:
    errors: list[str] = []
    warnings: list[str] = []

    required = [
        "MONGODB_URI",
        "DB_NAME",
        "JWT_SECRET",
        "GOOGLE_MAPS_API_KEY",
        "TRUSTED_HOSTS",
        "NEXRYDE_PUBLIC_BACKEND_URL",
    ]
    for key in required:
        if not _get(key):
            errors.append(f"missing {key}")

    public = _get("NEXRYDE_PUBLIC_BACKEND_URL")
    if public and "run.app" in public:
        errors.append(
            "NEXRYDE_PUBLIC_BACKEND_URL still points at Cloud Run — "
            "Squad callbacks will send riders back to the old host"
        )

    trusted = _get("TRUSTED_HOSTS")
    if trusted and "run.app" in trusted and "emergent" not in trusted.lower():
        warnings.append(
            "TRUSTED_HOSTS still looks Cloud-Run-only; add the Emergent hostname"
        )

    redis_url = _get("REDIS_URL") or _get("REDISCLOUD_URL")
    redis_required = _get("REDIS_REQUIRED").lower() != "false"
    env_prod = (_get("NEXRYDE_ENV") or _get("ENVIRONMENT") or "development").lower() == "production"
    if env_prod and redis_required:
        if not redis_url:
            errors.append("REDIS_URL required in production unless REDIS_REQUIRED=false")
        elif "10." in redis_url or "192.168." in redis_url or "172." in redis_url:
            warnings.append(
                "REDIS_URL looks like a private Memorystore address — "
                "unreachable off Cloud Run; set REDIS_REQUIRED=false or use Upstash"
            )

    cred_path = _get("GOOGLE_APPLICATION_CREDENTIALS")
    cred_b64 = _get("FIREBASE_SERVICE_ACCOUNT_JSON_BASE64")
    if not cred_b64 and (not cred_path or not Path(cred_path).is_file()):
        warnings.append(
            "no Firebase credentials — push notifications will be disabled "
            "(set FIREBASE_SERVICE_ACCOUNT_JSON_BASE64 on Emergent)"
        )
    if cred_path.startswith("/secrets/"):
        warnings.append(
            "GOOGLE_APPLICATION_CREDENTIALS points at a Cloud Run secret mount "
            "(/secrets/...) — use a host path or FIREBASE_SERVICE_ACCOUNT_JSON_BASE64"
        )

    ops = _get("NEXRYDE_OPS_KEY")
    if not ops:
        warnings.append("NEXRYDE_OPS_KEY empty — maintenance-tick cron cannot authenticate")

    for w in warnings:
        print(f"WARN  {w}")
    for e in errors:
        print(f"ERROR {e}")

    if errors:
        print("NOT READY — fix the errors above before pointing the app at this host")
        return 1
    print("OK — env looks Emergent-ready (still add egress IP to Atlas, then /api/health/ready)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

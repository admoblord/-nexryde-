"""HTTP API path classification for auth middleware (no FastAPI import)."""

from __future__ import annotations

# Keep in sync with AuthMiddleware in server.py — single source for tests + docs.
PUBLIC_PATH_PREFIXES: tuple[str, ...] = (
    "/api/auth/",
    "/api/health",
    "/api/places/",
    "/docs",
    "/openapi.json",
    "/admin",
    "/api/fare/estimate",
    "/api/squad/",
    "/api/subscriptions/config",
    "/api/tiers/config",
    "/api/payment/squad-webhook-dlq",
    "/api/ws/",
    "/api/admin/login",
    # Read-only helpers used before/during login (still enforced inside routers where needed)
    "/api/chat/presets",
    "/api/subscription/pricing",
    # Crime / route heuristics (read-only, safe to expose before login for booking UX)
    "/api/safety/real-crime-data",
    "/api/safety/route-safety",
    "/api/safety/live-health",
)

# Note: middleware checks PUBLIC_PATH_PREFIXES first. /api/payment/squad-webhook-dlq* is public
# even though it also matches the /api/payment/ protected prefix below.
PROTECTED_PATH_PREFIXES: tuple[str, ...] = (
    "/api/trips/",
    "/api/users/",
    "/api/drivers/",
    "/api/driver/",
    "/api/payment/",
    "/api/subscriptions/",
    "/api/subscription/",
    "/api/wallet",
    "/api/sos/",
    "/api/chat/",
    "/api/admin/",
    "/api/rides/",
    "/api/community/",
    "/api/safety/",
    "/api/shield/",
)


def api_path_is_public(path: str) -> bool:
    if path in ("/", "/api/"):
        return True
    return any(path.startswith(p) for p in PUBLIC_PATH_PREFIXES)


def api_path_is_protected(path: str) -> bool:
    return any(path.startswith(p) for p in PROTECTED_PATH_PREFIXES)

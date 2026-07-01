"""Rate-limit helpers — backed by security_advanced.RateLimiter (Redis)."""
from __future__ import annotations

# SlowAPI has been removed. All route-level limiting now goes through
# security_advanced.general_limiter / trip_request_limiter.
# This module is kept as a stub so any residual imports don't crash.

class _NoopLimiter:
    """Drop-in stub that silently passes every call."""
    def limit(self, *args, **kwargs):
        def decorator(fn):
            return fn
        return decorator

    async def check_rate_limit(self, *args, **kwargs):
        return

limiter = _NoopLimiter()

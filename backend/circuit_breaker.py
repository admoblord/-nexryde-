"""
Circuit breaker + retry utilities for external service calls.

Prevents cascading failures when Google Maps, MongoDB, or Redis degrade.
Pattern: CLOSED → OPEN (after N failures) → HALF-OPEN (after timeout) → CLOSED

Usage:
    cb = CircuitBreaker("google_maps", failure_threshold=5, recovery_timeout=30)

    @cb.protected
    async def get_geocode(address: str):
        return await _call_google(address)
"""
from __future__ import annotations

import asyncio
import functools
import logging
import time
from enum import Enum
from typing import Any, Callable, Optional

logger = logging.getLogger("circuit_breaker")


class CBState(str, Enum):
    CLOSED = "closed"        # normal — requests pass through
    OPEN = "open"            # tripped — requests fail fast
    HALF_OPEN = "half_open"  # recovery probe — one request allowed


class CircuitBreakerOpen(Exception):
    """Raised when a circuit breaker is open and the call is rejected."""
    def __init__(self, name: str):
        super().__init__(f"Circuit breaker '{name}' is OPEN — service unavailable")
        self.service = name


class CircuitBreaker:
    """
    Async-safe circuit breaker.

    Args:
        name:              Human-readable service name (used in logs/metrics).
        failure_threshold: Consecutive failures before tripping open.
        recovery_timeout:  Seconds in OPEN state before trying HALF-OPEN.
        success_threshold: Successes in HALF-OPEN required to close again.
    """

    def __init__(
        self,
        name: str,
        *,
        failure_threshold: int = 5,
        recovery_timeout: float = 30.0,
        success_threshold: int = 2,
    ) -> None:
        self.name = name
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.success_threshold = success_threshold

        self._state = CBState.CLOSED
        self._failures = 0
        self._successes = 0
        self._opened_at: Optional[float] = None
        self._lock = asyncio.Lock()

    @property
    def state(self) -> CBState:
        return self._state

    async def _transition(self, new_state: CBState) -> None:
        if new_state == self._state:
            return
        logger.warning(
            "circuit_breaker state_change service=%s %s→%s failures=%d",
            self.name, self._state.value, new_state.value, self._failures,
        )
        self._state = new_state
        if new_state == CBState.OPEN:
            self._opened_at = time.monotonic()
        elif new_state == CBState.CLOSED:
            self._failures = 0
            self._successes = 0
            self._opened_at = None

    async def _should_allow(self) -> bool:
        async with self._lock:
            if self._state == CBState.CLOSED:
                return True
            if self._state == CBState.OPEN:
                elapsed = time.monotonic() - (self._opened_at or 0)
                if elapsed >= self.recovery_timeout:
                    await self._transition(CBState.HALF_OPEN)
                    return True
                return False
            # HALF_OPEN: allow one probe
            return True

    async def record_success(self) -> None:
        async with self._lock:
            if self._state == CBState.HALF_OPEN:
                self._successes += 1
                if self._successes >= self.success_threshold:
                    await self._transition(CBState.CLOSED)
            elif self._state == CBState.CLOSED:
                self._failures = 0

    async def record_failure(self) -> None:
        async with self._lock:
            self._failures += 1
            if self._state in (CBState.CLOSED, CBState.HALF_OPEN):
                if self._failures >= self.failure_threshold:
                    await self._transition(CBState.OPEN)

    async def call(self, fn: Callable, *args: Any, **kwargs: Any) -> Any:
        if not await self._should_allow():
            raise CircuitBreakerOpen(self.name)
        try:
            result = await fn(*args, **kwargs)
            await self.record_success()
            return result
        except CircuitBreakerOpen:
            raise
        except Exception as exc:
            await self.record_failure()
            raise

    def protected(self, fn: Callable) -> Callable:
        """Decorator that wraps an async function with this circuit breaker."""
        @functools.wraps(fn)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            return await self.call(fn, *args, **kwargs)
        return wrapper

    def status(self) -> dict:
        return {
            "name": self.name,
            "state": self._state.value,
            "failures": self._failures,
            "recovery_timeout_s": self.recovery_timeout,
            "opened_at": self._opened_at,
        }


# ── Retry with exponential backoff ────────────────────────────────────────────

async def retry_async(
    fn: Callable,
    *args: Any,
    max_attempts: int = 3,
    base_delay: float = 0.5,
    max_delay: float = 10.0,
    retryable_exceptions: tuple = (Exception,),
    **kwargs: Any,
) -> Any:
    """
    Retry `fn(*args, **kwargs)` with exponential backoff.

    Args:
        max_attempts:          Total attempts (1 = no retry).
        base_delay:            Initial delay in seconds.
        max_delay:             Cap on delay.
        retryable_exceptions:  Only retry these exception types.
    """
    last_exc: Optional[Exception] = None
    for attempt in range(max_attempts):
        try:
            return await fn(*args, **kwargs)
        except retryable_exceptions as exc:  # type: ignore[misc]
            last_exc = exc
            if attempt < max_attempts - 1:
                delay = min(base_delay * (2 ** attempt), max_delay)
                logger.warning(
                    "retry attempt=%d/%d fn=%s err=%s delay=%.1fs",
                    attempt + 1, max_attempts, getattr(fn, "__name__", "?"), exc, delay,
                )
                await asyncio.sleep(delay)
    raise last_exc  # type: ignore[misc]


# ── Singleton circuit breakers for NexRyde services ───────────────────────────

google_maps_cb = CircuitBreaker(
    "google_maps",
    failure_threshold=5,
    recovery_timeout=30.0,
    success_threshold=2,
)

squad_payments_cb = CircuitBreaker(
    "squad_payments",
    failure_threshold=3,
    recovery_timeout=60.0,
    success_threshold=1,
)

redis_cb = CircuitBreaker(
    "redis",
    failure_threshold=10,
    recovery_timeout=15.0,
    success_threshold=3,
)

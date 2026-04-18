"""Shared SlowAPI limiter for expensive / abuse-prone HTTP routes."""

from slowapi import Limiter
from slowapi.util import get_remote_address

# Per-IP limits; tune via decorators on individual routes.
limiter = Limiter(key_func=get_remote_address, headers_enabled=True)

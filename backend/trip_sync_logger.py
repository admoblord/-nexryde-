"""Structured logs for trip acceptance / assignment synchronization audits."""
from __future__ import annotations

import logging

logger = logging.getLogger("server")


def log_trip_sync(event: str, **fields) -> None:
    parts = [f"{k}={v}" for k, v in fields.items() if v is not None]
    logger.info("%s %s", event, " ".join(parts))

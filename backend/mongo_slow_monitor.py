"""PyMongo command listener — log only slow / failed Mongo commands.

The Cloud Monitoring policy "Database Latency > 200ms (slow mongo)" used to
count every `rt_metric latency=mongo.command_ms` line. That string was never
emitted by the app, and if it had been, the filter would have matched *all*
commands, not just slow ones.

This listener records in-process stats for every user command and emits
`rt_metric latency=mongo.slow_command_ms` only when duration >= MONGO_SLOW_MS
(default 200). The log-based metric `nexryde_mongo_slow_commands` matches that
line.
"""
from __future__ import annotations

import logging
import os
import threading
from typing import Any

from pymongo.monitoring import CommandFailedEvent, CommandListener, CommandSucceededEvent

logger = logging.getLogger("nexryde.mongo")

SLOW_MS = float(os.environ.get("MONGO_SLOW_MS", "200"))
SLOW_METRIC = "mongo.slow_command_ms"
SAMPLE_CAP = 400

# Heartbeats / auth chatter — never treat as app slowness.
_SKIP_COMMANDS = frozenset(
    {
        "hello",
        "ismaster",
        "isMaster",
        "saslStart",
        "saslContinue",
        "getnonce",
        "authenticate",
        "endSessions",
        "ping",
        "buildInfo",
        "hostInfo",
        "getLog",
        "atlashello",
        "atlasHello",
    }
)


class SlowMongoListener(CommandListener):
    def __init__(self, slow_ms: float = SLOW_MS) -> None:
        self.slow_ms = float(slow_ms)
        self._lock = threading.Lock()
        self.total = 0
        self.slow = 0
        self.failed_count = 0
        self._samples_ms: list[float] = []

    def reset_for_tests(self) -> None:
        with self._lock:
            self.total = 0
            self.slow = 0
            self.failed_count = 0
            self._samples_ms.clear()

    def _record(self, command: str, ns: str, ms: float, *, failed: bool) -> None:
        with self._lock:
            self.total += 1
            if failed:
                self.failed_count += 1
            if ms >= self.slow_ms or failed:
                self.slow += 1
            bucket = self._samples_ms
            bucket.append(ms)
            if len(bucket) > SAMPLE_CAP:
                del bucket[: SAMPLE_CAP // 2]

        if ms < self.slow_ms and not failed:
            return
        try:
            from realtime_platform.observability import observe_ms

            observe_ms(
                SLOW_METRIC,
                ms,
                command=command,
                ns=ns,
                failed="1" if failed else "0",
            )
        except Exception:
            logger.warning(
                "rt_metric latency=%s ms=%.1f tags={'command': %r, 'ns': %r, 'failed': %s}",
                SLOW_METRIC,
                ms,
                command,
                ns,
                failed,
            )

    def succeeded(self, event: CommandSucceededEvent) -> None:
        if event.command_name in _SKIP_COMMANDS:
            return
        self._record(
            event.command_name,
            f"{event.database_name}",
            event.duration_micros / 1000.0,
            failed=False,
        )

    def failed(self, event: CommandFailedEvent) -> None:
        if event.command_name in _SKIP_COMMANDS:
            return
        self._record(
            event.command_name,
            f"{event.database_name}",
            event.duration_micros / 1000.0,
            failed=True,
        )

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            vals = sorted(self._samples_ms)
            total, slow, failed = self.total, self.slow, self.failed_count
        latency: dict[str, Any] = {}
        if vals:
            latency = {
                "count": len(vals),
                "p50": vals[len(vals) // 2],
                "p95": vals[max(0, int(len(vals) * 0.95) - 1)],
                "max": vals[-1],
            }
        return {
            "slow_ms_threshold": self.slow_ms,
            "commands_total": total,
            "commands_slow": slow,
            "commands_failed": failed,
            "latency_ms": latency,
        }


slow_command_listener = SlowMongoListener()

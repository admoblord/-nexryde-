"""NexRyde Reliability Platform.

Deterministic reliability: presence, offer delivery, exactly-once accept/decline,
lifecycle transitions, completion recovery, ACK/retry/DLQ, self-healing, observability.

Ephemeral state → Redis
Durable business + DLQ → MongoDB (existing NexRyde store; not Postgres)
Transport → WebSocket + Connect-SSE (HTTP/2–3 via Cronet) + FCM fallback
"""

from realtime_platform.config import RealtimeConfig, get_realtime_config

__all__ = ["RealtimeConfig", "get_realtime_config"]

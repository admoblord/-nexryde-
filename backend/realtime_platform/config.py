from __future__ import annotations

import os
from dataclasses import dataclass


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


@dataclass(frozen=True)
class RealtimeConfig:
    """Latency + reliability knobs for the realtime platform."""

    # Presence
    presence_ttl_sec: int = 180
    heartbeat_interval_sec: int = 20
    gps_fresh_sec: int = 45
    online_ack_timeout_ms: int = 300
    offline_ack_timeout_ms: int = 300

    # Dispatch
    h3_res: int = 8
    h3_k_near: int = 2
    h3_k_far: int = 4
    dispatch_target_ms: int = 300
    offer_ttl_sec: int = 60
    offer_ack_timeout_ms: int = 2500
    offer_max_retries: int = 2
    max_offers_per_trip: int = 40

    # Delivery
    push_target_ms: int = 500
    fcm_fallback_after_ms: int = 1500
    reconnect_target_ms: int = 2000

    # Trip
    trip_lock_ttl_sec: int = 30
    accept_ack_timeout_ms: int = 300

    # Retry / DLQ
    retry_base_ms: int = 200
    retry_max_ms: int = 15_000
    dlq_collection: str = "realtime_dlq"
    event_log_collection: str = "realtime_event_log"

    # Circuit breaker
    redis_fail_threshold: int = 5
    redis_cooldown_sec: int = 20

    platform_enabled: bool = True


def get_realtime_config() -> RealtimeConfig:
    enabled = os.environ.get("NEXRYDE_REALTIME_PLATFORM", "true").lower() != "false"
    return RealtimeConfig(
        presence_ttl_sec=_int("RT_PRESENCE_TTL_SEC", 180),
        heartbeat_interval_sec=_int("RT_HEARTBEAT_INTERVAL_SEC", 20),
        gps_fresh_sec=_int("RT_GPS_FRESH_SEC", 45),
        online_ack_timeout_ms=_int("RT_ONLINE_ACK_TIMEOUT_MS", 300),
        offline_ack_timeout_ms=_int("RT_OFFLINE_ACK_TIMEOUT_MS", 300),
        h3_k_near=_int("RT_H3_K_NEAR", 2),
        h3_k_far=_int("RT_H3_K_FAR", 4),
        offer_ttl_sec=_int("RT_OFFER_TTL_SEC", 60),
        offer_ack_timeout_ms=_int("RT_OFFER_ACK_TIMEOUT_MS", 2500),
        offer_max_retries=_int("RT_OFFER_MAX_RETRIES", 2),
        max_offers_per_trip=_int("RT_MAX_OFFERS_PER_TRIP", 40),
        fcm_fallback_after_ms=_int("RT_FCM_FALLBACK_AFTER_MS", 1500),
        trip_lock_ttl_sec=_int("RT_TRIP_LOCK_TTL_SEC", 30),
        retry_base_ms=_int("RT_RETRY_BASE_MS", 200),
        retry_max_ms=_int("RT_RETRY_MAX_MS", 15_000),
        platform_enabled=enabled,
    )

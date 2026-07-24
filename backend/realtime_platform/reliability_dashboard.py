"""Reliability Dashboard — SLO board for ops (API + Prometheus text).

Surfaces:
  driver online success, offer delivery, accept latency, trip completion,
  missed offers, network/redis latency, kafka config, crash-free proxy,
  guardian tick results, delivery guarantee outcomes, device health gate.
"""
from __future__ import annotations

import time
from typing import Any

from realtime_platform.observability import snapshot

_SUCCESS = {
    "ride_delivery_success": 0.9999,
    "trip_completion_success": 0.9999,
    "crash_free_sessions": 0.999,
}


def _rate(ok: int, fail: int) -> float:
    total = ok + fail
    if total <= 0:
        return 1.0
    return ok / total


def _counter_prefix(counters: dict[str, Any], prefix: str) -> int:
    total = 0
    for k, v in counters.items():
        if k == prefix or k.startswith(prefix + ".") or k.startswith(prefix + "{"):
            try:
                total += int(v)
            except (TypeError, ValueError):
                pass
    return total


async def build_dashboard() -> dict[str, Any]:
    from realtime_platform.health_manager import probe_cluster

    health = await probe_cluster()
    snap = snapshot()
    counters = snap.get("counters") or {}
    latency = snap.get("latency_ms") or {}

    online_ok = int(counters.get("presence.online.ok") or counters.get("presence.online") or 0)
    online_err = int(counters.get("presence.online.error") or 0)
    push_acked = int(counters.get("push.delivered_acked") or 0)
    push_missed = int(counters.get("push.missed_offer") or 0)
    accept_ok = int(counters.get("trip.accept_gate.ok") or counters.get("trip.accept.ok") or 0)
    accept_fail = int(counters.get("trip.accept_gate.error") or counters.get("trip.accept.error") or 0)
    complete_ok = int(counters.get("saga.complete_run") or counters.get("saga.complete_enqueued") or 0)
    heal_ok = int(counters.get("healing.session") or counters.get("recovery.driver") or 0)

    dge_delivered = int(counters.get("delivery_guarantee.delivered") or 0)
    dge_reassigned = int(counters.get("delivery_guarantee.reassigned") or 0)
    dge_expired = int(counters.get("delivery_guarantee.expired") or 0)
    dge_awaiting = int(counters.get("delivery_guarantee.awaiting_ack") or 0)
    dh_eligible = int(counters.get("device_health.dispatch_eligible") or 0)
    dh_blocked = _counter_prefix(counters, "device_health.dispatch_blocked") + int(
        counters.get("device_health.batch_blocked") or 0
    )

    unknown_offers = 0
    try:
        from realtime_platform.offer_ledger import assert_no_unknown_offers

        audit = await assert_no_unknown_offers(older_than_sec=120, limit=50)
        unknown_offers = int(audit.get("unknown_count") or 0)
    except Exception:
        unknown_offers = -1  # scan unavailable

    board = {
        "driver_online_success_rate": round(_rate(online_ok, online_err), 4),
        "ride_offer_success_rate": round(_rate(push_acked, push_missed), 4),
        "accept_success_rate": round(_rate(accept_ok, accept_fail), 4),
        "trip_completion_proxy": complete_ok,
        "missed_ride_offers": push_missed,
        "accept_latency": latency.get("trip.accept_gate_ms") or latency.get("trip.accept_ms"),
        "online_latency": latency.get("presence.online_ms"),
        "offer_delivery_latency": latency.get("push.deliver_ms"),
        "redis_latency_ms": health.get("redis_latency_ms"),
        "kafka_configured": health.get("kafka_configured"),
        "dlq_depth": health.get("dlq_depth"),
        "outbox_pending": health.get("outbox_pending"),
        "crash_free_sessions_proxy": round(_rate(heal_ok, 0), 4) if heal_ok else None,
        "cloud_run_probe_ok": health.get("ok"),
        "hubs": health.get("hubs"),
        "clusters": health.get("clusters"),
        # Delivery Guarantee Engine
        "dge_delivered": dge_delivered,
        "dge_reassigned": dge_reassigned,
        "dge_expired": dge_expired,
        "dge_awaiting_ack": dge_awaiting,
        "unknown_open_offers": unknown_offers,
        # Device Health Engine
        "device_health_eligible": dh_eligible,
        "device_health_blocked": dh_blocked,
        "device_health_pass_rate": round(_rate(dh_eligible, dh_blocked), 4),
    }

    alerts: list[str] = []
    if board["ride_offer_success_rate"] < _SUCCESS["ride_delivery_success"] and (push_acked + push_missed) > 20:
        alerts.append("ride_offer_success_rate below criteria")
    if health.get("redis_latency_ms") and float(health["redis_latency_ms"]) > 50:
        alerts.append("redis_latency_ms > 50")
    if int(health.get("dlq_depth") or 0) > 0:
        alerts.append(f"realtime_dlq_depth={health.get('dlq_depth')}")
    if int(health.get("outbox_pending") or 0) > 50:
        alerts.append(f"outbox_pending={health.get('outbox_pending')}")
    if unknown_offers > 0:
        alerts.append(f"unknown_open_offers={unknown_offers}")

    return {
        "ok": len(alerts) == 0 and bool(health.get("ok")),
        "service": "reliability_dashboard",
        "board": board,
        "alerts": alerts,
        "success_criteria": _SUCCESS,
        "raw": {"counters_sample": {k: counters[k] for k in list(counters)[:40]}, "latency": latency},
        "ts_ms": int(time.time() * 1000),
    }


def prometheus_text(dashboard: dict[str, Any]) -> str:
    """Export dashboard board as Prometheus exposition format."""
    lines = [
        "# HELP nexryde_rt_ok Reliability dashboard ok",
        "# TYPE nexryde_rt_ok gauge",
        f"nexryde_rt_ok {1 if dashboard.get('ok') else 0}",
    ]
    board = dashboard.get("board") or {}
    mapping = {
        "driver_online_success_rate": "nexryde_rt_driver_online_success",
        "ride_offer_success_rate": "nexryde_rt_ride_offer_success",
        "accept_success_rate": "nexryde_rt_accept_success",
        "missed_ride_offers": "nexryde_rt_missed_offers",
        "redis_latency_ms": "nexryde_rt_redis_latency_ms",
        "dlq_depth": "nexryde_rt_dlq_depth",
        "outbox_pending": "nexryde_rt_outbox_pending",
        "trip_completion_proxy": "nexryde_rt_trip_completion_proxy",
        "dge_delivered": "nexryde_rt_dge_delivered",
        "dge_reassigned": "nexryde_rt_dge_reassigned",
        "dge_expired": "nexryde_rt_dge_expired",
        "dge_awaiting_ack": "nexryde_rt_dge_awaiting_ack",
        "unknown_open_offers": "nexryde_rt_unknown_open_offers",
        "device_health_eligible": "nexryde_rt_device_health_eligible",
        "device_health_blocked": "nexryde_rt_device_health_blocked",
        "device_health_pass_rate": "nexryde_rt_device_health_pass_rate",
    }
    for key, metric in mapping.items():
        val = board.get(key)
        if val is None:
            continue
        try:
            lines.append(f"# TYPE {metric} gauge")
            lines.append(f"{metric} {float(val)}")
        except (TypeError, ValueError):
            pass
    # Latency p95s
    for name, lat in board.items():
        if isinstance(lat, dict) and "p95" in lat:
            m = f"nexryde_rt_latency_p95_ms{{name=\"{name}\"}}"
            lines.append(f"{m} {float(lat['p95'])}")
    return "\n".join(lines) + "\n"

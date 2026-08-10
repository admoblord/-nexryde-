"""Ride Push Engine — socket first, ACK required, retry, FCM fallback."""
from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime, timezone
from typing import Any, Optional

from realtime_platform.ack_engine import is_acked, register_pending
from realtime_platform.config import get_realtime_config
from realtime_platform.models import EventType, RealtimeEvent
from realtime_platform.observability import incr, observe_ms, trace
from realtime_platform.retry_engine import persist_event, run_with_retry

logger = logging.getLogger("realtime_platform.push")


async def _socket_deliver(driver_id: str, socket_payload: dict[str, Any]) -> bool:
    from routers.realtime_dispatch import push_driver_new_offer

    await push_driver_new_offer(driver_id, socket_payload)
    return True


async def _fcm_fallback(
    driver_id: str,
    offer: dict[str, Any],
    trip: dict[str, Any],
    *,
    notif_title: str = "New Ride Request",
    notif_body: str = "Open NEXRYDE to accept — pickup nearby.",
) -> bool:
    offer_id = str(offer.get("id") or offer.get("offer_id") or "")
    # Exactly-once FCM per offer (blocks dual-send / retry storms).
    try:
        from realtime_platform.idempotency import claim

        if offer_id and not await claim(f"offer:fcm:{offer_id}", ttl_sec=120):
            incr("push.fcm_duplicate_blocked")
            return True
    except Exception:
        pass
    try:
        from push_notifications import send_push_notification

        # Flat string fields so a backgrounded Online driver can open the native
        # full-screen Accept/Decline UI with rider + pickup + destination (Uber-style).
        # Expo/FCM data values should stay string-safe.
        pickup = trip.get("pickup_location") if isinstance(trip, dict) else None
        dropoff = trip.get("dropoff_location") if isinstance(trip, dict) else None
        pickup_addr = ""
        dropoff_addr = ""
        if isinstance(pickup, dict):
            pickup_addr = str(pickup.get("address") or "").strip()
        elif isinstance(pickup, str):
            pickup_addr = pickup.strip()
        if isinstance(dropoff, dict):
            dropoff_addr = str(dropoff.get("address") or "").strip()
        elif isinstance(dropoff, str):
            dropoff_addr = dropoff.strip()
        fare = (
            trip.get("offered_fare")
            if isinstance(trip, dict)
            else None
        )
        if fare is None and isinstance(trip, dict):
            fare = trip.get("fare")
        if fare is None:
            fare = offer.get("rider_offer_price") or offer.get("fare")
        dist = offer.get("distance_to_pickup") or offer.get("distance_to_pickup_km")
        eta = (
            (trip.get("duration_mins") if isinstance(trip, dict) else None)
            or offer.get("estimated_time_mins")
            or offer.get("eta_minutes")
        )
        rider_name = str(
            offer.get("rider_name")
            or (trip.get("rider_name") if isinstance(trip, dict) else None)
            or "Rider"
        ).strip() or "Rider"

        data = {
            "type": "ride_request",
            "trip_id": str(offer.get("trip_id") or (trip.get("id") if isinstance(trip, dict) else "") or ""),
            "offer_id": offer_id,
            "event_id": str(offer.get("event_id") or ""),
            "urgent": "true",
            "fullscreen": "true",
            "rider_name": rider_name[:48],
            "pickup_address": pickup_addr[:160],
            "dropoff_address": dropoff_addr[:160],
            "fare": str(fare) if fare is not None else "",
            "distance_to_pickup_km": str(dist) if dist is not None else "",
            "eta_minutes": str(eta) if eta is not None else "",
        }
        await send_push_notification(
            driver_id,
            notif_title,
            notif_body,
            data,
        )
        incr("push.fcm_fallback")
        return True
    except Exception:
        logger.exception("fcm fallback failed driver=%s", driver_id)
        return False


async def deliver_offer(
    offer: dict[str, Any],
    trip: Optional[dict[str, Any]] = None,
    *,
    socket_payload: Optional[dict[str, Any]] = None,
    notif_title: str = "New Ride Request",
    notif_body: str = "Open NEXRYDE to accept — pickup nearby.",
    fcm_immediate: bool = False,
) -> dict[str, Any]:
    """Deliver one offer with ACK + retry + FCM fallback."""
    cfg = get_realtime_config()
    driver_id = str(offer.get("driver_id") or "")
    offer_id = str(offer.get("id") or offer.get("offer_id") or "")
    trip_id = str(offer.get("trip_id") or "")
    if not driver_id or not offer_id:
        return {"ok": False, "reason": "missing_ids"}

    event = RealtimeEvent.new(
        EventType.RIDE_OFFER,
        driver_id,
        trip_id=trip_id,
        offer_id=offer_id,
        payload={},
        ttl_sec=cfg.offer_ttl_sec,
        idempotency_key=f"ride_offer:{offer_id}",
    )
    wire = dict(socket_payload or {
        "offer_id": offer_id,
        "trip_id": trip_id,
        **{k: v for k, v in offer.items() if k not in ("id",)},
        "id": offer_id,
    })
    wire["event_id"] = event.event_id
    wire["expires_at_ms"] = event.expires_at_ms
    event.payload = {"offer": wire}
    await register_pending(event)
    await persist_event(event)
    try:
        from realtime_platform.offer_ledger import mark_offer

        await mark_offer(offer_id, delivery_status="pending", event_id=event.event_id)
    except Exception:
        pass

    with trace("push.deliver_offer", offer_id=offer_id, driver_id=driver_id):
        t0 = time.perf_counter()
        fcm_ok = False
        if fcm_immediate:
            fcm_ok = await _fcm_fallback(
                driver_id,
                {
                    **offer,
                    "event_id": event.event_id,
                    "rider_name": wire.get("rider_name"),
                    "distance_to_pickup_km": wire.get("distance_to_pickup_km"),
                    "rider_offer_price": wire.get("rider_offer_price") or wire.get("fare"),
                    "estimated_time_mins": wire.get("estimated_time_mins") or wire.get("eta_minutes"),
                },
                trip or {},
                notif_title=notif_title,
                notif_body=notif_body,
            )
            try:
                from realtime_platform.offer_ledger import mark_offer

                await mark_offer(offer_id, delivery_status="fcm_sent", event_id=event.event_id)
            except Exception:
                pass

        async def _send(ev: RealtimeEvent) -> bool:
            await _socket_deliver(driver_id, wire)
            try:
                from realtime_platform.offer_ledger import mark_offer

                await mark_offer(
                    offer_id,
                    delivery_status="socket_sent",
                    event_id=ev.event_id,
                    retry_count=ev.retry_count,
                )
            except Exception:
                pass
            # Wait briefly for ACK (Uber RAMEN-style).
            deadline = time.perf_counter() + (cfg.offer_ack_timeout_ms / 1000.0)
            while time.perf_counter() < deadline:
                if await is_acked(ev.event_id):
                    return True
                # Also accept legacy offer:ack key from WS/Connect ACK path
                try:
                    from redis_store import store

                    if await store.get(f"offer:ack:{driver_id}:{offer_id}"):
                        return True
                except Exception:
                    pass
                await asyncio.sleep(0.15)
            return False

        acked = await run_with_retry(event, _send, max_retries=cfg.offer_max_retries)
        if not acked and not fcm_immediate:
            fcm_ok = await _fcm_fallback(
                driver_id,
                {
                    **offer,
                    "event_id": event.event_id,
                    "rider_name": wire.get("rider_name"),
                    "distance_to_pickup_km": wire.get("distance_to_pickup_km"),
                    "rider_offer_price": wire.get("rider_offer_price") or wire.get("fare"),
                    "estimated_time_mins": wire.get("estimated_time_mins") or wire.get("eta_minutes"),
                },
                trip or {},
                notif_title=notif_title,
                notif_body=notif_body,
            )
            # One more short wait after FCM
            await asyncio.sleep(0.5)
            acked = await is_acked(event.event_id) or False
            try:
                from redis_store import store

                acked = acked or bool(await store.get(f"offer:ack:{driver_id}:{offer_id}"))
            except Exception:
                pass

        ms = (time.perf_counter() - t0) * 1000
        observe_ms("push.deliver_ms", ms, acked=str(acked))
        try:
            from realtime_platform.offer_ledger import mark_offer

            if acked:
                incr("push.delivered_acked")
                await mark_offer(
                    offer_id,
                    delivery_status="delivered_acked",
                    event_id=event.event_id,
                    retry_count=event.retry_count,
                    outcome="delivered",
                    extra={"acked_at": datetime.now(timezone.utc).isoformat()},
                )
            else:
                incr("push.delivered_unacked")
                incr("push.missed_offer")
                await mark_offer(
                    offer_id,
                    delivery_status="delivered_unacked",
                    event_id=event.event_id,
                    retry_count=event.retry_count,
                )
        except Exception:
            if acked:
                incr("push.delivered_acked")
            else:
                incr("push.delivered_unacked")
                incr("push.missed_offer")
        return {
            "ok": True,
            "acked": bool(acked),
            "fcm_ok": bool(fcm_ok),
            "latency_ms": round(ms, 1),
            "event_id": event.event_id,
            "offer_id": offer_id,
            "driver_id": driver_id,
            "target_ms": cfg.push_target_ms,
        }


async def deliver_offers_batch(
    offers: list[dict[str, Any]],
    trip: Optional[dict[str, Any]] = None,
) -> list[dict[str, Any]]:
    """Fan-out offers concurrently with backpressure cap."""
    if not offers:
        return []
    sem = asyncio.Semaphore(10)

    async def _one(o: dict[str, Any]) -> dict[str, Any]:
        async with sem:
            return await deliver_offer(o, trip)

    return list(await asyncio.gather(*[_one(o) for o in offers], return_exceptions=False))

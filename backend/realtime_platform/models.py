from __future__ import annotations

import time
import uuid
from dataclasses import asdict, dataclass, field
from enum import Enum
from typing import Any, Optional


class EventType(str, Enum):
    ONLINE = "ONLINE"
    OFFLINE = "OFFLINE"
    HEARTBEAT = "HEARTBEAT"
    RIDE_OFFER = "RIDE_OFFER"
    ACCEPT = "ACCEPT"
    DECLINE = "DECLINE"
    ARRIVED = "ARRIVED"
    START_TRIP = "START_TRIP"
    END_TRIP = "END_TRIP"
    SESSION_RESUME = "SESSION_RESUME"
    DELIVERY_ACK = "DELIVERY_ACK"


class EventStatus(str, Enum):
    PENDING = "pending"
    SENT = "sent"
    ACKED = "acked"
    FAILED = "failed"
    EXPIRED = "expired"
    DLQ = "dlq"


@dataclass
class RealtimeEvent:
    """Canonical realtime event — server + client local log share this shape."""

    event_id: str
    event_type: str
    actor_id: str
    trip_id: str = ""
    offer_id: str = ""
    payload: dict[str, Any] = field(default_factory=dict)
    status: str = EventStatus.PENDING.value
    ack: bool = False
    retry_count: int = 0
    created_at_ms: int = 0
    expires_at_ms: int = 0
    sync_status: str = "local"  # local | syncing | synced
    idempotency_key: str = ""

    @staticmethod
    def new(
        event_type: EventType | str,
        actor_id: str,
        *,
        trip_id: str = "",
        offer_id: str = "",
        payload: Optional[dict[str, Any]] = None,
        ttl_sec: int = 120,
        idempotency_key: str = "",
    ) -> "RealtimeEvent":
        now = int(time.time() * 1000)
        et = event_type.value if isinstance(event_type, EventType) else str(event_type)
        eid = str(uuid.uuid4())
        return RealtimeEvent(
            event_id=eid,
            event_type=et,
            actor_id=actor_id,
            trip_id=trip_id or "",
            offer_id=offer_id or "",
            payload=payload or {},
            status=EventStatus.PENDING.value,
            ack=False,
            retry_count=0,
            created_at_ms=now,
            expires_at_ms=now + int(ttl_sec) * 1000,
            sync_status="local",
            idempotency_key=idempotency_key or eid,
        )

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @staticmethod
    def from_dict(data: dict[str, Any]) -> "RealtimeEvent":
        return RealtimeEvent(
            event_id=str(data.get("event_id") or ""),
            event_type=str(data.get("event_type") or ""),
            actor_id=str(data.get("actor_id") or ""),
            trip_id=str(data.get("trip_id") or ""),
            offer_id=str(data.get("offer_id") or ""),
            payload=dict(data.get("payload") or {}),
            status=str(data.get("status") or EventStatus.PENDING.value),
            ack=bool(data.get("ack")),
            retry_count=int(data.get("retry_count") or 0),
            created_at_ms=int(data.get("created_at_ms") or 0),
            expires_at_ms=int(data.get("expires_at_ms") or 0),
            sync_status=str(data.get("sync_status") or "local"),
            idempotency_key=str(data.get("idempotency_key") or ""),
        )


@dataclass
class PresenceSnapshot:
    driver_id: str
    online: bool
    lat: float = 0.0
    lng: float = 0.0
    h3_cell: str = ""
    last_seen_ms: int = 0
    gps_age_ms: int = 0
    network_quality: str = "unknown"  # excellent|good|fair|poor|unknown
    connection_score: float = 0.0
    available: bool = False
    session_id: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class DispatchCandidate:
    driver_id: str
    distance_m: float
    eta_sec: float
    score: float
    visibility_score: float = 50.0

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

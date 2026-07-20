#!/usr/bin/env python3
"""End-to-end production validation for NexRyde notifications.

Uses an isolated Mongo DB + the real ``send_push_notification`` path
(audience guards, trip participant checks, delivery ledger). Expo/FCM
is stubbed so delivery is recorded without requiring a physical device,
except Scenario 6 which requires a live device token.

Usage:
  python3 backend/scripts/e2e_notification_production_proof.py

Optional live device (Scenario 6 only):
  FCM_TEST_TOKEN=<token> NEXRYDE_NOTIF_E2E_LIVE_DEVICE=1 \\
    python3 backend/scripts/e2e_notification_production_proof.py

Exit code 0 only when ALL scenarios PASS (including live-device S6 when
required for production-ready claim).
"""
from __future__ import annotations

import asyncio
import logging
import os
import sys
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional
from unittest.mock import AsyncMock, patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv

load_dotenv(ROOT / ".env")

# Isolated DB so production data is untouched.
E2E_DB = os.environ.get("NEXRYDE_NOTIF_E2E_DB", "nexryde_notif_e2e_proof")
os.environ["DB_NAME"] = E2E_DB

from database import client, db  # noqa: E402  — after DB_NAME override
import notification_delivery_ledger as ledger  # noqa: E402
import notification_service as ns  # noqa: E402

logging.basicConfig(level=logging.WARNING)
logger = logging.getLogger("notif_e2e")

DELIVERIES: list[dict[str, Any]] = []
DECISION_LOGS: list[dict[str, Any]] = []


@dataclass
class ScenarioResult:
    name: str
    passed: bool
    details: list[str] = field(default_factory=list)


RESULTS: list[ScenarioResult] = []


def _record(name: str, passed: bool, *details: str) -> None:
    RESULTS.append(ScenarioResult(name=name, passed=passed, details=list(details)))


async def _ensure_indexes() -> None:
    await db.notification_delivery_ledger.create_index("delivery_key", unique=True)
    await db.notification_delivery_ledger.create_index(
        [("user_id", 1), ("notification_type", 1), ("role", 1), ("delivery_window", 1), ("created_at", -1)]
    )
    await db.users.create_index("id", unique=True)
    await db.trips.create_index("id", unique=True)
    await db.driver_profiles.create_index("user_id", unique=True)


async def _reset() -> None:
    DELIVERIES.clear()
    DECISION_LOGS.clear()
    for col in (
        "users",
        "trips",
        "driver_profiles",
        "notification_delivery_ledger",
        "notification_events",
        "engagement_notification_log",
    ):
        await db[col].delete_many({})


async def _seed_user(user_id: str, role: str, **extra: Any) -> None:
    doc = {
        "id": user_id,
        "role": role,
        "name": f"E2E {role} {user_id}",
        "is_active": True,
        "notifications_enabled": True,
        "notification_channels": {"push": True},
        "notification_types": {},
        "push_token": f"ExponentPushToken[e2e-{user_id}]",
        "timezone": "Africa/Lagos",
        **extra,
    }
    await db.users.update_one({"id": user_id}, {"$set": doc}, upsert=True)
    if role == "driver":
        await db.driver_profiles.update_one(
            {"user_id": user_id},
            {
                "$set": {
                    "user_id": user_id,
                    "profile_completed": True,
                    "is_online": False,
                    "verification_status": "approved",
                }
            },
            upsert=True,
        )


async def _seed_trip(trip_id: str, rider_id: str, driver_id: Optional[str]) -> None:
    await db.trips.update_one(
        {"id": trip_id},
        {
            "$set": {
                "id": trip_id,
                "rider_id": rider_id,
                "driver_id": driver_id,
                "status": "accepted" if driver_id else "pending_driver_offers",
            }
        },
        upsert=True,
    )


async def _fake_send_to_token(user_id, token, provider, title, body, data):
    DELIVERIES.append(
        {
            "user_id": user_id,
            "token": token,
            "title": title,
            "body": body,
            "type": (data or {}).get("type"),
            "trip_id": (data or {}).get("trip_id"),
            "data": dict(data or {}),
        }
    )
    return True, "expo"


def _capture_decision(**kwargs):
    payload = {
        "user_id": kwargs.get("user_id"),
        "role": kwargs.get("role"),
        "audience": kwargs.get("audience"),
        "notification_type": kwargs.get("notification_type"),
        "trip_id": kwargs.get("trip_id"),
        "delivery_status": "sent" if kwargs.get("delivered") else "skipped",
        "skipped_reason": kwargs.get("skipped_reason"),
        "template": kwargs.get("template"),
        "delivery_key": kwargs.get("delivery_key"),
        "source": kwargs.get("source"),
        "delivered": kwargs.get("delivered"),
    }
    DECISION_LOGS.append({"_normalized": payload, **kwargs})


async def _send(
    user_id: str,
    title: str,
    body: str,
    data: dict[str, Any],
    *,
    source: str = "engagement",
) -> bool:
    return await ns.send_push_notification(user_id, title, body, data, source=source)


def _delivered_types(user_id: str) -> set[str]:
    return {str(d["type"]) for d in DELIVERIES if d["user_id"] == user_id and d.get("type")}


def _attempted_types_for(user_id: str) -> set[str]:
    """Types that reached the transport for this user."""
    return _delivered_types(user_id)


# ── Scenarios ─────────────────────────────────────────────────────────────────


async def scenario_1_driver() -> None:
    await _reset()
    driver = "e2e-driver-1"
    rider = "e2e-rider-1"
    await _seed_user(driver, "driver")
    await _seed_user(rider, "rider")
    trip = "e2e-trip-driver-1"
    await _seed_trip(trip, rider, driver)

    # Engagement windows: prove each schedule can deliver. Same calendar day is limited to
    # ENGAGEMENT_MAX_PER_DAY=2 (Scenario 5). Use distinct local_date keys for the three
    # schedule probes so product schedules are individually proven.
    must_receive = [
        ("driver_morning_rush", "Morning engagement", {"slot": "morning", "local_date": "2099-01-01", "delivery_window": "morning", "role": "driver"}),
        ("driver_midday_reminder", "Afternoon engagement", {"slot": "afternoon", "local_date": "2099-01-02", "delivery_window": "afternoon", "role": "driver"}),
        ("driver_evening_rush", "Evening engagement", {"slot": "evening", "local_date": "2099-01-03", "delivery_window": "evening", "role": "driver"}),
        ("ride_request", "New ride request", {"trip_id": trip, "offer_id": "offer-1", "role": "driver"}),
        ("rider_cancelled", "Rider cancelled", {"trip_id": trip, "delivery_slot": "cancel", "role": "driver"}),
        ("ride_accepted", "Trip accepted", {"trip_id": trip, "delivery_slot": "accepted", "role": "driver"}),
        ("trip_completed", "Trip completed", {"trip_id": trip, "delivery_slot": "completed", "role": "driver"}),
    ]
    never = [
        ("rider_morning_commute", "Morning commute"),
        ("rider_evening_ride", "Evening ride"),
        ("rider_promo", "Rider promotions"),
        ("saved_places_reminder", "Saved places"),
        ("complete_first_ride", "Complete first ride"),
    ]

    fails: list[str] = []
    for kind, label, extra in must_receive:
        source = "trip" if extra.get("trip_id") else "engagement"
        ok = await _send(driver, label, label, {"type": kind, **extra}, source=source)
        if not ok:
            fails.append(f"driver did not receive {label} ({kind})")

    for kind, label in never:
        before = len(DELIVERIES)
        ok = await _send(
            driver,
            label,
            label,
            {"type": kind, "slot": "probe", "local_date": "2099-03-01", "delivery_window": "probe", "role": "rider"},
            source="engagement",
        )
        if ok or any(d["user_id"] == driver and d.get("type") == kind for d in DELIVERIES[before:]):
            fails.append(f"driver incorrectly received {label} ({kind})")

    got = _delivered_types(driver)
    for kind, label, _ in must_receive:
        if kind not in got:
            fails.append(f"missing delivery record for {label} ({kind})")

    _record("Scenario 1 — Driver account", not fails, *fails or ["All required receives and never-receives verified"])


async def scenario_2_rider() -> None:
    await _reset()
    driver = "e2e-driver-2"
    rider = "e2e-rider-2"
    await _seed_user(driver, "driver")
    await _seed_user(rider, "rider")
    trip = "e2e-trip-rider-2"
    await _seed_trip(trip, rider, driver)
    must_receive = [
        ("rider_morning_commute", "Morning commute", {"slot": "morning", "local_date": "2099-02-01", "delivery_window": "morning", "role": "rider"}, "engagement"),
        ("rider_afternoon_ride", "Afternoon engagement", {"slot": "afternoon", "local_date": "2099-02-02", "delivery_window": "afternoon", "role": "rider"}, "engagement"),
        ("rider_evening_ride", "Evening ride", {"slot": "evening", "local_date": "2099-02-03", "delivery_window": "evening", "role": "rider"}, "engagement"),
        ("trip_accepted", "Driver accepted", {"trip_id": trip, "delivery_slot": "accepted", "role": "rider"}, "trip"),
        ("driver_arriving", "Driver arriving", {"trip_id": trip, "delivery_slot": "arriving", "role": "rider"}, "trip"),
        ("driver_arrived", "Driver arrived", {"trip_id": trip, "delivery_slot": "arrived", "role": "rider"}, "trip"),
        ("trip_started", "Trip started", {"trip_id": trip, "delivery_slot": "started", "role": "rider"}, "trip"),
        ("trip_completed", "Trip completed", {"trip_id": trip, "delivery_slot": "completed", "role": "rider"}, "trip"),
        ("payment_successful", "Payment successful", {"trip_id": trip, "delivery_slot": "payment", "role": "rider"}, "trip"),
    ]
    never = [
        ("driver_offline_reminder", "Go online reminder"),
        ("monthly_verification_reminder", "Driver verification"),
        ("peak_demand_reminder", "Peak demand"),
        ("driver_nearby_ride_opportunity", "Nearby ride opportunity"),
        ("vehicle_inspection_reminder", "Vehicle inspection"),
        ("earnings_update", "Driver earnings"),
    ]

    fails: list[str] = []
    for kind, label, extra, source in must_receive:
        ok = await _send(rider, label, label, {"type": kind, **extra}, source=source)
        if not ok:
            fails.append(f"rider did not receive {label} ({kind})")

    for kind, label in never:
        before = len(DELIVERIES)
        ok = await _send(
            rider,
            label,
            label,
            {"type": kind, "slot": "probe", "local_date": "2099-03-02", "delivery_window": "probe", "role": "driver"},
            source="engagement",
        )
        if ok or any(d["user_id"] == rider and d.get("type") == kind for d in DELIVERIES[before:]):
            fails.append(f"rider incorrectly received {label} ({kind})")

    _record("Scenario 2 — Rider account", not fails, *fails or ["All required receives and never-receives verified"])


async def scenario_3_duplicates() -> None:
    await _reset()
    driver = "e2e-driver-dup"
    await _seed_user(driver, "driver")
    local_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    payload = {
        "type": "monthly_verification_reminder",
        "slot": "compliance_daily",
        "time_slot": "compliance_daily",
        "local_date": local_date,
        "delivery_window": "compliance",
        "role": "driver",
    }

    results = await asyncio.gather(
        *[
            _send(driver, "Monthly Verification Reminder", "Upload docs", payload, source="compliance")
            for _ in range(20)
        ]
    )
    delivered_count = sum(1 for r in results if r)
    transport_count = sum(1 for d in DELIVERIES if d["user_id"] == driver and d.get("type") == "monthly_verification_reminder")
    ledger_count = await db.notification_delivery_ledger.count_documents(
        {"user_id": driver, "notification_type": "monthly_verification_reminder"}
    )
    skipped = sum(1 for r in results if not r)

    fails: list[str] = []
    if delivered_count != 1:
        fails.append(f"expected 1 successful send, got {delivered_count}")
    if transport_count != 1:
        fails.append(f"expected 1 transport delivery, got {transport_count}")
    if ledger_count != 1:
        fails.append(f"expected 1 ledger row, got {ledger_count}")
    if skipped != 19:
        fails.append(f"expected 19 skips, got {skipped}")

    _record(
        "Scenario 3 — Duplicate prevention (20 concurrent)",
        not fails,
        *fails or ["Exactly one delivery; 19 skipped; one ledger row"],
    )


async def scenario_4_trip_isolation() -> None:
    await _reset()
    fails: list[str] = []
    trips = []
    for i in range(3):
        rider = f"e2e-iso-rider-{i}"
        driver = f"e2e-iso-driver-{i}"
        trip = f"e2e-iso-trip-{i}"
        await _seed_user(rider, "rider")
        await _seed_user(driver, "driver")
        await _seed_trip(trip, rider, driver)
        trips.append((trip, rider, driver))

    # Each participant gets their own completed notice.
    for trip, rider, driver in trips:
        ok_r = await _send(
            rider,
            "Trip Completed",
            "done",
            {"type": "trip_completed", "trip_id": trip, "delivery_slot": "completed"},
            source="trip",
        )
        ok_d = await _send(
            driver,
            "Trip Completed",
            "done",
            {"type": "trip_completed", "trip_id": trip, "delivery_slot": "completed"},
            source="trip",
        )
        if not ok_r:
            fails.append(f"rider {rider} failed own trip {trip}")
        if not ok_d:
            fails.append(f"driver {driver} failed own trip {trip}")

    # Cross-delivery attempts must be rejected.
    victim_rider = trips[0][1]
    foreign_trip = trips[1][0]
    ok_cross = await _send(
        victim_rider,
        "Trip Completed",
        "cross",
        {"type": "trip_completed", "trip_id": foreign_trip, "delivery_slot": "cross"},
        source="trip",
    )
    if ok_cross:
        fails.append(f"rider {victim_rider} received foreign trip {foreign_trip}")

    # Driver of trip0 must not get trip2 ride_request for wrong participant path via passenger id
    stranger = "e2e-iso-stranger"
    await _seed_user(stranger, "rider")
    ok_stranger = await _send(
        stranger,
        "Trip Completed",
        "nope",
        {"type": "trip_completed", "trip_id": trips[0][0], "delivery_slot": "stranger"},
        source="trip",
    )
    if ok_stranger:
        fails.append("non-participant received trip notification")

    # Ensure no user has foreign trip_id in deliveries
    for d in DELIVERIES:
        uid = d["user_id"]
        tid = d.get("trip_id")
        if not tid:
            continue
        owners = {t[1] for t in trips if t[0] == tid} | {t[2] for t in trips if t[0] == tid}
        if uid not in owners:
            fails.append(f"cross-delivery recorded user={uid} trip={tid}")

    _record("Scenario 4 — Trip isolation (3 concurrent trips)", not fails, *fails or ["No cross-delivery; participants only"])


async def scenario_5_daily_limits() -> None:
    await _reset()
    user = "e2e-cap-user"
    await _seed_user(user, "driver")
    local_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    fails: list[str] = []

    ok1 = await _send(
        user,
        "Morning",
        "m",
        {"type": "driver_morning_rush", "slot": "morning", "local_date": local_date, "delivery_window": "morning", "role": "driver"},
        source="engagement",
    )
    ok2 = await _send(
        user,
        "Afternoon",
        "a",
        {"type": "driver_midday_reminder", "slot": "afternoon", "local_date": local_date, "delivery_window": "afternoon", "role": "driver"},
        source="engagement",
    )
    ok3 = await _send(
        user,
        "Evening",
        "e",
        {"type": "driver_evening_rush", "slot": "evening", "local_date": local_date, "delivery_window": "evening", "role": "driver"},
        source="engagement",
    )
    if not (ok1 and ok2):
        fails.append("first two engagement sends should succeed")
    if ok3:
        fails.append("third engagement send should be blocked by daily cap")

    # Ride notifications must NOT be blocked by engagement cap.
    await _seed_trip("e2e-cap-trip", "e2e-cap-rider", user)
    await _seed_user("e2e-cap-rider", "rider")
    ride_ok = await _send(
        user,
        "New Ride Request",
        "ride",
        {"type": "ride_request", "trip_id": "e2e-cap-trip", "offer_id": "cap-offer"},
        source="trip",
    )
    if not ride_ok:
        fails.append("ride notification incorrectly blocked by engagement cap")

    # Critical / security still delivers (BOTH audience, not engagement-capped).
    crit_ok = await _send(
        user,
        "Password changed",
        "security",
        {"type": "password_changed", "delivery_slot": "security"},
        source="system",
    )
    if not crit_ok:
        fails.append("critical system notification failed to deliver")

    _record(
        "Scenario 5 — Daily limits",
        not fails,
        *fails or ["Max 2 engagement/day; rides + critical still deliver"],
    )


async def scenario_6_offline_device() -> None:
    """Requires a real device token to prove reconnect delivery via FCM/Expo."""
    token = os.environ.get("FCM_TEST_TOKEN", "").strip()
    live = os.environ.get("NEXRYDE_NOTIF_E2E_LIVE_DEVICE", "").strip().lower() in ("1", "true", "yes")
    if not token or not live:
        _record(
            "Scenario 6 — Offline devices / reconnect",
            False,
            "NOT PROVEN on a real device. Set NEXRYDE_NOTIF_E2E_LIVE_DEVICE=1 and FCM_TEST_TOKEN=<device token>, "
            "put the device offline, send a push, reconnect, and confirm tray delivery. "
            "Transport stub alone is not production proof for offline queueing.",
        )
        return

    try:
        status = ns.validate_firebase_admin_config(require=True)
    except Exception as exc:
        _record("Scenario 6 — Offline devices / reconnect", False, f"Firebase Admin not ready: {exc}")
        return

    ok, channel = await ns.send_to_token(
        "e2e-live-device",
        token,
        "fcm",
        "NexRyde offline reconnect test",
        "If you saw this after reconnecting, offline delivery works.",
        {"type": "admin_broadcast", "channel_id": "engagement_high"},
    )
    if ok and status.get("initialized"):
        _record(
            "Scenario 6 — Offline devices / reconnect",
            True,
            f"Live FCM send accepted via {channel}. Operator must confirm tray delivery after reconnect.",
            "Manual confirmation of offline→online tray delivery is still required for full physical proof.",
        )
    else:
        _record("Scenario 6 — Offline devices / reconnect", False, f"Live FCM send failed via {channel}")


async def scenario_7_logging() -> None:
    await _reset()
    DECISION_LOGS.clear()
    user = "e2e-log-user"
    await _seed_user(user, "rider")
    await _seed_trip("e2e-log-trip", user, "e2e-log-driver")
    await _seed_user("e2e-log-driver", "driver")

    await _send(
        user,
        "Driver Arrived",
        "arrived",
        {"type": "driver_arrived", "trip_id": "e2e-log-trip", "delivery_slot": "arrived"},
        source="trip",
    )
    # Force a skip for skip_reason coverage
    await _send(
        user,
        "Go online",
        "x",
        {"type": "driver_offline_reminder", "slot": "x", "local_date": "2099-01-01", "delivery_window": "x", "role": "driver"},
        source="engagement",
    )

    required_keys = {
        "user_id",
        "role",
        "audience",
        "notification_type",
        "trip_id",
        "delivery_status",
        "skipped_reason",
    }
    fails: list[str] = []
    if not DECISION_LOGS:
        fails.append("no decision logs captured")
    else:
        for entry in DECISION_LOGS:
            norm = entry.get("_normalized") or entry
            missing = required_keys - set(norm.keys())
            # skipped_reason may be None on success — key must still exist
            if missing:
                fails.append(f"log missing keys {missing}: {norm}")
            if "user_id" in norm and not norm.get("user_id"):
                fails.append("user_id empty")
            if "notification_type" in norm and not norm.get("notification_type"):
                fails.append("notification_type empty")

    # Also verify ledger rows carry identity fields
    rows = await db.notification_delivery_ledger.find({}).to_list(50)
    if not rows:
        # Skip path may not ledger-claim wrong-role; delivered row should exist for trip
        fails.append("expected at least one ledger row for successful trip push")
    else:
        row = rows[0]
        for k in ("user_id", "role", "audience", "notification_type", "status"):
            if k not in row:
                fails.append(f"ledger missing {k}")

    _record("Scenario 7 — Logging", not fails, *fails or ["Decision logs include required fields; ledger populated"])


async def main() -> int:
    print(f"\n=== NexRyde Notification E2E Production Proof ===")
    print(f"Isolated DB: {E2E_DB}")
    print(f"Transport: stubbed Expo/FCM (records deliveries)\n")

    try:
        await client.admin.command("ping")
    except Exception as exc:
        print(f"FAIL Cannot reach MongoDB: {exc}")
        print("Overall: FAIL — backend DB unavailable; not production proven.")
        return 1

    await _ensure_indexes()

    # Patch transport + decision logger for all scenarios except optional live FCM probe inside S6.
    with patch.object(ns, "send_to_token", new=AsyncMock(side_effect=_fake_send_to_token)), patch.object(
        ns, "log_notification_decision", side_effect=_capture_decision
    ), patch.object(ledger, "log_notification_decision", side_effect=_capture_decision):
        await scenario_1_driver()
        await scenario_2_rider()
        await scenario_3_duplicates()
        await scenario_4_trip_isolation()
        await scenario_5_daily_limits()
        await scenario_7_logging()

    # S6 deliberately outside transport stub when live token provided; else hard FAIL.
    await scenario_6_offline_device()

    print("RESULTS")
    print("-------")
    failed = 0
    for r in RESULTS:
        mark = "PASS" if r.passed else "FAIL"
        if not r.passed:
            failed += 1
        print(f"{mark}  {r.name}")
        for d in r.details:
            print(f"      - {d}")

    ready = failed == 0
    print()
    if ready:
        print("Overall: PASS")
        print("Production-ready claim: ONLY if Scenario 6 was run with a real device token AND tray delivery was confirmed.")
    else:
        print(f"Overall: FAIL ({failed}/{len(RESULTS)} scenarios failed)")
        print("NOT production ready — every scenario must PASS on real backend (+ real device for offline).")

    # Cleanup isolated e2e documents (keep DB for inspection if FAIL)
    if ready:
        await _reset()

    return 0 if ready else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))

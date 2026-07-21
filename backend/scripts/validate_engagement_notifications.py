#!/usr/bin/env python3
"""Print PASS/FAIL production validation report for engagement notifications."""
from __future__ import annotations

import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, ROOT)

results: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, bool(ok), detail))


def main() -> int:
    from notification_catalog import NotificationAudience, get_kind_meta, normalize_audience
    from notification_delivery_ledger import (
        MAX_ENGAGEMENT_PER_DAY,
        build_delivery_key,
        infer_delivery_window,
        should_dedupe_notification,
    )
    from notification_catalog import NotificationCategory
    import engagement_push_service as eng
    from datetime import datetime
    import notification_daily_slots as slots
    import inspect

    # R1 duplicate key
    key = build_delivery_key(
        "u",
        "monthly_verification_reminder",
        local_date="2026-07-14",
        delivery_slot="compliance_daily",
    )
    check("R1 unique delivery key shape", key.count("|") == 3, key)
    trip_key = build_delivery_key("d", "ride_request", trip_id="t1", delivery_slot="offer")
    check("R1 trip-scoped delivery key", trip_key == "d|ride_request|t1|offer", trip_key)

    # R2 ledger indexes present in db_indexes source
    idx_src = open(os.path.join(ROOT, "db_indexes.py"), encoding="utf-8").read()
    check(
        "R1 Mongo unique delivery_key index",
        'notification_delivery_ledger.create_index("delivery_key", unique=True)' in idx_src,
    )
    check(
        "R1 scheduler lock collection indexed",
        "notification_scheduler_locks" in idx_src,
    )

    # R2 role audiences
    check(
        "R2 monthly verification is DRIVER only",
        normalize_audience(get_kind_meta("monthly_verification_reminder")["audience"])
        == NotificationAudience.DRIVER,
    )
    check(
        "R2 rider afternoon is RIDER only",
        normalize_audience(get_kind_meta("rider_afternoon_ride")["audience"])
        == NotificationAudience.RIDER,
    )
    for rule in eng.DEFAULT_RULES:
        aud = normalize_audience(get_kind_meta(rule["kind"])["audience"])
        role_ok = (rule["role"] == "driver" and aud == NotificationAudience.DRIVER) or (
            rule["role"] == "rider" and aud == NotificationAudience.RIDER
        )
        check(f"R2 rule {rule['id']} audience matches role", role_ok, f"role={rule['role']} aud={aud.value}")

    # R3 driver schedule windows
    morning = next(r for r in eng.DEFAULT_RULES if r["id"] == "driver_morning_rush")
    afternoon = next(r for r in eng.DEFAULT_RULES if r["id"] == "driver_midday_reminder")
    evening = next(r for r in eng.DEFAULT_RULES if r["id"] == "driver_evening_rush")
    check("R3 driver morning 7-10", morning["start"] == "07:00" and morning["end"] == "10:00")
    check("R3 driver afternoon 12-15", afternoon["start"] == "12:00" and afternoon["end"] == "15:00")
    check("R3 driver evening 17-20", evening["start"] == "17:00" and evening["end"] == "20:00")
    check(
        "R3 morning/afternoon/evening independent",
        eng._in_slot_window(morning, datetime(2026, 7, 14, 8, 15))
        and eng._in_slot_window(afternoon, datetime(2026, 7, 14, 13, 20))
        and eng._in_slot_window(evening, datetime(2026, 7, 14, 18, 10))
        and not eng._in_slot_window(morning, datetime(2026, 7, 14, 13, 20)),
    )

    # R4 rider schedule
    check(
        "R4 rider afternoon rule exists",
        any(r["id"] == "rider_afternoon_ride" for r in eng.DEFAULT_RULES),
    )
    weekend = next(r for r in eng.DEFAULT_RULES if r["id"] == "rider_weekend_travel")
    check("R4 rider weekend rule", weekend["days"] == "weekend")
    check("R4 daily slots forced riders-only", slots._audience() == "riders")

    # R5 logging helpers
    ledger_src = open(os.path.join(ROOT, "notification_delivery_ledger.py"), encoding="utf-8").read()
    svc_src = open(os.path.join(ROOT, "notification_service.py"), encoding="utf-8").read()
    check("R5 log_notification_decision present", "def log_notification_decision" in ledger_src)
    check("R5 send path logs decisions", "log_notification_decision(" in svc_src)

    # R6 max 2/day
    check("R6 max two engagement notifications/day", MAX_ENGAGEMENT_PER_DAY == 2)

    # R6 compliance uses source=compliance + unique slot
    compliance_src = open(os.path.join(ROOT, "driver_compliance.py"), encoding="utf-8").read()
    check(
        "R1 monthly verification uses compliance source + daily slot",
        'source="compliance"' in compliance_src and "compliance_daily" in compliance_src,
    )
    check(
        "R1 compliance multi-instance lock",
        "compliance_monthly:" in compliance_src and "acquire_scheduler_lock" in compliance_src,
    )

    eng_src = open(os.path.join(ROOT, "engagement_push_service.py"), encoding="utf-8").read()
    check("R1 engagement scheduler lock", "engagement_tick_lock_id" in eng_src)

    check(
        "R6 ride requests not engagement-capped without trip",
        not should_dedupe_notification(
            category=NotificationCategory.RIDES, source="trip", notification_type="ride_request"
        ),
    )
    check(
        "R6 ride requests with trip_id are trip-deduped",
        should_dedupe_notification(
            category=NotificationCategory.RIDES,
            source="trip",
            notification_type="ride_request",
            trip_id="t1",
        ),
    )

    print("\n=== NEXRYDE Engagement Notification Validation Report ===\n")
    failed = 0
    for name, ok, detail in results:
        mark = "PASS" if ok else "FAIL"
        if not ok:
            failed += 1
        suffix = f" — {detail}" if detail else ""
        print(f"{mark}  {name}{suffix}")

    print(f"\nOverall: {'PASS' if failed == 0 else 'FAIL'} ({len(results) - failed}/{len(results)})")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())

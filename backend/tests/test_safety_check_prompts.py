"""Auto Stop Safety Check prompt helpers."""
from safety_check_prompts import (
    driver_stop_reason_is_needed,
    merge_driver_stop_reason_alert,
    normalize_safety_check_response,
    rider_safety_check_is_active,
    trip_safety_latlng,
)


def test_normalize_safety_check_response_aliases():
    assert normalize_safety_check_response("Yes") == "safe"
    assert normalize_safety_check_response("im_safe") == "safe"
    assert normalize_safety_check_response("need_help") == "need_help"
    assert normalize_safety_check_response("not safe") == "need_help"
    assert normalize_safety_check_response("maybe") is None


def test_rider_safety_check_is_active_for_abnormal_stop():
    assert rider_safety_check_is_active({
        "active": True,
        "type": "abnormal_stop",
        "check_id": "c1",
    })
    assert not rider_safety_check_is_active({
        "active": True,
        "type": "abnormal_stop",
        "rider_response": "safe",
    })
    assert not rider_safety_check_is_active({"active": True, "type": "gps_spoofing"})


def test_merge_keeps_check_id_when_driver_explains_stop():
    merged = merge_driver_stop_reason_alert(
        {
            "active": True,
            "type": "abnormal_stop",
            "check_id": "c1",
            "message": "Are you safe?",
            "triggered_at": "2026-08-13T10:00:00+00:00",
        },
        reason="Heavy traffic",
        now_iso="2026-08-13T10:02:00+00:00",
        driver_id="d1",
    )
    assert merged["check_id"] == "c1"
    assert merged["type"] == "abnormal_stop"
    assert merged["driver_reason"] == "Heavy traffic"
    assert rider_safety_check_is_active(merged)
    assert not driver_stop_reason_is_needed(
        merged,
        {"reason": "Heavy traffic", "submitted_at": "2026-08-13T10:02:00+00:00"},
    )


def test_driver_stop_reason_needed_before_answer():
    alert = {"active": True, "type": "abnormal_stop", "triggered_at": "2026-08-13T10:00:00+00:00"}
    assert driver_stop_reason_is_needed(alert, None)
    assert driver_stop_reason_is_needed(
        alert,
        {"reason": "old", "submitted_at": "2026-08-13T09:00:00+00:00"},
    )


def test_trip_safety_latlng_prefers_last_route_point():
    lat, lng = trip_safety_latlng({
        "actual_route": [{"lat": 6.4, "lng": 3.4}],
        "dropoff_location": {"lat": 6.5, "lng": 3.5},
    })
    assert (lat, lng) == (6.4, 3.4)


def test_safety_push_kinds_are_registered():
    from notification_catalog import get_kind_meta

    rider = get_kind_meta("safety_check")
    driver = get_kind_meta("stop_reason_requested")
    paused = get_kind_meta("trip_paused")
    assert not rider.get("unknown")
    assert rider["audience"].value == "rider"
    assert not driver.get("unknown")
    assert driver["audience"].value == "driver"
    assert not paused.get("unknown")

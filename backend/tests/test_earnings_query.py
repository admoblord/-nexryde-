"""Unit tests for earnings trip match helper."""

from earnings_query import match_completed_trip_paid_for_earnings


def test_match_includes_payment_completed_and_legacy():
    q = match_completed_trip_paid_for_earnings(driver_id="d1")
    assert q["status"] == "completed"
    assert q["driver_id"] == "d1"
    assert "$or" in q
    ors = q["$or"]
    assert {"payment_status": "completed"} in ors
    assert {"payment_status": {"$exists": False}} in ors


def test_match_merges_extra_filters():
    q = match_completed_trip_paid_for_earnings(
        driver_id="d1",
        completed_at={"$gte": "x"},
    )
    assert q["completed_at"] == {"$gte": "x"}

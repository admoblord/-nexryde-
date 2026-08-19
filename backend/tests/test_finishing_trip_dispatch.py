"""Unit tests for Bolt-style finishing-trip dispatch (no DB)."""
from finishing_trip_dispatch import (
    FINISHING_RADIUS_KM,
    RIDER_FINISHING_BODY,
    RIDER_FINISHING_HEADLINE,
    RIDER_NOW_EN_ROUTE_TITLE,
    accept_lock_decision,
    cancel_lock_decision,
    chained_distance_km,
    eligibility_rank_key,
    finishing_offer_state,
    merge_driver_profiles,
    rider_en_route_push,
    rider_finishing_push,
)


LAGOS_PICKUP = (6.4541, 3.3947)
NEAR_DROPOFF = (6.4580, 3.4000)  # ~0.7 km
FAR_DROPOFF = (6.6018, 3.3515)  # Ikeja — well past the finishing window


def _trip(status: str, drop, trip_id="cur-1"):
    return {
        "id": trip_id,
        "status": status,
        "dropoff_location": {"lat": drop[0], "lng": drop[1], "address": "Drop"},
    }


def test_idle_driver_is_not_finishing():
    assert finishing_offer_state(None, *LAGOS_PICKUP) is None


def test_accepted_or_arrived_is_hard_busy():
    assert finishing_offer_state(_trip("accepted", NEAR_DROPOFF), *NEAR_DROPOFF) is None
    assert finishing_offer_state(_trip("arrived", NEAR_DROPOFF), *NEAR_DROPOFF) is None


def test_ongoing_near_dropoff_is_offered():
    state = finishing_offer_state(_trip("ongoing", NEAR_DROPOFF), *NEAR_DROPOFF)
    assert state is not None
    assert state["finishing_trip"] is True
    assert state["prior_trip_id"] == "cur-1"
    assert state["remaining_km"] <= FINISHING_RADIUS_KM
    assert state["finishing_eta_sec"] > 0


def test_ongoing_far_from_dropoff_is_hard_busy():
    assert finishing_offer_state(_trip("ongoing", FAR_DROPOFF), *LAGOS_PICKUP) is None


def test_chained_distance_adds_deadhead():
    chained = chained_distance_km(
        driver_lat=NEAR_DROPOFF[0],
        driver_lng=NEAR_DROPOFF[1],
        current_dropoff={"lat": NEAR_DROPOFF[0], "lng": NEAR_DROPOFF[1]},
        new_pickup_lat=LAGOS_PICKUP[0],
        new_pickup_lng=LAGOS_PICKUP[1],
    )
    assert chained > 0
    # Driver is already at drop-off, so chain ≈ deadhead only.
    assert chained < 2.0


def test_merge_profiles_keeps_nearest_first_and_dedupes():
    a = {"user_id": "d1"}
    b = {"user_id": "d2"}
    merged = merge_driver_profiles([a], [a, b], [{"user_id": "d3"}])
    assert [p["user_id"] for p in merged] == ["d1", "d2", "d3"]


def test_rider_push_copy():
    title, body = rider_finishing_push("Ada")
    assert "Ada" in title
    assert "finishing" in title.lower()
    assert "shortly" in body.lower()


def test_accept_lock_idle_sets_active():
    decision = accept_lock_decision(
        new_trip_id="next-1",
        active_trip_id=None,
        queued_next_trip_id=None,
        busy_trip=None,
        driver_lat=LAGOS_PICKUP[0],
        driver_lng=LAGOS_PICKUP[1],
    )
    assert decision["mode"] == "active"


def test_accept_lock_queues_when_finishing_nearby():
    decision = accept_lock_decision(
        new_trip_id="next-1",
        active_trip_id="cur-1",
        queued_next_trip_id=None,
        busy_trip=_trip("ongoing", NEAR_DROPOFF),
        driver_lat=NEAR_DROPOFF[0],
        driver_lng=NEAR_DROPOFF[1],
    )
    assert decision["mode"] == "queued"
    assert decision["prior_trip_id"] == "cur-1"
    assert decision["finishing"]["finishing_trip"] is True


def test_accept_lock_rejects_hard_busy_and_already_queued():
    busy = accept_lock_decision(
        new_trip_id="next-1",
        active_trip_id="cur-1",
        queued_next_trip_id=None,
        busy_trip=_trip("accepted", NEAR_DROPOFF),
        driver_lat=NEAR_DROPOFF[0],
        driver_lng=NEAR_DROPOFF[1],
    )
    assert busy["mode"] == "reject"
    queued = accept_lock_decision(
        new_trip_id="next-2",
        active_trip_id="cur-1",
        queued_next_trip_id="next-1",
        busy_trip=_trip("ongoing", NEAR_DROPOFF),
        driver_lat=NEAR_DROPOFF[0],
        driver_lng=NEAR_DROPOFF[1],
    )
    assert queued["mode"] == "reject"
    assert queued["reason"] == "already_queued"


def test_cancel_lock_clears_queued_or_promotes():
    assert (
        cancel_lock_decision(
            cancelled_trip_id="next-1",
            active_trip_id="cur-1",
            queued_next_trip_id="next-1",
        )
        == "clear_queued"
    )
    assert (
        cancel_lock_decision(
            cancelled_trip_id="cur-1",
            active_trip_id="cur-1",
            queued_next_trip_id="next-1",
        )
        == "promote_or_clear"
    )


def test_eligibility_rank_prefers_idle_over_finishing():
    preferred = {"driver_id": "p", "finishing_trip": True, "distance_to_pickup": 9, "visibility_score": 10}
    idle = {"driver_id": "i", "distance_to_pickup": 3, "visibility_score": 40}
    finishing = {"driver_id": "f", "finishing_trip": True, "distance_to_pickup": 1, "visibility_score": 90}
    ranked = sorted([finishing, preferred, idle], key=lambda d: eligibility_rank_key(d, "p"))
    assert [d["driver_id"] for d in ranked] == ["p", "i", "f"]


def test_promoted_rider_is_told_the_driver_is_coming_now():
    title, body = rider_en_route_push("Ada")
    assert title == RIDER_NOW_EN_ROUTE_TITLE
    assert body.startswith("Ada ")
    assert "heading to you now" in body


def test_promoted_push_survives_a_missing_driver_name():
    title, body = rider_en_route_push("")
    assert title == RIDER_NOW_EN_ROUTE_TITLE
    assert body.startswith("Your driver ")


def test_finishing_push_falls_back_to_the_shared_headline():
    title, body = rider_finishing_push("   ")
    assert title == RIDER_FINISHING_HEADLINE
    assert body == RIDER_FINISHING_BODY


def test_rider_copy_is_not_duplicated_in_the_trips_router():
    """The wording lives in one place; the router must not re-type it."""
    from pathlib import Path

    src = Path(__file__).resolve().parents[1].joinpath("routers", "trips.py").read_text()
    assert "just finished nearby and is heading to you now" not in src
    assert "rider_en_route_push" in src

"""Local landmark autocomplete matching must not over-match on shared tokens."""
from places_service import _local_landmark_predictions


def test_victoria_island_does_not_match_cms_via_island_alone():
    rows = _local_landmark_predictions("Victoria Island")
    ids = {r["place_id"] for r in rows}
    assert "local:vi-landmark" in ids
    assert "local:cms" not in ids


def test_maryland_mall_does_not_match_ikeja_city_mall_via_mall_alone():
    rows = _local_landmark_predictions("Maryland Mall")
    ids = {r["place_id"] for r in rows}
    assert "local:ikeja-city-mall" not in ids


def test_phrase_substring_still_matches_landmark():
    rows = _local_landmark_predictions("Landmark Beach")
    ids = {r["place_id"] for r in rows}
    assert "local:vi-landmark" in ids

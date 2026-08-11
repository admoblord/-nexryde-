"""local:* landmark place ids must resolve in place details (not Google 404)."""
from places_service import _local_landmark_by_place_id


def test_local_cms_resolves():
    row = _local_landmark_by_place_id("local:cms")
    assert row is not None
    assert row["lat"] == 6.4510
    assert row["lng"] == 3.3890


def test_unknown_local_returns_none():
    assert _local_landmark_by_place_id("local:not-a-place") is None


def test_google_place_id_not_treated_as_local():
    assert _local_landmark_by_place_id("ChIJxxxxxxxx") is None

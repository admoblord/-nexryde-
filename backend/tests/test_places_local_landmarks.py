"""Local landmarks must not replace Google for real estate / street queries."""
from places_service import _local_landmark_predictions, _merge_place_predictions


def test_peace_garden_estate_is_not_a_local_short_circuit():
    assert _local_landmark_predictions("Peace garden Estate") == []
    assert _local_landmark_predictions("Peace Garden Estate Sangotedo") == []


def test_single_common_token_does_not_match_every_lagos_landmark():
    assert _local_landmark_predictions("Lagos") == []
    assert _local_landmark_predictions("Island") == []
    assert _local_landmark_predictions("Nigeria") == []


def test_phrase_still_matches_real_landmark():
    hits = _local_landmark_predictions("Lekki Conservation")
    assert hits and hits[0]["main_text"] == "Lekki Conservation Centre"


def test_merge_keeps_google_first():
    google = [
        {"place_id": "ChIJ-peace", "description": "Peace Garden Estate, Sangotedo", "main_text": "Peace Garden Estate"},
    ]
    local = [
        {"place_id": "local:ajah", "description": "Ajah, Lagos", "main_text": "Ajah"},
    ]
    merged = _merge_place_predictions(google, local)
    assert merged[0]["place_id"] == "ChIJ-peace"
    assert len(merged) == 2


def test_predictions_match_typed_estate_query():
    from places_service import _predictions_match_typed_query

    rows = [
        {
            "place_id": "ChIJ-peace",
            "description": "Peace Garden Estate, Oladunni Street, Lagos",
            "main_text": "Peace Garden Estate",
            "secondary_text": "Oladunni Street, Lagos",
        }
    ]
    assert _predictions_match_typed_query(rows, "Peace garden Estate")
    assert not _predictions_match_typed_query(
        [{"description": "Landmark Beach, Victoria Island", "main_text": "Landmark Beach"}],
        "Peace garden Estate",
    )


def test_autocomplete_caches_even_with_sessiontoken():
    import inspect
    from places_service import autocomplete_places

    src = inspect.getsource(autocomplete_places)
    assert "use_cache = not session" not in src
    assert "Cache even when sessiontoken is present" in src
    assert "include_bias=False" in src

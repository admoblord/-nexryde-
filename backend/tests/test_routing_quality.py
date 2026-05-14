from routing_quality import is_directions_road_route


def test_haversine_not_road_route():
    d = {
        "distance_meters": 5000,
        "duration_seconds": 600,
        "source": "haversine",
    }
    assert is_directions_road_route(d) is False


def test_google_directions_is_road_route():
    d = {
        "distance_meters": 5200,
        "duration_seconds": 720,
        "source": "google_directions_api",
    }
    assert is_directions_road_route(d) is True


def test_none_not_road():
    assert is_directions_road_route(None) is False

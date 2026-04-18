import pytest

from tests.integration_utils import get_base_url, register_driver, register_rider, request_sample_trip


@pytest.fixture(scope="module")
def integration_driver():
    """One registered driver + JWT for the whole test module (live API)."""
    base = get_base_url()
    uid, token, phone = register_driver(base)
    return {"id": uid, "token": token, "phone": phone, "base": base}


@pytest.fixture(scope="module")
def integration_rider():
    """One registered rider + JWT for the whole test module (live API)."""
    base = get_base_url()
    uid, token, phone = register_rider(base)
    return {"id": uid, "token": token, "phone": phone, "base": base}


@pytest.fixture(scope="module")
def integration_rider_with_trip(integration_rider):
    """Rider plus a pending trip (for WebSocket participant checks)."""
    base = integration_rider["base"]
    status, data = request_sample_trip(base, integration_rider["id"], integration_rider["token"])
    trip_id = None
    if status == 200 and isinstance(data, dict):
        trip = data.get("trip") or {}
        trip_id = trip.get("id")
    return {**integration_rider, "trip_id": trip_id, "trip_create_status": status}

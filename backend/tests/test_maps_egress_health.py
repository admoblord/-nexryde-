"""
/api/health/maps must answer the question that cost us a week of booking.

When pickup search dies, the two possibilities look identical from a phone:
Google is unreachable from inside the VPC, or the phone never got the reply.
Riders cannot book either way, and the outside world sees the same silence.

The most expensive wrong turn was a Cloud DNS private zone theory that nobody
could confirm or rule out without shell access Cloud Run does not have. So the
health endpoint resolves maps.googleapis.com itself and says, in the response,
whether the name landed on a Private Google Access VIP — where Maps Platform is
not served and a request hangs forever instead of failing.
"""
import asyncio

import pytest

import places_service


class _Response:
    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code

    def json(self):
        return self._payload


class _Google:
    """Scripted stand-in for the shared httpx client."""

    def __init__(self, payload=None, raises=None, status_code=200):
        self.payload = payload
        self.raises = raises
        self.status_code = status_code
        self.calls: list[str] = []

    async def get(self, url, timeout=None):
        self.calls.append(url)
        if self.raises is not None:
            raise self.raises
        return _Response(self.payload, self.status_code)


_OK_BODY = {
    "status": "OK",
    "predictions": [
        {"description": "Victoria Island, Lagos, Nigeria", "place_id": "ChIJ-vi"},
    ],
}


@pytest.fixture(autouse=True)
def _isolate(monkeypatch):
    monkeypatch.setattr(places_service, "GOOGLE_MAPS_API_KEY", "test-key-do-not-leak")
    monkeypatch.setattr(places_service, "_maps_health_cache", None, raising=False)
    yield
    monkeypatch.setattr(places_service, "_maps_health_cache", None, raising=False)


def _dns(addresses, error=None):
    async def _resolve(timeout_s=3.0):
        hijacked = [a for a in addresses if places_service._classify_maps_ip(a)]
        return {
            "addresses": addresses,
            "error": error,
            "private_google_access": bool(hijacked),
            "private_google_access_detail": (
                places_service._classify_maps_ip(hijacked[0]) if hijacked else None
            ),
        }

    return _resolve


def _health(monkeypatch, *, google, addresses):
    monkeypatch.setattr(places_service, "get_http_client", lambda: google)
    monkeypatch.setattr(places_service, "resolve_maps_host", _dns(addresses))
    return asyncio.run(places_service.maps_platform_health())


@pytest.mark.parametrize(
    "ip,expected",
    [
        ("199.36.153.4", "restricted"),
        ("199.36.153.7", "restricted"),
        ("199.36.153.8", "private"),
        ("199.36.153.11", "private"),
        ("142.250.200.10", None),
        ("172.217.170.46", None),
    ],
)
def test_classifies_private_google_access_vips(ip, expected):
    verdict = places_service._classify_maps_ip(ip)
    if expected is None:
        assert verdict is None, f"{ip} is a normal public Google address"
    else:
        assert verdict and expected in verdict


def test_reports_healthy_when_google_answers(monkeypatch):
    google = _Google(_OK_BODY)
    result = _health(monkeypatch, google=google, addresses=["142.250.200.10"])

    assert result["ok"] is True
    assert result["reachable"] is True
    assert result["google_status"] == "OK"
    assert result["predictions"] == 1
    assert result["dns"]["private_google_access"] is False


def test_names_the_private_zone_when_maps_resolves_to_a_vip(monkeypatch):
    """The hang we could never confirm by hand, stated in the response body."""
    google = _Google(raises=TimeoutError("timed out"))
    result = _health(monkeypatch, google=google, addresses=["199.36.153.10"])

    assert result["reachable"] is False
    assert result["timeout"] is True
    assert result["dns"]["private_google_access"] is True
    assert "private.googleapis.com" in result["dns"]["private_google_access_detail"]


def test_unreachable_still_reports_what_the_name_resolved_to(monkeypatch):
    """A NAT or firewall drop resolves fine — so the addresses rule DNS out."""
    google = _Google(raises=TimeoutError("timed out"))
    result = _health(monkeypatch, google=google, addresses=["142.250.200.10"])

    assert result["reachable"] is False
    assert result["timeout"] is True
    assert result["dns"]["addresses"] == ["142.250.200.10"]
    assert result["dns"]["private_google_access"] is False


def test_request_denied_still_proves_the_network_path(monkeypatch):
    """A bad key is a Google answer, not an egress fault — do not conflate them."""
    google = _Google({"status": "REQUEST_DENIED", "error_message": "key invalid"})
    result = _health(monkeypatch, google=google, addresses=["142.250.200.10"])

    assert result["reachable"] is True
    assert result["ok"] is False
    assert result["google_status"] == "REQUEST_DENIED"


def test_memoised_so_it_cannot_run_up_the_maps_bill(monkeypatch):
    google = _Google(_OK_BODY)
    monkeypatch.setattr(places_service, "get_http_client", lambda: google)
    monkeypatch.setattr(places_service, "resolve_maps_host", _dns(["142.250.200.10"]))

    first = asyncio.run(places_service.maps_platform_health())
    second = asyncio.run(places_service.maps_platform_health())

    assert first["cached"] is False
    assert second["cached"] is True
    assert len(google.calls) == 1, "health checks must not bill a Google call each time"


def test_never_leaks_the_api_key(monkeypatch):
    google = _Google({"status": "REQUEST_DENIED", "error_message": "bad key test-key-do-not-leak"})
    result = _health(monkeypatch, google=google, addresses=["142.250.200.10"])

    assert "test-key-do-not-leak" not in repr(result)


def test_missing_key_is_reported_without_calling_google(monkeypatch):
    monkeypatch.setattr(places_service, "GOOGLE_MAPS_API_KEY", "")
    google = _Google(_OK_BODY)
    result = _health(monkeypatch, google=google, addresses=["142.250.200.10"])

    assert result["ok"] is False
    assert google.calls == []
    assert "GOOGLE_MAPS_API_KEY" in result["reason"]

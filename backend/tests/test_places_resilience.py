"""
Pickup/destination search must survive a bad Google.

Every failure mode below used to surface in the app as "No places found":
a timeout, a quota error, a 500 from our own proxy, or a stale GPS pin that
biased a real Lagos estate out of the results.
"""
import asyncio

import pytest

import places_service


class _FakeResponse:
    def __init__(self, payload):
        self._payload = payload

    def json(self):
        return self._payload


class _FakeGoogle:
    """Stands in for the shared httpx client; scripted per-URL."""

    def __init__(self, autocomplete=None, geocode=None, raises=False):
        self.autocomplete = autocomplete
        self.geocode = geocode
        self.raises = raises
        self.calls: list[str] = []

    async def get(self, url, timeout=None):
        self.calls.append(url)
        if self.raises:
            raise TimeoutError("google timed out")
        if "/geocode/json" in url:
            if self.geocode is None:
                raise TimeoutError("geocode unavailable")
            return _FakeResponse(self.geocode)
        payload = self.autocomplete
        if callable(payload):
            payload = payload(url)
        return _FakeResponse(payload)

    @property
    def biased_calls(self):
        return [u for u in self.calls if "&location=" in u]

    @property
    def unbiased_calls(self):
        return [u for u in self.calls if "/autocomplete/json" in u and "&location=" not in u]


class _Request:
    """Minimal stand-in for the FastAPI request the auth guard reads."""
    client = None
    headers: dict = {}


def _google_rows(*descriptions):
    return {
        "status": "OK",
        "predictions": [
            {
                "place_id": f"ChIJ-{d.split(',')[0].strip().lower().replace(' ', '-')}",
                "description": d,
                "structured_formatting": {
                    "main_text": d.split(",")[0].strip(),
                    "secondary_text": ",".join(d.split(",")[1:]).strip(),
                },
            }
            for d in descriptions
        ],
    }


@pytest.fixture(autouse=True)
def _isolate_places(monkeypatch):
    """No auth, no Redis/Mongo, no real Google — just the fallback logic."""
    monkeypatch.setattr(places_service, "GOOGLE_MAPS_API_KEY", "test-key")

    async def _no_auth(_request):
        return "test-rider"

    async def _no_indexes():
        return None

    store: dict[str, dict] = {}

    async def _get_cache(key):
        hit = store.get(key)
        return {"response": hit} if hit is not None else None

    async def _set_cache(key, response, ttl_seconds):
        store[key] = response

    monkeypatch.setattr(places_service, "_require_places_auth", _no_auth)
    monkeypatch.setattr(places_service, "_ensure_places_cache_indexes", _no_indexes)
    monkeypatch.setattr(places_service, "_get_cache", _get_cache)
    monkeypatch.setattr(places_service, "_set_cache", _set_cache)
    return store


def _autocomplete(**kwargs):
    params = {
        "input": "Peace garden Estate",
        "location_bias": None,
        "radius": None,
        "components": "country:ng",
        "sessiontoken": None,
    }
    params.update(kwargs)

    async def _run():
        out = await places_service.autocomplete_places(_Request(), **params)
        # The last-good copy is written in the background; wait for it so the
        # assertions do not race the event loop shutting down.
        pending = list(places_service._stale_writes)
        if pending:
            await asyncio.gather(*pending, return_exceptions=True)
        return out

    return asyncio.run(_run())


def test_happy_path_returns_google_rows(monkeypatch):
    fake = _FakeGoogle(autocomplete=_google_rows("Peace Garden Estate, Oladunni Street, Lagos"))
    monkeypatch.setattr(places_service, "get_http_client", lambda: fake)

    out = _autocomplete()

    assert out["status"] == "OK"
    assert out["predictions"][0]["main_text"] == "Peace Garden Estate"


def test_timeout_serves_last_good_answer_instead_of_empty(monkeypatch, _isolate_places):
    good = _FakeGoogle(autocomplete=_google_rows("Peace Garden Estate, Oladunni Street, Lagos"))
    monkeypatch.setattr(places_service, "get_http_client", lambda: good)
    first = _autocomplete()
    assert first["predictions"]

    # Same query, Google now dead and the 300s fresh entry gone.
    _isolate_places.pop(
        places_service._cache_key(
            "autocomplete_v2",
            {
                "input": "peace garden estate",
                "location_bias": None,
                "radius": None,
                "components": "country:ng",
            },
        )
    )
    dead = _FakeGoogle(raises=True)
    monkeypatch.setattr(places_service, "get_http_client", lambda: dead)

    out = _autocomplete()

    assert out["cache"] == "stale"
    assert out["status"] == "OK"
    assert out["predictions"][0]["main_text"] == "Peace Garden Estate"


def test_quota_error_serves_stale_not_no_places_found(monkeypatch, _isolate_places):
    good = _FakeGoogle(autocomplete=_google_rows("Lekki Phase 1, Lagos"))
    monkeypatch.setattr(places_service, "get_http_client", lambda: good)
    _autocomplete(input="Lekki Phase 1")
    _isolate_places.pop(
        places_service._cache_key(
            "autocomplete_v2",
            {
                "input": "lekki phase 1",
                "location_bias": None,
                "radius": None,
                "components": "country:ng",
            },
        )
    )

    over_quota = _FakeGoogle(
        autocomplete={"status": "OVER_QUERY_LIMIT", "predictions": []},
        geocode={"status": "OVER_QUERY_LIMIT", "results": []},
    )
    monkeypatch.setattr(places_service, "get_http_client", lambda: over_quota)

    out = _autocomplete(input="Lekki Phase 1")

    assert out["predictions"], "quota error must not blank the rider's suggestions"
    assert out["cache"] == "stale"


def test_autocomplete_never_raises_500(monkeypatch):
    """A proxy crash used to surface as 'Could not reach address search'."""
    def _boom():
        raise RuntimeError("client pool exploded")

    monkeypatch.setattr(places_service, "get_http_client", _boom)

    out = _autocomplete(input="somewhere brand new")

    assert out["status"] == "UNAVAILABLE"
    assert out["predictions"] == []


def test_zero_results_is_reported_as_a_real_empty(monkeypatch):
    empty = _FakeGoogle(
        autocomplete={"status": "ZERO_RESULTS", "predictions": []},
        geocode={"status": "ZERO_RESULTS", "results": []},
    )
    monkeypatch.setattr(places_service, "get_http_client", lambda: empty)

    out = _autocomplete(input="qqzzxx nowhere at all")

    assert out["status"] == "OK"
    assert out["predictions"] == []


def test_geocode_fallback_covers_autocomplete_outage(monkeypatch):
    fake = _FakeGoogle(
        autocomplete={"status": "REQUEST_DENIED", "predictions": []},
        geocode={
            "status": "OK",
            "results": [
                {
                    "place_id": "ChIJ-geo",
                    "formatted_address": "Peace Garden Estate, Sangotedo, Lagos, Nigeria",
                }
            ],
        },
    )
    monkeypatch.setattr(places_service, "get_http_client", lambda: fake)

    out = _autocomplete()

    assert out["status"] == "OK"
    assert "Peace Garden Estate" in out["predictions"][0]["description"]


def test_bias_that_hides_the_typed_estate_is_retried_unbiased(monkeypatch):
    """A stale GPS pin must not bury the address the rider actually typed."""
    def scripted(url):
        if "&location=" in url:
            return _google_rows("Landmark Beach, Victoria Island, Lagos")
        return _google_rows("Peace Garden Estate, Oladunni Street, Lagos")

    fake = _FakeGoogle(autocomplete=scripted)
    monkeypatch.setattr(places_service, "get_http_client", lambda: fake)

    out = _autocomplete(location_bias="6.4531,3.3958", radius=45000)

    assert fake.biased_calls and fake.unbiased_calls, "expected the unbiased retry"
    assert out["predictions"][0]["main_text"] == "Peace Garden Estate"
    assert out["bias_retried"] is True


def test_matching_biased_result_does_not_spend_a_second_google_call(monkeypatch):
    fake = _FakeGoogle(autocomplete=_google_rows("Peace Garden Estate, Oladunni Street, Lagos"))
    monkeypatch.setattr(places_service, "get_http_client", lambda: fake)

    out = _autocomplete(location_bias="6.4531,3.3958", radius=45000)

    assert len(fake.calls) == 1
    assert out["bias_retried"] is False

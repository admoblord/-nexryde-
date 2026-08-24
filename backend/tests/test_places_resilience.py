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


def test_typo_never_offers_the_whole_country(monkeypatch):
    """
    Geocoding answers a typo with "Nigeria". Tapping it pinned the trip at
    9.08, 8.68 — the middle of the country, hundreds of km from the rider.
    """
    fake = _FakeGoogle(
        autocomplete={"status": "ZERO_RESULTS", "predictions": []},
        geocode={
            "status": "OK",
            "results": [
                {
                    "place_id": "ChIJDY2kfa8LThARyAvFaEH-qJk",
                    "formatted_address": "Nigeria",
                    "types": ["country", "political"],
                }
            ],
        },
    )
    monkeypatch.setattr(places_service, "get_http_client", lambda: fake)

    out = _autocomplete(input="zzqqxx nowhere at all 9999")

    assert out["predictions"] == []
    assert out["status"] == "OK"


def test_geocode_fallback_drops_results_unrelated_to_the_query(monkeypatch):
    fake = _FakeGoogle(
        autocomplete={"status": "ZERO_RESULTS", "predictions": []},
        geocode={
            "status": "OK",
            "results": [
                {"place_id": "ChIJ-kano", "formatted_address": "Kano, Nigeria", "types": ["locality"]},
                {
                    "place_id": "ChIJ-peace",
                    "formatted_address": "Peace Garden Estate, Sangotedo, Lagos",
                    "types": ["premise"],
                },
            ],
        },
    )
    monkeypatch.setattr(places_service, "get_http_client", lambda: fake)

    out = _autocomplete(input="Peace garden Estate")

    descriptions = [p["description"] for p in out["predictions"]]
    assert descriptions == ["Peace Garden Estate, Sangotedo, Lagos"]


def test_geocode_fallback_keeps_a_real_street_match(monkeypatch):
    fake = _FakeGoogle(
        autocomplete={"status": "ZERO_RESULTS", "predictions": []},
        geocode={
            "status": "OK",
            "results": [
                {
                    "place_id": "ChIJ-ogunlana",
                    "formatted_address": "23 Ogunlana Drive, Surulere, Lagos, Nigeria",
                    "types": ["street_address"],
                }
            ],
        },
    )
    monkeypatch.setattr(places_service, "get_http_client", lambda: fake)

    out = _autocomplete(input="23 Ogunlana Drive Surulere")

    assert out["predictions"][0]["main_text"] == "23 Ogunlana Drive"


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


def test_unbiased_retry_does_not_trade_away_nearby_results_for_worse_ones(monkeypatch):
    """Neither list matches the typed query, so the nearby one is kept."""
    def scripted(url):
        if "&location=" in url:
            return _google_rows("Ajah Bus Stop, Lagos")
        return _google_rows("Kano Line, Kano")

    fake = _FakeGoogle(autocomplete=scripted)
    monkeypatch.setattr(places_service, "get_http_client", lambda: fake)

    out = _autocomplete(input="Peace garden Estate", location_bias="6.4531,3.3958", radius=45000)

    assert out["predictions"][0]["main_text"] == "Ajah Bus Stop"


def test_matching_biased_result_does_not_spend_a_second_google_call(monkeypatch):
    fake = _FakeGoogle(autocomplete=_google_rows("Peace Garden Estate, Oladunni Street, Lagos"))
    monkeypatch.setattr(places_service, "get_http_client", lambda: fake)

    out = _autocomplete(location_bias="6.4531,3.3958", radius=45000)

    assert len(fake.calls) == 1
    assert out["bias_retried"] is False


def test_google_probe_redacts_key_and_returns_predictions(monkeypatch):
    class _Resp:
        status_code = 200
        reason_phrase = "OK"
        headers = {"content-type": "application/json", "x-fake": "test-key"}
        text = '{"status":"OK","predictions":[{"description":"Victoria Island, Lagos, Nigeria"}]}'

        def json(self):
            return {
                "status": "OK",
                "predictions": [{"description": "Victoria Island, Lagos, Nigeria"}],
            }

    class _Client:
        async def get(self, url, timeout=None):
            assert timeout == places_service.GOOGLE_PLACES_PROBE_TIMEOUT_S
            assert "input=Victoria" in url
            assert "key=test-key" in url
            return _Resp()

    monkeypatch.setattr(places_service, "get_http_client", lambda: _Client())
    out = asyncio.run(places_service.probe_google_places_autocomplete("Victoria"))
    assert out["ok"] is True
    assert out["timeout"] is False
    assert out["http_status"] == 200
    assert out["google_status"] == "OK"
    assert "Victoria Island" in out["predictions"][0]
    assert "test-key" not in out["url"]
    assert "REDACTED" in out["url"]
    assert "test-key" not in out["body"]
    assert out["headers"]["x-fake"] == "REDACTED"


def test_google_probe_timeout_is_named(monkeypatch):
    class _Client:
        async def get(self, url, timeout=None):
            raise TimeoutError("google timed out")

    monkeypatch.setattr(places_service, "get_http_client", lambda: _Client())
    out = asyncio.run(places_service.probe_google_places_autocomplete("Victoria"))
    assert out["ok"] is False
    assert out["timeout"] is True
    assert out["http_status"] is None
    assert "test-key" not in (out.get("error") or "")


def test_google_probe_ops_route_is_gated():
    import pathlib

    text = (pathlib.Path(__file__).resolve().parent.parent / "server.py").read_text()
    start = text.index("/ops/places-google-probe")
    body = text[start : start + 1200]
    assert "NEXRYDE_OPS_KEY" in body
    assert "x-nexryde-ops-key" in body
    assert "status_code=404" in body
    assert "probe_google_places_autocomplete" in body


def test_google_autocomplete_uses_8s_hard_timeout():
    import inspect

    src = inspect.getsource(places_service._google_autocomplete_once)
    assert "GOOGLE_PLACES_TIMEOUT_S" in src
    assert places_service.GOOGLE_PLACES_TIMEOUT_S == 8.0
    assert "GOOGLE_PLACES_CALL_BEFORE" in src
    assert "GOOGLE_PLACES_CALL_AFTER" in src
    assert src.index("GOOGLE_PLACES_CALL_BEFORE") < src.index("client.get(")
    assert src.index("client.get(") < src.index("GOOGLE_PLACES_CALL_AFTER")
    assert "flush=True" in src
    assert "err_type=" in src
    assert "timeout=" in src

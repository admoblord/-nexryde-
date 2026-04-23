"""Unit tests for live safety provider (no network)."""

from safety_live_provider import _headline_risk_signal, _provider


def test_headline_signal_elevated():
    h = [
        {"title": "Kidnapping reported on highway", "url": "", "published_at": "", "source": "X"},
        {"title": "Robbery at market", "url": "", "published_at": "", "source": "Y"},
    ]
    assert _headline_risk_signal(h) == "elevated"


def test_headline_signal_routine():
    h = [{"title": "Police commission new uniforms", "url": "", "published_at": "", "source": "Z"}]
    assert _headline_risk_signal(h) == "routine"


def test_provider_none_without_keys(monkeypatch):
    for k in (
        "SAFETY_NEWSAPI_KEY",
        "NEWSAPI_KEY",
        "NEWSAPI_API_KEY",
        "SAFETY_GNEWS_API_KEY",
        "GNEWS_API_KEY",
    ):
        monkeypatch.delenv(k, raising=False)
    assert _provider() is None

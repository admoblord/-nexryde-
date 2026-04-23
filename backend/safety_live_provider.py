"""
Live safety context from the public web (news) + OpenStreetMap geocoding.

This module does not invent crime coordinates. It returns recent headlines
about safety/crime near the resolved region and optional time-of-day context.

Env:
  SAFETY_LIVE_DATA_ENABLED=1          — master switch (router also checks this)
  SAFETY_NEWSAPI_KEY or NEWSAPI_KEY   — https://newsapi.org (recommended)
  SAFETY_GNEWS_API_KEY or GNEWS_API_KEY — https://gnews.io (alternative)
  SAFETY_PROVIDER=newsapi|gnews       — default: newsapi if a NewsAPI key is set else gnews if key set
  SAFETY_HTTP_USER_AGENT              — required style for Nominatim (default Nexryde bot string)
"""

from __future__ import annotations

import os
import time
from datetime import datetime, timezone
from typing import Any, Literal, Optional

import httpx

logger = __import__("logging").getLogger("server")

ProviderName = Literal["newsapi", "gnews"]

_nominatim_cache: dict[tuple[int, int], tuple[float, dict[str, Any]]] = {}
_news_cache: dict[str, tuple[float, list[dict[str, Any]]]] = {}

_NOMINATIM_TTL = 300.0
_NEWS_TTL = 120.0
_HTTP_TIMEOUT = 12.0


def _live_enabled() -> bool:
    return os.getenv("SAFETY_LIVE_DATA_ENABLED", "").strip() == "1"


def _user_agent() -> str:
    return (
        os.getenv("SAFETY_HTTP_USER_AGENT", "").strip()
        or "NexrydeSafety/1.0 (+https://nexryde.com/support)"
    )


def _newsapi_key() -> str:
    return (
        os.getenv("SAFETY_NEWSAPI_KEY", "").strip()
        or os.getenv("NEWSAPI_KEY", "").strip()
        or os.getenv("NEWSAPI_API_KEY", "").strip()
    )


def _gnews_key() -> str:
    return os.getenv("SAFETY_GNEWS_API_KEY", "").strip() or os.getenv("GNEWS_API_KEY", "").strip()


def _provider() -> Optional[ProviderName]:
    if _newsapi_key():
        override = os.getenv("SAFETY_PROVIDER", "").strip().lower()
        if override == "gnews" and _gnews_key():
            return "gnews"
        return "newsapi"
    if _gnews_key():
        return "gnews"
    return None


def _cache_get(store: dict[str, tuple[float, Any]], key: str, ttl: float) -> Optional[Any]:
    row = store.get(key)
    if not row:
        return None
    ts, val = row
    if time.monotonic() - ts > ttl:
        store.pop(key, None)
        return None
    return val


def _cache_set(store: dict[str, tuple[float, Any]], key: str, val: Any) -> None:
    store[key] = (time.monotonic(), val)


def _round_coord(lat: float, lng: float) -> tuple[int, int]:
    return (round(lat * 200), round(lng * 200))


async def reverse_geocode_region(lat: float, lng: float) -> dict[str, Any]:
    """Resolve lat/lng to address parts via Nominatim (no API key)."""
    key = _round_coord(lat, lng)
    cached = _nominatim_cache.get(key)
    if cached and time.monotonic() - cached[0] < _NOMINATIM_TTL:
        return cached[1]

    url = "https://nominatim.openstreetmap.org/reverse"
    params = {"lat": lat, "lon": lng, "format": "json", "addressdetails": 1}
    headers = {"User-Agent": _user_agent(), "Accept": "application/json"}
    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT, headers=headers) as client:
        r = await client.get(url, params=params)
        r.raise_for_status()
        data = r.json()

    addr = data.get("address") or {}
    city = (
        addr.get("city")
        or addr.get("town")
        or addr.get("village")
        or addr.get("municipality")
        or addr.get("county")
        or ""
    )
    state = addr.get("state") or addr.get("region") or ""
    country = addr.get("country") or ""
    label = ", ".join(x for x in [city or state, country] if x) or (data.get("display_name") or "Nigeria")[:120]

    out = {
        "label": label,
        "city": city,
        "state": state,
        "country": country,
        "display_name": (data.get("display_name") or "")[:200],
    }
    _nominatim_cache[key] = (time.monotonic(), out)
    return out


def _news_query_terms(region: dict[str, Any]) -> str:
    parts = []
    if region.get("city"):
        parts.append(str(region["city"]))
    if region.get("state") and str(region["state"]) != str(region.get("city", "")):
        parts.append(str(region["state"]))
    if not parts and region.get("label"):
        parts.append(str(region["label"]).split(",")[0].strip())
    base = " ".join(parts) if parts else "Nigeria"
    return f'({base}) AND (Nigeria OR Nigerian) AND (crime OR safety OR robbery OR kidnapping OR violence OR protest OR accident OR police)'


async def _fetch_newsapi(q: str, api_key: str) -> list[dict[str, Any]]:
    cache_key = f"newsapi:{hash(q)}"
    hit = _cache_get(_news_cache, cache_key, _NEWS_TTL)
    if hit is not None:
        return hit

    url = "https://newsapi.org/v2/everything"
    params = {
        "q": q,
        "language": "en",
        "sortBy": "publishedAt",
        "pageSize": 12,
        "apiKey": api_key,
    }
    headers = {"User-Agent": _user_agent()}
    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT, headers=headers) as client:
        r = await client.get(url, params=params)
        r.raise_for_status()
        body = r.json()
    if body.get("status") != "ok":
        raise RuntimeError(body.get("message") or "NewsAPI error")

    articles = body.get("articles") or []
    out: list[dict[str, Any]] = []
    for a in articles[:12]:
        src = (a.get("source") or {}).get("name") if isinstance(a.get("source"), dict) else None
        out.append(
            {
                "title": (a.get("title") or "").strip()[:240],
                "url": (a.get("url") or "").strip()[:500],
                "published_at": (a.get("publishedAt") or "")[:32],
                "source": (src or "News")[:80],
            }
        )
    out = [x for x in out if x.get("title")]
    _cache_set(_news_cache, cache_key, out)
    return out


async def _fetch_gnews(q: str, api_key: str) -> list[dict[str, Any]]:
    cache_key = f"gnews:{hash(q)}"
    hit = _cache_get(_news_cache, cache_key, _NEWS_TTL)
    if hit is not None:
        return hit

    url = "https://gnews.io/api/v4/search"
    params = {"q": q, "lang": "en", "max": 12, "apikey": api_key}
    headers = {"User-Agent": _user_agent()}
    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT, headers=headers) as client:
        r = await client.get(url, params=params)
        r.raise_for_status()
        body = r.json()

    articles = body.get("articles") or []
    out: list[dict[str, Any]] = []
    for a in articles[:12]:
        src = a.get("source", {})
        name = src.get("name") if isinstance(src, dict) else None
        out.append(
            {
                "title": (a.get("title") or "").strip()[:240],
                "url": (a.get("url") or "").strip()[:500],
                "published_at": (a.get("publishedAt") or "")[:32],
                "source": (name or "News")[:80],
            }
        )
    out = [x for x in out if x.get("title")]
    _cache_set(_news_cache, cache_key, out)
    return out


async def fetch_live_headlines(lat: float, lng: float) -> tuple[dict[str, Any], list[dict[str, Any]], str]:
    """Returns (region_info, headlines, provider_name)."""
    prov = _provider()
    if not prov:
        raise RuntimeError(
            "No news API key configured. Set SAFETY_NEWSAPI_KEY (NewsAPI.org) or SAFETY_GNEWS_API_KEY (gnews.io)."
        )

    region = await reverse_geocode_region(lat, lng)
    q = _news_query_terms(region)

    if prov == "newsapi":
        key = _newsapi_key()
        headlines = await _fetch_newsapi(q, key)
        src_label = "NewsAPI.org"
    else:
        key = _gnews_key()
        headlines = await _fetch_gnews(q, key)
        src_label = "gnews.io"

    return region, headlines, src_label


def _wat_hour() -> int:
    """Approximate WAT from UTC (Nigeria)."""
    return (datetime.now(timezone.utc).hour + 1) % 24


def _time_risk_from_clock(hour: int) -> str:
    if 6 <= hour <= 18:
        return "low"
    if 18 < hour <= 21:
        return "moderate"
    return "high"


def _headline_risk_signal(headlines: list[dict[str, Any]]) -> str:
    """Very rough keyword signal from titles only — not a crime rate."""
    if not headlines:
        return "unknown"
    blob = " ".join(h["title"].lower() for h in headlines[:8])
    severe = sum(
        1
        for w in (
            "kidnap",
            "killed",
            "terror",
            "attack",
            "robbery",
            "shoot",
            "bomb",
            "violence",
        )
        if w in blob
    )
    if severe >= 2:
        return "elevated"
    if severe == 1:
        return "mixed"
    return "routine"


def build_real_crime_payload(lat: float, lng: float, region: dict[str, Any], headlines: list[dict[str, Any]], src_label: str) -> dict[str, Any]:
    hour = _wat_hour()
    time_risk = _time_risk_from_clock(hour)
    signal = _headline_risk_signal(headlines)

    city_display = (region.get("city") or region.get("state") or region.get("label") or "Area").strip()
    disclaimer = (
        "Headlines are from third-party news sources near this region. They are not official crime statistics, "
        "not a complete safety map, and may include unrelated stories. Use judgment and local guidance."
    )

    if headlines:
        general = (
            f"Recent public reporting for {city_display}: {len(headlines)} stories in the last fetch window. "
            f"Headline signal: {signal}. {disclaimer}"
        )
    else:
        general = (
            f"No recent English-language headlines matched the safety query for {city_display}. "
            "That does not mean the area is safe or unsafe — only that nothing was returned. " + disclaimer
        )

    return {
        "city": city_display[:80],
        "location": {"lat": lat, "lng": lng},
        "time_risk_level": time_risk,
        "current_hour_wat": hour,
        "nearby_high_risk_zones": [],
        "nearby_safe_zones": [],
        "general_advice": general,
        "total_high_risk_zones": 0,
        "total_safe_zones": 0,
        "data_source": f"{src_label} + OpenStreetMap Nominatim",
        "last_updated": datetime.now(timezone.utc).isoformat(),
        "live_headlines": headlines[:10],
        "headline_signal": signal,
        "disclaimer": disclaimer,
        "geocode_label": region.get("label") or "",
    }


def build_route_safety_payload(
    pickup_lat: float,
    pickup_lng: float,
    dropoff_lat: float,
    dropoff_lng: float,
    pickup_region: dict[str, Any],
    dropoff_region: dict[str, Any],
    headlines: list[dict[str, Any]],
    src_label: str,
) -> dict[str, Any]:
    """Route-level view: news context for corridor; no fake mapped zones."""
    p_city = pickup_region.get("city") or pickup_region.get("state") or "pickup"
    d_city = dropoff_region.get("city") or dropoff_region.get("state") or "dropoff"
    signal = _headline_risk_signal(headlines)
    hour = _wat_hour()
    if signal == "elevated":
        route_risk = "high"
    elif signal == "mixed":
        route_risk = "moderate"
    elif headlines:
        route_risk = "low"
    else:
        route_risk = "moderate"

    if hour >= 21 or hour <= 5:
        if route_risk == "low":
            route_risk = "moderate"

    tips = [
        "Share your trip with a trusted contact",
        "Keep your phone charged",
        "Note your driver's plate number",
        "News headlines are not a substitute for situational awareness",
    ]
    if route_risk == "high":
        tips.append("Review recent local reports before travelling this corridor at night")

    return {
        "route_risk_level": route_risk,
        "risk_zones_on_route": [],
        "risk_count": 0,
        "safety_tips": tips,
        "city": f"{p_city} → {d_city}"[:120],
        "live_headlines": headlines[:8],
        "headline_signal": signal,
        "data_source": f"{src_label} + OpenStreetMap Nominatim",
        "disclaimer": (
            "Route assessment reflects recent news keyword density only, not mapped incidents or police data."
        ),
    }


async def live_crime_snapshot(lat: float, lng: float) -> dict[str, Any]:
    region, headlines, src = await fetch_live_headlines(lat, lng)
    return build_real_crime_payload(lat, lng, region, headlines, src)


async def live_route_safety(
    pickup_lat: float,
    pickup_lng: float,
    dropoff_lat: float,
    dropoff_lng: float,
) -> dict[str, Any]:
    pickup_r = await reverse_geocode_region(pickup_lat, pickup_lng)
    dropoff_r = await reverse_geocode_region(dropoff_lat, dropoff_lng)
    mid_lat = (pickup_lat + dropoff_lat) / 2
    mid_lng = (pickup_lng + dropoff_lng) / 2
    _, headlines, src = await fetch_live_headlines(mid_lat, mid_lng)
    return build_route_safety_payload(
        pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, pickup_r, dropoff_r, headlines, src
    )


async def live_health() -> dict[str, Any]:
    """Lightweight check: provider key present + Nominatim + one news call (Lagos)."""
    if not _live_enabled():
        return {"ok": False, "reason": "SAFETY_LIVE_DATA_ENABLED is not 1"}
    if not _provider():
        return {"ok": False, "reason": "Missing SAFETY_NEWSAPI_KEY or SAFETY_GNEWS_API_KEY"}

    try:
        await reverse_geocode_region(6.5244, 3.3792)
    except Exception as e:
        logger.warning("safety live-health nominatim failed: %s", e)
        return {"ok": False, "reason": f"nominatim: {e!s}"[:200]}

    try:
        region, headlines, src = await fetch_live_headlines(6.5244, 3.3792)
        _ = region, headlines, src
    except Exception as e:
        logger.warning("safety live-health news failed: %s", e)
        return {"ok": False, "reason": f"news: {e!s}"[:200]}

    return {"ok": True, "provider": _provider(), "sample_headline_count": len(headlines)}

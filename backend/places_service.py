"""
Google Places API Proxy Service
Handles autocomplete and place details from backend to avoid CORS issues.

Caching strategy (cost optimisation):
  L1 — Redis (hot, TTL 30 days for reverse-geocode / 7 days for place details)
  L2 — MongoDB google_places_cache (warm, TTL via expireAfterSeconds index)
  L3 — Google API (charged)

  Reverse-geocode keys use lat/lng rounded to 4 decimal places (~11 m).

A two-level cache means a cache-warm deployment with 500 drivers pays
~0 geocoding/autocomplete dollars per day for repeated queries.
"""

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel
from typing import List, Optional
import httpx
from http_client import get_http_client
import os
import json
import hashlib
from datetime import datetime, timedelta, timezone
import re
import time
from urllib.parse import quote

# Circuit breaker — prevents cascading failures when Google Maps degrades
try:
    from circuit_breaker import google_maps_cb, CircuitBreakerOpen
    _CB_AVAILABLE = True
except ImportError:
    _CB_AVAILABLE = False
    google_maps_cb = None  # type: ignore[assignment]
    CircuitBreakerOpen = Exception  # type: ignore[assignment,misc]

from database import db

# ── In-process LRU (L1-lite for single-instance or warm pods) ───────────────
# 2 048 slots, ~400 KB RAM — negligible, saves round-trips even inside Redis.
import functools

_LRU_SIZE = 2048

class _LRUCache:
    """Simple thread-safe LRU using an ordered dict."""
    def __init__(self, maxsize: int = _LRU_SIZE):
        from collections import OrderedDict
        self._cache: "OrderedDict[str, tuple[object, float]]" = OrderedDict()
        self._maxsize = maxsize

    def get(self, key: str, ttl: float) -> "object | None":
        entry = self._cache.get(key)
        if entry is None:
            return None
        value, stored_at = entry
        if time.monotonic() - stored_at > ttl:
            del self._cache[key]
            return None
        self._cache.move_to_end(key)
        return value

    def set(self, key: str, value: object) -> None:
        if key in self._cache:
            self._cache.move_to_end(key)
        self._cache[key] = (value, time.monotonic())
        if len(self._cache) > self._maxsize:
            self._cache.popitem(last=False)

_lru: _LRUCache = _LRUCache()


async def _redis_get(key: str) -> "dict | None":
    """L1 Redis lookup; silently returns None if Redis unavailable."""
    try:
        from redis_store import get_redis
        r = get_redis()
        if r is None:
            return None
        raw = await r.get(key) if hasattr(r, "get") else r.get(key)
        if raw is None:
            return None
        return json.loads(raw if isinstance(raw, str) else raw.decode())
    except Exception:
        return None


async def _redis_set(key: str, value: dict, ttl_seconds: int) -> None:
    """L1 Redis write; silently no-ops if Redis unavailable."""
    try:
        from redis_store import get_redis
        r = get_redis()
        if r is None:
            return
        payload = json.dumps(value, default=str)
        if hasattr(r, "setex"):
            r.setex(key, ttl_seconds, payload)
        else:
            await r.setex(key, ttl_seconds, payload)
    except Exception:
        pass


def _strip_directions_html(html: str) -> str:
    """Plain text for turn-by-turn steps (Google returns HTML instructions)."""
    if not html:
        return ""
    t = re.sub(r"<[^>]+>", " ", html)
    return " ".join(t.split()).strip()


def _geocode_result_payload(first_result: dict) -> dict:
    """
    Build API response from Google Geocoding `results[0]`.
    `short_label` is rider-friendly: e.g. "Sangotedo, Lagos" when components allow.
    """
    formatted = str(first_result.get("formatted_address") or "").strip()
    comps = first_result.get("address_components") or []

    neighborhood = ""
    sublocality = ""
    locality = ""
    admin1 = ""
    country = ""

    for c in comps:
        types = c.get("types") or []
        ln = str(c.get("long_name") or "").strip()
        if not ln:
            continue
        if "neighborhood" in types:
            neighborhood = neighborhood or ln
        if "sublocality" in types or "sublocality_level_1" in types:
            sublocality = sublocality or ln
        if "locality" in types:
            locality = locality or ln
        if "administrative_area_level_1" in types:
            admin1 = admin1 or ln
        if "country" in types:
            country = country or ln

    area = neighborhood or sublocality or locality
    admin_short = admin1.replace(" State", "").strip() if admin1 else ""
    # Nigeria UX: "Sangotedo, Lagos" (area + state/locality)
    if area and admin_short and area != admin_short:
        short_label = f"{area}, {admin_short}"
    elif locality and admin_short and locality != admin_short:
        short_label = f"{locality}, {admin_short}"
    elif area:
        short_label = area if not country else f"{area}, {country}"
    elif formatted:
        short_label = formatted
    else:
        short_label = ""

    return {
        "address": formatted,
        "formatted_address": formatted,
        "short_label": short_label,
        "city": locality or sublocality or neighborhood or "",
        "state": admin1,
        "country": country,
        "neighborhood": neighborhood or sublocality or "",
        "status": "OK",
    }

places_router = APIRouter(prefix="/api/places", tags=["places"])

GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY", "")
_cache_index_ready = False


async def _ensure_places_cache_indexes():
    global _cache_index_ready
    if _cache_index_ready:
        return
    try:
        await db.google_places_cache.create_index("cache_key", unique=True)
        await db.google_places_cache.create_index("expires_at", expireAfterSeconds=0)
    except Exception:
        pass
    _cache_index_ready = True


def _cache_key(prefix: str, payload: dict) -> str:
    normalized = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return f"{prefix}:{hashlib.sha256(normalized.encode('utf-8')).hexdigest()}"


async def _get_cache(key: str) -> "dict | None":
    """3-level read: in-process LRU → Redis → MongoDB."""
    # L1: in-process
    lru_hit = _lru.get(key, ttl=86400)
    if lru_hit is not None:
        return {"response": lru_hit}

    # L2: Redis
    redis_hit = await _redis_get(f"places:{key}")
    if redis_hit is not None:
        _lru.set(key, redis_hit)
        return {"response": redis_hit}

    # L3: MongoDB
    now = datetime.now(timezone.utc)
    doc = await db.google_places_cache.find_one(
        {"cache_key": key, "expires_at": {"$gt": now}},
        {"_id": 0, "response": 1},
    )
    if doc:
        _lru.set(key, doc["response"])
    return doc


async def _set_cache(key: str, response: dict, ttl_seconds: int) -> None:
    """3-level write: in-process LRU + Redis + MongoDB (fire-and-forget for Mongo)."""
    _lru.set(key, response)
    await _redis_set(f"places:{key}", response, ttl_seconds)
    now = datetime.now(timezone.utc)
    try:
        await db.google_places_cache.update_one(
            {"cache_key": key},
            {
                "$set": {
                    "cache_key": key,
                    "response": response,
                    "cached_at": now,
                    "expires_at": now + timedelta(seconds=ttl_seconds),
                }
            },
            upsert=True,
        )
    except Exception:
        pass  # best-effort persistence — Redis hit is sufficient

class PlacePrediction(BaseModel):
    place_id: str
    description: str
    main_text: str
    secondary_text: str

class AutocompleteResponse(BaseModel):
    predictions: List[PlacePrediction]
    status: str

class PlaceDetails(BaseModel):
    latitude: float
    longitude: float
    address: str


async def _geocode_search_fallback_predictions(input_text: str, components: str) -> Optional[dict]:
    """
    When Places Autocomplete is blocked (API key missing Places API), approximate suggestions
    using the Geocoding API — often already enabled for the same backend key.
    """
    raw = input_text.strip()
    if len(raw) < 3 or not GOOGLE_MAPS_API_KEY:
        return None
    comp = f"&components={components}" if components else ""
    url = (
        f"https://maps.googleapis.com/maps/api/geocode/json"
        f"?address={quote(raw)}{comp}&language=en&region=ng&key={GOOGLE_MAPS_API_KEY}"
    )
    try:
        client = get_http_client()
        response = await client.get(url, timeout=10.0)
        data = response.json()
    except Exception:
        return None
    if data.get("status") != "OK" or not data.get("results"):
        return None
    predictions: list[dict] = []
    for idx, r in enumerate(data.get("results", [])[:12]):
        pid = str(r.get("place_id") or "").strip()
        formatted = str(r.get("formatted_address") or "").strip()
        if not formatted:
            continue
        parts = [p.strip() for p in formatted.split(",") if p.strip()]
        main = parts[0] if parts else formatted
        secondary = ", ".join(parts[1:]) if len(parts) > 1 else ""
        predictions.append(
            {
                "place_id": pid or f"geocode-result-{idx}",
                "description": formatted,
                "main_text": main,
                "secondary_text": secondary,
            }
        )
    if not predictions:
        return None
    return {"predictions": predictions, "status": "OK"}


async def _require_places_auth(request: Request) -> str:
    from auth_guard import require_authenticated
    from security_advanced import general_limiter

    actor = require_authenticated(request)
    await general_limiter.check_rate_limit(request, f"places:{actor}")
    return actor


# Frequent Lagos landmarks — checked before Google Autocomplete (zero API cost).
_LAGOS_LANDMARKS: list[dict] = [
    {"place_id": "local:lekki-conservation", "description": "Lekki Conservation Centre, Lagos", "main_text": "Lekki Conservation Centre", "secondary_text": "Lekki, Lagos", "lat": 6.4391, "lng": 3.5355},
    {"place_id": "local:murtala-airport", "description": "Murtala Muhammed International Airport, Ikeja", "main_text": "Murtala Muhammed International Airport", "secondary_text": "Ikeja, Lagos", "lat": 6.5774, "lng": 3.3212},
    {"place_id": "local:cms", "description": "CMS, Lagos Island", "main_text": "CMS", "secondary_text": "Lagos Island", "lat": 6.4510, "lng": 3.3890},
    {"place_id": "local:computer-village", "description": "Computer Village, Ikeja", "main_text": "Computer Village", "secondary_text": "Ikeja, Lagos", "lat": 6.6018, "lng": 3.3515},
    {"place_id": "local:admiralty", "description": "Admiralty Way, Lekki Phase 1", "main_text": "Admiralty Way", "secondary_text": "Lekki Phase 1, Lagos", "lat": 6.4474, "lng": 3.4721},
    {"place_id": "local:vi-landmark", "description": "Landmark Beach, Victoria Island", "main_text": "Landmark Beach", "secondary_text": "Victoria Island, Lagos", "lat": 6.4260, "lng": 3.4340},
    {"place_id": "local:ikeja-city-mall", "description": "Ikeja City Mall, Ikeja", "main_text": "Ikeja City Mall", "secondary_text": "Ikeja, Lagos", "lat": 6.6194, "lng": 3.3578},
    {"place_id": "local:national-theatre", "description": "National Theatre, Iganmu", "main_text": "National Theatre", "secondary_text": "Iganmu, Lagos", "lat": 6.4730, "lng": 3.3695},
    {"place_id": "local:yaba", "description": "Yaba, Lagos", "main_text": "Yaba", "secondary_text": "Lagos", "lat": 6.5095, "lng": 3.3711},
    {"place_id": "local:ajah", "description": "Ajah, Lagos", "main_text": "Ajah", "secondary_text": "Lagos", "lat": 6.4698, "lng": 3.5852},
]


def _local_landmark_predictions(input_text: str) -> list[dict]:
    """Match the landmark name, not a generic token like 'Lagos' or 'Island'."""
    q = (input_text or "").strip().lower()
    if len(q) < 3:
        return []
    tokens = [t for t in q.split() if len(t) >= 3]
    out = []
    for row in _LAGOS_LANDMARKS:
        main = str(row["main_text"]).lower()
        hay = f"{row['main_text']} {row['description']}".lower()
        name_hit = q == main or main.startswith(q) or q in main
        multi_hit = len(tokens) >= 2 and all(t in hay for t in tokens)
        if not (name_hit or multi_hit):
            continue
        out.append(
            {
                "place_id": row["place_id"],
                "description": row["description"],
                "main_text": row["main_text"],
                "secondary_text": row["secondary_text"],
                "lat": row["lat"],
                "lng": row["lng"],
                "source": "local_landmark",
            }
        )
    return out[:5]


def _merge_place_predictions(*groups: list[dict]) -> list[dict]:
    """Dedup by place_id / description. First group wins (Google rank first)."""
    seen: set[str] = set()
    out: list[dict] = []
    for group in groups:
        for row in group or []:
            pid = str(row.get("place_id") or "").strip().lower()
            desc = str(row.get("description") or row.get("main_text") or "").strip().lower()
            key = pid or desc
            if not key or key in seen:
                continue
            seen.add(key)
            if desc:
                seen.add(desc)
            out.append(row)
    return out[:12]


def _autocomplete_google_has_rows(data: Optional[dict]) -> bool:
    return bool(data and data.get("status") == "OK" and data.get("predictions"))


def _typed_query_tokens(input_text: str) -> list[str]:
    return [t for t in re.split(r"[^a-z0-9]+", (input_text or "").lower()) if len(t) >= 3]


def _predictions_match_typed_query(predictions: list[dict], input_text: str) -> bool:
    """True when at least one row mentions a typed token (Peace / garden / Estate)."""
    tokens = _typed_query_tokens(input_text)
    if not tokens:
        return bool(predictions)
    for row in predictions or []:
        hay = f"{row.get('description', '')} {row.get('main_text', '')} {row.get('secondary_text', '')}".lower()
        if any(t in hay for t in tokens):
            return True
    return False


def _google_autocomplete_url(
    input_text: str,
    *,
    components: Optional[str],
    location_bias: Optional[str],
    radius: Optional[int],
    session: str,
    include_bias: bool,
) -> str:
    location_params = f"&components={components}" if components else ""
    if include_bias and location_bias and radius:
        location_params += f"&location={location_bias}&radius={radius}"
    session_param = f"&sessiontoken={quote(session)}" if session else ""
    return (
        f"https://maps.googleapis.com/maps/api/place/autocomplete/json"
        f"?input={quote(input_text)}{location_params}{session_param}&key={GOOGLE_MAPS_API_KEY}"
    )


def _normalize_google_autocomplete_predictions(data: dict) -> list[dict]:
    predictions = []
    for pred in data.get("predictions") or []:
        formatting = pred.get("structured_formatting") or {}
        predictions.append({
            "place_id": pred.get("place_id", ""),
            "description": pred.get("description", ""),
            "main_text": formatting.get("main_text", pred.get("description", "")),
            "secondary_text": formatting.get("secondary_text", ""),
        })
    return predictions


@places_router.get("/autocomplete")
async def autocomplete_places(
    request: Request,
    input: str = Query(..., min_length=1),
    location_bias: Optional[str] = Query(None),
    radius: Optional[int] = Query(None),
    components: Optional[str] = Query("country:ng"),
    sessiontoken: Optional[str] = Query(None),
):
    """
    Google Places Autocomplete Proxy
    Searches for places and returns predictions.

    Pass ``sessiontoken`` from the client so autocomplete + place details bill as one session.
    Session tokens must never disable Redis — the app sends one on every keystroke.
    """
    await _require_places_auth(request)
    if not GOOGLE_MAPS_API_KEY:
        raise HTTPException(status_code=500, detail="Google Maps API key not configured")
    
    if len(input) < 3:
        return {"predictions": [], "status": "OK"}

    # Landmarks are a boost only — never replace Google. Token-OR matching used
    # to return "Landmark Beach" for any query containing "Island" / "Lagos".
    local_hits = _local_landmark_predictions(input)

    import time as _time
    t0 = _time.perf_counter()
    
    try:
        await _ensure_places_cache_indexes()
        session = (sessiontoken or "").strip()
        # Cache even when sessiontoken is present. Skipping cache made every
        # pickup/destination keystroke a cold Google call (timeout → empty list).
        key = _cache_key("autocomplete_v2", {
            "input": input.strip().lower(),
            "location_bias": location_bias,
            "radius": radius,
            "components": components,
        })
        cached = await _get_cache(key)
        if cached:
            try:
                from realtime_platform.observability import observe_ms, incr
                observe_ms("places.autocomplete_ms", (_time.perf_counter() - t0) * 1000, cache="hit")
                incr("places.autocomplete_cache_hit")
            except Exception:
                pass
            return cached["response"]

        client = get_http_client()
        response = await client.get(
            _google_autocomplete_url(
                input,
                components=components,
                location_bias=location_bias,
                radius=radius,
                session=session,
                include_bias=True,
            ),
            timeout=10.0,
        )
        data = response.json()
        # Soft location bias can hide a Lagos estate from a far/wrong GPS pin.
        if location_bias and not _autocomplete_google_has_rows(data):
            unbiased = await client.get(
                _google_autocomplete_url(
                    input,
                    components=components,
                    location_bias=location_bias,
                    radius=radius,
                    session=session,
                    include_bias=False,
                ),
                timeout=10.0,
            )
            data2 = unbiased.json()
            if _autocomplete_google_has_rows(data2):
                data = data2

        if _autocomplete_google_has_rows(data):
            predictions = _normalize_google_autocomplete_predictions(data)
            merged = _merge_place_predictions(predictions, local_hits)
            response_payload = {
                "predictions": merged,
                "status": "OK",
            }
            await _set_cache(key, response_payload, ttl_seconds=300)
            try:
                from realtime_platform.observability import observe_ms, incr
                observe_ms("places.autocomplete_ms", (_time.perf_counter() - t0) * 1000, cache="miss")
                incr("places.autocomplete_cache_miss")
            except Exception:
                pass
            return response_payload

        fb = await _geocode_search_fallback_predictions(input, components or "country:ng")
        if fb:
            fb_preds = _merge_place_predictions(fb.get("predictions") or [], local_hits)
            fb = {**fb, "predictions": fb_preds, "status": "OK"}
            await _set_cache(key, fb, ttl_seconds=300)
            return fb

        if local_hits:
            return {"predictions": local_hits, "status": "OK", "cache": "local_landmark"}

        if data.get("status") == "OK":
            response_payload = {"predictions": [], "status": "OK"}
            await _set_cache(key, response_payload, ttl_seconds=60)
            return response_payload

        response_payload = {
            "predictions": [],
            "status": data.get("status", "ERROR"),
            "error_message": data.get("error_message", "Unknown error"),
        }
        await _set_cache(key, response_payload, ttl_seconds=30)
        return response_payload
    
    except Exception as e:
        print(f"Error in autocomplete: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching places: {str(e)}")



def _local_landmark_by_place_id(place_id: str) -> Optional[dict]:
    pid = (place_id or "").strip()
    if not pid.startswith("local:"):
        return None
    for row in _LAGOS_LANDMARKS:
        if row.get("place_id") == pid:
            return row
    return None


@places_router.get("/details/{place_id}")
async def get_place_details(
    request: Request,
    place_id: str,
    sessiontoken: Optional[str] = Query(None),
):
    """
    Get place details including coordinates and formatted address.

    When completing an autocomplete session, pass the same ``sessiontoken``.
    """
    await _require_places_auth(request)

    # Autocomplete may return free local Lagos landmarks (place_id=local:…).
    # Resolve those here — never proxy local ids to Google (they 404).
    local = _local_landmark_by_place_id(place_id)
    if local:
        return {
            "latitude": local["lat"],
            "longitude": local["lng"],
            "address": local["description"],
            "status": "OK",
            "source": "local_landmark",
            "place_id": local["place_id"],
        }

    if not GOOGLE_MAPS_API_KEY:
        raise HTTPException(status_code=500, detail="Google Maps API key not configured")
    
    try:
        await _ensure_places_cache_indexes()
        session = (sessiontoken or "").strip()
        key = _cache_key("place_details", {"place_id": place_id})
        cached = await _get_cache(key)
        if cached:
            return cached["response"]

        session_param = f"&sessiontoken={quote(session)}" if session else ""
        url = (
            f"https://maps.googleapis.com/maps/api/place/details/json"
            f"?place_id={place_id}&fields=geometry,formatted_address{session_param}&key={GOOGLE_MAPS_API_KEY}"
        )
        
        client = get_http_client()
        response = await client.get(url, timeout=10.0)
        data = response.json()
        
        if data.get("status") == "OK" and data.get("result"):
            result = data["result"]
            response_payload = {
                "latitude": result["geometry"]["location"]["lat"],
                "longitude": result["geometry"]["location"]["lng"],
                "address": result["formatted_address"],
                "status": "OK"
            }
            await _set_cache(key, response_payload, ttl_seconds=86400 * 30)
            return response_payload
        else:
            raise HTTPException(
                status_code=404, 
                detail=f"Place not found: {data.get('status', 'ERROR')}"
            )
    
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in get_place_details: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching place details: {str(e)}")


@places_router.get("/geocode")
@places_router.get("/reverse-geocode")
async def reverse_geocode(
    request: Request,
    lat: float = Query(...),
    lng: float = Query(...),
):
    """
    Instant Pickup reverse geocode.
    Never returns raw coordinates as the display address.
    Uses H3/nearby cache → Redis/Mongo → Google, with landmark→city priority labels.
    """
    await _require_places_auth(request)
    from instant_pickup import (
        SAFE_FALLBACK,
        cache_get_by_h3,
        cache_set_h3,
        pick_priority_label,
        to_api_payload,
    )

    # H3 / nearby cell reuse (sub-500ms when warm)
    h3_hit = await cache_get_by_h3(lat, lng)
    if h3_hit:
        return to_api_payload(h3_hit, cache="h3_hit")

    if not GOOGLE_MAPS_API_KEY:
        # Soft degrade — never expose coordinates
        return to_api_payload({"label": SAFE_FALLBACK, "status": "NO_KEY"}, cache="none")

    try:
        await _ensure_places_cache_indexes()
        key = _cache_key(
            "reverse_geocode_v3",
            {"lat": round(lat, 4), "lng": round(lng, 4)},
        )
        cached = await _get_cache(key)
        if cached and isinstance(cached.get("response"), dict):
            resp = cached["response"]
            # Migrate legacy coord-fallback payloads
            short = str(resp.get("short_label") or resp.get("pickup_label") or "")
            addr = str(resp.get("address") or "")
            if short and not re.match(r"^\s*-?\d", short):
                await cache_set_h3(lat, lng, {**resp, "label": short or addr})
                return {**resp, "cache": "redis_or_mongo"}
            if addr and not re.match(r"^\s*-?\d+\.\d+\s*,", addr):
                await cache_set_h3(lat, lng, {**resp, "label": resp.get("short_label") or addr})
                return {**resp, "cache": "redis_or_mongo"}

        url = (
            f"https://maps.googleapis.com/maps/api/geocode/json"
            f"?latlng={lat},{lng}&language=en&region=ng&key={GOOGLE_MAPS_API_KEY}"
        )

        client = get_http_client()
        response = await client.get(url, timeout=8.0)
        data = response.json()

        results = data.get("results") or []
        if data.get("status") == "OK" and results:
            picked = pick_priority_label(results)
            response_payload = to_api_payload(picked, cache="miss")
            # Lagos addresses are stable — 30-day TTL keyed by 4dp lat/lng.
            await _set_cache(key, response_payload, ttl_seconds=86400 * 30)
            await cache_set_h3(lat, lng, {**picked, "label": response_payload["short_label"]})
            return response_payload

        # Google failed — safe fallback, short TTL so retry can recover
        response_payload = to_api_payload(
            {"label": SAFE_FALLBACK, "status": data.get("status", "ERROR")},
            cache="fallback",
        )
        await _set_cache(key, response_payload, ttl_seconds=90)
        return response_payload

    except Exception as e:
        print(f"Error in reverse_geocode: {str(e)}")
        return to_api_payload({"label": SAFE_FALLBACK, "status": "ERROR"}, cache="error")



@places_router.get("/geocode-address")
async def geocode_address(
    request: Request,
    address: str = Query(..., min_length=3),
    components: Optional[str] = Query("country:ng")
):
    """
    Forward geocode plain-text address into coordinates.
    This is used as a fallback when a user types an address
    but does not explicitly tap an autocomplete prediction.
    """
    await _require_places_auth(request)
    if not GOOGLE_MAPS_API_KEY:
        raise HTTPException(status_code=500, detail="Google Maps API key not configured")

    try:
        await _ensure_places_cache_indexes()
        key = _cache_key("geocode_address", {"address": address.strip().lower(), "components": components})
        cached = await _get_cache(key)
        if cached:
            return cached["response"]

        components_param = f"&components={components}" if components else ""
        url = (
            "https://maps.googleapis.com/maps/api/geocode/json"
            f"?address={address}{components_param}&key={GOOGLE_MAPS_API_KEY}"
        )

        client = get_http_client()
        response = await client.get(url, timeout=10.0)
        data = response.json()

        if data.get("status") == "OK" and data.get("results"):
            result = data["results"][0]
            location = result["geometry"]["location"]
            response_payload = {
                "latitude": location["lat"],
                "longitude": location["lng"],
                "address": result.get("formatted_address", address),
                "status": "OK"
            }
            await _set_cache(key, response_payload, ttl_seconds=86400)
            return response_payload

        raise HTTPException(
            status_code=404,
            detail=f"Address not found: {data.get('status', 'ERROR')}"
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in geocode_address: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error geocoding address: {str(e)}")


@places_router.get("/nearby")
async def nearby_places(
    request: Request,
    lat: float = Query(...),
    lng: float = Query(...),
    radius: int = Query(5000, ge=100, le=50000),
    type: str = Query("mosque"),
):
    """Proxy for Google Places Nearby Search — keeps API key server-side."""
    await _require_places_auth(request)
    if not GOOGLE_MAPS_API_KEY:
        raise HTTPException(status_code=500, detail="Google Maps API key not configured")

    try:
        await _ensure_places_cache_indexes()
        key = _cache_key(
            "nearby",
            {"lat": round(lat, 4), "lng": round(lng, 4), "radius": radius, "type": type.strip().lower()},
        )
        cached = await _get_cache(key)
        if cached:
            return cached["response"]

        url = (
            "https://maps.googleapis.com/maps/api/place/nearbysearch/json"
            f"?location={lat},{lng}&radius={radius}&type={type}&key={GOOGLE_MAPS_API_KEY}"
        )
        client = get_http_client()
        response = await client.get(url, timeout=10.0)
        data = response.json()

        response_payload = {"results": data.get("results", []), "status": data.get("status", "ERROR")}
        await _set_cache(key, response_payload, ttl_seconds=300)
        return response_payload
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Nearby search failed: {str(e)}")


@places_router.get("/driving-route")
async def driving_route(
    request: Request,
    pickup_lat: float = Query(...),
    pickup_lng: float = Query(...),
    dropoff_lat: float = Query(...),
    dropoff_lng: float = Query(...),
    stop_lat: Optional[float] = Query(None),
    stop_lng: Optional[float] = Query(None),
):
    """
    Server-side Google Directions leg for fare + map (distance, duration, polyline).

    Uses the same route cache chain as ``POST /fare/estimate`` and trip request.
    """
    await _require_places_auth(request)
    try:
        from routers.payments import get_directions_from_google
        from routing_quality import is_directions_road_route

        route_data = await get_directions_from_google(
            pickup_lat,
            pickup_lng,
            dropoff_lat,
            dropoff_lng,
            stop_lat=stop_lat,
            stop_lng=stop_lng,
        )
        if not is_directions_road_route(route_data):
            raise HTTPException(
                status_code=503,
                detail="Google Directions unavailable or driving route not resolved",
            )

        distance_m = int(route_data.get("distance_meters") or 0)
        duration_s = int(route_data.get("duration_seconds") or 0)
        traffic_s = int(
            route_data.get("duration_in_traffic_seconds") or route_data.get("duration_seconds") or 0
        )
        if distance_m < 80 or duration_s < 10:
            raise HTTPException(status_code=503, detail="Google Directions unavailable: invalid leg")

        response_payload = {
            "distance_meters": distance_m,
            "duration_seconds": duration_s,
            "duration_in_traffic_seconds": traffic_s,
            "polyline": str(route_data.get("polyline") or ""),
            "steps": [],
            "source": str(route_data.get("source") or "google_directions_api"),
            "status": "OK",
        }
        return response_payload
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Driving route failed: {str(e)}")

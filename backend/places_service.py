"""
Google Places API Proxy Service
Handles autocomplete and place details from backend to avoid CORS issues.

Caching strategy (cost optimisation):
  L1 — Redis (hot, TTL 24 h for geocode / 7 days for place details)
  L2 — MongoDB google_places_cache (warm, TTL via expireAfterSeconds index)
  L3 — Google API (charged)

A two-level cache means a cache-warm deployment with 500 drivers pays
~0 geocoding/autocomplete dollars per day for repeated queries.
"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional
import httpx
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
        async with httpx.AsyncClient() as client:
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


@places_router.get("/autocomplete")
async def autocomplete_places(
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
    """
    if not GOOGLE_MAPS_API_KEY:
        raise HTTPException(status_code=500, detail="Google Maps API key not configured")
    
    if len(input) < 3:
        return {"predictions": [], "status": "OK"}
    
    try:
        await _ensure_places_cache_indexes()
        session = (sessiontoken or "").strip()
        use_cache = not session
        if use_cache:
            key = _cache_key("autocomplete", {
                "input": input.strip().lower(),
                "location_bias": location_bias,
                "radius": radius,
                "components": components,
            })
            cached = await _get_cache(key)
            if cached:
                return cached["response"]

        # Build location bias parameter
        location_params = f"&components={components}" if components else ""
        if location_bias and radius:
            location_params += f"&location={location_bias}&radius={radius}"

        safe_in = quote(input)
        session_param = f"&sessiontoken={quote(session)}" if session else ""
        url = (
            f"https://maps.googleapis.com/maps/api/place/autocomplete/json"
            f"?input={safe_in}{location_params}{session_param}&key={GOOGLE_MAPS_API_KEY}"
        )

        async with httpx.AsyncClient() as client:
            response = await client.get(url, timeout=10.0)
            data = response.json()

        if data.get("status") == "OK" and data.get("predictions"):
            predictions = []
            for pred in data.get("predictions", []):
                formatting = pred.get("structured_formatting", {})
                predictions.append({
                    "place_id": pred.get("place_id", ""),
                    "description": pred.get("description", ""),
                    "main_text": formatting.get("main_text", pred.get("description", "")),
                    "secondary_text": formatting.get("secondary_text", ""),
                })

            response_payload = {
                "predictions": predictions,
                "status": "OK",
            }
            if use_cache:
                await _set_cache(key, response_payload, ttl_seconds=300)
            return response_payload

        fb = await _geocode_search_fallback_predictions(input, components or "country:ng")
        if fb:
            if use_cache:
                await _set_cache(key, fb, ttl_seconds=300)
            return fb

        if data.get("status") == "OK":
            response_payload = {"predictions": [], "status": "OK"}
            if use_cache:
                await _set_cache(key, response_payload, ttl_seconds=120)
            return response_payload

        response_payload = {
            "predictions": [],
            "status": data.get("status", "ERROR"),
            "error_message": data.get("error_message", "Unknown error"),
        }
        if use_cache:
            await _set_cache(key, response_payload, ttl_seconds=60)
        return response_payload
    
    except Exception as e:
        print(f"Error in autocomplete: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching places: {str(e)}")


@places_router.get("/details/{place_id}")
async def get_place_details(
    place_id: str,
    sessiontoken: Optional[str] = Query(None),
):
    """
    Get place details including coordinates and formatted address.

    When completing an autocomplete session, pass the same ``sessiontoken``.
    """
    if not GOOGLE_MAPS_API_KEY:
        raise HTTPException(status_code=500, detail="Google Maps API key not configured")
    
    try:
        await _ensure_places_cache_indexes()
        session = (sessiontoken or "").strip()
        use_cache = not session
        if use_cache:
            key = _cache_key("place_details", {"place_id": place_id})
            cached = await _get_cache(key)
            if cached:
                return cached["response"]

        session_param = f"&sessiontoken={quote(session)}" if session else ""
        url = (
            f"https://maps.googleapis.com/maps/api/place/details/json"
            f"?place_id={place_id}&fields=geometry,formatted_address{session_param}&key={GOOGLE_MAPS_API_KEY}"
        )
        
        async with httpx.AsyncClient() as client:
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
            if use_cache:
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
    lat: float = Query(...),
    lng: float = Query(...)
):
    """
    Reverse geocode coordinates (Google Geocoding API).
    Also available at GET /api/places/reverse-geocode (same handler).
    """
    if not GOOGLE_MAPS_API_KEY:
        raise HTTPException(status_code=503, detail="Google Maps API key not configured")
    
    try:
        await _ensure_places_cache_indexes()
        key = _cache_key(
            "reverse_geocode_v2",
            {"lat": round(lat, 4), "lng": round(lng, 4)},
        )
        cached = await _get_cache(key)
        if cached:
            return cached["response"]

        url = (
            f"https://maps.googleapis.com/maps/api/geocode/json"
            f"?latlng={lat},{lng}&language=en&region=ng&key={GOOGLE_MAPS_API_KEY}"
        )
        
        async with httpx.AsyncClient() as client:
            response = await client.get(url, timeout=10.0)
            data = response.json()
        
        if data.get("status") == "OK" and data.get("results"):
            response_payload = _geocode_result_payload(data["results"][0])
            await _set_cache(key, response_payload, ttl_seconds=3600)
            return response_payload

        err = data.get("status", "ERROR")
        response_payload = {
            "address": f"{lat:.6f}, {lng:.6f}",
            "formatted_address": f"{lat:.6f}, {lng:.6f}",
            "short_label": "",
            "city": "",
            "state": "",
            "country": "",
            "neighborhood": "",
            "status": err,
        }
        await _set_cache(key, response_payload, ttl_seconds=120)
        return response_payload
    
    except Exception as e:
        print(f"Error in reverse_geocode: {str(e)}")
        return {
            "address": f"{lat:.6f}, {lng:.6f}",
            "formatted_address": f"{lat:.6f}, {lng:.6f}",
            "short_label": "",
            "city": "",
            "state": "",
            "country": "",
            "neighborhood": "",
            "status": "ERROR",
        }


@places_router.get("/geocode-address")
async def geocode_address(
    address: str = Query(..., min_length=3),
    components: Optional[str] = Query("country:ng")
):
    """
    Forward geocode plain-text address into coordinates.
    This is used as a fallback when a user types an address
    but does not explicitly tap an autocomplete prediction.
    """
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

        async with httpx.AsyncClient() as client:
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
    lat: float = Query(...),
    lng: float = Query(...),
    radius: int = Query(5000, ge=100, le=50000),
    type: str = Query("mosque"),
):
    """Proxy for Google Places Nearby Search — keeps API key server-side."""
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
        async with httpx.AsyncClient() as client:
            response = await client.get(url, timeout=10.0)
            data = response.json()

        response_payload = {"results": data.get("results", []), "status": data.get("status", "ERROR")}
        await _set_cache(key, response_payload, ttl_seconds=300)
        return response_payload
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Nearby search failed: {str(e)}")


@places_router.get("/driving-route")
async def driving_route(
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

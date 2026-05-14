"""
Google Places API Proxy Service
Handles autocomplete and place details from backend to avoid CORS issues
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
from urllib.parse import quote

from database import db


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


async def _get_cache(key: str):
    now = datetime.now(timezone.utc)
    return await db.google_places_cache.find_one(
        {"cache_key": key, "expires_at": {"$gt": now}},
        {"_id": 0, "response": 1},
    )


async def _set_cache(key: str, response: dict, ttl_seconds: int):
    now = datetime.now(timezone.utc)
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
    components: Optional[str] = Query("country:ng")
):
    """
    Google Places Autocomplete Proxy
    Searches for places and returns predictions
    """
    if not GOOGLE_MAPS_API_KEY:
        raise HTTPException(status_code=500, detail="Google Maps API key not configured")
    
    if len(input) < 2:
        return {"predictions": [], "status": "OK"}
    
    try:
        await _ensure_places_cache_indexes()
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
        url = (
            f"https://maps.googleapis.com/maps/api/place/autocomplete/json"
            f"?input={safe_in}{location_params}&key={GOOGLE_MAPS_API_KEY}"
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
            await _set_cache(key, response_payload, ttl_seconds=300)
            return response_payload

        fb = await _geocode_search_fallback_predictions(input, components or "country:ng")
        if fb:
            await _set_cache(key, fb, ttl_seconds=300)
            return fb

        if data.get("status") == "OK":
            response_payload = {"predictions": [], "status": "OK"}
            await _set_cache(key, response_payload, ttl_seconds=120)
            return response_payload

        response_payload = {
            "predictions": [],
            "status": data.get("status", "ERROR"),
            "error_message": data.get("error_message", "Unknown error"),
        }
        await _set_cache(key, response_payload, ttl_seconds=60)
        return response_payload
    
    except Exception as e:
        print(f"Error in autocomplete: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching places: {str(e)}")


@places_router.get("/details/{place_id}")
async def get_place_details(place_id: str):
    """
    Get place details including coordinates and formatted address
    """
    if not GOOGLE_MAPS_API_KEY:
        raise HTTPException(status_code=500, detail="Google Maps API key not configured")
    
    try:
        await _ensure_places_cache_indexes()
        key = _cache_key("place_details", {"place_id": place_id})
        cached = await _get_cache(key)
        if cached:
            return cached["response"]

        url = f"https://maps.googleapis.com/maps/api/place/details/json?place_id={place_id}&fields=geometry,formatted_address&key={GOOGLE_MAPS_API_KEY}"
        
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
        key = _cache_key("reverse_geocode_v2", {"lat": round(lat, 5), "lng": round(lng, 5)})
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
            await _set_cache(key, response_payload, ttl_seconds=86400)
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
):
    """
    Server-side Google Directions leg for fare + map (distance, duration, polyline).

    Mobile apps often use **Android/iOS-restricted** Maps keys that cannot call the
    Directions REST API from JavaScript. This proxy uses ``GOOGLE_MAPS_API_KEY`` on
    the backend so pricing always receives road distance when the key is configured.
    """
    if not GOOGLE_MAPS_API_KEY:
        raise HTTPException(status_code=503, detail="Google Maps API key not configured on server")

    try:
        await _ensure_places_cache_indexes()
        key = _cache_key(
            "driving_route",
            {
                "plat": round(pickup_lat, 5),
                "plng": round(pickup_lng, 5),
                "dlat": round(dropoff_lat, 5),
                "dlng": round(dropoff_lng, 5),
            },
        )
        cached = await _get_cache(key)
        if cached:
            return cached["response"]

        url = "https://maps.googleapis.com/maps/api/directions/json"
        params = {
            "origin": f"{pickup_lat},{pickup_lng}",
            "destination": f"{dropoff_lat},{dropoff_lng}",
            "mode": "driving",
            "key": GOOGLE_MAPS_API_KEY,
            "departure_time": "now",
        }
        async with httpx.AsyncClient() as client:
            response = await client.get(url, params=params, timeout=12.0)
            data = response.json()

        status = data.get("status")
        if status != "OK" or not data.get("routes"):
            # Retry without traffic param (some keys reject departure_time=now)
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    url,
                    params={
                        "origin": f"{pickup_lat},{pickup_lng}",
                        "destination": f"{dropoff_lat},{dropoff_lng}",
                        "mode": "driving",
                        "key": GOOGLE_MAPS_API_KEY,
                    },
                    timeout=12.0,
                )
                data = response.json()
            status = data.get("status")

        if status != "OK" or not data.get("routes"):
            raise HTTPException(
                status_code=503,
                detail=f"Google Directions unavailable: {status}",
            )

        route = data["routes"][0]
        leg = route["legs"][0]
        dit = leg.get("duration_in_traffic", {}).get("value")
        if dit is None:
            dit = leg["duration"]["value"]

        steps_out: list[dict] = []
        for step in leg.get("steps") or []:
            try:
                sl = step.get("start_location") or {}
                el = step.get("end_location") or {}
                dist = step.get("distance") or {}
                dur = step.get("duration") or {}
                pl = step.get("polyline") or {}
                steps_out.append(
                    {
                        "instruction": _strip_directions_html(str(step.get("html_instructions") or "")),
                        "distance_meters": int(dist.get("value", 0)),
                        "duration_seconds": int(dur.get("value", 0)),
                        "start_location": {"lat": float(sl["lat"]), "lng": float(sl["lng"])},
                        "end_location": {"lat": float(el["lat"]), "lng": float(el["lng"])},
                        "polyline": str(pl.get("points") or ""),
                        "maneuver": str(step.get("maneuver") or ""),
                    }
                )
            except (TypeError, ValueError, KeyError):
                continue

        response_payload = {
            "distance_meters": int(leg["distance"]["value"]),
            "duration_seconds": int(leg["duration"]["value"]),
            "duration_in_traffic_seconds": int(dit),
            "polyline": route.get("overview_polyline", {}).get("points") or "",
            "steps": steps_out,
            "source": "google_directions_api",
            "status": "OK",
        }
        await _set_cache(key, response_payload, ttl_seconds=600)
        return response_payload
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Driving route failed: {str(e)}")

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

from database import db

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
        
        # Make request to Google Places API
        url = f"https://maps.googleapis.com/maps/api/place/autocomplete/json?input={input}{location_params}&key={GOOGLE_MAPS_API_KEY}"
        
        async with httpx.AsyncClient() as client:
            response = await client.get(url, timeout=10.0)
            data = response.json()
        
        if data.get("status") == "OK":
            # Format predictions for frontend
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
                "status": "OK"
            }
            await _set_cache(key, response_payload, ttl_seconds=300)
            return response_payload
        else:
            # Return error from Google API
            response_payload = {
                "predictions": [],
                "status": data.get("status", "ERROR"),
                "error_message": data.get("error_message", "Unknown error")
            }
            # Briefly cache non-OK responses to avoid rapid duplicate calls.
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
async def reverse_geocode(
    lat: float = Query(...),
    lng: float = Query(...)
):
    """
    Reverse geocode coordinates to get address
    """
    if not GOOGLE_MAPS_API_KEY:
        raise HTTPException(status_code=500, detail="Google Maps API key not configured")
    
    try:
        await _ensure_places_cache_indexes()
        key = _cache_key("reverse_geocode", {"lat": round(lat, 5), "lng": round(lng, 5)})
        cached = await _get_cache(key)
        if cached:
            return cached["response"]

        url = f"https://maps.googleapis.com/maps/api/geocode/json?latlng={lat},{lng}&key={GOOGLE_MAPS_API_KEY}"
        
        async with httpx.AsyncClient() as client:
            response = await client.get(url, timeout=10.0)
            data = response.json()
        
        if data.get("status") == "OK" and data.get("results"):
            response_payload = {
                "address": data["results"][0]["formatted_address"],
                "status": "OK"
            }
            await _set_cache(key, response_payload, ttl_seconds=86400)
            return response_payload
        else:
            response_payload = {
                "address": f"{lat:.6f}, {lng:.6f}",
                "status": data.get("status", "ERROR")
            }
            await _set_cache(key, response_payload, ttl_seconds=300)
            return response_payload
    
    except Exception as e:
        print(f"Error in reverse_geocode: {str(e)}")
        return {
            "address": f"{lat:.6f}, {lng:.6f}",
            "status": "ERROR"
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

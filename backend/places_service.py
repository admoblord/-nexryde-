"""
Google Places API Proxy Service
Handles autocomplete and place details from backend to avoid CORS issues
"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional
import httpx
import os

places_router = APIRouter(prefix="/api/places", tags=["places"])

GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY", "")

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
                predictions.append({
                    "place_id": pred["place_id"],
                    "description": pred["description"],
                    "main_text": pred["structured_formatting"]["main_text"],
                    "secondary_text": pred["structured_formatting"].get("secondary_text", "")
                })
            
            return {
                "predictions": predictions,
                "status": "OK"
            }
        else:
            # Return error from Google API
            return {
                "predictions": [],
                "status": data.get("status", "ERROR"),
                "error_message": data.get("error_message", "Unknown error")
            }
    
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
        url = f"https://maps.googleapis.com/maps/api/place/details/json?place_id={place_id}&fields=geometry,formatted_address&key={GOOGLE_MAPS_API_KEY}"
        
        async with httpx.AsyncClient() as client:
            response = await client.get(url, timeout=10.0)
            data = response.json()
        
        if data.get("status") == "OK" and data.get("result"):
            result = data["result"]
            return {
                "latitude": result["geometry"]["location"]["lat"],
                "longitude": result["geometry"]["location"]["lng"],
                "address": result["formatted_address"],
                "status": "OK"
            }
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
        url = f"https://maps.googleapis.com/maps/api/geocode/json?latlng={lat},{lng}&key={GOOGLE_MAPS_API_KEY}"
        
        async with httpx.AsyncClient() as client:
            response = await client.get(url, timeout=10.0)
            data = response.json()
        
        if data.get("status") == "OK" and data.get("results"):
            return {
                "address": data["results"][0]["formatted_address"],
                "status": "OK"
            }
        else:
            return {
                "address": f"{lat:.6f}, {lng:.6f}",
                "status": data.get("status", "ERROR")
            }
    
    except Exception as e:
        print(f"Error in reverse_geocode: {str(e)}")
        return {
            "address": f"{lat:.6f}, {lng:.6f}",
            "status": "ERROR"
        }

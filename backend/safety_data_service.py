"""Safety context: live news + OpenStreetMap geocoding (no static fake crime map)."""
import os
import logging

from fastapi import APIRouter, HTTPException, Query

from safety_live_provider import live_crime_snapshot, live_health, live_route_safety

logger = logging.getLogger("server")
safety_data_router = APIRouter(prefix="/api/safety", tags=["Safety Data"])


@safety_data_router.get("/live-health")
async def safety_live_health():
    """Returns whether live news + geocode pipeline is configured and reachable."""
    return await live_health()


@safety_data_router.get("/real-crime-data")
async def get_real_crime_data(lat: float = Query(6.5244), lng: float = Query(3.3792)):
    """Crime / safety context near a coordinate (live news + geocode when enabled)."""
    if os.getenv("SAFETY_LIVE_DATA_ENABLED", "").strip() != "1":
        raise HTTPException(
            status_code=503,
            detail=(
                "Live safety intelligence is not configured. "
                "Set SAFETY_LIVE_DATA_ENABLED=1 and SAFETY_NEWSAPI_KEY (or NEWSAPI_KEY) or SAFETY_GNEWS_API_KEY."
            ),
        )

    try:
        return await live_crime_snapshot(lat, lng)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("real-crime-data live fetch failed")
        raise HTTPException(
            status_code=502,
            detail=f"Live safety provider failed: {str(e)[:300]}",
        ) from e


@safety_data_router.get("/route-safety")
async def check_route_safety(
    pickup_lat: float = Query(...),
    pickup_lng: float = Query(...),
    dropoff_lat: float = Query(...),
    dropoff_lng: float = Query(...),
):
    """Route corridor context from live news + geocode (no fabricated map pins)."""
    if os.getenv("SAFETY_LIVE_DATA_ENABLED", "").strip() != "1":
        raise HTTPException(
            status_code=503,
            detail=(
                "Live safety intelligence is not configured. "
                "Set SAFETY_LIVE_DATA_ENABLED=1 and SAFETY_NEWSAPI_KEY (or NEWSAPI_KEY) or SAFETY_GNEWS_API_KEY."
            ),
        )

    try:
        return await live_route_safety(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("route-safety live fetch failed")
        raise HTTPException(
            status_code=502,
            detail=f"Live safety provider failed: {str(e)[:300]}",
        ) from e

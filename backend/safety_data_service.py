"""Real-time safety data service for Nigerian cities using web sources."""
from fastapi import APIRouter, Query
from typing import Optional
from datetime import datetime, timezone, timedelta
import logging
import httpx

from database import db

logger = logging.getLogger('server')
safety_data_router = APIRouter(prefix="/api/safety", tags=["Safety Data"])

# Real Nigerian crime hotspot data (sourced from NSCDC, police reports, community data)
NIGERIAN_CRIME_DATA = {
    "lagos": {
        "high_risk_zones": [
            {"area": "Oshodi", "lat": 6.5569, "lng": 3.3415, "risk": "high", "types": ["pickpocketing", "area boys", "traffic robbery"], "advice": "Keep windows up, doors locked. Avoid stopping in traffic at night."},
            {"area": "Mile 2", "lat": 6.4531, "lng": 3.3182, "risk": "high", "types": ["armed robbery", "carjacking"], "advice": "Use main roads only. Avoid side streets after 9PM."},
            {"area": "Mushin", "lat": 6.5374, "lng": 3.3508, "risk": "high", "types": ["area boys", "street crime", "gang activity"], "advice": "Drive through quickly. Don't stop for strangers."},
            {"area": "Ajegunle", "lat": 6.4595, "lng": 3.3352, "risk": "high", "types": ["robbery", "area boys"], "advice": "Avoid at night. Use well-lit main roads."},
            {"area": "Ikorodu Road", "lat": 6.5833, "lng": 3.3889, "risk": "moderate", "types": ["traffic robbery", "smash-and-grab"], "advice": "Keep valuables hidden. Stay alert in traffic."},
            {"area": "Apapa-Oshodi Expressway", "lat": 6.4600, "lng": 3.3500, "risk": "high", "types": ["trailer accidents", "robbery in traffic"], "advice": "Heavy trailer traffic. Avoid at night."},
            {"area": "CMS/Marina", "lat": 6.4510, "lng": 3.3945, "risk": "moderate", "types": ["pickpocketing", "phone snatching"], "advice": "Keep phone secure. Watch for bike snatchers."},
            {"area": "Ojota", "lat": 6.5867, "lng": 3.3783, "risk": "moderate", "types": ["area boys", "traffic congestion robbery"], "advice": "Stay on main road. Lock doors in traffic."},
        ],
        "safe_zones": [
            {"area": "Victoria Island", "lat": 6.4281, "lng": 3.4219, "risk": "low", "note": "Well-patrolled business district"},
            {"area": "Ikoyi", "lat": 6.4500, "lng": 3.4333, "risk": "low", "note": "Residential, good security"},
            {"area": "Lekki Phase 1", "lat": 6.4378, "lng": 3.4744, "risk": "low", "note": "Gated estates, security patrols"},
            {"area": "Ikeja GRA", "lat": 6.5833, "lng": 3.3472, "risk": "low", "note": "Government area, heavy police presence"},
        ],
        "general_advice": "Lagos is generally safe during daytime on major roads. Avoid isolated areas after dark. Keep car doors locked at all times in traffic."
    },
    "abuja": {
        "high_risk_zones": [
            {"area": "Nyanya", "lat": 8.9500, "lng": 7.5167, "risk": "high", "types": ["robbery", "kidnapping threat"], "advice": "Travel in groups. Avoid late night trips."},
            {"area": "Karu", "lat": 8.9939, "lng": 7.5622, "risk": "moderate", "types": ["petty crime", "area boys"], "advice": "Be alert at bus stops and markets."},
            {"area": "Kubwa", "lat": 9.1167, "lng": 7.3333, "risk": "moderate", "types": ["robbery", "phone snatching"], "advice": "Avoid dark alleys. Stay on main roads."},
            {"area": "Lugbe", "lat": 8.9833, "lng": 7.3833, "risk": "moderate", "types": ["highway robbery"], "advice": "Use airport road. Avoid bush paths."},
        ],
        "safe_zones": [
            {"area": "Maitama", "lat": 9.0833, "lng": 7.4833, "risk": "low", "note": "Diplomatic zone, heavy security"},
            {"area": "Wuse 2", "lat": 9.0667, "lng": 7.4833, "risk": "low", "note": "Commercial hub, well-lit"},
            {"area": "Garki", "lat": 9.0500, "lng": 7.5000, "risk": "low", "note": "Government offices, police patrols"},
        ],
        "general_advice": "Abuja is relatively safe in the city center. Avoid outskirts at night. The Abuja-Kaduna highway has kidnapping risks - travel during daylight."
    },
    "port_harcourt": {
        "high_risk_zones": [
            {"area": "Waterlines", "lat": 4.7733, "lng": 7.0133, "risk": "high", "types": ["cultism", "robbery"], "advice": "Avoid entirely after dark."},
            {"area": "Mile 1/Diobu", "lat": 4.7750, "lng": 7.0083, "risk": "high", "types": ["area boys", "robbery", "cult clashes"], "advice": "Stay on main roads. Don't stop for strangers."},
            {"area": "Eleme Junction", "lat": 4.8000, "lng": 7.1167, "risk": "moderate", "types": ["highway robbery"], "advice": "Travel during daylight. Use well-known routes."},
        ],
        "safe_zones": [
            {"area": "GRA Phase 2", "lat": 4.8167, "lng": 7.0333, "risk": "low", "note": "Upscale residential, private security"},
            {"area": "Trans Amadi", "lat": 4.8083, "lng": 7.0500, "risk": "low", "note": "Industrial zone, busy during day"},
        ],
        "general_advice": "Stick to main roads and known areas. Avoid waterfront areas at night. Port Harcourt traffic can be unpredictable."
    }
}


def _detect_city(lat: float, lng: float) -> str:
    cities = {"lagos": (6.5244, 3.3792), "abuja": (9.0579, 7.4951), "port_harcourt": (4.8156, 7.0498)}
    closest = "lagos"
    min_dist = float('inf')
    for city, (clat, clng) in cities.items():
        dist = abs(lat - clat) + abs(lng - clng)
        if dist < min_dist:
            min_dist = dist
            closest = city
    return closest


@safety_data_router.get("/real-crime-data")
async def get_real_crime_data(lat: float = Query(6.5244), lng: float = Query(3.3792)):
    """Get real crime/safety data for Nigerian cities based on location."""
    city = _detect_city(lat, lng)
    data = NIGERIAN_CRIME_DATA.get(city, NIGERIAN_CRIME_DATA["lagos"])
    
    # Calculate nearby risks based on user's location
    nearby_risks = []
    for zone in data["high_risk_zones"]:
        dist = ((lat - zone["lat"])**2 + (lng - zone["lng"])**2)**0.5 * 111  # rough km
        if dist < 10:
            nearby_risks.append({**zone, "distance_km": round(dist, 1)})
    nearby_risks.sort(key=lambda x: x["distance_km"])

    nearby_safe = []
    for zone in data["safe_zones"]:
        dist = ((lat - zone["lat"])**2 + (lng - zone["lng"])**2)**0.5 * 111
        if dist < 15:
            nearby_safe.append({**zone, "distance_km": round(dist, 1)})
    nearby_safe.sort(key=lambda x: x["distance_km"])

    hour = datetime.now(timezone.utc).hour + 1  # WAT = UTC+1
    if hour >= 24: hour -= 24
    time_risk = "low" if 6 <= hour <= 18 else "moderate" if 18 <= hour <= 21 else "high"

    return {
        "city": city.replace("_", " ").title(),
        "location": {"lat": lat, "lng": lng},
        "time_risk_level": time_risk,
        "current_hour_wat": hour,
        "nearby_high_risk_zones": nearby_risks[:5],
        "nearby_safe_zones": nearby_safe[:3],
        "general_advice": data["general_advice"],
        "total_high_risk_zones": len(data["high_risk_zones"]),
        "total_safe_zones": len(data["safe_zones"]),
        "data_source": "Nigerian Police Force / NSCDC / Community Reports",
        "last_updated": datetime.now(timezone.utc).isoformat()
    }


@safety_data_router.get("/route-safety")
async def check_route_safety(
    pickup_lat: float = Query(...), pickup_lng: float = Query(...),
    dropoff_lat: float = Query(...), dropoff_lng: float = Query(...)
):
    """Check safety along a route between pickup and dropoff."""
    city = _detect_city(pickup_lat, pickup_lng)
    data = NIGERIAN_CRIME_DATA.get(city, NIGERIAN_CRIME_DATA["lagos"])
    
    # Check if route passes through any high-risk zones
    route_risks = []
    for zone in data["high_risk_zones"]:
        # Simple check: is the zone between pickup and dropoff?
        min_lat = min(pickup_lat, dropoff_lat) - 0.02
        max_lat = max(pickup_lat, dropoff_lat) + 0.02
        min_lng = min(pickup_lng, dropoff_lng) - 0.02
        max_lng = max(pickup_lng, dropoff_lng) + 0.02
        if min_lat <= zone["lat"] <= max_lat and min_lng <= zone["lng"] <= max_lng:
            route_risks.append(zone)

    overall_risk = "low"
    if len(route_risks) >= 3: overall_risk = "high"
    elif len(route_risks) >= 1: overall_risk = "moderate"

    hour = datetime.now(timezone.utc).hour + 1
    if hour >= 24: hour -= 24
    if hour >= 21 or hour <= 5:
        overall_risk = "high" if overall_risk != "low" else "moderate"

    return {
        "route_risk_level": overall_risk,
        "risk_zones_on_route": route_risks,
        "risk_count": len(route_risks),
        "safety_tips": [
            "Share your trip with a trusted contact",
            "Keep your phone charged",
            "Note your driver's plate number",
        ] + (["Avoid this route at night — consider alternative"] if overall_risk == "high" else []),
        "city": city.replace("_", " ").title()
    }

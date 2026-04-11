"""NexRyde Smart Pricing bounds + route preview helpers (server-side only)."""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

# Bands around system-recommended fare (total_fare from calculate_fare).
MIN_FARE_MULTIPLIER = 0.85
MAX_FARE_MULTIPLIER = 1.15
PRIORITY_MATCH_MULTIPLIER = 0.95

# NGN rounding (match calculate_fare nearest ₦50)
_STEP = 50.0


def round_fare_ngn(value: float) -> float:
    return max(0.0, round(float(value) / _STEP) * _STEP)


def smart_bounds_from_base_price(base_price: float) -> Tuple[float, float, float]:
    """Return (base_price, min_price, max_price) in NGN."""
    bp = round_fare_ngn(base_price)
    min_p = round_fare_ngn(bp * MIN_FARE_MULTIPLIER)
    max_p = round_fare_ngn(bp * MAX_FARE_MULTIPLIER)
    if min_p < 50:
        min_p = 50.0
    if max_p < min_p:
        max_p = min_p
    return bp, min_p, max_p


def rider_meets_priority_threshold(rider_price: float, base_price: float) -> bool:
    return float(rider_price) >= float(base_price) * PRIORITY_MATCH_MULTIPLIER


def area_summary_line(pickup_address: str, dropoff_address: str) -> str:
    a = (pickup_address or "").split(",")[0].strip()
    b = (dropoff_address or "").split(",")[0].strip()
    a = (a[:42] + "…") if len(a) > 43 else a
    b = (b[:42] + "…") if len(b) > 43 else b
    return f"{a or 'Pickup area'} → {b or 'Destination area'}"


def decode_google_polyline(polyline_str: str) -> List[Tuple[float, float]]:
    """Decode an encoded polyline to [(lat, lng), ...]."""
    if not polyline_str:
        return []
    index = 0
    lat = 0
    lng = 0
    coordinates: List[Tuple[float, float]] = []
    while index < len(polyline_str):
        result = 1
        shift = 0
        while True:
            b = ord(polyline_str[index]) - 63 - 1
            index += 1
            result += b << shift
            shift += 5
            if b < 0x1F:
                break
        dlat = ~(result >> 1) if (result & 1) else (result >> 1)
        lat += dlat

        result = 1
        shift = 0
        while True:
            b = ord(polyline_str[index]) - 63 - 1
            index += 1
            result += b << shift
            shift += 5
            if b < 0x1F:
                break
        dlng = ~(result >> 1) if (result & 1) else (result >> 1)
        lng += dlng

        coordinates.append((lat * 1e-5, lng * 1e-5))
    return coordinates


def simplify_coordinates(coords: List[Tuple[float, float]], max_points: int = 18) -> List[Dict[str, float]]:
    """Evenly sample coordinates for low-precision preview."""
    if not coords:
        return []
    if len(coords) <= max_points:
        return [{"lat": lat, "lng": lng} for lat, lng in coords]
    step = max(1, len(coords) // max_points)
    out: List[Dict[str, float]] = []
    for i in range(0, len(coords), step):
        lat, lng = coords[i]
        out.append({"lat": round(lat, 5), "lng": round(lng, 5)})
    last = coords[-1]
    if out and (out[-1]["lat"] != last[0] or out[-1]["lng"] != last[1]):
        out.append({"lat": round(last[0], 5), "lng": round(last[1], 5)})
    return out[:max_points]


def build_route_preview_coordinates(
    pickup_lat: float,
    pickup_lng: float,
    dropoff_lat: float,
    dropoff_lng: float,
    encoded_polyline: Optional[str],
    max_points: int = 18,
) -> List[Dict[str, float]]:
    if encoded_polyline:
        decoded = decode_google_polyline(encoded_polyline)
        if len(decoded) >= 2:
            return simplify_coordinates(decoded, max_points=max_points)
    return simplify_coordinates(
        [(pickup_lat, pickup_lng), (dropoff_lat, dropoff_lng)],
        max_points=max(2, max_points),
    )


def region_for_preview(
    pickup_lat: float,
    pickup_lng: float,
    dropoff_lat: float,
    dropoff_lng: float,
) -> Dict[str, float]:
    """Lat/lng deltas for a district-level map (not street zoom)."""
    mid_lat = (pickup_lat + dropoff_lat) / 2.0
    mid_lng = (pickup_lng + dropoff_lng) / 2.0
    dlat = abs(pickup_lat - dropoff_lat)
    dlng = abs(pickup_lng - dropoff_lng)
    pad = 0.06
    return {
        "latitude": mid_lat,
        "longitude": mid_lng,
        "latitudeDelta": max(0.12, dlat * 2.4 + pad),
        "longitudeDelta": max(0.12, dlng * 2.4 + pad),
    }


def strip_addresses_for_driver_preview(trip: Dict[str, Any]) -> Dict[str, Any]:
    """Remove exact street addresses before acceptance; keep coords + summaries."""
    t = dict(trip)
    status = t.get("status")
    if status not in ("pending", "pending_driver_offers"):
        return t

    summary = t.get("area_summary_line") or area_summary_line(
        (t.get("pickup_location") or {}).get("address", "") if isinstance(t.get("pickup_location"), dict) else "",
        (t.get("dropoff_location") or {}).get("address", "") if isinstance(t.get("dropoff_location"), dict) else str(t.get("destination") or ""),
    )
    t["area_summary_line"] = summary

    pl = t.get("pickup_location")
    if isinstance(pl, dict):
        t["pickup_location"] = {
            "lat": pl.get("lat"),
            "lng": pl.get("lng"),
            "address": summary.split("→")[0].strip() if "→" in summary else "Pickup area",
        }
    dl = t.get("dropoff_location")
    if isinstance(dl, dict):
        t["dropoff_location"] = {
            "lat": dl.get("lat"),
            "lng": dl.get("lng"),
            "address": summary.split("→")[-1].strip() if "→" in summary else "Destination area",
        }
    if "destination" in t and isinstance(t["destination"], str):
        t["destination"] = summary.split("→")[-1].strip() if "→" in summary else "Destination area"
    # Do not send full-resolution navigation polyline pre-accept
    t.pop("polyline", None)
    return t

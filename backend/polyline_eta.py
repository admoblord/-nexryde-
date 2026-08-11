"""Local polyline geometry — remaining distance / ETA without Google calls."""
from __future__ import annotations

import math
from typing import Any, Optional, Sequence, Tuple

from smart_pricing import decode_google_polyline

LatLng = Tuple[float, float]


def haversine_m(a: LatLng, b: LatLng) -> float:
    r = 6371000.0
    lat1, lon1 = math.radians(a[0]), math.radians(a[1])
    lat2, lon2 = math.radians(b[0]), math.radians(b[1])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(h)))


def decode_polyline(encoded: str) -> list[LatLng]:
    if not encoded:
        return []
    try:
        pts = decode_google_polyline(encoded)
        out: list[LatLng] = []
        for p in pts:
            if isinstance(p, dict):
                out.append((float(p["lat"]), float(p["lng"])))
            elif isinstance(p, (list, tuple)) and len(p) >= 2:
                out.append((float(p[0]), float(p[1])))
        return out
    except Exception:
        return []


def path_length_m(coords: Sequence[LatLng]) -> float:
    if len(coords) < 2:
        return 0.0
    total = 0.0
    for i in range(1, len(coords)):
        total += haversine_m(coords[i - 1], coords[i])
    return total


def _project_on_segment(p: LatLng, a: LatLng, b: LatLng) -> tuple[LatLng, float, float]:
    """Return (closest_point, t in [0,1], distance_m)."""
    # Equirectangular local projection
    lat0 = math.radians((a[0] + b[0] + p[0]) / 3.0)
    def xy(ll: LatLng) -> tuple[float, float]:
        return (
            math.radians(ll[1]) * math.cos(lat0) * 6371000.0,
            math.radians(ll[0]) * 6371000.0,
        )

    ax, ay = xy(a)
    bx, by = xy(b)
    px, py = xy(p)
    abx, aby = bx - ax, by - ay
    ab2 = abx * abx + aby * aby
    if ab2 <= 1e-6:
        return a, 0.0, haversine_m(p, a)
    t = max(0.0, min(1.0, ((px - ax) * abx + (py - ay) * aby) / ab2))
    cx = ax + t * abx
    cy = ay + t * aby
    # back to lat/lng
    clat = math.degrees(cy / 6371000.0)
    clng = math.degrees(cx / (6371000.0 * max(0.2, math.cos(lat0))))
    closest = (clat, clng)
    return closest, t, haversine_m(p, closest)


def nearest_on_polyline(
    point: LatLng, coords: Sequence[LatLng]
) -> tuple[int, float, LatLng, float]:
    """
    Returns (segment_index, t, closest_point, distance_m).
    """
    if not coords:
        return 0, 0.0, point, float("inf")
    if len(coords) == 1:
        return 0, 0.0, coords[0], haversine_m(point, coords[0])
    best_i, best_t, best_c, best_d = 0, 0.0, coords[0], float("inf")
    for i in range(len(coords) - 1):
        c, t, d = _project_on_segment(point, coords[i], coords[i + 1])
        if d < best_d:
            best_i, best_t, best_c, best_d = i, t, c, d
    return best_i, best_t, best_c, best_d


def remaining_distance_m(point: LatLng, coords: Sequence[LatLng]) -> tuple[float, float]:
    """
    Remaining path length from nearest point to end.
    Returns (remaining_m, distance_from_polyline_m).
    """
    if len(coords) < 2:
        if not coords:
            return 0.0, float("inf")
        d = haversine_m(point, coords[0])
        return d, d
    seg_i, t, closest, off_m = nearest_on_polyline(point, coords)
    rem = haversine_m(closest, coords[seg_i + 1]) * max(0.0, 1.0 - t)
    for i in range(seg_i + 1, len(coords) - 1):
        rem += haversine_m(coords[i], coords[i + 1])
    return rem, off_m


def eta_seconds_from_route(
    remaining_m: float,
    *,
    total_distance_m: float,
    total_duration_s: float,
    traffic_factor: float = 1.0,
) -> int:
    if remaining_m <= 25:
        return 0
    if total_distance_m > 1 and total_duration_s > 1:
        speed_mps = total_distance_m / total_duration_s
    else:
        speed_mps = 25_000 / 3600.0  # ~25 km/h
    speed_mps = max(2.0, min(35.0, speed_mps))
    factor = max(0.7, min(2.5, float(traffic_factor or 1.0)))
    return int(max(1, (remaining_m / speed_mps) * factor))


def coords_from_trip_leg(trip: dict[str, Any]) -> list[LatLng]:
    leg = trip.get("active_leg_route") or {}
    enc = leg.get("polyline") or trip.get("leg_polyline") or trip.get("polyline") or ""
    coords = decode_polyline(str(enc))
    if len(coords) >= 2:
        return coords
    preview = trip.get("route_preview_coordinates") or leg.get("coordinates") or []
    out: list[LatLng] = []
    for p in preview:
        if isinstance(p, dict) and p.get("lat") is not None and p.get("lng") is not None:
            try:
                out.append((float(p["lat"]), float(p["lng"])))
            except (TypeError, ValueError):
                continue
    return out

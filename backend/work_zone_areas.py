"""
Work Zone area registry — named Lagos corridors for driver territory dispatch.

Reuses bbox geometry from nigeria_geo_zones where possible; adds Lekki Ph 2 & Sangotedo.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from nigeria_geo_zones import _in, resolve_area


@dataclass(frozen=True)
class WorkZoneAreaDef:
    id: str
    name: str
    city: str
    city_slug: str
    lat_lo: float
    lat_hi: float
    lng_lo: float
    lng_hi: float
    adjacent_ids: tuple[str, ...]

    @property
    def centroid_lat(self) -> float:
        return (self.lat_lo + self.lat_hi) / 2

    @property
    def centroid_lng(self) -> float:
        return (self.lng_lo + self.lng_hi) / 2

    def contains(self, lat: float, lng: float) -> bool:
        return _in(lat, lng, self.lat_lo, self.lat_hi, self.lng_lo, self.lng_hi)

    def to_public_dict(self, *, trips_per_week: int = 0, demand_label: str = "") -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "city": self.city,
            "city_slug": self.city_slug,
            "centroid": {"lat": self.centroid_lat, "lng": self.centroid_lng},
            "bbox": {
                "lat_lo": self.lat_lo,
                "lat_hi": self.lat_hi,
                "lng_lo": self.lng_lo,
                "lng_hi": self.lng_hi,
            },
            "adjacent_ids": list(self.adjacent_ids),
            "trips_per_week": trips_per_week,
            "demand_label": demand_label,
        }


# Lagos pilot — same neighborhoods drivers see on the home map.
WORK_ZONE_AREAS: dict[str, WorkZoneAreaDef] = {
    "victoria_island": WorkZoneAreaDef(
        "victoria_island", "Victoria Island", "Lagos", "lagos",
        6.417, 6.450, 3.395, 3.440,
        ("ikoyi", "lekki_phase_1"),
    ),
    "ikoyi": WorkZoneAreaDef(
        "ikoyi", "Ikoyi", "Lagos", "lagos",
        6.437, 6.460, 3.420, 3.465,
        ("victoria_island", "lekki_phase_1"),
    ),
    "lekki_phase_1": WorkZoneAreaDef(
        "lekki_phase_1", "Lekki Phase 1", "Lagos", "lagos",
        6.440, 6.475, 3.455, 3.500,
        ("victoria_island", "ikoyi", "lekki_phase_2"),
    ),
    "lekki_phase_2": WorkZoneAreaDef(
        "lekki_phase_2", "Lekki Phase 2", "Lagos", "lagos",
        6.438, 6.468, 3.500, 3.560,
        ("lekki_phase_1", "ajah", "sangotedo"),
    ),
    "ajah": WorkZoneAreaDef(
        "ajah", "Ajah", "Lagos", "lagos",
        6.445, 6.482, 3.500, 3.630,
        ("lekki_phase_2", "sangotedo"),
    ),
    "sangotedo": WorkZoneAreaDef(
        "sangotedo", "Sangotedo", "Lagos", "lagos",
        6.448, 6.478, 3.630, 3.720,
        ("lekki_phase_2", "ajah"),
    ),
    "ikeja": WorkZoneAreaDef(
        "ikeja", "Ikeja", "Lagos", "lagos",
        6.580, 6.625, 3.325, 3.365,
        ("maryland", "yaba"),
    ),
    "maryland": WorkZoneAreaDef(
        "maryland", "Maryland", "Lagos", "lagos",
        6.558, 6.590, 3.348, 3.382,
        ("ikeja", "yaba"),
    ),
    "yaba": WorkZoneAreaDef(
        "yaba", "Yaba", "Lagos", "lagos",
        6.500, 6.535, 3.368, 3.400,
        ("ikeja", "maryland", "surulere"),
    ),
    "surulere": WorkZoneAreaDef(
        "surulere", "Surulere", "Lagos", "lagos",
        6.490, 6.525, 3.330, 3.378,
        ("yaba",),
    ),
}


def get_area(area_id: str) -> Optional[WorkZoneAreaDef]:
    return WORK_ZONE_AREAS.get(area_id)


def resolve_area_id(lat: Optional[float], lng: Optional[float]) -> Optional[str]:
    """Map coordinates to a work-zone area id (bbox match, then nearest centroid)."""
    if lat is None or lng is None:
        return None
    for area in WORK_ZONE_AREAS.values():
        if area.contains(lat, lng):
            return area.id
    # Fallback: match nigeria_geo_zones name to our registry
    info = resolve_area(lat, lng)
    for area in WORK_ZONE_AREAS.values():
        if area.name.lower() == info.area.lower() and area.city.lower() == info.city.lower():
            return area.id
    best_id: Optional[str] = None
    best_dist = float("inf")
    for area in WORK_ZONE_AREAS.values():
        dist = ((lat - area.centroid_lat) ** 2 + (lng - area.centroid_lng) ** 2) ** 0.5
        if dist < best_dist:
            best_dist = dist
            best_id = area.id
    return best_id if best_dist < 0.12 else None


def point_in_zone(lat: Optional[float], lng: Optional[float], area_ids: set[str]) -> bool:
    if not area_ids:
        return True
    resolved = resolve_area_id(lat, lng)
    return resolved in area_ids if resolved else False


def validate_area_selection(area_ids: list[str]) -> tuple[bool, str]:
    if not area_ids:
        return False, "Select at least one area"
    if len(area_ids) > 4:
        return False, "Select up to 4 adjacent areas"
    unknown = [a for a in area_ids if a not in WORK_ZONE_AREAS]
    if unknown:
        return False, f"Unknown areas: {', '.join(unknown)}"
    # Connected component: each area must be adjacent to another in the set
    remaining = set(area_ids)
    start = area_ids[0]
    visited = {start}
    stack = [start]
    while stack:
        cur = stack.pop()
        for nbr in WORK_ZONE_AREAS[cur].adjacent_ids:
            if nbr in remaining and nbr not in visited:
                visited.add(nbr)
                stack.append(nbr)
    if visited != remaining:
        return False, "Selected areas must be adjacent (one connected corridor)"
    return True, "ok"


def build_zone_label(area_ids: list[str]) -> str:
    names = [WORK_ZONE_AREAS[a].name for a in area_ids if a in WORK_ZONE_AREAS]
    if len(names) <= 2:
        return " ↔ ".join(names)
    return f"{names[0]} ↔ {names[-1]} (+{len(names) - 2})"


def corridor_area_ids(area_ids: list[str]) -> set[str]:
    """Expand selection + direct neighbors for marketplace density checks."""
    out = set(area_ids)
    for aid in area_ids:
        out.update(WORK_ZONE_AREAS[aid].adjacent_ids)
    return out

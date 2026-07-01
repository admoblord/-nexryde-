"""
Nigeria Geo Zones — fine-grained neighborhood resolver.

resolve_area(lat, lng) → AreaInfo
  .city       e.g. "Lagos"
  .area       e.g. "Lekki Phase 1"
  .zone_type  "mainland" | "island" | "suburb" | "hightraffic" | "lowtraffic"
  .key_routes list of nearby road names for message copy
  .city_slug  "lagos" | "abuja" | "ph" | "ibadan" | "kano" | etc.

Covers 35 neighborhoods across Lagos, Abuja, Port Harcourt, Ibadan, Kano,
Enugu, Benin, Warri, Calabar, Ilorin, Owerri — with a Nigerian-wide fallback.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Optional

@dataclass
class AreaInfo:
    city: str
    area: str
    zone_type: str            # mainland | island | suburb | hightraffic | lowtraffic
    key_routes: list[str]
    city_slug: str            # lagos | abuja | ph | ibadan | kano | generic_nigeria

    # Convenience shorthands used in message templates
    @property
    def area_city(self) -> str:
        if self.city.lower() == self.area.lower():
            return self.city
        return f"{self.area}, {self.city}"


# ─── Bounding box helper ───────────────────────────────────────────────────────

def _in(lat: float, lng: float, lat_lo: float, lat_hi: float, lng_lo: float, lng_hi: float) -> bool:
    return lat_lo <= lat <= lat_hi and lng_lo <= lng <= lng_hi


# ─── Neighborhood definitions ─────────────────────────────────────────────────
# Each entry: (lat_lo, lat_hi, lng_lo, lng_hi, city, area, zone_type, key_routes, city_slug)

_ZONES: list[tuple] = [
    # ── Lagos Islands ──────────────────────────────────────────────────────────
    (6.417, 6.450, 3.395, 3.440, "Lagos", "Victoria Island",
     "island", ["Ozumba Mbadiwe", "Adeola Odeku", "Sanusi Fafunwa"], "lagos"),
    (6.437, 6.460, 3.420, 3.465, "Lagos", "Ikoyi",
     "island", ["Bourdillon Road", "Kingsway Road", "Alexander Road"], "lagos"),
    (6.440, 6.475, 3.455, 3.500, "Lagos", "Lekki Phase 1",
     "island", ["Lekki-Epe Expressway", "Freedom Way", "Admiralty Way"], "lagos"),
    (6.445, 6.482, 3.500, 3.630, "Lagos", "Ajah",
     "suburb", ["Lekki-Epe Expressway", "Abraham Adesanya", "Ajah roundabout"], "lagos"),
    (6.444, 6.478, 3.378, 3.415, "Lagos", "Lagos Island",
     "island", ["Broad Street", "Marina", "Carter Bridge", "Idumota"], "lagos"),

    # ── Lagos Mainland ─────────────────────────────────────────────────────────
    (6.580, 6.625, 3.325, 3.365, "Lagos", "Ikeja",
     "hightraffic", ["Awolowo Way", "Allen Avenue", "MMA2", "Airport Road"], "lagos"),
    (6.558, 6.590, 3.348, 3.382, "Lagos", "Maryland",
     "hightraffic", ["Ikorodu Road", "Mobolaji Bank Anthony Way", "Ojota"], "lagos"),
    (6.540, 6.568, 3.318, 3.358, "Lagos", "Oshodi",
     "hightraffic", ["Oshodi-Apapa Expressway", "Oshodi-Isale", "Mile 2"], "lagos"),
    (6.490, 6.525, 3.330, 3.378, "Lagos", "Surulere",
     "mainland", ["Bode Thomas", "Adelabu", "Eric Moore", "Shitta"], "lagos"),
    (6.500, 6.535, 3.368, 3.400, "Lagos", "Yaba",
     "mainland", ["Herbert Macaulay Way", "Western Avenue", "Stadium"], "lagos"),
    (6.455, 6.490, 3.250, 3.290, "Lagos", "Festac",
     "mainland", ["First Avenue", "Festac Link Road", "Mile 2"], "lagos"),
    (6.440, 6.476, 3.350, 3.390, "Lagos", "Apapa",
     "hightraffic", ["Creek Road", "Wharf Road", "Marine Bridge"], "lagos"),
    (6.610, 6.650, 3.290, 3.330, "Lagos", "Agege",
     "suburb", ["Agege Motor Road", "Old Abeokuta Road", "Pen Cinema"], "lagos"),
    (6.580, 6.640, 3.490, 3.540, "Lagos", "Ikorodu",
     "suburb", ["Ikorodu Road", "Lagos-Sagamu Expressway", "Benson"], "lagos"),
    (6.507, 6.548, 3.335, 3.372, "Lagos", "Mushin",
     "mainland", ["Agege Motor Road", "Oshodi-Apapa", "Ladipo"], "lagos"),

    # ── Abuja ──────────────────────────────────────────────────────────────────
    (9.078, 9.122, 7.448, 7.498, "Abuja", "Maitama",
     "lowtraffic", ["Aguiyi-Ironsi Street", "Adetokunbo Ademola", "Diplomatic Drive"], "abuja"),
    (9.065, 9.098, 7.452, 7.492, "Abuja", "Wuse 2",
     "hightraffic", ["Aminu Kano Crescent", "Gana Street", "Danmole Street"], "abuja"),
    (9.050, 9.080, 7.477, 7.515, "Abuja", "Garki",
     "hightraffic", ["Moshood Abiola Way", "Tafawa Balewa Way", "Shehu Shagari Way"], "abuja"),
    (9.038, 9.080, 7.518, 7.562, "Abuja", "Asokoro",
     "lowtraffic", ["Asokoro Crescent", "Suez Crescent", "Pope John Paul II Street"], "abuja"),
    (9.118, 9.162, 7.375, 7.428, "Abuja", "Gwarinpa",
     "suburb", ["3rd Avenue", "Gwarinpa-Dutse Road", "Gwarinpa Estate"], "abuja"),
    (9.138, 9.182, 7.318, 7.365, "Abuja", "Kubwa",
     "suburb", ["Kubwa Expressway", "Phase 4", "Rock Haven"], "abuja"),
    (9.078, 9.115, 7.416, 7.455, "Abuja", "Jabi",
     "hightraffic", ["Jabi Lake Mall", "Nile Crescent", "Airport Road"], "abuja"),
    (8.988, 9.032, 7.430, 7.472, "Abuja", "Lugbe",
     "suburb", ["Airport Road", "Lugbe-Gwagwa Road", "Life Camp Junction"], "abuja"),

    # ── Port Harcourt ──────────────────────────────────────────────────────────
    (4.775, 4.815, 7.008, 7.045, "Port Harcourt", "GRA Port Harcourt",
     "lowtraffic", ["Peter Odili Road", "Rumuola Road", "Stadium Road"], "ph"),
    (4.815, 4.855, 6.985, 7.022, "Port Harcourt", "Rumuokoro",
     "hightraffic", ["Rumuokoro Junction", "East-West Road", "Eneka Road"], "ph"),
    (4.752, 4.788, 6.992, 7.028, "Port Harcourt", "Diobu",
     "hightraffic", ["Mile 1", "Mile 3", "Aggrey Road", "Aba Road"], "ph"),
    (4.808, 4.842, 7.012, 7.048, "Port Harcourt", "Trans Amadi",
     "hightraffic", ["Trans Amadi Road", "Elelenwo Road", "Oil Mill"], "ph"),
    (4.770, 4.808, 6.998, 7.035, "Port Harcourt", "Rumuola",
     "mainland", ["Rumuola Road", "Aba Road", "Woji Road"], "ph"),

    # ── Ibadan ─────────────────────────────────────────────────────────────────
    (7.385, 7.440, 3.880, 3.945, "Ibadan", "Bodija",
     "suburb", ["Bodija Market", "Iwo Road", "Ring Road"], "ibadan"),
    (7.360, 7.400, 3.900, 3.965, "Ibadan", "Dugbe",
     "hightraffic", ["Dugbe Market", "Lebanon Street", "Ife Road"], "ibadan"),

    # ── Kano ───────────────────────────────────────────────────────────────────
    (11.990, 12.060, 8.510, 8.580, "Kano", "Sabon Gari",
     "hightraffic", ["Sabon Gari Market", "Bompai Road", "Club Road"], "kano"),
    (12.010, 12.060, 8.470, 8.530, "Kano", "Nasarawa",
     "suburb", ["Zoo Road", "Kofar Mata Road", "Ibrahim Taiwo Road"], "kano"),

    # ── Enugu ──────────────────────────────────────────────────────────────────
    (6.435, 6.490, 7.490, 7.570, "Enugu", "Independence Layout",
     "suburb", ["Okpara Avenue", "Independence Layout", "GRA Enugu"], "enugu"),

    # ── Benin City ─────────────────────────────────────────────────────────────
    (6.320, 6.380, 5.590, 5.660, "Benin City", "Ring Road",
     "hightraffic", ["Ring Road", "Akpakpava Road", "Airport Road Benin"], "benin"),

    # ── Warri ──────────────────────────────────────────────────────────────────
    (5.500, 5.545, 5.720, 5.780, "Warri", "Effurun",
     "hightraffic", ["NPA Road", "Ughelli Road", "PTI Road"], "warri"),

    # ── Calabar ────────────────────────────────────────────────────────────────
    (4.940, 4.975, 8.315, 8.360, "Calabar", "Marian",
     "hightraffic", ["Marian Road", "Watt Market", "Ndidem Usang Iso Road"], "calabar"),
]


def resolve_area(lat: Optional[float], lng: Optional[float]) -> AreaInfo:
    """
    Returns the best matching Nigerian neighborhood for the given coordinates.
    Falls back to the nearest major city, then to generic Nigeria.
    """
    if lat is None or lng is None:
        return _generic_nigeria()

    # 1 — exact bounding box match
    for row in _ZONES:
        lat_lo, lat_hi, lng_lo, lng_hi, city, area, zone_type, routes, slug = row
        if _in(lat, lng, lat_lo, lat_hi, lng_lo, lng_hi):
            return AreaInfo(city=city, area=area, zone_type=zone_type,
                            key_routes=routes, city_slug=slug)

    # 2 — nearest zone centroid within ~30 km (0.27°)
    best: Optional[AreaInfo] = None
    best_dist = float("inf")
    for row in _ZONES:
        lat_lo, lat_hi, lng_lo, lng_hi, city, area, zone_type, routes, slug = row
        clat = (lat_lo + lat_hi) / 2
        clng = (lng_lo + lng_hi) / 2
        dist = ((lat - clat) ** 2 + (lng - clng) ** 2) ** 0.5
        if dist < best_dist:
            best_dist = dist
            best = AreaInfo(city=city, area=area, zone_type=zone_type,
                            key_routes=routes, city_slug=slug)

    if best and best_dist < 0.27:
        return best

    return _generic_nigeria()


def _generic_nigeria() -> AreaInfo:
    return AreaInfo(
        city="Nigeria",
        area="your area",
        zone_type="generic",
        key_routes=[],
        city_slug="generic_nigeria",
    )

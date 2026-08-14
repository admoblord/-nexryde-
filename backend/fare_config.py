from __future__ import annotations

# Nigerian city × service fare tables (single source for pricing + surge caps).
# Lagos: legacy table rows still used for caps/cancellation; live pricing is distance-only (lagride_lagos_pricing).
# Other states: NEXRYDE Premium nationwide card — economy anchor + tier multipliers (nexryde_pricing).

# Distance (km) strictly below this uses SHORT_TRIP_FARE_CONFIG for base / per_km / per_min only.
SHORT_TRIP_KM_THRESHOLD = 5.0

# ── Nationwide premium economy anchor (all states except Lagos) ──────────────────
# One card per city; Comfort / Premium / XL / Executive scale via ``nexryde_service_multiplier``
# (1.0 / 1.15 / 1.3 / 1.5). Bolt reference in product spec; NEXRYDE targets materially higher driver value.
#
# Marketing vs engine (Abuja economy, 1.0× surge, direct trip — base + km only; time on stop):
#   • Bolt-style headline (base + km only): 10 km → ₦300+10×₦85 = ₦1,150 | NEXRYDE → ₦2,400+10×₦520 = ₦7,600 (~6.6×).
#   • 20 km → ₦2,000 vs ₦2,400+20×₦520 = ₦12,800 (~6.4×). Stop trips add route minutes × per_min.
#   • Driver net at 15% commission on Bolt vs 0% on NEXRYDE is a product/policy setting, not encoded here.
#
# Competitive positioning (nationwide premium, excluding Lagos — see tests for 10 km headline ratio):
#   - Headline base+distance fares vs Bolt reference are ~5.5–6.6× (city-dependent; pinned in tests).
#   - Per-minute applies only when the rider adds an intermediate stop (traffic / detour fairness).
#   - Premium tier multipliers + 0% driver commission target sustainable driver income without 10×+ sticker shock.
NEXRYDE_NATIONWIDE_POSITIONING_SUMMARY = (
    "NEXRYDE nationwide (outside Lagos) is premium but bookable: headline direct trips land about 5.5–6.6× above "
    "Bolt reference cards on base+distance examples. Per-minute charges apply when a stop is added. Zero platform "
    "commission on driver payouts is the target model—built to attract top drivers and keep incomes sustainable."
)

# Rider/driver education (non-Lagos estimates).
NEXRYDE_NATIONWIDE_POSITIONING_BULLETS: tuple[str, ...] = (
    "NEXRYDE is about 5.5–6.6× above Bolt on headline base+distance (direct trips, reference card).",
    "Drivers earn materially more with 0% commission on driver payouts.",
    "Premium positioning attracts quality drivers.",
    "Per-minute rates apply when you add a stop — not on every direct trip.",
    "Balanced base + per-km rates keep short and long trips fair in every state.",
    "Sustainable driver income model with 0% commission.",
)

# API / clients — stable identifier for surge math on fare estimates (max-of active factors, then tier cap).
NEXRYDE_ESTIMATE_SURGE_MODEL = "max_of_factors"

# Rider-facing note on estimates; aligns with product policy language in positioning copy above.
NEXRYDE_DRIVER_PAYOUT_POLICY_NOTE = (
    "Target model: 0% platform commission on driver payouts. Final driver settlement follows live partner policy."
)

# All Nigerian states + FCT (Lagos excluded — Lagride-style engine).
# Balanced premium card (Jul 2026): bookable vs Bolt (~5.5–6.6× headline) while staying driver-first.
# Tier-1 metros anchor: ₦2,400 base + ₦520/km + ₦120/min (stop only) + ₦3,200 min fare.
# High-activity states: base ₦2,400 (major) → ₦2,100 (least in band); km/min/min_fare scale from anchor.
# Other states: single lower card (₦1,800 base).
_BALANCED_ANCHOR_BASE = 2400
_BALANCED_ANCHOR_PER_KM = 520
_BALANCED_ANCHOR_PER_MIN = 120
_BALANCED_ANCHOR_MIN_FARE = 3200

# ── Targeted time billing (pickup wait, traffic excess, route change) ─────────
# Direct-trip estimates stay base+distance; these apply at pickup wait / completion / route change.
PICKUP_FREE_WAIT_SECONDS = 180  # 3 minutes — matches rider app (pickupWaitPolicy.ts)
# Mid-trip pause: the driver taps Pause trip to wait for a rider who has asked to
# stop somewhere. Billing starts on the tap — there is no free window, because the
# rider chose the wait and the driver is already on the clock. Priced above the
# pickup rate (₦40) since the driver cannot take another trip during it.
MID_TRIP_WAIT_PER_MIN_NGN = 80.0
# Hard stop on a single trip's billable pause. Beyond this the meter freezes and
# the driver is expected to end the trip instead of running an open-ended tab.
MID_TRIP_WAIT_MAX_BILLABLE_MIN = 30
TRAFFIC_EXCESS_BUFFER_MIN = 15
TRAFFIC_EXCESS_MAX_SPEED_KMH = 12.0
TRAFFIC_EXCESS_CAP_NGN = 2500
ROUTE_CHANGE_FEE_NGN = 300
MIN_TRIP_KM_FOR_TRAFFIC_EXCESS = 5.0

# Major commercial / revenue hubs → 2400; stepped down to 2100 for the rest of the high band (14 states).
_NATIONWIDE_PREMIUM_HIGH_BASE_BY_STATE: dict[str, int] = {
    "abuja": 2400,
    "delta": 2400,
    "kano": 2400,
    "rivers": 2400,
    "anambra": 2300,
    "edo": 2300,
    "kaduna": 2300,
    "oyo": 2300,
    "akwa_ibom": 2200,
    "cross_river": 2200,
    "enugu": 2200,
    "imo": 2200,
    "ogun": 2100,
    "plateau": 2100,
}

_NATIONWIDE_PREMIUM_HIGH_STATES: frozenset[str] = frozenset(_NATIONWIDE_PREMIUM_HIGH_BASE_BY_STATE.keys())


def _nationwide_balanced_row_from_base(base_fare: int) -> dict[str, int]:
    b = int(base_fare)
    ref = float(_BALANCED_ANCHOR_BASE)
    return {
        "base_fare": b,
        "per_km": max(1, round(_BALANCED_ANCHOR_PER_KM * b / ref)),
        "per_min": max(1, round(_BALANCED_ANCHOR_PER_MIN * b / ref)),
        "min_fare": max(1, round(_BALANCED_ANCHOR_MIN_FARE * b / ref)),
    }


_NATIONWIDE_ROW_PREMIUM_LOWER: dict[str, int] = {
    "base_fare": 1800,
    "per_km": 390,
    "per_min": 90,
    "min_fare": 2400,
}

_NATIONWIDE_STATE_KEYS_ORDERED: tuple[str, ...] = (
    "abuja",
    "abia",
    "adamawa",
    "akwa_ibom",
    "anambra",
    "bauchi",
    "bayelsa",
    "benue",
    "borno",
    "cross_river",
    "delta",
    "ebonyi",
    "edo",
    "ekiti",
    "enugu",
    "gombe",
    "imo",
    "jigawa",
    "kaduna",
    "kano",
    "katsina",
    "kebbi",
    "kogi",
    "kwara",
    "nasarawa",
    "niger",
    "ogun",
    "ondo",
    "osun",
    "oyo",
    "plateau",
    "rivers",
    "sokoto",
    "taraba",
    "yobe",
    "zamfara",
)

_NATIONWIDE_PREMIUM_ECONOMY: dict[str, dict[str, int]] = {
    k: (
        dict(_nationwide_balanced_row_from_base(_NATIONWIDE_PREMIUM_HIGH_BASE_BY_STATE[k]))
        if k in _NATIONWIDE_PREMIUM_HIGH_BASE_BY_STATE
        else dict(_NATIONWIDE_ROW_PREMIUM_LOWER)
    )
    for k in _NATIONWIDE_STATE_KEYS_ORDERED
}


def _nationwide_city_fare_table(row: dict[str, int]) -> dict[str, dict[str, int | float]]:
    """Same base / km / min for all tiers; tier uplift is ``nexryde_service_multiplier`` only."""
    b, k, m, floor = row["base_fare"], row["per_km"], row["per_min"], row["min_fare"]
    econ = {
        "base_fare": b,
        "per_km": k,
        "per_min": m,
        "booking_fee": 0,
        "min_fare": floor,
        "max_multiplier": 2.5,
        "cancellation_fee": 450,
    }
    prem = {
        "base_fare": b,
        "per_km": k,
        "per_min": m,
        "booking_fee": 0,
        "min_fare": floor,
        "max_multiplier": 3.0,
        "cancellation_fee": 550,
    }
    return {
        "economy": dict(econ),
        "comfort": dict(econ),
        "xl": dict(econ),
        "premium": dict(prem),
        "executive": dict(prem),
    }


def _short_trip_slice(fc: dict[str, dict[str, int | float]]) -> dict[str, dict[str, int]]:
    out: dict[str, dict[str, int]] = {}
    for tier, d in fc.items():
        out[tier] = {
            "base_fare": int(d["base_fare"]),
            "per_km": int(d["per_km"]),
            "per_min": int(d["per_min"]),
        }
    return out


# Lagos — unchanged product rows (Lagride path does not use these for line items).
_LAGOS_FARE = {
    "economy": {
        "base_fare": 400,
        "per_km": 400,
        "per_min": 80,
        "booking_fee": 0,
        "min_fare": 0,
        "max_multiplier": 2.5,
        "cancellation_fee": 300,
    },
    "comfort": {
        "base_fare": 600,
        "per_km": 500,
        "per_min": 100,
        "booking_fee": 0,
        "min_fare": 0,
        "max_multiplier": 2.5,
        "cancellation_fee": 400,
    },
    "xl": {
        "base_fare": 500,
        "per_km": 450,
        "per_min": 90,
        "booking_fee": 0,
        "min_fare": 0,
        "max_multiplier": 2.5,
        "cancellation_fee": 450,
    },
    "premium": {
        "base_fare": 800,
        "per_km": 600,
        "per_min": 120,
        "booking_fee": 0,
        "min_fare": 0,
        "max_multiplier": 3.0,
        "cancellation_fee": 500,
    },
    "executive": {
        "base_fare": 800,
        "per_km": 600,
        "per_min": 120,
        "booking_fee": 0,
        "min_fare": 0,
        "max_multiplier": 3.0,
        "cancellation_fee": 550,
    },
}

_LAGOS_SHORT = {
    "economy": {"base_fare": 400, "per_km": 400, "per_min": 80},
    "comfort": {"base_fare": 600, "per_km": 500, "per_min": 100},
    "xl": {"base_fare": 500, "per_km": 450, "per_min": 90},
    "premium": {"base_fare": 800, "per_km": 600, "per_min": 120},
    "executive": {"base_fare": 800, "per_km": 600, "per_min": 120},
}

# Unknown / unmapped string → FCT card (neutral default).
_DEFAULT_NATIONWIDE_KEY = "abuja"
_DEFAULT_ROW = _NATIONWIDE_PREMIUM_ECONOMY[_DEFAULT_NATIONWIDE_KEY]

FARE_CONFIG: dict[str, dict[str, dict[str, int | float]]] = {
    "lagos": _LAGOS_FARE,
    "default": _nationwide_city_fare_table(_DEFAULT_ROW),
    **{city: _nationwide_city_fare_table(row) for city, row in _NATIONWIDE_PREMIUM_ECONOMY.items()},
}

SHORT_TRIP_FARE_CONFIG: dict[str, dict[str, dict[str, int]]] = {
    "lagos": _LAGOS_SHORT,
    "default": _short_trip_slice(FARE_CONFIG["default"]),
    **{
        city: _short_trip_slice(_nationwide_city_fare_table(row))
        for city, row in _NATIONWIDE_PREMIUM_ECONOMY.items()
    },
}

# ── Long trips (>= SHORT_TRIP_KM_THRESHOLD) ───────────────────────────────────────
# Lagos: compact anchor scaled by legacy tier ratios.
# Nationwide premium: anchor equals economy card so long-haul matches the premium table (no silent discount).
_LONG_TRIP_ECONOMY_ANCHORS: dict[str, dict[str, int]] = {
    "lagos": {"base_fare": 350, "per_km": 105, "per_min": 18},
}
for _city, _row in _NATIONWIDE_PREMIUM_ECONOMY.items():
    _LONG_TRIP_ECONOMY_ANCHORS[_city] = {
        "base_fare": _row["base_fare"],
        "per_km": _row["per_km"],
        "per_min": _row["per_min"],
    }
_LONG_TRIP_ECONOMY_ANCHORS["default"] = {
    "base_fare": _DEFAULT_ROW["base_fare"],
    "per_km": _DEFAULT_ROW["per_km"],
    "per_min": _DEFAULT_ROW["per_min"],
}


def _long_trip_rates_for_city(city_key: str) -> dict[str, dict[str, int]]:
    """Scale long-trip economy anchor by each tier vs economy (Lagos); else identical rows × tiers."""
    ck = city_key if city_key in FARE_CONFIG else "default"
    fc = FARE_CONFIG[ck]
    fe = fc["economy"]
    anchor = _LONG_TRIP_ECONOMY_ANCHORS.get(ck, _LONG_TRIP_ECONOMY_ANCHORS["default"])
    tiers = ("economy", "comfort", "xl", "premium", "executive")
    out: dict[str, dict[str, int]] = {}
    for tier in tiers:
        cfg = fc.get(tier, fe)
        out[tier] = {
            "base_fare": max(200, round(anchor["base_fare"] * float(cfg["base_fare"]) / float(fe["base_fare"]))),
            "per_km": max(45, round(anchor["per_km"] * float(cfg["per_km"]) / float(fe["per_km"]))),
            "per_min": max(8, round(anchor["per_min"] * float(cfg["per_min"]) / float(fe["per_min"]))),
        }
    return out


LONG_TRIP_FARE_CONFIG: dict[str, dict[str, dict[str, int]]] = {
    k: _long_trip_rates_for_city(k) for k in FARE_CONFIG.keys()
}


def normalize_fare_city_key(city: str | None) -> str:
    """
    Map free-text / aliases to ``FARE_CONFIG`` keys (state slugs, ``abuja``, ``lagos``).
    Unknown → ``default`` (Abuja FCT premium card).
    """
    raw = (city or "default").strip().lower().replace("-", "_")
    raw = "_".join(raw.split())
    aliases: dict[str, str] = {
        # FCT
        "fct": "abuja",
        "fct_abuja": "abuja",
        "abuja_fct": "abuja",
        # Legacy metro names → state
        "ph": "rivers",
        "port_harcourt": "rivers",
        "portharcourt": "rivers",
        "rivers_state": "rivers",
        "warri": "delta",
        "benin": "edo",
        "benin_city": "edo",
        "ibadan": "oyo",
        "oyo_state": "oyo",
        "owerri": "imo",
        "imo_state": "imo",
        "uyo": "akwa_ibom",
        "akwa_ibom_state": "akwa_ibom",
        "calabar": "cross_river",
        "cross_river_state": "cross_river",
        # Common state spellings
        "abia_state": "abia",
        "adamawa_state": "adamawa",
        "anambra_state": "anambra",
        "bauchi_state": "bauchi",
        "bayelsa_state": "bayelsa",
        "benue_state": "benue",
        "borno_state": "borno",
        "delta_state": "delta",
        "ebonyi_state": "ebonyi",
        "edo_state": "edo",
        "ekiti_state": "ekiti",
        "enugu_state": "enugu",
        "gombe_state": "gombe",
        "jigawa_state": "jigawa",
        "kaduna_state": "kaduna",
        "kano_state": "kano",
        "katsina_state": "katsina",
        "kebbi_state": "kebbi",
        "kogi_state": "kogi",
        "kwara_state": "kwara",
        "nasarawa_state": "nasarawa",
        "niger_state": "niger",
        "ogun_state": "ogun",
        "ondo_state": "ondo",
        "osun_state": "osun",
        "oyo": "oyo",
        "plateau_state": "plateau",
        "sokoto_state": "sokoto",
        "taraba_state": "taraba",
        "yobe_state": "yobe",
        "zamfara_state": "zamfara",
    }
    ck = aliases.get(raw, raw)
    if ck not in FARE_CONFIG:
        return "default"
    return ck


def resolve_fare_rate_card(city_key: str, service_key: str, fare_bucket: str) -> dict[str, float]:
    """
    fare_bucket: 'short' → per-city exact table (SHORT_TRIP_FARE_CONFIG).
                 'standard' → long-haul table (LONG_TRIP_FARE_CONFIG).
    """
    ck = normalize_fare_city_key(city_key)
    sk = (service_key or "economy").strip().lower()
    if sk == "standard":
        sk = "economy"
    if sk == "pro":
        sk = "premium"
    if fare_bucket == "short":
        tbl = SHORT_TRIP_FARE_CONFIG.get(ck, SHORT_TRIP_FARE_CONFIG["default"])
        row = tbl.get(sk) or tbl["economy"]
    else:
        tbl = LONG_TRIP_FARE_CONFIG.get(ck, LONG_TRIP_FARE_CONFIG["default"])
        row = tbl.get(sk) or tbl["economy"]
    return {
        "base_fare": float(row["base_fare"]),
        "per_km": float(row["per_km"]),
        "per_min": float(row["per_min"]),
    }


# Bolt-style reference (₦) — marketing only. ``base + 10 × per_km`` matches product comparison table per state.
BOLT_REFERENCE_BASE_PER_KM_NGN: dict[str, tuple[int, int]] = {
    "default": (300, 85),
    "abuja": (300, 85),
    "abia": (280, 78),
    "adamawa": (300, 79),
    "akwa_ibom": (285, 81),
    "anambra": (290, 82),
    "bauchi": (295, 83),
    "bayelsa": (280, 80),
    "benue": (290, 82),
    "borno": (300, 85),
    "cross_river": (280, 80),
    "delta": (285, 81),
    "ebonyi": (280, 78),
    "edo": (285, 81),
    "ekiti": (285, 80),
    "enugu": (300, 85),
    "gombe": (290, 82),
    "imo": (290, 82),
    "jigawa": (305, 86),
    "kaduna": (295, 84),
    "kano": (310, 88),
    "katsina": (300, 85),
    "kebbi": (295, 83),
    "kogi": (285, 80),
    "kwara": (290, 82),
    "nasarawa": (290, 82),
    "niger": (290, 82),
    "ogun": (290, 82),
    "ondo": (285, 80),
    "osun": (285, 80),
    "oyo": (290, 82),
    "plateau": (295, 84),
    "rivers": (280, 80),
    "sokoto": (300, 85),
    "taraba": (285, 80),
    "yobe": (295, 83),
    "zamfara": (300, 85),
}


def headline_distance_only_fare_nexryde(
    city_key: str, distance_km: float, *, service_key: str = "economy"
) -> float:
    """
    NEXRYDE pre-time headline: ``base_fare + distance_km × per_km`` from the short-table card.

    Matches rider-education tables (e.g. 10 km column) before route minutes and surge.
    """
    card = resolve_fare_rate_card(city_key, service_key, "short")
    d = max(0.0, float(distance_km))
    return float(card["base_fare"] + d * card["per_km"])


def headline_distance_only_fare_bolt(city_key: str, distance_km: float) -> float | None:
    """Bolt reference headline (base + km×rate) when we have a row; else ``None`` (e.g. Lagos)."""
    ck = normalize_fare_city_key(city_key)
    row = BOLT_REFERENCE_BASE_PER_KM_NGN.get(ck)
    if row is None:
        return None
    b, k = row
    d = max(0.0, float(distance_km))
    return float(b + d * float(k))


def resolve_pickup_wait_per_min(city_key: str, service_key: str = "economy") -> float:
    """Billable pickup wait rate (lower than stop/traffic rates)."""
    ck = normalize_fare_city_key(city_key)
    if ck == "lagos":
        return 40.0
    card = resolve_fare_rate_card(ck, service_key, "short")
    base = float(card["base_fare"])
    if base >= 2400:
        return 60.0
    if base >= 2100:
        return 50.0
    return 45.0


def resolve_traffic_excess_per_min(city_key: str) -> float:
    """Per-minute rate for proven jam time above estimate + buffer (capped at completion)."""
    ck = normalize_fare_city_key(city_key)
    if ck == "lagos":
        return 40.0
    card = resolve_fare_rate_card(ck, "economy", "short")
    base = float(card["base_fare"])
    if base >= 2400:
        return 45.0
    if base >= 2100:
        return 40.0
    return 35.0

"""Unit tests — Instant Pickup Detection Engine (priority labels, never coords)."""
from __future__ import annotations

from instant_pickup import (
    SAFE_FALLBACK,
    pick_priority_label,
    strip_plus_code_prefix,
    to_api_payload,
    _is_plus_code,
    _looks_like_coords,
)


def test_never_coords_fallback():
    assert _looks_like_coords("6.5244, 3.3792")
    assert not _looks_like_coords("Lekki Phase 1")
    out = to_api_payload({"label": "6.52, 3.37", "status": "OK"})
    assert out["short_label"] == SAFE_FALLBACK
    assert not _looks_like_coords(out["address"])


def test_plus_code_detection():
    assert _is_plus_code("CCHC+8Q3")
    assert _is_plus_code("CCHC+8Q3, Lagos")
    assert _is_plus_code("8FG8CCHC+8Q3")
    assert not _is_plus_code("Adeola Odeku Street")
    assert not _is_plus_code("Shoprite Sangotedo")


def test_strip_plus_code_prefix():
    assert (
        strip_plus_code_prefix("H988+XVW Maryland mall, Anthony, Ikeja")
        == "Maryland mall, Anthony, Ikeja"
    )
    assert strip_plus_code_prefix("CCHC+8Q3, Lagos") == "Lagos"
    assert strip_plus_code_prefix("Adeola Odeku Street, Lagos") == "Adeola Odeku Street, Lagos"


def test_never_plus_code_as_pickup_label():
    """Google often returns Plus Code as premise/formatted head — use street instead."""
    results = [
        {
            "types": ["plus_code"],
            "formatted_address": "CCHC+8Q3, Lagos, Nigeria",
            "address_components": [
                {"long_name": "CCHC+8Q3", "short_name": "CCHC+8Q3", "types": ["plus_code"]},
                {"long_name": "Lagos", "types": ["locality", "political"]},
            ],
        },
        {
            "types": ["premise", "street_address"],
            "formatted_address": "CCHC+8Q3, Adeola Odeku Street, Victoria Island, Lagos",
            "address_components": [
                {"long_name": "CCHC+8Q3", "short_name": "CCHC+8Q3", "types": ["plus_code"]},
                {"long_name": "Adeola Odeku Street", "types": ["route"]},
                {"long_name": "Victoria Island", "types": ["neighborhood"]},
                {"long_name": "Lagos", "types": ["locality", "political"]},
                {"long_name": "Lagos State", "types": ["administrative_area_level_1"]},
            ],
        },
    ]
    picked = pick_priority_label(results)
    assert not _is_plus_code(picked["label"])
    assert "Adeola" in picked["label"] or "Victoria Island" in picked["label"]
    out = to_api_payload(picked)
    assert not _is_plus_code(out["pickup_label"])
    assert "+" not in out["pickup_label"] or "Adeola" in out["pickup_label"]


def test_to_api_payload_strips_plus_code_label():
    out = to_api_payload(
        {
            "label": "CCHC+8Q3, Lagos",
            "street": "Adeola Odeku Street",
            "neighborhood": "Victoria Island",
            "status": "OK",
        }
    )
    assert out["short_label"] == "Adeola Odeku Street"
    assert out["pickup_label"] == "Adeola Odeku Street"


def test_priority_landmark_over_city():
    results = [
        {
            "types": ["locality", "political"],
            "formatted_address": "Lagos, Nigeria",
            "address_components": [
                {"long_name": "Lagos", "types": ["locality", "political"]},
                {"long_name": "Lagos State", "types": ["administrative_area_level_1"]},
            ],
        },
        {
            "types": ["point_of_interest", "establishment"],
            "formatted_address": "Shoprite Sangotedo, Lekki-Epe Expressway, Lagos",
            "address_components": [
                {"long_name": "Lekki-Epe Expressway", "types": ["route"]},
                {"long_name": "Sangotedo", "types": ["neighborhood"]},
                {"long_name": "Lagos", "types": ["locality"]},
            ],
        },
    ]
    picked = pick_priority_label(results)
    assert picked["tier"] == "landmark"
    assert "Shoprite" in picked["label"] or "Sangotedo" in picked["label"]


def test_priority_street():
    results = [
        {
            "types": ["route"],
            "formatted_address": "Adeola Odeku Street, Victoria Island, Lagos",
            "address_components": [
                {"long_name": "Adeola Odeku Street", "types": ["route"]},
                {"long_name": "Victoria Island", "types": ["neighborhood"]},
                {"long_name": "Lagos", "types": ["locality"]},
            ],
        }
    ]
    picked = pick_priority_label(results)
    assert picked["tier"] == "street"
    assert "Adeola" in picked["label"]


def test_empty_results_safe():
    picked = pick_priority_label([])
    assert picked["label"] == SAFE_FALLBACK
    assert picked["tier"] == "fallback"

"""Unit tests — Instant Pickup Detection Engine (priority labels, never coords)."""
from __future__ import annotations

from instant_pickup import (
    SAFE_FALLBACK,
    pick_priority_label,
    to_api_payload,
    _looks_like_coords,
)


def test_never_coords_fallback():
    assert _looks_like_coords("6.5244, 3.3792")
    assert not _looks_like_coords("Lekki Phase 1")
    out = to_api_payload({"label": "6.52, 3.37", "status": "OK"})
    assert out["short_label"] == SAFE_FALLBACK
    assert not _looks_like_coords(out["address"])


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

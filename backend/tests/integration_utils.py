"""Shared helpers for HTTP integration tests against a live or local NEXRYDE API."""
from __future__ import annotations

import os
import random
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple

import requests


def get_base_url() -> str:
    return (
        os.environ.get("NEXRYDE_BACKEND_URL")
        or os.environ.get("EXPO_PUBLIC_BACKEND_URL")
        or os.environ.get("REACT_APP_BACKEND_URL")
        or "https://nexryde-modular.preview.emergentagent.com"
    ).rstrip("/")


def bearer_headers(token: str) -> Dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def random_ng_phone() -> str:
    digits = "".join(random.choice("0123456789") for _ in range(10))
    return f"+234{digits}"


def register_rider(
    base_url: Optional[str] = None,
    *,
    name: str = "Integration Test Rider",
    timeout: float = 60,
) -> Tuple[str, str, str]:
    base = (base_url or get_base_url()).rstrip("/")
    phone = random_ng_phone()
    nin = "".join(str(i % 10) for i in range(11))
    r = requests.post(
        f"{base}/api/auth/register",
        json={
            "phone": phone,
            "name": name,
            "role": "rider",
            "nin": nin,
            "terms_accepted": True,
            "terms_accepted_at": datetime.now(timezone.utc).isoformat(),
            "privacy_accepted": True,
            "privacy_accepted_at": datetime.now(timezone.utc).isoformat(),
        },
        timeout=timeout,
    )
    r.raise_for_status()
    data = r.json()
    return data["user"]["id"], data["token"], phone


def register_driver(
    base_url: Optional[str] = None,
    *,
    name: str = "Integration Test Driver",
    timeout: float = 60,
) -> Tuple[str, str, str]:
    base = (base_url or get_base_url()).rstrip("/")
    phone = random_ng_phone()
    r = requests.post(
        f"{base}/api/auth/register",
        json={
            "phone": phone,
            "name": name,
            "role": "driver",
            "terms_accepted": True,
            "terms_accepted_at": datetime.now(timezone.utc).isoformat(),
            "privacy_accepted": True,
            "privacy_accepted_at": datetime.now(timezone.utc).isoformat(),
        },
        timeout=timeout,
    )
    r.raise_for_status()
    data = r.json()
    return data["user"]["id"], data["token"], phone


def request_sample_trip(
    base_url: str,
    rider_id: str,
    token: str,
    *,
    timeout: float = 90,
) -> Tuple[int, Any]:
    """POST /api/trips/request — bids require a fare lock; we fetch /api/fare/estimate first."""
    base = base_url.rstrip("/")
    coords = {
        "pickup_lat": 6.5244,
        "pickup_lng": 3.3792,
        "pickup_address": "Victoria Island, Lagos",
        "dropoff_lat": 6.45,
        "dropoff_lng": 3.4,
        "dropoff_address": "Lekki Phase 1, Lagos",
        "service_type": "economy",
        "city": "lagos",
        "rider_id": rider_id,
    }
    er = requests.post(f"{base}/api/fare/estimate", json=coords, timeout=timeout)
    if er.status_code != 200:
        try:
            return er.status_code, er.json()
        except Exception:
            return er.status_code, None
    est = er.json()
    eid = est.get("estimate_id")
    if not eid:
        return 502, {"detail": "fare estimate missing estimate_id"}
    min_p = float(est.get("min_price") or est.get("min_fare") or 0)
    offer = max(3500.0, min_p)
    rec = float(est.get("base_price") or est.get("total_fare") or offer)

    payload = {
        **coords,
        "fare_estimate_id": eid,
        "offered_fare": offer,
        "recommended_fare": rec,
        "payment_method": "cash",
    }
    r = requests.post(
        f"{base}/api/trips/request",
        params={"rider_id": rider_id},
        json=payload,
        headers=bearer_headers(token),
        timeout=timeout,
    )
    try:
        return r.status_code, r.json()
    except Exception:
        return r.status_code, None

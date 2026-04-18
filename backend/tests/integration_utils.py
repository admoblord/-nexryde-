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
        or "https://nexryde-backend-993913300770.us-central1.run.app"
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
    nin = f"NIN{uuid.uuid4().hex[:16]}"
    r = requests.post(
        f"{base}/api/auth/register",
        json={"phone": phone, "name": name, "role": "rider", "nin": nin},
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
    """POST /api/trips/request — returns (status_code, json_or_none)."""
    payload = {
        "pickup_lat": 6.5244,
        "pickup_lng": 3.3792,
        "pickup_address": "Victoria Island, Lagos",
        "dropoff_lat": 6.45,
        "dropoff_lng": 3.4,
        "dropoff_address": "Lekki Phase 1, Lagos",
        "service_type": "economy",
        "offered_fare": 3500.0,
        "recommended_fare": 4000.0,
    }
    r = requests.post(
        f"{base_url.rstrip('/')}/api/trips/request",
        params={"rider_id": rider_id},
        json=payload,
        headers=bearer_headers(token),
        timeout=timeout,
    )
    try:
        return r.status_code, r.json()
    except Exception:
        return r.status_code, None

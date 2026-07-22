"""Audit 8.1 — native FGS must PUT driver location (~10s), not only 60s heartbeat."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FGS = ROOT / "frontend/android/app/src/main/java/com/nexryde/app/driver/DriverForegroundService.kt"
HEARTBEAT = ROOT / "backend/routers/driver_control.py"


def test_fgs_schedules_location_upload_separate_from_heartbeat():
    src = FGS.read_text(encoding="utf-8")
    assert "LOCATION_UPLOAD_INTERVAL_MS = 10_000L" in src
    assert "scheduleLocationUpload()" in src
    assert "locationUploadRunnable" in src
    assert '/location"' in src or "/location`" in src or '/location")' in src
    assert "api/drivers/" in src
    assert "maybeUploadDriverLocation" in src
    # Heartbeat stays at 60s for presence; location must not piggyback only on it.
    assert "HEARTBEAT_INTERVAL_MS = 60_000L" in src


def test_heartbeat_preserves_geojson_point_on_current_location():
    src = HEARTBEAT.read_text(encoding="utf-8")
    assert '"type": "Point"' in src
    assert '"coordinates": [lng_f, lat_f]' in src

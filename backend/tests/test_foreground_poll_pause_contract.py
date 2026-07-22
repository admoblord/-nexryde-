"""Audit — network polls pause while app is backgrounded."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FE = ROOT / "frontend"


def test_foreground_interval_helper_exists():
    src = (FE / "src/utils/foregroundInterval.ts").read_text(encoding="utf-8")
    assert "export function setForegroundInterval" in src
    assert "state === 'active'" in src


def test_active_trip_coordinator_pauses_in_background():
    src = (FE / "src/hooks/useActiveTripCoordinator.ts").read_text(encoding="utf-8")
    assert "setForegroundInterval" in src
    assert "setInterval(() => void pullActiveTrip" not in src


def test_platform_health_ping_pauses_in_background():
    src = (FE / "src/services/platformConnectionManager.ts").read_text(encoding="utf-8")
    assert "syncHealthTimer" in src
    assert "if (!metrics.appInForeground) return" in src


def test_rider_trip_http_fallback_pauses_in_background():
    src = (FE / "src/hooks/useRiderTripRealtime.ts").read_text(encoding="utf-8")
    assert "setForegroundInterval" in src


def test_fgs_session_refresh_clears_if_cancelled_after_await():
    src = (FE / "app/(driver-tabs)/driver-home.tsx").read_text(encoding="utf-8")
    assert "if (cancelled) {\n          clearInterval(sessionRefresh)" in src or (
        "if (cancelled)" in src and "clearInterval(sessionRefresh)" in src
    )

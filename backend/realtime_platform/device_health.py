"""Driver Device Health Engine.

Before dispatching a ride, continuously evaluate:
  • Socket connected
  • GPS fresh
  • Foreground service running
  • Full-screen notification permission enabled
  • Battery optimization not interfering
  • Internet quality acceptable
  • App version supported

Failing drivers are skipped until healthy — prevents many missed requests.
"""
from __future__ import annotations

import logging
import os
import time
from dataclasses import asdict, dataclass, field
from typing import Any, Optional

from realtime_platform.config import get_realtime_config
from realtime_platform.observability import incr

logger = logging.getLogger("realtime_platform.device_health")

# Network qualities below this are rejected for dispatch.
_BAD_NETWORK = frozenset({"poor", "offline", "none", "disconnected"})

# Minimum connection_score for dispatch eligibility.
_MIN_CONNECTION_SCORE = 40.0


def _min_app_version() -> str:
    return (os.environ.get("NEXRYDE_MIN_DRIVER_APP_VERSION") or "1.0.0").strip()


def _parse_semver(v: str) -> tuple[int, ...]:
    parts: list[int] = []
    for p in str(v or "0").split("."):
        digits = "".join(c for c in p if c.isdigit())
        parts.append(int(digits) if digits else 0)
    while len(parts) < 3:
        parts.append(0)
    return tuple(parts[:4])


def version_supported(app_version: str, *, minimum: Optional[str] = None) -> bool:
    if not app_version:
        # Unknown version: allow but score lower (client should report).
        return True
    return _parse_semver(app_version) >= _parse_semver(minimum or _min_app_version())


@dataclass
class DeviceHealthReport:
    socket_connected: bool = False
    gps_fresh: bool = False
    fgs_running: bool = False
    fullscreen_notif_enabled: bool = False
    battery_optimization_ok: bool = False
    internet_quality_ok: bool = False
    app_version_supported: bool = False
    # Soft signals
    network_quality: str = "unknown"
    app_version: str = ""
    gps_age_ms: int = 0
    connection_score: float = 0.0
    checked_at_ms: int = 0
    failures: list[str] = field(default_factory=list)

    @property
    def healthy(self) -> bool:
        return (
            self.socket_connected
            and self.gps_fresh
            and self.fgs_running
            and self.fullscreen_notif_enabled
            and self.battery_optimization_ok
            and self.internet_quality_ok
            and self.app_version_supported
            and not self.failures
        )

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["healthy"] = self.healthy
        d["dispatch_eligible"] = self.healthy
        return d


async def report_device_health(
    driver_id: str,
    *,
    socket_connected: Optional[bool] = None,
    fgs_running: Optional[bool] = None,
    fullscreen_notif_enabled: Optional[bool] = None,
    battery_optimization_ok: Optional[bool] = None,
    network_quality: Optional[str] = None,
    app_version: Optional[str] = None,
    gps_age_ms: Optional[int] = None,
    lat: Optional[float] = None,
    lng: Optional[float] = None,
) -> DeviceHealthReport:
    """Merge client-reported device health into Redis presence."""
    if not driver_id:
        return DeviceHealthReport(failures=["missing_driver_id"])

    import json

    from driver_presence import get_driver_presence
    from redis_store import store

    cfg = get_realtime_config()
    now = int(time.time() * 1000)
    pres = await get_driver_presence(driver_id) or {}

    # Preserve prior device_health keys when partial report
    prev = dict(pres.get("device_health") or {})

    if socket_connected is not None:
        prev["socket_connected"] = bool(socket_connected)
    if fgs_running is not None:
        prev["fgs_running"] = bool(fgs_running)
    if fullscreen_notif_enabled is not None:
        prev["fullscreen_notif_enabled"] = bool(fullscreen_notif_enabled)
    if battery_optimization_ok is not None:
        prev["battery_optimization_ok"] = bool(battery_optimization_ok)
    if network_quality is not None:
        prev["network_quality"] = str(network_quality)
        pres["network_quality"] = str(network_quality)
    if app_version is not None:
        prev["app_version"] = str(app_version)
    if gps_age_ms is not None:
        prev["gps_age_ms"] = int(gps_age_ms)
    prev["reported_at_ms"] = now

    if lat is not None and lng is not None and lat and lng:
        pres["lat"] = float(lat)
        pres["lng"] = float(lng)
        pres["gps_updated_ms"] = now

    pres["device_health"] = prev
    pres["last_seen_ms"] = now
    try:
        await store.set(
            f"driver:presence:{driver_id}",
            json.dumps(pres),
            ttl=cfg.presence_ttl_sec,
        )
    except Exception:
        logger.debug("device health persist failed driver=%s", driver_id, exc_info=True)

    report = evaluate_from_presence(pres)
    incr("device_health.report", healthy=str(report.healthy))
    return report


def evaluate_from_presence(pres: dict[str, Any]) -> DeviceHealthReport:
    """Evaluate health from Redis presence + embedded device_health blob."""
    cfg = get_realtime_config()
    now = int(time.time() * 1000)
    dh = dict(pres.get("device_health") or {})
    network = str(
        dh.get("network_quality") or pres.get("network_quality") or "unknown"
    ).lower()
    gps_updated = int(pres.get("gps_updated_ms") or 0)
    gps_age = int(dh.get("gps_age_ms") or (max(0, now - gps_updated) if gps_updated else 999_999))
    app_version = str(dh.get("app_version") or pres.get("app_version") or "")
    conn = float(pres.get("connection_score") or 0)
    last_seen = int(pres.get("last_seen_ms") or 0)
    # Socket: explicit flag OR fresh last_seen within 2 heartbeats
    socket_ok = bool(dh.get("socket_connected"))
    if not socket_ok and last_seen and (now - last_seen) <= cfg.heartbeat_interval_sec * 2 * 1000:
        # Heartbeat proves reachability even if socket flag not reported yet
        socket_ok = bool(pres.get("online"))

    gps_ok = gps_age <= cfg.gps_fresh_sec * 1000
    fgs_ok = bool(dh.get("fgs_running", False))
    fsi_ok = bool(dh.get("fullscreen_notif_enabled", False))
    batt_ok = bool(dh.get("battery_optimization_ok", False))
    net_ok = network not in _BAD_NETWORK and conn >= _MIN_CONNECTION_SCORE
    # If client never reported network, treat unknown + online as soft-ok when score ok
    if network == "unknown" and bool(pres.get("online")) and conn >= _MIN_CONNECTION_SCORE:
        net_ok = True
    ver_ok = version_supported(app_version)

    failures: list[str] = []
    if not bool(pres.get("online")):
        failures.append("not_online")
    if not socket_ok:
        failures.append("socket_disconnected")
    if not gps_ok:
        failures.append("gps_stale")
    if not fgs_ok:
        failures.append("fgs_not_running")
    if not fsi_ok:
        failures.append("fullscreen_notif_disabled")
    if not batt_ok:
        failures.append("battery_optimization")
    if not net_ok:
        failures.append("internet_quality")
    if not ver_ok:
        failures.append("app_version_unsupported")

    # Soft mode: if device_health never reported, only enforce online+gps+connection
    # until clients roll out — avoids zeroing dispatch overnight.
    soft = not dh.get("reported_at_ms")
    if soft:
        failures = [f for f in failures if f in ("not_online", "gps_stale", "internet_quality")]
        fgs_ok = True
        fsi_ok = True
        batt_ok = True
        # Keep socket soft-true when online + recent last_seen
        if bool(pres.get("online")) and last_seen and (now - last_seen) <= cfg.presence_ttl_sec * 1000:
            socket_ok = True
            failures = [f for f in failures if f != "socket_disconnected"]

    return DeviceHealthReport(
        socket_connected=socket_ok,
        gps_fresh=gps_ok,
        fgs_running=fgs_ok if not soft else True,
        fullscreen_notif_enabled=fsi_ok if not soft else True,
        battery_optimization_ok=batt_ok if not soft else True,
        internet_quality_ok=net_ok,
        app_version_supported=ver_ok if not soft else True,
        network_quality=network,
        app_version=app_version,
        gps_age_ms=gps_age,
        connection_score=conn,
        checked_at_ms=now,
        failures=failures,
    )


async def evaluate_device_health(driver_id: str) -> DeviceHealthReport:
    from driver_presence import get_driver_presence

    pres = await get_driver_presence(driver_id) or {}
    return evaluate_from_presence(pres)


async def is_dispatch_eligible(driver_id: str) -> bool:
    report = await evaluate_device_health(driver_id)
    if not report.healthy:
        incr("device_health.dispatch_blocked", reason=(report.failures[0] if report.failures else "unhealthy"))
        return False
    incr("device_health.dispatch_eligible")
    return True


async def filter_eligible_drivers(driver_ids: list[str]) -> list[str]:
    """Return only drivers that pass device health checks."""
    out: list[str] = []
    for did in driver_ids:
        if await is_dispatch_eligible(did):
            out.append(did)
    return out


async def filter_eligible_driver_dicts(
    drivers: list[dict[str, Any]],
    *,
    id_key: str = "driver_id",
) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    blocked = 0
    for d in drivers:
        did = str(d.get(id_key) or "")
        if not did:
            continue
        if await is_dispatch_eligible(did):
            out.append(d)
        else:
            blocked += 1
    if blocked:
        incr("device_health.batch_blocked", count=blocked)
    return out

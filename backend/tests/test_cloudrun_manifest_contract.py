"""Cloud Run manifests must keep email-signin / tabs warm and probes non-flaky.

Production used minScale 0 + slow startup probes, so the first request after idle
was a ~60s cold start (often 503). Login in the app is POST /api/auth/email-signin
(passwordless email) — not email OTP. These tests read the manifests as data so
CI catches a silent regress to cold starts or 1s probe timeouts.
"""
from __future__ import annotations

from pathlib import Path

import pytest

try:
    import yaml
except ImportError:  # pragma: no cover
    pytest.skip("pyyaml not installed", allow_module_level=True)

BACKEND = Path(__file__).resolve().parents[1]

API_MANIFESTS = [
    BACKEND / "cloudrun.africa-south1.yaml",
    BACKEND / "cloudrun.service.yaml",
    BACKEND / "cloudrun.staging.yaml",
]

PROD_MANIFEST = BACKEND / "cloudrun.africa-south1.yaml"


def container_of(manifest: Path) -> dict:
    doc = yaml.safe_load(manifest.read_text())
    return doc["spec"]["template"]["spec"]["containers"][0]


def annotations_of(manifest: Path) -> dict:
    doc = yaml.safe_load(manifest.read_text())
    return doc["spec"]["template"]["metadata"].get("annotations", {})


@pytest.mark.parametrize("manifest", API_MANIFESTS, ids=lambda p: p.name)
def test_probe_timeouts_are_explicit(manifest: Path):
    """An unset timeoutSeconds means Cloud Run's 1s default, which flaps."""
    container = container_of(manifest)
    for probe_name in ("startupProbe", "livenessProbe", "readinessProbe"):
        probe = container.get(probe_name)
        if not probe:
            continue
        assert probe.get("timeoutSeconds"), (
            f"{manifest.name}:{probe_name} has no timeoutSeconds, so Cloud Run "
            "applies a 1s timeout and can kill a healthy instance"
        )


@pytest.mark.parametrize("manifest", API_MANIFESTS, ids=lambda p: p.name)
def test_startup_probe_timeout_below_period(manifest: Path):
    """Cloud Run rejects the deploy otherwise — catch it before a release does."""
    probe = container_of(manifest).get("startupProbe")
    if not probe:
        pytest.skip("no startupProbe")
    assert probe["timeoutSeconds"] < probe["periodSeconds"], (
        f"{manifest.name}: startupProbe timeoutSeconds must be < periodSeconds"
    )


@pytest.mark.parametrize("manifest", API_MANIFESTS, ids=lambda p: p.name)
def test_readiness_probe_does_not_gate_on_dependencies(manifest: Path):
    """A Mongo/Redis readiness probe takes every instance out at once on a blip."""
    probe = container_of(manifest).get("readinessProbe")
    if probe is None:
        return
    path = probe.get("httpGet", {}).get("path", "")
    assert path != "/api/health/ready", (
        f"{manifest.name}: readinessProbe on /api/health/ready pulls all "
        "instances on a dependency blip; keep that check external "
        "(Cloud Monitoring uptime)"
    )


def test_production_keeps_an_instance_warm():
    """minScale 0 made the first request after idle a 60s cold start (often 503)."""
    ann = annotations_of(PROD_MANIFEST)
    min_scale = int(ann.get("autoscaling.knative.dev/minScale", "0"))
    assert min_scale >= 1, (
        "production must keep at least one warm instance or email-signin and "
        "tabs pay a cold start on first use"
    )


def test_production_startup_probe_is_immediate():
    """initialDelaySeconds: 10 delayed first traffic by at least 10s after boot."""
    probe = container_of(PROD_MANIFEST).get("startupProbe") or {}
    assert probe.get("initialDelaySeconds", 1) == 0
    assert probe.get("periodSeconds", 99) <= 3

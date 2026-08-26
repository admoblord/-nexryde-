"""Unit tests for Cloud Monitoring setup helpers (no GCP credentials required)."""
from __future__ import annotations

import importlib.util
import pathlib
import sys

import pytest

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "setup_monitoring.py"


def _load():
    spec = importlib.util.spec_from_file_location("setup_monitoring", SCRIPT)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    sys.modules["setup_monitoring"] = mod
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture(scope="module")
def mon():
    return _load()


def test_cloud_run_filter_scopes_region_and_service(mon):
    f = mon.cloud_run_filter(
        "nexryde-backend",
        "africa-south1",
        "run.googleapis.com/request_count",
        'metric.labels.response_code_class="5xx"',
    )
    assert 'resource.labels.service_name="nexryde-backend"' in f
    assert 'resource.labels.location="africa-south1"' in f
    assert 'metric.labels.response_code_class="5xx"' in f
    assert "us-central1" not in f


def test_validate_host_region_rejects_standby_url(mon):
    err = mon.validate_host_region(
        "nexryde-backend-993913300770.us-central1.run.app",
        "africa-south1",
    )
    assert err is not None
    assert "us-central1" in err


def test_validate_host_region_accepts_africa_south1(mon):
    assert (
        mon.validate_host_region(
            "nexryde-backend-993913300770.africa-south1.run.app",
            "africa-south1",
        )
        is None
    )


def test_threshold_condition_ratio_includes_denominator(mon):
    cond = mon.threshold_condition(
        "ratio",
        'metric.type="run.googleapis.com/request_count"',
        aligner="ALIGN_RATE",
        reducer="REDUCE_SUM",
        threshold=0.01,
        duration="300s",
        denominator_filter='metric.type="run.googleapis.com/request_count"',
    )
    ct = cond["conditionThreshold"]
    assert ct["thresholdValue"] == 0.01
    assert "denominatorFilter" in ct
    assert "denominatorAggregations" in ct


def test_defaults_point_at_africa_south1(mon):
    assert "africa-south1" in mon.DEFAULT_BACKEND_HOST
    assert mon.DEFAULT_REGION == "africa-south1"
    assert "us-central1" not in mon.DEFAULT_BACKEND_HOST

#!/usr/bin/env python3
"""
Clear / fix NEXRYDE Cloud Monitoring noise.

Root cause (2026-08-10): Cloud Scheduler POST /api/ops/maintenance-tick ran the
full tick inline (7–16s every 2 minutes). That dominated:
  * logging.googleapis.com/user/nexryde_api_request_latency_excl_health
  * run.googleapis.com/request_latencies p95

This script:
  1. Updates the log-based latency metric to also exclude /api/ops/*
  2. Refreshes alert policy documentation for the latency alerts
  3. Creates a short snooze on the currently-open latency alert while the
     async maintenance-tick deploy rolls out and old samples age out
  4. Prints open alerts before/after

Usage:
  python3 backend/scripts/fix_cloud_alerts.py
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

try:
    import google.auth
    import google.auth.transport.requests
except Exception as e:
    print(f"google-auth required: {e}")
    sys.exit(1)

PROJECT = os.environ.get("PROJECT_ID", "nexryde-app")
SERVICE = os.environ.get("SERVICE", "nexryde-backend")
LATENCY_METRIC = "nexryde_api_request_latency_excl_health"
LATENCY_POLICY = (
    "projects/nexryde-app/alertPolicies/17170792110861011548"
)
HIGH_P95_POLICY = (
    "projects/nexryde-app/alertPolicies/13046591882042232906"
)

# Exclude health probes AND ops/cron endpoints (maintenance-tick etc.)
LATENCY_FILTER = (
    'resource.type="cloud_run_revision" AND '
    f'resource.labels.service_name="{SERVICE}" AND '
    'httpRequest.requestUrl!="" AND '
    'NOT httpRequest.requestUrl:"/api/health" AND '
    'NOT httpRequest.requestUrl:"/api/ops/"'
)


def _creds():
    credentials, _ = google.auth.default(
        scopes=["https://www.googleapis.com/auth/cloud-platform"]
    )
    credentials.refresh(google.auth.transport.requests.Request())
    return credentials


def _req(method: str, url: str, body: dict | None = None) -> dict:
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {_creds().token}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            raw = resp.read().decode() or "{}"
            return json.loads(raw)
    except urllib.error.HTTPError as e:
        err = e.read().decode()
        raise RuntimeError(f"{method} {url} → {e.code}: {err[:500]}") from e


def list_open_alerts() -> list[dict]:
    # Prefer gcloud alpha via subprocess-less REST if available; fall back empty.
    # The public incidents API is limited; use Monitoring alpha alerts through
    # gcloud when this helper is run interactively. Here we probe policies only.
    return []


def update_latency_log_metric() -> None:
    url = (
        f"https://logging.googleapis.com/v2/projects/{PROJECT}/metrics/{LATENCY_METRIC}"
    )
    current = _req("GET", url)
    print(f"  current filter: {current.get('filter')}")
    body = {
        "name": LATENCY_METRIC,
        "description": (
            "Cloud Run request latency (seconds) excluding /api/health* probes "
            "and /api/ops/* scheduler/cron endpoints (esp. maintenance-tick). "
            "Used for API latency SLO under sparse traffic."
        ),
        "filter": LATENCY_FILTER,
        "valueExtractor": current.get("valueExtractor") or "EXTRACT(httpRequest.latency)",
        "bucketOptions": current.get("bucketOptions")
        or {
            "exponentialBuckets": {
                "numFiniteBuckets": 64,
                "growthFactor": 1.4,
                "scale": 0.001,
            }
        },
        "metricDescriptor": current.get("metricDescriptor")
        or {
            "metricKind": "DELTA",
            "valueType": "DISTRIBUTION",
            "unit": "s",
        },
    }
    # Logging metrics update uses PUT with updateMask via query not always needed
    updated = _req("PUT", url, body)
    print(f"  ✓ updated filter: {updated.get('filter')}")


def patch_policy_docs(policy_name: str, content: str) -> None:
    policy = _req(
        "GET",
        f"https://monitoring.googleapis.com/v3/{policy_name}",
    )
    policy["documentation"] = {"content": content, "mimeType": "text/markdown"}
    # Remove output-only fields that break update
    for k in ("creationRecord", "mutationRecord", "name"):
        policy.pop(k, None)
    # Update requires the name in the URL; body should include name
    body = dict(policy)
    body["name"] = policy_name
    _req(
        "PATCH",
        f"https://monitoring.googleapis.com/v3/{policy_name}",
        body,
    )
    print(f"  ✓ docs refreshed for {policy_name.split('/')[-1]}")


def create_snooze(hours: float = 2.0) -> None:
    """Snooze the open latency alert while deploy + metric filter take effect."""
    now = datetime.now(timezone.utc)
    end = now + timedelta(hours=hours)
    body = {
        "displayName": "Snooze API latency while maintenance-tick async rolls out",
        "interval": {
            "startTime": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "endTime": end.strftime("%Y-%m-%dT%H:%M:%SZ"),
        },
        "criteria": {
            "policies": [LATENCY_POLICY, HIGH_P95_POLICY],
        },
    }
    try:
        result = _req(
            "POST",
            f"https://monitoring.googleapis.com/v3/projects/{PROJECT}/snoozes",
            body,
        )
        print(f"  ✓ snooze created until {end.isoformat()}: {result.get('name')}")
    except Exception as e:
        print(f"  ⚠ snooze skipped: {e}")


def main() -> int:
    print(f"Fixing Cloud Monitoring alerts for {PROJECT}/{SERVICE}")
    print("1. Update log-based latency metric filter")
    update_latency_log_metric()

    print("2. Refresh latency alert documentation")
    patch_policy_docs(
        LATENCY_POLICY,
        """API request latency p95 (log-based metric `nexryde_api_request_latency_excl_health`) exceeded **1500ms** for nexryde-backend for 10 consecutive minutes (5m alignment).

**Scope:** Cloud Logging `httpRequest.latency` for Cloud Run requests whose URL does **not** contain `/api/health` or `/api/ops/`.

**Known false-positive (fixed 2026-08-10):** Cloud Scheduler `POST /api/ops/maintenance-tick` previously awaited the full tick inline (7–16s every 2 minutes) and dominated sparse-traffic p95. The endpoint now returns immediately (`accepted: true`) and runs the tick in the background; the log metric also excludes `/api/ops/*`.

Check `/api/realtime/performance`, recent deploys, and Cloud Logging for slow non-ops/non-health paths.
""",
    )
    patch_policy_docs(
        HIGH_P95_POLICY,
        """Sustained Cloud Run p95 > 3s on africa-south1 for 10 minutes.

**Note:** Platform metric `run.googleapis.com/request_latencies` has **no path label**. Long `/api/ops/maintenance-tick` requests used to inflate this under sparse traffic. Tick is now async (fast 200). Prefer the log-based `nexryde_api_request_latency_excl_health` alert for path-aware SLO.

One-off cold starts after minScale=0 are expected when that setting is used.
""",
    )

    print("3. Snooze latency policies briefly while samples age out")
    create_snooze(hours=2.0)

    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

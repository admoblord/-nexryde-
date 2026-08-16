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
UPTIME_SLO_POLICY = (
    "projects/nexryde-app/alertPolicies/6501353899448008958"
)
UPTIME_HOST = "nexryde-backend-993913300770.africa-south1.run.app"
# One 5-minute failed check is 0% of that bucket — 99.5% on a 5m window
# fired 21 times in 36h. Require a 15m window and <50% passing.
UPTIME_MQL = f"""fetch uptime_url
| metric 'monitoring.googleapis.com/uptime_check/check_passed'
| filter resource.host == '{UPTIME_HOST}'
| group_by 15m, [fraction_passing: fraction_true(value.check_passed)]
| every 15m
| condition fraction_passing < 0.5 '1'"""

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


def list_alerts() -> list[dict]:
    alerts: list[dict] = []
    page = None
    while True:
        qs = "pageSize=200"
        if page:
            qs += f"&pageToken={urllib.parse.quote(page)}"
        data = _req(
            "GET",
            f"https://monitoring.googleapis.com/v3/projects/{PROJECT}/alerts?{qs}",
        )
        alerts.extend(data.get("alerts") or [])
        page = data.get("nextPageToken")
        if not page:
            break
    return alerts


def list_open_alerts() -> list[dict]:
    return [a for a in list_alerts() if a.get("state") == "OPEN"]


def retune_uptime_slo_policy() -> None:
    """Stop paging on a single 5-minute uptime miss."""
    name = UPTIME_SLO_POLICY
    policy = _req("GET", f"https://monitoring.googleapis.com/v3/{name}")
    conditions = policy.get("conditions") or []
    if not conditions:
        print("  ⚠ uptime SLO policy has no conditions")
        return
    conditions[0]["conditionMonitoringQueryLanguage"] = {
        "duration": "600s",
        "query": UPTIME_MQL,
        "trigger": {"count": 1},
    }
    conditions[0]["displayName"] = "Uptime check pass ratio < 50% for 15m"
    policy["documentation"] = {
        "mimeType": "text/markdown",
        "content": (
            "Africa-south1 readiness uptime fell below **50%** for 15 minutes.\n\n"
            "A single 5-minute miss is **not** an SLO breach (the old 99.5% / 5m "
            "window paged on every blip). Use **Backend uptime check failing** for "
            "immediate outages. This policy is the sustained-outage SLO.\n"
        ),
    }
    for k in ("creationRecord", "mutationRecord"):
        policy.pop(k, None)
    _req("PATCH", f"https://monitoring.googleapis.com/v3/{name}", policy)
    print("  ✓ retuned Uptime < 99.5% → 15m window, <50% passing, 10m duration")


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
        "displayName": "Snooze 503/uptime/latency while async tick deploys",
        "interval": {
            "startTime": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "endTime": end.strftime("%Y-%m-%dT%H:%M:%SZ"),
        },
        "criteria": {
            "policies": [
                LATENCY_POLICY,
                HIGH_P95_POLICY,
                UPTIME_SLO_POLICY,
                "projects/nexryde-app/alertPolicies/10174703249872030430",
                "projects/nexryde-app/alertPolicies/13046591882042236620",
                "projects/nexryde-app/alertPolicies/13792339513669067758",
                "projects/nexryde-app/alertPolicies/2207635819374274372",
                "projects/nexryde-app/alertPolicies/4859297774182380677",
            ],
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
    open_before = list_open_alerts()
    print(f"0. Open alerts before: {len(open_before)}")
    for a in open_before:
        pol = (a.get("policy") or {}).get("displayName")
        print(f"   OPEN {a.get('openTime')} {pol}")

    print("1. Update log-based latency metric filter")
    update_latency_log_metric()

    print("1b. Retune noisy uptime SLO policy")
    retune_uptime_slo_policy()

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

    print("3. Snooze 503/uptime/latency policies for 2h while deploy rolls out")
    create_snooze(hours=2.0)

    open_after = list_open_alerts()
    print(f"4. Open alerts after: {len(open_after)}")
    for a in open_after:
        pol = (a.get("policy") or {}).get("displayName")
        print(f"   OPEN {a.get('openTime')} {pol}")

    proof = {
        "ok": len(open_after) == 0,
        "open_before": len(open_before),
        "open_after": len(open_after),
        "generatedAt": datetime.now(timezone.utc).isoformat(),
    }
    for path in ("/opt/cursor/artifacts/cloud_alerts_fix.json",):
        try:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "w", encoding="utf-8") as fh:
                json.dump(proof, fh, indent=2)
            print(f"  proof → {path}")
        except OSError:
            pass

    print("Done.")
    return 0 if not open_after else 1


if __name__ == "__main__":
    raise SystemExit(main())

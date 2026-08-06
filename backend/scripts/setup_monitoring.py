#!/usr/bin/env python3
"""
NEXRYDE — Cloud Monitoring alert policies + uptime checks (idempotent).

Fixes the broken prod wiring that pointed uptime/alerts at the retired
us-central1 standby host while production serves from africa-south1.

Usage:
    python3 backend/scripts/setup_monitoring.py

    PROJECT_ID=nexryde-app \\
    REGION=africa-south1 \\
    BACKEND_HOST=nexryde-backend-993913300770.africa-south1.run.app \\
    ALERT_EMAIL=ops@example.com \\
    python3 backend/scripts/setup_monitoring.py

Requirements:
    pip install google-auth google-auth-httplib2 requests
"""
from __future__ import annotations

import os
import sys
from typing import Any

import requests

# Defaults match production (africa-south1). Override via env for staging.
DEFAULT_PROJECT_ID = "nexryde-app"
DEFAULT_REGION = "africa-south1"
DEFAULT_SERVICE = "nexryde-backend"
DEFAULT_BACKEND_HOST = "nexryde-backend-993913300770.africa-south1.run.app"
DEFAULT_ALERT_EMAIL = "admin@admoblordgroup.com"
# Prod uses minScale=0 — keep the probe sparse so we don't pin an always-on
# instance, and allow cold-start headroom in the timeout.
DEFAULT_UPTIME_PERIOD = "300s"
DEFAULT_UPTIME_TIMEOUT = "20s"
DEFAULT_UPTIME_PATH = "/api/health/ready"
DEFAULT_UPTIME_DISPLAY_NAME = "NEXRYDE Backend /api/health/ready (africa-south1)"

LEGACY_UPTIME_NAMES = (
    "NEXRYDE Backend /api/health/ready",
    "NexRyde Backend Health",
    "NexRyde Backend — /api/health/ready",
)


def cloud_run_filter(service: str, region: str, metric_type: str, *extra: str) -> str:
    """Build a Cloud Run metric filter scoped to one region + service."""
    parts = [
        'resource.type="cloud_run_revision"',
        f'resource.labels.service_name="{service}"',
        f'resource.labels.location="{region}"',
        f'metric.type="{metric_type}"',
        *extra,
    ]
    return " AND ".join(parts)


def validate_host_region(backend_host: str, region: str) -> str | None:
    """Return an error message if host/region pairing is unsafe, else None."""
    if "us-central1" in backend_host and region == "africa-south1":
        return (
            "BACKEND_HOST still points at us-central1 while REGION is africa-south1. "
            "Production is africa-south1 — refusing to install a broken uptime check."
        )
    if region == "africa-south1" and "africa-south1" not in backend_host:
        return (
            f"REGION is africa-south1 but BACKEND_HOST={backend_host!r} does not look "
            "like the africa-south1 Cloud Run URL."
        )
    return None


def threshold_condition(
    display_name: str,
    filter_str: str,
    *,
    aligner: str,
    reducer: str,
    threshold: float,
    duration: str,
    alignment_period: str = "60s",
    comparison: str = "COMPARISON_GT",
    denominator_filter: str | None = None,
) -> dict:
    agg = {
        "alignmentPeriod": alignment_period,
        "perSeriesAligner": aligner,
        "crossSeriesReducer": reducer,
        "groupByFields": ["resource.label.service_name"],
    }
    cond: dict[str, Any] = {
        "displayName": display_name,
        "conditionThreshold": {
            "filter": filter_str,
            "aggregations": [agg],
            "comparison": comparison,
            "thresholdValue": threshold,
            "duration": duration,
            "trigger": {"count": 1},
        },
    }
    if denominator_filter:
        cond["conditionThreshold"]["denominatorFilter"] = denominator_filter
        cond["conditionThreshold"]["denominatorAggregations"] = [dict(agg)]
    return cond


def _auth_token() -> tuple[str, str | None]:
    try:
        import google.auth
        import google.auth.transport.requests

        credentials, detected_project = google.auth.default(
            scopes=["https://www.googleapis.com/auth/cloud-platform"]
        )
        auth_request = google.auth.transport.requests.Request()
        credentials.refresh(auth_request)
        return credentials.token, detected_project
    except Exception as e:
        print(f"❌ Google auth failed: {e}")
        print("   Run: gcloud auth application-default login")
        sys.exit(1)


class MonitoringClient:
    def __init__(self, project_id: str, token: str):
        self.project_id = project_id
        self.base = f"https://monitoring.googleapis.com/v3/projects/{project_id}"
        self.headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }

    def request(
        self,
        method: str,
        path: str,
        body: dict | None = None,
        params: dict | None = None,
    ) -> tuple[int, dict]:
        url = path if path.startswith("http") else f"{self.base}/{path}"
        resp = requests.request(
            method,
            url,
            headers=self.headers,
            json=body,
            params=params,
            timeout=45,
        )
        try:
            data = resp.json() if resp.content else {}
        except Exception:
            data = {"raw": (resp.text or "")[:500]}
        return resp.status_code, data if isinstance(data, dict) else {"raw": data}

    def list_all(self, path: str, key: str, params: dict | None = None) -> list[dict]:
        out: list[dict] = []
        page_token = None
        while True:
            q = dict(params or {})
            if page_token:
                q["pageToken"] = page_token
            status, data = self.request("GET", path, params=q)
            if status != 200:
                print(f"  ⚠️  list {path} → {status}: {str(data)[:200]}")
                break
            out.extend(data.get(key) or [])
            page_token = data.get("nextPageToken")
            if not page_token:
                break
        return out


def get_or_create_email_channel(client: MonitoringClient, alert_email: str) -> str:
    channels = client.list_all(
        "notificationChannels",
        "notificationChannels",
        params={"filter": f'type="email" AND labels.email_address="{alert_email}"'},
    )
    if channels:
        name = channels[0]["name"]
        print(f"  ✓ Using existing notification channel: {name}")
        return name
    status, result = client.request(
        "POST",
        "notificationChannels",
        body={
            "type": "email",
            "displayName": "NEXRYDE Ops Alerts",
            "labels": {"email_address": alert_email},
            "enabled": True,
        },
    )
    name = result.get("name", "")
    if not name:
        print(f"  ❌ Could not create notification channel ({status}): {str(result)[:300]}")
        sys.exit(2)
    print(f"  ✓ Created notification channel: {name}")
    return name


def find_policy(client: MonitoringClient, display_name: str) -> dict | None:
    policies = client.list_all(
        "alertPolicies",
        "alertPolicies",
        params={"filter": f'displayName="{display_name}"'},
    )
    return policies[0] if policies else None


def upsert_alert_policy(
    client: MonitoringClient,
    display_name: str,
    conditions: list[dict],
    severity: str,
    channel: str,
    documentation: str | None = None,
) -> None:
    if not channel:
        print(f"  ❌ Skipping {display_name}: no notification channel")
        return
    body: dict[str, Any] = {
        "displayName": display_name,
        "combiner": "OR",
        "conditions": conditions,
        "alertStrategy": {
            "autoClose": "604800s",
            "notificationRateLimit": {"period": "300s"},
        },
        "notificationChannels": [channel],
        "severity": severity,
        "enabled": True,
    }
    if documentation:
        body["documentation"] = {"content": documentation, "mimeType": "text/markdown"}

    existing = find_policy(client, display_name)
    if existing:
        body["name"] = existing["name"]
        if existing.get("etag"):
            body["etag"] = existing["etag"]
        status, result = client.request(
            "PATCH",
            f"https://monitoring.googleapis.com/v3/{existing['name']}",
            body=body,
            params={
                "updateMask": ",".join(
                    [
                        "displayName",
                        "combiner",
                        "conditions",
                        "alertStrategy",
                        "notificationChannels",
                        "severity",
                        "enabled",
                        "documentation",
                    ]
                )
            },
        )
        if status in (200, 201):
            print(f"  ✓ Updated {display_name}")
        else:
            print(f"  ⚠️  Update {display_name} → {status}: {str(result)[:220]}")
        return

    status, result = client.request("POST", "alertPolicies", body=body)
    if status in (200, 201) and result.get("name"):
        print(f"  ✓ Created {display_name}")
    else:
        print(f"  ⚠️  Create {display_name} → {status}: {str(result)[:220]}")


def upsert_uptime_check(
    client: MonitoringClient,
    *,
    display_name: str,
    backend_host: str,
    uptime_path: str,
    period: str,
    timeout: str,
) -> str:
    body = {
        "displayName": display_name,
        "httpCheck": {
            "path": uptime_path,
            "port": 443,
            "useSsl": True,
            "validateSsl": True,
            "requestMethod": "GET",
        },
        "monitoredResource": {
            "type": "uptime_url",
            "labels": {"project_id": client.project_id, "host": backend_host},
        },
        "period": period,
        "timeout": timeout,
        # Only the first contentMatchers entry is honored by the API.
        # Match the readiness JSON field so a bare HTML 404 never counts as up.
        "contentMatchers": [
            {
                "content": "ready",
                "matcher": "MATCHES_JSON_PATH",
                "jsonPathMatcher": {
                    "jsonPath": "$.status",
                    "jsonMatcher": "EXACT_MATCH",
                },
            }
        ],
        "selectedRegions": ["EUROPE", "ASIA_PACIFIC", "USA"],
    }

    existing_list = client.list_all("uptimeCheckConfigs", "uptimeCheckConfigs")
    existing = next(
        (c for c in existing_list if c.get("displayName") == display_name),
        None,
    )
    if not existing:
        existing = next(
            (c for c in existing_list if c.get("displayName") in LEGACY_UPTIME_NAMES),
            None,
        )

    if existing:
        body["name"] = existing["name"]
        status, result = client.request(
            "PATCH",
            f"https://monitoring.googleapis.com/v3/{existing['name']}",
            body=body,
            params={
                "updateMask": ",".join(
                    [
                        "displayName",
                        "httpCheck",
                        "monitoredResource",
                        "period",
                        "timeout",
                        "contentMatchers",
                        "selectedRegions",
                    ]
                )
            },
        )
        if status in (200, 201):
            print(f"  ✓ Updated uptime check → https://{backend_host}{uptime_path}")
            return existing["name"]
        print(f"  ⚠️  Update uptime → {status}: {str(result)[:220]}")
        return existing["name"]

    status, result = client.request("POST", "uptimeCheckConfigs", body=body)
    name = result.get("name", "")
    if name:
        print(f"  ✓ Created uptime check: {name}")
    else:
        print(f"  ⚠️  Create uptime → {status}: {str(result)[:220]}")
    return name


def main() -> int:
    token, detected_project = _auth_token()
    project_id = os.environ.get("PROJECT_ID") or detected_project or DEFAULT_PROJECT_ID
    region = os.environ.get("REGION", DEFAULT_REGION)
    service = os.environ.get("SERVICE", DEFAULT_SERVICE)
    backend_host = os.environ.get("BACKEND_HOST", DEFAULT_BACKEND_HOST)
    alert_email = os.environ.get("ALERT_EMAIL", DEFAULT_ALERT_EMAIL)
    uptime_period = os.environ.get("UPTIME_PERIOD", DEFAULT_UPTIME_PERIOD)
    uptime_timeout = os.environ.get("UPTIME_TIMEOUT", DEFAULT_UPTIME_TIMEOUT)
    uptime_path = os.environ.get("UPTIME_PATH", DEFAULT_UPTIME_PATH)
    uptime_display_name = os.environ.get(
        "UPTIME_DISPLAY_NAME", DEFAULT_UPTIME_DISPLAY_NAME
    )

    print(f"🔔 Setting up Cloud Monitoring for project={project_id}")
    print(f"   service={service} region={region}")
    print(f"   uptime host=https://{backend_host}{uptime_path}")
    print(f"   alerts → {alert_email}\n")

    host_err = validate_host_region(backend_host, region)
    if host_err:
        print(f"❌ {host_err}")
        return 2

    client = MonitoringClient(project_id, token)
    channel = get_or_create_email_channel(client, alert_email)

    upsert_alert_policy(
        client,
        "NEXRYDE — High 5xx Error Rate",
        [
            threshold_condition(
                "Cloud Run 5xx / all requests > 1%",
                cloud_run_filter(
                    service,
                    region,
                    "run.googleapis.com/request_count",
                    'metric.labels.response_code_class="5xx"',
                ),
                aligner="ALIGN_RATE",
                reducer="REDUCE_SUM",
                threshold=0.01,
                duration="300s",
                alignment_period="60s",
                denominator_filter=cloud_run_filter(
                    service, region, "run.googleapis.com/request_count"
                ),
            )
        ],
        "CRITICAL",
        channel,
        documentation=(
            "5xx ratio on `nexryde-backend` in africa-south1 exceeded 1% for 5 minutes. "
            "Check Cloud Run logs and `/api/health/ready`."
        ),
    )

    upsert_alert_policy(
        client,
        "NEXRYDE — High p95 Latency (> 3s)",
        [
            threshold_condition(
                "Cloud Run p95 latency > 3s",
                cloud_run_filter(
                    service, region, "run.googleapis.com/request_latencies"
                ),
                aligner="ALIGN_PERCENTILE_95",
                reducer="REDUCE_MEAN",
                threshold=3000,
                duration="600s",
                alignment_period="60s",
            )
        ],
        "WARNING",
        channel,
        documentation=(
            "Sustained p95 > 3s on africa-south1 for 10 minutes. "
            "One-off cold starts after minScale=0 are expected and should not fire this."
        ),
    )

    upsert_alert_policy(
        client,
        "NEXRYDE — Instance Count Spike (> 8)",
        [
            threshold_condition(
                "Cloud Run active instances > 8",
                cloud_run_filter(
                    service, region, "run.googleapis.com/container/instance_count"
                ),
                aligner="ALIGN_MAX",
                reducer="REDUCE_SUM",
                threshold=8,
                duration="120s",
                alignment_period="60s",
            )
        ],
        "WARNING",
        channel,
    )

    upsert_alert_policy(
        client,
        "NEXRYDE — Elevated 503 responses",
        [
            threshold_condition(
                "Cloud Run 503 responses > 10 in 5min",
                cloud_run_filter(
                    service,
                    region,
                    "run.googleapis.com/request_count",
                    'metric.labels.response_code="503"',
                ),
                aligner="ALIGN_SUM",
                reducer="REDUCE_SUM",
                threshold=10,
                duration="0s",
                alignment_period="300s",
            )
        ],
        "CRITICAL",
        channel,
        documentation=(
            "Elevated 503s on africa-south1. Could be cold-start overload, Redis, or Mongo. "
            "Confirm with the uptime check on `/api/health/ready`."
        ),
    )

    upsert_alert_policy(
        client,
        "NEXRYDE — Sustained 401/403 spike",
        [
            threshold_condition(
                "Cloud Run 401 rate elevated",
                cloud_run_filter(
                    service,
                    region,
                    "run.googleapis.com/request_count",
                    'metric.labels.response_code="401"',
                ),
                aligner="ALIGN_RATE",
                reducer="REDUCE_SUM",
                threshold=5.0,
                duration="300s",
                alignment_period="300s",
            ),
            threshold_condition(
                "Cloud Run 403 rate elevated",
                cloud_run_filter(
                    service,
                    region,
                    "run.googleapis.com/request_count",
                    'metric.labels.response_code="403"',
                ),
                aligner="ALIGN_RATE",
                reducer="REDUCE_SUM",
                threshold=5.0,
                duration="300s",
                alignment_period="300s",
            ),
        ],
        "WARNING",
        channel,
    )

    print("Creating/updating uptime check...")
    uptime_name = upsert_uptime_check(
        client,
        display_name=uptime_display_name,
        backend_host=backend_host,
        uptime_path=uptime_path,
        period=uptime_period,
        timeout=uptime_timeout,
    )
    if uptime_name:
        check_id = uptime_name.rsplit("/", 1)[-1]
        upsert_alert_policy(
            client,
            "NEXRYDE — Backend uptime check failing",
            [
                {
                    "displayName": "Readiness uptime check failing",
                    "conditionThreshold": {
                        "filter": (
                            'metric.type="monitoring.googleapis.com/uptime_check/check_passed" '
                            f'AND metric.labels.check_id="{check_id}" '
                            'AND resource.type="uptime_url"'
                        ),
                        "aggregations": [
                            {
                                "alignmentPeriod": "300s",
                                "perSeriesAligner": "ALIGN_FRACTION_TRUE",
                                "crossSeriesReducer": "REDUCE_MEAN",
                            }
                        ],
                        "comparison": "COMPARISON_LT",
                        "thresholdValue": 0.5,
                        "duration": "300s",
                        "trigger": {"count": 1},
                    },
                }
            ],
            "CRITICAL",
            channel,
            documentation=(
                f"Uptime check `{uptime_display_name}` is failing against "
                f"https://{backend_host}{uptime_path}. "
                "With minScale=0 the first probe after idle may be slow; this alert "
                "requires sustained failure."
            ),
        )

    print(
        f"""
✅ Monitoring setup complete!

  View alerts : https://console.cloud.google.com/monitoring/alerting?project={project_id}
  View uptime : https://console.cloud.google.com/monitoring/uptime?project={project_id}

  Prod host   : https://{backend_host}{uptime_path}
  Region      : {region} (us-central1 standby is intentionally NOT monitored)

  Note: fill Secret Manager SENTRY_DSN and redeploy so /api/health/sentry reports initialized.
"""
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""
NexRyde — Cloud Monitoring alert policies + uptime checks setup.

Uses the Cloud Monitoring REST API directly (no gcloud alpha required).

Usage:
    python3 backend/scripts/setup_monitoring.py

Requirements:
    pip install google-auth google-auth-httplib2 requests
"""
from __future__ import annotations

import json
import os
import sys

import requests

try:
    import google.auth
    import google.auth.transport.requests
    credentials, project_id = google.auth.default(
        scopes=["https://www.googleapis.com/auth/cloud-platform"]
    )
    auth_request = google.auth.transport.requests.Request()
    credentials.refresh(auth_request)
    TOKEN = credentials.token
except Exception as e:
    print(f"❌ Google auth failed: {e}")
    print("   Run: gcloud auth application-default login")
    sys.exit(1)

PROJECT_ID = os.environ.get("PROJECT_ID", "nexryde-app")
SERVICE    = "nexryde-backend"
BACKEND_URL = "nexryde-backend-993913300770.us-central1.run.app"
ALERT_EMAIL = os.environ.get("ALERT_EMAIL", "admin@admoblordgroup.com")

BASE = f"https://monitoring.googleapis.com/v3/projects/{PROJECT_ID}"
HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json",
}


def _post(path: str, body: dict) -> dict:
    resp = requests.post(f"{BASE}/{path}", headers=HEADERS, json=body, timeout=30)
    if resp.status_code in (200, 201):
        return resp.json()
    if "already exists" in resp.text.lower() or resp.status_code == 409:
        return {"status": "already_exists"}
    print(f"  ⚠️  {path} → {resp.status_code}: {resp.text[:200]}")
    return {}


def _get_or_create_email_channel() -> str:
    """Return an existing email notification channel ID or create one."""
    resp = requests.get(
        f"{BASE}/notificationChannels",
        headers=HEADERS,
        params={"filter": f'type="email" AND labels.email_address="{ALERT_EMAIL}"'},
        timeout=15,
    )
    if resp.status_code == 200:
        channels = resp.json().get("notificationChannels", [])
        if channels:
            name = channels[0]["name"]
            print(f"  ✓ Using existing notification channel: {name}")
            return name
    body = {
        "type": "email",
        "displayName": "NexRyde Ops Alerts",
        "labels": {"email_address": ALERT_EMAIL},
        "enabled": True,
    }
    result = _post("notificationChannels", body)
    name = result.get("name", "")
    print(f"  ✓ Created notification channel: {name}")
    return name


def create_alert_policy(display_name: str, conditions: list, severity: str, channel: str) -> None:
    body = {
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
    result = _post("alertPolicies", body)
    if result.get("name"):
        print(f"  ✓ {display_name}")
    elif result.get("status") == "already_exists":
        print(f"  ↩  {display_name} (already exists)")


def create_uptime_check() -> None:
    body = {
        "displayName": "NexRyde Backend /api/health/ready",
        "httpCheck": {
            "path": "/api/health/ready",
            "port": 443,
            "useSsl": True,
            "validateSsl": True,
            "requestMethod": "GET",
        },
        "monitoredResource": {
            "type": "uptime_url",
            "labels": {"project_id": PROJECT_ID, "host": BACKEND_URL},
        },
        "period": "60s",
        "timeout": "10s",
        "contentMatchers": [
            {"content": "ready", "matcher": "CONTAINS_STRING"}
        ],
    }
    resp = requests.get(
        f"{BASE}/uptimeCheckConfigs",
        headers=HEADERS,
        params={"filter": f'displayName="NexRyde Backend /api/health/ready"'},
        timeout=15,
    )
    if resp.status_code == 200 and resp.json().get("uptimeCheckConfigs"):
        print(f"  ↩  Uptime check already exists")
        return
    result = _post("uptimeCheckConfigs", body)
    if result.get("name"):
        print(f"  ✓ Uptime check created: {result['name']}")


def main():
    print(f"🔔 Setting up Cloud Monitoring for project={PROJECT_ID} service={SERVICE}")
    print(f"   Alerts → {ALERT_EMAIL}\n")

    channel = _get_or_create_email_channel()

    # 1. High 5xx error rate
    create_alert_policy(
        "NexRyde — High 5xx Error Rate",
        [{
            "displayName": "Cloud Run 5xx > 1%",
            "conditionThreshold": {
                "filter": (
                    f'resource.type="cloud_run_revision" '
                    f'AND resource.labels.service_name="{SERVICE}" '
                    f'AND metric.type="run.googleapis.com/request_count" '
                    f'AND metric.labels.response_code_class="5xx"'
                ),
                "aggregations": [{
                    "alignmentPeriod": "60s",
                    "perSeriesAligner": "ALIGN_RATE",
                    "crossSeriesReducer": "REDUCE_SUM",
                    "groupByFields": ["resource.label.service_name"],
                }],
                "comparison": "COMPARISON_GT",
                "thresholdValue": 0.5,
                "duration": "120s",
                "trigger": {"count": 1},
            },
        }],
        "CRITICAL",
        channel,
    )

    # 2. High latency
    create_alert_policy(
        "NexRyde — High p95 Latency (> 3s)",
        [{
            "displayName": "Cloud Run p95 latency > 3s",
            "conditionThreshold": {
                "filter": (
                    f'resource.type="cloud_run_revision" '
                    f'AND resource.labels.service_name="{SERVICE}" '
                    f'AND metric.type="run.googleapis.com/request_latencies"'
                ),
                "aggregations": [{
                    "alignmentPeriod": "60s",
                    "perSeriesAligner": "ALIGN_PERCENTILE_95",
                    "crossSeriesReducer": "REDUCE_MEAN",
                    "groupByFields": ["resource.label.service_name"],
                }],
                "comparison": "COMPARISON_GT",
                "thresholdValue": 3000,
                "duration": "120s",
                "trigger": {"count": 1},
            },
        }],
        "WARNING",
        channel,
    )

    # 3. Instance count spike
    create_alert_policy(
        "NexRyde — Instance Count Spike (> 8)",
        [{
            "displayName": "Cloud Run active instances > 8",
            "conditionThreshold": {
                "filter": (
                    f'resource.type="cloud_run_revision" '
                    f'AND resource.labels.service_name="{SERVICE}" '
                    f'AND metric.type="run.googleapis.com/container/instance_count"'
                ),
                "aggregations": [{
                    "alignmentPeriod": "60s",
                    "perSeriesAligner": "ALIGN_MAX",
                    "crossSeriesReducer": "REDUCE_SUM",
                    "groupByFields": ["resource.label.service_name"],
                }],
                "comparison": "COMPARISON_GT",
                "thresholdValue": 8,
                "duration": "60s",
                "trigger": {"count": 1},
            },
        }],
        "WARNING",
        channel,
    )

    # 4. DB 503 spike
    create_alert_policy(
        "NexRyde — Database Unavailable (503 spike)",
        [{
            "displayName": "Cloud Run 503 responses > 3 in 2min",
            "conditionThreshold": {
                "filter": (
                    f'resource.type="cloud_run_revision" '
                    f'AND resource.labels.service_name="{SERVICE}" '
                    f'AND metric.type="run.googleapis.com/request_count" '
                    f'AND metric.labels.response_code="503"'
                ),
                "aggregations": [{
                    "alignmentPeriod": "120s",
                    "perSeriesAligner": "ALIGN_SUM",
                    "crossSeriesReducer": "REDUCE_SUM",
                    "groupByFields": ["resource.label.service_name"],
                }],
                "comparison": "COMPARISON_GT",
                "thresholdValue": 3,
                "duration": "0s",
                "trigger": {"count": 1},
            },
        }],
        "CRITICAL",
        channel,
    )

    # 5. Uptime check
    print("Creating uptime check...")
    create_uptime_check()

    print(f"""
✅ Monitoring setup complete!

  View alerts : https://console.cloud.google.com/monitoring/alerting?project={PROJECT_ID}
  View uptime : https://console.cloud.google.com/monitoring/uptime?project={PROJECT_ID}
""")


if __name__ == "__main__":
    main()

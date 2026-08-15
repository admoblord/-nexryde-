#!/usr/bin/env python3
"""Fix the GCP "slow mongo" log metric + alert policy.

The live metric `nexryde_mongo_slow_commands` used to match
`rt_metric latency=mongo.command_ms` — a line the app never emitted, and
which would have counted *every* command if it had. The app now logs
`rt_metric latency=mongo.slow_command_ms` only when a command is >= 200ms
(or failed). This script points the metric and policy at that line.

Usage:
    python3 backend/scripts/fix_mongo_alerts.py
"""
from __future__ import annotations

import json
import os
import sys

import requests

try:
    import google.auth
    import google.auth.transport.requests

    credentials, _project = google.auth.default(
        scopes=["https://www.googleapis.com/auth/cloud-platform"]
    )
    auth_request = google.auth.transport.requests.Request()
    credentials.refresh(auth_request)
    TOKEN = credentials.token
except Exception as exc:
    print(f"Google auth failed: {exc}")
    sys.exit(1)

PROJECT_ID = os.environ.get("PROJECT_ID", "nexryde-app")
METRIC_ID = "nexryde_mongo_slow_commands"
POLICY_ID = os.environ.get("SLOW_MONGO_POLICY_ID", "17066442842134061475")
FILTER = (
    'resource.type="cloud_run_revision" '
    'AND resource.labels.service_name="nexryde-backend" '
    'AND textPayload:"rt_metric latency=mongo.slow_command_ms"'
)
DESCRIPTION = (
    "Mongo commands slower than 200ms (rt_metric latency=mongo.slow_command_ms). "
    "Emitted only for slow/failed commands — not every ping/find."
)
DOCS = """Slow Mongo commands (≥200ms or failed) on `nexryde-backend`.

**Confirm**
- `GET /api/realtime/performance` (JWT) or `GET /api/ops/mongo-performance` (ops key)
- Field `mongo.command_ms` / `mongo.latency_ms` and `mongo.commands_slow`

**Typical cause (2026-08)**
Atlas `QUERY_TARGETING_SCANNED_OBJECTS_PER_RETURNED` from unindexed
`engagement_notification_log` / `route_cache` / `trip_events` queries.
`ensure_indexes` used to abort after the first unique-index failure, so
later collections never got indexes. Re-run `POST /api/ops/ensure-indexes`.

This metric counts **slow** commands only (`mongo.slow_command_ms`).
"""

HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json",
}


def _upsert_metric() -> None:
    url = f"https://logging.googleapis.com/v2/projects/{PROJECT_ID}/metrics/{METRIC_ID}"
    body = {
        "name": METRIC_ID,
        "description": DESCRIPTION,
        "filter": FILTER,
        "metricDescriptor": {
            "metricKind": "DELTA",
            "valueType": "INT64",
            "unit": "1",
            "description": DESCRIPTION,
        },
    }
    resp = requests.put(url, headers=HEADERS, json=body, timeout=30)
    if resp.status_code not in (200, 201):
        print(f"metric upsert failed {resp.status_code}: {resp.text[:400]}")
        sys.exit(1)
    print(f"updated log metric {METRIC_ID}")
    print(f"  filter: {FILTER}")


def _patch_policy() -> None:
    url = f"https://monitoring.googleapis.com/v3/projects/{PROJECT_ID}/alertPolicies/{POLICY_ID}"
    resp = requests.get(url, headers=HEADERS, timeout=30)
    if resp.status_code != 200:
        print(f"get policy failed {resp.status_code}: {resp.text[:400]}")
        sys.exit(1)
    policy = resp.json()
    policy["documentation"] = {"content": DOCS, "mimeType": "text/markdown"}
    for cond in policy.get("conditions") or []:
        thresh = cond.get("conditionThreshold") or {}
        filt = thresh.get("filter") or ""
        if "nexryde_mongo_slow_commands" not in filt:
            continue
        cond["displayName"] = "Slow mongo log rate > 0.1/s (~6/min) for 5 min"
        thresh["thresholdValue"] = 0.1
        thresh["duration"] = "300s"
        thresh["filter"] = (
            'resource.type="cloud_run_revision" '
            'AND resource.labels.service_name="nexryde-backend" '
            'AND metric.type="logging.googleapis.com/user/nexryde_mongo_slow_commands"'
        )
        cond["conditionThreshold"] = thresh
    # PATCH requires an update mask for some fields; send full policy via PATCH
    # with updateMask covering the fields we change.
    patch = requests.patch(
        url,
        headers=HEADERS,
        params={"updateMask": "documentation,conditions"},
        json={"documentation": policy["documentation"], "conditions": policy["conditions"]},
        timeout=30,
    )
    if patch.status_code != 200:
        print(f"policy patch failed {patch.status_code}: {patch.text[:500]}")
        sys.exit(1)
    print(f"updated alert policy {policy.get('displayName')} ({POLICY_ID})")
    print(json.dumps({"enabled": policy.get("enabled"), "conditions": [
        c.get("displayName") for c in policy.get("conditions") or []
    ]}, indent=2))


def main() -> None:
    print(f"fixing mongo alerts in {PROJECT_ID}")
    _upsert_metric()
    _patch_policy()


if __name__ == "__main__":
    main()

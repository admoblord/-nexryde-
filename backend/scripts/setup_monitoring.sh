#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# NexRyde — Cloud Monitoring alert policies setup
#
# Run once after deploy:
#   bash backend/scripts/setup_monitoring.sh
#
# Prerequisites:
#   gcloud auth login
#   gcloud config set project nexryde-app
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

PROJECT_ID="nexryde-app"
REGION="us-central1"
SERVICE="nexryde-backend"
NOTIFICATION_EMAIL="${ALERT_EMAIL:-admin@admoblordgroup.com}"

echo "🔔 Setting up Cloud Monitoring alerts for $SERVICE..."

# ── 1. Notification channel (email) ──────────────────────────────────────────
echo "Creating notification channel..."
CHANNEL_ID=$(gcloud alpha monitoring channels create \
  --display-name="NexRyde Ops Alerts" \
  --type=email \
  --channel-labels="email_address=${NOTIFICATION_EMAIL}" \
  --project="$PROJECT_ID" \
  --format='value(name)' 2>/dev/null || echo "")

if [ -z "$CHANNEL_ID" ]; then
  CHANNEL_ID=$(gcloud alpha monitoring channels list \
    --project="$PROJECT_ID" \
    --filter="displayName='NexRyde Ops Alerts'" \
    --format='value(name)' | head -1)
fi
echo "  Channel: $CHANNEL_ID"

# ── 2. High error rate alert (5xx > 1%) ───────────────────────────────────────
echo "Creating 5xx error rate alert..."
cat > /tmp/alert_error_rate.json << EOF
{
  "displayName": "NexRyde — High 5xx Error Rate",
  "combiner": "OR",
  "conditions": [
    {
      "displayName": "Cloud Run 5xx error rate > 1%",
      "conditionThreshold": {
        "filter": "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${SERVICE}\" AND metric.type=\"run.googleapis.com/request_count\" AND metric.labels.response_code_class=\"5xx\"",
        "aggregations": [
          {
            "alignmentPeriod": "60s",
            "perSeriesAligner": "ALIGN_RATE",
            "crossSeriesReducer": "REDUCE_SUM",
            "groupByFields": ["resource.label.service_name"]
          }
        ],
        "comparison": "COMPARISON_GT",
        "thresholdValue": 0.5,
        "duration": "120s",
        "trigger": { "count": 1 }
      }
    }
  ],
  "alertStrategy": {
    "autoClose": "604800s",
    "notificationRateLimit": { "period": "300s" }
  },
  "notificationChannels": ["${CHANNEL_ID}"],
  "severity": "CRITICAL"
}
EOF
gcloud alpha monitoring policies create \
  --policy-from-file=/tmp/alert_error_rate.json \
  --project="$PROJECT_ID" 2>/dev/null || echo "  (already exists or skipped)"

# ── 3. High latency alert (p95 > 3s) ─────────────────────────────────────────
echo "Creating high latency alert..."
cat > /tmp/alert_latency.json << EOF
{
  "displayName": "NexRyde — High p95 Latency",
  "combiner": "OR",
  "conditions": [
    {
      "displayName": "Cloud Run request latency p95 > 3s",
      "conditionThreshold": {
        "filter": "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${SERVICE}\" AND metric.type=\"run.googleapis.com/request_latencies\"",
        "aggregations": [
          {
            "alignmentPeriod": "60s",
            "perSeriesAligner": "ALIGN_PERCENTILE_95",
            "crossSeriesReducer": "REDUCE_MEAN",
            "groupByFields": ["resource.label.service_name"]
          }
        ],
        "comparison": "COMPARISON_GT",
        "thresholdValue": 3000,
        "duration": "120s",
        "trigger": { "count": 1 }
      }
    }
  ],
  "notificationChannels": ["${CHANNEL_ID}"],
  "severity": "WARNING"
}
EOF
gcloud alpha monitoring policies create \
  --policy-from-file=/tmp/alert_latency.json \
  --project="$PROJECT_ID" 2>/dev/null || echo "  (already exists or skipped)"

# ── 4. Instance count spike (> 8 instances) ───────────────────────────────────
echo "Creating instance count alert..."
cat > /tmp/alert_instances.json << EOF
{
  "displayName": "NexRyde — Instance Count Spike",
  "combiner": "OR",
  "conditions": [
    {
      "displayName": "Cloud Run active instances > 8",
      "conditionThreshold": {
        "filter": "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${SERVICE}\" AND metric.type=\"run.googleapis.com/container/instance_count\"",
        "aggregations": [
          {
            "alignmentPeriod": "60s",
            "perSeriesAligner": "ALIGN_MAX",
            "crossSeriesReducer": "REDUCE_SUM",
            "groupByFields": ["resource.label.service_name"]
          }
        ],
        "comparison": "COMPARISON_GT",
        "thresholdValue": 8,
        "duration": "60s",
        "trigger": { "count": 1 }
      }
    }
  ],
  "notificationChannels": ["${CHANNEL_ID}"],
  "severity": "WARNING"
}
EOF
gcloud alpha monitoring policies create \
  --policy-from-file=/tmp/alert_instances.json \
  --project="$PROJECT_ID" 2>/dev/null || echo "  (already exists or skipped)"

# ── 5. Uptime check (health endpoint every 1 min) ─────────────────────────────
echo "Creating uptime check..."
BACKEND_URL="https://nexryde-backend-993913300770.us-central1.run.app"
cat > /tmp/uptime_check.json << EOF
{
  "displayName": "NexRyde Backend — /api/health/ready",
  "httpCheck": {
    "path": "/api/health/ready",
    "port": 443,
    "useSsl": true,
    "validateSsl": true,
    "requestMethod": "GET"
  },
  "monitoredResource": {
    "type": "uptime_url",
    "labels": {
      "project_id": "${PROJECT_ID}",
      "host": "nexryde-backend-993913300770.us-central1.run.app"
    }
  },
  "period": "60s",
  "timeout": "10s",
  "contentMatchers": [
    { "content": "ready", "matcher": "CONTAINS_STRING" }
  ],
  "checkerType": "STATIC_IP_CHECKERS"
}
EOF
gcloud alpha monitoring uptime create \
  --display-name="NexRyde Backend Health" \
  --resource-type="uptime_url" \
  --hostname="nexryde-backend-993913300770.us-central1.run.app" \
  --path="/api/health/ready" \
  --check-interval=60 \
  --project="$PROJECT_ID" 2>/dev/null || echo "  (already exists or skipped)"

# ── 6. MongoDB connection failure alert ───────────────────────────────────────
echo "Creating DB connection failure alert..."
cat > /tmp/alert_db.json << EOF
{
  "displayName": "NexRyde — DB Unavailable (503 spike)",
  "combiner": "OR",
  "conditions": [
    {
      "displayName": "Cloud Run 503 responses > 3 in 2min",
      "conditionThreshold": {
        "filter": "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${SERVICE}\" AND metric.type=\"run.googleapis.com/request_count\" AND metric.labels.response_code=\"503\"",
        "aggregations": [
          {
            "alignmentPeriod": "120s",
            "perSeriesAligner": "ALIGN_SUM",
            "crossSeriesReducer": "REDUCE_SUM",
            "groupByFields": ["resource.label.service_name"]
          }
        ],
        "comparison": "COMPARISON_GT",
        "thresholdValue": 3,
        "duration": "0s",
        "trigger": { "count": 1 }
      }
    }
  ],
  "notificationChannels": ["${CHANNEL_ID}"],
  "severity": "CRITICAL"
}
EOF
gcloud alpha monitoring policies create \
  --policy-from-file=/tmp/alert_db.json \
  --project="$PROJECT_ID" 2>/dev/null || echo "  (already exists or skipped)"

echo ""
echo "✅ Monitoring setup complete!"
echo ""
echo "  View alerts: https://console.cloud.google.com/monitoring/alerting?project=${PROJECT_ID}"
echo "  View uptime: https://console.cloud.google.com/monitoring/uptime?project=${PROJECT_ID}"
echo ""
echo "  Next: Add ALERT_EMAIL env var to point alerts to your on-call address."

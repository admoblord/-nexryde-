#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# NexRyde — Cloud Monitoring alert policies setup (thin wrapper)
#
# Production is africa-south1. This wrapper delegates to setup_monitoring.py
# which is idempotent and refuses to point uptime at the retired us-central1 host.
#
# Run once after deploy (or from CI):
#   bash backend/scripts/setup_monitoring.sh
#
# Prerequisites:
#   gcloud auth application-default login   # or a WIF/service-account in CI
#   pip install google-auth google-auth-httplib2 requests
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

export PROJECT_ID="${PROJECT_ID:-nexryde-app}"
export REGION="${REGION:-africa-south1}"
export SERVICE="${SERVICE:-nexryde-backend}"
export BACKEND_HOST="${BACKEND_HOST:-nexryde-backend-993913300770.africa-south1.run.app}"
export ALERT_EMAIL="${ALERT_EMAIL:-admin@admoblordgroup.com}"
export UPTIME_PERIOD="${UPTIME_PERIOD:-300s}"
export UPTIME_TIMEOUT="${UPTIME_TIMEOUT:-20s}"

echo "🔔 NexRyde Cloud Monitoring → ${BACKEND_HOST} (${REGION})"
exec python3 "${ROOT}/backend/scripts/setup_monitoring.py"

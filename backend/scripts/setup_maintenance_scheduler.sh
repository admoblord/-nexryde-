#!/usr/bin/env bash
# Drive NEXRYDE timer work from Cloud Scheduler instead of an always-on instance.
#
# With minScale 0 there is no idle process, so the guardians, saga retries, the
# outbox drain and the post-trip safe-arrival escalation have nothing running
# them. This creates a scheduled POST to /api/ops/maintenance-tick, which runs
# exactly the tick the warm worker used to run.
#
# Cloud Scheduler bills per job per month (3 free), which is cents against the
# cost of keeping a 1-2 vCPU instance warm around the clock.
#
# Requires: gcloud auth, and NEXRYDE_OPS_KEY already in Secret Manager.
#
#   ./scripts/setup_maintenance_scheduler.sh
#   SCHEDULE="*/5 * * * *" ./scripts/setup_maintenance_scheduler.sh
#
# NOTE: Cloud Scheduler has no africa-south1 region. The job is created in
# SCHEDULER_LOCATION (default europe-west1) and still POSTs the africa-south1
# Cloud Run URL.
set -euo pipefail

PROJECT_ID="${GCP_PROJECT:-nexryde-app}"
REGION="${GCP_REGION:-africa-south1}"
# Scheduler control-plane location (NOT the Cloud Run region).
SCHEDULER_LOCATION="${SCHEDULER_LOCATION:-europe-west1}"
JOB="${JOB_NAME:-nexryde-maintenance-tick}"
# Every 2 minutes. Safe-arrival gives the rider 5 minutes to confirm and then
# escalates 90s later, so the tick must be well under that to stay meaningful.
SCHEDULE="${SCHEDULE:-*/2 * * * *}"
SERVICE="${CLOUD_RUN_SERVICE:-nexryde-backend}"

if ! command -v gcloud >/dev/null 2>&1; then
  echo "ERROR: gcloud not found." >&2
  exit 1
fi

echo "Resolving $SERVICE URL in $REGION ..."
BASE_URL="$(gcloud run services describe "$SERVICE" \
  --region "$REGION" --project "$PROJECT_ID" \
  --format='value(status.url)')"
if [[ -z "$BASE_URL" ]]; then
  echo "ERROR: could not resolve the Cloud Run URL for $SERVICE." >&2
  exit 1
fi
URI="${BASE_URL}/api/ops/maintenance-tick"

echo "Reading NEXRYDE_OPS_KEY from Secret Manager ..."
OPS_KEY="$(gcloud secrets versions access latest --secret=NEXRYDE_OPS_KEY --project "$PROJECT_ID")"
if [[ -z "$OPS_KEY" ]]; then
  echo "ERROR: NEXRYDE_OPS_KEY is empty — the endpoint would 404 on every tick." >&2
  exit 1
fi

gcloud services enable cloudscheduler.googleapis.com --project "$PROJECT_ID" --quiet

ACTION=create
if gcloud scheduler jobs describe "$JOB" \
     --location "$SCHEDULER_LOCATION" --project "$PROJECT_ID" &>/dev/null; then
  ACTION=update
fi
echo "[$ACTION] $JOB  schedule='$SCHEDULE'  scheduler_location=$SCHEDULER_LOCATION"
echo "         -> POST $URI"

# create uses --headers; update uses --update-headers. Never print OPS_KEY.
HEADER_FLAG="--headers"
if [[ "$ACTION" == "update" ]]; then
  HEADER_FLAG="--update-headers"
fi

# --format=none prevents gcloud from printing httpTarget.headers (which would
# leak NEXRYDE_OPS_KEY into CI logs / terminal scrollback).
gcloud scheduler jobs "$ACTION" http "$JOB" \
  --location "$SCHEDULER_LOCATION" \
  --project "$PROJECT_ID" \
  --schedule "$SCHEDULE" \
  --time-zone "Africa/Lagos" \
  --uri "$URI" \
  --http-method POST \
  "${HEADER_FLAG}=X-NEXRYDE-OPS-KEY=${OPS_KEY}" \
  --attempt-deadline 120s \
  --max-retry-attempts 1 \
  --quiet \
  --format=none

# Drop the key from this shell as soon as the job is written.
unset OPS_KEY

echo
echo "Done. Verify with a manual run:"
echo "  gcloud scheduler jobs run $JOB --location $SCHEDULER_LOCATION --project $PROJECT_ID"
echo "Then confirm the tick landed:"
echo "  curl -s $BASE_URL/api/realtime/health | grep -o 'guardian.safe_arrival.ok[^,]*'"

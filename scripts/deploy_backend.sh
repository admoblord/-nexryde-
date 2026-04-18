#!/usr/bin/env bash
# Deploy backend/ to Cloud Run only (no EAS / Android builds).
# Requires: gcloud auth, project (optional GCP_PROJECT), network.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if ! command -v gcloud >/dev/null 2>&1; then
  echo "ERROR: gcloud not found. Install Google Cloud SDK."
  exit 1
fi
REGION="${GCP_REGION:-us-central1}"
SERVICE="${CLOUD_RUN_SERVICE:-nexryde-backend}"
echo "Deploying $SERVICE to $REGION from $ROOT/backend ..."
if [[ -n "${GCP_PROJECT:-}" ]]; then
  gcloud --project="$GCP_PROJECT" run deploy "$SERVICE" \
  --source="$ROOT/backend" \
  --platform=managed \
  --region="$REGION" \
  --allow-unauthenticated \
  --memory=1Gi \
  --cpu=1 \
  --cpu-boost \
  --max-instances=10 \
  --min-instances=0 \
  --timeout=300 \
  --quiet
else
  gcloud run deploy "$SERVICE" \
  --source="$ROOT/backend" \
  --platform=managed \
  --region="$REGION" \
  --allow-unauthenticated \
  --memory=1Gi \
  --cpu=1 \
  --cpu-boost \
  --max-instances=10 \
  --min-instances=0 \
  --timeout=300 \
  --quiet
fi
echo "OK — Cloud Run revision deployed."

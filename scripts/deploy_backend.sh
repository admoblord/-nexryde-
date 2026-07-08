#!/usr/bin/env bash
# Deploy backend/ to Cloud Run (production defaults — warm instance, right-sized).
# Prefer declarative deploy: gcloud run services replace backend/cloudrun.service.yaml
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
GCLOUD=(gcloud)
if [[ -n "${GCP_PROJECT:-}" ]]; then
  GCLOUD+=(--project="$GCP_PROJECT")
fi
"${GCLOUD[@]}" run deploy "$SERVICE" \
  --source="$ROOT/backend" \
  --platform=managed \
  --region="$REGION" \
  --allow-unauthenticated \
  --memory=512Mi \
  --cpu=1 \
  --no-cpu-boost \
  --cpu-throttling \
  --max-instances=10 \
  --min-instances=1 \
  --timeout=300 \
  --quiet
echo "OK — Cloud Run revision deployed (1 vCPU, 512Mi, min-instances=1, CPU throttling on)."

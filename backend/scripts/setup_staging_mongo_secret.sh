#!/usr/bin/env bash
# One-time: point staging Cloud Run at a dedicated Atlas M0 cluster (never production).
#
# Usage:
#   export STAGING_MONGODB_URI='mongodb+srv://user:pass@cluster.mongodb.net/?appName=nexryde-staging'
#   ./backend/scripts/setup_staging_mongo_secret.sh
#
set -euo pipefail

PROJECT_ID="${GCP_PROJECT:-$(gcloud config get-value project 2>/dev/null)}"
REGION="${GCP_REGION:-us-central1}"

if [[ -z "${STAGING_MONGODB_URI:-}" ]]; then
  echo "ERROR: Set STAGING_MONGODB_URI to your Atlas M0 connection string." >&2
  exit 1
fi

if ! gcloud secrets describe MONGODB_URI_STAGING --project="$PROJECT_ID" &>/dev/null; then
  gcloud secrets create MONGODB_URI_STAGING --replication-policy=automatic --project="$PROJECT_ID"
fi

printf '%s' "$STAGING_MONGODB_URI" | gcloud secrets versions add MONGODB_URI_STAGING \
  --data-file=- --project="$PROJECT_ID"

SA=$(gcloud run services describe nexryde-backend-staging \
  --region "$REGION" --project="$PROJECT_ID" \
  --format='value(spec.template.spec.serviceAccountName)' 2>/dev/null || true)
if [[ -z "$SA" ]]; then
  PN=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
  SA="${PN}-compute@developer.gserviceaccount.com"
fi

gcloud secrets add-iam-policy-binding MONGODB_URI_STAGING \
  --project="$PROJECT_ID" \
  --member="serviceAccount:${SA}" \
  --role="roles/secretmanager.secretAccessor" \
  --quiet

echo "OK — MONGODB_URI_STAGING populated. Deploy staging:"
echo "  gcloud run services replace backend/cloudrun.staging.yaml --region $REGION"

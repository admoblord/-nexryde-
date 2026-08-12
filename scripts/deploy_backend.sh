#!/usr/bin/env bash
# Deploy backend/ to Cloud Run using the checked-in service definition.
# The YAML carries secret-backed env vars; imperative --source deploys can miss
# those secrets and create revisions that crash at startup.
# Requires: gcloud auth, project (optional GCP_PROJECT), network.
#
# Production deploys MUST run from a clean origin/main checkout.
# Africa prod: GCP_REGION=africa-south1 CLOUD_RUN_SERVICE_YAML=backend/cloudrun.africa-south1.yaml
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=require_main_for_prod_deploy.sh
source "$ROOT/scripts/require_main_for_prod_deploy.sh"
if ! command -v gcloud >/dev/null 2>&1; then
  echo "ERROR: gcloud not found. Install Google Cloud SDK."
  exit 1
fi
REGION="${GCP_REGION:-us-central1}"
SERVICE_YAML="${CLOUD_RUN_SERVICE_YAML:-$ROOT/backend/cloudrun.service.yaml}"
PROJECT_ID="${GCP_PROJECT:-$(gcloud config get-value project 2>/dev/null)}"
if [[ "$REGION" == "africa-south1" ]]; then
  IMAGE="africa-south1-docker.pkg.dev/$PROJECT_ID/nexryde-backend/nexryde-backend:latest"
  SERVICE_YAML="${CLOUD_RUN_SERVICE_YAML:-$ROOT/backend/cloudrun.africa-south1.yaml}"
else
  IMAGE="us-central1-docker.pkg.dev/$PROJECT_ID/nexryde-backend/nexryde-backend:latest"
fi
echo "Deploying production backend to $REGION from $ROOT/backend ..."
echo "Image: $IMAGE"
echo "Service file: $SERVICE_YAML"
GCLOUD=(gcloud)
if [[ -n "${GCP_PROJECT:-}" ]]; then
  GCLOUD+=(--project="$GCP_PROJECT")
fi
BUILD_LOG="$(mktemp -t nexryde-cloudbuild.XXXXXX)"
trap 'rm -f "$BUILD_LOG"' EXIT
"${GCLOUD[@]}" builds submit --tag "$IMAGE" "$ROOT/backend" --quiet 2>&1 | tee "$BUILD_LOG"
# `services replace` with a :latest tag often keeps the previous digest (no new revision).
# Always pin traffic to the digest we just pushed.
# Prefer digest from the push log (artifacts describe is flaky on older gcloud/Python).
DIGEST="$(
  grep -Eo 'digest: sha256:[0-9a-f]+' "$BUILD_LOG" | tail -1 | awk '{print $2}' || true
)"
if [[ -z "$DIGEST" ]]; then
  DIGEST="$("${GCLOUD[@]}" artifacts docker images describe "$IMAGE" --format='get(image_summary.digest)' 2>/dev/null | tr -d '[:space:]' | grep -E '^sha256:[0-9a-f]+$' || true)"
fi
if [[ -z "$DIGEST" ]]; then
  echo "ERROR: could not resolve digest for $IMAGE"
  exit 1
fi
PINNED_IMAGE="${IMAGE%:latest}@$DIGEST"
echo "Pinning Cloud Run to $PINNED_IMAGE"
"${GCLOUD[@]}" run services replace "$SERVICE_YAML" --region "$REGION" --quiet
"${GCLOUD[@]}" run services update nexryde-backend --region "$REGION" --image "$PINNED_IMAGE" --quiet
echo "OK — Cloud Run revision deployed from $SERVICE_YAML ($PINNED_IMAGE)."

#!/usr/bin/env bash
# Set only NEXRYDE_PUBLIC_VA_* on Cloud Run (no Squad keys required).
# Usage:
#   export NEXRYDE_PUBLIC_VA_BANK_NAME=GTCO
#   export NEXRYDE_PUBLIC_VA_ACCOUNT_NUMBER=9013030522
#   export NEXRYDE_PUBLIC_VA_ACCOUNT_NAME='Nexryde'
#   bash scripts/apply_company_va_cloud_run.sh

set -euo pipefail
SERVICE="${CLOUD_RUN_SERVICE:-nexryde-backend}"
REGION="${CLOUD_RUN_REGION:-us-central1}"
BN="${NEXRYDE_PUBLIC_VA_BANK_NAME:-GTCO}"
NUM="${NEXRYDE_PUBLIC_VA_ACCOUNT_NUMBER:?set NEXRYDE_PUBLIC_VA_ACCOUNT_NUMBER}"
AN="${NEXRYDE_PUBLIC_VA_ACCOUNT_NAME:-Nexryde}"
GCLOUD=(gcloud run services update "$SERVICE" --region "$REGION" --quiet)
[[ -z "${GCP_PROJECT:-}" ]] || GCLOUD+=(--project "$GCP_PROJECT")
"${GCLOUD[@]}" --update-env-vars "NEXRYDE_PUBLIC_VA_BANK_NAME=${BN},NEXRYDE_PUBLIC_VA_ACCOUNT_NUMBER=${NUM},NEXRYDE_PUBLIC_VA_ACCOUNT_NAME=${AN}"
echo "Updated company VA on $SERVICE"

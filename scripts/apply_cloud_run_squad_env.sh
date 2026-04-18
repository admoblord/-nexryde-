#!/usr/bin/env bash
# Apply Squad + public URL to Cloud Run (merge with existing env vars).
#
# Usage (run locally — do NOT commit keys):
#   export SQUAD_SECRET_KEY='sk_...'
#   export SQUAD_PUBLIC_KEY='pk_...'
#   export GCP_PROJECT='your-project-id'   # optional if gcloud default is set
#   bash scripts/apply_cloud_run_squad_env.sh
#
# Squad dashboard webhook (HTTPS):
#   https://nexryde-backend-993913300770.us-central1.run.app/api/squad/webhook
#
# Optional — show SquadCo business GTB VA on rider wallet (also set via Console):
#   export NEXRYDE_PUBLIC_VA_BANK_NAME=GTCO
#   export NEXRYDE_PUBLIC_VA_ACCOUNT_NUMBER=9013030522
#   export NEXRYDE_PUBLIC_VA_ACCOUNT_NAME='Nexryde'

set -euo pipefail

SERVICE="${CLOUD_RUN_SERVICE:-nexryde-backend}"
REGION="${CLOUD_RUN_REGION:-us-central1}"
PUBLIC_URL="${NEXRYDE_PUBLIC_BACKEND_URL:-https://nexryde-backend-993913300770.us-central1.run.app}"

if [[ -z "${SQUAD_SECRET_KEY:-}" || -z "${SQUAD_PUBLIC_KEY:-}" ]]; then
  echo "Error: export SQUAD_SECRET_KEY and SQUAD_PUBLIC_KEY first, then re-run."
  exit 1
fi

GCLOUD=(gcloud run services update "$SERVICE" --region "$REGION" --quiet)
if [[ -n "${GCP_PROJECT:-}" ]]; then
  GCLOUD+=(--project "$GCP_PROJECT")
fi

VA_SUFFIX=""
if [[ -n "${NEXRYDE_PUBLIC_VA_ACCOUNT_NUMBER:-}" ]]; then
  BN="${NEXRYDE_PUBLIC_VA_BANK_NAME:-GTCO}"
  AN="${NEXRYDE_PUBLIC_VA_ACCOUNT_NAME:-Nexryde}"
  VA_SUFFIX=",NEXRYDE_PUBLIC_VA_BANK_NAME=${BN},NEXRYDE_PUBLIC_VA_ACCOUNT_NUMBER=${NEXRYDE_PUBLIC_VA_ACCOUNT_NUMBER},NEXRYDE_PUBLIC_VA_ACCOUNT_NAME=${AN}"
fi

# Merge: keeps other env vars; sets Squad + callback base URL (+ optional company VA)
"${GCLOUD[@]}" --update-env-vars "\
NEXRYDE_PUBLIC_BACKEND_URL=${PUBLIC_URL},\
SQUAD_BASE_URL=${SQUAD_BASE_URL:-https://api-d.squadco.com},\
SQUAD_PUBLIC_KEY=${SQUAD_PUBLIC_KEY},\
SQUAD_SECRET_KEY=${SQUAD_SECRET_KEY}${VA_SUFFIX}"

echo "Updated $SERVICE ($REGION). Webhook URL for Squad:"
echo "  ${PUBLIC_URL}/api/squad/webhook"

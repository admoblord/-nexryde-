#!/usr/bin/env bash
# Store an Expo access token in Secret Manager so CI can run EAS builds.
#
# Create a token at: https://expo.dev/settings/access-tokens
# Then:
#   EXPO_TOKEN='xxxx' bash backend/scripts/store_expo_token.sh
# Or pipe it (nothing is echoed):
#   printf '%s' "$EXPO_TOKEN" | bash backend/scripts/store_expo_token.sh
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-nexryde-app}"
DEPLOY_SA="${DEPLOY_SA:-github-deployer@nexryde-app.iam.gserviceaccount.com}"

if [[ -n "${EXPO_TOKEN:-}" ]]; then
  TOKEN="$EXPO_TOKEN"
elif [[ ! -t 0 ]]; then
  TOKEN="$(cat)"
else
  echo "ERROR: set EXPO_TOKEN=... or pipe the token on stdin." >&2
  exit 1
fi

TOKEN="$(printf '%s' "$TOKEN" | tr -d '\r\n')"
if [[ ${#TOKEN} -lt 20 ]]; then
  echo "ERROR: token looks too short — refuse to store." >&2
  exit 1
fi

if ! gcloud secrets describe EXPO_TOKEN --project="$PROJECT_ID" &>/dev/null; then
  gcloud secrets create EXPO_TOKEN \
    --replication-policy=automatic \
    --project="$PROJECT_ID"
fi

printf '%s' "$TOKEN" | gcloud secrets versions add EXPO_TOKEN \
  --project="$PROJECT_ID" --data-file=-

gcloud secrets add-iam-policy-binding EXPO_TOKEN \
  --project="$PROJECT_ID" \
  --member="serviceAccount:${DEPLOY_SA}" \
  --role="roles/secretmanager.secretAccessor" \
  --quiet >/dev/null

unset TOKEN EXPO_TOKEN
echo "✅ EXPO_TOKEN stored in Secret Manager; ${DEPLOY_SA} can read it."
echo "   Next push to main will pick it up in the EAS CI job."

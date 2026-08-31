#!/usr/bin/env bash
# Delete the GCP resources NEXRYDE is billed for but no longer uses.
#
# Dry run by default — nothing is deleted until you pass --apply.
#
#   ./backend/scripts/cleanup_idle_cloud_spend.sh
#   ./backend/scripts/cleanup_idle_cloud_spend.sh --apply
#   ./backend/scripts/cleanup_idle_cloud_spend.sh --apply --drop-cloudrun
#   ./backend/scripts/cleanup_idle_cloud_spend.sh --apply --drop-cloudrun --drop-standby
#
# Default safe set:
#   * Managed Kafka cluster (bus is Redis streams)
#   * Stale Artifact Registry images
#
# --drop-cloudrun (API now on Emergent):
#   * All Cloud Run services in africa-south1 (nexryde-backend, grpc-ridepush,
#     kafka-worker, …)
#   * africa-south1 Serverless VPC connector (only existed for Memorystore + Atlas NAT)
#   * Memorystore Redis in africa-south1 (Emergent uses REDIS_REQUIRED=false or Upstash)
#
# --drop-standby:
#   * Cloud Run + VPC connector in us-central1
#
# After Cloud Run is gone, drop the NAT IP from Atlas:
#   ./backend/scripts/atlas_drop_cloudrun_nat.sh --apply
set -uo pipefail

PROJECT_ID="${GCP_PROJECT:-nexryde-app}"
PROD_REGION="${PROD_REGION:-africa-south1}"
OLD_REGION="${OLD_REGION:-us-central1}"
KAFKA_CLUSTER="${KAFKA_CLUSTER:-nexryde-kafka}"
VPC_CONNECTOR="${VPC_CONNECTOR:-nexryde-vpc}"
KEEP_IMAGES="${KEEP_IMAGES:-10}"

APPLY=false
DROP_STANDBY=false
DROP_CLOUDRUN=false
for arg in "$@"; do
  case "$arg" in
    --apply) APPLY=true ;;
    --drop-standby) DROP_STANDBY=true ;;
    --drop-cloudrun) DROP_CLOUDRUN=true ;;
    *) echo "Unknown flag: $arg" >&2; exit 2 ;;
  esac
done

command -v gcloud >/dev/null 2>&1 || { echo "ERROR: gcloud not found." >&2; exit 1; }

run() {
  if $APPLY; then
    echo "  RUN: $*"
    "$@" || echo "  (failed — continuing)"
  else
    echo "  WOULD RUN: $*"
  fi
}

hdr() { printf '\n\033[1m%s\033[0m\n' "$1"; }

$APPLY || echo "DRY RUN — nothing will be deleted. Re-run with --apply."

# ── Safety gate: never delete Kafka while something still points at it ───────
hdr "Checking whether any remaining Cloud Run API still uses Kafka"
BUS=""
URL="$(gcloud run services describe nexryde-backend --region "$PROD_REGION" \
        --project "$PROJECT_ID" --format='value(status.url)' 2>/dev/null || true)"
if [[ -n "$URL" ]]; then
  BUS="$(curl -sS -m 20 "$URL/api/realtime/health" 2>/dev/null \
          | sed -n 's/.*"event_bus"[[:space:]]*:[[:space:]]*"\([a-z]*\)".*/\1/p')"
fi
echo "  live event_bus = ${BUS:-unknown (service may already be gone)}"
KAFKA_SAFE=true
if [[ -n "$URL" && "$BUS" != "redis" && "$BUS" != "off" && -n "$BUS" ]]; then
  KAFKA_SAFE=false
  echo "  Refusing to touch Kafka: the running service still reports '${BUS}'."
fi

# ── 1. Managed Kafka ────────────────────────────────────────────────────────
hdr "1. Managed Kafka cluster"
CLUSTERS="$(gcloud managed-kafka clusters list --location "$PROD_REGION" \
             --project "$PROJECT_ID" --format='value(name)' 2>/dev/null || true)"
if [[ -z "$CLUSTERS" ]]; then
  echo "  none found in $PROD_REGION — nothing to delete"
elif ! $KAFKA_SAFE; then
  echo "  skipped (see safety check above)"
else
  echo "$CLUSTERS" | while read -r c; do
    [[ -z "$c" ]] && continue
    run gcloud managed-kafka clusters delete "$(basename "$c")" \
      --location "$PROD_REGION" --project "$PROJECT_ID" --quiet
  done
fi

# ── 2. Old Artifact Registry images ─────────────────────────────────────────
hdr "2. Artifact Registry images (keeping newest $KEEP_IMAGES per registry)"
for REG in \
  "${PROD_REGION}-docker.pkg.dev/${PROJECT_ID}/nexryde-backend/nexryde-backend" \
  "${OLD_REGION}-docker.pkg.dev/${PROJECT_ID}/nexryde-backend/nexryde-backend"; do
  STALE="$(gcloud artifacts docker images list "$REG" --sort-by=~CREATE_TIME \
            --format='value(version)' 2>/dev/null | tail -n "+$((KEEP_IMAGES + 1))" || true)"
  N="$(printf '%s' "$STALE" | grep -c . || true)"
  echo "  $REG: ${N:-0} stale image(s)"
  [[ -z "$STALE" ]] && continue
  echo "$STALE" | while read -r d; do
    [[ -z "$d" ]] && continue
    run gcloud artifacts docker images delete "${REG}@${d}" --delete-tags --quiet
  done
done

# ── 3. africa-south1 Cloud Run + VPC + Memorystore (opt-in) ─────────────────
hdr "3. africa-south1 Cloud Run / VPC / Memorystore"
if ! $DROP_CLOUDRUN; then
  echo "  skipped — pass --drop-cloudrun once Emergent serves /api/health and the app origin is flipped"
  gcloud run services list --region "$PROD_REGION" --project "$PROJECT_ID" \
    --format='value(metadata.name)' 2>/dev/null | sed 's/^/    would delete service: /' || true
else
  gcloud run services list --region "$PROD_REGION" --project "$PROJECT_ID" \
    --format='value(metadata.name)' 2>/dev/null | while read -r svc; do
      [[ -z "$svc" ]] && continue
      run gcloud run services delete "$svc" --region "$PROD_REGION" \
        --project "$PROJECT_ID" --quiet
    done
  gcloud redis instances list --region "$PROD_REGION" --project "$PROJECT_ID" \
    --format='value(name)' 2>/dev/null | while read -r inst; do
      [[ -z "$inst" ]] && continue
      run gcloud redis instances delete "$(basename "$inst")" \
        --region "$PROD_REGION" --project "$PROJECT_ID" --quiet
    done
  run gcloud compute networks vpc-access connectors delete "$VPC_CONNECTOR" \
    --region "$PROD_REGION" --project "$PROJECT_ID" --quiet
fi

# ── 4. us-central1 footprint (opt-in) ───────────────────────────────────────
hdr "4. us-central1 standby footprint"
if ! $DROP_STANDBY; then
  echo "  skipped — pass --drop-standby to remove it"
  gcloud run services list --region "$OLD_REGION" --project "$PROJECT_ID" \
    --format='value(metadata.name)' 2>/dev/null | sed 's/^/    would delete service: /' || true
else
  gcloud run services list --region "$OLD_REGION" --project "$PROJECT_ID" \
    --format='value(metadata.name)' 2>/dev/null | while read -r svc; do
      [[ -z "$svc" ]] && continue
      run gcloud run services delete "$svc" --region "$OLD_REGION" \
        --project "$PROJECT_ID" --quiet
    done
  run gcloud compute networks vpc-access connectors delete "$VPC_CONNECTOR" \
    --region "$OLD_REGION" --project "$PROJECT_ID" --quiet
fi

hdr "5. Atlas follow-up"
echo "  After Cloud Run is deleted, drop NAT 34.35.108.112 from Atlas:"
echo "    ./backend/scripts/atlas_drop_cloudrun_nat.sh --apply"

hdr "Done"
$APPLY || echo "That was a dry run. Re-run with --apply to delete."

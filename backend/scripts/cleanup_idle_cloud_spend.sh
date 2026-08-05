#!/usr/bin/env bash
# Delete the GCP resources NEXRYDE is billed for but no longer uses.
#
# Dry run by default — nothing is deleted until you pass --apply.
#
#   ./scripts/cleanup_idle_cloud_spend.sh                 # show what would go
#   ./scripts/cleanup_idle_cloud_spend.sh --apply          # delete the safe set
#   ./scripts/cleanup_idle_cloud_spend.sh --apply --drop-standby
#
# Safe set (no behaviour change, verified against the running service):
#   * Managed Kafka cluster      — the bus is on Redis streams; nothing reads it
#   * us-central1 Artifact Registry images — pre-Jul-24 region, never pruned
#
# --drop-standby additionally removes the whole us-central1 footprint:
#   * Cloud Run services in us-central1 (old production + staging)
#   * the us-central1 Serverless VPC connector
# That region is your rollback target. It has probably never been exercised
# (there is no develop branch, so staging never deployed), but deleting it means
# africa-south1 is your only production.
#
# NOT touched, deliberately:
#   * Memorystore Redis — 20 modules and the event bus depend on it. Migrate to a
#     serverless Redis first, then delete Memorystore and its VPC connector.
#   * The africa-south1 VPC connector — still required for Memorystore's private IP.
set -uo pipefail

PROJECT_ID="${GCP_PROJECT:-nexryde-app}"
PROD_REGION="${PROD_REGION:-africa-south1}"
OLD_REGION="${OLD_REGION:-us-central1}"
KAFKA_CLUSTER="${KAFKA_CLUSTER:-nexryde-kafka}"
VPC_CONNECTOR="${VPC_CONNECTOR:-nexryde-vpc}"
KEEP_IMAGES="${KEEP_IMAGES:-10}"

APPLY=false
DROP_STANDBY=false
for arg in "$@"; do
  case "$arg" in
    --apply) APPLY=true ;;
    --drop-standby) DROP_STANDBY=true ;;
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
hdr "Checking the live service is off Kafka"
BUS=""
URL="$(gcloud run services describe nexryde-backend --region "$PROD_REGION" \
        --project "$PROJECT_ID" --format='value(status.url)' 2>/dev/null || true)"
if [[ -n "$URL" ]]; then
  BUS="$(curl -sS -m 20 "$URL/api/realtime/health" 2>/dev/null \
          | sed -n 's/.*"event_bus"[[:space:]]*:[[:space:]]*"\([a-z]*\)".*/\1/p')"
fi
echo "  live event_bus = ${BUS:-unknown}"
KAFKA_SAFE=false
if [[ "$BUS" == "redis" || "$BUS" == "off" ]]; then
  KAFKA_SAFE=true
else
  echo "  Refusing to touch Kafka: the running service still reports '${BUS:-unknown}'."
  echo "  Deploy the Redis-bus change first, then re-run."
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

# ── 3. us-central1 footprint (opt-in) ───────────────────────────────────────
hdr "3. us-central1 standby footprint"
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
  # Connector last: deleting it while a service still uses it fails.
  run gcloud compute networks vpc-access connectors delete "$VPC_CONNECTOR" \
    --region "$OLD_REGION" --project "$PROJECT_ID" --quiet
fi

# ── 4. What is left, and why ────────────────────────────────────────────────
hdr "4. Still billing on purpose"
gcloud redis instances list --region "$PROD_REGION" --project "$PROJECT_ID" \
  --format='table(name,tier,memorySizeGb)' 2>/dev/null || echo "  (could not list Memorystore)"
cat <<'NOTE'
  Memorystore stays: presence, idempotency, rate limits, auth revocation and the
  event bus all depend on it, and with maxScale 10 in-process state would be ten
  disconnected copies. To remove this line, move REDIS_URL to a serverless Redis
  over TLS first — that also frees the africa-south1 VPC connector, which exists
  only to reach Memorystore's private IP.
  If the tier above says STANDARD_HA, switching to Basic roughly halves it.
NOTE

hdr "Done"
$APPLY || echo "That was a dry run. Re-run with --apply to delete."

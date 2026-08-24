#!/usr/bin/env bash
# Diagnose (and optionally fix) africa-south1 Cloud Run → Google Places egress.
#
# Cloud Run has no SSH. This script:
#   1. Calls GET /api/ops/places-google-probe (in-process Google HTTP from the
#      running revision — equivalent to curl -v -m 15 maps.googleapis.com).
#   2. Dumps VPC connector, Cloud NAT, and egress firewall config.
#   3. With --apply: expands NAT to ALL subnets (keeping existing NAT IPs so
#      Atlas 34.35.108.112 stay allowlisted) and adds an egress ALLOW tcp:443
#      if a deny is shadowing the implied allow.
#
# Does NOT change run.googleapis.com/vpc-access-egress (must stay all-traffic).
set -uo pipefail

PROJECT_ID="${GCP_PROJECT:-nexryde-app}"
REGION="${PROD_REGION:-africa-south1}"
SERVICE="${CLOUD_RUN_SERVICE:-nexryde-backend}"
CONNECTOR_NAME="${VPC_CONNECTOR:-nexryde-vpc}"
ATLAS_NAT_IP="${ATLAS_NAT_IP:-34.35.108.112}"
APPLY=false
for arg in "$@"; do
  case "$arg" in
    --apply) APPLY=true ;;
    *) echo "Unknown flag: $arg" >&2; exit 2 ;;
  esac
done

gcloud config set project "$PROJECT_ID" >/dev/null

hdr() { printf '\n========== %s ==========\n' "$1"; }
run_apply() {
  if $APPLY; then
    echo "APPLY: $*"
    "$@"
  else
    echo "WOULD APPLY: $*"
  fi
}

# ── 1. In-process Google call from the running revision ──────────────────────
hdr "1. Cloud Run revision + in-process Google probe (curl -m 15 equivalent)"

gcloud run services describe "$SERVICE" --region "$REGION" \
  --format='yaml(status.latestReadyRevisionName,status.url,spec.template.metadata.annotations)'

URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')"
REV="$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.latestReadyRevisionName)')"
echo "url=$URL"
echo "revision=$REV"
EGRESS="$(gcloud run services describe "$SERVICE" --region "$REGION" \
  --format='value(spec.template.metadata.annotations[run.googleapis.com/vpc-access-egress])')"
CONNECTOR="$(gcloud run services describe "$SERVICE" --region "$REGION" \
  --format='value(spec.template.metadata.annotations[run.googleapis.com/vpc-access-connector])')"
echo "vpc-access-egress=$EGRESS"
echo "vpc-access-connector=$CONNECTOR"
if [[ "$EGRESS" != "all-traffic" ]]; then
  echo "ERROR: vpc-egress is '$EGRESS' — refusing to change it. Must stay all-traffic for Atlas NAT."
  exit 1
fi

OPS_KEY="$(gcloud secrets versions access latest --secret=NEXRYDE_OPS_KEY 2>/dev/null || true)"
if [[ -z "$OPS_KEY" ]]; then
  echo "ERROR: could not read secret NEXRYDE_OPS_KEY — cannot probe Google from the instance."
  exit 1
fi

echo
echo "--- GET /api/ops/places-google-probe?input=Victoria  (key redacted by the handler) ---"
set +e
PROBE_OUT="$(curl -sS -m 20 -w '\nHTTP_CODE=%{http_code} TIME_TOTAL=%{time_total}\n' \
  -H "X-NEXRYDE-OPS-KEY: ${OPS_KEY}" \
  "${URL}/api/ops/places-google-probe?input=Victoria")"
PROBE_RC=$?
echo "$PROBE_OUT"
echo "curl_exit=$PROBE_RC"

# Which public address do we actually egress from? An IPv6 source would mean
# traffic left without traversing the connector, and therefore without Cloud
# NAT — the reason the Maps key could not be restricted by IP. One IPv4 source
# here is the evidence needed to restore that restriction.
echo
echo "--- GET /api/ops/egress-ip ---"
EGRESS_OUT="$(curl -sS -m 20 -w '\nHTTP_CODE=%{http_code} TIME_TOTAL=%{time_total}\n' \
  -H "X-NEXRYDE-OPS-KEY: ${OPS_KEY}" \
  "${URL}/api/ops/egress-ip")"
EGRESS_RC=$?
echo "$EGRESS_OUT"
echo "curl_exit=$EGRESS_RC"

# Never leak the ops key if it appeared (it should not).
unset OPS_KEY

# ── 2. VPC connector ─────────────────────────────────────────────────────────
hdr "2. Serverless VPC connector ${CONNECTOR_NAME} (${REGION})"
gcloud compute networks vpc-access connectors describe "$CONNECTOR_NAME" \
  --region "$REGION" --format=json

NETWORK="$(gcloud compute networks vpc-access connectors describe "$CONNECTOR_NAME" \
  --region "$REGION" --format='value(network)' 2>/dev/null || true)"
NETWORK="${NETWORK##*/}"
SUBNET="$(gcloud compute networks vpc-access connectors describe "$CONNECTOR_NAME" \
  --region "$REGION" --format='value(subnet.name)' 2>/dev/null || true)"
SUBNET="${SUBNET##*/}"
CIDR="$(gcloud compute networks vpc-access connectors describe "$CONNECTOR_NAME" \
  --region "$REGION" --format='value(ipCidrRange)' 2>/dev/null || true)"
echo "parsed network=${NETWORK:-?} subnet=${SUBNET:-none} ipCidrRange=${CIDR:-none}"

# ── 3. Cloud NAT ─────────────────────────────────────────────────────────────
hdr "3. Cloud NAT in ${REGION} (must cover the connector subnet / range)"
echo "--- routers ---"
ROUTERS_ERR="$(gcloud compute routers list --regions="$REGION" --format='table(name,region,network,bgp.asn)' 2>&1)"
echo "$ROUTERS_ERR"
IAM_BLOCKED=false
if grep -q "PERMISSION_DENIED\|Required 'compute.routers.list'" <<<"$ROUTERS_ERR"; then
  IAM_BLOCKED=true
  echo "IAM: compute.routers.list denied. Empty NAT list is NOT proof that NAT is missing."
fi
echo "--- addresses (looking for Atlas NAT ${ATLAS_NAT_IP}) ---"
gcloud compute addresses list --filter="region:($REGION)" \
  --format='table(name,address,status,purpose,users.list())'

echo "--- NAT gateways ---"
mapfile -t ROUTERS < <(gcloud compute routers list --regions="$REGION" --format='value(name)')
NAT_FOUND=false
NAT_COVERS=false
CHOSEN_ROUTER=""
CHOSEN_NAT=""
for router in "${ROUTERS[@]:-}"; do
  [[ -z "$router" ]] && continue
  echo "router=$router"
  mapfile -t NATS < <(gcloud compute routers nats list --router="$router" --region="$REGION" --format='value(name)' 2>/dev/null || true)
  for nat in "${NATS[@]:-}"; do
    [[ -z "$nat" ]] && continue
    NAT_FOUND=true
    echo "----- NAT $nat on $router -----"
    gcloud compute routers nats describe "$nat" --router="$router" --region="$REGION"
    MODE="$(gcloud compute routers nats describe "$nat" --router="$router" --region="$REGION" \
      --format='value(sourceSubnetworkIpRangesToNat)' 2>/dev/null || true)"
    IPS="$(gcloud compute routers nats describe "$nat" --router="$router" --region="$REGION" \
      --format='value(natIps)' 2>/dev/null || true)"
    echo "sourceSubnetworkIpRangesToNat=$MODE"
    echo "natIps=$IPS"
    if [[ "$MODE" == "ALL_SUBNETWORKS_ALL_IP_RANGES" || "$MODE" == "ALL_SUBNETWORKS_ALL_PRIMARY_IP_RANGES" ]]; then
      NAT_COVERS=true
      CHOSEN_ROUTER="$router"
      CHOSEN_NAT="$nat"
    else
      CHOSEN_ROUTER="${CHOSEN_ROUTER:-$router}"
      CHOSEN_NAT="${CHOSEN_NAT:-$nat}"
    fi
  done
done

if $IAM_BLOCKED; then
  echo "DIAGNOSIS: cannot read Cloud NAT (IAM compute.routers.list denied)."
  echo "The in-process Google probe above is the ground truth for 443 to googleapis.com."
elif ! $NAT_FOUND; then
  echo "DIAGNOSIS: NO Cloud NAT gateway in ${REGION}. With vpc-egress=all-traffic,"
  echo "public HTTPS (maps.googleapis.com:443) has nowhere to SNAT. Mongo/Atlas may"
  echo "still work if it is private-IP / peered; Google will SYN-hang."
fi
if $NAT_FOUND && ! $NAT_COVERS; then
  echo "DIAGNOSIS: NAT exists but is LIST_OF_SUBNETWORKS / custom ranges — the"
  echo "Serverless VPC connector range may not be included, so Google hangs."
fi
if $NAT_FOUND && $NAT_COVERS; then
  echo "NAT appears to cover all subnets. If Google still hangs, check firewall."
fi

# ── 4. Egress firewall ───────────────────────────────────────────────────────
hdr "4. VPC firewall EGRESS rules on network ${NETWORK:-unknown}"
if [[ -z "$NETWORK" ]]; then
  echo "Could not resolve connector network; listing all EGRESS rules."
  gcloud compute firewall-rules list --filter="direction=EGRESS" \
    --format='table(name,network,direction,priority,disabled,allowed[].map().firewall_rule().list(),denied[].map().firewall_rule().list(),destinationRanges.list(),sourceRanges.list())'
else
  gcloud compute firewall-rules list --filter="network=$NETWORK AND direction=EGRESS" \
    --format='table(name,direction,priority,disabled,allowed[].map().firewall_rule().list(),denied[].map().firewall_rule().list(),destinationRanges.list())'
  echo "--- full JSON (egress only) ---"
  gcloud compute firewall-rules list --filter="network=$NETWORK AND direction=EGRESS" --format=json
fi

DENY_EGRESS="$(gcloud compute firewall-rules list \
  --filter="network=${NETWORK} AND direction=EGRESS AND denied:* AND disabled=false" \
  --format='value(name,priority)' 2>/dev/null || true)"
if [[ -n "$DENY_EGRESS" ]]; then
  echo "DIAGNOSIS: explicit EGRESS DENY rules exist:"
  echo "$DENY_EGRESS"
  echo "Implied allow-egress is not enough if a lower-priority deny matches 443."
fi

# ── 5. Fix ───────────────────────────────────────────────────────────────────
hdr "5. Fix NAT/firewall (vpc-egress stays all-traffic)"

if $IAM_BLOCKED; then
  echo "Skipping NAT create/update: this SA cannot list routers. Grant compute.networkAdmin"
  echo "(or routers.list + nats.update + firewalls.create) on nexryde-app and re-run."
elif ! $NAT_FOUND; then
  # Reuse the Atlas NAT IP so Mongo keep working.
  ADDR_NAME="$(gcloud compute addresses list --filter="region:($REGION) AND address=${ATLAS_NAT_IP}" \
    --format='value(name)' 2>/dev/null || true)"
  ROUTER_NAME="${CHOSEN_ROUTER:-nexryde-router}"
  NAT_NAME="nexryde-nat"
  if [[ -z "$NETWORK" ]]; then
    echo "Cannot create NAT without connector network name."
  else
    if ! gcloud compute routers describe "$ROUTER_NAME" --region="$REGION" >/dev/null 2>&1; then
      run_apply gcloud compute routers create "$ROUTER_NAME" --network="$NETWORK" --region="$REGION"
    fi
    if [[ -n "$ADDR_NAME" ]]; then
      run_apply gcloud compute routers nats create "$NAT_NAME" \
        --router="$ROUTER_NAME" --region="$REGION" \
        --nat-external-ip-pool="$ADDR_NAME" \
        --nat-all-subnet-ip-ranges \
        --enable-logging
    else
      echo "WARNING: static address ${ATLAS_NAT_IP} not found. Creating NAT with AUTO IPs"
      echo "would CHANGE the Atlas allowlist — refusing automatic create without the known IP."
      echo "Create a Cloud NAT that SNATs onto ${ATLAS_NAT_IP} covering ALL subnets, then re-run."
    fi
  fi
elif ! $NAT_COVERS && [[ -n "$CHOSEN_NAT" && -n "$CHOSEN_ROUTER" ]]; then
  echo "Expanding NAT $CHOSEN_NAT on $CHOSEN_ROUTER to ALL subnets / all IP ranges."
  echo "Existing NAT IPs are kept (Atlas allowlist ${ATLAS_NAT_IP})."
  run_apply gcloud compute routers nats update "$CHOSEN_NAT" \
    --router="$CHOSEN_ROUTER" --region="$REGION" \
    --nat-all-subnet-ip-ranges
fi

if [[ -n "$NETWORK" ]]; then
  EXISTING_ALLOW="$(gcloud compute firewall-rules list \
    --filter="network=$NETWORK AND direction=EGRESS AND name=nexryde-allow-egress-https" \
    --format='value(name)' 2>/dev/null || true)"
  if [[ -z "$EXISTING_ALLOW" ]]; then
    echo "Ensuring explicit EGRESS ALLOW tcp:443 to 0.0.0.0/0 (priority 900) on $NETWORK."
    run_apply gcloud compute firewall-rules create nexryde-allow-egress-https \
      --network="$NETWORK" \
      --direction=EGRESS \
      --action=ALLOW \
      --rules=tcp:443 \
      --destination-ranges=0.0.0.0/0 \
      --priority=900 \
      --description="NEXRYDE: Cloud Run connector HTTPS to Google APIs (Places). Do not tighten without a replacement."
  else
    echo "Firewall rule nexryde-allow-egress-https already exists."
  fi
fi

if $APPLY; then
  hdr "6. Re-probe Google from the running revision after egress changes"
  OPS_KEY="$(gcloud secrets versions access latest --secret=NEXRYDE_OPS_KEY)"
  echo "--- GET /api/ops/places-google-probe?input=Victoria ---"
  curl -sS -m 20 -w '\nHTTP_CODE=%{http_code} TIME_TOTAL=%{time_total}\n' \
    -H "X-NEXRYDE-OPS-KEY: ${OPS_KEY}" \
    "${URL}/api/ops/places-google-probe?input=Victoria"
  unset OPS_KEY
fi

echo
echo "DONE. vpc-access-egress left as $EGRESS (must remain all-traffic)."

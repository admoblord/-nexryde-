#!/usr/bin/env bash
# Create / refresh Nexryde Bolt cloud map style + Android/iOS Map IDs.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT_NUM="${GCP_PROJECT_NUMBER:-993913300770}"
PROJECT_ID="${GCP_PROJECT:-nexryde-app}"
TOKEN="$(gcloud auth print-access-token)"
CLOUD_JSON="$ROOT/src/constants/mapStyles/boltRiderLight.cloud.json"

BODY="$(python3 - <<PY
import json
cloud = json.load(open("$CLOUD_JSON"))
cloud.pop("metadata", None)
print(json.dumps({
  "displayName": "Nexryde Bolt Rider Light",
  "description": "Desaturated pale landscape, white roads, minimal POI - route is highest contrast",
  "jsonStyleSheet": json.dumps(cloud, indent=2),
}))
PY
)"

STYLE="$(curl -sS -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Goog-User-Project: $PROJECT_NUM" \
  -H "Content-Type: application/json" \
  "https://mapmanagement.googleapis.com/v2beta/projects/${PROJECT_NUM}/styleConfigs" \
  -d "$BODY")"
STYLE_ID="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["styleId"])' "$STYLE")"
echo "STYLE_ID=$STYLE_ID"

create_map() {
  local plat="$1"
  local resp map_id
  resp="$(curl -sS -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -H "X-Goog-User-Project: $PROJECT_NUM" \
    -H "Content-Type: application/json" \
    "https://mapmanagement.googleapis.com/v2beta/projects/${PROJECT_NUM}/mapConfigs" \
    -d "{\"displayName\":\"Nexryde Bolt Rider ${plat}\",\"description\":\"Bolt desaturated rider booking map (${plat})\",\"mapType\":\"VECTOR\"}")"
  map_id="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["mapId"])' "$resp")"
  curl -sS -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -H "X-Goog-User-Project: $PROJECT_NUM" \
    -H "Content-Type: application/json" \
    "https://mapmanagement.googleapis.com/v2beta/projects/${PROJECT_NUM}/mapConfigs/${map_id}/mapContextConfigs" \
    -d "{\"mapConfig\":\"projects/${PROJECT_NUM}/mapConfigs/${map_id}\",\"styleConfig\":\"projects/${PROJECT_NUM}/styleConfigs/${STYLE_ID}\",\"mapVariants\":[\"ROADMAP\"],\"alias\":\"bolt-rider-light\"}" \
    >/dev/null
  echo "${plat}_MAP_ID=$map_id"
}

create_map Android
create_map iOS
echo "Done. Store Map IDs in EXPO_PUBLIC_GOOGLE_MAP_ID_ANDROID / _IOS."

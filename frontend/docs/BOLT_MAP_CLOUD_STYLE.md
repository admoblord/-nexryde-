# Bolt-style rider map (Google Cloud Map IDs)

Cloud Map IDs are **on**. The live IDs are `RASTER` so Maps SDK for Android
and iOS draw tiles. The older `VECTOR` IDs only work in the Maps JavaScript
API — handing them to a native `MapView` produced a blank canvas in
1.3.38/1.3.39.

Set `EXPO_PUBLIC_GOOGLE_MAP_ID_ENABLED=false` to force the JSON stylesheet
in `boltRiderLight.json` (same visual design, no cloud Map ID).

## Live resources (project `nexryde-app`)

Created via Map Management API (`admoblordgroup@gmail.com`):

| Resource | ID | Type |
| --- | --- | --- |
| StyleConfig | `e8c03fd7c78c554bdeb325a0` (`Nexryde Bolt Rider Light`) | — |
| **Map ID — Android (main)** | `8c2cb1bb7947cd4399ec19b0` | RASTER |
| Map ID — iOS | `8c2cb1bb7947cd4382430923` | RASTER |

Retired (do not use on mobile):

| Resource | ID | Type |
| --- | --- | --- |
| Map ID — Android (webGL) | `8c2cb1bb7947cd439e2af444` | VECTOR |
| Map ID — iOS (webGL) | `8c2cb1bb7947cd43c98f73a8` | VECTOR |

`getGoogleMapIdForPlatform()` remaps those retired IDs to the raster pair
if a stale EAS secret still holds them.

Console: https://console.cloud.google.com/google/maps-apis/studio/maps?project=nexryde-app

Style sheet source: `frontend/src/constants/mapStyles/boltRiderLight.cloud.json`  
Legacy JSON fallback (no Map ID): `frontend/src/constants/mapStyles/boltRiderLight.json`

## Env / secrets

Set in EAS + Secret Manager:

```bash
EXPO_PUBLIC_GOOGLE_MAP_ID_ENABLED=true
EXPO_PUBLIC_GOOGLE_MAP_ID_ANDROID=8c2cb1bb7947cd4399ec19b0
EXPO_PUBLIC_GOOGLE_MAP_ID_IOS=8c2cb1bb7947cd4382430923
# shared fallback (Android / main):
EXPO_PUBLIC_GOOGLE_MAP_ID=8c2cb1bb7947cd4399ec19b0
```

`app.config.js` exposes these via `extra`. Runtime reads them through
`getGoogleMapIdForPlatform()` / `getBoltRiderGoogleMapId()` and passes
`googleMapId` on `react-native-maps` `MapView`.

When Map IDs are disabled, the app falls back to the legacy JSON style array.

## Recreate / update

Always create Map IDs as `RASTER` for mobile. `VECTOR` is webGL-only.

```bash
# Style (cloud JSON schema — not legacy Styled Maps JSON)
curl -X POST \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "X-Goog-User-Project: 993913300770" \
  -H "Content-Type: application/json" \
  "https://mapmanagement.googleapis.com/v2beta/projects/993913300770/styleConfigs" \
  -d @- <<EOF
{"displayName":"Nexryde Bolt Rider Light","jsonStyleSheet":$(python3 -c 'import json; print(json.dumps(json.dumps(json.load(open("frontend/src/constants/mapStyles/boltRiderLight.cloud.json")))))')}
EOF

# MapConfig + MapContextConfig association requires mapConfig + styleConfig in body.
```

Or run `frontend/scripts/create_bolt_cloud_map_style.sh`.

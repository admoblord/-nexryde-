# Bolt-style rider map (Google Cloud Map IDs)

> **Cloud Map IDs are disabled.** The IDs below were created with `mapType: VECTOR`,
> which only the Maps JavaScript API renders. Handing a vector Map ID to the Android
> or iOS SDK produces a blank map — no tiles, no route, no markers — which is what
> shipped in 1.3.38/1.3.39 until the app was moved back to the JSON stylesheet.
>
> The app now ships the JSON Bolt style and ignores these Map IDs unless
> `EXPO_PUBLIC_GOOGLE_MAP_ID_ENABLED=true`. Before turning that on: recreate the
> Map IDs as `RASTER` for the mobile platforms, then confirm tiles render on a real
> device. The JSON style in `boltRiderLight.json` is the same visual design, so there
> is no user-facing reason to re-enable this until it is verified.

## Live resources (project `nexryde-app`)

Created via Map Management API (`admoblordgroup@gmail.com`):

| Resource | ID |
| --- | --- |
| StyleConfig | `e8c03fd7c78c554bdeb325a0` (`Nexryde Bolt Rider Light`) |
| Map ID — Android | `8c2cb1bb7947cd439e2af444` |
| Map ID — iOS | `8c2cb1bb7947cd43c98f73a8` |

Console: https://console.cloud.google.com/google/maps-apis/studio/maps?project=nexryde-app

Style sheet source: `frontend/src/constants/mapStyles/boltRiderLight.cloud.json`  
Legacy JSON fallback (no Map ID): `frontend/src/constants/mapStyles/boltRiderLight.json`

## Env / secrets

Set in EAS + Secret Manager (already wired):

```bash
EXPO_PUBLIC_GOOGLE_MAP_ID_ANDROID=8c2cb1bb7947cd439e2af444
EXPO_PUBLIC_GOOGLE_MAP_ID_IOS=8c2cb1bb7947cd43c98f73a8
# shared fallback:
EXPO_PUBLIC_GOOGLE_MAP_ID=8c2cb1bb7947cd439e2af444
```

`app.config.js` exposes these via `extra`. Runtime reads them through
`getGoogleMapIdForPlatform()` / `getBoltRiderGoogleMapId()` and passes
`googleMapId` on `react-native-maps` `MapView`.

When Map IDs are empty, the app falls back to the legacy JSON style array.

## Recreate / update

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

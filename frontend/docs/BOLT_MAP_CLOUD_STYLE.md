# Bolt-style rider map (Google Cloud Map IDs)

Prefer cloud Map Styles over JSON `customMapStyle` (legacy).

## Create the style

1. Google Cloud Console → **Google Maps Platform** → **Map Management**
2. Create a new map style. Base: **Light**
3. Tune layers:
   - Landscape / natural / parks → pale green fill (`#DCEBD4` range)
   - Landscape / man-made → `#F5F5F5`
   - Road / all → white fill, hairline grey stroke
   - Road / highway → white, slightly wider
   - Water → `#D6E4F0`
   - POI labels → OFF except major landmarks
   - Transit → OFF
   - Business POI icons → OFF
   - Label text → muted grey, reduced density
4. Create **separate Map IDs** for Android and iOS and associate this style.

## Wire into the app

Set EAS secrets / env (never hardcode):

```bash
EXPO_PUBLIC_GOOGLE_MAP_ID_ANDROID=...
EXPO_PUBLIC_GOOGLE_MAP_ID_IOS=...
# or shared:
EXPO_PUBLIC_GOOGLE_MAP_ID=...
```

`app.config.js` exposes these via `extra`. Runtime reads them through
`getGoogleMapIdForPlatform()` / `getBoltRiderGoogleMapId()` and passes
`googleMapId` on `react-native-maps` `MapView`.

When Map IDs are empty, the app falls back to
`frontend/src/constants/mapStyles/boltRiderLight.json`.

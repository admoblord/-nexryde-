const fs = require('fs');
const path = require('path');

const widgetConfig = {
  fonts: [],
  widgets: [
    {
      name: 'DriverStatus',
      label: 'NEXRYDE Driver Status',
      minWidth: '180dp',
      minHeight: '110dp',
      targetCellWidth: 3,
      targetCellHeight: 2,
      description: 'Go online instantly from your home screen',
      updatePeriodMillis: 1800000,
    },
  ],
};

function requireBuildSecret(name, value) {
  if (value) return value;
  const isEasBuild = process.env.EAS_BUILD === 'true';
  const profile = process.env.EAS_BUILD_PROFILE || '';
  if (isEasBuild && profile !== 'simulator') {
    throw new Error(`${name} must be provided as an EAS secret for ${profile || 'this'} build`);
  }
  return '';
}

const GOOGLE_MAPS_ANDROID_KEY =
  requireBuildSecret(
    'EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY',
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY ||
      (process.env.EAS_BUILD === 'true' ? '' : process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY)
  );
const GOOGLE_MAPS_IOS_KEY =
  requireBuildSecret(
    'EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY',
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY ||
      process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
  );
const BACKEND_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  "https://nexryde-backend-993913300770.africa-south1.run.app";

const PRIVACY_POLICY_URL = `${BACKEND_URL}/privacy-policy`;

// Frontend Sentry DSN — injected at build time from EAS env (EXPO_PUBLIC_SENTRY_DSN).
// When empty, the app leaves Sentry uninitialized (safe no-op) at runtime.
const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN || "";
const MAP_TILE_URL_TEMPLATE = process.env.EXPO_PUBLIC_MAP_TILE_URL_TEMPLATE || "";
const MAP_TILE_PROVIDER_NAME = process.env.EXPO_PUBLIC_MAP_TILE_PROVIDER_NAME || "Backup map";

// FCM (Android push) requires google-services.json at build time. We only set
// android.googleServicesFile when the file is actually available (committed at
// the project root, or provided via an EAS file env var GOOGLE_SERVICES_FILE) —
// referencing a missing path would FAIL the EAS prebuild. Until the file is
// provided, Android push tokens cannot be obtained and push will not deliver.
function resolveGoogleServicesFile() {
  const fromEnv = process.env.GOOGLE_SERVICES_FILE;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  const local = path.join(__dirname, 'google-services.json');
  if (fs.existsSync(local)) return './google-services.json';
  return undefined;
}
const GOOGLE_SERVICES_FILE = resolveGoogleServicesFile();

module.exports = ({ config }) => ({
  ...config,
  plugins: [
    ...(config.plugins || []),
    ['react-native-android-widget', widgetConfig],
    '@sentry/react-native',
    '@maplibre/maplibre-react-native',
  ],
  extra: {
    ...config.extra,
    BACKEND_URL,
    privacyPolicyUrl: PRIVACY_POLICY_URL,
    sentryDsn: SENTRY_DSN,
    EXPO_PUBLIC_GOOGLE_NAVIGATION_ENABLED:
      process.env.EXPO_PUBLIC_GOOGLE_NAVIGATION_ENABLED ?? 'true',
    EXPO_PUBLIC_MAPLIBRE_ENABLED: process.env.EXPO_PUBLIC_MAPLIBRE_ENABLED ?? 'true',
    EXPO_PUBLIC_MAPLIBRE_STYLE_URL: process.env.EXPO_PUBLIC_MAPLIBRE_STYLE_URL || '',
    EXPO_PUBLIC_MAPBOX_STYLE_URL: process.env.EXPO_PUBLIC_MAPBOX_STYLE_URL || '',
    EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN: process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN || '',
    /**
     * Used by JS (fetch) for Directions REST on the booking map. Native MapView still uses
     * android.config.googleMaps.apiKey / iOS GMSApiKey. Prefer EXPO_PUBLIC_GOOGLE_MAPS_API_KEY in EAS
     * if you use a separate web/Directions key; else this falls back to the Android key.
     */
    googleMapsDirectionsKey:
      process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || GOOGLE_MAPS_ANDROID_KEY,
    /**
     * Google Cloud Console Map IDs (Map Management → Map styles → Light Bolt look).
     * Prefer platform-specific IDs; shared EXPO_PUBLIC_GOOGLE_MAP_ID works for both.
     * When empty, the app falls back to JSON customMapStyle (boltRiderLight).
     */
    googleMapId: process.env.EXPO_PUBLIC_GOOGLE_MAP_ID || '',
    googleMapIdAndroid:
      process.env.EXPO_PUBLIC_GOOGLE_MAP_ID_ANDROID ||
      process.env.EXPO_PUBLIC_GOOGLE_MAP_ID ||
      '',
    googleMapIdIos:
      process.env.EXPO_PUBLIC_GOOGLE_MAP_ID_IOS ||
      process.env.EXPO_PUBLIC_GOOGLE_MAP_ID ||
      '',
    EXPO_PUBLIC_GOOGLE_MAP_ID: process.env.EXPO_PUBLIC_GOOGLE_MAP_ID || '',
    EXPO_PUBLIC_GOOGLE_MAP_ID_ANDROID:
      process.env.EXPO_PUBLIC_GOOGLE_MAP_ID_ANDROID || '',
    EXPO_PUBLIC_GOOGLE_MAP_ID_IOS: process.env.EXPO_PUBLIC_GOOGLE_MAP_ID_IOS || '',
    // Optional paid tile provider fallback only. Public OpenStreetMap tile servers
    // are intentionally not used by NEXRYDE production clients.
    mapTileUrlTemplate: MAP_TILE_URL_TEMPLATE,
    mapTileProviderName: MAP_TILE_PROVIDER_NAME,
  },
  ios: {
    ...config.ios,
    config: {
      ...(config.ios?.config || {}),
      googleMapsApiKey: GOOGLE_MAPS_IOS_KEY,
    },
    infoPlist: {
      ...(config.ios?.infoPlist || {}),
      GMSApiKey: GOOGLE_MAPS_IOS_KEY,
      // Lets Linking.canOpenURL('tel:...') work reliably; openURL still dials without this.
      LSApplicationQueriesSchemes: Array.from(
        new Set([
          ...((config.ios?.infoPlist?.LSApplicationQueriesSchemes) || []),
          'tel',
          'telprompt',
        ])
      ),
    },
  },
  android: {
    ...config.android,
    // Only attach when the file exists — avoids "google-services.json is missing"
    // prebuild failures while the credential is not yet provided.
    ...(GOOGLE_SERVICES_FILE ? { googleServicesFile: GOOGLE_SERVICES_FILE } : {}),
    config: {
      ...(config.android?.config || {}),
      googleMaps: {
        ...(config.android?.config?.googleMaps || {}),
        apiKey: GOOGLE_MAPS_ANDROID_KEY,
      },
    },
  },
});

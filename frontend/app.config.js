const fs = require('fs');
const path = require('path');

const widgetConfig = {
  fonts: [],
  widgets: [
    {
      name: 'DriverStatus',
      label: 'Nexryde Driver Status',
      minWidth: '180dp',
      minHeight: '110dp',
      targetCellWidth: 3,
      targetCellHeight: 2,
      description: 'Go online instantly from your home screen',
      updatePeriodMillis: 1800000,
    },
  ],
};

// Native Android Maps SDK key — falls back across EAS Secret names, then hardcoded key.
// The hardcoded fallback ensures expo prebuild (run by prebuildCommand on EAS) always
// injects the correct key into AndroidManifest.xml even when env vars are not set.
const MAPS_KEY_FALLBACK = "AIzaSyBmD2u8Nq-guiT3PJKYxdzr5bl-lL6nbsY";
const GOOGLE_MAPS_ANDROID_KEY =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY ||
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  MAPS_KEY_FALLBACK;
const GOOGLE_MAPS_IOS_KEY =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY ||
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  MAPS_KEY_FALLBACK;
const BACKEND_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  "https://nexryde-backend-993913300770.us-central1.run.app";

const PRIVACY_POLICY_URL = `${BACKEND_URL}/privacy-policy`;

// Frontend Sentry DSN — injected at build time from EAS env (EXPO_PUBLIC_SENTRY_DSN).
// When empty, the app leaves Sentry uninitialized (safe no-op) at runtime.
const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN || "";

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
  ],
  extra: {
    ...config.extra,
    BACKEND_URL,
    privacyPolicyUrl: PRIVACY_POLICY_URL,
    sentryDsn: SENTRY_DSN,
    /**
     * Used by JS (fetch) for Directions REST on the booking map. Native MapView still uses
     * android.config.googleMaps.apiKey / iOS GMSApiKey. Prefer EXPO_PUBLIC_GOOGLE_MAPS_API_KEY in EAS
     * if you use a separate web/Directions key; else this falls back to the Android key.
     */
    googleMapsDirectionsKey:
      process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || GOOGLE_MAPS_ANDROID_KEY,
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

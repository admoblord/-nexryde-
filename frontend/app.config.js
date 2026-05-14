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

/** Android Maps SDK only — restrict in GCP to Android app + SHA-1. */
const DEFAULT_GOOGLE_MAPS_ANDROID_KEY =
  "GOOGLE_MAPS_KEY_REDACTED";
/** iOS Maps SDK only — restrict in GCP to iOS bundle com.nexryde.app. */
const DEFAULT_GOOGLE_MAPS_IOS_KEY =
  "AIzaSyCg8_VB5ikbOzQHTJ1wVg1zGMdjTwCBSYs";
const GOOGLE_MAPS_ANDROID_KEY =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY ||
  DEFAULT_GOOGLE_MAPS_ANDROID_KEY;
const GOOGLE_MAPS_IOS_KEY =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY || DEFAULT_GOOGLE_MAPS_IOS_KEY;
const BACKEND_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  "https://nexryde-backend-993913300770.us-central1.run.app";

const PRIVACY_POLICY_URL = `${BACKEND_URL}/privacy-policy`;

module.exports = ({ config }) => ({
  ...config,
  plugins: [
    ...(config.plugins || []),
    ['react-native-android-widget', widgetConfig],
  ],
  extra: {
    ...config.extra,
    BACKEND_URL,
    privacyPolicyUrl: PRIVACY_POLICY_URL,
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
    config: {
      ...(config.android?.config || {}),
      googleMaps: {
        ...(config.android?.config?.googleMaps || {}),
        apiKey: GOOGLE_MAPS_ANDROID_KEY,
      },
    },
  },
});

const IS_DEV = process.env.APP_VARIANT === "development";

const GOOGLE_MAPS_API_KEY =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || "";
const BACKEND_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  "https://nexryde-backend-993913300770.us-central1.run.app";

const PRIVACY_POLICY_URL = `${BACKEND_URL}/privacy-policy`;

module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    BACKEND_URL,
    privacyPolicyUrl: PRIVACY_POLICY_URL,
  },
  ios: {
    ...config.ios,
    config: {
      ...(config.ios?.config || {}),
      googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    },
    infoPlist: {
      ...(config.ios?.infoPlist || {}),
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
        apiKey: GOOGLE_MAPS_API_KEY,
      },
    },
  },
});

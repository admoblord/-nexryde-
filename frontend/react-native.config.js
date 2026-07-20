/**
 * Native dependency platform overrides.
 *
 * iOS cannot autolink Google Navigation SDK alongside react-native-maps 1.20.1:
 * - @googlemaps/react-native-navigation-sdk → GoogleNavigation 10.13.0 → GoogleMaps 10.13.0
 * - react-native-maps (Google) → GoogleMaps 8.4.0
 * CocoaPods cannot resolve both. Android already excludes play-services-maps for Nav SDK.
 * Driver turn-by-turn on iOS falls back to external Maps until maps pins align.
 */
module.exports = {
  dependencies: {
    '@googlemaps/react-native-navigation-sdk': {
      platforms: {
        ios: null,
      },
    },
  },
};

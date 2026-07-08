import 'expo-router/entry';
import { Platform } from 'react-native';

// Android-only: register home-screen widget task handler.
// The react-native-android-widget package is a no-op shim on other platforms,
// but we guard here to be completely safe with iOS linker / bridge.
if (Platform.OS === 'android') {
  try {
    // Dynamic require so Metro never tries to resolve native Android code on iOS.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { registerWidgetTaskHandler } = require('react-native-android-widget') as typeof import('react-native-android-widget');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { widgetTaskHandler } = require('./src/widgets/widgetTaskHandler') as typeof import('./src/widgets/widgetTaskHandler');
    registerWidgetTaskHandler(widgetTaskHandler);
  } catch (err) {
    console.warn('[startup] Android widget handler registration failed:', err);
  }
}

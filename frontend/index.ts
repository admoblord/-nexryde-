import 'expo-router/entry';
import { registerWidgetTaskHandler } from 'react-native-android-widget';
import { widgetTaskHandler } from './src/widgets/widgetTaskHandler';

// Register the Android home-screen widget task handler.
// This runs when Android fires a widget lifecycle event (add / update / click / delete).
// It is a no-op on iOS and in Expo Go.
registerWidgetTaskHandler(widgetTaskHandler);

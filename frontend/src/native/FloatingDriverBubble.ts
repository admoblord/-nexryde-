/**
 * JS bridge for the Android floating driver bubble (system-overlay window).
 *
 * On non-Android platforms every method is a safe no-op so the same
 * hook code can run on iOS/web without crashing.
 */
import { NativeModules, Platform } from 'react-native';

export type BubbleStatus = 'online' | 'offline' | 'on_trip' | 'arrived';

interface FloatingDriverBubbleNative {
  show(status: BubbleStatus, tripInfo: string | null): void;
  update(status: BubbleStatus, tripInfo: string | null): void;
  hide(): void;
  isRunning(): Promise<boolean>;
  hasPermission(): Promise<boolean>;
  requestPermission(): void;
}

// Graceful no-op shim for non-Android
const noop = () => {};
const stub: FloatingDriverBubbleNative = {
  show: noop,
  update: noop,
  hide: noop,
  isRunning: () => Promise.resolve(false),
  hasPermission: () => Promise.resolve(false),
  requestPermission: noop,
};

const native: FloatingDriverBubbleNative =
  Platform.OS === 'android' && NativeModules.FloatingDriverBubble
    ? (NativeModules.FloatingDriverBubble as FloatingDriverBubbleNative)
    : stub;

export default native;

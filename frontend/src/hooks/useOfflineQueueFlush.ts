/**
 * Automatically flushes the offline action queue whenever the device
 * transitions from offline → online.  Mount once at the root layout.
 */
import { useEffect, useRef } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { AppState, AppStateStatus } from 'react-native';
import { flushOfflineQueue } from '@/src/utils/offlineQueue';

export function useOfflineQueueFlush() {
  const lastOnline = useRef(true);

  useEffect(() => {
    // Flush on network restore
    const unsubNet = NetInfo.addEventListener((state) => {
      const isOnline = Boolean(state.isConnected && state.isInternetReachable !== false);
      if (isOnline && !lastOnline.current) {
        // Came back online — replay queued actions
        void flushOfflineQueue().catch(() => {});
      }
      lastOnline.current = isOnline;
    });

    // Flush on foreground resume (covers airplane mode toggle)
    const handleAppState = (next: AppStateStatus) => {
      if (next === 'active') {
        void flushOfflineQueue().catch(() => {});
      }
    };
    const subApp = AppState.addEventListener('change', handleAppState);

    return () => {
      unsubNet();
      subApp.remove();
    };
  }, []);
}

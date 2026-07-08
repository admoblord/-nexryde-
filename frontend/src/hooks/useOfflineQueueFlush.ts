/**
 * Automatically flushes the offline action queue whenever the device
 * transitions from offline → online.  Mount once at the root layout.
 */
import { useEffect, useRef } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { AppState, AppStateStatus } from 'react-native';
import { syncQueuedRequests } from '@/src/services/offlineMode';

export function useOfflineQueueFlush() {
  const lastOnline = useRef(true);

  useEffect(() => {
    const unsubNet = NetInfo.addEventListener((state) => {
      const isOnline = Boolean(state.isConnected && state.isInternetReachable !== false);
      if (isOnline && !lastOnline.current) {
        void syncQueuedRequests().catch(() => {});
      }
      lastOnline.current = isOnline;
    });

    const handleAppState = (next: AppStateStatus) => {
      if (next === 'active') {
        void syncQueuedRequests().catch(() => {});
      }
    };
    const subApp = AppState.addEventListener('change', handleAppState);

    return () => {
      unsubNet();
      subApp.remove();
    };
  }, []);
}

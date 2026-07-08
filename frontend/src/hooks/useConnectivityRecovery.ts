/**
 * On foreground / network restore: flush offline queue and nudge open sockets.
 * Mount once in root layout.
 */
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { syncQueuedRequests } from '@/src/services/offlineMode';
import { riderTripSocket } from '@/src/services/riderTripSocket';
import { driverOffersSocket } from '@/src/services/driverOffersSocket';
import { chatSocket } from '@/src/services/chatSocket';
import {
  startPlatformConnectionManager,
  subscribePlatformConnection,
} from '@/src/services/platformConnectionManager';

export function useConnectivityRecovery(): void {
  useEffect(() => {
    startPlatformConnectionManager();
    let lastRecoverable = true;

    const recover = () => {
      void syncQueuedRequests().catch(() => {});
      riderTripSocket.nudgeReconnect();
      driverOffersSocket.nudgeReconnect();
      chatSocket.nudgeReconnect();
    };

    const appSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') recover();
    });

    const connectionSub = subscribePlatformConnection((state) => {
      const recoverable = state.state !== 'OFFLINE';
      if (recoverable && !lastRecoverable) recover();
      lastRecoverable = recoverable;
    });

    return () => {
      appSub.remove();
      connectionSub();
    };
  }, []);
}

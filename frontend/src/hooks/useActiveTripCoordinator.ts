import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useAppStore } from '@/src/store/appStore';
import { useAuthedApiReady } from '@/src/hooks/useAuthedApiReady';
import { useAuthedUserId } from '@/src/hooks/useAuthedUserId';
import { pullAndApplyActiveTrip, shouldClearTripAfterInactiveApi } from '@/src/services/activeTripSync';
import { isActiveTripStatus } from '@/src/utils/tripStatus';
import {
  driverTripCoordinatorPollMs,
  isDriverHighPriorityPolling,
} from '@/src/constants/driverPollingProfiles';

export default function useActiveTripCoordinator() {
  const setCurrentTrip = useAppStore((s) => s.setCurrentTrip);
  const currentTrip = useAppStore((s) => s.currentTrip);
  const isOnline = useAppStore((s) => s.isOnline);
  const { storeReady, canCallAuthedApi } = useAuthedApiReady();
  const { userId } = useAuthedUserId();

  const hasLiveTrip = isActiveTripStatus(currentTrip?.status, currentTrip?.payment_status);
  const sessionPollingActive = isOnline || hasLiveTrip;
  const highPriority = isDriverHighPriorityPolling(currentTrip?.status);
  const pollMs = driverTripCoordinatorPollMs(highPriority);

  useEffect(() => {
    if (!storeReady) return;

    if (!canCallAuthedApi || !userId) {
      // Keep a valid persisted active trip during brief auth hydration gaps.
      if (shouldClearTripAfterInactiveApi()) {
        setCurrentTrip(null);
      }
      return;
    }

    if (!sessionPollingActive) return;

    let mounted = true;

    const pullActiveTrip = async () => {
      const result = await pullAndApplyActiveTrip(userId);
      if (!mounted) return;

      if (result.found) return;

      // API says no active trip — only clear when local state is not a live trip.
      if (shouldClearTripAfterInactiveApi()) {
        setCurrentTrip(null);
      }
    };

    void pullActiveTrip();
    const interval = setInterval(() => void pullActiveTrip(), pollMs);

    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void pullActiveTrip();
      }
    });

    return () => {
      mounted = false;
      clearInterval(interval);
      appStateSub.remove();
    };
  }, [canCallAuthedApi, storeReady, userId, setCurrentTrip, pollMs, sessionPollingActive]);
}

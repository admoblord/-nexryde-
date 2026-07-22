import { useEffect } from 'react';
import { useAppStore } from '@/src/store/appStore';
import { useAuthedApiReady } from '@/src/hooks/useAuthedApiReady';
import { useAuthedUserId } from '@/src/hooks/useAuthedUserId';
import { pullAndApplyActiveTrip, shouldClearTripAfterInactiveApi } from '@/src/services/activeTripSync';
import { isActiveTripStatus } from '@/src/utils/tripStatus';
import {
  driverTripCoordinatorPollMs,
  isDriverHighPriorityPolling,
} from '@/src/constants/driverPollingProfiles';
import { setForegroundInterval } from '@/src/utils/foregroundInterval';

export default function useActiveTripCoordinator(options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false;
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
    if (!enabled || !storeReady) return;

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

    const stop = setForegroundInterval(() => void pullActiveTrip(), pollMs);

    return () => {
      mounted = false;
      stop();
    };
  }, [enabled, canCallAuthedApi, storeReady, userId, setCurrentTrip, pollMs, sessionPollingActive]);
}

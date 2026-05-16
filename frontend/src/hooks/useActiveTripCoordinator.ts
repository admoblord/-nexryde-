import { useEffect } from 'react';
import { AppState } from 'react-native';
import { getActiveTrip } from '@/src/services/api';
import { useAppStore } from '@/src/store/appStore';
import { useAuthedApiReady } from '@/src/hooks/useAuthedApiReady';
import { useAuthedUserId } from '@/src/hooks/useAuthedUserId';
import { isActiveTripStatus, normalizeTripStatus } from '@/src/utils/tripStatus';

const POLL_MS = 22000;

export default function useActiveTripCoordinator() {
  const setCurrentTrip = useAppStore((s) => s.setCurrentTrip);
  const { storeReady, canCallAuthedApi } = useAuthedApiReady();
  const { userId } = useAuthedUserId();

  useEffect(() => {
    if (!storeReady) return;
    if (!canCallAuthedApi || !userId) {
      setCurrentTrip(null);
      return;
    }

    let mounted = true;

    const pullActiveTrip = async () => {
      try {
        const res = await getActiveTrip(userId);
        const payload = res?.data;
        if (!mounted) return;

        if (payload?.active && payload?.trip) {
          const normalizedStatus = normalizeTripStatus(payload.trip.status, payload.trip.payment_status);
          const normalizedTrip = { ...payload.trip, status: normalizedStatus };
          if (isActiveTripStatus(normalizedStatus, payload.trip.payment_status)) {
            setCurrentTrip(normalizedTrip);
          } else {
            setCurrentTrip(null);
          }
          return;
        }

        setCurrentTrip(null);
      } catch {
        // Keep prior state when network is unstable.
      }
    };

    pullActiveTrip();
    const interval = setInterval(pullActiveTrip, POLL_MS);

    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        pullActiveTrip();
      }
    });

    return () => {
      mounted = false;
      clearInterval(interval);
      appStateSub.remove();
    };
  }, [canCallAuthedApi, storeReady, userId, setCurrentTrip]);
}


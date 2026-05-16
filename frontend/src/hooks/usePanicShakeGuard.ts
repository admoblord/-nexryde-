import { useEffect, useRef } from 'react';
import { Accelerometer } from 'expo-sensors';
import * as Location from 'expo-location';
import { triggerSOS } from '@/src/services/api';
import { useAppStore } from '@/src/store/appStore';
import { useAuthedUserId } from '@/src/hooks/useAuthedUserId';

const ACTIVE_STATUSES = new Set(['accepted', 'arrived', 'ongoing', 'pending_payment']);
const SHAKE_THRESHOLD_G = 1.35;
const SHAKE_COUNT_REQUIRED = 3;
const SHAKE_WINDOW_MS = 4000;
const SHAKE_COOLDOWN_MS = 30000;
const MIN_SHAKE_GAP_MS = 300;

export default function usePanicShakeGuard() {
  const user = useAppStore((s) => s.user);
  const { userId, canCallAuthedApi } = useAuthedUserId();
  const currentTrip = useAppStore((s) => s.currentTrip);
  const cooldownUntilRef = useRef(0);
  const shakeTimesRef = useRef<number[]>([]);
  const lastPeakAtRef = useRef(0);

  useEffect(() => {
    const tripId = currentTrip?.id || '';
    const tripStatus = currentTrip?.status || '';
    const enabled = Boolean(
      canCallAuthedApi && userId && user?.role === 'rider' && tripId && ACTIVE_STATUSES.has(tripStatus),
    );
    if (!enabled) {
      shakeTimesRef.current = [];
      return;
    }

    Accelerometer.setUpdateInterval(180);

    const subscription = Accelerometer.addListener((reading) => {
      const now = Date.now();
      if (now < cooldownUntilRef.current) return;

      const magnitude = Math.sqrt(
        reading.x * reading.x + reading.y * reading.y + reading.z * reading.z
      );
      const dynamicForce = Math.abs(magnitude - 1);
      if (dynamicForce < SHAKE_THRESHOLD_G) return;
      if (now - lastPeakAtRef.current < MIN_SHAKE_GAP_MS) return;

      lastPeakAtRef.current = now;
      shakeTimesRef.current = [...shakeTimesRef.current.filter((t) => now - t <= SHAKE_WINDOW_MS), now];

      if (shakeTimesRef.current.length < SHAKE_COUNT_REQUIRED) return;

      cooldownUntilRef.current = now + SHAKE_COOLDOWN_MS;
      shakeTimesRef.current = [];

      void (async () => {
        try {
          const permission = await Location.requestForegroundPermissionsAsync();
          if (permission.status !== 'granted') return;
          const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
          await triggerSOS({
            trip_id: tripId,
            location_lat: location.coords.latitude,
            location_lng: location.coords.longitude,
            auto_triggered: true,
          });
        } catch (error) {
          console.log('Panic shake trigger failed:', error);
        }
      })();
    });

    return () => {
      subscription.remove();
    };
  }, [currentTrip?.id, currentTrip?.status, userId, canCallAuthedApi, user?.role]);
}

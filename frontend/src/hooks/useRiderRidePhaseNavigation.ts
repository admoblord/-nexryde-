import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useAppStore } from '@/src/store/appStore';
import { normalizeTripStatus } from '@/src/utils/tripStatus';

/**
 * Global rider navigation when trip phase changes (driver arrived / trip started).
 * Fixes delayed or missing screen handoffs outside tracking.tsx alone.
 */
export function useRiderRidePhaseNavigation() {
  const router = useRouter();
  const segments = useSegments();
  const currentTrip = useAppStore((s) => s.currentTrip);
  const lastPhaseRef = useRef<{ tripId: string; status: string } | null>(null);
  const navLockRef = useRef<string | null>(null);

  useEffect(() => {
    if (!currentTrip?.id) {
      lastPhaseRef.current = null;
      return;
    }

    const status = normalizeTripStatus(currentTrip.status, currentTrip.payment_status);
    const tripId = currentTrip.id;
    const prev = lastPhaseRef.current;

    if (prev?.tripId === tripId && prev.status === status) return;
    lastPhaseRef.current = { tripId, status };

    const path = segments.join('/');
    const onTracking = path.includes('tracking');
    const onSecurityCode = path.includes('security-code');

    if (status === 'arrived' && prev?.status !== 'arrived') {
      if (!onSecurityCode) {
        const key = `arrived-nav-${tripId}`;
        if (navLockRef.current !== key) {
          navLockRef.current = key;
          if (Platform.OS !== 'web') {
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
          if (onTracking) {
            router.push({
              pathname: '/rider/security-code',
              params: { tripId },
            } as any);
          } else {
            router.replace({
              pathname: '/rider/security-code',
              params: { tripId },
            } as any);
          }
        }
      }
      return;
    }

    if (status === 'ongoing' && prev?.status !== 'ongoing') {
      const key = `ongoing-nav-${tripId}`;
      if (navLockRef.current !== key) {
        navLockRef.current = key;
        if (Platform.OS !== 'web') {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        router.replace({
          pathname: '/rider/tracking',
          params: { tripId },
        } as any);
      }
      return;
    }

    if (status === 'accepted' && prev?.status === 'arrived' && onSecurityCode) {
      router.replace({
        pathname: '/rider/tracking',
        params: { tripId },
      } as any);
    }
  }, [currentTrip?.id, currentTrip?.status, currentTrip?.payment_status, segments, router]);
}

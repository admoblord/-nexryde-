import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { useAppStore } from '@/src/store/appStore';
import { useDriverTripLocationPublisher } from '@/src/hooks/useDriverTripLocationPublisher';
import { coordsChangedEnough } from '@/src/utils/riderTripLiveSync';

const ACTIVE_STATUSES = new Set(['accepted', 'arrived', 'ongoing']);

/**
 * Keeps trip GPS pings alive for the whole driver tab stack (not only driver-home).
 */
export function DriverTripLocationBridge() {
  const currentTrip = useAppStore((s) => s.currentTrip);
  const [coords, setCoords] = useState<{
    lat: number;
    lng: number;
    heading?: number;
    speedKmh?: number;
  } | null>(null);

  const tripId = currentTrip?.id;
  const tripStatus = currentTrip?.status;
  const active = Boolean(tripId && ACTIVE_STATUSES.has(String(tripStatus || '').toLowerCase()));

  useEffect(() => {
    if (!active) {
      setCoords(null);
      return;
    }
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;

    void (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted' || cancelled) return;
        sub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 3000,
            distanceInterval: 12,
          },
          (pos) => {
            if (cancelled) return;
            const next = {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              heading: pos.coords.heading ?? undefined,
              speedKmh: pos.coords.speed != null ? pos.coords.speed * 3.6 : undefined,
            };
            if (!coordsChangedEnough(lastGpsRef.current, next, 10)) return;
            lastGpsRef.current = { lat: next.lat, lng: next.lng };
            setCoords(next);
          },
        );
      } catch {
        /* permission / GPS unavailable */
      }
    })();

    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [active, tripId]);

  useDriverTripLocationPublisher(active ? tripId : null, tripStatus, coords);

  return null;
}

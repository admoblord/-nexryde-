import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { postTripLocation } from '@/src/services/tripTrackingApi';
import { flushTripLocationQueue, queueTripLocation } from '@/src/utils/tripLocationQueue';
import { coordsChangedEnough } from '@/src/utils/riderTripLiveSync';

const ACTIVE_STATUSES = new Set(['accepted', 'arrived', 'ongoing']);
const PING_MS = 2500;
const MIN_SEND_METERS = 10;

type Coords = {
  lat: number;
  lng: number;
  heading?: number;
  speedKmh?: number;
};

/**
 * During an active trip, POST GPS to `/trips/{id}/location` every 2s (profile ping is fallback).
 */
export function useDriverTripLocationPublisher(
  tripId: string | null | undefined,
  tripStatus: string | null | undefined,
  coords: Coords | null | undefined,
) {
  const coordsRef = useRef(coords);
  const lastSentRef = useRef<{ lat: number; lng: number } | null>(null);
  coordsRef.current = coords;

  useEffect(() => {
    if (!tripId || !coords) return;
    const st = String(tripStatus || '').toLowerCase();
    if (!ACTIVE_STATUSES.has(st)) return;

    let cancelled = false;

    const push = async () => {
      const c = coordsRef.current;
      if (!c || cancelled) return;
      if (!coordsChangedEnough(lastSentRef.current, c, MIN_SEND_METERS)) return;
      const payload = {
        latitude: c.lat,
        longitude: c.lng,
        heading: c.heading,
        speed: c.speedKmh,
        timestamp: new Date().toISOString(),
      };
      const res = await postTripLocation(tripId, payload);
      if (res) {
        lastSentRef.current = { lat: c.lat, lng: c.lng };
      } else {
        await queueTripLocation({ tripId, ...payload, speed: c.speedKmh });
      }
    };

    void flushTripLocationQueue();
    void push();
    const interval = setInterval(() => void push(), PING_MS);

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void flushTripLocationQueue();
    });

    return () => {
      cancelled = true;
      clearInterval(interval);
      sub.remove();
    };
  }, [tripId, tripStatus, coords?.lat, coords?.lng]);
}

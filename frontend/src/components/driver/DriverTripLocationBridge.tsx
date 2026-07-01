import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { useAppStore } from '@/src/store/appStore';
import { useDriverTripLocationPublisher } from '@/src/hooks/useDriverTripLocationPublisher';
import { coordsChangedEnough } from '@/src/utils/riderTripLiveSync';

const ACTIVE_STATUSES = new Set(['accepted', 'arrived', 'ongoing']);

/**
 * Adaptive GPS intervals by trip phase — cost-optimised:
 *
 *  ongoing  → 3 s / 8 m   (rider watching live movement)
 *  accepted → 5 s / 15 m  (navigating to pickup)
 *  arrived  → 10 s / 5 m  (stationary / waiting)
 *  idle     → not started
 *
 * Distance threshold keeps GPS silent during traffic jams / red lights,
 * further cutting the ~1–2 backend writes/s per driver when stuck.
 */
function _gpsConfig(status: string | undefined): { timeInterval: number; distanceInterval: number; accuracy: Location.Accuracy } {
  const s = String(status || '').toLowerCase();
  if (s === 'ongoing') return { timeInterval: 3000,  distanceInterval: 8,  accuracy: Location.Accuracy.High };
  if (s === 'accepted') return { timeInterval: 5000,  distanceInterval: 15, accuracy: Location.Accuracy.Balanced };
  if (s === 'arrived')  return { timeInterval: 10000, distanceInterval: 5,  accuracy: Location.Accuracy.Balanced };
  return                       { timeInterval: 5000,  distanceInterval: 15, accuracy: Location.Accuracy.Balanced };
}

/**
 * Keeps trip GPS pings alive for the whole driver tab stack (not only driver-home).
 * Re-subscribes with the correct interval whenever trip status changes phase.
 */
export function DriverTripLocationBridge() {
  const currentTrip = useAppStore((s) => s.currentTrip);
  const [coords, setCoords] = useState<{
    lat: number;
    lng: number;
    heading?: number;
    speedKmh?: number;
  } | null>(null);

  const lastGpsRef = useRef<{ lat: number; lng: number } | null>(null);
  const tripId = currentTrip?.id;
  const tripStatus = currentTrip?.status;
  const active = Boolean(tripId && ACTIVE_STATUSES.has(String(tripStatus || '').toLowerCase()));

  // Re-subscribe when the trip status changes phase so the interval adjusts
  useEffect(() => {
    if (!active) {
      setCoords(null);
      return;
    }
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    const cfg = _gpsConfig(tripStatus);

    void (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted' || cancelled) return;
        const created = await Location.watchPositionAsync(cfg, (pos) => {
            if (cancelled) return;
            const next = {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              heading: pos.coords.heading ?? undefined,
              speedKmh: pos.coords.speed != null ? pos.coords.speed * 3.6 : undefined,
            };
            if (!coordsChangedEnough(lastGpsRef.current, next, cfg.distanceInterval)) return;
            lastGpsRef.current = { lat: next.lat, lng: next.lng };
            setCoords(next);
          },
        );
        // If the effect was cleaned up while we were awaiting, remove immediately
        if (cancelled) {
          created.remove();
          return;
        }
        sub = created;
      } catch {
        /* permission / GPS unavailable */
      }
    })();

    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [active, tripId, tripStatus]); // tripStatus in deps → resubscribe on phase change

  useDriverTripLocationPublisher(active ? tripId : null, tripStatus, coords);

  return null;
}

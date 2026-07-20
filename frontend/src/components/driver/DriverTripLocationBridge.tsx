import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { useAppStore } from '@/src/store/appStore';
import { useDriverTripLocationPublisher } from '@/src/hooks/useDriverTripLocationPublisher';
import { coordsChangedEnough } from '@/src/utils/riderTripLiveSync';
import { updateDriverHeartbeatCoords } from '@/src/services/driverHeartbeat';
import { publishDriverTripMapCoords } from '@/src/services/driverTripMapGps';
import { MAP } from '@/src/constants/nexrydeMapBehavior';

const ACTIVE_STATUSES = new Set(['accepted', 'arrived', 'ongoing']);

/**
 * Adaptive GPS intervals by trip phase — tuned for smooth map glide (2026).
 *
 *  ongoing  → ~1.5 s / 5 m  High   (rider + driver maps follow car)
 *  accepted → ~2.5 s / 8 m  High   (nav to pickup)
 *  arrived  → ~6 s / 5 m    Balanced (mostly stationary)
 */
function _gpsConfig(status: string | undefined): {
  timeInterval: number;
  distanceInterval: number;
  accuracy: Location.Accuracy;
} {
  const s = String(status || '').toLowerCase();
  if (s === 'ongoing') {
    return {
      timeInterval: Math.max(1000, MAP.update.locationRideSec * 1000 + 500),
      distanceInterval: 5,
      accuracy: Location.Accuracy.High,
    };
  }
  if (s === 'accepted') {
    return {
      timeInterval: 2500,
      distanceInterval: 8,
      accuracy: Location.Accuracy.High,
    };
  }
  if (s === 'arrived') {
    return {
      timeInterval: 6000,
      distanceInterval: 5,
      accuracy: Location.Accuracy.Balanced,
    };
  }
  return {
    timeInterval: MAP.update.locationIdleSec * 1000,
    distanceInterval: 12,
    accuracy: Location.Accuracy.Balanced,
  };
}

/**
 * Keeps trip GPS pings alive for the whole driver tab stack (not only driver-home).
 * Also publishes to map subscribers so the live car marker never freezes.
 */
export function DriverTripLocationBridge() {
  const currentTrip = useAppStore((s) => s.currentTrip);
  const setCurrentLocation = useAppStore((s) => s.setCurrentLocation);
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

  useEffect(() => {
    if (!active) {
      setCoords(null);
      publishDriverTripMapCoords(null);
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
          updateDriverHeartbeatCoords(next.lat, next.lng);
          publishDriverTripMapCoords(next);
          setCurrentLocation({
            latitude: next.lat,
            longitude: next.lng,
            address: '',
          });
        });
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
  }, [active, tripId, tripStatus, setCurrentLocation]);

  useDriverTripLocationPublisher(active ? tripId : null, tripStatus, coords);

  return null;
}

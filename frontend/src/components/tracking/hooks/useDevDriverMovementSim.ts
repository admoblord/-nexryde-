import { useEffect, useMemo, useRef, useState } from 'react';
import { bearingDeg } from '@/src/components/tracking/map/mapUtils';
import { RIDER_TRACKING_LOCATION_THROTTLE_MS } from '@/src/constants/tripRealtimeRhythm';
import { trackVerifyLog } from '@/src/components/tracking/map/trackVerifyLog';

type LatLng = { latitude: number; longitude: number };

/**
 * DEV ONLY — steps a fake driver along the active route polyline so marker glide,
 * rotation, and camera follow can be tested without a real drive.
 * Must not be enabled in production builds.
 */
export function useDevDriverMovementSim(
  route: LatLng[],
  enabled: boolean,
  stepMs = RIDER_TRACKING_LOCATION_THROTTLE_MS,
) {
  const [index, setIndex] = useState(0);
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [heading, setHeading] = useState(0);
  const routeKey = useMemo(
    () => route.map((p) => `${p.latitude.toFixed(5)},${p.longitude.toFixed(5)}`).join('|'),
    [route],
  );

  useEffect(() => {
    if (!__DEV__ || !enabled) {
      setIndex(0);
      setPosition(null);
      return;
    }
    if (route.length < 2) return;

    let i = 0;
    setIndex(0);
    setPosition({ lat: route[0].latitude, lng: route[0].longitude });
    if (route.length > 1) {
      setHeading(bearingDeg(route[0].latitude, route[0].longitude, route[1].latitude, route[1].longitude));
    }

    const tick = () => {
      const next = Math.min(i + 1, route.length - 1);
      const from = route[i];
      const to = route[next];
      const h = bearingDeg(from.latitude, from.longitude, to.latitude, to.longitude);
      setPosition({ lat: to.latitude, lng: to.longitude });
      setHeading(h);
      setIndex(next);
      trackVerifyLog(
        `sim tick index=${next}/${route.length - 1} lat=${to.latitude.toFixed(6)},lng=${to.longitude.toFixed(6)} heading=${h.toFixed(1)}`,
      );
      i = next >= route.length - 1 ? 0 : next;
    };

    const id = setInterval(tick, stepMs);
    return () => clearInterval(id);
  }, [enabled, routeKey, route, stepMs]);

  return { position, heading, index, routeLength: route.length };
}

import { useEffect, useState } from 'react';

export type MapLatLng = { latitude: number; longitude: number };

/**
 * Reveals route polyline points over ~1s (spec route-draw animation).
 */
export function useAnimatedRouteCoords(
  coords: MapLatLng[],
  enabled: boolean,
  durationMs = 1000,
): MapLatLng[] {
  const [visibleCount, setVisibleCount] = useState(() =>
    enabled && coords.length >= 2 ? 2 : coords.length,
  );

  useEffect(() => {
    if (!enabled || coords.length < 2) {
      setVisibleCount(coords.length);
      return;
    }
    setVisibleCount(2);
    const start = Date.now();
    let frame = 0;
    // Throttle to ~20 updates/sec — a native MapView Polyline rebuild per
    // React commit is expensive; per-rAF (60/s) updates cause visible jank
    // without any visible smoothness benefit over ~20/s.
    const stepMs = 50;
    let lastUpdate = 0;
    const step = () => {
      const now = Date.now();
      const t = Math.min(1, (now - start) / durationMs);
      if (now - lastUpdate >= stepMs || t >= 1) {
        lastUpdate = now;
        const count = Math.max(2, Math.round(2 + t * (coords.length - 2)));
        setVisibleCount(count);
      }
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [
    enabled,
    durationMs,
    coords.length,
    coords[0]?.latitude,
    coords[0]?.longitude,
    coords[coords.length - 1]?.latitude,
    coords[coords.length - 1]?.longitude,
  ]);

  if (!enabled || coords.length < 2) return coords;
  return coords.slice(0, Math.min(visibleCount, coords.length));
}

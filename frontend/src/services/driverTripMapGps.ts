/**
 * Fan-out for trip-phase GPS so DriverLiveMapView stays live while
 * DriverTripLocationBridge owns the watcher (avoids frozen car marker).
 */

export type DriverTripMapCoords = {
  lat: number;
  lng: number;
  heading?: number;
  speedKmh?: number;
};

type Listener = (coords: DriverTripMapCoords) => void;

const listeners = new Set<Listener>();
let latest: DriverTripMapCoords | null = null;

export function publishDriverTripMapCoords(coords: DriverTripMapCoords | null) {
  latest = coords;
  if (!coords) return;
  listeners.forEach((fn) => {
    try {
      fn(coords);
    } catch {
      /* ignore subscriber errors */
    }
  });
}

export function subscribeDriverTripMapCoords(fn: Listener): () => void {
  listeners.add(fn);
  if (latest) {
    try {
      fn(latest);
    } catch {
      /* ignore */
    }
  }
  return () => {
    listeners.delete(fn);
  };
}

export function getLatestDriverTripMapCoords(): DriverTripMapCoords | null {
  return latest;
}

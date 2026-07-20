/**
 * Uber/Bolt-class 3D camera + day/night helpers for NexRyde maps.
 */
import { getNexrydeMapStyle } from '@/src/constants/nexrydeMapBehavior';

/** Camera feel — tilted city + buildings (Google Maps 3D). */
export const MAP_3D = {
  /** Active trip follow pitch (degrees). */
  tripPitch: 48,
  /** Online idle follow pitch. */
  idlePitch: 32,
  /** Rider live-tracking pitch. */
  riderPitch: 42,
  /** Booking / finding mild tilt. */
  bookingPitch: 28,
  /** Rider home interactive map. */
  homePitch: 36,
  /** Active-trip peek on rider home. */
  peekPitch: 34,
  tripZoom: 17.2,
  idleZoom: 15.6,
  riderZoom: 16.4,
  homeZoom: 15.2,
  peekZoom: 14.4,
  tripAltitude: 420,
  idleAltitude: 900,
} as const;

/** Rough tropical day/night (Nigeria) — night before 06:30 or after 18:45 local. */
export function isLocalMapNight(date = new Date()): boolean {
  const h = date.getHours() + date.getMinutes() / 60;
  return h < 6.5 || h >= 18.75;
}

/** Auto cartography: sun-based unless caller forces theme. */
export function getNexrydeMapStyleAuto(forceDark?: boolean | null) {
  if (forceDark === true) return getNexrydeMapStyle(true);
  if (forceDark === false) return getNexrydeMapStyle(false);
  return getNexrydeMapStyle(isLocalMapNight());
}

/** Prefer last-known GPS; else Lagos only as last resort. */
export function mapFallbackCenter(coords?: { lat: number; lng: number } | null) {
  if (
    coords &&
    Number.isFinite(coords.lat) &&
    Number.isFinite(coords.lng) &&
    !(Math.abs(coords.lat) < 1e-5 && Math.abs(coords.lng) < 1e-5)
  ) {
    return { latitude: coords.lat, longitude: coords.lng };
  }
  return { latitude: 6.5244, longitude: 3.3792 };
}

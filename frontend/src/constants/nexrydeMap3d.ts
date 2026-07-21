/**
 * Uber/Bolt-class 3D camera + day/night helpers for NEXRYDE maps.
 */
import { getNexrydeMapStyle } from '@/src/constants/nexrydeMapBehavior';

/** Camera feel — tilted city + buildings (Google Maps 3D / Uber-class). */
export const MAP_3D = {
  /** Active trip follow pitch (degrees). */
  tripPitch: 52,
  /** Online idle follow pitch. */
  idlePitch: 36,
  /** Rider live-tracking pitch — Uber-class city tilt. */
  riderPitch: 54,
  /** Booking / finding — stronger city tilt + buildings. */
  bookingPitch: 46,
  /** Rider home interactive map. */
  homePitch: 44,
  /** Active-trip peek on rider home. */
  peekPitch: 40,
  tripZoom: 17.4,
  idleZoom: 15.8,
  riderZoom: 16.9,
  homeZoom: 15.6,
  peekZoom: 14.6,
  tripAltitude: 380,
  idleAltitude: 820,
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

/**
 * Multi-engine map stack flags.
 * - Google Maps (react-native-maps): rider/booking/live display
 * - Google Navigation SDK: driver turn-by-turn (lanes, speed, reroute)
 * - MapLibre: GPU heatmaps + optional Studio/vector styles + offline packs
 */
import Constants from 'expo-constants';
import { Platform } from 'react-native';

function envFlag(name: string, fallback = false): boolean {
  const raw =
    process.env[name] ??
    (Constants.expoConfig?.extra as Record<string, unknown> | undefined)?.[name];
  if (raw == null || raw === '') return fallback;
  const s = String(raw).trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

function envString(name: string, fallback = ''): string {
  const raw =
    process.env[name] ??
    (Constants.expoConfig?.extra as Record<string, unknown> | undefined)?.[name];
  return typeof raw === 'string' && raw.trim() ? raw.trim() : fallback;
}

/**
 * Native Google Navigation SDK — DISABLED by default (Enterprise billing).
 * Prefer deep-link `google.navigation:q=lat,lng&mode=d` (free).
 * Opt-in only via EXPO_PUBLIC_GOOGLE_NAVIGATION_ENABLED=true.
 */
export function isGoogleNavigationEnabled(): boolean {
  if (Platform.OS === 'web') return false;
  // iOS: Nav SDK conflicts with react-native-maps; never enable.
  if (Platform.OS === 'ios') return false;
  return envFlag('EXPO_PUBLIC_GOOGLE_NAVIGATION_ENABLED', false);
}

/** MapLibre GPU heatmap + vector style surfaces. */
export function isMapLibreEnabled(): boolean {
  if (Platform.OS === 'web') return false;
  return envFlag('EXPO_PUBLIC_MAPLIBRE_ENABLED', true);
}

/** Optional Mapbox/MapTiler/MapLibre Studio style URL. */
export function getMapLibreStyleUrl(): string {
  return (
    envString('EXPO_PUBLIC_MAPLIBRE_STYLE_URL') ||
    envString('EXPO_PUBLIC_MAPBOX_STYLE_URL') ||
    'https://demotiles.maplibre.org/style.json'
  );
}

/** Optional Mapbox access token when style URL is mapbox:// */
export function getMapboxAccessToken(): string {
  return envString('EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN');
}

/**
 * Live raster Map IDs in GCP project `nexryde-app` (Map Management API).
 *
 * These are the only IDs safe to hand to the Android / iOS Maps SDK. They
 * render raster tiles with the "Nexryde Bolt Rider Light" cloud style
 * (`e8c03fd7c78c554bdeb325a0`). Vector Map IDs blank the native map.
 */
export const BOLT_RIDER_MAP_ID_ANDROID = '8c2cb1bb7947cd4399ec19b0';
export const BOLT_RIDER_MAP_ID_IOS = '8c2cb1bb7947cd4382430923';
export const BOLT_RIDER_MAP_STYLE_ID = 'e8c03fd7c78c554bdeb325a0';

/**
 * WebGL-only Map IDs created 2026-08-12. The Maps JavaScript API can draw
 * them; Maps SDK for Android / iOS cannot — the canvas stays empty.
 */
export const RETIRED_VECTOR_MAP_IDS = new Set([
  '8c2cb1bb7947cd439e2af444',
  '8c2cb1bb7947cd43c98f73a8',
]);

function rasterFallback(os: string): string {
  return os === 'ios' ? BOLT_RIDER_MAP_ID_IOS : BOLT_RIDER_MAP_ID_ANDROID;
}

/** Drop retired vector IDs so a stale EAS secret cannot blank the map. */
export function sanitizeGoogleMapId(id: string, os: string = Platform.OS): string {
  const trimmed = (id || '').trim();
  if (!trimmed || RETIRED_VECTOR_MAP_IDS.has(trimmed)) return rasterFallback(os);
  return trimmed;
}

/**
 * Cloud Map IDs are on by default now that raster (mobile-safe) IDs exist.
 * Set EXPO_PUBLIC_GOOGLE_MAP_ID_ENABLED=false to force the JSON stylesheet.
 */
export function isGoogleMapIdEnabled(): boolean {
  return envFlag('EXPO_PUBLIC_GOOGLE_MAP_ID_ENABLED', true);
}

/**
 * Google Cloud Map ID for cloud-styled maps (preferred over JSON customMapStyle).
 * Set EXPO_PUBLIC_GOOGLE_MAP_ID_ANDROID / _IOS (or shared EXPO_PUBLIC_GOOGLE_MAP_ID).
 */
export function getGoogleMapIdForPlatform(os: string = Platform.OS): string {
  if (!isGoogleMapIdEnabled()) return '';
  let raw = '';
  if (os === 'android') {
    raw =
      envString('EXPO_PUBLIC_GOOGLE_MAP_ID_ANDROID') ||
      envString('EXPO_PUBLIC_GOOGLE_MAP_ID') ||
      envString('googleMapIdAndroid') ||
      envString('googleMapId');
  } else if (os === 'ios') {
    raw =
      envString('EXPO_PUBLIC_GOOGLE_MAP_ID_IOS') ||
      envString('EXPO_PUBLIC_GOOGLE_MAP_ID') ||
      envString('googleMapIdIos') ||
      envString('googleMapId');
  } else {
    raw = envString('EXPO_PUBLIC_GOOGLE_MAP_ID') || envString('googleMapId');
  }
  return sanitizeGoogleMapId(raw, os);
}

export const MAP_ENGINE = {
  display: 'google-maps' as const,
  navigation: 'google-navigation-sdk' as const,
  heatmap: 'maplibre-gpu' as const,
} as const;

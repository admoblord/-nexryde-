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

/** Optional Mapbox/MapTiler/MapLibre Studio style JSON URL. */
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
 * Google Cloud Map ID for cloud-styled maps (preferred over JSON customMapStyle).
 * Set EXPO_PUBLIC_GOOGLE_MAP_ID_ANDROID / _IOS (or shared EXPO_PUBLIC_GOOGLE_MAP_ID).
 */
export function getGoogleMapIdForPlatform(os: string = Platform.OS): string {
  if (os === 'android') {
    return (
      envString('EXPO_PUBLIC_GOOGLE_MAP_ID_ANDROID') ||
      envString('EXPO_PUBLIC_GOOGLE_MAP_ID') ||
      envString('googleMapIdAndroid') ||
      envString('googleMapId')
    );
  }
  if (os === 'ios') {
    return (
      envString('EXPO_PUBLIC_GOOGLE_MAP_ID_IOS') ||
      envString('EXPO_PUBLIC_GOOGLE_MAP_ID') ||
      envString('googleMapIdIos') ||
      envString('googleMapId')
    );
  }
  return envString('EXPO_PUBLIC_GOOGLE_MAP_ID') || envString('googleMapId');
}

export const MAP_ENGINE = {
  display: 'google-maps' as const,
  navigation: 'google-navigation-sdk' as const,
  heatmap: 'maplibre-gpu' as const,
} as const;

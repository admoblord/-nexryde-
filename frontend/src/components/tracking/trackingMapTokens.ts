import type { MapStyleElement } from 'react-native-maps';
import { NEXRYDE_MAP_STYLE } from '@/src/constants/nexrydeMapBehavior';
import { getNexrydeMapStyleAuto } from '@/src/constants/nexrydeMap3d';
import { BRAND } from '@/src/constants/designSystem';

/** NEXRYDE Perfect Tracking Map — design tokens (spec). */
export const PERFECT_TRACKING = {
  green: BRAND.primary,
  yellow: '#FFD700',
  red: '#FF4444',
  teal: BRAND.accentCyan,
  blue: BRAND.accentBlue,
  orange: '#FF8C00',
  bg: BRAND.bgDeep,
  card: BRAND.bgCard,
  border: '#2D3748',
  textPrimary: '#FFFFFF',
  textSecondary: '#9CA3AF',
  headerH: 70,
  fabSize: 48,
  mapFlex: 85,
  panelFlex: 15,
} as const;

/** Canonical night style — same as driver live / booking. */
export const PERFECT_TRACKING_MAP_STYLE: MapStyleElement[] = NEXRYDE_MAP_STYLE as MapStyleElement[];

/** Sun-based cartography (Uber/Bolt). Optional forceDark overrides local day/night. */
export function getPerfectTrackingMapStyle(forceDark?: boolean | null): MapStyleElement[] {
  return getNexrydeMapStyleAuto(forceDark) as MapStyleElement[];
}

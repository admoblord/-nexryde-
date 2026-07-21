/**
 * NEXRYDE Live Tracking — premium dark glass design system.
 */
import type { ViewStyle } from 'react-native';
import { BRAND, SURFACE } from '@/src/constants/designSystem';

export const LIVE = {
  bg: '#030810',
  mapBg: '#0A111C',
  glass: SURFACE.glass,
  glassSoft: SURFACE.glassSoft,
  glassBorder: SURFACE.glassBorder,
  hairline: SURFACE.hairline,
  tile: SURFACE.tile,
  green: BRAND.primary,
  greenBright: BRAND.primaryLight,
  greenGlow: BRAND.primaryMuted,
  greenSoft: 'rgba(34,225,128,0.14)',
  greenInk: '#022C22',
  text: BRAND.textPrimary,
  sub: BRAND.textSecondary,
  faint: BRAND.textMuted,
  gold: BRAND.warning,
  red: BRAND.danger,
  redSoft: 'rgba(239,68,68,0.16)',
  blue: BRAND.info,
  radiusXl: 28,
  radius: 22,
  radiusSm: 14,
  radiusPill: 999,
  pad: 16,
  gap: 12,
  edge: 16,
} as const;

export const liveGlassCard: ViewStyle = {
  backgroundColor: LIVE.glass,
  borderRadius: LIVE.radius,
  borderWidth: 1,
  borderColor: LIVE.hairline,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 10 },
  shadowOpacity: 0.48,
  shadowRadius: 24,
  elevation: 14,
};

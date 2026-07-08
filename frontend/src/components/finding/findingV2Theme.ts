/**
 * FINDING DRIVER V2 — design tokens (sourced from designSystem).
 */
import type { ViewStyle } from 'react-native';
import { BRAND, SURFACE } from '@/src/constants/designSystem';

export const FV2 = {
  bg: '#030B1A',
  card: SURFACE.glass,
  cardBorder: SURFACE.hairline,
  greenBorder: SURFACE.glassBorder,
  green: BRAND.primary,
  greenBright: BRAND.primaryLight,
  greenGlow: BRAND.primaryMuted,
  greenSoft: 'rgba(34,225,128,0.10)',
  greenInk: BRAND.textInverse,
  text: BRAND.textPrimary,
  sub: BRAND.textSecondary,
  faint: BRAND.textMuted,
  red: BRAND.danger,
  redSoft: 'rgba(239,68,68,0.12)',

  radiusXl: 26,
  radius: 20,
  radiusSm: 14,
  pill: 999,

  pad: 16,
  gap: 12,
  edge: 16,
} as const;

export const findingGlass: ViewStyle = {
  backgroundColor: FV2.card,
  borderRadius: FV2.radius,
  borderWidth: 1,
  borderColor: FV2.cardBorder,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 10 },
  shadowOpacity: 0.5,
  shadowRadius: 22,
  elevation: 12,
};

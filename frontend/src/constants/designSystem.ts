/**
 * NEXRYDE brand & layout tokens (product UI spec).
 * Use alongside `theme.ts` — `COLORS` remains the default runtime palette for screens.
 */
export const BRAND = {
  primaryNeon: '#39FF14',
  navyDeep: '#0A0E27',
  accentCyan: '#00D9FF',
  success: '#00FF00',
  warning: '#FF8C00',
  danger: '#FF0000',
  white: '#FFFFFF',
  gray: '#808080',
} as const;

export const LAYOUT = {
  unit: 8,
  padSm: 8,
  padMd: 16,
  padLg: 24,
  padXl: 32,
  gapSection: 16,
  radiusSm: 4,
  radiusMd: 8,
  radiusLg: 12,
  radiusXl: 16,
  touchMin: 44,
} as const;

export const TYPOGRAPHY = {
  headline: { fontSize: 28, fontWeight: '800' as const },
  subhead: { fontSize: 18, fontWeight: '600' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  small: { fontSize: 13, fontWeight: '500' as const },
};

/** Home dashboards: accents not duplicated as inline hex in driver/rider home. */
export const HOME_PALETTE = {
  accentIndigo: '#6366F1',
  accentIndigoDark: '#4F46E5',
  accentTeal: '#0E7490',
  cardShadowColor: '#000000',
  heroPurple: '#7C3AED',
  heroOrange: '#EA580C',
} as const;

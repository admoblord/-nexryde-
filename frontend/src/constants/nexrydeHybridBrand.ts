/**
 * NEXRYDE Full Hybrid Design System — shared across rider booking, driver home, driver map.
 */
import { BRAND, SURFACE } from '@/src/constants/designSystem';

export const HYBRID = {
  green: BRAND.primary,
  blue: BRAND.accentBlue,
  purple: BRAND.accentPurple,
  yellow: '#FFD700',
  teal: BRAND.accentCyan,
  red: BRAND.danger,
  navy: BRAND.bgDeep,
  card: SURFACE.cardDark,
  border: 'rgba(148,163,184,0.18)',
  text: BRAND.textPrimary,
  muted: BRAND.textSecondary,
  chipBg: SURFACE.cardElevated,
} as const;

export const HYBRID_PAD = 16;
export const HYBRID_BTN_PRIMARY_H = 70;
export const HYBRID_BTN_SECONDARY_H = 60;
export const HYBRID_BTN_TERTIARY_H = 48;

export const HYBRID_TYPE = {
  display: 48,
  h1: 32,
  h2: 24,
  h3: 20,
  subtitle: 16,
  body: 14,
  label: 12,
  caption: 10,
} as const;

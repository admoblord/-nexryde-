/**
 * Shared visual tokens for driver trip docks + related modals.
 */
import { BRAND } from '@/src/constants/designSystem';

export const DOCK_TOP_RADIUS = 32;
export const DOCK_BLUR_INTENSITY = 56;
export const HEADER_BLUR_DEFAULT = 48;
export const HEADER_BLUR_INCOMING = 56;

export const HANDLE_GRADIENT_DEFAULT: readonly [string, string, string] = [
  'rgba(109,255,195,0.52)',
  'rgba(0,102,255,0.26)',
  'rgba(109,255,195,0.48)',
];

export const HANDLE_GRADIENT_ONGOING: readonly [string, string, string] = [
  'rgba(34,225,128,0.55)',
  'rgba(0,102,255,0.32)',
  'rgba(34,225,128,0.5)',
];

export const PHASE_CHROME_BLUR = 52;
export const PHASE_CHROME_RADIUS = 20;

export const DOCK_PHASE_COLORS = {
  heading_pickup: {
    border: BRAND.primaryMuted,
    sheen: 'rgba(34,225,128,0.14)',
    kicker: BRAND.primaryLight,
    dot: BRAND.primary,
  },
  arrived: {
    border: 'rgba(34,225,128,0.38)',
    sheen: 'rgba(34,225,128,0.16)',
    kicker: BRAND.primaryLight,
    dot: BRAND.primary,
  },
  rider_in_car: {
    border: 'rgba(34,225,128,0.32)',
    sheen: 'rgba(34,225,128,0.12)',
    kicker: BRAND.primaryLight,
    dot: BRAND.primary,
  },
  ongoing: {
    border: 'rgba(96,165,250,0.35)',
    sheen: 'rgba(59,130,246,0.14)',
    kicker: '#93C5FD',
    dot: BRAND.info,
  },
} as const;

/** Compact stat chip on docks */
export const DOCK_METRIC_CHIP = {
  bg: 'rgba(15,23,42,0.75)',
  border: 'rgba(148,163,184,0.18)',
  label: '#64748B',
  value: '#F1F5F9',
  accentBorder: 'rgba(52,245,184,0.35)',
  accentValue: '#D1FAE5',
} as const;

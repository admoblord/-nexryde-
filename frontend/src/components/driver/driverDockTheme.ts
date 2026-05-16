/**
 * Shared visual tokens for driver trip docks + related modals.
 * Keeps pickup / arrived / start / ongoing / offer surfaces aligned.
 */

export const DOCK_TOP_RADIUS = 32;
/** expo-blur intensity for dock shells */
export const DOCK_BLUR_INTENSITY = 56;
/** Brand header (DriverBrandChrome) — slightly softer when not in offer mode */
export const HEADER_BLUR_DEFAULT = 48;
export const HEADER_BLUR_INCOMING = 56;

/** Drag handle — mint + subtle blue (matches ongoing / “live” family) */
export const HANDLE_GRADIENT_DEFAULT: readonly [string, string, string] = [
  'rgba(52,245,184,0.52)',
  'rgba(59,130,246,0.26)',
  'rgba(52,245,184,0.48)',
];

export const HANDLE_GRADIENT_ONGOING: readonly [string, string, string] = [
  'rgba(57,255,20,0.55)',
  'rgba(59,130,246,0.32)',
  'rgba(57,255,20,0.5)',
];

export const PHASE_CHROME_BLUR = 52;
export const PHASE_CHROME_RADIUS = 20;

export const DOCK_PHASE_COLORS = {
  heading_pickup: {
    border: 'rgba(52,245,184,0.28)',
    sheen: 'rgba(52,245,184,0.14)',
    kicker: '#4ADE80',
    dot: '#34F5B8',
  },
  arrived: {
    border: 'rgba(52,245,184,0.38)',
    sheen: 'rgba(52,245,184,0.16)',
    kicker: '#4ADE80',
    dot: '#34F5B8',
  },
  rider_in_car: {
    border: 'rgba(52,245,184,0.32)',
    sheen: 'rgba(52,245,184,0.12)',
    kicker: '#4ADE80',
    dot: '#34F5B8',
  },
  ongoing: {
    border: 'rgba(96,165,250,0.35)',
    sheen: 'rgba(59,130,246,0.14)',
    kicker: '#93C5FD',
    dot: '#60A5FA',
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

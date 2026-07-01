/**
 * NEXRYDE Tracking V2 — design tokens.
 * Brand-new styling system for the rebuilt rider tracking screen.
 * Dark glassmorphism over a map-first layout.
 */
import type { ViewStyle } from 'react-native';

export const TV2 = {
  /* palette */
  bg: '#04070D',
  glass: 'rgba(8,14,24,0.90)',
  glassSoft: 'rgba(13,20,33,0.82)',
  glassBorder: 'rgba(0,208,132,0.18)',
  hairline: 'rgba(255,255,255,0.08)',
  tile: 'rgba(255,255,255,0.055)',
  green: '#00D084',
  greenBright: '#2BE8A6',
  greenGlow: 'rgba(0,208,132,0.35)',
  greenSoft: 'rgba(0,208,132,0.12)',
  greenInk: '#022C22',
  text: '#F8FAFC',
  sub: '#9DB0C7',
  faint: '#5E7188',
  gold: '#FFC93C',
  red: '#FF5252',
  redSoft: 'rgba(255,82,82,0.14)',
  blue: '#38BDF8',

  /* shape */
  radiusXl: 26,
  radius: 20,
  radiusSm: 14,
  radiusPill: 999,

  /* rhythm */
  pad: 14,
  gap: 10,
  edge: 14,
} as const;

/** Frosted dark card base used by every V2 card. */
export const glassCard: ViewStyle = {
  backgroundColor: TV2.glass,
  borderRadius: TV2.radius,
  borderWidth: 1,
  borderColor: TV2.hairline,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 10 },
  shadowOpacity: 0.45,
  shadowRadius: 22,
  elevation: 12,
};

/** Green-edged variant for security-critical surfaces. */
export const glassCardSecure: ViewStyle = {
  ...glassCard,
  borderColor: TV2.glassBorder,
  backgroundColor: 'rgba(4,24,18,0.92)',
};

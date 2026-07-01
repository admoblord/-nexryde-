/**
 * FINDING DRIVER V2 — design tokens.
 * Self-contained styling system for the rebuilt driver-matching screen.
 * Deep navy void, neon green glow, dark glassmorphism.
 */
import type { ViewStyle } from 'react-native';

export const FV2 = {
  /* palette */
  bg: '#030B1A',
  card: 'rgba(10,20,36,0.88)',
  cardBorder: 'rgba(255,255,255,0.07)',
  greenBorder: 'rgba(0,208,132,0.22)',
  green: '#00D084',
  greenBright: '#3BF0AE',
  greenGlow: 'rgba(0,208,132,0.35)',
  greenSoft: 'rgba(0,208,132,0.10)',
  greenInk: '#03281D',
  text: '#F8FAFC',
  sub: '#9AAFC8',
  faint: '#5C7088',
  red: '#FF5A5A',
  redSoft: 'rgba(255,90,90,0.12)',

  /* shape */
  radiusXl: 26,
  radius: 20,
  radiusSm: 14,
  pill: 999,

  /* rhythm */
  pad: 16,
  gap: 12,
  edge: 16,
} as const;

/** Glass card base shared by all V2 finding cards. */
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

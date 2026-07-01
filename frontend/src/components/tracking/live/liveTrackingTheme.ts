/**
 * NEXRYDE Live Tracking — premium dark glass design system.
 */
import type { ViewStyle } from 'react-native';

export const LIVE = {
  bg: '#030810',
  mapBg: '#0A111C',
  glass: 'rgba(6,12,22,0.92)',
  glassSoft: 'rgba(12,18,30,0.86)',
  glassBorder: 'rgba(0,208,132,0.22)',
  hairline: 'rgba(255,255,255,0.09)',
  tile: 'rgba(255,255,255,0.06)',
  green: '#00D084',
  greenBright: '#2BE8A6',
  greenGlow: 'rgba(0,208,132,0.38)',
  greenSoft: 'rgba(0,208,132,0.14)',
  greenInk: '#022C22',
  text: '#F8FAFC',
  sub: '#9DB0C7',
  faint: '#5E7188',
  gold: '#FFC93C',
  red: '#FF5252',
  redSoft: 'rgba(255,82,82,0.16)',
  blue: '#38BDF8',
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

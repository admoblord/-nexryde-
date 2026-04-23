export const profileTokens = {
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 },
  radius: { sm: 10, md: 14, lg: 20, xl: 24, pill: 999 },
  bg: {
    screen: '#0B1220',
    card: '#121A2A',
    cardElevated: '#17213A',
    divider: 'rgba(255,255,255,0.06)',
  },
  text: {
    primary: '#FFFFFF',
    secondary: 'rgba(255,255,255,0.72)',
    tertiary: 'rgba(255,255,255,0.50)',
    label: 'rgba(255,255,255,0.40)',
  },
  accent: {
    green: '#22C55E',
    greenSoft: 'rgba(34,197,94,0.15)',
    blue: '#3B82F6',
    purple: '#8B5CF6',
    red: '#EF4444',
    amber: '#F59E0B',
    pink: '#EC4899',
    teal: '#14B8A6',
    indigo: '#6366F1',
    orange: '#F97316',
    violet: '#8B5CF6',
    cyan: '#06B6D4',
  },
  font: {
    h1: { size: 28, weight: '800' as const, lineHeight: 34 },
    h2: { size: 20, weight: '700' as const, lineHeight: 26 },
    h3: { size: 17, weight: '600' as const, lineHeight: 22 },
    body: { size: 15, weight: '500' as const, lineHeight: 20 },
    small: { size: 13, weight: '500' as const, lineHeight: 18 },
    label: { size: 12, weight: '700' as const, lineHeight: 16, letterSpacing: 1.2 },
  },
} as const;

export const typography = {
  h1: { fontSize: 28, fontWeight: '800' as const, lineHeight: 34 },
  h2: { fontSize: 20, fontWeight: '700' as const, lineHeight: 26 },
  h3: { fontSize: 17, fontWeight: '600' as const, lineHeight: 22 },
  body: { fontSize: 15, fontWeight: '500' as const, lineHeight: 20 },
  small: { fontSize: 13, fontWeight: '500' as const, lineHeight: 18 },
  label: {
    fontSize: 12,
    fontWeight: '700' as const,
    lineHeight: 16,
    letterSpacing: 1.2,
    textTransform: 'uppercase' as const,
  },
} as const;


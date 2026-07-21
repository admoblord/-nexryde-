/**
 * NEXRYDE design tokens — ride-hailing clarity (8pt grid, 3 type levels, semantic colors).
 * Use for high-stakes flows (driver offers, trip CTAs). Import alongside COLORS from theme for legacy screens.
 */

export const DS_SPACE = {
  /** 4px */
  xxs: 4,
  /** 8px */
  xs: 8,
  /** 16px */
  sm: 16,
  /** 24px */
  md: 24,
  /** 32px */
  lg: 32,
  /** 40px */
  xl: 40,
} as const;

/** Max three text roles: hero numbers, primary copy, meta */
export const DS_TYPE = {
  /** Price, single decisive number */
  display: {
    fontSize: 40,
    lineHeight: 44,
    fontWeight: '900' as const,
    letterSpacing: -1.2,
  },
  /** Labels, route, buttons */
  body: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700' as const,
  },
  /** Hints, timer, guardrails */
  caption: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600' as const,
  },
} as const;

export const DS_COLOR = {
  /** Primary CTA (accept, go) */
  primary: '#22C55E',
  primaryDark: '#16A34A',
  primaryInk: '#022C22',
  /** Success states */
  success: '#22C55E',
  /** Reject, destructive secondary */
  danger: '#EF4444',
  dangerSoft: 'rgba(239, 68, 68, 0.12)',
  /** Surfaces (driver offer sheet) */
  bg: '#020617',
  card: '#0F172A',
  cardElevated: '#1E293B',
  border: 'rgba(148, 163, 184, 0.22)',
  text: '#F8FAFC',
  muted: '#94A3B8',
  routeBlue: '#0EA5E9',
  surge: '#F59E0B',
} as const;

export const DS_RADIUS = {
  sm: 10,
  md: 14,
  lg: 18,
  pill: 999,
} as const;

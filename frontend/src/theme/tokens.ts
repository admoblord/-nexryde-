/**
 * NEXRYDE design tokens — the single source of truth for trip screens.
 *
 * Every colour, type ramp, spacing step, radius and shadow used by rider and
 * driver trip screens resolves from here. No hardcoded hex outside this file.
 *
 * Contrast: white on the brand lime measures ~2.1:1 and fails WCAG. Navy on
 * lime measures ~7.9:1. Primary buttons are therefore lime with navy text, and
 * `colors.textOnGreen` is navy by definition — never override it to white.
 */

// ── Colour ──────────────────────────────────────────────────────────────────
export const colors = {
  /** Brand — sampled from the official Nexryde logo. */
  green: '#90C048',
  greenDark: '#78B048',
  greenLight: '#B8D860',
  navy: '#111427',
  blue: '#183068',

  /** Light theme surfaces. */
  bg: '#FFFFFF',
  bgMuted: '#F5F6F7',
  border: '#E4E6EA',
  overlay: 'rgba(17,20,39,0.45)',

  /** Text. */
  textPrimary: '#111427',
  textSecondary: '#6B7280',
  textTertiary: '#9AA0A6',
  /** Navy, not white — see the contrast note above. */
  textOnGreen: '#111427',

  /** Status. */
  amber: '#F5A623',
  red: '#E5484D',
  grey: '#9AA0A6',
} as const;

/** Translucent brand fills derived from the palette above. */
export const alpha = {
  greenSoft: 'rgba(144,192,72,0.16)',
  greenRing: 'rgba(144,192,72,0.28)',
  amberSoft: 'rgba(245,166,35,0.14)',
  redSoft: 'rgba(229,72,77,0.12)',
  blueSoft: 'rgba(24,48,104,0.12)',
  navySoft: 'rgba(17,20,39,0.06)',
  white: '#FFFFFF',
} as const;

// ── Type ────────────────────────────────────────────────────────────────────
export const type = {
  display: { fontSize: 32, lineHeight: 36, fontWeight: '700' as const },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700' as const },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '500' as const },
  bodyBold: { fontSize: 16, lineHeight: 24, fontWeight: '700' as const },
  caption: { fontSize: 14, lineHeight: 20, fontWeight: '500' as const },
  label: { fontSize: 12, lineHeight: 16, fontWeight: '600' as const },
} as const;

// ── Spacing & shape ─────────────────────────────────────────────────────────
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;

export const radius = {
  card: 20,
  /** Top corners only. */
  sheet: 24,
  pill: 999,
  button: 16,
} as const;

/** Floating elements only — sheets, cards and FABs above the map. */
export const shadow = {
  shadowColor: colors.navy,
  shadowOpacity: 0.1,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 4 },
  elevation: 6,
} as const;

// ── Map ─────────────────────────────────────────────────────────────────────
export const map = {
  /** Route line sits above a white casing so it stays the highest-contrast element. */
  routeColor: colors.greenDark,
  routeWidth: 9,
  routeCasingColor: '#FFFFFF',
  routeCasingWidth: 11,
  /** Traffic layer is off everywhere: congestion colours fight the route line. */
  showsTraffic: false,
  /** Camera padding when fitting to the relevant pair of points. */
  fitPadding: { top: 96, right: 64, bottom: 320, left: 64 },
  markerStatus: {
    available: colors.green,
    onTrip: colors.blue,
    offline: colors.grey,
  },
  offlineMarkerOpacity: 0.6,
} as const;

/** Bottom sheet snap fractions of screen height. */
export const sheet = { peek: 0.24, half: 0.5, full: 0.92 } as const;

export const tokens = { colors, alpha, type, space, radius, shadow, map, sheet } as const;

export default tokens;

// ── Legacy ──────────────────────────────────────────────────────────────────
/**
 * @deprecated Dark profile palette kept for screens not yet migrated to the
 * light trip theme. New work uses `colors` / `type` above.
 */
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

/** @deprecated Use `type` above for trip screens. */
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

/**
 * NEXRYDE Design System — authoritative token source.
 *
 * Single source of truth for brand colours, typography, spacing, shadows,
 * elevation, and motion. ALL screens and components should reference these
 * tokens instead of hardcoded values, ensuring visual consistency on par
 * with Uber / Bolt.
 *
 * Color palette: dark-first. The app uses a dark background (#0D1420) with
 * neon-green primary (#22E180), deep-blue secondary, and a warm white text.
 */

// ── Core Palette ──────────────────────────────────────────────────────────────

export const BRAND = {
  /** Primary call-to-action. Matches NEXRYDE logotype green. */
  primary: '#22E180',
  primaryDark: '#16C76A',
  primaryLight: '#6DFFC3',
  primaryMuted: 'rgba(34,225,128,0.15)',

  /** App background — deep navy matching splash screen. */
  bgDeep: '#0D1420',
  bgCard: '#121C2E',
  bgElevated: '#1A2640',
  bgOverlay: 'rgba(13,20,32,0.92)',

  /** Text */
  textPrimary: '#F0F4FA',
  textSecondary: '#8FA3BC',
  textMuted: '#4D6480',
  textInverse: '#0D1420',

  /** Semantic */
  success: '#22E180',
  warning: '#F59E0B',
  danger: '#EF4444',
  info: '#38BDF8',

  /** Accent */
  accentCyan: '#00D9FF',
  accentPurple: '#8B5CF6',
  accentOrange: '#FB923C',

  /** Legacy aliases (do not use in new code) */
  primaryNeon: '#22E180',
  navyDeep: '#0D1420',
  white: '#F0F4FA',
  gray: '#8FA3BC',

  /** Secondary brand blue (driver accent, links) */
  accentBlue: '#0066FF',

  /** Trip-dock mint highlight — derived from primary, used on map overlays */
  primaryMint: '#6DFFC3',

  /**
   * Map vehicle markers (top-down cars).
   * Navy body for contrast on pale Bolt landscape + green route; green accent
   * carries brand (a full-green car vanishes against route/parks).
   */
  mapVehicleBody: '#111427',
  mapVehicleWindow: '#FCFCFC',
  mapVehicleOutline: '#FCFCFC',
  /** Available / online accent */
  mapVehicleAccentAvailable: '#90C048',
  /** On a trip accent */
  mapVehicleAccentOnTrip: '#183068',
  /** Offline accent */
  mapVehicleAccentOffline: '#9AA0A6',
  /** Soft route green used on Bolt booking polyline (contrast reference). */
  mapRouteGreen: '#78B048',
} as const;

/** Map vehicle marker tokens — prefer this over scattering BRAND.mapVehicle*. */
export const MAP_VEHICLE = {
  body: BRAND.mapVehicleBody,
  window: BRAND.mapVehicleWindow,
  outline: BRAND.mapVehicleOutline,
  accentAvailable: BRAND.mapVehicleAccentAvailable,
  accentOnTrip: BRAND.mapVehicleAccentOnTrip,
  accentOffline: BRAND.mapVehicleAccentOffline,
  offlineBodyOpacity: 0.6,
  routeGreen: BRAND.mapRouteGreen,
} as const;

export type MapVehicleStatus = 'available' | 'on_trip' | 'offline';

/** Glass surfaces shared across rider/driver dashboards */
export const SURFACE = {
  glass: 'rgba(12,18,30,0.86)',
  glassSoft: 'rgba(15,23,42,0.72)',
  glassBorder: 'rgba(34,225,128,0.22)',
  hairline: 'rgba(255,255,255,0.09)',
  tile: 'rgba(255,255,255,0.06)',
  cardDark: '#121C2E',
  cardElevated: '#1A2640',
} as const;

/** App display name — use everywhere user-facing */
export const APP_DISPLAY_NAME = 'NEXRYDE';

// ── Spacing ───────────────────────────────────────────────────────────────────

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  /** Minimum accessible touch target (Apple HIG / Material). */
  touchMin: 44,
  /** Horizontal page padding. */
  pagePad: 20,
  /** Bottom safe-area buffer on most Android/iOS screens. */
  bottomGutter: 32,
  /** Fine gap inside dense rows (icon + label). */
  inline: 10,
  /** Vertical gap between stacked cards in a section. */
  stack: 12,
} as const;

/**
 * Screen structure rhythm — use for tab bodies, auth, and stack screens.
 * Keeps driver/rider/auth feeling like one product, not separate skins.
 */
export const SCREEN = {
  headerPadH: SPACING.pagePad,
  headerPadV: 12,
  heroGap: 6,
  sectionGap: 20,
  cardPad: SPACING.md,
  listRowMinH: 56,
  iconBtn: 44,
} as const;

/** @deprecated Use SPACING */
export const LAYOUT = {
  unit: 8,
  padSm: SPACING.sm,
  padMd: SPACING.md,
  padLg: SPACING.lg,
  padXl: SPACING.xl,
  gapSection: SPACING.md,
  radiusSm: 6,
  radiusMd: 12,
  radiusLg: 16,
  radiusXl: 24,
  touchMin: SPACING.touchMin,
} as const;

// ── Border Radius ─────────────────────────────────────────────────────────────

export const RADIUS = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  /** Fully rounded — used for pills, badges, FABs. */
  full: 9999,
} as const;

// ── Elevation / Shadows ───────────────────────────────────────────────────────

export const SHADOW = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 6,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 12,
  },
  /** Green glow for CTA buttons. */
  glow: {
    shadowColor: '#22E180',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
} as const;

// ── Typography ────────────────────────────────────────────────────────────────

export const TYPOGRAPHY = {
  /** Large screen titles (onboarding, completion). */
  display: { fontSize: 32, fontWeight: '900' as const, letterSpacing: -0.5 },
  /** Section / screen headline. */
  headline: { fontSize: 24, fontWeight: '800' as const, letterSpacing: -0.3 },
  /** Card title, modal header. */
  title: { fontSize: 18, fontWeight: '700' as const },
  /** Sub-section header. */
  subhead: { fontSize: 16, fontWeight: '600' as const },
  /** Default body text. */
  body: { fontSize: 15, fontWeight: '400' as const, lineHeight: 22 },
  /** Supporting / caption text. */
  caption: { fontSize: 13, fontWeight: '500' as const, lineHeight: 18 },
  /** Label / badge. */
  label: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 0.5 },
  /** Fare / price display. */
  price: { fontSize: 28, fontWeight: '900' as const, letterSpacing: -1 },
};

// ── Animation ─────────────────────────────────────────────────────────────────

export const ANIMATION = {
  /** Standard UI transition duration (ms). */
  fast: 150,
  normal: 250,
  slow: 400,
  /** Easing function string for Animated.spring. */
  springConfig: {
    tension: 68,
    friction: 10,
    useNativeDriver: true,
  },
  /** Scale on press for all TouchableOpacity buttons. */
  pressScale: 0.97,
} as const;

// ── Home dashboards (legacy) ──────────────────────────────────────────────────

/** @deprecated Use BRAND tokens */
export const HOME_PALETTE = {
  accentIndigo: '#6366F1',
  accentIndigoDark: '#4F46E5',
  accentTeal: '#0E7490',
  cardShadowColor: '#000000',
  heroPurple: '#7C3AED',
  heroOrange: '#EA580C',
} as const;

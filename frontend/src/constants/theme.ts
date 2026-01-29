// NEXRYDE Theme - POLISHED & PREMIUM Design
// Sharper, Brighter, Clearer, More Visible
// Updated for maximum visual impact and clarity

export const COLORS = {
  // Primary - Deep Navy (Professional, Trust)
  primary: '#0F172A',           // Deep rich navy
  primaryDark: '#020617',       // Darker navy - almost black
  primaryLight: '#1E293B',      // Lighter navy
  
  // Accent Green - BRIGHTER & MORE VIBRANT
  accentGreen: '#22C55E',       // Vibrant green (brighter)
  accentGreenLight: '#4ADE80',  // Bright lime green
  accentGreenDark: '#16A34A',   // Darker green
  accentGreenSoft: 'rgba(34, 197, 94, 0.15)',
  accentGreenBright: '#00FF7F', // Neon green for highlights
  
  // Accent Blue - SHARPER & MORE VIVID
  accentBlue: '#3B82F6',        // Vivid blue
  accentBlueDark: '#1D4ED8',    // Deep blue
  accentBlueLight: '#60A5FA',   // Sky blue
  accentBlueSoft: 'rgba(59, 130, 246, 0.15)',
  accentBlueBright: '#38BDF8',  // Bright cyan-blue
  
  // Purple accent for premium features
  accentPurple: '#8B5CF6',
  accentPurpleLight: '#A78BFA',
  accentPurpleDark: '#7C3AED',
  accentPurpleSoft: 'rgba(139, 92, 246, 0.15)',
  
  // Gradients - MORE VIBRANT
  gradientGreenBlue: ['#4ADE80', '#22C55E', '#3B82F6', '#1D4ED8'],
  gradientGreen: ['#4ADE80', '#22C55E'],
  gradientBlue: ['#60A5FA', '#3B82F6'],
  gradientPrimary: ['#1E293B', '#0F172A'],
  gradientPremium: ['#8B5CF6', '#6366F1', '#3B82F6'],
  gradientSunset: ['#F59E0B', '#EF4444', '#EC4899'],
  gradientNeon: ['#00FF7F', '#22C55E', '#3B82F6'],
  
  // Backgrounds (Dark - for splash/login)
  background: '#020617',        // Rich black background
  surface: '#0F172A',           // Card surfaces
  surfaceLight: '#1E293B',      // Elevated surfaces
  surfaceGlass: 'rgba(15, 23, 42, 0.9)',
  
  // Light Theme - CLEANER & BRIGHTER
  lightBackground: '#FFFFFF',   // Pure white
  lightSurface: '#F8FAFC',      // Very light gray (cleaner)
  lightSurfaceAlt: '#F1F5F9',   // Slightly darker
  lightBorder: '#E2E8F0',       // Subtle border
  lightBorderStrong: '#CBD5E1', // Stronger border
  lightTextPrimary: '#0F172A',  // Rich black text (maximum contrast)
  lightTextSecondary: '#334155', // Dark gray (better readability)
  lightTextMuted: '#64748B',    // Medium gray
  lightTextLight: '#94A3B8',    // Light gray for hints
  
  // Text Colors
  white: '#FFFFFF',
  textPrimary: '#FFFFFF',
  textSecondary: '#CBD5E1',     // Brighter secondary text
  textMuted: '#94A3B8',         // More visible muted
  textTertiary: '#64748B',
  
  // Legacy support
  accent: '#22C55E',
  accentLight: '#4ADE80',
  accentDark: '#16A34A',
  accentSoft: 'rgba(34, 197, 94, 0.15)',
  
  // Semantic Colors - BRIGHTER
  success: '#22C55E',           // Vibrant green
  successSoft: 'rgba(34, 197, 94, 0.15)',
  successBright: '#4ADE80',
  error: '#EF4444',             // Bright red
  errorSoft: 'rgba(239, 68, 68, 0.15)',
  errorBright: '#F87171',
  warning: '#F59E0B',           // Bright amber
  warningSoft: 'rgba(245, 158, 11, 0.15)',
  warningBright: '#FBBF24',
  info: '#3B82F6',              // Vivid blue
  infoSoft: 'rgba(59, 130, 246, 0.15)',
  infoBright: '#60A5FA',
  
  // Neon/Glow Colors - For Animations & Highlights
  neonGreen: '#00FF7F',
  neonBlue: '#00D4FF',
  neonPurple: '#BF40BF',
  neonPink: '#FF10F0',
  glow1: '#4ADE80',
  glow2: '#22C55E',
  glow3: '#3B82F6',
  glow4: '#1D4ED8',
  glow5: '#60A5FA',
  
  // Grays - CLEANER
  gray50: '#F8FAFC',
  gray100: '#F1F5F9',
  gray200: '#E2E8F0',
  gray300: '#CBD5E1',
  gray400: '#94A3B8',
  gray500: '#64748B',
  gray600: '#475569',
  gray700: '#334155',
  gray800: '#1E293B',
  gray900: '#0F172A',
  
  // Overlay
  overlay: 'rgba(2, 6, 23, 0.95)',
  overlayLight: 'rgba(2, 6, 23, 0.7)',
  overlayMedium: 'rgba(2, 6, 23, 0.85)',
  
  // Gold - RICHER
  gold: '#F59E0B',
  goldLight: '#FBBF24',
  goldDark: '#D97706',
  goldSoft: 'rgba(245, 158, 11, 0.15)',
  
  // Premium Colors
  platinum: '#E5E7EB',
  diamond: '#A5F3FC',
  ruby: '#F87171',
  emerald: '#34D399',
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
  huge: 80,
};

export const FONT_SIZE = {
  xxs: 10,
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 26,    // Bigger for better visibility
  xxxl: 34,   // Bigger headings
  hero: 48,
  display: 64,
};

export const FONT_WEIGHT = {
  light: '300' as const,
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,
  black: '900' as const,
};

export const BORDER_RADIUS = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  full: 9999,
};

export const SHADOWS = {
  sm: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  xl: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 12,
  },
  glow: {
    shadowColor: '#22C55E',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
  glowBlue: {
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
  glowPurple: {
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
  gold: {
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  neon: {
    shadowColor: '#00FF7F',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 14,
  },
  card: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  button: {
    shadowColor: '#22C55E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
};

// Line heights for better readability
export const LINE_HEIGHT = {
  tight: 1.2,
  normal: 1.5,
  relaxed: 1.75,
  loose: 2,
};

export const CURRENCY = '₦';
export const SUBSCRIPTION_PRICE = 25000;

export default {
  COLORS,
  SPACING,
  FONT_SIZE,
  FONT_WEIGHT,
  BORDER_RADIUS,
  SHADOWS,
  LINE_HEIGHT,
  CURRENCY,
  SUBSCRIPTION_PRICE,
};

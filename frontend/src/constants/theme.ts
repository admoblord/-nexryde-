/**
 * KODA Premium Design System
 * A world-class, luxury design that rivals international apps
 * 
 * COLOR PHILOSOPHY:
 * - Obsidian (#0A0A0F): Deep, sophisticated dark for premium feel
 * - Royal Blue (#3B82F6): Trust, technology, reliability
 * - Sunset Gold (#F59E0B): Energy, warmth, Nigerian sun, premium accent
 */

export const COLORS = {
  // Primary - Royal Blue (Trust & Technology)
  primary: '#3B82F6',
  primaryDark: '#2563EB',
  primaryLight: '#60A5FA',
  primarySoft: 'rgba(59, 130, 246, 0.1)',
  
  // Secondary - Obsidian Dark (Premium & Sophisticated)
  secondary: '#0A0A0F',
  secondaryDark: '#050507',
  secondaryLight: '#1A1A24',
  secondaryMid: '#12121A',
  
  // Accent - Sunset Gold (Energy & Premium)
  accent: '#F59E0B',
  accentDark: '#D97706',
  accentLight: '#FBBF24',
  accentSoft: 'rgba(245, 158, 11, 0.1)',
  
  // Gradient Colors
  gradientStart: '#3B82F6',
  gradientMid: '#8B5CF6',
  gradientEnd: '#F59E0B',
  
  // Status Colors (Refined)
  success: '#10B981',
  successSoft: 'rgba(16, 185, 129, 0.1)',
  warning: '#F59E0B',
  warningSoft: 'rgba(245, 158, 11, 0.1)',
  error: '#EF4444',
  errorSoft: 'rgba(239, 68, 68, 0.1)',
  info: '#3B82F6',
  infoSoft: 'rgba(59, 130, 246, 0.1)',
  
  // Neutrals - Refined Gray Scale
  white: '#FFFFFF',
  black: '#000000',
  gray50: '#FAFAFA',
  gray100: '#F4F4F5',
  gray200: '#E4E4E7',
  gray300: '#D4D4D8',
  gray400: '#A1A1AA',
  gray500: '#71717A',
  gray600: '#52525B',
  gray700: '#3F3F46',
  gray800: '#27272A',
  gray900: '#18181B',
  
  // Backgrounds
  background: '#FAFAFA',
  backgroundDark: '#0A0A0F',
  surface: '#FFFFFF',
  surfaceDark: '#1A1A24',
  card: '#FFFFFF',
  cardDark: '#12121A',
  
  // Text Colors
  textPrimary: '#18181B',
  textSecondary: '#71717A',
  textTertiary: '#A1A1AA',
  textLight: '#FFFFFF',
  textMuted: '#A1A1AA',
  textOnPrimary: '#FFFFFF',
  textOnAccent: '#0A0A0F',
  
  // Special Purpose
  driver: '#10B981',
  driverSoft: 'rgba(16, 185, 129, 0.1)',
  rider: '#3B82F6',
  riderSoft: 'rgba(59, 130, 246, 0.1)',
  online: '#10B981',
  offline: '#EF4444',
  
  // Glass Effect
  glass: 'rgba(255, 255, 255, 0.8)',
  glassDark: 'rgba(10, 10, 15, 0.8)',
  
  // Overlay
  overlay: 'rgba(0, 0, 0, 0.5)',
  overlayLight: 'rgba(0, 0, 0, 0.3)',
};

export const SPACING = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
};

export const FONT_SIZE = {
  xxs: 10,
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  display: 40,
  hero: 56,
};

export const FONT_WEIGHT = {
  light: '300' as const,
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,
};

export const BORDER_RADIUS = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 40,
  full: 9999,
};

export const SHADOWS = {
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  xs: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
  xl: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
  },
  // Colored shadows for premium effect
  primary: {
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  accent: {
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  success: {
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
};

// Animation Timings
export const ANIMATION = {
  fast: 150,
  normal: 250,
  slow: 400,
  spring: {
    damping: 15,
    stiffness: 150,
  },
};

// Icon Sizes
export const ICON_SIZE = {
  xs: 16,
  sm: 20,
  md: 24,
  lg: 28,
  xl: 32,
  xxl: 40,
  hero: 56,
};

// Touch Target (Accessibility)
export const TOUCH_TARGET = {
  min: 44,
  comfortable: 48,
  large: 56,
};

// App Constants
export const SUBSCRIPTION_PRICE = 25000;
export const CURRENCY = '₦';

export const FARE_CONFIG = {
  baseFare: 800,
  perKmRate: 120,
  perMinRate: 20,
  maxSurge: 1.2,
};

// Premium Gradients
export const GRADIENTS = {
  primary: ['#3B82F6', '#2563EB'],
  accent: ['#F59E0B', '#D97706'],
  premium: ['#3B82F6', '#8B5CF6', '#F59E0B'],
  dark: ['#1A1A24', '#0A0A0F'],
  success: ['#10B981', '#059669'],
  sunset: ['#F59E0B', '#EF4444'],
  ocean: ['#3B82F6', '#06B6D4'],
};

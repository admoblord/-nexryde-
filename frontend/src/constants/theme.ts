/**
 * KODA Premium Design System
 * The Most Magnificent Ride-Hailing App in Nigeria
 * 
 * PREMIUM 3-COLOR PHILOSOPHY:
 * - Deep Obsidian (#0D0D0D): Luxury, sophistication, premium feel
 * - Electric Gold (#FFD700): Nigerian excellence, prosperity, energy
 * - Pure White (#FFFFFF): Clarity, trust, elegance
 */

export const COLORS = {
  // PRIMARY - Deep Obsidian (Luxury & Power)
  primary: '#0D0D0D',
  primaryDark: '#000000',
  primaryLight: '#1A1A1A',
  primaryMid: '#121212',
  
  // ACCENT - Electric Gold (Premium & Excellence)
  accent: '#FFD700',
  accentDark: '#E6C200',
  accentLight: '#FFE44D',
  accentSoft: 'rgba(255, 215, 0, 0.15)',
  accentMuted: '#C9A227',
  
  // PURE - Clean White (Clarity)
  pure: '#FFFFFF',
  pureOff: '#FAFAFA',
  pureSoft: '#F5F5F5',
  
  // Extended Palette
  secondary: '#1E1E1E',
  secondaryLight: '#2A2A2A',
  
  // Status Colors (Premium Tones)
  success: '#00D26A',
  successSoft: 'rgba(0, 210, 106, 0.12)',
  successDark: '#00B85C',
  
  warning: '#FFB800',
  warningSoft: 'rgba(255, 184, 0, 0.12)',
  
  error: '#FF3B30',
  errorSoft: 'rgba(255, 59, 48, 0.12)',
  
  info: '#007AFF',
  infoSoft: 'rgba(0, 122, 255, 0.12)',
  
  // Neutrals - Luxury Gray Scale
  white: '#FFFFFF',
  black: '#000000',
  gray50: '#FAFAFA',
  gray100: '#F5F5F5',
  gray200: '#E8E8E8',
  gray300: '#D1D1D1',
  gray400: '#9E9E9E',
  gray500: '#757575',
  gray600: '#545454',
  gray700: '#3D3D3D',
  gray800: '#262626',
  gray900: '#171717',
  
  // Backgrounds
  background: '#FAFAFA',
  backgroundDark: '#0D0D0D',
  surface: '#FFFFFF',
  surfaceDark: '#1A1A1A',
  card: '#FFFFFF',
  cardDark: '#1E1E1E',
  
  // Text Colors
  textPrimary: '#0D0D0D',
  textSecondary: '#545454',
  textTertiary: '#9E9E9E',
  textLight: '#FFFFFF',
  textMuted: '#757575',
  textGold: '#FFD700',
  textOnDark: '#FFFFFF',
  textOnGold: '#0D0D0D',
  
  // Special Purpose
  driver: '#00D26A',
  driverSoft: 'rgba(0, 210, 106, 0.12)',
  rider: '#007AFF',
  riderSoft: 'rgba(0, 122, 255, 0.12)',
  online: '#00D26A',
  offline: '#FF3B30',
  
  // Glassmorphism
  glass: 'rgba(255, 255, 255, 0.95)',
  glassDark: 'rgba(13, 13, 13, 0.95)',
  glassBlur: 'rgba(255, 255, 255, 0.8)',
  
  // Overlay
  overlay: 'rgba(0, 0, 0, 0.6)',
  overlayLight: 'rgba(0, 0, 0, 0.3)',
  overlayGold: 'rgba(255, 215, 0, 0.1)',
  
  // Borders
  border: '#E8E8E8',
  borderDark: '#2A2A2A',
  borderGold: 'rgba(255, 215, 0, 0.3)',
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
  huge: 80,
};

export const FONT_SIZE = {
  xxs: 10,
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 22,
  xxl: 28,
  xxxl: 36,
  display: 48,
  hero: 64,
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
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 8,
  },
  xl: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.16,
    shadowRadius: 32,
    elevation: 16,
  },
  // Gold glow effect
  gold: {
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  // Success glow
  success: {
    shadowColor: '#00D26A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
};

// Premium Gradients
export const GRADIENTS = {
  gold: ['#FFD700', '#FFC107', '#E6B800'],
  goldDark: ['#C9A227', '#B8941F', '#A68517'],
  dark: ['#1A1A1A', '#0D0D0D', '#000000'],
  darkReverse: ['#000000', '#0D0D0D', '#1A1A1A'],
  success: ['#00D26A', '#00B85C', '#009F4F'],
  premium: ['#FFD700', '#F5C400', '#E6B800'],
  night: ['#0D0D0D', '#1A1A1A', '#262626'],
};

// Animation Timings
export const ANIMATION = {
  instant: 100,
  fast: 200,
  normal: 300,
  slow: 500,
  spring: {
    damping: 15,
    stiffness: 120,
    mass: 1,
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

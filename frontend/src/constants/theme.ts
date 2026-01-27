// NEXRYDE Theme - Modern Road Journey Design
// A sleek, professional color palette inspired by the NEXRYDE logo
// Green represents growth & energy, Blue represents trust & technology

export const COLORS = {
  // Primary - Deep Navy (Professional, Trust)
  primary: '#19253F',           // Deep navy from logo background
  primaryDark: '#0F1729',       // Darker navy
  primaryLight: '#243654',      // Lighter navy
  
  // Accent Green - Energy & Growth (from logo)
  accentGreen: '#3AD173',       // Primary green
  accentGreenLight: '#80EE50',  // Bright lime green
  accentGreenDark: '#2BA858',   // Darker green
  accentGreenSoft: 'rgba(58, 209, 115, 0.15)',
  
  // Accent Blue - Technology & Trust (from logo)
  accentBlue: '#3A8CD1',        // Primary blue
  accentBlueDark: '#1A5AA6',    // Deep blue
  accentBlueLight: '#5BA3E0',   // Light blue
  accentBlueSoft: 'rgba(58, 140, 209, 0.15)',
  
  // Gradients for buttons and highlights
  gradientGreenBlue: ['#80EE50', '#3AD173', '#3A8CD1', '#1A5AA6'],
  gradientGreen: ['#80EE50', '#3AD173'],
  gradientBlue: ['#3A8CD1', '#1A5AA6'],
  gradientPrimary: ['#19253F', '#0F1729'],
  
  // Backgrounds (Dark - for splash/login)
  background: '#0D1420',        // Deep dark background
  surface: '#19253F',           // Card surfaces
  surfaceLight: '#243654',      // Elevated surfaces
  surfaceGlass: 'rgba(25, 37, 63, 0.8)',
  
  // Light Theme (White - for internal app screens)
  lightBackground: '#FFFFFF',   // Pure white background
  lightSurface: '#F5F7FA',      // Light gray cards
  lightSurfaceAlt: '#EDF1F7',   // Slightly darker cards
  lightBorder: '#E2E8F0',       // Border color
  lightTextPrimary: '#1A1A1A',  // Dark text
  lightTextSecondary: '#4A5568', // Medium gray text
  lightTextMuted: '#718096',    // Light gray text
  
  // Text Colors
  white: '#FFFFFF',
  textPrimary: '#FFFFFF',
  textSecondary: '#A8B8D0',     // Soft blue-gray
  textMuted: '#6B7A94',         // Muted blue-gray
  textTertiary: '#4A5568',
  
  // Legacy support - accent maps to green
  accent: '#3AD173',
  accentLight: '#80EE50',
  accentDark: '#2BA858',
  accentSoft: 'rgba(58, 209, 115, 0.15)',
  
  // Semantic Colors
  success: '#3AD173',           // Green success
  successSoft: 'rgba(58, 209, 115, 0.15)',
  error: '#E85454',             // Bright red
  errorSoft: 'rgba(232, 84, 84, 0.15)',
  warning: '#F5A623',           // Orange warning
  warningSoft: 'rgba(245, 166, 35, 0.15)',
  info: '#3A8CD1',              // Blue info
  infoSoft: 'rgba(58, 140, 209, 0.15)',
  
  // Particle/Glow Colors (For Animation)
  glow1: '#80EE50',             // Bright green
  glow2: '#3AD173',             // Medium green
  glow3: '#3A8CD1',             // Blue
  glow4: '#1A5AA6',             // Deep blue
  glow5: '#5BA3E0',             // Light blue
  
  // Grays (Cool tinted)
  gray50: '#F7FAFC',
  gray100: '#EDF2F7',
  gray200: '#E2E8F0',
  gray300: '#CBD5E0',
  gray400: '#A0AEC0',
  gray500: '#718096',
  gray600: '#4A5568',
  gray700: '#2D3748',
  gray800: '#1A202C',
  gray900: '#0D1117',
  
  // Overlay
  overlay: 'rgba(13, 20, 32, 0.9)',
  overlayLight: 'rgba(13, 20, 32, 0.6)',
  
  // Gold accent for premium features
  gold: '#F5A623',
  goldLight: '#FFD93D',
  goldSoft: 'rgba(245, 166, 35, 0.15)',
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  huge: 64,
  xxxl: 40,
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
  hero: 48,
  display: 56,
};

export const FONT_WEIGHT = {
  light: '300' as const,
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  black: '900' as const,
};

export const BORDER_RADIUS = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 36,
  full: 9999,
};

export const SHADOWS = {
  sm: {
    shadowColor: '#3AD173',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#3AD173',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#3AD173',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  glow: {
    shadowColor: '#3AD173',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 12,
  },
  glowBlue: {
    shadowColor: '#3A8CD1',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 12,
  },
  gold: {
    shadowColor: '#F5A623',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  neon: {
    shadowColor: '#80EE50',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 24,
    elevation: 16,
  },
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
  CURRENCY,
  SUBSCRIPTION_PRICE,
};

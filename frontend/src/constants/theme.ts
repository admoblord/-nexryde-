// NEXRYDE Premium Theme - Luxury Rose Collection
// A unique, never-before-seen color palette for Nigeria's premium ride platform

export const COLORS = {
  // Primary - Deep Wine/Burgundy (Luxurious, Unique)
  primary: '#1A0A0F',           // Deep wine black
  primaryDark: '#0D0508',       // Darker shade
  primaryLight: '#2D1219',      // Lighter shade
  
  // Accent - Rose Gold (Premium, Elegant)
  accent: '#C9A9A6',            // Dusty rose gold
  accentLight: '#E8D4D2',       // Light rose
  accentDark: '#9D7B78',        // Deep rose gold
  accentSoft: 'rgba(201, 169, 166, 0.15)',
  
  // Gold - Champagne (Luxury Touch)
  gold: '#D4AF37',              // Classic gold
  goldLight: '#F4E4BA',         // Light champagne
  goldSoft: 'rgba(212, 175, 55, 0.15)',
  
  // Rose Petals Colors (For Animation)
  rosePetal1: '#E8B4B8',        // Soft pink
  rosePetal2: '#D4919A',        // Medium rose
  rosePetal3: '#C9A9A6',        // Dusty rose
  rosePetal4: '#B76E79',        // Deep rose
  rosePetal5: '#8B5A5A',        // Dark rose
  
  // Backgrounds
  background: '#0F0709',        // Rich dark background
  surface: '#1A0D10',           // Card surfaces
  surfaceLight: '#251418',      // Elevated surfaces
  
  // Text Colors
  white: '#FDF8F8',             // Warm white
  textPrimary: '#FDF8F8',       // Primary text on dark
  textSecondary: '#C9A9A6',     // Secondary text (rose tint)
  textMuted: '#8B7577',         // Muted text
  
  // Semantic Colors
  success: '#7CB798',           // Soft sage green
  successSoft: 'rgba(124, 183, 152, 0.15)',
  error: '#D4626E',             // Soft rose red
  errorSoft: 'rgba(212, 98, 110, 0.15)',
  warning: '#D4AF37',           // Gold warning
  warningSoft: 'rgba(212, 175, 55, 0.15)',
  info: '#A6C9C9',              // Soft teal
  infoSoft: 'rgba(166, 201, 201, 0.15)',
  
  // Grays (Warm tinted)
  gray50: '#FDF8F8',
  gray100: '#F5ECED',
  gray200: '#E8DCDD',
  gray300: '#C9B8BA',
  gray400: '#9D8A8C',
  gray500: '#7A6A6C',
  gray600: '#5C4E50',
  gray700: '#3D3233',
  gray800: '#251A1C',
  gray900: '#130C0D',
  
  // Overlay
  overlay: 'rgba(13, 5, 8, 0.85)',
  overlayLight: 'rgba(13, 5, 8, 0.5)',
  
  // Gradients (CSS strings for web, array for native)
  gradientPrimary: ['#1A0A0F', '#2D1219', '#1A0A0F'],
  gradientRose: ['#C9A9A6', '#B76E79', '#8B5A5A'],
  gradientGold: ['#D4AF37', '#F4E4BA', '#D4AF37'],
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
    shadowColor: '#C9A9A6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#C9A9A6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#C9A9A6',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 8,
  },
  glow: {
    shadowColor: '#C9A9A6',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 12,
  },
  gold: {
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  rose: {
    shadowColor: '#B76E79',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 10,
  },
};

export const CURRENCY = '₦';

export default {
  COLORS,
  SPACING,
  FONT_SIZE,
  FONT_WEIGHT,
  BORDER_RADIUS,
  SHADOWS,
  CURRENCY,
};

export const COLORS = {
  // Primary
  primary: '#00C853',
  primaryDark: '#009624',
  primaryLight: '#5EFC82',
  
  // Secondary
  secondary: '#1A1A2E',
  secondaryDark: '#0F0F1A',
  secondaryLight: '#16213E',
  
  // Accent
  accent: '#FFD700',
  accentDark: '#FFC107',
  
  // Status
  success: '#00C853',
  warning: '#FF9800',
  error: '#FF5252',
  info: '#2196F3',
  
  // Neutrals
  white: '#FFFFFF',
  black: '#000000',
  gray100: '#F5F5F5',
  gray200: '#E0E0E0',
  gray300: '#BDBDBD',
  gray400: '#9E9E9E',
  gray500: '#757575',
  gray600: '#616161',
  gray700: '#424242',
  gray800: '#212121',
  
  // Backgrounds
  background: '#F5F5F5',
  surface: '#FFFFFF',
  card: '#FFFFFF',
  
  // Text
  textPrimary: '#1A1A2E',
  textSecondary: '#757575',
  textLight: '#FFFFFF',
  textMuted: '#9E9E9E',
  
  // Specific
  driver: '#00C853',
  rider: '#2196F3',
  online: '#00C853',
  offline: '#FF5252',
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const FONT_SIZE = {
  xs: 10,
  sm: 12,
  md: 14,
  lg: 16,
  xl: 18,
  xxl: 24,
  xxxl: 32,
  hero: 48,
};

export const FONT_WEIGHT = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
};

export const BORDER_RADIUS = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  xxl: 24,
  full: 9999,
};

export const SHADOWS = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
};

export const SUBSCRIPTION_PRICE = 25000;
export const CURRENCY = '₦';

export const FARE_CONFIG = {
  baseFare: 800,
  perKmRate: 120,
  perMinRate: 20,
  maxSurge: 1.2,
};

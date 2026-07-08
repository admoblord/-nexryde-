/**
 * Canonical NexRyde brand — re-exports designSystem tokens (single source of truth).
 */
import { APP_DISPLAY_NAME, BRAND } from '@/src/constants/designSystem';

export const NEXRYDE_BRAND = {
  name: APP_DISPLAY_NAME.toUpperCase(),
  green: BRAND.primary,
  greenEnd: BRAND.primaryDark,
  blue: BRAND.accentBlue,
  wordmark: {
    fontSize: 17,
    fontWeight: '900' as const,
    letterSpacing: 0.3,
  },
  logo: {
    size: 40,
    borderRadius: 20,
    iconSize: 20,
  },
} as const;

export type NexrydeBrandTheme = 'light' | 'dark';

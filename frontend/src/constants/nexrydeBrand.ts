/**
 * Canonical NEXRYDE brand — logo, wordmark, colors (single source of truth).
 */
export const NEXRYDE_BRAND = {
  name: 'NEXRYDE',
  green: '#00D084',
  greenEnd: '#00B85C',
  blue: '#0066FF',
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

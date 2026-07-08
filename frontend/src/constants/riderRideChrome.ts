/**
 * Rider booking + live-trip surfaces — CTA gradients and accents (designSystem).
 */
import { BRAND } from '@/src/constants/designSystem';

export const RIDER_PRIMARY_CTA_GRADIENT = [BRAND.primaryLight, BRAND.primaryDark] as const;

export const RIDER_MAP_PRIMARY_CTA_GRADIENT = [BRAND.primaryLight, BRAND.primary, BRAND.primaryDark] as const;

export const RIDER_HOME_DEST_BAR_BORDER = BRAND.primaryMuted;
export const RIDER_HOME_WALLET_BORDER = 'rgba(34,225,128,0.14)';

export const RIDER_FINDING_HANDLE_GRADIENT = [
  'rgba(109,255,195,0.55)',
  'rgba(0,102,255,0.28)',
  'rgba(109,255,195,0.5)',
] as const;

export const RIDER_FINDING_SHEET_BORDER = 'rgba(34,225,128,0.2)';
export const RIDER_FINDING_GLOW = BRAND.primaryLight;

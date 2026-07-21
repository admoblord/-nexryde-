/** NEXRYDE loading / splash brand tokens — sourced from designSystem. */
import { BRAND, SURFACE } from '@/src/constants/designSystem';

export const NEX_LOADING = {
  green: BRAND.primary,
  blue: BRAND.accentBlue,
  bg: BRAND.bgDeep,
  bgCard: SURFACE.glassSoft,
  white: BRAND.textPrimary,
  textGray: BRAND.textSecondary,
  darkGray: BRAND.textMuted,
  borderGray: 'rgba(148,163,184,0.22)',
  track: SURFACE.cardElevated,
} as const;

export type NexLoadingStepId = 'session' | 'loading' | 'preparing';

export const NEX_LOADING_STEPS: {
  id: NexLoadingStepId;
  label: string;
  description: string;
  icon: 'shield-checkmark' | 'flash' | 'person';
}[] = [
  {
    id: 'session',
    label: 'Checking session',
    description: 'Verifying your credentials…',
    icon: 'shield-checkmark',
  },
  {
    id: 'loading',
    label: 'Loading NEXRYDE',
    description: 'Initializing core modules…',
    icon: 'flash',
  },
  {
    id: 'preparing',
    label: 'Preparing experience',
    description: 'Setting things up just for you…',
    icon: 'person',
  },
];

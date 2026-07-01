/** NEXRYDE loading / splash brand tokens — use only these on the boot screen. */
export const NEX_LOADING = {
  green: '#00D084',
  blue: '#0066FF',
  bg: '#0F1419',
  bgCard: 'rgba(26, 35, 50, 0.65)',
  white: '#FFFFFF',
  textGray: '#9CA3AF',
  darkGray: '#6B7280',
  borderGray: '#4B5563',
  track: '#2d3e52',
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

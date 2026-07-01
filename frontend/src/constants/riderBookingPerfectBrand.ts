/** NEXRYDE Perfect Booking UI — hybrid palette */
import { HYBRID, HYBRID_PAD } from '@/src/constants/nexrydeHybridBrand';

export const BOOKING_PERFECT = {
  ...HYBRID,
  red: '#FF4444',
} as const;

export const BOOKING_PAD = HYBRID_PAD;
export const BOOKING_BID_STEP_LARGE = 5000;
export const BOOKING_BID_STEP_MED = 500;
export const BOOKING_BID_STEP_SMALL = 100;

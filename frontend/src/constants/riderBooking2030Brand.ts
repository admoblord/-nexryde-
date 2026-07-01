/** NEXRYDE Rider Booking — map-first UI tokens (aligned with hybrid design system). */
import { HYBRID } from '@/src/constants/nexrydeHybridBrand';

export const BOOKING_2030 = {
  green: HYBRID.green,
  blue: HYBRID.blue,
  purple: HYBRID.purple,
  yellow: HYBRID.yellow,
  navy: HYBRID.navy,
  text: HYBRID.text,
  muted: HYBRID.muted,
  glass: 'rgba(15, 20, 25, 0.72)',
  glassBorder: 'rgba(0, 208, 132, 0.28)',
} as const;

export type Booking2030FabId = 'rides' | 'schedule' | 'family';

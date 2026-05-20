import type { NormalizedTripStatus } from '@/src/utils/tripStatus';
import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';
import {
  isCashPaymentMethod,
  isWalletPaymentMethod,
  riderFinancialPaymentPending,
  type RiderTripDisplayOpts,
} from '@/src/utils/tripPaymentMethod';

type IonName = ComponentProps<typeof Ionicons>['name'];

export type RiderTripStep = {
  key: string;
  label: string;
};

export const RIDER_TRIP_STEPS: RiderTripStep[] = [
  { key: 'search', label: 'Search' },
  { key: 'match', label: 'Match' },
  { key: 'ride', label: 'Ride' },
  { key: 'done', label: 'Done' },
];

export function riderTripStepIndex(phase: NormalizedTripStatus): number {
  switch (phase) {
    case 'pending':
    case 'pending_driver_offers':
      return 0;
    case 'accepted':
    case 'arrived':
      return 1;
    case 'ongoing':
      return 2;
    case 'pending_payment':
      return 3;
    default:
      return 0;
  }
}

function financialPending(opts?: RiderTripDisplayOpts): boolean {
  if (opts?.financialPaymentPending != null) return opts.financialPaymentPending;
  return riderFinancialPaymentPending(opts?.tripStatus, opts?.paymentStatus);
}

export function riderTripStatusHeadline(phase: NormalizedTripStatus, opts?: RiderTripDisplayOpts): string {
  switch (phase) {
    case 'pending':
    case 'pending_driver_offers':
      return 'Finding your driver';
    case 'accepted':
      return 'Driver on the way';
    case 'arrived':
      return 'Driver has arrived';
    case 'ongoing':
      return 'Trip in progress';
    case 'pending_payment':
      if (!financialPending(opts)) return 'Trip complete';
      if (isCashPaymentMethod(opts?.paymentMethod)) return 'Cash trip complete';
      if (isWalletPaymentMethod(opts?.paymentMethod)) return 'Confirm wallet payment';
      return 'Complete payment';
    default:
      return 'Active trip';
  }
}

export function riderTripStatusSubtitle(phase: NormalizedTripStatus, opts?: RiderTripDisplayOpts): string {
  switch (phase) {
    case 'pending':
    case 'pending_driver_offers':
      return 'Matching you with nearby drivers. This usually takes under a minute.';
    case 'accepted':
      return 'Your driver is heading to the pickup point. Track them on the map.';
    case 'arrived':
      return 'Meet your driver at the pickup pin. Have your pick-up code ready.';
    case 'ongoing':
      return 'Enjoy your ride. Share your trip or open Safety anytime.';
    case 'pending_payment':
      if (!financialPending(opts)) {
        return 'Your trip ended. Confirm you arrived safely if prompted.';
      }
      if (isCashPaymentMethod(opts?.paymentMethod)) {
        return 'You paid with cash. Tap below to confirm payment with your driver.';
      }
      if (isWalletPaymentMethod(opts?.paymentMethod)) {
        return 'Your trip ended. Confirm payment from your wallet to finish.';
      }
      return 'Your trip ended. Complete payment to finish.';
    default:
      return 'Tap below for live map and trip details.';
  }
}

export function riderTripStatusIcon(phase: NormalizedTripStatus, opts?: RiderTripDisplayOpts): IonName {
  switch (phase) {
    case 'pending':
    case 'pending_driver_offers':
      return 'radio-outline';
    case 'accepted':
      return 'navigate';
    case 'arrived':
      return 'location';
    case 'ongoing':
      return 'car-sport';
    case 'pending_payment':
      if (!financialPending(opts)) return 'checkmark-circle';
      if (isCashPaymentMethod(opts?.paymentMethod)) return 'cash';
      return 'card';
    default:
      return 'ellipse';
  }
}

export function riderTripCanCancel(phase: NormalizedTripStatus): boolean {
  return phase === 'pending' || phase === 'pending_driver_offers' || phase === 'accepted';
}

export function riderTripHasDriver(phase: NormalizedTripStatus): boolean {
  return ['accepted', 'arrived', 'ongoing', 'pending_payment'].includes(phase);
}

export function riderTripIsSearching(phase: NormalizedTripStatus): boolean {
  return phase === 'pending' || phase === 'pending_driver_offers';
}

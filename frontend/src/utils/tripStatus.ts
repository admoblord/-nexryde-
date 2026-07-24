import { isCashPaymentMethod } from '@/src/utils/tripPaymentMethod';

export type NormalizedTripStatus =
  | 'pending'
  | 'pending_driver_offers'
  | 'accepted'
  | 'arrived'
  | 'ongoing'
  | 'pending_payment'
  | 'completed'
  | 'cancelled';

export const normalizeTripStatus = (status?: string, paymentStatus?: string): NormalizedTripStatus => {
  const raw = String(status || '').toLowerCase();

  if (raw === 'completed' && String(paymentStatus || '').toLowerCase() === 'pending') {
    return 'pending_payment';
  }

  if (raw === 'in_progress' || raw === 'started') return 'ongoing';
  if (raw === 'pickup') return 'arrived';
  // Backend watchdog marks stranded/no-driver trips as terminal. Treat these as
  // ended (not "pending") so the rider stops "finding driver" and can rebook —
  // otherwise the finding UI spins forever and book.tsx keeps redirecting back.
  if (
    raw === 'expired' ||
    raw === 'no_drivers_found' ||
    raw === 'no_driver_found' ||
    raw === 'timed_out' ||
    raw === 'timeout'
  ) {
    return 'cancelled';
  }
  if (
    raw === 'pending' ||
    raw === 'pending_driver_offers' ||
    raw === 'accepted' ||
    raw === 'arrived' ||
    raw === 'ongoing' ||
    raw === 'pending_payment' ||
    raw === 'completed' ||
    raw === 'cancelled'
  ) {
    return raw;
  }

  return 'pending';
};

/**
 * Rider UI status: cash completed trips stay terminal even if payment_status lags.
 * Wallet/transfer still map completed+pending → pending_payment.
 */
export function resolveRiderScreenStatus(
  rawStatus: unknown,
  paymentStatus: unknown,
  paymentMethod: unknown,
): NormalizedTripStatus {
  const raw = String(rawStatus || '').toLowerCase();
  if (raw === 'completed' && isCashPaymentMethod(paymentMethod as string | null | undefined)) {
    return 'completed';
  }
  return normalizeTripStatus(
    rawStatus as string | undefined,
    paymentStatus as string | undefined,
  );
}

export const isActiveTripStatus = (status?: string, paymentStatus?: string): boolean => {
  const normalized = normalizeTripStatus(status, paymentStatus);
  return ['pending', 'pending_driver_offers', 'accepted', 'arrived', 'ongoing', 'pending_payment'].includes(normalized);
};


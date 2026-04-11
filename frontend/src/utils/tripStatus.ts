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

export const isActiveTripStatus = (status?: string, paymentStatus?: string): boolean => {
  const normalized = normalizeTripStatus(status, paymentStatus);
  return ['pending', 'pending_driver_offers', 'accepted', 'arrived', 'ongoing', 'pending_payment'].includes(normalized);
};


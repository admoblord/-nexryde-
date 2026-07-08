/**
 * Typed helpers for the unified offline action queue.
 */
import { enqueue } from '@/src/utils/offlineQueue';

function actionId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function queueTripRequest(
  riderId: string,
  body: Record<string, unknown>,
): Promise<void> {
  const { auth_token: _t, rider_id: _r, ...payload } = body;
  await enqueue({
    id: actionId('trip'),
    url: `/api/trips/request?rider_id=${encodeURIComponent(riderId)}`,
    method: 'POST',
    body: { rider_id: riderId, ...payload },
    queuedAt: Date.now(),
    maxRetries: 3,
    label: 'trip_request',
  });
}

export async function queueDriverAccept(
  tripId: string,
  body: {
    driver_id: string;
    offer_id?: string;
    proposed_fare: number;
  },
): Promise<void> {
  await enqueue({
    id: actionId('accept'),
    url: `/api/trips/${encodeURIComponent(tripId)}/accept`,
    method: 'PUT',
    body,
    queuedAt: Date.now(),
    maxRetries: 3,
    label: 'driver_accept_trip',
  });
}

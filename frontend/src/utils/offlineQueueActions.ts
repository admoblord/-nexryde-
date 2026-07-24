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
    client_event_id?: string;
  },
): Promise<void> {
  await enqueue({
    id: actionId('accept'),
    url: `/api/trips/${encodeURIComponent(tripId)}/accept`,
    method: 'PUT',
    body: {
      ...body,
      client_event_id: body.client_event_id || `accept:${tripId}:${body.driver_id}`,
    },
    queuedAt: Date.now(),
    maxRetries: 5,
    label: 'driver_accept_trip',
  });
}

export async function queueDriverDecline(
  offerId: string,
  body: { driver_id: string; client_event_id?: string },
): Promise<void> {
  await enqueue({
    id: actionId('decline'),
    url: `/api/trips/offers/${encodeURIComponent(offerId)}/decline`,
    method: 'PUT',
    body: {
      ...body,
      client_event_id: body.client_event_id || `decline:${offerId}:${body.driver_id}`,
    },
    queuedAt: Date.now(),
    maxRetries: 5,
    label: 'driver_decline_offer',
  });
}

export async function queueDriverComplete(tripId: string): Promise<void> {
  await enqueue({
    id: actionId('complete'),
    url: `/api/trips/${encodeURIComponent(tripId)}/complete`,
    method: 'PUT',
    body: {},
    queuedAt: Date.now(),
    maxRetries: 8,
    label: 'driver_complete_trip',
  });
}

export async function queueDriverCancel(
  tripId: string,
  body: { cancelled_by?: string; reason?: string; client_event_id?: string },
): Promise<void> {
  await enqueue({
    id: actionId('cancel'),
    url: `/api/trips/${encodeURIComponent(tripId)}/cancel`,
    method: 'PUT',
    body: {
      ...body,
      client_event_id: body.client_event_id || `cancel:${tripId}`,
    },
    queuedAt: Date.now(),
    maxRetries: 5,
    label: 'trip_cancel',
  });
}

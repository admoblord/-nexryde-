/**
 * Hardened driver trip accept pipeline (Uber/Bolt pattern):
 *  1. Preflight session (proactive refresh, never unauthenticated PUT)
 *  2. Single in-flight accept per trip (debounce hammer-taps)
 *  3. Post-error reconciliation (timeout/network → verify assignment)
 *  4. Typed outcomes for UI (no misleading "offer expired" on auth failures)
 */
import { apiFetch, ApiTimeoutError } from '@/src/utils/sessionRefresh';
import {
  criticalSessionFailureMessage,
  ensureCriticalSessionReady,
} from '@/src/lib/sessionReadiness';
import { mapAcceptErrorMessage } from '@/src/utils/tripAssignment';
import { verifyDriverTripAssignment } from '@/src/utils/verifyDriverTripAssignment';

export type DriverAcceptTripParams = {
  tripId: string;
  driverId: string;
  offerId?: string;
  proposedFare: number;
};

export type DriverAcceptTripOutcome =
  | { status: 'accepted'; trip: Record<string, unknown> }
  | { status: 'reconciled'; trip: Record<string, unknown> }
  | { status: 'session_expired'; message: string }
  | { status: 'failed'; message: string; httpStatus?: number };

const inFlightByTrip = new Map<string, Promise<DriverAcceptTripOutcome>>();

function acceptBody(params: DriverAcceptTripParams): Record<string, unknown> {
  return {
    driver_id: params.driverId,
    offer_id: params.offerId,
    proposed_fare: params.proposedFare,
  };
}

async function performAccept(params: DriverAcceptTripParams): Promise<DriverAcceptTripOutcome> {
  const session = await ensureCriticalSessionReady();
  if (!session.ok) {
    return {
      status: 'session_expired',
      message: criticalSessionFailureMessage(session.reason),
    };
  }

  const path = `/trips/${encodeURIComponent(params.tripId)}/accept`;
  try {
    const res = await apiFetch(path, {
      method: 'PUT',
      body: JSON.stringify(acceptBody(params)),
      preserveSessionOn401: true,
    });
    let data: Record<string, unknown> = {};
    try {
      data = (await res.json()) as Record<string, unknown>;
    } catch {
      /* empty body */
    }

    if (res.ok) {
      return { status: 'accepted', trip: data };
    }

    if (res.status === 401) {
      return {
        status: 'session_expired',
        message: criticalSessionFailureMessage('expired'),
      };
    }

    return {
      status: 'failed',
      httpStatus: res.status,
      message: mapAcceptErrorMessage(data?.detail, res.status),
    };
  } catch (e) {
    const isTimeout = e instanceof ApiTimeoutError || (e instanceof Error && e.message === 'timeout');
    if (isTimeout || (e instanceof Error && /network|fetch|offline/i.test(e.message))) {
      const verified = await verifyDriverTripAssignment(params.driverId, params.tripId);
      if (verified.assigned && verified.trip) {
        return { status: 'reconciled', trip: verified.trip };
      }
      return {
        status: 'failed',
        message: mapAcceptErrorMessage(null, 408),
      };
    }
    throw e;
  }
}

/** Accept a trip offer — at most one in-flight request per tripId. */
export function acceptDriverTripOffer(params: DriverAcceptTripParams): Promise<DriverAcceptTripOutcome> {
  const key = params.tripId;
  const existing = inFlightByTrip.get(key);
  if (existing) return existing;

  const job = performAccept(params).finally(() => {
    if (inFlightByTrip.get(key) === job) {
      inFlightByTrip.delete(key);
    }
  });
  inFlightByTrip.set(key, job);
  return job;
}

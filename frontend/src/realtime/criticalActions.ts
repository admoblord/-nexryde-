/**
 * Critical reliability actions — local audit log + ACK + offline queue.
 * No silent failures: every accept/decline/complete/online/offline is recorded.
 * Hot paths never await AsyncStorage / sync before the network call returns.
 */
import {
  appendLocalEvent,
  ackToServer,
  syncLocalEvents,
} from '@/src/realtime/eventLog';
import {
  queueDriverAccept,
  queueDriverComplete,
  queueDriverDecline,
  queueDriverCancel,
} from '@/src/utils/offlineQueueActions';

function clientEventId(kind: string, ...parts: string[]): string {
  return [kind, ...parts.filter(Boolean)].join(':');
}

function queueLocalEvent(
  partial: Parameters<typeof appendLocalEvent>[0],
): void {
  void appendLocalEvent(partial).catch(() => {
    /* best-effort audit */
  });
}

function isTransientNetworkError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const err = e as {
    message?: string;
    code?: string;
    name?: string;
    response?: { status?: number };
  };
  if (err.response?.status != null) return false; // HTTP error from server — not offline
  const msg = String(err.message || '').toLowerCase();
  const code = String(err.code || '').toLowerCase();
  return (
    err.name === 'ApiTimeoutError' ||
    code === 'econnaborted' ||
    code === 'err_network' ||
    /timeout|network|offline|failed to fetch|network error/.test(msg)
  );
}

export async function recordOnline(actorId: string, sessionId?: string): Promise<string> {
  const ev = await appendLocalEvent({
    event_type: 'ONLINE',
    actor_id: actorId,
    payload: { session_id: sessionId || '' },
    idempotency_key: clientEventId('online', actorId, sessionId || String(Date.now())),
    ttlSec: 120,
  });
  void ackToServer(ev.event_id, { event_type: 'ONLINE' });
  return ev.event_id;
}

export async function recordOffline(actorId: string): Promise<string> {
  const ev = await appendLocalEvent({
    event_type: 'OFFLINE',
    actor_id: actorId,
    idempotency_key: clientEventId('offline', actorId, String(Date.now())),
    ttlSec: 120,
  });
  void ackToServer(ev.event_id, { event_type: 'OFFLINE' });
  return ev.event_id;
}

/** Offer ACK — never block offer paint; storage + server ACK run in background. */
export async function recordOfferAck(
  actorId: string,
  offerId: string,
  eventId?: string,
): Promise<void> {
  const eid =
    eventId ||
    clientEventId('offer_ack', offerId, actorId, String(Date.now()));
  queueLocalEvent({
    event_type: 'DELIVERY_ACK',
    actor_id: actorId,
    offer_id: offerId,
    idempotency_key: clientEventId('offer_ack', offerId, actorId),
    status: eventId ? 'acked' : 'pending',
  });
  void ackToServer(eid, { event_type: 'RIDE_OFFER', offer_id: offerId });
}

export async function reliableAccept(opts: {
  tripId: string;
  driverId: string;
  offerId?: string;
  proposedFare: number;
  acceptFn: () => Promise<unknown>;
}): Promise<{ ok: boolean; queued: boolean }> {
  const idem = clientEventId('accept', opts.tripId, opts.driverId);
  queueLocalEvent({
    event_type: 'ACCEPT',
    actor_id: opts.driverId,
    trip_id: opts.tripId,
    offer_id: opts.offerId,
    idempotency_key: idem,
    payload: { proposed_fare: opts.proposedFare },
  });
  try {
    await opts.acceptFn();
    void syncLocalEvents();
    return { ok: true, queued: false };
  } catch (e) {
    if (isTransientNetworkError(e)) {
      await queueDriverAccept(opts.tripId, {
        driver_id: opts.driverId,
        offer_id: opts.offerId,
        proposed_fare: opts.proposedFare,
        client_event_id: idem,
      });
      return { ok: false, queued: true };
    }
    throw e;
  }
}

export async function reliableDecline(opts: {
  offerId: string;
  driverId: string;
  declineFn: () => Promise<unknown>;
}): Promise<{ ok: boolean; queued: boolean }> {
  const idem = clientEventId('decline', opts.offerId, opts.driverId);
  queueLocalEvent({
    event_type: 'DECLINE',
    actor_id: opts.driverId,
    offer_id: opts.offerId,
    idempotency_key: idem,
  });
  try {
    await opts.declineFn();
    void syncLocalEvents();
    return { ok: true, queued: false };
  } catch (e) {
    if (isTransientNetworkError(e)) {
      await queueDriverDecline(opts.offerId, {
        driver_id: opts.driverId,
        client_event_id: idem,
      });
      return { ok: false, queued: true };
    }
    throw e;
  }
}

export async function reliableComplete(opts: {
  tripId: string;
  driverId: string;
  completeFn: () => Promise<unknown>;
}): Promise<{ ok: boolean; queued: boolean }> {
  queueLocalEvent({
    event_type: 'END_TRIP',
    actor_id: opts.driverId,
    trip_id: opts.tripId,
    idempotency_key: clientEventId('complete', opts.tripId, opts.driverId),
  });
  try {
    await opts.completeFn();
    void syncLocalEvents();
    return { ok: true, queued: false };
  } catch (e) {
    if (isTransientNetworkError(e)) {
      await queueDriverComplete(opts.tripId);
      return { ok: false, queued: true };
    }
    throw e;
  }
}

export async function reliableCancel(opts: {
  tripId: string;
  actorId: string;
  reason?: string;
  cancelFn: () => Promise<unknown>;
}): Promise<{ ok: boolean; queued: boolean }> {
  const idem = clientEventId('cancel', opts.tripId, opts.actorId);
  queueLocalEvent({
    event_type: 'DELIVERY_ACK',
    actor_id: opts.actorId,
    trip_id: opts.tripId,
    idempotency_key: idem,
    payload: { action: 'cancel', reason: opts.reason || '' },
  });
  try {
    await opts.cancelFn();
    void syncLocalEvents();
    return { ok: true, queued: false };
  } catch (e) {
    // Only queue genuine network/timeout failures. A server rejection (401/403/
    // 400 "cannot cancel") must surface to the caller — queuing it would show a
    // false "saved offline" and replay a cancel the server already refused.
    if (isTransientNetworkError(e)) {
      await queueDriverCancel(opts.tripId, {
        cancelled_by: opts.actorId,
        reason: opts.reason,
        client_event_id: idem,
      });
      return { ok: false, queued: true };
    }
    throw e;
  }
}

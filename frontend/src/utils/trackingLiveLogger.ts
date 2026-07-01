/** Structured console logs for live driver tracking audits (Steps 1–3). */

type TrackingLogPayload = Record<string, unknown>;

function emit(tag: string, payload?: TrackingLogPayload) {
  if (__DEV__) {
    if (payload && Object.keys(payload).length > 0) {
      console.log(`[${tag}]`, payload);
    } else {
      console.log(`[${tag}]`);
    }
  }
}

export function logLocationSent(payload: TrackingLogPayload) {
  emit('LOCATION_SENT', payload);
}

export function logLocationReceived(payload: TrackingLogPayload) {
  emit('LOCATION_RECEIVED', payload);
}

export function logLocationUpdated(payload: TrackingLogPayload) {
  emit('LOCATION_UPDATED', payload);
}

export function logDriverLocationEvent(payload: TrackingLogPayload) {
  emit('DRIVER_LOCATION_EVENT', payload);
}

export function logSubscribedToDriver(payload: TrackingLogPayload) {
  emit('SUBSCRIBED_TO_DRIVER', payload);
}

export function logReceivedDriverUpdate(payload: TrackingLogPayload) {
  emit('RECEIVED_DRIVER_UPDATE', payload);
}

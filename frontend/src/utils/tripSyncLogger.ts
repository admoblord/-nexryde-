/** Structured console logs for trip acceptance sync audits. */

type Payload = Record<string, unknown>;

function emit(event: string, payload?: Payload) {
  if (__DEV__) {
    if (payload && Object.keys(payload).length > 0) {
      console.log(`[${event}]`, payload);
    } else {
      console.log(`[${event}]`);
    }
  }
}

export function logTripCreated(payload: Payload) {
  emit('TRIP_CREATED', payload);
}
export function logTripBroadcasted(payload: Payload) {
  emit('TRIP_BROADCASTED', payload);
}
export function logDriverAcceptClicked(payload: Payload) {
  emit('DRIVER_ACCEPT_CLICKED', payload);
}
export function logAssignmentStarted(payload: Payload) {
  emit('ASSIGNMENT_STARTED', payload);
}
export function logAssignmentSuccess(payload: Payload) {
  emit('ASSIGNMENT_SUCCESS', payload);
}
export function logAssignmentFailed(payload: Payload) {
  emit('ASSIGNMENT_FAILED', payload);
}
export function logRiderNotified(payload: Payload) {
  emit('RIDER_NOTIFIED', payload);
}
export function logRiderAssignmentEvent(payload: Payload) {
  emit('RIDER_ASSIGNMENT_EVENT', payload);
}
export function logDriverNotified(payload: Payload) {
  emit('DRIVER_NOTIFIED', payload);
}

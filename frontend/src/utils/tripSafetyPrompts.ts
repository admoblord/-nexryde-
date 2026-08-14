/**
 * In-trip Auto Stop Safety Check + driver stop-reason prompt rules.
 *
 * Mirror of backend/safety_check_prompts.py so the rider 'Are you safe?'
 * modal and the driver stop-reason sheet agree with the server.
 */

export type GuardianAlert = {
  active?: boolean;
  type?: string;
  message?: string;
  reason?: string;
  driver_reason?: string;
  check_id?: string;
  stop_duration_seconds?: number;
  escalated?: boolean;
  rider_response?: string;
  triggered_at?: string;
  stop_reason_submitted_at?: string;
} | null;

export type DriverStopReason = {
  reason?: string;
  submitted_at?: string;
} | null;

const RIDER_SAFETY_CHECK_TYPES = new Set(['abnormal_stop', 'safety_check']);

export function riderSafetyCheckIsActive(alert?: GuardianAlert): boolean {
  if (!alert || alert.active === false) return false;
  if (alert.rider_response) return false;
  const t = String(alert.type || '');
  if (RIDER_SAFETY_CHECK_TYPES.has(t)) return true;
  return Boolean(alert.check_id);
}

export function driverStopReasonIsNeeded(
  alert?: GuardianAlert,
  stopReason?: DriverStopReason,
): boolean {
  if (!riderSafetyCheckIsActive(alert)) return false;
  const submittedAt = stopReason?.submitted_at;
  if (!submittedAt) return true;
  const triggeredAt = alert?.triggered_at || alert?.stop_reason_submitted_at;
  if (!triggeredAt) return false;
  return String(submittedAt) < String(triggeredAt);
}

export const DRIVER_STOP_REASON_CHOICES: Array<{
  id: string;
  label: string;
  description: string;
  icon: 'car' | 'warning' | 'shield' | 'flash' | 'person' | 'ellipsis-horizontal';
  reason: string;
  needsDetail?: boolean;
}> = [
  {
    id: 'traffic',
    label: 'Heavy traffic',
    description: 'Stuck or crawling in traffic',
    icon: 'car',
    reason: 'Heavy traffic',
  },
  {
    id: 'accident',
    label: 'Accident ahead',
    description: 'Crash, blockage or emergency vehicles',
    icon: 'warning',
    reason: 'Accident ahead',
  },
  {
    id: 'checkpoint',
    label: 'Police checkpoint',
    description: 'Stopped by police or a road check',
    icon: 'shield',
    reason: 'Police checkpoint',
  },
  {
    id: 'fuel',
    label: 'Fuel or rest stop',
    description: 'Quick stop for fuel or a break',
    icon: 'flash',
    reason: 'Fuel or rest stop',
  },
  {
    id: 'rider',
    label: 'Rider asked to stop',
    description: 'Passenger requested a pause',
    icon: 'person',
    reason: 'Rider asked to stop',
  },
  {
    id: 'other',
    label: 'Other',
    description: 'Tell the rider in your own words',
    icon: 'ellipsis-horizontal',
    reason: '',
    needsDetail: true,
  },
];

export function applySafetyPushToTrip<T extends {
  id?: string;
  guardian_alert?: GuardianAlert;
}>(
  trip: T | null,
  raw: Record<string, unknown> | null | undefined,
): T | null {
  if (!trip || !raw) return trip;
  const tripId = typeof raw.trip_id === 'string' ? raw.trip_id : '';
  if (!tripId || tripId !== trip.id) return trip;
  const type = typeof raw.type === 'string' ? raw.type : '';
  const checkId = typeof raw.check_id === 'string' ? raw.check_id : undefined;
  if (type === 'safety_check' || type === 'abnormal_stop') {
    if (trip.guardian_alert?.active && trip.guardian_alert?.check_id) return trip;
    return {
      ...trip,
      guardian_alert: {
        active: true,
        type: 'abnormal_stop',
        check_id: checkId,
        message: 'We noticed your driver stopped for a while. Are you safe?',
        triggered_at: new Date().toISOString(),
      },
    };
  }
  if (type === 'stop_reason_requested') {
    if (trip.guardian_alert?.active) return trip;
    return {
      ...trip,
      guardian_alert: {
        active: true,
        type: 'abnormal_stop',
        check_id: checkId,
        message: 'We noticed a long stop. Share why you stopped.',
        triggered_at: new Date().toISOString(),
      },
    };
  }
  return trip;
}

import type { Trip } from '@/src/store/appStore';

const LEGACY_STATUS_ORDER: Record<string, number> = {
  pending: 10,
  pending_driver_offers: 20,
  accepted: 30,
  arrived: 40,
  ongoing: 50,
  completed: 60,
  pending_payment: 65,
  cancelled: 90,
};

function numeric(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function timestamp(value: unknown): number | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function versionOf(trip: Partial<Trip> | null | undefined): number | null {
  return numeric((trip as Record<string, unknown> | null | undefined)?.ride_version);
}

function sequenceOf(trip: Partial<Trip> | null | undefined): number | null {
  const raw = trip as Record<string, unknown> | null | undefined;
  return numeric(raw?.state_sequence ?? raw?.ride_sequence);
}

function updatedAtOf(trip: Partial<Trip> | null | undefined): number | null {
  const raw = trip as Record<string, unknown> | null | undefined;
  return (
    timestamp(raw?.updated_at) ??
    timestamp(raw?.state_updated_at) ??
    timestamp(raw?.accepted_at) ??
    timestamp(raw?.arrived_at) ??
    timestamp(raw?.started_at) ??
    timestamp(raw?.completed_at) ??
    timestamp(raw?.created_at)
  );
}

function statusRank(trip: Partial<Trip> | null | undefined): number {
  const raw = String(trip?.status || '').toLowerCase();
  return LEGACY_STATUS_ORDER[raw] ?? 0;
}

/**
 * Latest authoritative ride update wins. Prefer backend ride_version / sequence,
 * then server timestamps, then monotonic status order for legacy payloads.
 */
export function shouldApplyTripUpdate(
  current: Trip | null,
  incoming: Trip | null
): boolean {
  if (!incoming) return true;
  if (!current) return true;
  if (String(current.id) !== String(incoming.id)) return true;

  const currentVersion = versionOf(current);
  const incomingVersion = versionOf(incoming);
  if (currentVersion !== null || incomingVersion !== null) {
    return (incomingVersion ?? 0) >= (currentVersion ?? 0);
  }

  const currentSequence = sequenceOf(current);
  const incomingSequence = sequenceOf(incoming);
  if (currentSequence !== null || incomingSequence !== null) {
    return (incomingSequence ?? 0) >= (currentSequence ?? 0);
  }

  const currentUpdated = updatedAtOf(current);
  const incomingUpdated = updatedAtOf(incoming);
  if (currentUpdated !== null || incomingUpdated !== null) {
    return (incomingUpdated ?? 0) >= (currentUpdated ?? 0);
  }

  return statusRank(incoming) >= statusRank(current);
}

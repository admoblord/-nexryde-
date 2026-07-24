/**
 * Uber RAMEN-lite wire formats:
 * - Compact location: { t:"loc", i, la, ln, h, s, e, d, st, ts, rv, sq }
 * - Legacy: { type:"trip_update", ... }
 */
import type { RiderTripWsMessage } from '@/src/services/riderTripTypes';

type CompactLoc = {
  t?: string;
  type?: string;
  i?: string;
  trip_id?: string;
  st?: string;
  status?: string;
  la?: number;
  ln?: number;
  h?: number;
  s?: number;
  e?: number;
  d?: number;
  ts?: string;
  rv?: number;
  sq?: number;
};

export function expandUberRealtimePayload(raw: unknown): RiderTripWsMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const msg = raw as CompactLoc & RiderTripWsMessage;
  const kind = msg.t || msg.type;
  if (kind === 'loc') {
    return {
      type: 'trip_update',
      trip_id: msg.i || msg.trip_id,
      status: msg.st || msg.status,
      ride_version: msg.rv,
      state_sequence: msg.sq,
      driver_location: {
        lat: Number(msg.la),
        lng: Number(msg.ln),
        heading: msg.h != null ? Number(msg.h) : undefined,
        speed_kmh: msg.s != null ? Number(msg.s) : undefined,
        updated_at: msg.ts,
        eta_seconds: msg.e != null ? Number(msg.e) : undefined,
        distance_km: msg.d != null ? Number(msg.d) : undefined,
      },
      eta_seconds: msg.e != null ? Number(msg.e) : undefined,
      distance_remaining_km: msg.d != null ? Number(msg.d) : undefined,
      distance_remaining: msg.d != null ? Number(msg.d) : undefined,
      speed_kmh: msg.s != null ? Number(msg.s) : undefined,
      timestamp: msg.ts,
    };
  }
  if (kind === 'trip_update') {
    return msg as RiderTripWsMessage;
  }
  return null;
}

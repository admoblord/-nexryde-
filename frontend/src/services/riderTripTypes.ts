/**
 * Rider trip WebSocket types and URL helpers (shared by hook + singleton manager).
 */
import { BACKEND_URL } from '@/src/services/api';

export function getBackendWsBaseUrl(): string {
  const url = BACKEND_URL.replace(/\/$/, '');
  if (url.startsWith('https://')) return url.replace('https://', 'wss://');
  if (url.startsWith('http://')) return url.replace('http://', 'ws://');
  return `wss://${url}`;
}

export type RiderTripWsMessage = {
  type: string;
  trip_id?: string;
  status?: string;
  ride_version?: number;
  state_sequence?: number;
  state_updated_at?: string;
  trip?: Record<string, unknown>;
  driver_location?: {
    lat: number;
    lng: number;
    updated_at?: string;
    heading?: number;
    speed_kmh?: number;
    eta_seconds?: number;
    distance_km?: number;
    status?: string;
  } | null;
  eta_seconds?: number;
  distance_remaining_km?: number;
  distance_remaining?: number;
  speed_kmh?: number;
  timestamp?: string;
};

import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import { BACKEND_URL } from '@/src/services/api';
import { getValidToken } from '@/src/lib/tokenStore';

type NativeDriverModule = {
  startDriverService?: (driverId?: string | null, token?: string | null, backendUrl?: string | null) => void;
  updateDriverSession?: (token?: string | null, backendUrl?: string | null) => void;
  stopDriverService?: () => void;
  showRideAlert?: (payload: Record<string, string>) => void;
  stopRideAlert?: () => void;
  showBubble?: (status: string, badge: number) => void;
  updateBubble?: (status: string, badge: number, payload?: Record<string, string>) => void;
  hideBubble?: () => void;
  hasOverlayPermission?: () => Promise<boolean>;
  requestOverlayPermission?: () => void;
};

export type DriverNativeAction = {
  action?: 'accept_offer' | 'decline_offer' | 'open_navigation' | string;
  tripId?: string;
  offerId?: string;
};

type NativeOfferPayload = {
  tripId: string;
  offerId: string;
  riderName: string;
  pickup: string;
  fare: string;
  eta: string;
  distance: string;
};

const nativeModule: NativeDriverModule | null =
  Platform.OS === 'android' ? (NativeModules.DriverExperienceModule as NativeDriverModule | undefined) ?? null : null;

const emitter =
  Platform.OS === 'android' && nativeModule ? new NativeEventEmitter(NativeModules.DriverExperienceModule) : null;

export function isDriverNativeExperienceAvailable(): boolean {
  return Platform.OS === 'android' && !!nativeModule;
}

export async function startNativeDriverExperience(driverId?: string | null): Promise<void> {
  if (!isDriverNativeExperienceAvailable()) return;
  const token = await getValidToken().catch(() => null);
  nativeModule?.startDriverService?.(driverId ?? null, token, BACKEND_URL);
}

export async function refreshNativeDriverSession(): Promise<void> {
  if (!isDriverNativeExperienceAvailable()) return;
  const token = await getValidToken().catch(() => null);
  nativeModule?.updateDriverSession?.(token, BACKEND_URL);
}

export function stopNativeDriverExperience(): void {
  if (!isDriverNativeExperienceAvailable()) return;
  nativeModule?.stopRideAlert?.();
  nativeModule?.stopDriverService?.();
}

export function stopNativeRideAlert(): void {
  if (!isDriverNativeExperienceAvailable()) return;
  nativeModule?.stopRideAlert?.();
}

export function showNativeDriverBubble(status: string = 'online', badge = 0): void {
  if (!isDriverNativeExperienceAvailable()) return;
  nativeModule?.showBubble?.(status, badge);
}

export function hideNativeDriverBubble(): void {
  if (!isDriverNativeExperienceAvailable()) return;
  nativeModule?.hideBubble?.();
}

export async function hasNativeOverlayPermission(): Promise<boolean> {
  if (!isDriverNativeExperienceAvailable()) return false;
  return nativeModule?.hasOverlayPermission?.().catch(() => false) ?? false;
}

export function requestNativeOverlayPermission(): void {
  if (!isDriverNativeExperienceAvailable()) return;
  nativeModule?.requestOverlayPermission?.();
}

export function showNativeRideOfferAlert(ride: Record<string, unknown>): void {
  if (!isDriverNativeExperienceAvailable()) return;
  const payload = normalizeOfferPayload(ride);
  nativeModule?.showRideAlert?.(payload);
  nativeModule?.updateBubble?.('offer', 1, payload);
}

export function updateNativeRideAcceptedState(trip: Record<string, unknown> | null | undefined): void {
  if (!isDriverNativeExperienceAvailable() || !trip) return;
  nativeModule?.updateBubble?.('on_trip', 0, {
    tripId: stringValue(trip.id),
    riderName: stringValue(trip.rider_name) || 'Rider',
    eta: stringValue(trip.eta_text) || stringValue(trip.eta) || '--',
    distance: stringValue(trip.distance_text) || stringValue(trip.remaining_distance_text) || '--',
  });
}

export function subscribeDriverNativeActions(listener: (event: DriverNativeAction) => void): () => void {
  if (!emitter) return () => {};
  const sub = emitter.addListener('NexrydeDriverNativeAction', listener);
  return () => sub.remove();
}

function normalizeOfferPayload(ride: Record<string, unknown>): NativeOfferPayload {
  return {
    tripId: stringValue(ride.id) || stringValue(ride.trip_id),
    offerId: stringValue(ride.offer_id),
    riderName: stringValue(ride.rider_name) || 'Rider',
    pickup:
      stringValue(ride.pickup_address) ||
      stringValue(ride.pickup_location) ||
      stringValue(ride.pickup) ||
      'Pickup location',
    fare: fareValue(ride.offered_fare ?? ride.fare ?? ride.price),
    eta: etaValue(ride.eta_minutes ?? ride.pickup_eta_minutes ?? ride.eta),
    distance: distanceValue(ride.distance_to_pickup_km ?? ride.pickup_distance_km ?? ride.distance),
  };
}

function stringValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function fareValue(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '--';
  return Math.round(n).toLocaleString('en-NG');
}

function etaValue(value: unknown): string {
  const n = Number(value);
  if (Number.isFinite(n) && n > 0) return `${Math.ceil(n)} min`;
  const s = stringValue(value);
  return s || '--';
}

function distanceValue(value: unknown): string {
  const n = Number(value);
  if (Number.isFinite(n) && n > 0) return `${n.toFixed(n >= 10 ? 0 : 1)} km`;
  const s = stringValue(value);
  return s || '--';
}

import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import { BACKEND_URL } from '@/src/services/api';
import { getCachedToken, getStoredRefreshToken, getValidToken } from '@/src/lib/tokenStore';

type NativeDriverModule = {
  startDriverService?: (
    driverId?: string | null,
    token?: string | null,
    backendUrl?: string | null,
    refreshToken?: string | null,
  ) => void;
  updateDriverSession?: (
    token?: string | null,
    backendUrl?: string | null,
    refreshToken?: string | null,
  ) => void;
  setActiveTripId?: (tripId?: string | null) => void;
  stopDriverService?: () => void;
  showRideAlert?: (payload: Record<string, string>) => void;
  stopRideAlert?: () => void;
  showBubble?: (status: string, badge: number) => void;
  updateBubble?: (status: string, badge: number, payload?: Record<string, string>) => void;
  hideBubble?: () => void;
  hasOverlayPermission?: () => Promise<boolean>;
  requestOverlayPermission?: () => void;
  hasFullScreenIntentPermission?: () => Promise<boolean>;
  requestFullScreenIntentPermission?: () => void;
  hasBatteryOptimizationExempt?: () => Promise<boolean>;
  requestBatteryOptimizationExempt?: () => void;
};

export type DriverNativeAction = {
  action?:
    | 'accept_offer'
    | 'decline_offer'
    | 'native_action_pending'
    | 'native_accept_success'
    | 'native_accept_failed'
    | 'native_decline_success'
    | 'native_offer_expired'
    | 'open_navigation'
    | 'heartbeat_force_offline'
    | string;
  kind?: string;
  tripId?: string;
  offerId?: string;
  fare?: string;
  tripJson?: string;
  responseJson?: string;
  message?: string;
  status?: number;
  source?: string;
  serverOnline?: boolean;
};

type NativeOfferPayload = {
  tripId: string;
  offerId: string;
  driverId?: string;
  token?: string;
  backendUrl?: string;
  riderName: string;
  pickup: string;
  dropoff: string;
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
  const [token, refresh] = await Promise.all([
    getValidToken().catch(() => null),
    getStoredRefreshToken().catch(() => null),
  ]);
  nativeModule?.startDriverService?.(driverId ?? null, token, BACKEND_URL, refresh);
}

export async function refreshNativeDriverSession(): Promise<void> {
  if (!isDriverNativeExperienceAvailable()) return;
  const [token, refresh] = await Promise.all([
    getValidToken().catch(() => null),
    getStoredRefreshToken().catch(() => null),
  ]);
  nativeModule?.updateDriverSession?.(token, BACKEND_URL, refresh);
}

/** Tell native FGS whether a live trip is in progress (blocks mid-trip FORCE_OFFLINE teardown). */
export function setNativeActiveTripId(tripId: string | null | undefined): void {
  if (!isDriverNativeExperienceAvailable()) return;
  nativeModule?.setActiveTripId?.(tripId?.trim() ? tripId.trim() : null);
}

export function stopNativeDriverExperience(): void {
  if (!isDriverNativeExperienceAvailable()) return;
  nativeModule?.setActiveTripId?.(null);
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

export async function hasNativeFullScreenIntentPermission(): Promise<boolean> {
  if (!isDriverNativeExperienceAvailable()) return false;
  return nativeModule?.hasFullScreenIntentPermission?.().catch(() => false) ?? false;
}

export function requestNativeFullScreenIntentPermission(): void {
  if (!isDriverNativeExperienceAvailable()) return;
  nativeModule?.requestFullScreenIntentPermission?.();
}

export async function hasNativeBatteryOptimizationExempt(): Promise<boolean> {
  if (!isDriverNativeExperienceAvailable()) return true;
  return nativeModule?.hasBatteryOptimizationExempt?.().catch(() => true) ?? true;
}

export function requestNativeBatteryOptimizationExempt(): void {
  if (!isDriverNativeExperienceAvailable()) return;
  nativeModule?.requestBatteryOptimizationExempt?.();
}

export function showNativeRideOfferAlert(ride: Record<string, unknown>, driverId?: string | null): void {
  if (!isDriverNativeExperienceAvailable()) return;
  const payload = normalizeOfferPayload(ride, driverId);
  // Ring immediately — omit blank token so native FGS keeps its existing session JWT.
  const cached = getCachedToken() || '';
  nativeModule?.showRideAlert?.({
    ...payload,
    ...(cached ? { token: cached } : {}),
    backendUrl: BACKEND_URL,
  });
  if (!cached) {
    void getValidToken()
      .catch(() => null)
      .then((token) => {
        if (!token) return;
        nativeModule?.showRideAlert?.({
          ...payload,
          token,
          backendUrl: BACKEND_URL,
        });
      });
  }
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

function normalizeOfferPayload(ride: Record<string, unknown>, driverId?: string | null): NativeOfferPayload {
  return {
    tripId: stringValue(ride.id) || stringValue(ride.trip_id),
    offerId: stringValue(ride.offer_id),
    driverId: driverId || stringValue(ride.driver_id) || undefined,
    riderName: stringValue(ride.rider_name) || 'Rider',
    pickup:
      addressValue(ride.pickup_address) ||
      addressValue(ride.pickup_location) ||
      addressValue(ride.pickup) ||
      'Pickup location',
    dropoff:
      addressValue(ride.dropoff_address) ||
      addressValue(ride.destination) ||
      addressValue(ride.dropoff_location) ||
      addressValue(ride.dropoff) ||
      addressValue(ride.destination_coordinates) ||
      '',
    fare: fareValue(
      ride.offered_fare ?? ride.fare ?? ride.rider_offer_price ?? ride.price,
    ),
    eta: etaValue(
      ride.eta_minutes ?? ride.estimated_time_mins ?? ride.pickup_eta_minutes ?? ride.eta,
    ),
    distance: distanceValue(
      ride.distance_to_pickup_km ??
        ride.distance_to_pickup ??
        ride.pickup_distance_km ??
        ride.distance,
    ),
  };
}

function addressValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    const addr = o.address ?? o.formatted_address ?? o.label;
    if (typeof addr === 'string') return addr.trim();
  }
  return '';
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

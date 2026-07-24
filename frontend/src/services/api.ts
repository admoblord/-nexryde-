import axios, { AxiosHeaders } from 'axios';
import { getCachedToken, getValidToken } from '@/src/lib/tokenStore';
import Constants from 'expo-constants';
import { SECURITY_HEADERS, validateApiUrl } from './securityConfig';

// Backend URL - reads from app.json extra config (works in APK builds)
const getApiUrl = () => {
  // Priority 1: Expo config extra (for standalone builds)
  const expoUrl = Constants.expoConfig?.extra?.BACKEND_URL;
  if (expoUrl) {
    // Remove /api suffix if present, we add it in baseURL
    return expoUrl.replace(/\/api$/, '');
  }
  // Priority 2: Environment variable
  const envUrl = process.env.EXPO_PUBLIC_BACKEND_URL;
  if (envUrl) {
    return envUrl.replace(/\/api$/, '');
  }
  // Priority 3: Production fallback (Cloud Run)
  return 'https://nexryde-backend-993913300770.africa-south1.run.app';
};

const API_URL = getApiUrl();

function generateClientRequestId(): string {
  try {
    const c = globalThis.crypto as Crypto | undefined;
    if (c?.randomUUID) return c.randomUUID();
  } catch {
    /* ignore */
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

// Export for other components to use
export const BACKEND_URL = API_URL;

// WebSockets: use wss:// when BACKEND_URL is https:// (see getBackendWsBaseUrl in
// @/src/hooks/useRiderTripRealtime). Set EXPO_PUBLIC_BACKEND_URL to your API origin without /api.

const api = axios.create({
  baseURL: `${API_URL}/api`,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    ...SECURITY_HEADERS,
  },
});

api.interceptors.request.use((config) => {
  if (config.baseURL && !validateApiUrl(config.baseURL)) {
    return Promise.reject(new Error('Security: Invalid API endpoint'));
  }
  const headers = config.headers;
  if (headers) {
    const ax = headers as AxiosHeaders;
    const existing =
      typeof ax.get === 'function'
        ? ax.get('X-Request-Id') ?? ax.get('x-request-id')
        : (headers as Record<string, string>)['X-Request-Id'] ??
          (headers as Record<string, string>)['x-request-id'];
    if (!existing) {
      const rid = generateClientRequestId();
      if (typeof ax.set === 'function') {
        ax.set('X-Request-Id', rid);
      } else {
        (headers as Record<string, string>)['X-Request-Id'] = rid;
      }
    }
  }
  return config;
});

api.interceptors.request.use(async (config) => {
  try {
    const token = (await getValidToken()) ?? getCachedToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch {
    /* non-fatal */
  }
  return config;
});

let axiosRefreshInFlight: Promise<boolean> | null = null;

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (
      error.response?.status === 401 &&
      !originalRequest?._retried
    ) {
      const detail = String(error.response?.data?.detail || '').toLowerCase();
      const isTokenError =
        detail.includes('token expired') ||
        detail.includes('invalid token') ||
        detail.includes('token expired or invalid');

      if (isTokenError) {
        originalRequest._retried = true;
        try {
          if (!axiosRefreshInFlight) {
            const { forceRefresh } = require('@/src/lib/tokenStore');
            axiosRefreshInFlight = forceRefresh().then((t: string | null) => !!t).finally(() => {
              axiosRefreshInFlight = null;
            });
          }
          const ok = await axiosRefreshInFlight;
          if (ok) {
            const { getCachedToken } = require('@/src/lib/tokenStore');
            const newToken = getCachedToken();
            if (newToken) {
              originalRequest.headers = {
                ...originalRequest.headers,
                Authorization: `Bearer ${newToken}`,
              };
            }
            return api(originalRequest);
          }
        } catch {
          /* refresh failed — fall through to logout */
        }
        // Refresh failed: sign the user out
        try {
          const { useAppStore } = require('@/src/store/appStore');
          if (useAppStore.getState().isAuthenticated) {
            useAppStore.getState().logout();
          }
        } catch {}
      }
    }
    return Promise.reject(error);
  }
);

export const getAuthHeaders = (): Record<string, string> => {
  const base: Record<string, string> = {
    'Content-Type': 'application/json',
    ...SECURITY_HEADERS,
  };
  const token = getCachedToken();
  if (token) {
    base.Authorization = `Bearer ${token}`;
  }
  return base;
};

/** Prefer apiFetch/authedFetch — refreshes token and avoids stale-session 401 on mutations. */
export async function resolveAuthHeaders(): Promise<Record<string, string>> {
  const token = (await getValidToken()) ?? getCachedToken();
  const base: Record<string, string> = {
    'Content-Type': 'application/json',
    ...SECURITY_HEADERS,
  };
  if (token) base.Authorization = `Bearer ${token}`;
  return base;
}

/** User-facing copy when POST /payment/wallet/initiate-checkout returns 502 { success: false }. */
export const WALLET_CHECKOUT_USER_ERROR =
  'Unable to start payment. Please try again.';

/** True only when we have a usable Squad URL and the server did not mark failure. */
export function isWalletCheckoutInitOk(
  data: unknown
): data is {
  checkout_url: string;
  transaction_ref?: string;
  transactionRef?: string;
  amount_ngn?: number;
} {
  if (!data || typeof data !== 'object') return false;
  const o = data as Record<string, unknown>;
  if (o.success === false) return false;
  const url = o.checkout_url;
  return typeof url === 'string' && url.trim().length > 0;
}

/** FastAPI `detail` may be a string, a dict (e.g. 409), or a validation array — use in Alert() instead of only `typeof === 'string'`. */
export function formatApiDetail(detail: unknown): string {
  if (detail == null) return '';
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    const parts = detail.map((item) => {
      if (item && typeof item === 'object' && 'msg' in item && typeof (item as { msg: unknown }).msg === 'string') {
        return String((item as { msg: string }).msg);
      }
      return '';
    });
    return parts.filter(Boolean).join('\n') || '';
  }
  if (typeof detail === 'object') {
    const o = detail as Record<string, unknown>;
    if (typeof o.message === 'string') return o.message;
    if (typeof o.code === 'string' && typeof o.detail === 'string') return o.detail;
  }
  try {
    const s = JSON.stringify(detail);
    return s.length > 600 ? `${s.slice(0, 600)}…` : s;
  } catch {
    return '';
  }
}

/** Preserve structured `{ code, message }` from FastAPI HTTPException detail. */
export function extractApiDetailPayload(data: unknown): unknown {
  if (!data || typeof data !== 'object') return data;
  const o = data as Record<string, unknown>;
  if ('detail' in o) return o.detail;
  return data;
}

export function messageFromAxiosError(e: unknown, fallback: string): string {
  if (axios.isAxiosError(e)) {
    const raw = e.response?.data;
    if (raw && typeof raw === 'object' && (raw as { success?: unknown }).success === false) {
      return WALLET_CHECKOUT_USER_ERROR;
    }
    const text = formatApiDetail(
      raw && typeof raw === 'object' && 'detail' in raw
        ? (raw as { detail: unknown }).detail
        : undefined
    );
    if (text) return text;
    if (!e.response) {
      const m = (e.message || '').toLowerCase();
      if (m.includes('network') || e.code === 'ERR_NETWORK' || e.code === 'ECONNABORTED') {
        return 'Network error. Check your connection.';
      }
      return e.message || fallback;
    }
    const st = e.response.status;
    if (st === 401) {
      return 'Session expired — please sign in again.';
    }
    if (st === 502 || st === 503) {
      return 'Service temporarily unavailable. Please try again in a moment.';
    }
    if (st === 504) {
      return 'The server took too long to respond. Check your connection and try again.';
    }
    if (st === 429) {
      return 'Too many requests. Please wait a moment and try again.';
    }
    if (typeof raw === 'string' && raw.trim()) {
      const t = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240);
      if (t) return `Server error (${st}): ${t}`;
    }
    return `Request failed (HTTP ${st}). The API did not return a message — check backend logs or Squad configuration.`;
  }
  if (e instanceof Error && e.message) {
    return e.message;
  }
  return fallback;
}

// Auth APIs
/** @deprecated Phone SMS OTP removed — use email sign-in + register. */
export const sendOTP = (phone: string) =>
  api.post('/auth/send-otp', { phone });

/** @deprecated Phone SMS OTP removed — use email sign-in + register. */
export const verifyOTP = (phone: string, otp: string) =>
  api.post('/auth/verify-otp', { phone, otp });

export const register = (data: { phone: string; name: string; email?: string; role?: string }) => 
  api.post('/auth/register', data);

/** Driver “Account Fortress” (new device): phone + PIN + live face. Face template is stored on success. */
export type DriverFortressVerifyResponse = {
  message?: string;
  token?: string;
  user?: Record<string, unknown> & { id?: string; role?: string };
  face_confidence?: number;
  face_template_saved?: boolean;
};

export function postDriverFortressVerify(payload: {
  challenge_id: string;
  phone: string;
  pin: string;
  face_image: string;
}) {
  return api.post<DriverFortressVerifyResponse>('/auth/driver-fortress/verify', payload);
}

// User APIs
export const getUser = (userId: string) => 
  api.get(`/users/${userId}`);

export const getUserPreferences = (userId: string) =>
  api.get(`/users/${userId}/preferences`);

export const updateUserTheme = (userId: string, theme: 'light' | 'dark' | 'auto') =>
  api.put(`/users/${userId}/theme?theme=${theme}`);

export const updateUserPreferences = (
  userId: string,
  data: {
    theme?: 'light' | 'dark' | 'auto';
    language?: string;
    notifications_enabled?: boolean;
    notification_channels?: Record<string, boolean>;
    notification_types?: Record<string, boolean>;
    pickup_code_enabled?: boolean;
  }
) => api.put(`/users/${userId}/preferences`, data);

export const getRiderPreferences = (userId: string) =>
  api.get<{
    user_id: string;
    preferred_vehicle?: string;
    preferred_music?: string;
    temperature?: string;
    conversation?: string;
    special_needs?: string | null;
    estate_name?: string | null;
    estate_gate_code?: string | null;
    has_estate_gate_code?: boolean;
    saved_routes?: unknown[];
  }>(`/rider/preferences/${userId}`);

export const updateRiderPreferences = (
  userId: string,
  data: {
    preferred_vehicle?: string;
    preferred_music?: string;
    temperature?: string;
    conversation?: string;
    special_needs?: string | null;
    estate_name?: string | null;
    estate_gate_code?: string | null;
  }
) => api.put(`/rider/preferences/${userId}`, data);

export const getUserByPhone = (phone: string) => 
  api.get(`/users/phone/${phone}`);

export const updateUser = (userId: string, data: { name?: string; email?: string; profile_image?: string; phone?: string }) => 
  api.put(`/users/${userId}`, data);

export const getRiderVerificationStatus = (userId: string) =>
  api.get(`/users/${userId}/rider-verification-status`);

export const getUserLegalStatus = (userId: string) =>
  api.get(`/users/${userId}/legal-status`);

export const verifyRiderNin = (userId: string, nin: string, fullName: string) =>
  api.post(`/users/${userId}/verify-rider-nin`, {
    nin: nin.trim(),
    full_name: fullName.trim(),
  });

export const completeRiderVerification = (
  userId: string,
  data: { name: string; phone: string; address?: string; nin?: string }
) => api.post(`/users/${userId}/complete-rider-verification`, data);

export const acceptTerms = (userId: string, termsVersion: string, privacyVersion: string) =>
  api.post(`/users/${userId}/accept-terms`, {
    terms_version: termsVersion,
    privacy_version: privacyVersion,
  });

export const deleteUserAccount = (userId: string) =>
  api.delete(`/users/${userId}`);

/** NEXRYDE Shield — due-process disputes, driver blocklist for riders, recording consent */
export const createShieldDispute = (tripId: string, statement: string, category?: string) =>
  api.post('/shield/disputes', { trip_id: tripId, statement, category });

export const respondShieldDispute = (disputeId: string, statement: string) =>
  api.put(`/shield/disputes/${disputeId}/respond`, { statement });

export const getMyShieldDisputes = () => api.get('/shield/disputes/mine');

export const getShieldDispute = (disputeId: string) => api.get(`/shield/disputes/${disputeId}`);

export const setTripRecordingConsent = (tripId: string, optIn: boolean) =>
  api.put(`/shield/trips/${tripId}/recording-consent`, { opt_in: optIn });

export const activateInvisibleShieldMode = (tripId: string, expectedArrivalMinutes?: number) =>
  api.put(`/shield/trips/${tripId}/invisible-mode`, { expected_arrival_minutes: expectedArrivalMinutes });

export const uploadInvisibleShieldAudio = (tripId: string, audioBase64: string, mimeType?: string) =>
  api.post(`/shield/trips/${tripId}/invisible-mode/audio`, { audio_base64: audioBase64, mime_type: mimeType || 'audio/aac' });

export const confirmInvisibleShieldSafeArrival = (tripId: string) =>
  api.post(`/shield/trips/${tripId}/invisible-mode/confirm-safe`, { safe: true });

export const uploadShieldTripAudio = (tripId: string, audioBase64: string, mimeType?: string) =>
  api.post(`/shield/trips/${tripId}/audio`, { audio_base64: audioBase64, mime_type: mimeType || 'audio/aac' });

export const getShieldTripAudioMeta = (tripId: string) => api.get(`/shield/trips/${tripId}/audio/meta`);

export const blockRiderAsDriver = (driverId: string, riderId: string) =>
  api.post(`/users/${driverId}/blocked-riders`, { rider_id: riderId });

export const unblockRiderAsDriver = (driverId: string, riderId: string) =>
  api.delete(`/users/${driverId}/blocked-riders/${riderId}`);

export const getBlockedRiders = (driverId: string) => api.get(`/users/${driverId}/blocked-riders`);

export const switchRole = (userId: string) => 
  api.put(`/users/${userId}/switch-role`);

export const registerPushToken = (
  userId: string,
  pushToken: string,
  extra?: { platform?: string; provider?: string; device_id?: string }
) =>
  api.post(`/users/${userId}/push-token`, {
    push_token: pushToken,
    ...(extra?.platform ? { platform: extra.platform } : {}),
    ...(extra?.provider ? { provider: extra.provider } : {}),
    ...(extra?.device_id ? { device_id: extra.device_id } : {}),
  });

/** Report tap/open for analytics (`nid` comes from push `data`, set by the backend). */
export const reportNotificationOpened = (
  userId: string,
  payload: { nid?: string; notification_id?: string; event?: 'opened' | 'dismissed' | 'action' }
) => api.post(`/users/${userId}/notification-opened`, payload);

// Driver APIs
export const getDriverProfile = (userId: string) => 
  api.get(`/drivers/${userId}/profile`);

export const updateDriverProfile = (userId: string, data: any) => 
  api.put(`/drivers/${userId}/profile`, data);

export const updateDriverLocation = (userId: string, latitude: number, longitude: number) => 
  api.put(`/drivers/${userId}/location`, { latitude, longitude });

export const reportDriverSimSwapSignal = (
  userId: string,
  payload: { sim_fingerprint: string; carrier_name?: string; phone?: string }
) => api.post(`/drivers/${userId}/sim-swap-signal`, payload);

export const toggleDriverOnline = (userId: string, isOnline: boolean) => 
  api.put(`/drivers/${userId}/online?is_online=${isOnline}`);

export const getDriverStats = (userId: string) => 
  api.get(`/drivers/${userId}/stats`);

// Subscription APIs
export const getSubscription = (driverId: string) => 
  api.get(`/subscriptions/${driverId}`);

export const getSubscriptionConfig = () =>
  api.get('/subscriptions/config');

export const getSubscriptionHistory = (driverId: string) => 
  api.get(`/subscriptions/${driverId}/history`);

export const createSubscription = (driverId: string, paymentMethod: string) => 
  api.post(`/subscriptions/${driverId}/subscribe`, { payment_method: paymentMethod });

export const createVirtualAccount = (data: {
  driver_id: string;
  plan_amount: number;
  tier?: 'city_rider' | 'road_warrior';
}) => api.post('/payment/create-virtual-account', data);

/** Squad inline checkout (card / transfer in Squad UI). Backend stores payment intent + webhook activates. */
export const initiateSubscriptionCheckout = (tier?: 'city_rider' | 'road_warrior') =>
  api.post('/payment/subscription/initiate-checkout', { tier });

/** If webhook is slow, driver can tap “Refresh status” to verify transaction_ref with Squad. */
export const verifyPendingSubscriptionCheckout = (transactionRef?: string) =>
  api.post('/payment/subscription/verify-pending', transactionRef ? { transaction_ref: transactionRef } : {});

export const getDriverSubscriptionStatus = () =>
  api.get('/driver/subscription-status');

// NEW: Fare Estimate API (uses Google Directions on backend)
export interface FareEstimateRequest {
  pickup_lat: number;
  pickup_lng: number;
  dropoff_lat: number;
  dropoff_lng: number;
  service_type?: string;
  city?: string;
  rider_id?: string;
  /** When set and this driver is in the rider's favourites, estimate may reflect the favourite perk. */
  preferred_driver_id?: string;
  demand_ratio?: number;
  rain?: boolean;
  pickup_address?: string;
  dropoff_address?: string;
  stop_lat?: number;
  stop_lng?: number;
  stop_address?: string;
  /** Leg from Google Directions on device — used when server route is haversine-only. */
  google_route_distance_meters?: number;
  google_route_duration_seconds?: number;
}

export interface FareEstimateSurgeFactor {
  label: string;
  multiplier?: number;
}

/**
 * Lagos distance-pricing audit payload (`build_lagride_profile_payload` + estimate merges).
 * `service_key` is the API tier (`economy` = Standard, `comfort`, `xl`, `premium`; `pro` is normalized to premium server-side).
 */
export interface LagrideProfilePayload {
  spec_id?: string;
  /** Rider-facing value line from backend (Lagos distance pricing). */
  rider_value_summary?: string;
  formula?: string;
  no_base_fare?: boolean;
  pure_distance_based?: boolean;
  pickup_tier?: number;
  pickup_zone_key?: string;
  distance_band?: string;
  area_rate_ngn_per_km?: number;
  rate_source?: string;
  service_key?: string;
  service_multiplier?: number;
  surge_multiplier?: number;
  demand_ratio?: number;
  fare_bucket?: string;
  total_fare_computed?: number;
  pickup_coordinates_resolved?: boolean;
  dropoff_coordinates_resolved?: boolean;
  implementation_checklist?: Array<Record<string, unknown>>;
  route_metrics_source?: string;
  road_route_ok?: boolean;
  first_ride_discount_applied?: boolean;
  rider_total_after_discount?: number;
  [key: string]: unknown;
}

/** Matches `POST /fare/estimate` payload from `backend/routers/payments.py`. */
export interface FareEstimateResponse {
  estimate_id: string;
  distance_km: number;
  duration_min: number;
  estimated_time_minutes?: number;
  traffic_duration_min?: number;
  /** Minutes used in ₦/min line item (max of base vs traffic ETA when available). */
  pricing_route_minutes?: number | null;
  base_fare: number;
  distance_fee: number;
  time_fee: number;
  traffic_fee: number;
  booking_fee?: number;
  subtotal?: number;
  location_multiplier?: number | null;
  location_zone?: string | null;
  service_multiplier?: number | null;
  total_fare: number;
  /** Alternate keys some gateways expose */
  fare?: number;
  total?: number;
  /** Legacy alias for minute-based ETA */
  duration_mins?: number;
  /** Legacy clients only — prefer `surge_multiplier`. */
  multiplier?: number;
  base_price?: number;
  min_price?: number;
  max_price?: number;
  smart_pricing_note?: string;
  first_ride_discount_applied?: boolean;
  original_total_fare?: number | null;
  favorite_driver_discount_applied?: boolean;
  /** Decimal fraction e.g. 0.05 for 5%. */
  favorite_driver_discount_pct?: number | null;
  surge_multiplier?: number;
  surge_uncapped?: number;
  surge_factors?: FareEstimateSurgeFactor[];
  surge_details?: Record<string, unknown>;
  demand_ratio?: number;
  demand_ratio_source?: string;
  rain_applied?: boolean;
  rain_multiplier?: number;
  is_peak: boolean;
  is_weekend?: boolean;
  peak_type?: string | null;
  currency: string;
  min_fare: number;
  cancellation_fee?: number;
  fare_bucket?: string | null;
  short_trip_threshold_km?: number | null;
  service_type: string;
  city?: string;
  polyline: string | null;
  /** Aliases returned by POST /fare/estimate for polyline + metrics */
  encoded_polyline?: string | null;
  distance_meters?: number;
  duration_seconds?: number;
  pickup_address?: string;
  dropoff_address?: string;
  price_breakdown?: string;
  route_preview_coordinates?: unknown[];
  map_preview_region?: unknown;
  area_summary_line?: string;
  price_valid_until: string;
  price_lock_minutes: number;
  is_insured?: boolean;
  /** google_routes_api | google_directions_api | haversine | client_google_directions | … */
  route_metrics_source?: string;
  road_route_ok?: boolean;
  fare_rate_model?: string | null;
  lagride_profile?: LagrideProfilePayload | null;
  /** Nationwide premium (non-Lagos) — marketing / education from `fare_config`. */
  competitive_positioning_summary?: string | null;
  competitive_positioning_bullets?: string[] | null;
  /** Backend surge identifier, e.g. `max_of_factors`. */
  surge_model?: string | null;
  driver_payout_policy_note?: string | null;
  /** Lagos: time charge applied because rider added an intermediate stop. */
  has_intermediate_stop?: boolean;
  stop_time_fee_applied?: boolean;
  stop_time_per_min?: number;
}

export const estimateFare = (data: FareEstimateRequest) =>
  api.post<FareEstimateResponse>('/fare/estimate', {
    pickup_lat: data.pickup_lat,
    pickup_lng: data.pickup_lng,
    dropoff_lat: data.dropoff_lat,
    dropoff_lng: data.dropoff_lng,
    service_type: data.service_type || 'economy',
    city: data.city || 'default',
    ...(data.pickup_address ? { pickup_address: data.pickup_address } : {}),
    ...(data.dropoff_address ? { dropoff_address: data.dropoff_address } : {}),
    ...(data.rider_id != null && String(data.rider_id).trim() !== ''
      ? { rider_id: String(data.rider_id).trim() }
      : {}),
    ...(data.demand_ratio != null && Number.isFinite(data.demand_ratio) ? { demand_ratio: data.demand_ratio } : {}),
    ...(data.rain != null ? { rain: data.rain } : {}),
    ...(data.google_route_distance_meters != null &&
    data.google_route_duration_seconds != null &&
    Number.isFinite(data.google_route_distance_meters) &&
    Number.isFinite(data.google_route_duration_seconds)
      ? {
          google_route_distance_meters: data.google_route_distance_meters,
          google_route_duration_seconds: data.google_route_duration_seconds,
        }
      : {}),
  });

// Trip APIs
export const requestTrip = (riderId: string, data: {
  pickup_lat: number;
  pickup_lng: number;
  pickup_address: string;
  dropoff_lat: number;
  dropoff_lng: number;
  dropoff_address: string;
  service_type?: string;
  payment_method?: string;
  fare_estimate_id?: string;
  demand_ratio?: number;
  rain?: boolean;
}) => api.post(`/trips/request?rider_id=${riderId}`, data);

export const getPendingTrips = (driverLat: number, driverLng: number, driverId?: string) =>
  api.get(
    `/trips/pending?driver_lat=${driverLat}&driver_lng=${driverLng}${driverId ? `&driver_id=${driverId}` : ''}`
  );

export const getDriverTripOffers = (driverId: string) =>
  api.get(`/trips/offers/${driverId}`);

export const declineTripOffer = (
  offerId: string,
  driverId: string,
  clientEventId?: string,
) =>
  api.put(`/trips/offers/${offerId}/decline`, {
    driver_id: driverId,
    client_event_id: clientEventId || `decline:${offerId}:${driverId}`,
  });

export const acceptTrip = (
  tripId: string,
  driverId: string,
  offerId?: string,
  proposedFare?: number,
  clientEventId?: string,
) =>
  api.put(`/trips/${tripId}/accept`, {
    driver_id: driverId,
    offer_id: offerId,
    client_event_id: clientEventId || `accept:${tripId}:${driverId}`,
    ...(proposedFare != null && Number.isFinite(proposedFare)
      ? { proposed_fare: proposedFare }
      : {}),
  });

export const arriveTrip = (tripId: string, driverId: string) =>
  api.put(`/trips/${tripId}/arrive`, { driver_id: driverId });

export const startTrip = (tripId: string) => 
  api.put(`/trips/${tripId}/start`);

export const completeTrip = (tripId: string) => 
  api.put(`/trips/${tripId}/complete`);

/** Mid-trip destination change or add-stop — fare recalculated server-side. */
export const updateTripRoute = (
  tripId: string,
  payload: {
    update_type: 'destination' | 'stop';
    lat: number;
    lng: number;
    address?: string;
    driver_lat?: number;
    driver_lng?: number;
  }
) => api.post(`/trips/${tripId}/route-update`, payload);

export const confirmTripPayment = (tripId: string) =>
  api.put(`/trips/${tripId}/confirm-payment`);

export const cancelTrip = (
  tripId: string,
  cancelledBy: string,
  opts?: { reason?: string; clientEventId?: string },
) =>
  api.put(`/trips/${tripId}/cancel`, {
    cancelled_by: cancelledBy,
    client_event_id: opts?.clientEventId || `cancel:${tripId}:${cancelledBy}`,
    ...(opts?.reason
      ? { reason: opts.reason, cancellation_reason: opts.reason }
      : {}),
  });

export const rateTrip = (tripId: string, raterId: string, rating: number, comment?: string) =>
  api.put(`/trips/${tripId}/rate?rater_id=${raterId}`, {
    overall_rating: rating,
    comment,
  });

export const getUserTrips = (userId: string, role: string = 'rider') => 
  api.get(`/trips/user/${userId}?role=${role}`);

export const getTripsWithDriver = (userId: string, driverId: string) =>
  api.get(`/trips/user/${userId}/with-driver/${driverId}`);

export const getTrip = (tripId: string) => 
  api.get(`/trips/${tripId}`);

export const verifyTripBiometricLock = (tripId: string, method: string = 'device_biometric') =>
  api.put(`/trips/${tripId}/biometric-lock`, { method });

export const setGeoFenceTripLock = (
  tripId: string,
  payload: { threshold_meters?: number; approved_route?: Array<{ lat: number; lng: number }> }
) => api.put(`/trips/${tripId}/geo-fence-lock`, payload);

export const explainGeoFenceDeviation = (tripId: string, reason: string) =>
  api.post(`/trips/${tripId}/geo-fence-explain`, { reason });

export const runFakeDriverAlertCheck = (
  tripId: string,
  payload: { observed_face_image: string; location_lat?: number; location_lng?: number }
) => api.post(`/trips/${tripId}/fake-driver-alert`, payload);

export const verifyRiderFaceAtPickup = (
  tripId: string,
  payload: { observed_face_image: string }
) => api.post(`/trips/${tripId}/verify-rider-face-pickup`, payload);

export const getTripBlackBox = (tripId: string) =>
  api.get<{
    success: boolean;
    black_box: {
      trip_id: string;
      status: string;
      payment_status?: string;
      created_at?: string;
      started_at?: string;
      completed_at?: string;
      insurance_id?: string;
      fare?: number;
      driver_identity?: {
        name?: string;
        vehicle_plate?: string;
        vehicle_model?: string;
        face_verified_at_start?: boolean;
      };
      route_summary?: {
        planned_distance_km?: number;
        planned_duration_mins?: number;
        recorded_route_points?: number;
        forensic_route_points?: number;
        route_deviation_detected?: boolean;
      };
      forensic_report?: {
        report_type?: string;
        generated_for?: string[];
        driver_identity_confirmation?: {
          driver_id?: string;
          driver_name?: string;
          vehicle_plate?: string;
          vehicle_model?: string;
          face_verified_at_start?: boolean;
          fake_driver_alert_triggered?: boolean;
        };
        gps_points_every_30_seconds?: Array<{
          lat?: number;
          lng?: number;
          timestamp?: string;
          speed_kmh?: number | null;
        }>;
        last_known_location?: {
          lat?: number;
          lng?: number;
          timestamp?: string;
        };
      };
      timeline?: Array<{
        seq: number;
        event_type: string;
        created_at?: string;
        event_hash: string;
      }>;
      certification: {
        issuer: string;
        jurisdiction: string;
        generated_at: string;
        record_hash: string;
        record_signature: string;
        tamper_evident: boolean;
      };
      communications_integrity?: {
        trip_message_count?: number;
        call_session_count?: number;
        communication_digest?: string;
      };
      black_shield?: {
        name?: string;
        protection_mode?: string;
        tamper_proof_ledger_root?: string;
        decentralized_ledger_anchor?: string;
        court_order_required_for_third_party_access?: boolean;
        deletion_allowed?: boolean;
        alteration_allowed?: boolean;
      };
    };
  }>(`/trips/${tripId}/black-box`);

export const getActiveTrip = (userId: string) =>
  api.get(`/trips/active/${userId}`);

export const getDriverEarningsDashboard = (driverId: string, period: 'today' | 'week' | 'month' = 'today') =>
  api.get(`/driver/earnings/${driverId}?period=${period}`);

export const getDriverBankDetails = (driverId: string) =>
  api.get<{
    success: boolean;
    bank_name: string;
    account_number: string;
    account_name: string;
    payout_ready: boolean;
    payment_model: string;
    message: string;
  }>(`/drivers/${driverId}/bank-details`);

export type WithdrawalRecord = {
  id: string;
  reference: string;
  amount: number;
  status: 'pending_settlement' | 'processing' | 'paid' | 'failed' | string;
  bank_name: string;
  account_number: string;
  account_name: string;
  provider_reference?: string | null;
  settlement_reason?: string | null;
  created_at: string;
  settled_at?: string | null;
  reversed_to_wallet?: boolean;
};

export const getDriverWithdrawals = (driverId: string, params?: { limit?: number; skip?: number }) => {
  const qs = params ? `?limit=${params.limit ?? 30}&skip=${params.skip ?? 0}` : '';
  return api.get<{
    success: boolean;
    wallet_balance: number;
    earnings_frozen: boolean;
    bank_ready: boolean;
    bank: { bank_name: string; account_number: string; account_name: string };
    withdrawals: WithdrawalRecord[];
    total: number;
  }>(`/drivers/${driverId}/withdrawals${qs}`);
};

export const withdrawDriverEarningsWithBiometric = (
  driverId: string,
  payload: { amount: number; face_image: string; idempotency_key?: string }
) =>
  api.post<{
    success: boolean;
    message: string;
    withdrawn_amount: number;
    remaining_balance: number;
    face_match_confidence: number;
    reference?: string;
    status?: string;
    duplicate?: boolean;
  }>(`/drivers/${driverId}/withdraw-earnings`, payload);

export type EarningsVaultPendingRelease = {
  amount: number;
  requested_at: string;
  release_available_at: string;
};

export const getDriverEarningsVault = (driverId: string) =>
  api.get<{
    success: boolean;
    wallet_spendable: number;
    vault_locked: number;
    pending_release: EarningsVaultPendingRelease | null;
    cooldown_hours: number;
  }>(`/drivers/${driverId}/earnings-vault`);

export const lockDriverEarningsVault = (driverId: string, amount: number) =>
  api.post<{
    success: boolean;
    message: string;
    wallet_spendable: number;
    vault_locked: number;
  }>(`/drivers/${driverId}/earnings-vault/lock`, { amount });

export const requestDriverEarningsVaultUnlock = (driverId: string, amount: number) =>
  api.post<{
    success: boolean;
    message: string;
    pending_release: EarningsVaultPendingRelease;
  }>(`/drivers/${driverId}/earnings-vault/request-unlock`, { amount });

export const confirmDriverEarningsVaultRelease = (
  driverId: string,
  payload: { face_image: string; pin: string }
) =>
  api.post<{
    success: boolean;
    message: string;
    released_amount: number;
    wallet_spendable: number;
    vault_locked: number;
    face_match_confidence: number;
  }>(`/drivers/${driverId}/earnings-vault/confirm-release`, payload);

export const getDriverSalaryMode = (driverId: string) =>
  api.get<{
    success: boolean;
    salary_mode: {
      enabled: boolean;
      monthly_income_target: number;
      achieved_this_month: number;
      remaining_to_target: number;
      days_left_in_month: number;
      required_daily_average: number;
      expected_by_today: number;
      pace_gap: number;
      projected_month_end: number;
      dispatch_priority_boost: number;
      status: 'inactive' | 'on_track' | 'behind';
    };
  }>(`/drivers/${driverId}/salary-mode`);

export const updateDriverSalaryMode = (driverId: string, payload: { enabled: boolean; monthly_income_target: number }) =>
  api.put<{
    success: boolean;
    message: string;
    salary_mode: {
      enabled: boolean;
      monthly_income_target: number;
      achieved_this_month: number;
      remaining_to_target: number;
      days_left_in_month: number;
      required_daily_average: number;
      expected_by_today: number;
      pace_gap: number;
      projected_month_end: number;
      dispatch_priority_boost: number;
      status: 'inactive' | 'on_track' | 'behind';
    };
  }>(`/drivers/${driverId}/salary-mode`, payload);

export const getDriverPayoutRestrictions = (driverId: string) =>
  api.get<{
    can_go_online: boolean;
    can_accept_rides: boolean;
    can_withdraw_earnings: boolean;
    show_payment_popup: boolean;
    message: string;
  }>(`/subscriptions/${driverId}/check-restrictions`);

// Wallet APIs
export const getWallet = (userId: string) => 
  api.get(`/wallet/${userId}`);

/** Balance + recent transactions for the authenticated user (single round-trip). */
export const getWalletMe = (limit = 25) =>
  api.get<{
    balance: number;
    user_id: string;
    currency: string;
    transactions: unknown[];
    /** Ignored if present — wallet top-up is checkout-only (no VA UI). */
    company_virtual_account?: unknown;
    virtualAccount?: unknown;
  }>(`/wallet/me?limit=${Math.min(100, Math.max(1, limit))}`);

/** @deprecated For riders use initiateRiderWalletCheckout — server requires verified Paystack reference. */
export const topupWallet = (userId: string, amount: number) =>
  api.post(`/wallet/${userId}/topup`, { amount });

export const getWalletTransactions = (userId: string, limit: number = 30) =>
  api.get(`/wallet/${userId}/transactions?limit=${limit}`);

/** SquadCo: card/bank checkout to credit rider wallet (completes via webhook or verify-pending). */
export const initiateRiderWalletCheckout = (amount: number, replacePending = false) =>
  api.post('/payment/wallet/initiate-checkout', { amount, replace_pending: replacePending });

/** Latest resumable Squad checkout for this user (backend source of truth). */
export const getPendingWalletCheckout = () =>
  api.get<{
    pending: boolean;
    transaction_ref?: string;
    checkout_url?: string;
    amount_ngn?: number;
    amount_kobo?: number;
  }>('/payment/wallet/pending-checkout');

export const getWalletPendingIntents = () =>
  api.get<{
    data: Array<{
      squadReference: string;
      status: string;
      amountKobo: number;
      expiresAt: string | null;
    }>;
  }>('/wallet/pending-intents');

/** Abandon pending checkout intents so a new session/amount can start. */
export const cancelPendingWalletCheckout = () => api.post('/payment/wallet/cancel-pending');

export const verifyPendingRiderWallet = (transactionRef?: string) =>
  api.post('/payment/wallet/verify-pending', transactionRef ? { transaction_ref: transactionRef } : {});

// Emergency Contacts
export const addEmergencyContact = (userId: string, data: { name: string; phone: string; relationship: string }) =>
  api.post(`/users/${userId}/emergency-contacts`, data);

export const getEmergencyContacts = (userId: string) =>
  api.get(`/users/${userId}/emergency-contacts`);

export const removeEmergencyContact = (userId: string, phone: string) =>
  api.delete(`/users/${userId}/emergency-contacts/${encodeURIComponent(phone)}`);

// Favorite/Blocked Drivers
export const addFavoriteDriver = (userId: string, driverId: string) =>
  api.post(`/users/${userId}/favorite-drivers`, { driver_id: driverId });

export const removeFavoriteDriver = (userId: string, driverId: string) =>
  api.delete(`/users/${userId}/favorite-drivers/${driverId}`);

export const getFavoriteDrivers = (userId: string) =>
  api.get(`/users/${userId}/favorite-drivers`);

export const getUserTrustSummary = (userId: string) =>
  api.get<{
    user_id: string;
    role: string;
    nexryde_score: number;
    rider_risk_score: number;
    driver_safety_score: number | null;
    score_tier: {
      key: string;
      label: string;
    };
    score_breakdown: {
      service_quality: number;
      punctuality: number;
      verification: number;
      payment_behavior: number;
    };
    unlocked_perks: string[];
    priority_matching_enabled: boolean;
    lower_fee_eligible: boolean;
    premium_access_enabled: boolean;
    verification_status: {
      account_verified: boolean;
      face_verified: boolean;
      nin_verified: boolean;
    };
  }>(`/users/${userId}/trust-summary`);

export const checkFavoriteDriver = (userId: string, driverId: string) =>
  api.get(`/users/${userId}/favorite-drivers/${driverId}/check`);

export const blockDriver = (userId: string, driverId: string) =>
  api.post(`/users/${userId}/blocked-drivers`, { driver_id: driverId });

export const unblockDriver = (userId: string, driverId: string) =>
  api.delete(`/users/${userId}/blocked-drivers/${driverId}`);

// SOS & Safety
export const triggerSOS = (data: { trip_id: string; location_lat: number; location_lng: number; auto_triggered?: boolean }) =>
  api.post('/sos/trigger', data);

export const triggerOneTouchPoliceConnect = (data: {
  trip_id: string;
  location_lat: number;
  location_lng: number;
}) =>
  api.post<{
    success: boolean;
    message: string;
    alert_id: string;
    dial_uri: string;
    dial_number: string;
    nearest_police_station_map_url: string;
    structured_alert: Record<string, unknown>;
    police_sms_sent: number;
  }>('/sos/police-connect', data);

export const confirmSafeArrival = (tripId: string) =>
  api.post(`/trips/${tripId}/confirm-safe-arrival`);

export const resolveSOS = (sosId: string, resolution: string) =>
  api.post(`/sos/${sosId}/resolve?resolution=${resolution}`);

export const respondToSafetyCheck = (checkId: string, response: string) =>
  api.post('/safety/respond', { check_id: checkId, response });

export const submitDriverStopReason = (tripId: string, reason: string) =>
  api.post(`/trips/${tripId}/stop-reason`, { reason });

export const reportTripIssue = (data: {
  trip_id: string;
  user_id: string;
  role: 'rider' | 'driver';
  category: 'safety' | 'fare' | 'behavior' | 'route' | 'payment' | 'general';
  description: string;
}) => api.post('/support/trip-issues/report', data);

export const submitDriverWitnessReport = (data: {
  trip_id: string;
  incident_type: 'crime' | 'accident' | 'medical' | 'fire' | 'violence' | 'other';
  description: string;
  anonymous?: boolean;
  location_lat?: number;
  location_lng?: number;
  occurred_at?: string;
  evidence_notes?: string;
}) =>
  api.post<{
    success: boolean;
    report_id: string;
    authority_forwarding_status: string;
    retaliation_protection: { enabled: boolean; status: string; shielded_reporter_identity: boolean };
    reward_points_earned: number;
    message: string;
  }>('/support/driver-witness/report', data);

// Lost & Found
export const reportLostItem = (data: { trip_id: string; description: string; reporter_id: string; reporter_role: 'rider' | 'driver' }) =>
  api.post(`/lost-found/report?reporter_id=${data.reporter_id}&reporter_role=${data.reporter_role}`, {
    trip_id: data.trip_id,
    description: data.description,
  });

export const getUserLostItems = (userId: string) =>
  api.get(`/lost-found/user/${userId}`);

export const respondLostItem = (itemId: string, response: string, found: boolean) =>
  api.put(`/lost-found/${itemId}/respond`, { response, found });

export const getRadioStations = () =>
  api.get('/radio/stations');

export const getSupportContacts = () =>
  api.get<{
    support_phone: string;
    support_email: string;
    nigerian_police_numbers: string[];
    emergency_line: string;
  }>('/support/contacts');

export const getFeatureAnnouncements = () =>
  api.get<{
    success: boolean;
    announcements: Array<{
      id: string;
      title: string;
      message: string;
      feature_route: string;
      audience: 'all' | 'rider' | 'driver';
      version?: string;
      created_at: string;
      is_active?: boolean;
    }>;
  }>('/notifications/feature-announcements');

export const triggerRiskAlert = (tripId: string, userId: string, reason?: string) =>
  api.post(`/trips/${tripId}/risk-alert?user_id=${userId}`, { trip_id: tripId, reason });

// Fatigue Monitoring
export const getFatigueStatus = (userId: string) =>
  api.get(`/drivers/${userId}/fatigue-status`);

export const logBreak = (userId: string) =>
  api.post(`/drivers/${userId}/log-break`);

// Leaderboard
export const getDriverLeaderboard = (city?: string, period?: string) =>
  api.get(`/leaderboard/drivers?city=${city || 'lagos'}&period=${period || 'weekly'}`);

export const getTopRatedDrivers = (limit?: number) =>
  api.get(`/leaderboard/top-rated?limit=${limit || 20}`);

export const getDriverOfMonth = () =>
  api.get<{
    success: boolean;
    month_key: string;
    title: string;
    subtitle: string;
    cash_bonus: number;
    trophy_delivery: string;
    social_hook: string;
    total_votes: number;
    featured_driver?: {
      driver_id: string;
      name: string;
      rating: number;
      trip_count: number;
      total_earnings: number;
      votes: number;
      campaign_story: string;
    } | null;
    candidates: Array<{
      driver_id: string;
      name: string;
      rating: number;
      trip_count: number;
      total_earnings: number;
      votes: number;
      campaign_story: string;
    }>;
  }>('/driver-of-the-month/current');

export const voteDriverOfMonth = (userId: string, driverId: string) =>
  api.post('/driver-of-the-month/vote', { user_id: userId, driver_id: driverId });

export const getNexrydeStories = (limit: number = 30) =>
  api.get<{
    success: boolean;
    stories: Array<{
      id: string;
      user_id: string;
      user_name: string;
      user_role: 'rider' | 'driver';
      text: string;
      media_type?: 'text' | 'image' | 'video';
      media_url?: string | null;
      media_data?: string | null;
      duration_ms?: number;
      trip_mood?: string | null;
      story_type?: string;
      likes: number;
      created_at: string;
      expires_at?: string;
    }>;
  }>(`/community/stories?limit=${limit}`);

export const getNexrydeStoryGroups = () =>
  api.get<{
    success: boolean;
    groups: Array<{
      user_id: string;
      user_name: string;
      user_role: 'rider' | 'driver';
      latest_story_at: string;
      unseen_count: number;
      total_count: number;
    }>;
  }>('/community/stories/groups');

export const createNexrydeStory = (payload: {
  text: string;
  trip_mood?: string;
  story_type?: string;
  media_type?: 'text' | 'image' | 'video';
  media_url?: string;
  media_data?: string;
  duration_ms?: number;
}) =>
  api.post('/community/stories', payload);

export const likeNexrydeStory = (storyId: string) =>
  api.post(`/community/stories/${storyId}/like`);

export const markNexrydeStorySeen = (storyId: string) =>
  api.post(`/community/stories/${storyId}/seen`);

// Streaks & Badges
export const getDriverStreaks = (userId: string) =>
  api.get(`/drivers/${userId}/streaks`);

export const checkStreak = (userId: string) =>
  api.post(`/drivers/${userId}/check-streak`);

// Trip Sharing (Family & Friends)
export const shareTrip = (tripId: string, recipientPhone: string, recipientName?: string) =>
  api.post(`/trips/${tripId}/share?recipient_phone=${recipientPhone}&recipient_name=${recipientName || ''}`);

export const trackSharedTrip = (shareToken: string) =>
  api.get(`/trips/track/${shareToken}`);

export type TripShareData = {
  success?: boolean;
  trip_id: string;
  status: string;
  share_link: string;
  last_updated: string;
  driver: {
    name: string;
    image_url?: string | null;
    face_image?: string | null;
    profile_image?: string | null;
    rating?: number | null;
  };
  vehicle: {
    make: string;
    color: string;
    license_plate: string;
  };
  pickup_address: string;
  destination_address: string;
  distance_km?: number | null;
  eta_seconds?: number | null;
  started_at?: string | null;
  driver_location?: { lat: number; lng: number } | null;
};

export const fetchTripShareData = (tripId: string) =>
  api.get<TripShareData>(`/trips/${tripId}/share-data`);

export const generateTripShareLink = (tripId: string) =>
  api.post<{ success: boolean; share_link: string; trip_id: string; status: string }>(
    `/trips/${tripId}/generate-share-link`,
  );

// Trip Recording
export const startRecording = (tripId: string) =>
  api.post(`/trips/${tripId}/start-recording`);

export const stopRecording = (tripId: string) =>
  api.post(`/trips/${tripId}/stop-recording`);

export const uploadTripVideoRecording = (tripId: string, formData: FormData) =>
  api.post<{
    success: boolean;
    recording_id: string;
    trip_id: string;
    size_bytes: number;
    duration_seconds: number;
  }>(`/trips/${tripId}/recordings/upload`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });

// Insurance
export const getTripInsurance = (tripId: string) =>
  api.get(`/trips/${tripId}/insurance`);

// Challenges
export const getActiveChallenges = () =>
  api.get('/challenges/active');

export const getDriverChallengeProgress = (userId: string) =>
  api.get(`/drivers/${userId}/challenges`);

// Grace Period
export const requestGracePeriod = (driverId: string, reason: string, days: number = 3) =>
  api.post(`/subscriptions/${driverId}/grace-period`, { reason, days_requested: days });

// Face Verification
export const verifyFace = (
  userId: string,
  faceImage: string,
  opts?: { livenessProbeImage?: string; captureMeta?: Record<string, unknown> }
) =>
  api.post(`/users/${userId}/verify-face`, {
    face_image: faceImage,
    ...(opts?.livenessProbeImage ? { liveness_probe_image: opts.livenessProbeImage } : {}),
    ...(opts?.captureMeta ? { capture_meta: opts.captureMeta } : {}),
  });

export const verifyFaceAtRideStart = (userId: string, faceImage: string) =>
  api.post(`/drivers/${userId}/verify-face-at-start`, { face_image: faceImage });

// NEXRYDE Family
export const createFamily = (ownerId: string, familyName: string) =>
  api.post(`/family/create?owner_id=${ownerId}&family_name=${encodeURIComponent(familyName)}`);

export const getFamily = (familyId: string) =>
  api.get(`/family/${familyId}`);

export const addFamilyMember = (familyId: string, phone: string, name: string, relationship: string) =>
  api.post(`/family/${familyId}/add-member?phone=${encodeURIComponent(phone)}&name=${encodeURIComponent(name)}&relationship=${encodeURIComponent(relationship)}`);

export const removeFamilyMember = (familyId: string, memberPhone: string) =>
  api.delete(`/family/${familyId}/member/${encodeURIComponent(memberPhone)}`);

export const bookForFamilyMember = (familyId: string, bookerId: string, memberPhone: string, pickup: any, dropoff: any) =>
  api.post(`/family/${familyId}/book-for-member`, {
    booker_id: bookerId,
    member_phone: memberPhone,
    pickup_lat: pickup.lat,
    pickup_lng: pickup.lng,
    pickup_address: pickup.address,
    dropoff_lat: dropoff.lat,
    dropoff_lng: dropoff.lng,
    dropoff_address: dropoff.address
  });

export const triggerFamilySafetyAlert = (familyId: string, memberId: string, lat: number, lng: number) =>
  api.post(`/family/${familyId}/safety-alert?member_id=${memberId}&location_lat=${lat}&location_lng=${lng}`);

export const splitFare = (tripId: string, riderId: string, phones: string[]) =>
  api.post<{
    split_id: string;
    per_person: number;
    num_participants: number;
  }>(`/rides/${tripId}/split-fare`, { rider_id: riderId, phones });

// Driver Certification
export const getDriverCertification = (userId: string) =>
  api.get(`/drivers/${userId}/certification`);

// Women-Only Mode
export const toggleWomenOnlyMode = (userId: string, enabled: boolean) =>
  api.post(`/users/${userId}/women-only-mode?enabled=${enabled}`);

export const verifyGender = (userId: string, gender: string) =>
  api.post(`/users/${userId}/verify-gender?gender=${gender}`);

export const getAvailableFemaleDrivers = (lat: number, lng: number) =>
  api.get(`/drivers/available-female?lat=${lat}&lng=${lng}`);

export const getAvailableDrivers = (params: {
  lat?: number;
  lng?: number;
  vehicle_type?: string;
}) => {
  const q = new URLSearchParams();
  if (typeof params.lat === 'number') q.append('lat', String(params.lat));
  if (typeof params.lng === 'number') q.append('lng', String(params.lng));
  if (params.vehicle_type) q.append('vehicle_type', params.vehicle_type);
  const qs = q.toString();
  return api.get(`/drivers/available${qs ? `?${qs}` : ''}`);
};

// Driver Compliance
export const getDriverCompliance = (driverId: string) =>
  api.get(`/drivers/${driverId}/compliance`);

export const uploadMonthlyVerification = (driverId: string, photoData: string, photoType: 'interior' | 'selfie') =>
  api.post(`/drivers/${driverId}/monthly-verification`, { photo_data: photoData, photo_type: photoType });

export const getMonthlyVerificationStatus = (driverId: string) =>
  api.get(`/drivers/${driverId}/monthly-verification`);

export const liveFaceCheck = (driverId: string, facePhoto: string) =>
  api.post(`/drivers/${driverId}/live-face-check`, { photo_data: facePhoto, photo_type: 'face' });

export const renewDocument = (driverId: string, docType: string, photoData: string, expiryDate?: string) =>
  api.post(`/drivers/${driverId}/renew-document`, { document_type: docType, photo_data: photoData, new_expiry_date: expiryDate });

// Enforcement & Policies
export const reportViolation = (data: { reported_user_id: string; reporter_id: string; violation_type: string; trip_id?: string; description?: string }) =>
  api.post('/enforcement/report', data);

export const getEnforcementStatus = (userId: string) =>
  api.get(`/enforcement/status/${userId}`);

export const getViolationHistory = (userId: string) =>
  api.get(`/enforcement/history/${userId}`);

export const getPolicies = () =>
  api.get('/enforcement/policies');

export const appealViolation = (data: { user_id: string; violation_id: string; reason: string }) =>
  api.post('/enforcement/appeal', data);

export default api;

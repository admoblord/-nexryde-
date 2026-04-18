import axios from 'axios';
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
  return 'https://nexryde-backend-993913300770.us-central1.run.app';
};

const API_URL = getApiUrl();

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
  return config;
});

api.interceptors.request.use((config) => {
  try {
    const { useAppStore } = require('@/src/store/appStore');
    const token = useAppStore.getState().token;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch {}
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const detail = error.response?.data?.detail || '';
      const isTokenError = detail === 'Token expired' || detail === 'Invalid token';
      if (isTokenError) {
        try {
          const { useAppStore } = require('@/src/store/appStore');
          const { isAuthenticated } = useAppStore.getState();
          if (isAuthenticated) {
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
  try {
    const { useAppStore } = require('@/src/store/appStore');
    const token = useAppStore.getState().token;
    if (token) {
      base.Authorization = `Bearer ${token}`;
    }
  } catch {}
  return base;
};

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
  }
  try {
    const s = JSON.stringify(detail);
    return s.length > 600 ? `${s.slice(0, 600)}…` : s;
  } catch {
    return '';
  }
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
export const sendOTP = (phone: string) => 
  api.post('/auth/send-otp', { phone });

export const verifyOTP = (phone: string, otp: string) => 
  api.post('/auth/verify-otp', { phone, otp });

export const register = (data: { phone: string; name: string; email?: string; role?: string }) => 
  api.post('/auth/register', data);

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

export const completeRiderVerification = (
  userId: string,
  data: { name: string; phone: string; address: string; nin: string }
) => api.post(`/users/${userId}/complete-rider-verification`, data);

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

export const registerPushToken = (userId: string, pushToken: string) =>
  api.post(`/users/${userId}/push-token`, { push_token: pushToken });

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
}

export interface FareEstimateResponse {
  estimate_id: string;
  distance_km: number;
  duration_min: number;
  base_fare: number;
  distance_fee: number;
  time_fee: number;
  traffic_fee: number;
  total_fare: number;
  multiplier: number;
  is_peak: boolean;
  currency: string;
  min_fare: number;
  service_type: string;
  polyline: string | null;
  pickup_address: string;
  dropoff_address: string;
  price_valid_until: string;
  price_lock_minutes: number;
}

export const estimateFare = (data: FareEstimateRequest) => 
  api.post<FareEstimateResponse>('/fare/estimate', {
    pickup_lat: data.pickup_lat,
    pickup_lng: data.pickup_lng,
    dropoff_lat: data.dropoff_lat,
    dropoff_lng: data.dropoff_lng,
    service_type: data.service_type || 'economy',
    city: data.city || 'lagos'
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
}) => api.post(`/trips/request?rider_id=${riderId}`, data);

export const getPendingTrips = (driverLat: number, driverLng: number, driverId?: string) =>
  api.get(
    `/trips/pending?driver_lat=${driverLat}&driver_lng=${driverLng}${driverId ? `&driver_id=${driverId}` : ''}`
  );

export const getDriverTripOffers = (driverId: string) =>
  api.get(`/trips/offers/${driverId}`);

export const declineTripOffer = (offerId: string, driverId: string) =>
  api.put(`/trips/offers/${offerId}/decline`, { driver_id: driverId });

export const acceptTrip = (
  tripId: string,
  driverId: string,
  offerId?: string,
  proposedFare?: number
) =>
  api.put(`/trips/${tripId}/accept`, {
    driver_id: driverId,
    offer_id: offerId,
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

export const confirmTripPayment = (tripId: string) =>
  api.put(`/trips/${tripId}/confirm-payment`);

export const cancelTrip = (tripId: string, cancelledBy: string) =>
  api.put(`/trips/${tripId}/cancel`, { cancelled_by: cancelledBy });

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

export const withdrawDriverEarningsWithBiometric = (
  driverId: string,
  payload: { amount: number; face_image: string }
) =>
  api.post<{
    success: boolean;
    message: string;
    withdrawn_amount: number;
    remaining_balance: number;
    face_match_confidence: number;
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

export const askSupportVoiceBot = (data: {
  message: string;
  user_id?: string;
  trip_id?: string;
  language?: 'auto' | 'en' | 'pcm';
}) => api.post('/support/voice-bot/reply', data);

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

// AI Assistant
export const askRiderAssistant = (userId: string, question: string) =>
  api.get(`/ai/rider-assistant?user_id=${userId}&question=${encodeURIComponent(question)}`);

export const askDriverAssistant = (userId: string, question: string) =>
  api.get(`/ai/driver-assistant?user_id=${userId}&question=${encodeURIComponent(question)}`);

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
export const verifyFace = (userId: string, faceImage: string) =>
  api.post(`/users/${userId}/verify-face`, { face_image: faceImage });

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

// Earnings Predictor
export const predictEarnings = (userId: string, hours: number = 8) =>
  api.get(`/ai/earnings-predictor/${userId}?hours_to_drive=${hours}`);

// Pidgin English AI
export const askRiderAssistantPidgin = (userId: string, question: string) =>
  api.get(`/ai/rider-assistant-pidgin?user_id=${userId}&question=${encodeURIComponent(question)}`);

export const askDriverAssistantPidgin = (userId: string, question: string) =>
  api.get(`/ai/driver-assistant-pidgin?user_id=${userId}&question=${encodeURIComponent(question)}`);

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

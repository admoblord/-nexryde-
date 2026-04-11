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

export const getActiveTrip = (userId: string) =>
  api.get(`/trips/active/${userId}`);

export const getDriverEarningsDashboard = (driverId: string, period: 'today' | 'week' | 'month' = 'today') =>
  api.get(`/driver/earnings/${driverId}?period=${period}`);

// Wallet APIs
export const getWallet = (userId: string) => 
  api.get(`/wallet/${userId}`);

export const topupWallet = (userId: string, amount: number) => 
  api.post(`/wallet/${userId}/topup`, { amount });

export const getWalletTransactions = (userId: string, limit: number = 30) =>
  api.get(`/wallet/${userId}/transactions?limit=${limit}`);

// Emergency Contacts
export const addEmergencyContact = (userId: string, data: { name: string; phone: string; relationship: string }) =>
  api.post(`/users/${userId}/emergency-contacts`, data);

export const getEmergencyContacts = (userId: string) =>
  api.get(`/users/${userId}/emergency-contacts`);

export const removeEmergencyContact = (userId: string, phone: string) =>
  api.delete(`/users/${userId}/emergency-contacts/${phone}`);

// Favorite/Blocked Drivers
export const addFavoriteDriver = (userId: string, driverId: string) =>
  api.post(`/users/${userId}/favorite-drivers`, { driver_id: driverId });

export const removeFavoriteDriver = (userId: string, driverId: string) =>
  api.delete(`/users/${userId}/favorite-drivers/${driverId}`);

export const getFavoriteDrivers = (userId: string) =>
  api.get(`/users/${userId}/favorite-drivers`);

export const checkFavoriteDriver = (userId: string, driverId: string) =>
  api.get(`/users/${userId}/favorite-drivers/${driverId}/check`);

export const blockDriver = (userId: string, driverId: string) =>
  api.post(`/users/${userId}/blocked-drivers`, { driver_id: driverId });

export const unblockDriver = (userId: string, driverId: string) =>
  api.delete(`/users/${userId}/blocked-drivers/${driverId}`);

// SOS & Safety
export const triggerSOS = (data: { trip_id: string; location_lat: number; location_lng: number; auto_triggered?: boolean }) =>
  api.post('/sos/trigger', data);

export const resolveSOS = (sosId: string, resolution: string) =>
  api.post(`/sos/${sosId}/resolve?resolution=${resolution}`);

export const respondToSafetyCheck = (checkId: string, response: string) =>
  api.post('/safety/respond', { check_id: checkId, response });

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
  api.post(`/family/${familyId}/add-member?phone=${phone}&name=${encodeURIComponent(name)}&relationship=${relationship}`);

export const removeFamilyMember = (familyId: string, memberPhone: string) =>
  api.delete(`/family/${familyId}/member/${memberPhone}`);

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

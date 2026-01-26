import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8001';

const api = axios.create({
  baseURL: `${API_URL}/api`,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

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

export const getUserByPhone = (phone: string) => 
  api.get(`/users/phone/${phone}`);

export const updateUser = (userId: string, data: { name?: string; email?: string; profile_image?: string }) => 
  api.put(`/users/${userId}`, data);

export const switchRole = (userId: string) => 
  api.put(`/users/${userId}/switch-role`);

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

export const getSubscriptionHistory = (driverId: string) => 
  api.get(`/subscriptions/${driverId}/history`);

export const createSubscription = (driverId: string, paymentMethod: string) => 
  api.post(`/subscriptions/${driverId}/subscribe`, { payment_method: paymentMethod });

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

export const getPendingTrips = (driverLat: number, driverLng: number) => 
  api.get(`/trips/pending?driver_lat=${driverLat}&driver_lng=${driverLng}`);

export const acceptTrip = (tripId: string, driverId: string) => 
  api.put(`/trips/${tripId}/accept?driver_id=${driverId}`);

export const startTrip = (tripId: string) => 
  api.put(`/trips/${tripId}/start`);

export const completeTrip = (tripId: string) => 
  api.put(`/trips/${tripId}/complete`);

export const cancelTrip = (tripId: string, cancelledBy: string) => 
  api.put(`/trips/${tripId}/cancel?cancelled_by=${cancelledBy}`);

export const rateTrip = (tripId: string, raterId: string, rating: number, comment?: string) => 
  api.put(`/trips/${tripId}/rate?rater_id=${raterId}`, { rating, comment });

export const getUserTrips = (userId: string, role: string = 'rider') => 
  api.get(`/trips/user/${userId}?role=${role}`);

export const getTrip = (tripId: string) => 
  api.get(`/trips/${tripId}`);

// Wallet APIs
export const getWallet = (userId: string) => 
  api.get(`/wallet/${userId}`);

export const topupWallet = (userId: string, amount: number) => 
  api.post(`/wallet/${userId}/topup?amount=${amount}`);

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

// KODA Family
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

export default api;

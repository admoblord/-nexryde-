import axios from 'axios';
import Constants from 'expo-constants';

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

// Trip APIs
export const estimateFare = (data: {
  pickup_lat: number;
  pickup_lng: number;
  dropoff_lat: number;
  dropoff_lng: number;
}) => api.post('/trips/estimate', data);

export const requestTrip = (riderId: string, data: {
  pickup_lat: number;
  pickup_lng: number;
  pickup_address: string;
  dropoff_lat: number;
  dropoff_lng: number;
  dropoff_address: string;
  payment_method?: string;
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

export default api;

import axios from 'axios';
import Constants from 'expo-constants';

const getApiUrl = () => {
  const expoUrl = Constants.expoConfig?.extra?.BACKEND_URL;
  if (expoUrl) return expoUrl;

  const envUrl = process.env.EXPO_PUBLIC_BACKEND_URL;
  if (envUrl) return envUrl;

  return 'https://nexryde-backend-993913300770.us-central1.run.app';
};

const API_URL = getApiUrl();
export const BACKEND_URL = API_URL;

const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

export const sendOTP = (phone: string) => 
  api.post('/api/auth/send-otp', { phone });

export const verifyOTP = (phone: string, otp: string) =>
  api.post('/api/auth/verify-otp', { phone, otp });

export const getUser = (userId: string) => 
  api.get(`/api/users/${userId}`);

export const updateUser = (userId: string, data: any) =>
  api.put(`/api/users/${userId}`, data);


export const getAuthHeaders = () => ({ 'Content-Type': 'application/json' });

export const getDriverSubscriptionStatus = async (driverId: string) => {
  try {
    const res = await api.get(`/api/subscription/status/${driverId}`);
    return res.data;
  } catch { return { status: 'none' }; }
};

export const deleteUserAccount = (userId: string) =>
  api.delete(`/api/users/${userId}`);

export const getDriverStats = (driverId: string) =>
  api.get(`/api/drivers/${driverId}/stats`);

export const getWallet = (userId: string) =>
  api.get(`/api/wallet/${userId}`);

export const getFatigueStatus = (driverId: string) =>
  api.get(`/api/drivers/${driverId}/fatigue`);

export const toggleDriverOnline = (driverId: string, isOnline: boolean) =>
  api.put(`/api/drivers/${driverId}/online?is_online=${isOnline}`);

export const switchRole = (userId: string) =>
  api.put(`/api/users/${userId}/switch-role`);

export const getSubscription = (driverId: string) =>
  api.get(`/api/subscription/status/${driverId}`);

export const getUserTrips = (userId: string, role: string = 'rider') =>
  api.get(`/api/trips/user/${userId}?role=${role}`);

export const getDriverLeaderboard = (period: string = 'weekly') =>
  api.get(`/api/leaderboard/drivers?period=${period}`);

export const getPendingTrips = (driverId: string) =>
  api.get(`/api/trips/pending?driver_id=${driverId}`);

export const acceptTrip = (tripId: string, driverId: string) =>
  api.post(`/api/trips/${tripId}/accept`, { driver_id: driverId });

export const startTrip = (tripId: string) =>
  api.post(`/api/trips/${tripId}/start`);

export const completeTrip = (tripId: string) =>
  api.post(`/api/trips/${tripId}/complete`);

export const cancelTrip = (tripId: string, reason: string = '') =>
  api.post(`/api/trips/${tripId}/cancel`, { reason });

export const getDriverProfile = (driverId: string) =>
  api.get(`/api/drivers/${driverId}/profile`);

export const updateDriverProfile = (driverId: string, data: any) =>
  api.put(`/api/drivers/${driverId}/profile`, data);

export const updateUserTheme = (userId: string, theme: string) =>
  api.put(`/api/users/${userId}/theme?theme=${theme}`);

export const toggleWomenOnlyMode = (userId: string, enabled: boolean) =>
  api.post(`/api/users/${userId}/women-only-mode?enabled=${enabled}`);

export const updateNotificationChannels = (userId: string, channels: any) =>
  api.put(`/api/users/${userId}/notifications/channels`, channels);

export default api;

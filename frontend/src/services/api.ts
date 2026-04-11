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

export const updateUserTheme = (userId: string, theme: string) =>
  api.put(`/api/users/${userId}/theme?theme=${theme}`);

export default api;

/**
 * NEXRYDE Persistent Authentication Service
 * Users stay logged in FOREVER until manual logout
 * 
 * Features:
 * - Auto-save login session
 * - Never expires (permanent session)
 * - Auto-login on app startup
 * - Only logout when user taps logout button
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const SESSION_KEY = '@nexryde_session';
const USER_KEY = '@nexryde_user';

export interface UserSession {
  id: string;
  phone: string;
  name: string;
  email?: string;
  role: 'rider' | 'driver';
  token?: string;
  loginDate: string;
  lastActive: string;
}

/**
 * Save user session (permanent, never expires)
 */
export const saveUserSession = async (user: any, token?: string): Promise<void> => {
  try {
    const session: UserSession = {
      id: user.id,
      phone: user.phone,
      name: user.name,
      email: user.email,
      role: user.role || 'rider',
      token: token,
      loginDate: new Date().toISOString(),
      lastActive: new Date().toISOString(),
    };
    
    // Save session (PERMANENT - never expires!)
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
    
    // Save full user data
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
    
    console.log('✅ Session saved permanently for:', user.phone);
  } catch (error) {
    console.error('Failed to save session:', error);
  }
};

/**
 * Get saved session (check if user is logged in)
 */
export const getSavedSession = async (): Promise<UserSession | null> => {
  try {
    const sessionJson = await AsyncStorage.getItem(SESSION_KEY);
    
    if (!sessionJson) {
      return null;
    }
    
    const session: UserSession = JSON.parse(sessionJson);
    
    // Update last active time
    session.lastActive = new Date().toISOString();
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
    
    return session;
  } catch (error) {
    console.error('Failed to get session:', error);
    return null;
  }
};

/**
 * Get saved user data
 */
export const getSavedUser = async (): Promise<any | null> => {
  try {
    const userJson = await AsyncStorage.getItem(USER_KEY);
    return userJson ? JSON.parse(userJson) : null;
  } catch (error) {
    console.error('Failed to get user:', error);
    return null;
  }
};

/**
 * Update user data (keep session alive)
 */
export const updateUserData = async (user: any): Promise<void> => {
  try {
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
    
    // Update session last active
    const sessionJson = await AsyncStorage.getItem(SESSION_KEY);
    if (sessionJson) {
      const session = JSON.parse(sessionJson);
      session.lastActive = new Date().toISOString();
      session.name = user.name;
      session.email = user.email;
      await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
    }
  } catch (error) {
    console.error('Failed to update user:', error);
  }
};

/**
 * Logout (ONLY way to clear session)
 */
export const clearUserSession = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(SESSION_KEY);
    await AsyncStorage.removeItem(USER_KEY);
    await AsyncStorage.removeItem('@biometric_enabled');
    
    console.log('✅ Session cleared (user logged out)');
  } catch (error) {
    console.error('Failed to clear session:', error);
  }
};

/**
 * Check if user is logged in (has valid session)
 */
export const isUserLoggedIn = async (): Promise<boolean> => {
  const session = await getSavedSession();
  return session !== null;
};

/**
 * Get session age (how long user has been logged in)
 */
export const getSessionAge = async (): Promise<number | null> => {
  const session = await getSavedSession();
  
  if (!session) return null;
  
  const loginDate = new Date(session.loginDate);
  const now = new Date();
  
  // Return age in days
  const ageMs = now.getTime() - loginDate.getTime();
  const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
  
  return ageDays;
};

/**
 * Get last active time
 */
export const getLastActiveTime = async (): Promise<string | null> => {
  const session = await getSavedSession();
  return session?.lastActive || null;
};

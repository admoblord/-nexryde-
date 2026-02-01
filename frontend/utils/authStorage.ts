/**
 * Secure Authentication Storage Service
 * Handles persistent login by storing user data and tokens securely
 */

import * as SecureStore from 'expo-secure-store';

// Storage Keys
const KEYS = {
  USER_DATA: 'user_data',
  AUTH_TOKEN: 'auth_token',
  USER_ID: 'user_id',
  USER_ROLE: 'user_role',
  IS_LOGGED_IN: 'is_logged_in'
};

/**
 * Save user login data securely
 */
export async function saveUserSession(userData: any) {
  try {
    // Store all user data
    await SecureStore.setItemAsync(KEYS.USER_DATA, JSON.stringify(userData));
    await SecureStore.setItemAsync(KEYS.USER_ID, userData.id || '');
    await SecureStore.setItemAsync(KEYS.USER_ROLE, userData.role || '');
    await SecureStore.setItemAsync(KEYS.IS_LOGGED_IN, 'true');
    
    // Store auth token if available
    if (userData.token) {
      await SecureStore.setItemAsync(KEYS.AUTH_TOKEN, userData.token);
    }
    
    console.log('✅ User session saved successfully');
    return true;
  } catch (error) {
    console.error('❌ Error saving user session:', error);
    return false;
  }
}

/**
 * Get stored user data
 */
export async function getUserSession() {
  try {
    const isLoggedIn = await SecureStore.getItemAsync(KEYS.IS_LOGGED_IN);
    
    if (isLoggedIn !== 'true') {
      return null;
    }
    
    const userDataString = await SecureStore.getItemAsync(KEYS.USER_DATA);
    
    if (!userDataString) {
      return null;
    }
    
    const userData = JSON.parse(userDataString);
    const token = await SecureStore.getItemAsync(KEYS.AUTH_TOKEN);
    
    console.log('✅ User session retrieved successfully');
    return {
      ...userData,
      token
    };
  } catch (error) {
    console.error('❌ Error retrieving user session:', error);
    return null;
  }
}

/**
 * Check if user is logged in
 */
export async function isUserLoggedIn(): Promise<boolean> {
  try {
    const isLoggedIn = await SecureStore.getItemAsync(KEYS.IS_LOGGED_IN);
    return isLoggedIn === 'true';
  } catch (error) {
    console.error('❌ Error checking login status:', error);
    return false;
  }
}

/**
 * Get stored user ID
 */
export async function getUserId(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(KEYS.USER_ID);
  } catch (error) {
    console.error('❌ Error getting user ID:', error);
    return null;
  }
}

/**
 * Get stored user role
 */
export async function getUserRole(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(KEYS.USER_ROLE);
  } catch (error) {
    console.error('❌ Error getting user role:', error);
    return null;
  }
}

/**
 * Clear all stored user data (logout)
 */
export async function clearUserSession() {
  try {
    await SecureStore.deleteItemAsync(KEYS.USER_DATA);
    await SecureStore.deleteItemAsync(KEYS.AUTH_TOKEN);
    await SecureStore.deleteItemAsync(KEYS.USER_ID);
    await SecureStore.deleteItemAsync(KEYS.USER_ROLE);
    await SecureStore.deleteItemAsync(KEYS.IS_LOGGED_IN);
    
    console.log('✅ User session cleared successfully');
    return true;
  } catch (error) {
    console.error('❌ Error clearing user session:', error);
    return false;
  }
}

/**
 * Update specific user data field
 */
export async function updateUserData(updates: any) {
  try {
    const currentData = await getUserSession();
    
    if (!currentData) {
      return false;
    }
    
    const updatedData = {
      ...currentData,
      ...updates
    };
    
    return await saveUserSession(updatedData);
  } catch (error) {
    console.error('❌ Error updating user data:', error);
    return false;
  }
}

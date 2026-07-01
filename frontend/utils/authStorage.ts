/**
 * Secure Authentication Storage Service
 * Handles persistent login by storing user data and tokens securely
 * Now with Biometric Authentication (Fingerprint/Face ID)
 */

import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';

// Storage Keys
const KEYS = {
  USER_DATA: 'user_data',
  AUTH_TOKEN: 'auth_token',
  REFRESH_TOKEN: 'refresh_token',
  USER_ID: 'user_id',
  USER_ROLE: 'user_role',
  IS_LOGGED_IN: 'is_logged_in',
  BIOMETRIC_ENABLED: 'biometric_enabled'
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
    
    // Store access token
    if (userData.token) {
      await SecureStore.setItemAsync(KEYS.AUTH_TOKEN, userData.token);
    }
    // Store refresh token (7-day lifetime for seamless re-auth)
    if (userData.refresh_token) {
      await SecureStore.setItemAsync(KEYS.REFRESH_TOKEN, userData.refresh_token);
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
    const refresh_token = await SecureStore.getItemAsync(KEYS.REFRESH_TOKEN);
    
    console.log('✅ User session retrieved successfully');
    return {
      ...userData,
      token,
      ...(refresh_token ? { refresh_token } : {}),
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
    await SecureStore.deleteItemAsync(KEYS.REFRESH_TOKEN);
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

// ==========================================
// BIOMETRIC AUTHENTICATION (NEW)
// ==========================================

/**
 * Check if device supports biometric authentication
 */
export async function isBiometricSupported(): Promise<boolean> {
  try {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    return compatible && enrolled;
  } catch (error) {
    console.error('❌ Error checking biometric support:', error);
    return false;
  }
}

/**
 * Get available biometric types (fingerprint, face, iris)
 */
export async function getBiometricTypes(): Promise<string[]> {
  try {
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    const typeNames: string[] = [];
    
    types.forEach(type => {
      if (type === LocalAuthentication.AuthenticationType.FINGERPRINT) {
        typeNames.push('Fingerprint');
      } else if (type === LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION) {
        typeNames.push('Face ID');
      } else if (type === LocalAuthentication.AuthenticationType.IRIS) {
        typeNames.push('Iris');
      }
    });
    
    return typeNames;
  } catch (error) {
    console.error('❌ Error getting biometric types:', error);
    return [];
  }
}

/**
 * Authenticate user with biometrics
 */
export async function authenticateWithBiometrics(): Promise<{ success: boolean; error?: string }> {
  try {
    const compatible = await isBiometricSupported();
    
    if (!compatible) {
      return {
        success: false,
        error: 'Biometric authentication not available on this device'
      };
    }
    
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Login to NEXRYDE',
      cancelLabel: 'Cancel',
      disableDeviceFallback: false, // Allow PIN/Pattern fallback
      requireConfirmation: false,
    });
    
    if (result.success) {
      console.log('✅ Biometric authentication successful');
      return { success: true };
    } else {
      console.log('❌ Biometric authentication failed:', result.error);
      return {
        success: false,
        error: result.error || 'Authentication failed'
      };
    }
  } catch (error: any) {
    console.error('❌ Biometric authentication error:', error);
    return {
      success: false,
      error: error?.message || 'Authentication error'
    };
  }
}

/**
 * Enable biometric login for user
 */
export async function enableBiometricLogin(): Promise<boolean> {
  try {
    const supported = await isBiometricSupported();
    
    if (!supported) {
      console.log('⚠️ Biometric not supported on this device');
      return false;
    }
    
    // Test authentication first
    const authResult = await authenticateWithBiometrics();
    
    if (authResult.success) {
      await SecureStore.setItemAsync(KEYS.BIOMETRIC_ENABLED, 'true');
      console.log('✅ Biometric login enabled');
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('❌ Error enabling biometric login:', error);
    return false;
  }
}

/**
 * Disable biometric login
 */
export async function disableBiometricLogin(): Promise<boolean> {
  try {
    await SecureStore.deleteItemAsync(KEYS.BIOMETRIC_ENABLED);
    console.log('✅ Biometric login disabled');
    return true;
  } catch (error) {
    console.error('❌ Error disabling biometric login:', error);
    return false;
  }
}

/**
 * Check if biometric login is enabled for current user
 */
export async function isBiometricEnabled(): Promise<boolean> {
  try {
    const enabled = await SecureStore.getItemAsync(KEYS.BIOMETRIC_ENABLED);
    return enabled === 'true';
  } catch (error) {
    console.error('❌ Error checking biometric status:', error);
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

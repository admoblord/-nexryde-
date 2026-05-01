/**
 * NEXRYDE Biometric Authentication Service
 * Implements fingerprint and Face ID authentication
 * 
 * Features:
 * - Fingerprint scanning (Android/iOS)
 * - Face ID (iOS) / Face unlock (Android)
 * - Secure login without password
 * - Trip start verification
 * - Payment authorization
 */

import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Platform } from 'react-native';

/**
 * Check if device supports biometric authentication
 */
export const isBiometricSupported = async (): Promise<boolean> => {
  try {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    return compatible;
  } catch (error) {
    if (__DEV__) console.warn('Biometric support check error:', error);
    return false;
  }
};

/**
 * Check if biometric data is enrolled (fingerprint/face registered)
 */
export const isBiometricEnrolled = async (): Promise<boolean> => {
  try {
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    return enrolled;
  } catch (error) {
    if (__DEV__) console.warn('Biometric enrollment check error:', error);
    return false;
  }
};

/**
 * Get available biometric types
 */
export const getBiometricTypes = async (): Promise<string[]> => {
  try {
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    
    const typeNames = types.map(type => {
      switch (type) {
        case LocalAuthentication.AuthenticationType.FINGERPRINT:
          return 'Fingerprint';
        case LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION:
          return Platform.OS === 'ios' ? 'Face ID' : 'Face Unlock';
        case LocalAuthentication.AuthenticationType.IRIS:
          return 'Iris Scanner';
        default:
          return 'Biometric';
      }
    });
    
    return typeNames;
  } catch (error) {
    if (__DEV__) console.warn('Get biometric types error:', error);
    return [];
  }
};

/**
 * Authenticate user with biometric (fingerprint/Face ID)
 */
export const authenticateWithBiometric = async (
  reason: string = 'Verify your identity'
): Promise<{ success: boolean; error?: string }> => {
  try {
    // Check if supported
    const compatible = await isBiometricSupported();
    if (!compatible) {
      return {
        success: false,
        error: 'Biometric authentication not supported on this device'
      };
    }
    
    // Check if enrolled
    const enrolled = await isBiometricEnrolled();
    if (!enrolled) {
      return {
        success: false,
        error: 'No fingerprint or Face ID registered. Please set up in device settings.'
      };
    }
    
    // Perform authentication
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: reason,
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,  // Allow PIN/password fallback
      fallbackLabel: 'Use PIN instead',
    });
    
    if (result.success) {
      return { success: true };
    } else {
      return {
        success: false,
        error: result.error === 'user_cancel' 
          ? 'Authentication cancelled' 
          : 'Biometric authentication failed'
      };
    }
    
  } catch (error: any) {
    if (__DEV__) console.warn('Biometric auth error:', error);
    return {
      success: false,
      error: error.message || 'Biometric authentication error'
    };
  }
};

/**
 * Enable biometric login for user
 */
export const enableBiometricLogin = async (userId: string): Promise<boolean> => {
  try {
    // First, verify biometric works
    const authResult = await authenticateWithBiometric(
      'Enable biometric login for quick access'
    );
    
    if (!authResult.success) {
      Alert.alert('Error', authResult.error || 'Biometric authentication failed');
      return false;
    }
    
    // Save biometric preference
    await AsyncStorage.setItem(`@biometric_enabled_${userId}`, 'true');
    
    Alert.alert(
      'Biometric Login Enabled',
      Platform.OS === 'ios'
        ? 'You can now use Face ID to login quickly'
        : 'You can now use fingerprint to login quickly'
    );
    
    return true;
    
  } catch (error) {
    if (__DEV__) console.warn('Enable biometric error:', error);
    return false;
  }
};

/**
 * Disable biometric login
 */
export const disableBiometricLogin = async (userId: string): Promise<void> => {
  await AsyncStorage.removeItem(`@biometric_enabled_${userId}`);
};

/**
 * Check if biometric login is enabled for user
 */
export const isBiometricLoginEnabled = async (userId: string): Promise<boolean> => {
  try {
    const enabled = await AsyncStorage.getItem(`@biometric_enabled_${userId}`);
    return enabled === 'true';
  } catch {
    return false;
  }
};

/**
 * Biometric login flow
 */
export const biometricLogin = async (userId: string): Promise<{ success: boolean; error?: string }> => {
  try {
    // Check if biometric login is enabled
    const enabled = await isBiometricLoginEnabled(userId);
    if (!enabled) {
      return {
        success: false,
        error: 'Biometric login not enabled'
      };
    }
    
    // Authenticate with biometric
    const authResult = await authenticateWithBiometric('Login to NEXRYDE');
    
    if (authResult.success) {
      return { success: true };
    } else {
      return authResult;
    }
    
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Biometric login failed'
    };
  }
};

/**
 * Verify sensitive action with biometric
 * Use for: Trip start, payments, profile changes
 */
export const verifyBiometricForAction = async (
  actionName: string
): Promise<boolean> => {
  const result = await authenticateWithBiometric(
    `Verify with ${Platform.OS === 'ios' ? 'Face ID' : 'fingerprint'} to ${actionName}`
  );
  
  return result.success;
};

/**
 * Quick biometric check for app reopen
 */
export const quickBiometricCheck = async (): Promise<boolean> => {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock NEXRYDE',
      cancelLabel: 'Cancel',
      disableDeviceFallback: true,  // Biometric only (no PIN fallback)
    });
    
    return result.success;
  } catch {
    return false;
  }
};

/**
 * Get biometric capability info for display
 */
export const getBiometricInfo = async (): Promise<{
  supported: boolean;
  enrolled: boolean;
  types: string[];
  primaryType: string;
}> => {
  const supported = await isBiometricSupported();
  const enrolled = await isBiometricEnrolled();
  const types = await getBiometricTypes();
  
  const primaryType = types.includes('Face ID') 
    ? 'Face ID'
    : types.includes('Fingerprint')
    ? 'Fingerprint'
    : types[0] || 'Biometric';
  
  return {
    supported,
    enrolled,
    types,
    primaryType
  };
};

/**
 * Biometric settings for drivers
 */
export interface BiometricSettings {
  enabled: boolean;
  useForLogin: boolean;
  useForTripStart: boolean;
  useForPayments: boolean;
}

export const getBiometricSettings = async (userId: string): Promise<BiometricSettings> => {
  try {
    const settingsJson = await AsyncStorage.getItem(`@biometric_settings_${userId}`);
    if (settingsJson) {
      return JSON.parse(settingsJson);
    }
  } catch {}
  
  return {
    enabled: false,
    useForLogin: false,
    useForTripStart: false,
    useForPayments: false,
  };
};

export const saveBiometricSettings = async (
  userId: string,
  settings: Partial<BiometricSettings>
): Promise<void> => {
  const current = await getBiometricSettings(userId);
  const updated = { ...current, ...settings };
  await AsyncStorage.setItem(`@biometric_settings_${userId}`, JSON.stringify(updated));
};

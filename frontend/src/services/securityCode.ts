/**
 * NEXRYDE Security Code Verification System
 * Unique 4-digit codes for ride verification
 * "Right rider, right driver, every time!" 🔐
 */

import { useState, useCallback } from 'react';
import { Alert, Vibration } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface SecurityCode {
  code: string; // 4-digit code
  tripId: string;
  riderId: string;
  riderName: string;
  driverId: string;
  createdAt: number;
  expiresAt: number;
  isVerified: boolean;
  verifiedAt?: number;
  attempts: number;
  maxAttempts: number;
}

export interface VerificationResult {
  success: boolean;
  message: string;
  attemptsRemaining?: number;
  isBlocked?: boolean;
}

/**
 * Security Code Service
 */
export class SecurityCodeService {
  private static readonly CODE_LENGTH = 4;
  private static readonly CODE_EXPIRY_MINUTES = 30;
  private static readonly MAX_ATTEMPTS = 3;
  
  /**
   * Generate unique 4-digit code for trip
   */
  static generateCode(
    tripId: string,
    riderId: string,
    riderName: string,
    driverId: string
  ): SecurityCode {
    // Generate random 4-digit code (1000-9999)
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    
    const now = Date.now();
    const expiresAt = now + (this.CODE_EXPIRY_MINUTES * 60 * 1000);
    
    return {
      code,
      tripId,
      riderId,
      riderName,
      driverId,
      createdAt: now,
      expiresAt,
      isVerified: false,
      attempts: 0,
      maxAttempts: this.MAX_ATTEMPTS,
    };
  }
  
  /**
   * Verify code entered by driver
   */
  static verifyCode(
    enteredCode: string,
    securityCode: SecurityCode
  ): VerificationResult {
    // Check if code expired
    if (Date.now() > securityCode.expiresAt) {
      return {
        success: false,
        message: '⏰ Code expired. Please request a new code from rider.',
      };
    }
    
    // Check if already verified
    if (securityCode.isVerified) {
      return {
        success: true,
        message: '✅ Already verified',
      };
    }
    
    // Check max attempts
    if (securityCode.attempts >= securityCode.maxAttempts) {
      return {
        success: false,
        message: '🚨 Too many wrong attempts! Trip blocked for safety.',
        isBlocked: true,
      };
    }
    
    // Verify code
    if (enteredCode === securityCode.code) {
      securityCode.isVerified = true;
      securityCode.verifiedAt = Date.now();
      
      return {
        success: true,
        message: `✅ Verified! You can start the ride with ${securityCode.riderName}`,
      };
    } else {
      securityCode.attempts += 1;
      const remaining = securityCode.maxAttempts - securityCode.attempts;
      
      // Vibrate for wrong code
      Vibration.vibrate([0, 200, 100, 200]);
      
      if (remaining === 0) {
        return {
          success: false,
          message: '🚨 WRONG CODE! Maximum attempts reached. Trip blocked!',
          attemptsRemaining: 0,
          isBlocked: true,
        };
      }
      
      return {
        success: false,
        message: `❌ Wrong code! ${remaining} attempt${remaining > 1 ? 's' : ''} remaining.`,
        attemptsRemaining: remaining,
      };
    }
  }
  
  /**
   * Format code for display (XX XX)
   */
  static formatCode(code: string): string {
    if (code.length !== 4) return code;
    return `${code.substring(0, 2)} ${code.substring(2, 4)}`;
  }
  
  /**
   * Get time remaining for code
   */
  static getTimeRemaining(securityCode: SecurityCode): string {
    const remaining = securityCode.expiresAt - Date.now();
    if (remaining <= 0) return 'Expired';
    
    const minutes = Math.floor(remaining / (60 * 1000));
    const seconds = Math.floor((remaining % (60 * 1000)) / 1000);
    
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  }
  
  /**
   * Check if code is valid
   */
  static isCodeValid(securityCode: SecurityCode): boolean {
    return (
      !securityCode.isVerified &&
      securityCode.attempts < securityCode.maxAttempts &&
      Date.now() < securityCode.expiresAt
    );
  }
  
  /**
   * Save security code
   */
  static async saveCode(securityCode: SecurityCode): Promise<void> {
    try {
      await AsyncStorage.setItem(`@security_code_${securityCode.tripId}`, JSON.stringify(securityCode));
    } catch (error) {
      console.error('Failed to save security code:', error);
    }
  }
  
  /**
   * Get security code for trip
   */
  static async getCode(tripId: string): Promise<SecurityCode | null> {
    try {
      const data = await AsyncStorage.getItem(`@security_code_${tripId}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Failed to get security code:', error);
      return null;
    }
  }
  
  /**
   * Delete security code
   */
  static async deleteCode(tripId: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(`@security_code_${tripId}`);
    } catch (error) {
      console.error('Failed to delete security code:', error);
    }
  }
}

/**
 * Security Code Hook (for Riders)
 */
export const useSecurityCode = (tripId?: string, riderId?: string, driverId?: string) => {
  const [securityCode, setSecurityCode] = useState<SecurityCode | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  
  /**
   * Generate code for new trip
   */
  const generateCode = useCallback(async (
    newTripId: string,
    newRiderId: string,
    riderName: string,
    newDriverId: string
  ) => {
    setIsGenerating(true);
    
    // Generate code
    const code = SecurityCodeService.generateCode(
      newTripId,
      newRiderId,
      riderName,
      newDriverId
    );
    
    // Save code
    await SecurityCodeService.saveCode(code);
    
    setSecurityCode(code);
    setIsGenerating(false);
    
    return code;
  }, []);
  
  /**
   * Load existing code
   */
  const loadCode = useCallback(async () => {
    if (!tripId) return;
    
    const code = await SecurityCodeService.getCode(tripId);
    setSecurityCode(code);
  }, [tripId]);
  
  /**
   * Refresh code (regenerate)
   */
  const refreshCode = useCallback(async () => {
    if (!securityCode) return null;
    
    // Delete old code
    await SecurityCodeService.deleteCode(securityCode.tripId);
    
    // Generate new code
    const newCode = SecurityCodeService.generateCode(
      securityCode.tripId,
      securityCode.riderId,
      securityCode.riderName,
      securityCode.driverId
    );
    
    await SecurityCodeService.saveCode(newCode);
    setSecurityCode(newCode);
    
    return newCode;
  }, [securityCode]);
  
  useEffect(() => {
    loadCode();
  }, [loadCode]);
  
  return {
    securityCode,
    isGenerating,
    generateCode,
    refreshCode,
    loadCode,
  };
};

/**
 * Security Code Verification Hook (for Drivers)
 */
export const useSecurityVerification = () => {
  const [enteredCode, setEnteredCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  
  /**
   * Verify entered code
   */
  const verifyCode = useCallback(async (
    code: string,
    securityCode: SecurityCode
  ): Promise<VerificationResult> => {
    setIsVerifying(true);
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const result = SecurityCodeService.verifyCode(code, securityCode);
    
    // Save updated code
    await SecurityCodeService.saveCode(securityCode);
    
    setVerificationResult(result);
    setIsVerifying(false);
    
    // Show alert
    if (result.success) {
      Alert.alert('✅ Verified!', result.message, [{ text: 'Start Ride' }]);
    } else if (result.isBlocked) {
      Alert.alert('🚨 TRIP BLOCKED!', result.message, [{ text: 'OK' }]);
    } else {
      Alert.alert('❌ Wrong Code', result.message, [{ text: 'Try Again' }]);
    }
    
    return result;
  }, []);
  
  /**
   * Clear entered code
   */
  const clearCode = useCallback(() => {
    setEnteredCode('');
    setVerificationResult(null);
  }, []);
  
  return {
    enteredCode,
    isVerifying,
    verificationResult,
    setEnteredCode,
    verifyCode,
    clearCode,
  };
};

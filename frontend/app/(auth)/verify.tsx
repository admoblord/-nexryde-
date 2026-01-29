import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import { useAppStore } from '@/src/store/appStore';
import { BACKEND_URL } from '@/src/services/api';

export default function VerifyScreen() {
  const router = useRouter();
  const { phone, pin_id, provider, mock_otp } = useLocalSearchParams<{ 
    phone: string; 
    pin_id: string;
    provider: string;
    mock_otp: string;
  }>();
  const { setUser, setIsAuthenticated } = useAppStore();
  
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(60);
  const [canResend, setCanResend] = useState(false);

  // Countdown timer for resend
  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      setCanResend(true);
    }
  }, [resendTimer]);

  const handleVerifyOTP = async () => {
    if (otp.length !== 6) {
      Alert.alert('Error', 'Please enter the 6-digit code');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          phone: `+234${phone}`,
          otp: otp,
          pin_id: pin_id || undefined
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.detail || 'Verification failed');
      }
      
      if (data.is_new_user) {
        // New user - go to registration
        router.push({
          pathname: '/(auth)/register',
          params: { phone }
        });
      } else {
        // Existing user - log them in
        setUser(data.user);
        setIsAuthenticated(true);
        
        // Route to appropriate app based on role
        if (data.user.role === 'driver') {
          router.replace('/(driver-tabs)/driver-home');
        } else {
          router.replace('/(rider-tabs)/rider-home');
        }
      }
    } catch (error: any) {
      Alert.alert('Verification Failed', error.message || 'Please check the code and try again');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOTP = async () => {
    if (!canResend) return;
    
    setCanResend(false);
    setResendTimer(60);
    
    try {
      const response = await fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL || ''}/api/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: `+234${phone}` }),
      });
      
      if (response.ok) {
        Alert.alert('Success', 'A new verification code has been sent to your phone');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to resend code. Please try again.');
      setCanResend(true);
    }
  };

  const isTermii = provider === 'termii';

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[COLORS.background, COLORS.primary, COLORS.background]}
        style={StyleSheet.absoluteFillObject}
      />
      
      {/* Decorative Glows */}
      <View style={[styles.glow, { top: 100, left: 30, backgroundColor: COLORS.accentGreen }]} />
      <View style={[styles.glow, { bottom: 200, right: 40, backgroundColor: COLORS.accentBlue, width: 60, height: 60 }]} />
      
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.flex}
        >
          <ScrollView contentContainerStyle={styles.content}>
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={24} color={COLORS.white} />
            </TouchableOpacity>

            <View style={styles.header}>
              <View style={styles.iconCircle}>
                <Ionicons name="chatbubble" size={36} color={COLORS.accentGreen} />
              </View>
              <Text style={styles.title}>Verify Phone</Text>
              <Text style={styles.subtitle}>
                {isTermii 
                  ? 'Enter the 6-digit code sent via SMS to'
                  : 'Enter the 6-digit verification code'
                }
              </Text>
              <Text style={styles.phone}>+234 {phone}</Text>
              
              {/* Provider indicator */}
              <View style={styles.providerBadge}>
                <Ionicons 
                  name={isTermii ? "chatbubbles" : "code-working"} 
                  size={14} 
                  color={COLORS.accentGreen} 
                />
                <Text style={styles.providerText}>
                  {isTermii ? 'SMS Verification' : 'Test Mode'}
                </Text>
              </View>
            </View>

            <View style={styles.form}>
              <TextInput
                style={styles.otpInput}
                placeholder="000000"
                placeholderTextColor={COLORS.textMuted}
                value={otp}
                onChangeText={setOtp}
                keyboardType="number-pad"
                maxLength={6}
                autoFocus
              />

              {/* Show OTP hint only for mock/test mode */}
              {!isTermii && mock_otp && (
                <View style={styles.otpHint}>
                  <Ionicons name="information-circle" size={16} color={COLORS.gold} />
                  <Text style={styles.otpHintText}>Test OTP: {mock_otp}</Text>
                </View>
              )}

              <TouchableOpacity
                style={[styles.verifyButton, otp.length === 6 && styles.verifyButtonActive]}
                onPress={handleVerifyOTP}
                disabled={loading || otp.length !== 6}
                activeOpacity={0.9}
              >
                <LinearGradient
                  colors={otp.length === 6 
                    ? [COLORS.accentGreenLight, COLORS.accentGreen, COLORS.accentBlue]
                    : [COLORS.gray700, COLORS.gray700]}
                  style={styles.verifyGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  {loading ? (
                    <ActivityIndicator color={COLORS.primary} />
                  ) : (
                    <>
                      <Text style={[
                        styles.verifyButtonText,
                        otp.length === 6 && styles.verifyButtonTextActive
                      ]}>
                        Verify Code
                      </Text>
                      {otp.length === 6 && (
                        <View style={styles.verifyArrow}>
                          <Ionicons name="checkmark" size={18} color={COLORS.primary} />
                        </View>
                      )}
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.resendButton}
                onPress={handleResendOTP}
                disabled={!canResend}
              >
                <Text style={styles.resendText}>Didn't receive code? </Text>
                {canResend ? (
                  <Text style={styles.resendLink}>Resend</Text>
                ) : (
                  <Text style={styles.resendTimer}>Resend in {resendTimer}s</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  glow: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    opacity: 0.15,
  },
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: SPACING.lg,
    flex: 1,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xl,
  },
  header: {
    alignItems: 'center',
    marginBottom: SPACING.xxl,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.accentGreenSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  title: {
    fontSize: FONT_SIZE.xxxl,
    fontWeight: '800',
    color: COLORS.white,
    marginBottom: SPACING.sm,
  },
  subtitle: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  phone: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
    color: COLORS.white,
    marginTop: SPACING.xs,
  },
  providerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.accentGreenSoft,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
    marginTop: SPACING.md,
    gap: SPACING.xs,
  },
  providerText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.accentGreen,
    fontWeight: '600',
  },
  form: {
    alignItems: 'center',
  },
  otpInput: {
    width: '100%',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.xl,
    fontSize: FONT_SIZE.xxxl,
    fontWeight: '700',
    color: COLORS.white,
    textAlign: 'center',
    letterSpacing: 16,
    borderWidth: 2,
    borderColor: COLORS.surfaceLight,
    marginBottom: SPACING.lg,
  },
  otpHint: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.warningSoft,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    marginBottom: SPACING.lg,
    gap: SPACING.sm,
  },
  otpHintText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.gold,
    fontWeight: '600',
  },
  verifyButton: {
    width: '100%',
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
    marginBottom: SPACING.lg,
  },
  verifyButtonActive: {
    shadowColor: COLORS.accentGreen,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  verifyGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.lg,
  },
  verifyButtonText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  verifyButtonTextActive: {
    color: COLORS.primary,
    marginRight: SPACING.sm,
  },
  verifyArrow: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resendButton: {
    flexDirection: 'row',
  },
  resendText: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
  },
  resendLink: {
    fontSize: FONT_SIZE.md,
    color: COLORS.accentGreen,
    fontWeight: '600',
  },
  resendTimer: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
});

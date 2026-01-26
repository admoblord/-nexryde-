import React, { useState } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS } from '@/src/constants/theme';
import { verifyOTP } from '@/src/services/api';
import { useAppStore } from '@/src/store/appStore';

export default function VerifyScreen() {
  const router = useRouter();
  const { phone, otp: expectedOTP } = useLocalSearchParams<{ phone: string; otp: string }>();
  const { setUser, setIsAuthenticated } = useAppStore();
  
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);

  const handleVerifyOTP = async () => {
    if (otp.length !== 6) {
      Alert.alert('Error', 'Please enter the 6-digit code');
      return;
    }

    setLoading(true);
    try {
      const response = await verifyOTP(phone!, otp);
      
      if (response.data.is_new_user) {
        // New user - go to registration
        router.push({
          pathname: '/(auth)/register',
          params: { phone }
        });
      } else {
        // Existing user - log them in
        setUser(response.data.user);
        setIsAuthenticated(true);
        
        // Route to appropriate app based on role
        if (response.data.user.role === 'driver') {
          router.replace('/(driver-tabs)/driver-home');
        } else {
          router.replace('/(rider-tabs)/rider-home');
        }
      }
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
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
              <Ionicons name="shield-checkmark" size={40} color={COLORS.accent} />
            </View>
            <Text style={styles.title}>Verification</Text>
            <Text style={styles.subtitle}>Enter the 6-digit code sent to</Text>
            <Text style={styles.phone}>+234 {phone}</Text>
          </View>

          <View style={styles.form}>
            <TextInput
              style={styles.otpInput}
              placeholder="000000"
              placeholderTextColor={COLORS.gray500}
              value={otp}
              onChangeText={setOtp}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
            />

            {/* Show OTP hint for MVP */}
            {expectedOTP && (
              <View style={styles.otpHint}>
                <Ionicons name="information-circle" size={16} color={COLORS.accent} />
                <Text style={styles.otpHintText}>Demo OTP: {expectedOTP}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[
                styles.verifyButton,
                otp.length === 6 && styles.verifyButtonActive
              ]}
              onPress={handleVerifyOTP}
              disabled={loading || otp.length !== 6}
              activeOpacity={0.8}
            >
              <Text style={[
                styles.verifyButtonText,
                otp.length === 6 && styles.verifyButtonTextActive
              ]}>
                {loading ? 'Verifying...' : 'Verify'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.resendButton}>
              <Text style={styles.resendText}>Didn't receive code? </Text>
              <Text style={styles.resendLink}>Resend</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.primary,
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
    backgroundColor: 'rgba(255,255,255,0.1)',
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
    backgroundColor: 'rgba(255,215,0,0.15)',
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
    color: COLORS.gray400,
  },
  phone: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
    color: COLORS.white,
    marginTop: SPACING.xs,
  },
  form: {
    alignItems: 'center',
  },
  otpInput: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: BORDER_RADIUS.xl,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.xl,
    fontSize: FONT_SIZE.xxxl,
    fontWeight: '700',
    color: COLORS.white,
    textAlign: 'center',
    letterSpacing: 16,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.1)',
    marginBottom: SPACING.lg,
  },
  otpHint: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,215,0,0.1)',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    marginBottom: SPACING.lg,
    gap: SPACING.sm,
  },
  otpHintText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.accent,
    fontWeight: '600',
  },
  verifyButton: {
    width: '100%',
    backgroundColor: COLORS.gray700,
    paddingVertical: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  verifyButtonActive: {
    backgroundColor: COLORS.accent,
    ...SHADOWS.gold,
  },
  verifyButtonText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.gray400,
  },
  verifyButtonTextActive: {
    color: COLORS.primary,
  },
  resendButton: {
    flexDirection: 'row',
  },
  resendText: {
    fontSize: FONT_SIZE.md,
    color: COLORS.gray400,
  },
  resendLink: {
    fontSize: FONT_SIZE.md,
    color: COLORS.accent,
    fontWeight: '600',
  },
});

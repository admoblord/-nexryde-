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
  Dimensions,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS } from '@/src/constants/theme';
import { sendOTP } from '@/src/services/api';

const { width } = Dimensions.get('window');

export default function LoginScreen() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);

  const formatPhone = (text: string) => {
    const cleaned = text.replace(/[^0-9]/g, '');
    setPhone(cleaned);
  };

  const handleSendOTP = async () => {
    if (phone.length < 10) {
      Alert.alert('Invalid Phone', 'Please enter a valid phone number');
      return;
    }

    setLoading(true);
    try {
      const formattedPhone = phone.startsWith('0') ? phone : `0${phone}`;
      const response = await sendOTP(formattedPhone);
      
      router.push({
        pathname: '/(auth)/verify',
        params: { phone: formattedPhone, otp: response.data.otp }
      });
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header with Logo */}
          <View style={styles.header}>
            <View style={styles.logoContainer}>
              <View style={styles.logoOuter}>
                <Text style={styles.logoText}>K</Text>
              </View>
            </View>
            <Text style={styles.welcomeText}>Welcome to</Text>
            <Text style={styles.brandName}>KODA</Text>
            <Text style={styles.subtitle}>Nigeria's Premium Ride Platform</Text>
          </View>

          {/* Phone Input Section */}
          <View style={styles.formSection}>
            <Text style={styles.inputLabel}>Enter your phone number</Text>
            <View style={[
              styles.phoneContainer,
              focused && styles.phoneContainerFocused
            ]}>
              <View style={styles.countryCode}>
                <Text style={styles.flagEmoji}>🇳🇬</Text>
                <Text style={styles.codeText}>+234</Text>
                <View style={styles.divider} />
              </View>
              <TextInput
                style={styles.phoneInput}
                placeholder="801 234 5678"
                placeholderTextColor={COLORS.gray400}
                value={phone}
                onChangeText={formatPhone}
                keyboardType="phone-pad"
                maxLength={11}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
              />
            </View>

            {/* Continue Button */}
            <TouchableOpacity
              style={[
                styles.continueButton,
                phone.length >= 10 && styles.continueButtonActive
              ]}
              onPress={handleSendOTP}
              disabled={loading || phone.length < 10}
              activeOpacity={0.8}
            >
              {loading ? (
                <Text style={styles.continueText}>Sending...</Text>
              ) : (
                <>
                  <Text style={[
                    styles.continueText,
                    phone.length >= 10 && styles.continueTextActive
                  ]}>Continue</Text>
                  <View style={[
                    styles.arrowContainer,
                    phone.length >= 10 && styles.arrowContainerActive
                  ]}>
                    <Ionicons 
                      name="arrow-forward" 
                      size={20} 
                      color={phone.length >= 10 ? COLORS.accent : COLORS.gray400} 
                    />
                  </View>
                </>
              )}
            </TouchableOpacity>

            <Text style={styles.termsText}>
              By continuing, you agree to our{' '}
              <Text style={styles.linkText}>Terms of Service</Text>
              {' '}and{' '}
              <Text style={styles.linkText}>Privacy Policy</Text>
            </Text>
          </View>

          {/* Features Section */}
          <View style={styles.featuresSection}>
            <View style={styles.featureCard}>
              <View style={[styles.featureIcon, { backgroundColor: COLORS.accentSoft }]}>
                <Ionicons name="cash-outline" size={24} color={COLORS.accent} />
              </View>
              <View style={styles.featureContent}>
                <Text style={styles.featureTitle}>Zero Commission</Text>
                <Text style={styles.featureDesc}>Drivers keep 100% of earnings</Text>
              </View>
            </View>

            <View style={styles.featureCard}>
              <View style={[styles.featureIcon, { backgroundColor: COLORS.successSoft }]}>
                <Ionicons name="shield-checkmark-outline" size={24} color={COLORS.success} />
              </View>
              <View style={styles.featureContent}>
                <Text style={styles.featureTitle}>Verified Drivers</Text>
                <Text style={styles.featureDesc}>All drivers are fully verified</Text>
              </View>
            </View>

            <View style={styles.featureCard}>
              <View style={[styles.featureIcon, { backgroundColor: COLORS.infoSoft }]}>
                <Ionicons name="location-outline" size={24} color={COLORS.info} />
              </View>
              <View style={styles.featureContent}>
                <Text style={styles.featureTitle}>Live Tracking</Text>
                <Text style={styles.featureDesc}>Real-time trip monitoring</Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.xxl,
  },
  header: {
    alignItems: 'center',
    marginBottom: SPACING.xxl,
  },
  logoContainer: {
    marginBottom: SPACING.lg,
  },
  logoOuter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.lg,
  },
  logoText: {
    fontSize: 44,
    fontWeight: '900',
    color: COLORS.accent,
  },
  welcomeText: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  brandName: {
    fontSize: FONT_SIZE.xxxl,
    fontWeight: '900',
    color: COLORS.primary,
    letterSpacing: 6,
  },
  subtitle: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textTertiary,
    marginTop: SPACING.xs,
  },
  formSection: {
    marginBottom: SPACING.xxl,
  },
  inputLabel: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: SPACING.md,
  },
  phoneContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.gray50,
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 2,
    borderColor: COLORS.gray100,
    overflow: 'hidden',
    marginBottom: SPACING.lg,
  },
  phoneContainerFocused: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.white,
  },
  countryCode: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.lg,
    backgroundColor: COLORS.gray100,
  },
  flagEmoji: {
    fontSize: 22,
    marginRight: SPACING.sm,
  },
  codeText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  divider: {
    width: 1,
    height: 24,
    backgroundColor: COLORS.gray300,
    marginLeft: SPACING.md,
  },
  phoneInput: {
    flex: 1,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.lg,
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
    color: COLORS.textPrimary,
    letterSpacing: 1,
  },
  continueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.gray100,
    paddingVertical: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    marginBottom: SPACING.lg,
  },
  continueButtonActive: {
    backgroundColor: COLORS.primary,
    ...SHADOWS.lg,
  },
  continueText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.gray400,
    marginRight: SPACING.sm,
  },
  continueTextActive: {
    color: COLORS.accent,
  },
  arrowContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.gray200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowContainerActive: {
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
  },
  termsText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textTertiary,
    textAlign: 'center',
    lineHeight: 18,
  },
  linkText: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  featuresSection: {
    gap: SPACING.md,
  },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.gray50,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
  },
  featureIcon: {
    width: 48,
    height: 48,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureContent: {
    marginLeft: SPACING.md,
    flex: 1,
  },
  featureTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 2,
  },
  featureDesc: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
});

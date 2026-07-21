import React, { useEffect, useState, useRef } from 'react';
import { useErrorToast } from '@/src/components/shared/ErrorToast';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
  Linking,
  Image,
  Animated,
  Easing,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import axios from 'axios';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import * as ImagePicker from 'expo-image-picker';
import { useAppStore, type User } from '@/src/store/appStore';
import { getUserSession, isUserLoggedIn, saveUserSession } from '@/utils/authStorage';
import { setTokens, warmTokenCache } from '@/src/lib/tokenStore';
import { autoApplyPendingReferral } from '@/src/services/referralService';
import { BACKEND_URL } from '@/src/services/api';
import { routeAuthedUser } from '@/src/utils/routeAuthedUser';
import { useRedirectIfAuthed } from '@/src/hooks/useRedirectIfAuthed';
import { initiateEmailLogin, publicFetchErrorMessage } from '@/src/utils/publicApi';
import { warmBackendConnection, warmBackendWhileWaiting } from '@/src/utils/warmBackend';
import { OnboardingPhotoHero } from '@/src/components/onboarding/OnboardingPhotoHero';

import { BRAND } from '@/src/constants/designSystem';

const LOGIN_HERO = require('../../assets/images/onboarding/login-hero.png');

// Login chrome — aligned with designSystem.BRAND
const COLORS = {
  background: BRAND.bgDeep,
  primary: BRAND.bgElevated,
  surface: BRAND.bgCard,
  surfaceLight: BRAND.bgElevated,
  green: BRAND.primary,
  greenLight: BRAND.primaryLight,
  greenSoft: BRAND.primaryMuted,
  blue: BRAND.accentBlue,
  blueDark: '#1A4FCC',
  blueSoft: 'rgba(0,102,255,0.12)',
  white: '#FFFFFF',
  textSecondary: BRAND.textSecondary,
  textMuted: BRAND.textMuted,
  gray700: '#2D3748',
  google: '#4285F4',
  googleSoft: 'rgba(66, 133, 244, 0.15)',
  bankGold: 'rgba(212, 175, 55, 0.38)',
  bankGoldBright: '#D4AF37',
  bankInk: '#06090E',
  bankVeil: '#0E141C',
};

export default function LoginScreen() {
  const toast = useErrorToast();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ flow?: string; role?: string }>();
  const requestedFlow = params.flow === 'register' ? 'register' : 'login';
  const requestedRole = params.role === 'driver' || params.role === 'rider' ? params.role : null;
  const [email, setEmail] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [biometricReady, setBiometricReady] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [deviceId, setDeviceId] = useState<string>('');
  const [loginError, setLoginError] = useState<string>('');
  const { setUser, setIsAuthenticated } = useAppStore();
  const canShowAuth = useRedirectIfAuthed();

  useEffect(() => {
    warmBackendConnection(true);
    const interval = setInterval(warmBackendWhileWaiting, 10_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const checkBiometricLoginAvailability = async () => {
      try {
        const { isBiometricEnabled, isBiometricSupported } = await import('@/utils/authStorage');
        const [enabled, supported, savedSession] = await Promise.all([
          isBiometricEnabled(),
          isBiometricSupported(),
          getUserSession(),
        ]);
        setBiometricReady(Boolean(enabled && supported && savedSession));
      } catch {
        setBiometricReady(false);
      }
    };
    void checkBiometricLoginAvailability();
  }, []);

  useEffect(() => {
    const ensureDeviceId = async () => {
      const key = 'nexryde_device_id';
      const existing = await SecureStore.getItemAsync(key);
      if (existing) {
        setDeviceId(existing);
        return;
      }
      const generated = `dev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      await SecureStore.setItemAsync(key, generated);
      setDeviceId(generated);
    };
    void ensureDeviceId();
  }, []);
  
  const openLegal = async (path: string) => {
    try {
      await Linking.openURL(`${BACKEND_URL}${path}`);
    } catch {
      Alert.alert('Unable to open link', 'Please try again later.');
    }
  };

  const routeVerifiedUser = async (loggedUser: User, resolvedToken: string | null) => {
    await routeAuthedUser(router, loggedUser, resolvedToken);
  };

  /**
   * Email-first auth: existing approved users sign in instantly; new users go
   * straight to registration. Existing drivers on a new device get the identity
   * fortress check (face + phone + PIN).
   */
  const handleEmailContinue = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);
    if (!validEmail) {
      toast.show('Please enter a valid email address.', 'warning');
      return;
    }

    setEmailLoading(true);
    try {
      const { res, data } = await initiateEmailLogin({
        email: normalizedEmail,
        device_id: deviceId || undefined,
      });
      if (!res.ok) {
        const detail = data?.detail || data?.message || 'Please try again.';
        setLoginError(String(detail));
        toast.show(String(detail), 'error');
        return;
      }
      setLoginError('');

      // Existing approved user → sign in instantly.
      const resolvedToken = (data?.token ?? data?.access_token ?? (data?.user as Record<string, unknown> | undefined)?.token ?? null) as
        | string
        | null;
      const resolvedRefreshToken = (data?.refresh_token ?? null) as string | null;
      if (data?.user && resolvedToken) {
        await setTokens(resolvedToken, resolvedRefreshToken);
        setUser(data.user as User);
        setIsAuthenticated(true);
        await saveUserSession({
          ...(data.user as User),
          token: resolvedToken,
          ...(resolvedRefreshToken ? { refresh_token: resolvedRefreshToken } : {}),
        });
        // Schedule daily offer/engagement notifications for this role
        import('@/src/services/nexrydeScheduledNotifications')
          .then(({ scheduleOfferNotificationsForRole }) =>
            scheduleOfferNotificationsForRole((data.user as User).role as 'rider' | 'driver')
          )
          .catch(() => {});
        if ((data.user as User).role !== 'driver') {
          void autoApplyPendingReferral((data.user as User).id, resolvedToken);
        }
        if (Platform.OS !== 'web') {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        await routeVerifiedUser(data.user as User, resolvedToken);
        return;
      }

      // New user → straight to registration / onboarding.
      const emailData = data?.email_data as Record<string, unknown> | undefined;
      continueToOnboarding(
        (emailData?.email as string) || normalizedEmail,
        emailData?.name as string | undefined,
      );
    } catch (e: unknown) {
      toast.show(publicFetchErrorMessage(e), 'error');
    } finally {
      setEmailLoading(false);
    }
  };

  const continueToOnboarding = (verifiedEmail: string, suggestedName?: string) => {
    const newName = suggestedName || verifiedEmail.split('@')[0];
    if (requestedRole === 'driver') {
      // Collect Nigerian phone on register before terms — stored for rider contact and NEXRYDE records.
      router.push({
        pathname: '/(auth)/register',
        params: {
          email: verifiedEmail,
          name: newName,
          auth_type: 'email',
          role: 'driver',
        },
      });
      return;
    }
    if (requestedRole === 'rider') {
      router.push({
        pathname: '/(auth)/register',
        params: { email: verifiedEmail, name: newName, auth_type: 'email', role: 'rider' },
      });
      return;
    }
    router.push({
      pathname: '/(auth)/register',
      params: { email: verifiedEmail, name: newName, auth_type: 'email' },
    });
  };

  // Fortress and SIM-swap verification removed — open access

  const handleBiometricSignIn = async () => {
    setBiometricLoading(true);
    try {
      const { authenticateWithBiometrics } = await import('@/utils/authStorage');
      const auth = await authenticateWithBiometrics();
      if (!auth.success) {
        Alert.alert('Biometric Failed', auth.error || 'Could not verify identity.');
        return;
      }

      const saved = await getUserSession();
      if (!saved) {
        Alert.alert('Session Missing', 'No saved account found. Please sign in with email.');
        setBiometricReady(false);
        return;
      }

      await setTokens(saved?.token || '', saved?.refresh_token);
      setUser(saved);
      setIsAuthenticated(true);
      await routeVerifiedUser(saved, saved?.token || null);
    } finally {
      setBiometricLoading(false);
    }
  };

  const emailAuthCard = (
    <AuthEmailCardBody
      email={email}
      setEmail={setEmail}
      emailLoading={emailLoading}
      onContinue={handleEmailContinue}
    />
  );

  if (!canShowAuth) {
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={[COLORS.background, COLORS.primary, COLORS.background]}
          style={StyleSheet.absoluteFillObject}
        />
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.authHydrateShell}>
            <ActivityIndicator size="large" color={COLORS.green} />
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const heroTitle =
    requestedFlow === 'register'
      ? requestedRole === 'driver'
        ? 'Drive with NEXRYDE'
        : 'Ride with NEXRYDE'
      : 'What’s your email?';

  return (
    <View style={styles.container}>
      <OnboardingPhotoHero source={LOGIN_HERO} />

      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardView}
        >
          <ScrollView
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: Math.max(insets.bottom, 28) },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <View style={[styles.heroBrand, { paddingTop: 12 }]}>
              <Text style={styles.brandMark}>
                <Text style={styles.brandNex}>NEX</Text>
                <Text style={styles.brandRyde}>RYDE</Text>
              </Text>
              <Text style={styles.heroSupport}>Your city. Your ride. Across Nigeria.</Text>
            </View>

            <View style={styles.spacer} />

            <View style={styles.formSection}>
              <Text style={styles.formTitle}>{heroTitle}</Text>
              <Text style={styles.formLead}>
                {requestedFlow === 'register'
                  ? 'Use your email to get set up — it only takes a moment.'
                  : 'We’ll sign you in if you already ride with us, or create your account if you’re new.'}
              </Text>

              {!!loginError && (
                <View style={styles.errorBanner}>
                  <Ionicons name="alert-circle" size={18} color="#EF4444" />
                  <Text style={styles.errorBannerText} numberOfLines={3}>
                    {loginError}
                  </Text>
                  <TouchableOpacity onPress={() => setLoginError('')}>
                    <Ionicons name="close" size={16} color="#94A3B8" />
                  </TouchableOpacity>
                </View>
              )}

              <View style={styles.authPanel}>{emailAuthCard}</View>

              {biometricReady && (
                <TouchableOpacity
                  style={styles.biometricButton}
                  onPress={handleBiometricSignIn}
                  disabled={biometricLoading}
                  activeOpacity={0.9}
                >
                  {biometricLoading ? (
                    <ActivityIndicator color={COLORS.green} />
                  ) : (
                    <>
                      <Ionicons
                        name="finger-print"
                        size={20}
                        color={COLORS.green}
                        style={{ marginRight: 8 }}
                      />
                      <Text style={styles.biometricButtonText}>Use Face ID / fingerprint</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}

              <Text style={styles.termsText}>
                By continuing, you agree to our{' '}
                <Text style={styles.linkText} onPress={() => openLegal('/terms-of-service')}>
                  Terms
                </Text>{' '}
                and{' '}
                <Text style={styles.linkText} onPress={() => openLegal('/privacy-policy')}>
                  Privacy Policy
                </Text>
                .
              </Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

type AuthEmailCardProps = {
  email: string;
  setEmail: (v: string) => void;
  emailLoading: boolean;
  onContinue: () => void | Promise<void>;
};

function AuthEmailCardBody({ email, setEmail, emailLoading, onContinue }: AuthEmailCardProps) {
  const normalizedReady = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  return (
    <>
      <View style={styles.emailFieldWrap}>
        <Ionicons name="mail-outline" size={20} color={COLORS.textMuted} style={styles.emailFieldIcon} />
        <TextInput
          style={styles.emailInputInner}
          placeholder="name@email.com"
          placeholderTextColor={COLORS.textMuted}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          value={email}
          onChangeText={setEmail}
          returnKeyType="go"
          onSubmitEditing={() => {
            if (normalizedReady && !emailLoading) void onContinue();
          }}
        />
      </View>
      <TouchableOpacity
        style={[styles.primaryCtaWrap, !normalizedReady && styles.primaryCtaWrapDim]}
        onPress={() => void onContinue()}
        disabled={emailLoading || !normalizedReady}
        activeOpacity={0.92}
        accessibilityRole="button"
        accessibilityLabel="Continue"
      >
        <LinearGradient
          colors={
            normalizedReady && !emailLoading
              ? [COLORS.greenLight, COLORS.green, COLORS.blue]
              : ['#2A3548', '#2A3548']
          }
          style={styles.primaryCtaGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        >
          {emailLoading ? (
            <ActivityIndicator color={COLORS.primary} />
          ) : (
            <>
              <Text style={[styles.primaryCtaText, normalizedReady && styles.primaryCtaTextOn]}>
                Continue
              </Text>
              <Ionicons
                name="arrow-forward"
                size={18}
                color={normalizedReady ? COLORS.primary : COLORS.textMuted}
                style={{ marginLeft: 8 }}
              />
            </>
          )}
        </LinearGradient>
      </TouchableOpacity>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  safeArea: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  authHydrateShell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
  },
  heroBrand: {
    zIndex: 2,
  },
  brandMark: {
    letterSpacing: 1,
  },
  brandNex: {
    fontSize: 34,
    fontWeight: '900',
    color: COLORS.white,
    letterSpacing: 1.5,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  brandRyde: {
    fontSize: 34,
    fontWeight: '900',
    color: COLORS.green,
    letterSpacing: 1.5,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  heroSupport: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(248,250,252,0.78)',
    letterSpacing: 0.1,
  },
  spacer: {
    flexGrow: 1,
    minHeight: 160,
  },
  formSection: {
    zIndex: 2,
    marginBottom: 8,
  },
  formTitle: {
    fontSize: 30,
    fontWeight: '800',
    color: '#F8FAFC',
    marginBottom: 8,
    letterSpacing: -0.7,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
  formLead: {
    fontSize: 15,
    fontWeight: '400',
    color: 'rgba(226,232,240,0.88)',
    lineHeight: 22,
    marginBottom: 20,
    maxWidth: 360,
  },
  authPanel: {
    marginBottom: 14,
  },
  emailFieldWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(8,12,20,0.72)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  emailFieldIcon: {
    marginRight: 10,
  },
  emailInputInner: {
    flex: 1,
    paddingVertical: 16,
    fontSize: 16,
    color: COLORS.white,
    fontWeight: '600',
  },
  primaryCtaWrap: {
    borderRadius: 18,
    overflow: 'hidden',
  },
  primaryCtaWrapDim: {
    opacity: 0.72,
  },
  primaryCtaGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 17,
    paddingHorizontal: 24,
  },
  primaryCtaText: {
    fontSize: 16,
    fontWeight: '900',
    color: COLORS.textMuted,
  },
  primaryCtaTextOn: {
    color: COLORS.primary,
  },
  codeFieldWrap: {
    marginBottom: 14,
  },
  codeInput: {
    backgroundColor: 'rgba(13,20,32,0.65)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(58,209,115,0.35)',
    paddingHorizontal: 18,
    paddingVertical: 16,
    color: COLORS.white,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 8,
    textAlign: 'center',
  },
  resendRow: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  resendText: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.textSecondary,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
    marginBottom: 16,
    overflow: 'hidden',
  },
  prefixContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 18,
    backgroundColor: COLORS.surfaceLight,
    borderRightWidth: 1,
    borderRightColor: COLORS.surface,
  },
  flag: {
    fontSize: 24,
    marginRight: 8,
  },
  prefixText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#64748B',
  },
  input: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 18,
    fontSize: 17,
    color: COLORS.white,
    letterSpacing: 1,
  },
  continueButton: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 16,
  },
  continueButtonActive: {
    shadowColor: COLORS.green,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  buttonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    paddingHorizontal: 32,
  },
  continueButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  continueButtonTextActive: {
    color: COLORS.primary,
  },
  biometricButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8,12,20,0.55)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(34,225,128,0.35)',
    paddingVertical: 14,
    marginBottom: 10,
  },
  biometricButtonText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: '700',
  },
  orDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
  },
  orLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.surfaceLight,
  },
  orText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '700',
    marginHorizontal: 16,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  googleButton: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
    marginBottom: 16,
  },
  // SIM swap / error banners
  simSwapBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
  },
  simSwapIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(239,68,68,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  simSwapTitle: {
    color: '#FCA5A5',
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 4,
  },
  simSwapText: {
    color: 'rgba(252,165,165,0.85)',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
    marginBottom: 10,
  },
  simSwapCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EF4444',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignSelf: 'flex-start',
  },
  simSwapCtaText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '800',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.2)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  errorBannerText: {
    flex: 1,
    color: '#FCA5A5',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  emailContainer: {
    gap: 10,
    marginBottom: 12,
  },
  emailInput: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: COLORS.white,
    fontSize: 15,
  },
  emailLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#E2E8F0',
    marginBottom: 2,
  },
  helpText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94A3B8',
    lineHeight: 18,
  },
  loginButton: {
    borderRadius: 16,
    backgroundColor: COLORS.green,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  loginButtonDisabled: {
    opacity: 0.55,
  },
  loginButtonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '800',
  },
  googleButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    paddingHorizontal: 32,
  },
  googleIconContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.googleSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  googleButtonText: {
    fontSize: 17,
    fontWeight: '900',
    color: COLORS.white,
  },
  termsText: {
    textAlign: 'center',
    fontSize: 12,
    color: 'rgba(203,213,225,0.78)',
    lineHeight: 18,
    fontWeight: '500',
    marginTop: 4,
  },
  linkText: {
    color: COLORS.greenLight,
    fontWeight: '700',
  },
  features: {
    gap: 12,
  },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
  },
  featureIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#E2E8F0',
    marginBottom: 2,
    letterSpacing: -0.5,
  },
  featureSubtitle: {
    fontSize: 13,
    color: '#94A3B8',
    fontWeight: '700',
  },
  bankVaultCard: {
    marginBottom: 14,
    borderRadius: 22,
    overflow: 'hidden',
    padding: 20,
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.32)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 22 },
    shadowOpacity: 0.48,
    shadowRadius: 30,
    elevation: 20,
    gap: 14,
  },
  bankVaultHeader: {
    gap: 8,
  },
  bankVaultBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(212, 175, 55, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.28)',
  },
  bankVaultBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.4,
    color: COLORS.bankGoldBright,
  },
  bankVaultTitle: {
    fontSize: 23,
    fontWeight: '900',
    color: '#F8FAFC',
    letterSpacing: -0.9,
  },
  bankVaultBody: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  bankVaultMasked: {
    color: COLORS.greenLight,
    fontWeight: '800',
  },
  bankFaceRingWrap: {
    alignSelf: 'center',
    marginVertical: 4,
  },
  bankFaceOuterRing: {
    width: 174,
    height: 174,
    borderRadius: 87,
    padding: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bankFaceInnerCutout: {
    width: 168,
    height: 168,
    borderRadius: 83,
    backgroundColor: COLORS.bankInk,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bankFacePreviewImg: {
    width: '100%',
    height: '100%',
  },
  bankFaceRetakeFab: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(15,23,42,0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(248,250,252,0.22)',
  },
  bankFacePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    gap: 6,
  },
  bankFaceScanIcon: {
    marginBottom: 4,
  },
  bankFacePlaceholderTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#E2E8F0',
    textAlign: 'center',
  },
  bankFacePlaceholderSub: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 17,
  },
  bankTipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  bankTipChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  bankTipChipText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#CBD5E1',
  },
  bankFieldStack: {
    gap: 10,
  },
  bankFieldShell: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 12,
  },
  bankFieldIconWrap: {
    width: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bankFieldInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.white,
  },
  bankPrimaryOuter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 17,
    borderRadius: 16,
    backgroundColor: COLORS.green,
    marginTop: 2,
  },
  bankPrimaryOuterDim: {
    backgroundColor: '#1F2937',
    opacity: 0.88,
  },
  bankPrimaryText: {
    fontSize: 16,
    fontWeight: '900',
  },
  bankPrimaryTextOn: {
    color: COLORS.bankInk,
  },
  bankPrimaryTextDim: {
    color: COLORS.textMuted,
  },
  bankFootnote: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 16,
    marginTop: 2,
  },
});

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
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
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

// Colors based on NEXRYDE logo
const COLORS = {
  background: '#0D1420',
  primary: '#19253F',
  surface: '#19253F',
  surfaceLight: '#243654',
  green: '#22E180',
  greenLight: '#6DFFC3',
  greenSoft: 'rgba(34,225,128,0.12)',
  blue: '#0066FF',
  blueDark: '#1A4FCC',
  blueSoft: 'rgba(0,102,255,0.12)',
  white: '#FFFFFF',
  textSecondary: '#A8B8D0',
  textMuted: '#6B7A94',
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
      // Collect Nigerian phone on register before terms — stored for rider contact and NexRyde records.
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

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[COLORS.background, COLORS.primary, COLORS.background]}
        style={StyleSheet.absoluteFillObject}
      />
      
      {/* Decorative Glows */}
      <View style={[styles.glow, { top: 80, left: 30, backgroundColor: COLORS.green }]} />
      <View style={[styles.glow, { top: 200, right: 40, backgroundColor: COLORS.blue, width: 60, height: 60 }]} />
      
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardView}
        >
          <ScrollView 
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Header Section */}
            <View style={styles.header}>
              {/* Logo */}
              <View style={styles.logoContainer}>
                <LinearGradient
                  colors={[COLORS.greenLight, COLORS.green]}
                  style={styles.logoLeft}
                />
                <LinearGradient
                  colors={[COLORS.blue, COLORS.blueDark]}
                  style={styles.logoRight}
                />
                <View style={styles.roadLine}>
                  <View style={styles.roadDash} />
                  <View style={styles.roadDash} />
                </View>
              </View>
              
              <Text style={styles.welcomeText}>Welcome to</Text>
              <View style={styles.brandRow}>
                <Text style={styles.brandNex}>NEX</Text>
                <Text style={styles.brandRyde}>RYDE</Text>
              </View>
              <Text style={styles.subtitleText}>Nigeria's Premium Ride Experience</Text>
            </View>

            {/* Login Form */}
            <View style={styles.formSection}>
              <Text style={styles.formTitle}>
                {requestedFlow === 'register'
                  ? `Continue as ${requestedRole === 'driver' ? 'Driver' : 'Rider'}`
                  : 'Sign in to continue'}
              </Text>

              {/* ── Login Error Banner ────────────────────────────────── */}
              {!!loginError && (
                <View style={styles.errorBanner}>
                  <Ionicons name="alert-circle" size={18} color="#EF4444" />
                  <Text style={styles.errorBannerText} numberOfLines={3}>{loginError}</Text>
                  <TouchableOpacity onPress={() => setLoginError('')}>
                    <Ionicons name="close" size={16} color="#94A3B8" />
                  </TouchableOpacity>
                </View>
              )}

              {/* Email / code — glass card */}
              {Platform.OS === 'web' ? (
                <View style={[styles.authGlass, styles.authGlassWeb]}>{emailAuthCard}</View>
              ) : (
                <BlurView intensity={48} tint="dark" style={styles.authGlass}>
                  {emailAuthCard}
                </BlurView>
              )}

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
                      <Ionicons name="finger-print" size={20} color={COLORS.green} style={{ marginRight: 8 }} />
                      <Text style={styles.biometricButtonText}>Use Biometrics</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}

              <Text style={styles.termsText}>
                By continuing, you agree to our{' '}
                <Text style={styles.linkText} onPress={() => openLegal('/terms-of-service')}>Terms of Service</Text> and{' '}
                <Text style={styles.linkText} onPress={() => openLegal('/privacy-policy')}>Privacy Policy</Text>
              </Text>
            </View>

            {/* Features */}
            <View style={styles.features}>
              <FeatureCard
                icon="shield-checkmark"
                title="Zero Commission"
                subtitle="Drivers keep 100% of earnings"
                color={COLORS.green}
                bgColor={COLORS.greenSoft}
              />
              <FeatureCard
                icon="location"
                title="Premium Safety"
                subtitle="Driver checks, support tools & live tracking"
                color="#5EEAD4"
                bgColor="rgba(94,234,212,0.12)"
              />
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
      <Text style={styles.authStepCaption}>Sign in or sign up</Text>
      <Text style={styles.authHeadline}>Continue with email</Text>
      <Text style={styles.authSubcopy}>
        Enter your email — we’ll sign you straight in if you already have an account, or set you up
        in seconds if you’re new.
      </Text>
      <View style={styles.emailFieldWrap}>
        <Ionicons name="mail-outline" size={20} color={COLORS.textMuted} style={styles.emailFieldIcon} />
        <TextInput
          style={styles.emailInputInner}
          placeholder="you@example.com"
          placeholderTextColor={COLORS.textMuted}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
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
      >
        <LinearGradient
          colors={
            normalizedReady && !emailLoading
              ? [COLORS.greenLight, COLORS.green, COLORS.blue]
              : [COLORS.gray700, COLORS.gray700]
          }
          style={styles.primaryCtaGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        >
          {emailLoading ? (
            <ActivityIndicator color={COLORS.primary} />
          ) : (
            <>
              <Ionicons
                name="arrow-forward"
                size={20}
                color={normalizedReady ? COLORS.primary : COLORS.textMuted}
                style={{ marginRight: 10 }}
              />
              <Text style={[styles.primaryCtaText, normalizedReady && styles.primaryCtaTextOn]}>
                Continue
              </Text>
            </>
          )}
        </LinearGradient>
      </TouchableOpacity>
    </>
  );
}

const FeatureCard = ({ 
  icon, 
  title, 
  subtitle, 
  color,
  bgColor,
}: { 
  icon: string; 
  title: string; 
  subtitle: string;
  color: string;
  bgColor: string;
}) => (
  <View style={styles.featureCard}>
    <View style={[styles.featureIconContainer, { backgroundColor: bgColor }]}>
      <Ionicons name={icon as any} size={24} color={color} />
    </View>
    <View style={styles.featureContent}>
      <Text style={styles.featureTitle}>{title}</Text>
      <Text style={styles.featureSubtitle}>{subtitle}</Text>
    </View>
  </View>
);

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
    paddingBottom: 48,
  },
  header: {
    alignItems: 'center',
    paddingTop: 32,
    marginBottom: 24,
  },
  logoContainer: {
    width: 60,
    height: 60,
    position: 'relative',
    marginBottom: 16,
  },
  logoLeft: {
    position: 'absolute',
    left: 3,
    top: 0,
    width: 24,
    height: 60,
    borderTopLeftRadius: 6,
    borderBottomLeftRadius: 6,
    transform: [{ skewX: '-8deg' }],
  },
  logoRight: {
    position: 'absolute',
    right: 3,
    top: 0,
    width: 24,
    height: 60,
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,
    transform: [{ skewX: '8deg' }],
  },
  roadLine: {
    position: 'absolute',
    left: '50%',
    marginLeft: -2,
    top: 10,
    bottom: 10,
    width: 3,
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  roadDash: {
    width: 3,
    height: 8,
    backgroundColor: COLORS.white,
    borderRadius: 1,
  },
  welcomeText: {
    fontSize: 15,
    color: '#94A3B8',
    marginBottom: 4,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandNex: {
    fontSize: 32,
    fontWeight: '900',
    color: COLORS.white,
    letterSpacing: -0.5,
  },
  brandRyde: {
    fontSize: 32,
    fontWeight: '900',
    color: COLORS.green,
    letterSpacing: -0.5,
  },
  subtitleText: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 4,
    fontWeight: '700',
  },
  formSection: {
    marginBottom: 24,
  },
  formTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#F0F4F8',
    marginBottom: 16,
    letterSpacing: -0.5,
  },
  authGlass: {
    borderRadius: 26,
    overflow: 'hidden',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    padding: 22,
    backgroundColor: 'rgba(13,20,32,0.55)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.45,
    shadowRadius: 32,
    elevation: 16,
  },
  authGlassWeb: {
    backgroundColor: 'rgba(25,37,63,0.88)',
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  stepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  stepDotActive: {
    backgroundColor: COLORS.green,
    borderColor: 'rgba(128,238,80,0.9)',
    shadowColor: COLORS.green,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
    elevation: 6,
  },
  stepLine: {
    flex: 1,
    height: 3,
    marginHorizontal: 8,
    borderRadius: 2,
    opacity: 0.95,
  },
  authStepCaption: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: 'rgba(148,163,184,0.95)',
    textTransform: 'uppercase',
    marginBottom: 14,
  },
  authHeadline: {
    fontSize: 20,
    fontWeight: '900',
    color: '#F8FAFC',
    letterSpacing: -0.6,
    marginBottom: 8,
  },
  authSubcopy: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginBottom: 16,
  },
  emailHighlight: {
    color: COLORS.greenLight,
    fontWeight: '800',
  },
  changeEmailLink: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.blue,
    marginTop: -10,
    marginBottom: 14,
    textDecorationLine: 'underline',
  },
  emailFieldWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(13,20,32,0.65)',
    borderRadius: 18,
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
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.greenSoft,
    paddingVertical: 14,
    marginBottom: 8,
  },
  biometricButtonText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: '800',
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
    fontSize: 13,
    color: '#94A3B8',
    lineHeight: 20,
    fontWeight: '700',
  },
  linkText: {
    color: COLORS.green,
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

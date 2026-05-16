import React, { useEffect, useState, useRef } from 'react';
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
import { saveUserSession, getUserSession } from '@/utils/authStorage';
import { autoApplyPendingReferral } from '@/src/services/referralService';
import { BACKEND_URL, postDriverFortressVerify, formatApiDetail } from '@/src/services/api';
import { routeAuthedUser } from '@/src/utils/routeAuthedUser';
import { useRedirectIfAuthed } from '@/src/hooks/useRedirectIfAuthed';
import { AuthLoadingGate } from '@/src/components/AuthLoadingGate';

// Colors based on NEXRYDE logo
const COLORS = {
  background: '#0D1420',
  primary: '#19253F',
  surface: '#19253F',
  surfaceLight: '#243654',
  green: '#3AD173',
  greenLight: '#80EE50',
  greenSoft: 'rgba(58, 209, 115, 0.15)',
  blue: '#3A8CD1',
  blueDark: '#1A5AA6',
  blueSoft: 'rgba(58, 140, 209, 0.15)',
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

const FORTRESS_PHONE_DRAFT_KEY = 'nexryde_driver_fortress_phone_draft';

export default function LoginScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ flow?: string; role?: string }>();
  const requestedFlow = params.flow === 'register' ? 'register' : 'login';
  const requestedRole = params.role === 'driver' || params.role === 'rider' ? params.role : null;
  const [email, setEmail] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [authStep, setAuthStep] = useState<'email' | 'code'>('email');
  const [emailOtp, setEmailOtp] = useState('');
  const [emailOtpLoading, setEmailOtpLoading] = useState(false);
  const [otpTargetEmail, setOtpTargetEmail] = useState('');
  const [biometricReady, setBiometricReady] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [deviceId, setDeviceId] = useState<string>('');
  const [fortressChallengeId, setFortressChallengeId] = useState<string | null>(null);
  const [fortressMaskedPhone, setFortressMaskedPhone] = useState<string>('');
  const [fortressPhoneInput, setFortressPhoneInput] = useState('');
  const [fortressPinInput, setFortressPinInput] = useState('');
  const [fortressFaceImage, setFortressFaceImage] = useState<string>('');
  const [fortressLoading, setFortressLoading] = useState(false);
  const [pinSetupRequired, setPinSetupRequired] = useState(false);
  const [loginError, setLoginError] = useState<{ type: 'sim_swap' | 'generic' | null; message: string }>({ type: null, message: '' });
  const { setUser, setToken, setIsAuthenticated } = useAppStore();
  const canShowAuth = useRedirectIfAuthed();

  const faceRingPulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!fortressChallengeId) {
      faceRingPulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(faceRingPulse, {
          toValue: 1.045,
          duration: 1600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(faceRingPulse, {
          toValue: 1,
          duration: 1600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [fortressChallengeId, faceRingPulse]);

  useEffect(() => {
    if (!fortressChallengeId) return;
    let cancelled = false;
    void SecureStore.getItemAsync(FORTRESS_PHONE_DRAFT_KEY).then((stored) => {
      if (cancelled || !stored) return;
      setFortressPhoneInput((prev) => (prev.trim().length > 0 ? prev : stored));
    });
    return () => {
      cancelled = true;
    };
  }, [fortressChallengeId]);

  useEffect(() => {
    if (!fortressChallengeId) return;
    const t = setTimeout(() => {
      const v = fortressPhoneInput.trim();
      if (v.length >= 10) void SecureStore.setItemAsync(FORTRESS_PHONE_DRAFT_KEY, v).catch(() => {});
    }, 500);
    return () => clearTimeout(t);
  }, [fortressPhoneInput, fortressChallengeId]);

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
  
  const getBackendUrl = () => BACKEND_URL;
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

  /** Passwordless email: request NEXRYDE code, then verify on next step. */
  const handleRequestEmailCode = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);
    if (!validEmail) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return;
    }

    setEmailLoading(true);
    const controller = new AbortController();
    const t = setTimeout(() => {
      controller.abort();
      setEmailLoading(false);
      Alert.alert('Connection Timeout', 'Could not reach server. Please try again.');
    }, 15000);

    try {
      const res = await fetch(`${getBackendUrl()}/api/auth/email-otp/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail }),
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = data?.detail || data?.message || 'Please try again.';
        setLoginError({ type: 'generic', message: String(detail) });
        return;
      }
      setLoginError({ type: null, message: '' });
      setOtpTargetEmail(normalizedEmail);
      setAuthStep('code');
      setEmailOtp('');
      if (Platform.OS !== 'web') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (e: unknown) {
      if ((e as Error)?.name !== 'AbortError') {
        Alert.alert('Connection Error', 'Unable to send verification email right now.');
      }
    } finally {
      clearTimeout(t);
      setEmailLoading(false);
    }
  };

  const continueToOnboarding = (verifiedEmail: string, suggestedName?: string) => {
    const newName = suggestedName || verifiedEmail.split('@')[0];
    if (requestedRole === 'driver') {
      // Collect Nigerian phone on register before terms — driver accounts require a line for ops & payouts.
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
        pathname: '/(auth)/rider-nin',
        params: { email: verifiedEmail, name: newName },
      });
      return;
    }
    router.push({
      pathname: '/(auth)/register',
      params: { email: verifiedEmail, name: newName, auth_type: 'email' },
    });
  };

  const handleVerifyEmailOtp = async () => {
    if (!otpTargetEmail || emailOtp.trim().length < 4) {
      Alert.alert('Invalid code', 'Enter the verification code from your email.');
      return;
    }
    setEmailOtpLoading(true);
    try {
      const res = await fetch(`${getBackendUrl()}/api/auth/email-otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: otpTargetEmail,
          otp: emailOtp.trim(),
          device_id: deviceId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const detail = data?.detail || 'Could not verify code.';
        const isSimSwap =
          res.status === 423 || String(detail).toLowerCase().includes('sim swap');
        setLoginError({
          type: isSimSwap ? 'sim_swap' : 'generic',
          message: isSimSwap
            ? 'A SIM change was detected on your device. Your account has been temporarily secured for your protection.'
            : String(detail),
        });
        return;
      }
      setLoginError({ type: null, message: '' });

      if (data?.fortress_required) {
        setFortressChallengeId(String(data.challenge_id || ''));
        setFortressMaskedPhone(String(data.masked_phone || ''));
        setPinSetupRequired(Boolean(data.pin_setup_required));
        setFortressFaceImage('');
        return;
      }

      const resolvedToken = (data?.token ?? data?.user?.token ?? null) as string | null;
      if (data?.user && resolvedToken !== null && resolvedToken !== '') {
        setUser(data.user);
        setToken(resolvedToken);
        setIsAuthenticated(true);
        await saveUserSession({ ...data.user, token: resolvedToken });
        if (data.user.role !== 'driver' && resolvedToken) {
          void autoApplyPendingReferral(data.user.id, resolvedToken);
        }
        await routeVerifiedUser(data.user, resolvedToken);
        return;
      }

      setEmailOtp('');
      continueToOnboarding(
        data?.email_data?.email || otpTargetEmail,
        data?.email_data?.name,
      );
    } catch {
      Alert.alert('Connection error', 'Unable to verify code right now.');
    } finally {
      setEmailOtpLoading(false);
    }
  };

  const handleResendEmailOtp = async () => {
    if (!otpTargetEmail) return;
    try {
      const res = await fetch(`${getBackendUrl()}/api/auth/email-otp/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: otpTargetEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        Alert.alert('Resend failed', data?.detail || 'Please try again shortly.');
        return;
      }
      Alert.alert('OTP sent', `A new code was sent to ${otpTargetEmail}.`);
    } catch {
      Alert.alert('Connection error', 'Unable to resend OTP right now.');
    }
  };

  const handleCaptureFortressFace = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert(
        'Camera needed',
        'NEXRYDE needs the camera to match your face to your saved profile—same as phone face unlock.',
      );
      return;
    }
    const capture = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.92,
      base64: true,
      exif: false,
      cameraType: ImagePicker.CameraType.front,
    });
    if (capture.canceled || !capture.assets?.[0]?.base64) return;
    setFortressFaceImage(`data:image/jpeg;base64,${capture.assets[0].base64}`);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleRetakeFortressFace = () => {
    setFortressFaceImage('');
  };

  const handleVerifyFortress = async () => {
    if (!fortressChallengeId) return;
    if (!fortressPhoneInput.trim() || !fortressPinInput.trim() || !fortressFaceImage) {
      Alert.alert('Almost there', 'Enter your phone, PIN, and take a clear selfie so we can match your face.');
      return;
    }
    setFortressLoading(true);
    try {
      const { data } = await postDriverFortressVerify({
        challenge_id: fortressChallengeId,
        phone: fortressPhoneInput.trim(),
        pin: fortressPinInput.trim(),
        face_image: fortressFaceImage,
      });
      if (!data?.user) {
        Alert.alert('Error', 'Unexpected response. Please try again.');
        return;
      }
      const loggedIn = data.user as unknown as User;
      const resolvedToken = data?.token || null;
      setUser(loggedIn);
      setToken(resolvedToken);
      setIsAuthenticated(true);
      await saveUserSession({ ...loggedIn, token: resolvedToken });
      void SecureStore.deleteItemAsync(FORTRESS_PHONE_DRAFT_KEY).catch(() => {});
      setFortressChallengeId(null);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await routeVerifiedUser(loggedIn, resolvedToken);
    } catch (e: unknown) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (axios.isAxiosError(e)) {
        const msg =
          formatApiDetail(e.response?.data?.detail) || 'We could not verify you. Check phone, PIN, and try another selfie.';
        Alert.alert('Face did not match', msg);
        return;
      }
      Alert.alert('Connection error', 'Could not reach the server. Check your network and try again.');
    } finally {
      setFortressLoading(false);
    }
  };

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
        Alert.alert('Session Missing', 'No saved account found. Please sign in with phone or email.');
        setBiometricReady(false);
        return;
      }

      setUser(saved);
      setToken(saved?.token || null);
      setIsAuthenticated(true);
      await routeVerifiedUser(saved, saved?.token || null);
    } finally {
      setBiometricLoading(false);
    }
  };

  const emailAuthCard = (
    <AuthEmailCardBody
      authStep={authStep}
      email={email}
      setEmail={setEmail}
      emailLoading={emailLoading}
      emailOtp={emailOtp}
      setEmailOtp={setEmailOtp}
      emailOtpLoading={emailOtpLoading}
      otpTargetEmail={otpTargetEmail}
      onRequestCode={handleRequestEmailCode}
      onVerifyCode={() => void handleVerifyEmailOtp()}
      onResend={() => void handleResendEmailOtp()}
      onChangeEmail={() => {
        setAuthStep('email');
        setEmailOtp('');
      }}
    />
  );

  if (!canShowAuth) {
    return <AuthLoadingGate />;
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
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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
              {loginError.type === 'sim_swap' && (
                <View style={styles.simSwapBanner}>
                  <View style={styles.simSwapIconWrap}>
                    <Ionicons name="shield-half" size={26} color="#EF4444" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.simSwapTitle}>Account Temporarily Secured</Text>
                    <Text style={styles.simSwapText}>{loginError.message}</Text>
                    <TouchableOpacity
                      style={styles.simSwapCta}
                      onPress={() => Linking.openURL('https://nexryde.app/support')}
                    >
                      <Ionicons name="headset" size={14} color="#FFF" />
                      <Text style={styles.simSwapCtaText}>Contact Support</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity onPress={() => setLoginError({ type: null, message: '' })} style={{ alignSelf: 'flex-start' }}>
                    <Ionicons name="close" size={18} color="rgba(255,255,255,0.5)" />
                  </TouchableOpacity>
                </View>
              )}
              {loginError.type === 'generic' && loginError.message && (
                <View style={styles.errorBanner}>
                  <Ionicons name="alert-circle" size={18} color="#EF4444" />
                  <Text style={styles.errorBannerText} numberOfLines={3}>{loginError.message}</Text>
                  <TouchableOpacity onPress={() => setLoginError({ type: null, message: '' })}>
                    <Ionicons name="close" size={16} color="#94A3B8" />
                  </TouchableOpacity>
                </View>
              )}

              {/* Email / code — glass card */}
              {!fortressChallengeId ? (
                Platform.OS === 'web' ? (
                  <View style={[styles.authGlass, styles.authGlassWeb]}>{emailAuthCard}</View>
                ) : (
                  <BlurView intensity={48} tint="dark" style={styles.authGlass}>
                    {emailAuthCard}
                  </BlurView>
                )
              ) : null}

              {fortressChallengeId ? (
                <View style={styles.bankVaultCard}>
                  <LinearGradient
                    colors={[COLORS.bankVeil, COLORS.bankInk]}
                    style={StyleSheet.absoluteFillObject}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                  />
                  <View style={styles.bankVaultHeader}>
                    <View style={styles.bankVaultBadge}>
                      <Ionicons name="shield-half-outline" size={15} color={COLORS.bankGoldBright} />
                      <Text style={styles.bankVaultBadgeText}>SECURE ACCESS</Text>
                    </View>
                    <Text style={styles.bankVaultTitle}>Verify it's you</Text>
                    <Text style={styles.bankVaultBody}>
                      New device detected. Capture your face like phone unlock, then confirm the credentials we have on file for{' '}
                      <Text style={styles.bankVaultMasked}>{fortressMaskedPhone || 'your registered line'}</Text>.
                    </Text>
                  </View>

                  <Animated.View style={[styles.bankFaceRingWrap, { transform: [{ scale: faceRingPulse }] }]}>
                    <LinearGradient
                      colors={[COLORS.greenLight, COLORS.bankGoldBright, COLORS.green]}
                      start={{ x: 0.12, y: 0 }}
                      end={{ x: 0.88, y: 1 }}
                      style={styles.bankFaceOuterRing}
                    >
                      {fortressFaceImage ? (
                        <View style={styles.bankFaceInnerCutout}>
                          <Image source={{ uri: fortressFaceImage }} style={styles.bankFacePreviewImg} resizeMode="cover" />
                          <TouchableOpacity
                            style={styles.bankFaceRetakeFab}
                            onPress={handleRetakeFortressFace}
                            accessibilityRole="button"
                            accessibilityLabel="Retake face photo"
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                          >
                            <Ionicons name="camera-reverse" size={18} color="#F8FAFC" />
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <TouchableOpacity
                          activeOpacity={0.9}
                          onPress={() => void handleCaptureFortressFace()}
                          accessibilityRole="button"
                          accessibilityLabel="Open camera to capture your face"
                          style={styles.bankFaceInnerCutout}
                        >
                          <View style={styles.bankFacePlaceholder}>
                            <View style={styles.bankFaceScanIcon}>
                              <Ionicons name="scan-outline" size={42} color="rgba(226,232,240,0.78)" />
                            </View>
                            <Text style={styles.bankFacePlaceholderTitle}>Align your face</Text>
                            <Text style={styles.bankFacePlaceholderSub}>Tap to open camera · Bright room · Hold steady</Text>
                          </View>
                        </TouchableOpacity>
                      )}
                    </LinearGradient>
                  </Animated.View>

                  <View style={styles.bankTipRow}>
                    {(
                      [
                        { icon: 'sunny-outline' as const, label: 'Good light' },
                        { icon: 'person-outline' as const, label: 'Face forward' },
                        { icon: 'hand-left-outline' as const, label: 'Hold still' },
                      ] as const
                    ).map((tip) => (
                      <View key={tip.label} style={styles.bankTipChip}>
                        <Ionicons name={tip.icon} size={14} color={COLORS.greenLight} />
                        <Text style={styles.bankTipChipText}>{tip.label}</Text>
                      </View>
                    ))}
                  </View>

                  <View style={styles.bankFieldStack}>
                    <View style={styles.bankFieldShell}>
                      <View style={styles.bankFieldIconWrap}>
                        <Ionicons name="call-outline" size={18} color="rgba(226,232,240,0.75)" />
                      </View>
                      <TextInput
                        style={styles.bankFieldInput}
                        placeholder="Registered phone (+234...)"
                        placeholderTextColor={COLORS.textMuted}
                        value={fortressPhoneInput}
                        onChangeText={setFortressPhoneInput}
                        keyboardType="phone-pad"
                        autoCapitalize="none"
                      />
                    </View>
                    <View style={styles.bankFieldShell}>
                      <View style={styles.bankFieldIconWrap}>
                        <Ionicons name="lock-closed-outline" size={18} color="rgba(226,232,240,0.75)" />
                      </View>
                      <TextInput
                        style={styles.bankFieldInput}
                        placeholder={pinSetupRequired ? 'Create account PIN (4-8 digits)' : 'Driver account PIN'}
                        placeholderTextColor={COLORS.textMuted}
                        value={fortressPinInput}
                        onChangeText={setFortressPinInput}
                        keyboardType="number-pad"
                        secureTextEntry
                        maxLength={8}
                      />
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.bankPrimaryOuter,
                      (!fortressPhoneInput.trim() ||
                        !fortressPinInput.trim() ||
                        !fortressFaceImage ||
                        fortressLoading) &&
                        styles.bankPrimaryOuterDim,
                    ]}
                    onPress={() => void handleVerifyFortress()}
                    disabled={
                      fortressLoading ||
                      !fortressPhoneInput.trim() ||
                      !fortressPinInput.trim() ||
                      !fortressFaceImage
                    }
                    activeOpacity={0.92}
                    accessibilityLabel="Confirm identity and sign in"
                  >
                    {fortressLoading ? (
                      <ActivityIndicator color="#F8FAFC" />
                    ) : (
                      <>
                        <Ionicons
                          name="shield-checkmark"
                          size={22}
                          color={
                            fortressPhoneInput.trim() && fortressPinInput.trim() && fortressFaceImage
                              ? COLORS.bankInk
                              : COLORS.textMuted
                          }
                          style={{ marginRight: 10 }}
                        />
                        <Text
                          style={[
                            styles.bankPrimaryText,
                            fortressPhoneInput.trim() && fortressPinInput.trim() && fortressFaceImage
                              ? styles.bankPrimaryTextOn
                              : styles.bankPrimaryTextDim,
                          ]}
                        >
                          Confirm identity & sign in
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <Text style={styles.bankFootnote}>
                    Your selfie is sent over TLS and verified against your registered driver profile — processed on Nexryde
                    servers for security review.
                  </Text>
                </View>
              ) : null}

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
  authStep: 'email' | 'code';
  email: string;
  setEmail: (v: string) => void;
  emailLoading: boolean;
  emailOtp: string;
  setEmailOtp: (v: string) => void;
  emailOtpLoading: boolean;
  otpTargetEmail: string;
  onRequestCode: () => void | Promise<void>;
  onVerifyCode: () => void;
  onResend: () => void;
  onChangeEmail: () => void;
};

function AuthEmailCardBody({
  authStep,
  email,
  setEmail,
  emailLoading,
  emailOtp,
  setEmailOtp,
  emailOtpLoading,
  otpTargetEmail,
  onRequestCode,
  onVerifyCode,
  onResend,
  onChangeEmail,
}: AuthEmailCardProps) {
  const normalizedReady = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const codeReady = emailOtp.trim().length >= 4;

  return (
    <>
      <View style={styles.stepRow}>
        <View style={[styles.stepDot, authStep === 'email' && styles.stepDotActive]} />
        <LinearGradient
          colors={['rgba(58,209,115,0.35)', 'rgba(58,140,209,0.35)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.stepLine}
        />
        <View style={[styles.stepDot, authStep === 'code' && styles.stepDotActive]} />
      </View>
      <Text style={styles.authStepCaption}>
        {authStep === 'email' ? '1 · Your email' : '2 · Enter code'}
      </Text>

      {authStep === 'email' ? (
        <>
          <Text style={styles.authHeadline}>Sign in without a password</Text>
          <Text style={styles.authSubcopy}>
            We’ll email you a one-time NEXRYDE code. New or returning — same smooth flow.
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
            />
          </View>
          <TouchableOpacity
            style={[styles.primaryCtaWrap, !normalizedReady && styles.primaryCtaWrapDim]}
            onPress={() => void onRequestCode()}
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
                    name="paper-plane"
                    size={20}
                    color={normalizedReady ? COLORS.primary : COLORS.textMuted}
                    style={{ marginRight: 10 }}
                  />
                  <Text style={[styles.primaryCtaText, normalizedReady && styles.primaryCtaTextOn]}>
                    Send verification code
                  </Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={styles.authHeadline}>Check your inbox</Text>
          <Text style={styles.authSubcopy}>
            We sent a code to{' '}
            <Text style={styles.emailHighlight}>{otpTargetEmail}</Text>
          </Text>
          <TouchableOpacity onPress={onChangeEmail} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.changeEmailLink}>Use a different email</Text>
          </TouchableOpacity>
          <View style={styles.codeFieldWrap}>
            <TextInput
              style={styles.codeInput}
              placeholder="Enter code"
              placeholderTextColor={COLORS.textMuted}
              value={emailOtp}
              onChangeText={setEmailOtp}
              keyboardType="number-pad"
              maxLength={8}
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
            />
          </View>
          <TouchableOpacity
            style={[styles.primaryCtaWrap, !codeReady && styles.primaryCtaWrapDim]}
            onPress={onVerifyCode}
            disabled={emailOtpLoading || !codeReady}
            activeOpacity={0.92}
          >
            <LinearGradient
              colors={
                codeReady && !emailOtpLoading
                  ? [COLORS.greenLight, COLORS.green, COLORS.blue]
                  : [COLORS.gray700, COLORS.gray700]
              }
              style={styles.primaryCtaGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              {emailOtpLoading ? (
                <ActivityIndicator color={COLORS.primary} />
              ) : (
                <>
                  <Ionicons
                    name="shield-checkmark"
                    size={20}
                    color={codeReady ? COLORS.primary : COLORS.textMuted}
                    style={{ marginRight: 10 }}
                  />
                  <Text style={[styles.primaryCtaText, codeReady && styles.primaryCtaTextOn]}>
                    Verify & continue
                  </Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity style={styles.resendRow} onPress={onResend} disabled={emailOtpLoading}>
            <Text style={styles.resendText}>Didn’t get it? Resend code</Text>
          </TouchableOpacity>
        </>
      )}
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

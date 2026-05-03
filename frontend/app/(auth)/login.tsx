import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  ScrollView,
  ActivityIndicator,
  Alert,
  Linking,
  Image,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import axios from 'axios';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import * as ImagePicker from 'expo-image-picker';
import { useAppStore, type User } from '@/src/store/appStore';
import { saveUserSession, getUserSession } from '@/utils/authStorage';
import {
  driverTermsRouteParams,
  driverDocumentsRouteParams,
  driverProfileRouteParams,
} from '@/src/utils/driverOnboardingNav';
import { BACKEND_URL, postDriverFortressVerify, formatApiDetail } from '@/src/services/api';

const { width, height } = Dimensions.get('window');

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
};

export default function LoginScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ flow?: string; role?: string }>();
  const requestedFlow = params.flow === 'register' ? 'register' : 'login';
  const requestedRole = params.role === 'driver' || params.role === 'rider' ? params.role : null;
  const [email, setEmail] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailOtpRequired, setEmailOtpRequired] = useState(false);
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

  const routeVerifiedUser = async (loggedUser: any, resolvedToken: string | null) => {
    const authHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (resolvedToken) authHeaders.Authorization = `Bearer ${resolvedToken}`;

    if (loggedUser?.role === 'driver') {
      try {
        const st = await fetch(`${getBackendUrl()}/api/drivers/${loggedUser.id}/onboarding-status`, {
          headers: authHeaders,
        });
        const status = await st.json();
        if (!st.ok || !status?.completed) {
          if (status?.step === 'terms') {
            router.replace({
              pathname: '/(auth)/driver-terms',
              params: driverTermsRouteParams(loggedUser),
            });
            return;
          }
          if (status?.step === 'documents') {
            router.replace({
              pathname: '/(auth)/driver-documents',
              params: driverDocumentsRouteParams(loggedUser),
            });
            return;
          }
          if (status?.step === 'documents_review' || status?.step === 'documents_rejected') {
            if (status?.step === 'documents_rejected') {
              router.replace({
                pathname: '/(auth)/driver-verification-status',
                params: driverDocumentsRouteParams(loggedUser),
              });
            } else {
              router.replace('/(driver-tabs)/driver-home');
            }
            return;
          }
          if (status?.step === 'profile') {
            router.replace({
              pathname: '/(auth)/driver-profile',
              params: driverProfileRouteParams(loggedUser),
            });
            return;
          }
        }
        router.replace('/(driver-tabs)/driver-home');
        return;
      } catch {
        // Network error checking onboarding status — go to home rather than forcing
        // re-onboarding on a transient error. The home screen will re-check status.
        router.replace('/(driver-tabs)/driver-home');
        return;
      }
    }

    try {
      const st = await fetch(`${getBackendUrl()}/api/users/${loggedUser.id}/rider-verification-status`, {
        headers: authHeaders,
      });
      const riderStatus = await st.json();
      if (st.ok && riderStatus?.completed) {
        router.replace('/(rider-tabs)/rider-home');
      } else {
        router.replace('/(auth)/rider-verification');
      }
    } catch {
      router.replace('/(auth)/rider-verification');
    }
  };

  const handleEmailSignIn = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);
    if (!validEmail) {
      Alert.alert("Invalid email", "Please enter a valid email address.");
      return;
    }

    setEmailLoading(true);
    const controller = new AbortController();
    const t = setTimeout(() => {
      controller.abort();
      setEmailLoading(false);
      Alert.alert("Connection Timeout", "Could not reach server. Please try again.");
    }, 15000);

    try {
      const res = await fetch(`${getBackendUrl()}/api/auth/email-signin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail, device_id: deviceId || undefined }),
        signal: controller.signal,
      });

      const text = await res.text();
      let data: any = null;
      try { data = JSON.parse(text); } catch {}

      if (!res.ok) {
        const detail = data?.detail || data?.message || text || "Please try again.";
        const isSIMSwap = res.status === 423 || String(detail).toLowerCase().includes('sim swap');
        setLoginError({
          type: isSIMSwap ? 'sim_swap' : 'generic',
          message: isSIMSwap
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
        Alert.alert(
          'Driver Account Fortress',
          'New device detected. Complete face scan, PIN, and registered phone verification to continue.'
        );
        return;
      }

      if (data?.is_new_user) {
        if (data?.email_verification_required) {
          setOtpTargetEmail(normalizedEmail);
          setEmailOtpRequired(true);
          Alert.alert('Verify your email', 'We sent a NEXRYDE OTP to your email. Enter it to continue onboarding.');
          return;
        }
        const newEmail = data?.email_data?.email || normalizedEmail;
        const newName = data?.email_data?.name || normalizedEmail.split('@')[0];
        if (requestedRole === 'driver') {
          router.push({
            pathname: '/(auth)/driver-terms',
            params: {
              email: newEmail,
              name: newName,
            },
          });
        } else if (requestedRole === 'rider') {
          router.push({
            pathname: '/(auth)/rider-nin',
            params: {
              email: newEmail,
              name: newName,
            },
          });
        } else {
          router.push({
            pathname: '/(auth)/register',
            params: {
              email: newEmail,
              name: newName,
              auth_type: 'email',
            },
          });
        }
        return;
      }

      if (!data?.is_new_user && data?.user) {
        const resolvedToken = data?.token || data?.user?.token || null;
        setUser(data.user);
        setToken(resolvedToken);
        setIsAuthenticated(true);
        await saveUserSession({ ...data.user, token: resolvedToken });
        await routeVerifiedUser(data.user, resolvedToken);
        return;
      }

      if (!data?.user) {
        Alert.alert("Email sign-in failed", data?.message || "Could not complete sign in.");
        return;
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        Alert.alert("Connection Error", "Unable to sign in with email right now.");
      }
    } finally {
      clearTimeout(t);
      setEmailLoading(false);
    }
  };

  const continueToOnboarding = (verifiedEmail: string, suggestedName?: string) => {
    const newName = suggestedName || verifiedEmail.split('@')[0];
    if (requestedRole === 'driver') {
      router.push({
        pathname: '/(auth)/driver-terms',
        params: { email: verifiedEmail, name: newName },
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
      Alert.alert('Invalid code', 'Enter the OTP sent to your email.');
      return;
    }
    setEmailOtpLoading(true);
    try {
      const res = await fetch(`${getBackendUrl()}/api/auth/email-otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: otpTargetEmail, otp: emailOtp.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        Alert.alert('Verification failed', data?.detail || 'Could not verify code.');
        return;
      }
      setEmailOtpRequired(false);
      setEmailOtp('');
      continueToOnboarding(data?.email_data?.email || otpTargetEmail, data?.email_data?.name);
    } catch {
      Alert.alert('Connection error', 'Unable to verify email OTP right now.');
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
      quality: 0.82,
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

              {/* Email Sign-In */}
              <View style={styles.emailContainer}>
                <TextInput
                  style={styles.emailInput}
                  placeholder="you@example.com"
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={email}
                  onChangeText={setEmail}
                />
                <TouchableOpacity
                  style={styles.continueButton}
                  onPress={handleEmailSignIn}
                  disabled={emailLoading}
                  activeOpacity={0.9}
                >
                  <LinearGradient
                    colors={email.includes('@')
                      ? [COLORS.greenLight, COLORS.green, COLORS.blue]
                      : [COLORS.gray700, COLORS.gray700]
                    }
                    style={styles.buttonGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  >
                    {emailLoading ? (
                      <ActivityIndicator color={COLORS.primary} />
                    ) : (
                      <>
                        <Ionicons name="mail" size={20} color={email.includes('@') ? COLORS.primary : COLORS.textMuted} style={{ marginRight: 8 }} />
                        <Text style={[
                          styles.continueButtonText,
                          email.includes('@') && styles.continueButtonTextActive
                        ]}>
                          Continue with Email
                        </Text>
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </View>

              {fortressChallengeId ? (
                <View style={styles.fortressPanel}>
                  <View style={styles.fortressHeaderRow}>
                    <View style={styles.fortressShieldIcon}>
                      <Ionicons name="shield-checkmark" size={22} color={COLORS.green} />
                    </View>
                    <View style={styles.fortressHeaderText}>
                      <Text style={styles.fortressTitle}>Driver Account Fortress</Text>
                      <Text style={styles.fortressSubtitle}>
                        We’ll store this face to recognize you on this device—like phone face unlock. Enter your
                        details on file for {fortressMaskedPhone || 'your number'}.
                      </Text>
                    </View>
                  </View>
                  <View style={styles.fortressTipRow}>
                    {(
                      [
                        { icon: 'sunny' as const, label: 'Good light' },
                        { icon: 'person' as const, label: 'Face the camera' },
                        { icon: 'hand-left' as const, label: 'Hold steady' },
                      ] as const
                    ).map((tip) => (
                      <View key={tip.label} style={styles.fortressTipChip}>
                        <Ionicons name={tip.icon} size={14} color={COLORS.blue} />
                        <Text style={styles.fortressTipChipText}>{tip.label}</Text>
                      </View>
                    ))}
                  </View>
                  <TextInput
                    style={styles.emailInput}
                    placeholder="Registered phone (+234...)"
                    placeholderTextColor={COLORS.textMuted}
                    value={fortressPhoneInput}
                    onChangeText={setFortressPhoneInput}
                    keyboardType="phone-pad"
                    autoCapitalize="none"
                  />
                  <TextInput
                    style={styles.emailInput}
                    placeholder={pinSetupRequired ? 'Create account PIN (4-8 digits)' : 'Driver account PIN'}
                    placeholderTextColor={COLORS.textMuted}
                    value={fortressPinInput}
                    onChangeText={setFortressPinInput}
                    keyboardType="number-pad"
                    secureTextEntry
                    maxLength={8}
                  />
                  {!!fortressFaceImage && (
                    <View style={styles.fortressPreviewRow}>
                      <View
                        style={[
                          styles.fortressPreviewImageWrap,
                          { borderColor: COLORS.green, borderWidth: 2 },
                        ]}
                      >
                        <Image source={{ uri: fortressFaceImage }} style={styles.fortressPreviewImage} />
                      </View>
                      <View style={styles.fortressPreviewMeta}>
                        <View style={styles.fortressPreviewCheck}>
                          <Ionicons name="checkmark-circle" size={18} color={COLORS.green} />
                          <Text style={styles.fortressPreviewCheckText}>Selfie ready</Text>
                        </View>
                        <TouchableOpacity
                          onPress={handleRetakeFortressFace}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Text style={styles.fortressRetakeText}>Retake photo</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                  <TouchableOpacity
                    style={[
                      styles.fortressFaceButton,
                      fortressFaceImage ? styles.fortressFaceButtonDone : null,
                    ]}
                    onPress={() => void handleCaptureFortressFace()}
                    activeOpacity={0.88}
                    accessibilityLabel={fortressFaceImage ? 'Retake or replace face photo' : 'Open camera for face photo'}
                  >
                    <Ionicons
                      name="camera"
                      size={20}
                      color={fortressFaceImage ? COLORS.green : COLORS.white}
                    />
                    <Text
                      style={[
                        styles.fortressFaceButtonText,
                        fortressFaceImage && { color: COLORS.green },
                      ]}
                    >
                      {fortressFaceImage ? 'Replace selfie' : 'Take selfie'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.fortressCompleteWrap,
                      (!fortressPhoneInput.trim() ||
                        !fortressPinInput.trim() ||
                        !fortressFaceImage ||
                        fortressLoading) &&
                        styles.fortressCompleteWrapDim,
                    ]}
                    onPress={() => void handleVerifyFortress()}
                    disabled={
                      fortressLoading ||
                      !fortressPhoneInput.trim() ||
                      !fortressPinInput.trim() ||
                      !fortressFaceImage
                    }
                    activeOpacity={0.9}
                    accessibilityLabel="Complete face unlock verification"
                  >
                    <LinearGradient
                      colors={
                        fortressPhoneInput.trim() && fortressPinInput.trim() && fortressFaceImage
                          ? [COLORS.greenLight, COLORS.green, COLORS.blue]
                          : [COLORS.gray700, COLORS.gray700]
                      }
                      style={styles.fortressCompleteGradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                    >
                      {fortressLoading ? (
                        <ActivityIndicator color={COLORS.primary} />
                      ) : (
                        <>
                          <Ionicons
                            name="lock-open"
                            size={20}
                            color={
                              fortressPhoneInput.trim() && fortressPinInput.trim() && fortressFaceImage
                                ? COLORS.primary
                                : COLORS.textMuted
                            }
                            style={{ marginRight: 8 }}
                          />
                          <Text
                            style={[
                              styles.fortressCompleteText,
                              fortressPhoneInput.trim() && fortressPinInput.trim() && fortressFaceImage
                                ? { color: COLORS.primary }
                                : { color: COLORS.textMuted },
                            ]}
                          >
                            Unlock with face and sign in
                          </Text>
                        </>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              ) : null}

              {emailOtpRequired ? (
                <View style={styles.emailContainer}>
                  <Text style={styles.emailLabel}>Email Verification</Text>
                  <Text style={styles.helpText}>Enter the OTP sent to {otpTargetEmail}</Text>
                  <TextInput
                    style={styles.emailInput}
                    placeholder="6-digit OTP"
                    placeholderTextColor={COLORS.textMuted}
                    value={emailOtp}
                    onChangeText={setEmailOtp}
                    keyboardType="number-pad"
                    maxLength={6}
                  />
                  <TouchableOpacity
                    style={[styles.loginButton, emailOtpLoading && styles.loginButtonDisabled]}
                    onPress={handleVerifyEmailOtp}
                    disabled={emailOtpLoading}
                  >
                    {emailOtpLoading ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.loginButtonText}>Verify Email OTP</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleResendEmailOtp}>
                    <Text style={styles.linkText}>Resend OTP</Text>
                  </TouchableOpacity>
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
                color={COLORS.blue}
                bgColor={COLORS.blueSoft}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
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
  fortressPanel: {
    marginBottom: 12,
    padding: 16,
    borderRadius: 18,
    backgroundColor: 'rgba(25, 37, 63, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(58, 209, 115, 0.28)',
    gap: 12,
  },
  fortressHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  fortressShieldIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: COLORS.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fortressHeaderText: {
    flex: 1,
  },
  fortressTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: COLORS.white,
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  fortressSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
    lineHeight: 19,
  },
  fortressTipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  fortressTipChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: COLORS.blueSoft,
    borderWidth: 1,
    borderColor: 'rgba(58, 140, 209, 0.35)',
  },
  fortressTipChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#BFDBFE',
  },
  fortressPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  fortressPreviewImageWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    overflow: 'hidden',
    backgroundColor: COLORS.surface,
  },
  fortressPreviewImage: {
    width: '100%',
    height: '100%',
  },
  fortressPreviewMeta: {
    flex: 1,
    gap: 6,
  },
  fortressPreviewCheck: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  fortressPreviewCheckText: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.green,
  },
  fortressRetakeText: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.blue,
    textDecorationLine: 'underline',
  },
  fortressFaceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
  },
  fortressFaceButtonDone: {
    borderColor: 'rgba(58, 209, 115, 0.45)',
    backgroundColor: 'rgba(58, 209, 115, 0.08)',
  },
  fortressFaceButtonText: {
    fontSize: 16,
    fontWeight: '900',
    color: COLORS.white,
  },
  fortressCompleteWrap: {
    borderRadius: 18,
    overflow: 'hidden',
    opacity: 1,
  },
  fortressCompleteWrapDim: {
    opacity: 0.72,
  },
  fortressCompleteGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  fortressCompleteText: {
    fontSize: 16,
    fontWeight: '900',
  },
});

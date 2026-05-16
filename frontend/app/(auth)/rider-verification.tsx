import React, { useMemo, useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { useAppStore } from '@/src/store/appStore';
import { useAuthedApiReady } from '@/src/hooks/useAuthedApiReady';
import { useAuthedUserId } from '@/src/hooks/useAuthedUserId';
import { useThemeColors } from '@/src/constants/theme';
import { AuthLoadingGate } from '@/src/components/AuthLoadingGate';
import { completeRiderVerification, verifyFace, verifyRiderNin, getRiderVerificationStatus } from '@/src/services/api';
import { saveUserSession } from '@/utils/authStorage';
import { RiderFaceLivenessCapture } from '@/src/components/rider/RiderFaceLivenessCapture';
import { apiErrorMessage } from '@/src/utils/apiErrorMessage';

const BG_TOP = '#020617';
const BG_BOT = '#0F172A';
const CARD = 'rgba(15,23,42,0.92)';
const MINT = '#34D399';
const TEXT = '#F8FAFC';
const MUTED = '#94A3B8';
const BORDER = 'rgba(52,211,153,0.22)';
const INPUT_BG = 'rgba(2,6,23,0.65)';
const ERR = '#F87171';

const STEPS = ['About you', 'National ID', 'Biometric'] as const;

type NinVerifyPayload = {
  format_ok?: boolean;
  registry_checked?: boolean;
  registry_verified?: boolean;
  name_match_ok?: boolean;
  message?: string;
} | null;

function ninAllowsProceed(v: NinVerifyPayload): boolean {
  if (!v || !v.format_ok) return false;
  if (v.name_match_ok === false) return false;
  if (v.registry_checked && !v.registry_verified) return false;
  return true;
}

export default function RiderVerificationScreen() {
  const router = useRouter();
  const { storeReady, canCallAuthedApi } = useAuthedApiReady();
  const { colors, isDark } = useThemeColors();
  const { user, token, setUser } = useAppStore();
  const { userId: riderId } = useAuthedUserId();

  const palette = useMemo(
    () => ({
      text: isDark ? TEXT : colors.text,
      muted: isDark ? MUTED : colors.textMuted,
      card: isDark ? CARD : colors.card,
      border: isDark ? BORDER : colors.border,
      inputBg: isDark ? INPUT_BG : colors.background,
      placeholder: isDark ? '#64748B' : colors.textMuted,
      heroGrad: isDark
        ? (['rgba(52,211,153,0.2)', 'rgba(59,130,246,0.12)'] as const)
        : (['rgba(34,197,94,0.12)', 'rgba(59,130,246,0.08)'] as const),
    }),
    [isDark, colors],
  );

  const [step, setStep] = useState(0);

  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [address, setAddress] = useState((user as { address?: string })?.address || '');
  const [nin, setNin] = useState(String((user as { nin?: string })?.nin || ''));

  const [ninVerify, setNinVerify] = useState<NinVerifyPayload>(null);
  const [ninChecking, setNinChecking] = useState(false);

  const [faceVerified, setFaceVerified] = useState(Boolean((user as { face_verified?: boolean })?.face_verified));
  const [facePreview, setFacePreview] = useState<string | null>(null);
  const [faceModal, setFaceModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [attemptedProfile, setAttemptedProfile] = useState(false);

  const phoneDigits = useMemo(() => phone.replace(/\D/g, ''), [phone]);
  const nameTrim = name.trim();
  const addressTrim = address.trim();

  const nameOk = nameTrim.length >= 3 && nameTrim.length <= 120;
  const phoneOk = phoneDigits.length >= 10 && phoneDigits.length <= 15;
  const addressOk = addressTrim.length >= 8 && addressTrim.length <= 500;

  const profileOk = nameOk && phoneOk && addressOk;
  const ninFormatOk = /^\d{11}$/.test(nin.trim());
  const ninDigits = nin.replace(/\D/g, '').length;

  const canGoStep1 = profileOk;
  const canGoStep2 = ninFormatOk;
  const canSubmit = profileOk && ninFormatOk && faceVerified && Boolean(riderId);

  const nameErr = attemptedProfile && !nameOk ? 'Enter your full name (3–120 characters).' : null;
  const phoneErr = attemptedProfile && !phoneOk ? 'Enter a valid phone number (at least 10 digits).' : null;
  const addressErr = attemptedProfile && !addressOk ? 'Enter your full home address (at least 8 characters).' : null;

  const ninHint = useMemo(() => {
    if (!ninVerify) return null;
    return ninVerify.message || null;
  }, [ninVerify]);

  /** If user is already fully verified (e.g. race with another tab), skip this screen. */
  useEffect(() => {
    if (!canCallAuthedApi || !riderId) return;
    let alive = true;
    void (async () => {
      try {
        const res = await getRiderVerificationStatus(riderId);
        if (!alive) return;
        if (res.data?.completed) {
          router.replace('/(rider-tabs)/rider-home');
        }
      } catch {
        /* stay on screen — offline or transient */
      }
    })();
    return () => {
      alive = false;
    };
  }, [canCallAuthedApi, riderId, router]);

  /** After async persist, `useState(user?.…)` initializers may have run empty — hydrate fields once `user.id` exists. */
  useEffect(() => {
    if (!user?.id) return;
    setName(user.name || '');
    setPhone(user.phone || '');
    setAddress((user as { address?: string })?.address || '');
    setNin(String((user as { nin?: string })?.nin || ''));
    setFaceVerified(Boolean((user as { face_verified?: boolean })?.face_verified));
  }, [user?.id]);

  useEffect(() => {
    if (step === 0) setAttemptedProfile(false);
  }, [step]);

  const bumpStep = useCallback(
    (next: number) => {
      if (Platform.OS !== 'web') {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      setStep(next);
    },
    [],
  );

  const handleVerifyNin = useCallback(async () => {
    if (!riderId || !canCallAuthedApi) {
      Alert.alert('Session expired', 'Please log in again.', [
        { text: 'Log in', onPress: () => router.replace('/(auth)/login') },
      ]);
      return;
    }
    if (nameTrim.length < 3) {
      Alert.alert('Full name needed', 'Enter the name that matches your ID before running an optional registry check.');
      return;
    }
    if (!ninFormatOk) {
      Alert.alert('Invalid NIN', 'Enter all 11 digits of your National Identification Number.');
      return;
    }
    setNinChecking(true);
    try {
      const res = await verifyRiderNin(riderId, nin.trim(), nameTrim);
      const data = res.data as NinVerifyPayload & Record<string, unknown>;
      const payload: NinVerifyPayload = {
        format_ok: Boolean(data?.format_ok),
        registry_checked: Boolean(data?.registry_checked),
        registry_verified: Boolean(data?.registry_verified),
        name_match_ok: data?.name_match_ok !== false,
        message: typeof data?.message === 'string' ? data.message : undefined,
      };
      setNinVerify(payload);
      if (ninAllowsProceed(payload)) {
        if (Platform.OS !== 'web') {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      } else {
        if (Platform.OS !== 'web') {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        }
        Alert.alert(
          'Optional check',
          typeof data?.message === 'string' ? data.message : 'Registry could not confirm this combination. You can still continue if format is valid.',
        );
      }
    } catch (e: unknown) {
      Alert.alert('Check failed', apiErrorMessage(e, 'Could not reach the server. Try again.'));
      setNinVerify(null);
    } finally {
      setNinChecking(false);
    }
  }, [riderId, canCallAuthedApi, nameTrim, nin, ninFormatOk, router]);

  const handleFaceNative = useCallback(() => {
    if (!riderId || !canCallAuthedApi) {
      Alert.alert('Session expired', 'Please log in again.', [
        { text: 'Log in', onPress: () => router.replace('/(auth)/login') },
      ]);
      return;
    }
    setFaceModal(true);
  }, [riderId, canCallAuthedApi, router]);

  const onPairCaptured = useCallback(
    async (primary: string, probe: string) => {
      if (!riderId || !canCallAuthedApi) throw new Error('Session expired');
      try {
        await verifyFace(riderId, primary, {
          livenessProbeImage: probe,
          captureMeta: { flow: 'rider_onboarding_v2', platform: Platform.OS, at: Date.now() },
        });
      } catch (e: unknown) {
        throw new Error(apiErrorMessage(e, 'Could not save biometric. Try again in good lighting.'));
      }
      setFacePreview(primary);
      setFaceVerified(true);
    },
    [riderId, canCallAuthedApi],
  );

  const handleFaceWebFallback = useCallback(async () => {
    if (!riderId || !canCallAuthedApi) {
      Alert.alert('Session expired', 'Please log in again to continue.', [
        { text: 'Log in', onPress: () => router.replace('/(auth)/login') },
      ]);
      return;
    }
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Camera access is required for face verification.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.75,
        base64: true,
      });
      if (result.canceled || !result.assets?.[0]?.base64) return;
      const base64 = `data:image/jpeg;base64,${result.assets[0].base64}`;
      await verifyFace(riderId, base64);
      setFacePreview(result.assets[0].uri);
      setFaceVerified(true);
      if (Platform.OS !== 'web') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      Alert.alert('Saved', 'Selfie saved. On the mobile app you get the stronger two-frame biometric scan.');
    } catch (e: unknown) {
      const status =
        typeof e === 'object' && e !== null && 'response' in e
          ? (e as { response?: { status?: number } }).response?.status
          : undefined;
      if (status === 401) {
        Alert.alert('Session expired', 'Please log in again.', [
          { text: 'Log in', onPress: () => router.replace('/(auth)/login') },
        ]);
        return;
      }
      Alert.alert('Face verification failed', apiErrorMessage(e, 'Try again in good lighting.'));
    }
  }, [riderId, canCallAuthedApi, router]);

  const handleSubmit = async () => {
    if (!riderId || !canCallAuthedApi || !user) {
      Alert.alert('Session error', 'Please log in again.', [
        { text: 'Log in', onPress: () => router.replace('/(auth)/login') },
      ]);
      return;
    }
    if (!canSubmit) {
      Alert.alert('Incomplete', 'Complete each step: personal details, 11-digit NIN, and biometric scan.');
      return;
    }
    setLoading(true);
    try {
      const res = await completeRiderVerification(riderId, {
        name: nameTrim,
        phone: phone.trim(),
        address: addressTrim,
        nin: nin.trim(),
      });
      const updatedUser = (res.data as { user?: typeof user } | undefined)?.user || {
        ...user,
        id: riderId,
        name: nameTrim,
        phone: phone.trim(),
        address: addressTrim,
        nin: nin.trim(),
      };
      setUser(updatedUser);
      await saveUserSession({ ...updatedUser, token: token || null });
      if (Platform.OS !== 'web') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      Alert.alert('Welcome aboard', 'Your rider profile is verified and secured.', [
        { text: 'Continue', onPress: () => router.replace('/(rider-tabs)/rider-home') },
      ]);
    } catch (e: unknown) {
      Alert.alert('Verification failed', apiErrorMessage(e, 'Could not complete verification now.'));
    } finally {
      setLoading(false);
    }
  };

  const openFaceFlow = () => {
    if (faceVerified) {
      Alert.alert('Biometric saved', 'Retake only if lighting was poor.', [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Retake',
          onPress: () => {
            if (Platform.OS === 'web') void handleFaceWebFallback();
            else handleFaceNative();
          },
        },
      ]);
    } else if (Platform.OS === 'web') {
      void handleFaceWebFallback();
    } else {
      handleFaceNative();
    }
  };

  if (!storeReady) {
    return <AuthLoadingGate />;
  }

  return (
    <View style={[styles.root, !isDark && { backgroundColor: colors.background }]}>
      {isDark ? <LinearGradient colors={[BG_TOP, BG_BOT]} style={StyleSheet.absoluteFill} /> : null}

      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <TouchableOpacity style={styles.backRow} onPress={() => router.back()} accessibilityRole="button">
              <Ionicons name="chevron-back" size={22} color={palette.muted} />
              <Text style={[styles.backTxt, { color: palette.muted }]}>Back</Text>
            </TouchableOpacity>

            <View style={styles.hero}>
              <LinearGradient colors={palette.heroGrad} style={styles.heroIcon}>
                <Ionicons name="shield-checkmark" size={28} color={MINT} />
              </LinearGradient>
              <Text style={[styles.heroTitle, { color: palette.text }]}>Secure rider onboarding</Text>
              <Text style={[styles.heroSub, { color: palette.muted }]}>
                Encrypted profile and biometric for trust and safety. Admins can review only what the law and our policy allow.
              </Text>
            </View>

            <View style={styles.stepRowOuter}>
              {STEPS.map((label, i) => {
                const active = i === step;
                const done = i < step;
                return (
                  <TouchableOpacity
                    key={label}
                    style={[styles.stepChip, active && styles.stepChipActive, done && styles.stepChipDone]}
                    onPress={() => {
                      if (i === 0) bumpStep(0);
                      if (i === 1 && canGoStep1) bumpStep(1);
                      if (i === 2 && canGoStep1 && canGoStep2) bumpStep(2);
                    }}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.stepChipTxt, (active || done) && styles.stepChipTxtOn]}>{i + 1}</Text>
                    <Text style={[styles.stepChipLabel, active && styles.stepChipLabelOn]} numberOfLines={1}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${((step + 1) / STEPS.length) * 100}%` }]} />
            </View>

            <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
              {step === 0 ? (
                <>
                  <Text style={[styles.sectionTitle, { color: palette.text }]}>Personal details</Text>
                  <Text style={[styles.sectionHint, { color: palette.muted }]}>
                    Use your real name and address — they appear on your account and support requests.
                  </Text>

                  <Field icon="person-outline" label="Full name" error={nameErr} labelColor={palette.text} mutedColor={palette.muted}>
                    <TextInput
                      style={[styles.input, { backgroundColor: palette.inputBg, color: palette.text }, nameErr ? styles.inputErr : null]}
                      value={name}
                      onChangeText={setName}
                      placeholder="As on your ID"
                      placeholderTextColor={palette.placeholder}
                      autoCapitalize="words"
                      autoCorrect={false}
                      maxLength={120}
                      accessibilityLabel="Full name"
                    />
                  </Field>

                  <Field icon="call-outline" label="Phone number" error={phoneErr} labelColor={palette.text} mutedColor={palette.muted}>
                    <TextInput
                      style={[styles.input, { backgroundColor: palette.inputBg, color: palette.text }, phoneErr ? styles.inputErr : null]}
                      value={phone}
                      onChangeText={setPhone}
                      keyboardType="phone-pad"
                      placeholder="+234… or your country code"
                      placeholderTextColor={palette.placeholder}
                      maxLength={20}
                      accessibilityLabel="Phone number"
                    />
                  </Field>

                  <Field icon="home-outline" label="Home address" error={addressErr} labelColor={palette.text} mutedColor={palette.muted}>
                    <TextInput
                      style={[
                        styles.input,
                        styles.inputTall,
                        { backgroundColor: palette.inputBg, color: palette.text },
                        addressErr ? styles.inputErr : null,
                      ]}
                      value={address}
                      onChangeText={setAddress}
                      placeholder="Street, city, state"
                      placeholderTextColor={palette.placeholder}
                      multiline
                      maxLength={500}
                      accessibilityLabel="Home address"
                    />
                    <Text style={styles.charHint}>{addressTrim.length}/500</Text>
                  </Field>

                  <TouchableOpacity
                    style={[styles.primaryBtn, !profileOk && styles.primaryBtnDim]}
                    onPress={() => {
                      if (!profileOk) {
                        setAttemptedProfile(true);
                        if (Platform.OS !== 'web') {
                          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                        }
                        return;
                      }
                      bumpStep(1);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Continue to national ID step"
                  >
                    <Text style={styles.primaryBtnTxt}>Continue</Text>
                    <Ionicons name="arrow-forward" size={18} color="#022C22" />
                  </TouchableOpacity>
                </>
              ) : null}

              {step === 1 ? (
                <>
                  <Text style={[styles.sectionTitle, { color: palette.text }]}>National Identification Number</Text>
                  <Text style={[styles.sectionHint, { color: palette.muted }]}>
                    Enter your 11-digit NIN. We validate format and save it securely for admin review.
                  </Text>

                  <Field
                    icon="card-outline"
                    label="NIN (11 digits)"
                    error={ninDigits > 0 && !ninFormatOk ? 'NIN must be exactly 11 digits.' : null}
                    labelColor={palette.text}
                    mutedColor={palette.muted}
                  >
                    <TextInput
                      style={[
                        styles.input,
                        { backgroundColor: palette.inputBg, color: palette.text },
                        ninDigits > 0 && !ninFormatOk ? styles.inputErr : null,
                      ]}
                      value={nin}
                      onChangeText={(v) => {
                        setNin(v.replace(/\D/g, '').slice(0, 11));
                        setNinVerify(null);
                      }}
                      keyboardType="number-pad"
                      placeholder="Enter 11 digits"
                      placeholderTextColor={palette.placeholder}
                      maxLength={11}
                      accessibilityLabel="National Identification Number"
                    />
                    <View style={styles.ninMetaRow}>
                      <Text style={[styles.ninCounter, ninFormatOk && styles.ninCounterOk]}>{ninDigits}/11 digits</Text>
                      {ninFormatOk ? (
                        <View style={styles.ninOkPill}>
                          <Ionicons name="checkmark-circle" size={14} color={MINT} />
                          <Text style={styles.ninOkPillTxt}>Format OK</Text>
                        </View>
                      ) : null}
                    </View>
                  </Field>

                  <TouchableOpacity
                    style={[styles.secondaryBtn, (ninChecking || !ninFormatOk) && styles.btnDisabled]}
                    disabled={ninChecking || !ninFormatOk}
                    onPress={() => void handleVerifyNin()}
                    accessibilityRole="button"
                    accessibilityLabel="Optional registry pre-check"
                  >
                    {ninChecking ? (
                      <ActivityIndicator color={MINT} />
                    ) : (
                      <>
                        <Ionicons name="information-circle-outline" size={20} color={MINT} />
                        <Text style={styles.secondaryBtnTxt} numberOfLines={2}>
                          Optional: registry pre-check
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>

                  {ninVerify ? (
                    <View style={styles.ninStatus}>
                      <View style={styles.ninRow}>
                        <Ionicons
                          name={ninVerify.format_ok ? 'checkmark-circle' : 'close-circle'}
                          size={18}
                          color={ninVerify.format_ok ? MINT : ERR}
                        />
                        <Text style={styles.ninRowTxt}>Format (11 digits)</Text>
                      </View>
                      {ninVerify.registry_checked ? (
                        <View style={styles.ninRow}>
                          <Ionicons
                            name={ninVerify.registry_verified ? 'shield-checkmark' : 'alert-circle'}
                            size={18}
                            color={ninVerify.registry_verified ? MINT : '#FBBF24'}
                          />
                          <Text style={styles.ninRowTxt}>
                            {ninVerify.registry_verified ? 'Registry confirmed' : 'Registry did not confirm'}
                          </Text>
                        </View>
                      ) : (
                        <View style={styles.ninRow}>
                          <Ionicons name="information-circle-outline" size={18} color="#38BDF8" />
                          <Text style={styles.ninRowTxt}>Registry API not configured — format-only mode</Text>
                        </View>
                      )}
                      {ninHint ? <Text style={styles.ninHint}>{ninHint}</Text> : null}
                    </View>
                  ) : (
                    <Text style={styles.infoTxt}>When you have 11 digits, you can continue — no extra tap required.</Text>
                  )}

                  <View style={styles.rowBtns}>
                    <TouchableOpacity style={styles.ghostBtn} onPress={() => bumpStep(0)} accessibilityRole="button">
                      <Text style={styles.ghostBtnTxt}>Back</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.primaryBtn, styles.primaryBtnFlex, !canGoStep2 && styles.btnDisabled]}
                      disabled={!canGoStep2}
                      onPress={() => bumpStep(2)}
                      accessibilityRole="button"
                      accessibilityLabel="Continue to biometric step"
                    >
                      <Text style={styles.primaryBtnTxt}>Continue</Text>
                      <Ionicons name="arrow-forward" size={18} color="#022C22" />
                    </TouchableOpacity>
                  </View>
                </>
              ) : null}

              {step === 2 ? (
                <>
                  <Text style={[styles.sectionTitle, { color: palette.text }]}>Biometric face capture</Text>
                  <Text style={[styles.sectionHint, { color: palette.muted }]}>
                    On mobile: two-frame live scan. Your portrait is stored for admin review and trip safety checks.
                  </Text>

                  <View style={styles.checklist}>
                    <CheckRow ok={profileOk} label="Personal details" />
                    <CheckRow ok={ninFormatOk} label="NIN format" />
                    <CheckRow ok={faceVerified} label="Biometric" />
                  </View>

                  <TouchableOpacity
                    style={styles.faceHero}
                    activeOpacity={0.9}
                    onPress={openFaceFlow}
                    accessibilityRole="button"
                    accessibilityLabel={faceVerified ? 'Biometric saved, tap to retake' : 'Start face scan'}
                  >
                    <LinearGradient colors={['rgba(52,211,153,0.14)', 'rgba(15,23,42,0.95)']} style={styles.faceHeroGrad}>
                      <View style={styles.faceRing}>
                        {facePreview ? (
                          <Image source={{ uri: facePreview }} style={styles.faceImg} />
                        ) : (
                          <Ionicons name="scan-circle-outline" size={44} color={MINT} />
                        )}
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.faceTitle}>{faceVerified ? 'Biometric secured' : 'Start live face scan'}</Text>
                        <Text style={styles.faceSub}>
                          {faceVerified
                            ? 'Stored on your profile — visible to authorised admins only.'
                            : Platform.OS === 'web'
                              ? 'Web uses a single capture. Use the app for two-frame liveness.'
                              : 'Timer plus a second capture after you move closer.'}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={22} color={MUTED} />
                    </LinearGradient>
                  </TouchableOpacity>

                  <View style={styles.rowBtns}>
                    <TouchableOpacity style={styles.ghostBtn} onPress={() => bumpStep(1)} accessibilityRole="button">
                      <Text style={styles.ghostBtnTxt}>Back</Text>
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity
                    style={[styles.primaryBtn, (!canSubmit || loading) && styles.btnDisabled]}
                    disabled={!canSubmit || loading}
                    onPress={() => void handleSubmit()}
                    accessibilityRole="button"
                    accessibilityLabel="Finish verification"
                  >
                    {loading ? (
                      <ActivityIndicator color="#022C22" />
                    ) : (
                      <>
                        <Text style={styles.primaryBtnTxt}>Finish & enter Nexryde</Text>
                        <Ionicons name="checkmark-done" size={20} color="#022C22" />
                      </>
                    )}
                  </TouchableOpacity>
                </>
              ) : null}
            </View>

            <Text style={styles.footerLegal}>
              By continuing you consent to processing of identity data for fraud prevention, as described in our privacy policy.
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {Platform.OS !== 'web' ? (
        <RiderFaceLivenessCapture
          visible={faceModal}
          onClose={() => setFaceModal(false)}
          onPairCaptured={onPairCaptured}
        />
      ) : null}
    </View>
  );
}

function CheckRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <View style={styles.checkRow}>
      <Ionicons name={ok ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={ok ? MINT : MUTED} />
      <Text style={[styles.checkRowTxt, ok && styles.checkRowTxtOk]}>{label}</Text>
    </View>
  );
}

function Field({
  icon,
  label,
  error,
  children,
  labelColor,
  mutedColor,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  error?: string | null;
  children: React.ReactNode;
  labelColor: string;
  mutedColor: string;
}) {
  return (
    <View style={styles.field}>
      <View style={styles.fieldLabelRow}>
        <Ionicons name={icon} size={16} color={mutedColor} />
        <Text style={[styles.label, { color: labelColor }]}>{label}</Text>
      </View>
      {children}
      {error ? <Text style={styles.fieldErr}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG_TOP },
  safe: { flex: 1 },
  scroll: { paddingHorizontal: 20, paddingBottom: 44 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, marginBottom: 12 },
  backTxt: { color: MUTED, fontWeight: '700', fontSize: 15 },
  hero: { marginBottom: 18 },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: BORDER,
  },
  heroTitle: { color: TEXT, fontSize: 26, fontWeight: '900', letterSpacing: -0.6 },
  heroSub: { color: MUTED, fontSize: 14, fontWeight: '600', marginTop: 10, lineHeight: 21 },
  stepRowOuter: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  stepChip: {
    flex: 1,
    backgroundColor: CARD,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.15)',
    alignItems: 'center',
    gap: 4,
  },
  stepChipActive: { borderColor: MINT, backgroundColor: 'rgba(52,211,153,0.08)' },
  stepChipDone: { borderColor: 'rgba(52,211,153,0.35)' },
  stepChipTxt: { color: MUTED, fontWeight: '900', fontSize: 13 },
  stepChipTxtOn: { color: MINT },
  stepChipLabel: { color: MUTED, fontSize: 10, fontWeight: '700', textAlign: 'center' },
  stepChipLabelOn: { color: TEXT },
  progressBar: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(148,163,184,0.15)',
    marginBottom: 16,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: MINT,
  },
  card: {
    backgroundColor: CARD,
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: BORDER,
  },
  sectionTitle: { color: TEXT, fontSize: 18, fontWeight: '900' },
  sectionHint: { color: MUTED, fontSize: 13, fontWeight: '600', marginTop: 8, lineHeight: 19, marginBottom: 14 },
  field: { marginBottom: 14 },
  fieldLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  label: { color: TEXT, fontWeight: '700', fontSize: 13 },
  fieldErr: { color: ERR, fontSize: 12, fontWeight: '600', marginTop: 6 },
  charHint: { color: '#64748B', fontSize: 11, fontWeight: '600', marginTop: 6, alignSelf: 'flex-end' },
  input: {
    backgroundColor: INPUT_BG,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.2)',
    color: TEXT,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 14 : 12,
    fontSize: 15,
    fontWeight: '600',
  },
  inputErr: { borderColor: 'rgba(248,113,113,0.55)' },
  inputTall: { minHeight: 88, textAlignVertical: 'top', paddingTop: 14 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: MINT,
    paddingVertical: 15,
    borderRadius: 16,
    marginTop: 8,
  },
  primaryBtnDim: { opacity: 0.55 },
  primaryBtnFlex: { flex: 1, marginTop: 0 },
  primaryBtnTxt: { color: '#022C22', fontWeight: '900', fontSize: 16 },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderColor: MINT,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 12,
    marginBottom: 12,
    backgroundColor: 'rgba(52,211,153,0.06)',
  },
  secondaryBtnTxt: { color: MINT, fontWeight: '800', fontSize: 14, flex: 1, textAlign: 'center' },
  ghostBtn: {
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.25)',
  },
  ghostBtnTxt: { color: TEXT, fontWeight: '800', fontSize: 15 },
  btnDisabled: { opacity: 0.45 },
  ninMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  ninCounter: { color: MUTED, fontSize: 12, fontWeight: '700' },
  ninCounterOk: { color: MINT },
  ninOkPill: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ninOkPillTxt: { color: MINT, fontSize: 12, fontWeight: '800' },
  ninStatus: {
    backgroundColor: INPUT_BG,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.15)',
    gap: 8,
    marginBottom: 12,
  },
  ninRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ninRowTxt: { color: '#CBD5E1', fontSize: 13, fontWeight: '600', flex: 1 },
  ninHint: { color: MUTED, fontSize: 12, fontWeight: '600', marginTop: 4, lineHeight: 17 },
  infoTxt: { color: '#94A3B8', fontSize: 12, fontWeight: '600', marginBottom: 12, lineHeight: 18 },
  rowBtns: { flexDirection: 'row', gap: 12, alignItems: 'center', marginTop: 8, marginBottom: 12 },
  checklist: {
    gap: 8,
    marginBottom: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: INPUT_BG,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.12)',
  },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkRowTxt: { color: MUTED, fontSize: 13, fontWeight: '600' },
  checkRowTxtOk: { color: '#CBD5E1' },
  faceHero: { borderRadius: 18, overflow: 'hidden', marginBottom: 12 },
  faceHeroGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 18,
  },
  faceRing: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 2,
    borderColor: MINT,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: 'rgba(2,6,23,0.5)',
  },
  faceImg: { width: 76, height: 76, borderRadius: 38 },
  faceTitle: { color: TEXT, fontSize: 16, fontWeight: '900' },
  faceSub: { color: MUTED, fontSize: 12, fontWeight: '600', marginTop: 6, lineHeight: 18 },
  footerLegal: { color: '#64748B', fontSize: 11, fontWeight: '600', textAlign: 'center', marginTop: 18, lineHeight: 16 },
});

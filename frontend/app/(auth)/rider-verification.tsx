import React, { useMemo, useState, useEffect } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAppStore } from '@/src/store/appStore';
import { useAuthedApiReady } from '@/src/hooks/useAuthedApiReady';
import { useAuthedUserId } from '@/src/hooks/useAuthedUserId';
import { useThemeColors } from '@/src/constants/theme';
import { completeRiderVerification, getRiderVerificationStatus } from '@/src/services/api';
import { saveUserSession } from '@/utils/authStorage';
import { markRiderVerificationCached } from '@/src/utils/sessionRouting';
import { logLegalGateCheck, syncUserLegalStatus } from '@/src/services/legalStatusSync';
import { replaceLegalTermsIfNeeded } from '@/src/utils/navigationRouteGuard';
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

  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [loading, setLoading] = useState(false);
  const [attempted, setAttempted] = useState(false);

  const phoneDigits = useMemo(() => phone.replace(/\D/g, ''), [phone]);
  const nameTrim = name.trim();
  const nameOk = nameTrim.length >= 3 && nameTrim.length <= 120;
  const phoneOk = phoneDigits.length >= 10 && phoneDigits.length <= 15;
  const canSubmit = nameOk && phoneOk && Boolean(riderId);

  const nameErr = attempted && !nameOk ? 'Enter your full name (3–120 characters).' : null;
  const phoneErr = attempted && !phoneOk ? 'Enter a valid phone number (at least 10 digits).' : null;

  useEffect(() => {
    if (!canCallAuthedApi || !riderId) return;
    let alive = true;
    void (async () => {
      try {
        const res = await getRiderVerificationStatus(riderId);
        if (!alive) return;
        if (res.data?.completed) {
          await syncUserLegalStatus(riderId);
          const effectiveUser = useAppStore.getState().user ?? user;
          if (logLegalGateCheck(effectiveUser, 'rider-verification')) {
            replaceLegalTermsIfNeeded(router, 'rider');
            return;
          }
          await markRiderVerificationCached(riderId);
          router.replace('/(rider-tabs)/rider-home');
        }
      } catch {
        /* stay on screen */
      }
    })();
    return () => {
      alive = false;
    };
  }, [canCallAuthedApi, riderId, router]);

  useEffect(() => {
    if (!user?.id) return;
    setName(user.name || '');
    setPhone(user.phone || '');
  }, [user?.id, user?.name, user?.phone]);

  const handleSubmit = async () => {
    if (!riderId || !canCallAuthedApi || !user) {
      Alert.alert('Session error', 'Please log in again.', [
        { text: 'Log in', onPress: () => router.replace('/(auth)/login') },
      ]);
      return;
    }
    if (!canSubmit) {
      setAttempted(true);
      Alert.alert('Almost there', 'Enter your name and phone number to continue.');
      return;
    }
    setLoading(true);
    try {
      const nin = String((user as { nin?: string }).nin || '').trim();
      const res = await completeRiderVerification(riderId, {
        name: nameTrim,
        phone: phone.trim(),
        address: '',
        nin: nin || undefined,
      });
      const updatedUser = (res.data as { user?: typeof user } | undefined)?.user || {
        ...user,
        id: riderId,
        name: nameTrim,
        phone: phone.trim(),
        rider_verification_completed: true,
        onboarding_complete: true,
      };
      setUser(updatedUser);
      await saveUserSession({ ...updatedUser, token: token || null });
      await markRiderVerificationCached(riderId);
      await syncUserLegalStatus(riderId, { force: true });
      const effectiveUser = useAppStore.getState().user ?? updatedUser;
      if (logLegalGateCheck(effectiveUser, 'rider-verification:submit')) {
        replaceLegalTermsIfNeeded(router, 'rider');
        return;
      }
      if (Platform.OS !== 'web') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      router.replace('/(rider-tabs)/rider-home');
    } catch (e: unknown) {
      Alert.alert('Could not save profile', apiErrorMessage(e, 'Please check your details and try again.'));
    } finally {
      setLoading(false);
    }
  };

  if (!storeReady) {
    return null;
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
            <View style={styles.hero}>
              <LinearGradient colors={palette.heroGrad} style={styles.heroIcon}>
                <Ionicons name="person-circle-outline" size={28} color={MINT} />
              </LinearGradient>
              <Text style={[styles.heroTitle, { color: palette.text }]}>Quick profile setup</Text>
              <Text style={[styles.heroSub, { color: palette.muted }]}>
                Confirm your name and phone — no SMS code. Then you can book rides.
              </Text>
            </View>

            <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
              <Text style={[styles.sectionTitle, { color: palette.text }]}>Your details</Text>
              <Text style={[styles.sectionHint, { color: palette.muted }]}>
                Drivers use this number to reach you during trips.
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
                  placeholder="+234 801 234 5678"
                  placeholderTextColor={palette.placeholder}
                  maxLength={20}
                  accessibilityLabel="Phone number"
                />
              </Field>

              <TouchableOpacity
                style={[styles.primaryBtn, (!canSubmit || loading) && styles.btnDisabled]}
                disabled={!canSubmit || loading}
                onPress={() => void handleSubmit()}
                accessibilityRole="button"
                accessibilityLabel="Continue to NEXRYDE"
              >
                {loading ? (
                  <ActivityIndicator color="#022C22" />
                ) : (
                  <>
                    <Text style={styles.primaryBtnTxt}>Continue to NEXRYDE</Text>
                    <Ionicons name="arrow-forward" size={18} color="#022C22" />
                  </>
                )}
              </TouchableOpacity>
            </View>

            <Text style={styles.footerLegal}>
              Face verification is optional — add a profile photo anytime under Profile → Edit Profile.
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
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
  scroll: { paddingHorizontal: 20, paddingBottom: 44, paddingTop: 8 },
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
  primaryBtnTxt: { color: '#022C22', fontWeight: '900', fontSize: 16 },
  btnDisabled: { opacity: 0.45 },
  footerLegal: { color: '#64748B', fontSize: 11, fontWeight: '600', textAlign: 'center', marginTop: 18, lineHeight: 16 },
});

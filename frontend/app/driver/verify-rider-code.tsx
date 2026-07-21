/**
 * Pick-up code verification — driver enters the 4-digit code from the rider's NEXRYDE app.
 * On success → trip is marked verified; driver returns to the live map Start dock (Navigate + Start).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Animated,
  Platform,
  Vibration,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { BACKEND_URL, getAuthHeaders, getTrip } from '@/src/services/api';
import { useAuthedUserId } from '@/src/hooks/useAuthedUserId';
import { useAppStore, type Trip } from '@/src/store/appStore';

const CODE_LENGTH = 4;

export default function VerifyRiderCodeScreen() {
  const router = useRouter();
  const { canCallAuthedApi } = useAuthedUserId();
  const setCurrentTrip = useAppStore((s) => s.setCurrentTrip);
  const { trip_id, driver_id, auto } = useLocalSearchParams<{
    trip_id: string;
    driver_id: string;
    auto?: string;
  }>();

  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [attempts, setAttempts] = useState(0);

  const inputRefs = useRef<(TextInput | null)[]>([]);
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const successAnim = useRef(new Animated.Value(0)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeIn, { toValue: 1, duration: 380, useNativeDriver: true }).start();
    // Auto-focus first input
    setTimeout(() => inputRefs.current[0]?.focus(), 350);
  }, []);

  // Pickup code is optional — leave if this trip does not require it.
  useEffect(() => {
    if (!trip_id || !canCallAuthedApi) return;
    let cancelled = false;
    void (async () => {
      try {
        const tripRes = await getTrip(String(trip_id));
        const trip = tripRes.data as Trip | undefined;
        if (cancelled || !trip) return;
        if (trip.pickup_code_required !== true) {
          router.replace('/(driver-tabs)/driver-home');
        }
      } catch {
        /* stay on screen; submit will surface errors */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [trip_id, canCallAuthedApi, router]);

  const shake = () => {
    Vibration.vibrate(200);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };

  const handleDigit = (val: string, idx: number) => {
    if (!/^\d?$/.test(val)) return;
    const next = [...digits];
    next[idx] = val;
    setDigits(next);
    setError('');
    if (val && idx < CODE_LENGTH - 1) {
      inputRefs.current[idx + 1]?.focus();
    }
    if (val && idx === CODE_LENGTH - 1) {
      // All filled — submit
      void submitCode([...next.slice(0, CODE_LENGTH - 1), val].join(''));
    }
  };

  const handleBackspace = (e: any, idx: number) => {
    if (e.nativeEvent.key === 'Backspace' && !digits[idx] && idx > 0) {
      inputRefs.current[idx - 1]?.focus();
    }
  };

  const submitCode = useCallback(async (code: string) => {
    if (code.length !== CODE_LENGTH || submitting) return;
    if (!canCallAuthedApi) {
      setError('Session loading — try again in a moment.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`${BACKEND_URL}/api/trips/${trip_id}/verify-pickup-code`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ pickup_code: code }),
      });
      const data = await res.json();

      if (res.ok && data.verified) {
        // ── SUCCESS ──
        setSuccess(true);
        if (Platform.OS !== 'web') {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        Animated.spring(successAnim, { toValue: 1, useNativeDriver: true, tension: 60, friction: 6 }).start();
        try {
          const tripRes = await getTrip(String(trip_id));
          setCurrentTrip(tripRes.data as Trip);
        } catch {
          /* trip poll on home will catch up */
        }
        setTimeout(() => router.replace('/(driver-tabs)/driver-home'), 720);
      } else {
        setAttempts((prev) => prev + 1);
        shake();
        if (Platform.OS !== 'web') {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
        setError(data?.detail || 'Invalid code. Try again.');
        setDigits(Array(CODE_LENGTH).fill(''));
        setTimeout(() => inputRefs.current[0]?.focus(), 100);
      }
    } catch {
      shake();
      setError('Connection error. Check your network and try again.');
      setDigits(Array(CODE_LENGTH).fill(''));
    } finally {
      setSubmitting(false);
    }
  }, [trip_id, driver_id, submitting, router, setCurrentTrip, canCallAuthedApi]);

  const filled = digits.filter(Boolean).length;

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#060A14', '#0A1628', '#0D2137']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.4, y: 1 }}
      />
      <View style={styles.glowMint} pointerEvents="none" />

      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={24} color="#E2E8F0" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <View style={styles.headerPill}>
              <Ionicons name="shield-checkmark" size={12} color="#86EFAC" />
              <Text style={styles.headerPillTxt}>Secure start</Text>
            </View>
          </View>
          <View style={{ width: 44 }} />
        </View>

        <Animated.View style={[styles.body, { opacity: fadeIn }]}>
          {!success ? (
            <>
              <View style={styles.iconWrap}>
                <LinearGradient
                  colors={['#34F5B8', '#22E5A0', '#0D9F6E']}
                  style={styles.iconGrad}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <Ionicons name="keypad" size={34} color="#022C22" />
                </LinearGradient>
              </View>
              <Text style={styles.eyebrow}>{auto === '1' ? 'Arrived · verify' : 'Before you start'}</Text>
              <Text style={styles.title}>Enter pickup code</Text>

              <View style={styles.steps}>
                {['Ask rider', 'Enter code', 'Start trip'].map((label, i) => (
                  <View key={label} style={styles.stepCol}>
                    <View style={[styles.stepDot, i <= (filled > 0 ? 1 : 0) && styles.stepDotOn]}>
                      <Text style={styles.stepNum}>{i + 1}</Text>
                    </View>
                    <Text style={[styles.stepLbl, i <= (filled > 0 ? 1 : 0) && styles.stepLblOn]}>{label}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.flowCard}>
                <Text style={styles.subtitle}>
                  Ask your rider to open NEXRYDE and share their 4-digit code. Enter it to confirm it’s them, then
                  return to the map to start when you’re both ready.
                </Text>

                <Animated.View style={[styles.pinRow, { transform: [{ translateX: shakeAnim }] }]}>
                {digits.map((d, i) => (
                  <TouchableOpacity
                    key={i}
                    activeOpacity={1}
                    onPress={() => inputRefs.current[i]?.focus()}
                    accessibilityRole="button"
                    accessibilityLabel={`Digit ${i + 1}`}
                  >
                    <View
                      style={[
                        styles.pinBox,
                        d ? styles.pinBoxFilled : null,
                        error ? styles.pinBoxError : null,
                      ]}
                    >
                      <TextInput
                        ref={(r) => {
                          inputRefs.current[i] = r;
                        }}
                        style={styles.pinInput}
                        value={d}
                        onChangeText={(v) => handleDigit(v.slice(-1), i)}
                        onKeyPress={(e) => handleBackspace(e, i)}
                        keyboardType="number-pad"
                        maxLength={1}
                        selectTextOnFocus
                        caretHidden
                      />
                      {!d ? (
                        <Text style={styles.pinPlaceholder} pointerEvents="none">
                          —
                        </Text>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                ))}
              </Animated.View>

              {error ? (
                <View style={styles.errorBanner}>
                  <Ionicons name="alert-circle" size={18} color="#FCA5A5" />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : (
                <Text style={styles.hint}>
                  {filled === 0
                    ? 'Code updates live on the rider app.'
                    : `${filled} of ${CODE_LENGTH} digits`}
                </Text>
              )}

              {attempts > 0 ? (
                <View style={styles.attemptsRow}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <View key={i} style={[styles.attemptDot, i < attempts ? styles.attemptDotUsed : null]} />
                  ))}
                  <Text style={styles.attemptsText}>{Math.max(0, 5 - attempts)} tries left</Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={styles.confirmBtnOuter}
                onPress={() => submitCode(digits.join(''))}
                disabled={filled < CODE_LENGTH || submitting}
                activeOpacity={0.9}
              >
                <LinearGradient
                  colors={
                    filled < CODE_LENGTH || submitting
                      ? ['rgba(51,65,85,0.9)', 'rgba(30,41,59,0.95)']
                      : ['#34F5B8', '#22E5A0', '#0D9F6E']
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.confirmBtnGrad, (filled < CODE_LENGTH || submitting) && styles.confirmBtnGradMuted]}
                >
                  {submitting ? (
                    <ActivityIndicator color={filled >= CODE_LENGTH ? '#022C22' : '#94A3B8'} />
                  ) : (
                    <>
                      <Ionicons name="shield-checkmark" size={20} color={filled < CODE_LENGTH ? '#94A3B8' : '#022C22'} />
                      <Text
                        style={[
                          styles.confirmBtnText,
                          filled < CODE_LENGTH && styles.confirmBtnTextMuted,
                        ]}
                      >
                        Verify pickup code
                      </Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()}>
                <Text style={styles.cancelBtnText}>Not now</Text>
              </TouchableOpacity>
              </View>
            </>
          ) : (
            <Animated.View
              style={[
                styles.successWrap,
                {
                  transform: [{ scale: successAnim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }],
                  opacity: successAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }),
                },
              ]}
            >
              <LinearGradient
                colors={['#34F5B8', '#22E5A0', '#0D9F6E']}
                style={styles.successIconWrap}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Ionicons name="checkmark" size={48} color="#022C22" />
              </LinearGradient>
              <Text style={styles.successTitle}>Code verified</Text>
              <Text style={styles.successSub}>
                Opening your trip card — navigate to the destination, then tap Start trip when the rider is seated.
              </Text>
              <ActivityIndicator color="#22E5A0" style={{ marginTop: 22 }} size="small" />
            </Animated.View>
          )}
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  glowMint: {
    position: 'absolute',
    top: -40,
    right: -30,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#34F5B8',
    opacity: 0.08,
  },
  safe: { flex: 1 },
  steps: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  stepCol: { alignItems: 'center', flex: 1, gap: 6 },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(148,163,184,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotOn: { backgroundColor: 'rgba(52,245,184,0.25)', borderWidth: 1, borderColor: 'rgba(52,245,184,0.5)' },
  stepNum: { fontSize: 12, fontWeight: '900', color: '#94A3B8' },
  stepLbl: { fontSize: 10, fontWeight: '700', color: '#64748B', textAlign: 'center' },
  stepLblOn: { color: '#A7F3D0' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 6 : 2,
    paddingBottom: 10,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(15,23,42,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(34,229,160,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(34,229,160,0.28)',
  },
  headerPillTxt: {
    fontSize: 10,
    fontWeight: '900',
    color: '#86EFAC',
    letterSpacing: 1.1,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    maxWidth: 420,
    alignSelf: 'center',
    width: '100%',
  },
  iconWrap: { marginBottom: 20 },
  iconGrad: {
    width: 88,
    height: 88,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    shadowColor: '#22E5A0',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 12,
  },
  flowCard: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    marginTop: 4,
    borderRadius: 26,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 22,
    backgroundColor: 'rgba(15,23,42,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(52,245,184,0.16)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.45,
    shadowRadius: 28,
    elevation: 14,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 1.05,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: '#F8FAFC',
    textAlign: 'center',
    letterSpacing: -0.75,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
    paddingHorizontal: 2,
  },
  pinRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 22,
    justifyContent: 'center',
  },
  pinBox: {
    width: 64,
    height: 76,
    borderRadius: 20,
    backgroundColor: 'rgba(2,6,23,0.55)',
    borderWidth: 2,
    borderColor: 'rgba(51,65,85,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  pinBoxFilled: {
    backgroundColor: 'rgba(34,229,160,0.1)',
    borderColor: '#22E5A0',
    shadowColor: '#22E5A0',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 4,
  },
  pinBoxError: {
    borderColor: 'rgba(248,113,113,0.85)',
    backgroundColor: 'rgba(127,29,29,0.2)',
  },
  pinInput: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    textAlign: 'center',
    fontSize: 28,
    fontWeight: '900',
    color: '#F8FAFC',
  },
  pinPlaceholder: {
    fontSize: 22,
    color: 'rgba(148,163,184,0.35)',
    fontWeight: '400',
  },
  hint: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(148,163,184,0.9)',
    marginBottom: 22,
    textAlign: 'center',
    minHeight: 20,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(127,29,29,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.35)',
    width: '100%',
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#FECACA',
    lineHeight: 20,
  },
  attemptsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 20,
  },
  attemptDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(51,65,85,0.9)',
  },
  attemptDotUsed: { backgroundColor: '#F87171' },
  attemptsText: { fontSize: 12, fontWeight: '700', color: '#64748B', marginLeft: 6 },
  confirmBtnOuter: {
    width: '100%',
    borderRadius: 18,
    overflow: 'hidden',
    marginTop: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(34,229,160,0.25)',
    shadowColor: '#22E5A0',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  confirmBtnGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 17,
    paddingHorizontal: 20,
    minHeight: 56,
  },
  confirmBtnGradMuted: {
    borderColor: 'transparent',
  },
  confirmBtnText: {
    fontSize: 17,
    fontWeight: '900',
    color: '#022C22',
    letterSpacing: 0.15,
  },
  confirmBtnTextMuted: {
    color: '#94A3B8',
  },
  cancelBtn: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(71,85,105,0.55)',
    backgroundColor: 'rgba(2,6,23,0.35)',
    alignItems: 'center',
    alignSelf: 'center',
    minWidth: '88%',
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: 'rgba(148,163,184,0.85)',
  },
  successWrap: {
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
  },
  successIconWrap: {
    width: 104,
    height: 104,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    shadowColor: '#22E5A0',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 14,
  },
  successTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: '#F8FAFC',
    letterSpacing: -0.4,
    marginTop: 8,
  },
  successSub: {
    fontSize: 15,
    fontWeight: '600',
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 8,
  },
});

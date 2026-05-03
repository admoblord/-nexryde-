/**
 * Pick-Up Code Verification Screen — Driver Side
 * Auto-triggered when driver arrives at pickup (<= 100m).
 * Driver enters the 4-digit code shown on the rider's screen.
 * On success → trip starts immediately. No biometric, no extra steps.
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
import { BACKEND_URL, getAuthHeaders } from '@/src/services/api';

const CODE_LENGTH = 4;

export default function VerifyRiderCodeScreen() {
  const router = useRouter();
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
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Animated.spring(successAnim, { toValue: 1, useNativeDriver: true, tension: 60, friction: 6 }).start();
        // Start trip immediately
        const startRes = await fetch(`${BACKEND_URL}/api/trips/${trip_id}/start`, {
          method: 'PUT',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ driver_id }),
        });
        if (startRes.ok) {
          setTimeout(() => router.replace('/driver/trips' as any), 900);
        } else {
          // Code verified, start failed (may need face) — just go back
          setTimeout(() => router.back(), 900);
        }
      } else {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        shake();
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
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
  }, [trip_id, driver_id, submitting, attempts, router]);

  const filled = digits.filter(Boolean).length;

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#0F172A', '#1E3A5F']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.4, y: 1 }}
      />

      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-down" size={26} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
          <View style={styles.autoChip}>
            <View style={styles.autoChipDot} />
            <Text style={styles.autoChipText}>
              {auto === '1' ? 'Auto-triggered · arrived' : 'Verify Rider'}
            </Text>
          </View>
          <View style={{ width: 44 }} />
        </View>

        <Animated.View style={[styles.body, { opacity: fadeIn }]}>
          {!success ? (
            <>
              {/* Icon + title */}
              <View style={styles.iconWrap}>
                <LinearGradient
                  colors={['#00D46A', '#0070F3']}
                  style={styles.iconGrad}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <Ionicons name="keypad" size={36} color="#FFF" />
                </LinearGradient>
              </View>
              <Text style={styles.title}>Verify Rider</Text>
              <Text style={styles.subtitle}>Enter the 4-digit code shown on the rider's screen</Text>

              {/* PIN boxes */}
              <Animated.View style={[styles.pinRow, { transform: [{ translateX: shakeAnim }] }]}>
                {digits.map((d, i) => (
                  <TouchableOpacity
                    key={i}
                    activeOpacity={1}
                    onPress={() => inputRefs.current[i]?.focus()}
                  >
                    <View style={[
                      styles.pinBox,
                      d ? styles.pinBoxFilled : null,
                      error && !d ? styles.pinBoxError : null,
                    ]}>
                      <TextInput
                        ref={r => { inputRefs.current[i] = r; }}
                        style={styles.pinInput}
                        value={d}
                        onChangeText={v => handleDigit(v.slice(-1), i)}
                        onKeyPress={e => handleBackspace(e, i)}
                        keyboardType="number-pad"
                        maxLength={1}
                        selectTextOnFocus
                        caretHidden
                      />
                      {!d && <Text style={styles.pinPlaceholder}>—</Text>}
                    </View>
                  </TouchableOpacity>
                ))}
              </Animated.View>

              {/* Error state */}
              {error ? (
                <View style={styles.errorRow}>
                  <Ionicons name="alert-circle" size={16} color="#EF4444" />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : (
                <Text style={styles.hint}>
                  {filled === 0 ? 'Ask the rider to open their NEXRYDE app' : `${filled} of ${CODE_LENGTH} digits entered`}
                </Text>
              )}

              {/* Attempts indicator */}
              {attempts > 0 && (
                <View style={styles.attemptsRow}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <View
                      key={i}
                      style={[styles.attemptDot, i < attempts ? styles.attemptDotUsed : null]}
                    />
                  ))}
                  <Text style={styles.attemptsText}>{5 - attempts} attempts left</Text>
                </View>
              )}

              {/* Manual confirm button (if auto-submit didn't trigger) */}
              <TouchableOpacity
                style={[styles.confirmBtn, (filled < CODE_LENGTH || submitting) && styles.confirmBtnDisabled]}
                onPress={() => submitCode(digits.join(''))}
                disabled={filled < CODE_LENGTH || submitting}
                activeOpacity={0.88}
              >
                {submitting ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={20} color="#FFF" />
                    <Text style={styles.confirmBtnText}>Confirm</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </>
          ) : (
            /* ── Success state ── */
            <Animated.View style={[styles.successWrap, { transform: [{ scale: successAnim }], opacity: successAnim }]}>
              <LinearGradient
                colors={['#00D46A', '#00A854']}
                style={styles.successIconWrap}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Ionicons name="checkmark" size={52} color="#FFF" />
              </LinearGradient>
              <Text style={styles.successTitle}>Rider Confirmed</Text>
              <Text style={styles.successSub}>Starting trip…</Text>
              <ActivityIndicator color="#00D46A" style={{ marginTop: 20 }} />
            </Animated.View>
          )}
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 8 : 4,
    paddingBottom: 8,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  autoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,212,106,0.18)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(0,212,106,0.3)',
  },
  autoChipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#00D46A',
  },
  autoChipText: { fontSize: 12, fontWeight: '700', color: '#00D46A' },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  iconWrap: { marginBottom: 24 },
  iconGrad: {
    width: 80,
    height: 80,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#00D46A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 10,
  },
  title: {
    fontSize: 30,
    fontWeight: '900',
    color: '#FFF',
    textAlign: 'center',
    letterSpacing: 0.3,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 36,
  },
  pinRow: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 20,
  },
  pinBox: {
    width: 64,
    height: 72,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinBoxFilled: {
    backgroundColor: 'rgba(0,212,106,0.15)',
    borderColor: '#00D46A',
  },
  pinBoxError: {
    borderColor: 'rgba(239,68,68,0.7)',
    backgroundColor: 'rgba(239,68,68,0.08)',
  },
  pinInput: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    textAlign: 'center',
    fontSize: 32,
    fontWeight: '900',
    color: '#FFF',
    opacity: 1,
  },
  pinPlaceholder: {
    fontSize: 24,
    color: 'rgba(255,255,255,0.2)',
    fontWeight: '300',
  },
  hint: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.45)',
    marginBottom: 28,
    textAlign: 'center',
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 20,
  },
  errorText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#EF4444',
    textAlign: 'center',
  },
  attemptsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 24,
  },
  attemptDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  attemptDotUsed: { backgroundColor: '#EF4444' },
  attemptsText: { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginLeft: 4 },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#00D46A',
    width: '100%',
    paddingVertical: 18,
    borderRadius: 18,
    shadowColor: '#00D46A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 8,
    marginBottom: 14,
  },
  confirmBtnDisabled: { backgroundColor: 'rgba(255,255,255,0.12)', shadowOpacity: 0 },
  confirmBtnText: { fontSize: 17, fontWeight: '900', color: '#FFF', letterSpacing: 0.3 },
  cancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.45)',
  },
  // Success state
  successWrap: {
    alignItems: 'center',
    gap: 16,
  },
  successIconWrap: {
    width: 100,
    height: 100,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#00D46A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 12,
  },
  successTitle: { fontSize: 28, fontWeight: '900', color: '#FFF' },
  successSub: { fontSize: 15, color: 'rgba(255,255,255,0.6)' },
});

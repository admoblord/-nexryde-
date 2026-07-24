import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, AppState, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BACKEND_URL, formatApiDetail } from '@/src/services/api';
import { COLORS, FONT_SIZE, SPACING, BORDER_RADIUS } from '@/src/constants/theme';
import { useAuthedApiReady } from '@/src/hooks/useAuthedApiReady';
import { useOnboardingSurfaces } from '@/src/hooks/useOnboardingSurfaces';
import { authedFetch } from '@/src/utils/sessionRefresh';

type VerificationState = {
  step?: string;
  verification_status?: string;
  verification?: {
    id?: string;
    status?: string;
    rejection_reason?: string;
    submitted_at?: string;
    reviewed_at?: string;
    notes?: string;
  };
};

export default function DriverVerificationStatusScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { storeReady, canCallAuthedApi } = useAuthedApiReady();
  const surf = useOnboardingSurfaces();
  const driverId = String(params.driver_id || '');
  const [loading, setLoading] = useState(() => Boolean(driverId));
  const [status, setStatus] = useState<VerificationState>({});

  const loadStatus = useCallback(async (opts?: { silent?: boolean }) => {
    // Silent = background poll (auto-advance when an admin approves) — never
    // flip the full-screen spinner or raise blocking alerts on transient blips.
    const silent = opts?.silent === true;
    if (!driverId) {
      if (!silent) setLoading(false);
      return;
    }
    if (!canCallAuthedApi) {
      if (!silent) {
        setLoading(false);
        Alert.alert('Session expired', 'Please sign in again to check your verification status.', [
          { text: 'Sign in', onPress: () => router.replace('/(auth)/login') },
        ]);
      }
      return;
    }
    if (!silent) setLoading(true);
    try {
      const res = await authedFetch(`${BACKEND_URL}/api/drivers/${driverId}/onboarding-status`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (!silent) Alert.alert('Could not check status', formatApiDetail(data?.detail) || 'Please try again.');
        return;
      }
      setStatus(data);
      // Persist the learned verification fact so Home paints the right state on
      // its first frame (and instant-Home routing works next launch).
      if (data?.verification_status) {
        const { writeDriverVerificationFact } = await import('@/src/services/driverVerificationFact');
        void writeDriverVerificationFact(driverId, String(data.verification_status));
      }
      if (data?.completed) {
        const { markDriverOnboardingCached } = await import('@/src/utils/sessionRouting');
        await markDriverOnboardingCached(driverId);
        router.replace('/(driver-tabs)/driver-home');
      } else if (data?.step === 'profile') {
        router.replace({
          pathname: '/(auth)/driver-profile',
          params: {
            driver_id: driverId,
            phone: String(params.phone || ''),
            name: String(params.name || ''),
            email: String(params.email || ''),
          },
        });
      }
    } catch {
      if (!silent) Alert.alert('Connection error', 'Could not check your verification status. Please try again.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [canCallAuthedApi, driverId, params.phone, params.name, params.email, router]);

  useEffect(() => {
    if (!driverId) {
      setLoading(false);
      return;
    }
    if (!storeReady) return;
    if (!canCallAuthedApi) {
      setLoading(false);
      return;
    }
    void loadStatus();
  }, [driverId, storeReady, canCallAuthedApi, loadStatus]);

  const isRejected = status.step === 'documents_rejected' || status.verification_status === 'rejected';

  // Auto-poll while the driver is waiting so an admin approval advances them to
  // Home/Profile without tapping "Refresh status". Stop once rejected (terminal
  // until they resubmit). Also refresh the instant the app returns to foreground.
  useEffect(() => {
    if (!driverId || !storeReady || !canCallAuthedApi || isRejected) return;
    const interval = setInterval(() => {
      void loadStatus({ silent: true });
    }, 15000);
    const appSub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void loadStatus({ silent: true });
    });
    return () => {
      clearInterval(interval);
      appSub.remove();
    };
  }, [driverId, storeReady, canCallAuthedApi, isRejected, loadStatus]);
  const title = isRejected ? 'Documents need correction' : 'Documents under review';
  const message = isRejected
    ? (status.verification?.rejection_reason || 'Your documents need correction. Please retake and resubmit the required files.')
    : 'Your documents have been submitted and are waiting for review. You do not need to upload them again unless they are rejected.';

  if (!storeReady) {
    return null;
  }

  const needsSignIn = storeReady && driverId.length > 0 && !canCallAuthedApi;

  return (
    <View style={[styles.container, { backgroundColor: surf.screen }]}>
      <SafeAreaView style={styles.safe}>
        <View style={[styles.card, { backgroundColor: surf.card, borderWidth: StyleSheet.hairlineWidth, borderColor: surf.border }]}>
          <LinearGradient
            colors={isRejected ? ['#F97316', '#EF4444'] : [COLORS.accentGreen, COLORS.accentBlue]}
            style={styles.iconCircle}
          >
            <Ionicons name={isRejected ? 'alert-circle' : 'shield-checkmark'} size={42} color={COLORS.white} />
          </LinearGradient>
          <Text style={[styles.title, { color: surf.text }]}>
            {needsSignIn ? 'Sign in required' : loading ? 'Checking verification...' : title}
          </Text>
          {loading ? (
            <ActivityIndicator color={surf.accent} style={{ marginTop: SPACING.lg }} />
          ) : needsSignIn ? (
            <>
              <Text style={[styles.message, { color: surf.textSecondary }]}>
                Your session is not active. Sign in to refresh your document review status.
              </Text>
              <TouchableOpacity style={styles.primaryBtn} onPress={() => router.replace('/(auth)/login')}>
                <Text style={styles.primaryText}>Sign in</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={[styles.message, { color: surf.textSecondary }]}>{message}</Text>
              {status.verification?.submitted_at && (
                <Text style={[styles.meta, { color: surf.textMuted }]}>
                  Submitted: {String(status.verification.submitted_at).slice(0, 19).replace('T', ' ')}
                </Text>
              )}
              <TouchableOpacity style={styles.primaryBtn} onPress={() => void loadStatus()}>
                <Text style={styles.primaryText}>Refresh status</Text>
              </TouchableOpacity>
              {isRejected ? (
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={() => router.replace({
                    pathname: '/(auth)/driver-documents',
                    params: {
                      driver_id: driverId,
                      phone: String(params.phone || ''),
                      name: String(params.name || ''),
                      email: String(params.email || ''),
                    },
                  })}
                >
                  <Text style={styles.secondaryText}>Resubmit documents</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.secondaryBtn, { borderColor: surf.border }]}
                  onPress={() => router.replace('/(auth)/login')}
                >
                  <Text style={[styles.secondaryText, { color: surf.text }]}>Back to sign in</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.lightBackground },
  safe: { flex: 1, justifyContent: 'center', padding: SPACING.lg },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xl,
    alignItems: 'center',
  },
  iconCircle: {
    width: 86,
    height: 86,
    borderRadius: 43,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  title: { fontSize: FONT_SIZE.xl, fontWeight: '800', color: COLORS.lightTextPrimary, textAlign: 'center' },
  message: { fontSize: FONT_SIZE.md, color: COLORS.lightTextSecondary, textAlign: 'center', lineHeight: 22, marginTop: SPACING.md },
  meta: { fontSize: FONT_SIZE.sm, color: COLORS.lightTextMuted, marginTop: SPACING.md },
  primaryBtn: {
    marginTop: SPACING.xl,
    backgroundColor: COLORS.accentGreen,
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    width: '100%',
    alignItems: 'center',
  },
  primaryText: { color: COLORS.white, fontSize: FONT_SIZE.md, fontWeight: '800' },
  secondaryBtn: {
    marginTop: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    width: '100%',
    alignItems: 'center',
  },
  secondaryText: { color: COLORS.lightTextPrimary, fontSize: FONT_SIZE.md, fontWeight: '700' },
});

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BACKEND_URL, formatApiDetail, getAuthHeaders } from '@/src/services/api';
import { COLORS, FONT_SIZE, SPACING, BORDER_RADIUS } from '@/src/constants/theme';

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
  const driverId = String(params.driver_id || '');
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<VerificationState>({});

  const loadStatus = async () => {
    if (!driverId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/drivers/${driverId}/onboarding-status`, {
        headers: getAuthHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        Alert.alert('Could not check status', formatApiDetail(data?.detail) || 'Please try again.');
        return;
      }
      setStatus(data);
      if (data?.completed) {
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
      Alert.alert('Connection error', 'Could not check your verification status. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadStatus();
  }, [driverId]);

  const isRejected = status.step === 'documents_rejected' || status.verification_status === 'rejected';
  const title = isRejected ? 'Documents need correction' : 'Documents under review';
  const message = isRejected
    ? (status.verification?.rejection_reason || 'Your documents need correction. Please retake and resubmit the required files.')
    : 'Your documents have been submitted and are waiting for review. You do not need to upload them again unless they are rejected.';

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.card}>
          <LinearGradient
            colors={isRejected ? ['#F97316', '#EF4444'] : [COLORS.accentGreen, COLORS.accentBlue]}
            style={styles.iconCircle}
          >
            <Ionicons name={isRejected ? 'alert-circle' : 'shield-checkmark'} size={42} color={COLORS.white} />
          </LinearGradient>
          <Text style={styles.title}>{loading ? 'Checking verification...' : title}</Text>
          {loading ? (
            <ActivityIndicator color={COLORS.accentGreen} style={{ marginTop: SPACING.lg }} />
          ) : (
            <>
              <Text style={styles.message}>{message}</Text>
              {status.verification?.submitted_at && (
                <Text style={styles.meta}>Submitted: {String(status.verification.submitted_at).slice(0, 19).replace('T', ' ')}</Text>
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
                <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.replace('/(auth)/login')}>
                  <Text style={styles.secondaryText}>Back to sign in</Text>
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

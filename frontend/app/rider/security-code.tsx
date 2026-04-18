import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import { useAppStore } from '@/src/store/appStore';
import { BACKEND_URL, getAuthHeaders, verifyTripBiometricLock } from '@/src/services/api';
import { BiometricScanner } from '@/src/components/tier1';

export default function SecurityCodeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [securityCode, setSecurityCode] = useState('');
  const [activeTripId, setActiveTripId] = useState('');
  const [activeDriverId, setActiveDriverId] = useState('');
  const [tripStatus, setTripStatus] = useState<any>(null);
  const tripId = (params.trip_id as string) || (params.tripId as string) || activeTripId;
  const driverId = (params.driver_id as string) || (params.driverId as string) || activeDriverId;
  const backendUrl = BACKEND_URL;

  useEffect(() => {
    const loadActiveTripAndCode = async () => {
      if (!user?.id) {
        setLoading(false);
        return;
      }
      try {
        let resolvedTripId = tripId;
        let resolvedDriverId = driverId;

        if (!resolvedTripId || !resolvedDriverId) {
          const activeRes = await fetch(`${backendUrl}/api/trips/active/${encodeURIComponent(user.id)}`, {
            headers: getAuthHeaders(),
          });
          const activeData = await activeRes.json();
          const activeTrip = activeData?.trip;
          if (activeData?.active && activeTrip?.id) {
            resolvedTripId = activeTrip.id;
            resolvedDriverId = activeTrip.driver_id || '';
            setActiveTripId(activeTrip.id);
            setActiveDriverId(activeTrip.driver_id || '');
          }
        }

        if (resolvedTripId) {
          const tripRes = await fetch(`${backendUrl}/api/trips/${resolvedTripId}`, {
            headers: getAuthHeaders(),
          });
          const tripData = await tripRes.json();
          setTripStatus(tripData);
          if (tripRes.ok && tripData?.security_code) {
            setSecurityCode(String(tripData.security_code));
          }
        }
      } catch {
        Alert.alert('Error', 'Could not load your security code right now.');
      } finally {
        setLoading(false);
      }
    };
    void loadActiveTripAndCode();
  }, [backendUrl, driverId, tripId, user?.id]);

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={[COLORS.primary, '#1a1a2e']}
        style={styles.gradient}
      >
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.white} />
        </TouchableOpacity>

        <View style={styles.content}>
          <View style={styles.iconContainer}>
            <Ionicons name="shield-checkmark" size={64} color={COLORS.accentGreen} />
          </View>

          <Text style={styles.title}>🔐 Your Security Code</Text>
          <Text style={styles.subtitle}>Show this 4-digit code to your driver at pickup</Text>

          <View style={styles.codeCard}>
            {loading ? (
              <ActivityIndicator size="large" color={COLORS.accentGreen} />
            ) : securityCode ? (
              <Text style={styles.codeValue}>{securityCode}</Text>
            ) : (
              <Text style={styles.codeUnavailable}>Code unavailable</Text>
            )}
          </View>

          <BiometricScanner
            title="Rider biometric trip lock"
            subtitle={
              tripStatus?.driver_biometric_verified_at
                ? 'Driver biometric already confirmed. Complete yours now to unlock the trip handshake.'
                : 'Verify with fingerprint or face unlock. The trip stays locked until both rider and driver confirm.'
            }
            confirmLabel={tripStatus?.rider_biometric_verified_at ? 'Biometric confirmed' : 'Verify my biometric'}
            onSuccess={async () => {
              if (!tripId) return;
              try {
                const res = await verifyTripBiometricLock(tripId);
                setTripStatus((prev: any) => ({ ...prev, ...res.data }));
                Alert.alert(
                  'Biometric recorded',
                  res.data?.biometric_handshake_ready
                    ? 'Double verified handshake is ready. Your driver can now finish secure trip start.'
                    : 'Your biometric is recorded. Waiting for the driver to complete theirs.'
                );
              } catch (error: any) {
                Alert.alert('Biometric lock', error?.response?.data?.detail || 'Could not record biometric lock.');
              }
            }}
            onFailure={(msg) => Alert.alert('Biometric check', msg)}
          />

          <View style={styles.handshakeCard}>
            <Text style={styles.handshakeTitle}>Double Verified Handshake</Text>
            <Text style={styles.handshakeItem}>
              Rider: {tripStatus?.rider_biometric_verified_at ? 'Confirmed' : 'Pending'}
            </Text>
            <Text style={styles.handshakeItem}>
              Driver: {tripStatus?.driver_biometric_verified_at ? 'Confirmed' : 'Pending'}
            </Text>
          </View>

          <View style={styles.tipsCard}>
            <Text style={styles.tipsTitle}>🛡️ Safety Tips</Text>
            <Text style={styles.tipText}>• Show this code only to the driver assigned in your app</Text>
            <Text style={styles.tipText}>• Match the driver's photo with the app</Text>
            <Text style={styles.tipText}>• Check the car plate number</Text>
            <Text style={styles.tipText}>• Share your trip with family</Text>
          </View>

          <Text style={styles.driverCodeLabel}>
            {tripId && driverId
              ? 'This code is linked to your active trip'
              : 'Open this screen from your active trip to view your code'}
          </Text>
          <TouchableOpacity style={styles.backToTripBtn} onPress={() => router.push('/rider/tracking')}>
            <Text style={styles.backToTripText}>Back to Trip</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  gradient: { flex: 1 },
  backButton: {
    position: 'absolute',
    top: SPACING.xl,
    left: SPACING.lg,
    zIndex: 10,
    padding: SPACING.sm,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(0,255,136,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xl,
  },
  title: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '900',
    color: COLORS.white,
    marginBottom: SPACING.sm,
  },
  subtitle: {
    fontSize: FONT_SIZE.md,
    color: COLORS.gray300,
    textAlign: 'center',
    marginBottom: SPACING.xl,
  },
  codeCard: {
    width: '100%',
    maxWidth: 260,
    minHeight: 100,
    borderRadius: BORDER_RADIUS.xxl,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xl,
  },
  codeValue: {
    fontSize: 42,
    letterSpacing: 10,
    fontWeight: '900',
    color: COLORS.white,
  },
  codeUnavailable: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.gray300,
  },
  handshakeCard: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    marginTop: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  handshakeTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '900',
    color: COLORS.white,
    marginBottom: SPACING.sm,
  },
  handshakeItem: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.gray200,
    marginBottom: 4,
  },
  tipsCard: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    width: '100%',
    marginBottom: SPACING.xl,
  },
  tipsTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: COLORS.white,
    marginBottom: SPACING.md,
  },
  tipText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.gray300,
    marginBottom: SPACING.xs,
    lineHeight: 20,
  },
  driverCodeLabel: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.gray400,
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  backToTripBtn: {
    marginTop: SPACING.lg,
    backgroundColor: COLORS.accentGreen,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.xl,
  },
  backToTripText: {
    fontSize: FONT_SIZE.md,
    color: COLORS.white,
    fontWeight: '800',
  },
});

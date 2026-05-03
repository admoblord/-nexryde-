/**
 * Pick-Up Code Screen — Rider Side
 * Shows the 4-digit code the driver needs to enter to start the trip.
 * Simple, clear, no biometric. Refreshes every 30s.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useAppStore } from '@/src/store/appStore';
import { BACKEND_URL, getAuthHeaders } from '@/src/services/api';

export default function PickUpCodeScreen() {
  const router = useRouter();
  const { user } = useAppStore();
  const params = useLocalSearchParams();
  const paramTripId = (params.trip_id as string) || (params.tripId as string) || '';

  const [loading, setLoading] = useState(true);
  const [pickupCode, setPickupCode] = useState('');
  const [codeVerified, setCodeVerified] = useState(false);
  const [tripId, setTripId] = useState(paramTripId);
  const [driverName, setDriverName] = useState('');
  const [driverArrived, setDriverArrived] = useState(false);

  // Pulse animation for the code digits
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.03, duration: 1500, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const loadCode = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    try {
      let resolvedTripId = tripId;

      // If no tripId passed, find active trip
      if (!resolvedTripId) {
        const activeRes = await fetch(
          `${BACKEND_URL}/api/trips/active/${encodeURIComponent(user.id)}`,
          { headers: getAuthHeaders() }
        );
        if (activeRes.ok) {
          const activeData = await activeRes.json();
          if (activeData?.active && activeData?.trip?.id) {
            resolvedTripId = activeData.trip.id;
            setTripId(resolvedTripId);
          }
        }
      }

      if (resolvedTripId) {
        const res = await fetch(`${BACKEND_URL}/api/trips/${resolvedTripId}`, {
          headers: getAuthHeaders(),
        });
        if (res.ok) {
          const trip = await res.json();
          const code = trip.pickup_code || trip.security_code || '';
          setPickupCode(String(code));
          setCodeVerified(Boolean(trip.pickup_code_verified || trip.security_code_verified));
          setDriverName(trip.driver_name || trip.driver_display_name || 'Your driver');
          setDriverArrived(['arrived', 'ongoing'].includes(trip.status));
        }
      }
    } catch { /* silent — show stale code */ }
    finally { setLoading(false); }
  }, [user?.id, tripId]);

  useEffect(() => { void loadCode(); }, [loadCode]);

  // Poll every 15s to detect when driver verifies
  useEffect(() => {
    const id = setInterval(() => void loadCode(), 15000);
    return () => clearInterval(id);
  }, [loadCode]);

  const digits = pickupCode.split('');

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#0A0F1E', '#0D2137']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.3, y: 1 }}
      />

      {/* Decorative glow */}
      <View style={styles.glowTop} />

      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-down" size={26} color="rgba(255,255,255,0.6)" />
          </TouchableOpacity>
          {codeVerified ? (
            <View style={styles.verifiedPill}>
              <Ionicons name="checkmark-circle" size={14} color="#00D46A" />
              <Text style={styles.verifiedPillText}>Confirmed by driver</Text>
            </View>
          ) : (
            <View style={styles.pendingPill}>
              <View style={styles.pendingDot} />
              <Text style={styles.pendingPillText}>Waiting for driver</Text>
            </View>
          )}
          <View style={{ width: 44 }} />
        </View>

        <Animated.View style={[styles.body, { opacity: fadeAnim }]}>
          {/* Icon */}
          <View style={styles.iconWrap}>
            {codeVerified ? (
              <LinearGradient
                colors={['#00D46A', '#00A854']}
                style={styles.iconCircle}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Ionicons name="checkmark" size={40} color="#FFF" />
              </LinearGradient>
            ) : (
              <LinearGradient
                colors={['#2563EB', '#1D4ED8']}
                style={styles.iconCircle}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Ionicons name="shield-checkmark" size={40} color="#FFF" />
              </LinearGradient>
            )}
          </View>

          <Text style={styles.title}>
            {codeVerified ? 'Rider Confirmed!' : 'Pick-Up Code'}
          </Text>
          <Text style={styles.subtitle}>
            {codeVerified
              ? 'Your driver has verified you. Trip starting now.'
              : `Show this code to ${driverName} to confirm your identity`}
          </Text>

          {/* Code display */}
          {loading ? (
            <ActivityIndicator color="#00D46A" size="large" style={{ marginVertical: 40 }} />
          ) : pickupCode ? (
            <Animated.View style={[styles.codeRow, { transform: [{ scale: pulseAnim }] }]}>
              {digits.map((d, i) => (
                <LinearGradient
                  key={i}
                  colors={codeVerified ? ['#00D46A', '#00A854'] : ['rgba(255,255,255,0.1)', 'rgba(255,255,255,0.06)']}
                  style={styles.digitBox}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <Text style={[styles.digitText, codeVerified && { color: '#FFF' }]}>{d}</Text>
                </LinearGradient>
              ))}
            </Animated.View>
          ) : (
            <View style={styles.noCodeWrap}>
              <Text style={styles.noCodeText}>No active trip found</Text>
            </View>
          )}

          {/* Status row */}
          {!codeVerified && pickupCode ? (
            <View style={styles.statusRow}>
              {driverArrived ? (
                <View style={[styles.statusChip, { borderColor: '#F59E0B22', backgroundColor: 'rgba(245,158,11,0.1)' }]}>
                  <Ionicons name="location" size={14} color="#F59E0B" />
                  <Text style={[styles.statusChipText, { color: '#F59E0B' }]}>Driver is at pickup</Text>
                </View>
              ) : (
                <View style={styles.statusChip}>
                  <Ionicons name="navigate" size={14} color="rgba(255,255,255,0.5)" />
                  <Text style={styles.statusChipText}>Driver on the way</Text>
                </View>
              )}
            </View>
          ) : null}

          {/* Instructions */}
          {!codeVerified && pickupCode && (
            <View style={styles.instructionCard}>
              <View style={styles.instructionRow}>
                <View style={styles.instructionNum}><Text style={styles.instructionNumText}>1</Text></View>
                <Text style={styles.instructionText}>Your driver will ask for this code</Text>
              </View>
              <View style={styles.instructionRow}>
                <View style={styles.instructionNum}><Text style={styles.instructionNumText}>2</Text></View>
                <Text style={styles.instructionText}>Show the 4 digits above — do not say it out loud</Text>
              </View>
              <View style={styles.instructionRow}>
                <View style={styles.instructionNum}><Text style={styles.instructionNumText}>3</Text></View>
                <Text style={styles.instructionText}>Trip starts automatically once confirmed</Text>
              </View>
            </View>
          )}

          <TouchableOpacity style={styles.backToTripBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={16} color="rgba(255,255,255,0.6)" />
            <Text style={styles.backToTripText}>Back to trip</Text>
          </TouchableOpacity>
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  glowTop: {
    position: 'absolute',
    top: -80,
    left: '25%',
    width: '50%',
    height: 200,
    borderRadius: 100,
    backgroundColor: '#2563EB',
    opacity: 0.12,
    transform: [{ scaleX: 2 }],
  },
  header: {
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
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifiedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,212,106,0.15)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(0,212,106,0.3)',
  },
  verifiedPillText: { fontSize: 12, fontWeight: '800', color: '#00D46A' },
  pendingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.07)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
  },
  pendingDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#FCD34D',
  },
  pendingPillText: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.6)' },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingBottom: 24,
  },
  iconWrap: { marginBottom: 24 },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 18,
    elevation: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FFF',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: 0.2,
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 36,
  },
  codeRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  digitBox: {
    width: 68,
    height: 80,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  digitText: {
    fontSize: 36,
    fontWeight: '900',
    color: '#FFF',
    letterSpacing: 2,
  },
  noCodeWrap: { paddingVertical: 40 },
  noCodeText: { fontSize: 15, color: 'rgba(255,255,255,0.4)', textAlign: 'center' },
  statusRow: { marginBottom: 24 },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  statusChipText: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.5)' },
  instructionCard: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 18,
    gap: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 28,
  },
  instructionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  instructionNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(37,99,235,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  instructionNumText: { fontSize: 12, fontWeight: '900', color: '#93C5FD' },
  instructionText: { flex: 1, fontSize: 14, color: 'rgba(255,255,255,0.6)', lineHeight: 20 },
  backToTripBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  backToTripText: { fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.4)' },
});

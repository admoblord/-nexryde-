/**
 * Pick-up code — rider shows 4-digit code to driver at pickup (arrived phase).
 * Real-time verification, vehicle check, tap-to-reveal privacy, keep-awake.
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
  Alert,
  RefreshControl,
  ScrollView,
  Image,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useAppStore } from '@/src/store/appStore';
import { useAuthedUserId } from '@/src/hooks/useAuthedUserId';
import { BACKEND_URL, getAuthHeaders } from '@/src/services/api';
import {
  RIDER_FINDING_SHEET_BORDER,
  RIDER_MAP_PRIMARY_CTA_GRADIENT,
} from '@/src/constants/riderRideChrome';
import { DOCK_TOP_RADIUS } from '@/src/components/driver/driverDockTheme';
import {
  useRiderTripRealtime,
  type RiderTripWsMessage,
} from '@/src/hooks/useRiderTripRealtime';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';

type DriverCard = {
  name: string;
  vehicle: string;
  plate: string;
  color: string;
  phone: string | null;
  profileImage: string | null;
};

const CODE_LEN = 4;

function maskDigit(_d: string, revealed: boolean): string {
  return revealed ? _d : '•';
}

export default function PickUpCodeScreen() {
  const router = useRouter();
  const { currentTrip, setCurrentTrip } = useAppStore();
  const { user, userId: riderId, canCallAuthedApi } = useAuthedUserId();
  const params = useLocalSearchParams();
  const paramTripId = (params.trip_id as string) || (params.tripId as string) || '';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pickupCode, setPickupCode] = useState('');
  const [codeVerified, setCodeVerified] = useState(false);
  const [tripId, setTripId] = useState(paramTripId);
  const [tripStatus, setTripStatus] = useState('');
  const [driver, setDriver] = useState<DriverCard | null>(null);
  const [codeRevealed, setCodeRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pickupAddress, setPickupAddress] = useState('');
  const [pickupCodeRequired, setPickupCodeRequired] = useState(true);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const successScale = useRef(new Animated.Value(0.85)).current;
  const verifiedHandledRef = useRef(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    if (!codeVerified) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.02, duration: 1400, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1400, useNativeDriver: true }),
        ]),
      ).start();
    }
  }, [codeVerified, fadeAnim, pulseAnim]);

  const onVerified = useCallback(() => {
    if (verifiedHandledRef.current) return;
    verifiedHandledRef.current = true;
    setCodeVerified(true);
    setCodeRevealed(true);
    deactivateKeepAwake();
    if (Platform.OS !== 'web') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    Animated.spring(successScale, {
      toValue: 1,
      useNativeDriver: true,
      tension: 68,
      friction: 7,
    }).start();
    setTimeout(() => {
      router.replace({
        pathname: '/rider/tracking',
        params: { tripId: tripId || paramTripId },
      } as any);
    }, 2400);
  }, [router, successScale, tripId, paramTripId]);

  const applyTripPayload = useCallback(
    (trip: Record<string, any>, statusPayload?: Record<string, any>) => {
      const required = trip.pickup_code_required !== false;
      setPickupCodeRequired(required);
      if (!required) {
        setPickupCode('');
        setTripStatus(String(trip.status || statusPayload?.status || ''));
        return;
      }
      const code = String(trip.pickup_code || trip.security_code || '');
      const verified = Boolean(trip.pickup_code_verified || trip.security_code_verified);
      setPickupCode(code);
      setTripStatus(String(trip.status || statusPayload?.status || ''));
      setPickupAddress(
        trip.pickup_location?.address ||
          (typeof trip.pickup === 'string' ? trip.pickup : '') ||
          '',
      );

      const di = statusPayload?.driver_info as Record<string, any> | undefined;
      setDriver({
        name:
          di?.name ||
          trip.driver_name ||
          trip.driver_display_name ||
          'Your driver',
        vehicle: di?.vehicle || di?.vehicle_model || trip.vehicle_model || 'Vehicle',
        plate: di?.plate || trip.vehicle_plate || '',
        color: di?.color || trip.vehicle_color || '',
        phone: di?.phone || null,
        profileImage: di?.profile_image || trip.driver_profile_image || null,
      });

      if (verified) onVerified();
    },
    [onVerified],
  );

  const loadCode = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!riderId) {
        setLoading(false);
        return;
      }
      if (!opts?.silent) setLoading(true);
      try {
        let resolvedTripId = tripId || paramTripId;

        if (!resolvedTripId) {
          const activeRes = await fetch(
            `${BACKEND_URL}/api/trips/active/${encodeURIComponent(riderId)}`,
            { headers: getAuthHeaders() },
          );
          if (activeRes.ok) {
            const activeData = await activeRes.json();
            if (activeData?.active && activeData?.trip?.id) {
              resolvedTripId = activeData.trip.id;
              setTripId(resolvedTripId);
            }
          }
        }

        if (!resolvedTripId) return;

        const [tripRes, statusRes] = await Promise.all([
          fetch(`${BACKEND_URL}/api/trips/${resolvedTripId}`, { headers: getAuthHeaders() }),
          fetch(`${BACKEND_URL}/api/trips/${resolvedTripId}/status`, {
            headers: getAuthHeaders(),
          }),
        ]);

        if (tripRes.ok) {
          const trip = await tripRes.json();
          const statusPayload = statusRes.ok ? await statusRes.json() : undefined;
          applyTripPayload(trip, statusPayload);
          if (currentTrip?.id === resolvedTripId) {
            setCurrentTrip({ ...currentTrip, ...trip });
          }
        }
      } catch {
        /* keep last known state */
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [riderId, tripId, paramTripId, applyTripPayload, currentTrip, setCurrentTrip],
  );

  useEffect(() => {
    void loadCode();
  }, [loadCode]);

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (codeVerified || !tripId) return;
    const ms = tripStatus === 'arrived' ? 3000 : tripStatus === 'accepted' ? 8000 : 12000;
    pollRef.current = setInterval(() => void loadCode({ silent: true }), ms);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [tripId, tripStatus, codeVerified, loadCode]);

  const handleWsUpdate = useCallback(
    (msg: RiderTripWsMessage) => {
      const t = msg.trip as Record<string, any> | undefined;
      if (t?.pickup_code_verified || t?.security_code_verified) {
        onVerified();
        return;
      }
      if (msg.status === 'ongoing') {
        onVerified();
        return;
      }
      if (t) applyTripPayload(t);
      if (msg.status) setTripStatus(msg.status);
    },
    [applyTripPayload, onVerified],
  );

  useRiderTripRealtime({
    riderId,
    enabled: Boolean(canCallAuthedApi && riderId && (tripId || paramTripId) && !codeVerified),
    watchTripId: tripId || paramTripId,
    onTripUpdate: handleWsUpdate,
  });

  useEffect(() => {
    if (codeVerified || !pickupCode) return;
    void activateKeepAwakeAsync('rider-pickup-code');
    return () => {
      void deactivateKeepAwake();
    };
  }, [codeVerified, pickupCode]);

  const cleanCode = pickupCode.replace(/\D/g, '').slice(0, CODE_LEN);
  const displayDigits =
    cleanCode.length === CODE_LEN
      ? cleanCode.split('')
      : [...cleanCode.split(''), ...Array(Math.max(0, CODE_LEN - cleanCode.length)).fill('')];

  const driverArrived = tripStatus === 'arrived';
  const tripStarted = tripStatus === 'ongoing' || codeVerified;
  const canShowCode = Boolean(pickupCode) && !codeVerified;

  const handleReveal = () => {
    if (codeRevealed || !canShowCode) return;
    setCodeRevealed(true);
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const handleCopy = async () => {
    if (!pickupCode || !codeRevealed) {
      Alert.alert(
        'Reveal code first',
        'Tap the code area to show digits, then you can copy if needed.',
      );
      return;
    }
    Alert.alert(
      'Copy pick-up code?',
      'Only paste this in a private message. Never post it publicly — anyone with the code could impersonate you.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Copy',
          onPress: async () => {
            await Clipboard.setStringAsync(pickupCode);
            setCopied(true);
            if (Platform.OS !== 'web') {
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
            setTimeout(() => setCopied(false), 2200);
          },
        },
      ],
    );
  };

  const handleCall = () => {
    if (!driver?.phone) {
      Alert.alert('Call unavailable', 'Your driver phone line opens during active trip phases.');
      return;
    }
    void Linking.openURL(`tel:${driver.phone}`);
  };

  const goTracking = () => {
    router.replace({
      pathname: '/rider/tracking',
      params: { tripId: tripId || paramTripId },
    } as any);
  };

  const stepIndex = codeVerified || tripStarted ? 3 : driverArrived ? 2 : tripStatus === 'accepted' ? 1 : 0;

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#060A14', '#0A1628', '#0D2137']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.4, y: 1 }}
      />
      <View style={styles.glowMint} pointerEvents="none" />
      <View style={styles.glowBlue} pointerEvents="none" />

      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => router.back()}
            accessibilityLabel="Close pick-up code"
          >
            <Ionicons name="chevron-down" size={26} color="rgba(255,255,255,0.65)" />
          </TouchableOpacity>
          {codeVerified ? (
            <View style={styles.pillOk}>
              <Ionicons name="checkmark-circle" size={14} color="#34F5B8" />
              <Text style={styles.pillOkTxt}>Driver confirmed you</Text>
            </View>
          ) : (
            <View style={styles.pillWait}>
              <View style={[styles.pillDot, driverArrived && styles.pillDotArrived]} />
              <Text style={styles.pillWaitTxt}>
                {driverArrived ? 'Driver at pickup' : 'Waiting for driver'}
              </Text>
            </View>
          )}
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => {
              setRefreshing(true);
              void loadCode({ silent: true });
            }}
            accessibilityLabel="Refresh trip"
          >
            <Ionicons name="refresh" size={22} color="rgba(255,255,255,0.55)" />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void loadCode({ silent: true });
              }}
              tintColor={COLORS.accentGreen}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={{ opacity: fadeAnim }}>
            {/* Progress */}
            <View style={styles.steps}>
              {['Matched', 'En route', 'At pickup', 'Verified'].map((label, i) => (
                <View key={label} style={styles.stepCol}>
                  <View
                    style={[
                      styles.stepDot,
                      i <= stepIndex && styles.stepDotOn,
                      i === stepIndex && !codeVerified && styles.stepDotCurrent,
                    ]}
                  />
                  <Text style={[styles.stepLbl, i <= stepIndex && styles.stepLblOn]}>{label}</Text>
                </View>
              ))}
            </View>

            {/* Driver + vehicle */}
            {driver && !loading ? (
              <View style={styles.driverShell}>
                <BlurView intensity={44} tint="dark" style={StyleSheet.absoluteFillObject} />
                <View style={styles.driverRow}>
                  {driver.profileImage ? (
                    <Image source={{ uri: driver.profileImage }} style={styles.driverAvatar} />
                  ) : (
                    <View style={styles.driverAvatarPh}>
                      <Text style={styles.driverAvatarLetter}>
                        {driver.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={styles.driverMeta}>
                    <Text style={styles.driverName} numberOfLines={1}>
                      {driver.name}
                    </Text>
                    <Text style={styles.driverVehicle} numberOfLines={2}>
                      {driver.vehicle}
                      {driver.color ? ` · ${driver.color}` : ''}
                    </Text>
                  </View>
                </View>
                {driver.plate ? (
                  <View style={styles.plateWrap}>
                    <Text style={styles.plateLabel}>Verify plate before sharing code</Text>
                    <Text style={styles.plateNum}>{driver.plate}</Text>
                  </View>
                ) : null}
                <View style={styles.driverActions}>
                  <TouchableOpacity style={styles.driverActionBtn} onPress={handleCall} activeOpacity={0.88}>
                    <Ionicons name="call" size={18} color={driver.phone ? '#022C22' : '#64748B'} />
                    <Text style={styles.driverActionTxt}>Call</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.driverActionBtn}
                    onPress={() =>
                      router.push({
                        pathname: '/chat',
                        params: { tripId: tripId || paramTripId },
                      } as any)
                    }
                    activeOpacity={0.88}
                  >
                    <Ionicons name="chatbubble-ellipses" size={18} color="#022C22" />
                    <Text style={styles.driverActionTxt}>Message</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.driverActionGhost} onPress={goTracking} activeOpacity={0.88}>
                    <Ionicons name="map-outline" size={18} color="#94A3B8" />
                    <Text style={styles.driverActionGhostTxt}>Map</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}

            {/* Hero */}
            <View style={styles.heroIcon}>
              {codeVerified ? (
                <Animated.View style={{ transform: [{ scale: successScale }] }}>
                  <LinearGradient
                    colors={[...RIDER_MAP_PRIMARY_CTA_GRADIENT]}
                    style={styles.heroCircle}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  >
                    <Ionicons name="checkmark" size={44} color="#022C22" />
                  </LinearGradient>
                </Animated.View>
              ) : (
                <LinearGradient
                  colors={['#1E3A5F', '#0F2744']}
                  style={styles.heroCircle}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <Ionicons name="keypad" size={40} color="#7DD3FC" />
                </LinearGradient>
              )}
            </View>

            <Text style={styles.title}>
              {codeVerified ? 'You\'re verified!' : driverArrived ? 'Share pick-up code' : 'Your pick-up code'}
            </Text>
            <Text style={styles.subtitle}>
              {codeVerified
                ? 'Your driver entered the code. Returning to live map…'
                : driverArrived
                  ? `Show these digits to ${driver?.name || 'your driver'} — only when you're at the vehicle.`
                  : `Code is ready. ${driver?.name || 'Your driver'} will ask for it when they arrive.`}
            </Text>

            {pickupAddress && !codeVerified ? (
              <View style={styles.pickupRow}>
                <Ionicons name="location" size={16} color="#34F5B8" />
                <Text style={styles.pickupTxt} numberOfLines={2}>
                  {pickupAddress}
                </Text>
              </View>
            ) : null}

            {/* Code */}
            {loading ? (
              <ActivityIndicator color="#34F5B8" size="large" style={styles.loader} />
            ) : !pickupCodeRequired ? (
              <View style={styles.offCard}>
                <Ionicons name="keypad-outline" size={40} color="#64748B" />
                <Text style={styles.offTitle}>Pickup code is off</Text>
                <Text style={styles.offSub}>
                  You turned off pickup codes in Settings. Your driver can start the trip without a
                  code — still verify their plate and name.
                </Text>
                <TouchableOpacity style={styles.offBtn} onPress={() => router.back()} activeOpacity={0.88}>
                  <Text style={styles.offBtnTxt}>Back to trip</Text>
                </TouchableOpacity>
              </View>
            ) : canShowCode ? (
              <TouchableOpacity
                activeOpacity={0.92}
                onPress={handleReveal}
                accessibilityRole="button"
                accessibilityLabel={
                  codeRevealed ? 'Pick-up code revealed' : 'Tap to reveal pick-up code'
                }
              >
                <Animated.View style={[styles.codeRow, { transform: [{ scale: pulseAnim }] }]}>
                  {displayDigits.map((d, i) => (
                    <LinearGradient
                      key={`${i}-${d}`}
                      colors={
                        codeRevealed
                          ? ['rgba(60,255,179,0.22)', 'rgba(60,255,179,0.08)']
                          : ['rgba(255,255,255,0.09)', 'rgba(255,255,255,0.04)']
                      }
                      style={[styles.digitBox, codeRevealed && styles.digitBoxRevealed]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                    >
                      <Text style={[styles.digitText, !codeRevealed && styles.digitHidden]}>
                        {maskDigit(d, codeRevealed)}
                      </Text>
                    </LinearGradient>
                  ))}
                </Animated.View>
                {!codeRevealed ? (
                  <View style={styles.revealHint}>
                    <Ionicons name="eye-outline" size={16} color="#94A3B8" />
                    <Text style={styles.revealHintTxt}>Tap to reveal · shield from shoulder surfers</Text>
                  </View>
                ) : (
                  <View style={styles.revealActions}>
                    <TouchableOpacity style={styles.copyBtn} onPress={() => void handleCopy()} activeOpacity={0.88}>
                      <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={16} color="#94A3B8" />
                      <Text style={styles.copyBtnTxt}>{copied ? 'Copied' : 'Copy code'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.hideBtn}
                      onPress={() => setCodeRevealed(false)}
                      activeOpacity={0.88}
                    >
                      <Ionicons name="eye-off-outline" size={16} color="#64748B" />
                      <Text style={styles.hideBtnTxt}>Hide</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </TouchableOpacity>
            ) : codeVerified ? null : (
              <View style={styles.noCode}>
                <Ionicons name="car-outline" size={32} color="rgba(255,255,255,0.25)" />
                <Text style={styles.noCodeTxt}>No active trip with a pick-up code</Text>
                <TouchableOpacity style={styles.noCodeBtn} onPress={() => router.replace('/(rider-tabs)/rider-home' as any)}>
                  <Text style={styles.noCodeBtnTxt}>Go to home</Text>
                </TouchableOpacity>
              </View>
            )}

            {!codeVerified && canShowCode ? (
              <View style={styles.tipsCard}>
                <Text style={styles.tipsTitle}>How it works</Text>
                <Tip n={1} text="Confirm the vehicle plate matches before revealing your code." />
                <Tip n={2} text="Let your driver type the code in their app — don't call it out loud." />
                <Tip n={3} text="Trip starts on the map once the driver verifies (usually a few seconds)." />
              </View>
            ) : null}

            {!codeVerified && tripStatus === 'accepted' && !driverArrived ? (
              <View style={styles.banner}>
                <Ionicons name="navigate" size={18} color="#38BDF8" />
                <Text style={styles.bannerTxt}>
                  Driver is still on the way. Keep this screen open or reopen from tracking when they arrive.
                </Text>
              </View>
            ) : null}

            <TouchableOpacity style={styles.backTrip} onPress={goTracking} activeOpacity={0.88}>
              <Ionicons name="map" size={16} color="rgba(255,255,255,0.5)" />
              <Text style={styles.backTripTxt}>Back to live map</Text>
            </TouchableOpacity>
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function Tip({ n, text }: { n: number; text: string }) {
  return (
    <View style={styles.tipRow}>
      <View style={styles.tipNum}>
        <Text style={styles.tipNumTxt}>{n}</Text>
      </View>
      <Text style={styles.tipTxt}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#060A14' },
  safe: { flex: 1 },
  glowMint: {
    position: 'absolute',
    top: -60,
    right: -40,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#34F5B8',
    opacity: 0.07,
  },
  glowBlue: {
    position: 'absolute',
    bottom: 120,
    left: -60,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#2563EB',
    opacity: 0.08,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  headerBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  pillOk: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(52,245,184,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(52,245,184,0.35)',
  },
  pillOkTxt: { fontSize: 12, fontWeight: '800', color: '#34F5B8' },
  pillWait: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  pillDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#FCD34D',
  },
  pillDotArrived: { backgroundColor: '#F59E0B' },
  pillWaitTxt: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.55)' },
  scroll: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xl,
    alignItems: 'center',
  },
  steps: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-between',
    marginBottom: SPACING.lg,
    paddingHorizontal: 4,
  },
  stepCol: { alignItems: 'center', flex: 1, gap: 6 },
  stepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  stepDotOn: { backgroundColor: '#34F5B8' },
  stepDotCurrent: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#F59E0B',
    backgroundColor: '#34F5B8',
  },
  stepLbl: {
    fontSize: 9,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.35)',
    textAlign: 'center',
  },
  stepLblOn: { color: 'rgba(255,255,255,0.75)' },
  driverShell: {
    width: '100%',
    borderRadius: DOCK_TOP_RADIUS,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: RIDER_FINDING_SHEET_BORDER,
    marginBottom: SPACING.lg,
    padding: SPACING.md,
    backgroundColor: 'rgba(8,11,22,0.5)',
  },
  driverRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  driverAvatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#1E293B' },
  driverAvatarPh: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverAvatarLetter: { fontSize: 20, fontWeight: '900', color: '#F8FAFC' },
  driverMeta: { flex: 1, minWidth: 0 },
  driverName: { fontSize: FONT_SIZE.md, fontWeight: '900', color: '#F8FAFC' },
  driverVehicle: { fontSize: FONT_SIZE.sm, color: '#94A3B8', marginTop: 2 },
  plateWrap: {
    marginTop: SPACING.md,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: 'rgba(52,245,184,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(52,245,184,0.22)',
    alignItems: 'center',
  },
  plateLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  plateNum: {
    fontSize: 26,
    fontWeight: '900',
    color: '#34F5B8',
    letterSpacing: 3,
  },
  driverActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: SPACING.md,
  },
  driverActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.accentGreen,
  },
  driverActionTxt: { fontSize: FONT_SIZE.sm, fontWeight: '800', color: '#022C22' },
  driverActionGhost: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  driverActionGhostTxt: { fontSize: FONT_SIZE.sm, fontWeight: '700', color: '#94A3B8' },
  heroIcon: { marginBottom: SPACING.md, marginTop: SPACING.xs },
  heroCircle: {
    width: 92,
    height: 92,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 26,
    fontWeight: '900',
    color: '#FFF',
    textAlign: 'center',
    letterSpacing: -0.3,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: SPACING.md,
    paddingHorizontal: 8,
  },
  pickupRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: SPACING.lg,
    paddingHorizontal: SPACING.sm,
    width: '100%',
  },
  pickupTxt: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: 'rgba(226,232,240,0.85)',
    lineHeight: 20,
  },
  loader: { marginVertical: 40 },
  codeRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
    justifyContent: 'center',
  },
  digitBox: {
    width: 64,
    height: 76,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  digitBoxRevealed: {
    borderColor: 'rgba(52,245,184,0.45)',
  },
  digitText: {
    fontSize: 34,
    fontWeight: '900',
    color: '#F8FAFC',
    letterSpacing: 1,
  },
  digitHidden: { color: 'rgba(248,250,252,0.35)', fontSize: 28 },
  revealHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: SPACING.lg,
  },
  revealHintTxt: { fontSize: 13, fontWeight: '600', color: '#94A3B8' },
  revealActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginBottom: SPACING.lg,
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  copyBtnTxt: { fontSize: 13, fontWeight: '700', color: '#94A3B8' },
  hideBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  hideBtnTxt: { fontSize: 13, fontWeight: '700', color: '#64748B' },
  noCode: { alignItems: 'center', paddingVertical: 36, gap: 12 },
  noCodeTxt: { fontSize: 15, color: 'rgba(255,255,255,0.45)', textAlign: 'center' },
  noCodeBtn: {
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: BORDER_RADIUS.xl,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  noCodeBtnTxt: { fontSize: 14, fontWeight: '800', color: '#E2E8F0' },
  tipsCard: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: SPACING.md,
    gap: 12,
  },
  tipsTitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '900',
    color: '#E2E8F0',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  tipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  tipNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(52,245,184,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipNumTxt: { fontSize: 12, fontWeight: '900', color: '#34F5B8' },
  tipTxt: { flex: 1, fontSize: 14, color: 'rgba(255,255,255,0.58)', lineHeight: 20 },
  banner: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: 'rgba(56,189,248,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.25)',
    marginBottom: SPACING.md,
  },
  bannerTxt: { flex: 1, fontSize: 13, fontWeight: '600', color: '#BAE6FD', lineHeight: 19 },
  backTrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    marginTop: SPACING.sm,
  },
  backTripTxt: { fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.45)' },
  offCard: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 20,
    marginTop: SPACING.md,
    borderRadius: BORDER_RADIUS.xl,
    backgroundColor: 'rgba(15,23,42,0.75)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: 12,
  },
  offTitle: { fontSize: 20, fontWeight: '900', color: '#F8FAFC' },
  offSub: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 21,
  },
  offBtn: {
    marginTop: 8,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 14,
    backgroundColor: 'rgba(52,245,184,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(52,245,184,0.35)',
  },
  offBtnTxt: { fontSize: 15, fontWeight: '800', color: '#34F5B8' },
});

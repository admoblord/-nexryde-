/**
 * Driver offline home — exact match to GO ONLINE redesign screenshot.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  ActivityIndicator,
  Animated,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { DRIVER_HOME_PAD } from '@/src/constants/driverHomeImprovedBrand';
import { useFlowLayout } from '@/src/constants/flowLayout';
import { useTabBottomPad } from '@/src/hooks/useBottomPad';
import { useAuthedUserId } from '@/src/hooks/useAuthedUserId';
import { getDriverStats } from '@/src/services/api';
import { NEXRYDE_MAP_STYLE } from '@/src/components/DriverLiveMapView';
import { TripProfileAvatar } from '@/src/components/TripProfileAvatar';
import { PrayerStripWidget } from '@/src/components/PrayerStripWidget';

/* ── Design tokens — exact match to screenshot ── */
const C = {
  bg: '#091830',          // deep navy blue background
  bgMid: '#0D2244',       // slightly lighter for gradient
  green: '#00E870',       // bright vivid GO ONLINE green
  greenGlow: '#00C85A',   // shadow/glow variant
  blue: '#0066FF',        // opportunities button blue
  yellow: '#FFD700',      // trial banner
  red: '#FF4444',         // OFFLINE label
  text: '#FFFFFF',
  muted: '#8B9CC0',       // muted text in cards
  cardBg: 'rgba(12,50,100,0.55)',   // stat card glassmorphic blue-teal
  cardBorder: 'rgba(40,120,200,0.22)',
  infoBg: '#0A2850',      // info card blue
  infoBorder: 'rgba(30,90,200,0.4)',
  mapToggleBg: 'rgba(8,22,50,0.92)',
  navy: '#0A1830',
} as const;

const PROMO_DISMISS_KEY = '@nexryde_driver_trial_promo_dismissed_v1';

export type DriverHomeEarnings = {
  today: number;
  trips: number;
  week: number;
  tripHoursToday?: number;
};

type Props = {
  driverCoords: { lat: number; lng: number; heading?: number } | null;
  earnings: DriverHomeEarnings;
  earningsLoading?: boolean;
  profileImageUri: string | null;
  faceImageUri?: string | null;
  driverRating: number;
  acceptanceRate?: number | null;
  surgeActive: boolean;
  surgePricing: { driver_message?: string; is_peak_window?: boolean; heatmap?: { top_zone?: string } } | null;
  driverApproved: boolean;
  trialReady: boolean;
  subscriptionStatus: string | null;
  trialTripsCompleted: number;
  trialTripsTarget: number;
  trialExtended: boolean;
  verificationStatus: string | null;
  simSwapAlert: boolean;
  toggling: boolean;
  onGoOnline: () => void;
  onFeatureHub: () => void;
  onHeatmap: () => void;
  onEarnings: () => void;
  onTrips: () => void;
  onProfile: () => void;
  onOpenSubscription: () => void;
  onDismissSimSwap: () => void;
  rideRequestModal: React.ReactNode;
  featureHubDrawer: React.ReactNode;
};

export function DriverHomeImproved({
  driverCoords,
  earnings,
  earningsLoading,
  profileImageUri,
  faceImageUri,
  driverRating,
  acceptanceRate: acceptanceRateProp,
  surgeActive,
  surgePricing,
  driverApproved,
  trialReady,
  subscriptionStatus,
  trialTripsCompleted,
  trialTripsTarget,
  trialExtended,
  verificationStatus,
  simSwapAlert,
  toggling,
  onGoOnline,
  onFeatureHub,
  onHeatmap,
  onEarnings,
  onTrips,
  onProfile,
  onOpenSubscription,
  onDismissSimSwap,
  rideRequestModal,
  featureHubDrawer,
}: Props) {
  const insets = useSafeAreaInsets();
  const tabPad = useTabBottomPad(8);
  const flow = useFlowLayout();
  const { userId: driverId } = useAuthedUserId();
  const mapRef = useRef<MapView | null>(null);
  const goPulse = useRef(new Animated.Value(1)).current;
  const livePulse = useRef(new Animated.Value(0.6)).current;

  const [promoDismissed, setPromoDismissed] = useState(false);
  const [mapExpanded, setMapExpanded] = useState(true);
  const [infoExpanded, setInfoExpanded] = useState(false);
  const [acceptanceRate, setAcceptanceRate] = useState<number | null>(
    acceptanceRateProp ?? null,
  );

  const mapHeight = Math.max(180, Math.round(flow.height * 0.24));

  useEffect(() => {
    AsyncStorage.getItem(PROMO_DISMISS_KEY).then((v) => {
      if (v === '1') setPromoDismissed(true);
    });
  }, []);

  useEffect(() => {
    if (acceptanceRateProp != null) { setAcceptanceRate(acceptanceRateProp); return; }
    if (!driverId) return;
    let cancelled = false;
    getDriverStats(driverId)
      .then((res) => {
        if (cancelled) return;
        const ar = Number(res.data?.acceptance_rate);
        if (Number.isFinite(ar) && ar >= 0) setAcceptanceRate(Math.round(ar));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [driverId, acceptanceRateProp]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(livePulse, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(livePulse, { toValue: 0.5, duration: 800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [livePulse]);

  useEffect(() => {
    if (!driverApproved || !trialReady) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(goPulse, { toValue: 1.015, duration: 1100, useNativeDriver: true }),
        Animated.timing(goPulse, { toValue: 1, duration: 1100, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [driverApproved, trialReady, goPulse]);

  const mapRegion = useMemo(
    () =>
      driverCoords
        ? { latitude: driverCoords.lat, longitude: driverCoords.lng, latitudeDelta: 0.055, longitudeDelta: 0.055 }
        : { latitude: 6.5244, longitude: 3.3792, latitudeDelta: 0.1, longitudeDelta: 0.1 },
    [driverCoords?.lat, driverCoords?.lng],
  );

  useEffect(() => {
    if (!driverCoords || !mapRef.current) return;
    mapRef.current.animateToRegion(
      { latitude: driverCoords.lat, longitude: driverCoords.lng, latitudeDelta: 0.055, longitudeDelta: 0.055 },
      480,
    );
  }, [driverCoords?.lat, driverCoords?.lng]);

  const trialRemaining = Math.max(0, trialTripsTarget - trialTripsCompleted);
  const showTrialPromo =
    driverApproved && subscriptionStatus === 'trial' && trialTripsTarget > 0 && !promoDismissed;

  const infoMessage = useMemo(() => {
    if (typeof surgePricing?.driver_message === 'string' && surgePricing.driver_message.trim()) {
      return surgePricing.driver_message.trim();
    }
    const zone = surgePricing?.heatmap?.top_zone;
    if (zone) return `High demand near ${zone} — open Heatmap to position for more trips`;
    if (surgeActive) return 'Surge is active — open Heatmap for the best zones';
    return 'Important Update: New safety guidelines are in effect for your area. Tap to learn more.';
  }, [surgePricing, surgeActive]);

  const handleDismissPromo = useCallback(async () => {
    setPromoDismissed(true);
    await AsyncStorage.setItem(PROMO_DISMISS_KEY, '1');
  }, []);

  const handleGoOnline = useCallback(() => {
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    onGoOnline();
  }, [onGoOnline]);

  const notApproved = !driverApproved;
  const needsSubscription = driverApproved && !trialReady;
  const profileReadyDot = driverApproved && trialReady;
  // Show a neutral placeholder until real stats load — never fake 5.0 / 100%.
  const ratingLabel = driverRating > 0 && driverRating <= 5 ? driverRating.toFixed(1) : '—';
  const acceptanceLabel = acceptanceRate != null && acceptanceRate > 0 ? `${acceptanceRate}%` : '—';

  return (
    <View style={styles.screen}>
      {/* Deep blue gradient background */}
      <LinearGradient
        colors={[C.bg, C.bgMid, C.bg]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />

      {/* ── Fixed Header ── */}
      <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
        <View style={styles.headerRow}>
          {/* Menu button — circular glass */}
          <TouchableOpacity
            style={styles.menuBtn}
            onPress={onFeatureHub}
            accessibilityLabel="Menu"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="menu" size={22} color={C.text} />
          </TouchableOpacity>

          {/* OFFLINE ✕ badge */}
          <View style={styles.offlineBadge}>
            <Text style={styles.offlineText}>OFFLINE</Text>
            <View style={styles.offlineX}>
              <Ionicons name="close" size={11} color="#fff" />
            </View>
          </View>

          {/* Profile avatar */}
          <TouchableOpacity onPress={onProfile} accessibilityLabel="Profile">
            <TripProfileAvatar
              size={46}
              role="driver"
              profileUri={profileImageUri}
              faceUri={faceImageUri}
              borderColor="#00E870"
              showOnlineDot={profileReadyDot}
              onlineDotColor="#00E870"
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Scrollable Content ── */}
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 72, paddingBottom: tabPad + 20 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* GO ONLINE — prominent top button */}
        {driverApproved && trialReady ? (
          <Animated.View style={{ transform: [{ scale: goPulse }] }}>
            <TouchableOpacity
              style={styles.goBtn}
              onPress={handleGoOnline}
              disabled={toggling}
              activeOpacity={0.88}
              accessibilityLabel="Go online"
            >
              {toggling ? (
                <ActivityIndicator color="#0A1830" size="large" />
              ) : (
                <>
                  <Ionicons name="arrow-up-right-box" size={24} color="#0A1830" />
                  <Text style={styles.goBtnText}>GO ONLINE</Text>
                </>
              )}
            </TouchableOpacity>
          </Animated.View>
        ) : notApproved ? (
          <View style={[styles.goBtn, styles.goBtnMuted]}>
            <Ionicons name="time-outline" size={22} color="#FFD700" />
            <Text style={styles.goBtnTextMuted}>Waiting for approval</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.goBtn, { backgroundColor: C.blue }]}
            onPress={() =>
              Alert.alert('Activate your account', 'Start your free trial to receive ride requests.', [
                { text: 'Later', style: 'cancel' },
                { text: 'Activate', onPress: onOpenSubscription },
              ])
            }
          >
            <Ionicons name="flash" size={22} color={C.text} />
            <Text style={[styles.goBtnText, { color: C.text }]}>Activate to drive</Text>
          </TouchableOpacity>
        )}

        {/* Stats — 3-column glassmorphic */}
        <View style={styles.statsRow}>
          {/* Trips */}
          <TouchableOpacity style={styles.statCard} onPress={onTrips} activeOpacity={0.82}>
            {Platform.OS !== 'web' ? (
              <BlurView intensity={18} tint="dark" style={StyleSheet.absoluteFillObject} />
            ) : null}
            <Ionicons name="car-sport-outline" size={20} color={C.muted} />
            <Text style={styles.statLabel}>Trips</Text>
            <Text style={styles.statValue}>{earningsLoading ? '…' : String(earnings.trips)}</Text>
            <Text style={styles.statSub}>Today</Text>
          </TouchableOpacity>

          {/* Rating */}
          <TouchableOpacity style={styles.statCard} onPress={onProfile} activeOpacity={0.82}>
            {Platform.OS !== 'web' ? (
              <BlurView intensity={18} tint="dark" style={StyleSheet.absoluteFillObject} />
            ) : null}
            <Ionicons name="star-outline" size={20} color={C.muted} />
            <Text style={styles.statLabel}>Rating</Text>
            <Text style={styles.statValue}>{ratingLabel}</Text>
            <Text style={styles.statSub}>Average</Text>
          </TouchableOpacity>

          {/* Acceptance */}
          <TouchableOpacity style={styles.statCard} onPress={onHeatmap} activeOpacity={0.82}>
            {Platform.OS !== 'web' ? (
              <BlurView intensity={18} tint="dark" style={StyleSheet.absoluteFillObject} />
            ) : null}
            <Ionicons name="checkmark-circle-outline" size={20} color="#00E870" />
            <Text style={styles.statLabel}>Acceptance</Text>
            <Text style={styles.statValue}>{acceptanceLabel}</Text>
            <Text style={styles.statSub}>Rate</Text>
          </TouchableOpacity>
        </View>

        {/* Collapsible map card */}
        <View style={styles.mapCard}>
          {mapExpanded ? (
            <View style={{ height: mapHeight, borderRadius: 14, overflow: 'hidden' }}>
              <MapView
                ref={mapRef}
                style={StyleSheet.absoluteFillObject}
                provider={PROVIDER_GOOGLE}
                customMapStyle={NEXRYDE_MAP_STYLE}
                initialRegion={mapRegion}
                scrollEnabled={false}
                zoomEnabled={false}
                pitchEnabled={false}
                rotateEnabled={false}
                showsUserLocation={false}
                showsMyLocationButton={false}
                showsCompass={false}
                showsTraffic
                liteMode={Platform.OS === 'android'}
              >
                {driverCoords ? (
                  <Marker coordinate={{ latitude: driverCoords.lat, longitude: driverCoords.lng }}>
                    <Animated.View style={[styles.mapMarker, { opacity: livePulse }]}>
                      <View style={styles.mapMarkerRing} />
                      <Ionicons name="navigate" size={24} color="#00E870" />
                    </Animated.View>
                  </Marker>
                ) : null}
              </MapView>
              {/* LIVE pill — top right, matching screenshot */}
              <View style={styles.livePill} pointerEvents="none">
                <Animated.View style={[styles.liveDot, { opacity: livePulse }]} />
                <Text style={styles.liveText}>LIVE</Text>
              </View>
            </View>
          ) : null}

          {/* Collapse / Expand toggle */}
          <TouchableOpacity
            style={styles.mapToggle}
            onPress={() => setMapExpanded(v => !v)}
            activeOpacity={0.8}
          >
            <Ionicons
              name={mapExpanded ? 'chevron-up' : 'chevron-down'}
              size={15}
              color={C.text}
            />
            <Text style={styles.mapToggleText}>
              {mapExpanded ? 'Collapse Map' : 'Expand Map'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* See ride opportunities */}
        <TouchableOpacity style={styles.opportunitiesBtn} onPress={onHeatmap} activeOpacity={0.88}>
          <Ionicons name="search" size={19} color={C.text} />
          <Text style={styles.opportunitiesTxt}>See ride opportunities</Text>
        </TouchableOpacity>

        {/* Free trial banner */}
        {showTrialPromo ? (
          <View style={styles.trialBanner}>
            <Text style={styles.trialText}>
              Free trial: {trialTripsCompleted}/{trialTripsTarget} • {trialRemaining} left
              {trialExtended ? ' • Extended' : ''}
            </Text>
            <TouchableOpacity
              onPress={handleDismissPromo}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityLabel="Dismiss trial banner"
            >
              <View style={styles.trialClose}>
                <Ionicons name="close" size={13} color={C.navy} />
              </View>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Info card — collapsible, matching screenshot exactly */}
        <TouchableOpacity
          style={styles.infoCard}
          onPress={() => setInfoExpanded(v => !v)}
          activeOpacity={0.88}
        >
          <Text style={styles.infoText} numberOfLines={infoExpanded ? undefined : 2}>
            {infoMessage}
          </Text>
          <Ionicons
            name={infoExpanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={C.muted}
          />
        </TouchableOpacity>

        {/* Approval / subscription / SIM-swap alerts */}
        {notApproved ? (
          <View style={styles.alertCard}>
            <Ionicons name="time-outline" size={20} color="#FFD700" />
            <View style={{ flex: 1 }}>
              <Text style={styles.alertTitle}>Verification pending</Text>
              <Text style={styles.alertBody}>
                {verificationStatus === 'pending'
                  ? 'Documents are being reviewed. You can drive once approved.'
                  : 'Complete verification to start receiving trips.'}
              </Text>
            </View>
          </View>
        ) : null}

        {needsSubscription ? (
          <TouchableOpacity style={styles.alertCard} onPress={onOpenSubscription} activeOpacity={0.88}>
            <Ionicons name="flash-outline" size={20} color={C.blue} />
            <View style={{ flex: 1 }}>
              <Text style={styles.alertTitle}>Activate trial</Text>
              <Text style={styles.alertBody}>Start your free trial to receive ride requests.</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={C.muted} />
          </TouchableOpacity>
        ) : null}

        {simSwapAlert ? (
          <View style={[styles.alertCard, { borderColor: 'rgba(255,68,68,0.4)' }]}>
            <Ionicons name="shield-half-outline" size={20} color={C.text} />
            <View style={{ flex: 1 }}>
              <Text style={styles.alertTitle}>Security alert</Text>
              <Text style={styles.alertBody}>New SIM detected. Contact support if this wasn't you.</Text>
            </View>
            <TouchableOpacity onPress={onDismissSimSwap} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={20} color={C.muted} />
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={{ marginTop: -4 }}>
          <PrayerStripWidget />
        </View>
      </ScrollView>

      {rideRequestModal}
      {featureHubDrawer}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },

  scrollContent: {
    paddingHorizontal: DRIVER_HOME_PAD,
    gap: 12,
  },

  // ── Header ───────────────────────────────────────────────────────
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: DRIVER_HOME_PAD,
    paddingBottom: 10,
  },
  menuBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  offlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  offlineText: {
    fontSize: 17,
    fontWeight: '900',
    color: C.red,
    letterSpacing: 1.5,
  },
  offlineX: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: C.red,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── GO ONLINE button ─────────────────────────────────────────────
  goBtn: {
    height: 72,
    borderRadius: 14,
    backgroundColor: C.green,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: C.greenGlow,
    shadowOpacity: 0.55,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  goBtnMuted: {
    backgroundColor: 'rgba(45,55,72,0.8)',
    shadowOpacity: 0,
    elevation: 0,
  },
  goBtnText: {
    fontSize: 20,
    fontWeight: '900',
    color: '#091830',
    letterSpacing: 1.5,
  },
  goBtnTextMuted: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFD700',
  },

  // ── Stats cards ──────────────────────────────────────────────────
  statsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statCard: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.cardBorder,
    backgroundColor: C.cardBg,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'flex-start',
    gap: 3,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: C.muted,
    marginTop: 6,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '900',
    color: C.text,
    letterSpacing: -0.5,
  },
  statSub: {
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(139,156,192,0.7)',
  },

  // ── Map card ─────────────────────────────────────────────────────
  mapCard: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(40,80,140,0.35)',
    backgroundColor: '#0A1830',
  },
  mapMarker: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,232,112,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#00E870',
  },
  mapMarkerRing: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: 'rgba(0,232,112,0.3)',
  },
  livePill: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#00E870',
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#091830',
  },
  liveText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#091830',
    letterSpacing: 0.8,
  },
  mapToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    backgroundColor: C.mapToggleBg,
  },
  mapToggleText: {
    fontSize: 13,
    fontWeight: '700',
    color: C.text,
  },

  // ── Opportunities button ─────────────────────────────────────────
  opportunitiesBtn: {
    height: 56,
    borderRadius: 14,
    backgroundColor: C.blue,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: C.blue,
    shadowOpacity: 0.4,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  opportunitiesTxt: {
    fontSize: 15,
    fontWeight: '800',
    color: C.text,
    letterSpacing: 0.3,
  },

  // ── Trial banner ─────────────────────────────────────────────────
  trialBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: C.yellow,
    borderRadius: 12,
    gap: 10,
  },
  trialText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    color: '#0A1830',
  },
  trialClose: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(10,24,48,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Info card ────────────────────────────────────────────────────
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: C.infoBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.infoBorder,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: C.text,
    lineHeight: 20,
  },

  // ── Alert cards ──────────────────────────────────────────────────
  alertCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(12,30,65,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(40,80,160,0.3)',
  },
  alertTitle: { fontSize: 14, fontWeight: '800', color: C.text },
  alertBody: { fontSize: 12, color: C.muted, marginTop: 4, lineHeight: 17 },
});

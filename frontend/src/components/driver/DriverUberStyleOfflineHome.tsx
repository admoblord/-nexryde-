/**
 * Modern e-hail driver Home (Uber / Bolt 2025–26 pattern):
 * - Map is the hero (full bleed, interactive)
 * - Floating glass chrome (menu · status · safety · profile)
 * - Persistent bottom sheet with earnings + huge pulsing GO
 * - Never shows "Checking your account" — approved fact → GO instantly;
 *   unknown status still shows GO (server validates on tap)
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
  StatusBar,
  ActivityIndicator,
  Alert,
  Platform,
  InteractionManager,
  Switch,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BRAND } from '@/src/constants/designSystem';
import { NEXRYDE_MAP_STYLE } from '@/src/constants/nexrydeMapBehavior';
import { useTabBottomPad } from '@/src/hooks/useBottomPad';
import { TripProfileAvatar } from '@/src/components/TripProfileAvatar';
import { resolvePublicMediaUri } from '@/src/utils/resolvePublicMediaUri';
import { TripMapErrorBoundary } from '@/src/components/TripMapErrorBoundary';
import { DriverGoOnlinePermissionGate } from '@/src/components/driver/DriverGoOnlinePermissionGate';
import type {
  DriverPermissionItem,
  DriverPermissionPreflight,
} from '@/src/services/driverPermissionPreflight';
import { splitTrialBannerForEmphasis } from '@/src/utils/driverTrialDisplay';
import { startupLog } from '@/src/utils/driverStartupTrace';

const LAGOS = {
  latitude: 6.5244,
  longitude: 3.3792,
  latitudeDelta: 0.045,
  longitudeDelta: 0.045,
} as const;

export type DriverUberStyleOfflineHomeProps = {
  driverCoords: { lat: number; lng: number; heading?: number } | null;
  profileImageUri: string | null;
  driverApproved: boolean;
  trialReady: boolean;
  subscriptionStatus: string | null;
  trialTripsCompleted: number;
  trialTripsTarget: number;
  trialDaysRemaining: number | null;
  trialDayLimit: number | null;
  trialEmphasis: 'trips' | 'days';
  earlySubscribeMessage: string;
  verificationStatus: string | null;
  toggling: boolean;
  todayEarnings: number;
  permissionPreflight: DriverPermissionPreflight | null;
  permissionRefreshing: boolean;
  onRefreshPermissions: () => void;
  onRequestPermission: (item: DriverPermissionItem) => void;
  onGoOnline: () => void;
  onFeatureHub: () => void;
  onShield: () => void;
  onHeatmap: () => void;
  onProfile: () => void;
  onOpenSubscription: () => void;
  onActivateTrial: () => void;
  rideRequestModal: React.ReactNode;
  featureHubDrawer: React.ReactNode;
  mapActive?: boolean;
};

function formatNaira(n: number): string {
  const v = Math.max(0, Math.round(Number(n) || 0));
  return `₦${v.toLocaleString('en-NG')}`;
}

export function DriverUberStyleOfflineHome({
  driverCoords,
  profileImageUri,
  driverApproved,
  trialReady,
  subscriptionStatus,
  trialTripsCompleted,
  trialTripsTarget,
  trialDaysRemaining,
  trialDayLimit,
  trialEmphasis,
  earlySubscribeMessage,
  verificationStatus,
  toggling,
  todayEarnings,
  permissionPreflight,
  permissionRefreshing,
  onRefreshPermissions,
  onRequestPermission,
  onGoOnline,
  onFeatureHub,
  onShield,
  onHeatmap,
  onProfile,
  onOpenSubscription,
  onActivateTrial,
  rideRequestModal,
  featureHubDrawer,
  mapActive = true,
}: DriverUberStyleOfflineHomeProps) {
  const insets = useSafeAreaInsets();
  const tabPad = useTabBottomPad(10);
  const mapRef = useRef<MapView | null>(null);
  const didCenter = useRef(false);
  const [mapEpoch, setMapEpoch] = useState(0);
  const [nativeMapEnabled, setNativeMapEnabled] = useState(
    () => mapActive && Platform.OS !== 'android',
  );
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);

  const goPulse = useRef(new Animated.Value(1)).current;
  const goRing = useRef(new Animated.Value(0)).current;

  const permissionsReady = !permissionPreflight || permissionPreflight.ready;
  const docsNotSubmitted = verificationStatus === 'not_submitted';
  const pendingExplicit =
    !driverApproved &&
    Boolean(verificationStatus) &&
    verificationStatus !== 'approved';
  const trialEnded = subscriptionStatus === 'pending_payment';
  const needsSubscription = driverApproved && !trialReady && subscriptionStatus != null;
  /** Approved can GO. Null (still syncing) allowed only when not explicitly incomplete. */
  const canGo =
    !pendingExplicit &&
    !docsNotSubmitted &&
    !needsSubscription &&
    (driverApproved || verificationStatus == null) &&
    (trialReady || verificationStatus == null || driverApproved) &&
    permissionsReady &&
    !toggling;

  const showTrial =
    driverApproved && subscriptionStatus === 'trial' && trialTripsTarget > 0;
  const trialParts = useMemo(
    () =>
      splitTrialBannerForEmphasis({
        completed: trialTripsCompleted,
        target: trialTripsTarget,
        daysRemaining: trialDaysRemaining,
        dayLimit: trialDayLimit,
        emphasis: trialEmphasis,
      }),
    [
      trialTripsCompleted,
      trialTripsTarget,
      trialDaysRemaining,
      trialDayLimit,
      trialEmphasis,
    ],
  );

  useEffect(() => {
    if (!mapActive) {
      setNativeMapEnabled(false);
      didCenter.current = false;
      return;
    }
    if (Platform.OS !== 'android') {
      setNativeMapEnabled(true);
      return;
    }
    let cancelled = false;
    const handle = InteractionManager.runAfterInteractions(() => {
      setTimeout(() => {
        if (cancelled) return;
        startupLog('DRIVER_HOME_MAP_MOUNT', { deferredMs: 700, screen: 'uber_style' });
        setNativeMapEnabled(true);
      }, 700);
    });
    return () => {
      cancelled = true;
      handle.cancel?.();
    };
  }, [mapActive]);

  useEffect(() => {
    if (driverCoords?.lat == null || driverCoords?.lng == null) return;
    setPin({ lat: driverCoords.lat, lng: driverCoords.lng });
  }, [driverCoords?.lat, driverCoords?.lng]);

  useEffect(() => {
    if (!nativeMapEnabled || !pin || !mapRef.current || didCenter.current) return;
    didCenter.current = true;
    mapRef.current.animateToRegion(
      {
        latitude: pin.lat,
        longitude: pin.lng,
        latitudeDelta: 0.04,
        longitudeDelta: 0.04,
      },
      420,
    );
  }, [nativeMapEnabled, pin]);

  useEffect(() => {
    if (!canGo) return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(goPulse, {
          toValue: 1.05,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(goPulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    const ring = Animated.loop(
      Animated.sequence([
        Animated.timing(goRing, {
          toValue: 1,
          duration: 1600,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(goRing, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    pulse.start();
    ring.start();
    return () => {
      pulse.stop();
      ring.stop();
    };
  }, [canGo, goPulse, goRing]);

  const handleGo = useCallback(() => {
    if (toggling) return;
    if (pendingExplicit) return;
    if (needsSubscription) {
      Alert.alert(
        trialEnded ? 'Trial ended' : 'Activate to drive',
        trialEnded
          ? 'Your free trial has ended. Subscribe to keep receiving trips.'
          : 'Start your free trial to receive ride requests.',
        [
          { text: 'Later', style: 'cancel' },
          {
            text: trialEnded ? 'Subscribe' : 'Activate Now',
            onPress: trialEnded ? onOpenSubscription : onActivateTrial,
          },
        ],
      );
      return;
    }
    if (!permissionsReady) {
      onRefreshPermissions();
      return;
    }
    onGoOnline();
  }, [
    toggling,
    pendingExplicit,
    needsSubscription,
    trialEnded,
    permissionsReady,
    onGoOnline,
    onOpenSubscription,
    onActivateTrial,
    onRefreshPermissions,
  ]);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Layer 1 — Map hero */}
      <View style={styles.mapStage}>
        <LinearGradient
          colors={['#070B14', '#101A2A', '#070B14']}
          style={StyleSheet.absoluteFillObject}
        />
        {nativeMapEnabled ? (
          <TripMapErrorBoundary
            key={`uber-home-map-${mapEpoch}`}
            onRetry={() => {
              didCenter.current = false;
              setNativeMapEnabled(false);
              setMapEpoch((n) => n + 1);
              setTimeout(() => setNativeMapEnabled(true), 400);
            }}
          >
            <MapView
              ref={mapRef}
              style={StyleSheet.absoluteFillObject}
              provider={PROVIDER_GOOGLE}
              customMapStyle={NEXRYDE_MAP_STYLE}
              initialRegion={LAGOS}
              scrollEnabled
              zoomEnabled
              pitchEnabled={false}
              rotateEnabled={false}
              showsUserLocation={false}
              showsMyLocationButton={false}
              showsCompass={false}
              showsPointsOfInterest={false}
              showsBuildings={false}
              showsTraffic={false}
              toolbarEnabled={false}
              liteMode={false}
              moveOnMarkerPress={false}
            >
              {pin ? (
                <Marker
                  coordinate={{ latitude: pin.lat, longitude: pin.lng }}
                  anchor={{ x: 0.5, y: 0.5 }}
                  tracksViewChanges={false}
                >
                  <View style={styles.youBeacon} collapsable={false}>
                    <View style={styles.youBeaconRing} />
                    <View style={styles.youBeaconCore} />
                  </View>
                </Marker>
              ) : null}
            </MapView>
          </TripMapErrorBoundary>
        ) : null}
        <LinearGradient
          colors={['rgba(7,11,20,0.72)', 'transparent', 'rgba(7,11,20,0.55)', 'rgba(7,11,20,0.96)']}
          locations={[0, 0.22, 0.55, 1]}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />
      </View>

      {/* Layer 2 — Floating top chrome */}
      <View style={[styles.topChrome, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <TouchableOpacity style={styles.glassBtn} onPress={onFeatureHub} activeOpacity={0.85}>
          <Ionicons name="menu" size={22} color="#F1F5F9" />
        </TouchableOpacity>

        <View style={styles.statusIsland}>
          <View style={[styles.statusDot, { backgroundColor: '#94A3B8' }]} />
          <Text style={styles.statusText}>You're offline</Text>
          <Switch
            value={false}
            onValueChange={(on) => {
              if (on) handleGo();
            }}
            disabled={!canGo && !needsSubscription}
            trackColor={{ false: 'rgba(148,163,184,0.35)', true: BRAND.primary }}
            thumbColor="#F8FAFC"
            ios_backgroundColor="rgba(148,163,184,0.35)"
          />
        </View>

        <View style={styles.topRight}>
          <TouchableOpacity style={styles.glassBtn} onPress={onShield} activeOpacity={0.85}>
            <Ionicons name="shield-checkmark" size={20} color="#38BDF8" />
          </TouchableOpacity>
          <TouchableOpacity onPress={onProfile} activeOpacity={0.85}>
            <TripProfileAvatar
              size={42}
              uri={resolvePublicMediaUri(profileImageUri)}
              borderColor="#FFFFFF"
              borderWidth={2}
              showOnlineDot
              onlineDotColor={driverApproved && trialReady ? BRAND.primary : '#64748B'}
              accessibilityLabel="Driver profile"
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Layer 3 — Bottom sheet */}
      <View style={[styles.sheetWrap, { paddingBottom: tabPad }]} pointerEvents="box-none">
        <View style={styles.sheet}>
          {Platform.OS === 'ios' ? (
            <BlurView intensity={28} tint="dark" style={StyleSheet.absoluteFillObject} />
          ) : (
            <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(12,18,30,0.94)' }]} />
          )}

          <View style={styles.sheetHandle} />

          <View style={styles.earningsRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.earningsLabel}>Today</Text>
              <Text style={styles.earningsValue}>{formatNaira(todayEarnings)}</Text>
            </View>
            <TouchableOpacity style={styles.demandChip} onPress={onHeatmap} activeOpacity={0.85}>
              <Ionicons name="flame" size={14} color={BRAND.primary} />
              <Text style={styles.demandChipText}>Demand</Text>
            </TouchableOpacity>
          </View>

          {showTrial ? (
            <TouchableOpacity
              style={styles.trialRow}
              onPress={onOpenSubscription}
              activeOpacity={0.85}
            >
              <View style={styles.trialDot} />
              <Text style={styles.trialText} numberOfLines={1}>
                {trialParts.prefix}
                {trialParts.tripsPart}
                {trialParts.separator}
                {trialParts.secondaryPart}
              </Text>
              <Ionicons name="chevron-forward" size={14} color="#64748B" />
            </TouchableOpacity>
          ) : null}

          {earlySubscribeMessage && showTrial ? (
            <Text style={styles.trialHint} numberOfLines={1}>
              {earlySubscribeMessage}
            </Text>
          ) : null}

          {pendingExplicit ? (
            <View style={styles.warnBanner}>
              <Ionicons
                name={docsNotSubmitted ? 'document-text-outline' : 'time-outline'}
                size={18}
                color="#FBBF24"
              />
              <Text style={styles.warnText}>
                {docsNotSubmitted
                  ? 'Complete your documents to unlock driver Home and go online.'
                  : 'Documents under review — rides unlock after approval.'}
              </Text>
            </View>
          ) : null}

          {needsSubscription ? (
            <TouchableOpacity
              style={styles.warnBanner}
              onPress={onOpenSubscription}
              activeOpacity={0.85}
            >
              <Ionicons
                name={trialEnded ? 'card-outline' : 'flash-outline'}
                size={18}
                color="#FBBF24"
              />
              <Text style={styles.warnText}>
                {trialEnded
                  ? 'Trial ended — subscribe to keep receiving trips.'
                  : 'Activate free trial to start receiving rides.'}
              </Text>
            </TouchableOpacity>
          ) : null}

          {(driverApproved || verificationStatus == null) && trialReady ? (
            <DriverGoOnlinePermissionGate
              preflight={permissionPreflight}
              refreshing={permissionRefreshing}
              onRefresh={onRefreshPermissions}
              onRequestItem={onRequestPermission}
            />
          ) : null}

          {/* Huge GO — Uber-style primary action */}
          <View style={styles.goStage}>
            {canGo ? (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.goRing,
                  {
                    opacity: goRing.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.45, 0],
                    }),
                    transform: [
                      {
                        scale: goRing.interpolate({
                          inputRange: [0, 1],
                          outputRange: [1, 1.35],
                        }),
                      },
                    ],
                  },
                ]}
              />
            ) : null}

            <Animated.View style={{ transform: [{ scale: canGo ? goPulse : 1 }] }}>
              <TouchableOpacity
                style={[
                  styles.goBtn,
                  !canGo && !needsSubscription && styles.goBtnMuted,
                  needsSubscription && styles.goBtnWarn,
                  pendingExplicit && styles.goBtnMuted,
                ]}
                onPress={handleGo}
                activeOpacity={0.9}
                disabled={toggling || pendingExplicit}
                accessibilityRole="button"
                accessibilityLabel={toggling ? 'Going online' : 'Go online'}
              >
                <LinearGradient
                  colors={
                    pendingExplicit
                      ? ['#334155', '#1E293B']
                      : needsSubscription
                        ? ['#F59E0B', '#D97706']
                        : canGo
                          ? ['#4ADE80', BRAND.primary, '#059669']
                          : ['#334155', '#1E293B']
                  }
                  start={{ x: 0.15, y: 0 }}
                  end={{ x: 0.9, y: 1 }}
                  style={styles.goGrad}
                >
                  {toggling ? (
                    <ActivityIndicator size="large" color="#022C22" />
                  ) : (
                    <>
                      <Text style={styles.goWord}>
                        {docsNotSubmitted
                          ? 'DOCS'
                          : pendingExplicit
                            ? 'WAIT'
                            : needsSubscription
                              ? trialEnded
                                ? 'PAY'
                                : 'START'
                              : !permissionsReady
                                ? 'SETUP'
                                : 'GO'}
                      </Text>
                      <Text style={styles.goSub}>
                        {docsNotSubmitted
                          ? 'Submit documents'
                          : pendingExplicit
                            ? 'Under review'
                            : needsSubscription
                              ? trialEnded
                                ? 'Subscribe'
                                : 'Activate trial'
                              : !permissionsReady
                                ? 'Grant permissions'
                                : toggling
                                  ? 'Connecting…'
                                  : 'Tap to go online'}
                      </Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>
          </View>
        </View>
      </View>

      {rideRequestModal}
      {featureHubDrawer}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#070B14' },
  mapStage: { ...StyleSheet.absoluteFillObject },
  youBeacon: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  youBeaconRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'rgba(34,225,128,0.45)',
    backgroundColor: 'rgba(34,225,128,0.12)',
  },
  youBeaconCore: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: BRAND.primary,
    borderWidth: 2,
    borderColor: '#FFF',
  },
  topChrome: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 5,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  glassBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(15,23,42,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusIsland: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.22)',
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#E2E8F0',
    letterSpacing: 0.1,
  },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sheetWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 6,
    paddingHorizontal: 12,
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 14,
    minHeight: 280,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(148,163,184,0.35)',
    marginBottom: 14,
  },
  earningsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  earningsLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  earningsValue: {
    marginTop: 2,
    fontSize: 28,
    fontWeight: '900',
    color: '#F8FAFC',
    letterSpacing: -0.5,
  },
  demandChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: 'rgba(34,225,128,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(34,225,128,0.28)',
  },
  demandChipText: { fontSize: 12, fontWeight: '800', color: '#D1FAE5' },
  trialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  trialDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: BRAND.primary,
  },
  trialText: { flex: 1, fontSize: 13, fontWeight: '700', color: '#CBD5E1' },
  trialHint: { fontSize: 11, fontWeight: '600', color: '#86EFAC', marginBottom: 8 },
  warnBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
    marginBottom: 10,
  },
  warnText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#FDE68A', lineHeight: 18 },
  goStage: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 4,
    minHeight: 148,
  },
  goRing: {
    position: 'absolute',
    width: 148,
    height: 148,
    borderRadius: 74,
    borderWidth: 3,
    borderColor: BRAND.primary,
  },
  goBtn: {
    width: 132,
    height: 132,
    borderRadius: 66,
    overflow: 'hidden',
    shadowColor: BRAND.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 12,
  },
  goBtnMuted: {
    shadowOpacity: 0.1,
    elevation: 2,
  },
  goBtnWarn: {
    shadowColor: '#F59E0B',
  },
  goGrad: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  goWord: {
    fontSize: 34,
    fontWeight: '900',
    color: '#022C22',
    letterSpacing: 1.5,
  },
  goSub: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(2,44,34,0.72)',
    textAlign: 'center',
  },
});

export default DriverUberStyleOfflineHome;

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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, alpha, type as TYPE, space, radius, shadow } from '@/src/theme/tokens';
import {
  getBoltRiderCustomMapStyle,
  getBoltRiderGoogleMapId,
} from '@/src/constants/boltMapStyle';
import { tripMapViewProps } from '@/src/components/trip/mapTreatment';
import { RecentreFab } from '@/src/components/trip/RecentreFab';
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
        latitudeDelta: 0.012,
        longitudeDelta: 0.012,
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

  const googleMapId = getBoltRiderGoogleMapId();
  const customMapStyle = getBoltRiderCustomMapStyle();

  const recenter = useCallback(() => {
    if (!mapRef.current || !pin) return;
    mapRef.current.animateToRegion(
      {
        latitude: pin.lat,
        longitude: pin.lng,
        latitudeDelta: 0.012,
        longitudeDelta: 0.012,
      },
      380,
    );
  }, [pin]);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      {/* Layer 1 — Map is the background, full bleed */}
      <View style={styles.mapStage}>
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
              googleMapId={googleMapId || undefined}
              customMapStyle={customMapStyle}
              initialRegion={LAGOS}
              scrollEnabled
              zoomEnabled
              {...tripMapViewProps}
              showsUserLocation={false}
              showsMyLocationButton={false}
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
      </View>

      {/* Layer 2 — Floating top chrome */}
      <View style={[styles.topChrome, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <TouchableOpacity style={styles.glassBtn} onPress={onFeatureHub} activeOpacity={0.85}>
          <Ionicons name="menu" size={22} color={colors.navy} />
        </TouchableOpacity>

        <View style={styles.statusIsland}>
          <View style={[styles.statusDot, { backgroundColor: colors.grey }]} />
          <Text style={styles.statusText}>You're offline</Text>
          <Switch
            value={false}
            onValueChange={(on) => {
              if (on) handleGo();
            }}
            disabled={!canGo && !needsSubscription}
            trackColor={{ false: colors.border, true: colors.green }}
            thumbColor={alpha.white}
            ios_backgroundColor={colors.border}
          />
        </View>

        <View style={styles.topRight}>
          <TouchableOpacity style={styles.glassBtn} onPress={onShield} activeOpacity={0.85}>
            <Ionicons name="shield-checkmark" size={20} color={colors.blue} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onProfile} activeOpacity={0.85}>
            <TripProfileAvatar
              size={42}
              uri={resolvePublicMediaUri(profileImageUri)}
              borderColor={alpha.white}
              borderWidth={2}
              showOnlineDot
              onlineDotColor={driverApproved && trialReady ? colors.green : colors.grey}
              accessibilityLabel="Driver profile"
            />
          </TouchableOpacity>
        </View>
      </View>

      <RecentreFab onPress={recenter} bottom={Math.max(300, tabPad + 268)} />

      {/* Layer 3 — Floating white sheet */}
      <View style={[styles.sheetWrap, { paddingBottom: tabPad }]} pointerEvents="box-none">
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />

          <View style={styles.earningsRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.earningsLabel}>Today</Text>
              <Text style={styles.earningsValue}>{formatNaira(todayEarnings)}</Text>
            </View>
            <TouchableOpacity style={styles.demandChip} onPress={onHeatmap} activeOpacity={0.85}>
              <Ionicons name="flame" size={14} color={colors.greenDark} />
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
              <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
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
                color={colors.amber}
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
                color={colors.amber}
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
                <View
                  style={[
                    styles.goGrad,
                    {
                      backgroundColor: pendingExplicit
                        ? colors.grey
                        : needsSubscription
                          ? colors.amber
                          : canGo
                            ? colors.green
                            : colors.grey,
                    },
                  ]}
                >
                  {toggling ? (
                    <ActivityIndicator size="large" color={colors.textOnGreen} />
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
                </View>
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
  root: { flex: 1, backgroundColor: colors.bgMuted },
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
    borderColor: alpha.greenRing,
    backgroundColor: alpha.greenSoft,
  },
  youBeaconCore: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.green,
    borderWidth: 2,
    borderColor: alpha.white,
  },
  topChrome: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 5,
    paddingHorizontal: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  glassBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
  },
  statusIsland: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingLeft: space.md,
    paddingRight: 6,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: {
    ...TYPE.caption,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  sheetWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 6,
  },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: space.xl,
    paddingTop: space.md,
    paddingBottom: space.md,
    minHeight: 280,
    ...shadow,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: space.md,
  },
  earningsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: space.md,
  },
  earningsLabel: {
    ...TYPE.label,
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
  earningsValue: {
    marginTop: 2,
    ...TYPE.display,
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  demandChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.md,
    paddingVertical: 9,
    borderRadius: radius.pill,
    backgroundColor: alpha.greenSoft,
    borderWidth: 1,
    borderColor: alpha.greenRing,
  },
  demandChipText: { ...TYPE.label, color: colors.greenDark },
  trialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginBottom: 6,
  },
  trialDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.green,
  },
  trialText: { flex: 1, ...TYPE.caption, fontWeight: '700', color: colors.textSecondary },
  trialHint: { ...TYPE.label, color: colors.greenDark, marginBottom: space.sm },
  warnBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: space.md,
    borderRadius: radius.button,
    backgroundColor: alpha.amberSoft,
    borderWidth: 1,
    borderColor: colors.amber,
    marginBottom: space.md,
  },
  warnText: { flex: 1, ...TYPE.caption, color: colors.textPrimary, lineHeight: 18 },
  goStage: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.sm,
    marginBottom: 4,
    minHeight: 148,
  },
  goRing: {
    position: 'absolute',
    width: 148,
    height: 148,
    borderRadius: 74,
    borderWidth: 3,
    borderColor: colors.green,
  },
  goBtn: {
    width: 132,
    height: 132,
    borderRadius: 66,
    overflow: 'hidden',
    ...shadow,
    shadowColor: colors.green,
    shadowOpacity: 0.28,
  },
  goBtnMuted: {
    shadowOpacity: 0.08,
    elevation: 2,
  },
  goBtnWarn: {
    shadowColor: colors.amber,
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
    color: colors.textOnGreen,
    letterSpacing: 1.5,
  },
  goSub: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '700',
    color: colors.textOnGreen,
    textAlign: 'center',
    opacity: 0.72,
  },
});

export default DriverUberStyleOfflineHome;

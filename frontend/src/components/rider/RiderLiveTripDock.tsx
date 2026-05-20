/**
 * Premium glassmorphic rider live-trip sheet — map-first tracking (Uber-style).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Platform,
  Animated,
  Easing,
  type ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING } from '@/src/constants/theme';
import { RIDER_MAP_PRIMARY_CTA_GRADIENT } from '@/src/constants/riderRideChrome';
import { RiderFavoriteIcon } from '@/src/components/rider/RiderFavoriteIcon';
import { formatDriverDisplayField } from '@/src/utils/tripCoords';
import { TripProfileAvatar } from '@/src/components/TripProfileAvatar';
import { driverAvatarSources } from '@/src/utils/tripProfilePhotos';
import { useETACountdown } from '@/src/hooks/useETACountdown';

const NEON = '#22C55E';
const GLASS_TOP = 'rgba(15, 23, 42, 0.88)';
const GLASS_BOT = 'rgba(15, 23, 42, 0.94)';

export type RiderLiveTripDockProps = {
  tripStatus: string;
  loading?: boolean;
  driverInfo: Record<string, any> | null;
  driverPickupApproach?: { min: number; km: number; meters: number } | null;
  identityConfirmed?: boolean;
  driverLocation?: unknown;
  driverMoving?: boolean;
  fareDisplay?: string | null;
  distanceKm?: number | null;
  etaMin?: number | null;
  serverEtaSeconds?: number | null;
  trackingStatus?: string | null;
  locationStale?: boolean;
  wsConnected?: boolean;
  durationMins?: number | null;
  pickupLabel: string;
  destinationLabel: string;
  callAllowed?: boolean;
  onCallDriver: () => void;
  onChatDriver: () => void;
  onShowPickupCode: () => void;
  pickupCodeEnabled?: boolean;
  onVerifyIdentity: () => void;
  onOpenTripDetails: () => void;
  onCancelRide: () => void;
  onHelp: () => void;
  onWallet: () => void;
  onShare: () => void;
  bottomInset: number;
  isFavoriteDriver?: boolean;
  onToggleFavorite?: () => void;
  favoriteLoading?: boolean;
  style?: ViewStyle;
};

type PhaseMeta = {
  statusLabel: string;
  accent: string;
};

function phaseMeta(status: string): PhaseMeta {
  switch (status) {
    case 'arrived':
      return { statusLabel: 'DRIVER ARRIVED', accent: '#FBBF24' };
    case 'ongoing':
      return { statusLabel: 'ON TRIP', accent: '#5EEAD4' };
    case 'accepted':
    default:
      return { statusLabel: 'DRIVER EN ROUTE', accent: NEON };
  }
}

function finiteApproach(
  a: NonNullable<RiderLiveTripDockProps['driverPickupApproach']>,
): { km: number; meters: number; min: number } | null {
  const km = Number(a.km);
  const meters = Number(a.meters);
  const min = Number(a.min);
  if (!Number.isFinite(km) || !Number.isFinite(meters) || !Number.isFinite(min)) return null;
  return { km, meters, min };
}

function StarRow({ rating }: { rating: number }) {
  const full = Math.min(5, Math.max(0, Math.round(rating)));
  return (
    <View style={star.row}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Ionicons
          key={i}
          name={i < full ? 'star' : 'star-outline'}
          size={14}
          color="#FBBF24"
        />
      ))}
      <Text style={star.val}>{rating.toFixed(1)}</Text>
    </View>
  );
}

function ActionTile({
  icon,
  label,
  onPress,
  disabled,
  highlight,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  highlight?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[tile.btn, highlight && tile.btnHi, disabled && tile.btnOff]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.88}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons
        name={icon}
        size={22}
        color={disabled ? '#64748B' : highlight ? NEON : '#E2E8F0'}
      />
      <Text style={[tile.lbl, highlight && tile.lblHi, disabled && tile.lblOff]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function RiderLiveTripDock({
  tripStatus,
  loading,
  driverInfo,
  driverPickupApproach,
  identityConfirmed,
  driverLocation,
  driverMoving,
  fareDisplay,
  distanceKm,
  etaMin,
  serverEtaSeconds = null,
  trackingStatus = null,
  locationStale = false,
  wsConnected = true,
  durationMins,
  pickupLabel,
  destinationLabel,
  callAllowed,
  onCallDriver,
  onChatDriver,
  onShowPickupCode,
  pickupCodeEnabled = true,
  onVerifyIdentity,
  onOpenTripDetails,
  onCancelRide,
  onHelp,
  onWallet,
  onShare,
  bottomInset,
  isFavoriteDriver,
  onToggleFavorite,
  favoriteLoading,
  style,
}: RiderLiveTripDockProps) {
  const [expanded, setExpanded] = useState(false);
  const slideUp = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  const status = String(tripStatus ?? '');
  const phase = phaseMeta(status);
  const liveEta = useETACountdown(serverEtaSeconds, trackingStatus);
  const approach =
    status === 'accepted' && driverPickupApproach ? finiteApproach(driverPickupApproach) : null;

  useEffect(() => {
    slideUp.setValue(0);
    Animated.timing(slideUp, {
      toValue: 1,
      duration: 480,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [slideUp, status]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const translateY = slideUp.interpolate({
    inputRange: [0, 1],
    outputRange: [120, 0],
  });
  const pulseOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.35],
  });
  const pulseScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.35],
  });

  const serverSynced =
    serverEtaSeconds != null && Number.isFinite(Number(serverEtaSeconds));

  const etaFallback =
    !serverSynced && etaMin != null && Number.isFinite(Number(etaMin))
      ? { min: Math.round(Number(etaMin)), km: 0, meters: 0 }
      : null;
  const approachMin =
    !serverSynced && approach ? approach.min : etaFallback?.min ?? null;

  const timerDisplay =
    liveEta.status === 'arrived'
      ? 'Here'
      : liveEta.mmSs && (serverSynced || status === 'accepted' || status === 'ongoing')
        ? liveEta.mmSs
        : !serverSynced && liveEta.headline !== '—'
          ? liveEta.headline
          : !serverSynced && approachMin != null
            ? String(approachMin)
            : '—';

  const showTimerUnit =
    !timerDisplay.includes(':') &&
    timerDisplay !== 'Here' &&
    timerDisplay !== '—' &&
    /^\d+$/.test(timerDisplay);

  const etaMinutesLabel = useMemo(() => {
    if (serverSynced && liveEta.etaSeconds != null && liveEta.etaSeconds > 0) {
      return Math.max(1, Math.ceil(liveEta.etaSeconds / 60));
    }
    if (liveEta.etaSeconds != null && liveEta.etaSeconds > 0) {
      return Math.max(1, Math.ceil(liveEta.etaSeconds / 60));
    }
    if (!serverSynced && approachMin != null) return approachMin;
    if (!serverSynced && etaMin != null) return Math.round(Number(etaMin));
    return null;
  }, [serverSynced, liveEta.etaSeconds, approachMin, etaMin]);

  const statusSubtext = useMemo(() => {
    if (locationStale) return 'Refreshing live location…';
    if (liveEta.status === 'arrived') return 'Meet your driver at the pickup point';
    if (liveEta.status === 'arriving') return 'Driver is almost at your pickup';
    if (status === 'ongoing') {
      return durationMins
        ? `About ${Math.round(Number(durationMins))} min trip · heading to destination`
        : 'Heading to your destination';
    }
    if (etaMinutesLabel != null) {
      const dist =
        distanceKm != null && Number.isFinite(Number(distanceKm))
          ? Number(distanceKm) < 1
            ? `${Math.round(Number(distanceKm) * 1000)} m away`
            : `${Number(distanceKm).toFixed(1)} km away`
          : null;
      return dist
        ? `Driver arriving in ${etaMinutesLabel} min · ${dist}`
        : `Driver arriving in ${etaMinutesLabel} minute${etaMinutesLabel === 1 ? '' : 's'}`;
    }
    if (status === 'accepted' && driverLocation) {
      return driverMoving ? 'Driver is moving toward you' : 'Driver is nearby';
    }
    return liveEta.subline || 'Live updates on the map';
  }, [
    locationStale,
    liveEta.status,
    liveEta.subline,
    status,
    durationMins,
    etaMinutesLabel,
    distanceKm,
    driverLocation,
    driverMoving,
  ]);

  const driverName = formatDriverDisplayField(driverInfo?.name) || 'Your driver';
  const vehicle = formatDriverDisplayField(driverInfo?.vehicle) || 'Vehicle';
  const color = formatDriverDisplayField(driverInfo?.color);
  const plate = formatDriverDisplayField(driverInfo?.plate);
  const ratingNum = Number(driverInfo?.rating ?? driverInfo?.avg_rating ?? NaN);
  const driverPhotos = driverAvatarSources(driverInfo);
  const callOk = Boolean(callAllowed && driverInfo?.phone);
  const cancelLabel = status === 'ongoing' ? 'Close tracking' : 'Cancel ride';

  const showSecurity =
    (status === 'accepted' && !identityConfirmed) ||
    (status === 'arrived' && pickupCodeEnabled);

  return (
    <Animated.View
      style={[s.root, { paddingBottom: Math.max(bottomInset, 10), transform: [{ translateY }] }, style]}
      pointerEvents="box-none"
    >
      <View style={s.shell}>
        {Platform.OS === 'ios' ? (
          <BlurView intensity={72} tint="dark" style={StyleSheet.absoluteFillObject} />
        ) : null}
        <LinearGradient colors={[GLASS_TOP, GLASS_BOT]} style={StyleSheet.absoluteFillObject} />
        <View style={s.topAccent} pointerEvents="none" />

        {loading && !driverInfo ? (
          <View style={s.loadingRow}>
            <ActivityIndicator size="small" color={NEON} />
            <Text style={s.loadingTxt}>Connecting to your driver…</Text>
          </View>
        ) : (
          <ScrollView
            style={s.scroll}
            contentContainerStyle={s.scrollInner}
            showsVerticalScrollIndicator={false}
            bounces={false}
            nestedScrollEnabled
          >
            <View style={s.statusRow}>
              <View style={s.statusBadge}>
                <Animated.View
                  style={[
                    s.liveDot,
                    wsConnected && !locationStale
                      ? { opacity: pulseOpacity, transform: [{ scale: pulseScale }] }
                      : { opacity: locationStale ? 0.45 : 0.9 },
                  ]}
                />
                <Text style={[s.statusLabel, { color: phase.accent }]}>{phase.statusLabel}</Text>
              </View>
              {!wsConnected || locationStale ? (
                <Text style={s.connHint}>{locationStale ? 'Updating…' : 'Connecting…'}</Text>
              ) : null}
            </View>

            <View style={s.timerBlock}>
              <Text style={s.timer} accessibilityLabel={`Estimated arrival ${timerDisplay}`}>
                {timerDisplay}
              </Text>
              {showTimerUnit ? <Text style={s.timerUnit}>min</Text> : null}
            </View>
            <Text style={s.statusSub} numberOfLines={2}>
              {statusSubtext}
            </Text>

            {status === 'accepted' &&
            distanceKm != null &&
            Number.isFinite(Number(distanceKm)) ? (
              <View style={s.distanceRow}>
                <Text style={s.distanceLabel}>Distance to pickup</Text>
                <Text style={s.distanceValue}>
                  {Number(distanceKm) < 1
                    ? `${Math.round(Number(distanceKm) * 1000)} m`
                    : `${Number(distanceKm).toFixed(1)} km`}
                </Text>
              </View>
            ) : null}

            <View style={s.divider} />

            {!driverInfo && loading ? (
              <View style={s.driverRow}>
                <View style={s.skelAvatar} />
                <View style={s.driverMid}>
                  <View style={[s.skelLine, { width: '55%', height: 16 }]} />
                  <View style={[s.skelLine, { width: '80%', height: 12, marginTop: 8 }]} />
                </View>
              </View>
            ) : (
              <View style={s.driverRow}>
                <TripProfileAvatar
                  size={56}
                  faceUri={driverPhotos.face}
                  profileUri={driverPhotos.profile}
                  borderColor={NEON}
                  accessibilityLabel={`Photo of ${driverName}`}
                  showOnlineDot={wsConnected && !locationStale}
                />
                <View style={s.driverMid}>
                  <Text style={s.driverName} numberOfLines={1}>
                    {driverName}
                  </Text>
                  <Text style={s.vehicleLine} numberOfLines={2}>
                    {[vehicle, color].filter(Boolean).join(' · ') || 'Vehicle'}
                  </Text>
                  {plate ? <Text style={s.plateInline}>{plate}</Text> : null}
                </View>
                {Number.isFinite(ratingNum) ? (
                  <View style={s.rateBox}>
                    <StarRow rating={ratingNum} />
                  </View>
                ) : null}
                {onToggleFavorite ? (
                  <RiderFavoriteIcon
                    size={34}
                    filled={!!isFavoriteDriver}
                    onPress={onToggleFavorite}
                    disabled={favoriteLoading || isFavoriteDriver}
                  />
                ) : null}
              </View>
            )}

            <View style={s.actions}>
              <ActionTile icon="call" label="Call" onPress={onCallDriver} disabled={!callOk} />
              <ActionTile icon="chatbubble" label="Message" onPress={onChatDriver} highlight />
              <ActionTile icon="share-social" label="Share" onPress={onShare} />
            </View>

            {pickupCodeEnabled && status === 'arrived' ? (
              <TouchableOpacity style={s.primaryCtaWrap} onPress={onShowPickupCode} activeOpacity={0.92}>
                <LinearGradient
                  colors={[...RIDER_MAP_PRIMARY_CTA_GRADIENT]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={s.primaryCta}
                >
                  <Ionicons name="keypad" size={20} color="#022C22" />
                  <Text style={s.primaryCtaTxt}>Show pickup code</Text>
                </LinearGradient>
              </TouchableOpacity>
            ) : null}

            {showSecurity ? (
              <TouchableOpacity
                style={s.securityBox}
                onPress={status === 'arrived' ? onShowPickupCode : onVerifyIdentity}
                activeOpacity={0.9}
                accessibilityRole="button"
              >
                <View style={s.securityIcon}>
                  <Ionicons name="shield-checkmark" size={16} color={NEON} />
                </View>
                <View style={s.securityCopy}>
                  <Text style={s.securityTitle}>Verify driver before you get in</Text>
                  <Text style={s.securitySub}>
                    Check the license plate, car details, and driver photo
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#64748B" />
              </TouchableOpacity>
            ) : null}

            {fareDisplay ? (
              <View style={s.fareRow}>
                <Text style={s.fareLbl}>Trip fare</Text>
                <Text style={s.fareVal}>{fareDisplay}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={s.moreRow}
              onPress={() => setExpanded((v) => !v)}
              activeOpacity={0.85}
            >
              <Text style={s.moreLbl}>{expanded ? 'Less' : 'Trip info & safety'}</Text>
              <Ionicons name={expanded ? 'chevron-down' : 'chevron-up'} size={18} color="#94A3B8" />
            </TouchableOpacity>

            {expanded ? (
              <View style={s.expandBlock}>
                <View style={s.routeCard}>
                  <RouteLine color={NEON} tag="Pickup" addr={pickupLabel} />
                  <View style={s.routeGap} />
                  <RouteLine color="#EF4444" tag="Drop-off" addr={destinationLabel} />
                </View>
                <View style={s.utilRow}>
                  <UtilChip icon="headset-outline" label="Help" onPress={onHelp} />
                  <UtilChip icon="wallet-outline" label="Wallet" onPress={onWallet} />
                </View>
                <TouchableOpacity style={s.detailsLink} onPress={onOpenTripDetails} activeOpacity={0.88}>
                  <Ionicons name="shield-outline" size={18} color={NEON} />
                  <Text style={s.detailsLinkTxt}>Trip details, recording & emergency</Text>
                  <Ionicons name="chevron-forward" size={16} color="#64748B" />
                </TouchableOpacity>
              </View>
            ) : null}

            <TouchableOpacity style={s.cancelBtn} onPress={onCancelRide} activeOpacity={0.88}>
              <Text style={s.cancelTxt}>{cancelLabel}</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
      </View>
    </Animated.View>
  );
}

function RouteLine({ color, tag, addr }: { color: string; tag: string; addr: string }) {
  return (
    <View style={s.routeLine}>
      <View style={[s.routeDot, { backgroundColor: color }]} />
      <View style={{ flex: 1 }}>
        <Text style={s.routeTag}>{tag}</Text>
        <Text style={s.routeAddr}>{addr}</Text>
      </View>
    </View>
  );
}

function UtilChip({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={s.utilChip} onPress={onPress} activeOpacity={0.85}>
      <Ionicons name={icon} size={18} color={NEON} />
      <Text style={s.utilChipTxt}>{label}</Text>
    </TouchableOpacity>
  );
}

export function RiderLiveTripDockFade({ height = 240 }: { height?: number }) {
  return (
    <LinearGradient
      colors={['rgba(15,23,42,0)', 'rgba(15,23,42,0.25)', 'rgba(15,23,42,0.72)']}
      locations={[0, 0.45, 1]}
      style={[s.fade, { height }]}
      pointerEvents="none"
    />
  );
}

const star = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  val: { fontSize: 13, fontWeight: '800', color: '#FBBF24', marginLeft: 4 },
});

const tile = StyleSheet.create({
  btn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  btnHi: {
    backgroundColor: 'rgba(34,197,94,0.14)',
    borderColor: NEON,
  },
  btnOff: { opacity: 0.42 },
  lbl: { fontSize: 12, fontWeight: '600', color: '#E5E7EB' },
  lblHi: { color: NEON, fontWeight: '700' },
  lblOff: { color: '#64748B' },
});

const s = StyleSheet.create({
  root: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 40,
    maxHeight: '68%',
  },
  fade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 35,
  },
  shell: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    borderTopWidth: 1,
    borderColor: 'rgba(34,197,94,0.22)',
    maxHeight: '100%',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.5,
        shadowRadius: 28,
        shadowOffset: { width: 0, height: -10 },
      },
      android: { elevation: 20 },
    }),
  },
  topAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: 'rgba(34,197,94,0.35)',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 40,
  },
  loadingTxt: { fontSize: 14, fontWeight: '600', color: '#9CA3AF' },
  scroll: { maxHeight: 520 },
  scrollInner: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: SPACING.md,
    gap: 0,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    gap: 10,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: NEON,
  },
  statusLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.1,
  },
  connHint: { fontSize: 11, fontWeight: '600', color: '#64748B' },
  timerBlock: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 4,
    marginTop: 4,
  },
  timer: {
    fontSize: 72,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -2,
    lineHeight: 76,
    fontVariant: ['tabular-nums'],
  },
  timerUnit: {
    fontSize: 22,
    fontWeight: '700',
    color: '#9CA3AF',
    marginBottom: 14,
  },
  distanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 12,
  },
  distanceLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#9CA3AF',
  },
  distanceValue: {
    fontSize: 16,
    fontWeight: '700',
    color: NEON,
  },
  statusSub: {
    fontSize: 16,
    fontWeight: '500',
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 18,
    lineHeight: 22,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginBottom: 18,
  },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 18,
  },
  skelAvatar: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: 'rgba(148,163,184,0.15)',
  },
  skelLine: { borderRadius: 6, backgroundColor: 'rgba(148,163,184,0.12)' },
  driverMid: { flex: 1, minWidth: 0, gap: 4 },
  driverName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  vehicleLine: { fontSize: 13, color: '#9CA3AF', lineHeight: 18 },
  plateInline: {
    fontSize: 12,
    fontWeight: '800',
    color: '#CBD5E1',
    letterSpacing: 0.8,
    marginTop: 2,
  },
  rateBox: {
    backgroundColor: 'rgba(251,191,36,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  primaryCtaWrap: { borderRadius: 14, overflow: 'hidden', marginBottom: 12 },
  primaryCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 15,
  },
  primaryCtaTxt: { fontSize: 16, fontWeight: '800', color: '#022C22' },
  securityBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(34,197,94,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.28)',
    marginBottom: 12,
  },
  securityIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(34,197,94,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  securityCopy: { flex: 1, gap: 3 },
  securityTitle: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },
  securitySub: { fontSize: 12, color: '#9CA3AF', lineHeight: 17 },
  fareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    marginBottom: 4,
  },
  fareLbl: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  fareVal: { fontSize: 16, fontWeight: '800', color: NEON },
  moreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  moreLbl: { fontSize: 13, fontWeight: '700', color: '#94A3B8' },
  expandBlock: { gap: 12, marginBottom: 4 },
  routeCard: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  routeLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  routeDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  routeGap: { height: 14, marginLeft: 4 },
  routeTag: { fontSize: 10, fontWeight: '800', color: '#64748B', letterSpacing: 0.5 },
  routeAddr: { fontSize: 14, fontWeight: '600', color: '#E2E8F0', lineHeight: 20 },
  utilRow: { flexDirection: 'row', gap: 10 },
  utilChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  utilChipTxt: { fontSize: 13, fontWeight: '700', color: '#CBD5E1' },
  detailsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  detailsLinkTxt: { flex: 1, fontSize: 14, fontWeight: '700', color: '#E2E8F0' },
  cancelBtn: { alignItems: 'center', paddingVertical: 14, marginTop: 4 },
  cancelTxt: { fontSize: 15, fontWeight: '700', color: COLORS.error },
});

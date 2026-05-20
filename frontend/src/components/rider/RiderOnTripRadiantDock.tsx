/**
 * Radiant glassmorphic "On Trip" bottom sheet — progress, speed, stats, backend-synced ETA.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  Animated,
  Easing,
  type ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SPACING } from '@/src/constants/theme';
import { formatDriverDisplayField } from '@/src/utils/tripCoords';
import { TripProfileAvatar } from '@/src/components/TripProfileAvatar';
import { driverAvatarSources } from '@/src/utils/tripProfilePhotos';
import { useETACountdown } from '@/src/hooks/useETACountdown';
import {
  formatEtaClockFromSeconds,
  formatTripMinutesLabel,
  journeyProgressPercent,
  speedGaugeTint,
} from '@/src/utils/onTripDisplay';

const NEON = '#22C55E';
const CYAN = '#06B6D4';
const GLASS_TOP = 'rgba(15, 23, 42, 0.9)';
const GLASS_BOT = 'rgba(15, 23, 42, 0.96)';

export type RiderOnTripRadiantDockProps = {
  loading?: boolean;
  driverInfo: Record<string, any> | null;
  fareDisplay?: string | null;
  totalTripKm?: number | null;
  distanceRemainingKm?: number | null;
  speedKmh?: number | null;
  serverEtaSeconds?: number | null;
  trackingStatus?: string | null;
  locationStale?: boolean;
  wsConnected?: boolean;
  callAllowed?: boolean;
  onCallDriver: () => void;
  onChatDriver: () => void;
  onShare: () => void;
  onOpenTripDetails: () => void;
  bottomInset: number;
  style?: ViewStyle;
};

function SpeedGauge({ speedKmh }: { speedKmh: number }) {
  const tint = speedGaugeTint(speedKmh);
  const pct = Math.min(1, Math.max(0, speedKmh / 90));
  return (
    <View style={gauge.wrap} accessibilityLabel={`Speed ${Math.round(speedKmh)} kilometers per hour`}>
      <Ionicons name="speedometer-outline" size={18} color={tint} />
      <View style={gauge.track}>
        <View style={[gauge.fill, { width: `${pct * 100}%`, backgroundColor: tint }]} />
      </View>
    </View>
  );
}

function StatCell({
  icon,
  iconColor,
  label,
  value,
  valueColor,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={stat.cell}>
      <Ionicons name={icon} size={18} color={iconColor} />
      <Text style={stat.lbl}>{label}</Text>
      <Text style={[stat.val, valueColor ? { color: valueColor } : null]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

export function RiderOnTripRadiantDock({
  loading,
  driverInfo,
  fareDisplay,
  totalTripKm,
  distanceRemainingKm,
  speedKmh = null,
  serverEtaSeconds = null,
  trackingStatus = null,
  locationStale = false,
  wsConnected = true,
  callAllowed,
  onCallDriver,
  onChatDriver,
  onShare,
  onOpenTripDetails,
  bottomInset,
  style,
}: RiderOnTripRadiantDockProps) {
  const slideUp = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;

  const liveEta = useETACountdown(serverEtaSeconds, trackingStatus);
  const progressPct = journeyProgressPercent(totalTripKm, distanceRemainingKm);

  const speed = useMemo(() => {
    const s = Number(speedKmh);
    return Number.isFinite(s) && s >= 0 ? Math.round(s) : null;
  }, [speedKmh]);

  const etaClock = formatEtaClockFromSeconds(liveEta.etaSeconds);
  const timerMain = formatTripMinutesLabel(liveEta.etaSeconds);

  const totalKmLabel = useMemo(() => {
    const t = Number(totalTripKm);
    if (Number.isFinite(t) && t > 0) return `${t.toFixed(1)} km`;
    const r = Number(distanceRemainingKm);
    if (Number.isFinite(r) && r > 0) return `${r.toFixed(1)} km`;
    return '—';
  }, [totalTripKm, distanceRemainingKm]);

  useEffect(() => {
    slideUp.setValue(0);
    Animated.timing(slideUp, {
      toValue: 1,
      duration: 560,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [slideUp]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1400, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 2200, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 2200, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [glow]);

  const translateY = slideUp.interpolate({ inputRange: [0, 1], outputRange: [140, 0] });
  const pulseOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.35] });
  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.4] });
  const borderGlow = glow.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] });

  const driverName = formatDriverDisplayField(driverInfo?.name) || 'Your driver';
  const vehicle = formatDriverDisplayField(driverInfo?.vehicle) || 'Vehicle';
  const color = formatDriverDisplayField(driverInfo?.color);
  const plate = formatDriverDisplayField(driverInfo?.plate);
  const ratingNum = Number(driverInfo?.rating ?? driverInfo?.avg_rating ?? NaN);
  const driverPhotos = driverAvatarSources(driverInfo);
  const callOk = Boolean(callAllowed && driverInfo?.phone);

  return (
    <Animated.View
      style={[s.root, { paddingBottom: Math.max(bottomInset, 10), transform: [{ translateY }] }, style]}
      pointerEvents="box-none"
    >
      <View style={s.shell}>
        {Platform.OS === 'ios' ? (
          <BlurView intensity={78} tint="dark" style={StyleSheet.absoluteFillObject} />
        ) : null}
        <LinearGradient colors={[GLASS_TOP, GLASS_BOT]} style={StyleSheet.absoluteFillObject} />

        <Animated.View style={[s.borderGlow, { opacity: borderGlow }]} pointerEvents="none">
          <LinearGradient
            colors={[NEON, CYAN, NEON]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFillObject}
          />
        </Animated.View>

        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.scrollInner}
          showsVerticalScrollIndicator={false}
          bounces={false}
          nestedScrollEnabled
        >
          <View style={s.statusRow}>
            <View style={s.badge}>
              <Animated.View
                style={[
                  s.liveDot,
                  wsConnected && !locationStale
                    ? { opacity: pulseOpacity, transform: [{ scale: pulseScale }] }
                    : { opacity: 0.5 },
                ]}
              />
              <Text style={s.badgeLbl}>ON TRIP</Text>
            </View>
            {!wsConnected || locationStale ? (
              <Text style={s.connHint}>{locationStale ? 'Updating…' : 'Connecting…'}</Text>
            ) : null}
          </View>

          <View style={s.heroRow}>
            <View style={s.heroLeft}>
              <Text style={s.timer} accessibilityLabel={`Estimated time ${timerMain}`}>
                {timerMain}
              </Text>
              <Text style={s.sub}>Live location updates</Text>
            </View>
            <View style={s.carSilhouette} pointerEvents="none">
              <Ionicons name="car-sport" size={44} color="rgba(248,250,252,0.92)" />
              <View style={s.headlightL} />
              <View style={s.headlightR} />
            </View>
          </View>

          <View style={s.progressRow}>
            <View style={s.progressTrack}>
              <LinearGradient
                colors={[NEON, CYAN]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[s.progressFill, { width: `${progressPct}%` }]}
              />
            </View>
            <Text style={s.progressPct}>{Math.round(progressPct)}%</Text>
          </View>

          <TouchableOpacity
            style={s.driverCard}
            onPress={onOpenTripDetails}
            activeOpacity={0.92}
            accessibilityRole="button"
            accessibilityLabel="Trip and driver details"
          >
            <TripProfileAvatar
              size={60}
              faceUri={driverPhotos.face}
              profileUri={driverPhotos.profile}
              borderColor={NEON}
              showOnlineDot={wsConnected && !locationStale}
              accessibilityLabel={`Photo of ${driverName}`}
            />
            <View style={s.driverMid}>
              <Text style={s.driverName} numberOfLines={1}>
                {driverName}
              </Text>
              <Text style={s.vehicleLine} numberOfLines={1}>
                {[vehicle, color].filter(Boolean).join(' · ') || 'Vehicle'}
              </Text>
              {Number.isFinite(ratingNum) ? (
                <View style={s.stars}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Ionicons
                      key={i}
                      name={i < Math.round(ratingNum) ? 'star' : 'star-outline'}
                      size={12}
                      color="#FBBF24"
                    />
                  ))}
                  <Text style={s.ratingTxt}>{ratingNum.toFixed(1)}</Text>
                </View>
              ) : null}
            </View>
            {plate ? (
              <View style={s.plate}>
                <Text style={s.plateTxt} numberOfLines={1}>
                  {plate}
                </Text>
              </View>
            ) : null}
          </TouchableOpacity>

          <View style={s.actions}>
            <TouchableOpacity
              style={s.actionBtn}
              onPress={onCallDriver}
              disabled={!callOk}
              activeOpacity={0.88}
            >
              <Ionicons name="call" size={22} color={callOk ? NEON : '#64748B'} />
              <Text style={[s.actionLbl, !callOk && s.actionLblOff]}>Call</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.actionBtn, s.actionBtnHi]}
              onPress={onChatDriver}
              activeOpacity={0.88}
            >
              <Ionicons name="chatbubble" size={22} color={CYAN} />
              <Text style={[s.actionLbl, s.actionLblHi]}>Message</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.actionBtn} onPress={onShare} activeOpacity={0.88}>
              <Ionicons name="share-social" size={22} color={CYAN} />
              <Text style={s.actionLbl}>Share</Text>
            </TouchableOpacity>
          </View>

          <View style={s.statsRow}>
            <StatCell
              icon="wallet-outline"
              iconColor={NEON}
              label="Trip fare"
              value={fareDisplay || '—'}
              valueColor={NEON}
            />
            <View style={s.statDivider} />
            <StatCell
              icon="navigate-outline"
              iconColor="#94A3B8"
              label="Distance"
              value={totalKmLabel}
            />
            <View style={s.statDivider} />
            <View style={stat.cell}>
              {speed != null ? <SpeedGauge speedKmh={speed} /> : <Ionicons name="speedometer-outline" size={18} color="#64748B" />}
              <Text style={stat.lbl}>Speed</Text>
              <Text style={stat.val}>{speed != null ? `${speed} km/h` : '—'}</Text>
            </View>
            <View style={s.statDivider} />
            <StatCell icon="time-outline" iconColor={CYAN} label="ETA" value={etaClock} />
          </View>

          {loading && !driverInfo ? (
            <Text style={s.loadingHint}>Syncing live trip data…</Text>
          ) : null}
        </ScrollView>
      </View>
    </Animated.View>
  );
}

export function RiderOnTripRadiantDockFade({ height = 280 }: { height?: number }) {
  return (
    <LinearGradient
      colors={['rgba(15,23,42,0)', 'rgba(15,23,42,0.35)', 'rgba(15,23,42,0.78)']}
      locations={[0, 0.42, 1]}
      style={[s.fade, { height }]}
      pointerEvents="none"
    />
  );
}

const gauge = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 4, width: '100%' },
  track: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 2 },
});

const stat = StyleSheet.create({
  cell: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, minWidth: 0 },
  lbl: { fontSize: 10, fontWeight: '600', color: '#9CA3AF', textAlign: 'center' },
  val: {
    fontSize: 12,
    fontWeight: '800',
    color: '#F8FAFC',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
});

const s = StyleSheet.create({
  root: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 42,
    maxHeight: '72%',
  },
  fade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 38,
  },
  shell: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.25)',
    maxHeight: '100%',
    ...Platform.select({
      ios: {
        shadowColor: CYAN,
        shadowOpacity: 0.35,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: -8 },
      },
      android: { elevation: 22 },
    }),
  },
  borderGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    zIndex: 2,
  },
  scroll: { maxHeight: 560 },
  scrollInner: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: SPACING.md,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 10,
  },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: NEON,
  },
  badgeLbl: {
    fontSize: 12,
    fontWeight: '800',
    color: NEON,
    letterSpacing: 1.4,
  },
  connHint: { fontSize: 11, fontWeight: '600', color: '#64748B' },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  heroLeft: { flex: 1 },
  timer: {
    fontSize: 64,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -2,
    lineHeight: 68,
    fontVariant: ['tabular-nums'],
  },
  sub: { fontSize: 14, fontWeight: '500', color: '#9CA3AF', marginTop: 2 },
  carSilhouette: {
    width: 72,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.9,
  },
  headlightL: {
    position: 'absolute',
    left: 8,
    bottom: 10,
    width: 8,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(248,250,252,0.85)',
  },
  headlightR: {
    position: 'absolute',
    right: 8,
    bottom: 10,
    width: 8,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(248,250,252,0.85)',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 18,
  },
  progressTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 4 },
  progressPct: {
    fontSize: 14,
    fontWeight: '800',
    color: CYAN,
    minWidth: 40,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  driverCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  driverMid: { flex: 1, minWidth: 0, marginLeft: 12 },
  driverName: { fontSize: 16, fontWeight: '800', color: '#FFF', marginBottom: 2 },
  vehicleLine: { fontSize: 13, color: '#9CA3AF', marginBottom: 4 },
  stars: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  ratingTxt: { fontSize: 11, fontWeight: '700', color: '#FBBF24', marginLeft: 4 },
  plate: {
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#1F2937',
    maxWidth: 108,
  },
  plateTxt: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 0.8,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  actionBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  actionBtnHi: {
    backgroundColor: 'rgba(6,182,212,0.14)',
    borderColor: CYAN,
  },
  actionLbl: { fontSize: 12, fontWeight: '600', color: '#E5E7EB' },
  actionLblHi: { color: CYAN, fontWeight: '700' },
  actionLblOff: { color: '#64748B' },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.18)',
    paddingVertical: 12,
    paddingHorizontal: 6,
  },
  statDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginVertical: 4,
  },
  loadingHint: {
    textAlign: 'center',
    fontSize: 12,
    color: '#64748B',
    marginTop: 8,
  },
});

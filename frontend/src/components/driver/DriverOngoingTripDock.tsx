/**
 * Trip in progress — scrollable glass sheet with fixed Complete Trip CTA (always tappable).
 */
import React, { useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Animated,
  Easing,
  Alert,
  ScrollView,
  useWindowDimensions,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import {
  DOCK_BLUR_INTENSITY,
  DOCK_TOP_RADIUS,
  HANDLE_GRADIENT_ONGOING,
} from '@/src/components/driver/driverDockTheme';
import { TripProfileAvatar } from '@/src/components/TripProfileAvatar';
import {
  formatDriverRouteSummary,
  formatDriverTripElapsed,
} from '@/src/utils/driverOngoingDisplay';

export type DriverOngoingTripDockProps = {
  tripShortId: string;
  paymentMethodLabel: string;
  riderName: string;
  riderPhoto: string | null;
  ratingAvg: number | null;
  ratingTrips: number | null;
  isNewRider: boolean;
  dropLineShort: string;
  dropDetailLine: string;
  elapsedSec: number;
  distanceToDropLabel: string;
  etaToDropLabel: string;
  routeSummaryLabel?: string;
  /** 0–100 journey progress for route card bar */
  tripProgressPercent?: number;
  fareLabel: string;
  distanceFareLabel?: string;
  fareBreakdownLine: string | null;
  fareDeltaLabel: string | null;
  isCompleting: boolean;
  tripActionBusy: boolean;
  riderPhone: string | null;
  canMessage: boolean;
  bottomInset?: number;
  onCollapse?: () => void;
  onCompleteTrip: () => void;
  onNavigate: () => void;
  onCall: () => void;
  onMessage: () => void;
  onSafetyPress: () => void;
  onEmergencyPress: () => void;
  onPauseTrip?: () => void | Promise<void>;
};

const NEON = '#22C55E';
const CYAN = '#06B6D4';
const BLUE = '#3B82F6';
const BG = '#0F172A';
const MIN_TOUCH = 48;

function firstName(full: string): string {
  const t = full.trim();
  if (!t) return 'Rider';
  return t.split(/\s+/)[0] || t;
}

function hapticLight() {
  if (Platform.OS !== 'web') void Haptics.selectionAsync();
}

function hapticMedium() {
  if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

function hapticWarning() {
  if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
}

function LivePulseDot({ color = NEON }: { color?: string }) {
  const op = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(op, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(op, { toValue: 0.28, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [op]);
  return <Animated.View style={[st.liveDot, { opacity: op, backgroundColor: color }]} />;
}

function StatHint({ label, live }: { label: string; live?: boolean }) {
  return (
    <View style={st.statHintRow}>
      {live ? <LivePulseDot color={NEON} /> : null}
      <Text style={st.statHint}>{label}</Text>
    </View>
  );
}

export default function DriverOngoingTripDock({
  tripShortId,
  paymentMethodLabel,
  riderName,
  riderPhoto,
  ratingAvg,
  ratingTrips,
  isNewRider,
  dropLineShort,
  dropDetailLine,
  elapsedSec,
  distanceToDropLabel,
  etaToDropLabel,
  routeSummaryLabel,
  tripProgressPercent = 0,
  fareLabel,
  distanceFareLabel,
  fareBreakdownLine,
  fareDeltaLabel,
  isCompleting,
  tripActionBusy,
  riderPhone,
  canMessage,
  bottomInset = 0,
  onCollapse,
  onCompleteTrip,
  onNavigate,
  onCall,
  onMessage,
  onSafetyPress,
  onEmergencyPress,
  onPauseTrip,
}: DriverOngoingTripDockProps) {
  const busy = !!tripActionBusy;
  const { height: winH } = useWindowDimensions();
  const scrollMaxH = Math.min(460, Math.round(winH * 0.48));
  const routeLine =
    routeSummaryLabel?.trim() ||
    formatDriverRouteSummary(null, distanceToDropLabel, etaToDropLabel);
  const distFare = distanceFareLabel?.trim() || '—';
  const progressPct = Math.min(100, Math.max(0, tripProgressPercent));

  const handleComplete = useCallback(() => {
    if (busy) return;
    hapticMedium();
    onCompleteTrip();
  }, [busy, onCompleteTrip]);

  return (
    <View style={st.shell} accessibilityViewIsModal>
      {Platform.OS === 'ios' || Platform.OS === 'android' ? (
        <BlurView intensity={DOCK_BLUR_INTENSITY} tint="dark" style={StyleSheet.absoluteFillObject} />
      ) : (
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(15,23,42,0.98)' }]} />
      )}
      <LinearGradient
        colors={['rgba(15,23,42,0.55)', 'rgba(15,23,42,0.97)', BG]}
        style={StyleSheet.absoluteFillObject}
      />

      <Pressable
        onPress={() => {
          hapticLight();
          onCollapse?.();
        }}
        style={st.handleRail}
        accessibilityRole="button"
        accessibilityLabel="Collapse trip sheet"
        disabled={!onCollapse}
      >
        <LinearGradient
          colors={[...HANDLE_GRADIENT_ONGOING]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={st.handle}
        />
      </Pressable>

      <View style={st.brandRow}>
        <View style={st.logoMark}>
          <LinearGradient colors={[CYAN, NEON]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.logoGrad}>
            <Text style={st.logoLetter}>N</Text>
          </LinearGradient>
          <Text style={st.brandTxt}>NEXRYDE</Text>
        </View>
        <View style={st.onDriverPill}>
          <LivePulseDot />
          <Text style={st.onDriverTxt}>ON DRIVER</Text>
        </View>
      </View>

      <View style={st.scrollWrap}>
        <ScrollView
          style={{ maxHeight: scrollMaxH }}
          contentContainerStyle={st.scrollInner}
          showsVerticalScrollIndicator={false}
          bounces
          keyboardShouldPersistTaps="handled"
        >
          <View style={st.routeCard}>
            <LinearGradient
              colors={['rgba(59,130,246,0.22)', 'rgba(15,23,42,0.55)', 'rgba(15,23,42,0.92)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={st.routeTop}>
              <View style={st.onRoutePill}>
                <Ionicons name="navigate" size={12} color={BLUE} />
                <Text style={st.onRouteTxt}>ON ROUTE</Text>
              </View>
              <View style={st.routeMapIcon}>
                <Ionicons name="map" size={20} color={CYAN} />
              </View>
            </View>
            <Text style={st.routeTitle}>Trip in progress</Text>
            <Text style={st.routeSub} numberOfLines={2}>
              {routeLine}
            </Text>
            {progressPct > 0 ? (
              <View style={st.progressTrack} accessibilityLabel={`Trip progress ${Math.round(progressPct)} percent`}>
                <LinearGradient
                  colors={[BLUE, CYAN, NEON]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[st.progressFill, { width: `${progressPct}%` }]}
                />
              </View>
            ) : null}
            <View style={st.liveBadge}>
              <LivePulseDot />
              <Text style={st.liveBadgeTxt}>LIVE UPDATING</Text>
            </View>
            <Text style={st.tripMeta} numberOfLines={1}>
              {tripShortId} · {paymentMethodLabel}
            </Text>
          </View>

          <View style={st.fareCard}>
            <View style={st.fareCol}>
              <Text style={st.fareLbl}>CURRENT FARE</Text>
              <Text
                style={st.fareMain}
                numberOfLines={1}
                accessibilityLabel={`Current fare ${fareLabel}`}
                accessibilityLiveRegion="polite"
              >
                {fareLabel}
              </Text>
              {fareDeltaLabel ? (
                <Text style={st.fareDelta} accessibilityLiveRegion="polite">
                  {fareDeltaLabel}
                </Text>
              ) : null}
            </View>
            <View style={st.fareDivider} />
            <View style={st.fareCol}>
              <Text style={st.fareLbl}>DISTANCE FARE</Text>
              <Text style={st.fareSecondary} numberOfLines={1}>
                {distFare}
              </Text>
            </View>
          </View>
          {fareBreakdownLine ? (
            <Text style={st.fareBreakdown} numberOfLines={2}>
              {fareBreakdownLine}
            </Text>
          ) : null}

          <View style={st.statsRow}>
            <View style={st.statBox} accessibilityLabel={`Distance to drop-off ${distanceToDropLabel}`}>
              <View style={[st.statIcon, st.statIconBlue]}>
                <Ionicons name="location" size={18} color={BLUE} />
              </View>
              <Text style={st.statLbl}>DISTANCE</Text>
              <Text style={st.statVal} numberOfLines={1}>
                {distanceToDropLabel}
              </Text>
              <StatHint label="To drop-off" />
            </View>
            <View style={st.statBox} accessibilityLabel={`Trip time ${formatDriverTripElapsed(elapsedSec)}`}>
              <View style={[st.statIcon, st.statIconGreen]}>
                <Ionicons name="time-outline" size={18} color={NEON} />
              </View>
              <Text style={st.statLbl}>TIME</Text>
              <Text style={st.statVal} numberOfLines={2}>
                {formatDriverTripElapsed(elapsedSec)}
              </Text>
              <StatHint label="Counting up" live />
            </View>
            <View style={st.statBox} accessibilityLabel={`ETA ${etaToDropLabel}`}>
              <View style={[st.statIcon, st.statIconGreen]}>
                <Ionicons name="timer-outline" size={18} color={NEON} />
              </View>
              <Text style={st.statLbl}>ETA</Text>
              <Text style={st.statVal} numberOfLines={1}>
                {etaToDropLabel}
              </Text>
              <StatHint label="Live ETA" live />
            </View>
          </View>

          <Text style={st.sectionKicker}>WITH RIDER</Text>
          <View style={st.riderCard}>
            <TripProfileAvatar
              size={52}
              uri={riderPhoto}
              borderColor={NEON}
              accessibilityLabel={`Photo of ${firstName(riderName)}`}
            />
            <View style={st.riderMid}>
              <Text style={st.riderName} numberOfLines={1}>
                {riderName.trim() || 'Rider'}
              </Text>
              <Text style={st.dropKicker}>DROP-OFF</Text>
              <Text style={st.dropMain} numberOfLines={1}>
                {dropLineShort || 'Destination'}
              </Text>
              {dropDetailLine ? (
                <Text style={st.riderLoc} numberOfLines={2}>
                  {dropDetailLine}
                </Text>
              ) : null}
              {typeof ratingAvg === 'number' && ratingAvg > 0 ? (
                <View style={st.ratingRow}>
                  <Ionicons name="star" size={12} color="#FBBF24" />
                  <Text style={st.riderRating} numberOfLines={1}>
                    {ratingAvg.toFixed(1)}
                    {typeof ratingTrips === 'number' && ratingTrips > 0
                      ? ` · ${ratingTrips.toLocaleString()} trips`
                      : ''}
                  </Text>
                </View>
              ) : isNewRider ? (
                <Text style={st.riderRating}>New to NEXRYDE</Text>
              ) : null}
            </View>
            <View style={st.riderActions}>
              <TouchableOpacity
                style={[st.circleBtn, st.msgBtn, !canMessage && st.circleBtnOff]}
                onPress={() => {
                  hapticLight();
                  onMessage();
                }}
                disabled={!canMessage || busy}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Message rider"
              >
                <Ionicons name="chatbubble" size={20} color={canMessage ? BLUE : '#64748B'} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[st.circleBtn, st.callBtn, !riderPhone && st.circleBtnOff]}
                onPress={() => {
                  hapticLight();
                  onCall();
                }}
                disabled={!riderPhone || busy}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Call rider"
              >
                <Ionicons name="call" size={20} color={riderPhone ? NEON : '#64748B'} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={st.actionRow}>
            <TouchableOpacity
              style={[st.pauseBtn, busy && st.disabled]}
              onPress={() => {
                if (busy) return;
                hapticLight();
                if (onPauseTrip) void onPauseTrip();
                else
                  Alert.alert(
                    'Pause trip',
                    'Pull over safely and use Chat or Call if you need a moment.',
                  );
              }}
              disabled={busy}
              activeOpacity={0.88}
              hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
              accessibilityRole="button"
              accessibilityLabel="Pause trip"
            >
              <Ionicons name="pause" size={20} color="#FFF" />
              <Text style={st.pauseTxt}>PAUSE TRIP</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[st.emergencyBtn, busy && st.disabled]}
              onPress={() => {
                hapticWarning();
                onEmergencyPress();
              }}
              disabled={busy}
              activeOpacity={0.88}
              hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
              accessibilityRole="button"
              accessibilityLabel="Emergency"
            >
              <Ionicons name="warning" size={20} color="#FFF" />
              <Text style={st.emergencyTxt}>EMERGENCY</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[st.navBtn, busy && st.disabled]}
            onPress={() => {
              hapticLight();
              onNavigate();
            }}
            disabled={busy}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel="Open navigation to drop-off"
          >
            <Ionicons name="navigate" size={20} color={NEON} />
            <Text style={st.navTxt}>OPEN NAVIGATION</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={st.safetyLink}
            onPress={() => {
              hapticLight();
              onSafetyPress();
            }}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Safety tools and trip help"
          >
            <Ionicons name="shield-checkmark" size={14} color="#94A3B8" />
            <Text style={st.safetyLinkTxt}>Safety tools & trip help</Text>
            <Ionicons name="chevron-forward" size={14} color="#64748B" />
          </TouchableOpacity>
        </ScrollView>
        <LinearGradient
          colors={['transparent', 'rgba(15,23,42,0.85)']}
          style={st.scrollFade}
          pointerEvents="none"
        />
      </View>

      <View style={[st.fixedFooter, { paddingBottom: Math.max(14, bottomInset) }]}>
        <LinearGradient
          colors={['rgba(34,197,94,0.35)', 'transparent']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={st.footerGlow}
          pointerEvents="none"
        />
        <TouchableOpacity
          style={[st.completeBtn, (busy || isCompleting) && st.completeBtnBusy]}
          onPress={handleComplete}
          disabled={busy}
          activeOpacity={0.9}
          hitSlop={{ top: 4, bottom: 4, left: 0, right: 0 }}
          accessibilityRole="button"
          accessibilityLabel="Complete trip at destination"
          accessibilityHint="Opens confirmation. End trip after rider exits."
          accessibilityState={{ disabled: busy, busy: isCompleting }}
        >
          <LinearGradient
            colors={['#86EFAC', '#4ADE80', NEON, '#16A34A']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={st.completeGrad}
          >
            {isCompleting ? (
              <ActivityIndicator color="#022C22" size="small" />
            ) : (
              <>
                <View style={st.completeIconWrap}>
                  <Ionicons name="checkmark-done" size={24} color="#022C22" />
                </View>
                <Text style={st.completeTxt}>COMPLETE TRIP</Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
        <Text style={st.completeHint}>Tap when rider has exited and belongings are secure</Text>
        <View style={st.safetyFoot}>
          <Ionicons name="shield-outline" size={14} color="#94A3B8" />
          <Text style={st.safetyFootTxt}>Drive safely and follow all traffic rules.</Text>
        </View>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  shell: {
    borderTopLeftRadius: DOCK_TOP_RADIUS,
    borderTopRightRadius: DOCK_TOP_RADIUS,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.22)',
    borderBottomWidth: 0,
  },
  handleRail: { alignItems: 'center', paddingTop: 10, paddingBottom: 8, minHeight: 28 },
  handle: { width: 48, height: 5, borderRadius: 100 },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  logoMark: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoGrad: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoLetter: { fontSize: 18, fontWeight: '900', color: '#FFF' },
  brandTxt: { fontSize: 16, fontWeight: '800', color: '#F8FAFC', letterSpacing: 0.6 },
  onDriverPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: NEON,
    backgroundColor: 'rgba(34,197,94,0.1)',
  },
  onDriverDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: NEON },
  onDriverTxt: { fontSize: 11, fontWeight: '700', color: NEON },
  scrollWrap: { position: 'relative' },
  scrollFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 28,
  },
  scrollInner: { paddingHorizontal: 16, paddingBottom: 12 },
  routeCard: {
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.2)',
    overflow: 'hidden',
  },
  routeTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  onRoutePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: 'rgba(59,130,246,0.2)',
  },
  onRouteTxt: { fontSize: 11, fontWeight: '700', color: BLUE },
  routeMapIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(6,182,212,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(6,182,212,0.25)',
  },
  routeTitle: { fontSize: 20, fontWeight: '900', color: '#FFF', marginBottom: 4, letterSpacing: -0.3 },
  routeSub: { fontSize: 14, color: '#94A3B8', marginBottom: 10, lineHeight: 20 },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    marginBottom: 10,
  },
  progressFill: { height: '100%', borderRadius: 3 },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: 'rgba(34,197,94,0.12)',
    marginBottom: 8,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: NEON },
  liveBadgeTxt: { fontSize: 10, fontWeight: '700', color: NEON },
  tripMeta: { fontSize: 10, fontWeight: '600', color: '#64748B' },
  fareCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    padding: 16,
    marginBottom: 8,
    backgroundColor: 'rgba(0,212,126,0.08)',
    borderWidth: 1.5,
    borderColor: 'rgba(34,197,94,0.3)',
  },
  fareCol: { flex: 1, minWidth: 0 },
  fareLbl: { fontSize: 10, fontWeight: '700', color: '#94A3B8', marginBottom: 4, letterSpacing: 0.5 },
  fareMain: { fontSize: 34, fontWeight: '900', color: NEON, fontVariant: ['tabular-nums'], letterSpacing: -0.5 },
  fareSecondary: { fontSize: 20, fontWeight: '800', color: '#F8FAFC', fontVariant: ['tabular-nums'] },
  fareDelta: { marginTop: 4, fontSize: 12, fontWeight: '700', color: NEON },
  fareDivider: { width: 1, height: 48, backgroundColor: 'rgba(255,255,255,0.12)', marginHorizontal: 12 },
  fareBreakdown: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
    marginBottom: 12,
    lineHeight: 16,
  },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  statBox: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.15)',
    minHeight: 108,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  statIconBlue: { backgroundColor: 'rgba(59,130,246,0.2)' },
  statIconGreen: { backgroundColor: 'rgba(34,197,94,0.18)' },
  statLbl: { fontSize: 9, fontWeight: '700', color: '#94A3B8', marginBottom: 2 },
  statVal: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFF',
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  statHintRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  statHint: { fontSize: 9, fontWeight: '600', color: NEON },
  sectionKicker: {
    fontSize: 11,
    fontWeight: '700',
    color: BLUE,
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  riderCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.15)',
    marginBottom: 12,
  },
  riderMid: { flex: 1, minWidth: 0, paddingTop: 2 },
  riderName: { fontSize: 15, fontWeight: '800', color: '#FFF', marginBottom: 6 },
  dropKicker: { fontSize: 9, fontWeight: '800', color: '#FCA5A5', letterSpacing: 0.6, marginBottom: 2 },
  dropMain: { fontSize: 13, fontWeight: '700', color: '#E2E8F0', marginBottom: 2 },
  riderLoc: { fontSize: 12, color: '#94A3B8', lineHeight: 16, marginBottom: 4 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  riderRating: { fontSize: 11, fontWeight: '600', color: '#CBD5E1' },
  riderActions: { flexDirection: 'row', gap: 8, paddingTop: 4 },
  circleBtn: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    borderRadius: MIN_TOUCH / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  msgBtn: { backgroundColor: 'rgba(59,130,246,0.2)', borderColor: 'rgba(59,130,246,0.45)' },
  callBtn: { backgroundColor: 'rgba(34,197,94,0.15)', borderColor: 'rgba(34,197,94,0.45)' },
  circleBtnOff: { opacity: 0.45 },
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  disabled: { opacity: 0.55 },
  pauseBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    minHeight: MIN_TOUCH,
    borderRadius: 12,
    backgroundColor: 'rgba(59,130,246,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.5)',
  },
  pauseTxt: { fontSize: 12, fontWeight: '800', color: '#FFF' },
  emergencyBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    minHeight: MIN_TOUCH,
    borderRadius: 12,
    backgroundColor: 'rgba(239,68,68,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.5)',
  },
  emergencyTxt: { fontSize: 12, fontWeight: '800', color: '#FFF' },
  navBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    minHeight: MIN_TOUCH,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: NEON,
    backgroundColor: 'rgba(34,197,94,0.08)',
  },
  navTxt: { fontSize: 13, fontWeight: '800', color: NEON },
  safetyLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    marginBottom: 4,
  },
  safetyLinkTxt: { flex: 1, fontSize: 12, fontWeight: '600', color: '#64748B' },
  fixedFooter: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(34,197,94,0.25)',
    backgroundColor: 'rgba(15,23,42,0.99)',
  },
  footerGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  completeBtn: {
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: NEON,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 18,
    minHeight: 64,
  },
  completeBtnBusy: { opacity: 0.72 },
  completeGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 19,
    paddingHorizontal: 20,
  },
  completeIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.38)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  completeTxt: { fontSize: 19, fontWeight: '900', color: '#022C22', letterSpacing: 0.4 },
  completeHint: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 15,
  },
  safetyFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingBottom: 2,
  },
  safetyFootTxt: { flex: 1, fontSize: 11, color: '#94A3B8', lineHeight: 15 },
});

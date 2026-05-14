import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Platform,
  Animated,
  Easing,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import {
  DOCK_BLUR_INTENSITY,
  DOCK_TOP_RADIUS,
  HANDLE_GRADIENT_ONGOING,
} from '@/src/components/driver/driverDockTheme';

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
  fareLabel: string;
  /** e.g. "Base ₦500 + Distance ₦1,200 + Time ₦150" when API sends components */
  fareBreakdownLine: string | null;
  /** e.g. "↗ ₦50 just now" when fare ticks up */
  fareDeltaLabel: string | null;
  isCompleting: boolean;
  tripActionBusy: boolean;
  riderPhone: string | null;
  canMessage: boolean;
  onCompleteTrip: () => void;
  onNavigate: () => void;
  onCall: () => void;
  onMessage: () => void;
  onSafetyPress: () => void;
  onEmergencyPress: () => void;
  onPauseTrip?: () => void | Promise<void>;
};

const NEON = '#39FF14';

function firstName(full: string): string {
  const t = full.trim();
  if (!t) return 'Rider';
  return t.split(/\s+/)[0] || t;
}

function formatElapsedVerbose(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m} min ${String(sec).padStart(2, '0')} sec`;
}

function UpdatingDot() {
  const op = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(op, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(op, { toValue: 0.28, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [op]);
  return <Animated.View style={[s.pulseDot, { opacity: op }]} />;
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
  fareLabel,
  fareBreakdownLine,
  fareDeltaLabel,
  isCompleting,
  tripActionBusy,
  riderPhone,
  canMessage,
  onCompleteTrip,
  onNavigate,
  onCall,
  onMessage,
  onSafetyPress,
  onEmergencyPress,
  onPauseTrip,
}: DriverOngoingTripDockProps) {
  const initial = firstName(riderName).charAt(0).toUpperCase() || 'R';
  const busy = !!tripActionBusy;

  return (
    <View style={s.shell}>
      {Platform.OS === 'ios' || Platform.OS === 'android' ? (
        <BlurView intensity={DOCK_BLUR_INTENSITY} tint="dark" style={StyleSheet.absoluteFillObject} />
      ) : (
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.96)' }]} />
      )}
      <LinearGradient
        colors={['rgba(18,18,18,0.4)', 'rgba(2,6,23,0.97)', '#000000']}
        style={StyleSheet.absoluteFillObject}
      />
      <LinearGradient
        colors={['rgba(57,255,20,0.12)', 'rgba(57,255,20,0.02)', 'transparent']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.55 }}
        style={s.fareMeterGlow}
        pointerEvents="none"
      />

      <View style={s.handleRail}>
        <LinearGradient
          colors={[...HANDLE_GRADIENT_ONGOING]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={s.handle}
        />
      </View>

      {/* Live fare meter — matches reference layout */}
      <View style={s.fareMeterCard}>
        <LinearGradient
          colors={['rgba(57,255,20,0.08)', 'rgba(2,6,23,0.5)', 'rgba(15,23,42,0.85)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={s.fareMeterHeader}>
          <View style={s.fareMeterTitleRow}>
            <View style={s.fareGraphIcon}>
              <Ionicons name="stats-chart" size={18} color="#022C22" />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.fareMeterKicker}>LIVE FARE METER</Text>
              <View style={s.updatingRow}>
                <UpdatingDot />
                <Text style={s.updatingTxt}>Updating…</Text>
              </View>
            </View>
            <View style={s.fareUpdatingPill}>
              <Text style={s.fareUpdatingPillTxt}>FARE UPDATING</Text>
            </View>
          </View>
          <Text style={s.currentFareLbl}>CURRENT FARE</Text>
          <Text style={s.currentFareVal} numberOfLines={1}>
            {fareLabel}
          </Text>
          {fareDeltaLabel ? <Text style={s.fareDelta}>{fareDeltaLabel}</Text> : <View style={{ height: 18 }} />}
          {fareBreakdownLine ? (
            <Text style={s.fareBreakdown} numberOfLines={2}>
              {fareBreakdownLine}
            </Text>
          ) : (
            <Text style={s.fareBreakdownMuted} numberOfLines={1}>
              Breakdown appears as the meter accrues distance & time.
            </Text>
          )}
        </View>
      </View>

      <View style={s.metaCompact}>
        <Text style={s.metaTripId} numberOfLines={1}>
          {tripShortId}
        </Text>
        <View style={s.metaPay}>
          <Text style={s.metaPayTxt}>{paymentMethodLabel}</Text>
        </View>
      </View>

      {/* Trip stats — Distance · Time · ETA */}
      <View style={s.statsRow}>
        <View style={s.statCard}>
          <View style={[s.statIconWrap, s.statIconBlue]}>
            <Ionicons name="git-network-outline" size={18} color="#60A5FA" />
          </View>
          <Text style={s.statLbl}>DISTANCE</Text>
          <Text style={s.statVal} numberOfLines={1}>
            {distanceToDropLabel}
          </Text>
        </View>
        <View style={s.statCard}>
          <View style={[s.statIconWrap, s.statIconBlue]}>
            <Ionicons name="time-outline" size={18} color="#60A5FA" />
          </View>
          <Text style={s.statLbl}>TIME</Text>
          <Text style={s.statVal} numberOfLines={1}>
            {formatElapsedVerbose(elapsedSec)}
          </Text>
          <View style={s.countingRow}>
            <View style={s.countingDot} />
            <Text style={s.countingTxt}>Counting up…</Text>
          </View>
        </View>
        <View style={s.statCard}>
          <View style={[s.statIconWrap, s.statIconBlue]}>
            <Ionicons name="location-outline" size={18} color="#60A5FA" />
          </View>
          <Text style={s.statLbl}>ETA</Text>
          <Text style={s.statVal} numberOfLines={1}>
            {etaToDropLabel}
          </Text>
        </View>
      </View>

      {/* Rider + destination */}
      <View style={s.riderDestBlock}>
        <View style={s.riderRow}>
          {riderPhoto ? (
            <Image source={{ uri: riderPhoto }} style={s.avatarSm} />
          ) : (
            <View style={s.avatarSmPh}>
              <Text style={s.avatarSmPhTxt}>{initial}</Text>
            </View>
          )}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.withRiderLbl}>With {firstName(riderName)}</Text>
            {typeof ratingAvg === 'number' && ratingAvg > 0 ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                <Ionicons name="star" size={13} color="#FBBF24" />
                <Text style={s.riderMeta} numberOfLines={1}>
                  {ratingAvg.toFixed(1)}
                  {typeof ratingTrips === 'number' && ratingTrips > 0
                    ? ` · ${ratingTrips.toLocaleString()} trips`
                    : ''}
                </Text>
              </View>
            ) : isNewRider ? (
              <Text style={s.riderMeta}>New rider</Text>
            ) : null}
          </View>
          <TouchableOpacity
            style={[s.iconBtn, !canMessage && s.iconBtnOff]}
            onPress={onMessage}
            disabled={!canMessage || busy}
            accessibilityRole="button"
            accessibilityLabel="Message rider"
          >
            <Ionicons name="chatbubble-ellipses" size={20} color={canMessage ? '#93C5FD' : '#475569'} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.iconBtn, !riderPhone && s.iconBtnOff]}
            onPress={onCall}
            disabled={!riderPhone || busy}
            accessibilityRole="button"
            accessibilityLabel="Call rider"
          >
            <Ionicons name="call" size={20} color={riderPhone ? '#86EFAC' : '#475569'} />
          </TouchableOpacity>
        </View>
        <View style={s.destRow}>
          <Ionicons name="flag" size={15} color="#F87171" style={{ marginRight: 8 }} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.destKicker}>DROP-OFF</Text>
            <Text style={s.destMain} numberOfLines={1}>
              {dropLineShort || 'Destination'}
            </Text>
            {dropDetailLine ? (
              <Text style={s.destSub} numberOfLines={2}>
                {dropDetailLine}
              </Text>
            ) : null}
          </View>
        </View>
      </View>

      {/* Pause + Emergency */}
      <View style={s.dangerRow}>
        <TouchableOpacity
          style={[s.pauseBtn, busy && s.rowDisabled]}
          onPress={() => {
            if (busy) return;
            if (onPauseTrip) void onPauseTrip();
            else
              Alert.alert(
                'Pause trip',
                'This action is not available from here yet. Pull over safely and use Chat or Call if you need a moment.',
              );
          }}
          disabled={busy}
          activeOpacity={0.88}
          accessibilityRole="button"
          accessibilityLabel="Pause trip"
        >
          <Ionicons name="pause" size={22} color="#FFF" />
          <Text style={s.pauseBtnTxt}>PAUSE TRIP</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.emergencyBtn, busy && s.rowDisabled]}
          onPress={onEmergencyPress}
          disabled={busy}
          activeOpacity={0.88}
          accessibilityRole="button"
          accessibilityLabel="Emergency"
        >
          <Ionicons name="warning" size={22} color="#FFF" />
          <Text style={s.emergencyBtnTxt}>EMERGENCY</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[s.navOutline, busy && s.rowDisabled]}
        onPress={onNavigate}
        disabled={busy}
        activeOpacity={0.88}
        accessibilityRole="button"
        accessibilityLabel="Open navigation to drop-off"
      >
        <Ionicons name="navigate" size={20} color="#34F5B8" />
        <Text style={s.navOutlineTxt}>OPEN NAVIGATION</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[s.completeOuter, (busy || isCompleting) && { opacity: 0.65 }]}
        onPress={onCompleteTrip}
        disabled={busy}
        activeOpacity={0.88}
        accessibilityRole="button"
        accessibilityLabel="Complete trip at destination"
      >
        <LinearGradient
          colors={['#5DFFC7', '#34F5B8', '#0D9F6E']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={s.completeGrad}
        >
          {isCompleting ? (
            <ActivityIndicator color="#022C22" />
          ) : (
            <>
              <View style={s.completeIconCircle}>
                <Ionicons name="checkmark-done" size={24} color="#022C22" />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.completeTitle}>COMPLETE TRIP</Text>
                <Text style={s.completeSub} numberOfLines={2}>
                  After the rider exits — belongings secure, then complete.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color="rgba(2,44,34,0.4)" />
            </>
          )}
        </LinearGradient>
      </TouchableOpacity>

      <TouchableOpacity style={s.safetyFoot} onPress={onSafetyPress} activeOpacity={0.85} accessibilityRole="button">
        <Ionicons name="shield-checkmark" size={16} color="#60A5FA" style={{ marginRight: 8 }} />
        <Text style={s.safetyFootTxt}>
          <Text style={s.safetyFootStrong}>Safety: </Text>
          Meter runs until you complete. Pull over before using the phone.
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  shell: {
    borderTopLeftRadius: DOCK_TOP_RADIUS,
    borderTopRightRadius: DOCK_TOP_RADIUS,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(57,255,20,0.22)',
    shadowColor: NEON,
    shadowOffset: { width: 0, height: -12 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
    elevation: 32,
  },
  fareMeterGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 200,
  },
  handleRail: { alignItems: 'center', marginBottom: 10 },
  handle: { width: 48, height: 4, borderRadius: 100 },
  fareMeterCard: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(57,255,20,0.28)',
  },
  fareMeterHeader: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
  },
  fareMeterTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  fareGraphIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: NEON,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    shadowColor: NEON,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 10,
    elevation: 8,
  },
  fareMeterKicker: {
    fontSize: 11,
    fontWeight: '900',
    color: NEON,
    letterSpacing: 1.1,
  },
  updatingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  pulseDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: NEON,
  },
  updatingTxt: { fontSize: 12, fontWeight: '700', color: 'rgba(226,232,240,0.9)' },
  fareUpdatingPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(57,255,20,0.65)',
    backgroundColor: 'rgba(57,255,20,0.08)',
  },
  fareUpdatingPillTxt: {
    fontSize: 9,
    fontWeight: '900',
    color: NEON,
    letterSpacing: 0.6,
  },
  currentFareLbl: {
    fontSize: 10,
    fontWeight: '800',
    color: 'rgba(248,250,252,0.72)',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  currentFareVal: {
    fontSize: 36,
    fontWeight: '900',
    color: '#F8FAFC',
    letterSpacing: -1,
  },
  fareDelta: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '800',
    color: NEON,
  },
  fareBreakdown: {
    marginTop: 10,
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(203,213,225,0.92)',
    lineHeight: 16,
  },
  fareBreakdownMuted: {
    marginTop: 10,
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(148,163,184,0.85)',
    lineHeight: 16,
  },
  metaCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  metaTripId: { flex: 1, fontSize: 11, fontWeight: '800', color: '#64748B' },
  metaPay: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.25)',
  },
  metaPayTxt: { fontSize: 10, fontWeight: '800', color: '#E2E8F0' },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  statCard: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 4,
    backgroundColor: 'rgba(15,23,42,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.2)',
    alignItems: 'center',
  },
  statIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  statIconBlue: { backgroundColor: 'rgba(59,130,246,0.18)' },
  statLbl: {
    fontSize: 8,
    fontWeight: '900',
    color: '#64748B',
    letterSpacing: 0.7,
    marginBottom: 3,
  },
  statVal: { fontSize: 12, fontWeight: '900', color: '#F1F5F9', fontVariant: ['tabular-nums'] },
  countingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  countingDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: NEON },
  countingTxt: { fontSize: 9, fontWeight: '700', color: 'rgba(57,255,20,0.95)' },
  riderDestBlock: {
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
    backgroundColor: 'rgba(15,23,42,0.75)',
    borderWidth: 1,
    borderColor: 'rgba(51,65,85,0.45)',
  },
  riderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  avatarSm: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: 'rgba(96,165,250,0.45)' },
  avatarSmPh: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(30,41,59,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(51,65,85,0.55)',
  },
  avatarSmPhTxt: { fontSize: 16, fontWeight: '900', color: '#94A3B8' },
  withRiderLbl: { fontSize: 14, fontWeight: '900', color: '#F8FAFC' },
  riderMeta: { marginTop: 2, fontSize: 12, fontWeight: '600', color: '#94A3B8' },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(2,6,23,0.65)',
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.35)',
  },
  iconBtnOff: { opacity: 0.45 },
  destRow: { flexDirection: 'row', alignItems: 'flex-start' },
  destKicker: { fontSize: 9, fontWeight: '900', color: '#FCA5A5', letterSpacing: 0.7 },
  destMain: { fontSize: 14, fontWeight: '900', color: '#F8FAFC', marginTop: 2 },
  destSub: { marginTop: 4, fontSize: 12, fontWeight: '600', color: '#94A3B8', lineHeight: 16 },
  dangerRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  rowDisabled: { opacity: 0.55 },
  pauseBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#007BFF',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  pauseBtnTxt: { fontSize: 12, fontWeight: '900', color: '#FFF', letterSpacing: 0.6 },
  emergencyBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#FF3B30',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  emergencyBtnTxt: { fontSize: 12, fontWeight: '900', color: '#FFF', letterSpacing: 0.6 },
  navOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(52,245,184,0.45)',
    backgroundColor: 'rgba(6,78,59,0.2)',
  },
  navOutlineTxt: { fontSize: 12, fontWeight: '900', color: '#34F5B8', letterSpacing: 0.7 },
  completeOuter: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(52,245,184,0.45)',
    shadowColor: '#34F5B8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 10,
  },
  completeGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 12,
  },
  completeIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(2,44,34,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  completeTitle: { fontSize: 15, fontWeight: '900', color: '#022C22', letterSpacing: 0.8 },
  completeSub: { marginTop: 3, fontSize: 11, fontWeight: '700', color: 'rgba(2,44,34,0.72)', lineHeight: 15 },
  safetyFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(15,23,42,0.65)',
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.18)',
  },
  safetyFootTxt: { flex: 1, fontSize: 11, fontWeight: '600', color: '#CBD5E1', lineHeight: 16 },
  safetyFootStrong: { fontWeight: '900', color: '#93C5FD' },
});

/**
 * DriverNavigatePickupDock — Uber-standard "en route to pickup" bottom sheet.
 *
 * Design (Uber study):
 * • Clean white bottom sheet — high contrast, easy to read
 * • ETA + distance are the hero at the top
 * • Rider identity is secondary — name, photo, rating
 * • Navigate button is blue (directional action) and prominent
 * • "I've Arrived" is full-width, green, unmissable
 * • Communication: Call / Message as icon buttons in a row
 */
import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Alert,
  ScrollView,
  useWindowDimensions,
  Animated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { DOCK_TOP_RADIUS } from '@/src/components/driver/driverDockTheme';
import { DriverPickupRouteTimeline } from '@/src/components/driver/DriverPickupRouteTimeline';
import { driverFirstName, DRIVER_CANCEL_TRIP_ALERT } from '@/src/components/driver/driverDockUtils';
import { TripProfileAvatar } from '@/src/components/TripProfileAvatar';

// ─── Tokens ────────────────────────────────────────────────────────────────────
const GREEN  = '#16A34A';
const GREEN_L= '#DCFCE7';
const BLUE   = '#2563EB';
const BLUE_L = '#EFF6FF';
const NAVY   = '#0F172A';
const INK    = '#1E293B';
const DIM    = '#64748B';
const BORDER = '#E2E8F0';
const WHITE  = '#FFFFFF';
const OFFWHT = '#FAFBFC';

// ─── Types ─────────────────────────────────────────────────────────────────────
export type DriverNavigatePickupDockProps = {
  riderName: string;
  riderPhoto: string | null;
  ratingAvg: number | null;
  ratingTrips: number | null;
  isNewRider: boolean;
  distanceKm: number | null;
  etaMin: number | null;
  pickupLineShort: string;
  pickupAddressLine: string;
  pickupDetailLine?: string;
  dropoffAddressLine: string;
  dropoffDetailLine?: string;
  tripDistanceLabel?: string;
  tripDurationLabel?: string;
  arrivalEligible: boolean;
  tripActionBusy: boolean;
  riderPhone: string | null;
  canMessage: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
  onNavigate: () => void;
  onCall: () => void;
  onMessage: () => void;
  onMarkArrived: () => void;
  onCancelTrip?: () => void;
};

// ─── Helpers ───────────────────────────────────────────────────────────────────
function fmtDist(km: number | null): string {
  if (km == null || !Number.isFinite(km)) return '';
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

// Animated pulsing dot for "live" status indicator
function LiveDot() {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.8, duration: 800, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1,   duration: 800, easing: Easing.in(Easing.quad),  useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <View style={{ width: 12, height: 12, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ position: 'absolute', width: 12, height: 12, borderRadius: 6, backgroundColor: `${GREEN}40`, transform: [{ scale: pulse }] }} />
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: GREEN }} />
    </View>
  );
}

// ─── Component ─────────────────────────────────────────────────────────────────
export default function DriverNavigatePickupDock({
  riderName,
  riderPhoto,
  ratingAvg,
  ratingTrips,
  isNewRider,
  distanceKm,
  etaMin,
  pickupAddressLine,
  dropoffAddressLine,
  pickupDetailLine,
  dropoffDetailLine,
  tripDistanceLabel,
  tripDurationLabel,
  arrivalEligible,
  tripActionBusy,
  riderPhone,
  canMessage,
  expanded = true,
  onToggleExpand,
  onNavigate,
  onCall,
  onMessage,
  onMarkArrived,
  onCancelTrip,
}: DriverNavigatePickupDockProps) {
  const { height: winH } = useWindowDimensions();
  const pickupDisplay  = pickupAddressLine?.trim()  || 'Pickup location';
  const dropDisplay    = dropoffAddressLine?.trim()  || 'Destination';
  const etaDisplay     = etaMin != null ? `${etaMin} min` : null;
  const distDisplay    = fmtDist(distanceKm);
  const tripLegLine    = [tripDistanceLabel?.trim(), tripDurationLabel?.trim()].filter(Boolean).join(' · ');
  const maxH           = Math.min(400, Math.round(winH * 0.4));
  const expandAnim = useRef(new Animated.Value(expanded ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(expandAnim, {
      toValue: expanded ? 1 : 0,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [expanded, expandAnim]);

  const bodyHeight = expandAnim.interpolate({ inputRange: [0, 1], outputRange: [0, maxH] });
  const bodyOpacity = expandAnim.interpolate({ inputRange: [0, 0.12, 1], outputRange: [0, 1, 1] });

  const haptic = (type: 'light' | 'medium' = 'light') => {
    if (Platform.OS === 'web') return;
    if (type === 'medium') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    else void Haptics.selectionAsync();
  };

  const confirmCancel = () => {
    if (!onCancelTrip) return;
    haptic('light');
    Alert.alert(DRIVER_CANCEL_TRIP_ALERT.title, DRIVER_CANCEL_TRIP_ALERT.message, [
      { text: DRIVER_CANCEL_TRIP_ALERT.keep, style: 'cancel' },
      { text: DRIVER_CANCEL_TRIP_ALERT.confirm, style: 'destructive', onPress: onCancelTrip },
    ]);
  };

  return (
    <View style={s.shell}>
      <LinearGradient colors={[WHITE, OFFWHT]} style={StyleSheet.absoluteFillObject} pointerEvents="none" />

      {/* Drag handle */}
      <TouchableOpacity
        style={s.handleHit}
        onPress={() => { haptic(); onToggleExpand?.(); }}
        accessibilityRole="button"
        accessibilityLabel={expanded ? 'Collapse' : 'Expand'}
      >
        <View style={s.handle} />
      </TouchableOpacity>

      {/* ── Status row: live dot + label + ETA pill ────────────────── */}
      <View style={s.statusRow}>
        <LiveDot />
        <View style={{ flex: 1, minWidth: 0, marginLeft: 8 }}>
          <Text style={s.statusKicker}>En route to pickup</Text>
        </View>
        {(etaDisplay || distDisplay) ? (
          <View style={s.etaChip}>
            <Ionicons name="navigate" size={13} color={GREEN} />
            <Text style={s.etaChipTxt}>
              {[etaDisplay, distDisplay ? `(${distDisplay})` : null].filter(Boolean).join(' ')}
            </Text>
          </View>
        ) : null}
      </View>

      {/* ── Arrival alert banner ───────────────────────────────────── */}
      {arrivalEligible && expanded ? (
        <View style={s.arrivalAlert}>
          <View style={s.arrivalAlertDot} />
          <Text style={s.arrivalAlertTxt}>You're at the pickup point — tap "I've Arrived"</Text>
        </View>
      ) : null}

      {!expanded ? (
        <Text style={s.collapsedPeek} numberOfLines={1}>
          {pickupDisplay}{dropDisplay ? ` → ${dropDisplay}` : ''}
        </Text>
      ) : null}

      <Animated.View style={{ maxHeight: bodyHeight, opacity: bodyOpacity, overflow: 'hidden' }}>
      <ScrollView
        style={{ maxHeight: maxH }}
        showsVerticalScrollIndicator={false}
        bounces={false}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={expanded}
      >
        {/* ── Route timeline ─────────────────────────────────────── */}
        <DriverPickupRouteTimeline
          pickupAddress={pickupDisplay}
          pickupMeta={[etaDisplay, distDisplay ? `${distDisplay} away` : null].filter(Boolean).join(' · ') || 'Calculating…'}
          pickupSub={pickupDetailLine}
          dropoffAddress={dropDisplay}
          dropoffMeta={dropoffDetailLine || tripLegLine || undefined}
        />

        {/* ── Rider card ─────────────────────────────────────────── */}
        <View style={s.riderCard}>
          <TripProfileAvatar
            size={52}
            uri={riderPhoto}
            borderColor="rgba(37,99,235,0.3)"
            accessibilityLabel={`Photo of ${driverFirstName(riderName)}`}
          />
          <View style={s.riderMeta}>
            <Text style={s.riderName} numberOfLines={1}>{driverFirstName(riderName)}</Text>
            {typeof ratingAvg === 'number' && ratingAvg > 0 ? (
              <View style={s.ratingRow}>
                <Ionicons name="star" size={12} color="#F59E0B" />
                <Text style={s.ratingTxt}>
                  {ratingAvg.toFixed(1)}
                  {typeof ratingTrips === 'number' && ratingTrips > 0
                    ? ` · ${ratingTrips.toLocaleString()} trips` : ''}
                </Text>
              </View>
            ) : (
              <Text style={s.riderHint}>{isNewRider ? 'New to NexRyde' : 'Your rider'}</Text>
            )}
          </View>
          {/* Comms buttons */}
          <View style={s.commsRow}>
            <TouchableOpacity
              style={[s.commBtn, s.commBtnCall, !riderPhone && s.commBtnOff]}
              onPress={() => { haptic(); onCall(); }}
              disabled={!riderPhone}
              accessibilityRole="button"
              accessibilityLabel="Call rider"
            >
              <Ionicons name="call" size={18} color={riderPhone ? GREEN : DIM} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.commBtn, s.commBtnMsg, !canMessage && s.commBtnOff]}
              onPress={() => { haptic(); onMessage(); }}
              disabled={!canMessage}
              accessibilityRole="button"
              accessibilityLabel="Message rider"
            >
              <Ionicons name="chatbubble-ellipses" size={17} color={canMessage ? BLUE : DIM} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Navigate + Arrived buttons ────────────────────────── */}
        <View style={s.actionRow}>
          <TouchableOpacity
            style={[s.navBtn, tripActionBusy && s.btnOff]}
            onPress={() => { haptic(); onNavigate(); }}
            disabled={!!tripActionBusy}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Open navigation"
          >
            <Ionicons name="navigate" size={18} color={BLUE} />
            <Text style={s.navBtnTxt}>Navigate</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              s.arrivedBtn,
              arrivalEligible && s.arrivedBtnReady,
              tripActionBusy && s.btnOff,
            ]}
            onPress={() => { haptic('medium'); onMarkArrived(); }}
            disabled={!!tripActionBusy}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel="Mark arrived at pickup"
          >
            {tripActionBusy ? (
              <ActivityIndicator color={arrivalEligible ? WHITE : INK} size="small" />
            ) : arrivalEligible ? (
              <LinearGradient colors={['#22C55E', GREEN, '#15803D']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.arrivedGrad}>
                <Ionicons name="checkmark-circle" size={20} color={WHITE} />
                <Text style={[s.arrivedTxt, { color: WHITE }]}>I've Arrived</Text>
              </LinearGradient>
            ) : (
              <View style={s.arrivedGrad}>
                <Ionicons name="location-outline" size={18} color={INK} />
                <Text style={s.arrivedTxt}>I've Arrived</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {onCancelTrip ? (
          <TouchableOpacity
            style={s.cancelBtn}
            onPress={confirmCancel}
            disabled={!!tripActionBusy}
            activeOpacity={0.7}
          >
            <Text style={s.cancelTxt}>Cancel trip</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
      </Animated.View>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  shell: {
    borderTopLeftRadius: DOCK_TOP_RADIUS,
    borderTopRightRadius: DOCK_TOP_RADIUS,
    paddingHorizontal: 18,
    paddingTop: 4,
    paddingBottom: 16,
    overflow: 'hidden',
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: BORDER,
    shadowColor: NAVY,
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 28,
  },
  handleHit: { alignSelf: 'stretch', alignItems: 'center', paddingVertical: 10 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#CBD5E1' },

  // Status row
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  statusKicker: { fontSize: 16, fontWeight: '800', color: NAVY, letterSpacing: -0.2 },
  collapsedPeek: {
    marginBottom: 8,
    fontSize: 13,
    fontWeight: '600',
    color: DIM,
  },
  etaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: GREEN_L,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  etaChipTxt: { fontSize: 12, fontWeight: '800', color: GREEN, fontVariant: ['tabular-nums'] },

  // Arrival alert
  arrivalAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: GREEN_L,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  arrivalAlertDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: GREEN },
  arrivalAlertTxt: { flex: 1, fontSize: 13, fontWeight: '700', color: '#166534' },

  // Rider card
  riderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 12,
    shadowColor: NAVY,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  riderMeta: { flex: 1, minWidth: 0 },
  riderName: { fontSize: 16, fontWeight: '800', color: NAVY, letterSpacing: -0.2 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  ratingTxt: { fontSize: 12, fontWeight: '600', color: '#475569' },
  riderHint: { fontSize: 12, fontWeight: '600', color: DIM, marginTop: 3 },
  commsRow: { flexDirection: 'row', gap: 8 },
  commBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  commBtnCall: { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' },
  commBtnMsg:  { backgroundColor: BLUE_L,   borderColor: '#BFDBFE' },
  commBtnOff:  { opacity: 0.4 },

  // Action row
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  navBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: BLUE_L,
    borderWidth: 1.5,
    borderColor: BLUE,
  },
  navBtnTxt: { fontSize: 14, fontWeight: '800', color: BLUE },
  arrivedBtn: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: '#F8FAFC',
  },
  arrivedBtnReady: {
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
    borderColor: 'transparent',
  },
  arrivedGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    paddingHorizontal: 12,
  },
  arrivedTxt: { fontSize: 15, fontWeight: '900', color: INK },

  cancelBtn: { alignItems: 'center', paddingVertical: 12 },
  cancelTxt: { fontSize: 13, fontWeight: '700', color: '#EF4444' },
  btnOff: { opacity: 0.5 },
});

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Platform,
  Alert,
  ScrollView,
  useWindowDimensions,
  Animated,
  Easing,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { DOCK_TOP_RADIUS } from '@/src/components/driver/driverDockTheme';
import { DriverPickupRouteTimeline } from '@/src/components/driver/DriverPickupRouteTimeline';
import { driverFirstName, DRIVER_CANCEL_TRIP_ALERT } from '@/src/components/driver/driverDockUtils';
import { TripProfileAvatar } from '@/src/components/TripProfileAvatar';

const GREEN = '#16A34A';
const RED = '#EF4444';
const NAVY = '#1E293B';

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

function formatDist(km: number | null): string {
  if (km == null || !Number.isFinite(km)) return '';
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

function formatPickupEta(distanceKm: number | null, etaMin: number | null): string {
  const parts: string[] = [];
  if (etaMin != null) parts.push(`${etaMin} min`);
  const dist = formatDist(distanceKm);
  if (dist) parts.push(`(${dist})`);
  return parts.join(' ') || 'Calculating route…';
}

function formatTripLegMeta(distanceLabel?: string, durationLabel?: string): string {
  const d = distanceLabel?.trim();
  const t = durationLabel?.trim();
  if (d && t) return `${d} • ${t}`;
  return d || t || '';
}

function PulsingLiveDot() {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.45,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <View style={s.liveDotWrap}>
      <Animated.View style={[s.liveDotPulse, { transform: [{ scale: pulse }] }]} />
      <View style={s.liveDot} />
    </View>
  );
}

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
  const pickupDisplay = pickupAddressLine?.trim() || 'Pickup location';
  const dropoffDisplay = dropoffAddressLine?.trim() || 'Destination';
  const pickupMeta = formatPickupEta(distanceKm, etaMin);
  const dropMeta =
    dropoffDetailLine?.trim() || formatTripLegMeta(tripDistanceLabel, tripDurationLabel);

  const hapticLight = () => {
    if (Platform.OS !== 'web') void Haptics.selectionAsync();
  };

  const confirmCancel = () => {
    if (!onCancelTrip) return;
    hapticLight();
    Alert.alert(DRIVER_CANCEL_TRIP_ALERT.title, DRIVER_CANCEL_TRIP_ALERT.message, [
      { text: DRIVER_CANCEL_TRIP_ALERT.keep, style: 'cancel' },
      { text: DRIVER_CANCEL_TRIP_ALERT.confirm, style: 'destructive', onPress: onCancelTrip },
    ]);
  };

  const sheetMaxH = Math.min(380, Math.round(winH * 0.38));

  return (
    <View style={s.shell}>
      <LinearGradient
        colors={['#FFFFFF', '#FAFBFC']}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />

      <Pressable
        onPress={() => {
          hapticLight();
          onToggleExpand?.();
        }}
        style={s.handleHit}
        accessibilityRole="button"
        accessibilityLabel={expanded ? 'Collapse trip sheet' : 'Expand trip sheet'}
      >
        <View style={s.handle} />
      </Pressable>

      <View style={s.statusRow}>
        <PulsingLiveDot />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.statusKicker}>Active trip</Text>
          <Text style={s.statusTitle}>En route to pickup</Text>
        </View>
        {etaMin != null ? (
          <View style={s.etaPill}>
            <Ionicons name="time-outline" size={14} color={GREEN} />
            <Text style={s.etaPillTxt}>{etaMin} min</Text>
          </View>
        ) : null}
      </View>

      {arrivalEligible ? (
        <View style={s.arrivalBanner}>
          <Ionicons name="location" size={16} color={GREEN} />
          <Text style={s.arrivalBannerTxt}>You&apos;re at the pickup — confirm arrival</Text>
        </View>
      ) : null}

      <ScrollView
        style={{ maxHeight: sheetMaxH }}
        showsVerticalScrollIndicator={false}
        bounces={false}
        keyboardShouldPersistTaps="handled"
      >
        <DriverPickupRouteTimeline
          pickupAddress={pickupDisplay}
          pickupMeta={pickupMeta}
          pickupSub={pickupDetailLine}
          dropoffAddress={dropoffDisplay}
          dropoffMeta={dropMeta}
        />

        <View style={s.riderCard}>
          <TripProfileAvatar
            size={56}
            uri={riderPhoto}
            borderColor="rgba(52,245,184,0.45)"
            accessibilityLabel={`Photo of ${driverFirstName(riderName)}`}
          />
          <View style={s.riderMeta}>
            <Text style={s.riderName} numberOfLines={1}>
              {driverFirstName(riderName)}
            </Text>
            {typeof ratingAvg === 'number' && ratingAvg > 0 ? (
              <View style={s.ratingRow}>
                <Ionicons name="star" size={13} color="#FBBF24" />
                <Text style={s.ratingTxt}>
                  {ratingAvg.toFixed(1)}
                  {typeof ratingTrips === 'number' && ratingTrips > 0
                    ? ` · ${ratingTrips.toLocaleString()} trips`
                    : ''}
                </Text>
              </View>
            ) : isNewRider ? (
              <Text style={s.ratingMuted}>New to NEXRYDE</Text>
            ) : (
              <Text style={s.ratingMuted}>Your rider</Text>
            )}
          </View>
          <TouchableOpacity
            style={[s.navOutline, tripActionBusy && s.btnDisabled]}
            onPress={() => {
              hapticLight();
              onNavigate();
            }}
            disabled={!!tripActionBusy}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel="Navigate to pickup"
          >
            <Ionicons name="navigate" size={18} color="#2563EB" />
            <Text style={s.navOutlineTxt}>Navigate</Text>
          </TouchableOpacity>
        </View>

        <View style={s.actionRow}>
          <TouchableOpacity
            style={[s.actionBtn, !riderPhone && s.actionBtnOff]}
            onPress={() => {
              hapticLight();
              onCall();
            }}
            disabled={!riderPhone || !!tripActionBusy}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel="Call rider"
          >
            <Ionicons name="call" size={20} color="#FFF" />
            <Text style={s.actionLbl}>Call</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.actionBtn, !canMessage && s.actionBtnOff]}
            onPress={() => {
              hapticLight();
              onMessage();
            }}
            disabled={!canMessage || !!tripActionBusy}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel="Message rider"
          >
            <Ionicons name="chatbubble" size={19} color="#FFF" />
            <Text style={s.actionLbl}>Message</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              s.actionBtn,
              arrivalEligible ? s.actionBtnReady : null,
              !!tripActionBusy && s.btnDisabled,
            ]}
            onPress={() => {
              if (Platform.OS !== 'web') {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              }
              onMarkArrived();
            }}
            disabled={!!tripActionBusy}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel="Mark arrived at pickup"
          >
            {tripActionBusy ? (
              <ActivityIndicator color={arrivalEligible ? NAVY : '#FFF'} size="small" />
            ) : (
              <>
                <Ionicons
                  name="checkmark-circle"
                  size={20}
                  color={arrivalEligible ? '#FFF' : '#FFF'}
                />
                <Text style={[s.actionLbl, arrivalEligible && s.actionLblReady]} numberOfLines={1}>
                  I&apos;ve arrived
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {onCancelTrip ? (
          <TouchableOpacity
            style={s.cancelBtn}
            onPress={confirmCancel}
            disabled={!!tripActionBusy}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Cancel trip"
          >
            <Text style={s.cancelTxt}>Cancel trip</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  shell: {
    borderTopLeftRadius: DOCK_TOP_RADIUS,
    borderTopRightRadius: DOCK_TOP_RADIUS,
    paddingHorizontal: 18,
    paddingTop: 4,
    paddingBottom: 14,
    overflow: 'hidden',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.14,
    shadowRadius: 24,
    elevation: 28,
  },
  handleHit: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingVertical: 10,
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#CBD5E1',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  liveDotWrap: {
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveDotPulse: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(34,197,94,0.35)',
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: GREEN,
  },
  statusKicker: {
    fontSize: 10,
    fontWeight: '800',
    color: GREEN,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  statusTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.35,
    marginTop: 1,
  },
  etaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  etaPillTxt: {
    fontSize: 13,
    fontWeight: '800',
    color: GREEN,
    fontVariant: ['tabular-nums'],
  },
  arrivalBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ECFDF5',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  arrivalBannerTxt: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#166534',
  },
  riderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E2E8F0',
  },
  avatarPh: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPhTxt: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1D4ED8',
  },
  riderMeta: {
    flex: 1,
    minWidth: 0,
  },
  riderName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  ratingTxt: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  ratingMuted: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94A3B8',
    marginTop: 3,
  },
  navOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  navOutlineTxt: {
    fontSize: 13,
    fontWeight: '800',
    color: '#2563EB',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  actionBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: NAVY,
    minHeight: 58,
  },
  actionBtnReady: {
    backgroundColor: GREEN,
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  actionBtnOff: {
    opacity: 0.45,
  },
  actionLbl: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFF',
  },
  actionLblReady: {
    fontWeight: '800',
  },
  btnDisabled: {
    opacity: 0.55,
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 4,
  },
  cancelTxt: {
    fontSize: 14,
    fontWeight: '700',
    color: RED,
  },
});

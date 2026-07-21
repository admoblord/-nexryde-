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
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import {
  DOCK_BLUR_INTENSITY,
  DOCK_TOP_RADIUS,
  DOCK_METRIC_CHIP,
  HANDLE_GRADIENT_DEFAULT,
} from '@/src/components/driver/driverDockTheme';
import {
  driverFirstName,
  DRIVER_CANCEL_TRIP_ALERT,
  formatPickupWaitPeek,
} from '@/src/components/driver/driverDockUtils';
import { TripProfileAvatar } from '@/src/components/TripProfileAvatar';

const GREEN = '#22C55E';
const RED = '#EF4444';
const MUTED = '#9CA3AF';
const INK = '#022C22';

export type DriverArrivedPickupDockProps = {
  expanded: boolean;
  onToggleExpand: () => void;
  riderName: string;
  riderPhoto: string | null;
  ratingAvg: number | null;
  ratingTrips: number | null;
  isNewRider: boolean;
  waitingSec: number;
  pickupAddressLine: string;
  pickupDetailLine: string;
  destinationAddressLine: string;
  destinationDetailLine: string;
  routeDistanceLabel: string;
  routeDurationLabel: string;
  tripActionBusy: boolean;
  pickupCodeRequired?: boolean;
  riderPhone: string | null;
  canMessage: boolean;
  onVerifyPickupCode: () => void;
  onStartTrip?: () => void;
  onNavigateToPickup?: () => void;
  onNavigateToDestination?: () => void;
  /** Shown after free wait — cancel as rider no-show. */
  onRiderNoShow?: () => void;
  onCall: () => void;
  onMessage: () => void;
  onSafetyPress: () => void;
  onCancelTrip?: () => void;
};

function PulsingDot() {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.35,
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
    <View style={s.dotWrap}>
      <Animated.View style={[s.dotPulse, { transform: [{ scale: pulse }] }]} />
      <View style={s.statusDot} />
    </View>
  );
}

function TripRouteTimeline({
  pickupAddress,
  pickupDetail,
  destinationAddress,
  destinationDetail,
  onNavPickup,
  onNavDest,
  disabled,
}: {
  pickupAddress: string;
  pickupDetail: string;
  destinationAddress: string;
  destinationDetail: string;
  onNavPickup?: () => void;
  onNavDest?: () => void;
  disabled?: boolean;
}) {
  return (
    <View style={s.timelineCard}>
      <LinearGradient
        colors={['rgba(34,197,94,0.08)', 'transparent']}
        style={s.timelineSheen}
        pointerEvents="none"
      />
      <View style={s.timelineRow}>
        <View style={s.timelineRail}>
          <View style={[s.timelineDot, { backgroundColor: GREEN }]} />
          <View style={s.timelineLine} />
          <View style={[s.timelineDot, { backgroundColor: RED }]} />
        </View>
        <View style={s.timelineBody}>
          <View style={s.timelineStop}>
            <View style={s.timelineStopHead}>
              <Text style={s.addrLabel}>Pickup</Text>
              {onNavPickup ? (
                <TouchableOpacity
                  style={[s.navMini, disabled && s.navMiniOff]}
                  onPress={onNavPickup}
                  disabled={disabled}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="navigate" size={16} color={disabled ? '#64748B' : '#60A5FA'} />
                </TouchableOpacity>
              ) : null}
            </View>
            <Text style={s.addrMain} numberOfLines={3}>
              {pickupAddress || '—'}
            </Text>
            {pickupDetail ? (
              <Text style={s.addrSub} numberOfLines={2}>
                {pickupDetail}
              </Text>
            ) : null}
          </View>
          <View style={[s.timelineStop, { marginTop: 16 }]}>
            <View style={s.timelineStopHead}>
              <Text style={s.addrLabel}>Drop-off</Text>
              {onNavDest ? (
                <TouchableOpacity
                  style={[s.navMini, disabled && s.navMiniOff]}
                  onPress={onNavDest}
                  disabled={disabled}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="navigate" size={16} color={disabled ? '#64748B' : '#60A5FA'} />
                </TouchableOpacity>
              ) : null}
            </View>
            <Text style={s.addrMain} numberOfLines={3}>
              {destinationAddress || '—'}
            </Text>
            {destinationDetail ? (
              <Text style={s.addrSub} numberOfLines={2}>
                {destinationDetail}
              </Text>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
}

function RouteMetrics({ distance, duration }: { distance: string; duration: string }) {
  return (
    <View style={s.metricsRow}>
      <View style={s.metricChip}>
        <Ionicons name="resize-outline" size={14} color={GREEN} />
        <Text style={s.metricVal}>{distance}</Text>
        <Text style={s.metricLbl}>Distance</Text>
      </View>
      <View style={s.metricChip}>
        <Ionicons name="time-outline" size={14} color="#60A5FA" />
        <Text style={s.metricVal}>{duration}</Text>
        <Text style={s.metricLbl}>Est. time</Text>
      </View>
    </View>
  );
}

export default function DriverArrivedPickupDock({
  expanded,
  onToggleExpand,
  riderName,
  riderPhoto,
  ratingAvg,
  ratingTrips,
  isNewRider,
  waitingSec,
  pickupAddressLine,
  pickupDetailLine,
  destinationAddressLine,
  destinationDetailLine,
  routeDistanceLabel,
  routeDurationLabel,
  tripActionBusy,
  pickupCodeRequired = false,
  riderPhone,
  canMessage,
  onVerifyPickupCode,
  onStartTrip,
  onNavigateToPickup,
  onNavigateToDestination,
  onRiderNoShow,
  onCall,
  onMessage,
  onSafetyPress,
  onCancelTrip,
}: DriverArrivedPickupDockProps) {
  const { height: winH } = useWindowDimensions();
  const waitLabel = formatPickupWaitPeek(waitingSec);
  const expandedMaxH = Math.round(winH * 0.52);
  const resolvedPhoto = riderPhoto;
  const expandAnim = useRef(new Animated.Value(expanded ? 1 : 0)).current;
  const bodyMaxH = Math.max(0, expandedMaxH);

  useEffect(() => {
    Animated.timing(expandAnim, {
      toValue: expanded ? 1 : 0,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [expanded, expandAnim]);

  const expandedBodyHeight = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, bodyMaxH],
  });
  const expandedBodyOpacity = expandAnim.interpolate({
    inputRange: [0, 0.15, 1],
    outputRange: [0, 1, 1],
  });

  const toggleExpand = () => {
    if (Platform.OS !== 'web') void Haptics.selectionAsync();
    onToggleExpand();
  };

  const confirmCancel = () => {
    if (!onCancelTrip) return;
    Alert.alert(DRIVER_CANCEL_TRIP_ALERT.title, DRIVER_CANCEL_TRIP_ALERT.message, [
      { text: DRIVER_CANCEL_TRIP_ALERT.keep, style: 'cancel' },
      { text: DRIVER_CANCEL_TRIP_ALERT.confirm, style: 'destructive', onPress: onCancelTrip },
    ]);
  };

  const primaryAction = pickupCodeRequired ? onVerifyPickupCode : onStartTrip ?? onVerifyPickupCode;

  return (
    <View style={s.shell}>
      {Platform.OS === 'ios' || Platform.OS === 'android' ? (
        <BlurView intensity={DOCK_BLUR_INTENSITY} tint="dark" style={StyleSheet.absoluteFillObject} />
      ) : null}
      <LinearGradient
        colors={['rgba(26,26,26,0.98)', '#141414', '#0a0a0a']}
        style={StyleSheet.absoluteFillObject}
      />

      <TouchableOpacity
        style={s.handleHit}
        onPress={toggleExpand}
        activeOpacity={0.92}
        accessibilityRole="button"
        accessibilityLabel={expanded ? 'Collapse trip details' : 'Expand trip details'}
        accessibilityState={{ expanded }}
      >
        <View style={s.handleGrad} />
        <View style={s.peekRow}>
          <View style={s.peekLeft}>
            <PulsingDot />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.peekStatus}>At pickup</Text>
              {!expanded ? (
                <Text style={s.peekHint} numberOfLines={1}>
                  {driverFirstName(riderName)} is waiting
                </Text>
              ) : null}
            </View>
          </View>
          <View style={s.peekTimeCol}>
            <Ionicons name="time-outline" size={13} color={waitingSec > 180 ? '#F87171' : waitingSec > 90 ? '#FBBF24' : MUTED} />
            <Text style={[s.peekTime, waitingSec > 180 && { color: '#F87171' }, waitingSec > 90 && waitingSec <= 180 && { color: '#FBBF24' }]}>
              {waitLabel}
            </Text>
          </View>
          <Ionicons
            name={expanded ? 'chevron-down' : 'chevron-up'}
            size={20}
            color="#94A3B8"
          />
        </View>
      </TouchableOpacity>

      <Animated.View style={{ maxHeight: expandedBodyHeight, opacity: expandedBodyOpacity, overflow: 'hidden' }}>
        <ScrollView
          style={{ maxHeight: bodyMaxH }}
          contentContainerStyle={s.scrollInner}
          showsVerticalScrollIndicator={false}
          bounces={false}
          scrollEnabled={expanded}
        >
          <RouteMetrics distance={routeDistanceLabel} duration={routeDurationLabel} />

          <TripRouteTimeline
            pickupAddress={pickupAddressLine}
            pickupDetail={pickupDetailLine}
            destinationAddress={destinationAddressLine}
            destinationDetail={destinationDetailLine}
            onNavPickup={onNavigateToPickup}
            onNavDest={onNavigateToDestination ?? onNavigateToPickup}
            disabled={!!tripActionBusy}
          />

          <View style={s.riderCard}>
            <TripProfileAvatar
              size={64}
              uri={resolvedPhoto}
              borderColor="#FFFFFF"
              borderWidth={2.5}
              accessibilityLabel={`Photo of ${driverFirstName(riderName)}`}
            />
            <View style={s.riderMeta}>
              <Text style={s.riderName} numberOfLines={1}>
                {driverFirstName(riderName)}
              </Text>
              {typeof ratingAvg === 'number' && ratingAvg > 0 ? (
                <View style={s.ratingRow}>
                  <Ionicons name="star" size={12} color="#FBBF24" />
                  <Text style={s.ratingTxt}>
                    {ratingAvg.toFixed(1)}
                    {typeof ratingTrips === 'number' && ratingTrips > 0
                      ? ` · ${ratingTrips.toLocaleString()} rides`
                      : ''}
                  </Text>
                </View>
              ) : isNewRider ? (
                <Text style={s.riderHint}>New rider</Text>
              ) : (
                <Text style={s.riderHint}>
                  {pickupCodeRequired ? 'Ask for their 4-digit code' : 'Confirm it’s your rider'}
                </Text>
              )}
            </View>
          </View>

          <TouchableOpacity
            style={[s.verifyBtnOuter, tripActionBusy && s.btnDisabled]}
            onPress={primaryAction}
            disabled={!!tripActionBusy}
            activeOpacity={0.9}
            accessibilityRole="button"
            accessibilityLabel={pickupCodeRequired ? 'Verify pickup code' : 'Start trip'}
          >
            <LinearGradient
              colors={pickupCodeRequired ? ['#00E087', '#00D47E', '#00B368'] : ['#60A5FA', '#3B82F6', '#2563EB']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={s.verifyBtn}
            >
              {tripActionBusy ? (
                <ActivityIndicator color={INK} size="large" />
              ) : (
                <>
                  <View style={s.verifyIconWrap}>
                    <Ionicons
                      name={pickupCodeRequired ? 'keypad-outline' : 'play-circle'}
                      size={26}
                      color={INK}
                    />
                  </View>
                  <View style={s.verifyTextCol}>
                    <Text style={s.verifyTitle}>
                      {pickupCodeRequired ? 'Verify code & start' : 'Start trip'}
                    </Text>
                    <Text style={s.verifySub}>
                      {pickupCodeRequired
                        ? 'Enter the 4-digit code from their app'
                        : 'Fare starts when you begin the trip'}
                    </Text>
                  </View>
                  <View style={s.verifyArrow}>
                    <Ionicons name="arrow-forward" size={18} color="rgba(2,44,34,0.6)" />
                  </View>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          <View style={s.actionRow}>
            <TouchableOpacity
              style={[s.actionBtn, s.actionCall, !riderPhone && s.actionOff]}
              onPress={onCall}
              disabled={!riderPhone || !!tripActionBusy}
              activeOpacity={0.88}
              accessibilityRole="button"
              accessibilityLabel="Call rider"
            >
              <Ionicons name="call" size={20} color="#F8FAFC" />
              <Text style={s.actionLbl}>Call</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.actionBtn, s.actionMsg, !canMessage && s.actionOff]}
              onPress={onMessage}
              disabled={!canMessage || !!tripActionBusy}
              activeOpacity={0.88}
              accessibilityRole="button"
              accessibilityLabel="Message rider"
            >
              <Ionicons name="chatbubble" size={19} color="#F8FAFC" />
              <Text style={s.actionLbl}>Message</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.actionBtn, s.actionDir, !onNavigateToPickup && s.actionOff]}
              onPress={onNavigateToPickup}
              disabled={!onNavigateToPickup || !!tripActionBusy}
              activeOpacity={0.88}
              accessibilityRole="button"
              accessibilityLabel="Open directions"
            >
              <Ionicons name="navigate" size={20} color="#F8FAFC" />
              <Text style={s.actionLbl}>Directions</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={s.safetyRow} onPress={onSafetyPress} activeOpacity={0.88}>
            <Ionicons name="shield-checkmark" size={18} color={GREEN} />
            <Text style={s.safetyTxt}>
              <Text style={s.safetyStrong}>Safety: </Text>
              Match name and photo before you start
            </Text>
            <Ionicons name="chevron-forward" size={16} color={MUTED} />
          </TouchableOpacity>

          {onRiderNoShow ? (
            <TouchableOpacity
              style={s.noShowBtn}
              onPress={() => {
                Alert.alert(
                  'Rider no-show?',
                  'Free wait has ended. Cancel this trip as a no-show only if the rider never arrived.',
                  [
                    { text: 'Keep waiting', style: 'cancel' },
                    { text: 'Rider no-show', style: 'destructive', onPress: onRiderNoShow },
                  ],
                );
              }}
              disabled={!!tripActionBusy}
              activeOpacity={0.88}
              accessibilityRole="button"
              accessibilityLabel="Rider no-show"
            >
              <Ionicons name="person-remove-outline" size={18} color="#FBBF24" />
              <View style={{ flex: 1 }}>
                <Text style={s.noShowTitle}>Rider no-show</Text>
                <Text style={s.noShowSub}>Free wait ended · cancel as no-show</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={MUTED} />
            </TouchableOpacity>
          ) : null}

          {onCancelTrip ? (
            <TouchableOpacity
              style={s.cancelBtn}
              onPress={confirmCancel}
              disabled={!!tripActionBusy}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Cancel trip"
            >
              <Ionicons name="warning" size={18} color={RED} />
              <Text style={s.cancelTxt}>Cancel trip</Text>
            </TouchableOpacity>
          ) : null}
        </ScrollView>
      </Animated.View>
      {!expanded ? (
        <View style={s.collapsedQuick}>
          {!pickupCodeRequired && onStartTrip ? (
            <TouchableOpacity
              style={s.collapsedCta}
              onPress={onStartTrip}
              disabled={!!tripActionBusy}
              activeOpacity={0.9}
            >
              <Text style={s.collapsedCtaTxt}>Start trip</Text>
              <Ionicons name="arrow-forward" size={16} color={INK} />
            </TouchableOpacity>
          ) : (
            <Text style={s.collapsedRoutePreview} numberOfLines={1}>
              {routeDistanceLabel} to destination · {routeDurationLabel}
            </Text>
          )}
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  shell: {
    borderTopLeftRadius: DOCK_TOP_RADIUS,
    borderTopRightRadius: DOCK_TOP_RADIUS,
    overflow: 'hidden',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 28,
  },
  handleHit: {
    paddingTop: 10,
    paddingBottom: 10,
    paddingHorizontal: 18,
  },
  handleGrad: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginBottom: 12,
  },
  peekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  peekLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  dotWrap: {
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotPulse: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(34,197,94,0.35)',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: GREEN,
  },
  peekStatus: {
    fontSize: 13,
    fontWeight: '800',
    color: GREEN,
    letterSpacing: 0.2,
  },
  peekHint: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '600',
    color: MUTED,
  },
  peekTimeCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  peekTime: {
    fontSize: 13,
    fontWeight: '800',
    color: '#F8FAFC',
    fontVariant: ['tabular-nums'],
  },
  collapsedQuick: {
    paddingHorizontal: 18,
    paddingBottom: 12,
  },
  collapsedRoutePreview: {
    fontSize: 12,
    fontWeight: '600',
    color: MUTED,
    textAlign: 'center',
  },
  collapsedCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: GREEN,
    borderRadius: 12,
    paddingVertical: 12,
  },
  collapsedCtaTxt: {
    fontSize: 15,
    fontWeight: '900',
    color: INK,
  },
  scrollInner: {
    paddingHorizontal: 18,
    paddingBottom: 16,
    gap: 14,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  metricChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 14,
    backgroundColor: DOCK_METRIC_CHIP.bg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: DOCK_METRIC_CHIP.border,
    gap: 4,
  },
  metricVal: {
    fontSize: 16,
    fontWeight: '900',
    color: DOCK_METRIC_CHIP.value,
    letterSpacing: -0.3,
  },
  metricLbl: {
    fontSize: 10,
    fontWeight: '800',
    color: DOCK_METRIC_CHIP.label,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  timelineCard: {
    borderRadius: 16,
    padding: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  timelineSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 48,
  },
  timelineRow: {
    flexDirection: 'row',
    gap: 12,
  },
  timelineRail: {
    width: 14,
    alignItems: 'center',
    paddingTop: 4,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#FFF',
  },
  timelineLine: {
    flex: 1,
    width: 2,
    minHeight: 36,
    marginVertical: 4,
    backgroundColor: 'rgba(148,163,184,0.35)',
    borderRadius: 1,
  },
  timelineBody: {
    flex: 1,
    minWidth: 0,
  },
  timelineStop: {},
  timelineStopHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  navMini: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(59,130,246,0.15)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(96,165,250,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navMiniOff: {
    opacity: 0.4,
  },
  addrLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: MUTED,
    letterSpacing: 0.2,
  },
  addrMain: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 21,
  },
  addrSub: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: '600',
    color: MUTED,
    lineHeight: 17,
  },
  riderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#1E293B',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  avatarPh: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  avatarPhTxt: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FFF',
  },
  riderMeta: {
    flex: 1,
    minWidth: 0,
  },
  riderName: {
    fontSize: 18,
    fontWeight: '900',
    color: '#F8FAFC',
    letterSpacing: -0.3,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  ratingTxt: {
    fontSize: 13,
    fontWeight: '600',
    color: MUTED,
  },
  riderHint: {
    fontSize: 13,
    fontWeight: '600',
    color: MUTED,
    marginTop: 4,
  },
  verifyBtnOuter: {
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 10,
  },
  verifyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 18,
    paddingHorizontal: 16,
    minHeight: 72,
  },
  verifyIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifyArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifyTextCol: {
    flex: 1,
    minWidth: 0,
  },
  verifyTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: INK,
    letterSpacing: -0.3,
  },
  verifySub: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(2,44,34,0.72)',
    lineHeight: 17,
  },
  btnDisabled: {
    opacity: 0.55,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 14,
    minHeight: 66,
    borderWidth: StyleSheet.hairlineWidth,
  },
  actionCall: {
    backgroundColor: 'rgba(34,197,94,0.16)',
    borderColor: 'rgba(34,197,94,0.38)',
  },
  actionMsg: {
    backgroundColor: 'rgba(59,130,246,0.16)',
    borderColor: 'rgba(59,130,246,0.38)',
  },
  actionDir: {
    backgroundColor: 'rgba(59,130,246,0.1)',
    borderColor: 'rgba(59,130,246,0.28)',
  },
  actionOff: {
    opacity: 0.4,
  },
  actionLbl: {
    fontSize: 11,
    fontWeight: '800',
    color: '#E2E8F0',
  },
  safetyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(34,197,94,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(34,197,94,0.24)',
  },
  safetyTxt: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#CBD5E1',
    lineHeight: 17,
  },
  safetyStrong: {
    fontWeight: '800',
    color: '#86EFAC',
  },
  noShowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(251,191,36,0.1)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(251,191,36,0.35)',
    marginBottom: 8,
  },
  noShowTitle: { fontSize: 14, fontWeight: '800', color: '#FDE68A' },
  noShowSub: { fontSize: 11, fontWeight: '600', color: '#94A3B8', marginTop: 2 },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(239,68,68,0.32)',
  },
  cancelTxt: {
    fontSize: 15,
    fontWeight: '800',
    color: RED,
  },
});

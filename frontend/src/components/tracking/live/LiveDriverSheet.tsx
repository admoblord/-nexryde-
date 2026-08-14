/**
 * LiveDriverSheet — premium draggable bottom sheet for driver info.
 *
 * Phase-aware design (Uber study):
 *   accepted  → ETA + driver info, call/message/share actions
 *   arrived   → amber "ARRIVED" badge, pickup code prominent, vehicle ID help
 *   ongoing   → destination ETA, trip in progress
 */
import React, { memo, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  PanResponder,
  ScrollView,
  Platform,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { TripProfileAvatar } from '@/src/components/TripProfileAvatar';
import { LIVE, liveGlassCard } from '@/src/components/tracking/live/liveTrackingTheme';
import { LIVE_LAYOUT } from '@/src/components/tracking/live/liveTrackingLayout';
import { VehicleStrip } from '@/src/components/trip/PersonRow';
import { arrivalClockTime } from '@/src/components/trip/MapBadge';
import { colors, alpha } from '@/src/theme/tokens';

type TripPhase = 'accepted' | 'arrived' | 'ongoing';

type Props = {
  bottomInset: number;
  tripPhase: TripPhase;
  driverName: string;
  vehicle: string;
  plate: string | null;
  vehicleColor: string | null;
  photoUri: string | null;
  rating: number | null;
  totalTrips: number | null;
  verified: boolean;
  etaMinutes: number | null;
  distanceKm: number | null;
  arrived: boolean;
  hydrated: boolean;
  pickupCode: string | null;
  showPickupCode: boolean;
  callEnabled: boolean;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onCall: () => void;
  onChat: () => void;
  onShare: () => void;
  onPickupCode: () => void;
  onSos: () => void;
  destEtaMinutes?: number | null;
  destAddress?: string | null;
  /** Uber: cancel always available until trip starts */
  canCancel?: boolean;
  onCancel?: () => void;
  cancelFeeNote?: string | null;
  /** Ongoing: change destination / add stop / split fare */
  canEditRoute?: boolean;
  onChangeDestination?: () => void;
  onAddStop?: () => void;
  canSplitFare?: boolean;
  onSplitFare?: () => void;
  waitCard?: React.ReactElement | null;
};

function fmtEta(minutes: number | null): string {
  if (minutes == null || !Number.isFinite(minutes)) return '—';
  if (minutes <= 0) return 'Now';
  return `${minutes} min`;
}

function fmtKm(km: number | null): string {
  if (km == null || !Number.isFinite(km)) return '';
  return km < 1 ? `${Math.max(50, Math.round(km * 1000))} m` : `${km.toFixed(1)} km`;
}

// Phase badge in collapsed row
function PhaseBadge({ phase }: { phase: TripPhase }) {
  if (phase === 'arrived') {
    return (
      <View style={badgeStyles.arrived}>
        <View style={badgeStyles.arrivedDot} />
        <Text style={badgeStyles.arrivedTxt}>Here</Text>
      </View>
    );
  }
  if (phase === 'ongoing') {
    return (
      <View style={badgeStyles.ongoing}>
        <View style={badgeStyles.ongoingDot} />
        <Text style={badgeStyles.ongoingTxt}>On trip</Text>
      </View>
    );
  }
  return (
    <View style={badgeStyles.accepted}>
      <View style={badgeStyles.acceptedDot} />
      <Text style={badgeStyles.acceptedTxt}>Arriving</Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  arrived: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
    backgroundColor: alpha.amberSoft,
  },
  arrivedDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.amber },
  arrivedTxt: { fontSize: 11, fontWeight: '900', color: colors.amber, letterSpacing: 0.2 },
  ongoing: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
    backgroundColor: alpha.blueSoft,
  },
  ongoingDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.blue },
  ongoingTxt: { fontSize: 11, fontWeight: '900', color: colors.blue, letterSpacing: 0.2 },
  accepted: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
    backgroundColor: alpha.greenSoft,
  },
  acceptedDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.green },
  acceptedTxt: { fontSize: 11, fontWeight: '900', color: colors.greenDark, letterSpacing: 0.2 },
});

function LiveDriverSheetInner({
  bottomInset,
  tripPhase,
  driverName,
  vehicle,
  plate,
  vehicleColor,
  photoUri,
  rating,
  totalTrips,
  verified,
  etaMinutes,
  distanceKm,
  arrived,
  hydrated,
  pickupCode,
  showPickupCode,
  callEnabled,
  isFavorite,
  onToggleFavorite,
  onCall,
  onChat,
  onShare,
  onPickupCode,
  onSos,
  destEtaMinutes,
  destAddress,
  canCancel = false,
  onCancel,
  cancelFeeNote,
  canEditRoute = false,
  onChangeDestination,
  onAddStop,
  canSplitFare = false,
  onSplitFare,
  waitCard,
}: Props) {
  const expandedH = LIVE_LAYOUT.sheetExpandedH + bottomInset;
  const collapsedH = LIVE_LAYOUT.sheetCollapsedH + bottomInset;
  const dragRange = expandedH - collapsedH;

  const sheetY = useRef(new Animated.Value(dragRange)).current;
  const expandedRef = useRef(false);

  const snapTo = useCallback(
    (open: boolean) => {
      expandedRef.current = open;
      Animated.spring(sheetY, {
        toValue: open ? 0 : dragRange,
        useNativeDriver: true,
        tension: 68,
        friction: 12,
      }).start();
      if (Platform.OS !== 'web') {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    },
    [dragRange, sheetY],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 6,
        onPanResponderMove: (_e, g) => {
          const base = expandedRef.current ? 0 : dragRange;
          const next = Math.max(0, Math.min(dragRange, base + g.dy));
          sheetY.setValue(next);
        },
        onPanResponderRelease: (_e, g) => {
          const open = g.dy < -30 || (expandedRef.current && g.dy < 40);
          snapTo(open);
        },
      }),
    [dragRange, sheetY, snapTo],
  );

  const displayName = hydrated ? driverName : 'Your driver';
  const displayVehicle = hydrated && vehicle !== 'Vehicle' ? vehicle : 'Loading…';
  const displayPlate = hydrated && plate ? plate.toUpperCase() : null;

  // Collapsed row right-side value — phase specific
  const collapsedRight = (() => {
    if (tripPhase === 'arrived') return { top: 'Here', sub: 'Pickup' };
    if (tripPhase === 'ongoing') {
      return destEtaMinutes != null && destEtaMinutes > 0
        ? { top: arrivalClockTime(destEtaMinutes), sub: 'Arrive by' }
        : { top: 'On trip', sub: 'Dropoff' };
    }
    return { top: fmtEta(etaMinutes), sub: 'ETA' };
  })();

  const topBorderColor = tripPhase === 'arrived'
    ? 'rgba(245,158,11,0.4)'
    : tripPhase === 'ongoing'
      ? 'rgba(56,189,248,0.25)'
      : LIVE.glassBorder;


  return (
    <Animated.View
      style={[
        styles.sheet,
        liveGlassCard,
        {
          height: expandedH,
          paddingBottom: bottomInset,
          transform: [{ translateY: sheetY }],
          borderTopColor: topBorderColor,
          borderTopWidth: 1.5,
        },
      ]}
    >
      {/* Grabber */}
      <View style={styles.grabberRow} {...panResponder.panHandlers}>
        <View style={styles.grabber} />
      </View>

      {/*
        Peek row — the ONLY place the driver's photo, name and plate appear.
        The expanded card below used to repeat all three, so an open sheet showed
        the same driver twice.
      */}
      <TouchableOpacity
        style={styles.collapsed}
        activeOpacity={0.92}
        onPress={() => snapTo(!expandedRef.current)}
        accessibilityRole="button"
        accessibilityLabel="Expand driver details"
      >
        <View style={styles.collapsedAvatar}>
          <TripProfileAvatar
            size={LIVE_LAYOUT.collapsedPhoto}
            uri={photoUri}
            borderColor="#FFFFFF"
            borderWidth={2.5}
            showOnlineDot={tripPhase !== 'ongoing'}
            accessibilityLabel={`Photo of ${displayName}`}
          />
        </View>
        <View style={styles.collapsedLeft}>
          <Text style={styles.collapsedName} numberOfLines={1}>{displayName}</Text>
          <View style={styles.collapsedBadgeRow}>
            <PhaseBadge phase={tripPhase} />
            {displayPlate ? (
              <View style={styles.collapsedPlateChip}>
                <Text style={styles.collapsedPlateTxt} numberOfLines={1}>{displayPlate}</Text>
              </View>
            ) : null}
          </View>
        </View>
        <View style={styles.collapsedEta}>
          <Text style={[
            styles.collapsedEtaVal,
            tripPhase === 'arrived' && { color: colors.amber },
            tripPhase === 'ongoing' && { color: colors.navy },
          ]} numberOfLines={1}>{collapsedRight.top}</Text>
          <Text style={styles.collapsedEtaSub} numberOfLines={1}>{collapsedRight.sub}</Text>
        </View>
        <Ionicons name="chevron-up" size={18} color={LIVE.faint} />
      </TouchableOpacity>

      {/* Expanded content */}
      <ScrollView
        style={styles.expandedScroll}
        contentContainerStyle={styles.expandedContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/*
          Credentials + status only. The photo, name and plate stay in the peek
          row above so the driver is never shown twice.
        */}
        <View style={styles.profileRow}>
          <View style={styles.profileMeta}>
            <View style={styles.ratingRow}>
              <Ionicons name="star" size={14} color={LIVE.gold} />
              <Text style={styles.ratingTxt}>
                {rating != null && rating > 0 ? rating.toFixed(1) : '—'}
              </Text>
              <Text style={styles.tripsTxt}>
                {totalTrips != null && totalTrips > 0 ? `${totalTrips} trips` : '— trips'}
              </Text>
              {verified ? (
                <View style={styles.verifiedBadge}>
                  <MaterialCommunityIcons name="shield-check" size={12} color={LIVE.greenInk} />
                  <Text style={styles.verifiedTxt}>Verified</Text>
                </View>
              ) : null}
              <View style={styles.profileSpacer} />
              <TouchableOpacity
                onPress={onToggleFavorite}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={isFavorite ? 'Remove favourite driver' : 'Save as favourite driver'}
              >
                <Ionicons
                  name={isFavorite ? 'heart' : 'heart-outline'}
                  size={20}
                  color={isFavorite ? LIVE.red : LIVE.faint}
                />
              </TouchableOpacity>
            </View>
            {/* Phase status line */}
            <Text style={[styles.phaseLine, tripPhase === 'arrived' && { color: colors.amber }, tripPhase === 'ongoing' && { color: colors.blue }]} numberOfLines={1}>
              {tripPhase === 'arrived'
                ? 'Meet them at your pickup point'
                : tripPhase === 'ongoing'
                  ? destAddress ? `To ${destAddress}` : 'Heading to drop-off'
                  : etaMinutes != null && etaMinutes > 0
                    ? `${etaMinutes} min away · ${fmtKm(distanceKm)}`
                    : 'On the way to you'}
            </Text>
          </View>
        </View>

        {/* Arrived / accepted: pickup code first (Uber priority) */}
        {showPickupCode && pickupCode ? (
          <TouchableOpacity
            style={styles.pickupCodeCard}
            onPress={onPickupCode}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel={`Pickup code ${pickupCode}`}
          >
            <LinearGradient
              colors={['rgba(34,225,128,0.16)', 'rgba(34,225,128,0.06)']}
              style={styles.pickupCodeGrad}
            >
              <View style={styles.pickupCodeLeft}>
                <Ionicons name="shield-checkmark" size={22} color={LIVE.green} />
                <View>
                  <Text style={styles.pickupCodeLabel}>Show this code to your driver</Text>
                  <Text style={styles.pickupCodeValue}>{pickupCode}</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={LIVE.green} />
            </LinearGradient>
          </TouchableOpacity>
        ) : null}

        {waitCard}

        {/* Destination card when ongoing — above vehicle grid */}
        {tripPhase === 'ongoing' && destAddress ? (
          <View style={styles.destCard}>
            <Ionicons name="flag" size={18} color={LIVE.blue} />
            <View style={styles.destTextCol}>
              <Text style={styles.destLabel}>Destination</Text>
              <Text style={styles.destValue} numberOfLines={2}>{destAddress}</Text>
              {destEtaMinutes != null && destEtaMinutes > 0 ? (
                <Text style={styles.destEta}>Arrive by {arrivalClockTime(destEtaMinutes)}</Text>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* Vehicle identification */}
        <View style={styles.vehicleSection}>
          <Text style={styles.vehicleSectionLabel}>
            {tripPhase === 'arrived' ? 'Look for this car' : 'Your vehicle'}
          </Text>
          <VehicleStrip model={displayVehicle} colour={vehicleColor} plate={displayPlate} />
        </View>

        {/* Action buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionBtn, !callEnabled && styles.actionDisabled]}
            onPress={onCall}
            disabled={!callEnabled}
            accessibilityRole="button"
            accessibilityLabel="Call driver"
          >
            <Ionicons name="call" size={20} color={callEnabled ? LIVE.greenInk : LIVE.faint} />
            <Text style={[styles.actionTxt, !callEnabled && styles.actionTxtDisabled]}>Call</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={onChat} accessibilityRole="button" accessibilityLabel="Message driver">
            <Ionicons name="chatbubble-ellipses" size={20} color={LIVE.greenInk} />
            <Text style={styles.actionTxt}>Message</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={onShare} accessibilityRole="button" accessibilityLabel="Share trip">
            <Ionicons name="share-social" size={20} color={LIVE.greenInk} />
            <Text style={styles.actionTxt}>Share</Text>
          </TouchableOpacity>
        </View>

        {canEditRoute && tripPhase === 'ongoing' ? (
          <View style={styles.routeEditRow}>
            <TouchableOpacity style={styles.routeEditBtn} onPress={onChangeDestination} accessibilityRole="button">
              <Ionicons name="navigate-outline" size={16} color={LIVE.blue} />
              <Text style={styles.routeEditTxt}>Change destination</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.routeEditBtn} onPress={onAddStop} accessibilityRole="button">
              <Ionicons name="add-circle-outline" size={16} color="#F59E0B" />
              <Text style={styles.routeEditTxt}>Add stop</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {canSplitFare && tripPhase === 'ongoing' && onSplitFare ? (
          <TouchableOpacity style={styles.splitRow} onPress={onSplitFare} activeOpacity={0.88} accessibilityRole="button">
            <Ionicons name="people-outline" size={18} color={LIVE.green} />
            <Text style={styles.splitTxt}>Split fare with friends</Text>
            <Ionicons name="chevron-forward" size={16} color={LIVE.faint} />
          </TouchableOpacity>
        ) : null}

        {/* Safety tools */}
        <TouchableOpacity style={styles.safetyRow} onPress={onSos} activeOpacity={0.88} accessibilityRole="button">
          <Ionicons name="warning" size={18} color={LIVE.red} />
          <Text style={styles.safetyTxt}>Safety tools and SOS</Text>
          <Ionicons name="chevron-forward" size={16} color={LIVE.faint} />
        </TouchableOpacity>

        {canCancel && onCancel ? (
          <TouchableOpacity style={styles.cancelRow} onPress={onCancel} activeOpacity={0.88} accessibilityRole="button">
            <Ionicons name="close-circle-outline" size={18} color={LIVE.red} />
            <View style={styles.cancelTextCol}>
              <Text style={styles.cancelTxt}>Cancel trip</Text>
              {cancelFeeNote ? <Text style={styles.cancelFee}>{cancelFeeNote}</Text> : null}
            </View>
            <Ionicons name="chevron-forward" size={16} color={LIVE.faint} />
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </Animated.View>
  );
}

export const LiveDriverSheet = memo(LiveDriverSheetInner);

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 50,
    borderTopLeftRadius: LIVE.radiusXl,
    borderTopRightRadius: LIVE.radiusXl,
    overflow: 'hidden',
  },
  grabberRow: {
    height: LIVE_LAYOUT.sheetGrabberH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
  collapsed: {
    height: LIVE_LAYOUT.sheetCollapsedH - LIVE_LAYOUT.sheetGrabberH,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: LIVE.pad,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: LIVE.hairline,
  },
  collapsedAvatar: {
    width: LIVE_LAYOUT.collapsedPhoto + 5,
    height: LIVE_LAYOUT.collapsedPhoto + 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  collapsedLeft: { flex: 1, minWidth: 0, gap: 4 },
  collapsedName: { fontSize: 16, fontWeight: '900', color: LIVE.text },
  collapsedBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  collapsedPlateChip: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: colors.bgMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  collapsedPlateTxt: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: 0.8,
  },
  collapsedEta: { alignItems: 'flex-end', minWidth: 52 },
  collapsedEtaVal: { fontSize: 18, fontWeight: '900', color: LIVE.green, fontVariant: ['tabular-nums'] },
  collapsedEtaSub: { fontSize: 10, fontWeight: '700', color: LIVE.faint, marginTop: 2 },
  expandedScroll: { flex: 1 },
  expandedContent: { paddingHorizontal: LIVE.pad, paddingBottom: LIVE.gap + 8, gap: LIVE.gap },
  profileRow: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  profileMeta: { flex: 1, minWidth: 0, justifyContent: 'flex-start', gap: 4 },
  profileSpacer: { flex: 1 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ratingTxt: { fontSize: 13, fontWeight: '800', color: LIVE.text },
  tripsTxt: { fontSize: 12, fontWeight: '600', color: LIVE.sub },
  verifiedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 6,
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: LIVE.radiusPill,
    backgroundColor: LIVE.greenSoft,
  },
  verifiedTxt: { fontSize: 10, fontWeight: '800', color: LIVE.green },
  phaseLine: { fontSize: 12, fontWeight: '700', color: LIVE.sub },
  routeEditRow: { flexDirection: 'row', gap: 8 },
  routeEditBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: LIVE.tile,
    borderWidth: 1,
    borderColor: LIVE.hairline,
  },
  routeEditTxt: { fontSize: 12, fontWeight: '800', color: LIVE.text },
  splitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(0,208,132,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0,208,132,0.28)',
  },
  splitTxt: { flex: 1, fontSize: 13, fontWeight: '800', color: LIVE.text },
  cancelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.28)',
  },
  cancelTextCol: { flex: 1, gap: 2 },
  cancelTxt: { fontSize: 13, fontWeight: '800', color: colors.red },
  cancelFee: { fontSize: 11, fontWeight: '600', color: colors.amber },
  vehicleSection: { gap: 8 },
  vehicleSectionLabel: { fontSize: 11, fontWeight: '700', color: LIVE.faint, letterSpacing: 0.5 },
  vehicleGrid: { flexDirection: 'row', gap: 8, height: 64 },
  vehicleCell: {
    flex: 1,
    backgroundColor: LIVE.tile,
    borderRadius: LIVE.radiusSm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    justifyContent: 'center',
  },
  cellLabel: { fontSize: 9, fontWeight: '800', color: LIVE.faint, letterSpacing: 0.6 },
  cellValue: { fontSize: 13, fontWeight: '800', color: LIVE.text, marginTop: 3 },
  plateValue: { letterSpacing: 1.5, color: LIVE.greenBright },
  colorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  colorDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 1, borderColor: LIVE.hairline },
  actionRow: { flexDirection: 'row', gap: 8, height: LIVE_LAYOUT.expandedActionH },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: LIVE.green, borderRadius: LIVE.radiusSm,
    height: LIVE_LAYOUT.expandedActionH,
  },
  actionDisabled: { backgroundColor: LIVE.tile },
  actionTxt: { fontSize: 13, fontWeight: '900', color: LIVE.greenInk },
  actionTxtDisabled: { color: LIVE.faint },
  pickupCodeCard: {
    borderRadius: LIVE.radiusSm,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: LIVE.glassBorder,
  },
  pickupCodeGrad: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 14,
  },
  pickupCodeLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pickupCodeLabel: { fontSize: 11, fontWeight: '700', color: LIVE.sub },
  pickupCodeValue: { fontSize: 26, fontWeight: '900', color: LIVE.green, letterSpacing: 5, marginTop: 2 },
  destCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: alpha.blueSoft, borderRadius: LIVE.radiusSm,
    padding: 14,
  },
  destTextCol: { flex: 1, gap: 2 },
  destLabel: { fontSize: 10, fontWeight: '800', color: LIVE.blue, letterSpacing: 0.5 },
  destValue: { fontSize: 13, fontWeight: '700', color: LIVE.text },
  destEta: { fontSize: 12, fontWeight: '600', color: LIVE.sub, marginTop: 2 },
  safetyRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, height: 48,
    paddingHorizontal: 14, borderRadius: LIVE.radiusSm,
    backgroundColor: LIVE.redSoft, borderWidth: 1, borderColor: 'rgba(255,82,82,0.28)',
  },
  safetyTxt: { flex: 1, fontSize: 14, fontWeight: '800', color: LIVE.text },
});

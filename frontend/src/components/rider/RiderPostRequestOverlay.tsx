import React, { useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  Image,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  RiderFindingMetricsCard,
  RiderFindingRadar,
  RiderFindingSheetHandle,
  RiderFindingStatusRow,
} from '@/src/components/rider/RiderFindingDriverChrome';
import { RIDER_FINDING_SHEET_BORDER } from '@/src/constants/riderRideChrome';
import { resolvePublicMediaUri } from '@/src/utils/resolvePublicMediaUri';

export type RiderPostRequestPhase = 'searching' | 'matched';

export type RiderMatchedDriver = {
  name: string;
  vehicle?: string;
  plate?: string;
  color?: string;
  rating?: number;
  /** Lifetime trips if API sends it */
  trip_count?: number;
  profile_image?: string | null;
  /** Clearer pickup-time photo when API sends it */
  face_image?: string | null;
  phone?: string | null;
};

export type RiderPostRequestOverlayProps = {
  visible: boolean;
  phase: RiderPostRequestPhase;
  topInset: number;
  bottomInset: number;
  requestedDriverId: string | null;
  requestedDriverName: string | null;
  bidNgn: number;
  routeKmLabel: string | null;
  routeMinLabel: string | null;
  searchCountdown: number;
  driverMatched: RiderMatchedDriver | null;
  onCancelSearch: () => void;
  onTrackDriver: () => void;
  /** Top-left menu (reference: hamburger). Omit to hide. */
  onMenuPress?: () => void;
  /** After match — optional comms (shown when callbacks provided). */
  onCallDriver?: () => void;
  onChatDriver?: () => void;
};

function NexRydeWordmark() {
  return (
    <View style={hdrStyles.wordmarkRow} pointerEvents="none">
      <Text style={hdrStyles.wordNex}>NEX</Text>
      <Text style={hdrStyles.wordRyde}>RYDE</Text>
    </View>
  );
}

function FindingFlowHeader({
  topInset,
  onMenuPress,
}: {
  topInset: number;
  onMenuPress?: () => void;
}) {
  return (
    <View style={[hdrStyles.wrap, { paddingTop: topInset + 8 }]}>
      {onMenuPress ? (
        <TouchableOpacity
          style={hdrStyles.menuBtn}
          onPress={onMenuPress}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Menu"
          activeOpacity={0.82}
        >
          <Ionicons name="menu" size={24} color="#F8FAFC" />
        </TouchableOpacity>
      ) : (
        <View style={hdrStyles.menuBtn} />
      )}
      <View style={hdrStyles.wordmarkCenter} pointerEvents="none">
        <NexRydeWordmark />
      </View>
      <View style={hdrStyles.menuBtn} />
    </View>
  );
}

function stripTripEtaLabel(s: string | null | undefined): string | null {
  if (!s) return null;
  return s.replace(/\s*trip\s*$/i, '').trim();
}

function MatchedDriverHero({ driver }: { driver: RiderMatchedDriver }) {
  const resolvedFace = useMemo(() => resolvePublicMediaUri(driver.face_image ?? null), [driver.face_image]);
  const resolvedProfile = useMemo(() => resolvePublicMediaUri(driver.profile_image ?? null), [driver.profile_image]);
  const uri = resolvedFace || resolvedProfile;
  const [imgFail, setImgFail] = useState(false);
  useEffect(() => setImgFail(false), [uri]);
  const vehicleLine = [driver.color, driver.vehicle].filter(Boolean).join(' ');
  const platePart = driver.plate ? ` · ${driver.plate}` : '';
  return (
    <View style={styles.heroCard}>
      <LinearGradient
        colors={['rgba(15,23,42,0.5)', 'rgba(8,12,20,0.92)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={styles.heroPhotoRing}>
        {uri && !imgFail ? (
          <Image
            source={{ uri }}
            style={styles.heroPhoto}
            resizeMode="cover"
            accessibilityLabel={`Photo of ${driver.name}`}
            onError={() => setImgFail(true)}
            {...(Platform.OS === 'android' ? { fadeDuration: 0 } : {})}
          />
        ) : (
          <View style={styles.heroPhotoPh}>
            <Ionicons name="person" size={40} color="#86EFAC" />
          </View>
        )}
      </View>
      <View style={styles.heroTextCol}>
        <Text style={styles.heroName} numberOfLines={2}>
          {driver.name}
        </Text>
        <Text style={styles.heroVehicle} numberOfLines={2}>
          {vehicleLine}
          {platePart}
        </Text>
        <View style={styles.heroRatingPill}>
          <Ionicons name="star" size={14} color="#FBBF24" />
          <Text style={styles.heroRatingTxt}>
            {Number(driver.rating ?? 0).toFixed(1)}
            {typeof driver.trip_count === 'number' && driver.trip_count > 0
              ? ` · ${driver.trip_count.toLocaleString()} rides`
              : ''}
          </Text>
        </View>
      </View>
    </View>
  );
}

function MatchedStatChip({
  icon,
  label,
  value,
  valueGreen,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string;
  valueGreen?: boolean;
}) {
  return (
    <View style={styles.statChip}>
      <LinearGradient
        colors={['rgba(34,229,160,0.14)', 'rgba(34,229,160,0.03)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />
      <View style={styles.statChipIconWrap}>
        <Ionicons name={icon} size={15} color="#86EFAC" />
      </View>
      <Text style={styles.statChipK}>{label}</Text>
      <Text style={[styles.statChipV, valueGreen ? styles.statChipVGreen : null]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function MatchedTripStats({
  bidNgn,
  routeKmLabel,
  routeMinLabel,
}: {
  bidNgn: number;
  routeKmLabel: string | null;
  routeMinLabel: string | null;
}) {
  const eta = stripTripEtaLabel(routeMinLabel) || '—';
  return (
    <View style={styles.statGrid}>
      <MatchedStatChip
        icon="pricetag"
        label="Your bid"
        value={`₦${Math.max(0, Math.round(bidNgn)).toLocaleString()}`}
        valueGreen
      />
      <MatchedStatChip icon="location" label="Distance" value={routeKmLabel || '—'} />
      <MatchedStatChip icon="time" label="ETA" value={eta} />
    </View>
  );
}

export function RiderPostRequestOverlay({
  visible,
  phase,
  topInset,
  bottomInset,
  requestedDriverId,
  requestedDriverName,
  bidNgn,
  routeKmLabel,
  routeMinLabel,
  searchCountdown,
  driverMatched,
  onCancelSearch,
  onTrackDriver,
  onMenuPress,
  onCallDriver,
  onChatDriver,
}: RiderPostRequestOverlayProps) {
  const { width: winW } = useWindowDimensions();
  const prevPhaseRef = useRef<RiderPostRequestPhase>(phase);

  useEffect(() => {
    if (!visible) {
      prevPhaseRef.current = phase;
      return;
    }
    if (phase === 'matched' && prevPhaseRef.current !== 'matched') {
      if (Platform.OS !== 'web') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    }
    prevPhaseRef.current = phase;
  }, [visible, phase]);

  const headline = useMemo(() => {
    if (phase === 'matched') return 'Your driver is on the way!';
    if (requestedDriverId) return `Requesting ${requestedDriverName || 'your driver'}`;
    return 'Finding drivers nearby';
  }, [phase, requestedDriverId, requestedDriverName]);

  const sub = useMemo(() => {
    if (phase === 'matched') {
      const e = stripTripEtaLabel(routeMinLabel);
      const parts: string[] = [];
      if (e) parts.push(e.startsWith('~') ? `ETA ${e}` : `ETA ~${e}`);
      if (routeKmLabel) parts.push(routeKmLabel);
      return parts.join(' · ') || 'Follow your driver on the live map.';
    }
    return 'Matching you with the best driver…';
  }, [phase, routeMinLabel, routeKmLabel]);

  if (!visible) return null;

  return (
    <View style={styles.root} pointerEvents="box-none">
      {phase === 'matched' ? (
        <View style={[styles.driverFoundBar, { paddingTop: topInset }]} pointerEvents="none">
          <LinearGradient
            colors={['#16A34A', '#22C55E', '#15803D']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.driverFoundBarInner}
          >
            <Ionicons name="checkmark-circle" size={21} color="#FFFFFF" />
            <Text style={styles.driverFoundBarTxt}>DRIVER FOUND</Text>
          </LinearGradient>
        </View>
      ) : (
        <View style={[styles.headerSlot, { height: topInset + 54 }]}>
          <FindingFlowHeader topInset={topInset} onMenuPress={onMenuPress} />
        </View>
      )}

      <LinearGradient
        colors={['rgba(2,6,23,0)', 'rgba(2,6,23,0.22)', 'rgba(2,6,23,0.5)', 'rgba(2,6,23,0.72)']}
        locations={[0, 0.18, 0.45, 1]}
        style={[
          styles.grad,
          { paddingBottom: bottomInset + 20, minHeight: winW * 0.88 },
        ]}
        pointerEvents="box-none"
      >
        <View style={styles.sheetShell}>
          <BlurView intensity={56} tint="dark" style={StyleSheet.absoluteFillObject} />
          <LinearGradient
            colors={['rgba(52,245,184,0.07)', 'transparent']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.sheetSheen}
            pointerEvents="none"
          />
          <RiderFindingSheetHandle />
          <View style={styles.panel}>
          {phase === 'searching' ? (
            <>
              <RiderFindingStatusRow
                countdown={searchCountdown > 0 ? searchCountdown : undefined}
              />
              <Text style={styles.headline}>{headline}</Text>
              <Text style={styles.sub}>{sub}</Text>
              <RiderFindingRadar size={116} />
              {searchCountdown > 0 ? (
                <Text style={styles.countdown}>
                  Offer window refreshes in{' '}
                  <Text style={searchCountdown <= 15 ? styles.countdownUrgent : styles.countdownStrong}>
                    {searchCountdown}s
                  </Text>
                </Text>
              ) : (
                <Text style={styles.countdownStill}>Still scanning nearby drivers…</Text>
              )}
            </>
          ) : (
            <>
              <Text style={styles.headlineMatched}>{headline}</Text>
              <Text style={styles.subMatched}>{sub}</Text>
            </>
          )}

          {phase === 'searching' ? (
            <RiderFindingMetricsCard
              bidNgn={bidNgn}
              routeKmLabel={routeKmLabel}
              routeMinLabel={routeMinLabel}
            />
          ) : null}

          {phase === 'matched' && driverMatched ? (
            <>
              <MatchedDriverHero driver={driverMatched} />
              <MatchedTripStats bidNgn={bidNgn} routeKmLabel={routeKmLabel} routeMinLabel={routeMinLabel} />
            </>
          ) : null}

          {phase === 'matched' && (onCallDriver || onChatDriver) ? (
            <View style={styles.commRow}>
              {onCallDriver ? (
                <TouchableOpacity
                  style={[styles.commBtnOuter, !onChatDriver ? styles.commBtnSolo : styles.commBtnHalf]}
                  onPress={onCallDriver}
                  activeOpacity={0.88}
                  accessibilityRole="button"
                  accessibilityLabel="Call driver"
                >
                  <LinearGradient
                    colors={['#3B82F6', '#2563EB', '#1D4ED8']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFillObject}
                    pointerEvents="none"
                  />
                  <View style={styles.commBtnInner}>
                    <View style={styles.commIconCircle}>
                      <Ionicons name="call" size={18} color="#EFF6FF" />
                    </View>
                    <Text style={styles.commBtnTxt}>Call</Text>
                  </View>
                </TouchableOpacity>
              ) : null}
              {onChatDriver ? (
                <TouchableOpacity
                  style={[styles.commBtnOuter, !onCallDriver ? styles.commBtnSolo : styles.commBtnHalf]}
                  onPress={onChatDriver}
                  activeOpacity={0.88}
                  accessibilityRole="button"
                  accessibilityLabel="Message driver"
                >
                  <LinearGradient
                    colors={['#3B82F6', '#2563EB', '#1D4ED8']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFillObject}
                    pointerEvents="none"
                  />
                  <View style={styles.commBtnInner}>
                    <View style={styles.commIconCircle}>
                      <Ionicons name="chatbubble-ellipses" size={17} color="#EFF6FF" />
                    </View>
                    <Text style={styles.commBtnTxt}>Message</Text>
                  </View>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          {phase === 'matched' ? (
            <>
              <TouchableOpacity
                style={styles.primaryBtnOuter}
                onPress={onTrackDriver}
                activeOpacity={0.9}
                accessibilityRole="button"
                accessibilityLabel="Track driver"
              >
                <LinearGradient
                  colors={['#34F5B8', '#22E5A0', '#0D9F6E']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.primaryBtnGrad}
                >
                  <View style={styles.primaryIconChip}>
                    <Ionicons name="navigate" size={20} color="#022C22" />
                  </View>
                  <Text style={styles.primaryBtnTxt}>Track driver</Text>
                  <Ionicons name="chevron-forward" size={22} color="rgba(2,44,34,0.4)" />
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelOutline}
                onPress={onCancelSearch}
                activeOpacity={0.88}
                accessibilityRole="button"
                accessibilityLabel="Cancel ride"
              >
                <Text style={styles.cancelOutlineTxt}>Cancel Ride</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={styles.cancelOutline}
              onPress={onCancelSearch}
              activeOpacity={0.88}
              accessibilityRole="button"
              accessibilityLabel="Cancel search"
            >
              <Text style={styles.cancelOutlineTxt}>Cancel Search</Text>
            </TouchableOpacity>
          )}
        </View>
        </View>
      </LinearGradient>
    </View>
  );
}

const hdrStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingBottom: 6,
  },
  menuBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: 'rgba(15,23,42,0.5)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  wordmarkCenter: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmarkRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  wordNex: {
    fontSize: 20,
    fontWeight: '900',
    color: '#F8FAFC',
    letterSpacing: -0.8,
  },
  wordRyde: {
    fontSize: 20,
    fontWeight: '900',
    color: '#34F5B8',
    letterSpacing: -0.5,
  },
});

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 200,
    elevation: Platform.OS === 'android' ? 200 : 0,
  },
  headerSlot: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 5,
  },
  grad: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
  },
  sheetShell: {
    marginHorizontal: 0,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    backgroundColor: 'rgba(6,11,22,0.55)',
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: RIDER_FINDING_SHEET_BORDER,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -12 },
    shadowOpacity: 0.55,
    shadowRadius: 32,
    elevation: 28,
  },
  sheetSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 88,
  },
  panel: {
    paddingHorizontal: 20,
    paddingTop: 2,
    paddingBottom: 12,
    gap: 14,
  },
  driverFoundBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 6,
    paddingHorizontal: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },
  driverFoundBarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingTop: 11,
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.2)',
  },
  driverFoundBarTxt: {
    fontSize: 13,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 1.6,
  },
  headline: {
    fontSize: 24,
    fontWeight: '900',
    color: '#F8FAFC',
    letterSpacing: -0.65,
    lineHeight: 30,
    textAlign: 'center',
  },
  headlineMatched: {
    fontSize: 23,
    fontWeight: '900',
    color: '#D9F99D',
    letterSpacing: -0.5,
    lineHeight: 29,
    textAlign: 'center',
  },
  subMatched: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(203,213,225,0.98)',
    lineHeight: 21,
    marginTop: 4,
    textAlign: 'center',
    paddingHorizontal: 10,
    letterSpacing: 0.15,
  },
  sub: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(148,163,184,0.95)',
    lineHeight: 21,
    marginTop: 4,
    textAlign: 'center',
    paddingHorizontal: 10,
    letterSpacing: 0.1,
  },
  countdown: {
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '600',
    color: '#94A3B8',
  },
  countdownStrong: { fontWeight: '900', color: '#F8FAFC' },
  countdownUrgent: { fontWeight: '900', color: '#F87171' },
  countdownStill: {
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '600',
    color: '#94A3B8',
    fontStyle: 'italic',
  },
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(34,229,160,0.22)',
    paddingVertical: 18,
    paddingHorizontal: 18,
    overflow: 'hidden',
    minHeight: 124,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 14,
  },
  heroPhotoRing: {
    borderRadius: 56,
    padding: 3,
    backgroundColor: 'rgba(34,229,160,0.22)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(217,249,157,0.5)',
  },
  heroPhoto: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(15,23,42,0.95)',
    borderWidth: 2,
    borderColor: 'rgba(2,6,23,0.85)',
  },
  heroPhotoPh: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(15,23,42,0.98)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(34,229,160,0.3)',
  },
  heroTextCol: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    gap: 5,
  },
  heroName: {
    fontSize: 19,
    fontWeight: '900',
    color: '#F8FAFC',
    letterSpacing: -0.4,
    lineHeight: 24,
  },
  heroVehicle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94A3B8',
    lineHeight: 18,
    letterSpacing: 0.05,
  },
  heroRatingPill: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(251,191,36,0.1)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(251,191,36,0.28)',
  },
  heroRatingTxt: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FDE68A',
    letterSpacing: 0.05,
  },
  statGrid: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
  },
  statChip: {
    flex: 1,
    minWidth: 0,
    minHeight: 92,
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.55)',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(51,65,85,0.55)',
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
    overflow: 'hidden',
  },
  statChipIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: 'rgba(34,229,160,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(134,239,172,0.2)',
  },
  statChipK: {
    fontSize: 9,
    fontWeight: '900',
    color: '#64748B',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    marginBottom: 5,
    textAlign: 'center',
  },
  statChipV: {
    fontSize: 14,
    fontWeight: '900',
    color: '#F1F5F9',
    textAlign: 'center',
    letterSpacing: -0.2,
    paddingHorizontal: 2,
  },
  statChipVGreen: {
    fontSize: 14,
    fontWeight: '900',
    color: '#4ADE80',
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  commRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
  },
  commBtnOuter: {
    minHeight: 52,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(191,219,254,0.35)',
    shadowColor: '#1E40AF',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 8,
  },
  commBtnInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
    zIndex: 1,
  },
  commIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  commBtnHalf: { flex: 1 },
  commBtnSolo: { flex: 1 },
  commBtnTxt: {
    fontSize: 15,
    fontWeight: '800',
    color: '#F8FAFC',
    letterSpacing: 0.25,
  },
  primaryBtnOuter: {
    borderRadius: 17,
    overflow: 'hidden',
    marginTop: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
    shadowColor: '#22E5A0',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 20,
    elevation: 12,
  },
  primaryBtnGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 18,
    minHeight: 56,
  },
  primaryIconChip: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: 'rgba(2,44,34,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(2,44,34,0.12)',
  },
  primaryBtnTxt: {
    flex: 1,
    fontSize: 17,
    fontWeight: '900',
    color: '#022C22',
    letterSpacing: 0.12,
    textAlign: 'center',
  },
  cancelOutline: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(248,113,113,0.45)',
    backgroundColor: 'rgba(15,23,42,0.55)',
    marginTop: 2,
  },
  cancelOutlineTxt: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FCA5A5',
    letterSpacing: 0.2,
  },
});

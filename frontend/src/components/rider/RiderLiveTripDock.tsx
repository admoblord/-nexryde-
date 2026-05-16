/**
 * Map-first rider live-trip dock — premium structured layout (single sheet, no duplicate map overlays).
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  ScrollView,
  Platform,
  type ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import { RIDER_FINDING_SHEET_BORDER } from '@/src/constants/riderRideChrome';
import { DOCK_BLUR_INTENSITY, DOCK_TOP_RADIUS } from '@/src/components/driver/driverDockTheme';
import { RiderFavoriteIcon } from '@/src/components/rider/RiderFavoriteIcon';
import { resolvePublicMediaUri } from '@/src/utils/resolvePublicMediaUri';

/** Nexryde mint — primary brand accent on live trip surfaces */
const MINT = '#34D399';
const MINT_SOFT = 'rgba(52,211,153,0.14)';
const MINK_INK = '#022C22';
const SHEET_BG_TOP = 'rgba(17,24,39,0.94)';
const SHEET_BG_BOT = 'rgba(8,11,18,0.98)';

export type RiderLiveTripDockProps = {
  tripStatus: string;
  loading?: boolean;
  driverInfo: Record<string, any> | null;
  driverPickupApproach?: {
    min: number;
    km: number;
    meters: number;
  } | null;
  rideAcceptedSubtitle?: string;
  identityConfirmed?: boolean;
  driverLocation?: unknown;
  driverMoving?: boolean;
  fareDisplay?: string | null;
  distanceKm?: number | null;
  etaMin?: number | null;
  durationMins?: number | null;
  pickupLabel: string;
  destinationLabel: string;
  callAllowed?: boolean;
  /** Rider portrait (e.g. from session) — shown beside driver during live trip */
  riderProfileImage?: string | null;
  riderDisplayName?: string | null;
  onCallDriver: () => void;
  onChatDriver: () => void;
  onShowPickupCode: () => void;
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

function phaseCopy(status: string): { title: string; accent: string } {
  switch (status) {
    case 'accepted':
      return { title: 'Driver on the way', accent: MINT };
    case 'arrived':
      return { title: 'Driver has arrived', accent: '#FBBF24' };
    case 'ongoing':
      return { title: 'Ride in progress', accent: '#5EEAD4' };
    default:
      return { title: 'Live trip', accent: MINT };
  }
}

function finitePickupApproach(
  a: NonNullable<RiderLiveTripDockProps['driverPickupApproach']>,
): { km: number; meters: number; min: number } | null {
  const km = Number(a.km);
  const meters = Number(a.meters);
  const min = Number(a.min);
  if (!Number.isFinite(km) || !Number.isFinite(meters) || !Number.isFinite(min)) return null;
  return { km, meters, min };
}

function DockAvatar({
  uri,
  initial,
  size,
  ringActive,
}: {
  uri?: string | null;
  initial: string;
  size: number;
  ringActive: boolean;
}) {
  const resolved = useMemo(() => resolvePublicMediaUri(uri ?? null), [uri]);
  const [bad, setBad] = useState(false);
  useEffect(() => setBad(false), [resolved]);
  const r = size / 2;
  const letter = String(initial ?? '?').charAt(0).toUpperCase() || '?';

  return (
    <View
      style={[
        styles.avatarRing,
        {
          width: size + 6,
          height: size + 6,
          borderRadius: r + 3,
          borderColor: ringActive ? MINT : 'rgba(148,163,184,0.35)',
        },
      ]}
    >
      {resolved && !bad ? (
        <Image
          source={{ uri: resolved }}
          style={{ width: size, height: size, borderRadius: r }}
          resizeMode="cover"
          onError={() => setBad(true)}
          {...(Platform.OS === 'android' ? { fadeDuration: 0 } : {})}
        />
      ) : (
        <LinearGradient
          colors={['#1e293b', '#0f172a']}
          style={{
            width: size,
            height: size,
            borderRadius: r,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: Math.round(size * 0.36), fontWeight: '900', color: '#fff' }}>{letter}</Text>
        </LinearGradient>
      )}
    </View>
  );
}

function SectionLabel({ children }: { children: string }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
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
  durationMins,
  pickupLabel,
  destinationLabel,
  callAllowed,
  riderProfileImage,
  riderDisplayName,
  onCallDriver,
  onChatDriver,
  onShowPickupCode,
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
  const [routeExpanded, setRouteExpanded] = useState(false);
  const phase = phaseCopy(String(tripStatus ?? ''));
  const hasDriver = Boolean(driverInfo);

  const approach =
    tripStatus === 'accepted' && driverPickupApproach ? finitePickupApproach(driverPickupApproach) : null;

  const approachLabel =
    approach != null ? (approach.km < 1 ? `${Math.round(approach.meters)} m` : `${approach.km.toFixed(1)} km`) : null;

  const etaChip =
    approach != null
      ? `~${Math.max(1, Math.round(approach.min))} min`
      : etaMin != null && Number.isFinite(Number(etaMin))
        ? `~${Math.round(Number(etaMin))} min`
        : durationMins != null && Number.isFinite(Number(durationMins))
          ? `~${Math.round(Number(durationMins))} min`
          : null;

  const cancelLabel = tripStatus === 'ongoing' ? 'Close tracking' : 'Cancel ride';

  const riderShort =
    (riderDisplayName && String(riderDisplayName).trim().split(/\s+/)[0]) || 'You';

  const driverPhoto =
    (driverInfo?.profile_image as string | undefined) ||
    (driverInfo?.face_image as string | undefined) ||
    null;

  const activityPhrase =
    tripStatus === 'accepted' && driverLocation
      ? driverMoving
        ? 'Vehicle moving toward pickup'
        : 'Vehicle paused nearby'
      : null;

  const heroMetaParts = [approachLabel, etaChip, activityPhrase].filter(Boolean);
  const heroMetaLine = heroMetaParts.join(' · ');

  const dockKm = Number(distanceKm);
  const distanceLabel =
    distanceKm != null && Number.isFinite(dockKm) && dockKm >= 0
      ? dockKm < 1
        ? `${Math.round(dockKm * 1000)} m`
        : `${dockKm.toFixed(1)} km`
      : '—';

  const ratingNum = Number(driverInfo?.rating ?? driverInfo?.avg_rating ?? NaN);

  return (
    <View
      style={[styles.root, { paddingBottom: Math.max(bottomInset, 12) }, style]}
      pointerEvents="box-none"
    >
      <View style={styles.shell}>
        {Platform.OS === 'ios' ? (
          <BlurView intensity={DOCK_BLUR_INTENSITY} tint="dark" style={StyleSheet.absoluteFillObject} />
        ) : (
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(15,23,42,0.88)' }]} />
        )}
        <LinearGradient colors={[SHEET_BG_TOP, SHEET_BG_BOT]} style={StyleSheet.absoluteFillObject} />

        <View style={styles.handleWrap} pointerEvents="none">
          <View style={styles.handleMint} />
        </View>

        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={MINT} />
            <Text style={styles.loadingTxt}>Updating trip…</Text>
          </View>
        ) : (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
            nestedScrollEnabled
          >
            {/* ── Status hero ── */}
            <View style={[styles.statusHero, { borderLeftColor: phase.accent }]}>
              <View style={styles.statusHeroTop}>
                <View style={styles.liveBadge}>
                  <View style={[styles.liveDot, { backgroundColor: phase.accent }]} />
                  <Text style={styles.liveBadgeTxt}>LIVE</Text>
                </View>
                <Text style={styles.statusEyebrow}>Trip status</Text>
              </View>
              <Text style={[styles.heroTitle, { color: '#F8FAFC' }]}>{phase.title}</Text>
              {heroMetaLine.length > 0 ? (
                <Text style={styles.heroMeta} numberOfLines={3}>
                  {heroMetaLine}
                </Text>
              ) : (
                <Text style={styles.heroMeta}>Map updates as your driver moves</Text>
              )}
            </View>

            {/* ── People ── */}
            <SectionLabel>Driver & you</SectionLabel>
            <View style={styles.peopleCard}>
              <View style={styles.peopleRow}>
                <View style={styles.peopleCol}>
                  <DockAvatar
                    uri={driverPhoto}
                    initial={String(driverInfo?.name ?? 'D').charAt(0)}
                    size={56}
                    ringActive={hasDriver}
                  />
                  <Text style={styles.peopleRole}>Driver</Text>
                  <Text style={styles.peopleName} numberOfLines={1}>
                    {driverInfo?.name || 'Your driver'}
                  </Text>
                </View>

                <View style={styles.peopleMid}>
                  <View style={styles.peopleMidBar} />
                </View>

                <View style={styles.peopleCol}>
                  <DockAvatar
                    uri={riderProfileImage ?? null}
                    initial={riderShort}
                    size={56}
                    ringActive={false}
                  />
                  <Text style={styles.peopleRole}>You</Text>
                  <Text style={styles.peopleName} numberOfLines={1}>
                    {riderShort}
                  </Text>
                </View>
              </View>

              {hasDriver ? (
                <View style={styles.driverFacts}>
                  <Text style={styles.driverFactsLine} numberOfLines={2}>
                    {[driverInfo?.vehicle, driverInfo?.color, driverInfo?.plate].filter(Boolean).join(' · ') ||
                      'Vehicle details'}
                  </Text>
                  <View style={styles.rateInline}>
                    <Ionicons name="star" size={14} color="#FBBF24" />
                    <Text style={styles.rateInlineTxt}>
                      {Number.isFinite(ratingNum) ? ratingNum.toFixed(1) : '—'}
                    </Text>
                  </View>
                  {onToggleFavorite ? (
                    <View style={styles.favSlot}>
                      <RiderFavoriteIcon
                        size={40}
                        filled={!!isFavoriteDriver}
                        onPress={onToggleFavorite}
                        disabled={favoriteLoading || isFavoriteDriver}
                      />
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>

            {/* ── Trip overview ── */}
            <SectionLabel>Trip overview</SectionLabel>
            <View style={styles.metricsCard}>
              <View style={styles.metricCell}>
                <Text style={styles.metricLabel}>Fare</Text>
                <Text style={[styles.metricValue, styles.metricValueMint]} numberOfLines={1}>
                  {fareDisplay ?? '—'}
                </Text>
              </View>
              <View style={styles.metricDivider} />
              <View style={styles.metricCell}>
                <Text style={styles.metricLabel}>Distance</Text>
                <Text style={styles.metricValue} numberOfLines={1}>
                  {distanceLabel}
                </Text>
              </View>
              <View style={styles.metricDivider} />
              <View style={styles.metricCell}>
                <Text style={styles.metricLabel}>ETA</Text>
                <Text style={styles.metricValue} numberOfLines={1}>
                  {etaChip ?? '—'}
                </Text>
              </View>
            </View>

            {tripStatus === 'accepted' && !identityConfirmed ? (
              <TouchableOpacity style={styles.verifyBanner} onPress={onVerifyIdentity} activeOpacity={0.88}>
                <View style={styles.verifyIconWrap}>
                  <Ionicons name="shield-checkmark-outline" size={20} color={MINT} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.verifyTitle}>Verify before pickup</Text>
                  <Text style={styles.verifySub}>Match photo, plate, and vehicle colour</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#64748B" />
              </TouchableOpacity>
            ) : null}

            {/* ── Contact ── */}
            <SectionLabel>Contact driver</SectionLabel>
            {tripStatus === 'arrived' ? (
              <TouchableOpacity style={styles.primaryShell} onPress={onShowPickupCode} activeOpacity={0.9}>
                <LinearGradient
                  colors={[MINT, '#059669']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.primaryCta}
                >
                  <Ionicons name="keypad" size={22} color={MINK_INK} />
                  <Text style={styles.primaryCtaTxt}>Show pickup code</Text>
                </LinearGradient>
              </TouchableOpacity>
            ) : (
              <View style={styles.commRow}>
                <TouchableOpacity
                  style={[
                    styles.commBtn,
                    styles.commBtnGhost,
                    !(callAllowed && driverInfo?.phone) && styles.commBtnOff,
                  ]}
                  onPress={onCallDriver}
                  activeOpacity={0.88}
                >
                  <Ionicons
                    name="call-outline"
                    size={22}
                    color={callAllowed && driverInfo?.phone ? MINT : '#64748B'}
                  />
                  <Text
                    style={[
                      styles.commBtnGhostTxt,
                      !(callAllowed && driverInfo?.phone) && styles.commBtnTxtOff,
                    ]}
                  >
                    Call
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.commBtn, styles.commBtnMint]}
                  onPress={onChatDriver}
                  activeOpacity={0.88}
                >
                  <Ionicons name="chatbubble-ellipses" size={22} color={MINK_INK} />
                  <Text style={styles.commBtnMintTxt}>Message</Text>
                </TouchableOpacity>
              </View>
            )}

            {tripStatus === 'accepted' ? (
              <TouchableOpacity style={[styles.primaryShell, { marginTop: 4 }]} onPress={onShowPickupCode} activeOpacity={0.9}>
                <LinearGradient
                  colors={[MINT, '#10B981']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.primaryCta}
                >
                  <Ionicons name="keypad" size={22} color={MINK_INK} />
                  <View style={styles.primaryCtaTextCol}>
                    <Text style={styles.primaryCtaTxt}>Confirm pickup</Text>
                    <Text style={styles.primaryCtaSub}>When you are together at the pin</Text>
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            ) : null}

            {/* ── Route ── */}
            <SectionLabel>Route</SectionLabel>
            <TouchableOpacity
              style={styles.routeToggleCard}
              onPress={() => setRouteExpanded((v) => !v)}
              activeOpacity={0.85}
            >
              <Ionicons name="map-outline" size={20} color={MINT} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.routeToggleTitle}>Pickup & destination</Text>
                <Text style={styles.routeToggleSub} numberOfLines={2}>
                  {pickupLabel} → {destinationLabel}
                </Text>
              </View>
              <Ionicons name={routeExpanded ? 'chevron-up' : 'chevron-down'} size={20} color="#64748B" />
            </TouchableOpacity>
            {routeExpanded ? (
              <View style={styles.routeDetail}>
                <View style={styles.routeRow}>
                  <View style={[styles.routeDot, { backgroundColor: MINT }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.routeTag}>Pickup</Text>
                    <Text style={styles.routeTxt}>{pickupLabel}</Text>
                  </View>
                </View>
                <View style={styles.routeLine} />
                <View style={styles.routeRow}>
                  <View style={[styles.routeDot, { backgroundColor: '#FB7185' }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.routeTag}>Drop-off</Text>
                    <Text style={styles.routeTxt}>{destinationLabel}</Text>
                  </View>
                </View>
              </View>
            ) : null}

            {/* ── More ── */}
            <SectionLabel>More</SectionLabel>
            <View style={styles.toolsRow}>
              <ToolBtn icon="headset-outline" label="Help" onPress={onHelp} />
              <ToolBtn icon="wallet-outline" label="Wallet" onPress={onWallet} />
              <ToolBtn icon="share-outline" label="Share" onPress={onShare} />
            </View>

            <TouchableOpacity style={styles.detailsRow} onPress={onOpenTripDetails} activeOpacity={0.88}>
              <View style={styles.detailsIconWrap}>
                <Ionicons name="reader-outline" size={20} color={MINT} />
              </View>
              <View style={styles.detailsMid}>
                <Text style={styles.detailsTitle}>Trip details & safety</Text>
                <Text style={styles.detailsSub}>Recording, shield, and emergency tools</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#64748B" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelBtn} onPress={onCancelRide} activeOpacity={0.88}>
              <Text style={styles.cancelTxt}>{cancelLabel}</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
      </View>
    </View>
  );
}

function ToolBtn({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.toolBtn} onPress={onPress} activeOpacity={0.85}>
      <Ionicons name={icon} size={22} color={MINT} />
      <Text style={styles.toolLbl}>{label}</Text>
    </TouchableOpacity>
  );
}

export function RiderLiveTripDockFade({ height = 200 }: { height?: number }) {
  return (
    <LinearGradient
      colors={['rgba(8,11,18,0)', 'rgba(8,11,18,0.5)', 'rgba(8,11,18,0.92)']}
      locations={[0, 0.45, 1]}
      style={[styles.fade, { height }]}
      pointerEvents="none"
    />
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 40,
    paddingHorizontal: SPACING.md,
    maxHeight: '62%',
  },
  fade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 35,
  },
  shell: {
    borderTopLeftRadius: DOCK_TOP_RADIUS,
    borderTopRightRadius: DOCK_TOP_RADIUS,
    overflow: 'hidden',
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: RIDER_FINDING_SHEET_BORDER,
    maxHeight: '100%',
  },
  handleWrap: { alignItems: 'center', paddingTop: 12, paddingBottom: 8 },
  handleMint: {
    width: 40,
    height: 4,
    borderRadius: 100,
    backgroundColor: 'rgba(52,211,153,0.45)',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 28,
  },
  loadingTxt: { fontSize: FONT_SIZE.sm, fontWeight: '700', color: '#94A3B8' },
  scroll: { maxHeight: 460 },
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xl,
    gap: 18,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.15,
    color: '#64748B',
    textTransform: 'uppercase',
    marginTop: 14,
    marginBottom: 6,
  },
  statusHero: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: BORDER_RADIUS.xl,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.12)',
    borderLeftWidth: 4,
    gap: 8,
  },
  statusHeroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: MINT_SOFT,
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.28)',
  },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  liveBadgeTxt: { fontSize: 11, fontWeight: '900', color: '#E2E8F0', letterSpacing: 0.8 },
  statusEyebrow: { fontSize: 11, fontWeight: '700', color: '#64748B', letterSpacing: 0.6 },
  heroTitle: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.6,
    lineHeight: 28,
  },
  heroMeta: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94A3B8',
    lineHeight: 20,
  },
  peopleCard: {
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.1)',
    gap: 14,
  },
  peopleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  peopleCol: { flex: 1, alignItems: 'center', gap: 8 },
  peopleMid: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 24,
  },
  peopleMidBar: {
    width: StyleSheet.hairlineWidth,
    height: 52,
    backgroundColor: 'rgba(148,163,184,0.28)',
    borderRadius: 2,
  },
  peopleRole: { fontSize: 11, fontWeight: '800', color: '#64748B', letterSpacing: 0.5 },
  peopleName: { fontSize: 14, fontWeight: '800', color: '#F1F5F9', maxWidth: 120 },
  avatarRing: {
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  driverFacts: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(148,163,184,0.1)',
    paddingTop: 12,
    gap: 8,
    position: 'relative',
  },
  driverFactsLine: { fontSize: 13, fontWeight: '600', color: '#CBD5E1', lineHeight: 18 },
  rateInline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rateInlineTxt: { fontSize: 13, fontWeight: '800', color: '#E2E8F0' },
  favSlot: { position: 'absolute', right: 0, top: 10 },
  metricsCard: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.2)',
    backgroundColor: 'rgba(6,78,59,0.12)',
    overflow: 'hidden',
  },
  metricCell: { flex: 1, paddingVertical: 14, paddingHorizontal: 10, alignItems: 'center', gap: 6 },
  metricDivider: { width: StyleSheet.hairlineWidth, backgroundColor: 'rgba(148,163,184,0.15)' },
  metricLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  metricValue: { fontSize: 14, fontWeight: '900', color: '#F8FAFC', textAlign: 'center' },
  metricValueMint: { color: MINT },
  verifyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.28)',
    backgroundColor: 'rgba(52,211,153,0.06)',
  },
  verifyIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(52,211,153,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifyTitle: { fontSize: FONT_SIZE.sm, fontWeight: '900', color: '#F1F5F9' },
  verifySub: { fontSize: 12, fontWeight: '600', color: '#94A3B8', marginTop: 2 },
  primaryShell: { borderRadius: BORDER_RADIUS.xxl, overflow: 'hidden' },
  primaryCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  primaryCtaTxt: { fontSize: FONT_SIZE.md, fontWeight: '900', color: MINK_INK },
  primaryCtaTextCol: { flex: 1, gap: 2 },
  primaryCtaSub: { fontSize: 11, fontWeight: '700', color: 'rgba(2,44,34,0.78)', lineHeight: 14 },
  commRow: { flexDirection: 'row', gap: 12 },
  commBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    borderRadius: 16,
  },
  commBtnGhost: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: 'rgba(52,211,153,0.45)',
  },
  commBtnGhostTxt: { fontSize: 15, fontWeight: '800', color: MINT },
  commBtnMint: {
    backgroundColor: MINT,
    shadowColor: MINT,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  commBtnMintTxt: { fontSize: 15, fontWeight: '900', color: MINK_INK },
  commBtnOff: { opacity: 0.45 },
  commBtnTxtOff: { color: '#475569' },
  routeToggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.12)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  routeToggleTitle: { fontSize: 14, fontWeight: '900', color: '#F1F5F9' },
  routeToggleSub: { fontSize: 12, fontWeight: '600', color: '#64748B', marginTop: 4, lineHeight: 17 },
  routeDetail: {
    marginTop: -8,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.08)',
    gap: 4,
  },
  routeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  routeDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  routeLine: {
    width: 2,
    height: 14,
    backgroundColor: 'rgba(148,163,184,0.25)',
    marginLeft: 3,
    marginVertical: 2,
    borderRadius: 1,
  },
  routeTag: { fontSize: 10, fontWeight: '800', color: '#64748B', letterSpacing: 0.4, marginBottom: 2 },
  routeTxt: { fontSize: FONT_SIZE.sm, fontWeight: '700', color: '#E2E8F0', lineHeight: 20 },
  toolsRow: { flexDirection: 'row', gap: 10 },
  toolBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.12)',
  },
  toolLbl: { fontSize: 11, fontWeight: '800', color: '#94A3B8' },
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(148,163,184,0.1)',
  },
  detailsIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(52,211,153,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailsMid: { flex: 1, marginLeft: 12 },
  detailsTitle: { fontSize: FONT_SIZE.sm, fontWeight: '900', color: '#F1F5F9' },
  detailsSub: { fontSize: 12, fontWeight: '600', color: '#64748B', marginTop: 3 },
  cancelBtn: {
    minHeight: 52,
    borderRadius: BORDER_RADIUS.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.45)',
    backgroundColor: 'rgba(127,29,29,0.12)',
  },
  cancelTxt: { fontSize: FONT_SIZE.md, fontWeight: '800', color: COLORS.error },
});

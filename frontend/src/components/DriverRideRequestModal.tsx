import React, { useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  useWindowDimensions,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import DriverOfferRoutePreview from '@/src/components/DriverOfferRoutePreview';
import { DS_COLOR, DS_RADIUS, DS_SPACE, DS_TYPE } from '@/src/design/designSystem';
import { DRIVER_OFFER_COUNTDOWN_SECONDS } from '@/src/constants/driverOffer';
import * as Haptics from 'expo-haptics';

const C = DS_COLOR;

export type FairTier = 'good' | 'fair' | 'low';

export function computeFairTier(
  baseFare: number,
  riderOffer: number,
  minPrice?: number | null
): FairTier {
  if (baseFare <= 0) return 'fair';
  if (minPrice != null && minPrice > 0 && riderOffer < minPrice - 0.5) return 'low';
  const r = riderOffer / baseFare;
  if (r >= 0.97) return 'good';
  if (r >= 0.88) return 'fair';
  return 'low';
}

function roundFare(n: number) {
  return Math.max(0, Math.round(n / 50) * 50);
}

function parseFareInput(s: string) {
  const n = Number(String(s).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : NaN;
}

type TripOffer = Record<string, any>;

type Props = {
  visible: boolean;
  trip: TripOffer | null;
  countdownSeconds: number;
  countdownTotal?: number;
  fareInput: string;
  onFareInputChange: (v: string) => void;
  accepting: boolean;
  onAccept: () => void;
  onIgnore: () => void;
  /** Driver's current GPS position for the map dot */
  driverLat?: number | null;
  driverLng?: number | null;
};

const CHIP_PRESETS = [
  { label: '+5%', pct: 0.05 },
  { label: '+10%', pct: 0.1 },
  { label: '+15%', pct: 0.15 },
] as const;

const RIDE_PREFERENCE_LABELS: Record<string, string> = {
  quiet_ride: 'Quiet Ride',
  chatty_driver: 'Chatty Driver',
  music_on: 'Music On',
  cold_ac: 'AC Must Be Cold',
};

export default function DriverRideRequestModal({
  visible,
  trip,
  countdownSeconds,
  countdownTotal = DRIVER_OFFER_COUNTDOWN_SECONDS,
  fareInput,
  onFareInputChange,
  accepting,
  onAccept,
  onIgnore,
  driverLat,
  driverLng,
}: Props) {
  const { height: windowH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const fareInputRef = useRef<TextInput>(null);

  const mapHeight = useMemo(() => {
    const h = Math.round(windowH * 0.28);
    return Math.min(220, Math.max(152, h));
  }, [windowH]);

  const baseFare = Math.round(
    Number(trip?.base_price ?? trip?.recommended_fare ?? trip?.base_fare ?? 0)
  );
  const riderOffer = Math.round(Number(trip?.offered_fare ?? trip?.fare ?? 0));
  const maxFare = trip?.max_price != null ? Math.round(Number(trip.max_price)) : null;
  const minFare = trip?.min_price != null ? Math.round(Number(trip.min_price)) : null;
  const distanceKm = trip?.distance_km != null ? Number(trip.distance_km) : null;
  const durationMins = trip?.duration_mins != null ? Number(trip.duration_mins) : null;
  const surgeMul = trip?.surge_multiplier != null ? Number(trip.surge_multiplier) : 1;
  const highDemand = surgeMul > 1.04;

  const pricePerKm =
    distanceKm && distanceKm > 0 && riderOffer > 0
      ? Math.round(riderOffer / distanceKm)
      : null;

  const fairTier = useMemo(
    () => computeFairTier(baseFare || riderOffer, riderOffer, minFare),
    [baseFare, riderOffer, minFare]
  );

  const fairConfig = {
    good: { label: 'Strong offer', sub: 'At or above suggested fare', color: C.success, icon: 'trending-up' as const },
    fair: { label: 'Fair', sub: 'Within typical range', color: '#EAB308', icon: 'remove-outline' as const },
    low: { label: 'Below suggested', sub: 'Rider is under system guidance', color: C.danger, icon: 'alert-circle-outline' as const },
  }[fairTier];

  const riderName =
    (trip?.shield?.rider_display_name as string)?.trim() || 'Rider';
  const initial = riderName.charAt(0).toUpperCase() || 'R';
  const rating =
    trip?.shield?.rider_reputation_avg != null
      ? Number(trip.shield.rider_reputation_avg).toFixed(1)
      : null;
  const ratingCount = trip?.shield?.rider_reputation_trip_count ?? null;
  const riderRiskScore =
    trip?.shield?.rider_risk_score != null ? Number(trip.shield.rider_risk_score) : null;
  const riderRiskBand = String(trip?.shield?.rider_risk_band || '').toLowerCase();
  const riderRiskConfig =
    riderRiskBand === 'green'
      ? { label: 'Green', color: C.success, hint: 'Low safety risk' }
      : riderRiskBand === 'yellow'
        ? { label: 'Yellow', color: '#EAB308', hint: 'Moderate caution' }
        : riderRiskBand === 'red'
          ? { label: 'Red', color: C.danger, hint: 'High caution' }
          : null;

  const distPickup = trip?.distance_to_pickup != null ? Number(trip.distance_to_pickup) : null;
  const etaPickupMin =
    distPickup != null && distPickup >= 0 ? Math.max(1, Math.round(distPickup * 2.2)) : null;

  const paymentRaw = (trip?.payment_method || 'cash') as string;
  const paymentLabel =
    paymentRaw === 'cash'
      ? 'Cash'
      : paymentRaw.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());

  // Category display
  const rawCat = String(trip?.service_type || trip?.vehicle_type || 'economy').toLowerCase();
  const normCat = rawCat === 'standard' ? 'economy' : rawCat;
  const CATEGORY_META: Record<string, { label: string; color: string; icon: string }> = {
    economy:     { label: 'Standard',  color: '#00D46A', icon: 'car-outline' },
    comfort:     { label: 'Comfort',   color: '#0EA5E9', icon: 'car-sport-outline' },
    xl:          { label: 'XL',        color: '#FFB800', icon: 'bus-outline' },
    premium:     { label: 'Premium',   color: '#9333EA', icon: 'rocket-outline' },
    female_only: { label: 'Women Only',color: '#EC4899', icon: 'woman-outline' },
  };
  const catMeta = CATEGORY_META[normCat] ?? { label: normCat.toUpperCase(), color: '#94A3B8', icon: 'car-outline' };
  const ridePreferences = Array.isArray(trip?.ride_preferences)
    ? (trip.ride_preferences as string[])
        .map((item) => RIDE_PREFERENCE_LABELS[item] || item.replace(/_/g, ' '))
        .slice(0, 4)
    : [];

  const pl = trip?.pickup_location;
  const dl = trip?.dropoff_location;
  const pLat = typeof pl === 'object' && pl ? (pl as any).lat : null;
  const pLng = typeof pl === 'object' && pl ? (pl as any).lng : null;
  const dLat = typeof dl === 'object' && dl ? (dl as any).lat : null;
  const dLng = typeof dl === 'object' && dl ? (dl as any).lng : null;

  const applyChip = useCallback(
    (pct: number) => {
      const base = riderOffer > 0 ? riderOffer : baseFare;
      if (!base) return;
      let next = roundFare(base * (1 + pct));
      if (maxFare != null && maxFare > 0) next = Math.min(next, maxFare);
      if (minFare != null && minFare > 0) next = Math.max(next, minFare);
      if (riderOffer > 0) next = Math.max(next, riderOffer);
      onFareInputChange(String(next));
    },
    [riderOffer, baseFare, maxFare, minFare, onFareInputChange]
  );

  /** Highlight increment chip closest to suggested fare (decision assist). */
  const recommendedChipIndex = useMemo(() => {
    const target = baseFare > 0 ? baseFare : riderOffer;
    if (!target || !riderOffer) return 1;
    let bestI = 0;
    let bestScore = Infinity;
    CHIP_PRESETS.forEach((c, i) => {
      let v = roundFare(riderOffer * (1 + c.pct));
      if (maxFare != null && maxFare > 0) v = Math.min(v, maxFare);
      const score = Math.abs(v - target);
      if (score < bestScore) {
        bestScore = score;
        bestI = i;
      }
    });
    return bestI;
  }, [baseFare, riderOffer, maxFare]);

  const selectedFare = parseFareInput(fareInput);
  const acceptLabelFare =
    Number.isFinite(selectedFare) && selectedFare > 0
      ? selectedFare
      : riderOffer || baseFare;

  const progress = Math.max(0, Math.min(1, countdownSeconds / countdownTotal));

  const pickupLine =
    typeof pl === 'string' ? pl : pl?.address || 'Pickup area';
  const dropLine =
    typeof dl === 'string'
      ? dl
      : dl?.address ||
        (typeof trip?.destination === 'string'
          ? trip.destination
          : (trip?.destination as any)?.address || 'Destination area');

  if (!trip) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <SafeAreaView style={styles.root} edges={['top']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
        >
          <View style={styles.flex}>
            {/* —— What is happening? —— */}
            <View style={styles.topBlock}>
              <View style={styles.header}>
                <View style={styles.headerLeft}>
                  <Text style={styles.headerEyebrow}>Incoming request</Text>
                  <Text style={styles.headerTitle}>Review trip</Text>
                  <Text style={styles.headerSub}>Map · route · fare — then accept or counter</Text>
                </View>
                <View style={styles.timerPill}>
                  <Ionicons name="time-outline" size={16} color="#EAB308" />
                  <Text style={styles.timerText}>{countdownSeconds}s</Text>
                </View>
              </View>

              <View style={styles.timerTrack}>
                <LinearGradient
                  colors={[C.primary, C.primaryDark]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[styles.timerFill, { width: `${progress * 100}%` }]}
                />
              </View>

              <DriverOfferRoutePreview
                routePreviewCoordinates={trip?.route_preview_coordinates}
                mapPreviewRegion={trip?.map_preview_region}
                pickupLat={pLat}
                pickupLng={pLng}
                dropLat={dLat}
                dropLng={dLng}
                areaSummaryLine={trip?.area_summary_line}
                distanceKm={distanceKm}
                durationMins={durationMins}
                distToPickupKm={distPickup}
                etaToPickupMin={etaPickupMin}
                pickupAddress={pickupLine !== 'Pickup area' ? pickupLine : null}
                dropAddress={dropLine !== 'Destination area' ? dropLine : null}
                driverLat={driverLat}
                driverLng={driverLng}
                mapHeight={mapHeight}
                interactive
                interactionLocked
                darkOverlay
              />

              {highDemand && (
                <View style={styles.demandBanner}>
                  <Ionicons name="flash" size={16} color={C.surge} />
                  <Text style={styles.demandText}>
                    High demand area · {surgeMul.toFixed(1)}×
                  </Text>
                </View>
              )}

              {/* PRICE = largest */}
              <View style={styles.priceHero}>
                <View style={styles.priceHeroTop}>
                  <Text style={styles.priceHeroLabel}>Rider offer (you earn)</Text>
                  {/* Category badge — always shown so driver knows exactly what type this is */}
                  <View style={[styles.catBadge, { backgroundColor: catMeta.color + '20', borderColor: catMeta.color + '55' }]}>
                    <Ionicons name={catMeta.icon as any} size={13} color={catMeta.color} />
                    <Text style={[styles.catBadgeText, { color: catMeta.color }]}>{catMeta.label}</Text>
                  </View>
                </View>
                <Text style={styles.priceHeroAmount}>₦{riderOffer.toLocaleString()}</Text>
                <View style={styles.priceHeroMeta}>
                  {distanceKm != null && (
                    <Text style={styles.priceHeroMetaText}>
                      {Number(distanceKm).toFixed(distanceKm >= 10 ? 0 : 1)} km
                    </Text>
                  )}
                  {durationMins != null && (
                    <Text style={styles.priceHeroMetaText}> · ~{durationMins} min</Text>
                  )}
                  {etaPickupMin != null && (
                    <Text style={styles.priceHeroMetaText}> · ~{etaPickupMin} min to A</Text>
                  )}
                  {pricePerKm != null && (
                    <Text style={styles.priceHeroMetaText}> · ~₦{pricePerKm}/km</Text>
                  )}
                </View>
                {baseFare > 0 && (
                  <Text style={styles.suggestedSmall}>
                    Suggested ₦{baseFare.toLocaleString()}
                    {minFare != null || maxFare != null
                      ? ` · Range ${minFare != null ? `₦${minFare.toLocaleString()}` : '—'}${
                          maxFare != null ? `–₦${maxFare.toLocaleString()}` : ''
                        }`
                      : ''}
                  </Text>
                )}
              </View>

              {/* ROUTE = second priority */}
              <View style={styles.routeCompact}>
                {/* Pickup row */}
                <View style={styles.routeCompactRow}>
                  <View style={[styles.badge, { backgroundColor: C.routeBlue }]}>
                    <Text style={styles.badgeText}>A</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.routeCompactText} numberOfLines={1}>
                      {pickupLine}
                    </Text>
                    {etaPickupMin != null && (
                      <Text style={styles.routeCompactSub}>
                        <Ionicons name="navigate" size={10} color="#0ea5e9" />
                        {' '}~{etaPickupMin} min to reach pickup
                        {distPickup != null ? ` · ${distPickup < 1 ? `${Math.round(distPickup * 1000)}m` : `${distPickup.toFixed(1)}km`} away` : ''}
                      </Text>
                    )}
                  </View>
                </View>
                {/* Connector */}
                <View style={styles.routeConnector}>
                  <View style={styles.routeConnectorLine} />
                  {distanceKm != null && (
                    <View style={styles.routeDistancePill}>
                      <Text style={styles.routeDistancePillText}>
                        {Number(distanceKm).toFixed(distanceKm >= 10 ? 0 : 1)} km · ~{durationMins ?? '?'} min trip
                      </Text>
                    </View>
                  )}
                  <View style={styles.routeConnectorLine} />
                </View>
                {/* Dropoff row */}
                <View style={styles.routeCompactRow}>
                  <View style={[styles.badge, { backgroundColor: C.primary }]}>
                    <Text style={[styles.badgeText, { color: C.primaryInk }]}>B</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.routeCompactText} numberOfLines={1}>
                      {dropLine}
                    </Text>
                    {pricePerKm != null && (
                      <Text style={styles.routeCompactSub}>
                        ₦{pricePerKm}/km · {paymentLabel}
                      </Text>
                    )}
                  </View>
                </View>
                {/* Bottom chips */}
                <View style={styles.routeBottomChips}>
                  <View style={styles.payChip}>
                    <Ionicons name="wallet-outline" size={13} color={C.primary} />
                    <Text style={styles.payChipText}>{paymentLabel}</Text>
                  </View>
                  {highDemand && (
                    <View style={[styles.payChip, { borderColor: '#f59e0b55', gap: 4 }]}>
                      <Ionicons name="flash" size={13} color="#f59e0b" />
                      <Text style={[styles.payChipText, { color: '#f59e0b' }]}>{surgeMul.toFixed(1)}× surge</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>

            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.riderRow}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initial}</Text>
                </View>
                <View style={styles.riderMeta}>
                  <Text style={styles.riderName} numberOfLines={1}>
                    {riderName}
                  </Text>
                  <View style={styles.riderStats}>
                    {rating != null && (
                      <View style={styles.statChip}>
                        <Ionicons name="star" size={14} color="#EAB308" />
                        <Text style={styles.statChipText}>
                          {rating}
                          {ratingCount != null ? ` (${ratingCount})` : ''}
                        </Text>
                      </View>
                    )}
                    {riderRiskConfig && (
                      <View style={[styles.statChip, { borderColor: riderRiskConfig.color + '66' }]}>
                        <Ionicons name="shield-outline" size={14} color={riderRiskConfig.color} />
                        <Text style={[styles.statChipText, { color: riderRiskConfig.color }]}>
                          {riderRiskConfig.label}
                          {riderRiskScore != null ? ` ${Math.round(riderRiskScore)}` : ''}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>

              <View style={[styles.fairCard, { borderColor: fairConfig.color + '55' }]}>
                <View style={[styles.fairIconWrap, { backgroundColor: fairConfig.color + '22' }]}>
                  <Ionicons name={fairConfig.icon} size={22} color={fairConfig.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fairLabel, { color: fairConfig.color }]}>{fairConfig.label}</Text>
                  <Text style={styles.fairSub}>{fairConfig.sub}</Text>
                </View>
              </View>

              {trip?.shield && (
                <View
                  style={[
                    styles.shield,
                    trip.shield.rider_flagged_low_reputation && styles.shieldWarn,
                  ]}
                >
                  <Ionicons
                    name="shield-checkmark"
                    size={20}
                    color={trip.shield.rider_flagged_low_reputation ? C.danger : C.primary}
                  />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.shieldTitle}>NEXRYDE Shield</Text>
                    <Text style={styles.shieldBody}>
                      {trip.shield.rider_new_account
                        ? 'New rider — limited reputation history.'
                        : `Driver-rated ${trip.shield.rider_reputation_avg != null ? `${Number(trip.shield.rider_reputation_avg).toFixed(1)}★` : '—'} · ${trip.shield.rider_reputation_trip_count ?? 0} trips`}
                      {riderRiskConfig ? ` · Safety band ${riderRiskConfig.label} (${riderRiskConfig.hint})` : ''}
                    </Text>
                  </View>
                </View>
              )}

              {ridePreferences.length > 0 && (
                <>
                  <Text style={styles.sectionLabel}>Rider vibe preferences</Text>
                  <View style={styles.prefRow}>
                    {ridePreferences.map((preference) => (
                      <View key={preference} style={styles.prefChip}>
                        <Ionicons name="sparkles-outline" size={14} color={C.primary} />
                        <Text style={styles.prefChipText}>{preference}</Text>
                      </View>
                    ))}
                  </View>
                </>
              )}

              <Text style={styles.sectionLabel}>Counter with one tap</Text>
              <View style={styles.chipsRow}>
                {CHIP_PRESETS.map((c, idx) => {
                  const best = idx === recommendedChipIndex;
                  return (
                    <TouchableOpacity
                      key={c.label}
                      style={[styles.chip, best && styles.chipBest]}
                      onPress={() => applyChip(c.pct)}
                      activeOpacity={0.85}
                    >
                      {best && <Ionicons name="flash-outline" size={14} color={C.primary} style={{ marginRight: 4 }} />}
                      <Text style={[styles.chipText, best && styles.chipTextBest]}>{c.label}</Text>
                    </TouchableOpacity>
                  );
                })}
                <TouchableOpacity
                  style={[styles.chip, styles.chipAccent]}
                  onPress={() => fareInputRef.current?.focus()}
                  activeOpacity={0.85}
                >
                  <Text style={styles.chipTextAccent}>Custom</Text>
                  <Ionicons name="create-outline" size={16} color={C.primary} />
                </TouchableOpacity>
              </View>

              <TextInput
                ref={fareInputRef}
                style={styles.input}
                keyboardType="number-pad"
                value={fareInput}
                onChangeText={onFareInputChange}
                placeholder="Your fare (₦)"
                placeholderTextColor={C.muted}
              />
            </ScrollView>

            {/* —— What should I do next? —— sticky */}
            <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, DS_SPACE.sm) + 8 }]}>
              <TouchableOpacity
                style={[styles.primaryBtn, accepting && { opacity: 0.72 }]}
                onPress={() => {
                  if (Platform.OS !== 'web') {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  }
                  onAccept();
                }}
                disabled={accepting}
                activeOpacity={0.92}
              >
                <LinearGradient
                  colors={[C.primary, C.primaryDark]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.primaryGrad}
                >
                  <Text style={styles.primaryText}>
                    {accepting ? 'Accepting…' : `Accept · ₦${acceptLabelFare.toLocaleString()}`}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>

              <View style={styles.secondaryRow}>
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={() => fareInputRef.current?.focus()}
                  activeOpacity={0.88}
                >
                  <Ionicons name="swap-vertical" size={18} color={C.text} />
                  <Text style={styles.secondaryText}>Counter offer</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.rejectBtn}
                  onPress={() => {
                    if (Platform.OS !== 'web') {
                      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }
                    onIgnore();
                  }}
                  activeOpacity={0.88}
                >
                  <Ionicons name="close-circle-outline" size={18} color={C.danger} />
                  <Text style={styles.rejectText}>Reject</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

export { DRIVER_OFFER_COUNTDOWN_SECONDS as DRIVER_OFFER_TIMER_SECONDS };

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  flex: { flex: 1 },
  topBlock: {
    paddingHorizontal: DS_SPACE.sm,
    paddingBottom: DS_SPACE.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingTop: DS_SPACE.xs,
    paddingBottom: DS_SPACE.xs,
  },
  headerLeft: { flex: 1, paddingRight: DS_SPACE.sm },
  headerEyebrow: {
    ...DS_TYPE.caption,
    color: C.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: C.text,
    letterSpacing: -0.4,
  },
  headerSub: {
    ...DS_TYPE.caption,
    color: C.muted,
    marginTop: 4,
  },
  timerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.cardElevated,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: DS_RADIUS.pill,
    borderWidth: 1,
    borderColor: C.border,
  },
  timerText: { fontSize: 15, fontWeight: '800', color: C.text },
  timerTrack: {
    height: 3,
    backgroundColor: C.cardElevated,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: DS_SPACE.xs,
  },
  timerFill: { height: 3, borderRadius: 2 },
  demandBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
    paddingHorizontal: DS_SPACE.sm,
    paddingVertical: 10,
    borderRadius: DS_RADIUS.md,
    marginBottom: DS_SPACE.sm,
    marginHorizontal: DS_SPACE.xs,
  },
  demandText: {
    ...DS_TYPE.body,
    fontSize: 14,
    color: C.surge,
    flex: 1,
  },
  priceHero: {
    backgroundColor: C.card,
    borderRadius: DS_RADIUS.lg,
    padding: DS_SPACE.sm,
    marginHorizontal: DS_SPACE.xs,
    marginBottom: DS_SPACE.sm,
    borderWidth: 1,
    borderColor: C.border,
  },
  priceHeroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  priceHeroLabel: {
    ...DS_TYPE.caption,
    color: C.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  catBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  catBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  priceHeroAmount: {
    ...DS_TYPE.display,
    fontSize: 44,
    lineHeight: 48,
    color: C.primary,
  },
  priceHeroMeta: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 },
  priceHeroMetaText: {
    ...DS_TYPE.body,
    fontSize: 14,
    color: C.muted,
    fontWeight: '600',
  },
  suggestedSmall: {
    ...DS_TYPE.caption,
    marginTop: 10,
    color: C.muted,
  },
  routeCompact: {
    backgroundColor: C.card,
    borderRadius: DS_RADIUS.lg,
    padding: DS_SPACE.sm,
    marginHorizontal: DS_SPACE.xs,
    marginBottom: DS_SPACE.xs,
    borderWidth: 1,
    borderColor: C.border,
  },
  routeCompactRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  routeArrow: { marginLeft: 13, marginVertical: 2 },
  routeCompactSub: { fontSize: 11, color: '#64748b', marginTop: 2, fontWeight: '600' },
  routeConnector: {
    flexDirection: 'row', alignItems: 'center', marginLeft: 14, marginVertical: 4, gap: 6,
  },
  routeConnectorLine: { flex: 1, height: 1, backgroundColor: 'rgba(148,163,184,0.2)' },
  routeDistancePill: {
    backgroundColor: 'rgba(14,165,233,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 0.5,
    borderColor: 'rgba(14,165,233,0.3)',
  },
  routeDistancePillText: { fontSize: 10, fontWeight: '800', color: '#0ea5e9' },
  routeBottomChips: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  badge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 14, fontWeight: '900', color: '#FFF' },
  routeCompactText: {
    ...DS_TYPE.body,
    lineHeight: 21,
    color: C.text,
  },
  payChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: DS_RADIUS.pill,
  },
  payChipText: { fontSize: 13, fontWeight: '800', color: C.primary },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: DS_SPACE.sm,
    paddingBottom: DS_SPACE.md,
  },
  riderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: DS_SPACE.sm,
    gap: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: C.cardElevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },
  avatarText: { fontSize: 20, fontWeight: '900', color: C.text },
  riderMeta: { flex: 1 },
  riderName: { fontSize: 17, fontWeight: '800', color: C.text },
  riderStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  statChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(234,179,8,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statChipText: { fontSize: 13, fontWeight: '700', color: '#EAB308' },
  fairCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderRadius: DS_RADIUS.md,
    padding: 14,
    marginBottom: DS_SPACE.sm,
    borderWidth: 1,
    gap: 12,
  },
  fairIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fairLabel: { fontSize: 15, fontWeight: '800' },
  fairSub: { fontSize: 12, fontWeight: '600', color: C.muted, marginTop: 2 },
  shield: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(34,197,94,0.08)',
    borderRadius: 14,
    padding: 14,
    marginBottom: DS_SPACE.sm,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.25)',
  },
  shieldWarn: {
    backgroundColor: C.dangerSoft,
    borderColor: 'rgba(239,68,68,0.35)',
  },
  shieldTitle: { fontSize: 13, fontWeight: '800', color: C.text },
  shieldBody: { fontSize: 12, fontWeight: '600', color: C.muted, marginTop: 4, lineHeight: 17 },
  prefRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 18,
  },
  prefChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  prefChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: C.text,
  },
  sectionLabel: {
    ...DS_TYPE.caption,
    color: C.muted,
    letterSpacing: 0.8,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: DS_RADIUS.sm,
    backgroundColor: C.cardElevated,
    borderWidth: 1,
    borderColor: C.border,
  },
  chipBest: {
    borderColor: C.primary,
    backgroundColor: 'rgba(34,197,94,0.12)',
  },
  chipText: { fontSize: 14, fontWeight: '800', color: C.text },
  chipTextBest: { color: C.primary },
  chipAccent: {
    borderColor: 'rgba(34,197,94,0.45)',
    backgroundColor: 'rgba(34,197,94,0.1)',
  },
  chipTextAccent: { fontSize: 14, fontWeight: '800', color: C.primary },
  input: {
    backgroundColor: C.cardElevated,
    borderRadius: DS_RADIUS.md,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: DS_SPACE.sm,
    paddingVertical: 14,
    fontSize: 18,
    fontWeight: '800',
    color: C.text,
    marginBottom: DS_SPACE.sm,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingHorizontal: DS_SPACE.sm,
    paddingTop: DS_SPACE.sm,
    backgroundColor: C.bg,
  },
  primaryBtn: { borderRadius: DS_RADIUS.lg, overflow: 'hidden', marginBottom: 10 },
  primaryGrad: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  primaryText: { fontSize: 18, fontWeight: '900', color: C.primaryInk },
  secondaryRow: { flexDirection: 'row', gap: 10 },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.cardElevated,
    paddingVertical: 14,
    borderRadius: DS_RADIUS.md,
    borderWidth: 1,
    borderColor: C.border,
  },
  secondaryText: { fontSize: 15, fontWeight: '800', color: C.text },
  rejectBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: DS_RADIUS.md,
    backgroundColor: C.dangerSoft,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.35)',
  },
  rejectText: { fontSize: 15, fontWeight: '800', color: C.danger },
});

/**
 * DriverMapOfferDock — Uber-standard ride offer card.
 *
 * Design principles (Uber study):
 * • Fare is the hero — displayed large, instantly legible
 * • Pickup distance/ETA is the #2 priority — drivers decide on proximity
 * • Countdown is visible but not panic-inducing
 * • Accept = one big, confident tap; Decline = small, secondary
 * • Counter offer is progressive — hidden by default, expandable
 * • Route is scannable in 1 second: pickup → destination
 */
import React, { useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { DOCK_BLUR_INTENSITY, DOCK_TOP_RADIUS } from '@/src/components/driver/driverDockTheme';
import { useThemeColors } from '@/src/constants/theme';
import { TripProfileAvatar } from '@/src/components/TripProfileAvatar';
import { DriverOfferBidActions } from '@/src/components/driver/DriverOfferBidActions';

// ─── Design tokens ─────────────────────────────────────────────────────────────
const G   = '#00D47E';
const G2  = '#34F5B8';
const RED = '#EF4444';
const AMB = '#F59E0B';

type OfferTok = { BG: string; SRF: string; SRF2: string; TXT: string; MUT: string };
function offerTokens(isDark: boolean, colors: { background: string; card: string; surfaceAlt: string; text: string; textMuted: string }): OfferTok {
  if (isDark) {
    return { BG: '#080E1A', SRF: '#111827', SRF2: '#1A2438', TXT: '#F1F5F9', MUT: '#64748B' };
  }
  return { BG: colors.background, SRF: colors.card, SRF2: colors.surfaceAlt, TXT: colors.text, MUT: colors.textMuted };
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
type TripOffer = Record<string, any>;

function readLatLng(loc: unknown): { lat: number | null; lng: number | null } {
  if (loc == null) return { lat: null, lng: null };
  const o = loc as Record<string, unknown>;
  const lat = Number(o.lat ?? o.latitude);
  const lng = Number(o.lng ?? o.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : { lat: null, lng: null };
}

function shortAddr(addr: string, max = 28): string {
  const s = addr.split(',')[0]?.trim() || addr.trim();
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

function fmtKm(km: number | null): string {
  if (km == null || !Number.isFinite(km)) return '';
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

function fmtFare(n: number): string {
  return `₦${Math.round(n).toLocaleString()}`;
}

// Circular countdown SVG-style using Animated border trick
function CountdownRing({
  seconds,
  total,
  size = 54,
}: {
  seconds: number;
  total: number;
  size?: number;
}) {
  const progress = Math.max(0, Math.min(1, seconds / Math.max(1, total)));
  const urgent   = seconds <= 8;
  const warning  = seconds <= 15;
  const color    = urgent ? RED : warning ? AMB : G;
  const anim     = useRef(new Animated.Value(progress)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: progress,
      duration: 900,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
  }, [progress, anim]);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* Track ring */}
      <View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 3,
          borderColor: 'rgba(255,255,255,0.08)',
        }}
      />
      {/* Number */}
      <Text
        style={{
          fontSize: size * 0.38,
          fontWeight: '900',
          color,
          fontVariant: ['tabular-nums'],
          letterSpacing: -1,
        }}
      >
        {Math.max(0, Math.ceil(seconds))}
      </Text>
      <Text style={{ fontSize: 9, fontWeight: '700', color: '#64748B', letterSpacing: 0.4 }}>sec</Text>
    </View>
  );
}

// ─── Props ─────────────────────────────────────────────────────────────────────
export type Props = {
  trip: TripOffer;
  countdownSeconds: number;
  countdownTotal: number;
  fareInput: string;
  onFareInputChange: (v: string) => void;
  accepting: boolean;
  onAcceptRiderPrice: () => void;
  onAcceptCounterPrice: () => void;
  onDecline: () => void;
};

// ─── Component ─────────────────────────────────────────────────────────────────
function DriverMapOfferDock({
  trip,
  countdownSeconds,
  countdownTotal,
  fareInput,
  onFareInputChange,
  accepting,
  onAcceptRiderPrice,
  onAcceptCounterPrice,
  onDecline,
}: Props) {
  const { colors, isDark } = useThemeColors();
  const { BG, SRF, SRF2, TXT, MUT } = offerTokens(isDark, colors);
  const s = React.useMemo(() => createOfferStyles({ BG, SRF, SRF2, TXT, MUT }), [BG, SRF, SRF2, TXT, MUT]);
  const blurTint = isDark ? 'dark' : 'light';
  const riderName  = trip?.rider_name || trip?.rider?.name || 'Rider';
  const riderPhoto = trip?.rider_photo || trip?.rider?.profile_image || null;
  const rating     = trip?.shield?.rider_reputation_avg != null
    ? Number(trip.shield.rider_reputation_avg)
    : null;
  const ratingCount= trip?.shield?.rider_reputation_trip_count ?? null;
  const verified   = Boolean(trip?.shield && !trip.shield?.rider_new_account && !trip.shield?.rider_flagged_low_reputation);
  const newRider   = Boolean(trip?.shield?.rider_new_account);

  const pl         = trip?.pickup_location;
  const dl         = trip?.dropoff_location;
  const pickupAddr = (typeof pl === 'string' ? pl : (pl as any)?.address) || 'Pickup';
  const dropAddr   = (typeof dl === 'string' ? dl : (dl as any)?.address)
    || (typeof trip?.destination === 'string' ? trip.destination : (trip?.destination as any)?.address)
    || 'Destination';

  const pickupKm   = trip?.distance_to_pickup != null ? Number(trip.distance_to_pickup)
    : trip?.distance_to_pickup_km != null ? Number(trip.distance_to_pickup_km) : null;
  const tripKm     = trip?.distance_km != null ? Number(trip.distance_km) : null;
  const riderOffer = Math.max(0, Math.round(Number(trip?.offered_fare ?? trip?.fare ?? 0)));

  const tripDurMin = useMemo(() => {
    if (trip?.duration_mins != null && Number.isFinite(Number(trip.duration_mins)))
      return Math.max(1, Math.round(Number(trip.duration_mins)));
    if (tripKm != null && Number.isFinite(tripKm))
      return Math.max(1, Math.round((tripKm / 26) * 60));
    return null;
  }, [trip?.duration_mins, tripKm]);

  const pickupEta = useMemo(() => {
    if (trip?.eta_to_pickup_min != null) return Math.max(1, Math.round(Number(trip.eta_to_pickup_min)));
    if (pickupKm != null && Number.isFinite(pickupKm)) return Math.max(1, Math.round((pickupKm / 25) * 60));
    return null;
  }, [trip?.eta_to_pickup_min, pickupKm]);

  const offerExpired   = countdownSeconds <= 0;
  const urgentCountdown= countdownSeconds <= 8;
  const warnCountdown  = countdownSeconds <= 15;

  const minFare = trip?.min_price != null ? Math.round(Number(trip.min_price)) : null;
  const maxFare = trip?.max_price != null ? Math.round(Number(trip.max_price)) : null;

  // Countdown bar progress
  const barProgress = Math.max(0, Math.min(1, countdownSeconds / Math.max(1, countdownTotal)));

  return (
    <View style={s.shell}>
      {Platform.OS !== 'web' ? (
        <BlurView intensity={DOCK_BLUR_INTENSITY} tint={blurTint} style={StyleSheet.absoluteFillObject} />
      ) : (
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: isDark ? 'rgba(8,14,26,0.98)' : 'rgba(255,255,255,0.97)' }]} />
      )}
      <LinearGradient
        colors={['rgba(0,212,126,0.09)', BG, BG]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />

      {/* Drag handle */}
      <View style={s.handleWrap}>
        <View style={s.handle} />
      </View>

      {/* ── Countdown progress bar ─────────────────────────────────── */}
      <View style={s.countdownTrack}>
        <Animated.View
          style={[
            s.countdownFill,
            {
              width: `${Math.round(barProgress * 100)}%`,
              backgroundColor: urgentCountdown ? RED : warnCountdown ? AMB : G,
            },
          ]}
        />
      </View>

      {/* ── Top row: rider info + countdown ───────────────────────── */}
      <View style={s.topRow}>
        <TripProfileAvatar
          size={56}
          uri={riderPhoto ? String(riderPhoto) : null}
          person={trip as unknown as Record<string, unknown>}
          role="rider"
          borderColor="#FFFFFF"
          borderWidth={2}
          accessibilityLabel={`Photo of ${riderName}`}
        />
        <View style={s.riderInfo}>
          <View style={s.riderNameRow}>
            <Text style={s.riderName} numberOfLines={1}>{riderName}</Text>
            {verified && (
              <Ionicons name="checkmark-circle" size={15} color={G} style={{ marginLeft: 5 }} />
            )}
          </View>
          {rating != null ? (
            <View style={s.ratingRow}>
              <Ionicons name="star" size={12} color="#FBBF24" />
              <Text style={s.ratingTxt}>
                {rating.toFixed(1)}
                {typeof ratingCount === 'number' && ratingCount > 0 ? ` · ${ratingCount} trips` : ''}
              </Text>
            </View>
          ) : newRider ? (
            <Text style={s.newRiderBadge}>New rider</Text>
          ) : null}
        </View>
        <CountdownRing seconds={countdownSeconds} total={countdownTotal} size={54} />
      </View>

      {/* ── Hero: fare + pickup proximity ─────────────────────────── */}
      <View style={s.heroCard}>
        <LinearGradient
          colors={['rgba(0,212,126,0.12)', 'rgba(0,212,126,0.04)']}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />
        <View style={s.heroLeft}>
          <Text style={s.fareLabel}>Fare offered</Text>
          <Text style={s.fareAmount}>{fmtFare(riderOffer)}</Text>
          {tripDurMin != null && tripKm != null ? (
            <Text style={s.fareSub}>
              {fmtKm(tripKm)} · {tripDurMin} min trip
            </Text>
          ) : tripKm != null ? (
            <Text style={s.fareSub}>{fmtKm(tripKm)} trip</Text>
          ) : null}
        </View>
        <View style={s.heroDivider} />
        <View style={s.heroRight}>
          {pickupEta != null ? (
            <>
              <Text style={s.pickupLabel}>Pickup in</Text>
              <Text style={s.pickupEta}>{pickupEta} min</Text>
            </>
          ) : (
            <>
              <Text style={s.pickupLabel}>Distance</Text>
              <Text style={s.pickupEta}>{fmtKm(pickupKm) || '—'}</Text>
            </>
          )}
          {pickupKm != null && (
            <Text style={s.pickupKm}>{fmtKm(pickupKm)} away</Text>
          )}
        </View>
      </View>

      {/* ── Route strip ───────────────────────────────────────────── */}
      <View style={s.routeCard}>
        {/* Pickup */}
        <View style={s.routeRow}>
          <View style={s.routeDotWrap}>
            <View style={[s.routeDot, { backgroundColor: G }]} />
            <View style={s.routeLine} />
          </View>
          <View style={s.routeTextCol}>
            <Text style={s.routeLabel}>Pickup</Text>
            <Text style={s.routeAddr} numberOfLines={2}>{pickupAddr}</Text>
          </View>
        </View>
        {/* Destination */}
        <View style={[s.routeRow, { marginTop: 2 }]}>
          <View style={s.routeDotWrap}>
            <View style={[s.routeDot, { backgroundColor: '#60A5FA', borderRadius: 3 }]} />
          </View>
          <View style={s.routeTextCol}>
            <Text style={s.routeLabel}>Drop-off</Text>
            <Text style={s.routeAddrBlue} numberOfLines={2}>{dropAddr}</Text>
          </View>
        </View>
      </View>

      <DriverOfferBidActions
        key={String(trip?.offer_id ?? trip?.id ?? 'offer')}
        riderOffer={riderOffer}
        minFare={minFare}
        maxFare={maxFare}
        fareInput={fareInput}
        onFareInputChange={onFareInputChange}
        accepting={accepting}
        offerExpired={offerExpired}
        onAcceptRiderPrice={onAcceptRiderPrice}
        onSendCounterPrice={onAcceptCounterPrice}
        onDecline={onDecline}
      />
    </View>
  );
}

export default React.memo(DriverMapOfferDock);

// ─── Utility exports ───────────────────────────────────────────────────────────
export function offerTripPickupDropCoords(trip: TripOffer | null) {
  if (!trip) return { pickup: null, drop: null, route: [] };
  const pl = trip.pickup_location;
  const dl = trip.dropoff_location;
  let { lat: pLat, lng: pLng } = readLatLng(pl);
  let { lat: dLat, lng: dLng } = readLatLng(dl);
  const raw = trip as Record<string, unknown>;
  if (pLat == null) { const fb = readLatLng(raw.pickup_coordinates); pLat = fb.lat; pLng = fb.lng; }
  if (dLat == null) { const fb = readLatLng(raw.destination_coordinates ?? raw.dropoff_coordinates); dLat = fb.lat; dLng = fb.lng; }
  const rpc = trip.route_preview_coordinates;
  if (Array.isArray(rpc)) {
    if (pLat == null) { const a = rpc[0] as any; pLat = Number(a?.lat ?? a?.latitude); pLng = Number(a?.lng ?? a?.longitude); }
    if (dLat == null) { const b = rpc[rpc.length - 1] as any; dLat = Number(b?.lat ?? b?.latitude); dLng = Number(b?.lng ?? b?.longitude); }
  }
  const route: Array<{ lat: number; lng: number }> = [];
  if (Array.isArray(rpc)) {
    for (const p of rpc) {
      const o = p as any;
      const lat = Number(o?.lat ?? o?.latitude), lng = Number(o?.lng ?? o?.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng)) route.push({ lat, lng });
    }
  }
  return {
    pickup: pLat != null && pLng != null ? { lat: pLat, lng: pLng } : null,
    drop:   dLat != null && dLng != null ? { lat: dLat, lng: dLng } : null,
    route,
  };
}

// ─── Styles ────────────────────────────────────────────────────────────────────
function createOfferStyles(t: OfferTok) {
  const { BG, SRF, SRF2, TXT, MUT } = t;
  return StyleSheet.create({
  shell: {
    borderTopLeftRadius: DOCK_TOP_RADIUS,
    borderTopRightRadius: DOCK_TOP_RADIUS,
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0,212,126,0.18)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 32,
  },
  handleWrap: { alignSelf: 'center', marginBottom: 12 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)' },

  // Countdown
  countdownTrack: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 16,
  },
  countdownFill: { height: 3, borderRadius: 2 },

  // Top row
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  riderInfo: { flex: 1, minWidth: 0 },
  riderNameRow: { flexDirection: 'row', alignItems: 'center' },
  riderName: { fontSize: 18, fontWeight: '800', color: TXT, letterSpacing: -0.3, flexShrink: 1 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  ratingTxt: { fontSize: 12, fontWeight: '600', color: '#CBD5E1' },
  newRiderBadge: { fontSize: 11, fontWeight: '700', color: '#94A3B8', marginTop: 3 },

  // Hero card
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: `${G}30`,
    backgroundColor: SRF2,
  },
  heroLeft: { flex: 1, minWidth: 0 },
  fareLabel: { fontSize: 10, fontWeight: '700', color: MUT, letterSpacing: 0.5, marginBottom: 4 },
  fareAmount: { fontSize: 32, fontWeight: '900', color: G, letterSpacing: -1 },
  fareSub: { fontSize: 12, fontWeight: '600', color: '#94A3B8', marginTop: 3 },
  heroDivider: { width: 1, height: 44, backgroundColor: 'rgba(255,255,255,0.08)', marginHorizontal: 16 },
  heroRight: { alignItems: 'flex-end' },
  pickupLabel: { fontSize: 10, fontWeight: '700', color: MUT, letterSpacing: 0.5, marginBottom: 4 },
  pickupEta: { fontSize: 22, fontWeight: '900', color: TXT, letterSpacing: -0.5 },
  pickupKm: { fontSize: 11, fontWeight: '600', color: '#94A3B8', marginTop: 2 },

  // Route card
  routeCard: {
    backgroundColor: SRF,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  routeRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  routeDotWrap: { alignItems: 'center', width: 12, paddingTop: 4 },
  routeDot: { width: 10, height: 10, borderRadius: 5 },
  routeLine: { width: 1.5, flex: 1, minHeight: 18, backgroundColor: 'rgba(255,255,255,0.12)', marginTop: 3 },
  routeTextCol: { flex: 1, minWidth: 0, paddingBottom: 8 },
  routeLabel: { fontSize: 10, fontWeight: '700', color: MUT, letterSpacing: 0.2, marginBottom: 2 },
  routeAddr: { fontSize: 14, fontWeight: '700', color: TXT, lineHeight: 20 },
  routeAddrBlue: { fontSize: 14, fontWeight: '700', color: '#93C5FD', lineHeight: 20 },

  // Counter toggle
  counterToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 2,
    marginBottom: 4,
  },
  counterToggleTxt: { fontSize: 12, fontWeight: '700', color: MUT },

  // Counter panel
  counterPanelSlot: { minHeight: 110, overflow: 'hidden' },
  counterPanel: { marginBottom: 4 },
  counterInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: `${G2}40`,
    backgroundColor: SRF,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 8,
    gap: 4,
  },
  currencySign: { fontSize: 20, fontWeight: '900', color: MUT },
  counterInput: { flex: 1, fontSize: 22, fontWeight: '900', color: G2, padding: 0 },
  counterDelta: { fontSize: 13, fontWeight: '800' },
  counterSubmitBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    backgroundColor: `${G}22`,
    borderWidth: 1,
    borderColor: `${G}55`,
    alignItems: 'center',
  },
  counterSubmitTxt: { fontSize: 14, fontWeight: '800', color: G2 },

  // Actions
  actions: { gap: 8, marginTop: 2 },
  acceptBtn: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: G,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 12,
  },
  acceptGrad: {
    paddingVertical: 17,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 58,
  },
  acceptInner: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  acceptTxt: { fontSize: 17, fontWeight: '900', color: '#022C22', letterSpacing: -0.3 },
  declineBtn: {
    alignItems: 'center',
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)',
  },
  declineTxt: { fontSize: 14, fontWeight: '800', color: '#FCA5A5' },
  btnDisabled: { opacity: 0.45 },
});
}

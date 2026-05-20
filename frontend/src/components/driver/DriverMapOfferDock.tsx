import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Image,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { DOCK_BLUR_INTENSITY, DOCK_TOP_RADIUS, HANDLE_GRADIENT_DEFAULT } from '@/src/components/driver/driverDockTheme';
import { TripProfileAvatar } from '@/src/components/TripProfileAvatar';
import { COLORS as THEME_COLORS } from '@/src/constants/theme';

type TripOffer = Record<string, any>;

function readLatLng(loc: unknown): { lat: number | null; lng: number | null } {
  if (loc == null) return { lat: null, lng: null };
  if (typeof loc === 'object') {
    const o = loc as Record<string, unknown>;
    const lat = Number(o.lat ?? o.latitude);
    const lng = Number(o.lng ?? o.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  return { lat: null, lng: null };
}

function firstSegment(addr: string, maxLen: number): string {
  const t = addr.split(',')[0]?.trim() || addr.trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen - 1)}…`;
}

function parseFareDigits(s: string): number {
  const n = Number(String(s).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : NaN;
}

type Props = {
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

export default function DriverMapOfferDock({
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
  const [counterEditing, setCounterEditing] = useState(false);

  const riderName =
    trip?.rider_name ||
    trip?.rider?.name ||
    (trip?.shield?.rider_display_name as string)?.trim() ||
    'Rider';
  const riderPhoto = trip?.rider_photo || trip?.rider?.profile_image || null;
  const rating =
    trip?.shield?.rider_reputation_avg != null
      ? Number(trip.shield.rider_reputation_avg).toFixed(1)
      : null;
  const ratingCount = trip?.shield?.rider_reputation_trip_count ?? null;

  const pl = trip?.pickup_location;
  const dl = trip?.dropoff_location;
  const pickupLine =
    typeof pl === 'string' ? pl : (pl as { address?: string })?.address || 'Pickup';
  const dropLine =
    typeof dl === 'string'
      ? dl
      : (dl as { address?: string })?.address ||
        (typeof trip?.destination === 'string'
          ? trip.destination
          : (trip?.destination as { address?: string })?.address || 'Destination');

  const pickupKm =
    trip?.distance_to_pickup != null
      ? Number(trip.distance_to_pickup)
      : trip?.distance_to_pickup_km != null
        ? Number(trip.distance_to_pickup_km)
        : null;
  const tripKm = trip?.distance_km != null ? Number(trip.distance_km) : null;
  const riderOffer = Math.round(Number(trip?.offered_fare ?? trip?.fare ?? 0));

  const tripDurMin = useMemo(() => {
    if (trip?.duration_mins != null && Number.isFinite(Number(trip.duration_mins))) {
      return Math.max(1, Math.round(Number(trip.duration_mins)));
    }
    if (tripKm != null && Number.isFinite(tripKm)) {
      return Math.max(1, Math.round((tripKm / 26) * 60));
    }
    return null;
  }, [trip?.duration_mins, tripKm]);

  const showVerifiedBadge = Boolean(
    trip?.shield &&
      !trip.shield?.rider_new_account &&
      !trip.shield?.rider_flagged_low_reputation
  );

  const pickupShort = firstSegment(pickupLine, 22);
  const destShort = firstSegment(dropLine, 14);
  const destWithEta =
    tripDurMin != null ? `${destShort} | ~${tripDurMin} min` : destShort;

  const counterParsed = Math.round(parseFareDigits(fareInput) || riderOffer);
  const counterDelta = counterParsed - riderOffer;

  const offerExpired = countdownSeconds <= 0;
  const ringProgress = useMemo(() => {
    const t = Math.max(1, countdownTotal);
    return Math.max(0, Math.min(1, countdownSeconds / t));
  }, [countdownSeconds, countdownTotal]);

  const counterInvalid =
    riderOffer > 0 && Number.isFinite(counterParsed) && counterParsed < riderOffer;

  return (
    <View style={s.shell} accessibilityViewIsModal>
      {Platform.OS !== 'web' ? (
        <BlurView intensity={DOCK_BLUR_INTENSITY} tint="dark" style={StyleSheet.absoluteFillObject} />
      ) : (
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(2,6,23,0.97)' }]} />
      )}
      <LinearGradient
        colors={['rgba(15,23,42,0.2)', 'rgba(2,6,23,0.94)', '#020617']}
        style={StyleSheet.absoluteFillObject}
      />
      <LinearGradient
        colors={['rgba(52,245,184,0.14)', 'transparent']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.45 }}
        style={s.shellSheen}
        pointerEvents="none"
      />
      <View style={s.handleWrap}>
        <LinearGradient
          colors={[...HANDLE_GRADIENT_DEFAULT]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFillObject}
        />
      </View>

      <View style={s.titlePill}>
        <LinearGradient
          colors={['rgba(52,245,184,0.22)', 'rgba(15,23,42,0.55)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <Ionicons name="notifications" size={15} color="#4ADE80" style={{ marginRight: 6 }} />
        <Text style={s.titleTxt}>New Ride Request</Text>
      </View>

      <View style={s.riderBlock}>
        <TripProfileAvatar
          size={52}
          uri={riderPhoto ? String(riderPhoto) : null}
          person={trip as Record<string, unknown>}
          role="rider"
          borderColor="rgba(52,245,184,0.5)"
          accessibilityLabel={`Photo of ${riderName}`}
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.riderName} numberOfLines={1}>
            {riderName}
          </Text>
          {rating ? (
            <View style={s.ratingRow}>
              <Ionicons name="star" size={14} color="#FBBF24" />
              <Text style={s.ratingTxt}>
                {rating}
                {typeof ratingCount === 'number' && ratingCount > 0
                  ? ` · ${ratingCount.toLocaleString()} rides`
                  : ''}
              </Text>
            </View>
          ) : null}
          {showVerifiedBadge ? (
            <View style={s.verifiedPill}>
              <Ionicons name="checkmark-circle" size={13} color="#34F5B8" />
              <Text style={s.verifiedTxt}>Verified rider</Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={s.routeStrip}>
        <View style={s.routeStripLeft}>
          <View style={s.dotG} />
          <Text style={s.routeStripAddr} numberOfLines={1}>
            {pickupShort}
          </Text>
        </View>
        <Text style={s.routeStripKm}>
          {tripKm != null && Number.isFinite(tripKm) ? `${tripKm.toFixed(1)} km` : '—'}
        </Text>
        <View style={s.routeStripRight}>
          <Text style={s.routeStripAddrB} numberOfLines={1}>
            {destWithEta}
          </Text>
          <View style={s.dotB} />
        </View>
      </View>

      <LinearGradient
        colors={['rgba(52,245,184,0.35)', 'rgba(15,23,42,0.2)', 'rgba(2,6,23,0.95)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={s.metricsCard}
      >
        <View style={s.metricCol}>
          <Text style={s.metricCardLabel}>{"Rider's bid"}</Text>
          <Text style={s.metricBid}>₦{riderOffer.toLocaleString()}</Text>
        </View>
        <View style={s.metricDivider} />
        <View style={s.metricCol}>
          <Text style={s.metricCardLabel}>Distance</Text>
          <Text style={s.metricCardVal}>
            {tripKm != null && Number.isFinite(tripKm) ? `${tripKm.toFixed(1)} km` : '—'}
          </Text>
        </View>
        <View style={s.metricDivider} />
        <View style={s.metricCol}>
          <Text style={s.metricCardLabel}>Duration</Text>
          <Text style={s.metricCardVal}>{tripDurMin != null ? `~${tripDurMin} min` : '—'}</Text>
        </View>
      </LinearGradient>

      <View style={s.counterHeader}>
        <Ionicons name="bulb-outline" size={16} color="#34F5B8" />
        <Text style={s.counterHeaderTxt}>Make Counter Offer? Earn more</Text>
      </View>

      <TouchableOpacity
        style={[s.counterField, offerExpired && { opacity: 0.5 }]}
        activeOpacity={0.88}
        disabled={offerExpired}
        onPress={() => {
          if (offerExpired) return;
          setCounterEditing(true);
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.counterFieldHint}>Your Counter Offer</Text>
          {counterEditing ? (
            <TextInput
              style={s.counterInput}
              keyboardType="number-pad"
              editable={!offerExpired}
              placeholder="₦"
              placeholderTextColor="#64748B"
              value={fareInput}
              onChangeText={onFareInputChange}
              onBlur={() => setCounterEditing(false)}
              autoFocus
            />
          ) : (
            <Text style={s.counterDisplay}>₦{(Number.isFinite(counterParsed) ? counterParsed : riderOffer).toLocaleString()}</Text>
          )}
        </View>
        <Ionicons name="pencil" size={18} color="#94A3B8" />
      </TouchableOpacity>

      <View style={s.compareBar}>
        <View style={s.compareRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.compareMuted}>Rider offers</Text>
            <Text style={s.compareLeft}>₦{riderOffer.toLocaleString()}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0, alignItems: 'flex-end' }}>
            <Text style={s.compareMuted}>You offer</Text>
            <Text style={s.compareRight}>₦{(Number.isFinite(counterParsed) ? counterParsed : riderOffer).toLocaleString()}</Text>
          </View>
        </View>
        {counterDelta > 0 ? (
          <View style={s.earnMoreChip}>
            <Ionicons name="sparkles" size={14} color="#86EFAC" style={{ marginRight: 6 }} />
            <Text style={s.earnMoreTxt}>You earn +₦{counterDelta.toLocaleString()} more</Text>
          </View>
        ) : null}
      </View>

      <View style={s.progressTrack}>
        {offerExpired ? (
          <View style={[s.progressFill, { width: `${ringProgress * 100}%`, backgroundColor: 'rgba(71,85,105,0.85)' }]} />
        ) : (
          <LinearGradient
            colors={
              countdownSeconds <= 5 ? ['#fb7185', '#ef4444', '#b91c1c'] : ['#34F5B8', '#22E5A0', '#0D9F6E']
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[s.progressFill, { width: `${ringProgress * 100}%` }]}
          />
        )}
      </View>
      <View style={s.expireRow}>
        {!offerExpired ? (
          <Ionicons
            name="time-outline"
            size={14}
            color={countdownSeconds <= 5 ? '#F87171' : '#FB923C'}
            style={{ marginRight: 6 }}
          />
        ) : null}
        <Text
          style={[
            s.expireTxt,
            offerExpired && s.expireTxtMuted,
            !offerExpired && countdownSeconds <= 5 && s.expireTxtUrgent,
          ]}
        >
          {offerExpired ? 'Offer expired' : `Request expires in ${Math.max(0, countdownSeconds)}s`}
        </Text>
      </View>

      <View style={s.actionsCol}>
        <View style={s.actionsTopRow}>
          <TouchableOpacity
            style={[s.acceptRiderBtn, offerExpired && { opacity: 0.5 }]}
            onPress={() => {
              if (offerExpired || accepting) return;
              onAcceptRiderPrice();
            }}
            disabled={accepting || offerExpired}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel={`Accept at rider offer ${riderOffer}`}
          >
            <LinearGradient
              colors={['#34F5B8', '#22E5A0', '#0D9F6E']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={s.btnGradInner}
            >
              {accepting ? (
                <ActivityIndicator color="#022C22" />
              ) : (
                <Text style={s.acceptRiderTxt}>ACCEPT (₦{riderOffer.toLocaleString()})</Text>
              )}
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.counterBtn, (offerExpired || counterInvalid) && { opacity: 0.5 }]}
            onPress={() => {
              if (offerExpired || accepting || counterInvalid) return;
              onAcceptCounterPrice();
            }}
            disabled={accepting || offerExpired || counterInvalid}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel="Send counter offer"
          >
            {accepting ? (
              <ActivityIndicator color="#93C5FD" />
            ) : (
              <Text style={s.counterBtnTxt}>
                COUNTER (₦{(Number.isFinite(counterParsed) ? counterParsed : riderOffer).toLocaleString()})
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={s.rejectBtn}
          onPress={onDecline}
          disabled={accepting}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Reject ride request"
        >
          <Text style={s.rejectTxt}>REJECT</Text>
        </TouchableOpacity>
      </View>

      {pickupKm != null && Number.isFinite(pickupKm) ? (
        <Text style={s.pickupHint} numberOfLines={1}>
          ~{pickupKm.toFixed(1)} km to pickup
        </Text>
      ) : null}
    </View>
  );
}

export function offerTripPickupDropCoords(trip: TripOffer | null): {
  pickup: { lat: number; lng: number } | null;
  drop: { lat: number; lng: number } | null;
  route: Array<{ lat: number; lng: number }>;
} {
  if (!trip) return { pickup: null, drop: null, route: [] };
  const pl = trip.pickup_location;
  const dl = trip.dropoff_location;
  let { lat: pLat, lng: pLng } = readLatLng(pl);
  let { lat: dLat, lng: dLng } = readLatLng(dl);
  const raw = trip as Record<string, unknown>;
  if (pLat == null || pLng == null) {
    const fb = readLatLng(raw.pickup_coordinates);
    if (fb.lat != null && fb.lng != null) {
      pLat = fb.lat;
      pLng = fb.lng;
    }
  }
  if (dLat == null || dLng == null) {
    const fb = readLatLng(raw.destination_coordinates ?? raw.dropoff_coordinates);
    if (fb.lat != null && fb.lng != null) {
      dLat = fb.lat;
      dLng = fb.lng;
    }
  }
  const rpcPrev = trip.route_preview_coordinates;
  if (Array.isArray(rpcPrev) && rpcPrev.length >= 2) {
    if (pLat == null || pLng == null) {
      const a = rpcPrev[0] as Record<string, unknown>;
      const lat = Number(a?.lat ?? a?.latitude);
      const lng = Number(a?.lng ?? a?.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        pLat = lat;
        pLng = lng;
      }
    }
    if (dLat == null || dLng == null) {
      const b = rpcPrev[rpcPrev.length - 1] as Record<string, unknown>;
      const lat = Number(b?.lat ?? b?.latitude);
      const lng = Number(b?.lng ?? b?.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        dLat = lat;
        dLng = lng;
      }
    }
  }
  const route: Array<{ lat: number; lng: number }> = [];
  if (Array.isArray(rpcPrev)) {
    for (const p of rpcPrev) {
      const o = p && typeof p === 'object' ? (p as Record<string, unknown>) : null;
      if (!o) continue;
      const lat = Number(o.lat ?? o.latitude);
      const lng = Number(o.lng ?? o.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng)) route.push({ lat, lng });
    }
  }
  return {
    pickup: pLat != null && pLng != null ? { lat: pLat, lng: pLng } : null,
    drop: dLat != null && dLng != null ? { lat: dLat, lng: dLng } : null,
    route,
  };
}

const s = StyleSheet.create({
  shell: {
    borderTopLeftRadius: DOCK_TOP_RADIUS,
    borderTopRightRadius: DOCK_TOP_RADIUS,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(52,245,184,0.14)',
    shadowColor: '#020617',
    shadowOffset: { width: 0, height: -12 },
    shadowOpacity: 0.65,
    shadowRadius: 28,
    elevation: 30,
  },
  shellSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 140,
  },
  handleWrap: {
    alignSelf: 'center',
    width: 48,
    height: 5,
    borderRadius: 100,
    overflow: 'hidden',
    marginBottom: 14,
    opacity: 0.9,
  },
  titlePill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    marginBottom: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(52,245,184,0.28)',
  },
  titleTxt: {
    fontSize: 12,
    fontWeight: '800',
    color: '#ECFDF5',
    letterSpacing: 0.55,
  },
  riderBlock: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 20,
    backgroundColor: '#1E293B',
    borderWidth: 2,
    borderColor: 'rgba(52,245,184,0.45)',
  },
  avatarPh: {
    width: 56,
    height: 56,
    borderRadius: 20,
    backgroundColor: '#1E3A5F',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(96,165,250,0.35)',
  },
  avatarPhTxt: { fontSize: 20, fontWeight: '900', color: '#BFDBFE' },
  riderName: { fontSize: 19, fontWeight: '900', color: '#F8FAFC', letterSpacing: -0.4 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  ratingTxt: { fontSize: 12, fontWeight: '700', color: '#CBD5E1' },
  verifiedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(52,245,184,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(52,245,184,0.35)',
  },
  verifiedTxt: { fontSize: 11, fontWeight: '800', color: '#86EFAC' },
  routeStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(15,23,42,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(100,116,139,0.35)',
  },
  routeStripLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  routeStripRight: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6, minWidth: 0 },
  dotG: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#34F5B8',
    shadowColor: '#34F5B8',
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  dotB: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#60A5FA',
    shadowColor: '#3B82F6',
    shadowOpacity: 0.7,
    shadowRadius: 4,
  },
  routeStripAddr: { fontSize: 12, fontWeight: '700', color: '#E2E8F0', flexShrink: 1 },
  routeStripAddrB: { fontSize: 12, fontWeight: '700', color: '#93C5FD', flexShrink: 1, textAlign: 'right' },
  routeStripKm: { fontSize: 11, fontWeight: '900', color: '#94A3B8' },
  metricsCard: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(52,245,184,0.18)',
    overflow: 'hidden',
  },
  metricCol: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  metricDivider: { width: StyleSheet.hairlineWidth, backgroundColor: 'rgba(148,163,184,0.25)' },
  metricCardLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: 'rgba(148,163,184,0.95)',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  metricBid: { fontSize: 19, fontWeight: '900', color: '#34F5B8', letterSpacing: -0.4 },
  metricCardVal: { fontSize: 16, fontWeight: '900', color: '#F1F5F9', letterSpacing: -0.3 },
  counterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  counterHeaderTxt: { fontSize: 12, fontWeight: '800', color: '#4ADE80' },
  counterField: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(15,23,42,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(71,85,105,0.55)',
    marginBottom: 12,
  },
  counterFieldHint: { fontSize: 11, fontWeight: '700', color: '#64748B', marginBottom: 4 },
  counterDisplay: { fontSize: 22, fontWeight: '900', color: '#34F5B8', letterSpacing: -0.5 },
  counterInput: {
    fontSize: 22,
    fontWeight: '900',
    color: '#34F5B8',
    padding: 0,
    margin: 0,
    letterSpacing: -0.5,
  },
  compareBar: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(30,58,138,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.28)',
    marginBottom: 14,
    gap: 10,
  },
  compareRow: { flexDirection: 'row', alignItems: 'center', width: '100%' },
  compareMuted: { fontSize: 10, fontWeight: '700', color: '#94A3B8' },
  compareLeft: { fontSize: 14, fontWeight: '900', color: '#E2E8F0' },
  compareRight: { fontSize: 14, fontWeight: '900', color: '#93C5FD' },
  earnMoreChip: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(52,245,184,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(52,245,184,0.2)',
  },
  earnMoreTxt: { fontSize: 12, fontWeight: '800', color: '#A7F3D0' },
  progressTrack: {
    height: 5,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 100,
    marginBottom: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: 5,
    borderRadius: 100,
    overflow: 'hidden',
  },
  expireRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  expireTxt: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FB923C',
    letterSpacing: 0.2,
  },
  expireTxtUrgent: { color: '#F87171' },
  expireTxtMuted: { color: '#64748B' },
  actionsCol: { gap: 10 },
  actionsTopRow: { flexDirection: 'row', gap: 10 },
  acceptRiderBtn: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(52,245,184,0.4)',
    shadowColor: '#22E5A0',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 10,
  },
  btnGradInner: {
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  acceptRiderTxt: { fontSize: 11, fontWeight: '900', color: '#022C22', letterSpacing: 0.35 },
  counterBtn: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
    backgroundColor: 'rgba(15,23,42,0.88)',
    borderWidth: 1.5,
    borderColor: 'rgba(96,165,250,0.55)',
  },
  counterBtnTxt: { fontSize: 11, fontWeight: '900', color: THEME_COLORS.accentMuted, textAlign: 'center' },
  rejectBtn: {
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.75)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.38)',
  },
  rejectTxt: { fontSize: 13, fontWeight: '900', color: '#FCA5A5', letterSpacing: 0.8 },
  pickupHint: {
    marginTop: 8,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(148,163,184,0.85)',
  },
});

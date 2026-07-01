/**
 * DriverTripDetailScreen — completed trip summary for a driver.
 *
 * Shows fare breakdown, route, rider info, payment method, and key actions.
 * Accessed from the driver trips history list when a completed card is tapped.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BACKEND_URL, getAuthHeaders } from '@/src/services/api';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS } from '@/src/constants/theme';
import { promptExternalNavigation } from '@/src/utils/openExternalNavigation';

const NEON   = '#22C55E';
const CURRENCY = '₦';

function fmtFare(n: number): string {
  return `${CURRENCY}${Math.round(n).toLocaleString('en-NG')}`;
}

function fmtDate(raw?: string): string {
  if (!raw) return '—';
  try {
    return new Date(raw).toLocaleString('en-NG', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return '—'; }
}

function getAddr(loc: unknown): string {
  if (!loc) return '—';
  if (typeof loc === 'string') return loc;
  const p = loc as Record<string, unknown>;
  return String(p.address || `${p.lat ?? ''}, ${p.lng ?? ''}`);
}

export default function DriverTripDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tripId?: string }>();
  const tripId = params.tripId ? String(params.tripId) : null;

  const [trip, setTrip] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);

  const loadTrip = useCallback(async () => {
    if (!tripId) { setLoading(false); setError(true); return; }
    setError(false);
    try {
      const res = await fetch(`${BACKEND_URL}/api/trips/${tripId}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error('Not found');
      const data = await res.json();
      setTrip(data?.trip ?? data ?? null);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => { void loadTrip(); }, [loadTrip]);

  const handleNavigate = () => {
    const drop = trip?.dropoff_location;
    if (drop?.lat && drop?.lng) {
      promptExternalNavigation({
        lat: Number(drop.lat), lng: Number(drop.lng),
        label: drop.address || 'Destination',
      });
    }
  };

  const handleReport = () => {
    router.push({ pathname: '/shield-disputes', params: { tripId: tripId ?? '', mode: 'report' } } as any);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={COLORS.gray800} />
          </TouchableOpacity>
          <Text style={styles.topTitle}>Trip Summary</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={NEON} />
          <Text style={styles.loadingTxt}>Loading trip…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !trip) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={COLORS.gray800} />
          </TouchableOpacity>
          <Text style={styles.topTitle}>Trip Summary</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.centered}>
          <Ionicons name="cloud-offline-outline" size={48} color={COLORS.error} />
          <Text style={styles.errorTxt}>Could not load trip details</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={loadTrip}>
            <Text style={styles.retryBtnTxt}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const fare        = Number(trip.fare || 0);
  const riderName   = trip.rider_name || trip.rider_display_name || 'Rider';
  const pickup      = getAddr(trip.pickup_location);
  const dropoff     = getAddr(trip.dropoff_location);
  const distKm      = Number(trip.distance_km || 0);
  const durMins     = Number(trip.duration_mins || 0);
  const payMethod   = trip.payment_method ? String(trip.payment_method) : null;
  const isCash      = payMethod?.toLowerCase().includes('cash');
  const riderRating = Number(trip.rider_rating || 0);
  const completedAt = fmtDate(trip.completed_at);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={COLORS.gray800} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Trip Summary</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Earnings hero */}
        <LinearGradient colors={['#14532D', '#16A34A', NEON]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.earnHero}>
          <View style={styles.earnHeroIcon}>
            <Ionicons name="checkmark-circle" size={32} color="#022C22" />
          </View>
          <View>
            <Text style={styles.earnHeroLabel}>TRIP EARNINGS</Text>
            <Text style={styles.earnHeroFare}>{fmtFare(fare)}</Text>
            <Text style={styles.earnHeroDate}>{completedAt}</Text>
          </View>
        </LinearGradient>

        {/* Fare breakdown */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Fare Breakdown</Text>
          <View style={styles.fareRow}>
            <Text style={styles.fareLabel}>Base fare</Text>
            <Text style={styles.fareVal}>{trip.base_fare_ngn ? fmtFare(Number(trip.base_fare_ngn)) : '—'}</Text>
          </View>
          {trip.distance_fare_ngn ? (
            <View style={styles.fareRow}>
              <Text style={styles.fareLabel}>Distance ({distKm.toFixed(1)} km)</Text>
              <Text style={styles.fareVal}>{fmtFare(Number(trip.distance_fare_ngn))}</Text>
            </View>
          ) : null}
          {trip.time_fare_ngn ? (
            <View style={styles.fareRow}>
              <Text style={styles.fareLabel}>Time ({durMins} min)</Text>
              <Text style={styles.fareVal}>{fmtFare(Number(trip.time_fare_ngn))}</Text>
            </View>
          ) : null}
          <View style={[styles.fareRow, styles.fareTotal]}>
            <Text style={styles.fareTotalLabel}>Total</Text>
            <Text style={styles.fareTotalVal}>{fmtFare(fare)}</Text>
          </View>
          {payMethod ? (
            <View style={[styles.paymentRow, isCash && styles.paymentRowCash]}>
              <Ionicons name={isCash ? 'cash-outline' : 'wallet-outline'} size={16} color={isCash ? '#D97706' : NEON} />
              <Text style={[styles.paymentTxt, isCash && styles.paymentTxtCash]}>
                {isCash ? 'Cash payment' : `Paid via ${payMethod}`}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Route */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Trip Route</Text>
          <View style={styles.routeBlock}>
            <View style={styles.routeRow}>
              <View style={[styles.routeDot, { backgroundColor: '#2563EB' }]} />
              <View style={styles.routeTextCol}>
                <Text style={styles.routePointLabel}>PICKUP</Text>
                <Text style={styles.routeAddr} numberOfLines={2}>{pickup}</Text>
              </View>
            </View>
            <View style={styles.routeConnector} />
            <View style={styles.routeRow}>
              <View style={[styles.routeDot, { backgroundColor: '#EF4444' }]} />
              <View style={styles.routeTextCol}>
                <Text style={styles.routePointLabel}>DROP-OFF</Text>
                <Text style={styles.routeAddr} numberOfLines={2}>{dropoff}</Text>
              </View>
            </View>
          </View>
          {(distKm > 0 || durMins > 0) ? (
            <View style={styles.tripMetaRow}>
              {distKm > 0 && (
                <View style={styles.metaChip}>
                  <Ionicons name="navigate-outline" size={12} color={COLORS.gray500} />
                  <Text style={styles.metaChipTxt}>{distKm.toFixed(1)} km</Text>
                </View>
              )}
              {durMins > 0 && (
                <View style={styles.metaChip}>
                  <Ionicons name="time-outline" size={12} color={COLORS.gray500} />
                  <Text style={styles.metaChipTxt}>{durMins} min</Text>
                </View>
              )}
            </View>
          ) : null}
        </View>

        {/* Rider info */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Rider</Text>
          <View style={styles.riderRow}>
            <View style={styles.riderAvatar}>
              <Ionicons name="person" size={22} color="#4F46E5" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.riderName}>{riderName}</Text>
              {riderRating > 0 ? (
                <View style={styles.ratingRow}>
                  <Ionicons name="star" size={13} color="#CA8A04" />
                  <Text style={styles.ratingTxt}>{riderRating.toFixed(1)} you gave</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actionsCard}>
          <TouchableOpacity style={styles.actionRow} onPress={handleNavigate}>
            <View style={[styles.actionIcon, { backgroundColor: '#DCFCE7' }]}>
              <Ionicons name="navigate" size={20} color="#16A34A" />
            </View>
            <Text style={styles.actionTxt}>Navigate to this destination</Text>
            <Ionicons name="chevron-forward" size={18} color={COLORS.gray400} />
          </TouchableOpacity>
          <View style={styles.actionDivider} />
          <TouchableOpacity style={styles.actionRow} onPress={handleReport}>
            <View style={[styles.actionIcon, { backgroundColor: '#FEE2E2' }]}>
              <Ionicons name="shield-outline" size={20} color="#DC2626" />
            </View>
            <Text style={styles.actionTxt}>Report an issue with this trip</Text>
            <Ionicons name="chevron-forward" size={18} color={COLORS.gray400} />
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.gray50 },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.md,
    backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.gray100,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  topTitle: { fontSize: FONT_SIZE.lg, fontWeight: '800', color: COLORS.gray800 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.md },
  loadingTxt: { fontSize: FONT_SIZE.sm, color: COLORS.gray500, fontWeight: '600' },
  errorTxt: { fontSize: FONT_SIZE.md, fontWeight: '700', color: COLORS.gray700 },
  retryBtn: { backgroundColor: COLORS.primary, paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.xl },
  retryBtnTxt: { color: '#FFF', fontWeight: '800', fontSize: FONT_SIZE.sm },
  content: { gap: SPACING.md, padding: SPACING.md, paddingBottom: 40 },

  earnHero: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    borderRadius: BORDER_RADIUS.xl, padding: SPACING.lg, ...SHADOWS.md,
  },
  earnHeroIcon: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(0,0,0,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  earnHeroLabel: { fontSize: 10, fontWeight: '800', color: 'rgba(255,255,255,0.7)', letterSpacing: 0.8 },
  earnHeroFare: { fontSize: 32, fontWeight: '900', color: '#FFF', marginTop: 2 },
  earnHeroDate: { fontSize: FONT_SIZE.xs, color: 'rgba(255,255,255,0.7)', marginTop: 3 },

  card: {
    backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.gray100, ...SHADOWS.sm,
    gap: SPACING.sm,
  },
  cardTitle: { fontSize: FONT_SIZE.xs, fontWeight: '800', color: COLORS.gray500, letterSpacing: 0.5 },

  fareRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fareLabel: { fontSize: FONT_SIZE.sm, fontWeight: '600', color: COLORS.gray600 },
  fareVal:   { fontSize: FONT_SIZE.sm, fontWeight: '700', color: COLORS.gray700 },
  fareTotal: { paddingTop: SPACING.sm, marginTop: SPACING.xs, borderTopWidth: 1, borderTopColor: COLORS.gray100 },
  fareTotalLabel: { fontSize: FONT_SIZE.md, fontWeight: '800', color: COLORS.gray800 },
  fareTotalVal:   { fontSize: FONT_SIZE.md + 2, fontWeight: '900', color: NEON },
  paymentRow: {
    flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: SPACING.xs,
    paddingTop: SPACING.xs, paddingHorizontal: 10, paddingVertical: 8,
    backgroundColor: '#DCFCE7', borderRadius: BORDER_RADIUS.md,
  },
  paymentRowCash: { backgroundColor: '#FEF3C7' },
  paymentTxt: { fontSize: FONT_SIZE.sm, fontWeight: '700', color: '#16A34A' },
  paymentTxtCash: { color: '#D97706' },

  routeBlock: { gap: 0 },
  routeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  routeDot: { width: 12, height: 12, borderRadius: 6, marginTop: 16 },
  routeConnector: { width: 2, height: 28, backgroundColor: COLORS.gray200, marginLeft: 5, marginVertical: 4 },
  routeTextCol: { flex: 1 },
  routePointLabel: { fontSize: 10, fontWeight: '800', color: COLORS.gray400, letterSpacing: 0.5 },
  routeAddr: { fontSize: FONT_SIZE.sm, fontWeight: '700', color: COLORS.gray700, marginTop: 2 },
  tripMetaRow: { flexDirection: 'row', gap: SPACING.xs, flexWrap: 'wrap' },
  metaChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.gray50, borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, borderColor: COLORS.gray100,
  },
  metaChipTxt: { fontSize: 11, fontWeight: '700', color: COLORS.gray500 },

  riderRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  riderAvatar: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: '#EDE9FE',
    alignItems: 'center', justifyContent: 'center',
  },
  riderName: { fontSize: FONT_SIZE.md, fontWeight: '800', color: COLORS.gray800 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  ratingTxt: { fontSize: FONT_SIZE.xs + 1, fontWeight: '600', color: COLORS.gray500 },

  actionsCard: {
    backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.gray100, ...SHADOWS.sm, overflow: 'hidden',
  },
  actionRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.md,
  },
  actionIcon: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  actionTxt: { flex: 1, fontSize: FONT_SIZE.sm, fontWeight: '700', color: COLORS.gray700 },
  actionDivider: { height: 1, backgroundColor: COLORS.gray100, marginLeft: SPACING.md + 40 + SPACING.md },
});

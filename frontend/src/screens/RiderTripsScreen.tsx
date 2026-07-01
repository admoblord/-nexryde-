/**
 * RiderTripsScreen — Uber-standard trip history for riders.
 *
 * Features:
 *  - FlatList (virtualized) for performance with large histories
 *  - Proper error state with retry
 *  - Status badge per trip (Completed / Active / Awaiting Payment / Cancelled)
 *  - Payment method chip
 *  - Vehicle info on completed trips
 *  - Tappable card → receipt for completed, tracking for active
 *  - Activity insights card (rides, spend, top destination)
 *  - Pull-to-refresh
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTabBottomPad } from '@/src/hooks/useBottomPad';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS, CURRENCY } from '@/src/constants/theme';
import { useAuthedUserId } from '@/src/hooks/useAuthedUserId';
import { getUserTrips } from '@/src/services/api';
import { isActiveTripStatus, normalizeTripStatus } from '@/src/utils/tripStatus';
import { TabBrandStrip } from '@/src/components/flow/TabBrandStrip';
import { useFlowLayout } from '@/src/constants/flowLayout';

type TripTab = 'upcoming' | 'completed' | 'cancelled';

// ─── Status helpers ──────────────────────────────────────────────────────────
function getTripStatusMeta(status: string, paymentStatus?: string): {
  label: string; color: string; bg: string; icon: string;
} {
  const s = String(status || '');
  const ps = String(paymentStatus || '');
  if (s === 'completed' && (ps === 'pending' || ps === 'pending_confirmation')) {
    return { label: 'Awaiting Payment', color: '#7C3AED', bg: '#EDE9FE', icon: 'time-outline' };
  }
  if (s === 'completed') {
    return { label: 'Completed', color: '#16A34A', bg: '#DCFCE7', icon: 'checkmark-circle' };
  }
  if (s === 'cancelled') {
    return { label: 'Cancelled', color: '#DC2626', bg: '#FEE2E2', icon: 'close-circle' };
  }
  if (['ongoing'].includes(s)) {
    return { label: 'On Trip', color: '#2563EB', bg: '#DBEAFE', icon: 'navigate' };
  }
  if (['accepted', 'arrived'].includes(s)) {
    return { label: s === 'arrived' ? 'Driver Arrived' : 'Driver Assigned', color: '#0EA5E9', bg: '#E0F2FE', icon: 'car-sport' };
  }
  if (s === 'pending_payment') {
    return { label: 'Awaiting Payment', color: '#7C3AED', bg: '#EDE9FE', icon: 'wallet-outline' };
  }
  return { label: 'Searching', color: '#F59E0B', bg: '#FEF3C7', icon: 'search' };
}

function formatDate(raw?: string): string {
  if (!raw) return 'Recent';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return 'Recent';
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return diffMins <= 1 ? 'Just now' : `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: diffDays > 365 ? 'numeric' : undefined,
  });
}

function getAddress(point: unknown): string {
  if (!point) return 'Unknown location';
  if (typeof point === 'string') return point;
  const p = point as Record<string, unknown>;
  return String(p.address || `${p.lat ?? ''}, ${p.lng ?? ''}`);
}

function fmtFare(n: number): string {
  return `${CURRENCY}${Math.round(n).toLocaleString('en-NG')}`;
}

// ─── Trip card ───────────────────────────────────────────────────────────────
function TripCard({
  trip,
  activeTab,
  onPress,
  onBookAgain,
  onReceipt,
  onReport,
  onSameDriver,
}: {
  trip: any;
  activeTab: TripTab;
  onPress: () => void;
  onBookAgain: () => void;
  onReceipt: () => void;
  onReport: () => void;
  onSameDriver: () => void;
}) {
  const pickup   = getAddress(trip.pickup_location);
  const dropoff  = getAddress(trip.dropoff_location);
  const fare     = Number(trip.fare || 0);
  const driverLabel = trip.driver_name || 'Driver';
  const rating   = Number(trip.driver_rating || 0);
  const distKm   = Number(trip.distance_km || 0);
  const durMins  = Number(trip.duration_mins || trip.duration_min || 0);
  const statusMeta = getTripStatusMeta(trip.status, trip.payment_status);
  const payMethod = trip.payment_method ? String(trip.payment_method) : null;
  const vehicle  = trip.vehicle_model || trip.vehicle || null;
  const plate    = trip.vehicle_plate || trip.plate || null;
  const isActive = isActiveTripStatus(trip.status, trip.payment_status);
  const isCompleted = normalizeTripStatus(trip.status, trip.payment_status) === 'completed';
  const dateStr  = formatDate(trip.completed_at || trip.created_at || trip.accepted_at);

  return (
    <TouchableOpacity
      style={styles.tripCard}
      onPress={onPress}
      activeOpacity={0.88}
      accessibilityRole="button"
      accessibilityLabel={`Trip from ${pickup} to ${dropoff}, ${fmtFare(fare)}`}
    >
      {/* Header row: date + fare */}
      <View style={styles.cardHeader}>
        <Text style={styles.cardDate}>{dateStr}</Text>
        <Text style={styles.cardFare}>{fmtFare(fare)}</Text>
      </View>

      {/* Status badge */}
      <View style={[styles.statusBadge, { backgroundColor: statusMeta.bg }]}>
        <Ionicons name={statusMeta.icon as any} size={12} color={statusMeta.color} />
        <Text style={[styles.statusBadgeTxt, { color: statusMeta.color }]}>{statusMeta.label}</Text>
      </View>

      {/* Route */}
      <View style={styles.routeBlock}>
        <View style={styles.routePoint}>
          <View style={[styles.routeDot, { backgroundColor: COLORS.success }]} />
          <Text style={styles.routeAddr} numberOfLines={1}>{pickup}</Text>
        </View>
        <View style={styles.routeLine} />
        <View style={styles.routePoint}>
          <View style={[styles.routeDot, { backgroundColor: COLORS.error }]} />
          <Text style={styles.routeAddr} numberOfLines={1}>{dropoff}</Text>
        </View>
      </View>

      {/* Meta row */}
      <View style={styles.metaRow}>
        <Text style={styles.driverLabel} numberOfLines={1}>{driverLabel}</Text>
        <View style={styles.metaRight}>
          {distKm > 0 && (
            <View style={styles.metaChip}>
              <Ionicons name="navigate-outline" size={11} color={COLORS.gray500} />
              <Text style={styles.metaChipTxt}>{distKm.toFixed(1)} km</Text>
            </View>
          )}
          {durMins > 0 && (
            <View style={styles.metaChip}>
              <Ionicons name="time-outline" size={11} color={COLORS.gray500} />
              <Text style={styles.metaChipTxt}>{durMins} min</Text>
            </View>
          )}
          {payMethod && (
            <View style={styles.metaChip}>
              <Ionicons
                name={payMethod.toLowerCase().includes('cash') ? 'cash-outline' : 'wallet-outline'}
                size={11}
                color={COLORS.gray500}
              />
              <Text style={styles.metaChipTxt}>{payMethod}</Text>
            </View>
          )}
          {isCompleted && rating > 0 && (
            <View style={styles.ratingBadge}>
              <Ionicons name="star" size={12} color="#CA8A04" />
              <Text style={styles.ratingTxt}>{rating.toFixed(1)}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Vehicle identification for completed trips */}
      {isCompleted && (vehicle || plate) ? (
        <View style={styles.vehicleRow}>
          <Ionicons name="car-sport-outline" size={13} color={COLORS.gray500} />
          <Text style={styles.vehicleTxt} numberOfLines={1}>
            {[vehicle, plate ? plate.toUpperCase() : null].filter(Boolean).join(' · ')}
          </Text>
        </View>
      ) : null}

      {/* Action buttons for completed trips */}
      {isCompleted ? (
        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.btnBookAgain} onPress={onBookAgain} accessibilityRole="button">
            <Ionicons name="refresh-circle" size={15} color="#FFF" />
            <Text style={styles.btnBookAgainTxt}>Book Again</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnReceipt} onPress={onReceipt} accessibilityRole="button">
            <Ionicons name="receipt-outline" size={15} color={COLORS.accentBlue} />
            <Text style={styles.btnReceiptTxt}>Receipt</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnReport} onPress={onReport} accessibilityRole="button">
            <Ionicons name="shield-outline" size={15} color={COLORS.error} />
            <Text style={styles.btnReportTxt}>Issue</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Same driver row (completed only) */}
      {isCompleted && trip.driver_id ? (
        <TouchableOpacity style={styles.sameDriverBtn} onPress={onSameDriver} accessibilityRole="button">
          <Ionicons name="heart-outline" size={15} color={COLORS.primary} />
          <Text style={styles.sameDriverTxt}>Request same driver</Text>
        </TouchableOpacity>
      ) : null}

      {/* Active trip CTA */}
      {isActive ? (
        <TouchableOpacity style={styles.btnActive} onPress={onPress} accessibilityRole="button">
          <Ionicons name="navigate" size={14} color="#FFF" />
          <Text style={styles.btnActiveTxt}>Track Trip</Text>
        </TouchableOpacity>
      ) : null}
    </TouchableOpacity>
  );
}

// ─── Insights card ───────────────────────────────────────────────────────────
function InsightsCard({ completed }: { completed: any[] }) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  const monthTrips = completed.filter((t: any) => {
    const ts = new Date(t.completed_at || t.created_at || '').getTime();
    return !Number.isNaN(ts) && ts >= monthStart;
  });

  const ridesMonth = monthTrips.length;
  const spendMonth = monthTrips.reduce((s: number, t: any) => s + Number(t.fare || 0), 0);
  const allTimeRides = completed.length;
  const allSpend = completed.reduce((s: number, t: any) => s + Number(t.fare || 0), 0);

  const destCounts = new Map<string, number>();
  for (const t of monthTrips) {
    const d = t.dropoff_location;
    const addr = (typeof d === 'string' ? d : d?.address || '').trim();
    if (!addr || addr.startsWith(',')) continue;
    const key = addr.length > 60 ? `${addr.slice(0, 57)}…` : addr;
    destCounts.set(key, (destCounts.get(key) || 0) + 1);
  }
  let topDest: string | null = null;
  let topCount = 0;
  for (const [label, count] of destCounts) {
    if (count > topCount) { topDest = label; topCount = count; }
  }

  return (
    <View style={styles.insightsCard}>
      <Text style={styles.insightsTitle}>Your activity</Text>
      <View style={styles.insightsRow}>
        <View style={styles.insightCell}>
          <Text style={styles.insightValue}>{ridesMonth}</Text>
          <Text style={styles.insightLabel}>Rides this month</Text>
        </View>
        <View style={styles.insightDivider} />
        <View style={styles.insightCell}>
          <Text style={styles.insightValue}>{fmtFare(spendMonth)}</Text>
          <Text style={styles.insightLabel}>Spent this month</Text>
        </View>
      </View>
      {topDest ? (
        <View style={styles.topDestRow}>
          <Ionicons name="location" size={14} color={COLORS.primary} />
          <Text style={styles.topDestTxt} numberOfLines={1}>Top stop: {topDest}</Text>
        </View>
      ) : null}
      <Text style={styles.insightsFoot}>
        {allTimeRides} completed · {fmtFare(allSpend)} lifetime
      </Text>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────
export default function RiderTripsScreen() {
  const router = useRouter();
  const { userId: riderId, canCallAuthedApi } = useAuthedUserId();
  const [activeTab, setActiveTab] = useState<TripTab>('upcoming');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [trips, setTrips] = useState<any[]>([]);
  const tabPad = useTabBottomPad(8);
  const flow   = useFlowLayout();

  const loadTrips = useCallback(async (silent = false) => {
    if (!riderId || !canCallAuthedApi) { setLoading(false); return; }
    if (!silent) setLoadError(false);
    try {
      const res = await getUserTrips(riderId, 'rider');
      setTrips(Array.isArray(res.data) ? res.data : []);
    } catch {
      setLoadError(true);
      setTrips([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [riderId, canCallAuthedApi]);

  useEffect(() => {
    if (!canCallAuthedApi) return;
    void loadTrips();
  }, [loadTrips, canCallAuthedApi]);

  const segmented = useMemo(() => {
    const upcoming  = trips.filter((t) => isActiveTripStatus(t.status, t.payment_status));
    const completed = trips.filter((t) => normalizeTripStatus(t.status, t.payment_status) === 'completed');
    const cancelled = trips.filter((t) => normalizeTripStatus(t.status, t.payment_status) === 'cancelled');
    return { upcoming, completed, cancelled };
  }, [trips]);

  const visibleTrips = segmented[activeTab];

  const buildBookAgainParams = (trip: any) => {
    const pickupObj = trip.pickup_location;
    const dropObj   = trip.dropoff_location;
    const lat = (o: any) => Number(o?.lat ?? o?.latitude);
    const lng = (o: any) => Number(o?.lng ?? o?.longitude);
    return {
      pickup: typeof pickupObj === 'string' ? pickupObj : pickupObj?.address || '',
      dropoff: typeof dropObj === 'string' ? dropObj : dropObj?.address || '',
      ...(Number.isFinite(lat(pickupObj)) ? { pickupLat: String(lat(pickupObj)), pickupLng: String(lng(pickupObj)) } : {}),
      ...(Number.isFinite(lat(dropObj))   ? { dropoffLat: String(lat(dropObj)), dropoffLng: String(lng(dropObj)) } : {}),
    };
  };

  const renderItem = useCallback(({ item }: { item: any }) => {
    const isActive = isActiveTripStatus(item.status, item.payment_status);
    const isCompleted = normalizeTripStatus(item.status, item.payment_status) === 'completed';

    return (
      <TripCard
        trip={item}
        activeTab={activeTab}
        onPress={() => {
          if (isActive) {
            router.push({ pathname: '/rider/tracking', params: { tripId: item.id } } as any);
          } else if (isCompleted) {
            router.push({ pathname: '/rider/trip-receipt', params: { tripId: item.id } } as any);
          }
        }}
        onBookAgain={() =>
          router.push({ pathname: '/rider/book', params: buildBookAgainParams(item) } as any)
        }
        onReceipt={() =>
          router.push({ pathname: '/rider/trip-receipt', params: { tripId: item.id } } as any)
        }
        onReport={() =>
          router.push({ pathname: '/shield-disputes', params: { tripId: item.id, mode: 'report' } } as any)
        }
        onSameDriver={() =>
          router.push({
            pathname: '/rider/book',
            params: { requestedDriverId: String(item.driver_id), driverName: String(item.driver_name || '') },
          } as any)
        }
      />
    );
  }, [activeTab, router]);

  const keyExtractor = useCallback((item: any) =>
    String(item.id || item._id || Math.random()), []);

  const ListHeader = useMemo(() => (
    <View style={styles.listHeaderWrap}>
      {segmented.completed.length > 0 ? (
        <InsightsCard completed={segmented.completed} />
      ) : null}
    </View>
  ), [segmented.completed]);

  const ListEmpty = (
    <View style={styles.emptyState}>
      <Ionicons name="car-outline" size={64} color={COLORS.gray300} />
      <Text style={styles.emptyTitle}>No {activeTab} trips</Text>
      <Text style={styles.emptySub}>
        {activeTab === 'upcoming'
          ? 'No active trips right now'
          : activeTab === 'completed'
            ? 'Your completed trips will appear here'
            : 'No cancelled trips'}
      </Text>
      {activeTab === 'upcoming' ? (
        <TouchableOpacity style={styles.bookBtn} onPress={() => router.push('/rider/book' as any)}>
          <Text style={styles.bookBtnTxt}>Book a Ride</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  const ErrorState = (
    <View style={styles.errorState}>
      <Ionicons name="cloud-offline-outline" size={48} color={COLORS.error} />
      <Text style={styles.errorTitle}>Could not load trips</Text>
      <Text style={styles.errorSub}>Check your connection and try again</Text>
      <TouchableOpacity style={styles.retryBtn} onPress={() => { setLoading(true); void loadTrips(); }}>
        <Ionicons name="refresh" size={16} color="#FFF" />
        <Text style={styles.retryBtnTxt}>Retry</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <TabBrandStrip role="rider" />

      {/* Header */}
      <View style={[styles.header, { paddingHorizontal: flow.padH }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button">
          <Ionicons name="arrow-back" size={24} color={COLORS.gray800} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Trips</Text>
        <TouchableOpacity
          style={styles.shieldBtn}
          onPress={() => router.push('/shield-disputes' as any)}
          accessibilityRole="button"
          accessibilityLabel="Nexryde Shield"
        >
          <Ionicons name="shield-checkmark-outline" size={22} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      {/* Tab bar */}
      <View style={[styles.tabBar, { paddingHorizontal: flow.padH }]}>
        {(['upcoming', 'completed', 'cancelled'] as TripTab[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
            accessibilityRole="tab"
          >
            <Text style={[styles.tabTxt, activeTab === tab && styles.tabTxtActive]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
            {segmented[tab].length > 0 ? (
              <View style={[styles.tabBadge, activeTab === tab && styles.tabBadgeActive]}>
                <Text style={[styles.tabBadgeTxt, activeTab === tab && styles.tabBadgeTxtActive]}>
                  {segmented[tab].length}
                </Text>
              </View>
            ) : null}
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      {loading ? (
        // Skeleton
        (() => {
          const { TripHistorySkeleton } = require('@/src/components/shared/SkeletonLoader');
          return <TripHistorySkeleton />;
        })()
      ) : loadError ? (
        ErrorState
      ) : (
        <FlatList
          data={visibleTrips}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={ListEmpty}
          contentContainerStyle={[
            styles.listContent,
            { paddingHorizontal: flow.padH, paddingBottom: tabPad },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); void loadTrips(true); }}
            />
          }
          showsVerticalScrollIndicator={false}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.gray50 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: SPACING.md, backgroundColor: COLORS.white,
    borderBottomWidth: 1, borderBottomColor: COLORS.gray100,
  },
  backBtn: { padding: SPACING.sm },
  headerTitle: { fontSize: FONT_SIZE.lg, fontWeight: '800', color: COLORS.gray800 },
  shieldBtn: { padding: SPACING.xs },

  tabBar: {
    flexDirection: 'row', backgroundColor: COLORS.white,
    borderBottomWidth: 1, borderBottomColor: COLORS.gray100,
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingVertical: 13, borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: COLORS.primary },
  tabTxt: { fontSize: FONT_SIZE.xs + 1, fontWeight: '600', color: COLORS.gray500 },
  tabTxtActive: { color: COLORS.primary, fontWeight: '800' },
  tabBadge: {
    minWidth: 18, height: 18, borderRadius: 9, backgroundColor: COLORS.gray100,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  tabBadgeActive: { backgroundColor: COLORS.primary },
  tabBadgeTxt: { fontSize: 10, fontWeight: '800', color: COLORS.gray600 },
  tabBadgeTxtActive: { color: '#FFF' },

  listContent: { paddingTop: SPACING.md, gap: SPACING.sm, flexGrow: 1 },
  listHeaderWrap: { marginBottom: SPACING.sm },

  // Insights card
  insightsCard: {
    backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.gray100, padding: SPACING.md, ...SHADOWS.sm,
  },
  insightsTitle: { fontSize: FONT_SIZE.sm, fontWeight: '800', color: COLORS.gray800, marginBottom: SPACING.sm },
  insightsRow: { flexDirection: 'row', alignItems: 'center' },
  insightCell: { flex: 1, alignItems: 'center', paddingVertical: SPACING.xs },
  insightDivider: { width: 1, height: 36, backgroundColor: COLORS.gray100 },
  insightValue: { fontSize: FONT_SIZE.xl, fontWeight: '900', color: COLORS.primary },
  insightLabel: { fontSize: FONT_SIZE.xs, fontWeight: '600', color: COLORS.gray500, marginTop: 3, textAlign: 'center' },
  topDestRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: SPACING.sm, paddingTop: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.gray100 },
  topDestTxt: { flex: 1, fontSize: FONT_SIZE.sm, fontWeight: '700', color: COLORS.gray700 },
  insightsFoot: { marginTop: SPACING.sm, fontSize: FONT_SIZE.xs, fontWeight: '600', color: COLORS.gray400, textAlign: 'center' },

  // Trip card
  tripCard: {
    backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.gray100, ...SHADOWS.sm,
    gap: SPACING.sm,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardDate: { fontSize: FONT_SIZE.xs + 1, fontWeight: '600', color: COLORS.gray500 },
  cardFare: { fontSize: FONT_SIZE.md + 1, fontWeight: '900', color: COLORS.gray800 },

  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: BORDER_RADIUS.full,
  },
  statusBadgeTxt: { fontSize: FONT_SIZE.xs, fontWeight: '800' },

  routeBlock: { gap: 4 },
  routePoint: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  routeDot: { width: 9, height: 9, borderRadius: 5 },
  routeAddr: { flex: 1, fontSize: FONT_SIZE.sm, fontWeight: '600', color: COLORS.gray700 },
  routeLine: { width: 1.5, height: 14, backgroundColor: COLORS.gray200, marginLeft: 4 },

  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.xs, paddingTop: SPACING.xs, borderTopWidth: 1, borderTopColor: COLORS.gray100 },
  driverLabel: { flex: 1, fontSize: FONT_SIZE.sm, fontWeight: '600', color: COLORS.gray600 },
  metaRight: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  metaChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: COLORS.gray50, borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: COLORS.gray100,
  },
  metaChipTxt: { fontSize: 10, fontWeight: '700', color: COLORS.gray500 },
  ratingBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#FEF9C3', borderRadius: BORDER_RADIUS.full, paddingHorizontal: 7, paddingVertical: 3 },
  ratingTxt: { fontSize: 10, fontWeight: '800', color: '#92400E' },

  vehicleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  vehicleTxt: { fontSize: FONT_SIZE.xs + 1, fontWeight: '600', color: COLORS.gray500, flex: 1 },

  actionsRow: { flexDirection: 'row', gap: SPACING.xs },
  btnBookAgain: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    borderRadius: BORDER_RADIUS.lg, paddingVertical: 10, backgroundColor: COLORS.success,
  },
  btnBookAgainTxt: { color: '#FFF', fontWeight: '800', fontSize: FONT_SIZE.sm },
  btnReceipt: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    borderRadius: BORDER_RADIUS.lg, paddingVertical: 10,
    backgroundColor: COLORS.accentBlueSoft,
  },
  btnReceiptTxt: { color: COLORS.accentBlue, fontWeight: '700', fontSize: FONT_SIZE.sm },
  btnReport: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    borderRadius: BORDER_RADIUS.lg, paddingVertical: 10,
    backgroundColor: 'rgba(239,68,68,0.08)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)',
  },
  btnReportTxt: { color: COLORS.error, fontWeight: '700', fontSize: FONT_SIZE.sm },
  sameDriverBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    paddingVertical: 9, borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1.5, borderColor: 'rgba(0,158,247,0.3)', backgroundColor: COLORS.white,
  },
  sameDriverTxt: { fontSize: FONT_SIZE.sm, fontWeight: '800', color: COLORS.primary },
  btnActive: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderRadius: BORDER_RADIUS.lg, paddingVertical: 10, backgroundColor: '#2563EB',
  },
  btnActiveTxt: { color: '#FFF', fontWeight: '800', fontSize: FONT_SIZE.sm },

  // Empty / error
  emptyState: { alignItems: 'center', paddingVertical: 60, gap: SPACING.sm },
  emptyTitle: { fontSize: FONT_SIZE.lg, fontWeight: '800', color: COLORS.gray600 },
  emptySub: { fontSize: FONT_SIZE.sm, color: COLORS.gray400, textAlign: 'center' },
  bookBtn: { backgroundColor: COLORS.primary, paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.xl, marginTop: SPACING.md },
  bookBtnTxt: { fontSize: FONT_SIZE.md, fontWeight: '700', color: '#FFF' },
  errorState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: SPACING.sm },
  errorTitle: { fontSize: FONT_SIZE.lg, fontWeight: '800', color: COLORS.gray700 },
  errorSub: { fontSize: FONT_SIZE.sm, color: COLORS.gray400 },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.error, paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.xl, marginTop: SPACING.sm },
  retryBtnTxt: { color: '#FFF', fontWeight: '800', fontSize: FONT_SIZE.sm },
});

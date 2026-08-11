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
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import { CURRENCY, useThemeColors } from '@/src/constants/theme';
import { BRAND, RADIUS, SPACING, SURFACE, TYPOGRAPHY } from '@/src/constants/designSystem';
import { useAuthedUserId } from '@/src/hooks/useAuthedUserId';
import { getUserTrips } from '@/src/services/api';
import { isActiveTripStatus, normalizeTripStatus } from '@/src/utils/tripStatus';
import { TabBrandStrip } from '@/src/components/flow/TabBrandStrip';
import { useFlowLayout } from '@/src/constants/flowLayout';
import { tabCacheGet, tabCacheSet } from '@/src/services/tabDataCache';
import { qk } from '@/src/services/queryKeys';

type TripTab = 'upcoming' | 'completed' | 'cancelled';

// ─── Status helpers ──────────────────────────────────────────────────────────
function getTripStatusMeta(status: string, paymentStatus?: string): {
  label: string; color: string; bg: string; icon: string;
} {
  const s = String(status || '');
  const ps = String(paymentStatus || '');
  if (s === 'completed' && (ps === 'pending' || ps === 'pending_confirmation')) {
    return { label: 'Awaiting payment', color: BRAND.accentPurple, bg: 'rgba(139,92,246,0.15)', icon: 'time-outline' };
  }
  if (s === 'completed') {
    return { label: 'Completed', color: BRAND.primaryDark, bg: BRAND.primaryMuted, icon: 'checkmark-circle' };
  }
  if (s === 'cancelled') {
    return { label: 'Cancelled', color: BRAND.danger, bg: 'rgba(239,68,68,0.12)', icon: 'close-circle' };
  }
  if (['ongoing'].includes(s)) {
    return { label: 'On trip', color: BRAND.accentBlue, bg: 'rgba(0,102,255,0.12)', icon: 'navigate' };
  }
  if (['accepted', 'arrived'].includes(s)) {
    return {
      label: s === 'arrived' ? 'Driver arrived' : 'Driver assigned',
      color: BRAND.info,
      bg: 'rgba(56,189,248,0.14)',
      icon: 'car-sport',
    };
  }
  if (s === 'pending_payment') {
    return { label: 'Awaiting payment', color: BRAND.accentPurple, bg: 'rgba(139,92,246,0.15)', icon: 'wallet-outline' };
  }
  return { label: 'Searching', color: BRAND.warning, bg: 'rgba(245,158,11,0.14)', icon: 'search' };
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
  const { colors, isDark } = useThemeColors();
  const cardBg = isDark ? SURFACE.cardDark : colors.card;
  const border = isDark ? SURFACE.hairline : colors.border;
  const muted = colors.textMuted;
  const secondary = colors.textSecondary;
  const primaryText = colors.text;
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
      style={[styles.tripCard, { backgroundColor: cardBg, borderColor: border }]}
      onPress={onPress}
      activeOpacity={0.88}
      accessibilityRole="button"
      accessibilityLabel={`Trip from ${pickup} to ${dropoff}, ${fmtFare(fare)}`}
    >
      {/* Header row: date + fare */}
      <View style={styles.cardHeader}>
        <Text style={[styles.cardDate, { color: muted }]}>{dateStr}</Text>
        <Text style={[styles.cardFare, { color: primaryText }]}>{fmtFare(fare)}</Text>
      </View>

      {/* Status badge */}
      <View style={[styles.statusBadge, { backgroundColor: statusMeta.bg }]}>
        <Ionicons name={statusMeta.icon as any} size={12} color={statusMeta.color} />
        <Text style={[styles.statusBadgeTxt, { color: statusMeta.color }]}>{statusMeta.label}</Text>
      </View>

      {/* Route */}
      <View style={styles.routeBlock}>
        <View style={styles.routePoint}>
          <View style={[styles.routeDot, { backgroundColor: BRAND.primary }]} />
          <Text style={[styles.routeAddr, { color: primaryText }]} numberOfLines={1}>{pickup}</Text>
        </View>
        <View style={styles.routeLine} />
        <View style={styles.routePoint}>
          <View style={[styles.routeDot, { backgroundColor: BRAND.danger }]} />
          <Text style={[styles.routeAddr, { color: primaryText }]} numberOfLines={1}>{dropoff}</Text>
        </View>
      </View>

      {/* Meta row */}
      <View style={styles.metaRow}>
        <Text style={[styles.driverLabel, { color: secondary }]} numberOfLines={1}>{driverLabel}</Text>
        <View style={styles.metaRight}>
          {distKm > 0 && (
            <View style={[styles.metaChip, { backgroundColor: isDark ? SURFACE.tile : colors.surface, borderColor: border }]}>
              <Ionicons name="navigate-outline" size={11} color={BRAND.textMuted} />
              <Text style={[styles.metaChipTxt, { color: muted }]}>{distKm.toFixed(1)} km</Text>
            </View>
          )}
          {durMins > 0 && (
            <View style={[styles.metaChip, { backgroundColor: isDark ? SURFACE.tile : colors.surface, borderColor: border }]}>
              <Ionicons name="time-outline" size={11} color={BRAND.textMuted} />
              <Text style={[styles.metaChipTxt, { color: muted }]}>{durMins} min</Text>
            </View>
          )}
          {payMethod && (
            <View style={[styles.metaChip, { backgroundColor: isDark ? SURFACE.tile : colors.surface, borderColor: border }]}>
              <Ionicons
                name={payMethod.toLowerCase().includes('cash') ? 'cash-outline' : 'wallet-outline'}
                size={11}
                color={BRAND.textMuted}
              />
              <Text style={[styles.metaChipTxt, { color: muted }]}>{payMethod}</Text>
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
          <Ionicons name="car-sport-outline" size={13} color={BRAND.textMuted} />
          <Text style={[styles.vehicleTxt, { color: muted }]} numberOfLines={1}>
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
            <Ionicons name="receipt-outline" size={15} color={BRAND.info} />
            <Text style={styles.btnReceiptTxt}>Receipt</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnReport} onPress={onReport} accessibilityRole="button">
            <Ionicons name="shield-outline" size={15} color={BRAND.danger} />
            <Text style={styles.btnReportTxt}>Issue</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Same driver row (completed only) */}
      {isCompleted && trip.driver_id ? (
        <TouchableOpacity style={styles.sameDriverBtn} onPress={onSameDriver} accessibilityRole="button">
          <Ionicons name="heart-outline" size={15} color={BRAND.primary} />
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
  const { colors, isDark } = useThemeColors();
  const cardBg = isDark ? SURFACE.cardDark : colors.card;
  const border = isDark ? SURFACE.hairline : colors.border;
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
    <View style={[styles.insightsCard, { backgroundColor: cardBg, borderColor: border }]}>
      <Text style={[styles.insightsTitle, { color: colors.text }]}>This month</Text>
      <View style={styles.insightsRow}>
        <View style={styles.insightCell}>
          <Text style={styles.insightValue}>{ridesMonth}</Text>
          <Text style={styles.insightLabel}>Rides</Text>
        </View>
        <View style={styles.insightDivider} />
        <View style={styles.insightCell}>
          <Text style={styles.insightValue}>{fmtFare(spendMonth)}</Text>
          <Text style={styles.insightLabel}>Spent</Text>
        </View>
      </View>
      {topDest ? (
        <View style={styles.topDestRow}>
          <Ionicons name="location" size={14} color={BRAND.primary} />
          <Text style={[styles.topDestTxt, { color: colors.textSecondary }]} numberOfLines={1}>Top stop: {topDest}</Text>
        </View>
      ) : null}
      <Text style={[styles.insightsFoot, { color: colors.textMuted }]}>
        {allTimeRides} completed · {fmtFare(allSpend)} lifetime
      </Text>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────
export default function RiderTripsScreen() {
  const router = useRouter();
  const { colors, isDark } = useThemeColors();
  const { userId: riderId, canCallAuthedApi } = useAuthedUserId();
  const tripsCacheKey = riderId ? `rider-trips:${riderId}` : '';
  const cachedTrips = riderId ? tabCacheGet<any[]>(`rider-trips:${riderId}`) : null;
  const [activeTab, setActiveTab] = useState<TripTab>('upcoming');
  const [refreshing, setRefreshing] = useState(false);
  const tabPad = useTabBottomPad(8);
  const flow   = useFlowLayout();
  const didAutoTab = useRef(false);

  const tripsQuery = useQuery({
    queryKey: riderId ? qk.riderTrips(riderId) : ['rider', 'trips', 'none'],
    enabled: Boolean(riderId && canCallAuthedApi),
    initialData: Array.isArray(cachedTrips) ? cachedTrips : undefined,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const res = await getUserTrips(riderId!, 'rider');
      const next = Array.isArray(res.data) ? res.data : [];
      if (tripsCacheKey) tabCacheSet(tripsCacheKey, next);
      return next;
    },
  });

  const trips = tripsQuery.data ?? [];
  const loading = tripsQuery.isLoading && trips.length === 0;
  const loadError = tripsQuery.isError;

  const loadTrips = useCallback(async (_silent = false) => {
    try {
      await tripsQuery.refetch();
    } finally {
      setRefreshing(false);
    }
  }, [tripsQuery]);

  useEffect(() => {
    if (didAutoTab.current || trips.length === 0) return;
    const upcoming = trips.filter((t: any) => isActiveTripStatus(t.status, t.payment_status));
    if (upcoming.length === 0) {
      const completed = trips.filter(
        (t: any) => normalizeTripStatus(t.status, t.payment_status) === 'completed',
      );
      if (completed.length > 0) setActiveTab('completed');
    }
    didAutoTab.current = true;
  }, [trips]);

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

  const keyExtractor = useCallback((item: any, index: number) =>
    String(item.id ?? item._id ?? `trip-${index}`), []);

  const ListHeader = useMemo(() => (
    <View style={styles.listHeaderWrap}>
      {segmented.completed.length > 0 ? (
        <InsightsCard completed={segmented.completed} />
      ) : null}
    </View>
  ), [segmented.completed]);

  const ListEmpty = (
    <View style={styles.emptyState}>
      <Ionicons name="car-outline" size={64} color={colors.textMuted} />
      <Text style={[styles.emptyTitle, { color: colors.text }]}>No {activeTab} trips</Text>
      <Text style={[styles.emptySub, { color: colors.textMuted }]}>
        {activeTab === 'upcoming'
          ? 'Nothing on the calendar — book when you are ready'
          : activeTab === 'completed'
            ? 'Finished rides show up here with receipts'
            : 'Cancelled bookings will appear here'}
      </Text>
      {activeTab === 'upcoming' ? (
        <TouchableOpacity style={styles.bookBtn} onPress={() => router.push('/rider/book' as any)}>
          <Text style={styles.bookBtnTxt}>Book a ride</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  const ErrorState = (
    <View style={styles.errorState}>
      <Ionicons name="cloud-offline-outline" size={48} color={BRAND.danger} />
      <Text style={[styles.errorTitle, { color: colors.text }]}>Could not load trips</Text>
      <Text style={[styles.errorSub, { color: colors.textMuted }]}>Check your connection and try again</Text>
      <TouchableOpacity style={styles.retryBtn} onPress={() => { void loadTrips(); }}>
        <Ionicons name="refresh" size={16} color="#FFF" />
        <Text style={styles.retryBtnTxt}>Retry</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: isDark ? BRAND.bgDeep : colors.background }]} edges={['top']}>
      <TabBrandStrip role="rider" />

      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingHorizontal: flow.padH,
            backgroundColor: isDark ? BRAND.bgDeep : colors.background,
            borderBottomColor: isDark ? SURFACE.hairline : colors.border,
          },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button">
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>My trips</Text>
        <TouchableOpacity
          style={styles.shieldBtn}
          onPress={() => router.push('/shield-disputes' as any)}
          accessibilityRole="button"
          accessibilityLabel="NEXRYDE Shield"
        >
          <Ionicons name="shield-checkmark-outline" size={22} color={BRAND.primary} />
        </TouchableOpacity>
      </View>

      {/* Tab bar */}
      <View
        style={[
          styles.tabBar,
          {
            paddingHorizontal: flow.padH,
            backgroundColor: isDark ? BRAND.bgDeep : colors.background,
            borderBottomColor: isDark ? SURFACE.hairline : colors.border,
          },
        ]}
      >
        {(['upcoming', 'completed', 'cancelled'] as TripTab[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
            accessibilityRole="tab"
          >
            <Text
              style={[
                styles.tabTxt,
                { color: colors.textMuted },
                activeTab === tab && styles.tabTxtActive,
              ]}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
            {segmented[tab].length > 0 ? (
              <View style={[styles.tabBadge, activeTab === tab && styles.tabBadgeActive]}>
                <Text style={[styles.tabBadgeTxt, { color: colors.textSecondary }, activeTab === tab && styles.tabBadgeTxtActive]}>
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
              tintColor={BRAND.primary}
              colors={[BRAND.primary]}
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
  root: { flex: 1, backgroundColor: BRAND.bgDeep },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.stack,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { padding: SPACING.sm, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '900', letterSpacing: -0.2 },
  shieldBtn: { padding: SPACING.xs, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },

  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: BRAND.primary },
  tabTxt: { fontSize: 12, fontWeight: '600' },
  tabTxtActive: { color: BRAND.primary, fontWeight: '800' },
  tabBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: RADIUS.full,
    backgroundColor: SURFACE.tile,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  tabBadgeActive: { backgroundColor: BRAND.primary },
  tabBadgeTxt: { fontSize: 10, fontWeight: '800' },
  tabBadgeTxtActive: { color: BRAND.textInverse },

  listContent: { paddingTop: SPACING.md, gap: SPACING.stack, flexGrow: 1 },
  listHeaderWrap: { marginBottom: SPACING.xs },

  insightsCard: {
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    padding: SPACING.md,
  },
  insightsTitle: { fontSize: 14, fontWeight: '800', marginBottom: SPACING.sm, letterSpacing: -0.1 },
  insightsRow: { flexDirection: 'row', alignItems: 'center' },
  insightCell: { flex: 1, alignItems: 'center', paddingVertical: SPACING.xs },
  insightDivider: { width: StyleSheet.hairlineWidth, height: 36, backgroundColor: SURFACE.hairline },
  insightValue: { fontSize: 22, fontWeight: '900', color: BRAND.primary, letterSpacing: -0.3 },
  insightLabel: { ...TYPOGRAPHY.caption, color: BRAND.textMuted, marginTop: 3, textAlign: 'center' },
  topDestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SURFACE.hairline,
  },
  topDestTxt: { flex: 1, fontSize: 13, fontWeight: '700' },
  insightsFoot: { marginTop: SPACING.sm, fontSize: 11, fontWeight: '600', textAlign: 'center' },

  tripCard: {
    borderRadius: RADIUS.xl,
    padding: SPACING.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: SPACING.stack,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardDate: { fontSize: 12, fontWeight: '600' },
  cardFare: { fontSize: 16, fontWeight: '900', letterSpacing: -0.2 },

  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
  },
  statusBadgeTxt: { fontSize: 11, fontWeight: '800' },

  routeBlock: { gap: 4 },
  routePoint: { flexDirection: 'row', alignItems: 'center', gap: SPACING.stack },
  routeDot: { width: 9, height: 9, borderRadius: 5 },
  routeAddr: { flex: 1, fontSize: 13, fontWeight: '600' },
  routeLine: { width: StyleSheet.hairlineWidth + 0.5, height: 14, backgroundColor: SURFACE.hairline, marginLeft: 4 },

  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.xs,
    paddingTop: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  driverLabel: { flex: 1, fontSize: 13, fontWeight: '600' },
  metaRight: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: RADIUS.full,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: StyleSheet.hairlineWidth,
  },
  metaChipTxt: { fontSize: 10, fontWeight: '700' },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(245,158,11,0.14)',
    borderRadius: RADIUS.full,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  ratingTxt: { fontSize: 10, fontWeight: '800', color: BRAND.warning },

  vehicleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  vehicleTxt: { fontSize: 12, fontWeight: '600', flex: 1 },

  actionsRow: { flexDirection: 'row', gap: SPACING.xs },
  btnBookAgain: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: RADIUS.lg,
    paddingVertical: 10,
    backgroundColor: BRAND.primary,
  },
  btnBookAgainTxt: { color: BRAND.textInverse, fontWeight: '800', fontSize: 13 },
  btnReceipt: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: RADIUS.lg,
    paddingVertical: 10,
    backgroundColor: 'rgba(56,189,248,0.12)',
  },
  btnReceiptTxt: { color: BRAND.info, fontWeight: '700', fontSize: 13 },
  btnReport: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: RADIUS.lg,
    paddingVertical: 10,
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(239,68,68,0.22)',
  },
  btnReportTxt: { color: BRAND.danger, fontWeight: '700', fontSize: 13 },
  sameDriverBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 9,
    borderRadius: RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: `${BRAND.primary}44`,
    backgroundColor: BRAND.primaryMuted,
  },
  sameDriverTxt: { fontSize: 13, fontWeight: '800', color: BRAND.primary },
  btnActive: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: RADIUS.lg,
    paddingVertical: 10,
    backgroundColor: BRAND.accentBlue,
  },
  btnActiveTxt: { color: '#FFF', fontWeight: '800', fontSize: 13 },

  emptyState: { alignItems: 'center', paddingVertical: 60, gap: SPACING.stack },
  emptyTitle: { fontSize: 17, fontWeight: '800' },
  emptySub: { fontSize: 13, textAlign: 'center' },
  bookBtn: {
    backgroundColor: BRAND.primary,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.xl,
    marginTop: SPACING.md,
  },
  bookBtnTxt: { fontSize: 15, fontWeight: '800', color: BRAND.textInverse },
  errorState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: SPACING.stack },
  errorTitle: { fontSize: 17, fontWeight: '800' },
  errorSub: { fontSize: 13 },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: BRAND.danger,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.xl,
    marginTop: SPACING.sm,
  },
  retryBtnTxt: { color: '#FFF', fontWeight: '800', fontSize: 13 },
});

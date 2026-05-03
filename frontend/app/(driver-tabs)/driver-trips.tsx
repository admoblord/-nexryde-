import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Animated,
  Platform,
  Easing,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAppStore } from '@/src/store/appStore';
import { BACKEND_URL, getAuthHeaders } from '@/src/services/api';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS, CURRENCY } from '@/src/constants/theme';
import { useTabBottomPad } from '@/src/hooks/useBottomPad';

type TripStatus = 'completed' | 'cancelled' | 'ongoing' | 'accepted' | 'arrived' | 'pending' | 'pending_payment';
type FilterKey = 'all' | 'active' | 'completed' | 'cancelled';

const FILTER_TABS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
];

function isActive(status: string) {
  return ['accepted', 'arrived', 'ongoing', 'pending_payment', 'pending'].includes(status);
}

function statusColor(status: string): string {
  if (status === 'completed') return '#16A34A';
  if (status === 'cancelled') return '#EF4444';
  if (status === 'pending_payment') return '#7C3AED';
  if (isActive(status)) return '#2563EB';
  return '#6B7280';
}
function statusBg(status: string): string {
  if (status === 'completed') return '#D1FAE5';
  if (status === 'cancelled') return '#FEE2E2';
  if (status === 'pending_payment') return '#EDE9FE';
  if (isActive(status)) return '#DBEAFE';
  return '#F3F4F6';
}
function statusLabel(status: string): string {
  if (status === 'pending_payment') return 'Awaiting Payment';
  if (status === 'arrived') return 'At Pickup';
  return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ');
}

function formatDate(iso: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === today.toDateString()) {
      return `Today, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    if (d.toDateString() === yesterday.toDateString()) {
      return `Yesterday, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return ''; }
}

function PulsingLiveDot() {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.6, duration: 700, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      ])
    ).start();
  }, [pulse]);
  return (
    <View style={{ width: 14, height: 14, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{
        position: 'absolute', width: 14, height: 14, borderRadius: 7,
        backgroundColor: 'rgba(74,222,128,0.3)', transform: [{ scale: pulse }],
      }} />
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#4ADE80' }} />
    </View>
  );
}

export default function DriverTripsTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, currentTrip } = useAppStore();
  const tabPad = useTabBottomPad(16);

  const [trips, setTrips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [loadError, setLoadError] = useState(false);

  const loadTrips = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    setLoadError(false);
    try {
      const res = await fetch(
        `${BACKEND_URL}/api/trips/user/${user.id}?role=driver`,
        { headers: getAuthHeaders() },
      );
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setTrips(Array.isArray(data) ? data : []);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => { void loadTrips(); }, [loadTrips]);

  const onRefresh = () => {
    setRefreshing(true);
    void loadTrips();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const filteredTrips = useMemo(() => {
    if (filter === 'all') return trips;
    if (filter === 'active') return trips.filter(t => isActive(t.status));
    if (filter === 'completed') return trips.filter(t => t.status === 'completed');
    if (filter === 'cancelled') return trips.filter(t => t.status === 'cancelled');
    return trips;
  }, [trips, filter]);

  // Stats from completed trips
  const stats = useMemo(() => {
    const completed = trips.filter(t => t.status === 'completed');
    const totalEarnings = completed.reduce((sum, t) => sum + Number(t.fare || 0), 0);
    const totalKm = completed.reduce((sum, t) => sum + Number(t.distance_km || 0), 0);
    return { total: trips.length, completed: completed.length, earnings: totalEarnings, km: totalKm };
  }, [trips]);

  const renderTripCard = ({ item, index }: { item: any; index: number }) => {
    const status: string = item.status || 'pending';
    const active = isActive(status);
    const fare = Number(item.fare || 0);
    const distKm = Number(item.distance_km || 0);
    const pickup = item.pickup_location?.address || item.pickup_address || 'Pickup';
    const dropoff = item.dropoff_location?.address || item.dropoff_address || 'Destination';
    const riderName = item.rider_display_name || item.rider_name || 'Rider';
    const createdAt = item.created_at || item.requested_at || '';

    return (
      <TouchableOpacity
        style={[styles.tripCard, active && styles.tripCardActive, index === 0 && { marginTop: 0 }]}
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          if (active) {
            router.push('/driver/trips' as any);
          } else {
            // Show trip detail
            router.push({ pathname: '/driver/trips' as any });
          }
        }}
        activeOpacity={0.88}
      >
        {/* Card header */}
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <View style={[styles.statusPill, { backgroundColor: statusBg(status) }]}>
              {active && <PulsingLiveDot />}
              {!active && (
                <Ionicons
                  name={status === 'completed' ? 'checkmark-circle' : status === 'cancelled' ? 'close-circle' : 'time'}
                  size={13}
                  color={statusColor(status)}
                />
              )}
              <Text style={[styles.statusText, { color: statusColor(status) }]}>
                {statusLabel(status)}
              </Text>
            </View>
            {active && (
              <View style={styles.liveLabel}>
                <Text style={styles.liveLabelText}>LIVE</Text>
              </View>
            )}
          </View>
          <Text style={styles.fareText}>{CURRENCY}{fare.toLocaleString()}</Text>
        </View>

        {/* Rider + date row */}
        <View style={styles.riderRow}>
          <View style={styles.riderAvatar}>
            <Ionicons name="person" size={14} color="#4F46E5" />
          </View>
          <Text style={styles.riderName}>{riderName}</Text>
          <Text style={styles.dateText}>{formatDate(createdAt)}</Text>
        </View>

        {/* Route */}
        <View style={styles.routeWrap}>
          <View style={styles.routeLineColumn}>
            <View style={[styles.routeDot, { backgroundColor: '#2563EB' }]} />
            <View style={styles.routeConnector} />
            <View style={[styles.routeDot, { backgroundColor: '#EF4444' }]} />
          </View>
          <View style={{ flex: 1, gap: 8 }}>
            <View>
              <Text style={styles.routeLabel}>Pickup</Text>
              <Text style={styles.routeAddress} numberOfLines={1}>{pickup}</Text>
            </View>
            <View>
              <Text style={styles.routeLabel}>Drop-off</Text>
              <Text style={styles.routeAddress} numberOfLines={1}>{dropoff}</Text>
            </View>
          </View>
        </View>

        {/* Meta row */}
        <View style={styles.metaRow}>
          {distKm > 0 && (
            <View style={styles.metaChip}>
              <Ionicons name="navigate" size={12} color="#6B7280" />
              <Text style={styles.metaChipText}>{distKm.toFixed(1)} km</Text>
            </View>
          )}
          {item.category && (
            <View style={styles.metaChip}>
              <Ionicons name="car-sport" size={12} color="#6B7280" />
              <Text style={styles.metaChipText}>{item.category}</Text>
            </View>
          )}
          {item.payment_method && (
            <View style={styles.metaChip}>
              <Ionicons name="card" size={12} color="#6B7280" />
              <Text style={styles.metaChipText}>{item.payment_method}</Text>
            </View>
          )}
        </View>

        {/* CTA for active trips */}
        {active && (
          <TouchableOpacity
            style={styles.manageTripBtn}
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              router.push('/driver/trips' as any);
            }}
            activeOpacity={0.88}
          >
            <Ionicons name="navigate" size={15} color={COLORS.white} />
            <Text style={styles.manageTripBtnText}>Manage Trip</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  const renderHeader = () => (
    <>
      {/* Active trip banner */}
      {currentTrip?.id && (
        <TouchableOpacity
          style={styles.activeTripBanner}
          onPress={() => router.push('/driver/trips' as any)}
          activeOpacity={0.9}
        >
          <LinearGradient colors={['#1E3A5F', '#2563EB']} style={styles.activeTripGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <PulsingLiveDot />
            <View style={{ flex: 1, marginLeft: SPACING.sm }}>
              <Text style={styles.activeTripTitle}>Active Trip in Progress</Text>
              <Text style={styles.activeTripSub}>
                {statusLabel(currentTrip.status)} · {CURRENCY}{Number((currentTrip as any)?.fare || 0).toLocaleString()}
              </Text>
            </View>
            <View style={styles.activeTripArrow}>
              <Ionicons name="arrow-forward" size={18} color={COLORS.white} />
            </View>
          </LinearGradient>
        </TouchableOpacity>
      )}

      {/* Stats strip */}
      <View style={styles.statsStrip}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{stats.total}</Text>
          <Text style={styles.statLabel}>Total Trips</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{stats.completed}</Text>
          <Text style={styles.statLabel}>Completed</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{CURRENCY}{(stats.earnings / 1000).toFixed(1)}k</Text>
          <Text style={styles.statLabel}>Earned</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{stats.km.toFixed(0)}</Text>
          <Text style={styles.statLabel}>km driven</Text>
        </View>
      </View>

      {/* Filter tabs */}
      <View style={styles.filterRow}>
        {FILTER_TABS.map(tab => {
          const count = tab.key === 'all' ? trips.length
            : tab.key === 'active' ? trips.filter(t => isActive(t.status)).length
            : tab.key === 'completed' ? trips.filter(t => t.status === 'completed').length
            : trips.filter(t => t.status === 'cancelled').length;
          const active = filter === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.filterTab, active && styles.filterTabActive]}
              onPress={() => {
                setFilter(tab.key);
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              activeOpacity={0.8}
            >
              <Text style={[styles.filterTabText, active && styles.filterTabTextActive]}>
                {tab.label}
              </Text>
              {count > 0 && (
                <View style={[styles.filterCount, active && styles.filterCountActive]}>
                  <Text style={[styles.filterCountText, active && styles.filterCountTextActive]}>{count}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </>
  );

  const renderEmpty = () => {
    if (loading) return null;
    return (
      <View style={styles.emptyState}>
        <LinearGradient colors={['#EFF6FF', '#DBEAFE']} style={styles.emptyIconWrap}>
          <Ionicons name="car-outline" size={44} color="#2563EB" />
        </LinearGradient>
        <Text style={styles.emptyTitle}>
          {filter === 'active' ? 'No Active Trips' : filter === 'completed' ? 'No Completed Trips Yet' : filter === 'cancelled' ? 'No Cancelled Trips' : 'No Trips Yet'}
        </Text>
        <Text style={styles.emptySubtitle}>
          {filter === 'all' ? 'Go online and accept your first ride to see your trip history here.' : `No ${filter} trips found.`}
        </Text>
        {filter === 'all' && (
          <TouchableOpacity
            style={styles.goOnlineBtn}
            onPress={() => router.push('/(driver-tabs)/driver-home' as any)}
            activeOpacity={0.88}
          >
            <Ionicons name="power" size={18} color={COLORS.white} />
            <Text style={styles.goOnlineBtnText}>Go to Driver Home</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>My Trips</Text>
          <Text style={styles.headerSubtitle}>
            {trips.length > 0 ? `${stats.completed} completed · ${stats.total} total` : 'Your trip history'}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.operationsBtn}
          onPress={() => router.push('/driver/trips' as any)}
          activeOpacity={0.88}
        >
          <Ionicons name="radio" size={16} color="#2563EB" />
          <Text style={styles.operationsBtnText}>Operations</Text>
        </TouchableOpacity>
      </View>

      {loadError && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle-outline" size={16} color="#EF4444" />
          <Text style={styles.errorText}>Could not load trips.</Text>
          <TouchableOpacity onPress={() => { setLoading(true); void loadTrips(); }}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {loading && !refreshing ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.loadingText}>Loading trips…</Text>
        </View>
      ) : (
        <FlatList
          data={filteredTrips}
          renderItem={renderTripCard}
          keyExtractor={item => item.id || item._id || Math.random().toString()}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={[styles.listContent, { paddingBottom: tabPad + 20 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#2563EB"
              colors={['#2563EB']}
            />
          }
          ItemSeparatorComponent={() => <View style={{ height: SPACING.sm }} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 },
    }),
    elevation: 2,
  },
  headerTitle: { fontSize: FONT_SIZE.xl, fontWeight: '900', color: '#0F172A' },
  headerSubtitle: { fontSize: FONT_SIZE.xs, color: '#64748B', fontWeight: '500', marginTop: 2 },
  operationsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  operationsBtnText: { fontSize: FONT_SIZE.sm, fontWeight: '700', color: '#2563EB' },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: '#FEF2F2',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#FECACA',
  },
  errorText: { flex: 1, fontSize: FONT_SIZE.sm, color: '#EF4444', fontWeight: '600' },
  retryText: { fontSize: FONT_SIZE.sm, color: '#2563EB', fontWeight: '700' },
  loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.md },
  loadingText: { fontSize: FONT_SIZE.sm, color: '#94A3B8' },
  listContent: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg },
  // Active trip banner
  activeTripBanner: {
    marginBottom: SPACING.md,
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
    ...SHADOWS.md,
  },
  activeTripGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  activeTripTitle: { fontSize: FONT_SIZE.md, fontWeight: '800', color: COLORS.white },
  activeTripSub: { fontSize: FONT_SIZE.xs, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  activeTripArrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Stats strip
  statsStrip: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    ...SHADOWS.sm,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: FONT_SIZE.lg, fontWeight: '900', color: '#0F172A' },
  statLabel: { fontSize: 10, color: '#94A3B8', fontWeight: '600', marginTop: 2, textAlign: 'center' },
  statDivider: { width: 1, backgroundColor: '#F1F5F9', marginVertical: 4 },
  // Filter tabs
  filterRow: {
    flexDirection: 'row',
    gap: SPACING.xs,
    marginBottom: SPACING.md,
  },
  filterTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterTabActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  filterTabText: { fontSize: 12, fontWeight: '700', color: '#64748B' },
  filterTabTextActive: { color: COLORS.white },
  filterCount: {
    backgroundColor: '#F1F5F9',
    borderRadius: BORDER_RADIUS.full,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  filterCountActive: { backgroundColor: 'rgba(255,255,255,0.25)' },
  filterCountText: { fontSize: 10, fontWeight: '800', color: '#64748B' },
  filterCountTextActive: { color: COLORS.white },
  // Trip card
  tripCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    ...SHADOWS.sm,
    marginTop: SPACING.sm,
  },
  tripCardActive: {
    borderColor: '#93C5FD',
    borderWidth: 1.5,
    backgroundColor: '#FAFEFF',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.full,
  },
  statusText: { fontSize: 12, fontWeight: '700' },
  liveLabel: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.full,
  },
  liveLabelText: { fontSize: 9, fontWeight: '900', color: COLORS.white, letterSpacing: 0.5 },
  fareText: { fontSize: FONT_SIZE.lg, fontWeight: '900', color: '#0F172A' },
  riderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  riderAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#E0E7FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  riderName: { flex: 1, fontSize: FONT_SIZE.sm, fontWeight: '700', color: '#374151' },
  dateText: { fontSize: FONT_SIZE.xs, color: '#94A3B8', fontWeight: '500' },
  routeWrap: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
  },
  routeLineColumn: { alignItems: 'center', paddingTop: 4, width: 12 },
  routeDot: { width: 8, height: 8, borderRadius: 4 },
  routeConnector: {
    width: 1.5,
    flex: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 3,
    minHeight: 16,
  },
  routeLabel: { fontSize: 10, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.5 },
  routeAddress: { fontSize: FONT_SIZE.sm, fontWeight: '600', color: '#1E293B', marginTop: 1 },
  metaRow: {
    flexDirection: 'row',
    gap: SPACING.xs,
    flexWrap: 'wrap',
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.full,
  },
  metaChipText: { fontSize: 11, fontWeight: '600', color: '#6B7280' },
  manageTripBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    backgroundColor: '#2563EB',
    padding: SPACING.sm,
    borderRadius: BORDER_RADIUS.lg,
    marginTop: SPACING.sm,
  },
  manageTripBtnText: { fontSize: FONT_SIZE.sm, fontWeight: '800', color: COLORS.white },
  // Empty state
  emptyState: { alignItems: 'center', paddingVertical: 48, gap: SPACING.md, paddingHorizontal: SPACING.xl },
  emptyIconWrap: {
    width: 96, height: 96, borderRadius: 48,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyTitle: { fontSize: FONT_SIZE.xl, fontWeight: '800', color: '#1E293B', textAlign: 'center' },
  emptySubtitle: {
    fontSize: FONT_SIZE.sm, color: '#64748B',
    textAlign: 'center', lineHeight: 22,
  },
  goOnlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: '#2563EB',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.xl,
    marginTop: SPACING.sm,
    ...SHADOWS.md,
  },
  goOnlineBtnText: { fontSize: FONT_SIZE.md, fontWeight: '700', color: COLORS.white },
});

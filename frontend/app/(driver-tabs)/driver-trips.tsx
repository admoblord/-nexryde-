import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { CURRENCY, useThemeColors } from '@/src/constants/theme';
import { BRAND, RADIUS, SPACING, SURFACE, TYPOGRAPHY } from '@/src/constants/designSystem';
import { useTabBottomPad } from '@/src/hooks/useBottomPad';
import { TabBrandStrip } from '@/src/components/flow/TabBrandStrip';
import { useFlowLayout } from '@/src/constants/flowLayout';
import { useAuthedUserId } from '@/src/hooks/useAuthedUserId';
import { useResource } from '@/src/hooks/useResource';
import { InlineError } from '@/src/components/InlineError';
import { fetchDriverTripsScreenData, type DriverTripRecord } from '@/src/services/driverTripsScreenData';

function formatEarnings(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(1)}k`;
  return amount.toLocaleString();
}

function TripCardSkeleton() {
  const anim = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.4, duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, [anim]);
  return (
    <Animated.View style={[skStyles.skCard, { opacity: anim }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
        <View style={[skStyles.skBox, { width: 80, height: 22, borderRadius: RADIUS.full }]} />
        <View style={[skStyles.skBox, { width: 64, height: 22 }]} />
      </View>
      <View style={[skStyles.skBox, { width: '60%', height: 14, marginBottom: 6 }]} />
      <View style={[skStyles.skBox, { width: '45%', height: 14, marginBottom: 10 }]} />
      <View style={[skStyles.skBox, { width: '100%', height: 40, borderRadius: RADIUS.sm }]} />
    </Animated.View>
  );
}
const skStyles = StyleSheet.create({
  skCard: {
    backgroundColor: SURFACE.cardDark,
    borderRadius: RADIUS.xl,
    padding: 14,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SURFACE.hairline,
  },
  skBox: { backgroundColor: SURFACE.cardElevated, borderRadius: 6, height: 16 },
});

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
  if (status === 'completed') return BRAND.primary;
  if (status === 'cancelled') return BRAND.danger;
  if (status === 'pending_payment') return BRAND.accentPurple;
  if (isActive(status)) return BRAND.info;
  return BRAND.textMuted;
}
function statusBg(status: string): string {
  if (status === 'completed') return 'rgba(34,225,128,0.14)';
  if (status === 'cancelled') return 'rgba(239,68,68,0.14)';
  if (status === 'pending_payment') return 'rgba(139,92,246,0.14)';
  if (isActive(status)) return 'rgba(56,189,248,0.14)';
  return SURFACE.tile;
}
function statusLabel(status: string): string {
  if (status === 'pending_payment') return 'Awaiting payment';
  if (status === 'arrived') return 'At pickup';
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
  const { currentTrip } = useAppStore();
  const { userId: driverId, canCallAuthedApi } = useAuthedUserId();
  const tabPad = useTabBottomPad(8);
  const flow = useFlowLayout();
  const { colors, isDark } = useThemeColors();
  const screenBg = isDark ? BRAND.bgDeep : colors.background;
  const cardBg = isDark ? SURFACE.cardDark : colors.card;
  const textPrimary = colors.text;
  const textMuted = colors.textMuted;
  const border = isDark ? SURFACE.hairline : colors.border;

  const resourceKey = `driver-trips:${driverId ?? 'none'}`;
  const { data, loading, error, retry } = useResource(
    resourceKey,
    () => fetchDriverTripsScreenData(driverId!),
    { cache: true, enabled: canCallAuthedApi && !!driverId },
  );
  const trips = (data ?? []) as DriverTripRecord[];

  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterKey>('all');

  useEffect(() => {
    if (!loading) setRefreshing(false);
  }, [loading]);

  const onRefresh = () => {
    setRefreshing(true);
    void retry();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const filteredTrips = useMemo(() => {
    if (filter === 'all') return trips;
    if (filter === 'active') return trips.filter(t => isActive(String(t.status ?? '')));
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
        style={[
          styles.tripCard,
          active && styles.tripCardActive,
          index === 0 && { marginTop: 0 },
          { padding: flow.cardPad },
        ]}
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          if (active) {
            router.push('/(driver-tabs)/driver-home' as any);
          } else if (status === 'completed') {
            // Navigate to trip earnings / receipt detail
            router.push({ pathname: '/driver/trip-detail', params: { tripId: item.id } } as any);
          }
          // No action for cancelled trips on tap (actions are inline)
        }}
        activeOpacity={active || status === 'completed' ? 0.88 : 1}
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
              <Ionicons name="navigate" size={12} color={BRAND.textMuted} />
              <Text style={styles.metaChipText}>{distKm.toFixed(1)} km</Text>
            </View>
          )}
          {item.duration_mins ? (
            <View style={styles.metaChip}>
              <Ionicons name="time-outline" size={12} color={BRAND.textMuted} />
              <Text style={styles.metaChipText}>{Math.round(Number(item.duration_mins))} min</Text>
            </View>
          ) : null}
          {item.category && (
            <View style={styles.metaChip}>
              <Ionicons name="car-sport" size={12} color={BRAND.textMuted} />
              <Text style={styles.metaChipText}>{item.category}</Text>
            </View>
          )}
          {item.payment_method && (
            <View style={styles.metaChip}>
              <Ionicons name={item.payment_method?.toLowerCase()?.includes('cash') ? 'cash-outline' : 'card'} size={12} color={BRAND.textMuted} />
              <Text style={styles.metaChipText}>{item.payment_method}</Text>
            </View>
          )}
          {item.rider_rating != null && Number(item.rider_rating) > 0 && (
            <View style={[styles.metaChip, { backgroundColor: 'rgba(245,158,11,0.14)' }]}>
              <Ionicons name="star" size={12} color={BRAND.warning} />
              <Text style={[styles.metaChipText, { color: BRAND.warning }]}>{Number(item.rider_rating).toFixed(1)}</Text>
            </View>
          )}
        </View>

        {/* CTA for active trips */}
        {active && (
          <TouchableOpacity
            style={styles.manageTripBtn}
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              router.push('/(driver-tabs)/driver-home' as any);
            }}
            activeOpacity={0.88}
          >
            <Ionicons name="navigate" size={15} color="#FFF" />
            <Text style={styles.manageTripBtnText}>Manage trip</Text>
          </TouchableOpacity>
        )}

        {/* Action buttons for completed trips */}
        {status === 'completed' && (
          <>
            <View style={styles.completedActions}>
              <TouchableOpacity
                style={styles.completedActionBtn}
                onPress={(e) => {
                  e.stopPropagation?.();
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push({ pathname: '/driver/trip-detail', params: { tripId: item.id } } as any);
                }}
                activeOpacity={0.85}
              >
                <Ionicons name="receipt-outline" size={14} color={BRAND.accentBlue} />
                <Text style={[styles.completedActionTxt, { color: BRAND.accentBlue }]}>Earnings</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.completedActionBtn}
                onPress={(e) => {
                  e.stopPropagation?.();
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  const drop = item.dropoff_location;
                  if (drop?.lat && drop?.lng) {
                    const { promptExternalNavigation } = require('@/src/utils/openExternalNavigation');
                    promptExternalNavigation({ lat: Number(drop.lat), lng: Number(drop.lng), label: drop.address || 'Destination' });
                  }
                }}
                activeOpacity={0.85}
              >
                <Ionicons name="navigate-outline" size={14} color={BRAND.primary} />
                <Text style={[styles.completedActionTxt, { color: BRAND.primary }]}>Navigate</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.completedActionBtn}
                onPress={(e) => {
                  e.stopPropagation?.();
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push({ pathname: '/shield-disputes', params: { tripId: item.id, mode: 'report' } } as any);
                }}
                activeOpacity={0.85}
              >
                <Ionicons name="shield-outline" size={14} color={BRAND.danger} />
                <Text style={[styles.completedActionTxt, { color: BRAND.danger }]}>Report</Text>
              </TouchableOpacity>
            </View>
          </>
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
          onPress={() =>
            router.push({
              pathname: '/(driver-tabs)/driver-home',
              ...(currentTrip?.id ? { params: { tripId: currentTrip.id } } : {}),
            } as any)
          }
          activeOpacity={0.9}
        >
          <LinearGradient colors={['#1E3A5F', '#2563EB']} style={[styles.activeTripGrad, { padding: flow.cardPad }]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <PulsingLiveDot />
            <View style={{ flex: 1, marginLeft: SPACING.sm }}>
              <Text style={styles.activeTripTitle}>Active Trip in Progress</Text>
              <Text style={styles.activeTripSub}>
                {statusLabel(currentTrip.status)} · {CURRENCY}{Number((currentTrip as any)?.fare || 0).toLocaleString()}
              </Text>
            </View>
            <View style={styles.activeTripArrow}>
              <Ionicons name="arrow-forward" size={18} color="#FFF" />
            </View>
          </LinearGradient>
        </TouchableOpacity>
      )}

      {/* Stats strip */}
      <View style={[styles.statsStrip, { padding: flow.cardPad }]}>
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
          <Text style={styles.statValue}>{CURRENCY}{formatEarnings(stats.earnings)}</Text>
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
            : tab.key === 'active' ? trips.filter(t => isActive(String(t.status ?? ''))).length
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
          <Ionicons name="car-outline" size={44} color={BRAND.accentBlue} />
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
            <Ionicons name="power" size={18} color="#FFF" />
            <Text style={styles.goOnlineBtnText}>Go to Driver Home</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: screenBg }]} edges={['top']}>
      <TabBrandStrip role="driver" />
      {/* Header */}
      <View style={[styles.header, { paddingHorizontal: flow.padH, backgroundColor: cardBg, borderBottomColor: border }]}>
        <View>
          <Text style={[styles.headerTitle, { color: textPrimary }]}>My trips</Text>
          <Text style={[styles.headerSubtitle, { color: textMuted }]}>
            {trips.length > 0 ? `${stats.completed} completed · ${stats.total} total` : 'Your trip history'}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.operationsBtn}
          onPress={() =>
            router.push({
              pathname: '/(driver-tabs)/driver-home',
              ...(currentTrip?.id ? { params: { tripId: currentTrip.id } } : {}),
            } as any)
          }
          activeOpacity={0.88}
        >
          <Ionicons name="radio" size={16} color={BRAND.accentBlue} />
          <Text style={styles.operationsBtnText}>Operations</Text>
        </TouchableOpacity>
      </View>

      {error && !data?.length ? (
        <View style={{ paddingHorizontal: flow.padH, paddingTop: flow.sectionGap }}>
          <InlineError message="Could not load trips." onRetry={retry} />
        </View>
      ) : null}

      {error && !!data?.length ? (
        <View style={[styles.errorBanner, { paddingHorizontal: flow.padH }]}>
          <Ionicons name="alert-circle-outline" size={16} color={BRAND.danger} />
          <Text style={styles.errorText}>Could not refresh — showing last saved trips.</Text>
          <TouchableOpacity onPress={() => void retry()}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {loading && !data?.length && !refreshing ? (
        <View style={{ paddingHorizontal: flow.padH, paddingTop: flow.sectionGap }}>
          {[0, 1, 2, 3].map(i => <TripCardSkeleton key={i} />)}
        </View>
      ) : (
        <FlatList
          data={filteredTrips}
          renderItem={renderTripCard}
          keyExtractor={(item, index) => String(item.id || item._id || item.created_at || `trip-${index}`)}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={[
            styles.listContent,
            { paddingHorizontal: flow.padH, paddingTop: flow.sectionGap, paddingBottom: tabPad },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={BRAND.primary}
              colors={[BRAND.primary]}
            />
          }
          ItemSeparatorComponent={() => <View style={{ height: Math.max(10, Math.round(flow.sectionGap * 0.5)) }} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BRAND.bgDeep },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
    backgroundColor: SURFACE.cardDark,
    borderBottomWidth: 1,
    borderBottomColor: SURFACE.hairline,
  },
  headerTitle: { fontSize: 20, fontWeight: '900', color: BRAND.textPrimary },
  headerSubtitle: { fontSize: 11, color: BRAND.textSecondary, fontWeight: '500', marginTop: 2 },
  operationsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: BRAND.primaryMuted,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: SURFACE.glassBorder,
  },
  operationsBtnText: { fontSize: 13, fontWeight: '700', color: BRAND.primary },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: 'rgba(239,68,68,0.12)',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(239,68,68,0.25)',
  },
  errorText: { flex: 1, fontSize: 13, color: BRAND.danger, fontWeight: '600' },
  retryText: { fontSize: 13, color: BRAND.primary, fontWeight: '700' },
  loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.md },
  loadingText: { fontSize: 13, color: BRAND.textSecondary },
  listContent: { flexGrow: 1 },
  activeTripBanner: {
    marginBottom: SPACING.md,
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
  },
  activeTripGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  activeTripTitle: { fontSize: 15, fontWeight: '800', color: BRAND.textPrimary },
  activeTripSub: { fontSize: 11, color: BRAND.textSecondary, marginTop: 2 },
  activeTripArrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: SURFACE.tile,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsStrip: {
    flexDirection: 'row',
    backgroundColor: SURFACE.cardDark,
    borderRadius: RADIUS.xl,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SURFACE.hairline,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 17, fontWeight: '900', color: BRAND.textPrimary },
  statLabel: { fontSize: 10, color: BRAND.textSecondary, fontWeight: '600', marginTop: 2, textAlign: 'center' },
  statDivider: { width: 1, backgroundColor: SURFACE.hairline, marginVertical: 4 },
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
    borderRadius: RADIUS.full,
    backgroundColor: SURFACE.cardDark,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SURFACE.hairline,
  },
  filterTabActive: {
    backgroundColor: BRAND.primary,
    borderColor: BRAND.primary,
  },
  filterTabText: { fontSize: 12, fontWeight: '700', color: BRAND.textSecondary },
  filterTabTextActive: { color: BRAND.textInverse },
  filterCount: {
    backgroundColor: SURFACE.tile,
    borderRadius: RADIUS.full,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  filterCountActive: { backgroundColor: 'rgba(13,20,32,0.25)' },
  filterCountText: { fontSize: 10, fontWeight: '800', color: BRAND.textSecondary },
  filterCountTextActive: { color: BRAND.textInverse },
  tripCard: {
    backgroundColor: SURFACE.cardDark,
    borderRadius: RADIUS.xl,
    padding: SPACING.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SURFACE.hairline,
    marginTop: SPACING.sm,
  },
  tripCardActive: {
    borderColor: SURFACE.glassBorder,
    borderWidth: 1.5,
    backgroundColor: SURFACE.cardElevated,
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
    borderRadius: RADIUS.full,
  },
  statusText: { fontSize: 12, fontWeight: '700' },
  liveLabel: {
    backgroundColor: BRAND.danger,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
  },
  liveLabelText: { fontSize: 9, fontWeight: '900', color: BRAND.textPrimary, letterSpacing: 0.5 },
  fareText: { fontSize: 17, fontWeight: '900', color: BRAND.primary },
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
    backgroundColor: BRAND.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  riderName: { flex: 1, fontSize: 13, fontWeight: '700', color: BRAND.textPrimary },
  dateText: { fontSize: 11, color: BRAND.textSecondary, fontWeight: '500' },
  routeWrap: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: SURFACE.hairline,
  },
  routeLineColumn: { alignItems: 'center', paddingTop: 4, width: 12 },
  routeDot: { width: 8, height: 8, borderRadius: 4 },
  routeConnector: {
    width: 1.5,
    flex: 1,
    backgroundColor: SURFACE.hairline,
    marginVertical: 3,
    minHeight: 16,
  },
  routeLabel: { fontSize: 10, fontWeight: '700', color: BRAND.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  routeAddress: { fontSize: 13, fontWeight: '600', color: BRAND.textPrimary, marginTop: 1 },
  metaRow: {
    flexDirection: 'row',
    gap: SPACING.xs,
    flexWrap: 'wrap',
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: SURFACE.hairline,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: SURFACE.tile,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
  },
  metaChipText: { fontSize: 11, fontWeight: '600', color: BRAND.textSecondary },
  manageTripBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    backgroundColor: BRAND.primary,
    padding: SPACING.sm,
    borderRadius: RADIUS.lg,
    marginTop: SPACING.sm,
  },
  manageTripBtnText: { fontSize: 13, fontWeight: '800', color: BRAND.textInverse },
  completedActions: {
    flexDirection: 'row', gap: SPACING.xs, marginTop: SPACING.xs,
    paddingTop: SPACING.xs, borderTopWidth: 1, borderTopColor: SURFACE.hairline,
  },
  completedActionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingVertical: 8, borderRadius: RADIUS.lg,
    backgroundColor: SURFACE.tile, borderWidth: 1, borderColor: SURFACE.hairline,
  },
  completedActionTxt: { fontSize: 12, fontWeight: '800' },
  emptyState: { alignItems: 'center', paddingVertical: 48, gap: SPACING.md, paddingHorizontal: SPACING.xl },
  emptyIconWrap: {
    width: 96, height: 96, borderRadius: 48,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: BRAND.textPrimary, textAlign: 'center' },
  emptySubtitle: {
    fontSize: 13, color: BRAND.textSecondary,
    textAlign: 'center', lineHeight: 22,
  },
  goOnlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: BRAND.primary,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.xl,
    marginTop: SPACING.sm,
  },
  goOnlineBtnText: { fontSize: 15, fontWeight: '700', color: BRAND.textInverse },
});

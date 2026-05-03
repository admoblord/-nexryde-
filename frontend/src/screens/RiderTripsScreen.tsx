import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
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
import { useAppStore } from '@/src/store/appStore';
import { getUserTrips } from '@/src/services/api';
import { isActiveTripStatus, normalizeTripStatus } from '@/src/utils/tripStatus';

type TripTab = 'upcoming' | 'completed' | 'cancelled';

export default function RiderTripsScreen() {
  const router = useRouter();
  const { user } = useAppStore();
  const [activeTab, setActiveTab] = useState<TripTab>('upcoming');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const tabPad = useTabBottomPad(16);
  const [trips, setTrips] = useState<any[]>([]);

  const loadTrips = useCallback(async () => {
    if (!user?.id) {
      setTrips([]);
      setLoading(false);
      return;
    }
    try {
      const res = await getUserTrips(user.id, 'rider');
      setTrips(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      if (__DEV__) console.warn('Failed to load rider trips:', e);
      setTrips([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadTrips();
  }, [loadTrips]);

  const segmented = useMemo(() => {
    const upcoming = trips.filter((t) => isActiveTripStatus(t.status, t.payment_status));
    const completed = trips.filter((t) => normalizeTripStatus(t.status, t.payment_status) === 'completed');
    const cancelled = trips.filter((t) => normalizeTripStatus(t.status, t.payment_status) === 'cancelled');
    return { upcoming, completed, cancelled };
  }, [trips]);

  const visibleTrips = segmented[activeTab];

  const formatDate = (raw?: string) => {
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
    return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: diffDays > 365 ? 'numeric' : undefined });
  };

  const getAddress = (point: any) => {
    if (!point) return 'Unknown location';
    if (typeof point === 'string') return point;
    return point.address || `${point.lat ?? ''}, ${point.lng ?? ''}`;
  };

  const renderTripCard = (trip: any) => {
    const pickup = getAddress(trip.pickup_location);
    const dropoff = getAddress(trip.dropoff_location);
    const fare = Number(trip.fare || 0);
    const driverLabel = trip.driver_name || trip.driver_id || 'Driver pending';
    const rating = trip.driver_rating || trip.rider_rating || 0;
    const distKm = Number(trip.distance_km || 0);
    const durationMins = Number(trip.duration_mins || trip.duration_min || 0);

    return (
      <View key={trip.id} style={styles.tripCard}>
        <View style={styles.tripHeader}>
          <Text style={styles.tripDate}>{formatDate(trip.created_at || trip.accepted_at || trip.completed_at)}</Text>
          <Text style={styles.tripFare}>{CURRENCY}{fare.toLocaleString()}</Text>
        </View>

        <View style={styles.tripRoute}>
          <View style={styles.routePoint}>
            <View style={[styles.dot, { backgroundColor: COLORS.success }]} />
            <Text style={styles.routeText} numberOfLines={1}>{pickup}</Text>
          </View>
          <View style={styles.routeLine} />
          <View style={styles.routePoint}>
            <View style={[styles.dot, { backgroundColor: COLORS.error }]} />
            <Text style={styles.routeText} numberOfLines={1}>{dropoff}</Text>
          </View>
        </View>

        {/* Trip meta row: driver + distance/time */}
        <View style={styles.tripMeta}>
          <Text style={styles.driverName}>{driverLabel}</Text>
          <View style={styles.tripMetaRight}>
            {distKm > 0 && (
              <View style={styles.metaPill}>
                <Ionicons name="navigate-outline" size={11} color={COLORS.gray500} />
                <Text style={styles.metaPillText}>{distKm.toFixed(1)} km</Text>
              </View>
            )}
            {durationMins > 0 && (
              <View style={styles.metaPill}>
                <Ionicons name="time-outline" size={11} color={COLORS.gray500} />
                <Text style={styles.metaPillText}>{durationMins} min</Text>
              </View>
            )}
            {activeTab === 'completed' && rating > 0 && (
              <View style={styles.ratingBadge}>
                <Ionicons name="star" size={13} color={COLORS.accent} />
                <Text style={styles.ratingText}>{Number(rating).toFixed(1)}</Text>
              </View>
            )}
          </View>
        </View>

        {activeTab === 'completed' ? (
          <View style={styles.tripActions}>
            {/* Book Again — top priority action */}
            <TouchableOpacity
              style={styles.bookAgainButton}
              onPress={() =>
                router.push({
                  pathname: '/rider/book',
                  params: {
                    pickup: typeof trip.pickup_location === 'string'
                      ? trip.pickup_location
                      : trip.pickup_location?.address || '',
                    dropoff: typeof trip.dropoff_location === 'string'
                      ? trip.dropoff_location
                      : trip.dropoff_location?.address || '',
                  },
                } as any)
              }
            >
              <Ionicons name="refresh-circle" size={16} color="#FFF" />
              <Text style={styles.bookAgainText}>Book Again</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.receiptButton}
              onPress={() => router.push({ pathname: '/rider/trip-receipt', params: { tripId: trip.id } })}
            >
              <Ionicons name="receipt-outline" size={16} color={COLORS.accentBlue} />
              <Text style={styles.receiptButtonText}>Receipt</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.reportButton}
              onPress={() => router.push({ pathname: '/shield-disputes', params: { tripId: trip.id, mode: 'report' } } as any)}
            >
              <Ionicons name="shield-outline" size={16} color={COLORS.error} />
              <Text style={styles.reportButtonText}>Issue</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={COLORS.gray800} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Trips</Text>
        <TouchableOpacity
          style={styles.shieldBtn}
          onPress={() => router.push('/shield-disputes' as any)}
          accessibilityLabel="Nexryde Shield"
        >
          <Ionicons name="shield-checkmark-outline" size={22} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.tabsContainer}>
        {(['upcoming', 'completed', 'cancelled'] as TripTab[]).map((tab) => (
          <TouchableOpacity key={tab} style={[styles.tab, activeTab === tab && styles.tabActive]} onPress={() => setActiveTab(tab)}>
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)} ({segmented[tab].length})
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading trips...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: tabPad }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadTrips(); }} />}
        >
          {visibleTrips.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={64} color={COLORS.gray300} />
              <Text style={styles.emptyTitle}>No {activeTab} trips</Text>
              <Text style={styles.emptySubtext}>Your real trip activity will appear here</Text>
              {activeTab === 'upcoming' ? (
                <TouchableOpacity style={styles.bookButton} onPress={() => router.push('/rider/book')}>
                  <Text style={styles.bookButtonText}>Book a Ride</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : (
            visibleTrips.map(renderTripCard)
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.gray50 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray100,
  },
  backButton: { padding: SPACING.sm },
  headerTitle: { fontSize: FONT_SIZE.lg, fontWeight: '800', color: COLORS.gray800 },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  tab: { flex: 1, paddingVertical: SPACING.sm, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: COLORS.primary },
  tabText: { fontSize: FONT_SIZE.xs, fontWeight: '600', color: COLORS.gray500 },
  tabTextActive: { color: COLORS.primary, fontWeight: '800' },
  content: { padding: SPACING.lg, paddingBottom: SPACING.lg }, // paddingBottom overridden inline with tabPad
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: SPACING.sm, color: COLORS.gray500, fontWeight: '600' },
  emptyState: { alignItems: 'center', paddingVertical: SPACING.xxl },
  emptyTitle: { fontSize: FONT_SIZE.lg, fontWeight: '800', color: COLORS.gray600, marginTop: SPACING.md },
  emptySubtext: { fontSize: FONT_SIZE.sm, color: COLORS.gray400, marginTop: SPACING.xs },
  bookButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.xl,
    marginTop: SPACING.lg,
  },
  bookButtonText: { fontSize: FONT_SIZE.md, fontWeight: '700', color: COLORS.white },
  tripCard: {
    backgroundColor: COLORS.white,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.md,
    ...SHADOWS.sm,
  },
  tripHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
  tripDate: { fontSize: FONT_SIZE.sm, fontWeight: '600', color: COLORS.gray500 },
  tripFare: { fontSize: FONT_SIZE.md, fontWeight: '800', color: COLORS.gray800 },
  tripRoute: { marginVertical: SPACING.sm },
  routePoint: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: SPACING.sm },
  routeText: { flex: 1, fontSize: FONT_SIZE.sm, fontWeight: '600', color: COLORS.gray700 },
  routeLine: { width: 2, height: 20, backgroundColor: COLORS.gray200, marginLeft: 4, marginVertical: 2 },
  tripMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray100,
    gap: SPACING.xs,
  },
  tripMetaRight: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: COLORS.gray50,
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: COLORS.gray100,
  },
  metaPillText: { fontSize: 10, fontWeight: '700', color: COLORS.gray500 },
  driverName: { flex: 1, fontSize: FONT_SIZE.sm, fontWeight: '600', color: COLORS.gray600 },
  ratingBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#FEF9C3', borderRadius: BORDER_RADIUS.full, paddingHorizontal: 7, paddingVertical: 3 },
  ratingText: { fontSize: FONT_SIZE.xs, fontWeight: '800', color: '#92400E' },
  shieldBtn: { padding: SPACING.xs },
  tripActions: {
    flexDirection: 'row',
    gap: SPACING.xs,
    marginTop: SPACING.sm,
  },
  bookAgainButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.success,
  },
  bookAgainText: { color: '#FFF', fontWeight: '800', fontSize: FONT_SIZE.sm },
  receiptButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.accentBlueSoft,
  },
  receiptButtonText: { color: COLORS.accentBlue, fontWeight: '700', fontSize: FONT_SIZE.sm },
  reportButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.sm,
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.2)',
  },
  reportButtonText: { color: COLORS.error, fontWeight: '700', fontSize: FONT_SIZE.sm },
});

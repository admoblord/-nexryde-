import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '@/src/store/appStore';
import { BACKEND_URL, getAuthHeaders } from '@/src/services/api';
import { useRouter } from 'expo-router';
import { isActiveTripStatus, normalizeTripStatus } from '@/src/utils/tripStatus';

type Trip = {
  id: string;
  status: string;
  pickup_address?: string;
  dropoff_address?: string;
  fare?: number;
  offered_fare?: number;
  created_at?: string;
  rider_name?: string;
  service_type?: string;
  pickup_location?: { address?: string } | string;
  dropoff_location?: { address?: string } | string;
};

export default function DriverTripsScreen() {
  const getAddress = (value?: { address?: string } | string, fallback = '') => {
    if (!value) return fallback;
    if (typeof value === 'string') return value;
    return value.address || fallback;
  };

  const router = useRouter();
  const { user } = useAppStore();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<'active' | 'completed'>('active');

  const fetchTrips = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/trips/user/${user.id}?role=driver`, {
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (Array.isArray(data)) setTrips(data);
      else if (Array.isArray(data?.trips)) setTrips(data.trips);
    } catch { /* keep current */ }
    finally { setLoading(false); setRefreshing(false); }
  }, [user?.id]);

  useEffect(() => { fetchTrips(); }, [fetchTrips]);

  const activeTrips = trips.filter((t) => isActiveTripStatus(t.status, (t as any).payment_status));
  const completedTrips = trips.filter((t) => ['completed', 'cancelled'].includes(normalizeTripStatus(t.status, (t as any).payment_status)));
  const displayed = tab === 'active' ? activeTrips : completedTrips;

  const statusColor = (s: string) => {
    if (s === 'completed') return '#10B981';
    if (s === 'cancelled') return '#EF4444';
    if (['accepted', 'arrived', 'ongoing', 'started'].includes(s)) return '#3B82F6';
    return '#F59E0B';
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Trips</Text>
        <Text style={styles.headerSubtext}>{trips.length} total trips</Text>
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity style={[styles.tab, tab === 'active' && styles.tabActive]} onPress={() => setTab('active')}>
          <Text style={[styles.tabText, tab === 'active' && styles.tabTextActive]}>Active ({activeTrips.length})</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, tab === 'completed' && styles.tabActive]} onPress={() => setTab('completed')}>
          <Text style={[styles.tabText, tab === 'completed' && styles.tabTextActive]}>History ({completedTrips.length})</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchTrips(); }} tintColor={COLORS.primary} />}
      >
        {displayed.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name={tab === 'active' ? 'car-outline' : 'time-outline'} size={48} color={COLORS.gray400} />
            </View>
            <Text style={styles.emptyTitle}>{tab === 'active' ? 'No active trips' : 'No trip history yet'}</Text>
            <Text style={styles.emptyText}>{tab === 'active' ? 'Go online from the home screen to receive ride requests' : 'Completed trips will appear here'}</Text>
          </View>
        ) : (
          displayed.map((trip) => (
            <View key={trip.id} style={styles.tripCard}>
              <View style={styles.tripTop}>
                <View style={[styles.statusBadge, { backgroundColor: statusColor(normalizeTripStatus(trip.status, (trip as any).payment_status)) + '20' }]}>
                  <View style={[styles.statusDot, { backgroundColor: statusColor(normalizeTripStatus(trip.status, (trip as any).payment_status)) }]} />
                  <Text style={[styles.statusText, { color: statusColor(normalizeTripStatus(trip.status, (trip as any).payment_status)) }]}>
                    {normalizeTripStatus(trip.status, (trip as any).payment_status).toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.tripFare}>₦{(trip.fare || trip.offered_fare || 0).toLocaleString()}</Text>
              </View>

              <View style={styles.routeInfo}>
                <View style={styles.routeRow}>
                  <View style={[styles.routeDot, { backgroundColor: '#22E180' }]} />
                  <Text style={styles.routeAddress} numberOfLines={1}>
                    {trip.pickup_address || getAddress(trip.pickup_location, 'Pickup')}
                  </Text>
                </View>
                <View style={styles.routeLine} />
                <View style={styles.routeRow}>
                  <View style={[styles.routeDot, { backgroundColor: '#EF4444' }]} />
                  <Text style={styles.routeAddress} numberOfLines={1}>
                    {trip.dropoff_address || getAddress(trip.dropoff_location, 'Destination')}
                  </Text>
                </View>
              </View>

              <View style={styles.tripMeta}>
                <Text style={styles.metaText}>{trip.service_type || 'Standard'}</Text>
                {trip.created_at && (
                  <Text style={styles.metaText}>{new Date(trip.created_at).toLocaleDateString()}</Text>
                )}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerTitle: { fontSize: 24, fontWeight: '900', color: '#FFF', letterSpacing: -0.5 },
  headerSubtext: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.7)', marginTop: 4 },
  tabs: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 16,
    backgroundColor: '#E2E8F0',
    borderRadius: 12,
    padding: 3,
  },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  tabActive: { backgroundColor: '#FFF', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  tabText: { fontSize: 14, fontWeight: '700', color: '#64748B' },
  tabTextActive: { color: '#0F172A' },
  content: { padding: 20, paddingBottom: 40 },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyIcon: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A', marginBottom: 8 },
  emptyText: { fontSize: 14, fontWeight: '600', color: '#64748B', textAlign: 'center', paddingHorizontal: 40 },
  tripCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  tripTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  tripFare: { fontSize: 18, fontWeight: '900', color: '#0F172A' },
  routeInfo: { marginBottom: 12 },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  routeDot: { width: 10, height: 10, borderRadius: 5 },
  routeLine: { width: 2, height: 16, backgroundColor: '#E2E8F0', marginLeft: 4, marginVertical: 2 },
  routeAddress: { flex: 1, fontSize: 14, fontWeight: '600', color: '#334155' },
  tripMeta: { flexDirection: 'row', justifyContent: 'space-between' },
  metaText: { fontSize: 12, fontWeight: '600', color: '#94A3B8' },
});

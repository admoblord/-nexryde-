import React, { useState, useEffect } from 'react';
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
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING } from '@/src/constants/theme';
import { BACKEND_URL } from '@/src/services/api';

interface FleetDriver {
  driver_id: string;
  name: string;
  vehicle: string;
  lat: number;
  lng: number;
  status: string;
  trips_today: number;
}

export default function FleetTrackerScreen() {
  const router = useRouter();
  const [fleet, setFleet] = useState<FleetDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchFleet();
    const interval = setInterval(fetchFleet, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchFleet = async () => {
    try {
      let lat = 6.5244, lng = 3.3792;
      try {
        const Location = require('expo-location');
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          lat = loc.coords.latitude;
          lng = loc.coords.longitude;
        }
      } catch { /* use default */ }
      const res = await fetch(`${BACKEND_URL}/api/driver/fleet/nearby?lat=${lat}&lng=${lng}&radius_km=5`);
      const data = await res.json();
      if (data.success) {
        setFleet(data.fleet || []);
      }
    } catch (e) {
      console.error('Fleet error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchFleet();
  };

  const getStatusColor = (status: string) => {
    if (status === 'available') return COLORS.accentGreen;
    if (status === 'on_trip') return COLORS.accentBlue;
    return '#94A3B8';
  };

  const getStatusLabel = (status: string) => {
    if (status === 'available') return 'Available';
    if (status === 'on_trip') return 'On Trip';
    return 'Offline';
  };

  const totalOnTrip = fleet.filter((d) => d.status === 'on_trip').length;
  const totalAvailable = fleet.filter((d) => d.status === 'available').length;
  const totalTrips = fleet.reduce((sum, d) => sum + (d.trips_today || 0), 0);

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient colors={['#0E7490', '#064E3B']} style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Fleet Tracker</Text>
        <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh}>
          <Ionicons name="refresh" size={22} color="#FFF" />
        </TouchableOpacity>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Fleet Summary */}
        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, { backgroundColor: '#EFF6FF' }]}>
            <Ionicons name="people" size={24} color="#2563EB" />
            <Text style={styles.summaryNum}>{fleet.length}</Text>
            <Text style={styles.summaryLabel}>Total</Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: '#F0FDF4' }]}>
            <Ionicons name="checkmark-circle" size={24} color={COLORS.accentGreen} />
            <Text style={styles.summaryNum}>{totalAvailable}</Text>
            <Text style={styles.summaryLabel}>Available</Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: '#FEF3C7' }]}>
            <Ionicons name="car" size={24} color="#D97706" />
            <Text style={styles.summaryNum}>{totalOnTrip}</Text>
            <Text style={styles.summaryLabel}>On Trip</Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: '#F5F3FF' }]}>
            <Ionicons name="trending-up" size={24} color="#7C3AED" />
            <Text style={styles.summaryNum}>{totalTrips}</Text>
            <Text style={styles.summaryLabel}>Trips</Text>
          </View>
        </View>

        {/* Live Map Placeholder */}
        <View style={styles.mapPlaceholder}>
          <LinearGradient colors={['#E0F2FE', '#DBEAFE']} style={styles.mapGradient}>
            <Ionicons name="map" size={48} color="#2563EB" />
            <Text style={styles.mapText}>Live Fleet Map</Text>
            <Text style={styles.mapSubtext}>{fleet.length} drivers within 5km radius</Text>
          </LinearGradient>
        </View>

        {/* Fleet Drivers List */}
        <Text style={styles.sectionTitle}>Nearby Drivers</Text>

        {loading ? (
          <ActivityIndicator size="large" color={COLORS.accentBlue} style={{ marginTop: 30 }} />
        ) : (
          fleet.map((driver, i) => (
            <View key={driver.driver_id || i} style={styles.driverCard}>
              <View style={[styles.statusDot, { backgroundColor: getStatusColor(driver.status) }]} />
              <View style={styles.driverInfo}>
                <Text style={styles.driverName}>{driver.name}</Text>
                <Text style={styles.driverVehicle}>{driver.vehicle}</Text>
                <View style={styles.driverMeta}>
                  <View style={styles.metaItem}>
                    <Ionicons name="navigate" size={14} color="#94A3B8" />
                    <Text style={styles.metaText}>{driver.distance_km ? `${driver.distance_km.toFixed(1)}km away` : 'Nearby'}</Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Ionicons name="car" size={14} color="#94A3B8" />
                    <Text style={styles.metaText}>{driver.trips_today} trips today</Text>
                  </View>
                </View>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: getStatusColor(driver.status) + '20' }]}>
                <Text style={[styles.statusText, { color: getStatusColor(driver.status) }]}>
                  {getStatusLabel(driver.status)}
                </Text>
              </View>
            </View>
          ))
        )}
        <View style={{ height: 80 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.xl,
    borderBottomLeftRadius: 24, borderBottomRightRadius: 24,
  },
  backButton: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 20, fontWeight: '900', color: '#FFF' },
  refreshBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center',
  },
  content: { padding: SPACING.lg },
  summaryRow: { flexDirection: 'row', gap: 8, marginBottom: SPACING.lg },
  summaryCard: {
    flex: 1, borderRadius: 16, padding: 12, alignItems: 'center',
  },
  summaryNum: { fontSize: 22, fontWeight: '900', color: '#0F172A', marginTop: 4 },
  summaryLabel: { fontSize: 11, fontWeight: '700', color: '#64748B', marginTop: 2 },
  mapPlaceholder: { borderRadius: 20, overflow: 'hidden', marginBottom: SPACING.lg },
  mapGradient: { padding: 40, alignItems: 'center' },
  mapText: { fontSize: 18, fontWeight: '900', color: '#1E40AF', marginTop: 8 },
  mapSubtext: { fontSize: 13, color: '#3B82F6', marginTop: 4 },
  sectionTitle: { fontSize: 18, fontWeight: '900', color: '#0F172A', marginBottom: SPACING.md },
  driverCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFF', borderRadius: 16, padding: SPACING.md, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  statusDot: { width: 12, height: 12, borderRadius: 6, marginRight: SPACING.md },
  driverInfo: { flex: 1 },
  driverName: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  driverVehicle: { fontSize: 13, color: '#64748B', marginTop: 2 },
  driverMeta: { flexDirection: 'row', gap: SPACING.md, marginTop: 6 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, fontWeight: '600', color: '#94A3B8' },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  statusText: { fontSize: 12, fontWeight: '800' },
});

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS, CURRENCY } from '../../src/constants/theme';
import { Card, Badge } from '../../src/components/UI';
import { useAppStore, Trip } from '../../src/store/appStore';
import { getUserTrips } from '../../src/services/api';

export default function TripsScreen() {
  const { user } = useAppStore();
  const router = useRouter();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const isDriver = user?.role === 'driver';

  useEffect(() => {
    loadTrips();
  }, [user?.role]);

  const loadTrips = async () => {
    if (!user?.id) return;
    try {
      const response = await getUserTrips(user.id, user.role);
      setTrips(response.data);
    } catch (error) {
      console.log('Error loading trips:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadTrips();
    setRefreshing(false);
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'success';
      case 'cancelled': return 'error';
      case 'ongoing': return 'info';
      case 'accepted': return 'warning';
      default: return 'default';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-NG', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const renderTrip = ({ item }: { item: Trip }) => (
    <Card style={styles.tripCard}>
      <View style={styles.tripHeader}>
        <Badge text={item.status.toUpperCase()} variant={getStatusColor(item.status)} />
        <Text style={styles.tripFare}>{CURRENCY}{item.fare.toLocaleString()}</Text>
      </View>
      
      <View style={styles.tripRoute}>
        <View style={styles.routePoint}>
          <View style={[styles.routeDot, { backgroundColor: COLORS.primary }]} />
          <View style={styles.routeInfo}>
            <Text style={styles.routeLabel}>Pickup</Text>
            <Text style={styles.routeAddress} numberOfLines={1}>
              {item.pickup_location.address}
            </Text>
          </View>
        </View>
        
        <View style={styles.routeLine} />
        
        <View style={styles.routePoint}>
          <View style={[styles.routeDot, { backgroundColor: COLORS.error }]} />
          <View style={styles.routeInfo}>
            <Text style={styles.routeLabel}>Dropoff</Text>
            <Text style={styles.routeAddress} numberOfLines={1}>
              {item.dropoff_location.address}
            </Text>
          </View>
        </View>
      </View>
      
      <View style={styles.tripFooter}>
        <View style={styles.tripMeta}>
          <Ionicons name="navigate" size={14} color={COLORS.textSecondary} />
          <Text style={styles.tripMetaText}>{item.distance_km} km</Text>
        </View>
        <View style={styles.tripMeta}>
          <Ionicons name="time" size={14} color={COLORS.textSecondary} />
          <Text style={styles.tripMetaText}>{item.duration_mins} mins</Text>
        </View>
        <View style={styles.tripMeta}>
          <Ionicons name="card" size={14} color={COLORS.textSecondary} />
          <Text style={styles.tripMetaText}>{item.payment_method}</Text>
        </View>
      </View>
      
      <Text style={styles.tripDate}>{formatDate(item.created_at)}</Text>
    </Card>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>My Trips</Text>
        <Text style={styles.subtitle}>
          {trips.length} {isDriver ? 'completed rides' : 'trips taken'}
        </Text>
      </View>

      {trips.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="car-outline" size={64} color={COLORS.gray300} />
          <Text style={styles.emptyTitle}>No trips yet</Text>
          <Text style={styles.emptyText}>
            {isDriver 
              ? 'Go online to start accepting ride requests'
              : 'Book your first ride to get started'
            }
          </Text>
        </View>
      ) : (
        <FlatList
          data={trips}
          renderItem={renderTrip}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    padding: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  title: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  subtitle: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  listContent: {
    padding: SPACING.md,
    paddingTop: 0,
  },
  tripCard: {
    marginBottom: SPACING.md,
  },
  tripHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  tripFare: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '700',
    color: COLORS.primary,
  },
  tripRoute: {
    marginBottom: SPACING.md,
  },
  routePoint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  routeDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 4,
  },
  routeInfo: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  routeLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  routeAddress: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textPrimary,
    fontWeight: '500',
  },
  routeLine: {
    width: 2,
    height: 20,
    backgroundColor: COLORS.gray200,
    marginLeft: 5,
    marginVertical: SPACING.xs,
  },
  tripFooter: {
    flexDirection: 'row',
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray200,
    gap: SPACING.lg,
  },
  tripMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tripMetaText: {
    marginLeft: SPACING.xs,
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
  tripDate: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textMuted,
    marginTop: SPACING.sm,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
  },
  emptyTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginTop: SPACING.md,
  },
  emptyText: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
});

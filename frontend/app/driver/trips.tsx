import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS, CURRENCY } from '@/src/constants/theme';
import { Card, Badge, Button } from '@/src/components/UI';
import { useAppStore, Trip } from '@/src/store/appStore';
import { getPendingTrips, acceptTrip, startTrip, completeTrip, cancelTrip } from '@/src/services/api';

export default function DriverTripsScreen() {
  const router = useRouter();
  const { user, currentLocation, currentTrip, setCurrentTrip } = useAppStore();
  const [trips, setTrips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    loadPendingTrips();
    const interval = setInterval(loadPendingTrips, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, []);

  const loadPendingTrips = async () => {
    if (!currentLocation) return;
    try {
      const response = await getPendingTrips(
        currentLocation.latitude,
        currentLocation.longitude
      );
      setTrips(response.data);
    } catch (error) {
      console.log('Error loading trips:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadPendingTrips();
    setRefreshing(false);
  }, []);

  const handleAcceptTrip = async (trip: any) => {
    if (!user?.id) return;
    setActionLoading(trip.id);
    try {
      const response = await acceptTrip(trip.id, user.id);
      setCurrentTrip(response.data);
      Alert.alert('Trip Accepted', 'Navigate to pickup location to start the ride.');
      setTrips(trips.filter(t => t.id !== trip.id));
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to accept trip');
    } finally {
      setActionLoading(null);
    }
  };

  const handleStartTrip = async () => {
    if (!currentTrip?.id) return;
    setActionLoading('start');
    try {
      const response = await startTrip(currentTrip.id);
      setCurrentTrip(response.data);
      Alert.alert('Trip Started', 'Navigate to dropoff location.');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to start trip');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCompleteTrip = async () => {
    if (!currentTrip?.id) return;
    setActionLoading('complete');
    try {
      const response = await completeTrip(currentTrip.id);
      Alert.alert(
        'Trip Completed!', 
        `Collect ${CURRENCY}${currentTrip.fare.toLocaleString()} from the rider.`,
        [{ text: 'OK', onPress: () => setCurrentTrip(null) }]
      );
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to complete trip');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelTrip = async () => {
    if (!currentTrip?.id || !user?.id) return;
    
    Alert.alert(
      'Cancel Trip',
      'Are you sure you want to cancel this trip? This will affect your rating.',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            setActionLoading('cancel');
            try {
              await cancelTrip(currentTrip.id, user.id);
              setCurrentTrip(null);
              Alert.alert('Trip Cancelled');
            } catch (error: any) {
              Alert.alert('Error', error.response?.data?.detail || 'Failed to cancel trip');
            } finally {
              setActionLoading(null);
            }
          }
        }
      ]
    );
  };

  const renderTrip = ({ item }: { item: any }) => (
    <Card style={styles.tripCard}>
      <View style={styles.tripHeader}>
        <View style={styles.distanceBadge}>
          <Ionicons name="navigate" size={16} color={COLORS.primary} />
          <Text style={styles.distanceText}>{item.distance_to_pickup?.toFixed(1)} km away</Text>
        </View>
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
      
      <View style={styles.tripMeta}>
        <View style={styles.metaItem}>
          <Ionicons name="navigate" size={14} color={COLORS.textSecondary} />
          <Text style={styles.metaText}>{item.distance_km} km</Text>
        </View>
        <View style={styles.metaItem}>
          <Ionicons name="time" size={14} color={COLORS.textSecondary} />
          <Text style={styles.metaText}>{item.duration_mins} mins</Text>
        </View>
        <View style={styles.metaItem}>
          <Ionicons name="card" size={14} color={COLORS.textSecondary} />
          <Text style={styles.metaText}>{item.payment_method}</Text>
        </View>
      </View>
      
      <Button
        title={actionLoading === item.id ? 'Accepting...' : 'Accept Trip'}
        onPress={() => handleAcceptTrip(item)}
        loading={actionLoading === item.id}
        style={styles.acceptButton}
      />
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
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Available Rides</Text>
      </View>

      {/* Current Trip */}
      {currentTrip && (
        <Card style={styles.currentTripCard}>
          <View style={styles.currentTripHeader}>
            <Badge 
              text={currentTrip.status.toUpperCase()} 
              variant={currentTrip.status === 'ongoing' ? 'info' : 'warning'} 
            />
            <Text style={styles.currentTripFare}>{CURRENCY}{currentTrip.fare.toLocaleString()}</Text>
          </View>
          
          <View style={styles.tripRoute}>
            <View style={styles.routePoint}>
              <View style={[styles.routeDot, { backgroundColor: COLORS.primary }]} />
              <View style={styles.routeInfo}>
                <Text style={styles.routeLabel}>Pickup</Text>
                <Text style={styles.routeAddress} numberOfLines={1}>
                  {currentTrip.pickup_location.address}
                </Text>
              </View>
            </View>
            <View style={styles.routeLine} />
            <View style={styles.routePoint}>
              <View style={[styles.routeDot, { backgroundColor: COLORS.error }]} />
              <View style={styles.routeInfo}>
                <Text style={styles.routeLabel}>Dropoff</Text>
                <Text style={styles.routeAddress} numberOfLines={1}>
                  {currentTrip.dropoff_location.address}
                </Text>
              </View>
            </View>
          </View>
          
          <View style={styles.currentTripActions}>
            {currentTrip.status === 'accepted' && (
              <Button
                title={actionLoading === 'start' ? 'Starting...' : 'Start Trip'}
                onPress={handleStartTrip}
                loading={actionLoading === 'start'}
                icon="play-circle"
                style={styles.actionButton}
              />
            )}
            {currentTrip.status === 'ongoing' && (
              <Button
                title={actionLoading === 'complete' ? 'Completing...' : 'Complete Trip'}
                onPress={handleCompleteTrip}
                loading={actionLoading === 'complete'}
                icon="checkmark-circle"
                style={styles.actionButton}
              />
            )}
            <Button
              title="Cancel"
              onPress={handleCancelTrip}
              variant="outline"
              loading={actionLoading === 'cancel'}
              style={styles.cancelButton}
            />
          </View>
        </Card>
      )}

      {/* Available Trips */}
      {!currentTrip && (
        <>
          {trips.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="car-outline" size={64} color={COLORS.gray300} />
              <Text style={styles.emptyTitle}>No rides available</Text>
              <Text style={styles.emptyText}>Pull down to refresh or wait for new ride requests</Text>
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
        </>
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
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
    ...SHADOWS.sm,
  },
  title: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  currentTripCard: {
    margin: SPACING.md,
    marginTop: 0,
    backgroundColor: COLORS.primary + '10',
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  currentTripHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  currentTripFare: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '700',
    color: COLORS.primary,
  },
  currentTripActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  actionButton: {
    flex: 1,
  },
  cancelButton: {
    flex: 0.4,
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
  distanceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary + '20',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
  },
  distanceText: {
    marginLeft: SPACING.xs,
    fontSize: FONT_SIZE.sm,
    color: COLORS.primary,
    fontWeight: '600',
  },
  tripFare: {
    fontSize: FONT_SIZE.xxl,
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
  tripMeta: {
    flexDirection: 'row',
    gap: SPACING.lg,
    marginBottom: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray200,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaText: {
    marginLeft: SPACING.xs,
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
  acceptButton: {
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

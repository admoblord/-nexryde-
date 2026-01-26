import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS, CURRENCY } from '../../src/constants/theme';
import { Card, Badge, Button } from '../../src/components/UI';
import { useAppStore } from '../../src/store/appStore';
import { getTrip, cancelTrip, rateTrip } from '../../src/services/api';

export default function TrackingScreen() {
  const router = useRouter();
  const { user, currentTrip, setCurrentTrip } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [rating, setRating] = useState(5);

  useEffect(() => {
    if (!currentTrip) {
      router.replace('/(tabs)/home');
      return;
    }

    // Poll for trip updates
    const interval = setInterval(loadTripStatus, 5000);
    return () => clearInterval(interval);
  }, [currentTrip?.id]);

  const loadTripStatus = async () => {
    if (!currentTrip?.id) return;
    try {
      const response = await getTrip(currentTrip.id);
      setCurrentTrip(response.data);
    } catch (error) {
      console.log('Error loading trip:', error);
    }
  };

  const handleCancelTrip = async () => {
    if (!currentTrip?.id || !user?.id) return;
    
    Alert.alert(
      'Cancel Ride',
      'Are you sure you want to cancel this ride?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              await cancelTrip(currentTrip.id, user.id);
              setCurrentTrip(null);
              router.replace('/(tabs)/home');
            } catch (error: any) {
              Alert.alert('Error', error.response?.data?.detail || 'Failed to cancel');
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleRateTrip = async () => {
    if (!currentTrip?.id || !user?.id) return;
    setLoading(true);
    try {
      await rateTrip(currentTrip.id, user.id, rating);
      Alert.alert('Thank You!', 'Your rating has been submitted.');
      setCurrentTrip(null);
      router.replace('/(tabs)/home');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to submit rating');
    } finally {
      setLoading(false);
    }
  };

  const getStatusInfo = () => {
    switch (currentTrip?.status) {
      case 'pending':
        return {
          title: 'Finding your driver...',
          subtitle: 'Please wait while we match you with a driver',
          color: COLORS.warning,
          icon: 'search' as const,
        };
      case 'accepted':
        return {
          title: 'Driver is on the way!',
          subtitle: 'Your driver is heading to your pickup location',
          color: COLORS.info,
          icon: 'car' as const,
        };
      case 'ongoing':
        return {
          title: 'Trip in progress',
          subtitle: 'Enjoy your ride!',
          color: COLORS.primary,
          icon: 'navigate' as const,
        };
      case 'completed':
        return {
          title: 'Trip completed!',
          subtitle: 'Rate your driver',
          color: COLORS.success,
          icon: 'checkmark-circle' as const,
        };
      default:
        return {
          title: 'Loading...',
          subtitle: '',
          color: COLORS.gray500,
          icon: 'help-circle' as const,
        };
    }
  };

  const statusInfo = getStatusInfo();

  if (!currentTrip) {
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
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>Track Ride</Text>
        </View>

        {/* Status Card */}
        <Card style={[styles.statusCard, { borderLeftColor: statusInfo.color }]}>
          <View style={[styles.statusIcon, { backgroundColor: statusInfo.color + '20' }]}>
            <Ionicons name={statusInfo.icon} size={32} color={statusInfo.color} />
          </View>
          <Text style={styles.statusTitle}>{statusInfo.title}</Text>
          <Text style={styles.statusSubtitle}>{statusInfo.subtitle}</Text>
          
          {currentTrip.status === 'pending' && (
            <ActivityIndicator color={statusInfo.color} style={styles.statusLoader} />
          )}
        </Card>

        {/* Trip Details */}
        <Card style={styles.tripCard}>
          <View style={styles.tripRoute}>
            <View style={styles.routePoint}>
              <View style={[styles.routeDot, { backgroundColor: COLORS.primary }]} />
              <View style={styles.routeInfo}>
                <Text style={styles.routeLabel}>Pickup</Text>
                <Text style={styles.routeAddress}>{currentTrip.pickup_location.address}</Text>
              </View>
            </View>
            <View style={styles.routeLine} />
            <View style={styles.routePoint}>
              <View style={[styles.routeDot, { backgroundColor: COLORS.error }]} />
              <View style={styles.routeInfo}>
                <Text style={styles.routeLabel}>Destination</Text>
                <Text style={styles.routeAddress}>{currentTrip.dropoff_location.address}</Text>
              </View>
            </View>
          </View>

          <View style={styles.tripMeta}>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Distance</Text>
              <Text style={styles.metaValue}>{currentTrip.distance_km} km</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Duration</Text>
              <Text style={styles.metaValue}>{currentTrip.duration_mins} mins</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Fare</Text>
              <Text style={[styles.metaValue, { color: COLORS.primary }]}>
                {CURRENCY}{currentTrip.fare.toLocaleString()}
              </Text>
            </View>
          </View>

          <View style={styles.paymentInfo}>
            <Ionicons 
              name={currentTrip.payment_method === 'cash' ? 'cash' : 'card'} 
              size={20} 
              color={COLORS.textSecondary} 
            />
            <Text style={styles.paymentText}>
              Pay with {currentTrip.payment_method === 'cash' ? 'Cash' : 'Bank Transfer'}
            </Text>
          </View>
        </Card>

        {/* Rating Section (when completed) */}
        {currentTrip.status === 'completed' && (
          <Card style={styles.ratingCard}>
            <Text style={styles.ratingTitle}>How was your ride?</Text>
            <View style={styles.stars}>
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity key={star} onPress={() => setRating(star)}>
                  <Ionicons
                    name={star <= rating ? 'star' : 'star-outline'}
                    size={40}
                    color={star <= rating ? COLORS.accent : COLORS.gray300}
                  />
                </TouchableOpacity>
              ))}
            </View>
            <Button
              title={loading ? 'Submitting...' : 'Submit Rating'}
              onPress={handleRateTrip}
              loading={loading}
              style={styles.ratingButton}
            />
          </Card>
        )}

        {/* Cancel Button (when not completed) */}
        {currentTrip.status !== 'completed' && currentTrip.status !== 'cancelled' && (
          <TouchableOpacity style={styles.cancelButton} onPress={handleCancelTrip}>
            <Ionicons name="close-circle" size={20} color={COLORS.error} />
            <Text style={styles.cancelText}>Cancel Ride</Text>
          </TouchableOpacity>
        )}
      </View>
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
  content: {
    flex: 1,
    padding: SPACING.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.lg,
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
  statusCard: {
    alignItems: 'center',
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderLeftWidth: 4,
  },
  statusIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  statusTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: SPACING.xs,
  },
  statusSubtitle: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  statusLoader: {
    marginTop: SPACING.md,
  },
  tripCard: {
    marginBottom: SPACING.md,
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
    justifyContent: 'space-between',
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray200,
  },
  metaItem: {
    alignItems: 'center',
  },
  metaLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
  },
  metaValue: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: 2,
  },
  paymentInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray200,
  },
  paymentText: {
    marginLeft: SPACING.sm,
    color: COLORS.textSecondary,
  },
  ratingCard: {
    alignItems: 'center',
    padding: SPACING.lg,
  },
  ratingTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: SPACING.md,
  },
  stars: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  ratingButton: {
    width: '100%',
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.md,
    marginTop: 'auto',
  },
  cancelText: {
    marginLeft: SPACING.sm,
    color: COLORS.error,
    fontWeight: '600',
  },
});

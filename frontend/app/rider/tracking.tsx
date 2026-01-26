import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS, CURRENCY } from '@/src/constants/theme';
import { useAppStore } from '@/src/store/appStore';

const { width, height } = Dimensions.get('window');

export default function TrackingScreen() {
  const router = useRouter();
  const { pickupLocation, dropoffLocation } = useAppStore();
  
  const [status, setStatus] = useState<'searching' | 'found' | 'arriving' | 'arrived' | 'trip'>('searching');
  const [eta, setEta] = useState(5);
  
  const driver = {
    name: 'Chukwuemeka Okafor',
    rating: 4.9,
    trips: 2847,
    car: 'Toyota Camry',
    plate: 'LND-234-XY',
    color: 'Silver',
  };

  useEffect(() => {
    // Simulate finding a driver
    const timer1 = setTimeout(() => setStatus('found'), 2000);
    const timer2 = setTimeout(() => setStatus('arriving'), 4000);
    
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, []);

  useEffect(() => {
    if (status === 'arriving' && eta > 0) {
      const interval = setInterval(() => {
        setEta(prev => {
          if (prev <= 1) {
            setStatus('arrived');
            return 0;
          }
          return prev - 1;
        });
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [status]);

  const handleCancel = () => {
    Alert.alert(
      'Cancel Ride',
      'Are you sure you want to cancel this ride?',
      [
        { text: 'No', style: 'cancel' },
        { 
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: () => router.back()
        }
      ]
    );
  };

  const handleStartTrip = () => {
    setStatus('trip');
  };

  const handleCall = () => {
    Alert.alert('Calling Driver', `Calling ${driver.name}...`);
  };

  const handleMessage = () => {
    Alert.alert('Message', 'Opening chat with driver...');
  };

  const handleShareTrip = () => {
    Alert.alert('Share Trip', 'Trip details shared with emergency contacts');
  };

  const renderSearching = () => (
    <View style={styles.searchingContainer}>
      <View style={styles.searchingPulse}>
        <View style={styles.searchingInner}>
          <Ionicons name="car" size={40} color={COLORS.accent} />
        </View>
      </View>
      <Text style={styles.searchingTitle}>Finding Your Driver</Text>
      <Text style={styles.searchingText}>Looking for nearby drivers...</Text>
      
      <View style={styles.searchingDots}>
        <View style={[styles.searchingDot, styles.searchingDotActive]} />
        <View style={styles.searchingDot} />
        <View style={styles.searchingDot} />
      </View>
    </View>
  );

  const renderDriverCard = () => (
    <View style={styles.driverCard}>
      {/* Status Banner */}
      <View style={[
        styles.statusBanner,
        status === 'arrived' && { backgroundColor: COLORS.success }
      ]}>
        <Ionicons 
          name={status === 'arrived' ? 'checkmark-circle' : 'car'} 
          size={18} 
          color={COLORS.white} 
        />
        <Text style={styles.statusBannerText}>
          {status === 'found' && 'Driver Found!'}
          {status === 'arriving' && `Arriving in ${eta} min`}
          {status === 'arrived' && 'Driver has arrived!'}
          {status === 'trip' && 'Trip in progress'}
        </Text>
      </View>

      {/* Driver Info */}
      <View style={styles.driverInfo}>
        <View style={styles.driverAvatar}>
          <Text style={styles.driverAvatarText}>{driver.name.charAt(0)}</Text>
        </View>
        <View style={styles.driverDetails}>
          <Text style={styles.driverName}>{driver.name}</Text>
          <View style={styles.driverRating}>
            <Ionicons name="star" size={14} color={COLORS.accent} />
            <Text style={styles.driverRatingText}>{driver.rating}</Text>
            <Text style={styles.driverTrips}>• {driver.trips} trips</Text>
          </View>
        </View>
        <View style={styles.driverActions}>
          <TouchableOpacity style={styles.driverActionBtn} onPress={handleCall}>
            <Ionicons name="call" size={20} color={COLORS.success} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.driverActionBtn} onPress={handleMessage}>
            <Ionicons name="chatbubble" size={20} color={COLORS.info} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Car Info */}
      <View style={styles.carInfo}>
        <View style={styles.carDetail}>
          <Text style={styles.carLabel}>Vehicle</Text>
          <Text style={styles.carValue}>{driver.car}</Text>
        </View>
        <View style={styles.carDetail}>
          <Text style={styles.carLabel}>Plate</Text>
          <Text style={styles.carValuePlate}>{driver.plate}</Text>
        </View>
        <View style={styles.carDetail}>
          <Text style={styles.carLabel}>Color</Text>
          <View style={styles.carColorWrap}>
            <View style={[styles.carColorDot, { backgroundColor: '#C0C0C0' }]} />
            <Text style={styles.carValue}>{driver.color}</Text>
          </View>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleCancel}>
          <Ionicons name="close" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Your Ride</Text>
        <TouchableOpacity style={styles.shareButton} onPress={handleShareTrip}>
          <Ionicons name="share-social" size={20} color={COLORS.accent} />
        </TouchableOpacity>
      </View>

      {/* Map Placeholder */}
      <View style={styles.mapContainer}>
        <View style={styles.mapPlaceholder}>
          <Ionicons name="map" size={60} color={COLORS.gray300} />
          <Text style={styles.mapPlaceholderText}>Live Map</Text>
        </View>
        
        {/* Route Info Overlay */}
        <View style={styles.routeOverlay}>
          <View style={styles.routePoint}>
            <View style={styles.routePickupDot} />
            <Text style={styles.routeText} numberOfLines={1}>
              {pickupLocation?.address || 'Current Location'}
            </Text>
          </View>
          <View style={styles.routeLineH} />
          <View style={styles.routePoint}>
            <View style={styles.routeDestDot} />
            <Text style={styles.routeText} numberOfLines={1}>
              {dropoffLocation?.address || 'Destination'}
            </Text>
          </View>
        </View>
      </View>

      {/* Bottom Sheet */}
      <View style={styles.bottomSheet}>
        {status === 'searching' ? (
          renderSearching()
        ) : (
          <>
            {renderDriverCard()}
            
            {/* Trip Actions */}
            <View style={styles.tripActions}>
              {status === 'arrived' ? (
                <TouchableOpacity 
                  style={styles.startTripButton}
                  onPress={handleStartTrip}
                >
                  <Text style={styles.startTripText}>I'm in the car</Text>
                  <Ionicons name="arrow-forward" size={20} color={COLORS.primary} />
                </TouchableOpacity>
              ) : status === 'trip' ? (
                <View style={styles.tripInProgress}>
                  <View style={styles.tripProgressInfo}>
                    <Ionicons name="navigate" size={24} color={COLORS.success} />
                    <View style={styles.tripProgressText}>
                      <Text style={styles.tripProgressTitle}>Trip in progress</Text>
                      <Text style={styles.tripProgressSubtext}>Enjoy your ride!</Text>
                    </View>
                  </View>
                  <View style={styles.tripFare}>
                    <Text style={styles.tripFareLabel}>Est. Fare</Text>
                    <Text style={styles.tripFareAmount}>{CURRENCY}2,320</Text>
                  </View>
                </View>
              ) : (
                <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
                  <Text style={styles.cancelButtonText}>Cancel Ride</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Safety Strip */}
            <TouchableOpacity style={styles.safetyStrip} onPress={handleShareTrip}>
              <Ionicons name="shield-checkmark" size={18} color={COLORS.success} />
              <Text style={styles.safetyStripText}>Share trip with emergency contacts</Text>
              <Ionicons name="chevron-forward" size={18} color={COLORS.gray400} />
            </TouchableOpacity>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.white,
  },
  shareButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,215,0,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapContainer: {
    flex: 1,
    margin: SPACING.md,
    borderRadius: BORDER_RADIUS.xxl,
    overflow: 'hidden',
    position: 'relative',
  },
  mapPlaceholder: {
    flex: 1,
    backgroundColor: COLORS.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapPlaceholderText: {
    fontSize: FONT_SIZE.lg,
    color: COLORS.gray400,
    marginTop: SPACING.sm,
  },
  routeOverlay: {
    position: 'absolute',
    top: SPACING.md,
    left: SPACING.md,
    right: SPACING.md,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    ...SHADOWS.md,
  },
  routePoint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  routePickupDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.success,
  },
  routeDestDot: {
    width: 10,
    height: 10,
    borderRadius: 2,
    backgroundColor: COLORS.error,
  },
  routeText: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    color: COLORS.textPrimary,
  },
  routeLineH: {
    width: 2,
    height: 20,
    backgroundColor: COLORS.gray200,
    marginLeft: 4,
    marginVertical: SPACING.xs,
  },
  bottomSheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: BORDER_RADIUS.xxxl,
    borderTopRightRadius: BORDER_RADIUS.xxxl,
    paddingTop: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
    ...SHADOWS.lg,
  },
  // Searching State
  searchingContainer: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
  },
  searchingPulse: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  searchingInner: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchingTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: SPACING.xs,
  },
  searchingText: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
    marginBottom: SPACING.lg,
  },
  searchingDots: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  searchingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.gray200,
  },
  searchingDotActive: {
    backgroundColor: COLORS.accent,
  },
  // Driver Card
  driverCard: {
    backgroundColor: COLORS.gray50,
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
    marginBottom: SPACING.md,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.accent,
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
  },
  statusBannerText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.white,
  },
  driverInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
  },
  driverAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverAvatarText: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '700',
    color: COLORS.accent,
  },
  driverDetails: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  driverName: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  driverRating: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.xs,
  },
  driverRatingText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginLeft: SPACING.xs,
  },
  driverTrips: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    marginLeft: SPACING.sm,
  },
  driverActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  driverActionBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.sm,
  },
  carInfo: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: COLORS.gray200,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
  },
  carDetail: {
    flex: 1,
    alignItems: 'center',
  },
  carLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  carValue: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  carValuePlate: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.primary,
    backgroundColor: COLORS.accentSoft,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.sm,
  },
  carColorWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  carColorDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: COLORS.gray300,
  },
  // Trip Actions
  tripActions: {
    marginBottom: SPACING.md,
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.xl,
    backgroundColor: COLORS.errorSoft,
  },
  cancelButtonText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.error,
  },
  startTripButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.accent,
    paddingVertical: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    gap: SPACING.sm,
    ...SHADOWS.gold,
  },
  startTripText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.primary,
  },
  tripInProgress: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.successSoft,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.xl,
  },
  tripProgressInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  tripProgressText: {},
  tripProgressTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.success,
  },
  tripProgressSubtext: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.success,
    opacity: 0.8,
  },
  tripFare: {
    alignItems: 'flex-end',
  },
  tripFareLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.success,
  },
  tripFareAmount: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.success,
  },
  safetyStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    gap: SPACING.sm,
  },
  safetyStripText: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
});

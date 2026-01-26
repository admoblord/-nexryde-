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
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS, CURRENCY } from '@/src/constants/theme';
import { useAppStore } from '@/src/store/appStore';
import { FallingRoses, RosePetalsStatic, RoseGlow, FloatingRoseBloom } from '@/src/components/FallingRoses';

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

  const pickup = pickupLocation || { latitude: 6.5244, longitude: 3.3792, address: 'Current Location' };
  const dropoff = dropoffLocation || { latitude: 6.4541, longitude: 3.3947, address: 'Destination' };

  // Status progression simulation
  useEffect(() => {
    const timer1 = setTimeout(() => setStatus('found'), 2000);
    const timer2 = setTimeout(() => setStatus('arriving'), 4000);
    return () => { clearTimeout(timer1); clearTimeout(timer2); };
  }, []);

  useEffect(() => {
    if (status === 'arriving' && eta > 0) {
      const interval = setInterval(() => {
        setEta(prev => {
          if (prev <= 1) { setStatus('arrived'); return 0; }
          return prev - 1;
        });
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [status]);

  const handleCancel = () => {
    Alert.alert('Cancel Ride', 'Are you sure you want to cancel?', [
      { text: 'No', style: 'cancel' },
      { text: 'Yes', style: 'destructive', onPress: () => router.back() }
    ]);
  };

  const handleStartTrip = () => setStatus('trip');
  const handleCall = () => Alert.alert('Calling Driver', `Calling ${driver.name}...`);
  const handleMessage = () => Alert.alert('Message', 'Opening chat with driver...');
  const handleShareTrip = () => Alert.alert('Share Trip', 'Trip details shared!');

  const renderSearching = () => (
    <View style={styles.searchingContainer}>
      {/* Pulsing Rose Animation */}
      <View style={styles.searchingPulse}>
        <View style={styles.searchingOuter}>
          <View style={styles.searchingInner}>
            <FloatingRoseBloom />
          </View>
        </View>
      </View>
      <Text style={styles.searchingTitle}>Finding Your Driver</Text>
      <Text style={styles.searchingText}>Matching you with the perfect ride...</Text>
      
      {/* Rose Loading Indicator */}
      <View style={styles.loadingDots}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[styles.loadingPetal, { opacity: 0.4 + i * 0.2 }]} />
        ))}
      </View>
    </View>
  );

  const renderDriverCard = () => (
    <View style={styles.driverCard}>
      <LinearGradient
        colors={[COLORS.surface, COLORS.surfaceLight]}
        style={styles.driverGradient}
      >
        {/* Status Banner */}
        <View style={[styles.statusBanner, 
          status === 'arrived' && { backgroundColor: COLORS.success },
          status === 'trip' && { backgroundColor: COLORS.rosePetal4 }
        ]}>
          <View style={styles.statusPetal} />
          <Ionicons 
            name={status === 'arrived' ? 'checkmark-circle' : status === 'trip' ? 'navigate' : 'car'} 
            size={16} 
            color={COLORS.white} 
          />
          <Text style={styles.statusBannerText}>
            {status === 'found' && 'Driver Found!'}
            {status === 'arriving' && `Arriving in ${eta} min`}
            {status === 'arrived' && 'Your driver has arrived!'}
            {status === 'trip' && 'Trip in progress'}
          </Text>
          <View style={styles.statusPetal} />
        </View>

        {/* Driver Info */}
        <View style={styles.driverInfo}>
          <View style={styles.driverAvatar}>
            <LinearGradient
              colors={[COLORS.rosePetal3, COLORS.rosePetal5]}
              style={styles.avatarGradient}
            >
              <Text style={styles.driverAvatarText}>{driver.name.charAt(0)}</Text>
            </LinearGradient>
          </View>
          <View style={styles.driverDetails}>
            <Text style={styles.driverName}>{driver.name}</Text>
            <View style={styles.driverRating}>
              <Ionicons name="star" size={14} color={COLORS.gold} />
              <Text style={styles.driverRatingText}>{driver.rating}</Text>
              <Text style={styles.driverTrips}>• {driver.trips} trips</Text>
            </View>
          </View>
          <View style={styles.driverActions}>
            <TouchableOpacity style={styles.driverActionBtn} onPress={handleCall}>
              <Ionicons name="call" size={18} color={COLORS.success} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.driverActionBtn} onPress={handleMessage}>
              <Ionicons name="chatbubble" size={18} color={COLORS.info} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Car Info */}
        <View style={styles.carInfo}>
          <View style={styles.carDetail}>
            <Text style={styles.carLabel}>Vehicle</Text>
            <Text style={styles.carValue}>{driver.car}</Text>
          </View>
          <View style={styles.carDivider} />
          <View style={styles.carDetail}>
            <Text style={styles.carLabel}>Plate</Text>
            <View style={styles.plateBadge}>
              <Text style={styles.carValuePlate}>{driver.plate}</Text>
            </View>
          </View>
          <View style={styles.carDivider} />
          <View style={styles.carDetail}>
            <Text style={styles.carLabel}>Color</Text>
            <View style={styles.carColorWrap}>
              <View style={[styles.carColorDot, { backgroundColor: '#C0C0C0' }]} />
              <Text style={styles.carValue}>{driver.color}</Text>
            </View>
          </View>
        </View>
      </LinearGradient>
    </View>
  );

  // Map placeholder with rose design
  const renderMapPlaceholder = () => (
    <View style={styles.mapPlaceholder}>
      <LinearGradient
        colors={[COLORS.surfaceLight, COLORS.surface]}
        style={StyleSheet.absoluteFillObject}
      />
      <RosePetalsStatic count={8} />
      
      <View style={styles.mapContent}>
        <RoseGlow size={150} color={COLORS.rosePetal4} />
        <View style={styles.mapCenterIcon}>
          <Ionicons name="map" size={40} color={COLORS.accent} />
        </View>
        <Text style={styles.mapTitle}>Live Map</Text>
        <Text style={styles.mapSubtext}>Available on mobile app</Text>
        
        {status !== 'searching' && (
          <View style={styles.mapDriverBadge}>
            <View style={styles.mapDriverPetal} />
            <Text style={styles.mapDriverText}>
              Driver is {status === 'arrived' ? 'here!' : `${eta} min away`}
            </Text>
          </View>
        )}
      </View>
      
      {/* Route Overlay */}
      <View style={styles.routeOverlay}>
        <View style={styles.routePoint}>
          <View style={styles.routePickupDot} />
          <Text style={styles.routeText} numberOfLines={1}>{pickup.address}</Text>
        </View>
        <View style={styles.routeLineContainer}>
          <View style={styles.routeLineDashed} />
        </View>
        <View style={styles.routePoint}>
          <View style={styles.routeDestDot} />
          <Text style={styles.routeText} numberOfLines={1}>{dropoff.address}</Text>
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[COLORS.primary, COLORS.primaryDark, COLORS.primary]}
        style={StyleSheet.absoluteFillObject}
      />
      
      {/* Falling Roses */}
      <FallingRoses intensity="light" />
      
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={handleCancel}>
            <Ionicons name="close" size={24} color={COLORS.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Your Ride</Text>
          <TouchableOpacity style={styles.shareButton} onPress={handleShareTrip}>
            <Ionicons name="share-social" size={18} color={COLORS.accent} />
          </TouchableOpacity>
        </View>

        {/* Map Area */}
        <View style={styles.mapContainer}>
          {renderMapPlaceholder()}
        </View>

        {/* Bottom Sheet */}
        <View style={styles.bottomSheet}>
          <View style={styles.bottomSheetHandle} />
          
          {status === 'searching' ? renderSearching() : (
            <>
              {renderDriverCard()}
              
              {/* Action Buttons */}
              <View style={styles.tripActions}>
                {status === 'arrived' ? (
                  <TouchableOpacity 
                    style={styles.startTripButton} 
                    onPress={handleStartTrip}
                    activeOpacity={0.9}
                  >
                    <LinearGradient
                      colors={[COLORS.accent, COLORS.accentDark]}
                      style={styles.startTripGradient}
                    >
                      <Text style={styles.startTripText}>I'm in the car</Text>
                      <View style={styles.startTripArrow}>
                        <Ionicons name="arrow-forward" size={18} color={COLORS.accent} />
                      </View>
                    </LinearGradient>
                  </TouchableOpacity>
                ) : status === 'trip' ? (
                  <View style={styles.tripInProgress}>
                    <LinearGradient
                      colors={[COLORS.successSoft, 'transparent']}
                      style={styles.tripProgressGradient}
                    >
                      <View style={styles.tripProgressInfo}>
                        <View style={styles.tripProgressIcon}>
                          <Ionicons name="navigate" size={22} color={COLORS.success} />
                        </View>
                        <View>
                          <Text style={styles.tripProgressTitle}>Trip in progress</Text>
                          <Text style={styles.tripProgressSubtext}>Enjoy your ride!</Text>
                        </View>
                      </View>
                      <View style={styles.tripFare}>
                        <Text style={styles.tripFareLabel}>Est. Fare</Text>
                        <Text style={styles.tripFareAmount}>{CURRENCY}2,320</Text>
                      </View>
                    </LinearGradient>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
                    <Text style={styles.cancelButtonText}>Cancel Ride</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Safety Strip */}
              <TouchableOpacity style={styles.safetyStrip} onPress={handleShareTrip}>
                <View style={styles.safetyIcon}>
                  <Ionicons name="shield-checkmark" size={16} color={COLORS.success} />
                </View>
                <Text style={styles.safetyStripText}>Share trip with emergency contacts</Text>
                <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
              </TouchableOpacity>
            </>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.primary,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.surface,
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
    backgroundColor: COLORS.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapContainer: {
    flex: 1,
    margin: SPACING.md,
    borderRadius: BORDER_RADIUS.xxl,
    overflow: 'hidden',
  },
  mapPlaceholder: {
    flex: 1,
    borderRadius: BORDER_RADIUS.xxl,
    overflow: 'hidden',
  },
  mapContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapCenterIcon: {
    position: 'absolute',
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.md,
  },
  mapTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '700',
    color: COLORS.white,
    marginTop: 80,
  },
  mapSubtext: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textMuted,
    marginTop: SPACING.xs,
  },
  mapDriverBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.lg,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.full,
    ...SHADOWS.md,
    gap: SPACING.sm,
  },
  mapDriverPetal: {
    width: 10,
    height: 12,
    backgroundColor: COLORS.rosePetal3,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 10,
    transform: [{ rotate: '-45deg' }],
  },
  mapDriverText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.white,
  },
  routeOverlay: {
    position: 'absolute',
    top: SPACING.md,
    left: SPACING.md,
    right: SPACING.md,
    backgroundColor: COLORS.surface,
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
    backgroundColor: COLORS.rosePetal3,
  },
  routeText: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
  routeLineContainer: {
    paddingLeft: 4,
    paddingVertical: SPACING.xs,
  },
  routeLineDashed: {
    width: 2,
    height: 16,
    backgroundColor: COLORS.gray600,
  },
  bottomSheet: {
    backgroundColor: COLORS.primary,
    borderTopLeftRadius: BORDER_RADIUS.xxxl,
    borderTopRightRadius: BORDER_RADIUS.xxxl,
    paddingTop: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray800,
  },
  bottomSheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.gray600,
    alignSelf: 'center',
    marginBottom: SPACING.md,
  },
  searchingContainer: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
  },
  searchingPulse: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: COLORS.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  searchingOuter: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchingInner: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchingTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: SPACING.xs,
  },
  searchingText: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textMuted,
  },
  loadingDots: {
    flexDirection: 'row',
    marginTop: SPACING.lg,
    gap: SPACING.sm,
  },
  loadingPetal: {
    width: 12,
    height: 14,
    backgroundColor: COLORS.rosePetal3,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 12,
    transform: [{ rotate: '-45deg' }],
  },
  driverCard: {
    borderRadius: BORDER_RADIUS.xxl,
    overflow: 'hidden',
    marginBottom: SPACING.md,
    ...SHADOWS.md,
  },
  driverGradient: {
    overflow: 'hidden',
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.accent,
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
  },
  statusPetal: {
    width: 8,
    height: 10,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 8,
    transform: [{ rotate: '-45deg' }],
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
    borderRadius: 25,
    overflow: 'hidden',
    ...SHADOWS.rose,
  },
  avatarGradient: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverAvatarText: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '700',
    color: COLORS.white,
  },
  driverDetails: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  driverName: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.white,
  },
  driverRating: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  driverRatingText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.white,
    marginLeft: 4,
  },
  driverTrips: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textMuted,
    marginLeft: SPACING.sm,
  },
  driverActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  driverActionBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.gray800,
    alignItems: 'center',
    justifyContent: 'center',
  },
  carInfo: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: COLORS.gray700,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
  },
  carDetail: {
    flex: 1,
    alignItems: 'center',
  },
  carLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textMuted,
    marginBottom: 2,
  },
  carValue: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.white,
  },
  carDivider: {
    width: 1,
    backgroundColor: COLORS.gray700,
  },
  plateBadge: {
    backgroundColor: COLORS.accentSoft,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.sm,
  },
  carValuePlate: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.accent,
  },
  carColorWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  carColorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.gray500,
  },
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
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
    ...SHADOWS.rose,
  },
  startTripGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.lg,
  },
  startTripText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.primary,
    marginRight: SPACING.sm,
  },
  startTripArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tripInProgress: {
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
  },
  tripProgressGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.md,
  },
  tripProgressInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  tripProgressIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
  },
  safetyIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.successSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  safetyStripText: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    color: COLORS.textMuted,
  },
});

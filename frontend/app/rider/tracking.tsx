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
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, CURRENCY } from '@/src/constants/theme';
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

  const pickup = pickupLocation || { latitude: 6.5244, longitude: 3.3792, address: 'Current Location' };
  const dropoff = dropoffLocation || { latitude: 6.4541, longitude: 3.3947, address: 'Destination' };

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
      }, 30000);
      return () => clearInterval(interval);
    }
  }, [status]);

  const handleCancel = () => {
    Alert.alert('Cancel Ride', 'Are you sure you want to cancel this ride?', [
      { text: 'No', style: 'cancel' },
      { text: 'Yes, Cancel', style: 'destructive', onPress: () => router.back() }
    ]);
  };

  const handleComplete = () => {
    Alert.alert('Trip Complete', 'Thank you for riding with NEXRYDE!', [
      { text: 'Rate Driver', onPress: () => router.back() }
    ]);
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[COLORS.background, COLORS.primary, COLORS.background]}
        style={StyleSheet.absoluteFillObject}
      />
      
      <View style={[styles.glow, { top: 100, left: 30, backgroundColor: COLORS.accentGreen }]} />
      <View style={[styles.glow, { bottom: 250, right: 30, backgroundColor: COLORS.accentBlue, width: 60 }]} />
      
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={COLORS.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {status === 'searching' ? 'Finding Driver' : 
             status === 'found' ? 'Driver Found' :
             status === 'arriving' ? 'Driver Arriving' :
             status === 'arrived' ? 'Driver Arrived' : 'On Trip'}
          </Text>
          <View style={{ width: 44 }} />
        </View>

        <View style={styles.content}>
          {/* Map Placeholder */}
          <View style={styles.mapPlaceholder}>
            <LinearGradient
              colors={[COLORS.surface, COLORS.surfaceLight]}
              style={styles.mapGradient}
            >
              <View style={styles.mapContent}>
                <Ionicons name="map" size={48} color={COLORS.accentGreen} />
                <Text style={styles.mapText}>Live Map View</Text>
                <Text style={styles.mapSubtext}>Tracking your ride in real-time</Text>
              </View>
            </LinearGradient>
          </View>

          {/* Status Card */}
          {status === 'searching' ? (
            <View style={styles.searchingCard}>
              <View style={styles.searchingPulse}>
                <Ionicons name="car" size={32} color={COLORS.accentGreen} />
              </View>
              <Text style={styles.searchingText}>Finding your driver...</Text>
              <Text style={styles.searchingSubtext}>This usually takes 1-2 minutes</Text>
            </View>
          ) : (
            <View style={styles.driverCard}>
              <LinearGradient
                colors={[COLORS.surface, COLORS.surfaceLight]}
                style={styles.driverGradient}
              >
                <View style={styles.driverHeader}>
                  <View style={styles.driverAvatar}>
                    <LinearGradient
                      colors={[COLORS.accentGreen, COLORS.accentBlue]}
                      style={styles.avatarGradient}
                    >
                      <Text style={styles.avatarText}>{driver.name.charAt(0)}</Text>
                    </LinearGradient>
                  </View>
                  <View style={styles.driverInfo}>
                    <Text style={styles.driverName}>{driver.name}</Text>
                    <View style={styles.driverStats}>
                      <Ionicons name="star" size={14} color={COLORS.gold} />
                      <Text style={styles.driverRating}>{driver.rating}</Text>
                      <Text style={styles.driverTrips}>• {driver.trips} trips</Text>
                    </View>
                  </View>
                  {status === 'arriving' && (
                    <View style={styles.etaBadge}>
                      <Text style={styles.etaText}>{eta} min</Text>
                    </View>
                  )}
                </View>

                <View style={styles.carInfo}>
                  <View style={styles.carDetail}>
                    <Ionicons name="car" size={20} color={COLORS.accentBlue} />
                    <Text style={styles.carText}>{driver.car}</Text>
                  </View>
                  <View style={styles.carDetail}>
                    <View style={[styles.colorDot, { backgroundColor: COLORS.textSecondary }]} />
                    <Text style={styles.carText}>{driver.color}</Text>
                  </View>
                  <View style={styles.plateBadge}>
                    <Text style={styles.plateText}>{driver.plate}</Text>
                  </View>
                </View>

                <View style={styles.actions}>
                  <TouchableOpacity style={styles.actionButton}>
                    <Ionicons name="call" size={20} color={COLORS.accentGreen} />
                    <Text style={styles.actionText}>Call</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionButton}>
                    <Ionicons name="chatbubble" size={20} color={COLORS.accentBlue} />
                    <Text style={styles.actionText}>Message</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionButton}>
                    <Ionicons name="share-social" size={20} color={COLORS.info} />
                    <Text style={styles.actionText}>Share</Text>
                  </TouchableOpacity>
                </View>
              </LinearGradient>
            </View>
          )}

          {/* Route Info */}
          <View style={styles.routeCard}>
            <View style={styles.routePoint}>
              <View style={styles.pickupDot} />
              <Text style={styles.routeText} numberOfLines={1}>{pickup.address}</Text>
            </View>
            <View style={styles.routeLine} />
            <View style={styles.routePoint}>
              <View style={styles.destDot} />
              <Text style={styles.routeText} numberOfLines={1}>{dropoff.address}</Text>
            </View>
          </View>
        </View>

        {/* Bottom Actions */}
        <View style={styles.bottomActions}>
          {status !== 'trip' ? (
            <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
              <Text style={styles.cancelText}>Cancel Ride</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.completeButton} onPress={handleComplete}>
              <LinearGradient
                colors={[COLORS.accentGreenLight, COLORS.accentGreen, COLORS.accentBlue]}
                style={styles.completeGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text style={styles.completeText}>Complete Trip</Text>
              </LinearGradient>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  glow: { position: 'absolute', width: 80, height: 80, borderRadius: 40, opacity: 0.12 },
  safeArea: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md },
  backButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: FONT_SIZE.lg, fontWeight: '700', color: COLORS.white },
  content: { flex: 1, paddingHorizontal: SPACING.lg },
  mapPlaceholder: { height: 200, borderRadius: BORDER_RADIUS.xxl, overflow: 'hidden', marginBottom: SPACING.lg },
  mapGradient: { flex: 1, borderWidth: 1, borderColor: COLORS.surfaceLight, borderRadius: BORDER_RADIUS.xxl },
  mapContent: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  mapText: { fontSize: FONT_SIZE.lg, fontWeight: '700', color: COLORS.white, marginTop: SPACING.sm },
  mapSubtext: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted },
  searchingCard: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xxl, padding: SPACING.xl, alignItems: 'center', borderWidth: 1, borderColor: COLORS.surfaceLight },
  searchingPulse: { width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.accentGreenSoft, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.md },
  searchingText: { fontSize: FONT_SIZE.lg, fontWeight: '700', color: COLORS.white },
  searchingSubtext: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted, marginTop: SPACING.xs },
  driverCard: { borderRadius: BORDER_RADIUS.xxl, overflow: 'hidden', marginBottom: SPACING.lg },
  driverGradient: { padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.surfaceLight, borderRadius: BORDER_RADIUS.xxl },
  driverHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.md },
  driverAvatar: { marginRight: SPACING.md },
  avatarGradient: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: FONT_SIZE.xl, fontWeight: '700', color: COLORS.white },
  driverInfo: { flex: 1 },
  driverName: { fontSize: FONT_SIZE.lg, fontWeight: '700', color: COLORS.white },
  driverStats: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  driverRating: { fontSize: FONT_SIZE.sm, fontWeight: '600', color: COLORS.gold, marginLeft: 4 },
  driverTrips: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted, marginLeft: 4 },
  etaBadge: { backgroundColor: COLORS.accentGreenSoft, paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs, borderRadius: BORDER_RADIUS.full },
  etaText: { fontSize: FONT_SIZE.md, fontWeight: '700', color: COLORS.accentGreen },
  carInfo: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surfaceLight, borderRadius: BORDER_RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.md, gap: SPACING.md },
  carDetail: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  carText: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary },
  colorDot: { width: 12, height: 12, borderRadius: 6 },
  plateBadge: { backgroundColor: COLORS.primary, paddingHorizontal: SPACING.sm, paddingVertical: 4, borderRadius: BORDER_RADIUS.sm, marginLeft: 'auto' },
  plateText: { fontSize: FONT_SIZE.xs, fontWeight: '700', color: COLORS.white },
  actions: { flexDirection: 'row', justifyContent: 'space-around' },
  actionButton: { alignItems: 'center', gap: SPACING.xs },
  actionText: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary },
  routeCard: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.surfaceLight },
  routePoint: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  pickupDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: COLORS.accentGreen },
  destDot: { width: 12, height: 12, borderRadius: 3, backgroundColor: COLORS.accentBlue },
  routeLine: { width: 2, height: 20, backgroundColor: COLORS.surfaceLight, marginLeft: 5, marginVertical: SPACING.xs },
  routeText: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, flex: 1 },
  bottomActions: { padding: SPACING.lg },
  cancelButton: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl, paddingVertical: SPACING.lg, alignItems: 'center', borderWidth: 1, borderColor: COLORS.error },
  cancelText: { fontSize: FONT_SIZE.md, fontWeight: '600', color: COLORS.error },
  completeButton: { borderRadius: BORDER_RADIUS.xl, overflow: 'hidden' },
  completeGradient: { paddingVertical: SPACING.lg, alignItems: 'center' },
  completeText: { fontSize: FONT_SIZE.lg, fontWeight: '700', color: COLORS.primary },
});
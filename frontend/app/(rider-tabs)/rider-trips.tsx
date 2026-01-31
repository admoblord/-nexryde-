import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import { Ionicons } from '@expo/vector-icons';

export default function RiderTripsScreen() {
  const router = useRouter();
  
  // Sample trip data (will come from API later)
  const [trips] = useState([
    {
      id: '1',
      date: 'Today, 3:45 PM',
      from: 'Victoria Island, Lagos',
      to: 'Lekki Phase 1, Lagos',
      fare: 2375,
      status: 'Completed',
      driver: 'John Doe',
      vehicle: 'Toyota Camry',
      plate: 'ABC-123XY',
      distance: '12.5',
      duration: '25',
    },
    {
      id: '2',
      date: 'Yesterday, 9:20 AM',
      from: 'Ikeja GRA, Lagos',
      to: 'Victoria Island, Lagos',
      fare: 1850,
      status: 'Completed',
      driver: 'Jane Smith',
      vehicle: 'Honda Accord',
      plate: 'XYZ-789AB',
      distance: '8.3',
      duration: '18',
    },
  ]);

  const handleViewReceipt = (trip: any) => {
    router.push({
      pathname: '/receipt',
      params: {
        receiptId: `NEX-2026-${trip.id.padStart(6, '0')}`,
        date: trip.date,
        pickup: trip.from,
        dropoff: trip.to,
        distance: trip.distance,
        duration: trip.duration,
        driverName: trip.driver,
        vehicle: trip.vehicle,
        plate: trip.plate,
        baseFare: '500',
        distanceFare: (trip.fare * 0.53).toString(),
        timeFare: (trip.fare * 0.26).toString(),
        total: trip.fare.toString(),
        payment: 'Cash',
        status: trip.status,
      }
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Trips</Text>
        <Text style={styles.headerSubtitle}>{trips.length} completed trips</Text>
      </View>
      
      <ScrollView contentContainerStyle={styles.content}>
        {trips.length > 0 ? (
          trips.map((trip) => (
            <View key={trip.id} style={styles.tripCard}>
              {/* Trip Header */}
              <View style={styles.tripHeader}>
                <View style={styles.tripStatus}>
                  <Ionicons name="checkmark-circle" size={20} color={COLORS.accentGreen} />
                  <Text style={styles.tripStatusText}>{trip.status}</Text>
                </View>
                <Text style={styles.tripDate}>{trip.date}</Text>
              </View>

              {/* Locations */}
              <View style={styles.locations}>
                <View style={styles.locationRow}>
                  <View style={styles.locationDot} />
                  <Text style={styles.locationText} numberOfLines={1}>{trip.from}</Text>
                </View>
                <View style={styles.locationLine} />
                <View style={styles.locationRow}>
                  <View style={[styles.locationDot, styles.locationDotEnd]} />
                  <Text style={styles.locationText} numberOfLines={1}>{trip.to}</Text>
                </View>
              </View>

              {/* Trip Info */}
              <View style={styles.tripInfo}>
                <View style={styles.infoItem}>
                  <Ionicons name="car" size={16} color={COLORS.lightTextMuted} />
                  <Text style={styles.infoText}>{trip.driver}</Text>
                </View>
                <View style={styles.infoItem}>
                  <Ionicons name="speedometer" size={16} color={COLORS.lightTextMuted} />
                  <Text style={styles.infoText}>{trip.distance} km</Text>
                </View>
              </View>

              {/* Footer */}
              <View style={styles.tripFooter}>
                <Text style={styles.fareText}>₦{trip.fare.toLocaleString()}</Text>
                <TouchableOpacity 
                  style={styles.receiptButton}
                  onPress={() => handleViewReceipt(trip)}
                >
                  <Ionicons name="receipt-outline" size={18} color={COLORS.accentBlue} />
                  <Text style={styles.receiptButtonText}>View Receipt</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        ) : (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="time-outline" size={48} color={COLORS.gray400} />
            </View>
            <Text style={styles.emptyTitle}>No trips yet</Text>
            <Text style={styles.emptyText}>Your trip history will appear here</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.lightBackground,
  },
  header: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xl,
    borderBottomLeftRadius: BORDER_RADIUS.xxl,
    borderBottomRightRadius: BORDER_RADIUS.xxl,
  },
  headerTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '800',
    color: COLORS.white,
    marginBottom: SPACING.xs,
  },
  headerSubtitle: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
  content: {
    padding: SPACING.lg,
  },
  tripCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
  },
  tripHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  tripStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  tripStatusText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.accentGreen,
  },
  tripDate: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.lightTextMuted,
  },
  locations: {
    marginBottom: SPACING.md,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  locationDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.accentGreen,
  },
  locationDotEnd: {
    backgroundColor: COLORS.error,
  },
  locationLine: {
    width: 2,
    height: 16,
    backgroundColor: COLORS.lightBorder,
    marginLeft: 4,
    marginVertical: SPACING.xs,
  },
  locationText: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.lightTextPrimary,
  },
  tripInfo: {
    flexDirection: 'row',
    gap: SPACING.lg,
    marginBottom: SPACING.md,
    paddingVertical: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.lightBorder,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  infoText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.lightTextSecondary,
  },
  tripFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fareText: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '800',
    color: COLORS.lightTextPrimary,
  },
  receiptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.accentBlueSoft,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.lg,
  },
  receiptButtonText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.accentBlue,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xxl * 2,
  },
  emptyIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.gray100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  emptyTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: SPACING.sm,
  },
  emptyText: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
  },
});

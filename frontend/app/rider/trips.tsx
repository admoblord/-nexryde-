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
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS, CURRENCY } from '@/src/constants/theme';
import { Ionicons } from '@expo/vector-icons';

export default function RiderTripsScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('upcoming');

  const trips = {
    upcoming: [],
    completed: [
      { id: '1', date: 'Today, 2:30 PM', from: 'Victoria Island', to: 'Lekki Phase 1', fare: 2500, driver: 'Emeka O.', rating: 5 },
      { id: '2', date: 'Yesterday, 9:15 AM', from: 'Ikeja', to: 'Yaba', fare: 1800, driver: 'Abdul K.', rating: 4 },
      { id: '3', date: '2 days ago', from: 'Surulere', to: 'CMS', fare: 2200, driver: 'Chidi N.', rating: 5 },
    ],
    cancelled: [
      { id: '4', date: '3 days ago', from: 'Ajah', to: 'Marina', reason: 'Driver cancelled', refund: true },
    ],
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={COLORS.gray800} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Trips</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.tabsContainer}>
        {['upcoming', 'completed', 'cancelled'].map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {activeTab === 'upcoming' && trips.upcoming.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={64} color={COLORS.gray300} />
            <Text style={styles.emptyTitle}>No Upcoming Trips</Text>
            <Text style={styles.emptySubtext}>Book a ride to see it here</Text>
            <TouchableOpacity 
              style={styles.bookButton}
              onPress={() => router.push('/rider/book')}
            >
              <Text style={styles.bookButtonText}>Book a Ride</Text>
            </TouchableOpacity>
          </View>
        )}

        {activeTab === 'completed' && trips.completed.map((trip) => (
          <View key={trip.id} style={styles.tripCard}>
            <View style={styles.tripHeader}>
              <Text style={styles.tripDate}>{trip.date}</Text>
              <Text style={styles.tripFare}>{CURRENCY}{trip.fare.toLocaleString()}</Text>
            </View>
            <View style={styles.tripRoute}>
              <View style={styles.routePoint}>
                <View style={[styles.dot, { backgroundColor: COLORS.success }]} />
                <Text style={styles.routeText}>{trip.from}</Text>
              </View>
              <View style={styles.routeLine} />
              <View style={styles.routePoint}>
                <View style={[styles.dot, { backgroundColor: COLORS.error }]} />
                <Text style={styles.routeText}>{trip.to}</Text>
              </View>
            </View>
            <View style={styles.tripFooter}>
              <Text style={styles.driverName}>{trip.driver}</Text>
              <View style={styles.ratingBadge}>
                <Ionicons name="star" size={14} color={COLORS.accent} />
                <Text style={styles.ratingText}>{trip.rating}</Text>
              </View>
            </View>
          </View>
        ))}

        {activeTab === 'cancelled' && trips.cancelled.map((trip) => (
          <View key={trip.id} style={styles.tripCard}>
            <View style={styles.tripHeader}>
              <Text style={styles.tripDate}>{trip.date}</Text>
              {trip.refund && (
                <View style={styles.refundBadge}>
                  <Text style={styles.refundText}>Refunded</Text>
                </View>
              )}
            </View>
            <View style={styles.tripRoute}>
              <View style={styles.routePoint}>
                <View style={[styles.dot, { backgroundColor: COLORS.gray400 }]} />
                <Text style={[styles.routeText, { color: COLORS.gray500 }]}>{trip.from}</Text>
              </View>
              <View style={[styles.routeLine, { borderColor: COLORS.gray300 }]} />
              <View style={styles.routePoint}>
                <View style={[styles.dot, { backgroundColor: COLORS.gray400 }]} />
                <Text style={[styles.routeText, { color: COLORS.gray500 }]}>{trip.to}</Text>
              </View>
            </View>
            <Text style={styles.cancelReason}>{trip.reason}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.gray50,
  },
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
  backButton: {
    padding: SPACING.sm,
  },
  headerTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '800',
    color: COLORS.gray800,
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  tab: {
    flex: 1,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: COLORS.primary,
  },
  tabText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.gray500,
  },
  tabTextActive: {
    color: COLORS.primary,
    fontWeight: '800',
  },
  content: {
    padding: SPACING.lg,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: SPACING.xxl,
  },
  emptyTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '800',
    color: COLORS.gray600,
    marginTop: SPACING.md,
  },
  emptySubtext: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.gray400,
    marginTop: SPACING.xs,
  },
  bookButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.xl,
    marginTop: SPACING.lg,
  },
  bookButtonText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.white,
  },
  tripCard: {
    backgroundColor: COLORS.white,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.md,
    ...SHADOWS.sm,
  },
  tripHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  tripDate: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.gray500,
  },
  tripFare: {
    fontSize: FONT_SIZE.md,
    fontWeight: '800',
    color: COLORS.gray800,
  },
  tripRoute: {
    marginVertical: SPACING.sm,
  },
  routePoint: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: SPACING.sm,
  },
  routeText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.gray700,
  },
  routeLine: {
    width: 2,
    height: 20,
    backgroundColor: COLORS.gray200,
    marginLeft: 4,
    marginVertical: 2,
  },
  tripFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray100,
  },
  driverName: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.gray600,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.gray700,
  },
  refundBadge: {
    backgroundColor: COLORS.successSoft,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.md,
  },
  refundText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: COLORS.success,
  },
  cancelReason: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.gray500,
    fontStyle: 'italic',
    marginTop: SPACING.sm,
  },
});

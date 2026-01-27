import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, CURRENCY } from '@/src/constants/theme';

interface Trip {
  id: string;
  date: string;
  time: string;
  pickup: string;
  destination: string;
  fare: number;
  status: 'completed' | 'cancelled';
  driverName: string;
  driverRating: number;
  distance: string;
  duration: string;
  paymentMethod: string;
}

export default function RideHistoryScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'all' | 'completed' | 'cancelled'>('all');
  const [refreshing, setRefreshing] = useState(false);

  // Sample ride history data
  const [trips] = useState<Trip[]>([
    {
      id: '1',
      date: 'Today',
      time: '2:30 PM',
      pickup: 'Victoria Island, Lagos',
      destination: 'Ikeja City Mall',
      fare: 2500,
      status: 'completed',
      driverName: 'Chukwuemeka O.',
      driverRating: 4.9,
      distance: '12.5 km',
      duration: '35 min',
      paymentMethod: 'Cash',
    },
    {
      id: '2',
      date: 'Yesterday',
      time: '5:15 PM',
      pickup: 'Lekki Phase 1',
      destination: 'Victoria Island',
      fare: 1800,
      status: 'completed',
      driverName: 'Adebayo F.',
      driverRating: 4.8,
      distance: '8.2 km',
      duration: '25 min',
      paymentMethod: 'Bank Transfer',
    },
    {
      id: '3',
      date: 'Jan 25',
      time: '9:00 AM',
      pickup: 'Surulere',
      destination: 'Marina, Lagos',
      fare: 0,
      status: 'cancelled',
      driverName: 'Ibrahim M.',
      driverRating: 4.7,
      distance: '15.0 km',
      duration: '45 min',
      paymentMethod: 'Cash',
    },
    {
      id: '4',
      date: 'Jan 24',
      time: '1:45 PM',
      pickup: 'Yaba',
      destination: 'Ikoyi',
      fare: 2200,
      status: 'completed',
      driverName: 'Oluwaseun A.',
      driverRating: 5.0,
      distance: '10.0 km',
      duration: '30 min',
      paymentMethod: 'Cash',
    },
  ]);

  const filteredTrips = trips.filter(trip => {
    if (activeTab === 'all') return true;
    return trip.status === activeTab;
  });

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  };

  const renderTripCard = ({ item }: { item: Trip }) => (
    <TouchableOpacity 
      style={styles.tripCard}
      onPress={() => router.push({ pathname: '/fare-breakdown', params: { tripId: item.id } })}
      activeOpacity={0.8}
    >
      {/* Date Header */}
      <View style={styles.tripHeader}>
        <Text style={styles.tripDate}>{item.date}, {item.time}</Text>
        <View style={[
          styles.statusBadge,
          item.status === 'completed' ? styles.completedBadge : styles.cancelledBadge
        ]}>
          <Ionicons 
            name={item.status === 'completed' ? 'checkmark-circle' : 'close-circle'} 
            size={14} 
            color={item.status === 'completed' ? COLORS.success : COLORS.error} 
          />
          <Text style={[
            styles.statusText,
            item.status === 'completed' ? styles.completedText : styles.cancelledText
          ]}>
            {item.status === 'completed' ? 'Completed' : 'Cancelled'}
          </Text>
        </View>
      </View>

      {/* Route Info */}
      <View style={styles.routeContainer}>
        <View style={styles.routePoint}>
          <View style={[styles.routeDot, { backgroundColor: COLORS.accentGreen }]} />
          <Text style={styles.routeText} numberOfLines={1}>{item.pickup}</Text>
        </View>
        <View style={styles.routeLine} />
        <View style={styles.routePoint}>
          <View style={[styles.routeDot, { backgroundColor: COLORS.accentBlue }]} />
          <Text style={styles.routeText} numberOfLines={1}>{item.destination}</Text>
        </View>
      </View>

      {/* Trip Details */}
      <View style={styles.tripDetails}>
        <View style={styles.driverInfo}>
          <View style={styles.driverAvatar}>
            <LinearGradient
              colors={[COLORS.accentGreen, COLORS.accentBlue]}
              style={styles.avatarGradient}
            >
              <Text style={styles.avatarInitial}>{item.driverName.charAt(0)}</Text>
            </LinearGradient>
          </View>
          <View>
            <Text style={styles.driverName}>{item.driverName}</Text>
            <View style={styles.ratingContainer}>
              <Ionicons name="star" size={14} color={COLORS.gold} />
              <Text style={styles.ratingText}>{item.driverRating}</Text>
            </View>
          </View>
        </View>
        
        <View style={styles.fareContainer}>
          {item.status === 'completed' ? (
            <Text style={styles.fareAmount}>{CURRENCY}{item.fare.toLocaleString()}</Text>
          ) : (
            <Text style={styles.cancelledFare}>No Charge</Text>
          )}
          <Text style={styles.tripMeta}>{item.distance} • {item.duration}</Text>
        </View>
      </View>

      {/* Actions */}
      <View style={styles.tripActions}>
        <TouchableOpacity style={styles.actionButton}>
          <Ionicons name="receipt-outline" size={18} color={COLORS.accentGreen} />
          <Text style={styles.actionText}>Receipt</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton}>
          <Ionicons name="refresh-outline" size={18} color={COLORS.accentBlue} />
          <Text style={styles.actionText}>Rebook</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton}>
          <Ionicons name="help-circle-outline" size={18} color={COLORS.lightTextSecondary} />
          <Text style={styles.actionText}>Help</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={24} color={COLORS.lightTextPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Ride History</Text>
          <View style={styles.placeholder} />
        </View>

        {/* Tab Switcher */}
        <View style={styles.tabContainer}>
          {(['all', 'completed', 'cancelled'] as const).map((tab) => (
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

        {/* Trip List */}
        <FlatList
          data={filteredTrips}
          renderItem={renderTripCard}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[COLORS.accentGreen]}
              tintColor={COLORS.accentGreen}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Ionicons name="car-outline" size={48} color={COLORS.lightTextMuted} />
              </View>
              <Text style={styles.emptyTitle}>No Rides Yet</Text>
              <Text style={styles.emptyDesc}>Your ride history will appear here</Text>
            </View>
          }
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.lightBackground,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
  },
  headerTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '800',
    color: COLORS.lightTextPrimary,
  },
  placeholder: {
    width: 44,
  },
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    backgroundColor: COLORS.lightSurface,
    borderRadius: BORDER_RADIUS.full,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.full,
  },
  tabActive: {
    backgroundColor: COLORS.accentGreen,
  },
  tabText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.lightTextSecondary,
  },
  tabTextActive: {
    color: COLORS.white,
  },
  listContent: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  tripCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xxl,
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
  tripDate: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.lightTextSecondary,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.full,
    gap: 4,
  },
  completedBadge: {
    backgroundColor: COLORS.successSoft,
  },
  cancelledBadge: {
    backgroundColor: COLORS.errorSoft,
  },
  statusText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
  },
  completedText: {
    color: COLORS.success,
  },
  cancelledText: {
    color: COLORS.error,
  },
  routeContainer: {
    marginBottom: SPACING.md,
    paddingLeft: SPACING.xs,
  },
  routePoint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  routeDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  routeText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '500',
    color: COLORS.lightTextPrimary,
    flex: 1,
  },
  routeLine: {
    width: 2,
    height: 20,
    backgroundColor: COLORS.lightBorder,
    marginLeft: 5,
    marginVertical: 4,
  },
  tripDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.lightBorder,
    marginBottom: SPACING.md,
  },
  driverInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  driverAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
  },
  avatarGradient: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.white,
  },
  driverName: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.lightTextPrimary,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.lightTextSecondary,
  },
  fareContainer: {
    alignItems: 'flex-end',
  },
  fareAmount: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '800',
    color: COLORS.accentGreen,
  },
  cancelledFare: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.lightTextMuted,
  },
  tripMeta: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.lightTextMuted,
    marginTop: 2,
  },
  tripActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.lightBorder,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.lightTextSecondary,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: SPACING.xxl * 2,
  },
  emptyIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.lightSurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  emptyTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.lightTextPrimary,
    marginBottom: 4,
  },
  emptyDesc: {
    fontSize: FONT_SIZE.md,
    color: COLORS.lightTextSecondary,
  },
});

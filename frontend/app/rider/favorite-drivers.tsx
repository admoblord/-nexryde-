import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import { useAppStore } from '@/src/store/appStore';

interface FavoriteDriver {
  id: string;
  name: string;
  rating: number;
  totalTrips: number;
  vehicle: string;
  plate: string;
  isOnline: boolean;
  lastSeen: string;
  profileImage?: string;
}

export default function FavoriteDriversScreen() {
  const router = useRouter();
  const { user } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [favoriteDrivers, setFavoriteDrivers] = useState<FavoriteDriver[]>([
    {
      id: 'drv-001',
      name: 'John Doe',
      rating: 4.9,
      totalTrips: 156,
      vehicle: 'Toyota Camry',
      plate: 'ABC-123XY',
      isOnline: true,
      lastSeen: 'Online now',
    },
    {
      id: 'drv-002',
      name: 'Jane Smith',
      rating: 4.8,
      totalTrips: 203,
      vehicle: 'Honda Accord',
      plate: 'XYZ-789AB',
      isOnline: false,
      lastSeen: '5 min ago',
    },
    {
      id: 'drv-003',
      name: 'David Johnson',
      rating: 5.0,
      totalTrips: 89,
      vehicle: 'Toyota Corolla',
      plate: 'DEF-456CD',
      isOnline: true,
      lastSeen: 'Online now',
    },
  ]);

  useEffect(() => {
    loadFavoriteDrivers();
  }, []);

  const loadFavoriteDrivers = async () => {
    try {
      setLoading(true);
      // TODO: Call API to load favorite drivers
      // const response = await getFavoriteDrivers(user?.id);
      // setFavoriteDrivers(response.data);
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      Alert.alert('Error', 'Failed to load favorite drivers');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRequestDriver = (driver: FavoriteDriver) => {
    if (!driver.isOnline) {
      Alert.alert(
        'Driver Offline',
        `${driver.name} is currently offline. Last seen ${driver.lastSeen}. Would you like to book a regular ride instead?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Book Regular Ride', onPress: () => router.push('/rider/book') }
        ]
      );
      return;
    }

    Alert.alert(
      `Request ${driver.name}?`,
      `Send ride request directly to ${driver.name}? They'll get priority notification.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send Request',
          onPress: () => {
            // TODO: Implement request to specific driver
            router.push({
              pathname: '/rider/book',
              params: { requestedDriverId: driver.id, driverName: driver.name }
            });
          }
        }
      ]
    );
  };

  const handleRemoveFavorite = (driver: FavoriteDriver) => {
    Alert.alert(
      'Remove Favorite',
      `Remove ${driver.name} from your favorites?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              // TODO: Call API to remove favorite
              setFavoriteDrivers(favoriteDrivers.filter(d => d.id !== driver.id));
              Alert.alert('Success', `${driver.name} removed from favorites`);
            } catch (error) {
              Alert.alert('Error', 'Failed to remove favorite');
            }
          }
        }
      ]
    );
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadFavoriteDrivers();
  };

  const renderDriverCard = (driver: FavoriteDriver) => (
    <View key={driver.id} style={styles.driverCard}>
      {/* Driver Header */}
      <View style={styles.driverHeader}>
        <View style={styles.driverInfo}>
          {/* Avatar */}
          <View style={styles.avatar}>
            {driver.profileImage ? (
              <Text>IMG</Text>
            ) : (
              <Text style={styles.avatarText}>
                {driver.name.charAt(0).toUpperCase()}
              </Text>
            )}
            {driver.isOnline && <View style={styles.onlineBadge} />}
          </View>

          {/* Info */}
          <View style={styles.driverDetails}>
            <Text style={styles.driverName}>{driver.name}</Text>
            <View style={styles.ratingRow}>
              <Ionicons name="star" size={14} color={COLORS.accent} />
              <Text style={styles.ratingText}>{driver.rating}</Text>
              <Text style={styles.tripsText}>• {driver.totalTrips} trips</Text>
            </View>
            <View style={styles.vehicleRow}>
              <Ionicons name="car" size={14} color={COLORS.lightTextMuted} />
              <Text style={styles.vehicleText}>{driver.vehicle} • {driver.plate}</Text>
            </View>
          </View>
        </View>

        {/* Remove Button */}
        <TouchableOpacity 
          style={styles.removeButton}
          onPress={() => handleRemoveFavorite(driver)}
        >
          <Ionicons name="close-circle" size={24} color={COLORS.error} />
        </TouchableOpacity>
      </View>

      {/* Status */}
      <View style={[styles.statusBadge, driver.isOnline ? styles.statusOnline : styles.statusOffline]}>
        <View style={[styles.statusDot, { backgroundColor: driver.isOnline ? COLORS.success : COLORS.gray400 }]} />
        <Text style={[styles.statusText, { color: driver.isOnline ? COLORS.success : COLORS.gray400 }]}>
          {driver.lastSeen}
        </Text>
      </View>

      {/* Action Button */}
      {driver.isOnline ? (
        <TouchableOpacity 
          style={styles.requestButton}
          onPress={() => handleRequestDriver(driver)}
        >
          <LinearGradient
            colors={[COLORS.accentGreen, COLORS.accentBlue]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.requestGradient}
          >
            <Ionicons name="car" size={20} color={COLORS.white} />
            <Text style={styles.requestButtonText}>Request Ride</Text>
          </LinearGradient>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity 
          style={styles.notifyButton}
          onPress={() => {
            Alert.alert('Notification Set!', `You'll be notified when ${driver.name} comes online.`);
          }}
        >
          <Ionicons name="notifications-outline" size={20} color={COLORS.accentBlue} />
          <Text style={styles.notifyButtonText}>Notify When Online</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.accentGreen} />
        <Text style={styles.loadingText}>Loading your favorites...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Favorite Drivers</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Info Banner */}
      <View style={styles.infoBanner}>
        <Ionicons name="information-circle" size={20} color={COLORS.accentBlue} />
        <Text style={styles.infoText}>
          Request rides from your trusted drivers directly!
        </Text>
      </View>

      <ScrollView 
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {favoriteDrivers.length > 0 ? (
          favoriteDrivers.map(renderDriverCard)
        ) : (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="star-outline" size={64} color={COLORS.gray400} />
            </View>
            <Text style={styles.emptyTitle}>No Favorite Drivers Yet</Text>
            <Text style={styles.emptyText}>
              After a great ride, add drivers to your favorites to request them directly!
            </Text>
            <TouchableOpacity 
              style={styles.emptyButton}
              onPress={() => router.push('/rider/book')}
            >
              <Text style={styles.emptyButtonText}>Book Your First Ride</Text>
            </TouchableOpacity>
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
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.lightBackground,
  },
  loadingText: {
    marginTop: SPACING.md,
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.lightTextMuted,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xl,
    borderBottomLeftRadius: BORDER_RADIUS.xxl,
    borderBottomRightRadius: BORDER_RADIUS.xxl,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '900',
    color: COLORS.white,
    letterSpacing: -0.5,
  },
  placeholder: {
    width: 44,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.accentBlueSoft,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
  },
  infoText: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.accentBlue,
  },
  content: {
    padding: SPACING.lg,
  },
  driverCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
  },
  driverHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  driverInfo: {
    flexDirection: 'row',
    flex: 1,
    gap: SPACING.md,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: COLORS.accentGreen,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  avatarText: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '900',
    color: COLORS.white,
  },
  onlineBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: COLORS.success,
    borderWidth: 3,
    borderColor: COLORS.white,
  },
  driverDetails: {
    flex: 1,
    justifyContent: 'center',
  },
  driverName: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: COLORS.lightTextPrimary,
    marginBottom: SPACING.xs,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginBottom: SPACING.xs,
  },
  ratingText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '800',
    color: COLORS.lightTextPrimary,
  },
  tripsText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.lightTextMuted,
  },
  vehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  vehicleText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.lightTextMuted,
  },
  removeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.full,
    marginBottom: SPACING.md,
    alignSelf: 'flex-start',
  },
  statusOnline: {
    backgroundColor: COLORS.success + '15',
  },
  statusOffline: {
    backgroundColor: COLORS.gray100,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  requestButton: {
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
  },
  requestGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
  },
  requestButtonText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '900',
    color: COLORS.white,
  },
  notifyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.accentBlueSoft,
    borderWidth: 1,
    borderColor: COLORS.accentBlue + '30',
  },
  notifyButtonText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '800',
    color: COLORS.accentBlue,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xxl * 3,
  },
  emptyIcon: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: COLORS.gray100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xl,
  },
  emptyTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '900',
    color: COLORS.lightTextPrimary,
    marginBottom: SPACING.sm,
  },
  emptyText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.lightTextMuted,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 22,
    marginBottom: SPACING.xl,
  },
  emptyButton: {
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    backgroundColor: COLORS.accentGreen,
    borderRadius: BORDER_RADIUS.lg,
  },
  emptyButtonText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '900',
    color: COLORS.white,
  },
});

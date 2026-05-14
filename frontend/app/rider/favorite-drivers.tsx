import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { SPACING, FONT_SIZE, BORDER_RADIUS, CURRENCY } from '@/src/constants/theme';
import { useAppStore } from '@/src/store/appStore';
import { getFavoriteDrivers, removeFavoriteDriver, getTripsWithDriver } from '@/src/services/api';

// ── Palette ────────────────────────────────────────────────────────────────
const C = {
  bg:       '#020617',
  bgMid:    '#0B1223',
  card:     '#0F172A',
  border:   '#1E293B',
  green:    '#22C55E',
  greenDim: '#052E16',
  blue:     '#3B82F6',
  amber:    '#F59E0B',
  red:      '#EF4444',
  purple:   '#A78BFA',
  white:    '#FFFFFF',
  muted:    '#94A3B8',
  dim:      '#334155',
};

// ── Avatar gradient palettes per driver (index mod) ────────────────────────
const AVATAR_GRADIENTS = [
  ['#1D4ED8', '#2563EB'],
  ['#065F46', '#047857'],
  ['#7C3AED', '#6D28D9'],
  ['#B45309', '#92400E'],
  ['#0E7490', '#0891B2'],
] as [string, string][];

interface FavoriteDriver {
  id:            string;
  name:          string;
  rating:        number;
  totalTrips:    number;
  vehicle:       string;
  plate:         string;
  isOnline:      boolean;
  lastSeen:      string;
  ridesTogether: number;
  totalSpent:    number;
}

export default function FavoriteDriversScreen() {
  const router = useRouter();
  const { user } = useAppStore();
  const [loading,         setLoading]         = useState(true);
  const [refreshing,      setRefreshing]      = useState(false);
  const [favoriteDrivers, setFavoriteDrivers] = useState<FavoriteDriver[]>([]);

  // Entry animation
  const listFade  = useRef(new Animated.Value(0)).current;
  const listSlide = useRef(new Animated.Value(24)).current;

  const loadFavoriteDrivers = useCallback(async () => {
    try {
      setLoading(true);
      if (!user?.id) { setFavoriteDrivers([]); return; }
      const response  = await getFavoriteDrivers(user.id);
      const rawDrivers = response.data?.favorite_drivers || response.data;
      const rows = Array.isArray(rawDrivers) ? rawDrivers : [];

      const mapped: FavoriteDriver[] = await Promise.all(
        rows.map(async (d: any, idx: number) => {
          const driverId = d.driver_id || d.id;
          let ridesTogether = 0;
          let totalSpent    = 0;
          try {
            const histRes = await getTripsWithDriver(user!.id, driverId);
            ridesTogether = histRes.data?.total_rides || 0;
            totalSpent    = histRes.data?.total_spent  || 0;
          } catch {}
          return {
            id:            driverId,
            name:          d.name || 'Driver',
            rating:        Number(d.rating || 0),
            totalTrips:    Number(d.total_trips || 0),
            vehicle:       d.vehicle_model || d.vehicle || 'Vehicle',
            plate:         d.vehicle_plate || d.plate || '',
            isOnline:      Boolean(d.is_online),
            lastSeen:      d.is_online ? 'Online now' : 'Offline',
            ridesTogether,
            totalSpent,
          };
        })
      );

      // Online drivers first
      mapped.sort((a, b) => Number(b.isOnline) - Number(a.isOnline));
      setFavoriteDrivers(mapped);
    } catch {
      Alert.alert('Error', 'Failed to load favorite drivers');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadFavoriteDrivers();
  }, [loadFavoriteDrivers]);

  useEffect(() => {
    if (!loading) {
      Animated.parallel([
        Animated.timing(listFade,  { toValue: 1, duration: 420, useNativeDriver: true }),
        Animated.spring(listSlide, { toValue: 0, tension: 70, friction: 9, useNativeDriver: true }),
      ]).start();
    }
  }, [loading]);

  const handleRequestDriver = (driver: FavoriteDriver) => {
    if (!driver.isOnline) {
      Alert.alert(
        'Driver Offline',
        `${driver.name} is currently offline. Book a regular ride instead?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Book Regular Ride', onPress: () => router.push('/rider/book') },
        ]
      );
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({
      pathname: '/rider/book',
      params: { requestedDriverId: driver.id, driverName: driver.name },
    });
  };

  const handleRemoveFavorite = (driver: FavoriteDriver) => {
    Alert.alert(
      'Remove Favourite',
      `Remove ${driver.name} from your favourites?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: async () => {
            try {
              if (user?.id) await removeFavoriteDriver(user.id, driver.id);
              setFavoriteDrivers((prev) => prev.filter((d) => d.id !== driver.id));
            } catch {
              Alert.alert('Error', 'Failed to remove favourite');
            }
          },
        },
      ]
    );
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadFavoriteDrivers();
  };

  const onlineCount  = favoriteDrivers.filter((d) => d.isOnline).length;
  const offlineCount = favoriteDrivers.length - onlineCount;

  // ── Driver card ────────────────────────────────────────────────────────
  const renderDriverCard = (driver: FavoriteDriver, idx: number) => {
    const gradColors = AVATAR_GRADIENTS[idx % AVATAR_GRADIENTS.length];
    return (
      <View key={driver.id} style={s.driverCard}>
        {/* Avatar + status dot */}
        <View style={s.cardTop}>
          <LinearGradient colors={gradColors} style={s.avatar}>
            <Text style={s.avatarText}>{driver.name.charAt(0).toUpperCase()}</Text>
            {driver.isOnline && <View style={s.onlineDot} />}
          </LinearGradient>

          <View style={s.cardInfo}>
            <Text style={s.cardName}>{driver.name}</Text>
            <View style={s.cardSubRow}>
              {driver.rating > 0 && (
                <>
                  <Ionicons name="star" size={12} color={C.amber} />
                  <Text style={s.cardRating}>{driver.rating.toFixed(1)}</Text>
                </>
              )}
              <Text style={s.cardVehicle}>{driver.vehicle}{driver.plate ? ` · ${driver.plate}` : ''}</Text>
            </View>
            <View style={[s.statusPill, driver.isOnline ? s.statusOnline : s.statusOffline]}>
              <View style={[s.statusDot, { backgroundColor: driver.isOnline ? C.green : C.dim }]} />
              <Text style={[s.statusText, { color: driver.isOnline ? C.green : C.muted }]}>
                {driver.lastSeen}
              </Text>
            </View>
          </View>

          {/* Remove X */}
          <TouchableOpacity
            style={s.removeBtn}
            onPress={() => handleRemoveFavorite(driver)}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${driver.name} from favourites`}
          >
            <Ionicons name="close-circle" size={22} color={C.dim} />
          </TouchableOpacity>
        </View>

        {/* Rides-together stats */}
        {driver.ridesTogether > 0 && (
          <View style={s.statsRow}>
            <View style={s.statChip}>
              <Ionicons name="repeat" size={12} color={C.blue} />
              <Text style={s.statChipText}>{driver.ridesTogether} rides together</Text>
            </View>
            <View style={s.statChip}>
              <Ionicons name="cash-outline" size={12} color={C.green} />
              <Text style={s.statChipText}>{CURRENCY}{driver.totalSpent.toLocaleString()} spent</Text>
            </View>
          </View>
        )}

        {/* Action buttons */}
        <View style={s.actionRow}>
          <TouchableOpacity
            style={s.profileBtn}
            onPress={() => router.push({ pathname: '/rider/driver-details', params: { driverId: driver.id } })}
            accessibilityRole="button"
          >
            <Ionicons name="person-outline" size={16} color={C.muted} />
            <Text style={s.profileBtnText}>Profile</Text>
          </TouchableOpacity>

          {driver.isOnline ? (
            <TouchableOpacity
              style={s.bookBtn}
              onPress={() => handleRequestDriver(driver)}
              accessibilityRole="button"
              accessibilityLabel={`Request ride from ${driver.name}`}
            >
              <LinearGradient
                colors={[C.green, '#16A34A']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={s.bookBtnGrad}
              >
                <Ionicons name="car" size={16} color={C.white} />
                <Text style={s.bookBtnText}>Book Now</Text>
              </LinearGradient>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={s.notifyBtn}
              onPress={() => Alert.alert('Notification Set!', `You'll be notified when ${driver.name} comes online.`)}
              accessibilityRole="button"
            >
              <Ionicons name="notifications-outline" size={16} color={C.blue} />
              <Text style={s.notifyBtnText}>Notify When Online</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  // ── Loading ────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.loadingWrap}>
          <ActivityIndicator size="large" color={C.green} />
          <Text style={s.loadingText}>Loading your favourites...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <LinearGradient colors={['#052E16', '#0B1223']} style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} accessibilityRole="button">
          <Ionicons name="arrow-back" size={22} color={C.white} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>My Favourite Drivers</Text>
          {favoriteDrivers.length > 0 && (
            <Text style={s.headerSub}>
              {onlineCount > 0 ? `${onlineCount} online now · ` : ''}{favoriteDrivers.length} saved
            </Text>
          )}
        </View>
        <Ionicons name="heart" size={22} color={C.green} />
      </LinearGradient>

      {/* Info strip */}
      {favoriteDrivers.length > 0 && (
        <View style={s.infoStrip}>
          <Ionicons name="flash" size={14} color={C.green} />
          <Text style={s.infoStripText}>
            Tap Book Now for priority matching. Favourite riders get ~5% off when that driver accepts.
          </Text>
        </View>
      )}

      <ScrollView
        contentContainerStyle={[s.content, favoriteDrivers.length === 0 && s.contentEmpty]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.green} />}
        showsVerticalScrollIndicator={false}
      >
        {favoriteDrivers.length > 0 ? (
          <Animated.View style={{ opacity: listFade, transform: [{ translateY: listSlide }] }}>
            {/* Online section */}
            {onlineCount > 0 && (
              <>
                <View style={s.sectionHeader}>
                  <View style={s.sectionDot} />
                  <Text style={s.sectionLabel}>Available Now</Text>
                </View>
                {favoriteDrivers
                  .filter((d) => d.isOnline)
                  .map((d, i) => renderDriverCard(d, i))}
              </>
            )}

            {/* Offline section */}
            {offlineCount > 0 && (
              <>
                <View style={s.sectionHeader}>
                  <View style={[s.sectionDot, { backgroundColor: C.dim }]} />
                  <Text style={[s.sectionLabel, { color: C.muted }]}>Offline</Text>
                </View>
                {favoriteDrivers
                  .filter((d) => !d.isOnline)
                  .map((d, i) => renderDriverCard(d, onlineCount + i))}
              </>
            )}
          </Animated.View>
        ) : (
          /* Empty state */
          <View style={s.emptyWrap}>
            <LinearGradient colors={['#052E16', '#0F172A']} style={s.emptyIconWrap}>
              <Ionicons name="heart-outline" size={44} color={C.green} />
            </LinearGradient>
            <Text style={s.emptyTitle}>No Favourites Yet</Text>
            <Text style={s.emptyText}>
              After a great ride, tap the heart icon on the receipt to save a driver. Request them with priority matching, and ~5% off the fare when they accept.
            </Text>
            <TouchableOpacity style={s.emptyBtn} onPress={() => router.push('/rider/book')} accessibilityRole="button">
              <LinearGradient colors={[C.green, '#16A34A']} style={s.emptyBtnGrad}>
                <Ionicons name="car" size={18} color={C.white} />
                <Text style={s.emptyBtnText}>Book a Ride</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: C.bg },
  loadingWrap:  { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText:  { color: C.muted, fontWeight: '600', fontSize: FONT_SIZE.sm },

  /* Header */
  header:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 16, gap: 12 },
  backBtn:      { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  headerTitle:  { fontSize: FONT_SIZE.lg, fontWeight: '900', color: C.white },
  headerSub:    { fontSize: FONT_SIZE.xs, fontWeight: '600', color: '#86EFAC', marginTop: 2 },

  /* Info strip */
  infoStrip:    { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(34,197,94,0.08)', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  infoStripText:{ flex: 1, fontSize: FONT_SIZE.xs, fontWeight: '600', color: '#86EFAC', lineHeight: 18 },

  content:      { padding: 16 },
  contentEmpty: { flex: 1 },

  /* Section headers */
  sectionHeader:{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, marginTop: 4 },
  sectionDot:   { width: 8, height: 8, borderRadius: 4, backgroundColor: C.green },
  sectionLabel: { fontSize: FONT_SIZE.xs, fontWeight: '800', color: C.green, textTransform: 'uppercase', letterSpacing: 1 },

  /* Driver card */
  driverCard:   { backgroundColor: C.card, borderRadius: 18, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: C.border, gap: 12 },
  cardTop:      { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  avatar:       { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  avatarText:   { fontSize: FONT_SIZE.xl, fontWeight: '900', color: C.white },
  onlineDot:    { position: 'absolute', bottom: 1, right: 1, width: 15, height: 15, borderRadius: 8, backgroundColor: C.green, borderWidth: 2.5, borderColor: C.card },
  cardInfo:     { flex: 1, gap: 4 },
  cardName:     { fontSize: FONT_SIZE.md, fontWeight: '900', color: C.white },
  cardSubRow:   { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cardRating:   { fontSize: FONT_SIZE.xs, fontWeight: '800', color: C.amber },
  cardVehicle:  { fontSize: FONT_SIZE.xs, fontWeight: '600', color: C.muted },
  statusPill:   { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20, marginTop: 2 },
  statusOnline: { backgroundColor: 'rgba(34,197,94,0.12)' },
  statusOffline:{ backgroundColor: 'rgba(100,116,139,0.12)' },
  statusDot:    { width: 6, height: 6, borderRadius: 3 },
  statusText:   { fontSize: FONT_SIZE.xs - 1, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  removeBtn:    { padding: 4, marginTop: -2 },

  /* Stats */
  statsRow:     { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  statChip:     { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.bgMid, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  statChipText: { fontSize: FONT_SIZE.xs, fontWeight: '700', color: C.white },

  /* Actions */
  actionRow:    { flexDirection: 'row', gap: 8 },
  profileBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: C.border },
  profileBtnText:{ fontSize: FONT_SIZE.xs, fontWeight: '800', color: C.muted },
  bookBtn:      { flex: 1, borderRadius: 12, overflow: 'hidden' },
  bookBtnGrad:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11 },
  bookBtnText:  { fontSize: FONT_SIZE.sm, fontWeight: '900', color: C.white },
  notifyBtn:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 12, backgroundColor: 'rgba(59,130,246,0.1)', borderWidth: 1, borderColor: C.blue + '30' },
  notifyBtnText:{ fontSize: FONT_SIZE.xs, fontWeight: '800', color: C.blue },

  /* Empty */
  emptyWrap:    { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 64, paddingHorizontal: 32, gap: 16 },
  emptyIconWrap:{ width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  emptyTitle:   { fontSize: FONT_SIZE.xl, fontWeight: '900', color: C.white, textAlign: 'center' },
  emptyText:    { fontSize: FONT_SIZE.sm, fontWeight: '600', color: C.muted, textAlign: 'center', lineHeight: 22, maxWidth: 280 },
  emptyBtn:     { borderRadius: 14, overflow: 'hidden', marginTop: 8 },
  emptyBtnGrad: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 28, paddingVertical: 13 },
  emptyBtnText: { fontSize: FONT_SIZE.md, fontWeight: '900', color: C.white },
});

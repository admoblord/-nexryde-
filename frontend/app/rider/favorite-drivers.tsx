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
import { BRAND, RADIUS, SPACING, SURFACE, TYPOGRAPHY } from '@/src/constants/designSystem';
import { useThemeColors } from '@/src/constants/theme';
import { useAuthedUserId } from '@/src/hooks/useAuthedUserId';
import { getFavoriteDrivers, removeFavoriteDriver, getTripsWithDriver } from '@/src/services/api';
import {
  RIDER_FAV_GRADIENT,
  RIDER_FAV_PERK_DETAIL,
  type RiderFavoriteDriverRow,
} from '@/src/constants/riderFavorites';
import { RiderFavoriteIcon } from '@/src/components/rider/RiderFavoriteIcon';
import { RiderFavoriteDriverCard } from '@/src/components/rider/RiderFavoriteDriverCard';

export default function FavoriteDriversScreen() {
  const router = useRouter();
  const { userId: riderId, canCallAuthedApi } = useAuthedUserId();
  const { colors, isDark } = useThemeColors();
  const screenBg = isDark ? BRAND.bgDeep : colors.background;
  const titleColor = isDark ? '#F8FAFC' : colors.text;
  const mutedColor = isDark ? '#94A3B8' : colors.textMuted;
  const headerGrad = isDark
    ? ([BRAND.bgDeep, BRAND.bgElevated, BRAND.bgDeep] as const)
    : ([colors.card, colors.surfaceAlt, colors.card] as const);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [favoriteDrivers, setFavoriteDrivers] = useState<RiderFavoriteDriverRow[]>([]);
  const listFade = useRef(new Animated.Value(0)).current;
  const listSlide = useRef(new Animated.Value(24)).current;

  const loadFavoriteDrivers = useCallback(async () => {
    try {
      if (!riderId || !canCallAuthedApi) {
        setFavoriteDrivers([]);
        return;
      }
      const response = await getFavoriteDrivers(riderId);
      const rawDrivers = response.data?.favorite_drivers || response.data;
      const rows = Array.isArray(rawDrivers) ? rawDrivers : [];

      const mapped: RiderFavoriteDriverRow[] = await Promise.all(
        rows.map(async (d: Record<string, unknown>) => {
          const driverId = String(d.driver_id || d.id || '');
          let ridesTogether = 0;
          let totalSpent = 0;
          try {
            const histRes = await getTripsWithDriver(riderId, driverId);
            ridesTogether = histRes.data?.total_rides || 0;
            totalSpent = histRes.data?.total_spent || 0;
          } catch {
            /* optional stats */
          }
          return {
            id: driverId,
            name: String(d.name || 'Driver'),
            rating: Number(d.rating || 0),
            totalTrips: Number(d.total_trips || 0),
            vehicle: String(d.vehicle_model || d.vehicle || 'Vehicle'),
            plate: String(d.vehicle_plate || d.plate || ''),
            isOnline: Boolean(d.is_online),
            profileImage: (d.profile_image as string) || null,
            ridesTogether,
            totalSpent,
          };
        }),
      );

      mapped.sort((a, b) => Number(b.isOnline) - Number(a.isOnline));
      setFavoriteDrivers(mapped);
    } catch {
      Alert.alert('Error', 'Failed to load favourite drivers');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [riderId, canCallAuthedApi]);

  useEffect(() => {
    if (!canCallAuthedApi) return;
    void loadFavoriteDrivers();
  }, [loadFavoriteDrivers, canCallAuthedApi]);

  useEffect(() => {
    if (!loading) {
      Animated.parallel([
        Animated.timing(listFade, { toValue: 1, duration: 420, useNativeDriver: true }),
        Animated.spring(listSlide, { toValue: 0, tension: 70, friction: 9, useNativeDriver: true }),
      ]).start();
    }
  }, [loading, listFade, listSlide]);

  const handleRequestDriver = (driver: RiderFavoriteDriverRow) => {
    if (!driver.isOnline) {
      Alert.alert(
        'Driver offline',
        `${driver.name} is not online. Book a regular ride or check back later.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Book any ride', onPress: () => router.push('/rider/book' as any) },
        ],
      );
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({
      pathname: '/rider/book',
      params: { requestedDriverId: driver.id, driverName: driver.name },
    } as any);
  };

  const handleRemoveFavorite = (driver: RiderFavoriteDriverRow) => {
    Alert.alert('Remove favourite', `Remove ${driver.name} from your favourites?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            if (riderId && canCallAuthedApi) await removeFavoriteDriver(riderId, driver.id);
            setFavoriteDrivers((prev) => prev.filter((d) => d.id !== driver.id));
          } catch {
            Alert.alert('Error', 'Failed to remove favourite');
          }
        },
      },
    ]);
  };

  const onlineCount = favoriteDrivers.filter((d) => d.isOnline).length;

  if (loading) {
    return (
      <SafeAreaView style={[s.container, { backgroundColor: screenBg }]}>
        <View style={s.loadingWrap}>
          <RiderFavoriteIcon size={56} filled />
          <ActivityIndicator size="large" color="#EC4899" style={{ marginTop: 16 }} />
          <Text style={[s.loadingText, { color: mutedColor }]}>Loading favourites…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[s.container, { backgroundColor: screenBg }]}>
      <LinearGradient colors={[...headerGrad]} style={s.header}>
        <TouchableOpacity
          style={[s.backBtn, !isDark && { backgroundColor: colors.surfaceAlt }]}
          onPress={() => router.back()}
          accessibilityRole="button"
        >
          <Ionicons name="arrow-back" size={22} color={titleColor} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[s.headerTitle, { color: titleColor }]}>Favourite drivers</Text>
          <Text style={[s.headerSub, { color: isDark ? '#F9A8D4' : '#DB2777' }]}>
            {favoriteDrivers.length > 0
              ? `${onlineCount} online · ${favoriteDrivers.length} saved`
              : 'Your trusted drivers in one place'}
          </Text>
        </View>
        <RiderFavoriteIcon size={40} filled />
      </LinearGradient>

      <View style={[s.perkStrip, !isDark && { backgroundColor: 'rgba(236,72,153,0.06)' }]}>
        <Ionicons name="sparkles" size={16} color="#F472B6" />
        <Text style={[s.perkTxt, { color: isDark ? '#FBCFE8' : '#BE185D' }]}>{RIDER_FAV_PERK_DETAIL}</Text>
      </View>

      <ScrollView
        contentContainerStyle={[s.content, favoriteDrivers.length === 0 && s.contentEmpty]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void loadFavoriteDrivers(); }} tintColor="#EC4899" />
        }
        showsVerticalScrollIndicator={false}
      >
        {favoriteDrivers.length > 0 ? (
          <Animated.View style={{ opacity: listFade, transform: [{ translateY: listSlide }] }}>
            {onlineCount > 0 ? (
              <>
                <SectionLabel title="Available now" online />
                {favoriteDrivers.filter((d) => d.isOnline).map((d, i) => (
                  <RiderFavoriteDriverCard
                    key={d.id}
                    driver={d}
                    index={i}
                    onBook={() => handleRequestDriver(d)}
                    onProfile={() => router.push({ pathname: '/rider/driver-details', params: { driverId: d.id } } as any)}
                    onRemove={() => handleRemoveFavorite(d)}
                  />
                ))}
              </>
            ) : null}
            {favoriteDrivers.some((d) => !d.isOnline) ? (
              <>
                <SectionLabel title="Offline" />
                {favoriteDrivers.filter((d) => !d.isOnline).map((d, i) => (
                  <RiderFavoriteDriverCard
                    key={d.id}
                    driver={d}
                    index={onlineCount + i}
                    onBook={() => handleRequestDriver(d)}
                    onProfile={() => router.push({ pathname: '/rider/driver-details', params: { driverId: d.id } } as any)}
                    onRemove={() => handleRemoveFavorite(d)}
                  />
                ))}
              </>
            ) : null}
          </Animated.View>
        ) : (
          <View style={s.emptyWrap}>
            <RiderFavoriteIcon size={72} filled />
            <Text style={[s.emptyTitle, { color: titleColor }]}>No favourites yet</Text>
            <Text style={[s.emptyText, { color: mutedColor }]}>
              After a great ride, tap the heart on your trip receipt or driver profile. They’ll appear on your home screen for one-tap booking.
            </Text>
            <TouchableOpacity style={s.emptyBtnWrap} onPress={() => router.push('/rider/book' as any)} activeOpacity={0.9}>
              <LinearGradient colors={[...RIDER_FAV_GRADIENT]} style={s.emptyBtn}>
                <Ionicons name="car-sport" size={18} color="#FFF" />
                <Text style={s.emptyBtnTxt}>Book a ride</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionLabel({ title, online }: { title: string; online?: boolean }) {
  const { colors, isDark } = useThemeColors();
  return (
    <View style={s.sectionHeader}>
      <View style={[s.sectionDot, online && s.sectionDotOn]} />
      <Text
        style={[
          s.sectionLabel,
          { color: isDark ? '#64748B' : colors.textMuted },
          online && s.sectionLabelOn,
        ]}
      >
        {title}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BRAND.bgDeep },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: '#94A3B8', fontWeight: '600', fontSize: 13, marginTop: 8 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    gap: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 17, fontWeight: '900', color: '#F8FAFC' },
  headerSub: { fontSize: 11, fontWeight: '600', color: '#F9A8D4', marginTop: 2 },
  perkStrip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    backgroundColor: 'rgba(236,72,153,0.08)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(236,72,153,0.15)',
  },
  perkTxt: { flex: 1, fontSize: 11, fontWeight: '600', color: '#BE185D', lineHeight: 18 },
  content: { padding: SPACING.md },
  contentEmpty: { flexGrow: 1 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, marginTop: 4 },
  sectionDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#475569' },
  sectionDotOn: { backgroundColor: BRAND.primary },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sectionLabelOn: { color: BRAND.primaryLight },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 28,
    gap: 14,
  },
  emptyTitle: { fontSize: 20, fontWeight: '900', color: '#F8FAFC', textAlign: 'center' },
  emptyText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 22,
  },
  emptyBtnWrap: { borderRadius: RADIUS.xl, overflow: 'hidden', marginTop: 8 },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  emptyBtnTxt: { fontSize: 15, fontWeight: '900', color: '#FFF' },
});

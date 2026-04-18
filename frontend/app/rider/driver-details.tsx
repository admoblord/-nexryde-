import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, useThemeColors } from '@/src/constants/theme';
import { VerificationBadge, TrustScore, DriverVerificationCard } from '@/src/components/DriverVerification';
import { getDriverProfile, getDriverStats, getUser, getTrip, checkFavoriteDriver, addFavoriteDriver, removeFavoriteDriver } from '@/src/services/api';
import { useAppStore } from '@/src/store/appStore';

export default function DriverDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ driverId?: string; tripId?: string; driver?: string }>();
  const { user: currentUser } = useAppStore();
  const { colors, isDark } = useThemeColors();

  const [loading, setLoading] = useState(true);
  interface DriverData {
    id: string;
    name: string;
    rating: number;
    totalTrips: number;
    yearsActive: number;
    vehicle: string;
    plate: string;
    color: string;
    trustScore: number;
    ninVerified: boolean;
    licenseVerified: boolean;
    vehicleVerified: boolean;
    backgroundCheck: boolean;
  }
  const [driver, setDriver] = useState<DriverData | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [favoriteLoading, setFavoriteLoading] = useState(false);

  const toggleFavorite = async () => {
    if (!currentUser?.id || !driver?.id || favoriteLoading) return;
    setFavoriteLoading(true);
    try {
      if (isFavorite) {
        await removeFavoriteDriver(currentUser.id, driver.id);
        setIsFavorite(false);
        Alert.alert('Removed', `${driver.name} removed from favorites.`);
      } else {
        await addFavoriteDriver(currentUser.id, driver.id);
        setIsFavorite(true);
        Alert.alert('Saved!', `${driver.name} added to your favorites. You can request them directly next time!`);
      }
    } catch {
      Alert.alert('Error', 'Could not update favorites. Please try again.');
    } finally {
      setFavoriteLoading(false);
    }
  };

  useEffect(() => {
    const load = async () => {
      try {
        let resolvedDriverId = (params.driverId || '').trim();
        if (!resolvedDriverId && params.tripId) {
          const tripRes = await getTrip(params.tripId);
          resolvedDriverId = String(tripRes.data?.driver_id || '').trim();
        }

        if (!resolvedDriverId && params.driver) {
          try {
            const parsed = JSON.parse(params.driver);
            resolvedDriverId = String(parsed?.id || parsed?.driver_id || '').trim();
          } catch {
            // ignore bad serialized payload
          }
        }

        if (!resolvedDriverId) {
          setDriver(null);
          return;
        }

        const [profileRes, statsRes, userRes] = await Promise.all([
          getDriverProfile(resolvedDriverId),
          getDriverStats(resolvedDriverId),
          getUser(resolvedDriverId),
        ]);

        const profile = profileRes.data || {};
        const stats = statsRes.data || {};
        const driverUser = userRes.data || {};

        const verificationFlags = {
          ninVerified: Boolean(profile.nin_verified),
          licenseVerified: Boolean(profile.license_uploaded),
          vehicleVerified: Boolean(profile.vehicle_docs_uploaded),
          backgroundCheck: String(driverUser.verification_status || '').toLowerCase() === 'verified',
        };
        const completedFlags = Object.values(verificationFlags).filter(Boolean).length;
        const trustScore = Math.min(100, Math.max(40, Math.round((Number(stats.rating || 0) / 5) * 60 + completedFlags * 10)));

        setDriver({
          id: resolvedDriverId,
          name: userRes.data?.name || 'Driver',
          rating: Number(stats.rating || userRes.data?.rating || 0),
          totalTrips: Number(stats.total_trips || userRes.data?.total_trips || 0),
          yearsActive: Math.max(0, Math.floor((Date.now() - new Date(userRes.data?.created_at || Date.now()).getTime()) / (1000 * 60 * 60 * 24 * 365))),
          vehicle: profile.vehicle_model || profile.vehicle_type || 'Vehicle',
          plate: profile.vehicle_plate || 'N/A',
          color: profile.vehicle_color || 'N/A',
          trustScore,
          ...verificationFlags,
        });

        if (currentUser?.id) {
          try {
            const favRes = await checkFavoriteDriver(currentUser.id, resolvedDriverId);
            setIsFavorite(favRes.data?.is_favorite === true);
          } catch {}
        }
      } catch (e) {
        console.log('Failed loading driver details:', e);
        setDriver(null);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [params.driverId, params.tripId, params.driver]);

  const allVerified = useMemo(
    () => !!driver && driver.ninVerified && driver.licenseVerified && driver.vehicleVerified && driver.backgroundCheck,
    [driver]
  );

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={[styles.centerText, { color: colors.textMuted }]}>Loading driver details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!driver) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.centered}>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Driver details unavailable</Text>
          <TouchableOpacity style={styles.backAction} onPress={() => router.back()}>
            <Text style={styles.backActionText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Driver Details</Text>
        <TouchableOpacity
          style={styles.favoriteHeaderBtn}
          onPress={toggleFavorite}
          disabled={favoriteLoading}
        >
          <Ionicons
            name={isFavorite ? 'heart' : 'heart-outline'}
            size={26}
            color={isFavorite ? COLORS.error : COLORS.white}
          />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <LinearGradient
            colors={allVerified ? [COLORS.success, COLORS.accentGreen] : [COLORS.warning, COLORS.accent]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.profileGradient}
          >
            <View style={styles.profileTop}>
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>{driver.name.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.profileInfo}>
                <Text style={styles.driverName}>{driver.name}</Text>
                <View style={styles.ratingRow}>
                  <Ionicons name="star" size={18} color={COLORS.accent} />
                  <Text style={styles.ratingText}>
                    {driver.rating != null ? Number(driver.rating).toFixed(1) : 'N/A'}
                  </Text>
                  <Text style={styles.tripsText}>• {driver.totalTrips} trips</Text>
                </View>
                <Text style={styles.experienceText}>🚗 {driver.yearsActive} years active</Text>
              </View>
              <TrustScore score={driver.trustScore} size="large" />
            </View>
          </LinearGradient>

          <View style={[styles.statsRow, { backgroundColor: colors.card }]}>
            <View style={styles.statItem}>
              <Ionicons name="car-sport" size={20} color={COLORS.accentBlue} />
              <Text style={[styles.statValue, { color: colors.text }]}>{driver.totalTrips}</Text>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>Trips</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.statItem}>
              <Ionicons name="star" size={20} color={COLORS.accent} />
              <Text style={[styles.statValue, { color: colors.text }]}>
                {driver.rating != null ? Number(driver.rating).toFixed(1) : 'N/A'}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>Rating</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.statItem}>
              <VerificationBadge
                type="verified"
                status={allVerified ? 'verified' : 'pending'}
                showLabel={false}
              />
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>🛡️ Verification Status</Text>
          <DriverVerificationCard
            driverName={driver.name}
            ninVerified={driver.ninVerified}
            licenseVerified={driver.licenseVerified}
            vehicleVerified={driver.vehicleVerified}
            backgroundCheck={driver.backgroundCheck}
            trustScore={driver.trustScore}
          />
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>🚗 Vehicle Information</Text>
          <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.infoText, { color: colors.text }]}>Model: {driver.vehicle}</Text>
            <Text style={[styles.infoText, { color: colors.text }]}>Plate: {driver.plate}</Text>
            <Text style={[styles.infoText, { color: colors.text }]}>Color: {driver.color}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.favoriteButton, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={toggleFavorite}
          disabled={favoriteLoading}
        >
          <Ionicons
            name={isFavorite ? 'heart' : 'heart-outline'}
            size={22}
            color={isFavorite ? COLORS.error : COLORS.gray600}
          />
          <Text style={[styles.favoriteText, { color: isFavorite ? COLORS.error : colors.text }]}>
            {isFavorite ? 'Saved to Favorites' : 'Add to Favorites'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.requestButton}
          onPress={() => router.push({ pathname: '/rider/book', params: { requestedDriverId: driver.id } })}
        >
          <LinearGradient colors={[COLORS.accentGreen, COLORS.accentBlue]} style={styles.requestGradient}>
            <Ionicons name="car" size={24} color={COLORS.white} />
            <Text style={styles.requestText}>Request This Driver</Text>
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.lightBackground },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.lg },
  centerText: { marginTop: SPACING.sm, color: COLORS.lightTextMuted, fontWeight: '600' },
  emptyTitle: { fontSize: FONT_SIZE.lg, fontWeight: '800', color: COLORS.lightTextPrimary },
  backAction: { marginTop: SPACING.md, backgroundColor: COLORS.primary, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.lg },
  backActionText: { color: COLORS.white, fontWeight: '700' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.primary, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.xl, borderBottomLeftRadius: BORDER_RADIUS.xxl, borderBottomRightRadius: BORDER_RADIUS.xxl },
  backButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: FONT_SIZE.xxl, fontWeight: '900', color: COLORS.white, letterSpacing: -0.5 },
  placeholder: { width: 44 },
  favoriteHeaderBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xxl * 2 },
  profileCard: { marginBottom: SPACING.lg, borderRadius: BORDER_RADIUS.xl, overflow: 'hidden', backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.lightBorder },
  profileGradient: { padding: SPACING.lg },
  profileTop: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  avatarPlaceholder: { width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: COLORS.white },
  avatarText: { fontSize: FONT_SIZE.xxl + 10, fontWeight: '900', color: COLORS.accentGreen },
  profileInfo: { flex: 1 },
  driverName: { fontSize: FONT_SIZE.xxl, fontWeight: '900', color: COLORS.white, marginBottom: SPACING.xs / 2 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginBottom: SPACING.xs / 2 },
  ratingText: { fontSize: FONT_SIZE.md, fontWeight: '900', color: COLORS.white },
  tripsText: { fontSize: FONT_SIZE.sm, fontWeight: '700', color: 'rgba(255,255,255,0.9)' },
  experienceText: { fontSize: FONT_SIZE.sm, fontWeight: '700', color: 'rgba(255,255,255,0.9)' },
  statsRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.md, paddingHorizontal: SPACING.lg, backgroundColor: COLORS.white },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: FONT_SIZE.lg, fontWeight: '900', color: COLORS.lightTextPrimary, marginTop: SPACING.xs / 2 },
  statLabel: { fontSize: FONT_SIZE.xs, fontWeight: '700', color: COLORS.lightTextMuted, marginTop: 2 },
  statDivider: { width: 1, height: 40, backgroundColor: COLORS.lightBorder },
  section: { marginBottom: SPACING.lg },
  sectionTitle: { fontSize: FONT_SIZE.lg, fontWeight: '900', color: COLORS.lightTextPrimary, marginBottom: SPACING.md },
  infoCard: { backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.xl, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.lightBorder, gap: SPACING.md },
  infoText: { fontSize: FONT_SIZE.md, fontWeight: '700', color: COLORS.lightTextPrimary },
  favoriteButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.lg, borderWidth: 1.5, borderColor: COLORS.gray200, backgroundColor: COLORS.white, marginTop: SPACING.md },
  favoriteText: { fontSize: FONT_SIZE.md, fontWeight: '800', color: COLORS.gray600 },
  requestButton: { borderRadius: BORDER_RADIUS.lg, overflow: 'hidden', marginTop: SPACING.sm },
  requestGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.md, paddingVertical: SPACING.md + 4 },
  requestText: { fontSize: FONT_SIZE.lg, fontWeight: '900', color: COLORS.white },
});

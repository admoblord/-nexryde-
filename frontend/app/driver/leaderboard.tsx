import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS, CURRENCY } from '@/src/constants/theme';
import { useAppStore } from '@/src/store/appStore';
import { getDriverLeaderboard } from '@/src/services/api';

const { width } = Dimensions.get('window');

interface LeaderboardEntry {
  rank: number;
  driver_id: string;
  name: string;
  trips: number;
  earnings: number;
  rating: number;
  badge?: 'gold' | 'silver' | 'bronze';
}

export default function LeaderboardScreen() {
  const router = useRouter();
  const { user } = useAppStore();
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [userRank, setUserRank] = useState<LeaderboardEntry | null>(null);

  // Mock data for demo
  const mockLeaderboard: LeaderboardEntry[] = [
    { rank: 1, driver_id: '1', name: 'Chukwuemeka Obi', trips: 187, earnings: 485000, rating: 4.96, badge: 'gold' },
    { rank: 2, driver_id: '2', name: 'Adebayo Johnson', trips: 165, earnings: 425000, rating: 4.92, badge: 'silver' },
    { rank: 3, driver_id: '3', name: 'Ibrahim Musa', trips: 152, earnings: 398000, rating: 4.89, badge: 'bronze' },
    { rank: 4, driver_id: '4', name: 'Oluwaseun Adeleke', trips: 143, earnings: 372000, rating: 4.87 },
    { rank: 5, driver_id: '5', name: 'Emeka Nwankwo', trips: 138, earnings: 358000, rating: 4.85 },
    { rank: 6, driver_id: '6', name: 'Tunde Bakare', trips: 131, earnings: 341000, rating: 4.82 },
    { rank: 7, driver_id: '7', name: 'Yusuf Abdullahi', trips: 125, earnings: 325000, rating: 4.80 },
    { rank: 8, driver_id: '8', name: 'Kingsley Eze', trips: 118, earnings: 307000, rating: 4.78 },
    { rank: 9, driver_id: '9', name: 'Femi Ogundimu', trips: 112, earnings: 291000, rating: 4.75 },
    { rank: 10, driver_id: '10', name: 'Chidi Okeke', trips: 105, earnings: 273000, rating: 4.72 },
  ];

  useEffect(() => {
    loadLeaderboard();
  }, [period]);

  const loadLeaderboard = async () => {
    try {
      // In production, fetch from API
      // const response = await getDriverLeaderboard('lagos', period);
      // setLeaderboard(response.data);
      
      // For demo, use mock data
      setLeaderboard(mockLeaderboard);
      
      // Set user's rank (mock)
      setUserRank({
        rank: 24,
        driver_id: user?.id || '',
        name: user?.name || 'You',
        trips: 45,
        earnings: 117000,
        rating: 4.85,
      });
    } catch (error) {
      console.log('Error loading leaderboard:', error);
      setLeaderboard(mockLeaderboard);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadLeaderboard();
    setRefreshing(false);
  }, [period]);

  const getBadgeIcon = (badge?: string) => {
    switch (badge) {
      case 'gold': return { icon: 'trophy', color: '#FFD700' };
      case 'silver': return { icon: 'trophy', color: '#C0C0C0' };
      case 'bronze': return { icon: 'trophy', color: '#CD7F32' };
      default: return null;
    }
  };

  const renderTopThree = () => (
    <View style={styles.topThreeContainer}>
      {/* Second Place */}
      <View style={styles.topThreeItem}>
        <View style={[styles.topThreeAvatar, styles.silverAvatar]}>
          <Text style={styles.topThreeAvatarText}>{leaderboard[1]?.name?.charAt(0)}</Text>
        </View>
        <View style={styles.silverBadge}>
          <Ionicons name="trophy" size={16} color="#C0C0C0" />
        </View>
        <Text style={styles.topThreeName} numberOfLines={1}>{leaderboard[1]?.name?.split(' ')[0]}</Text>
        <Text style={styles.topThreeTrips}>{leaderboard[1]?.trips} trips</Text>
        <View style={[styles.topThreePodium, styles.silverPodium]}>
          <Text style={styles.podiumRank}>2</Text>
        </View>
      </View>

      {/* First Place */}
      <View style={[styles.topThreeItem, styles.topThreeItemFirst]}>
        <View style={styles.crownBadge}>
          <Ionicons name="crown" size={24} color="#FFD700" />
        </View>
        <View style={[styles.topThreeAvatar, styles.goldAvatar]}>
          <Text style={styles.topThreeAvatarText}>{leaderboard[0]?.name?.charAt(0)}</Text>
        </View>
        <Text style={styles.topThreeName} numberOfLines={1}>{leaderboard[0]?.name?.split(' ')[0]}</Text>
        <Text style={styles.topThreeTrips}>{leaderboard[0]?.trips} trips</Text>
        <View style={[styles.topThreePodium, styles.goldPodium]}>
          <Text style={styles.podiumRank}>1</Text>
        </View>
      </View>

      {/* Third Place */}
      <View style={styles.topThreeItem}>
        <View style={[styles.topThreeAvatar, styles.bronzeAvatar]}>
          <Text style={styles.topThreeAvatarText}>{leaderboard[2]?.name?.charAt(0)}</Text>
        </View>
        <View style={styles.bronzeBadge}>
          <Ionicons name="trophy" size={16} color="#CD7F32" />
        </View>
        <Text style={styles.topThreeName} numberOfLines={1}>{leaderboard[2]?.name?.split(' ')[0]}</Text>
        <Text style={styles.topThreeTrips}>{leaderboard[2]?.trips} trips</Text>
        <View style={[styles.topThreePodium, styles.bronzePodium]}>
          <Text style={styles.podiumRank}>3</Text>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Leaderboard</Text>
        <View style={styles.headerPlaceholder} />
      </View>

      {/* Period Selector */}
      <View style={styles.periodSelector}>
        {(['daily', 'weekly', 'monthly'] as const).map((p) => (
          <TouchableOpacity
            key={p}
            style={[styles.periodButton, period === p && styles.periodButtonActive]}
            onPress={() => setPeriod(p)}
          >
            <Text style={[styles.periodButtonText, period === p && styles.periodButtonTextActive]}>
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Top 3 Podium */}
        {leaderboard.length >= 3 && renderTopThree()}

        {/* Your Position */}
        {userRank && (
          <View style={styles.yourPosition}>
            <Text style={styles.yourPositionLabel}>Your Position</Text>
            <View style={styles.yourPositionCard}>
              <Text style={styles.yourRank}>#{userRank.rank}</Text>
              <View style={styles.yourInfo}>
                <Text style={styles.yourName}>{userRank.name}</Text>
                <Text style={styles.yourStats}>{userRank.trips} trips • {CURRENCY}{userRank.earnings.toLocaleString()}</Text>
              </View>
              <View style={styles.yourRating}>
                <Ionicons name="star" size={14} color={COLORS.accent} />
                <Text style={styles.yourRatingText}>{userRank.rating}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Full Leaderboard */}
        <Text style={styles.sectionTitle}>Top Drivers This {period.charAt(0).toUpperCase() + period.slice(1)}</Text>
        <View style={styles.leaderboardList}>
          {leaderboard.slice(3).map((entry, index) => (
            <View key={entry.driver_id} style={styles.leaderboardItem}>
              <Text style={styles.itemRank}>{entry.rank}</Text>
              <View style={styles.itemAvatar}>
                <Text style={styles.itemAvatarText}>{entry.name.charAt(0)}</Text>
              </View>
              <View style={styles.itemInfo}>
                <Text style={styles.itemName}>{entry.name}</Text>
                <Text style={styles.itemStats}>{entry.trips} trips</Text>
              </View>
              <View style={styles.itemRight}>
                <Text style={styles.itemEarnings}>{CURRENCY}{(entry.earnings / 1000).toFixed(0)}K</Text>
                <View style={styles.itemRating}>
                  <Ionicons name="star" size={12} color={COLORS.accent} />
                  <Text style={styles.itemRatingText}>{entry.rating}</Text>
                </View>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
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
    paddingVertical: SPACING.md,
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
    fontSize: FONT_SIZE.xl,
    fontWeight: '800',
    color: COLORS.white,
  },
  headerPlaceholder: {
    width: 44,
  },
  periodSelector: {
    flexDirection: 'row',
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: BORDER_RADIUS.full,
    padding: 4,
  },
  periodButton: {
    flex: 1,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.full,
  },
  periodButtonActive: {
    backgroundColor: COLORS.accent,
  },
  periodButtonText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.gray400,
  },
  periodButtonTextActive: {
    color: COLORS.primary,
  },
  scrollView: {
    flex: 1,
    backgroundColor: COLORS.gray50,
    borderTopLeftRadius: BORDER_RADIUS.xxxl,
    borderTopRightRadius: BORDER_RADIUS.xxxl,
  },
  content: {
    padding: SPACING.lg,
  },
  // Top Three
  topThreeContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    marginBottom: SPACING.xl,
    paddingTop: SPACING.xl,
  },
  topThreeItem: {
    alignItems: 'center',
    width: (width - SPACING.lg * 2) / 3 - SPACING.sm,
  },
  topThreeItemFirst: {
    marginTop: -SPACING.xl,
  },
  crownBadge: {
    marginBottom: SPACING.xs,
  },
  topThreeAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xs,
    borderWidth: 3,
    borderColor: COLORS.white,
    ...SHADOWS.lg,
  },
  goldAvatar: {
    backgroundColor: '#FFD700',
    width: 70,
    height: 70,
    borderRadius: 35,
  },
  silverAvatar: {
    backgroundColor: '#C0C0C0',
  },
  bronzeAvatar: {
    backgroundColor: '#CD7F32',
  },
  topThreeAvatarText: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '700',
    color: COLORS.primary,
  },
  silverBadge: {
    position: 'absolute',
    top: 45,
    right: '25%',
  },
  bronzeBadge: {
    position: 'absolute',
    top: 45,
    right: '25%',
  },
  topThreeName: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  topThreeTrips: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  topThreePodium: {
    width: '100%',
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
  },
  goldPodium: {
    backgroundColor: '#FFD700',
    paddingVertical: SPACING.lg,
  },
  silverPodium: {
    backgroundColor: '#C0C0C0',
  },
  bronzePodium: {
    backgroundColor: '#CD7F32',
  },
  podiumRank: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '800',
    color: COLORS.primary,
  },
  // Your Position
  yourPosition: {
    marginBottom: SPACING.lg,
  },
  yourPositionLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  yourPositionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.xl,
    ...SHADOWS.lg,
  },
  yourRank: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '800',
    color: COLORS.accent,
    marginRight: SPACING.md,
  },
  yourInfo: {
    flex: 1,
  },
  yourName: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.white,
  },
  yourStats: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.gray400,
  },
  yourRating: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,215,0,0.2)',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
    gap: SPACING.xs,
  },
  yourRatingText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.accent,
  },
  // Leaderboard List
  sectionTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: SPACING.md,
  },
  leaderboardList: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
    ...SHADOWS.sm,
  },
  leaderboardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray100,
  },
  itemRank: {
    width: 30,
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  itemAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.gray200,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  itemAvatarText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  itemStats: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
  itemRight: {
    alignItems: 'flex-end',
  },
  itemEarnings: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.success,
  },
  itemRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  itemRatingText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
  },
  bottomSpacer: {
    height: SPACING.xxl,
  },
});

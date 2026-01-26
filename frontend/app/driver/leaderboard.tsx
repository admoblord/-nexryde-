import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS, CURRENCY } from '@/src/constants/theme';
import { Card, Badge } from '@/src/components/UI';
import { useAppStore } from '@/src/store/appStore';
import { getDriverLeaderboard, getTopRatedDrivers, getDriverStreaks, getActiveChallenges } from '@/src/services/api';

interface LeaderboardEntry {
  rank: number;
  driver_id: string;
  name: string;
  earnings?: number;
  trips?: number;
  rating: number;
}

interface Challenge {
  id: string;
  title: string;
  description: string;
  target_value: number;
  reward_type: string;
  reward_value: string;
}

export default function LeaderboardScreen() {
  const router = useRouter();
  const { user } = useAppStore();
  
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'earnings' | 'rating' | 'challenges'>('earnings');
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [earningsLeaderboard, setEarningsLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [ratingLeaderboard, setRatingLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [streaks, setStreaks] = useState<any>(null);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [period]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [earningsRes, ratingRes, streaksRes, challengesRes] = await Promise.all([
        getDriverLeaderboard('lagos', period),
        getTopRatedDrivers(20),
        user?.id ? getDriverStreaks(user.id) : Promise.resolve({ data: null }),
        getActiveChallenges()
      ]);
      
      setEarningsLeaderboard(earningsRes.data.leaderboard || []);
      setRatingLeaderboard(ratingRes.data.top_rated_drivers || []);
      setStreaks(streaksRes.data);
      setChallenges(challengesRes.data.challenges || []);
    } catch (error) {
      console.log('Error loading leaderboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [period]);

  const getRankIcon = (rank: number) => {
    if (rank === 1) return { icon: 'trophy', color: '#FFD700' };
    if (rank === 2) return { icon: 'medal', color: '#C0C0C0' };
    if (rank === 3) return { icon: 'medal', color: '#CD7F32' };
    return { icon: 'chevron-forward', color: COLORS.gray400 };
  };

  const renderEarningsItem = ({ item, index }: { item: LeaderboardEntry; index: number }) => {
    const isCurrentUser = item.driver_id === user?.id;
    const rankInfo = getRankIcon(item.rank);
    
    return (
      <Card style={[styles.leaderboardItem, isCurrentUser && styles.currentUserItem]}>
        <View style={styles.rankContainer}>
          {item.rank <= 3 ? (
            <Ionicons name={rankInfo.icon as any} size={24} color={rankInfo.color} />
          ) : (
            <Text style={styles.rankNumber}>{item.rank}</Text>
          )}
        </View>
        <View style={styles.driverInfo}>
          <Text style={[styles.driverName, isCurrentUser && styles.currentUserText]}>
            {isCurrentUser ? 'You' : item.name}
          </Text>
          <Text style={styles.driverStats}>
            {item.trips} trips • ⭐ {item.rating?.toFixed(1)}
          </Text>
        </View>
        <Text style={[styles.earnings, isCurrentUser && styles.currentUserText]}>
          {CURRENCY}{item.earnings?.toLocaleString()}
        </Text>
      </Card>
    );
  };

  const renderRatingItem = ({ item, index }: { item: any; index: number }) => {
    const isCurrentUser = item.driver_id === user?.id;
    const rankInfo = getRankIcon(item.rank);
    
    return (
      <Card style={[styles.leaderboardItem, isCurrentUser && styles.currentUserItem]}>
        <View style={styles.rankContainer}>
          {item.rank <= 3 ? (
            <Ionicons name={rankInfo.icon as any} size={24} color={rankInfo.color} />
          ) : (
            <Text style={styles.rankNumber}>{item.rank}</Text>
          )}
        </View>
        <View style={styles.driverInfo}>
          <Text style={[styles.driverName, isCurrentUser && styles.currentUserText]}>
            {isCurrentUser ? 'You' : item.name}
          </Text>
          <Text style={styles.driverStats}>
            {item.total_trips} trips
          </Text>
        </View>
        <View style={styles.ratingContainer}>
          <Ionicons name="star" size={18} color={COLORS.accent} />
          <Text style={styles.ratingText}>{item.rating?.toFixed(1)}</Text>
        </View>
      </Card>
    );
  };

  const renderStreaks = () => (
    <View style={styles.streaksContainer}>
      <Card style={styles.streakCard}>
        <View style={styles.streakHeader}>
          <Ionicons name="flame" size={32} color={COLORS.warning} />
          <View style={styles.streakInfo}>
            <Text style={styles.streakCount}>{streaks?.current_streak || 0}</Text>
            <Text style={styles.streakLabel}>Day Streak</Text>
          </View>
        </View>
        <View style={styles.streakProgress}>
          <Text style={styles.streakProgressText}>
            Best: {streaks?.best_streak || 0} days
          </Text>
        </View>
      </Card>
      
      {/* Badges */}
      <View style={styles.badgesSection}>
        <Text style={styles.sectionTitle}>Earned Badges</Text>
        {streaks?.earned_badges?.length > 0 ? (
          <View style={styles.badgesList}>
            {streaks.earned_badges.map((badge: string, idx: number) => (
              <View key={idx} style={styles.badgeItem}>
                <Text style={styles.badgeIcon}>🏆</Text>
                <Text style={styles.badgeName}>{badge}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.noBadges}>Complete challenges to earn badges!</Text>
        )}
      </View>
      
      {/* Available Badges */}
      <Text style={styles.sectionTitle}>Available Badges</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {streaks?.available_badges?.map((badge: any, idx: number) => (
          <Card key={idx} style={styles.availableBadgeCard}>
            <Text style={styles.availableBadgeIcon}>{badge.icon}</Text>
            <Text style={styles.availableBadgeName}>{badge.name}</Text>
            <Text style={styles.availableBadgeReq}>{badge.requirement}</Text>
          </Card>
        ))}
      </ScrollView>
    </View>
  );

  const renderChallenges = () => (
    <View style={styles.challengesContainer}>
      {challenges.length === 0 ? (
        <Card style={styles.noChallengesCard}>
          <Ionicons name="trophy-outline" size={48} color={COLORS.gray400} />
          <Text style={styles.noChallengesText}>No active challenges</Text>
          <Text style={styles.noChallengesSubtext}>Check back for new challenges!</Text>
        </Card>
      ) : (
        challenges.map((challenge, idx) => (
          <Card key={idx} style={styles.challengeCard}>
            <View style={styles.challengeHeader}>
              <Ionicons name="flag" size={24} color={COLORS.primary} />
              <View style={styles.challengeInfo}>
                <Text style={styles.challengeTitle}>{challenge.title}</Text>
                <Text style={styles.challengeDesc}>{challenge.description}</Text>
              </View>
            </View>
            <View style={styles.challengeReward}>
              <Ionicons name="gift" size={16} color={COLORS.success} />
              <Text style={styles.rewardText}>{challenge.reward_value}</Text>
            </View>
          </Card>
        ))
      )}
      
      {/* Render streaks in challenges tab too */}
      {renderStreaks()}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Leaderboard</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'earnings' && styles.tabActive]}
          onPress={() => setActiveTab('earnings')}
        >
          <Ionicons 
            name="cash" 
            size={18} 
            color={activeTab === 'earnings' ? COLORS.primary : COLORS.gray500} 
          />
          <Text style={[styles.tabText, activeTab === 'earnings' && styles.tabTextActive]}>
            Earnings
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'rating' && styles.tabActive]}
          onPress={() => setActiveTab('rating')}
        >
          <Ionicons 
            name="star" 
            size={18} 
            color={activeTab === 'rating' ? COLORS.primary : COLORS.gray500} 
          />
          <Text style={[styles.tabText, activeTab === 'rating' && styles.tabTextActive]}>
            Rating
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'challenges' && styles.tabActive]}
          onPress={() => setActiveTab('challenges')}
        >
          <Ionicons 
            name="trophy" 
            size={18} 
            color={activeTab === 'challenges' ? COLORS.primary : COLORS.gray500} 
          />
          <Text style={[styles.tabText, activeTab === 'challenges' && styles.tabTextActive]}>
            Challenges
          </Text>
        </TouchableOpacity>
      </View>

      {/* Period Filter (for earnings) */}
      {activeTab === 'earnings' && (
        <View style={styles.periodFilter}>
          {(['daily', 'weekly', 'monthly'] as const).map((p) => (
            <TouchableOpacity
              key={p}
              style={[styles.periodOption, period === p && styles.periodOptionActive]}
              onPress={() => setPeriod(p)}
            >
              <Text style={[styles.periodText, period === p && styles.periodTextActive]}>
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Content */}
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {activeTab === 'earnings' && (
          <FlatList
            data={earningsLeaderboard}
            renderItem={renderEarningsItem}
            keyExtractor={(item) => item.driver_id}
            scrollEnabled={false}
            ListEmptyComponent={
              <Card style={styles.emptyCard}>
                <Ionicons name="trophy-outline" size={48} color={COLORS.gray400} />
                <Text style={styles.emptyText}>No data available</Text>
              </Card>
            }
          />
        )}
        
        {activeTab === 'rating' && (
          <FlatList
            data={ratingLeaderboard}
            renderItem={renderRatingItem}
            keyExtractor={(item) => item.driver_id}
            scrollEnabled={false}
            ListEmptyComponent={
              <Card style={styles.emptyCard}>
                <Ionicons name="star-outline" size={48} color={COLORS.gray400} />
                <Text style={styles.emptyText}>No data available</Text>
              </Card>
            }
          />
        )}
        
        {activeTab === 'challenges' && renderChallenges()}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
    ...SHADOWS.sm,
  },
  title: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.md,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.gray100,
    marginHorizontal: SPACING.xs,
  },
  tabActive: {
    backgroundColor: COLORS.primary + '20',
  },
  tabText: {
    marginLeft: SPACING.xs,
    fontSize: FONT_SIZE.sm,
    color: COLORS.gray500,
    fontWeight: '600',
  },
  tabTextActive: {
    color: COLORS.primary,
  },
  periodFilter: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.md,
  },
  periodOption: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
    marginRight: SPACING.sm,
    backgroundColor: COLORS.gray100,
  },
  periodOptionActive: {
    backgroundColor: COLORS.primary,
  },
  periodText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
  periodTextActive: {
    color: COLORS.white,
    fontWeight: '600',
  },
  content: {
    padding: SPACING.md,
    paddingBottom: SPACING.xxl,
  },
  leaderboardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  currentUserItem: {
    borderWidth: 2,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + '10',
  },
  rankContainer: {
    width: 40,
    alignItems: 'center',
  },
  rankNumber: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  driverInfo: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  driverName: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  currentUserText: {
    color: COLORS.primary,
  },
  driverStats: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
  earnings: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.success,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingText: {
    marginLeft: SPACING.xs,
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.accent,
  },
  emptyCard: {
    alignItems: 'center',
    padding: SPACING.xl,
  },
  emptyText: {
    marginTop: SPACING.md,
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
  },
  streaksContainer: {
    marginTop: SPACING.lg,
  },
  streakCard: {
    padding: SPACING.lg,
  },
  streakHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  streakInfo: {
    marginLeft: SPACING.md,
  },
  streakCount: {
    fontSize: 48,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  streakLabel: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
  streakProgress: {
    marginTop: SPACING.md,
  },
  streakProgressText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
  badgesSection: {
    marginTop: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: SPACING.md,
  },
  badgesList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  badgeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.accent + '20',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
  },
  badgeIcon: {
    fontSize: 16,
    marginRight: SPACING.xs,
  },
  badgeName: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.accent,
    fontWeight: '600',
  },
  noBadges: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
  },
  availableBadgeCard: {
    alignItems: 'center',
    padding: SPACING.md,
    marginRight: SPACING.md,
    width: 120,
  },
  availableBadgeIcon: {
    fontSize: 32,
    marginBottom: SPACING.xs,
  },
  availableBadgeName: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  availableBadgeReq: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SPACING.xs,
  },
  challengesContainer: {
    gap: SPACING.md,
  },
  noChallengesCard: {
    alignItems: 'center',
    padding: SPACING.xl,
  },
  noChallengesText: {
    marginTop: SPACING.md,
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  noChallengesSubtext: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
  challengeCard: {},
  challengeHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  challengeInfo: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  challengeTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  challengeDesc: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  challengeReward: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray200,
  },
  rewardText: {
    marginLeft: SPACING.xs,
    fontSize: FONT_SIZE.sm,
    color: COLORS.success,
    fontWeight: '600',
  },
});

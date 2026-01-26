import React, { useState, useEffect } from 'react';
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

const { width } = Dimensions.get('window');

interface Challenge {
  id: string;
  type: 'daily' | 'weekly' | 'special';
  title: string;
  description: string;
  target: number;
  current: number;
  reward: string;
  rewardAmount?: number;
  expiresAt: string;
  icon: string;
  color: string;
  completed: boolean;
}

export default function ChallengesScreen() {
  const router = useRouter();
  const { user } = useAppStore();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTab, setSelectedTab] = useState<'active' | 'completed'>('active');

  // Mock challenges data
  const challenges: Challenge[] = [
    {
      id: '1',
      type: 'daily',
      title: 'Early Bird',
      description: 'Complete 5 rides before 9 AM',
      target: 5,
      current: 3,
      reward: '+₦2,000 bonus',
      rewardAmount: 2000,
      expiresAt: 'Today 11:59 PM',
      icon: 'sunny',
      color: COLORS.warning,
      completed: false,
    },
    {
      id: '2',
      type: 'daily',
      title: 'Trip Master',
      description: 'Complete 10 rides today',
      target: 10,
      current: 6,
      reward: '+₦3,500 bonus',
      rewardAmount: 3500,
      expiresAt: 'Today 11:59 PM',
      icon: 'car',
      color: COLORS.info,
      completed: false,
    },
    {
      id: '3',
      type: 'weekly',
      title: 'Century Club',
      description: 'Complete 100 trips this week',
      target: 100,
      current: 45,
      reward: '+₦25,000 bonus',
      rewardAmount: 25000,
      expiresAt: 'Sunday 11:59 PM',
      icon: 'trophy',
      color: COLORS.accent,
      completed: false,
    },
    {
      id: '4',
      type: 'weekly',
      title: 'High Earner',
      description: 'Earn ₦200,000 this week',
      target: 200000,
      current: 117000,
      reward: '+₦15,000 bonus',
      rewardAmount: 15000,
      expiresAt: 'Sunday 11:59 PM',
      icon: 'cash',
      color: COLORS.success,
      completed: false,
    },
    {
      id: '5',
      type: 'special',
      title: '5-Star Streak',
      description: 'Get 10 consecutive 5-star ratings',
      target: 10,
      current: 7,
      reward: 'Gold Badge + ₦10,000',
      rewardAmount: 10000,
      expiresAt: 'No expiry',
      icon: 'star',
      color: '#FFD700',
      completed: false,
    },
    {
      id: '6',
      type: 'special',
      title: 'Peak Hours Hero',
      description: 'Complete 20 trips during peak hours',
      target: 20,
      current: 12,
      reward: 'Priority Badge + ₦5,000',
      rewardAmount: 5000,
      expiresAt: 'This month',
      icon: 'time',
      color: COLORS.error,
      completed: false,
    },
  ];

  const completedChallenges: Challenge[] = [
    {
      id: '7',
      type: 'daily',
      title: 'First Ride',
      description: 'Complete your first ride of the day',
      target: 1,
      current: 1,
      reward: '+₦500 bonus',
      expiresAt: 'Completed',
      icon: 'flag',
      color: COLORS.success,
      completed: true,
    },
    {
      id: '8',
      type: 'weekly',
      title: 'Weekend Warrior',
      description: 'Complete 30 trips over the weekend',
      target: 30,
      current: 30,
      reward: '+₦8,000 bonus',
      expiresAt: 'Completed',
      icon: 'calendar',
      color: COLORS.info,
      completed: true,
    },
  ];

  const onRefresh = async () => {
    setRefreshing(true);
    // Refresh challenges from API
    await new Promise(resolve => setTimeout(resolve, 1000));
    setRefreshing(false);
  };

  const getProgress = (current: number, target: number) => {
    return Math.min((current / target) * 100, 100);
  };

  const formatTarget = (value: number) => {
    if (value >= 1000) {
      return `${CURRENCY}${(value / 1000).toFixed(0)}K`;
    }
    return value.toString();
  };

  const renderChallengeCard = (challenge: Challenge) => (
    <View key={challenge.id} style={styles.challengeCard}>
      <View style={styles.challengeHeader}>
        <View style={[styles.challengeIcon, { backgroundColor: challenge.color + '20' }]}>
          <Ionicons name={challenge.icon as any} size={24} color={challenge.color} />
        </View>
        <View style={styles.challengeInfo}>
          <View style={styles.challengeTitleRow}>
            <Text style={styles.challengeTitle}>{challenge.title}</Text>
            <View style={[styles.typeBadge, { backgroundColor: 
              challenge.type === 'daily' ? COLORS.infoSoft :
              challenge.type === 'weekly' ? COLORS.accentSoft :
              COLORS.errorSoft
            }]}>
              <Text style={[styles.typeBadgeText, { color:
                challenge.type === 'daily' ? COLORS.info :
                challenge.type === 'weekly' ? COLORS.accent :
                COLORS.error
              }]}>
                {challenge.type.charAt(0).toUpperCase() + challenge.type.slice(1)}
              </Text>
            </View>
          </View>
          <Text style={styles.challengeDesc}>{challenge.description}</Text>
        </View>
      </View>

      {/* Progress Bar */}
      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View 
            style={[
              styles.progressFill, 
              { 
                width: `${getProgress(challenge.current, challenge.target)}%`,
                backgroundColor: challenge.completed ? COLORS.success : challenge.color
              }
            ]} 
          />
        </View>
        <View style={styles.progressLabels}>
          <Text style={styles.progressText}>
            {challenge.target >= 1000 
              ? `${CURRENCY}${(challenge.current / 1000).toFixed(0)}K / ${formatTarget(challenge.target)}`
              : `${challenge.current} / ${challenge.target}`
            }
          </Text>
          <Text style={styles.progressPercent}>{Math.round(getProgress(challenge.current, challenge.target))}%</Text>
        </View>
      </View>

      {/* Reward & Expiry */}
      <View style={styles.challengeFooter}>
        <View style={styles.rewardContainer}>
          <Ionicons name="gift" size={16} color={COLORS.success} />
          <Text style={styles.rewardText}>{challenge.reward}</Text>
        </View>
        <View style={styles.expiryContainer}>
          <Ionicons name="time" size={14} color={COLORS.gray400} />
          <Text style={styles.expiryText}>{challenge.expiresAt}</Text>
        </View>
      </View>

      {challenge.completed && (
        <View style={styles.completedOverlay}>
          <View style={styles.completedBadge}>
            <Ionicons name="checkmark-circle" size={32} color={COLORS.success} />
            <Text style={styles.completedText}>Completed!</Text>
          </View>
        </View>
      )}
    </View>
  );

  const activeChallenges = challenges.filter(c => !c.completed);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Challenges</Text>
        <View style={styles.headerPlaceholder} />
      </View>

      {/* Stats Banner */}
      <View style={styles.statsBanner}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{activeChallenges.length}</Text>
          <Text style={styles.statLabel}>Active</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{completedChallenges.length}</Text>
          <Text style={styles.statLabel}>Completed</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: COLORS.accent }]}>₦58.5K</Text>
          <Text style={styles.statLabel}>Earned</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, selectedTab === 'active' && styles.tabActive]}
          onPress={() => setSelectedTab('active')}
        >
          <Text style={[styles.tabText, selectedTab === 'active' && styles.tabTextActive]}>
            Active ({activeChallenges.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, selectedTab === 'completed' && styles.tabActive]}
          onPress={() => setSelectedTab('completed')}
        >
          <Text style={[styles.tabText, selectedTab === 'completed' && styles.tabTextActive]}>
            Completed ({completedChallenges.length})
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />
        }
        showsVerticalScrollIndicator={false}
      >
        {selectedTab === 'active' ? (
          <>
            {/* Daily Challenges */}
            <Text style={styles.sectionTitle}>🌟 Daily Challenges</Text>
            {activeChallenges.filter(c => c.type === 'daily').map(renderChallengeCard)}

            {/* Weekly Challenges */}
            <Text style={styles.sectionTitle}>📅 Weekly Challenges</Text>
            {activeChallenges.filter(c => c.type === 'weekly').map(renderChallengeCard)}

            {/* Special Challenges */}
            <Text style={styles.sectionTitle}>✨ Special Challenges</Text>
            {activeChallenges.filter(c => c.type === 'special').map(renderChallengeCard)}
          </>
        ) : (
          <>
            <Text style={styles.sectionTitle}>✅ Completed Challenges</Text>
            {completedChallenges.map(renderChallengeCard)}
          </>
        )}

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
  statsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginHorizontal: SPACING.lg,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.xl,
    marginBottom: SPACING.md,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '700',
    color: COLORS.white,
  },
  statLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.gray400,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    backgroundColor: 'rgba(255,255,255,0.1)',
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
    backgroundColor: COLORS.accent,
  },
  tabText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.gray400,
  },
  tabTextActive: {
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
  sectionTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: SPACING.md,
    marginBottom: SPACING.md,
  },
  challengeCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    ...SHADOWS.sm,
    position: 'relative',
    overflow: 'hidden',
  },
  challengeHeader: {
    flexDirection: 'row',
    marginBottom: SPACING.md,
  },
  challengeIcon: {
    width: 48,
    height: 48,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  challengeInfo: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  challengeTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  challengeTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  typeBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.full,
  },
  typeBadgeText: {
    fontSize: FONT_SIZE.xxs,
    fontWeight: '600',
  },
  challengeDesc: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  progressContainer: {
    marginBottom: SPACING.md,
  },
  progressBar: {
    height: 8,
    backgroundColor: COLORS.gray100,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACING.xs,
  },
  progressText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
  progressPercent: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  challengeFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rewardContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.successSoft,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
    gap: SPACING.xs,
  },
  rewardText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.success,
  },
  expiryContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  expiryText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.gray400,
  },
  completedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  completedBadge: {
    alignItems: 'center',
  },
  completedText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.success,
    marginTop: SPACING.xs,
  },
  bottomSpacer: {
    height: SPACING.xxl,
  },
});

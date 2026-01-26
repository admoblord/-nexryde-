import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS, CURRENCY } from '@/src/constants/theme';
import { FallingRoses, RosePetalsStatic, RoseGlow, FloatingRoseBloom } from '@/src/components/FallingRoses';

const { width } = Dimensions.get('window');

export default function ChallengesScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'active' | 'completed'>('active');

  const challenges = {
    active: [
      {
        id: 1,
        title: 'Early Bird',
        description: 'Complete 5 trips before 9 AM',
        progress: 3,
        total: 5,
        reward: 5000,
        type: 'daily',
        icon: 'sunny',
        color: COLORS.gold,
      },
      {
        id: 2,
        title: 'Rose Rider',
        description: 'Complete 10 trips today',
        progress: 7,
        total: 10,
        reward: 8000,
        type: 'daily',
        icon: 'flower',
        color: COLORS.rosePetal3,
      },
      {
        id: 3,
        title: 'Weekly Warrior',
        description: 'Complete 50 trips this week',
        progress: 32,
        total: 50,
        reward: 25000,
        type: 'weekly',
        icon: 'trophy',
        color: COLORS.accent,
      },
      {
        id: 4,
        title: '5-Star Excellence',
        description: 'Maintain 5.0 rating for 20 trips',
        progress: 15,
        total: 20,
        reward: 15000,
        type: 'weekly',
        icon: 'star',
        color: COLORS.gold,
      },
    ],
    completed: [
      {
        id: 5,
        title: 'First Ride',
        description: 'Complete your first trip',
        progress: 1,
        total: 1,
        reward: 2000,
        type: 'milestone',
        icon: 'rocket',
        color: COLORS.success,
      },
      {
        id: 6,
        title: 'Peak Hours Pro',
        description: 'Complete 3 trips during peak hours',
        progress: 3,
        total: 3,
        reward: 6000,
        type: 'daily',
        icon: 'time',
        color: COLORS.info,
      },
    ],
  };

  const totalEarned = challenges.completed.reduce((sum, c) => sum + c.reward, 0);
  const currentChallenges = activeTab === 'active' ? challenges.active : challenges.completed;

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[COLORS.primary, COLORS.primaryDark, COLORS.primary]}
        style={StyleSheet.absoluteFillObject}
      />
      
      {/* Background Effects */}
      <RosePetalsStatic count={15} />
      <FallingRoses intensity="light" />
      <RoseGlow size={250} style={styles.glowTopLeft} />
      <RoseGlow size={200} color={COLORS.gold} style={styles.glowBottomRight} />
      
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={COLORS.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Challenges</Text>
          <View style={styles.headerRight} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Hero Stats Card */}
          <View style={styles.heroCard}>
            <LinearGradient
              colors={[COLORS.rosePetal4, COLORS.rosePetal5]}
              style={styles.heroGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              {/* Floating Rose Bloom */}
              <View style={styles.heroBloom}>
                <FloatingRoseBloom />
              </View>
              
              <View style={styles.heroContent}>
                <Text style={styles.heroLabel}>Total Rewards Earned</Text>
                <Text style={styles.heroValue}>{CURRENCY}{totalEarned.toLocaleString()}</Text>
              </View>
              
              <View style={styles.heroStats}>
                <View style={styles.heroStat}>
                  <Text style={styles.heroStatValue}>{challenges.active.length}</Text>
                  <Text style={styles.heroStatLabel}>Active</Text>
                </View>
                <View style={styles.heroStatDivider} />
                <View style={styles.heroStat}>
                  <Text style={styles.heroStatValue}>{challenges.completed.length}</Text>
                  <Text style={styles.heroStatLabel}>Completed</Text>
                </View>
                <View style={styles.heroStatDivider} />
                <View style={styles.heroStat}>
                  <Text style={styles.heroStatValue}>{CURRENCY}58.5K</Text>
                  <Text style={styles.heroStatLabel}>Potential</Text>
                </View>
              </View>
            </LinearGradient>
          </View>

          {/* Tab Selector */}
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'active' && styles.tabActive]}
              onPress={() => setActiveTab('active')}
            >
              <Text style={[styles.tabText, activeTab === 'active' && styles.tabTextActive]}>
                Active ({challenges.active.length})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'completed' && styles.tabActive]}
              onPress={() => setActiveTab('completed')}
            >
              <Text style={[styles.tabText, activeTab === 'completed' && styles.tabTextActive]}>
                Completed ({challenges.completed.length})
              </Text>
            </TouchableOpacity>
          </View>

          {/* Challenges List */}
          <View style={styles.challengesList}>
            {currentChallenges.map((challenge) => (
              <View key={challenge.id} style={styles.challengeCard}>
                <LinearGradient
                  colors={[COLORS.surface, COLORS.surfaceLight]}
                  style={styles.challengeGradient}
                >
                  {/* Type Badge */}
                  <View style={[styles.typeBadge, { backgroundColor: `${challenge.color}20` }]}>
                    <Text style={[styles.typeBadgeText, { color: challenge.color }]}>
                      {challenge.type.toUpperCase()}
                    </Text>
                  </View>

                  <View style={styles.challengeContent}>
                    {/* Icon */}
                    <View style={[styles.challengeIcon, { backgroundColor: `${challenge.color}20` }]}>
                      <Ionicons name={challenge.icon as any} size={26} color={challenge.color} />
                    </View>

                    {/* Info */}
                    <View style={styles.challengeInfo}>
                      <Text style={styles.challengeTitle}>{challenge.title}</Text>
                      <Text style={styles.challengeDesc}>{challenge.description}</Text>
                      
                      {/* Progress Bar */}
                      <View style={styles.progressContainer}>
                        <View style={styles.progressBar}>
                          <View 
                            style={[
                              styles.progressFill, 
                              { 
                                width: `${(challenge.progress / challenge.total) * 100}%`,
                                backgroundColor: challenge.color,
                              }
                            ]} 
                          />
                        </View>
                        <Text style={styles.progressText}>
                          {challenge.progress}/{challenge.total}
                        </Text>
                      </View>
                    </View>

                    {/* Reward */}
                    <View style={styles.rewardContainer}>
                      <View style={styles.rewardBadge}>
                        <Text style={styles.rewardAmount}>{CURRENCY}{challenge.reward.toLocaleString()}</Text>
                      </View>
                      {activeTab === 'completed' && (
                        <View style={styles.completedBadge}>
                          <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
                        </View>
                      )}
                    </View>
                  </View>
                </LinearGradient>
              </View>
            ))}
          </View>

          {/* Rose Motivation Section */}
          <View style={styles.motivationCard}>
            <View style={styles.motivationRose}>
              <View style={styles.roseCenter}>
                {[0, 1, 2, 3, 4].map((i) => (
                  <View
                    key={i}
                    style={[
                      styles.motivationPetal,
                      {
                        transform: [{ rotate: `${i * 72}deg` }, { translateY: -15 }],
                        backgroundColor: COLORS.rosePetal3,
                        opacity: 0.7 + i * 0.06,
                      },
                    ]}
                  />
                ))}
              </View>
            </View>
            <View style={styles.motivationContent}>
              <Text style={styles.motivationTitle}>Keep Blooming! 🌹</Text>
              <Text style={styles.motivationText}>
                Complete more challenges to unlock exclusive rewards and climb the leaderboard
              </Text>
            </View>
          </View>

          <View style={styles.bottomSpacer} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.primary,
  },
  glowTopLeft: {
    position: 'absolute',
    top: -80,
    left: -80,
  },
  glowBottomRight: {
    position: 'absolute',
    bottom: 100,
    right: -80,
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
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '800',
    color: COLORS.white,
  },
  headerRight: {
    width: 44,
  },
  heroCard: {
    marginHorizontal: SPACING.lg,
    borderRadius: BORDER_RADIUS.xxl,
    overflow: 'hidden',
    ...SHADOWS.rose,
  },
  heroGradient: {
    padding: SPACING.xl,
    position: 'relative',
  },
  heroBloom: {
    position: 'absolute',
    top: 10,
    right: 10,
    opacity: 0.4,
  },
  heroContent: {
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  heroLabel: {
    fontSize: FONT_SIZE.sm,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: SPACING.xs,
  },
  heroValue: {
    fontSize: FONT_SIZE.hero,
    fontWeight: '900',
    color: COLORS.white,
  },
  heroStats: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
  },
  heroStat: {
    flex: 1,
    alignItems: 'center',
  },
  heroStatValue: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '800',
    color: COLORS.white,
  },
  heroStatLabel: {
    fontSize: FONT_SIZE.xs,
    color: 'rgba(255,255,255,0.7)',
  },
  heroStatDivider: {
    width: 1,
    height: 30,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.xl,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xs,
  },
  tab: {
    flex: 1,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.lg,
  },
  tabActive: {
    backgroundColor: COLORS.accent,
  },
  tabText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  tabTextActive: {
    color: COLORS.primary,
  },
  challengesList: {
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    gap: SPACING.md,
  },
  challengeCard: {
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
    ...SHADOWS.md,
  },
  challengeGradient: {
    padding: SPACING.md,
  },
  typeBadge: {
    position: 'absolute',
    top: SPACING.md,
    right: SPACING.md,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.sm,
  },
  typeBadgeText: {
    fontSize: 9,
    fontWeight: '800',
  },
  challengeContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  challengeIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  challengeInfo: {
    flex: 1,
  },
  challengeTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.white,
  },
  challengeDesc: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textMuted,
    marginBottom: SPACING.sm,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  progressBar: {
    flex: 1,
    height: 6,
    backgroundColor: COLORS.gray700,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    color: COLORS.textSecondary,
    minWidth: 35,
  },
  rewardContainer: {
    alignItems: 'center',
    marginLeft: SPACING.sm,
  },
  rewardBadge: {
    backgroundColor: COLORS.goldSoft,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.md,
  },
  rewardAmount: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '800',
    color: COLORS.gold,
  },
  completedBadge: {
    marginTop: SPACING.xs,
  },
  motivationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.xl,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.accentSoft,
  },
  motivationRose: {
    marginRight: SPACING.md,
  },
  roseCenter: {
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  motivationPetal: {
    position: 'absolute',
    width: 14,
    height: 18,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 14,
  },
  motivationContent: {
    flex: 1,
  },
  motivationTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: 2,
  },
  motivationText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textMuted,
    lineHeight: 18,
  },
  bottomSpacer: {
    height: 40,
  },
});

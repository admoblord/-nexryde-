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
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';

interface Badge {
  id: string;
  name: string;
  description: string;
  icon: any;
  color: string;
  level: number;
  progress: number;
  total: number;
  unlocked: boolean;
  reward: string;
  category: string;
}

export default function BadgesScreen() {
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState('all');

  const badges: Badge[] = [
    // Earnings Badges
    {
      id: '1',
      name: 'First Naira',
      description: 'Complete your first trip',
      icon: 'cash',
      color: '#10B981',
      level: 1,
      progress: 1,
      total: 1,
      unlocked: true,
      reward: '₦500 bonus',
      category: 'earnings',
    },
    {
      id: '2',
      name: 'Money Maker',
      description: 'Earn ₦100,000 total',
      icon: 'wallet',
      color: '#F59E0B',
      level: 2,
      progress: 85000,
      total: 100000,
      unlocked: false,
      reward: '₦2,000 bonus',
      category: 'earnings',
    },
    {
      id: '3',
      name: 'Millionaire',
      description: 'Earn ₦1,000,000 total',
      icon: 'trophy',
      color: '#EF4444',
      level: 5,
      progress: 85000,
      total: 1000000,
      unlocked: false,
      reward: '₦10,000 bonus',
      category: 'earnings',
    },
    // Trips Badges
    {
      id: '4',
      name: 'Road Warrior',
      description: 'Complete 50 trips',
      icon: 'car-sport',
      color: '#3B82F6',
      level: 2,
      progress: 42,
      total: 50,
      unlocked: false,
      reward: '₦1,500 bonus',
      category: 'trips',
    },
    {
      id: '5',
      name: 'Century Club',
      description: 'Complete 100 trips',
      icon: 'ribbon',
      color: '#8B5CF6',
      level: 3,
      progress: 42,
      total: 100,
      unlocked: false,
      reward: '₦3,000 bonus',
      category: 'trips',
    },
    {
      id: '6',
      name: 'Legend',
      description: 'Complete 1,000 trips',
      icon: 'star',
      color: '#EC4899',
      level: 5,
      progress: 42,
      total: 1000,
      unlocked: false,
      reward: '₦20,000 bonus',
      category: 'trips',
    },
    // Rating Badges
    {
      id: '7',
      name: '5-Star Pro',
      description: 'Maintain 5.0 rating for 20 trips',
      icon: 'star-outline',
      color: '#FBBF24',
      level: 3,
      progress: 12,
      total: 20,
      unlocked: false,
      reward: 'Priority rides',
      category: 'rating',
    },
    {
      id: '8',
      name: 'Perfect Week',
      description: 'Get 5 stars on every trip this week',
      icon: 'thumbs-up',
      color: '#34D399',
      level: 2,
      progress: 5,
      total: 7,
      unlocked: false,
      reward: '₦1,000 bonus',
      category: 'rating',
    },
    // Special Badges
    {
      id: '9',
      name: 'Early Bird',
      description: 'Complete 20 trips before 8am',
      icon: 'sunny',
      color: '#F59E0B',
      level: 2,
      progress: 8,
      total: 20,
      unlocked: false,
      reward: '₦1,000 bonus',
      category: 'special',
    },
    {
      id: '10',
      name: 'Night Owl',
      description: 'Complete 20 trips after 10pm',
      icon: 'moon',
      color: '#6366F1',
      level: 2,
      progress: 3,
      total: 20,
      unlocked: false,
      reward: '₦1,000 bonus',
      category: 'special',
    },
    {
      id: '11',
      name: 'Weekend Warrior',
      description: 'Work every weekend for a month',
      icon: 'calendar',
      color: '#14B8A6',
      level: 3,
      progress: 2,
      total: 4,
      unlocked: false,
      reward: '₦2,500 bonus',
      category: 'special',
    },
    {
      id: '12',
      name: 'Fuel Master',
      description: 'Achieve 15+ km/L efficiency',
      icon: 'leaf',
      color: '#22C55E',
      level: 2,
      progress: 12.5,
      total: 15,
      unlocked: false,
      reward: 'Eco badge',
      category: 'special',
    },
  ];

  const categories = [
    { id: 'all', name: 'All', icon: 'grid' },
    { id: 'earnings', name: 'Earnings', icon: 'cash' },
    { id: 'trips', name: 'Trips', icon: 'car' },
    { id: 'rating', name: 'Rating', icon: 'star' },
    { id: 'special', name: 'Special', icon: 'sparkles' },
  ];

  const filteredBadges = selectedCategory === 'all' 
    ? badges 
    : badges.filter(b => b.category === selectedCategory);

  const unlockedCount = badges.filter(b => b.unlocked).length;
  const totalBadges = badges.length;

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[COLORS.primary, COLORS.primaryDark]}
        style={StyleSheet.absoluteFillObject}
      />

      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={COLORS.white} />
          </TouchableOpacity>
          <View style={styles.headerTitle}>
            <Ionicons name="trophy" size={28} color={COLORS.white} />
            <Text style={styles.headerText}>Badges & Achievements</Text>
          </View>
          <View style={styles.backButton} />
        </View>

        {/* Progress Card */}
        <View style={styles.progressCard}>
          <LinearGradient
            colors={[COLORS.accentGreen, COLORS.accentGreenDark]}
            style={styles.progressGradient}
          >
            <Text style={styles.progressTitle}>Your Progress</Text>
            <Text style={styles.progressValue}>{unlockedCount}/{totalBadges}</Text>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${(unlockedCount/totalBadges)*100}%` }]} />
            </View>
            <Text style={styles.progressLabel}>
              {totalBadges - unlockedCount} more badges to unlock!
            </Text>
          </LinearGradient>
        </View>

        {/* Categories */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoriesScroll}
          contentContainerStyle={styles.categoriesContent}
        >
          {categories.map((cat) => (
            <TouchableOpacity
              key={cat.id}
              style={[
                styles.categoryButton,
                selectedCategory === cat.id && styles.categoryButtonActive,
              ]}
              onPress={() => setSelectedCategory(cat.id)}
            >
              <Ionicons
                name={cat.icon as any}
                size={20}
                color={selectedCategory === cat.id ? COLORS.white : COLORS.lightTextMuted}
              />
              <Text
                style={[
                  styles.categoryText,
                  selectedCategory === cat.id && styles.categoryTextActive,
                ]}
              >
                {cat.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Badges Grid */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {filteredBadges.map((badge) => (
            <View key={badge.id} style={styles.badgeCard}>
              <View style={[styles.badgeIconContainer, !badge.unlocked && styles.badgeLocked]}>
                <LinearGradient
                  colors={badge.unlocked ? [badge.color, `${badge.color}CC`] : ['#9CA3AF', '#6B7280']}
                  style={styles.badgeIconGradient}
                >
                  <Ionicons
                    name={badge.icon as any}
                    size={32}
                    color={COLORS.white}
                  />
                  {badge.unlocked && (
                    <View style={styles.unlockedBadge}>
                      <Ionicons name="checkmark-circle" size={20} color={COLORS.accentGreen} />
                    </View>
                  )}
                </LinearGradient>
              </View>

              <View style={styles.badgeContent}>
                <View style={styles.badgeHeader}>
                  <Text style={styles.badgeName}>{badge.name}</Text>
                  <View style={styles.levelBadge}>
                    <Text style={styles.levelText}>Lv.{badge.level}</Text>
                  </View>
                </View>
                <Text style={styles.badgeDescription}>{badge.description}</Text>

                {!badge.unlocked && (
                  <View style={styles.progressSection}>
                    <View style={styles.progressInfo}>
                      <Text style={styles.progressText}>
                        {badge.progress.toLocaleString()} / {badge.total.toLocaleString()}
                      </Text>
                      <Text style={styles.progressPercentage}>
                        {Math.round((badge.progress / badge.total) * 100)}%
                      </Text>
                    </View>
                    <View style={styles.badgeProgressBar}>
                      <View
                        style={[
                          styles.badgeProgressFill,
                          { width: `${(badge.progress / badge.total) * 100}%`, backgroundColor: badge.color }
                        ]}
                      />
                    </View>
                  </View>
                )}

                <View style={styles.rewardSection}>
                  <Ionicons name="gift" size={16} color={badge.unlocked ? COLORS.accentGreen : COLORS.lightTextMuted} />
                  <Text style={[styles.rewardText, badge.unlocked && styles.rewardTextUnlocked]}>
                    Reward: {badge.reward}
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  headerText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.white,
  },
  progressCard: {
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
  },
  progressGradient: {
    padding: SPACING.lg,
    alignItems: 'center',
  },
  progressTitle: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  progressValue: {
    fontSize: 48,
    fontWeight: '900',
    color: COLORS.white,
    marginBottom: SPACING.sm,
  },
  progressBar: {
    width: '100%',
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: SPACING.sm,
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.white,
  },
  progressLabel: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
  categoriesScroll: {
    maxHeight: 50,
  },
  categoriesContent: {
    paddingHorizontal: SPACING.lg,
    gap: SPACING.sm,
  },
  categoryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.lg,
  },
  categoryButtonActive: {
    backgroundColor: COLORS.accentGreen,
  },
  categoryText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.lightTextMuted,
  },
  categoryTextActive: {
    color: COLORS.white,
  },
  scrollView: {
    flex: 1,
    marginTop: SPACING.md,
  },
  scrollContent: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  badgeCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  badgeIconContainer: {
    marginRight: SPACING.md,
  },
  badgeLocked: {
    opacity: 0.5,
  },
  badgeIconGradient: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unlockedBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    backgroundColor: COLORS.white,
    borderRadius: 12,
  },
  badgeContent: {
    flex: 1,
  },
  badgeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  badgeName: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.lightTextPrimary,
  },
  levelBadge: {
    backgroundColor: COLORS.lightSurface,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.md,
  },
  levelText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: COLORS.lightTextSecondary,
  },
  badgeDescription: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.lightTextSecondary,
    marginBottom: SPACING.sm,
  },
  progressSection: {
    marginBottom: SPACING.sm,
  },
  progressInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.xs,
  },
  progressText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    color: COLORS.lightTextSecondary,
  },
  progressPercentage: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: COLORS.accentGreen,
  },
  badgeProgressBar: {
    width: '100%',
    height: 6,
    backgroundColor: COLORS.lightSurface,
    borderRadius: 3,
    overflow: 'hidden',
  },
  badgeProgressFill: {
    height: '100%',
  },
  rewardSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  rewardText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.lightTextMuted,
  },
  rewardTextUnlocked: {
    color: COLORS.accentGreen,
    fontWeight: '600',
  },
});

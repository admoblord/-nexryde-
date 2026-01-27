import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, CURRENCY } from '@/src/constants/theme';

export default function ChallengesScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'active' | 'completed'>('active');

  const activeChallenges = [
    { id: 1, title: 'Complete 10 Trips', desc: 'Finish 10 trips today', reward: 2000, progress: 7, total: 10, color: COLORS.accentGreen },
    { id: 2, title: 'Peak Hour Hero', desc: 'Complete 5 trips during peak hours', reward: 1500, progress: 3, total: 5, color: COLORS.accentBlue },
    { id: 3, title: '5-Star Streak', desc: 'Get 5 consecutive 5-star ratings', reward: 1000, progress: 4, total: 5, color: COLORS.gold },
  ];

  const completedChallenges = [
    { id: 4, title: 'Welcome Bonus', desc: 'Complete your first trip', reward: 500, completed: true },
    { id: 5, title: 'Weekend Warrior', desc: 'Complete 20 trips on weekend', reward: 3000, completed: true },
  ];

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
          <Text style={styles.headerTitle}>Challenges</Text>
          <View style={styles.placeholder} />
        </View>

        {/* Tab Switcher */}
        <View style={styles.tabContainer}>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'active' && styles.tabActive]}
            onPress={() => setActiveTab('active')}
          >
            <Text style={[styles.tabText, activeTab === 'active' && styles.tabTextActive]}>Active</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'completed' && styles.tabActive]}
            onPress={() => setActiveTab('completed')}
          >
            <Text style={[styles.tabText, activeTab === 'completed' && styles.tabTextActive]}>Completed</Text>
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {activeTab === 'active' ? (
            activeChallenges.map(challenge => (
              <View key={challenge.id} style={styles.challengeCard}>
                <View style={styles.challengeHeader}>
                  <View style={[styles.challengeIcon, { backgroundColor: challenge.color + '15' }]}>
                    <Ionicons name="trophy" size={22} color={challenge.color} />
                  </View>
                  <View style={styles.challengeInfo}>
                    <Text style={styles.challengeTitle}>{challenge.title}</Text>
                    <Text style={styles.challengeDesc}>{challenge.desc}</Text>
                  </View>
                  <View style={[styles.rewardBadge, { backgroundColor: challenge.color + '15' }]}>
                    <Text style={[styles.rewardText, { color: challenge.color }]}>{CURRENCY}{challenge.reward}</Text>
                  </View>
                </View>
                <View style={styles.progressContainer}>
                  <View style={styles.progressBar}>
                    <View 
                      style={[
                        styles.progressFill, 
                        { 
                          width: `${(challenge.progress / challenge.total) * 100}%`,
                          backgroundColor: challenge.color 
                        }
                      ]} 
                    />
                  </View>
                  <Text style={styles.progressText}>{challenge.progress}/{challenge.total}</Text>
                </View>
              </View>
            ))
          ) : (
            completedChallenges.map(challenge => (
              <View key={challenge.id} style={[styles.challengeCard, styles.completedCard]}>
                <View style={styles.challengeHeader}>
                  <View style={[styles.challengeIcon, { backgroundColor: COLORS.successSoft }]}>
                    <Ionicons name="checkmark-circle" size={22} color={COLORS.success} />
                  </View>
                  <View style={styles.challengeInfo}>
                    <Text style={styles.challengeTitle}>{challenge.title}</Text>
                    <Text style={styles.challengeDesc}>{challenge.desc}</Text>
                  </View>
                  <View style={[styles.rewardBadge, { backgroundColor: COLORS.successSoft }]}>
                    <Text style={[styles.rewardText, { color: COLORS.success }]}>+{CURRENCY}{challenge.reward}</Text>
                  </View>
                </View>
              </View>
            ))
          )}
        </ScrollView>
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
    fontWeight: '700',
    color: COLORS.lightTextPrimary,
  },
  placeholder: {
    width: 44,
  },
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.lg,
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
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.lightTextSecondary,
  },
  tabTextActive: {
    color: COLORS.white,
  },
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  challengeCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xxl,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
  },
  completedCard: {
    opacity: 0.8,
  },
  challengeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  challengeIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
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
    color: COLORS.lightTextPrimary,
  },
  challengeDesc: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.lightTextSecondary,
  },
  rewardBadge: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
  },
  rewardText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.md,
    gap: SPACING.md,
  },
  progressBar: {
    flex: 1,
    height: 8,
    backgroundColor: COLORS.lightSurface,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.lightTextSecondary,
    minWidth: 40,
    textAlign: 'right',
  },
});

import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, CURRENCY } from '@/src/constants/theme';

const { width } = Dimensions.get('window');

export default function ChallengesScreen() {
  const router = useRouter();
  const [selectedTab, setSelectedTab] = useState<'active' | 'completed'>('active');

  const activeChallenges = [
    { id: 1, title: 'Complete 10 Trips', desc: 'Finish 10 trips today', progress: 7, total: 10, reward: 2000, icon: 'car', color: COLORS.accentGreen },
    { id: 2, title: 'Peak Hour Hero', desc: 'Complete 5 trips during peak hours', progress: 3, total: 5, reward: 1500, icon: 'time', color: COLORS.accentBlue },
    { id: 3, title: '5-Star Streak', desc: 'Get 5 consecutive 5-star ratings', progress: 4, total: 5, reward: 1000, icon: 'star', color: COLORS.gold },
  ];

  const completedChallenges = [
    { id: 4, title: 'Early Bird', reward: 500, completedAt: 'Yesterday' },
    { id: 5, title: 'Weekend Warrior', reward: 3000, completedAt: '2 days ago' },
  ];

  return (
    <View style={styles.container}>
      <LinearGradient colors={[COLORS.background, COLORS.primary, COLORS.background]} style={StyleSheet.absoluteFillObject} />
      <View style={[styles.glow, { top: 80, right: 30, backgroundColor: COLORS.accentGreen }]} />
      <View style={[styles.glow, { bottom: 200, left: 20, backgroundColor: COLORS.gold, width: 60 }]} />
      
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={COLORS.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Challenges</Text>
          <View style={{ width: 44 }} />
        </View>

        {/* Tabs */}
        <View style={styles.tabs}>
          <TouchableOpacity style={[styles.tab, selectedTab === 'active' && styles.tabActive]} onPress={() => setSelectedTab('active')}>
            <Text style={[styles.tabText, selectedTab === 'active' && styles.tabTextActive]}>Active</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tab, selectedTab === 'completed' && styles.tabActive]} onPress={() => setSelectedTab('completed')}>
            <Text style={[styles.tabText, selectedTab === 'completed' && styles.tabTextActive]}>Completed</Text>
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          {selectedTab === 'active' ? (
            activeChallenges.map((challenge) => (
              <View key={challenge.id} style={styles.challengeCard}>
                <LinearGradient colors={[COLORS.surface, COLORS.surfaceLight]} style={styles.challengeGradient}>
                  <View style={styles.challengeHeader}>
                    <View style={[styles.challengeIcon, { backgroundColor: challenge.color + '20' }]}>
                      <Ionicons name={challenge.icon as any} size={24} color={challenge.color} />
                    </View>
                    <View style={styles.challengeInfo}>
                      <Text style={styles.challengeTitle}>{challenge.title}</Text>
                      <Text style={styles.challengeDesc}>{challenge.desc}</Text>
                    </View>
                    <View style={styles.rewardBadge}>
                      <Text style={styles.rewardText}>{CURRENCY}{challenge.reward}</Text>
                    </View>
                  </View>
                  <View style={styles.progressContainer}>
                    <View style={styles.progressBar}>
                      <LinearGradient colors={[challenge.color, COLORS.accentBlue]} style={[styles.progressFill, { width: `${(challenge.progress / challenge.total) * 100}%` }]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} />
                    </View>
                    <Text style={styles.progressText}>{challenge.progress}/{challenge.total}</Text>
                  </View>
                </LinearGradient>
              </View>
            ))
          ) : (
            completedChallenges.map((challenge) => (
              <View key={challenge.id} style={styles.completedCard}>
                <View style={styles.completedIcon}>
                  <Ionicons name="checkmark-circle" size={24} color={COLORS.accentGreen} />
                </View>
                <View style={styles.completedInfo}>
                  <Text style={styles.completedTitle}>{challenge.title}</Text>
                  <Text style={styles.completedTime}>{challenge.completedAt}</Text>
                </View>
                <Text style={styles.completedReward}>+{CURRENCY}{challenge.reward}</Text>
              </View>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  glow: { position: 'absolute', width: 80, height: 80, borderRadius: 40, opacity: 0.12 },
  safeArea: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md },
  backButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: FONT_SIZE.xl, fontWeight: '700', color: COLORS.white },
  tabs: { flexDirection: 'row', paddingHorizontal: SPACING.lg, marginBottom: SPACING.lg, gap: SPACING.md },
  tab: { flex: 1, paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.xl, backgroundColor: COLORS.surface, alignItems: 'center' },
  tabActive: { backgroundColor: COLORS.accentGreen },
  tabText: { fontSize: FONT_SIZE.md, fontWeight: '600', color: COLORS.textMuted },
  tabTextActive: { color: COLORS.primary },
  content: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xxl },
  challengeCard: { marginBottom: SPACING.md, borderRadius: BORDER_RADIUS.xxl, overflow: 'hidden' },
  challengeGradient: { padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.surfaceLight, borderRadius: BORDER_RADIUS.xxl },
  challengeHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.md },
  challengeIcon: { width: 52, height: 52, borderRadius: BORDER_RADIUS.lg, alignItems: 'center', justifyContent: 'center', marginRight: SPACING.md },
  challengeInfo: { flex: 1 },
  challengeTitle: { fontSize: FONT_SIZE.md, fontWeight: '700', color: COLORS.white },
  challengeDesc: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted, marginTop: 2 },
  rewardBadge: { backgroundColor: COLORS.goldSoft, paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs, borderRadius: BORDER_RADIUS.full },
  rewardText: { fontSize: FONT_SIZE.sm, fontWeight: '700', color: COLORS.gold },
  progressContainer: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  progressBar: { flex: 1, height: 8, backgroundColor: COLORS.surfaceLight, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  progressText: { fontSize: FONT_SIZE.sm, fontWeight: '600', color: COLORS.textSecondary },
  completedCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl, padding: SPACING.md, marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.surfaceLight },
  completedIcon: { marginRight: SPACING.md },
  completedInfo: { flex: 1 },
  completedTitle: { fontSize: FONT_SIZE.md, fontWeight: '600', color: COLORS.white },
  completedTime: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted },
  completedReward: { fontSize: FONT_SIZE.md, fontWeight: '700', color: COLORS.accentGreen },
});
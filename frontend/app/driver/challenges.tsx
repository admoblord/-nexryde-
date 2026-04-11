import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, CURRENCY } from '@/src/constants/theme';
import { useAppStore } from '@/src/store/appStore';
import { getActiveChallenges, getDriverChallengeProgress } from '@/src/services/api';

export default function ChallengesScreen() {
  const router = useRouter();
  const { user } = useAppStore();
  const [activeTab, setActiveTab] = useState<'active' | 'completed'>('active');
  const [loading, setLoading] = useState(true);
  const [activeChallenges, setActiveChallenges] = useState<any[]>([]);
  const [completedChallenges, setCompletedChallenges] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const [activeRes, progressRes] = await Promise.all([
          getActiveChallenges(),
          user?.id ? getDriverChallengeProgress(user.id) : Promise.resolve({ data: { challenge_progress: [] } }),
        ]);
        const progressRows = Array.isArray(progressRes.data?.challenge_progress) ? progressRes.data.challenge_progress : [];
        const progressMap: Record<string, any> = {};
        progressRows.forEach((p: any) => {
          progressMap[String(p.challenge_id)] = p;
        });

        const raw = Array.isArray(activeRes.data?.challenges) ? activeRes.data.challenges : [];
        const merged = raw.map((c: any, idx: number) => {
          const p = progressMap[String(c.id)] || {};
          const total = Number(p.target ?? c.target_value ?? 0);
          const progress = Number(p.current ?? 0);
          const completed = Boolean(p.completed);
          return {
            id: c.id,
            title: c.title,
            desc: c.description,
            reward: c.reward_value ?? c.reward_type ?? 'Reward',
            progress,
            total,
            completed,
            color: [COLORS.accentGreen, COLORS.accentBlue, COLORS.gold][idx % 3],
          };
        });

        setActiveChallenges(merged.filter((x: any) => !x.completed));
        setCompletedChallenges(merged.filter((x: any) => x.completed));
      } catch (e) {
        console.log('Failed to load challenges:', e);
        setActiveChallenges([]);
        setCompletedChallenges([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user?.id]);

  const renderReward = (reward: any, positive: boolean = false) => {
    if (typeof reward === 'number') {
      return `${positive ? '+' : ''}${CURRENCY}${reward}`;
    }
    return String(reward || '');
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={COLORS.lightTextPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Challenges</Text>
          <View style={styles.placeholder} />
        </View>

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
          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.loadingText}>Loading challenges...</Text>
            </View>
          ) : activeTab === 'active' ? (
            activeChallenges.length ? activeChallenges.map((challenge) => (
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
                    <Text style={[styles.rewardText, { color: challenge.color }]}>{renderReward(challenge.reward)}</Text>
                  </View>
                </View>
                {challenge.total > 0 ? (
                  <View style={styles.progressContainer}>
                    <View style={styles.progressBar}>
                      <View
                        style={[
                          styles.progressFill,
                          {
                            width: `${Math.min(100, (challenge.progress / challenge.total) * 100)}%`,
                            backgroundColor: challenge.color,
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.progressText}>{challenge.progress}/{challenge.total}</Text>
                  </View>
                ) : null}
              </View>
            )) : (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyText}>No active challenges right now.</Text>
              </View>
            )
          ) : (
            completedChallenges.length ? completedChallenges.map((challenge) => (
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
                    <Text style={[styles.rewardText, { color: COLORS.success }]}>{renderReward(challenge.reward, true)}</Text>
                  </View>
                </View>
              </View>
            )) : (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyText}>No completed challenges yet.</Text>
              </View>
            )
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.lightBackground },
  safeArea: { flex: 1 },
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
  headerTitle: { fontSize: FONT_SIZE.lg, fontWeight: '700', color: COLORS.lightTextPrimary },
  placeholder: { width: 44 },
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.lg,
    backgroundColor: COLORS.lightSurface,
    borderRadius: BORDER_RADIUS.full,
    padding: 4,
  },
  tab: { flex: 1, paddingVertical: SPACING.sm, alignItems: 'center', borderRadius: BORDER_RADIUS.full },
  tabActive: { backgroundColor: COLORS.accentGreen },
  tabText: { fontSize: FONT_SIZE.md, fontWeight: '600', color: COLORS.lightTextSecondary },
  tabTextActive: { color: COLORS.white },
  scrollContent: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xxl },
  loadingWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: SPACING.xxl },
  loadingText: { marginTop: SPACING.sm, fontWeight: '600', color: COLORS.lightTextSecondary },
  emptyWrap: { paddingVertical: SPACING.xxl, alignItems: 'center' },
  emptyText: { color: COLORS.lightTextSecondary, fontWeight: '600' },
  challengeCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xxl,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
  },
  completedCard: { opacity: 0.8 },
  challengeHeader: { flexDirection: 'row', alignItems: 'center' },
  challengeIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  challengeInfo: { flex: 1 },
  challengeTitle: { fontSize: FONT_SIZE.md, fontWeight: '700', color: COLORS.lightTextPrimary },
  challengeDesc: { fontSize: FONT_SIZE.sm, color: COLORS.lightTextSecondary },
  rewardBadge: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs, borderRadius: BORDER_RADIUS.full },
  rewardText: { fontSize: FONT_SIZE.sm, fontWeight: '700' },
  progressContainer: { flexDirection: 'row', alignItems: 'center', marginTop: SPACING.md, gap: SPACING.md },
  progressBar: { flex: 1, height: 8, backgroundColor: COLORS.lightSurface, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  progressText: { fontSize: FONT_SIZE.sm, fontWeight: '600', color: COLORS.lightTextSecondary, minWidth: 40, textAlign: 'right' },
});

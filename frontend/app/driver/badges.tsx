import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import { useAppStore } from '@/src/store/appStore';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'https://nexryde-ui.emergent.host';

export default function BadgesScreen() {
  const router = useRouter();
  const { user } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [badges, setBadges] = useState<any[]>([]);
  const [earnedCount, setEarnedCount] = useState(0);

  useEffect(() => {
    fetchBadges();
  }, []);

  const fetchBadges = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${BACKEND_URL}/api/driver/${user.id}/badges`);
      const data = await response.json();
      
      setBadges(data.badges || []);
      setEarnedCount(data.earned_count || 0);
    } catch (error) {
      console.error('Error fetching badges:', error);
      setBadges([]);
      setEarnedCount(0);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading achievements...</Text>
      </View>
    );
  }

  if (earnedCount === 0) {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={24} color={COLORS.lightTextPrimary} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Badges & Achievements</Text>
            <View style={styles.placeholder} />
          </View>

          <View style={styles.emptyState}>
            <View style={styles.emptyIconContainer}>
              <Ionicons name="ribbon-outline" size={80} color={COLORS.textSecondary} />
            </View>
            <Text style={styles.emptyTitle}>No Badges Yet</Text>
            <Text style={styles.emptyText}>
              Complete trips to earn badges and unlock rewards! Your first badge awaits after your first completed trip.
            </Text>

            {/* Available Badges Preview */}
            <View style={styles.previewSection}>
              <Text style={styles.previewTitle}>🎯 Badges You Can Earn:</Text>
              <View style={styles.previewBadges}>
                <View style={styles.previewBadge}>
                  <Ionicons name="cash" size={24} color={COLORS.textSecondary} />
                  <Text style={styles.previewBadgeText}>First Trip</Text>
                </View>
                <View style={styles.previewBadge}>
                  <Ionicons name="star" size={24} color={COLORS.textSecondary} />
                  <Text style={styles.previewBadgeText}>Top Rated</Text>
                </View>
                <View style={styles.previewBadge}>
                  <Ionicons name="flash" size={24} color={COLORS.textSecondary} />
                  <Text style={styles.previewBadgeText}>Speed Demon</Text>
                </View>
                <View style={styles.previewBadge}>
                  <Ionicons name="trophy" size={24} color={COLORS.textSecondary} />
                  <Text style={styles.previewBadgeText}>Millionaire</Text>
                </View>
              </View>
            </View>

            <TouchableOpacity 
              style={styles.emptyButton}
              onPress={() => router.back()}
            >
              <Text style={styles.emptyButtonText}>Start Earning Badges</Text>
              <Ionicons name="arrow-forward" size={20} color={COLORS.white} />
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={COLORS.lightTextPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Badges ({earnedCount})</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.statsCard}>
            <Text style={styles.statsTitle}>🏆 Your Achievements</Text>
            <Text style={styles.statsText}>
              You've earned {earnedCount} badge{earnedCount !== 1 ? 's' : ''}!
            </Text>
          </View>

          {/* Display real earned badges */}
          <View style={styles.badgesGrid}>
            {badges.map((badge) => (
              <View key={badge.id} style={styles.badgeCard}>
                <View style={[styles.badgeIcon, { backgroundColor: badge.color + '20' }]}>
                  <Ionicons name={badge.icon} size={32} color={badge.color} />
                </View>
                <Text style={styles.badgeName}>{badge.name}</Text>
                <Text style={styles.badgeDesc}>{badge.description}</Text>
                {badge.earned_at && (
                  <Text style={styles.badgeDate}>
                    Earned {new Date(badge.earned_at).toLocaleDateString()}
                  </Text>
                )}
              </View>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.lightBackground,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: SPACING.md,
    color: COLORS.textSecondary,
  },
  safeArea: {
    flex: 1,
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.lightSurface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderColor,
  },
  backButton: {
    padding: SPACING.xs,
  },
  headerTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: 'bold',
    color: COLORS.lightTextPrimary,
  },
  placeholder: {
    width: 40,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
  },
  emptyIconContainer: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: COLORS.borderColor,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  emptyTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: 'bold',
    color: COLORS.lightTextPrimary,
    marginBottom: SPACING.md,
  },
  emptyText: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: SPACING.xl,
  },
  previewSection: {
    width: '100%',
    marginBottom: SPACING.xl,
  },
  previewTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: 'bold',
    color: COLORS.lightTextPrimary,
    marginBottom: SPACING.md,
    textAlign: 'center',
  },
  previewBadges: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    flexWrap: 'wrap',
    gap: SPACING.md,
  },
  previewBadge: {
    alignItems: 'center',
    width: 70,
  },
  previewBadgeText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
    textAlign: 'center',
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    gap: SPACING.sm,
  },
  emptyButtonText: {
    fontSize: FONT_SIZE.md,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  content: {
    padding: SPACING.md,
  },
  statsCard: {
    backgroundColor: COLORS.primary + '10',
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  statsTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: 'bold',
    color: COLORS.primary,
    marginBottom: SPACING.xs,
  },
  statsText: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
  },
  badgesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  badgeCard: {
    width: '48%',
    backgroundColor: COLORS.lightSurface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    alignItems: 'center',
  },
  badgeIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  badgeName: {
    fontSize: FONT_SIZE.md,
    fontWeight: 'bold',
    color: COLORS.lightTextPrimary,
    marginBottom: SPACING.xs,
    textAlign: 'center',
  },
  badgeDesc: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.xs,
  },
  badgeDate: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
  },
});
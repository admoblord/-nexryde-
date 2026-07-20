import React, { useEffect, useMemo, useState } from 'react';
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
import { useThemeColors } from '@/src/constants/theme';
import { BRAND, RADIUS, SPACING, SURFACE } from '@/src/constants/designSystem';
import { Ionicons } from '@expo/vector-icons';
import { useAuthedUserId } from '@/src/hooks/useAuthedUserId';
import { getDriverStats } from '@/src/services/api';

export default function PerformanceScreen() {
  const { colors, isDark } = useThemeColors();
  const router = useRouter();
  const { userId: driverId } = useAuthedUserId();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);
  const [loadError, setLoadError] = useState(false);

  const loadStats = async () => {
    if (!driverId) { setLoading(false); return; }
    setLoadError(false);
    setLoading(true);
    try {
      const res = await getDriverStats(driverId);
      setStats(res.data || null);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, [driverId]);

  const metrics = useMemo(() => {
    const completionRate = Number(stats?.completion_rate || 0);
    // Use acceptance_rate directly — never fall back to completionRate (different metric)
    const acceptanceRate = Number(stats?.acceptance_rate || 0);
    const rating = Number(stats?.rating || 0);
    const cancellationRate = Math.max(0, 100 - completionRate);
    const onTime = Math.min(100, Math.round((completionRate + acceptanceRate) / 2));

    return [
      { label: 'Acceptance Rate', value: `${Math.round(acceptanceRate)}%`, target: '90%', status: acceptanceRate >= 90 ? 'good' : 'needs_improvement', icon: 'checkmark-circle' },
      { label: 'Completion Rate', value: `${Math.round(completionRate)}%`, target: '95%', status: completionRate >= 95 ? 'good' : 'needs_improvement', icon: 'flag' },
      { label: 'Cancellation Rate', value: `${Math.round(cancellationRate)}%`, target: '<5%', status: cancellationRate <= 5 ? 'good' : 'poor', icon: 'close-circle' },
      { label: 'Average Rating', value: rating ? rating.toFixed(1) : '0.0', target: '4.7', status: rating >= 4.7 ? 'excellent' : rating >= 4.3 ? 'good' : 'needs_improvement', icon: 'star' },
      { label: 'On-Time Arrival', value: `${onTime}%`, target: '85%', status: onTime >= 85 ? 'good' : 'needs_improvement', icon: 'time' },
    ];
  }, [stats]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'excellent': return BRAND.primary;
      case 'good': return BRAND.info;
      case 'needs_improvement': return BRAND.warning;
      case 'poor': return BRAND.danger;
      default: return BRAND.textMuted;
    }
  };

  const overallGrade = Number(stats?.rating || 0) >= 4.8 ? 'A+' : Number(stats?.rating || 0) >= 4.5 ? 'A' : Number(stats?.rating || 0) >= 4.2 ? 'B+' : 'B';
  const overallTitle = Number(stats?.rating || 0) >= 4.8 ? 'Excellent Performance' : 'Strong Performance';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDark ? BRAND.bgDeep : colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Performance</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={BRAND.primary} />
            <Text style={styles.loadingText}>Loading performance...</Text>
          </View>
        ) : loadError ? (
          <View style={styles.loadingWrap}>
            <Ionicons name="cloud-offline-outline" size={48} color={BRAND.textMuted} />
            <Text style={[styles.loadingText, { marginTop: 12 }]}>Could not load stats</Text>
            <TouchableOpacity onPress={loadStats} style={styles.retryButton}>
              <Text style={styles.retryText}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : !stats ? (
          <View style={styles.loadingWrap}>
            <Ionicons name="bar-chart-outline" size={48} color={BRAND.textMuted} />
            <Text style={[styles.loadingText, { marginTop: 12 }]}>No performance data yet</Text>
            <Text style={[styles.loadingText, { fontSize: 13, color: BRAND.textMuted, marginTop: 4 }]}>
              Complete trips to see your metrics here.
            </Text>
          </View>
        ) : (
          <>
        <View style={styles.overallCard}>
          <View style={styles.scoreCircle}>
            <Text style={styles.scoreValue}>{overallGrade}</Text>
          </View>
          <Text style={styles.overallTitle}>{overallTitle}</Text>
          <Text style={styles.overallSubtext}>
            {stats?.total_trips ? `You've completed ${stats.total_trips} trips so far.` : 'Complete trips to improve your score.'}
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Key Metrics</Text>

        {metrics.map((metric, index) => (
          <View key={index} style={styles.metricCard}>
            <View style={[styles.metricIcon, { backgroundColor: getStatusColor(metric.status) + '20' }]}>
              <Ionicons name={metric.icon as any} size={24} color={getStatusColor(metric.status)} />
            </View>
            <View style={styles.metricInfo}>
              <Text style={styles.metricLabel}>{metric.label}</Text>
              <Text style={styles.metricTarget}>Target: {metric.target}</Text>
            </View>
            <View style={styles.metricValueWrap}>
              <Text style={[styles.metricValue, { color: getStatusColor(metric.status) }]}>
                {metric.value}
              </Text>
            </View>
          </View>
        ))}

        <View style={styles.tipsCard}>
          <Ionicons name="bulb" size={24} color={BRAND.primary} />
          <View style={styles.tipsContent}>
            <Text style={styles.tipsTitle}>Pro Tip</Text>
            <Text style={styles.tipsText}>
              Maintain a high acceptance rate during peak hours to unlock bonus rewards.
            </Text>
          </View>
        </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BRAND.bgDeep,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    backgroundColor: SURFACE.cardDark,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SURFACE.hairline,
  },
  backButton: {
    padding: SPACING.sm,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: BRAND.textPrimary,
  },
  content: {
    padding: SPACING.lg,
  },
  loadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xxl,
  },
  loadingText: {
    marginTop: SPACING.sm,
    color: BRAND.textMuted,
    fontWeight: '600',
  },
  overallCard: {
    backgroundColor: SURFACE.cardDark,
    padding: SPACING.xl,
    borderRadius: RADIUS.xl,
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  scoreCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: BRAND.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: BRAND.primary,
  },
  scoreValue: {
    fontSize: 22,
    fontWeight: '900',
    color: BRAND.primary,
  },
  overallTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: BRAND.textPrimary,
    marginTop: SPACING.md,
  },
  overallSubtext: {
    fontSize: 13,
    color: BRAND.textMuted,
    marginTop: SPACING.xs,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: BRAND.textPrimary,
    marginBottom: SPACING.md,
  },
  metricCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SURFACE.cardDark,
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.sm,
  },
  metricIcon: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricInfo: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  metricLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: BRAND.textPrimary,
  },
  metricTarget: {
    fontSize: 13,
    color: BRAND.textMuted,
  },
  metricValueWrap: {
    paddingHorizontal: SPACING.md,
  },
  metricValue: {
    fontSize: 20,
    fontWeight: '900',
  },
  tipsCard: {
    flexDirection: 'row',
    backgroundColor: BRAND.primaryMuted,
    padding: SPACING.lg,
    borderRadius: RADIUS.xl,
    marginTop: SPACING.md,
    gap: SPACING.md,
  },
  tipsContent: {
    flex: 1,
  },
  tipsTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: BRAND.textPrimary,
  },
  tipsText: {
    fontSize: 13,
    color: BRAND.textSecondary,
    marginTop: 4,
    lineHeight: 20,
  },
  retryButton: {
    marginTop: SPACING.lg,
    backgroundColor: BRAND.primary,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
  },
  retryText: {
    color: SURFACE.cardDark,
    fontWeight: '700',
    fontSize: 15,
  },
});

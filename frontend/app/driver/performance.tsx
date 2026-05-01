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
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS } from '@/src/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '@/src/store/appStore';
import { getDriverStats } from '@/src/services/api';

export default function PerformanceScreen() {
  const router = useRouter();
  const { user } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);
  const [loadError, setLoadError] = useState(false);

  const loadStats = async () => {
    if (!user?.id) { setLoading(false); return; }
    setLoadError(false);
    setLoading(true);
    try {
      const res = await getDriverStats(user.id);
      setStats(res.data || null);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, [user?.id]);

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
      case 'excellent': return COLORS.success;
      case 'good': return COLORS.info;
      case 'needs_improvement': return COLORS.warning;
      case 'poor': return COLORS.error;
      default: return COLORS.gray500;
    }
  };

  const overallGrade = Number(stats?.rating || 0) >= 4.8 ? 'A+' : Number(stats?.rating || 0) >= 4.5 ? 'A' : Number(stats?.rating || 0) >= 4.2 ? 'B+' : 'B';
  const overallTitle = Number(stats?.rating || 0) >= 4.8 ? 'Excellent Performance' : 'Strong Performance';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={COLORS.gray800} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Performance</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Loading performance...</Text>
          </View>
        ) : loadError ? (
          <View style={styles.loadingWrap}>
            <Ionicons name="cloud-offline-outline" size={48} color={COLORS.gray400} />
            <Text style={[styles.loadingText, { marginTop: 12 }]}>Could not load stats</Text>
            <TouchableOpacity onPress={loadStats} style={styles.retryButton}>
              <Text style={styles.retryText}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : !stats ? (
          <View style={styles.loadingWrap}>
            <Ionicons name="bar-chart-outline" size={48} color={COLORS.gray300} />
            <Text style={[styles.loadingText, { marginTop: 12 }]}>No performance data yet</Text>
            <Text style={[styles.loadingText, { fontSize: FONT_SIZE.sm, color: COLORS.gray400, marginTop: 4 }]}>
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
          <Ionicons name="bulb" size={24} color={COLORS.accent} />
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
    backgroundColor: COLORS.gray50,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray100,
  },
  backButton: {
    padding: SPACING.sm,
  },
  headerTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '800',
    color: COLORS.gray800,
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
    color: COLORS.gray500,
    fontWeight: '600',
  },
  overallCard: {
    backgroundColor: COLORS.white,
    padding: SPACING.xl,
    borderRadius: BORDER_RADIUS.xl,
    alignItems: 'center',
    marginBottom: SPACING.lg,
    ...SHADOWS.md,
  },
  scoreCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.successSoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: COLORS.success,
  },
  scoreValue: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '900',
    color: COLORS.success,
  },
  overallTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '800',
    color: COLORS.gray800,
    marginTop: SPACING.md,
  },
  overallSubtext: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.gray500,
    marginTop: SPACING.xs,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '800',
    color: COLORS.gray800,
    marginBottom: SPACING.md,
  },
  metricCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.sm,
    ...SHADOWS.sm,
  },
  metricIcon: {
    width: 48,
    height: 48,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricInfo: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  metricLabel: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.gray800,
  },
  metricTarget: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.gray500,
  },
  metricValueWrap: {
    paddingHorizontal: SPACING.md,
  },
  metricValue: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '900',
  },
  tipsCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.accentSoft,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    marginTop: SPACING.md,
    gap: SPACING.md,
  },
  tipsContent: {
    flex: 1,
  },
  tipsTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '800',
    color: COLORS.gray800,
  },
  tipsText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.gray600,
    marginTop: 4,
    lineHeight: 20,
  },
  retryButton: {
    marginTop: SPACING.lg,
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
  },
  retryText: {
    color: COLORS.white,
    fontWeight: '700',
    fontSize: FONT_SIZE.md,
  },
});

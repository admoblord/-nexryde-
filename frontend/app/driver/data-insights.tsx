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
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS, CURRENCY } from '@/src/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '@/src/store/appStore';
import { getDriverEarningsDashboard, getUserTrips } from '@/src/services/api';

export default function DataInsightsScreen() {
  const router = useRouter();
  const { user } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [trips, setTrips] = useState<any[]>([]);
  const [earnings, setEarnings] = useState<any>(null);

  useEffect(() => {
    const load = async () => {
      if (!user?.id) {
        setLoading(false);
        return;
      }
      try {
        const [tripRes, earningsRes] = await Promise.all([
          getUserTrips(user.id, 'driver'),
          getDriverEarningsDashboard(user.id, 'week'),
        ]);
        setTrips(Array.isArray(tripRes.data) ? tripRes.data : []);
        setEarnings(earningsRes.data || null);
      } catch (e) {
        if (__DEV__) console.warn('Failed loading insights', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user?.id]);

  const insights = useMemo(() => {
    const completed = trips.filter((t) => String(t.status || '').toLowerCase() === 'completed');

    const dayCount: Record<string, number> = {};
    const hourCount: Record<string, number> = {};
    const zoneCount: Record<string, number> = {};

    completed.forEach((t) => {
      const d = new Date(t.completed_at || t.created_at || Date.now());
      const day = Number.isNaN(d.getTime()) ? 'N/A' : d.toLocaleDateString(undefined, { weekday: 'short' });
      dayCount[day] = (dayCount[day] || 0) + 1;

      const hour = Number.isNaN(d.getTime()) ? 'N/A' : `${d.getHours()}:00`;
      hourCount[hour] = (hourCount[hour] || 0) + 1;

      const pickup = t.pickup_location?.address || '';
      const zone = pickup.split(',')[0]?.trim() || 'Unknown';
      zoneCount[zone] = (zoneCount[zone] || 0) + 1;
    });

    const bestDay = Object.entries(dayCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';
    const peakHour = Object.entries(hourCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';
    const hotZone = Object.entries(zoneCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';
    const avgTrip = Number(earnings?.averages?.per_trip || 0);

    return [
      { title: 'Best Day', value: bestDay, subtitle: 'Highest trip volume', icon: 'calendar', color: COLORS.success },
      { title: 'Peak Hour', value: peakHour, subtitle: 'Most completions', icon: 'time', color: COLORS.info },
      { title: 'Hot Zone', value: hotZone, subtitle: 'Most frequent pickup', icon: 'location', color: COLORS.warning },
      { title: 'Avg. Trip', value: `${CURRENCY}${avgTrip.toFixed(0)}`, subtitle: 'Real weekly average', icon: 'cash', color: COLORS.accent },
    ];
  }, [trips, earnings]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={COLORS.gray800} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Data Insights</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.heroCard}>
          <Ionicons name="analytics" size={40} color={COLORS.accent} />
          <Text style={styles.heroTitle}>Live Driver Insights</Text>
          <Text style={styles.heroSubtitle}>
            Computed from your real trip and earnings history
          </Text>
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Loading insights...</Text>
          </View>
        ) : (
          <>
            <Text style={styles.sectionTitle}>Your Performance</Text>
            <View style={styles.insightsGrid}>
              {insights.map((insight, index) => (
                <View key={index} style={styles.insightCard}>
                  <View style={[styles.insightIcon, { backgroundColor: insight.color + '20' }]}>
                    <Ionicons name={insight.icon as any} size={24} color={insight.color} />
                  </View>
                  <Text style={styles.insightValue} numberOfLines={1}>{insight.value}</Text>
                  <Text style={styles.insightTitle}>{insight.title}</Text>
                  <Text style={styles.insightSubtitle}>{insight.subtitle}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.gray50 },
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
  backButton: { padding: SPACING.sm },
  headerTitle: { fontSize: FONT_SIZE.lg, fontWeight: '800', color: COLORS.gray800 },
  content: { padding: SPACING.lg },
  heroCard: {
    backgroundColor: COLORS.white,
    padding: SPACING.xl,
    borderRadius: BORDER_RADIUS.xl,
    alignItems: 'center',
    marginBottom: SPACING.lg,
    ...SHADOWS.md,
  },
  heroTitle: { fontSize: FONT_SIZE.xl, fontWeight: '900', color: COLORS.gray800, marginTop: SPACING.md },
  heroSubtitle: { fontSize: FONT_SIZE.sm, color: COLORS.gray500, textAlign: 'center', marginTop: SPACING.xs },
  loadingWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: SPACING.xxl },
  loadingText: { marginTop: SPACING.sm, color: COLORS.gray500, fontWeight: '600' },
  sectionTitle: { fontSize: FONT_SIZE.md, fontWeight: '800', color: COLORS.gray800, marginBottom: SPACING.md },
  insightsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  insightCard: {
    width: '48%',
    backgroundColor: COLORS.white,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.md,
    ...SHADOWS.sm,
  },
  insightIcon: { width: 44, height: 44, borderRadius: BORDER_RADIUS.md, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.sm },
  insightValue: { fontSize: FONT_SIZE.xl, fontWeight: '900', color: COLORS.gray800 },
  insightTitle: { fontSize: FONT_SIZE.sm, fontWeight: '700', color: COLORS.gray600, marginTop: 2 },
  insightSubtitle: { fontSize: FONT_SIZE.xs, color: COLORS.gray400 },
});

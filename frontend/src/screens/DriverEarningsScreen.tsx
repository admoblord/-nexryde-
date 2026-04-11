import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS, CURRENCY } from '@/src/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '@/src/store/appStore';
import { BACKEND_URL, getDriverEarningsDashboard } from '@/src/services/api';

type Period = 'today' | 'week' | 'month';

export default function DriverEarningsScreen() {
  const router = useRouter();
  const { user } = useAppStore();
  const [period, setPeriod] = useState<Period>('today');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dashboard, setDashboard] = useState<any>(null);

  const load = useCallback(async () => {
    if (!user?.id) {
      setDashboard(null);
      setLoading(false);
      return;
    }
    try {
      const res = await getDriverEarningsDashboard(user.id, period);
      setDashboard(res.data || null);
    } catch (e) {
      console.log('Failed to load driver earnings:', e);
      setDashboard(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period, user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const summary = dashboard?.summary || {};
  const averages = dashboard?.averages || {};

  const periodLabel = useMemo(() => {
    if (period === 'today') return 'Today';
    if (period === 'week') return 'This Week';
    return 'This Month';
  }, [period]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Earnings</Text>
        <Text style={styles.headerSubtext}>Keep 100% of your earnings</Text>
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        <View style={styles.earningsCard}>
          <Text style={styles.earningsLabel}>Total Earnings</Text>
          {loading ? (
            <ActivityIndicator size="small" color={COLORS.accent} />
          ) : (
            <Text style={styles.earningsAmount}>{CURRENCY}{Number(summary.total_earnings || 0).toLocaleString()}</Text>
          )}
          <View style={styles.earningsPeriod}>
            <TouchableOpacity style={[styles.periodBtn, period === 'today' && styles.periodBtnActive]} onPress={() => setPeriod('today')}>
              <Text style={[styles.periodText, period === 'today' && styles.periodTextActive]}>Today</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.periodBtn, period === 'week' && styles.periodBtnActive]} onPress={() => setPeriod('week')}>
              <Text style={[styles.periodText, period === 'week' && styles.periodTextActive]}>This Week</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.periodBtn, period === 'month' && styles.periodBtnActive]} onPress={() => setPeriod('month')}>
              <Text style={[styles.periodText, period === 'month' && styles.periodTextActive]}>This Month</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Ionicons name="car" size={24} color={COLORS.info} />
            <Text style={styles.statValue}>{Number(summary.total_trips || 0)}</Text>
            <Text style={styles.statLabel}>Trips ({periodLabel})</Text>
          </View>
          <View style={styles.statBox}>
            <Ionicons name="speedometer" size={24} color={COLORS.accent} />
            <Text style={styles.statValue}>{Number(summary.total_distance_km || 0).toFixed(1)}km</Text>
            <Text style={styles.statLabel}>Distance</Text>
          </View>
          <View style={styles.statBox}>
            <Ionicons name="stats-chart" size={24} color={COLORS.success} />
            <Text style={styles.statValue}>{CURRENCY}{Number(averages.per_trip || 0).toFixed(0)}</Text>
            <Text style={styles.statLabel}>Per Trip</Text>
          </View>
        </View>

        <View style={styles.commissionBanner}>
          <Ionicons name="checkmark-circle" size={24} color={COLORS.success} />
          <View style={styles.commissionContent}>
            <Text style={styles.commissionTitle}>Zero Commission</Text>
            <Text style={styles.commissionText}>{dashboard?.commission_message || 'You keep 100% of every fare'}</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.bankCard} onPress={() => router.push('/driver/bank')}>
          <View style={styles.bankIcon}>
            <Ionicons name="card" size={24} color={COLORS.info} />
          </View>
          <View style={styles.bankContent}>
            <Text style={styles.bankTitle}>Bank Account</Text>
            <Text style={styles.bankText}>Riders pay you directly to this account</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.gray50 },
  header: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
    borderBottomLeftRadius: BORDER_RADIUS.xxl,
    borderBottomRightRadius: BORDER_RADIUS.xxl,
  },
  headerTitle: { fontSize: FONT_SIZE.xxl, fontWeight: '900', color: COLORS.white, letterSpacing: -0.5 },
  headerSubtext: { fontSize: FONT_SIZE.md, fontWeight: '700', color: COLORS.accent, marginTop: SPACING.xs },
  content: { padding: SPACING.lg },
  earningsCard: { backgroundColor: COLORS.primary, borderRadius: BORDER_RADIUS.xxl, padding: SPACING.xl, marginBottom: SPACING.lg, ...SHADOWS.lg },
  earningsLabel: { fontSize: FONT_SIZE.sm, fontWeight: '800', color: COLORS.gray400, textTransform: 'uppercase', letterSpacing: 1 },
  earningsAmount: {
    fontSize: FONT_SIZE.hero,
    fontWeight: '900',
    color: COLORS.accent,
    marginVertical: SPACING.sm,
    textShadowColor: 'rgba(34, 197, 94, 0.3)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 8,
  },
  earningsPeriod: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md },
  periodBtn: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: BORDER_RADIUS.full, backgroundColor: 'rgba(255,255,255,0.1)' },
  periodBtnActive: { backgroundColor: COLORS.accent },
  periodText: { fontSize: FONT_SIZE.sm, fontWeight: '700', color: COLORS.gray400 },
  periodTextActive: { fontWeight: '900', color: COLORS.primary },
  statsRow: { flexDirection: 'row', gap: SPACING.md, marginBottom: SPACING.lg },
  statBox: { flex: 1, backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.xl, padding: SPACING.md, alignItems: 'center', ...SHADOWS.sm },
  statValue: { fontSize: FONT_SIZE.lg, fontWeight: '900', color: '#0F172A', marginTop: SPACING.sm },
  statLabel: { fontSize: FONT_SIZE.xs, fontWeight: '700', color: '#64748B', marginTop: SPACING.xs, textTransform: 'uppercase', letterSpacing: 0.5 },
  commissionBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.successSoft, padding: SPACING.md, borderRadius: BORDER_RADIUS.xl, marginBottom: SPACING.lg, gap: SPACING.md },
  commissionContent: { flex: 1 },
  commissionTitle: { fontSize: FONT_SIZE.md, fontWeight: '900', color: COLORS.success },
  commissionText: { fontSize: FONT_SIZE.sm, fontWeight: '700', color: COLORS.success, opacity: 0.9 },
  bankCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, padding: SPACING.md, borderRadius: BORDER_RADIUS.xl, ...SHADOWS.sm },
  bankIcon: { width: 48, height: 48, borderRadius: BORDER_RADIUS.lg, backgroundColor: COLORS.infoSoft, alignItems: 'center', justifyContent: 'center' },
  bankContent: { flex: 1, marginLeft: SPACING.md },
  bankTitle: { fontSize: FONT_SIZE.md, fontWeight: '800', color: '#0F172A' },
  bankText: { fontSize: FONT_SIZE.sm, fontWeight: '600', color: '#475569' },
});

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
import { getDriverBankDetails, getDriverEarningsDashboard } from '@/src/services/api';

type Period = 'today' | 'week' | 'month';

export default function DriverEarningsScreen() {
  const router = useRouter();
  const { user } = useAppStore();
  const [period, setPeriod] = useState<Period>('today');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dashboard, setDashboard] = useState<any>(null);
  const [bankReady, setBankReady] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) {
      setDashboard(null);
      setBankReady(false);
      setLoading(false);
      return;
    }
    try {
      const [earningsRes, bankRes] = await Promise.all([
        getDriverEarningsDashboard(user.id, period),
        getDriverBankDetails(user.id),
      ]);
      setDashboard(earningsRes.data || null);
      setBankReady(Boolean(bankRes.data?.payout_ready));
    } catch (e) {
      if (__DEV__) console.warn('Failed to load driver earnings', e);
      setDashboard(null);
      setBankReady(false);
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
  const projections = dashboard?.projections || {};
  const guarantee = dashboard?.guarantee || null;
  const salaryMode = dashboard?.salary_mode || null;
  const chartData = useMemo(() => {
    const breakdown = dashboard?.daily_breakdown || {};
    const entries = Object.entries(breakdown)
      .map(([date, value]) => ({
        date,
        trips: Number((value as any)?.trips || 0),
        earnings: Number((value as any)?.earnings || 0),
      }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-7);
    const max = Math.max(1, ...entries.map((item) => item.earnings));
    return entries.map((item) => ({
      ...item,
      heightPct: Math.max(12, Math.round((item.earnings / max) * 100)),
      label: item.date.slice(5),
    }));
  }, [dashboard?.daily_breakdown]);

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

        {guarantee && (
          <View style={[styles.guaranteeCard, guarantee.active ? styles.guaranteeCardActive : styles.guaranteeCardStandby]}>
            <View style={styles.guaranteeHeader}>
              <Ionicons
                name={guarantee.active ? 'rainy-outline' : 'shield-checkmark-outline'}
                size={22}
                color={guarantee.active ? COLORS.warning : COLORS.info}
              />
              <View style={styles.guaranteeHeaderText}>
                <Text style={styles.guaranteeTitle}>{guarantee.title}</Text>
                <Text style={styles.guaranteeSubtitle}>{guarantee.reason}</Text>
              </View>
            </View>
            <View style={styles.guaranteeRow}>
              <View style={styles.guaranteeItem}>
                <Text style={styles.guaranteeLabel}>Hourly floor</Text>
                <Text style={styles.guaranteeValue}>{CURRENCY}{Number(guarantee.minimum_hourly_earnings || 0).toLocaleString()}</Text>
              </View>
              <View style={styles.guaranteeItem}>
                <Text style={styles.guaranteeLabel}>This hour</Text>
                <Text style={styles.guaranteeValue}>{CURRENCY}{Number(guarantee.current_hour_earnings || 0).toLocaleString()}</Text>
              </View>
              <View style={styles.guaranteeItem}>
                <Text style={styles.guaranteeLabel}>Gap cover</Text>
                <Text style={styles.guaranteeValue}>{CURRENCY}{Number(guarantee.top_up_gap || 0).toLocaleString()}</Text>
              </View>
            </View>
            <Text style={styles.guaranteeFootnote}>{guarantee.message}</Text>
          </View>
        )}

        {salaryMode?.enabled && (
          <View style={[styles.salaryModeCard, salaryMode.status === 'behind' ? styles.salaryModeCardBehind : styles.salaryModeCardOnTrack]}>
            <View style={styles.salaryModeHeader}>
              <Ionicons
                name={salaryMode.status === 'behind' ? 'trending-up-outline' : 'wallet-outline'}
                size={22}
                color={salaryMode.status === 'behind' ? COLORS.warning : COLORS.accentGreen}
              />
              <View style={styles.guaranteeHeaderText}>
                <Text style={styles.guaranteeTitle}>Driver Salary Mode</Text>
                <Text style={styles.guaranteeSubtitle}>Monthly income planning with dispatch pacing</Text>
              </View>
            </View>
            <View style={styles.guaranteeRow}>
              <View style={styles.guaranteeItem}>
                <Text style={styles.guaranteeLabel}>Target</Text>
                <Text style={styles.guaranteeValue}>{CURRENCY}{Number(salaryMode.monthly_income_target || 0).toLocaleString()}</Text>
              </View>
              <View style={styles.guaranteeItem}>
                <Text style={styles.guaranteeLabel}>Achieved</Text>
                <Text style={styles.guaranteeValue}>{CURRENCY}{Number(salaryMode.achieved_this_month || 0).toLocaleString()}</Text>
              </View>
              <View style={styles.guaranteeItem}>
                <Text style={styles.guaranteeLabel}>Daily pace</Text>
                <Text style={styles.guaranteeValue}>{CURRENCY}{Number(salaryMode.required_daily_average || 0).toLocaleString()}</Text>
              </View>
            </View>
            <Text style={styles.guaranteeFootnote}>
              {salaryMode.status === 'behind'
                ? `You are behind pace by ${CURRENCY}${Number(salaryMode.pace_gap || 0).toLocaleString()}. Dispatch boost is ${Number(salaryMode.dispatch_priority_boost || 1).toFixed(2)}x.`
                : `On track for about ${CURRENCY}${Number(salaryMode.projected_month_end || 0).toLocaleString()} this month.`}
            </Text>
          </View>
        )}

        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <Text style={styles.chartTitle}>{periodLabel} Breakdown</Text>
            <Text style={styles.chartSubtitle}>Daily earnings over the last 7 active days</Text>
          </View>
          {chartData.length > 0 ? (
            <View style={styles.chartWrap}>
              {chartData.map((item) => (
                <View key={item.date} style={styles.chartColumn}>
                  <Text style={styles.chartValue}>{CURRENCY}{item.earnings.toLocaleString()}</Text>
                  <View style={styles.chartTrack}>
                    <View style={[styles.chartBar, { height: `${item.heightPct}%` }]} />
                  </View>
                  <Text style={styles.chartTrips}>{item.trips} trips</Text>
                  <Text style={styles.chartLabel}>{item.label}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.chartEmpty}>Complete more trips to unlock your earnings chart.</Text>
          )}
        </View>

        <View style={styles.projectionsCard}>
          <Text style={styles.projectionsTitle}>Earnings Outlook</Text>
          <View style={styles.projectionsRow}>
            <View style={styles.projectionItem}>
              <Text style={styles.projectionLabel}>Daily</Text>
              <Text style={styles.projectionValue}>{CURRENCY}{Number(projections.daily || 0).toLocaleString()}</Text>
            </View>
            <View style={styles.projectionItem}>
              <Text style={styles.projectionLabel}>Weekly</Text>
              <Text style={styles.projectionValue}>{CURRENCY}{Number(projections.weekly || 0).toLocaleString()}</Text>
            </View>
            <View style={styles.projectionItem}>
              <Text style={styles.projectionLabel}>Monthly</Text>
              <Text style={styles.projectionValue}>{CURRENCY}{Number(projections.monthly || 0).toLocaleString()}</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity style={styles.bankCard} onPress={() => router.push('/driver/bank')}>
          <View style={styles.bankIcon}>
            <Ionicons name="card" size={24} color={COLORS.info} />
          </View>
          <View style={styles.bankContent}>
            <Text style={styles.bankTitle}>Bank & payout route</Text>
            <Text style={styles.bankText}>
              {bankReady
                ? 'Ready to receive direct rider payments'
                : 'Finish bank setup to receive direct rider payments'}
            </Text>
          </View>
          <View style={[styles.bankStatusPill, bankReady ? styles.bankStatusPillReady : styles.bankStatusPillPending]}>
            <Text style={[styles.bankStatusText, bankReady ? styles.bankStatusTextReady : styles.bankStatusTextPending]}>
              {bankReady ? 'Ready' : 'Setup'}
            </Text>
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
  guaranteeCard: { borderRadius: BORDER_RADIUS.xl, padding: SPACING.lg, marginBottom: SPACING.lg, ...SHADOWS.sm },
  guaranteeCardActive: { backgroundColor: COLORS.warningSoft },
  guaranteeCardStandby: { backgroundColor: COLORS.infoSoft },
  salaryModeCard: { borderRadius: BORDER_RADIUS.xl, padding: SPACING.lg, marginBottom: SPACING.lg, ...SHADOWS.sm },
  salaryModeCardBehind: { backgroundColor: COLORS.accentPurpleSoft },
  salaryModeCardOnTrack: { backgroundColor: COLORS.successSoft },
  guaranteeHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginBottom: SPACING.md },
  salaryModeHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginBottom: SPACING.md },
  guaranteeHeaderText: { flex: 1 },
  guaranteeTitle: { fontSize: FONT_SIZE.md, fontWeight: '900', color: COLORS.gray900 },
  guaranteeSubtitle: { fontSize: FONT_SIZE.sm, fontWeight: '600', color: COLORS.gray600, marginTop: 2 },
  guaranteeRow: { flexDirection: 'row', gap: SPACING.md },
  guaranteeItem: { flex: 1, backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: BORDER_RADIUS.lg, padding: SPACING.md },
  guaranteeLabel: { fontSize: FONT_SIZE.xs, fontWeight: '800', color: COLORS.gray500, textTransform: 'uppercase' },
  guaranteeValue: { fontSize: FONT_SIZE.md, fontWeight: '900', color: COLORS.gray900, marginTop: SPACING.xs },
  guaranteeFootnote: { fontSize: FONT_SIZE.sm, fontWeight: '600', color: COLORS.gray700, marginTop: SPACING.md, lineHeight: 20 },
  chartCard: { backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.xl, padding: SPACING.lg, marginBottom: SPACING.lg, ...SHADOWS.sm },
  chartHeader: { marginBottom: SPACING.md },
  chartTitle: { fontSize: FONT_SIZE.lg, fontWeight: '900', color: COLORS.gray900 },
  chartSubtitle: { fontSize: FONT_SIZE.sm, fontWeight: '600', color: COLORS.gray500, marginTop: 4 },
  chartWrap: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: SPACING.sm, minHeight: 220 },
  chartColumn: { flex: 1, alignItems: 'center' },
  chartValue: { fontSize: FONT_SIZE.xs, fontWeight: '800', color: COLORS.gray700, marginBottom: SPACING.xs, textAlign: 'center' },
  chartTrack: { width: '100%', maxWidth: 28, height: 120, borderRadius: BORDER_RADIUS.full, backgroundColor: COLORS.gray100, justifyContent: 'flex-end', overflow: 'hidden' },
  chartBar: { width: '100%', backgroundColor: COLORS.accentBlue, borderRadius: BORDER_RADIUS.full },
  chartTrips: { fontSize: FONT_SIZE.xs, fontWeight: '700', color: COLORS.gray500, marginTop: SPACING.xs },
  chartLabel: { fontSize: FONT_SIZE.xs, fontWeight: '800', color: COLORS.gray700, marginTop: 4 },
  chartEmpty: { fontSize: FONT_SIZE.sm, fontWeight: '600', color: COLORS.gray500 },
  projectionsCard: { backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.xl, padding: SPACING.lg, marginBottom: SPACING.lg, ...SHADOWS.sm },
  projectionsTitle: { fontSize: FONT_SIZE.md, fontWeight: '900', color: COLORS.gray900, marginBottom: SPACING.md },
  projectionsRow: { flexDirection: 'row', gap: SPACING.md },
  projectionItem: { flex: 1, backgroundColor: COLORS.gray50, borderRadius: BORDER_RADIUS.lg, padding: SPACING.md },
  projectionLabel: { fontSize: FONT_SIZE.xs, fontWeight: '800', color: COLORS.gray500, textTransform: 'uppercase' },
  projectionValue: { fontSize: FONT_SIZE.md, fontWeight: '900', color: COLORS.gray900, marginTop: SPACING.xs },
  bankCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, padding: SPACING.md, borderRadius: BORDER_RADIUS.xl, ...SHADOWS.sm },
  bankIcon: { width: 48, height: 48, borderRadius: BORDER_RADIUS.lg, backgroundColor: COLORS.infoSoft, alignItems: 'center', justifyContent: 'center' },
  bankContent: { flex: 1, marginLeft: SPACING.md },
  bankTitle: { fontSize: FONT_SIZE.md, fontWeight: '800', color: '#0F172A' },
  bankText: { fontSize: FONT_SIZE.sm, fontWeight: '600', color: '#475569' },
  bankStatusPill: { borderRadius: BORDER_RADIUS.full, paddingHorizontal: SPACING.sm, paddingVertical: 6, marginRight: SPACING.sm },
  bankStatusPillReady: { backgroundColor: COLORS.successSoft },
  bankStatusPillPending: { backgroundColor: COLORS.warningSoft },
  bankStatusText: { fontSize: FONT_SIZE.xs, fontWeight: '800' },
  bankStatusTextReady: { color: COLORS.success },
  bankStatusTextPending: { color: COLORS.warning },
});

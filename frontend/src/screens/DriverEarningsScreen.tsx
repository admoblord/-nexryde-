import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTabBottomPad } from '@/src/hooks/useBottomPad';
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
import { useFlowLayout } from '@/src/constants/flowLayout';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '@/src/store/appStore';
import { getDriverBankDetails, getDriverEarningsDashboard } from '@/src/services/api';
import { TabBrandStrip } from '@/src/components/flow/TabBrandStrip';
import { useAuthedUserId } from '@/src/hooks/useAuthedUserId';

type Period = 'today' | 'week' | 'month';

export default function DriverEarningsScreen() {
  const router = useRouter();
  const { userId: driverId, canCallAuthedApi } = useAuthedUserId();
  const [period, setPeriod] = useState<Period>('today');
  const [loading, setLoading] = useState(true);
  const tabPad = useTabBottomPad(8);
  const flow = useFlowLayout();
  const [refreshing, setRefreshing] = useState(false);
  const [dashboard, setDashboard] = useState<any>(null);
  const [bankReady, setBankReady] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    if (!driverId || !canCallAuthedApi) {
      setDashboard(null);
      setBankReady(false);
      setLoading(false);
      return;
    }
    setLoadError(false);
    try {
      const [earningsRes, bankRes] = await Promise.all([
        getDriverEarningsDashboard(driverId, period),
        getDriverBankDetails(driverId),
      ]);
      setDashboard(earningsRes.data || null);
      setBankReady(Boolean(bankRes.data?.payout_ready));
    } catch (e) {
      if (__DEV__) console.warn('Failed to load driver earnings', e);
      setDashboard(null);
      setBankReady(false);
      setLoadError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period, canCallAuthedApi, driverId]);

  useEffect(() => {
    if (!canCallAuthedApi) return;
    void load();
  }, [load, canCallAuthedApi]);

  const summary = dashboard?.summary || {};
  const averages = dashboard?.averages || {};
  const projections = dashboard?.projections || {};
  const surge = dashboard?.surge || null;
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

  const surgeExtras = useMemo(() => {
    if (!surge) return null;
    const ctx = surge.surge_context || {};
    const factors = Array.isArray(surge.factors) ? surge.factors : [];
    const dr = Number(ctx.demand_ratio_estimate ?? 0);
    const gps = Boolean(ctx.gps_based_demand);
    const rawCity = typeof ctx.city === 'string' ? ctx.city : '';
    const cityLabel =
      (typeof ctx.city_label === 'string' && ctx.city_label.trim()) ||
      (rawCity ? rawCity.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) : '');
    const svcRaw = ctx.service_label || ctx.service_type || 'economy';
    const serviceLabel = String(svcRaw).charAt(0).toUpperCase() + String(svcRaw).slice(1).toLowerCase();
    const capRaw = ctx.tier_surge_cap;
    const tierCap = capRaw != null && !Number.isNaN(Number(capRaw)) ? Number(capRaw) : null;
    return {
      cityLabel: cityLabel.trim() || 'Your area',
      serviceLabel,
      gps,
      demandPct: Math.max(0, Math.min(100, Math.round(dr * 100))),
      demandBandLabel: typeof ctx.demand_band_label === 'string' ? ctx.demand_band_label : '',
      tierCap,
      factors,
      windowEnds: typeof surge.window_ends_label === 'string' ? surge.window_ends_label : '',
      accent: typeof surge.tier_color === 'string' ? surge.tier_color : '#22C55E',
    };
  }, [surge]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TabBrandStrip role="driver" />
      <View style={[styles.header, { paddingHorizontal: flow.padH }]}>
        <Text style={styles.headerTitle}>Earnings</Text>
        <Text style={styles.headerSubtext}>Keep 100% of your earnings</Text>
      </View>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingHorizontal: flow.padH,
            paddingTop: Math.round(flow.sectionGap * 0.85),
            paddingBottom: tabPad,
            gap: Math.round(flow.sectionGap * 0.55),
          },
        ]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        {loadError && !refreshing && (
          <TouchableOpacity
            style={styles.errorCard}
            onPress={() => { setRefreshing(true); load(); }}
            activeOpacity={0.8}
          >
            <Ionicons name="cloud-offline-outline" size={20} color={COLORS.error} />
            <Text style={styles.errorText}>Couldn't load earnings — tap to retry</Text>
            <Ionicons name="refresh" size={18} color={COLORS.error} />
          </TouchableOpacity>
        )}
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

        {/* ── Live area pricing (hybrid surge) ───────────────────────────── */}
        {surge && surgeExtras && (
          <View style={styles.surgeSection}>
            <Text style={styles.surgeEyebrow}>Live area pricing</Text>
            <View
              style={[
                styles.surgeCardOuter,
                surge.is_surge ? styles.surgeCardOuterActive : null,
              ]}
            >
              <View style={[styles.surgeAccentBar, { backgroundColor: surgeExtras.accent }]} />
              <View style={styles.surgeCardInner}>
                <View style={styles.surgeTopRow}>
                  <View style={[styles.surgeIconWrap, { backgroundColor: `${surgeExtras.accent}22` }]}>
                    <Ionicons
                      name={surge.is_surge ? 'flash' : 'checkmark-circle-outline'}
                      size={22}
                      color={surgeExtras.accent}
                    />
                  </View>
                  <View style={styles.surgeTitleBlock}>
                    <Text style={[styles.surgeHeadline, { color: surgeExtras.accent }]}>
                      {surge.is_surge ? surge.tier_label || 'Surge active' : 'Standard pricing'}
                    </Text>
                    <Text style={styles.surgeReasons} numberOfLines={3}>
                      {Array.isArray(surge.reasons) && surge.reasons.length > 0
                        ? surge.reasons.join(' · ')
                        : 'No surge extras right now — fares follow base rates.'}
                    </Text>
                    {surgeExtras.windowEnds ? (
                      <Text style={styles.surgeWindowHint}>Peak window ends ~ {surgeExtras.windowEnds}</Text>
                    ) : null}
                  </View>
                  <View style={styles.surgeMultColumn}>
                    <Text style={[styles.surgeMultValue, { color: surgeExtras.accent }]}>
                      {Number(surge.multiplier ?? 1).toFixed(2)}×
                    </Text>
                    <Text style={styles.surgeMultCaption}>multiplier</Text>
                    {surge.is_surge ? (
                      <View style={[styles.surgePctBadge, { backgroundColor: surgeExtras.accent }]}>
                        <Text style={styles.surgePctText}>+{surge.pct_extra ?? 0}%</Text>
                      </View>
                    ) : null}
                  </View>
                </View>

                <View style={styles.surgeChipRow}>
                  <View style={styles.surgeChip}>
                    <Ionicons name="location-outline" size={14} color="#475569" />
                    <Text style={styles.surgeChipText} numberOfLines={1}>
                      {surgeExtras.cityLabel}
                    </Text>
                  </View>
                  <View style={styles.surgeChip}>
                    <Ionicons name="car-sport-outline" size={14} color="#475569" />
                    <Text style={styles.surgeChipText} numberOfLines={1}>
                      {surgeExtras.serviceLabel}
                    </Text>
                  </View>
                  <View style={[styles.surgeChip, surgeExtras.gps ? styles.surgeChipGood : styles.surgeChipWarn]}>
                    <Ionicons name={surgeExtras.gps ? 'pulse' : 'warning-outline'} size={14} color={surgeExtras.gps ? '#047857' : '#B45309'} />
                    <Text
                      style={[styles.surgeChipText, surgeExtras.gps ? styles.surgeChipTextGood : styles.surgeChipTextWarn]}
                      numberOfLines={1}
                    >
                      {surgeExtras.gps ? 'Live demand' : 'GPS off'}
                    </Text>
                  </View>
                </View>

                {surgeExtras.gps ? (
                  <View style={styles.surgeDemandBlock}>
                    <View style={styles.surgeDemandHeader}>
                      <Text style={styles.surgeDemandLabel}>Area demand signal</Text>
                      <Text style={styles.surgeDemandBand}>{surgeExtras.demandBandLabel || 'Balanced supply'}</Text>
                    </View>
                    <View style={styles.surgeDemandTrack}>
                      <View
                        style={[
                          styles.surgeDemandFill,
                          {
                            width: `${surgeExtras.demandPct}%`,
                            backgroundColor: surgeExtras.accent,
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.surgeDemandFoot}>{surgeExtras.demandPct}% estimated pressure near you</Text>
                  </View>
                ) : (
                  <Text style={styles.surgeGpsHint}>
                    Share location while online so we can estimate ride demand in your bubble — rush and weekend pricing still apply.
                  </Text>
                )}

                {surgeExtras.tierCap != null ? (
                  <Text style={styles.surgeCapLine}>
                    Tier cap on fares: up to {surgeExtras.tierCap.toFixed(1)}× for {surgeExtras.serviceLabel}.
                  </Text>
                ) : null}

                {surgeExtras.factors.length > 0 ? (
                  <View style={styles.surgeFactorsBlock}>
                    <Text style={styles.surgeFactorsTitle}>What's included</Text>
                    <View style={styles.surgeFactorsRow}>
                      {surgeExtras.factors.map((row: { label?: string; multiplier?: number }, idx: number) => (
                        <View key={`${row.label}-${idx}`} style={styles.surgeFactorPill}>
                          <Text style={styles.surgeFactorPillText} numberOfLines={1}>
                            {row.label || 'Factor'}{' '}
                            <Text style={styles.surgeFactorPillMul}>×{Number(row.multiplier ?? 1).toFixed(2)}</Text>
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ) : null}

                <Text style={styles.surgeFootnote}>
                  {typeof surge.driver_message === 'string' && surge.driver_message.trim().length > 0
                    ? surge.driver_message
                    : surge.is_surge
                      ? `Typical bump right now: about +${surge.pct_extra ?? 0}% vs base fare before your tier cap.`
                      : 'Stay online — pricing can rise during rush hours, weekends, holidays, tight supply near you, and flagged rain.'}
                </Text>
              </View>
            </View>
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
  content: { flexGrow: 1 },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  errorText: { flex: 1, fontSize: FONT_SIZE.sm, fontWeight: '700', color: COLORS.error },
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
  surgeSection: { marginBottom: SPACING.lg },
  surgeEyebrow: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '900',
    color: '#64748B',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: SPACING.sm,
    marginLeft: 2,
  },
  surgeCardOuter: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
    ...SHADOWS.sm,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  surgeCardOuterActive: {
    ...SHADOWS.md,
    borderColor: '#FDE68A',
  },
  surgeAccentBar: { width: 5 },
  surgeCardInner: { flex: 1, padding: SPACING.lg },
  surgeTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md },
  surgeIconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  surgeTitleBlock: { flex: 1, minWidth: 0 },
  surgeHeadline: { fontSize: FONT_SIZE.md, fontWeight: '900', letterSpacing: -0.2 },
  surgeReasons: { fontSize: FONT_SIZE.sm, fontWeight: '600', color: '#475569', marginTop: 6, lineHeight: 20 },
  surgeWindowHint: { fontSize: FONT_SIZE.xs, fontWeight: '700', color: '#64748B', marginTop: 6 },
  surgeMultColumn: { alignItems: 'flex-end', minWidth: 72 },
  surgeMultValue: { fontSize: 28, fontWeight: '900', letterSpacing: -0.5 },
  surgeMultCaption: { fontSize: FONT_SIZE.xs, fontWeight: '700', color: '#94A3B8', marginTop: -2 },
  surgeChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.md },
  surgeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 7,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: '#F1F5F9',
    maxWidth: '100%',
  },
  surgeChipGood: { backgroundColor: '#ECFDF5' },
  surgeChipWarn: { backgroundColor: '#FFFBEB' },
  surgeChipText: { fontSize: FONT_SIZE.xs, fontWeight: '800', color: '#334155', flexShrink: 1 },
  surgeChipTextGood: { color: '#047857' },
  surgeChipTextWarn: { color: '#B45309' },
  surgeDemandBlock: { marginTop: SPACING.md },
  surgeDemandHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  surgeDemandLabel: { fontSize: FONT_SIZE.xs, fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.6 },
  surgeDemandBand: { fontSize: FONT_SIZE.xs, fontWeight: '900', color: '#0F172A' },
  surgeDemandTrack: { height: 8, borderRadius: BORDER_RADIUS.full, backgroundColor: '#E2E8F0', overflow: 'hidden' },
  surgeDemandFill: { height: '100%', borderRadius: BORDER_RADIUS.full },
  surgeDemandFoot: { fontSize: FONT_SIZE.xs, fontWeight: '600', color: '#64748B', marginTop: 6 },
  surgeGpsHint: {
    marginTop: SPACING.md,
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: '#92400E',
    lineHeight: 20,
    backgroundColor: '#FFFBEB',
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  surgeCapLine: { fontSize: FONT_SIZE.xs, fontWeight: '700', color: '#64748B', marginTop: SPACING.md },
  surgeFactorsBlock: { marginTop: SPACING.md },
  surgeFactorsTitle: { fontSize: FONT_SIZE.xs, fontWeight: '900', color: '#64748B', marginBottom: SPACING.sm, textTransform: 'uppercase', letterSpacing: 0.6 },
  surgeFactorsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  surgeFactorPill: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    maxWidth: '100%',
  },
  surgeFactorPillText: { fontSize: FONT_SIZE.xs, fontWeight: '700', color: '#334155' },
  surgeFactorPillMul: { fontWeight: '900', color: '#0F172A' },
  surgeFootnote: { fontSize: FONT_SIZE.sm, fontWeight: '600', color: '#475569', marginTop: SPACING.md, lineHeight: 21 },
  surgePctBadge: { borderRadius: BORDER_RADIUS.full, paddingHorizontal: 10, paddingVertical: 5, alignItems: 'center', justifyContent: 'center', marginTop: SPACING.sm },
  surgePctText: { color: '#FFF', fontSize: FONT_SIZE.xs, fontWeight: '900' },
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

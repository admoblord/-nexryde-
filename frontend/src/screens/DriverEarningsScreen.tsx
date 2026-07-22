/**
 * DriverEarningsScreen — Premium dark-theme earnings hub.
 *
 * Sections:
 *  1. Wallet balance hero → tap to withdraw
 *  2. Trial progress banner (only when on trial)
 *  3. Total earnings card with period toggle
 *  4. Stats grid (trips, hours, rating, km)
 *  5. Live surge/area pricing card
 *  6. 7-day earnings bar chart
 *  7. Earnings outlook (daily/weekly/monthly)
 *  8. Salary mode card (if enabled)
 *  9. Bank & payout route CTA
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTabBottomPad } from '@/src/hooks/useBottomPad';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '@/src/store/appStore';
import { TabBrandStrip } from '@/src/components/flow/TabBrandStrip';
import { useAuthedUserId } from '@/src/hooks/useAuthedUserId';
import { useFlowLayout } from '@/src/constants/flowLayout';
import { CURRENCY, useThemeColors } from '@/src/constants/theme';
import { BRAND, RADIUS, SPACING, SURFACE, TYPOGRAPHY } from '@/src/constants/designSystem';
import { useResource } from '@/src/hooks/useResource';
import { Skeleton } from '@/src/components/Skeleton';
import { InlineError } from '@/src/components/InlineError';
import {
  fetchDriverEarningsScreenData,
  type EarningsPeriod,
} from '@/src/services/driverEarningsScreenData';
import { useWalletEnabled } from '@/src/services/clientConfig';

// ─── Design tokens (appearance-aware) ──────────────────────────────────────
type EarnPalette = {
  bg: string; card: string; card2: string; border: string;
  green: string; neon: string; amber: string; blue: string;
  sub: string; muted: string; text: string; textDim: string;
};
function buildEarnPalette(isDark: boolean, colors: { background: string; card: string; surfaceAlt: string; border: string; text: string; textSecondary: string; textMuted: string }): EarnPalette {
  if (isDark) {
    return {
      bg: BRAND.bgDeep, card: SURFACE.cardDark, card2: SURFACE.cardElevated, border: SURFACE.hairline,
      green: BRAND.primaryDark, neon: BRAND.primary, amber: BRAND.warning, blue: BRAND.info,
      sub: BRAND.textSecondary, muted: BRAND.textMuted, text: BRAND.textPrimary, textDim: BRAND.textSecondary,
    };
  }
  return {
    bg: colors.background, card: colors.card, card2: colors.surfaceAlt, border: colors.border,
    green: BRAND.primaryDark, neon: BRAND.primary, amber: BRAND.warning, blue: BRAND.info,
    sub: colors.textSecondary, muted: colors.textMuted, text: colors.text, textDim: colors.textSecondary,
  };
}
const BORDER_RADIUS = RADIUS;
const FONT_SIZE = {
  xs: 11,
  sm: 13,
  md: 15,
  xl: 22,
} as const;

function formatTripHours(totalTimeMins: number): string {
  const hrs = totalTimeMins / 60;
  if (hrs <= 0) return '0';
  if (hrs < 10) return hrs.toFixed(1);
  return String(Math.round(hrs));
}

function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `${CURRENCY}${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${CURRENCY}${(n / 1_000).toFixed(1)}k`;
  return `${CURRENCY}${Math.round(n).toLocaleString('en-NG')}`;
}

type Period = EarningsPeriod;

function EarningsSkeleton() {
  return (
    <View style={{ gap: 14 }}>
      <Skeleton height={96} radius={16} />
      <Skeleton height={140} radius={16} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Skeleton height={88} radius={14} style={{ flex: 1 }} />
        <Skeleton height={88} radius={14} style={{ flex: 1 }} />
        <Skeleton height={88} radius={14} style={{ flex: 1 }} />
        <Skeleton height={88} radius={14} style={{ flex: 1 }} />
      </View>
      <Skeleton height={120} radius={16} />
      <Skeleton height={160} radius={16} />
    </View>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

export default function DriverEarningsScreen() {
  const router = useRouter();
  // Launch mode: wallet off → earnings is a record only (riders pay drivers directly).
  const walletEnabled = useWalletEnabled();
  const user         = useAppStore((s) => s.user);
  const subscription = useAppStore((s) => s.subscription) as any;
  const { userId: driverId, canCallAuthedApi } = useAuthedUserId();
  const { colors, isDark } = useThemeColors();
  const D = useMemo(() => buildEarnPalette(isDark, colors), [isDark, colors]);
  const s = useMemo(() => createEarnStyles(D), [D]);
  const [period, setPeriod]         = useState<Period>('today');
  const [refreshing, setRefreshing] = useState(false);
  const tabPad = useTabBottomPad(8);
  const flow   = useFlowLayout();

  function SectionLabel({ text }: { text: string }) {
    return <Text style={s.sectionLabel}>{text}</Text>;
  }
  function DarkCard({ children, style }: { children: React.ReactNode; style?: object }) {
    return <View style={[s.darkCard, style]}>{children}</View>;
  }
  function StatCell({
    icon, iconColor, value, label, hint,
  }: {
    icon: React.ComponentProps<typeof Ionicons>['name'];
    iconColor: string;
    value: string;
    label: string;
    hint?: string;
  }) {
    return (
      <View style={s.statCell}>
        <View style={[s.statIconWrap, { backgroundColor: `${iconColor}18` }]}>
          <Ionicons name={icon} size={18} color={iconColor} />
        </View>
        <Text style={s.statValue}>{value}</Text>
        <Text style={s.statLabel}>{label}</Text>
        {hint ? <Text style={s.statHint}>{hint}</Text> : null}
      </View>
    );
  }

  const resourceKey = `driver-earnings:${driverId ?? 'none'}:${period}`;
  const { data, loading, error, retry } = useResource(
    resourceKey,
    () => fetchDriverEarningsScreenData(driverId!, period),
    { cache: true, enabled: canCallAuthedApi && !!driverId },
  );

  const dashboard = (data?.dashboard ?? null) as Record<string, any> | null;
  const bankReady = data?.bankReady ?? false;
  const walletBal = data?.walletBalance ?? null;

  useEffect(() => {
    if (!loading) setRefreshing(false);
  }, [loading]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void retry();
  }, [retry]);

  const summary     = dashboard?.summary ?? {};
  const averages    = dashboard?.averages ?? {};
  const projections = dashboard?.projections ?? {};
  const surge       = dashboard?.surge ?? null;
  const salaryMode  = dashboard?.salary_mode ?? null;

  // ── Trial progress ───────────────────────────────────────────────────────
  const isOnTrial    = subscription?.status === 'trial' || subscription?.trial_active;
  const trialDone    = Number(subscription?.trial_trips_completed ?? subscription?.completed_trips ?? 0);
  const trialTarget  = Number(subscription?.trial_trips_target ?? subscription?.trips_target ?? 15);
  const trialPct     = trialTarget > 0 ? Math.min(1, trialDone / trialTarget) : 0;
  const trialLeft    = Math.max(0, trialTarget - trialDone);

  // ── Chart data ───────────────────────────────────────────────────────────
  const chartData = useMemo(() => {
    const breakdown = dashboard?.daily_breakdown ?? {};
    const entries = Object.entries(breakdown)
      .map(([date, value]) => ({
        date,
        trips: Number((value as any)?.trips ?? 0),
        earnings: Number((value as any)?.earnings ?? 0),
      }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-7);
    const max = Math.max(1, ...entries.map(i => i.earnings));
    return entries.map(i => ({
      ...i,
      heightPct: Math.max(8, Math.round((i.earnings / max) * 100)),
      label: i.date.slice(5),
    }));
  }, [dashboard?.daily_breakdown]);

  // ── Surge extras ─────────────────────────────────────────────────────────
  const surgeExtras = useMemo(() => {
    if (!surge) return null;
    const ctx = surge.surge_context ?? {};
    const rawCity = typeof ctx.city === 'string' ? ctx.city : '';
    const cityLabel =
      (typeof ctx.city_label === 'string' && ctx.city_label.trim()) ||
      (rawCity ? rawCity.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) : '');
    const svcRaw = ctx.service_label || ctx.service_type || 'economy';
    const serviceLabel = String(svcRaw).charAt(0).toUpperCase() + String(svcRaw).slice(1).toLowerCase();
    const accent = typeof surge.tier_color === 'string' ? surge.tier_color : D.neon;
    const dr = Number(ctx.demand_ratio_estimate ?? 0);
    return {
      cityLabel: cityLabel.trim() || 'Your area',
      serviceLabel,
      gps: Boolean(ctx.gps_based_demand),
      demandPct: Math.max(0, Math.min(100, Math.round(dr * 100))),
      demandBandLabel: typeof ctx.demand_band_label === 'string' ? ctx.demand_band_label : '',
      tierCap: ctx.tier_surge_cap != null ? Number(ctx.tier_surge_cap) : null,
      factors: Array.isArray(surge.factors) ? surge.factors : [],
      windowEnds: typeof surge.window_ends_label === 'string' ? surge.window_ends_label : '',
      accent,
    };
  }, [surge]);

  const periodLabel = period === 'today' ? 'Today' : period === 'week' ? 'This Week' : 'This Month';

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <TabBrandStrip role="driver" />

      {/* Header */}
      <View style={[s.header, { paddingHorizontal: flow.padH }]}>
        <View>
          <Text style={s.headerTitle}>Earnings</Text>
          <Text style={s.headerSub}>
            {walletEnabled ? 'You keep 100% of every fare' : 'Riders pay you directly — you keep 100%'}
          </Text>
        </View>
        {walletEnabled ? (
          <TouchableOpacity
            style={s.withdrawBtn}
            onPress={() => router.push('/driver/withdrawal')}
            accessibilityRole="button"
          >
            <Ionicons name="arrow-up-circle-outline" size={16} color={D.neon} />
            <Text style={s.withdrawBtnTxt}>Withdraw</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={[s.scroll, { paddingHorizontal: flow.padH, paddingBottom: tabPad + 16 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={D.neon}
            colors={[D.neon]}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {!data && loading && <EarningsSkeleton />}
        {!data && error && (
          <InlineError message="Could not load earnings" onRetry={retry} />
        )}

        {data && error && (
          <TouchableOpacity style={s.errorBanner} onPress={() => void retry()} activeOpacity={0.8}>
            <Ionicons name="cloud-offline-outline" size={18} color="#F87171" />
            <Text style={s.errorTxt}>Could not refresh — showing last saved data</Text>
            <Ionicons name="refresh" size={16} color="#F87171" />
          </TouchableOpacity>
        )}

        {data ? (
        <>
        {walletEnabled ? (
        <TouchableOpacity
          onPress={() => router.push('/driver/withdrawal')}
          activeOpacity={0.88}
          accessibilityRole="button"
          accessibilityLabel="Wallet balance, tap to withdraw"
        >
          <LinearGradient
            colors={['#0B2A1A', '#0F3D24', '#0B2A1A']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={s.walletHero}
          >
            <View style={s.walletHeroLeft}>
              <View style={s.walletIconWrap}>
                <Ionicons name="wallet" size={22} color={D.neon} />
              </View>
              <View>
                <Text style={s.walletLabel}>Wallet balance</Text>
                <Text style={s.walletAmount}>
                  {walletBal !== null ? fmtMoney(walletBal) : '—'}
                </Text>
              </View>
            </View>
            <View style={s.walletAction}>
              <Text style={s.walletActionTxt}>Withdraw</Text>
              <Ionicons name="arrow-forward" size={14} color={D.neon} />
            </View>
          </LinearGradient>
        </TouchableOpacity>
        ) : null}

        {/* ── Trial progress banner ───────────────────────────────────────── */}
        {isOnTrial ? (
          <TouchableOpacity
            style={s.trialBanner}
            onPress={() => router.push('/driver/subscription')}
            activeOpacity={0.88}
          >
            <View style={s.trialLeft}>
              <Text style={s.trialTitle}>
                Free Trial — {trialDone}/{trialTarget} trips
              </Text>
              <Text style={s.trialSub}>
                {trialLeft > 0
                  ? `${trialLeft} more trips to unlock full access`
                  : 'Trial complete — activate your plan'}
              </Text>
              <View style={s.trialBarTrack}>
                <View style={[s.trialBarFill, { width: `${Math.round(trialPct * 100)}%` }]} />
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={D.amber} />
          </TouchableOpacity>
        ) : null}

        {/* ── Total earnings card ─────────────────────────────────────────── */}
        <LinearGradient
          colors={['#0B2035', '#091828', '#070F1C']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={s.earningsHero}
        >
          <Text style={s.earningsLabel}>Total earnings</Text>
          <Text style={s.earningsAmount}>
            {fmtMoney(Number(summary.total_earnings ?? 0))}
          </Text>
          <Text style={s.earningsPeriodHint}>{periodLabel}</Text>
          <View style={s.periodRow}>
            {(['today', 'week', 'month'] as Period[]).map((p) => (
              <TouchableOpacity
                key={p}
                style={[s.periodBtn, period === p && s.periodBtnActive]}
                onPress={() => setPeriod(p)}
              >
                <Text style={[s.periodTxt, period === p && s.periodTxtActive]}>
                  {p === 'today' ? 'Today' : p === 'week' ? 'Week' : 'Month'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </LinearGradient>

        {/* ── Stats grid ─────────────────────────────────────────────────── */}
        <SectionLabel text="Your stats" />
        <DarkCard>
          <View style={s.statsGrid}>
            <StatCell icon="briefcase-outline" iconColor={D.blue} value={String(Number(summary.total_trips ?? 0))} label="Trips" hint={periodLabel} />
            <View style={s.statDivider} />
            <StatCell icon="time-outline" iconColor="#818CF8" value={formatTripHours(Number(summary.total_time_mins ?? 0))} label="Hours" hint="On trip" />
            <View style={s.statDivider} />
            <StatCell icon="star" iconColor="#FBBF24" value={typeof user?.rating === 'number' && user.rating > 0 ? user.rating.toFixed(1) : '—'} label="Rating" hint="Lifetime" />
            <View style={s.statDivider} />
            <StatCell icon="speedometer-outline" iconColor={D.neon} value={`${Number(summary.total_distance_km ?? 0).toFixed(0)}`} label="km" hint="Distance" />
          </View>
        </DarkCard>

        {/* ── Secondary stat row ─────────────────────────────────────────── */}
        <View style={s.secondaryRow}>
          <DarkCard style={s.secondaryCellCard}>
            <Ionicons name="stats-chart-outline" size={20} color={D.neon} />
            <Text style={s.secondaryValue}>{fmtMoney(Number(averages.per_trip ?? 0))}</Text>
            <Text style={s.secondaryLabel}>Per trip</Text>
          </DarkCard>
          <DarkCard style={s.secondaryCellCard}>
            <Ionicons name="trending-up-outline" size={20} color={D.amber} />
            <Text style={s.secondaryValue}>{fmtMoney(Number(projections.daily ?? 0))}</Text>
            <Text style={s.secondaryLabel}>Proj. today</Text>
          </DarkCard>
          <DarkCard style={s.secondaryCellCard}>
            <Ionicons name="checkmark-circle-outline" size={20} color="#A78BFA" />
            <Text style={s.secondaryValue}>0%</Text>
            <Text style={s.secondaryLabel}>Commission</Text>
          </DarkCard>
        </View>

        {/* ── Zero commission banner ─────────────────────────────────────── */}
        <View style={s.zeroBanner}>
          <Ionicons name="shield-checkmark" size={18} color={D.neon} />
          <Text style={s.zeroBannerTxt}>
            {dashboard?.commission_message ?? 'You keep 100% of every fare. No NEXRYDE cut.'}
          </Text>
        </View>

        {/* ── Live area pricing / surge ───────────────────────────────────── */}
        {surge && surgeExtras ? (
          <>
            <SectionLabel text="Live area pricing" />
            <DarkCard style={s.surgeOuter}>
              <View style={[s.surgeAccent, { backgroundColor: surgeExtras.accent }]} />
              <View style={s.surgeBody}>
                <View style={s.surgeTopRow}>
                  <View style={[s.surgeIconWrap, { backgroundColor: `${surgeExtras.accent}22` }]}>
                    <Ionicons
                      name={surge.is_surge ? 'flash' : 'checkmark-circle-outline'}
                      size={22}
                      color={surgeExtras.accent}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.surgeTitle, { color: surgeExtras.accent }]}>
                      {surge.is_surge ? surge.tier_label ?? 'Surge active' : 'Standard pricing'}
                    </Text>
                    <Text style={s.surgeReasons} numberOfLines={2}>
                      {Array.isArray(surge.reasons) && surge.reasons.length > 0
                        ? surge.reasons.join(' · ')
                        : 'Base rates apply right now.'}
                    </Text>
                    {surgeExtras.windowEnds ? (
                      <Text style={s.surgeWindow}>Peak ends ~ {surgeExtras.windowEnds}</Text>
                    ) : null}
                  </View>
                  <View style={s.surgeMultCol}>
                    <Text style={[s.surgeMultVal, { color: surgeExtras.accent }]}>
                      {Number(surge.multiplier ?? 1).toFixed(2)}×
                    </Text>
                    <Text style={s.surgeMultCap}>multiplier</Text>
                    {surge.is_surge ? (
                      <View style={[s.surgePctBadge, { backgroundColor: surgeExtras.accent }]}>
                        <Text style={s.surgePctTxt}>+{surge.pct_extra ?? 0}%</Text>
                      </View>
                    ) : null}
                  </View>
                </View>

                <View style={s.surgeChipRow}>
                  <View style={s.surgeChip}>
                    <Ionicons name="location-outline" size={12} color={D.sub} />
                    <Text style={s.surgeChipTxt}>{surgeExtras.cityLabel}</Text>
                  </View>
                  <View style={s.surgeChip}>
                    <Ionicons name="car-sport-outline" size={12} color={D.sub} />
                    <Text style={s.surgeChipTxt}>{surgeExtras.serviceLabel}</Text>
                  </View>
                  <View style={[s.surgeChip, surgeExtras.gps ? s.surgeChipLive : s.surgeChipEst]}>
                    <Ionicons name={surgeExtras.gps ? 'pulse' : 'warning-outline'} size={12} color={surgeExtras.gps ? D.neon : D.amber} />
                    <Text style={[s.surgeChipTxt, { color: surgeExtras.gps ? D.neon : D.amber }]}>
                      {surgeExtras.gps ? 'Live demand' : 'GPS off'}
                    </Text>
                  </View>
                </View>

                {surgeExtras.gps ? (
                  <View style={s.demandBlock}>
                    <View style={s.demandHeaderRow}>
                      <Text style={s.demandLbl}>Area demand signal</Text>
                      <Text style={s.demandBand}>{surgeExtras.demandBandLabel || 'Balanced'}</Text>
                    </View>
                    <View style={s.demandTrack}>
                      <View style={[s.demandFill, { width: `${surgeExtras.demandPct}%`, backgroundColor: surgeExtras.accent }]} />
                    </View>
                    <Text style={s.demandFoot}>{surgeExtras.demandPct}% estimated pressure near you</Text>
                  </View>
                ) : null}

                <Text style={s.surgeFootnote}>
                  {typeof surge.driver_message === 'string' && surge.driver_message.trim()
                    ? surge.driver_message
                    : surge.is_surge
                      ? `Typical bump: about +${surge.pct_extra ?? 0}% vs base fare.`
                      : 'Stay online — pricing rises during rush hours, weekends and high demand.'}
                </Text>
              </View>
            </DarkCard>
          </>
        ) : null}

        {/* ── 7-day chart ────────────────────────────────────────────────── */}
        <SectionLabel text="Earnings chart" />
        <DarkCard>
          <View style={s.chartHeader}>
            <Text style={s.chartTitle}>{periodLabel} breakdown</Text>
            <Text style={s.chartSub}>Daily earnings, last 7 active days</Text>
          </View>
          {chartData.length > 0 ? (
            <View style={s.chartWrap}>
              {chartData.map((item) => (
                <View key={item.date} style={s.chartCol}>
                  <Text style={s.chartVal}>{fmtMoney(item.earnings)}</Text>
                  <View style={s.chartTrack}>
                    <LinearGradient
                      colors={[D.neon, '#14532D']}
                      start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
                      style={[s.chartBar, { height: `${item.heightPct}%` as any }]}
                    />
                  </View>
                  <Text style={s.chartTrips}>{item.trips}T</Text>
                  <Text style={s.chartLbl}>{item.label}</Text>
                </View>
              ))}
            </View>
          ) : (
            <View style={s.chartEmpty}>
              <Ionicons name="bar-chart-outline" size={36} color={D.muted} />
              <Text style={s.chartEmptyTxt}>Complete more trips to unlock your earnings chart</Text>
            </View>
          )}
        </DarkCard>

        {/* ── Earnings outlook ───────────────────────────────────────────── */}
        <SectionLabel text="Earnings outlook" />
        <View style={s.outlookRow}>
          {([
            { label: 'Daily', val: projections.daily },
            { label: 'Weekly', val: projections.weekly },
            { label: 'Monthly', val: projections.monthly },
          ] as { label: string; val: number }[]).map((item) => (
            <DarkCard key={item.label} style={s.outlookCell}>
              <Text style={s.outlookVal}>{fmtMoney(Number(item.val ?? 0))}</Text>
              <Text style={s.outlookLbl}>{item.label}</Text>
            </DarkCard>
          ))}
        </View>

        {/* ── Salary mode ────────────────────────────────────────────────── */}
        {salaryMode?.enabled ? (
          <>
            <SectionLabel text="Salary mode" />
            <DarkCard style={[salaryMode.status === 'behind' ? s.salaryBehind : s.salaryOnTrack]}>
              <View style={s.salaryTop}>
                <Ionicons
                  name={salaryMode.status === 'behind' ? 'trending-up-outline' : 'wallet-outline'}
                  size={22}
                  color={salaryMode.status === 'behind' ? D.amber : D.neon}
                />
                <View style={{ flex: 1 }}>
                  <Text style={s.salaryTitle}>Driver Salary Mode</Text>
                  <Text style={s.salarySub}>Monthly income planning with dispatch pacing</Text>
                </View>
              </View>
              <View style={s.salaryRow}>
                {[
                  { lbl: 'Target', val: salaryMode.monthly_income_target },
                  { lbl: 'Achieved', val: salaryMode.achieved_this_month },
                  { lbl: 'Daily pace', val: salaryMode.required_daily_average },
                ].map((item) => (
                  <View key={item.lbl} style={s.salaryItem}>
                    <Text style={s.salaryItemLbl}>{item.lbl}</Text>
                    <Text style={s.salaryItemVal}>{fmtMoney(Number(item.val ?? 0))}</Text>
                  </View>
                ))}
              </View>
              <Text style={s.salaryFootnote}>
                {salaryMode.status === 'behind'
                  ? `Behind pace by ${fmtMoney(Number(salaryMode.pace_gap ?? 0))}. Dispatch boost: ${Number(salaryMode.dispatch_priority_boost ?? 1).toFixed(2)}×.`
                  : `On track for ~${fmtMoney(Number(salaryMode.projected_month_end ?? 0))} this month.`}
              </Text>
            </DarkCard>
          </>
        ) : null}

        {/* ── Bank & payout route ─────────────────────────────────────────── */}
        <SectionLabel text={walletEnabled ? 'Payout route' : 'Getting paid'} />
        <View style={s.payoutRow}>
          <TouchableOpacity style={s.payoutCard} onPress={() => router.push('/driver/bank')} activeOpacity={0.85}>
            <View style={s.payoutIcon}>
              <Ionicons name="card-outline" size={22} color={D.blue} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.payoutTitle}>{walletEnabled ? 'Bank & payout route' : 'Your bank account'}</Text>
              <Text style={s.payoutSub}>
                {bankReady
                  ? 'Riders can transfer fares straight to this account'
                  : 'Add your account so riders can transfer fares to you'}
              </Text>
            </View>
            <View style={[s.payoutBadge, bankReady ? s.payoutBadgeReady : s.payoutBadgePending]}>
              <Text style={[s.payoutBadgeTxt, bankReady ? s.payoutBadgeTxtReady : s.payoutBadgeTxtPending]}>
                {bankReady ? 'Ready' : 'Setup'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={D.muted} />
          </TouchableOpacity>

          {walletEnabled ? (
          <TouchableOpacity style={s.payoutCard} onPress={() => router.push('/driver/withdrawal')} activeOpacity={0.85}>
            <View style={[s.payoutIcon, { backgroundColor: `${D.neon}15` }]}>
              <Ionicons name="arrow-up-circle-outline" size={22} color={D.neon} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.payoutTitle}>Withdraw earnings</Text>
              <Text style={s.payoutSub}>
                {walletBal !== null
                  ? `${fmtMoney(walletBal)} available to withdraw`
                  : 'View balance and withdraw to your bank'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={D.muted} />
          </TouchableOpacity>
          ) : null}
        </View>

        </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function createEarnStyles(D: EarnPalette) {
  return StyleSheet.create({
  root: { flex: 1, backgroundColor: D.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: D.border,
  },
  headerTitle: { fontSize: FONT_SIZE.xl, fontWeight: '900', color: D.text, letterSpacing: -0.3 },
  headerSub: { fontSize: FONT_SIZE.xs + 1, fontWeight: '600', color: D.neon, marginTop: 2 },
  withdrawBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: `${D.neon}15`, borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: `${D.neon}30`,
  },
  withdrawBtnTxt: { fontSize: FONT_SIZE.sm, fontWeight: '800', color: D.neon },
  scroll: { paddingTop: SPACING.md, gap: SPACING.stack },

  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: BORDER_RADIUS.lg,
    padding: 12, borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)',
  },
  errorTxt: { flex: 1, fontSize: FONT_SIZE.sm, fontWeight: '700', color: '#F87171' },

  // Wallet hero
  walletHero: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: BORDER_RADIUS.xl, padding: SPACING.lg,
    borderWidth: 1, borderColor: `${D.neon}20`,
    ...Platform.select({ ios: { shadowColor: D.neon, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12 }, android: { elevation: 4 } }),
  },
  walletHeroLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  walletIconWrap: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: `${D.neon}18`,
    alignItems: 'center', justifyContent: 'center',
  },
  walletLabel: { fontSize: 10, fontWeight: '800', color: D.neon, letterSpacing: 1.2 },
  walletAmount: { fontSize: 28, fontWeight: '900', color: '#FFF', marginTop: 3 },
  walletAction: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: `${D.neon}20`, borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: `${D.neon}35`,
  },
  walletActionTxt: { fontSize: FONT_SIZE.sm, fontWeight: '800', color: D.neon },

  // Trial banner
  trialBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: `${D.amber}12`, borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md, borderWidth: 1, borderColor: `${D.amber}30`, gap: 10,
  },
  trialLeft: { flex: 1, gap: 4 },
  trialTitle: { fontSize: FONT_SIZE.sm + 1, fontWeight: '800', color: D.amber },
  trialSub: { fontSize: FONT_SIZE.xs, fontWeight: '600', color: `${D.amber}CC` },
  trialBarTrack: {
    height: 4, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 2, marginTop: 6,
  },
  trialBarFill: {
    height: 4, backgroundColor: D.amber, borderRadius: 2,
  },

  // Earnings hero
  earningsHero: {
    borderRadius: BORDER_RADIUS.xl, padding: SPACING.lg,
    borderWidth: 1, borderColor: D.border, alignItems: 'flex-start',
  },
  earningsLabel: { fontSize: 10, fontWeight: '800', color: D.sub, letterSpacing: 1.2 },
  earningsAmount: {
    fontSize: 44, fontWeight: '900', color: D.neon, marginVertical: SPACING.sm,
    ...Platform.select({ ios: { textShadowColor: `${D.neon}40`, textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 8 } }),
  },
  earningsPeriodHint: { fontSize: FONT_SIZE.sm, fontWeight: '600', color: D.sub, marginBottom: SPACING.sm },
  periodRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  periodBtn: {
    paddingHorizontal: SPACING.md, paddingVertical: 8, borderRadius: BORDER_RADIUS.full,
    backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: D.border,
  },
  periodBtnActive: { backgroundColor: D.neon, borderColor: D.neon },
  periodTxt: { fontSize: FONT_SIZE.sm, fontWeight: '700', color: D.sub },
  periodTxtActive: { color: '#022C16', fontWeight: '900' },

  sectionLabel: {
    ...TYPOGRAPHY.label, color: D.muted, textTransform: 'uppercase',
    marginTop: SPACING.sm, marginBottom: 2, marginLeft: 2,
  },

  darkCard: {
    backgroundColor: D.card, borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md, borderWidth: 1, borderColor: D.border,
    ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 6 }, android: { elevation: 3 } }),
  },

  // Stats grid
  statsGrid: { flexDirection: 'row', alignItems: 'stretch' },
  statCell: { flex: 1, alignItems: 'center', paddingVertical: 10, gap: 4 },
  statDivider: { width: 1, backgroundColor: D.border, marginVertical: 8 },
  statIconWrap: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontSize: FONT_SIZE.xl, fontWeight: '900', color: D.text },
  statLabel: { fontSize: FONT_SIZE.xs + 1, fontWeight: '800', color: D.sub },
  statHint:  { fontSize: 10, fontWeight: '600', color: D.muted },

  secondaryRow: { flexDirection: 'row', gap: 8 },
  secondaryCellCard: { flex: 1, alignItems: 'center', gap: 5, paddingVertical: SPACING.md },
  secondaryValue: { fontSize: FONT_SIZE.md + 1, fontWeight: '900', color: D.text },
  secondaryLabel: { fontSize: FONT_SIZE.xs, fontWeight: '700', color: D.sub },

  zeroBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: `${D.neon}10`, borderRadius: BORDER_RADIUS.lg,
    padding: 11, borderWidth: 1, borderColor: `${D.neon}20`,
  },
  zeroBannerTxt: { flex: 1, fontSize: FONT_SIZE.sm, fontWeight: '700', color: D.neon },

  // Surge card
  surgeOuter: { flexDirection: 'row', overflow: 'hidden', padding: 0 },
  surgeAccent: { width: 4, borderTopLeftRadius: BORDER_RADIUS.xl, borderBottomLeftRadius: BORDER_RADIUS.xl },
  surgeBody: { flex: 1, padding: SPACING.md, gap: 10 },
  surgeTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  surgeIconWrap: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  surgeTitle: { fontSize: FONT_SIZE.md, fontWeight: '800' },
  surgeReasons: { fontSize: FONT_SIZE.xs + 1, color: D.sub, fontWeight: '600', marginTop: 2 },
  surgeWindow: { fontSize: 11, fontWeight: '600', color: D.muted, marginTop: 3 },
  surgeMultCol: { alignItems: 'flex-end', gap: 3 },
  surgeMultVal: { fontSize: 22, fontWeight: '900' },
  surgeMultCap: { fontSize: 10, color: D.muted, fontWeight: '600' },
  surgePctBadge: { borderRadius: BORDER_RADIUS.full, paddingHorizontal: 7, paddingVertical: 3 },
  surgePctTxt: { fontSize: 11, fontWeight: '900', color: '#FFF' },
  surgeChipRow: { flexDirection: 'row', gap: 7, flexWrap: 'wrap' },
  surgeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, borderColor: D.border,
  },
  surgeChipLive: { backgroundColor: `${D.neon}10`, borderColor: `${D.neon}30` },
  surgeChipEst:  { backgroundColor: `${D.amber}10`, borderColor: `${D.amber}30` },
  surgeChipTxt: { fontSize: 11, fontWeight: '700', color: D.sub },
  demandBlock: { gap: 5 },
  demandHeaderRow: { flexDirection: 'row', justifyContent: 'space-between' },
  demandLbl:  { fontSize: FONT_SIZE.xs + 1, fontWeight: '700', color: D.sub },
  demandBand: { fontSize: FONT_SIZE.xs + 1, fontWeight: '800', color: D.textDim },
  demandTrack: { height: 6, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 3 },
  demandFill:  { height: 6, borderRadius: 3 },
  demandFoot: { fontSize: 11, color: D.muted, fontWeight: '600' },
  surgeFootnote: { fontSize: FONT_SIZE.xs + 1, color: D.muted, fontWeight: '600', lineHeight: 17 },

  // Chart
  chartHeader: { marginBottom: SPACING.md },
  chartTitle: { fontSize: FONT_SIZE.md, fontWeight: '800', color: D.text },
  chartSub:   { fontSize: FONT_SIZE.xs + 1, color: D.sub, fontWeight: '600', marginTop: 2 },
  chartWrap:  { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 120 },
  chartCol:   { flex: 1, alignItems: 'center', gap: 3 },
  chartVal:   { fontSize: 9, fontWeight: '700', color: D.sub, textAlign: 'center' },
  chartTrack: { flex: 1, width: '60%', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden', justifyContent: 'flex-end' },
  chartBar:   { width: '100%', borderRadius: 3 },
  chartTrips: { fontSize: 9, fontWeight: '700', color: D.muted },
  chartLbl:   { fontSize: 10, fontWeight: '700', color: D.sub },
  chartEmpty: { alignItems: 'center', gap: 10, paddingVertical: SPACING.xl },
  chartEmptyTxt: { fontSize: FONT_SIZE.sm, fontWeight: '600', color: D.muted, textAlign: 'center' },

  // Outlook
  outlookRow: { flexDirection: 'row', gap: 8 },
  outlookCell: { flex: 1, alignItems: 'center', gap: 5, paddingVertical: SPACING.md },
  outlookVal: { fontSize: FONT_SIZE.md + 1, fontWeight: '900', color: D.text },
  outlookLbl: { fontSize: FONT_SIZE.xs, fontWeight: '700', color: D.sub },

  // Salary mode
  salaryBehind:  { borderColor: `${D.amber}30` },
  salaryOnTrack: { borderColor: `${D.neon}25` },
  salaryTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: SPACING.sm },
  salaryTitle: { fontSize: FONT_SIZE.md, fontWeight: '800', color: D.text },
  salarySub:   { fontSize: FONT_SIZE.xs + 1, color: D.sub, fontWeight: '600', marginTop: 2 },
  salaryRow:   { flexDirection: 'row', gap: 10, marginBottom: SPACING.sm },
  salaryItem:  { flex: 1, alignItems: 'center' },
  salaryItemLbl: { fontSize: FONT_SIZE.xs, color: D.sub, fontWeight: '700' },
  salaryItemVal: { fontSize: FONT_SIZE.md, fontWeight: '900', color: D.text, marginTop: 2 },
  salaryFootnote: { fontSize: FONT_SIZE.xs + 1, color: D.muted, fontWeight: '600', lineHeight: 17 },

  // Payout route
  payoutRow: { gap: 8 },
  payoutCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: D.card, borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md, borderWidth: 1, borderColor: D.border,
  },
  payoutIcon: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: `${D.blue}18`, alignItems: 'center', justifyContent: 'center',
  },
  payoutTitle: { fontSize: FONT_SIZE.sm + 1, fontWeight: '800', color: D.text },
  payoutSub:   { fontSize: FONT_SIZE.xs + 1, fontWeight: '600', color: D.sub, marginTop: 2 },
  payoutBadge: { borderRadius: BORDER_RADIUS.full, paddingHorizontal: 10, paddingVertical: 4 },
  payoutBadgeReady:   { backgroundColor: `${D.neon}18` },
  payoutBadgePending: { backgroundColor: 'rgba(245,158,11,0.12)' },
  payoutBadgeTxt:        { fontSize: FONT_SIZE.xs, fontWeight: '800' },
  payoutBadgeTxtReady:   { color: D.neon },
  payoutBadgeTxtPending: { color: D.amber },
});
}

/**
 * NEXRYDE Admin Dashboard
 * Control-center screen for monitoring the live platform.
 * Accessible only to users with role === 'admin'.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BACKEND_URL } from '@/src/services/api';
import { useAppStore } from '@/src/store/appStore';

const ADMIN_TOKEN_KEY = '@nexryde_admin_token';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LiveStats {
  ts: string;
  drivers: {
    online: number;
    total: number;
    offline: number;
    pending_verification: number;
    utilisation_pct: number;
  };
  riders: { total: number; active_today: number };
  trips: {
    active_now: number;
    today_total: number;
    today_completed: number;
    today_cancelled: number;
    today_failed: number;
    today_revenue_ngn: number;
    today_success_rate: number;
    week_total: number;
    week_completed: number;
    week_revenue_ngn: number;
  };
  subscriptions: {
    active: number;
    total_revenue_ngn: number;
    by_plan: Array<{ plan: string; count: number; revenue: number }>;
  };
  wallets: {
    total_balance_ngn: number;
    wallet_count: number;
    avg_balance_ngn: number;
  };
  support: { open_tickets: number; total_tickets: number; sos_active: number };
  sparkline_7d: Array<{ date: string; total: number; completed: number }>;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PALETTE = {
  bg:         '#06090F',
  card:       '#0E1521',
  border:     '#1A2535',
  accent:     '#00C896',
  accentDim:  '#00C89622',
  blue:       '#3B82F6',
  blueDim:    '#3B82F622',
  amber:      '#F59E0B',
  amberDim:   '#F59E0B22',
  red:        '#EF4444',
  redDim:     '#EF444422',
  purple:     '#A855F7',
  purpleDim:  '#A855F722',
  text:       '#FFFFFF',
  textSub:    '#8B99B5',
  textDim:    '#445166',
};

const { width: W } = Dimensions.get('window');
const CARD_GAP = 12;
const HALF = (W - 32 - CARD_GAP) / 2;
const REFRESH_INTERVAL_MS = 30_000;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number, decimals = 0) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return n.toFixed(decimals);
}

function fmtNGN(n: number) {
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `₦${(n / 1_000).toFixed(1)}k`;
  return `₦${n.toFixed(0)}`;
}

function timeAgo(iso: string) {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 5)   return 'just now';
  if (secs < 60)  return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  dimColor: string;
  half?: boolean;
  alert?: boolean;
}

const StatCard: React.FC<StatCardProps> = ({
  label, value, sub, icon, color, dimColor, half, alert,
}) => (
  <View style={[s.card, half && { width: HALF }]}>
    <View style={[s.iconCircle, { backgroundColor: dimColor }]}>
      <Ionicons name={icon} size={18} color={color} />
      {alert && <View style={s.alertDot} />}
    </View>
    <Text style={[s.cardValue, { color }]}>{value}</Text>
    <Text style={s.cardLabel}>{label}</Text>
    {sub ? <Text style={s.cardSub}>{sub}</Text> : null}
  </View>
);

interface SectionHeaderProps { title: string; icon: keyof typeof Ionicons.glyphMap }
const SectionHeader: React.FC<SectionHeaderProps> = ({ title, icon }) => (
  <View style={s.sectionHeader}>
    <Ionicons name={icon} size={14} color={PALETTE.textSub} />
    <Text style={s.sectionTitle}>{title}</Text>
  </View>
);

interface SparkBarProps { data: LiveStats['sparkline_7d'] }
const SparkBar: React.FC<SparkBarProps> = ({ data }) => {
  const maxTotal = Math.max(...data.map(d => d.total), 1);
  return (
    <View style={s.sparkWrap}>
      {data.map((d, i) => {
        const totalH = Math.round((d.total / maxTotal) * 52);
        const compH  = Math.round((d.completed / maxTotal) * 52);
        const label  = d.date.slice(5); // MM-DD
        return (
          <View key={i} style={s.sparkCol}>
            <View style={[s.sparkBar, { height: 52 }]}>
              <View style={[s.sparkFill, { height: totalH, backgroundColor: PALETTE.border }]} />
              <View style={[s.sparkFillOver, { height: compH, backgroundColor: PALETTE.accent }]} />
            </View>
            <Text style={s.sparkLabel}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
};

interface ProgressBarProps { value: number; color: string; label: string }
const ProgressBar: React.FC<ProgressBarProps> = ({ value, color, label }) => (
  <View style={s.progressRow}>
    <Text style={s.progressLabel}>{label}</Text>
    <View style={s.progressTrack}>
      <View style={[s.progressFill, { width: `${Math.min(value, 100)}%`, backgroundColor: color }]} />
    </View>
    <Text style={[s.progressPct, { color }]}>{value.toFixed(1)}%</Text>
  </View>
);

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const [stats, setStats]       = useState<LiveStats | null>(null);
  const [loading, setLoading]   = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Restore persisted admin token on mount
  useEffect(() => {
    AsyncStorage.getItem(ADMIN_TOKEN_KEY).then(t => {
      if (t) setAdminToken(t);
    });
  }, []);

  const doAdminLogin = useCallback(async () => {
    setLoginLoading(true);
    setLoginError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail.trim(), password: loginPassword }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.detail || `HTTP ${res.status}`);
      const tok = body.token || body.access_token;
      if (!tok) throw new Error('No token in response');
      await AsyncStorage.setItem(ADMIN_TOKEN_KEY, tok);
      setAdminToken(tok);
    } catch (e: any) {
      setLoginError(e?.message || 'Login failed');
    } finally {
      setLoginLoading(false);
    }
  }, [loginEmail, loginPassword]);

  const doLogout = useCallback(async () => {
    await AsyncStorage.removeItem(ADMIN_TOKEN_KEY);
    setAdminToken(null);
    setStats(null);
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const fetchStats = useCallback(async (silent = false) => {
    if (!adminToken) return;
    if (!silent) setLoading(s => (stats ? false : s));
    try {
      const res = await fetch(`${BACKEND_URL}/api/admin/live-stats`, {
        headers: { 'x-admin-token': adminToken },
      });
      if (res.status === 401 || res.status === 403) {
        await doLogout();
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: LiveStats = await res.json();
      setStats(data);
      setLastFetch(new Date().toISOString());
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Failed to fetch stats');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [adminToken, stats, doLogout]);

  useEffect(() => {
    if (!adminToken) return;
    fetchStats();
    timerRef.current = setInterval(() => fetchStats(true), REFRESH_INTERVAL_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [adminToken]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchStats(true);
  }, [fetchStats]);

  // ── Login screen ─────────────────────────────────────────────────────────────
  if (!adminToken) {
    return (
      <SafeAreaView style={s.root}>
        <StatusBar barStyle="light-content" backgroundColor={PALETTE.bg} />
        <KeyboardAvoidingView
          style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 32 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={s.loginLogo}>
            <Ionicons name="shield-checkmark" size={40} color={PALETTE.accent} />
          </View>
          <Text style={s.loginTitle}>NEXRYDE Admin</Text>
          <Text style={s.loginSub}>Sign in with your admin credentials</Text>
          {loginError && (
            <View style={s.errorBanner}>
              <Ionicons name="warning" size={14} color={PALETTE.amber} />
              <Text style={s.errorText}>{loginError}</Text>
            </View>
          )}
          <TextInput
            style={s.loginInput}
            placeholder="Admin email"
            placeholderTextColor={PALETTE.textDim}
            value={loginEmail}
            onChangeText={setLoginEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TextInput
            style={s.loginInput}
            placeholder="Password"
            placeholderTextColor={PALETTE.textDim}
            value={loginPassword}
            onChangeText={setLoginPassword}
            secureTextEntry
          />
          <TouchableOpacity
            style={[s.loginBtn, loginLoading && { opacity: 0.6 }]}
            onPress={doAdminLogin}
            disabled={loginLoading}
            activeOpacity={0.8}
          >
            {loginLoading
              ? <ActivityIndicator size="small" color="#000" />
              : <Text style={s.loginBtnText}>Sign In</Text>
            }
          </TouchableOpacity>
          <TouchableOpacity style={{ marginTop: 16, alignItems: 'center' }} onPress={() => router.back()}>
            <Text style={{ color: PALETTE.textSub, fontSize: 12 }}>← Back</Text>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={PALETTE.bg} />

      {/* Header */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <View style={s.logoMark}>
            <Ionicons name="shield-checkmark" size={16} color={PALETTE.accent} />
          </View>
          <View>
            <Text style={s.headerTitle}>NEXRYDE Admin</Text>
            <Text style={s.headerSub}>
              {lastFetch ? `Updated ${timeAgo(lastFetch)}` : 'Loading…'}
            </Text>
          </View>
        </View>
        <View style={s.headerActions}>
          {loading && !stats && (
            <ActivityIndicator size="small" color={PALETTE.accent} style={{ marginRight: 8 }} />
          )}
          <TouchableOpacity style={s.iconBtn} onPress={() => fetchStats(true)}>
            <Ionicons name="refresh" size={18} color={PALETTE.textSub} />
          </TouchableOpacity>
          <TouchableOpacity style={[s.iconBtn, { marginLeft: 6 }]} onPress={doLogout}>
            <Ionicons name="log-out-outline" size={18} color={PALETTE.textSub} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Error banner */}
      {error && (
        <View style={s.errorBanner}>
          <Ionicons name="warning" size={14} color={PALETTE.amber} />
          <Text style={s.errorText}>{error}</Text>
        </View>
      )}

      {loading && !stats ? (
        <View style={s.loadingWrap}>
          <ActivityIndicator size="large" color={PALETTE.accent} />
          <Text style={s.loadingText}>Fetching live data…</Text>
        </View>
      ) : stats ? (
        <ScrollView
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={PALETTE.accent}
              colors={[PALETTE.accent]}
            />
          }
        >
          {/* ── Live Now ────────────────────────────────────────────── */}
          {stats.trips.active_now > 0 && (
            <View style={s.liveBanner}>
              <View style={s.liveDot} />
              <Text style={s.liveBannerText}>
                {stats.trips.active_now} ride{stats.trips.active_now !== 1 ? 's' : ''} active right now
              </Text>
            </View>
          )}

          {/* ── Drivers ─────────────────────────────────────────────── */}
          <SectionHeader title="DRIVERS" icon="car-sport" />
          <View style={s.row}>
            <StatCard
              label="Online Drivers"
              value={stats.drivers.online}
              sub={`of ${stats.drivers.total} total`}
              icon="radio-button-on"
              color={PALETTE.accent}
              dimColor={PALETTE.accentDim}
              half
            />
            <StatCard
              label="Pending Review"
              value={stats.drivers.pending_verification}
              sub="need verification"
              icon="time"
              color={PALETTE.amber}
              dimColor={PALETTE.amberDim}
              half
              alert={stats.drivers.pending_verification > 0}
            />
          </View>
          <View style={s.card}>
            <ProgressBar
              label="Driver Utilisation"
              value={stats.drivers.utilisation_pct}
              color={PALETTE.accent}
            />
            <ProgressBar
              label="Offline"
              value={100 - stats.drivers.utilisation_pct}
              color={PALETTE.textDim}
            />
          </View>

          {/* ── Riders ──────────────────────────────────────────────── */}
          <SectionHeader title="RIDERS" icon="people" />
          <View style={s.row}>
            <StatCard
              label="Total Riders"
              value={fmt(stats.riders.total)}
              sub="registered accounts"
              icon="person"
              color={PALETTE.blue}
              dimColor={PALETTE.blueDim}
              half
            />
            <StatCard
              label="Active Today"
              value={stats.riders.active_today}
              sub="requested a ride"
              icon="walk"
              color={PALETTE.purple}
              dimColor={PALETTE.purpleDim}
              half
            />
          </View>

          {/* ── Today's Rides ────────────────────────────────────────── */}
          <SectionHeader title="TODAY'S RIDES" icon="calendar" />
          <View style={s.row}>
            <StatCard
              label="Total Rides"
              value={stats.trips.today_total}
              sub="since midnight"
              icon="navigate"
              color={PALETTE.text}
              dimColor={PALETTE.border}
              half
            />
            <StatCard
              label="Active Now"
              value={stats.trips.active_now}
              sub="ongoing trips"
              icon="pulse"
              color={PALETTE.accent}
              dimColor={PALETTE.accentDim}
              half
            />
          </View>
          <View style={s.row}>
            <StatCard
              label="Completed"
              value={stats.trips.today_completed}
              icon="checkmark-circle"
              color={PALETTE.accent}
              dimColor={PALETTE.accentDim}
              half
            />
            <StatCard
              label="Failed / Cancelled"
              value={stats.trips.today_failed + stats.trips.today_cancelled}
              icon="close-circle"
              color={PALETTE.red}
              dimColor={PALETTE.redDim}
              half
            />
          </View>

          {/* ── Success Rate ─────────────────────────────────────────── */}
          <View style={s.card}>
            <View style={s.rateHeader}>
              <Text style={s.rateLabel}>Ride Success Rate</Text>
              <Text style={[
                s.rateValue,
                { color: stats.trips.today_success_rate >= 90 ? PALETTE.accent : stats.trips.today_success_rate >= 70 ? PALETTE.amber : PALETTE.red },
              ]}>
                {stats.trips.today_success_rate}%
              </Text>
            </View>
            <View style={s.rateTrack}>
              <View style={[
                s.rateFill,
                {
                  width: `${stats.trips.today_success_rate}%`,
                  backgroundColor: stats.trips.today_success_rate >= 90 ? PALETTE.accent : stats.trips.today_success_rate >= 70 ? PALETTE.amber : PALETTE.red,
                },
              ]} />
            </View>
            <View style={s.rateBreakdown}>
              <Text style={s.rateBreakText}>
                <Text style={{ color: PALETTE.accent }}>✓ {stats.trips.today_completed} done</Text>
                {'  '}
                <Text style={{ color: PALETTE.red }}>✗ {stats.trips.today_failed} failed</Text>
                {'  '}
                <Text style={{ color: PALETTE.textSub }}>⊘ {stats.trips.today_cancelled} cancelled</Text>
              </Text>
            </View>
          </View>

          {/* ── Revenue ──────────────────────────────────────────────── */}
          <SectionHeader title="REVENUE" icon="trending-up" />
          <View style={s.row}>
            <StatCard
              label="Today's Revenue"
              value={fmtNGN(stats.trips.today_revenue_ngn)}
              sub="from completed rides"
              icon="cash"
              color={PALETTE.accent}
              dimColor={PALETTE.accentDim}
              half
            />
            <StatCard
              label="This Week"
              value={fmtNGN(stats.trips.week_revenue_ngn)}
              sub={`${stats.trips.week_completed} rides`}
              icon="stats-chart"
              color={PALETTE.blue}
              dimColor={PALETTE.blueDim}
              half
            />
          </View>

          {/* ── 7-Day Sparkline ──────────────────────────────────────── */}
          {stats.sparkline_7d.length > 0 && (
            <View style={s.card}>
              <Text style={s.sparkTitle}>7-Day Ride Volume</Text>
              <SparkBar data={stats.sparkline_7d} />
              <View style={s.sparkLegend}>
                <View style={s.legendItem}>
                  <View style={[s.legendDot, { backgroundColor: PALETTE.accent }]} />
                  <Text style={s.legendText}>Completed</Text>
                </View>
                <View style={s.legendItem}>
                  <View style={[s.legendDot, { backgroundColor: PALETTE.border }]} />
                  <Text style={s.legendText}>Total</Text>
                </View>
              </View>
            </View>
          )}

          {/* ── Subscriptions ────────────────────────────────────────── */}
          <SectionHeader title="SUBSCRIPTIONS" icon="card" />
          <View style={s.row}>
            <StatCard
              label="Active Subs"
              value={stats.subscriptions.active}
              sub="drivers subscribed"
              icon="ribbon"
              color={PALETTE.purple}
              dimColor={PALETTE.purpleDim}
              half
            />
            <StatCard
              label="Sub Revenue"
              value={fmtNGN(stats.subscriptions.total_revenue_ngn)}
              sub="total collected"
              icon="wallet"
              color={PALETTE.accent}
              dimColor={PALETTE.accentDim}
              half
            />
          </View>
          {stats.subscriptions.by_plan.length > 0 && (
            <View style={s.card}>
              {stats.subscriptions.by_plan.map((p, i) => (
                <View key={i} style={s.planRow}>
                  <View style={s.planDot} />
                  <Text style={s.planName}>{p.plan || 'Standard'}</Text>
                  <Text style={s.planCount}>{p.count} drivers</Text>
                  <Text style={[s.planRevenue, { color: PALETTE.accent }]}>{fmtNGN(p.revenue || 0)}</Text>
                </View>
              ))}
            </View>
          )}

          {/* ── Wallet Balances ──────────────────────────────────────── */}
          <SectionHeader title="WALLET BALANCES" icon="wallet" />
          <View style={s.row}>
            <StatCard
              label="Total Held"
              value={fmtNGN(stats.wallets.total_balance_ngn)}
              sub={`across ${stats.wallets.wallet_count} wallets`}
              icon="layers"
              color={PALETTE.amber}
              dimColor={PALETTE.amberDim}
              half
            />
            <StatCard
              label="Avg Balance"
              value={fmtNGN(stats.wallets.avg_balance_ngn)}
              sub="per wallet"
              icon="bar-chart"
              color={PALETTE.blue}
              dimColor={PALETTE.blueDim}
              half
            />
          </View>

          {/* ── Support Tickets ──────────────────────────────────────── */}
          <SectionHeader title="SUPPORT" icon="headset" />
          <View style={s.row}>
            <StatCard
              label="Open Tickets"
              value={stats.support.open_tickets}
              sub="need attention"
              icon="chatbubble-ellipses"
              color={stats.support.open_tickets > 10 ? PALETTE.red : PALETTE.amber}
              dimColor={stats.support.open_tickets > 10 ? PALETTE.redDim : PALETTE.amberDim}
              half
              alert={stats.support.open_tickets > 0}
            />
            <StatCard
              label="SOS Active"
              value={stats.support.sos_active}
              sub="safety alerts"
              icon="alert-circle"
              color={stats.support.sos_active > 0 ? PALETTE.red : PALETTE.accent}
              dimColor={stats.support.sos_active > 0 ? PALETTE.redDim : PALETTE.accentDim}
              half
              alert={stats.support.sos_active > 0}
            />
          </View>
          <View style={s.card}>
            <View style={s.totalTicketsRow}>
              <Text style={s.totalTicketsLabel}>Total Tickets (all time)</Text>
              <Text style={s.totalTicketsValue}>{stats.support.total_tickets}</Text>
            </View>
          </View>

          {/* ── Quick Actions ────────────────────────────────────────── */}
          <SectionHeader title="QUICK ACTIONS" icon="flash" />
          <View style={s.actionsGrid}>
            {[
              { label: 'Verify Drivers',     icon: 'shield-checkmark' as const, badge: stats.drivers.pending_verification },
              { label: 'View Trips',         icon: 'navigate'          as const },
              { label: 'Manage Riders',      icon: 'people'            as const },
              { label: 'SOS Alerts',         icon: 'alert-circle'      as const, badge: stats.support.sos_active, urgent: stats.support.sos_active > 0 },
              { label: 'Pricing',            icon: 'pricetag'          as const },
              { label: 'Promo Codes',        icon: 'gift'              as const },
            ].map((a, i) => (
              <TouchableOpacity key={i} style={s.actionBtn} activeOpacity={0.75}>
                <View style={[s.actionIconWrap, a.urgent && { backgroundColor: PALETTE.redDim }]}>
                  <Ionicons name={a.icon} size={20} color={a.urgent ? PALETTE.red : PALETTE.accent} />
                  {(a.badge !== undefined && a.badge > 0) && (
                    <View style={[s.badgeCircle, a.urgent && { backgroundColor: PALETTE.red }]}>
                      <Text style={s.badgeText}>{a.badge > 99 ? '99+' : a.badge}</Text>
                    </View>
                  )}
                </View>
                <Text style={s.actionLabel}>{a.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: PALETTE.bg },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: PALETTE.border,
  },
  headerLeft:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  logoMark: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: PALETTE.accentDim,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { color: PALETTE.text, fontSize: 15, fontWeight: '700' },
  headerSub:   { color: PALETTE.textSub, fontSize: 11, marginTop: 1 },
  iconBtn: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: PALETTE.card,
    alignItems: 'center', justifyContent: 'center',
  },

  // Error
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#1C1200',
    paddingHorizontal: 16, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: '#3D2800',
  },
  errorText: { color: PALETTE.amber, fontSize: 12, flex: 1 },

  // Loading
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: PALETTE.textSub, fontSize: 13 },

  // Live banner
  liveBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#001F15',
    marginHorizontal: 16, marginTop: 12,
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 10, borderWidth: 1, borderColor: '#003D28',
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: PALETTE.accent },
  liveBannerText: { color: PALETTE.accent, fontSize: 12, fontWeight: '600' },

  // Scroll
  scroll: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 20 },

  // Section header
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 20, marginBottom: 8,
  },
  sectionTitle: { color: PALETTE.textSub, fontSize: 11, fontWeight: '700', letterSpacing: 1 },

  // Card
  card: {
    backgroundColor: PALETTE.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: PALETTE.border,
    marginBottom: CARD_GAP,
  },
  row: {
    flexDirection: 'row',
    gap: CARD_GAP,
    marginBottom: CARD_GAP,
  },
  iconCircle: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  alertDot: { position: 'absolute', top: 2, right: 2, width: 7, height: 7, borderRadius: 4, backgroundColor: PALETTE.red, borderWidth: 1.5, borderColor: PALETTE.card },
  cardValue: { fontSize: 22, fontWeight: '800', marginBottom: 2 },
  cardLabel: { color: PALETTE.textSub, fontSize: 11, fontWeight: '600' },
  cardSub:   { color: PALETTE.textDim, fontSize: 10, marginTop: 3 },

  // Progress bar
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  progressLabel: { color: PALETTE.textSub, fontSize: 11, width: 120 },
  progressTrack: { flex: 1, height: 5, backgroundColor: PALETTE.border, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  progressPct: { fontSize: 11, fontWeight: '700', width: 38, textAlign: 'right' },

  // Rate card
  rateHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  rateLabel:  { color: PALETTE.textSub, fontSize: 12, fontWeight: '600' },
  rateValue:  { fontSize: 22, fontWeight: '800' },
  rateTrack:  { height: 8, backgroundColor: PALETTE.border, borderRadius: 4, overflow: 'hidden', marginBottom: 10 },
  rateFill:   { height: '100%', borderRadius: 4 },
  rateBreakdown: {},
  rateBreakText: { fontSize: 11, color: PALETTE.textSub },

  // Sparkline
  sparkTitle:  { color: PALETTE.textSub, fontSize: 12, fontWeight: '600', marginBottom: 12 },
  sparkWrap:   { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 70 },
  sparkCol:    { alignItems: 'center', flex: 1 },
  sparkBar:    { width: 16, borderRadius: 4, overflow: 'hidden', justifyContent: 'flex-end' },
  sparkFill:   { position: 'absolute', bottom: 0, left: 0, right: 0, borderRadius: 4 },
  sparkFillOver: { position: 'absolute', bottom: 0, left: 0, right: 0, borderRadius: 4 },
  sparkLabel:  { color: PALETTE.textDim, fontSize: 9, marginTop: 4 },
  sparkLegend: { flexDirection: 'row', gap: 16, marginTop: 10 },
  legendItem:  { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot:   { width: 8, height: 8, borderRadius: 4 },
  legendText:  { color: PALETTE.textSub, fontSize: 10 },

  // Plans
  planRow:     { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  planDot:     { width: 6, height: 6, borderRadius: 3, backgroundColor: PALETTE.purple },
  planName:    { color: PALETTE.text, fontSize: 12, flex: 1, fontWeight: '600' },
  planCount:   { color: PALETTE.textSub, fontSize: 11, marginRight: 8 },
  planRevenue: { fontSize: 12, fontWeight: '700' },

  // Tickets
  totalTicketsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  totalTicketsLabel: { color: PALETTE.textSub, fontSize: 12 },
  totalTicketsValue: { color: PALETTE.text, fontSize: 18, fontWeight: '700' },

  // Actions grid
  actionsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: CARD_GAP, marginBottom: CARD_GAP,
  },
  actionBtn: {
    width: HALF, backgroundColor: PALETTE.card,
    borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: PALETTE.border,
    alignItems: 'center', gap: 8,
  },
  actionIconWrap: {
    width: 42, height: 42, borderRadius: 12,
    backgroundColor: PALETTE.accentDim,
    alignItems: 'center', justifyContent: 'center',
  },
  actionLabel: { color: PALETTE.text, fontSize: 11, fontWeight: '600', textAlign: 'center' },
  badgeCircle: {
    position: 'absolute', top: -4, right: -4,
    backgroundColor: PALETTE.amber,
    borderRadius: 9, minWidth: 18, height: 18,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
    borderWidth: 1.5, borderColor: PALETTE.card,
  },
  badgeText: { color: '#000', fontSize: 9, fontWeight: '800' },

  // Login screen
  loginLogo: { alignItems: 'center', marginBottom: 16 },
  loginTitle: { color: PALETTE.text, fontSize: 24, fontWeight: '800', textAlign: 'center', marginBottom: 6 },
  loginSub: { color: PALETTE.textSub, fontSize: 13, textAlign: 'center', marginBottom: 24 },
  loginInput: {
    backgroundColor: PALETTE.card,
    borderWidth: 1, borderColor: PALETTE.border,
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12,
    color: PALETTE.text, fontSize: 14, marginBottom: 12,
  },
  loginBtn: {
    backgroundColor: PALETTE.accent,
    borderRadius: 12, paddingVertical: 14,
    alignItems: 'center', marginTop: 4,
  },
  loginBtnText: { color: '#000', fontSize: 15, fontWeight: '700' },
});

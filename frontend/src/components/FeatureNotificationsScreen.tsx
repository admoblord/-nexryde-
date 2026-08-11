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
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '@/src/constants/theme';
import { BRAND, RADIUS, SPACING, SURFACE, TYPOGRAPHY } from '@/src/constants/designSystem';
import { useFlowLayout } from '@/src/constants/flowLayout';
import {
  FeatureAnnouncement,
  fetchFeatureAnnouncements,
  getSeenFeatureIds,
  markAllFeaturesAsSeen,
  markFeatureAsSeen,
} from '@/src/services/featureAnnouncements';
import { BACKEND_URL, getAuthHeaders } from '@/src/services/api';
import { authedFetch } from '@/src/utils/sessionRefresh';
import { useAuthedUserId } from '@/src/hooks/useAuthedUserId';
import { TabBrandStrip } from '@/src/components/flow/TabBrandStrip';
import { tabCacheGet, tabCacheSet } from '@/src/services/tabDataCache';

type Props = {
  role: 'rider' | 'driver';
};

type NotifTab = 'updates' | 'activity';

type BackendNotif = {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
  data?: Record<string, any>;
};

const NOTIF_ICON: Record<string, { icon: string; color: string }> = {
  verification_approved: { icon: 'checkmark-circle', color: BRAND.primaryDark },
  verification_rejected: { icon: 'close-circle', color: BRAND.danger },
  trip_completed:        { icon: 'checkmark-done-circle', color: BRAND.accentBlue },
  trip_cancelled:        { icon: 'close-circle-outline', color: BRAND.warning },
  subscription_activated:{ icon: 'star', color: BRAND.accentPurple },
  guarantee_topup:       { icon: 'wallet', color: BRAND.primaryDark },
  shield_update:         { icon: 'shield-checkmark', color: BRAND.info },
  payment_received:      { icon: 'cash', color: BRAND.primaryDark },
  enforcement:           { icon: 'shield-half', color: BRAND.accentOrange },
  enforcement_warning:   { icon: 'alert-circle-outline', color: BRAND.warning },
  enforcement_timeout:   { icon: 'time-outline', color: BRAND.accentOrange },
  enforcement_suspended: { icon: 'pause-circle', color: BRAND.danger },
  enforcement_deactivated: { icon: 'ban', color: '#991B1B' },
  enforcement_booking_blocked: { icon: 'calendar-outline', color: BRAND.accentOrange },
  enforcement_suspended_long: { icon: 'lock-closed', color: '#991B1B' },
  surge_active:          { icon: 'flash-outline', color: BRAND.warning },
  surge_elevated:        { icon: 'flash', color: BRAND.accentOrange },
  surge_high:            { icon: 'thunderstorm', color: BRAND.danger },
  surge_peak_guide:      { icon: 'time-outline', color: BRAND.accentPurple },
  default:               { icon: 'notifications', color: BRAND.textMuted },
};

function notifMeta(type: unknown) {
  // Guard: backend notifications may arrive without a `type` — never call string
  // methods on undefined (render-phase crash).
  const t = typeof type === 'string' ? type : '';
  if (t.startsWith('enforcement_')) {
    return NOTIF_ICON[t] || NOTIF_ICON.enforcement;
  }
  if (t.startsWith('surge_')) {
    return NOTIF_ICON[t] || NOTIF_ICON.surge_active;
  }
  return NOTIF_ICON[t] || NOTIF_ICON.default;
}

function surgeNotifRoute(data?: Record<string, unknown>): string | null {
  const route = data?.action_route;
  return typeof route === 'string' && route.length > 0 ? route : null;
}

function relativeTime(raw: string): string {
  const ms = Date.now() - new Date(raw).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(raw).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function FeatureNotificationsScreen({ role }: Props) {
  const { colors, isDark } = useThemeColors();
  const router = useRouter();
  const { userId, canCallAuthedApi } = useAuthedUserId();
  const flow = useFlowLayout();

  const notifCacheKey = userId ? `tab-notifs:${role}:${userId}` : '';
  const notifCached = userId
    ? tabCacheGet<{
        rows: FeatureAnnouncement[];
        backendNotifs: BackendNotif[];
        unreadBackend: number;
      }>(`tab-notifs:${role}:${userId}`)
    : null;
  const [tab, setTab] = useState<NotifTab>('activity');
  const [loading, setLoading] = useState(() => !notifCached);
  const [refreshing, setRefreshing] = useState(false);

  // Feature announcements
  const [rows, setRows] = useState<FeatureAnnouncement[]>(() => notifCached?.rows ?? []);
  const [seen, setSeen] = useState<Set<string>>(new Set());

  // Backend notifications
  const [backendNotifs, setBackendNotifs] = useState<BackendNotif[]>(
    () => notifCached?.backendNotifs ?? [],
  );
  const [unreadBackend, setUnreadBackend] = useState(() => Number(notifCached?.unreadBackend ?? 0));

  const loadFeatures = useCallback(async (): Promise<FeatureAnnouncement[]> => {
    const [list, seenIds] = await Promise.all([
      fetchFeatureAnnouncements(role),
      getSeenFeatureIds(),
    ]);
    setRows(list);
    setSeen(seenIds);
    return list;
  }, [role]);

  const loadBackendNotifs = useCallback(async (): Promise<{
    backendNotifs: BackendNotif[];
    unreadBackend: number;
  }> => {
    if (!userId || !canCallAuthedApi) {
      return { backendNotifs: [], unreadBackend: 0 };
    }
    try {
      const res = await authedFetch(
        `${BACKEND_URL}/api/users/${userId}/notifications?limit=40`,
        { timeoutMs: 10_000, preserveSessionOn401: true },
      );
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data.notifications) ? data.notifications : [];
        const unread = Number(data.unread_count || 0);
        setBackendNotifs(list);
        setUnreadBackend(unread);
        return { backendNotifs: list, unreadBackend: unread };
      }
    } catch {
      // silent — show empty / cached state
    }
    return { backendNotifs: [], unreadBackend: 0 };
  }, [userId, canCallAuthedApi]);

  const load = useCallback(async () => {
    const LOAD_TIMEOUT_MS = 12000;
    // Instant return visits: keep prior rows while revalidating.
    if (!notifCached) setLoading(true);
    try {
      const result = await Promise.race([
        Promise.all([loadFeatures(), loadBackendNotifs()]),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), LOAD_TIMEOUT_MS)),
      ]);
      if (result && notifCacheKey) {
        const [freshRows, b] = result;
        tabCacheSet(notifCacheKey, {
          rows: freshRows,
          backendNotifs: b.backendNotifs,
          unreadBackend: b.unreadBackend,
        });
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadFeatures, loadBackendNotifs, notifCached, notifCacheKey]);

  useEffect(() => {
    if (!canCallAuthedApi) {
      setLoading(false);
      return;
    }
    void load();
    // Absolute failsafe — never leave the tab spinning forever on weak networks.
    const failsafe = setTimeout(() => setLoading(false), 15000);
    return () => clearTimeout(failsafe);
  }, [load, canCallAuthedApi]);

  const markNotifRead = async (notifId: string) => {
    if (!userId || !canCallAuthedApi) return;
    setBackendNotifs((prev) =>
      prev.map((n) => (n.id === notifId ? { ...n, read: true } : n))
    );
    setUnreadBackend((c) => Math.max(0, c - 1));
    try {
      const headers = getAuthHeaders() as Record<string, string>;
      await fetch(
        `${BACKEND_URL}/api/users/${userId}/notifications/${notifId}/read`,
        { method: 'POST', headers }
      );
    } catch { /* best-effort */ }
  };

  const markAllNotifRead = async () => {
    if (!userId || !canCallAuthedApi) return;
    setBackendNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadBackend(0);
    try {
      const headers = getAuthHeaders() as Record<string, string>;
      await fetch(
        `${BACKEND_URL}/api/users/${userId}/notifications/read-all`,
        { method: 'POST', headers }
      );
    } catch { /* best-effort */ }
  };

  const unreadFeatures = useMemo(() => rows.filter((r) => !seen.has(r.id)).length, [rows, seen]);
  const totalUnread = unreadFeatures + unreadBackend;

  const openFeature = async (row: FeatureAnnouncement) => {
    const next = new Set(seen);
    next.add(row.id);
    setSeen(next);
    await markFeatureAsSeen(row.id);
    router.push(row.feature_route as any);
  };

  const markAllFeatRead = async () => {
    const next = new Set(seen);
    rows.forEach((r) => next.add(r.id));
    setSeen(next);
    await markAllFeaturesAsSeen(role);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: isDark ? BRAND.bgDeep : colors.background }]}
      edges={['top']}
    >
      <TabBrandStrip role={role} />
      {/* Header */}
      <View style={[styles.header, { paddingHorizontal: flow.padH }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.text }]}>Notifications</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Trip alerts, offers, and account updates
          </Text>
        </View>
        {totalUnread > 0 && (
          <View style={[styles.unreadBubble, { backgroundColor: BRAND.danger }]}>
            <Text style={styles.unreadBubbleText}>{totalUnread}</Text>
          </View>
        )}
      </View>

      {/* Tab pills */}
      <View style={[styles.tabRow, { paddingHorizontal: flow.padH }]}>
        <TouchableOpacity
          style={[
            styles.tabPill,
            {
              backgroundColor: isDark ? BRAND.bgElevated : colors.card,
              borderColor: colors.border,
            },
            tab === 'activity' && styles.tabPillActive,
          ]}
          onPress={() => setTab('activity')}
        >
          <Ionicons
            name="pulse"
            size={14}
            color={tab === 'activity' ? BRAND.bgDeep : colors.textSecondary}
          />
          <Text
            style={[
              styles.tabPillText,
              { color: colors.textSecondary },
              tab === 'activity' && styles.tabPillTextActive,
            ]}
          >
            Activity
            {unreadBackend > 0 ? ` (${unreadBackend})` : ''}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tabPill,
            {
              backgroundColor: isDark ? BRAND.bgElevated : colors.card,
              borderColor: colors.border,
            },
            tab === 'updates' && styles.tabPillActive,
          ]}
          onPress={() => setTab('updates')}
        >
          <Ionicons
            name="megaphone"
            size={14}
            color={tab === 'updates' ? BRAND.bgDeep : colors.textSecondary}
          />
          <Text
            style={[
              styles.tabPillText,
              { color: colors.textSecondary },
              tab === 'updates' && styles.tabPillTextActive,
            ]}
          >
            Updates
            {unreadFeatures > 0 ? ` (${unreadFeatures})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        (() => {
          const { TripHistorySkeleton } = require('@/src/components/shared/SkeletonLoader');
          return <TripHistorySkeleton />;
        })()
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.content,
            {
              paddingHorizontal: flow.padH,
              paddingTop: SPACING.sm,
              gap: SPACING.stack,
              paddingBottom: 88,
            },
          ]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Activity tab ─────────────────────────────────────── */}
          {tab === 'activity' && (
            <>
              {unreadBackend > 0 && (
                <TouchableOpacity
                  style={[
                    styles.markAllBtn,
                    {
                      backgroundColor: isDark ? SURFACE.tile : colors.card,
                      borderColor: isDark ? SURFACE.hairline : colors.border,
                    },
                  ]}
                  onPress={markAllNotifRead}
                >
                  <Ionicons name="checkmark-done-outline" size={15} color={BRAND.info} />
                  <Text style={styles.markAllText}>Mark all as read</Text>
                </TouchableOpacity>
              )}
              {backendNotifs.length === 0 ? (
                <View
                  style={[
                    styles.emptyCard,
                    {
                      backgroundColor: isDark ? SURFACE.cardDark : colors.card,
                      borderColor: isDark ? SURFACE.hairline : colors.border,
                    },
                  ]}
                >
                  <Ionicons name="notifications-off-outline" size={32} color={colors.textMuted} />
                  <Text style={[styles.emptyTitle, { color: colors.text }]}>All caught up</Text>
                  <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                    Trip updates, payments, and account alerts land here.
                  </Text>
                </View>
              ) : (
                backendNotifs.map((notif) => {
                  const meta = notifMeta(notif.type);
                  const heatmapRoute = role === 'driver' ? surgeNotifRoute(notif.data) : null;
                  return (
                    <TouchableOpacity
                      key={notif.id}
                      style={[
                        styles.notifCard,
                        {
                          backgroundColor: isDark ? SURFACE.cardDark : colors.card,
                          borderColor: isDark ? SURFACE.hairline : colors.border,
                        },
                        !notif.read && styles.notifCardUnread,
                      ]}
                      onPress={() => {
                        void markNotifRead(notif.id);
                        if (heatmapRoute) router.push(heatmapRoute as any);
                      }}
                      activeOpacity={0.8}
                    >
                      <View style={[styles.notifIconWrap, { backgroundColor: meta.color + '18' }]}>
                        <Ionicons name={meta.icon as any} size={20} color={meta.color} />
                      </View>
                      <View style={styles.notifBody}>
                        <View style={styles.notifTopRow}>
                          <Text style={[styles.notifTitle, { color: colors.text }]} numberOfLines={1}>{notif.title}</Text>
                          {!notif.read && <View style={styles.unreadDot} />}
                        </View>
                        <Text style={[styles.notifMessage, { color: colors.textSecondary }]} numberOfLines={6}>{notif.message}</Text>
                        {heatmapRoute ? (
                          <View style={styles.surgeCtaRow}>
                            <Ionicons name="flame" size={13} color={BRAND.info} />
                            <Text style={styles.surgeCtaText}>Open demand heatmap</Text>
                          </View>
                        ) : null}
                        <Text style={[styles.notifTime, { color: colors.textMuted }]}>{relativeTime(notif.created_at)}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </>
          )}

          {/* ── What's New tab ────────────────────────────────────── */}
          {tab === 'updates' && (
            <>
              {unreadFeatures > 0 && (
                <TouchableOpacity
                  style={[
                    styles.markAllBtn,
                    {
                      backgroundColor: isDark ? SURFACE.tile : colors.card,
                      borderColor: isDark ? SURFACE.hairline : colors.border,
                    },
                  ]}
                  onPress={markAllFeatRead}
                >
                  <Ionicons name="checkmark-done-outline" size={15} color={BRAND.info} />
                  <Text style={styles.markAllText}>Mark all as read</Text>
                </TouchableOpacity>
              )}
              {rows.length === 0 ? (
                <View
                  style={[
                    styles.emptyCard,
                    {
                      backgroundColor: isDark ? SURFACE.cardDark : colors.card,
                      borderColor: isDark ? SURFACE.hairline : colors.border,
                    },
                  ]}
                >
                  <Ionicons name="megaphone-outline" size={32} color={colors.textMuted} />
                  <Text style={[styles.emptyTitle, { color: colors.text }]}>No updates yet</Text>
                  <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                    New feature releases and app updates will show here.
                  </Text>
                </View>
              ) : (
                rows.map((row) => {
                  const isSeen = seen.has(row.id);
                  return (
                    <TouchableOpacity
                      key={row.id}
                      style={[
                        styles.featCard,
                        {
                          backgroundColor: isDark ? SURFACE.cardDark : colors.card,
                          borderColor: isDark ? SURFACE.hairline : colors.border,
                        },
                        isSeen && styles.featCardSeen,
                      ]}
                      onPress={() => void openFeature(row)}
                      activeOpacity={0.82}
                    >
                      <View style={styles.featCardTop}>
                        <View style={[styles.featIconWrap, { backgroundColor: 'rgba(56,189,248,0.12)' }]}>
                          <Ionicons name="sparkles" size={16} color={BRAND.info} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={styles.featTitleRow}>
                            <Text style={[styles.featTitle, { color: colors.text }]} numberOfLines={1}>{row.title}</Text>
                            {!isSeen && <View style={styles.unreadDot} />}
                          </View>
                          <Text style={[styles.featMessage, { color: colors.textSecondary }]} numberOfLines={2}>{row.message}</Text>
                        </View>
                      </View>
                      <View style={styles.featFooter}>
                        <Text style={[styles.featMeta, { color: colors.textMuted }]}>
                          {row.version ? `v${row.version} · ` : ''}{relativeTime(row.created_at)}
                        </Text>
                        <View style={styles.openPill}>
                          <Text style={styles.openPillText}>Open</Text>
                          <Ionicons name="arrow-forward" size={11} color={BRAND.info} />
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BRAND.bgDeep },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.md,
    gap: SPACING.md,
  },
  title: { fontSize: 22, fontWeight: '900', letterSpacing: -0.4 },
  subtitle: { marginTop: 2, fontSize: 13, fontWeight: '600' },
  unreadBubble: {
    minWidth: 28,
    height: 28,
    borderRadius: RADIUS.full,
    backgroundColor: BRAND.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  unreadBubbleText: { color: '#FFF', fontSize: 11, fontWeight: '900' },
  tabRow: {
    flexDirection: 'row',
    gap: SPACING.stack,
    paddingBottom: SPACING.md,
  },
  tabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    minHeight: 44,
    borderRadius: RADIUS.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tabPillActive: {
    backgroundColor: BRAND.primary,
    borderColor: BRAND.primary,
  },
  tabPillText: { fontSize: 13, fontWeight: '800' },
  tabPillTextActive: { color: BRAND.bgDeep },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { flexGrow: 1 },
  markAllBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: RADIUS.full,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: SPACING.xs,
  },
  markAllText: { fontSize: 11, fontWeight: '800', color: BRAND.info },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.xl,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 48,
    paddingHorizontal: SPACING.lg,
    gap: SPACING.stack,
  },
  emptyTitle: { fontSize: 15, fontWeight: '800' },
  emptyText: { fontSize: 13, fontWeight: '600', textAlign: 'center', lineHeight: 20 },
  notifCard: {
    flexDirection: 'row',
    gap: SPACING.md,
    borderRadius: RADIUS.xl,
    padding: SPACING.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  notifCardUnread: {
    backgroundColor: BRAND.primaryMuted,
    borderColor: SURFACE.glassBorder,
  },
  notifIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  notifBody: { flex: 1, gap: 3 },
  notifTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  notifTitle: { flex: 1, fontSize: 15, fontWeight: '800' },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: BRAND.info, flexShrink: 0 },
  notifMessage: { fontSize: 13, lineHeight: 19, fontWeight: '600' },
  notifTime: { fontSize: 11, fontWeight: '700', marginTop: 2 },
  surgeCtaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
    backgroundColor: 'rgba(56,189,248,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(56,189,248,0.3)',
  },
  surgeCtaText: { fontSize: 11, fontWeight: '800', color: BRAND.info },
  featCard: {
    borderRadius: RADIUS.xl,
    padding: SPACING.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: SPACING.stack,
  },
  featCardSeen: { opacity: 0.72 },
  featCardTop: { flexDirection: 'row', gap: SPACING.md, alignItems: 'flex-start' },
  featIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 2,
  },
  featTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  featTitle: { flex: 1, fontSize: 15, fontWeight: '900' },
  featMessage: { fontSize: 13, lineHeight: 19, fontWeight: '600' },
  featFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  featMeta: { fontSize: 11, fontWeight: '700' },
  openPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: RADIUS.full,
    backgroundColor: 'rgba(56,189,248,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(56,189,248,0.3)',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  openPillText: { fontSize: 11, color: BRAND.info, fontWeight: '900' },
});


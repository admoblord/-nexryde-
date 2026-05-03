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
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import {
  FeatureAnnouncement,
  fetchFeatureAnnouncements,
  getSeenFeatureIds,
  markAllFeaturesAsSeen,
  markFeatureAsSeen,
} from '@/src/services/featureAnnouncements';
import { BACKEND_URL, getAuthHeaders } from '@/src/services/api';
import { useAppStore } from '@/src/store/appStore';

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
  verification_approved: { icon: 'checkmark-circle', color: '#16A34A' },
  verification_rejected: { icon: 'close-circle', color: '#EF4444' },
  trip_completed:        { icon: 'checkmark-done-circle', color: '#2563EB' },
  trip_cancelled:        { icon: 'close-circle-outline', color: '#F59E0B' },
  subscription_activated:{ icon: 'star', color: '#7C3AED' },
  guarantee_topup:       { icon: 'wallet', color: '#16A34A' },
  shield_update:         { icon: 'shield-checkmark', color: '#0891B2' },
  payment_received:      { icon: 'cash', color: '#16A34A' },
  default:               { icon: 'notifications', color: '#6B7280' },
};

function notifMeta(type: string) {
  return NOTIF_ICON[type] || NOTIF_ICON.default;
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
  const router = useRouter();
  const { user } = useAppStore();

  const [tab, setTab] = useState<NotifTab>('activity');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Feature announcements
  const [rows, setRows] = useState<FeatureAnnouncement[]>([]);
  const [seen, setSeen] = useState<Set<string>>(new Set());

  // Backend notifications
  const [backendNotifs, setBackendNotifs] = useState<BackendNotif[]>([]);
  const [unreadBackend, setUnreadBackend] = useState(0);

  const loadFeatures = useCallback(async () => {
    const [list, seenIds] = await Promise.all([
      fetchFeatureAnnouncements(role),
      getSeenFeatureIds(),
    ]);
    setRows(list);
    setSeen(seenIds);
  }, [role]);

  const loadBackendNotifs = useCallback(async () => {
    if (!user?.id) return;
    try {
      const headers = getAuthHeaders() as Record<string, string>;
      const res = await fetch(
        `${BACKEND_URL}/api/users/${user.id}/notifications?limit=40`,
        { headers }
      );
      if (res.ok) {
        const data = await res.json();
        setBackendNotifs(Array.isArray(data.notifications) ? data.notifications : []);
        setUnreadBackend(Number(data.unread_count || 0));
      }
    } catch {
      // silent — show empty state
    }
  }, [user?.id]);

  const load = useCallback(async () => {
    await Promise.all([loadFeatures(), loadBackendNotifs()]);
    setLoading(false);
    setRefreshing(false);
  }, [loadFeatures, loadBackendNotifs]);

  useEffect(() => { void load(); }, [load]);

  const markNotifRead = async (notifId: string) => {
    if (!user?.id) return;
    setBackendNotifs((prev) =>
      prev.map((n) => (n.id === notifId ? { ...n, read: true } : n))
    );
    setUnreadBackend((c) => Math.max(0, c - 1));
    try {
      const headers = getAuthHeaders() as Record<string, string>;
      await fetch(
        `${BACKEND_URL}/api/users/${user.id}/notifications/${notifId}/read`,
        { method: 'POST', headers }
      );
    } catch { /* best-effort */ }
  };

  const markAllNotifRead = async () => {
    if (!user?.id) return;
    setBackendNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadBackend(0);
    try {
      const headers = getAuthHeaders() as Record<string, string>;
      await fetch(
        `${BACKEND_URL}/api/users/${user.id}/notifications/read-all`,
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
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Notifications</Text>
          <Text style={styles.subtitle}>Stay updated on your activity</Text>
        </View>
        {totalUnread > 0 && (
          <View style={styles.unreadBubble}>
            <Text style={styles.unreadBubbleText}>{totalUnread}</Text>
          </View>
        )}
      </View>

      {/* Tab pills */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabPill, tab === 'activity' && styles.tabPillActive]}
          onPress={() => setTab('activity')}
        >
          <Ionicons
            name="pulse"
            size={14}
            color={tab === 'activity' ? COLORS.white : COLORS.lightTextSecondary}
          />
          <Text style={[styles.tabPillText, tab === 'activity' && styles.tabPillTextActive]}>
            Activity
            {unreadBackend > 0 ? ` (${unreadBackend})` : ''}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabPill, tab === 'updates' && styles.tabPillActive]}
          onPress={() => setTab('updates')}
        >
          <Ionicons
            name="megaphone"
            size={14}
            color={tab === 'updates' ? COLORS.white : COLORS.lightTextSecondary}
          />
          <Text style={[styles.tabPillText, tab === 'updates' && styles.tabPillTextActive]}>
            What&apos;s New
            {unreadFeatures > 0 ? ` (${unreadFeatures})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.accentBlue} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Activity tab ─────────────────────────────────────── */}
          {tab === 'activity' && (
            <>
              {unreadBackend > 0 && (
                <TouchableOpacity style={styles.markAllBtn} onPress={markAllNotifRead}>
                  <Ionicons name="checkmark-done-outline" size={15} color={COLORS.accentBlue} />
                  <Text style={styles.markAllText}>Mark all as read</Text>
                </TouchableOpacity>
              )}
              {backendNotifs.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Ionicons name="notifications-off-outline" size={32} color={COLORS.lightTextMuted} />
                  <Text style={styles.emptyTitle}>No activity yet</Text>
                  <Text style={styles.emptyText}>
                    Trip updates, document status, payments and other alerts will appear here.
                  </Text>
                </View>
              ) : (
                backendNotifs.map((notif) => {
                  const meta = notifMeta(notif.type);
                  return (
                    <TouchableOpacity
                      key={notif.id}
                      style={[styles.notifCard, !notif.read && styles.notifCardUnread]}
                      onPress={() => void markNotifRead(notif.id)}
                      activeOpacity={0.8}
                    >
                      <View style={[styles.notifIconWrap, { backgroundColor: meta.color + '18' }]}>
                        <Ionicons name={meta.icon as any} size={20} color={meta.color} />
                      </View>
                      <View style={styles.notifBody}>
                        <View style={styles.notifTopRow}>
                          <Text style={styles.notifTitle} numberOfLines={1}>{notif.title}</Text>
                          {!notif.read && <View style={styles.unreadDot} />}
                        </View>
                        <Text style={styles.notifMessage} numberOfLines={3}>{notif.message}</Text>
                        <Text style={styles.notifTime}>{relativeTime(notif.created_at)}</Text>
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
                <TouchableOpacity style={styles.markAllBtn} onPress={markAllFeatRead}>
                  <Ionicons name="checkmark-done-outline" size={15} color={COLORS.accentBlue} />
                  <Text style={styles.markAllText}>Mark all as read</Text>
                </TouchableOpacity>
              )}
              {rows.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Ionicons name="megaphone-outline" size={32} color={COLORS.lightTextMuted} />
                  <Text style={styles.emptyTitle}>No updates yet</Text>
                  <Text style={styles.emptyText}>New feature releases and app updates will show here.</Text>
                </View>
              ) : (
                rows.map((row) => {
                  const isSeen = seen.has(row.id);
                  return (
                    <TouchableOpacity
                      key={row.id}
                      style={[styles.featCard, isSeen && styles.featCardSeen]}
                      onPress={() => void openFeature(row)}
                      activeOpacity={0.82}
                    >
                      <View style={styles.featCardTop}>
                        <View style={[styles.featIconWrap, { backgroundColor: COLORS.infoSoft }]}>
                          <Ionicons name="sparkles" size={16} color={COLORS.accentBlue} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={styles.featTitleRow}>
                            <Text style={styles.featTitle} numberOfLines={1}>{row.title}</Text>
                            {!isSeen && <View style={styles.unreadDot} />}
                          </View>
                          <Text style={styles.featMessage} numberOfLines={2}>{row.message}</Text>
                        </View>
                      </View>
                      <View style={styles.featFooter}>
                        <Text style={styles.featMeta}>
                          {row.version ? `v${row.version} · ` : ''}{relativeTime(row.created_at)}
                        </Text>
                        <View style={styles.openPill}>
                          <Text style={styles.openPillText}>Open</Text>
                          <Ionicons name="arrow-forward" size={11} color={COLORS.accentBlue} />
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
  container: { flex: 1, backgroundColor: COLORS.gray50 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.md,
    gap: SPACING.md,
  },
  title: { fontSize: FONT_SIZE.xxl, fontWeight: '900', color: COLORS.lightTextPrimary },
  subtitle: { marginTop: 2, fontSize: FONT_SIZE.sm, color: COLORS.lightTextSecondary, fontWeight: '600' },
  unreadBubble: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.error,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  unreadBubbleText: { color: '#FFF', fontSize: FONT_SIZE.xs, fontWeight: '900' },
  tabRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  tabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
  },
  tabPillActive: {
    backgroundColor: COLORS.accentBlue,
    borderColor: COLORS.accentBlue,
  },
  tabPillText: { fontSize: FONT_SIZE.sm, fontWeight: '800', color: COLORS.lightTextSecondary },
  tabPillTextActive: { color: COLORS.white },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: SPACING.lg, paddingTop: SPACING.xs, gap: SPACING.sm, paddingBottom: 80 },
  markAllBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
    marginBottom: SPACING.xs,
  },
  markAllText: { fontSize: FONT_SIZE.xs, fontWeight: '800', color: COLORS.accentBlue },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
    paddingVertical: 48,
    paddingHorizontal: SPACING.lg,
    gap: SPACING.sm,
  },
  emptyTitle: { fontSize: FONT_SIZE.md, fontWeight: '800', color: COLORS.lightTextPrimary },
  emptyText: { fontSize: FONT_SIZE.sm, color: COLORS.lightTextMuted, fontWeight: '600', textAlign: 'center', lineHeight: 20 },
  // Activity (backend) notification cards
  notifCard: {
    flexDirection: 'row',
    gap: SPACING.md,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
  },
  notifCardUnread: {
    backgroundColor: '#F0F9FF',
    borderColor: '#BAE6FD',
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
  notifTitle: { flex: 1, fontSize: FONT_SIZE.md, fontWeight: '800', color: COLORS.lightTextPrimary },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.accentBlue, flexShrink: 0 },
  notifMessage: { fontSize: FONT_SIZE.sm, color: COLORS.lightTextSecondary, lineHeight: 19, fontWeight: '600' },
  notifTime: { fontSize: FONT_SIZE.xs, color: COLORS.lightTextMuted, fontWeight: '700', marginTop: 2 },
  // Feature update cards
  featCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
    gap: SPACING.sm,
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
  featTitle: { flex: 1, fontSize: FONT_SIZE.md, fontWeight: '900', color: COLORS.lightTextPrimary },
  featMessage: { fontSize: FONT_SIZE.sm, color: COLORS.lightTextSecondary, lineHeight: 19, fontWeight: '600' },
  featFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  featMeta: { fontSize: FONT_SIZE.xs, color: COLORS.lightTextMuted, fontWeight: '700' },
  openPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.infoSoft,
    borderWidth: 1,
    borderColor: COLORS.info,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  openPillText: { fontSize: 11, color: COLORS.info, fontWeight: '900' },
});

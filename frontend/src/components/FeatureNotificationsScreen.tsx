import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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

type Props = {
  role: 'rider' | 'driver';
};

export default function FeatureNotificationsScreen({ role }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState<FeatureAnnouncement[]>([]);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const list = await fetchFeatureAnnouncements(role);
    setRows(list);
  }, [role]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [list, seenIds] = await Promise.all([fetchFeatureAnnouncements(role), getSeenFeatureIds()]);
      setRows(list);
      setSeen(seenIds);
      setLoading(false);
    })();
  }, [load, role]);

  const unreadCount = useMemo(
    () => rows.filter((r) => !seen.has(r.id)).length,
    [rows, seen],
  );

  const openFeature = async (row: FeatureAnnouncement) => {
    const next = new Set(seen);
    next.add(row.id);
    setSeen(next);
    await markFeatureAsSeen(row.id);
    router.push(row.feature_route as any);
  };

  const markAllRead = async () => {
    const next = new Set(seen);
    rows.forEach((r) => next.add(r.id));
    setSeen(next);
    await markAllFeaturesAsSeen(role);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>What&apos;s New</Text>
          <Text style={styles.subtitle}>Company updates and newly released features.</Text>
        </View>
        <View style={styles.counterPill}>
          <Text style={styles.counterText}>{unreadCount} New</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionBtn} onPress={markAllRead}>
          <Ionicons name="checkmark-done-outline" size={16} color={COLORS.accentBlue} />
          <Text style={styles.actionText}>Mark all as read</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.accentBlue} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await load();
                setRefreshing(false);
              }}
            />
          }
        >
          {rows.map((row) => {
            const isSeen = seen.has(row.id);
            return (
              <TouchableOpacity
                key={row.id}
                style={[styles.card, isSeen && styles.cardSeen]}
                onPress={() => void openFeature(row)}
                accessibilityRole="button"
                accessibilityLabel={row.title}
              >
                <View style={styles.cardTop}>
                  <Text style={styles.cardTitle}>{row.title}</Text>
                  {!isSeen ? <View style={styles.newDot} /> : null}
                </View>
                <Text style={styles.cardMessage}>{row.message}</Text>
                <View style={styles.cardBottom}>
                  <Text style={styles.cardMeta}>
                    {row.version ? `v${row.version} • ` : ''}{new Date(row.created_at).toLocaleDateString()}
                  </Text>
                  <View style={styles.openPill}>
                    <Text style={styles.openPillText}>Open feature</Text>
                    <Ionicons name="arrow-forward" size={12} color={COLORS.accentBlue} />
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
          {rows.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="notifications-off-outline" size={28} color={COLORS.lightTextMuted} />
              <Text style={styles.emptyText}>No feature notifications yet.</Text>
            </View>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.gray50 },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: SPACING.md,
  },
  title: { fontSize: FONT_SIZE.xxl, fontWeight: '900', color: COLORS.lightTextPrimary },
  subtitle: { marginTop: 4, fontSize: FONT_SIZE.sm, color: COLORS.lightTextSecondary, fontWeight: '600' },
  counterPill: {
    borderRadius: 999,
    backgroundColor: COLORS.infoSoft,
    borderWidth: 1,
    borderColor: COLORS.info,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  counterText: { color: COLORS.info, fontSize: FONT_SIZE.xs, fontWeight: '900' },
  actions: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.sm },
  actionBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
    backgroundColor: COLORS.white,
  },
  actionText: { fontSize: FONT_SIZE.xs, fontWeight: '800', color: COLORS.accentBlue },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: SPACING.lg, paddingTop: SPACING.sm, gap: SPACING.md, paddingBottom: SPACING.huge },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  cardSeen: { opacity: 0.72 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  cardTitle: { flex: 1, fontSize: FONT_SIZE.md, fontWeight: '900', color: COLORS.lightTextPrimary },
  newDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: COLORS.accentGreen },
  cardMessage: { fontSize: FONT_SIZE.sm, color: COLORS.lightTextSecondary, lineHeight: 20, fontWeight: '600' },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  cardMeta: { fontSize: FONT_SIZE.xs, color: COLORS.lightTextMuted, fontWeight: '700' },
  openPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.infoSoft,
    borderWidth: 1,
    borderColor: COLORS.info,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  openPillText: { fontSize: 11, color: COLORS.info, fontWeight: '900' },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
    backgroundColor: COLORS.white,
    paddingVertical: SPACING.xxl,
    gap: SPACING.sm,
  },
  emptyText: { fontSize: FONT_SIZE.sm, color: COLORS.lightTextMuted, fontWeight: '700' },
});


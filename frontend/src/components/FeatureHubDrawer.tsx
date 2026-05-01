import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Pressable,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS } from '@/src/constants/theme';
import { BRAND, LAYOUT } from '@/src/constants/designSystem';

type HubRole = 'driver' | 'rider';

type HubItem = {
  label: string;
  hint?: string;
  route: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
};

type HubSection = { id: string; title: string; items: HubItem[] };

const DRIVER_SECTIONS: HubSection[] = [
  {
    id: 'community',
    title: 'Community & social',
    items: [
      { label: 'Driver community', route: '/driver/community', icon: 'people', hint: 'Posts & peers' },
      { label: 'Stories', route: '/stories', icon: 'book', hint: 'Trip stories' },
      { label: 'Leaderboard', route: '/driver/leaderboard', icon: 'trophy', hint: 'Top drivers' },
      { label: 'Create post', route: '/driver/create-post', icon: 'create', hint: 'Share an update' },
    ],
  },
  {
    id: 'legal',
    title: 'Legal & protection',
    items: [
      { label: 'NEXRYDE Shield', route: '/shield-disputes', icon: 'shield', hint: 'Disputes & records' },
      { label: 'Support & incidents', route: '/support', icon: 'document-text', hint: 'Help & reports' },
    ],
  },
  {
    id: 'convenience',
    title: 'Convenience',
    items: [
      { label: 'Smart mode', route: '/driver/smart-mode', icon: 'flash', hint: 'Driving assist' },
      { label: 'Traffic & routes', route: '/driver/traffic', icon: 'navigate', hint: 'AI route context' },
      { label: 'Prayer times', route: '/driver/prayer-times', icon: 'moon', hint: 'Local times' },
      { label: 'Wellness', route: '/driver/wellness', icon: 'fitness', hint: 'Driver wellness' },
    ],
  },
  {
    id: 'account',
    title: 'Account & payments',
    items: [
      { label: 'Subscription', route: '/driver/subscription', icon: 'card-outline', hint: 'Plan & billing' },
      { label: 'Support', route: '/support', icon: 'help-circle-outline', hint: 'Help & incidents' },
    ],
  },
  {
    id: 'advanced',
    title: 'Advanced',
    items: [
      { label: 'Demand heatmap', route: '/driver/heatmap', icon: 'flame', hint: 'High-demand areas' },
      { label: 'Challenges & badges', route: '/driver/challenges', icon: 'ribbon', hint: 'Gamification' },
    ],
  },
];

const RIDER_SECTIONS: HubSection[] = [
  {
    id: 'wallet',
    title: 'Wallet & payments',
    items: [
      { label: 'Wallet', route: '/(rider-tabs)/rider-wallet', icon: 'wallet', hint: 'Balance & top-up' },
      { label: 'Promo code', route: '/promo-code', icon: 'pricetag', hint: 'Apply a code' },
      { label: 'Split fare', route: '/rider/split-fare', icon: 'people', hint: 'Share cost' },
    ],
  },
  {
    id: 'community',
    title: 'Community',
    items: [
      { label: 'Stories', route: '/stories', icon: 'book', hint: 'Community feed' },
      { label: 'Favorite drivers', route: '/rider/favorite-drivers', icon: 'heart', hint: 'Preferred drivers' },
    ],
  },
  {
    id: 'convenience',
    title: 'Convenience',
    items: [
      { label: 'Book (full options)', route: '/rider/book', icon: 'options', hint: 'Gate code & mood' },
      { label: 'Mood preferences', route: '/rider/mood-preferences', icon: 'happy', hint: 'Ride vibe' },
      { label: 'Schedule a ride', route: '/rider/schedule', icon: 'calendar', hint: 'Advance booking' },
      { label: 'Family & sharing', route: '/rider/family', icon: 'home', hint: 'Household' },
    ],
  },
  {
    id: 'legal',
    title: 'Legal & safety records',
    items: [
      { label: 'NEXRYDE Shield', route: '/shield-disputes', icon: 'shield-checkmark', hint: 'Protection' },
      { label: 'Support', route: '/support', icon: 'chatbubbles', hint: 'Help center' },
      { label: 'Trip history', route: '/(rider-tabs)/rider-trips', icon: 'time', hint: 'Receipts & past trips' },
    ],
  },
];

export type FeatureHubDrawerProps = {
  visible: boolean;
  onClose: () => void;
  role: HubRole;
};

export function FeatureHubDrawer({ visible, onClose, role }: FeatureHubDrawerProps) {
  const router = useRouter();
  const sections = useMemo(() => (role === 'driver' ? DRIVER_SECTIONS : RIDER_SECTIONS), [role]);

  const navigate = (route: string) => {
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onClose();
    router.push(route as any);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={e => e.stopPropagation()}>
          <View style={styles.grab}>
            <View style={styles.grabBar} />
          </View>
          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.sheetTitle}>NEXRYDE hub</Text>
              <Text style={styles.sheetSubtitle}>
                {role === 'driver' ? 'Community, tools & more' : 'Wallet, convenience & records'}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityLabel="Close menu">
              <Ionicons name="close" size={22} color={COLORS.lightTextPrimary} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            {sections.map(section => (
              <View key={section.id} style={styles.section}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
                {section.items.map(item => (
                  <TouchableOpacity
                    key={item.route + item.label}
                    style={styles.row}
                    onPress={() => navigate(item.route)}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel={item.label}
                  >
                    <View style={[styles.rowIcon, { backgroundColor: `${BRAND.accentCyan}18` }]}>
                      <Ionicons name={item.icon} size={22} color={BRAND.navyDeep} />
                    </View>
                    <View style={styles.rowText}>
                      <Text style={styles.rowLabel}>{item.label}</Text>
                      {item.hint ? <Text style={styles.rowHint}>{item.hint}</Text> : null}
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={COLORS.lightTextMuted} />
                  </TouchableOpacity>
                ))}
              </View>
            ))}
            <Text style={styles.footerNote}>
              Primary tasks stay on Home & bottom tabs. This menu groups everything else in one place.
            </Text>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(10, 14, 39, 0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '90%',
    backgroundColor: COLORS.lightBackground,
    borderTopLeftRadius: BORDER_RADIUS.xxl,
    borderTopRightRadius: BORDER_RADIUS.xxl,
    paddingBottom: SPACING.xl,
    borderTopWidth: 2,
    borderTopColor: 'rgba(0, 217, 255, 0.28)',
    ...SHADOWS.xl,
  },
  grab: { alignItems: 'center', paddingTop: SPACING.sm },
  grabBar: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.gray300,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightBorder,
  },
  sheetTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '800',
    color: BRAND.navyDeep,
  },
  sheetSubtitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.lightTextSecondary,
    marginTop: 2,
  },
  closeBtn: {
    minWidth: LAYOUT.touchMin,
    minHeight: LAYOUT.touchMin,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.lightSurface,
  },
  scroll: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.huge,
  },
  section: { marginBottom: SPACING.lg },
  sectionTitle: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '800',
    color: COLORS.lightTextMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: SPACING.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
    minHeight: LAYOUT.touchMin,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  rowText: { flex: 1 },
  rowLabel: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.lightTextPrimary,
  },
  rowHint: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    color: COLORS.lightTextMuted,
    marginTop: 2,
  },
  footerNote: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.lightTextMuted,
    lineHeight: 18,
    marginTop: SPACING.md,
    marginBottom: SPACING.lg,
  },
});

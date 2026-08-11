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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS, useThemeColors } from '@/src/constants/theme';
import { BRAND, LAYOUT, SURFACE } from '@/src/constants/designSystem';
import { useFlowLayout } from '@/src/constants/flowLayout';

type HubRole = 'driver' | 'rider';

type HubItem = {
  label: string;
  hint?: string;
  route: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
};

type HubSection = { id: string; title: string; items: HubItem[] };

/** Trip-critical tools only — social / wellness live behind Settings or deep links. */
const DRIVER_SECTIONS: HubSection[] = [
  {
    id: 'ride_alerts',
    title: 'Ride alerts',
    items: [
      {
        label: 'Offer ringtone',
        route: '/driver/offer-ringtone',
        icon: 'musical-notes',
        hint: 'Pick a sound for new ride requests',
      },
    ],
  },
  {
    id: 'account',
    title: 'Account & payments',
    items: [
      { label: 'Bank details', route: '/driver/bank', icon: 'business-outline', hint: 'Where riders transfer your fares' },
      { label: 'Subscription', route: '/driver/subscription', icon: 'card-outline', hint: 'Plan & billing' },
    ],
  },
  {
    id: 'earn',
    title: 'Earn more',
    items: [
      { label: 'Demand heatmap', route: '/driver/heatmap', icon: 'flame', hint: 'High-demand areas' },
      { label: 'Work zone', route: '/driver/work-zone', icon: 'map', hint: 'Preferred areas' },
    ],
  },
  {
    id: 'legal',
    title: 'Safety & support',
    items: [
      { label: 'NEXRYDE Shield', route: '/shield-disputes', icon: 'shield', hint: 'Disputes & records' },
      { label: 'Support & incidents', route: '/support', icon: 'document-text', hint: 'Help & reports' },
    ],
  },
];

const RIDER_SECTIONS: HubSection[] = [
  {
    id: 'payments',
    title: 'Payments',
    items: [
      { label: 'Split fare', route: '/rider/split-fare', icon: 'people', hint: 'Share cost' },
    ],
  },
  {
    id: 'rides',
    title: 'Rides',
    items: [
      { label: 'Schedule a ride', route: '/rider/schedule', icon: 'calendar', hint: 'Advance booking' },
      { label: 'Favourite drivers', route: '/rider/favorite-drivers', icon: 'heart-circle', hint: 'Book trusted drivers' },
      { label: 'Saved places', route: '/rider/saved-places', icon: 'bookmark', hint: 'Home, work & more' },
      { label: 'Trip history', route: '/(rider-tabs)/rider-trips', icon: 'time', hint: 'Receipts & past trips' },
    ],
  },
  {
    id: 'legal',
    title: 'Safety & support',
    items: [
      { label: 'NEXRYDE Shield', route: '/shield-disputes', icon: 'shield-checkmark', hint: 'Protection' },
      { label: 'Support', route: '/support', icon: 'chatbubbles', hint: 'Help center' },
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
  const insets = useSafeAreaInsets();
  const flow = useFlowLayout();
  const { colors, isDark } = useThemeColors();
  const sections = useMemo(() => (role === 'driver' ? DRIVER_SECTIONS : RIDER_SECTIONS), [role]);

  const sheetBg = isDark ? SURFACE.cardDark : colors.background;
  const rowBg = isDark ? SURFACE.glassSoft : colors.card;
  const border = isDark ? SURFACE.hairline : colors.border;
  const muted = colors.textMuted;
  const titleColor = colors.text;
  const iconTint = isDark ? BRAND.primary : BRAND.navyDeep;

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
        <Pressable
          style={[
            styles.sheet,
            {
              width: '100%',
              maxWidth: flow.maxContentWidth,
              alignSelf: 'center',
              paddingBottom: SPACING.xl + insets.bottom,
              backgroundColor: sheetBg,
              borderTopColor: isDark ? 'rgba(34,225,128,0.22)' : 'rgba(0, 217, 255, 0.28)',
            },
          ]}
          onPress={e => e.stopPropagation()}
        >
          <View style={styles.grab}>
            <View style={[styles.grabBar, { backgroundColor: isDark ? '#475569' : colors.borderStrong }]} />
          </View>
          <View style={[styles.sheetHeader, { paddingHorizontal: flow.padH, borderBottomColor: border }]}>
            <View>
              <Text style={[styles.sheetTitle, { color: titleColor }]}>NEXRYDE hub</Text>
              <Text style={[styles.sheetSubtitle, { color: muted }]}>
                {role === 'driver'
                  ? 'Earnings, zones & support'
                  : 'Rides, payments & support'}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.closeBtn, { backgroundColor: isDark ? SURFACE.glassSoft : colors.surface }]}
              accessibilityLabel="Close menu"
            >
              <Ionicons name="close" size={22} color={titleColor} />
            </TouchableOpacity>
          </View>
          <ScrollView
            contentContainerStyle={[
              styles.scroll,
              {
                paddingHorizontal: flow.padH,
                paddingTop: Math.round(flow.sectionGap * 0.65),
                paddingBottom: SPACING.huge,
                gap: flow.sectionGap * 0.35,
              },
            ]}
            showsVerticalScrollIndicator={false}
          >
            {sections.map(section => (
              <View key={section.id} style={[styles.section, { marginBottom: flow.sectionGap }]}>
                <Text style={[styles.sectionTitle, { color: muted }]}>{section.title}</Text>
                {section.items.map(item => (
                  <TouchableOpacity
                    key={item.route + item.label}
                    style={[
                      styles.row,
                      {
                        minHeight: flow.rowMinHeight,
                        paddingVertical: SPACING.md,
                        backgroundColor: rowBg,
                        borderColor: border,
                      },
                    ]}
                    onPress={() => navigate(item.route)}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel={item.label}
                  >
                    <View style={[styles.rowIcon, { backgroundColor: `${BRAND.accentCyan}18` }]}>
                      <Ionicons name={item.icon} size={22} color={iconTint} />
                    </View>
                    <View style={styles.rowText}>
                      <Text style={[styles.rowLabel, { color: titleColor }]}>{item.label}</Text>
                      {item.hint ? <Text style={[styles.rowHint, { color: muted }]}>{item.hint}</Text> : null}
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={muted} />
                  </TouchableOpacity>
                ))}
              </View>
            ))}
            <Text style={[styles.footerNote, { color: muted }]}>
              Primary tasks stay on Home & bottom tabs. This menu groups the rest in one place.
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
    borderTopLeftRadius: BORDER_RADIUS.xxl,
    borderTopRightRadius: BORDER_RADIUS.xxl,
    borderTopWidth: 2,
    ...SHADOWS.xl,
  },
  grab: { alignItems: 'center', paddingTop: SPACING.sm },
  grabBar: {
    width: 44,
    height: 5,
    borderRadius: 3,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
  },
  sheetTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '800',
  },
  sheetSubtitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    marginTop: 2,
  },
  closeBtn: {
    minWidth: LAYOUT.touchMin,
    minHeight: LAYOUT.touchMin,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BORDER_RADIUS.lg,
  },
  scroll: {},
  section: {},
  sectionTitle: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: SPACING.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
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
  },
  rowHint: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    marginTop: 2,
  },
  footerNote: {
    fontSize: FONT_SIZE.xs,
    lineHeight: 18,
    marginTop: SPACING.md,
    marginBottom: SPACING.lg,
  },
});

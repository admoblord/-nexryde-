import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  COLORS,
  SPACING,
  FONT_SIZE,
  BORDER_RADIUS,
  SHADOWS,
  useThemeColors,
} from '@/src/constants/theme';
import { ProfileMergedPreferences } from '@/src/components/profile/ProfileMergedPreferences';
import { useAppStore } from '@/src/store/appStore';
import { useFlowLayout } from '@/src/constants/flowLayout';
import { useRequireUserOrLogin } from '@/src/hooks/useRequireUserOrLogin';

export default function SettingsScreen() {
  const router = useRouter();
  const authed = useRequireUserOrLogin();
  const insets = useSafeAreaInsets();
  const flow = useFlowLayout();
  const { colors } = useThemeColors();
  const { user } = useAppStore();
  const prefVariant = user?.role === 'driver' ? 'driver' : 'rider';

  if (!authed) {
    return null;
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: colors.border, paddingHorizontal: flow.padH }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backBtn, { backgroundColor: colors.card }]}
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingBottom: Math.max(insets.bottom, 24) + 16,
            paddingHorizontal: flow.padH,
            maxWidth: flow.maxContentWidth,
            alignSelf: 'center',
            width: '100%',
            gap: Math.round(flow.sectionGap * 0.75),
          },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.lead, { color: colors.textMuted }]}>
          Control how NEXRYDE behaves on this device. Changes apply right away.
        </Text>
        <View style={[styles.sectionCard, { backgroundColor: colors.card, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]}>
          <View style={styles.sectionHeaderRow}>
            <View style={[styles.sectionIcon, { backgroundColor: COLORS.accentGreenSoft }]}>
              <Ionicons name="options-outline" size={20} color={COLORS.accentGreen} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Preferences</Text>
              <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>
                Notifications, units, accessibility and more
              </Text>
            </View>
          </View>
          <ProfileMergedPreferences variant={prefVariant} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.sm,
  },
  title: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
  },
  scroll: {
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.md,
  },
  lead: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    lineHeight: 20,
    marginBottom: SPACING.md,
  },
  sectionCard: {
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
    ...SHADOWS.sm,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xs,
  },
  sectionIcon: {
    width: 36,
    height: 36,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '800',
  },
  sectionSubtitle: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    marginTop: 4,
    lineHeight: 16,
  },
});

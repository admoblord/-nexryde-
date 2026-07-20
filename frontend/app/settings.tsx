import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '@/src/constants/theme';
import { BRAND, RADIUS, SPACING, SURFACE, TYPOGRAPHY } from '@/src/constants/designSystem';
import { ProfileMergedPreferences } from '@/src/components/profile/ProfileMergedPreferences';
import { AppearanceSection } from '@/src/components/settings/AppearanceSection';
import { useAppStore } from '@/src/store/appStore';
import { useFlowLayout } from '@/src/constants/flowLayout';
import { useRequireUserOrLogin } from '@/src/hooks/useRequireUserOrLogin';

export default function SettingsScreen() {
  const router = useRouter();
  const authed = useRequireUserOrLogin();
  const insets = useSafeAreaInsets();
  const flow = useFlowLayout();
  const { colors, isDark } = useThemeColors();
  const { user } = useAppStore();
  const prefVariant = user?.role === 'driver' ? 'driver' : 'rider';

  if (!authed) {
    return null;
  }

  const border = isDark ? SURFACE.hairline : colors.border;
  const cardBg = isDark ? SURFACE.cardDark : colors.card;

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: isDark ? BRAND.bgDeep : colors.background }]}
      edges={['top']}
    >
      <StatusBar barStyle={colors.statusBar} backgroundColor={isDark ? BRAND.bgDeep : colors.background} />
      <View style={[styles.header, { borderBottomColor: border, paddingHorizontal: flow.padH }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backBtn, { backgroundColor: isDark ? SURFACE.tile : colors.card, borderColor: border }]}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Ionicons name="arrow-back" size={20} color={colors.text} />
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
            gap: SPACING.stack,
          },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.lead, { color: colors.textMuted }]}>
          Control how NexRyde behaves on this device. Changes apply right away.
        </Text>
        <AppearanceSection />
        <View style={[styles.sectionCard, { backgroundColor: cardBg, borderColor: border }]}>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionIcon}>
              <Ionicons name="options-outline" size={18} color={BRAND.primary} />
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
    paddingVertical: SPACING.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  title: {
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  scroll: {
    paddingTop: SPACING.md,
  },
  lead: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
  },
  sectionCard: {
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.stack,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  sectionIcon: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BRAND.primaryMuted,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.15,
  },
  sectionSubtitle: {
    ...TYPOGRAPHY.caption,
    marginTop: 3,
    lineHeight: 16,
  },
});

import React, { ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { BRAND, RADIUS, SCREEN, SPACING, SURFACE, TYPOGRAPHY } from '@/src/constants/designSystem';
import { ScreenBackdrop } from '@/src/components/ui/ScreenStructure';

type ScreenShellProps = {
  title: string;
  children: ReactNode;
  onBack?: () => void;
  headerRight?: ReactNode;
  scroll?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
  /** Optional eyebrow above the title (e.g. "DRIVER"). */
  eyebrow?: string;
};

/** Header + layout chrome that renders immediately — content area is children. */
export function ScreenShell({
  title,
  children,
  onBack,
  headerRight,
  scroll = true,
  contentContainerStyle,
  eyebrow,
}: ScreenShellProps) {
  const router = useRouter();
  const handleBack = onBack ?? (() => router.back());

  const body = scroll ? (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.bodyFill, contentContainerStyle]}>{children}</View>
  );
  // Note: horizontal page pad is owned by each screen (flow.padH) so we don't double-pad.

  return (
    <ScreenBackdrop>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleBack}
            activeOpacity={0.82}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={22} color={BRAND.textPrimary} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
            <Text style={styles.headerTitle} numberOfLines={1}>
              {title}
            </Text>
          </View>
          <View style={styles.headerRight}>{headerRight ?? <View style={styles.headerSpacer} />}</View>
        </View>
        {body}
      </SafeAreaView>
    </ScreenBackdrop>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SCREEN.headerPadH,
    paddingVertical: SCREEN.headerPadV,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SURFACE.hairline,
  },
  backButton: {
    width: SCREEN.iconBtn,
    height: SCREEN.iconBtn,
    borderRadius: RADIUS.md,
    backgroundColor: SURFACE.tile,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SURFACE.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    gap: 2,
  },
  eyebrow: {
    ...TYPOGRAPHY.label,
    color: BRAND.primary,
    textTransform: 'uppercase',
  },
  headerTitle: {
    ...TYPOGRAPHY.title,
    color: BRAND.textPrimary,
    letterSpacing: -0.35,
  },
  headerRight: {
    minWidth: SCREEN.iconBtn,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  headerSpacer: { width: SCREEN.iconBtn, height: SCREEN.iconBtn },
  scrollContent: {
    paddingTop: SPACING.md,
    paddingBottom: SPACING.bottomGutter,
  },
  bodyFill: {
    flex: 1,
  },
});

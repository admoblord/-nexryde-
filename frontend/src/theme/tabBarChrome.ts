/**
 * Shared tab-bar chrome for driver + rider tabs — one structure, both roles.
 */
import { StyleSheet, type TextStyle, type ViewStyle } from 'react-native';
import { BRAND, RADIUS, SPACING } from '@/src/constants/designSystem';
import { FONT_SIZE, SHADOWS, tabIconActivePillBg } from '@/src/constants/theme';
import { TAB_BAR_HEIGHT } from '@/src/hooks/useBottomPad';

type ThemeColors = {
  surface: string;
  border: string;
  textMuted: string;
};

export function buildTabScreenOptions(opts: {
  colors: ThemeColors;
  isDark: boolean;
  bottomInset: number;
  /** When true, hide the tab bar entirely (driver online map). */
  hidden?: boolean;
}) {
  const { colors, isDark, bottomInset, hidden } = opts;
  return {
    headerShown: false as const,
    tabBarActiveTintColor: BRAND.primary,
    tabBarInactiveTintColor: colors.textMuted,
    tabBarHideOnKeyboard: true,
    tabBarStyle: hidden
      ? ({ display: 'none' as const } satisfies ViewStyle)
      : ({
          backgroundColor: colors.surface,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
          height: TAB_BAR_HEIGHT + bottomInset,
          paddingBottom: bottomInset + 6,
          paddingTop: 10,
          ...(isDark ? SHADOWS.lg : SHADOWS.md),
        } satisfies ViewStyle),
    tabBarLabelStyle: {
      fontSize: FONT_SIZE.xxs,
      fontWeight: '700' as const,
      letterSpacing: 0.2,
      marginTop: 2,
    } satisfies TextStyle,
  };
}

export function tabIconPillStyle(focused: boolean, isDark: boolean): ViewStyle {
  return {
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    height: 32,
    borderRadius: RADIUS.md,
    backgroundColor: focused ? tabIconActivePillBg(isDark) : 'transparent',
  };
}

export const tabBadgeStyles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -5,
    right: -6,
    minWidth: 17,
    height: 17,
    borderRadius: RADIUS.full,
    backgroundColor: BRAND.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: BRAND.white,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: BRAND.white,
    letterSpacing: -0.2,
  },
});

export { SPACING as TAB_SPACING };

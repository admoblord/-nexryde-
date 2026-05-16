import { useMemo } from 'react';
import { COLORS, useThemeColors } from '@/src/constants/theme';

/** Shared light/dark surfaces for auth onboarding screens (terms, profile, status). */
export function useOnboardingSurfaces() {
  const { colors, isDark } = useThemeColors();

  return useMemo(
    () => ({
      isDark,
      screen: colors.background,
      card: colors.card,
      header: colors.card,
      text: colors.text,
      textSecondary: colors.textSecondary,
      textMuted: colors.textMuted,
      border: colors.border,
      accent: COLORS.accentGreen,
    }),
    [colors, isDark],
  );
}

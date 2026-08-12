/**
 * NEXRYDE Live Tracking — light trip theme.
 *
 * Rider live screens sit on the pale Bolt map. Chrome is white, text is navy,
 * and primary actions are lime with navy labels (white on lime fails contrast).
 */
import type { ViewStyle } from 'react-native';
import { alpha, colors, radius, shadow, space } from '@/src/theme/tokens';

export const LIVE = {
  bg: colors.bg,
  mapBg: colors.bgMuted,
  glass: colors.bg,
  glassSoft: colors.bgMuted,
  glassBorder: colors.border,
  hairline: colors.border,
  tile: colors.bgMuted,
  green: colors.green,
  greenBright: colors.greenLight,
  greenGlow: alpha.greenSoft,
  greenSoft: alpha.greenSoft,
  greenInk: colors.textOnGreen,
  text: colors.textPrimary,
  sub: colors.textSecondary,
  faint: colors.textTertiary,
  gold: colors.amber,
  red: colors.red,
  redSoft: alpha.redSoft,
  blue: colors.blue,
  radiusXl: radius.sheet,
  radius: radius.card,
  radiusSm: radius.button,
  radiusPill: radius.pill,
  pad: space.lg,
  gap: space.md,
  edge: space.lg,
} as const;

export const liveGlassCard: ViewStyle = {
  backgroundColor: LIVE.glass,
  borderRadius: LIVE.radius,
  borderWidth: 1,
  borderColor: LIVE.hairline,
  ...shadow,
};

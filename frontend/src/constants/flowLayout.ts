import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import { LAYOUT } from '@/src/constants/designSystem';
import { SPACING } from '@/src/constants/theme';

/** Readable column width on tablets / large phones. */
export const FLOW_MAX_CONTENT_WIDTH = 560;
/** Wider readable column when running as a real iPad idiom layout. */
export const FLOW_MAX_CONTENT_WIDTH_TABLET = 720;

export type FlowLayout = {
  width: number;
  height: number;
  /** Horizontal inset for screen edges — scales gently with width. */
  padH: number;
  /** Vertical rhythm between major blocks. */
  sectionGap: number;
  /** Inner padding for cards and sheets. */
  cardPad: number;
  /** Minimum list row / tappable row height. */
  rowMinHeight: number;
  maxContentWidth: number;
  /** True when the window is tablet-sized (iPad / large foldables). */
  isTablet: boolean;
};

/**
 * Responsive layout for tab stacks, drawers, and long-form screens.
 * Keeps comfortable margins on phones and centered readable columns on iPad.
 */
export function useFlowLayout(): FlowLayout {
  const { width, height } = useWindowDimensions();
  return useMemo(() => {
    const isTablet = Math.min(width, height) >= 768 || width >= 900;
    const padH = isTablet
      ? Math.min(48, Math.max(28, Math.round(width * 0.04)))
      : Math.min(30, Math.max(18, Math.round(width * 0.056)));
    const sectionGap = isTablet ? 32 : width >= 420 ? 28 : width >= 380 ? 24 : 20;
    const cardPad = isTablet || width >= 400 ? SPACING.lg : SPACING.md;
    const rowMinHeight = Math.max(LAYOUT.touchMin, 52);
    return {
      width,
      height,
      padH,
      sectionGap,
      cardPad,
      rowMinHeight,
      maxContentWidth: isTablet ? FLOW_MAX_CONTENT_WIDTH_TABLET : FLOW_MAX_CONTENT_WIDTH,
      isTablet,
    };
  }, [height, width]);
}

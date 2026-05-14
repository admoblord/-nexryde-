import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import { LAYOUT } from '@/src/constants/designSystem';
import { SPACING } from '@/src/constants/theme';

/** Readable column width on tablets / large phones in landscape. */
export const FLOW_MAX_CONTENT_WIDTH = 560;

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
};

/**
 * Responsive layout for tab stacks, drawers, and long-form screens.
 * Keeps comfortable margins on small phones and extra air on large ones.
 */
export function useFlowLayout(): FlowLayout {
  const { width, height } = useWindowDimensions();
  return useMemo(() => {
    const padH = Math.min(30, Math.max(18, Math.round(width * 0.056)));
    const sectionGap = width >= 420 ? 28 : width >= 380 ? 24 : 20;
    const cardPad = width >= 400 ? SPACING.lg : SPACING.md;
    const rowMinHeight = Math.max(LAYOUT.touchMin, 52);
    return {
      width,
      height,
      padH,
      sectionGap,
      cardPad,
      rowMinHeight,
      maxContentWidth: FLOW_MAX_CONTENT_WIDTH,
    };
  }, [height, width]);
}

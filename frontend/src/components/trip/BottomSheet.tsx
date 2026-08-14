/**
 * Floating trip sheet — white, 24pt top corners, drag handle, three snap points.
 *
 * The map stays visible behind and around it: the sheet never paints a full
 * opaque screen, and the map is expected to run to the bottom edge underneath.
 */
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Dimensions,
  PanResponder,
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { colors, radius, shadow, sheet as sheetTokens, space } from '@/src/theme/tokens';

export type SheetSnap = 'peek' | 'half' | 'full';

const SPRING = { useNativeDriver: false, friction: 9, tension: 70 } as const;

export function useSheetHeights(screenHeight?: number) {
  const h = screenHeight ?? Dimensions.get('window').height;
  return useMemo(
    () => ({
      peek: Math.round(h * sheetTokens.peek),
      half: Math.round(h * sheetTokens.half),
      full: Math.round(h * sheetTokens.full),
    }),
    [h],
  );
}

export function BottomSheet({
  snap = 'peek',
  onSnapChange,
  children,
  style,
  contentStyle,
  draggable = true,
  testID,
}: {
  snap?: SheetSnap;
  onSnapChange?: (next: SheetSnap) => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  draggable?: boolean;
  testID?: string;
}) {
  const heights = useSheetHeights();
  const height = useRef(new Animated.Value(heights[snap])).current;
  const current = useRef<SheetSnap>(snap);
  const startHeight = useRef<number>(heights[snap]);

  useEffect(() => {
    current.current = snap;
    Animated.spring(height, { toValue: heights[snap], ...SPRING }).start();
  }, [snap, heights, height]);

  const settle = useCallback(
    (h: number) => {
      const entries: [SheetSnap, number][] = [
        ['peek', heights.peek],
        ['half', heights.half],
        ['full', heights.full],
      ];
      let best = entries[0];
      for (const e of entries) {
        if (Math.abs(e[1] - h) < Math.abs(best[1] - h)) best = e;
      }
      current.current = best[0];
      Animated.spring(height, { toValue: best[1], ...SPRING }).start();
      onSnapChange?.(best[0]);
    },
    [heights, height, onSnapChange],
  );

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => draggable && Math.abs(g.dy) > 4,
        onPanResponderGrant: () => {
          startHeight.current = heights[current.current];
        },
        onPanResponderMove: (_e, g) => {
          // Drag up grows the sheet, so subtract dy.
          const next = Math.min(
            heights.full,
            Math.max(heights.peek * 0.6, startHeight.current - g.dy),
          );
          height.setValue(next);
        },
        onPanResponderRelease: (_e, g) => {
          const released = Math.min(
            heights.full,
            Math.max(heights.peek * 0.6, startHeight.current - g.dy),
          );
          // A decisive flick wins over raw position.
          if (g.vy < -0.6) return settle(heights.full);
          if (g.vy > 0.6) return settle(heights.peek);
          settle(released);
        },
      }),
    [draggable, heights, height, settle],
  );

  return (
    <Animated.View style={[styles.sheet, { height }, style]} testID={testID}>
      <View {...(draggable ? pan.panHandlers : {})} style={styles.handleZone}>
        <View style={styles.handle} />
      </View>
      <View style={[styles.content, contentStyle]}>{children}</View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    ...shadow,
    ...Platform.select({ android: { elevation: 12 }, default: {} }),
  },
  handleZone: { paddingTop: space.md, paddingBottom: space.sm, alignItems: 'center' },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border },
  content: { flex: 1, paddingHorizontal: space.xl },
});

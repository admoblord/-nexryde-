/**
 * Shimmer placeholder for genuine first loads only.
 *
 * A cached screen must render its cached content instead — never a skeleton on
 * a second visit. `SkeletonRow` takes `firstLoad` so call sites are forced to
 * state which case they are in.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, space } from '@/src/theme/tokens';

export function SkeletonRow({
  firstLoad,
  lines = 2,
  avatar = false,
  style,
}: {
  /** False when cached content exists — the row renders nothing. */
  firstLoad: boolean;
  lines?: number;
  avatar?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const pulse = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    if (!firstLoad) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [firstLoad, pulse]);

  if (!firstLoad) return null;

  return (
    <View style={[styles.row, style]} accessibilityRole="progressbar">
      {avatar ? <Animated.View style={[styles.avatar, { opacity: pulse }]} /> : null}
      <View style={styles.stack}>
        {Array.from({ length: lines }).map((_, i) => (
          <Animated.View
            key={i}
            style={[styles.line, i === lines - 1 ? styles.lineShort : null, { opacity: pulse }]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.md },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.bgMuted, marginRight: space.md },
  stack: { flex: 1 },
  line: { height: 12, borderRadius: radius.pill, backgroundColor: colors.bgMuted, marginBottom: space.sm },
  lineShort: { width: '55%', marginBottom: 0 },
});

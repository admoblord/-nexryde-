/** Small rounded status tag. amber = here/now, green = active, blue = in progress, grey = idle. */
import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { alpha, colors, radius, space, type } from '@/src/theme/tokens';

export type StatusTone = 'amber' | 'green' | 'blue' | 'grey';

const TONES: Record<StatusTone, { fg: string; bg: string }> = {
  amber: { fg: colors.amber, bg: alpha.amberSoft },
  green: { fg: colors.greenDark, bg: alpha.greenSoft },
  blue: { fg: colors.blue, bg: alpha.blueSoft },
  grey: { fg: colors.textTertiary, bg: alpha.navySoft },
};

export function StatusPill({
  label,
  tone = 'grey',
  dot = true,
  style,
}: {
  label: string;
  tone?: StatusTone;
  dot?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = TONES[tone];
  return (
    <View style={[styles.pill, { backgroundColor: t.bg }, style]} accessibilityRole="text">
      {dot ? <View style={[styles.dot, { backgroundColor: t.fg }]} /> : null}
      <Text style={[styles.label, { color: t.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: 5,
  },
  dot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  label: { ...type.label },
});

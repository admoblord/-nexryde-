/**
 * Trip buttons — Primary / Secondary / Danger.
 *
 * Primary is lime with navy text. White on lime measures ~2.1:1 and fails
 * accessibility, so the label colour is fixed to `colors.textOnGreen` and is
 * deliberately not overridable.
 */
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, radius, space, type } from '@/src/theme/tokens';

type Props = {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
};

const HEIGHT = 56;

function Base({
  label,
  onPress,
  disabled,
  loading,
  icon,
  style,
  accessibilityLabel,
  testID,
  bg,
  fg,
  borderColor,
}: Props & { bg: string; fg: string; borderColor?: string }) {
  const isOff = Boolean(disabled || loading);
  return (
    <Pressable
      onPress={isOff ? undefined : onPress}
      disabled={isOff}
      accessibilityRole="button"
      accessibilityState={{ disabled: isOff, busy: Boolean(loading) }}
      accessibilityLabel={accessibilityLabel || label}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: bg },
        borderColor ? { borderWidth: 1, borderColor } : null,
        pressed && !isOff ? styles.pressed : null,
        isOff ? styles.disabled : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.row}>
          {icon ? <Ionicons name={icon} size={20} color={fg} style={styles.icon} /> : null}
          <Text style={[styles.label, { color: fg }]} numberOfLines={1}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

export function PrimaryButton(props: Props) {
  return <Base {...props} bg={colors.green} fg={colors.textOnGreen} />;
}

export function SecondaryButton(props: Props) {
  return <Base {...props} bg={colors.bg} fg={colors.navy} borderColor={colors.navy} />;
}

export function DangerButton(props: Props) {
  return <Base {...props} bg={colors.bg} fg={colors.red} borderColor={colors.red} />;
}

const styles = StyleSheet.create({
  base: {
    height: HEIGHT,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    width: '100%',
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  icon: { marginRight: space.sm },
  label: { ...type.bodyBold },
  pressed: { opacity: 0.88, transform: [{ scale: 0.995 }] },
  disabled: { opacity: 0.45 },
});

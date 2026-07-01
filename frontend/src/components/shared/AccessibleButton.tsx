/**
 * Accessible, animated button that enforces:
 *  - minimum 44px touch target (Apple HIG / Material Design)
 *  - accessibilityRole="button"
 *  - accessible={true} by default
 *  - scale animation on press (consistent with design system)
 *  - haptic feedback matching the action severity
 *
 * Replace raw <TouchableOpacity> in all CTA / action buttons for A11y score.
 */
import React, { useCallback, useRef } from 'react';
import {
  Animated,
  StyleProp,
  StyleSheet,
  TouchableOpacity,
  ViewStyle,
  AccessibilityRole,
} from 'react-native';
import { haptics } from '@/src/utils/haptics';
import { SPACING, ANIMATION } from '@/src/constants/designSystem';

type HapticLevel = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' | 'none';

type Props = {
  onPress: () => void;
  onLongPress?: () => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  accessibilityLabel: string;
  accessibilityHint?: string;
  accessibilityRole?: AccessibilityRole;
  haptic?: HapticLevel;
  testID?: string;
  activeOpacity?: number;
};

export function AccessibleButton({
  onPress,
  onLongPress,
  children,
  style,
  disabled = false,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole = 'button',
  haptic = 'light',
  testID,
  activeOpacity = 0.88,
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(() => {
    Animated.spring(scale, {
      toValue: ANIMATION.pressScale,
      ...ANIMATION.springConfig,
    }).start();
  }, [scale]);

  const handlePressOut = useCallback(() => {
    Animated.spring(scale, {
      toValue: 1,
      ...ANIMATION.springConfig,
    }).start();
  }, [scale]);

  const handlePress = useCallback(() => {
    if (haptic !== 'none') {
      haptics[haptic]();
    }
    onPress();
  }, [haptic, onPress]);

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <TouchableOpacity
        onPress={handlePress}
        onLongPress={onLongPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
        accessible={true}
        accessibilityRole={accessibilityRole}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled }}
        activeOpacity={activeOpacity}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        testID={testID}
        style={styles.minTouch}
      >
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  minTouch: {
    minHeight: SPACING.touchMin,
    minWidth: SPACING.touchMin,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

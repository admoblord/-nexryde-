import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { NEXRYDE_BRAND, type NexrydeBrandTheme } from '@/src/constants/nexrydeBrand';

type Props = {
  theme?: NexrydeBrandTheme;
  /** Hero screens (login, splash) use a larger wordmark. */
  size?: 'default' | 'large';
};

export function NexrydeWordmark({ theme = 'light', size = 'default' }: Props) {
  return (
    <Text
      style={[
        styles.wordmark,
        size === 'large' && styles.large,
        theme === 'light' ? styles.light : styles.dark,
      ]}
      accessibilityRole="header"
    >
      {NEXRYDE_BRAND.name}
    </Text>
  );
}

const styles = StyleSheet.create({
  wordmark: {
    fontSize: NEXRYDE_BRAND.wordmark.fontSize,
    fontWeight: NEXRYDE_BRAND.wordmark.fontWeight,
    letterSpacing: NEXRYDE_BRAND.wordmark.letterSpacing,
  },
  large: {
    fontSize: 32,
    letterSpacing: 0.8,
  },
  light: {
    color: NEXRYDE_BRAND.green,
  },
  dark: {
    color: '#F8FAFC',
  },
});

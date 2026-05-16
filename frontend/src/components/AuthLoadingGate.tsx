import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, useThemeColors } from '@/src/constants/theme';

/** Full-screen spinner while session hydrates or redirect to login runs. */
export function AuthLoadingGate() {
  const { colors } = useThemeColors();
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ActivityIndicator size="large" color={COLORS.accentGreen} />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});

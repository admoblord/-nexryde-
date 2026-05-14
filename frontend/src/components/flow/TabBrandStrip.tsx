import React from 'react';
import { View, StyleSheet } from 'react-native';
import { DriverBrandHeaderRow } from '@/src/components/driver/DriverBrandChrome';
import { RiderBrandHeaderRow } from '@/src/components/rider/RiderBrandChrome';

/**
 * Shared NEXRYDE + role pill for main tab stacks (offline driver home uses its own header).
 * Use with SafeAreaView `edges={['top']}` and pass `topInset={0}` so safe area is not doubled.
 */
export function TabBrandStrip({ role }: { role: 'driver' | 'rider' }) {
  return (
    <View style={styles.wrap}>
      {role === 'driver' ? (
        <DriverBrandHeaderRow topInset={0} />
      ) : (
        <RiderBrandHeaderRow topInset={0} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
  },
});

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { NEXRYDE_BRAND } from '@/src/constants/nexrydeBrand';

type Props = {
  size?: number;
};

/** Standard NEXRYDE mark — green circle + car icon (all surfaces). */
export function NexrydeLogo({ size = NEXRYDE_BRAND.logo.size }: Props) {
  const iconSize = Math.round(size * 0.5);
  const radius = size / 2;

  return (
    <LinearGradient
      colors={[NEXRYDE_BRAND.green, NEXRYDE_BRAND.greenEnd]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.circle, { width: size, height: size, borderRadius: radius }]}
    >
      <Ionicons name="car-sport" size={iconSize} color="#FFFFFF" />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

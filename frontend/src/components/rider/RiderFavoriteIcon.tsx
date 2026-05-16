/**
 * Branded favourite-driver icon — gradient heart with optional online ring.
 */
import React from 'react';
import { View, StyleSheet, TouchableOpacity, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { RIDER_FAV_GRADIENT } from '@/src/constants/riderFavorites';

type Props = {
  size?: number;
  filled?: boolean;
  online?: boolean;
  style?: ViewStyle;
  onPress?: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
};

export function RiderFavoriteIcon({
  size = 40,
  filled = true,
  online,
  style,
  onPress,
  disabled,
  accessibilityLabel,
}: Props) {
  const inner = Math.round(size * 0.88);
  const iconSize = Math.round(size * 0.44);

  const innerNode = (
    <View style={[styles.wrap, { width: size, height: size }, style]}>
      {online ? <View style={[styles.onlineRing, { width: size + 6, height: size + 6, borderRadius: (size + 6) / 2 }]} /> : null}
      <LinearGradient
        colors={filled ? [...RIDER_FAV_GRADIENT] : ['rgba(148,163,184,0.35)', 'rgba(100,116,139,0.25)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.grad, { width: inner, height: inner, borderRadius: inner * 0.32 }]}
      >
        <Ionicons
          name={filled ? 'heart' : 'heart-outline'}
          size={iconSize}
          color={filled ? '#FFF' : '#E2E8F0'}
        />
      </LinearGradient>
    </View>
  );

  if (!onPress) return innerNode;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={
        accessibilityLabel ?? (filled ? 'Remove from favourites' : 'Add to favourites')
      }
    >
      {innerNode}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  onlineRing: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#22C55E',
  },
  grad: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#EC4899',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
});

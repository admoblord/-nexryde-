import React from 'react';
import { View, StyleSheet, Platform, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import {
  RIDER_SAVED_SLOT_META,
  type RiderSavedSlot,
} from '@/src/services/riderSavedPlaces';

/** Rich gradients per slot — filled = jewel tone, empty = soft porcelain. */
const SLOT_GRADIENT: Record<
  RiderSavedSlot,
  { filled: [string, string, string]; empty: [string, string] }
> = {
  home: { filled: ['#5EEAD4', '#22C55E', '#064E3B'], empty: ['#F8FAFC', '#E8EEF4'] },
  work: { filled: ['#93C5FD', '#2563EB', '#172554'], empty: ['#F8FAFC', '#E8EEF4'] },
  gym: { filled: ['#D8B4FE', '#9333EA', '#4C1D95'], empty: ['#F8FAFC', '#E8EEF4'] },
  favorite: { filled: ['#FDE68A', '#F59E0B', '#78350F'], empty: ['#F8FAFC', '#E8EEF4'] },
};

const ION = {
  home: { filled: 'home' as const, empty: 'home-outline' as const },
  work: { filled: 'briefcase' as const, empty: 'briefcase-outline' as const },
  gym: { filled: 'barbell' as const, empty: 'barbell-outline' as const },
  favorite: { filled: 'star' as const, empty: 'star-outline' as const },
};

export type RiderSavedSlotIconSize = 'md' | 'lg';

const DIMS: Record<RiderSavedSlotIconSize, { outer: number; radius: number; icon: number }> = {
  md: { outer: 44, radius: 14, icon: 22 },
  lg: { outer: 52, radius: 16, icon: 25 },
};

export function RiderSavedSlotPremiumIcon({
  slot,
  filled,
  size = 'md',
  style,
}: {
  slot: RiderSavedSlot;
  filled: boolean;
  size?: RiderSavedSlotIconSize;
  style?: StyleProp<ViewStyle>;
}) {
  const meta = RIDER_SAVED_SLOT_META[slot];
  const g = SLOT_GRADIENT[slot];
  const { outer, radius, icon } = DIMS[size];
  const ion = filled ? ION[slot].filled : ION[slot].empty;
  const iconColor = filled ? '#FFFFFF' : '#64748B';

  return (
    <View
      style={[
        styles.orb,
        {
          width: outer,
          height: outer,
          borderRadius: radius,
          shadowColor: filled ? meta.color : '#0F172A',
          shadowOpacity: filled ? (Platform.OS === 'android' ? 0.32 : 0.38) : 0.12,
          shadowRadius: filled ? 10 : 4,
          shadowOffset: { width: 0, height: filled ? 5 : 2 },
          elevation: filled ? 6 : 2,
        },
        !filled && styles.orbEmpty,
        style,
      ]}
    >
      <LinearGradient
        colors={filled ? g.filled : g.empty}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.95, y: 1 }}
        style={[styles.grad, { borderRadius: radius }]}
      >
        <LinearGradient
          colors={['rgba(255,255,255,0.5)', 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0)']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={[styles.shine, { borderTopLeftRadius: radius, borderTopRightRadius: radius }]}
          pointerEvents="none"
        />
        {filled ? (
          <View
            style={[styles.rim, { borderRadius: radius }]}
            pointerEvents="none"
          />
        ) : null}
        <Ionicons
          name={ion}
          size={icon}
          color={iconColor}
          style={filled ? styles.iconGlow : undefined}
        />
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  orb: {
    overflow: 'hidden',
  },
  orbEmpty: {
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: 'rgba(148,163,184,0.45)',
  },
  grad: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  shine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '48%',
  },
  rim: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  iconGlow: {
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});

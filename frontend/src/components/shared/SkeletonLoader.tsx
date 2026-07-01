/**
 * Reusable skeleton loading components for all major screens.
 * Uses a pulsing animation that mirrors Uber/Bolt loading patterns.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, ViewStyle } from 'react-native';

const SKELETON_BASE = '#1E293B';
const SKELETON_HIGHLIGHT = '#2D3F55';

function useSkeletonPulse(delay = 0) {
  const opacity = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [opacity, delay]);
  return opacity;
}

interface SkeletonBoxProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
  delay?: number;
}

export const SkeletonBox: React.FC<SkeletonBoxProps> = ({
  width = '100%',
  height = 16,
  borderRadius = 8,
  style,
  delay = 0,
}) => {
  const opacity = useSkeletonPulse(delay);
  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height,
          borderRadius,
          backgroundColor: SKELETON_BASE,
          opacity,
        },
        style,
      ]}
    />
  );
};

// ─── Screen-level skeletons ────────────────────────────────────────────────────

export const WalletScreenSkeleton: React.FC = () => (
  <View style={styles.container}>
    {/* Balance card */}
    <SkeletonBox height={140} borderRadius={20} style={{ marginBottom: 16 }} />
    {/* Top-up row */}
    <View style={styles.row}>
      <SkeletonBox width="48%" height={52} borderRadius={14} />
      <SkeletonBox width="48%" height={52} borderRadius={14} />
    </View>
    {/* Transaction list */}
    {[0, 1, 2, 3, 4].map((i) => (
      <View key={i} style={[styles.row, { marginTop: 12, alignItems: 'center' }]}>
        <SkeletonBox width={44} height={44} borderRadius={22} delay={i * 80} />
        <View style={{ flex: 1, marginLeft: 12, gap: 6 }}>
          <SkeletonBox height={14} width="60%" borderRadius={6} delay={i * 80} />
          <SkeletonBox height={12} width="40%" borderRadius={6} delay={i * 80 + 100} />
        </View>
        <SkeletonBox width={64} height={14} borderRadius={6} delay={i * 80} />
      </View>
    ))}
  </View>
);

export const TripHistorySkeleton: React.FC = () => (
  <View style={styles.container}>
    {[0, 1, 2, 3].map((i) => (
      <View key={i} style={[styles.card, { marginBottom: 12 }]}>
        <View style={[styles.row, { marginBottom: 10 }]}>
          <SkeletonBox width={36} height={36} borderRadius={18} delay={i * 100} />
          <View style={{ flex: 1, marginLeft: 10, gap: 6 }}>
            <SkeletonBox height={14} width="70%" borderRadius={6} delay={i * 100} />
            <SkeletonBox height={12} width="45%" borderRadius={6} delay={i * 100 + 80} />
          </View>
          <SkeletonBox width={56} height={20} borderRadius={10} delay={i * 100} />
        </View>
        <SkeletonBox height={1} borderRadius={0} style={{ backgroundColor: '#1E293B', marginBottom: 10 }} />
        <SkeletonBox height={12} width="90%" borderRadius={6} delay={i * 100 + 160} />
      </View>
    ))}
  </View>
);

export const ProfileScreenSkeleton: React.FC = () => (
  <View style={styles.container}>
    {/* Avatar */}
    <View style={{ alignItems: 'center', marginBottom: 24 }}>
      <SkeletonBox width={88} height={88} borderRadius={44} />
      <SkeletonBox height={16} width={140} borderRadius={8} style={{ marginTop: 12 }} />
      <SkeletonBox height={12} width={100} borderRadius={6} style={{ marginTop: 6 }} />
    </View>
    {/* Stats row */}
    <View style={styles.row}>
      {[0, 1, 2].map((i) => (
        <SkeletonBox key={i} width="30%" height={64} borderRadius={14} delay={i * 80} />
      ))}
    </View>
    {/* Menu items */}
    {[0, 1, 2, 3, 4].map((i) => (
      <View key={i} style={[styles.row, { marginTop: 14, alignItems: 'center' }]}>
        <SkeletonBox width={40} height={40} borderRadius={12} delay={i * 60} />
        <SkeletonBox width="60%" height={14} borderRadius={6} style={{ marginLeft: 12 }} delay={i * 60} />
      </View>
    ))}
  </View>
);

export const HomeScreenSkeleton: React.FC = () => (
  <View style={styles.container}>
    {/* Header */}
    <View style={[styles.row, { marginBottom: 20 }]}>
      <SkeletonBox width={48} height={48} borderRadius={24} />
      <SkeletonBox width={140} height={18} borderRadius={8} style={{ marginLeft: 12 }} />
    </View>
    {/* Search bar */}
    <SkeletonBox height={54} borderRadius={16} style={{ marginBottom: 20 }} />
    {/* Saved places */}
    <View style={styles.row}>
      <SkeletonBox width="48%" height={54} borderRadius={14} />
      <SkeletonBox width="48%" height={54} borderRadius={14} delay={80} />
    </View>
    {/* Promo card */}
    <SkeletonBox height={110} borderRadius={18} style={{ marginTop: 20 }} />
    {/* Recent trips */}
    <SkeletonBox height={14} width={140} borderRadius={6} style={{ marginTop: 24, marginBottom: 12 }} />
    {[0, 1].map((i) => (
      <View key={i} style={[styles.row, { marginTop: 12, alignItems: 'center' }]}>
        <SkeletonBox width={40} height={40} borderRadius={12} delay={i * 80} />
        <View style={{ flex: 1, marginLeft: 10, gap: 6 }}>
          <SkeletonBox height={14} width="65%" borderRadius={6} delay={i * 80} />
          <SkeletonBox height={12} width="45%" borderRadius={6} delay={i * 80 + 100} />
        </View>
      </View>
    ))}
  </View>
);

export const DriverHomeScreenSkeleton: React.FC = () => (
  <View style={styles.container}>
    {/* Toggle */}
    <SkeletonBox height={64} borderRadius={32} style={{ marginBottom: 20 }} />
    {/* Stats */}
    <View style={styles.row}>
      {[0, 1, 2].map((i) => (
        <SkeletonBox key={i} width="30%" height={80} borderRadius={16} delay={i * 80} />
      ))}
    </View>
    {/* Earnings */}
    <SkeletonBox height={120} borderRadius={20} style={{ marginTop: 20 }} />
    {/* Recent trips */}
    {[0, 1, 2].map((i) => (
      <View key={i} style={[styles.row, { marginTop: 14, alignItems: 'center' }]}>
        <SkeletonBox width={40} height={40} borderRadius={20} delay={i * 80} />
        <View style={{ flex: 1, marginLeft: 10, gap: 6 }}>
          <SkeletonBox height={14} width="55%" borderRadius={6} delay={i * 80} />
          <SkeletonBox height={12} width="40%" borderRadius={6} delay={i * 80 + 100} />
        </View>
        <SkeletonBox width={60} height={14} borderRadius={6} delay={i * 80} />
      </View>
    ))}
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#0A0F1E',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  card: {
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
});

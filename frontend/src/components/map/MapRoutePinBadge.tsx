/**
 * Bolt-style pickup/dropoff map badge — dark green rounded rect + pointer tail.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BOLT_ROUTE_GREEN } from '@/src/constants/boltMapStyle';

type Props = {
  title: string;
  subtitle: string;
  /** Visual variant — both use dark green per Bolt reference. */
  variant?: 'pickup' | 'dropoff';
};

export function MapRoutePinBadge({ title, subtitle, variant = 'pickup' }: Props) {
  return (
    <View style={styles.wrap} accessibilityRole="text">
      <View style={[styles.card, variant === 'dropoff' ? styles.cardDrop : null]}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={[styles.tail, variant === 'dropoff' ? styles.tailDrop : null]} />
    </View>
  );
}

const DROP_GREEN = '#0A6B3D';

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    marginBottom: 2,
  },
  card: {
    backgroundColor: BOLT_ROUTE_GREEN,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    minWidth: 72,
    maxWidth: 132,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  cardDrop: {
    backgroundColor: DROP_GREEN,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 13,
    fontWeight: '900',
    marginTop: 1,
    letterSpacing: -0.2,
  },
  tail: {
    width: 0,
    height: 0,
    marginTop: -1,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: BOLT_ROUTE_GREEN,
  },
  tailDrop: {
    borderTopColor: DROP_GREEN,
  },
});

export default MapRoutePinBadge;

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MAP } from '@/src/constants/nexrydeMapBehavior';

type Props = {
  count: number;
  size?: number;
};

export function MapClusterMarker({ count, size = 36 }: Props) {
  const color = count >= 8 ? '#EF4444' : count >= 4 ? '#F97316' : MAP.driverTaxi;
  return (
    <View
      style={[
        styles.wrap,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
      ]}
    >
      <Text style={styles.txt}>{count > 99 ? '99+' : count}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 5,
  },
  txt: { color: '#0F1419', fontSize: 13, fontWeight: '900' },
});

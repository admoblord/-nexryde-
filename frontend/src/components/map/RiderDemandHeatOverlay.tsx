/**
 * Soft Uber-style busy-area blush on the rider booking map (not driver heat pins).
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Circle, Marker } from 'react-native-maps';
import { getDemandZoneStyle, type HeatZonePoint } from '@/src/utils/driverHeatmapZones';

type Props = {
  zones: HeatZonePoint[];
  maxZones?: number;
  /** When true, show a small surge chip on the hottest zone. */
  showLabels?: boolean;
};

export function RiderDemandHeatOverlay({ zones, maxZones = 4, showLabels = true }: Props) {
  const top = zones
    .filter((z) => z.intensity >= 0.4)
    .slice(0, maxZones);
  if (!top.length) return null;

  return (
    <>
      {top.map((zone, i) => {
        const cfg = getDemandZoneStyle(zone.intensity);
        const center = { latitude: zone.lat, longitude: zone.lng };
        return (
          <React.Fragment key={`rider-demand-${zone.name}-${i}`}>
            <Circle
              center={center}
              radius={cfg.radius * 1.35}
              fillColor={cfg.mapColor.replace(/0\.\d+/, '0.08')}
              strokeColor="transparent"
              zIndex={1}
            />
            <Circle
              center={center}
              radius={cfg.radius * 0.85}
              fillColor={cfg.mapColor.replace(/0\.\d+/, '0.16')}
              strokeColor={cfg.ring}
              strokeWidth={1}
              zIndex={2}
            />
            {showLabels && i === 0 ? (
              <Marker coordinate={center} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false} zIndex={3}>
                <View style={[styles.chip, { borderColor: cfg.ring, backgroundColor: 'rgba(8,13,24,0.88)' }]}>
                  <View style={[styles.dot, { backgroundColor: cfg.color }]} />
                  <Text style={styles.chipTxt} numberOfLines={1}>
                    {zone.surge > 1.05 ? `${zone.surge.toFixed(1)}× busy` : 'Busy area'}
                  </Text>
                </View>
              </Marker>
            ) : null}
          </React.Fragment>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  chipTxt: { color: '#F8FAFC', fontSize: 10, fontWeight: '800', maxWidth: 110 },
});

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Marker, Circle } from 'react-native-maps';
import { getDemandZoneStyle, type HeatZonePoint } from '@/src/utils/driverHeatmapZones';

type Props = {
  zones: HeatZonePoint[];
  maxZones?: number;
};

/** Semi-transparent demand circles on the driver live map. */
export function DriverDemandHeatmapOverlay({ zones, maxZones = 6 }: Props) {
  const top = zones.slice(0, maxZones);
  if (!top.length) return null;

  return (
    <>
      {top.map((zone, i) => {
        const cfg = getDemandZoneStyle(zone.intensity);
        const center = { latitude: zone.lat, longitude: zone.lng };
        return (
          <React.Fragment key={`hm-${zone.name}-${i}`}>
            <Circle
              center={center}
              radius={cfg.radius * 1.5}
              fillColor={cfg.mapColor.replace(/0\.\d+/, '0.05')}
              strokeColor="transparent"
            />
            <Circle
              center={center}
              radius={cfg.radius}
              fillColor={cfg.mapColor}
              strokeColor={cfg.ring}
              strokeWidth={1.5}
            />
            <Marker coordinate={center} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
              <View style={[styles.pin, { backgroundColor: cfg.color }]}>
                <Text style={styles.pinText} numberOfLines={1}>
                  {zone.name.split(' ')[0]}
                </Text>
              </View>
            </Marker>
          </React.Fragment>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  pin: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  pinText: { color: '#fff', fontSize: 10, fontWeight: '800', maxWidth: 72 },
});

import React, { forwardRef } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, MapViewProps, Region } from 'react-native-maps';
import { COLORS } from '@/src/constants/theme';

interface NativeMapProps extends Omit<MapViewProps, 'ref'> {
  selectedLocation?: {
    latitude: number;
    longitude: number;
  } | null;
  onMapPress?: (event: any) => void;
}

const NativeMap = forwardRef<MapView, NativeMapProps>(({ 
  selectedLocation, 
  onMapPress,
  ...props 
}, ref) => {
  return (
    <MapView
      ref={ref}
      style={styles.map}
      provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
      onPress={onMapPress}
      showsUserLocation
      showsMyLocationButton={false}
      {...props}
    >
      {selectedLocation && (
        <Marker
          coordinate={{
            latitude: selectedLocation.latitude,
            longitude: selectedLocation.longitude,
          }}
          pinColor={COLORS.accentGreen}
        />
      )}
    </MapView>
  );
});

const styles = StyleSheet.create({
  map: {
    flex: 1,
  },
});

export default NativeMap;

import React from 'react';
import { View, StyleSheet } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

const COLORS = {
  brandGreen: '#00D46A',
  brandBlue: '#0EA5E9',
  red: '#EF4444',
};

interface RideMapProps {
  mapRef: any;
  pickupCoords: { lat: number; lng: number };
  destinationCoords: { lat: number; lng: number };
  routePolyline: any[];
  pickup: string;
  destination: string;
  nearbyDrivers?: Array<{
    driver_id: string;
    lat: number;
    lng: number;
    status?: string;
    vehicle?: string;
  }>;
  activeDriverLocation?: { lat: number; lng: number } | null;
  activeDriverMoving?: boolean;
}

export default function RideMap({
  mapRef,
  pickupCoords,
  destinationCoords,
  routePolyline,
  pickup,
  destination,
  nearbyDrivers = [],
  activeDriverLocation = null,
  activeDriverMoving = false,
}: RideMapProps) {
  return (
    <View style={styles.mapContainer}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={{
          latitude: pickupCoords.lat,
          longitude: pickupCoords.lng,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
        showsUserLocation={true}
        showsMyLocationButton={false}
        loadingEnabled={true}
      >
        {/* Pickup Marker */}
        <Marker
          coordinate={{
            latitude: pickupCoords.lat,
            longitude: pickupCoords.lng,
          }}
          title="Pickup"
          description={pickup}
          pinColor={COLORS.brandGreen}
        />

        {/* Destination Marker */}
        <Marker
          coordinate={{
            latitude: destinationCoords.lat,
            longitude: destinationCoords.lng,
          }}
          title="Destination"
          description={destination}
          pinColor={COLORS.red}
        />

        {/* Route Polyline */}
        {routePolyline.length > 0 && (
          <Polyline
            coordinates={routePolyline}
            strokeColor={COLORS.brandBlue}
            strokeWidth={4}
          />
        )}

        {/* Nearby available drivers */}
        {nearbyDrivers.map((driver) => (
          <Marker
            key={`nearby-${driver.driver_id}`}
            coordinate={{ latitude: driver.lat, longitude: driver.lng }}
            title={driver.vehicle || 'Available driver'}
            description={driver.status || 'available'}
            pinColor={driver.status === 'on_trip' ? '#9CA3AF' : COLORS.brandBlue}
          />
        ))}

        {/* Assigned driver marker */}
        {activeDriverLocation && (
          <Marker
            coordinate={{
              latitude: activeDriverLocation.lat,
              longitude: activeDriverLocation.lng,
            }}
            title="Your driver"
            description={activeDriverMoving ? 'Moving' : 'Not moving'}
            pinColor={activeDriverMoving ? COLORS.brandGreen : '#F59E0B'}
          />
        )}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  mapContainer: {
    height: 200,
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 20,
  },
  map: {
    width: '100%',
    height: '100%',
  },
});

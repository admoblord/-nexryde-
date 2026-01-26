import React from 'react';
import { View, Text, StyleSheet, Dimensions, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS } from '../constants/theme';

// Only import map components on native platforms
let MapView: any = null;
let Marker: any = null;
let Polyline: any = null;
let PROVIDER_GOOGLE: any = null;

// We can't use require with Platform check at module level for web
// So we'll use the placeholder for web and only render actual map on native

const { width, height } = Dimensions.get('window');

interface Location {
  latitude: number;
  longitude: number;
  address?: string;
}

interface MapComponentProps {
  pickup?: Location;
  dropoff?: Location;
  driverLocation?: Location;
  routeCoordinates?: { latitude: number; longitude: number }[];
  showTraffic?: boolean;
  onMapReady?: () => void;
  style?: any;
}

export const MapComponent: React.FC<MapComponentProps> = ({
  pickup,
  dropoff,
  driverLocation,
  routeCoordinates,
  showTraffic = true,
  onMapReady,
  style,
}) => {
  const mapRef = React.useRef<MapView>(null);

  // Calculate initial region based on markers
  const getInitialRegion = () => {
    if (pickup && dropoff) {
      const midLat = (pickup.latitude + dropoff.latitude) / 2;
      const midLng = (pickup.longitude + dropoff.longitude) / 2;
      const latDelta = Math.abs(pickup.latitude - dropoff.latitude) * 1.5;
      const lngDelta = Math.abs(pickup.longitude - dropoff.longitude) * 1.5;
      return {
        latitude: midLat,
        longitude: midLng,
        latitudeDelta: Math.max(latDelta, 0.02),
        longitudeDelta: Math.max(lngDelta, 0.02),
      };
    }
    if (pickup) {
      return {
        latitude: pickup.latitude,
        longitude: pickup.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };
    }
    // Default to Lagos
    return {
      latitude: 6.5244,
      longitude: 3.3792,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    };
  };

  // Fit map to show all markers
  const fitToMarkers = () => {
    if (!mapRef.current) return;
    
    const coordinates: Location[] = [];
    if (pickup) coordinates.push(pickup);
    if (dropoff) coordinates.push(dropoff);
    if (driverLocation) coordinates.push(driverLocation);

    if (coordinates.length > 1) {
      mapRef.current.fitToCoordinates(coordinates, {
        edgePadding: { top: 100, right: 50, bottom: 200, left: 50 },
        animated: true,
      });
    }
  };

  React.useEffect(() => {
    const timer = setTimeout(fitToMarkers, 500);
    return () => clearTimeout(timer);
  }, [pickup, dropoff, driverLocation]);

  // Custom map style for premium dark look
  const mapStyle = [
    {
      "featureType": "all",
      "elementType": "geometry",
      "stylers": [{ "color": "#242f3e" }]
    },
    {
      "featureType": "all",
      "elementType": "labels.text.stroke",
      "stylers": [{ "lightness": -80 }]
    },
    {
      "featureType": "administrative",
      "elementType": "labels.text.fill",
      "stylers": [{ "color": "#746855" }]
    },
    {
      "featureType": "road",
      "elementType": "geometry",
      "stylers": [{ "color": "#38414e" }]
    },
    {
      "featureType": "road",
      "elementType": "geometry.stroke",
      "stylers": [{ "color": "#212a37" }]
    },
    {
      "featureType": "road",
      "elementType": "labels.text.fill",
      "stylers": [{ "color": "#9ca5b3" }]
    },
    {
      "featureType": "road.highway",
      "elementType": "geometry",
      "stylers": [{ "color": "#746855" }]
    },
    {
      "featureType": "water",
      "elementType": "geometry",
      "stylers": [{ "color": "#17263c" }]
    },
    {
      "featureType": "water",
      "elementType": "labels.text.fill",
      "stylers": [{ "color": "#515c6d" }]
    }
  ];

  return (
    <View style={[styles.container, style]}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        initialRegion={getInitialRegion()}
        showsUserLocation={true}
        showsMyLocationButton={false}
        showsTraffic={showTraffic}
        showsCompass={false}
        customMapStyle={mapStyle}
        onMapReady={() => {
          fitToMarkers();
          onMapReady?.();
        }}
      >
        {/* Pickup Marker */}
        {pickup && (
          <Marker coordinate={pickup} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={styles.pickupMarker}>
              <View style={styles.pickupMarkerInner}>
                <View style={styles.pickupDot} />
              </View>
            </View>
          </Marker>
        )}

        {/* Dropoff Marker */}
        {dropoff && (
          <Marker coordinate={dropoff} anchor={{ x: 0.5, y: 1 }}>
            <View style={styles.dropoffMarker}>
              <View style={styles.dropoffPin}>
                <Ionicons name="location" size={24} color={COLORS.white} />
              </View>
              <View style={styles.dropoffShadow} />
            </View>
          </Marker>
        )}

        {/* Driver Marker */}
        {driverLocation && (
          <Marker coordinate={driverLocation} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={styles.driverMarker}>
              <Ionicons name="car" size={20} color={COLORS.primary} />
            </View>
          </Marker>
        )}

        {/* Route Polyline */}
        {routeCoordinates && routeCoordinates.length > 1 && (
          <Polyline
            coordinates={routeCoordinates}
            strokeWidth={4}
            strokeColor={COLORS.accent}
            lineDashPattern={[1]}
          />
        )}
      </MapView>
    </View>
  );
};

// Simple map placeholder for web
export const MapPlaceholder: React.FC<{ style?: any }> = ({ style }) => (
  <View style={[styles.placeholder, style]}>
    <View style={styles.placeholderContent}>
      <Ionicons name="map" size={60} color={COLORS.gray300} />
      <Text style={styles.placeholderText}>Map View</Text>
      <Text style={styles.placeholderSubtext}>Live tracking enabled</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: BORDER_RADIUS.xxl,
  },
  map: {
    flex: 1,
  },
  pickupMarker: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickupMarkerInner: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.md,
  },
  pickupDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.success,
  },
  dropoffMarker: {
    alignItems: 'center',
  },
  dropoffPin: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.error,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.lg,
  },
  dropoffShadow: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(0,0,0,0.3)',
    marginTop: -5,
  },
  driverMarker: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: COLORS.white,
    ...SHADOWS.lg,
  },
  placeholder: {
    flex: 1,
    backgroundColor: COLORS.gray100,
    borderRadius: BORDER_RADIUS.xxl,
    overflow: 'hidden',
  },
  placeholderContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
    color: COLORS.gray400,
    marginTop: SPACING.md,
  },
  placeholderSubtext: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.gray400,
    marginTop: SPACING.xs,
  },
});

export default MapComponent;

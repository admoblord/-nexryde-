import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '../constants/theme';

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

// Web placeholder - Maps don't work on web preview
export const MapComponent: React.FC<MapComponentProps> = ({
  pickup,
  dropoff,
  style,
}) => {
  return (
    <View style={[styles.placeholder, style]}>
      <View style={styles.placeholderContent}>
        <Ionicons name="map" size={60} color={COLORS.accent} />
        <Text style={styles.placeholderText}>Live Map View</Text>
        <Text style={styles.placeholderSubtext}>Available on mobile app</Text>
        
        {pickup && (
          <View style={styles.locationInfo}>
            <View style={styles.locationRow}>
              <View style={styles.pickupDot} />
              <Text style={styles.locationText} numberOfLines={1}>
                {pickup.address || `${pickup.latitude.toFixed(4)}, ${pickup.longitude.toFixed(4)}`}
              </Text>
            </View>
          </View>
        )}
        
        {dropoff && (
          <View style={styles.locationInfo}>
            <View style={styles.locationRow}>
              <View style={styles.destDot} />
              <Text style={styles.locationText} numberOfLines={1}>
                {dropoff.address || `${dropoff.latitude.toFixed(4)}, ${dropoff.longitude.toFixed(4)}`}
              </Text>
            </View>
          </View>
        )}
      </View>
    </View>
  );
};

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
    padding: SPACING.xl,
  },
  placeholderText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginTop: SPACING.md,
  },
  placeholderSubtext: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.gray400,
    marginTop: SPACING.xs,
  },
  locationInfo: {
    marginTop: SPACING.lg,
    width: '100%',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  pickupDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.success,
  },
  destDot: {
    width: 10,
    height: 10,
    borderRadius: 3,
    backgroundColor: COLORS.error,
  },
  locationText: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
});

export default MapComponent;

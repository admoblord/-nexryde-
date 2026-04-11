import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { SkeletonBlock } from '@/src/components/ui/SkeletonBlock';

export type PreviewCoord = { lat: number; lng: number };

type MapRegion = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

type Props = {
  routePreviewCoordinates?: PreviewCoord[] | null;
  mapPreviewRegion?: MapRegion | null;
  pickupLat?: number | null;
  pickupLng?: number | null;
  dropLat?: number | null;
  dropLng?: number | null;
  areaSummaryLine?: string | null;
  distanceKm?: number | null;
  durationMins?: number | null;
  /** Map height in px (default 160). */
  mapHeight?: number;
  /** Pan/zoom — off during offer review for faster decisions. */
  interactive?: boolean;
  /** When true, map is preview-only (no pan/zoom) before acceptance. */
  interactionLocked?: boolean;
  /** Dark sheet styling (NexRyde driver request). */
  darkOverlay?: boolean;
};

export default function DriverOfferRoutePreview({
  routePreviewCoordinates,
  mapPreviewRegion,
  pickupLat,
  pickupLng,
  dropLat,
  dropLng,
  areaSummaryLine,
  distanceKm,
  durationMins,
  mapHeight = 160,
  interactive = false,
  interactionLocked = false,
  darkOverlay = false,
}: Props) {
  const [mapReady, setMapReady] = useState(Platform.OS === 'web');

  const region = useMemo((): MapRegion => {
    if (mapPreviewRegion) {
      return {
        latitude: mapPreviewRegion.latitude,
        longitude: mapPreviewRegion.longitude,
        latitudeDelta: Math.max(0.12, mapPreviewRegion.latitudeDelta),
        longitudeDelta: Math.max(0.12, mapPreviewRegion.longitudeDelta),
      };
    }
    if (
      pickupLat != null &&
      pickupLng != null &&
      dropLat != null &&
      dropLng != null
    ) {
      const midLat = (pickupLat + dropLat) / 2;
      const midLng = (pickupLng + dropLng) / 2;
      const dlat = Math.abs(pickupLat - dropLat);
      const dlng = Math.abs(pickupLng - dropLng);
      return {
        latitude: midLat,
        longitude: midLng,
        latitudeDelta: Math.max(0.12, dlat * 2.4 + 0.06),
        longitudeDelta: Math.max(0.12, dlng * 2.4 + 0.06),
      };
    }
    return {
      latitude: 6.5244,
      longitude: 3.3792,
      latitudeDelta: 0.25,
      longitudeDelta: 0.25,
    };
  }, [mapPreviewRegion, pickupLat, pickupLng, dropLat, dropLng]);

  const lineCoords = useMemo(() => {
    const raw = routePreviewCoordinates || [];
    return raw
      .filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng))
      .map((p) => ({ latitude: p.lat, longitude: p.lng }));
  }, [routePreviewCoordinates]);

  const regionKey = `${region.latitude},${region.longitude},${region.latitudeDelta}`;

  useEffect(() => {
    setMapReady(Platform.OS === 'web');
  }, [regionKey]);

  if (Platform.OS === 'web') {
    return (
      <View style={styles.webFallback}>
        <Text style={styles.webText}>Route preview (map on mobile app)</Text>
        {areaSummaryLine ? (
          <Text style={styles.summary}>{areaSummaryLine}</Text>
        ) : null}
      </View>
    );
  }

  const showA =
    pickupLat != null &&
    pickupLng != null &&
    Number.isFinite(pickupLat) &&
    Number.isFinite(pickupLng);
  const showB =
    dropLat != null &&
    dropLng != null &&
    Number.isFinite(dropLat) &&
    Number.isFinite(dropLng);

  const allowPanZoom = interactive && !interactionLocked;

  return (
    <View style={[styles.wrap, darkOverlay && styles.wrapDark, { marginHorizontal: darkOverlay ? 16 : 0 }]}>
      <View style={[styles.mapSlot, { height: mapHeight }]}>
        {!mapReady && (
          <SkeletonBlock style={[StyleSheet.absoluteFillObject, styles.skeleton]} />
        )}
        <MapView
          style={[styles.map, { height: mapHeight }]}
          initialRegion={region}
          scrollEnabled={allowPanZoom}
          zoomEnabled={allowPanZoom}
          zoomTapEnabled={allowPanZoom}
          rotateEnabled={false}
          pitchEnabled={false}
          toolbarEnabled={false}
          showsPointsOfInterest={false}
          onMapReady={() => setMapReady(true)}
        >
          {showA && (
            <Marker
              coordinate={{ latitude: pickupLat!, longitude: pickupLng! }}
              title="A"
              description="Pickup"
              pinColor="#22C55E"
            />
          )}
          {showB && (
            <Marker
              coordinate={{ latitude: dropLat!, longitude: dropLng! }}
              title="B"
              description="Drop-off"
              pinColor="#EF4444"
            />
          )}
          {lineCoords.length >= 2 && (
            <Polyline
              coordinates={lineCoords}
              strokeColor="#0EA5E9"
              strokeWidth={3}
            />
          )}
        </MapView>
      </View>
      {areaSummaryLine ? (
        <Text style={[styles.summary, darkOverlay && styles.summaryOnDark]} numberOfLines={2}>
          {areaSummaryLine}
        </Text>
      ) : null}
      {(distanceKm != null || durationMins != null) && (
        <Text style={[styles.meta, darkOverlay && styles.metaOnDark]}>
          {distanceKm != null ? `${Number(distanceKm).toFixed(distanceKm >= 10 ? 0 : 1)} km` : ''}
          {distanceKm != null && durationMins != null ? ' · ' : ''}
          {durationMins != null ? `~${durationMins} min trip` : ''}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 12,
    backgroundColor: '#0F172A',
  },
  wrapDark: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.2)',
    marginBottom: 10,
  },
  mapSlot: {
    position: 'relative',
    width: '100%',
  },
  map: { width: '100%' },
  skeleton: {
    borderRadius: 0,
    zIndex: 2,
  },
  summary: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
    fontSize: 13,
    fontWeight: '700',
    color: '#E2E8F0',
  },
  summaryOnDark: { color: '#E2E8F0' },
  meta: {
    paddingHorizontal: 12,
    paddingBottom: 10,
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
  },
  metaOnDark: { color: '#94A3B8' },
  webFallback: {
    padding: 16,
    backgroundColor: '#1E293B',
    borderRadius: 14,
    marginBottom: 12,
  },
  webText: { color: '#94A3B8', fontSize: 13 },
});

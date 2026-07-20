/**
 * Compact trip route peek for share / receipt surfaces.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { getNexrydeMapStyleAuto } from '@/src/constants/nexrydeMap3d';
import { BRAND } from '@/src/constants/designSystem';
import { parseTripCoords } from '@/src/utils/tripCoords';

type Props = {
  pickup?: unknown;
  dropoff?: unknown;
  stop?: unknown;
  routePreview?: Array<{ lat: number; lng: number }> | null;
  height?: number;
  interactive?: boolean;
};

export function TripRouteMiniMap({
  pickup,
  dropoff,
  stop,
  routePreview,
  height = 140,
  interactive = false,
}: Props) {
  const mapRef = useRef<MapView>(null);
  const mapStyle = getNexrydeMapStyleAuto();
  const a = useMemo(() => parseTripCoords(pickup), [pickup]);
  const b = useMemo(() => parseTripCoords(dropoff), [dropoff]);
  const s = useMemo(() => parseTripCoords(stop), [stop]);

  const route = useMemo(() => {
    if (Array.isArray(routePreview) && routePreview.length >= 2) {
      return routePreview
        .map((p) => parseTripCoords(p))
        .filter((p): p is { lat: number; lng: number } => Boolean(p))
        .map((p) => ({ latitude: p.lat, longitude: p.lng }));
    }
    const pts: Array<{ latitude: number; longitude: number }> = [];
    if (a) pts.push({ latitude: a.lat, longitude: a.lng });
    if (s) pts.push({ latitude: s.lat, longitude: s.lng });
    if (b) pts.push({ latitude: b.lat, longitude: b.lng });
    return pts;
  }, [routePreview, a, b, s]);

  useEffect(() => {
    if (Platform.OS === 'web' || !mapRef.current || route.length < 1) return;
    const t = setTimeout(() => {
      if (route.length === 1) {
        mapRef.current?.animateToRegion(
          {
            latitude: route[0].latitude,
            longitude: route[0].longitude,
            latitudeDelta: 0.04,
            longitudeDelta: 0.04,
          },
          280,
        );
        return;
      }
      mapRef.current?.fitToCoordinates(route, {
        edgePadding: { top: 28, right: 24, bottom: 28, left: 24 },
        animated: true,
      });
    }, 160);
    return () => clearTimeout(t);
  }, [route]);

  if (Platform.OS === 'web' || (!a && !b)) {
    return <View style={[styles.fallback, { height }]} />;
  }

  const seed = a || b!;

  return (
    <View style={[styles.wrap, { height }]} pointerEvents={interactive ? 'auto' : 'none'}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        provider={PROVIDER_GOOGLE}
        customMapStyle={mapStyle}
        initialRegion={{
          latitude: seed.lat,
          longitude: seed.lng,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
        scrollEnabled={interactive}
        zoomEnabled={interactive}
        rotateEnabled={false}
        pitchEnabled={false}
        showsUserLocation={false}
        showsCompass={false}
        showsPointsOfInterest={false}
        toolbarEnabled={false}
        liteMode={!interactive && Platform.OS === 'android'}
      >
        {route.length >= 2 ? (
          <Polyline coordinates={route} strokeColor={BRAND.primary} strokeWidth={3.5} />
        ) : null}
        {a ? (
          <Marker
            coordinate={{ latitude: a.lat, longitude: a.lng }}
            pinColor="#22C55E"
            tracksViewChanges={false}
          />
        ) : null}
        {s ? (
          <Marker
            coordinate={{ latitude: s.lat, longitude: s.lng }}
            pinColor="#F59E0B"
            tracksViewChanges={false}
          />
        ) : null}
        {b ? (
          <Marker
            coordinate={{ latitude: b.lat, longitude: b.lng }}
            pinColor="#EF4444"
            tracksViewChanges={false}
          />
        ) : null}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#0c1220',
    borderWidth: 1,
    borderColor: 'rgba(34,229,160,0.22)',
  },
  fallback: {
    borderRadius: 14,
    backgroundColor: 'rgba(15,23,42,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.2)',
  },
});

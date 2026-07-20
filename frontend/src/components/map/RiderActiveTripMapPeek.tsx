/**
 * Compact active-trip map peek — pitched 3D, sun-auto style, stops, tap opens live tracking.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { getNexrydeMapStyleAuto, MAP_3D, isLocalMapNight } from '@/src/constants/nexrydeMap3d';
import { BRAND } from '@/src/constants/designSystem';
import { parseTripCoords } from '@/src/utils/tripCoords';
import type { Trip } from '@/src/store/appStore';

type Props = {
  trip: Trip;
  /** Kept for callers; cartography uses sun-auto. */
  isDark?: boolean;
  height?: number;
  onPress: () => void;
};

export function RiderActiveTripMapPeek({
  trip,
  height = 168,
  onPress,
}: Props) {
  const mapRef = useRef<MapView>(null);
  const mapStyle = getNexrydeMapStyleAuto();
  const mapNight = isLocalMapNight();

  const pickup = useMemo(() => parseTripCoords(trip.pickup_location), [trip.pickup_location]);
  const dropoff = useMemo(() => parseTripCoords(trip.dropoff_location), [trip.dropoff_location]);
  const stop = useMemo(
    () => parseTripCoords((trip as { stop_location?: unknown }).stop_location),
    [trip],
  );

  const route = useMemo(() => {
    const preview = trip.route_preview_coordinates;
    if (Array.isArray(preview) && preview.length >= 2) {
      return preview
        .map((p) => parseTripCoords(p))
        .filter((p): p is { lat: number; lng: number } => Boolean(p))
        .map((p) => ({ latitude: p.lat, longitude: p.lng }));
    }
    const pts: Array<{ latitude: number; longitude: number }> = [];
    if (pickup) pts.push({ latitude: pickup.lat, longitude: pickup.lng });
    if (stop) pts.push({ latitude: stop.lat, longitude: stop.lng });
    if (dropoff) pts.push({ latitude: dropoff.lat, longitude: dropoff.lng });
    return pts;
  }, [trip.route_preview_coordinates, pickup, dropoff, stop]);

  useEffect(() => {
    if (Platform.OS === 'web' || !mapRef.current) return;
    const pts = [
      ...route,
      ...(pickup ? [{ latitude: pickup.lat, longitude: pickup.lng }] : []),
      ...(stop ? [{ latitude: stop.lat, longitude: stop.lng }] : []),
      ...(dropoff ? [{ latitude: dropoff.lat, longitude: dropoff.lng }] : []),
    ];
    if (pts.length < 1) return;
    const t = setTimeout(() => {
      const mid = pts[Math.floor(pts.length / 2)]!;
      if (pts.length === 1) {
        mapRef.current?.animateCamera(
          {
            center: mid,
            pitch: MAP_3D.peekPitch,
            heading: 0,
            zoom: MAP_3D.peekZoom,
            altitude: 1400,
          },
          { duration: 380 },
        );
        return;
      }
      mapRef.current?.fitToCoordinates(pts, {
        edgePadding: { top: 36, right: 28, bottom: 48, left: 28 },
        animated: true,
      });
      setTimeout(() => {
        mapRef.current?.animateCamera(
          {
            center: mid,
            pitch: MAP_3D.peekPitch,
            heading: 0,
            zoom: MAP_3D.peekZoom,
            altitude: 1400,
          },
          { duration: 320 },
        );
      }, 420);
    }, 180);
    return () => clearTimeout(t);
  }, [route, pickup, dropoff, stop]);

  if (Platform.OS === 'web' || (!pickup && !dropoff)) {
    return (
      <TouchableOpacity style={[styles.wrap, { height }]} onPress={onPress} activeOpacity={0.9}>
        <View style={styles.webFallback}>
          <Ionicons name="navigate" size={22} color={BRAND.primary} />
          <Text style={styles.webTxt}>Open live map</Text>
        </View>
      </TouchableOpacity>
    );
  }

  const seed = pickup || dropoff!;

  return (
    <TouchableOpacity
      style={[styles.wrap, { height }]}
      onPress={onPress}
      activeOpacity={0.94}
      accessibilityRole="button"
      accessibilityLabel="Open live trip map"
    >
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        provider={PROVIDER_GOOGLE}
        customMapStyle={mapStyle}
        initialRegion={{
          latitude: seed.lat,
          longitude: seed.lng,
          latitudeDelta: 0.06,
          longitudeDelta: 0.06,
        }}
        scrollEnabled={false}
        zoomEnabled={false}
        rotateEnabled={false}
        pitchEnabled
        showsUserLocation={false}
        showsCompass={false}
        showsPointsOfInterest={false}
        showsBuildings
        showsTraffic={false}
        toolbarEnabled={false}
        pointerEvents="none"
      >
        {route.length >= 2 ? (
          <Polyline coordinates={route} strokeColor={BRAND.primary} strokeWidth={3.5} />
        ) : null}
        {pickup ? (
          <Marker
            coordinate={{ latitude: pickup.lat, longitude: pickup.lng }}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
          >
            <View style={[styles.pin, styles.pinA]}>
              <Text style={styles.pinTxt}>A</Text>
            </View>
          </Marker>
        ) : null}
        {stop ? (
          <Marker
            coordinate={{ latitude: stop.lat, longitude: stop.lng }}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
          >
            <View style={[styles.pin, styles.pinStop]}>
              <Text style={styles.pinTxt}>+</Text>
            </View>
          </Marker>
        ) : null}
        {dropoff ? (
          <Marker
            coordinate={{ latitude: dropoff.lat, longitude: dropoff.lng }}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
          >
            <View style={[styles.pin, styles.pinB]}>
              <Text style={styles.pinTxt}>B</Text>
            </View>
          </Marker>
        ) : null}
      </MapView>

      <LinearGradient
        colors={
          mapNight
            ? ['rgba(6,11,20,0.12)', 'transparent', 'rgba(6,11,20,0.88)']
            : ['rgba(248,250,252,0.15)', 'transparent', 'rgba(15,23,42,0.72)']
        }
        locations={[0, 0.4, 1]}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />

      <View style={styles.liveChip} pointerEvents="none">
        <View style={styles.liveDot} />
        <Text style={styles.liveTxt}>LIVE TRIP</Text>
      </View>

      <View style={styles.footer} pointerEvents="none">
        <Text style={styles.footerTitle}>Open full live map</Text>
        <Ionicons name="expand" size={14} color={BRAND.primary} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(34,229,160,0.28)',
    backgroundColor: '#0c1220',
    marginBottom: 12,
  },
  webFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0c1220',
  },
  webTxt: { color: '#E2E8F0', fontSize: 12, fontWeight: '700' },
  pin: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  pinA: { backgroundColor: '#22C55E' },
  pinB: { backgroundColor: '#EF4444' },
  pinStop: { backgroundColor: '#F59E0B' },
  pinTxt: { color: '#fff', fontSize: 10, fontWeight: '900' },
  liveChip: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(8,13,24,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(34,229,160,0.28)',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#F87171',
  },
  liveTxt: { color: '#E2E8F0', fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  footer: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(8,13,24,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(34,229,160,0.22)',
  },
  footerTitle: { color: '#F8FAFC', fontSize: 12, fontWeight: '800' },
});

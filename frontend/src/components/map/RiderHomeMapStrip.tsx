/**
 * Rider home interactive map — pan/zoom/3D, nearby supply, sun-auto style, book CTA.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
} from 'react-native';
import MapView, { Circle, Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { getNexrydeMapStyleAuto, MAP_3D, isLocalMapNight } from '@/src/constants/nexrydeMap3d';
import { BRAND } from '@/src/constants/designSystem';
import { getAvailableDrivers } from '@/src/services/api';
import { MapAnimatedTaxiMarker } from '@/src/components/map/MapAnimatedTaxiMarker';
import { clusterMapMarkers } from '@/src/utils/mapMarkerCluster';
import { MapClusterMarker } from '@/src/components/map/MapClusterMarker';

const LAGOS = { latitude: 6.5244, longitude: 3.3792 };

type NearbyDriver = {
  driver_id: string;
  lat: number;
  lng: number;
};

type Props = {
  /** Kept for callers; map cartography uses sun-auto day/night. */
  isDark?: boolean;
  height?: number;
  onPress: () => void;
};

export function RiderHomeMapStrip({ height = 220, onPress }: Props) {
  const mapRef = useRef<MapView>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(true);
  const [drivers, setDrivers] = useState<NearbyDriver[]>([]);
  const [trafficOn, setTrafficOn] = useState(false);
  const mapNight = isLocalMapNight();
  const mapStyle = getNexrydeMapStyleAuto();

  const applyCamera = useCallback((lat: number, lng: number) => {
    try {
      mapRef.current?.animateCamera(
        {
          center: { latitude: lat, longitude: lng },
          pitch: MAP_3D.homePitch,
          heading: 0,
          zoom: MAP_3D.homeZoom,
          altitude: 1100,
        },
        { duration: 480 },
      );
    } catch {
      /* map may be unmounted */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (!cancelled) setLocating(false);
          return;
        }
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelled) return;
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (
          Number.isFinite(next.lat) &&
          Number.isFinite(next.lng) &&
          !(Math.abs(next.lat) < 1e-5 && Math.abs(next.lng) < 1e-5)
        ) {
          setCoords(next);
          applyCamera(next.lat, next.lng);
        }
      } catch {
        /* Lagos fallback */
      } finally {
        if (!cancelled) setLocating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyCamera]);

  useEffect(() => {
    const lat = coords?.lat ?? LAGOS.latitude;
    const lng = coords?.lng ?? LAGOS.longitude;
    let cancelled = false;
    const run = async () => {
      try {
        const res = await getAvailableDrivers({ lat, lng });
        const rows = Array.isArray(res.data?.drivers) ? res.data.drivers : [];
        if (cancelled) return;
        setDrivers(
          rows
            .map((d: any) => ({
              driver_id: String(d.driver_id || ''),
              lat: Number(d.current_location?.lat),
              lng: Number(d.current_location?.lng),
            }))
            .filter(
              (d: NearbyDriver) =>
                d.driver_id && Number.isFinite(d.lat) && Number.isFinite(d.lng),
            )
            .slice(0, 20),
        );
      } catch {
        if (!cancelled) setDrivers([]);
      }
    };
    void run();
    const timer = setInterval(run, 25000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [coords?.lat, coords?.lng]);

  const clusters = useMemo(
    () =>
      clusterMapMarkers(
        drivers.map((d) => ({ ...d, lat: d.lat, lng: d.lng })),
        0.035,
      ),
    [drivers],
  );

  if (Platform.OS === 'web') {
    return (
      <TouchableOpacity
        style={[styles.wrap, { height }]}
        onPress={onPress}
        activeOpacity={0.9}
        accessibilityRole="button"
        accessibilityLabel="Book a ride from the map"
      >
        <View style={styles.webFallback}>
          <Ionicons name="map-outline" size={28} color={BRAND.textMuted} />
          <Text style={styles.webTxt}>Open map to book</Text>
        </View>
      </TouchableOpacity>
    );
  }

  const seedLat = coords?.lat ?? LAGOS.latitude;
  const seedLng = coords?.lng ?? LAGOS.longitude;

  return (
    <View style={[styles.wrap, { height }]} accessibilityLabel="Nearby map">
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        provider={PROVIDER_GOOGLE}
        customMapStyle={mapStyle}
        initialRegion={{
          latitude: seedLat,
          longitude: seedLng,
          latitudeDelta: 0.04,
          longitudeDelta: 0.04,
        }}
        scrollEnabled
        zoomEnabled
        rotateEnabled
        pitchEnabled
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={false}
        showsPointsOfInterest={false}
        showsBuildings
        showsTraffic={trafficOn}
        toolbarEnabled={false}
        onMapReady={() => {
          if (coords) applyCamera(coords.lat, coords.lng);
          else applyCamera(LAGOS.latitude, LAGOS.longitude);
        }}
      >
        {coords ? (
          <>
            <Circle
              center={{ latitude: coords.lat, longitude: coords.lng }}
              radius={180}
              fillColor="rgba(34,229,160,0.12)"
              strokeColor="rgba(34,229,160,0.35)"
              strokeWidth={1}
            />
            <Marker
              coordinate={{ latitude: coords.lat, longitude: coords.lng }}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}
            >
              <View style={styles.youDot}>
                <View style={styles.youCore} />
              </View>
            </Marker>
          </>
        ) : null}
        {clusters.map((entry, idx) => {
          if (entry.kind === 'cluster') {
            return (
              <Marker
                key={`hc-${idx}`}
                coordinate={{ latitude: entry.lat, longitude: entry.lng }}
                tracksViewChanges={false}
                anchor={{ x: 0.5, y: 0.5 }}
              >
                <MapClusterMarker count={entry.count} />
              </Marker>
            );
          }
          const d = entry.item;
          return (
            <Marker
              key={d.driver_id}
              coordinate={{ latitude: d.lat, longitude: d.lng }}
              tracksViewChanges={false}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <MapAnimatedTaxiMarker size={26} />
            </Marker>
          );
        })}
      </MapView>

      <LinearGradient
        colors={
          mapNight
            ? ['rgba(6,11,20,0.15)', 'transparent', 'rgba(6,11,20,0.88)']
            : ['rgba(248,250,252,0.18)', 'transparent', 'rgba(15,23,42,0.68)']
        }
        locations={[0, 0.42, 1]}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />

      <View style={styles.liveChip} pointerEvents="none">
        <View style={[styles.liveDot, locating && styles.liveDotPulse]} />
        <Text style={styles.liveTxt}>
          {locating
            ? 'Locating…'
            : drivers.length
              ? `${drivers.length} nearby`
              : coords
                ? 'Near you'
                : 'Lagos'}
        </Text>
      </View>

      <TouchableOpacity
        style={styles.trafficBtn}
        onPress={() => setTrafficOn((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={trafficOn ? 'Hide traffic' : 'Show traffic'}
      >
        <Ionicons
          name="car-sport"
          size={14}
          color={trafficOn ? BRAND.primary : '#94A3B8'}
        />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.footer}
        onPress={onPress}
        activeOpacity={0.9}
        accessibilityRole="button"
        accessibilityLabel="Book a ride near your location"
      >
        <View style={styles.footerLeft}>
          <Ionicons name="navigate" size={14} color={BRAND.primary} />
          <Text style={styles.footerTitle}>Book from the map</Text>
        </View>
        <View style={styles.footerCta}>
          <Text style={styles.footerCtaTxt}>Go</Text>
          <Ionicons name="arrow-forward" size={12} color="#041016" />
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(34,229,160,0.28)',
    backgroundColor: '#0c1220',
    marginBottom: 10,
  },
  webFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0c1220',
  },
  webTxt: { color: BRAND.textMuted, fontSize: 12, fontWeight: '700' },
  youDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(34,229,160,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
  },
  youCore: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: BRAND.primary,
  },
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
    backgroundColor: BRAND.primary,
  },
  liveDotPulse: { opacity: 0.55 },
  liveTxt: { color: '#E2E8F0', fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
  trafficBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8,13,24,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.28)',
  },
  footer: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 14,
    backgroundColor: 'rgba(8,13,24,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(34,229,160,0.22)',
  },
  footerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  footerTitle: { color: '#F8FAFC', fontSize: 12, fontWeight: '800' },
  footerCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: BRAND.primary,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  footerCtaTxt: { color: '#041016', fontSize: 11, fontWeight: '900' },
});

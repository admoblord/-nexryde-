import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  ActivityIndicator,
  LayoutChangeEvent,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/src/constants/theme';
import {
  BOOKING_MAP_DARK_STYLE,
  MAP,
  mapTealRouteLayers,
} from '@/src/constants/nexrydeMapBehavior';
import { DIRECTIONS_ROUTE_MIN_POINTS } from '@/src/navigation/navUtils';
import { MapAnimatedTaxiMarker } from '@/src/components/map/MapAnimatedTaxiMarker';
import { NexrydeMapFloatingControls } from '@/src/components/map/NexrydeMapFloatingControls';
import { MapClusterMarker } from '@/src/components/map/MapClusterMarker';
import { MapBookingDestinationPin } from '@/src/components/map/MapBookingDestinationPin';
import { MapBookingUserPulse } from '@/src/components/map/MapBookingUserPulse';
import { clusterMapMarkers } from '@/src/utils/mapMarkerCluster';
import { useAnimatedRouteCoords } from '@/src/hooks/useAnimatedRouteCoords';

const ROUTE_FIT_MAX_POINTS = 48;

function sampleCoordsForFit(
  coords: Array<{ latitude: number; longitude: number }>,
  max = ROUTE_FIT_MAX_POINTS,
): Array<{ latitude: number; longitude: number }> {
  if (coords.length <= max) return coords;
  const out: Array<{ latitude: number; longitude: number }> = [];
  const n = coords.length;
  for (let i = 0; i < max; i++) {
    const idx = Math.min(n - 1, Math.round((i / Math.max(1, max - 1)) * (n - 1)));
    out.push(coords[idx]!);
  }
  return out;
}

const bookingMapStyles = StyleSheet.create({
  pickupHalo: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,208,132,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
    shadowColor: MAP.userDot,
    shadowOpacity: 0.45,
    shadowRadius: 8,
    elevation: 6,
  },
  pickupCore: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: MAP.userDot,
    borderWidth: 2,
    borderColor: '#fff',
  },
  dropHalo: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,68,68,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.45)',
    shadowColor: MAP.destinationPin,
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 6,
  },
  dropCore: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: MAP.destinationPin,
    borderWidth: 2,
    borderColor: '#fff',
  },
  pickupHaloSearch: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,208,132,0.32)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: 'rgba(255,255,255,0.5)',
    shadowColor: MAP.userDot,
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 12,
  },
  pickupCoreSearch: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: MAP.userDot,
    borderWidth: 2.5,
    borderColor: '#fff',
  },
  pickupHaloLocked: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,208,132,0.38)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
    shadowColor: MAP.userDot,
    shadowOpacity: 0.65,
    shadowRadius: 18,
    elevation: 12,
  },
  pickupCoreLocked: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: MAP.userDot,
    borderWidth: 2,
    borderColor: '#fff',
  },
});

export type RiderBookingMapNativeProps = {
  pickupCoords: { lat: number; lng: number };
  destinationCoords: { lat: number; lng: number } | null;
  routePolyline: { latitude: number; longitude: number }[];
  pickup: string;
  destination: string;
  routeLoading?: boolean;
  pulseDropoffHalo?: boolean;
  searchMode?: boolean;
  matchLocked?: boolean;
  nearbyDrivers: Array<{
    driver_id: string;
    name?: string;
    lat: number;
    lng: number;
    status?: string;
    vehicle?: string;
  }>;
  controlsBottom?: number;
  /** Show live debug overlay (map ready, tile status, camera, driver count). */
  debugOverlay?: boolean;
  /** Long-press map to set drop-off (booking only). */
  onLongPressMap?: (coords: { lat: number; lng: number }) => void;
};

/** Rider booking / request map — teal route, traffic, 100m pickup radius, map FABs. */
export const RiderBookingMapNative = React.memo(function RiderBookingMapNative(props: RiderBookingMapNativeProps) {
  const mapRef = useRef<any>(null);
  const dropPulseScale = useRef(new Animated.Value(1)).current;
  const [trafficOn, setTrafficOn] = useState(true);
  const [latitudeDelta, setLatitudeDelta] = useState(0.04);

  // ── debug overlay state ──────────────────────────────────────────────────
  const [dbgMapReady, setDbgMapReady] = useState(false);
  const [dbgTilesLoaded, setDbgTilesLoaded] = useState(false);
  const [dbgCam, setDbgCam] = useState<{ lat: number; lng: number; zoom: number } | null>(null);
  const [dbgContainerW, setDbgContainerW] = useState(0);
  const [dbgContainerH, setDbgContainerH] = useState(0);

  const handleContainerLayout = useCallback((e: LayoutChangeEvent) => {
    setDbgContainerW(Math.round(e.nativeEvent.layout.width));
    setDbgContainerH(Math.round(e.nativeEvent.layout.height));
  }, []);

  const handleMapReady = useCallback(async () => {
    setDbgMapReady(true);
    console.log('[RiderMap] onMapReady');
    // Fetch initial camera
    try {
      const cam = await mapRef.current?.getCamera?.();
      if (cam) {
        const lat = Number(cam.center?.latitude ?? cam.latitude);
        const lng = Number(cam.center?.longitude ?? cam.longitude);
        const zoom = Number(cam.zoom ?? 0);
        setDbgCam({ lat, lng, zoom });
        console.log(`[RiderMap] camera lat=${lat.toFixed(5)} lng=${lng.toFixed(5)} zoom=${zoom.toFixed(1)}`);
      }
    } catch { /* silent */ }
  }, []);

  const handleMapLoaded = useCallback(() => {
    setDbgTilesLoaded(true);
    console.log('[RiderMap] onMapLoaded (tiles ready)');
  }, []);
  const routeLen = props.routePolyline.length;
  const safeDrivers = useMemo(
    () =>
      (props.nearbyDrivers || []).filter(
        (d) => d && Number.isFinite(Number(d.lat)) && Number.isFinite(Number(d.lng)),
      ),
    [props.nearbyDrivers],
  );
  const driverClusters = useMemo(
    () =>
      clusterMapMarkers(
        safeDrivers.map((d) => ({
          ...d,
          lat: Number(d.lat),
          lng: Number(d.lng),
        })),
        latitudeDelta,
      ),
    [safeDrivers, latitudeDelta],
  );
  const routeLayersReady = props.routePolyline.length >= DIRECTIONS_ROUTE_MIN_POINTS;
  const lockedRoute = Boolean(props.searchMode && props.matchLocked);
  const animatedRoute = useAnimatedRouteCoords(props.routePolyline, routeLayersReady && !lockedRoute, 1000);
  const routeHead = props.routePolyline[0];
  const routeTail = routeLen > 0 ? props.routePolyline[routeLen - 1] : null;
  const controlsBottom = props.controlsBottom ?? 140;

  useEffect(() => {
    const pulseOn = Boolean(props.pulseDropoffHalo && props.destinationCoords);
    if (!pulseOn) {
      dropPulseScale.stopAnimation();
      dropPulseScale.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(dropPulseScale, {
          toValue: 1.12,
          duration: 1000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(dropPulseScale, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      dropPulseScale.setValue(1);
    };
  }, [props.pulseDropoffHalo, props.destinationCoords?.lat, props.destinationCoords?.lng, dropPulseScale]);

  const fitMap = useCallback(() => {
    const m = mapRef.current;
    if (!m) return;
    const sm = Boolean(props.searchMode);
    const locked = Boolean(sm && props.matchLocked);
    const pad = sm
      ? { top: 110, right: 18, bottom: locked ? 260 : 240, left: 18 }
      : { top: 88, right: 20, bottom: 132, left: 20 };
    try {
      if (props.destinationCoords && props.routePolyline.length >= DIRECTIONS_ROUTE_MIN_POINTS) {
        m.fitToCoordinates(sampleCoordsForFit(props.routePolyline), { edgePadding: pad, animated: true });
      } else if (props.destinationCoords) {
        m.fitToCoordinates(
          [
            { latitude: props.pickupCoords.lat, longitude: props.pickupCoords.lng },
            { latitude: props.destinationCoords.lat, longitude: props.destinationCoords.lng },
          ],
          { edgePadding: pad, animated: true },
        );
      } else {
        m.animateToRegion(
          {
            latitude: props.pickupCoords.lat,
            longitude: props.pickupCoords.lng,
            latitudeDelta: 0.04,
            longitudeDelta: 0.04,
          },
          400,
        );
      }
    } catch {
      /* silent */
    }
  }, [
    props.pickupCoords.lat,
    props.pickupCoords.lng,
    props.destinationCoords,
    props.routePolyline,
    props.searchMode,
    props.matchLocked,
  ]);

  useEffect(() => {
    const t = setTimeout(fitMap, 350);
    return () => clearTimeout(t);
  }, [
    props.pickupCoords.lat,
    props.pickupCoords.lng,
    props.destinationCoords?.lat,
    props.destinationCoords?.lng,
    routeLen,
    routeHead?.latitude,
    routeHead?.longitude,
    routeTail?.latitude,
    routeTail?.longitude,
    props.searchMode,
    props.matchLocked,
    fitMap,
  ]);

  const zoomStep = useCallback(async (delta: number) => {
    const m = mapRef.current;
    if (!m?.getCamera) return;
    try {
      const cam = await m.getCamera();
      const z = Number(cam?.zoom);
      if (!Number.isFinite(z)) return;
      await m.animateCamera(
        { ...cam, zoom: Math.min(MAP.maxZoom, Math.max(MAP.minZoom, z + delta)) },
        { duration: 300 },
      );
    } catch {
      /* silent */
    }
  }, []);

  try {
    const { default: MapView, Marker, Polyline, Circle, PROVIDER_GOOGLE } = require('react-native-maps');
    const sm = Boolean(props.searchMode);
    const locked = Boolean(sm && props.matchLocked);
    const routeLayers =
      animatedRoute.length >= DIRECTIONS_ROUTE_MIN_POINTS ? mapTealRouteLayers(animatedRoute) : null;

    return (
      <View style={StyleSheet.absoluteFillObject} onLayout={handleContainerLayout}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFillObject}
          provider={PROVIDER_GOOGLE}
          initialRegion={{
            latitude: props.pickupCoords.lat,
            longitude: props.pickupCoords.lng,
            latitudeDelta: 0.03,
            longitudeDelta: 0.03,
          }}
          showsUserLocation={false}
          showsMyLocationButton={false}
          loadingEnabled
          loadingBackgroundColor="#0e1a2d"
          loadingIndicatorColor="#00D084"
          showsBuildings={false}
          showsPointsOfInterest={false}
          showsCompass={false}
          showsIndoors={false}
          toolbarEnabled={false}
          showsTraffic={trafficOn}
          minZoomLevel={MAP.minZoom}
          maxZoomLevel={MAP.maxZoom}
          customMapStyle={BOOKING_MAP_DARK_STYLE}
          mapPadding={sm ? { top: 0, right: 0, bottom: locked ? 260 : 300, left: 0 } : undefined}
          onMapReady={handleMapReady}
          onMapLoaded={handleMapLoaded}
          onRegionChangeComplete={(region: {
            latitude: number;
            longitude: number;
            latitudeDelta: number;
            longitudeDelta: number;
          }) => {
            if (Number.isFinite(region.latitudeDelta)) setLatitudeDelta(region.latitudeDelta);
            if (Number.isFinite(region.latitude)) {
              setDbgCam({
                lat: region.latitude,
                lng: region.longitude,
                zoom: Math.round(-Math.log2(region.latitudeDelta / 0.7) * 10) / 10,
              });
              console.log(`[RiderMap] camera moved lat=${region.latitude.toFixed(5)} lng=${region.longitude.toFixed(5)} Δ=${region.latitudeDelta.toFixed(4)}`);
            }
          }}
          onLongPress={(e: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }) => {
            if (sm || !props.onLongPressMap) return;
            const { latitude, longitude } = e.nativeEvent.coordinate;
            props.onLongPressMap({ lat: latitude, lng: longitude });
          }}
        >
          {!sm && (
            <Circle
              center={{ latitude: props.pickupCoords.lat, longitude: props.pickupCoords.lng }}
              radius={MAP.pickupRadiusM}
              fillColor="rgba(0,102,255,0.1)"
              strokeColor="rgba(0,102,255,0.38)"
              strokeWidth={1}
            />
          )}
          {sm && !locked && (
            <>
              <Circle
                center={{ latitude: props.pickupCoords.lat, longitude: props.pickupCoords.lng }}
                radius={MAP.pickupRadiusM}
                fillColor="rgba(0,208,132,0.08)"
                strokeColor="rgba(0,208,132,0.38)"
                strokeWidth={1}
              />
              <Circle
                center={{ latitude: props.pickupCoords.lat, longitude: props.pickupCoords.lng }}
                radius={190}
                fillColor="rgba(0,208,132,0.03)"
                strokeColor="rgba(0,208,132,0.2)"
                strokeWidth={1}
              />
            </>
          )}
          {routeLayers && !locked && (
            <>
              <Polyline
                coordinates={routeLayers.glow.coordinates}
                strokeColor={routeLayers.glow.strokeColor}
                strokeWidth={routeLayers.glow.strokeWidth}
                geodesic
                lineCap="round"
                lineJoin="round"
              />
              <Polyline
                coordinates={routeLayers.mid.coordinates}
                strokeColor={routeLayers.mid.strokeColor}
                strokeWidth={routeLayers.mid.strokeWidth}
                geodesic
                lineCap="round"
                lineJoin="round"
              />
              <Polyline
                coordinates={routeLayers.main.coordinates}
                strokeColor={routeLayers.main.strokeColor}
                strokeWidth={routeLayers.main.strokeWidth}
                geodesic
                lineCap="round"
                lineJoin="round"
              />
            </>
          )}
          {routeLayers && locked && (
            <>
              <Polyline
                coordinates={animatedRoute.length >= 2 ? animatedRoute : props.routePolyline}
                strokeColor="rgba(0,208,132,0.14)"
                strokeWidth={24}
                geodesic
                lineCap="round"
                lineJoin="round"
              />
              <Polyline
                coordinates={props.routePolyline}
                strokeColor="rgba(0,217,163,0.55)"
                strokeWidth={10}
                geodesic
                lineCap="round"
                lineJoin="round"
              />
              <Polyline
                coordinates={props.routePolyline}
                strokeColor={MAP.routeTeal}
                strokeWidth={MAP.routeWidth}
                geodesic
                lineCap="round"
                lineJoin="round"
              />
            </>
          )}
          <Marker
            coordinate={{ latitude: props.pickupCoords.lat, longitude: props.pickupCoords.lng }}
            title="Pickup"
            description={props.pickup}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
            zIndex={5}
          >
            <MapBookingUserPulse size={sm ? 44 : 40} />
          </Marker>
          {props.destinationCoords ? (
            <Marker
              coordinate={{
                latitude: props.destinationCoords.lat,
                longitude: props.destinationCoords.lng,
              }}
              title="Destination"
              description={props.destination}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={Boolean(props.pulseDropoffHalo)}
            >
              <Animated.View style={{ transform: [{ scale: dropPulseScale }] }}>
                <MapBookingDestinationPin />
              </Animated.View>
            </Marker>
          ) : null}
          {driverClusters.map((entry, idx) => {
            if (entry.kind === 'cluster') {
              return (
                <Marker
                  key={`cluster-${idx}`}
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
                <MapAnimatedTaxiMarker size={sm ? 32 : 28} searchMode={sm} />
              </Marker>
            );
          })}
        </MapView>

        <LinearGradient
          pointerEvents="none"
          colors={['rgba(15,20,25,0.55)', 'rgba(15,20,25,0.2)', 'transparent']}
          locations={[0, 0.35, 1]}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: sm ? '32%' : '24%' }}
        />
        <LinearGradient
          pointerEvents="none"
          colors={['transparent', 'rgba(15,20,25,0.25)', 'rgba(15,20,25,0.45)']}
          locations={[0, 0.5, 1]}
          style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '42%' }}
        />
        {sm ? (
          <LinearGradient
            pointerEvents="none"
            colors={['transparent', 'rgba(15,20,25,0.22)', 'rgba(15,20,25,0.45)']}
            locations={[0, 0.55, 1]}
            style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '38%' }}
          />
        ) : null}

        <NexrydeMapFloatingControls
          side="left"
          bottom={controlsBottom}
          left={12}
          onRecenter={fitMap}
          onZoomIn={() => zoomStep(0.5)}
          onZoomOut={() => zoomStep(-0.5)}
          onTrafficToggle={() => setTrafficOn((v) => !v)}
          trafficOn={trafficOn}
          showTraffic
        />

        {props.routeLoading ? (
          <View pointerEvents="none" style={styles.routingPill}>
            <ActivityIndicator size="small" color={MAP.userDot} />
            <Text style={styles.routingText}>Routing…</Text>
          </View>
        ) : null}

        {/* ── Debug overlay ─────────────────────────────────────────────── */}
        {props.debugOverlay ? (
          <View pointerEvents="none" style={styles.debugPanel}>
            <Text style={styles.debugRow}>
              Map Loaded: <Text style={dbgMapReady ? styles.dbgGreen : styles.dbgRed}>{dbgMapReady ? 'YES' : 'NO'}</Text>
            </Text>
            <Text style={styles.debugRow}>
              Tiles: <Text style={dbgTilesLoaded ? styles.dbgGreen : styles.dbgRed}>{dbgTilesLoaded ? 'YES' : 'NO'}</Text>
            </Text>
            <Text style={styles.debugRow}>
              Container: <Text style={styles.dbgVal}>{dbgContainerW}×{dbgContainerH}</Text>
            </Text>
            <Text style={styles.debugRow}>
              Driver Count: <Text style={styles.dbgVal}>{safeDrivers.length} ({props.nearbyDrivers?.length ?? 0} raw)</Text>
            </Text>
            <Text style={styles.debugRow}>
              Markers: <Text style={styles.dbgVal}>
                1 pickup{props.destinationCoords ? ' + 1 dest' : ''} + {driverClusters.length} drivers
              </Text>
            </Text>
            <Text style={styles.debugRow}>
              Camera: <Text style={styles.dbgVal}>
                {dbgCam ? `${dbgCam.lat.toFixed(4)}, ${dbgCam.lng.toFixed(4)} z${dbgCam.zoom.toFixed(1)}` : '—'}
              </Text>
            </Text>
            <Text style={styles.debugRow}>
              Style: <Text style={styles.dbgVal}>BOOKING_DARK ({BOOKING_MAP_DARK_STYLE.length} rules)</Text>
            </Text>
          </View>
        ) : null}
      </View>
    );
  } catch {
    return (
      <View
        style={[
          StyleSheet.absoluteFillObject,
          { backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center', padding: 24 },
        ]}
      >
        <Text style={{ color: COLORS.textMuted, textAlign: 'center' }}>
          Map could not load. Enter pickup and destination below.
        </Text>
      </View>
    );
  }
});

const styles = StyleSheet.create({
  routingPill: {
    position: 'absolute',
    top: 56,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 11,
    borderRadius: 999,
    backgroundColor: 'rgba(15,20,25,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(0,208,132,0.28)',
  },
  routingText: { color: '#E2E8F0', fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  debugPanel: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.82)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,208,132,0.4)',
    padding: 8,
    gap: 3,
  },
  debugRow: { fontSize: 10, color: '#c8d6e0', fontWeight: '700' },
  dbgGreen: { color: '#00D084' },
  dbgRed: { color: '#FF5A5A' },
  dbgVal: { color: '#FACC15' },
});

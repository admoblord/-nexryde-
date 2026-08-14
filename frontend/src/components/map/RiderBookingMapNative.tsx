import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  ActivityIndicator,
  LayoutChangeEvent,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/src/constants/theme';
import { MAP } from '@/src/constants/nexrydeMapBehavior';
import {
  getBoltRiderCustomMapStyle,
  getBoltRiderGoogleMapId,
  mapBoltRouteLayers,
  BOLT_ROUTE_GREEN,
  BOLT_ROUTE_CASING,
  BOLT_ROUTE_CASING_WIDTH,
  BOLT_ROUTE_WIDTH,
} from '@/src/constants/boltMapStyle';
import { MAP_3D } from '@/src/constants/nexrydeMap3d';
import { DIRECTIONS_ROUTE_MIN_POINTS } from '@/src/navigation/navUtils';
import { MapAnimatedTaxiMarker } from '@/src/components/map/MapAnimatedTaxiMarker';
import { MapClusterMarker } from '@/src/components/map/MapClusterMarker';
import { MapBookingDestinationPin } from '@/src/components/map/MapBookingDestinationPin';
import { MapBookingUserPulse } from '@/src/components/map/MapBookingUserPulse';
import { MapRoutePinBadge } from '@/src/components/map/MapRoutePinBadge';
import { RiderDemandHeatOverlay } from '@/src/components/map/RiderDemandHeatOverlay';
import { clusterMapMarkers } from '@/src/utils/mapMarkerCluster';
import { useAnimatedRouteCoords } from '@/src/hooks/useAnimatedRouteCoords';
import { useRiderDemandZones } from '@/src/hooks/useRiderDemandZones';
import { haversineKm, bearingDeg } from '@/src/components/tracking/map/mapUtils';
import type { HeatZonePoint } from '@/src/utils/driverHeatmapZones';

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
  pinStack: {
    alignItems: 'center',
  },
});

export type RiderBookingMapNativeProps = {
  pickupCoords: { lat: number; lng: number };
  destinationCoords: { lat: number; lng: number } | null;
  stopCoords?: { lat: number; lng: number } | null;
  routePolyline: { latitude: number; longitude: number }[];
  pickup: string;
  destination: string;
  stop?: string;
  routeLoading?: boolean;
  pulseDropoffHalo?: boolean;
  searchMode?: boolean;
  matchLocked?: boolean;
  /**
   * Legacy night toggle — booking map always uses Bolt light basemap.
   * Kept so older call sites compile; ignored for styling.
   */
  isDark?: boolean | null;
  nearbyDrivers: Array<{
    driver_id: string;
    name?: string;
    lat: number;
    lng: number;
    status?: string;
    vehicle?: string;
    heading?: number | null;
  }>;
  /** Fare demand ratio — powers surge blush when heatmap API unavailable. */
  demandRatio?: number | null;
  surgeMultiplier?: number | null;
  /** Prefetched demand zones; when omitted, hook fetches/synthesizes. */
  demandZones?: HeatZonePoint[];
  showDemandOverlay?: boolean;
  controlsBottom?: number;
  /** Show live debug overlay (map ready, tile status, camera, driver count). */
  debugOverlay?: boolean;
  /** Long-press map to set drop-off (booking only). */
  onLongPressMap?: (coords: { lat: number; lng: number }) => void;
  /**
   * Bolt pin badges — prefer structured props; string form "Pickup / 12 min"
   * still accepted for backward compatibility.
   */
  pickupBadge?: string | null;
  dropoffBadge?: string | null;
  pickupBadgeTitle?: string;
  pickupBadgeSubtitle?: string | null;
  dropoffBadgeTitle?: string;
  dropoffBadgeSubtitle?: string | null;
};

function splitBadge(raw: string | null | undefined): { title: string; subtitle: string } {
  const s = String(raw || '').trim();
  if (!s) return { title: '', subtitle: '' };
  const parts = s.split(/\s*\/\s*/);
  if (parts.length >= 2) return { title: parts[0]!.trim(), subtitle: parts.slice(1).join(' / ').trim() };
  return { title: s, subtitle: '' };
}

/** Rider booking map — Bolt light basemap, dark-green route, top-down cars. */
export const RiderBookingMapNative = React.memo(function RiderBookingMapNative(props: RiderBookingMapNativeProps) {
  const mapRef = useRef<any>(null);
  const dropPulseScale = useRef(new Animated.Value(1)).current;
  const [latitudeDelta, setLatitudeDelta] = useState(0.04);
  const googleMapId = getBoltRiderGoogleMapId();
  const customMapStyle = getBoltRiderCustomMapStyle();
  const driverHeadingRef = useRef<Record<string, { lat: number; lng: number; heading: number }>>({});
  const hookedDemandZones = useRiderDemandZones(
    props.pickupCoords,
    // Heat overlay fights the pale Bolt look — keep off unless search mode needs it.
    Boolean(props.showDemandOverlay) && Boolean(props.searchMode),
    {
      demandRatio: props.demandRatio,
      surgeMultiplier: props.surgeMultiplier,
    },
  );
  const demandZones = props.demandZones ?? hookedDemandZones;

  const pickupBadgeParts = useMemo(() => {
    if (props.pickupBadgeTitle) {
      return {
        title: props.pickupBadgeTitle,
        subtitle: String(props.pickupBadgeSubtitle || ''),
      };
    }
    return splitBadge(props.pickupBadge);
  }, [props.pickupBadge, props.pickupBadgeTitle, props.pickupBadgeSubtitle]);

  const dropoffBadgeParts = useMemo(() => {
    if (props.dropoffBadgeTitle) {
      return {
        title: props.dropoffBadgeTitle,
        subtitle: String(props.dropoffBadgeSubtitle || ''),
      };
    }
    return splitBadge(props.dropoffBadge);
  }, [props.dropoffBadge, props.dropoffBadgeTitle, props.dropoffBadgeSubtitle]);

  /** Offset badges horizontally when pickup/dropoff are close so they don't overlap. */
  const badgeOffsets = useMemo(() => {
    const dest = props.destinationCoords;
    if (!dest || !pickupBadgeParts.title || !dropoffBadgeParts.title) {
      return { pickupX: 0, dropoffX: 0 };
    }
    const km = haversineKm(
      props.pickupCoords.lat,
      props.pickupCoords.lng,
      dest.lat,
      dest.lng,
    );
    if (km > 1.2) return { pickupX: 0, dropoffX: 0 };
    const brg = bearingDeg(
      props.pickupCoords.lat,
      props.pickupCoords.lng,
      dest.lat,
      dest.lng,
    );
    // Push badges perpendicular to the route axis.
    const leftOfRoute = brg > 0 && brg < 180;
    return {
      pickupX: leftOfRoute ? -48 : 48,
      dropoffX: leftOfRoute ? 48 : -48,
    };
  }, [
    props.pickupCoords.lat,
    props.pickupCoords.lng,
    props.destinationCoords?.lat,
    props.destinationCoords?.lng,
    pickupBadgeParts.title,
    dropoffBadgeParts.title,
  ]);

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
    if (__DEV__) console.log('[RiderMap] onMapReady');
    // Fetch initial camera
    try {
      const cam = await mapRef.current?.getCamera?.();
      if (cam) {
        const lat = Number(cam.center?.latitude ?? cam.latitude);
        const lng = Number(cam.center?.longitude ?? cam.longitude);
        const zoom = Number(cam.zoom ?? 0);
        setDbgCam({ lat, lng, zoom });
        if (__DEV__) {
          console.log(`[RiderMap] camera lat=${lat.toFixed(5)} lng=${lng.toFixed(5)} zoom=${zoom.toFixed(1)}`);
        }
      }
    } catch { /* silent */ }
  }, []);

  const handleMapLoaded = useCallback(() => {
    setDbgTilesLoaded(true);
    if (__DEV__) console.log('[RiderMap] onMapLoaded (tiles ready)');
  }, []);
  const routeLen = props.routePolyline.length;
  const safeDrivers = useMemo(() => {
    const rows = (props.nearbyDrivers || []).filter(
      (d) => d && Number.isFinite(Number(d.lat)) && Number.isFinite(Number(d.lng)),
    );
    return rows.map((d) => {
      const lat = Number(d.lat);
      const lng = Number(d.lng);
      let heading =
        typeof d.heading === 'number' && Number.isFinite(d.heading) ? Number(d.heading) : null;
      const prev = driverHeadingRef.current[d.driver_id];
      if (heading == null && prev) {
        const moved = haversineKm(prev.lat, prev.lng, lat, lng) * 1000;
        if (moved > 4) {
          heading = bearingDeg(prev.lat, prev.lng, lat, lng);
        } else {
          heading = prev.heading;
        }
      }
      if (heading == null) heading = 0;
      driverHeadingRef.current[d.driver_id] = { lat, lng, heading };
      return { ...d, lat, lng, heading };
    });
  }, [props.nearbyDrivers]);
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
    const applyTilt = () => {
      if (!m.getCamera || !m.animateCamera) return;
      void m.getCamera().then((cam: { pitch?: number; zoom?: number }) => {
        void m.animateCamera(
          { ...cam, pitch: sm ? MAP_3D.bookingPitch + 6 : MAP_3D.bookingPitch },
          { duration: 420 },
        );
      }).catch(() => undefined);
    };
    try {
      if (props.destinationCoords && props.routePolyline.length >= DIRECTIONS_ROUTE_MIN_POINTS) {
        m.fitToCoordinates(sampleCoordsForFit(props.routePolyline), { edgePadding: pad, animated: true });
        setTimeout(applyTilt, 380);
      } else if (props.destinationCoords) {
        m.fitToCoordinates(
          [
            { latitude: props.pickupCoords.lat, longitude: props.pickupCoords.lng },
            ...(props.stopCoords
              ? [{ latitude: props.stopCoords.lat, longitude: props.stopCoords.lng }]
              : []),
            { latitude: props.destinationCoords.lat, longitude: props.destinationCoords.lng },
          ],
          { edgePadding: pad, animated: true },
        );
        setTimeout(applyTilt, 380);
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

  try {
    const { default: MapView, Marker, Polyline, Circle, PROVIDER_GOOGLE } = require('react-native-maps');
    const sm = Boolean(props.searchMode);
    const locked = Boolean(sm && props.matchLocked);
    const routeLayers =
      animatedRoute.length >= DIRECTIONS_ROUTE_MIN_POINTS ? mapBoltRouteLayers(animatedRoute) : null;
    const showPickupBadge = Boolean(pickupBadgeParts.title);
    const showDropoffBadge = Boolean(dropoffBadgeParts.title);

    return (
      <View style={StyleSheet.absoluteFillObject} onLayout={handleContainerLayout}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFillObject}
          provider={PROVIDER_GOOGLE}
          googleMapId={googleMapId || undefined}
          initialRegion={{
            latitude: props.pickupCoords.lat,
            longitude: props.pickupCoords.lng,
            latitudeDelta: 0.03,
            longitudeDelta: 0.03,
          }}
          showsUserLocation={false}
          showsMyLocationButton={false}
          loadingEnabled
          loadingBackgroundColor="#EEF3E8"
          loadingIndicatorColor={BOLT_ROUTE_GREEN}
          // The booking camera is tilted, so buildings give it depth instead of a
          // flat plan view that happens to be at an angle.
          showsBuildings
          pitchEnabled
          showsPointsOfInterest={false}
          showsCompass={false}
          showsIndoors={false}
          toolbarEnabled={false}
          showsTraffic={false}
          minZoomLevel={MAP.minZoom}
          maxZoomLevel={MAP.maxZoom}
          customMapStyle={customMapStyle}
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
            if (props.debugOverlay && Number.isFinite(region.latitude)) {
              setDbgCam({
                lat: region.latitude,
                lng: region.longitude,
                zoom: Math.round(-Math.log2(region.latitudeDelta / 0.7) * 10) / 10,
              });
            }
          }}
          onLongPress={(e: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }) => {
            if (sm || !props.onLongPressMap) return;
            const { latitude, longitude } = e.nativeEvent.coordinate;
            props.onLongPressMap({ lat: latitude, lng: longitude });
          }}
        >
          {sm && demandZones.length > 0 ? (
            <RiderDemandHeatOverlay zones={demandZones} maxZones={4} />
          ) : null}
          {sm && !locked && (
            <>
              <Circle
                center={{ latitude: props.pickupCoords.lat, longitude: props.pickupCoords.lng }}
                radius={MAP.pickupRadiusM}
                fillColor="rgba(10,122,69,0.08)"
                strokeColor="rgba(10,122,69,0.35)"
                strokeWidth={1}
              />
              <Circle
                center={{ latitude: props.pickupCoords.lat, longitude: props.pickupCoords.lng }}
                radius={190}
                fillColor="rgba(10,122,69,0.03)"
                strokeColor="rgba(10,122,69,0.18)"
                strokeWidth={1}
              />
            </>
          )}
          {routeLayers && !locked && (
            <>
              <Polyline
                coordinates={routeLayers.casing.coordinates}
                strokeColor={routeLayers.casing.strokeColor}
                strokeWidth={routeLayers.casing.strokeWidth}
                geodesic
                lineCap="round"
                lineJoin="round"
                zIndex={1}
              />
              <Polyline
                coordinates={routeLayers.main.coordinates}
                strokeColor={routeLayers.main.strokeColor}
                strokeWidth={routeLayers.main.strokeWidth}
                geodesic
                lineCap="round"
                lineJoin="round"
                zIndex={2}
              />
            </>
          )}
          {routeLayers && locked && (
            <>
              <Polyline
                coordinates={animatedRoute.length >= 2 ? animatedRoute : props.routePolyline}
                strokeColor={BOLT_ROUTE_CASING}
                strokeWidth={BOLT_ROUTE_CASING_WIDTH + 2}
                geodesic
                lineCap="round"
                lineJoin="round"
              />
              <Polyline
                coordinates={props.routePolyline}
                strokeColor={BOLT_ROUTE_GREEN}
                strokeWidth={BOLT_ROUTE_WIDTH}
                geodesic
                lineCap="round"
                lineJoin="round"
              />
            </>
          )}
          <Marker
            key={`pickup-${pickupBadgeParts.subtitle || 'pin'}-${badgeOffsets.pickupX}`}
            coordinate={{ latitude: props.pickupCoords.lat, longitude: props.pickupCoords.lng }}
            title="Pickup"
            description={props.pickup}
            anchor={{ x: 0.5, y: showPickupBadge ? 0.92 : 0.5 }}
            centerOffset={{ x: badgeOffsets.pickupX, y: 0 }}
            tracksViewChanges={false}
            zIndex={5}
          >
            <View style={bookingMapStyles.pinStack}>
              {showPickupBadge ? (
                <MapRoutePinBadge
                  title={pickupBadgeParts.title}
                  subtitle={pickupBadgeParts.subtitle}
                  variant="pickup"
                />
              ) : null}
              <MapBookingUserPulse size={sm ? 44 : 40} />
            </View>
          </Marker>
          {props.stopCoords ? (
            <Marker
              coordinate={{
                latitude: props.stopCoords.lat,
                longitude: props.stopCoords.lng,
              }}
              title="Stop"
              description={props.stop || 'Stop'}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}
              zIndex={4}
            >
              <View style={bookingMapStyles.dropHalo}>
                <View style={[bookingMapStyles.dropCore, { backgroundColor: '#F59E0B' }]} />
              </View>
            </Marker>
          ) : null}
          {props.destinationCoords ? (
            <Marker
              key={`drop-${dropoffBadgeParts.subtitle || 'pin'}-${badgeOffsets.dropoffX}`}
              coordinate={{
                latitude: props.destinationCoords.lat,
                longitude: props.destinationCoords.lng,
              }}
              title="Destination"
              description={props.destination}
              anchor={{ x: 0.5, y: showDropoffBadge ? 0.92 : 0.5 }}
              centerOffset={{ x: badgeOffsets.dropoffX, y: 0 }}
              tracksViewChanges={false}
            >
              <View style={bookingMapStyles.pinStack}>
                {showDropoffBadge ? (
                  <MapRoutePinBadge
                    title={dropoffBadgeParts.title}
                    subtitle={dropoffBadgeParts.subtitle}
                    variant="dropoff"
                  />
                ) : null}
                <Animated.View style={{ transform: [{ scale: dropPulseScale }] }}>
                  <MapBookingDestinationPin />
                </Animated.View>
              </View>
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
            const d = entry.item as {
              driver_id: string;
              lat: number;
              lng: number;
              heading?: number;
              status?: string;
            };
            const vehicleStatus =
              d.status === 'offline' ? 'offline' : sm ? 'on_trip' : 'available';
            return (
              <Marker
                key={d.driver_id}
                coordinate={{ latitude: d.lat, longitude: d.lng }}
                tracksViewChanges={false}
                anchor={{ x: 0.5, y: 0.5 }}
                rotation={0}
                flat
              >
                <MapAnimatedTaxiMarker
                  size={sm ? 34 : 32}
                  heading={d.heading ?? 0}
                  status={vehicleStatus}
                />
              </Marker>
            );
          })}
        </MapView>

        {/* Bolt recenter — circular white, bottom-right above sheet, crosshair */}
        <TouchableOpacity
          style={[styles.recenterFab, { bottom: controlsBottom }]}
          onPress={fitMap}
          activeOpacity={0.88}
          accessibilityLabel="Recenter map to full route"
          accessibilityRole="button"
        >
          <Ionicons name="locate-outline" size={22} color="#0F172A" />
        </TouchableOpacity>

        {props.routeLoading ? (
          <View pointerEvents="none" style={styles.routingPill}>
            <ActivityIndicator size="small" color={BOLT_ROUTE_GREEN} />
            <Text style={styles.routingText}>Routing…</Text>
          </View>
        ) : null}

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
              Style:{' '}
              <Text style={styles.dbgVal}>
                {googleMapId ? `cloud:${googleMapId.slice(0, 8)}…` : `bolt-json (${customMapStyle?.length ?? 0})`}
              </Text>
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
  recenterFab: {
    position: 'absolute',
    right: 14,
    zIndex: 12,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(15,23,42,0.08)',
    shadowColor: '#0F172A',
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
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
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(10,122,69,0.22)',
  },
  routingText: { color: '#0F172A', fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  debugPanel: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(15,23,42,0.88)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(10,122,69,0.4)',
    padding: 8,
    gap: 3,
  },
  debugRow: { fontSize: 10, color: '#c8d6e0', fontWeight: '700' },
  dbgGreen: { color: '#22E180' },
  dbgRed: { color: '#FF5A5A' },
  dbgVal: { color: '#FACC15' },
});

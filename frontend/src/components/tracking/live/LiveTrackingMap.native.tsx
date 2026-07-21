import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  memo,
} from 'react';
import { StyleSheet, InteractionManager } from 'react-native';
import MapView, { Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { DIRECTIONS_ROUTE_MIN_POINTS } from '@/src/navigation/navUtils';
import { fetchDirectionsResilient } from '@/src/navigation/fetchDirectionsResilient';
import type { TrackingMapModel } from '@/src/components/tracking/types';
import {
  getPerfectTrackingMapStyle,
} from '@/src/components/tracking/trackingMapTokens';
import {
  bearingDeg,
  isValidMapCoord,
  sanitizeMapCoords,
} from '@/src/components/tracking/map/mapUtils';
import {
  cameraCenterForDriverAndTarget,
  driverMovedEnough,
  splitRouteAtDriver,
} from '@/src/components/tracking/map/driverMapAnimation';
import { DriverCarMarker } from '@/src/components/tracking/map/DriverCarMarker';
import { EtaRoutePuck } from '@/src/components/map/EtaRoutePuck';
import { MAP_3D } from '@/src/constants/nexrydeMap3d';
import { MAP } from '@/src/constants/nexrydeMapBehavior';
import {
  appendTripBreadcrumb,
  type MapCoord,
} from '@/src/utils/tripBreadcrumbTrail';
import { RIDER_TRACKING_LOCATION_THROTTLE_MS } from '@/src/constants/tripRealtimeRhythm';
import {
  trackVerifyCamera,
  trackVerifyLog,
} from '@/src/components/tracking/map/trackVerifyLog';
import { useMapMarkerTracksChanges } from '@/src/components/tracking/map/useMapMarkerTracksChanges';
import {
  PickupMarker,
  DestinationMarker,
  StopMarker,
  UserLocationMarker,
} from '@/src/components/tracking/map/MapMarkers';
import { LIVE } from '@/src/components/tracking/live/liveTrackingTheme';
import { DriverConnectingOverlay } from '@/src/components/tracking/map/DriverConnectingOverlay';
import { useThemeColors } from '@/src/constants/theme';

export type LiveTrackingMapHandle = {
  recenter: () => void;
  toggleLayers: () => void;
  trafficOn: boolean;
};

export type LiveTrackingMapProps = {
  model: TrackingMapModel;
  connectingToDriver?: boolean;
};

function regionFromCoords(coords: { latitude: number; longitude: number }[], pad = 0.012) {
  if (!coords.length) {
    return { latitude: 6.5244, longitude: 3.3792, latitudeDelta: 0.08, longitudeDelta: 0.08 };
  }
  let minLat = coords[0].latitude;
  let maxLat = coords[0].latitude;
  let minLng = coords[0].longitude;
  let maxLng = coords[0].longitude;
  for (const c of coords) {
    minLat = Math.min(minLat, c.latitude);
    maxLat = Math.max(maxLat, c.latitude);
    minLng = Math.min(minLng, c.longitude);
    maxLng = Math.max(maxLng, c.longitude);
  }
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(0.02, maxLat - minLat + pad),
    longitudeDelta: Math.max(0.02, maxLng - minLng + pad),
  };
}

const LiveTrackingMapInner = forwardRef<LiveTrackingMapHandle, LiveTrackingMapProps>(
  function LiveTrackingMap({ model, connectingToDriver = false }, ref) {
    const mapRef = useRef<MapView>(null);
    const mapReadyRef = useRef(false);
    const [mapReady, setMapReady] = useState(false);
    const markerTracks = useMapMarkerTracksChanges(model.tripId);
    const [trafficOn, setTrafficOn] = useState(true);
    const { colors } = useThemeColors();
    const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(model.userLocation ?? null);
    const [approachRoute, setApproachRoute] = useState<{ latitude: number; longitude: number }[]>([]);
    const [tripRoute, setTripRoute] = useState<{ latitude: number; longitude: number }[]>([]);
    const [breadcrumbTrail, setBreadcrumbTrail] = useState<MapCoord[]>([]);
    const lastDriverRef = useRef<{ lat: number; lng: number } | null>(null);
    const lastApproachFetchRef = useRef<{ lat: number; lng: number; at: number } | null>(null);

    const pickup = model.pickup;
    const dropoff = model.dropoff;
    const stops = (model.stops || []).filter((s) => isValidMapCoord(s.lat, s.lng));
    const driver = model.driver;
    const isEnRoute = model.tripStatus === 'accepted' || model.tripStatus === 'arrived';
    const isOngoing = model.tripStatus === 'ongoing';

    useEffect(() => {
      if (!mapReady) return;
      let sub: Location.LocationSubscription | null = null;
      let lastTick = 0;
      let cancelled = false;
      void (async () => {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted' || cancelled) return;
        const created = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, timeInterval: 2000, distanceInterval: 8 },
          (pos) => {
            if (cancelled) return;
            const now = Date.now();
            if (now - lastTick < 1500) return;
            lastTick = now;
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            if (!isValidMapCoord(lat, lng)) return;
            setUserLoc({ lat, lng });
          },
        );
        sub = created;
        if (cancelled) created.remove();
      })();
      return () => {
        cancelled = true;
        sub?.remove();
      };
    }, [mapReady]);

    // pickup → destination (static leg)
    useEffect(() => {
      const key = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
      if (!key || !pickup || !dropoff) return;
      const cacheKey = model.tripId ? `trip-${model.tripId}-pickup-dropoff` : undefined;
      let cancelled = false;
      void fetchDirectionsResilient(
        pickup.lat,
        pickup.lng,
        dropoff.lat,
        dropoff.lng,
        key,
        cacheKey,
      ).then((result) => {
        if (cancelled) return;
        if (result?.coords?.length) {
          setTripRoute(result.coords);
          return;
        }
        if (model.routePolyline.length >= DIRECTIONS_ROUTE_MIN_POINTS) {
          setTripRoute(model.routePolyline);
        } else {
          setTripRoute([]);
        }
      });
      return () => {
        cancelled = true;
      };
    }, [pickup?.lat, pickup?.lng, dropoff?.lat, dropoff?.lng, model.routePolyline, model.tripId]);

    // driver → pickup (live approach leg)
    useEffect(() => {
      const key = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
      if (!key || !isEnRoute || !driver || !pickup) {
        if (!isEnRoute) setApproachRoute([]);
        return;
      }
      const prev = lastApproachFetchRef.current;
      const now = Date.now();
      const moved =
        !prev ||
        Math.abs(prev.lat - driver.lat) + Math.abs(prev.lng - driver.lng) > 0.0007;
      const stale = !prev || now - prev.at > 12000;
      if (!moved && !stale) return;
      lastApproachFetchRef.current = { lat: driver.lat, lng: driver.lng, at: now };

      const cacheKey = model.tripId ? `trip-${model.tripId}-approach` : undefined;
      let cancelled = false;
      void fetchDirectionsResilient(
        driver.lat,
        driver.lng,
        pickup.lat,
        pickup.lng,
        key,
        cacheKey,
      ).then((result) => {
        if (cancelled) return;
        if (result?.coords?.length) {
          setApproachRoute(result.coords);
        } else {
          setApproachRoute([]);
        }
      });
      return () => {
        cancelled = true;
      };
    }, [isEnRoute, driver?.lat, driver?.lng, pickup?.lat, pickup?.lng, model.tripId]);

    // ongoing: driver → destination — only re-fetch when driver deviates >150 m
    // from the last fetch origin to avoid a Directions API call every 3 s.
    const lastOngoingFetchRef = useRef<{ lat: number; lng: number; at: number } | null>(null);
    useEffect(() => {
      const key = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
      if (!key || !isOngoing || !driver || !dropoff) {
        if (!isOngoing) setApproachRoute([]);
        return;
      }
      const prev = lastOngoingFetchRef.current;
      const now = Date.now();
      // ~150 m in degrees ≈ 0.00135 — only refetch on meaningful deviation
      const movedEnough =
        !prev ||
        Math.abs(prev.lat - driver.lat) + Math.abs(prev.lng - driver.lng) > 0.00135;
      // Also refresh every 60 s regardless (route can change due to traffic)
      const stale = !prev || now - prev.at > 60_000;
      if (!movedEnough && !stale) return;
      lastOngoingFetchRef.current = { lat: driver.lat, lng: driver.lng, at: now };

      const cacheKey = model.tripId ? `trip-${model.tripId}-ongoing` : undefined;
      let cancelled = false;
      void fetchDirectionsResilient(
        driver.lat,
        driver.lng,
        dropoff.lat,
        dropoff.lng,
        key,
        cacheKey,
      ).then((result) => {
        if (cancelled) return;
        if (result?.coords?.length) setApproachRoute(result.coords);
      });
      return () => {
        cancelled = true;
      };
    }, [isOngoing, driver?.lat, driver?.lng, dropoff?.lat, dropoff?.lng, model.tripId]);

    const approachCoords = useMemo(() => sanitizeMapCoords(approachRoute), [approachRoute]);
    const tripCoords = useMemo(() => sanitizeMapCoords(tripRoute), [tripRoute]);

    const activeRoute = useMemo(() => {
      if (isOngoing && approachCoords.length >= DIRECTIONS_ROUTE_MIN_POINTS) return approachCoords;
      if (isEnRoute && approachCoords.length >= DIRECTIONS_ROUTE_MIN_POINTS) return approachCoords;
      if (tripCoords.length >= DIRECTIONS_ROUTE_MIN_POINTS) return tripCoords;
      return [];
    }, [isOngoing, isEnRoute, approachCoords, tripCoords]);

    const routeRemaining = useMemo(() => {
      const driverForSplit =
        driver && isValidMapCoord(driver.lat, driver.lng) ? driver : null;
      if (!driverForSplit || activeRoute.length < 2) {
        return { approach: approachCoords, trip: tripCoords };
      }
      const split = splitRouteAtDriver(activeRoute, driverForSplit);
      if (isOngoing || isEnRoute) {
        return { approach: sanitizeMapCoords(split.remaining), trip: tripCoords };
      }
      return { approach: approachCoords, trip: tripCoords };
    }, [activeRoute, approachCoords, tripCoords, isOngoing, isEnRoute, driver]);

    const lastHeadingRef = useRef(0);
    const driverHeading = useMemo(() => {
      if (model.driverHeading != null && Number.isFinite(Number(model.driverHeading))) {
        lastHeadingRef.current = Number(model.driverHeading);
        return lastHeadingRef.current;
      }
      const prev = lastDriverRef.current;
      if (driver && prev) {
        if (driverMovedEnough(prev, driver.lat, driver.lng)) {
          lastHeadingRef.current = bearingDeg(prev.lat, prev.lng, driver.lat, driver.lng);
        }
        return lastHeadingRef.current;
      }
      if (driver && activeRoute.length >= 2) {
        let best = 0;
        let bestD = Infinity;
        for (let i = 0; i < activeRoute.length; i += 1) {
          const dLat = activeRoute[i].latitude - driver.lat;
          const dLng = activeRoute[i].longitude - driver.lng;
          const d = dLat * dLat + dLng * dLng;
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
        const next = activeRoute[Math.min(best + 1, activeRoute.length - 1)];
        lastHeadingRef.current = bearingDeg(driver.lat, driver.lng, next.latitude, next.longitude);
        return lastHeadingRef.current;
      }
      return lastHeadingRef.current;
    }, [model.driverHeading, driver, activeRoute]);

    useEffect(() => {
      if (driver) lastDriverRef.current = { lat: driver.lat, lng: driver.lng };
    }, [driver?.lat, driver?.lng]);

    const mapPingRef = useRef(0);
    useEffect(() => {
      if (!__DEV__ || !driver || !isValidMapCoord(driver.lat, driver.lng)) return;
      mapPingRef.current += 1;
      trackVerifyLog(
        `map layer received driver #${mapPingRef.current} lat=${driver.lat.toFixed(6)},lng=${driver.lng.toFixed(6)} heading=${model.driverHeading ?? '—'}`,
      );
    }, [driver?.lat, driver?.lng, model.driverHeading]);

    const fitCoords = useMemo(() => {
      const pts = [...tripCoords, ...approachCoords];
      if (pickup && isValidMapCoord(pickup.lat, pickup.lng)) {
        pts.push({ latitude: pickup.lat, longitude: pickup.lng });
      }
      for (const s of stops) {
        pts.push({ latitude: s.lat, longitude: s.lng });
      }
      if (dropoff && isValidMapCoord(dropoff.lat, dropoff.lng)) {
        pts.push({ latitude: dropoff.lat, longitude: dropoff.lng });
      }
      if (driver && isValidMapCoord(driver.lat, driver.lng)) {
        pts.push({ latitude: driver.lat, longitude: driver.lng });
      }
      if (userLoc && isValidMapCoord(userLoc.lat, userLoc.lng)) {
        pts.push({ latitude: userLoc.lat, longitude: userLoc.lng });
      }
      return sanitizeMapCoords(pts);
    }, [tripCoords, approachCoords, pickup, stops, dropoff, driver, userLoc]);

    const initialRegion = useMemo(() => regionFromCoords(fitCoords), [fitCoords]);
    const followRef = useRef(true);
    const followResumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastFollowFitRef = useRef<{ lat: number; lng: number } | null>(null);

    const pauseAutoFollow = useCallback(() => {
      followRef.current = false;
      trackVerifyCamera('paused', 'user pan');
      if (followResumeTimerRef.current) clearTimeout(followResumeTimerRef.current);
      followResumeTimerRef.current = setTimeout(() => {
        followRef.current = true;
        trackVerifyCamera('resumed', 'followEnabled=true');
      }, 12_000);
    }, []);

    const recenter = useCallback(() => {
      if (!mapRef.current || !mapReadyRef.current || fitCoords.length < 1) return;
      if (followResumeTimerRef.current) clearTimeout(followResumeTimerRef.current);
      followRef.current = true;
      try {
        mapRef.current.fitToCoordinates(fitCoords, {
          edgePadding: { top: 130, right: 48, bottom: 260, left: 48 },
          animated: true,
        });
      } catch {
        /* native map not ready */
      }
    }, [fitCoords]);

    useEffect(() => {
      if (!model.tripId || !driver || !isValidMapCoord(driver.lat, driver.lng)) return;
      setBreadcrumbTrail(appendTripBreadcrumb(`rider:${model.tripId}`, driver.lat, driver.lng));
    }, [model.tripId, driver?.lat, driver?.lng]);

    useEffect(() => {
      if (!mapReady || !followRef.current || !mapRef.current) return;
      if (!driver || !isValidMapCoord(driver.lat, driver.lng)) return;
      const target = isOngoing ? dropoff : isEnRoute ? pickup : null;
      if (!target || !isValidMapCoord(target.lat, target.lng)) return;
      const prev = lastFollowFitRef.current;
      const movedEnough =
        !prev || Math.abs(prev.lat - driver.lat) + Math.abs(prev.lng - driver.lng) > 0.0008;
      if (!movedEnough) return;
      lastFollowFitRef.current = { lat: driver.lat, lng: driver.lng };
      const frame = cameraCenterForDriverAndTarget(
        { lat: driver.lat, lng: driver.lng },
        { lat: target.lat, lng: target.lng },
      );
      try {
        mapRef.current.animateCamera(
          {
            center: {
              // Bias slightly behind the car so the road ahead reads clearly (Uber-style).
              latitude: driver.lat * 0.78 + frame.latitude * 0.22,
              longitude: driver.lng * 0.78 + frame.longitude * 0.22,
            },
            zoom: Math.max(frame.zoom, MAP_3D.riderZoom - 0.6),
            heading: driverHeading || 0,
            pitch: MAP_3D.riderPitch,
            altitude: MAP_3D.tripAltitude + 80,
          },
          { duration: 680 },
        );
        const targetLabel = isOngoing ? 'dropoff' : 'pickup';
        trackVerifyCamera(
          'follow',
          `3d driver+${targetLabel} heading=${Math.round(driverHeading || 0)} pitch=${MAP_3D.riderPitch}`,
        );
      } catch {
        /* native map not ready */
      }
    }, [driver?.lat, driver?.lng, mapReady, isOngoing, isEnRoute, pickup, dropoff, driverHeading]);

    useEffect(
      () => () => {
        if (followResumeTimerRef.current) clearTimeout(followResumeTimerRef.current);
      },
      [],
    );

    useImperativeHandle(
      ref,
      () => ({
        recenter,
        toggleLayers: () => setTrafficOn((v) => !v),
        trafficOn,
      }),
      [recenter, trafficOn],
    );

    useEffect(() => {
      if (!mapReady || fitCoords.length < 2) return;
      const task = InteractionManager.runAfterInteractions(() => recenter());
      return () => task.cancel();
    }, [model.tripId, mapReady, recenter]);

    // Allow map to render with just pickup — dropoff may arrive after the first status poll
    const canRender = pickup && isValidMapCoord(pickup.lat, pickup.lng);
    const safeDriver = driver && isValidMapCoord(driver.lat, driver.lng) ? driver : null;

    if (!canRender) return null;

    return (
      <>
      <MapView
        ref={mapRef}
        style={[styles.map, { backgroundColor: LIVE.mapBg || colors.surface }]}
        provider={PROVIDER_GOOGLE}
        customMapStyle={getPerfectTrackingMapStyle()}
        initialRegion={initialRegion}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass
        showsBuildings
        showsTraffic={trafficOn}
        rotateEnabled
        pitchEnabled
        onPanDrag={pauseAutoFollow}
        onMapReady={() => {
          mapReadyRef.current = true;
          setMapReady(true);
        }}
      >
        {tripCoords.length >= DIRECTIONS_ROUTE_MIN_POINTS ? (
          <Polyline
            coordinates={tripCoords}
            strokeColor="rgba(0,208,132,0.22)"
            strokeWidth={7}
            lineCap="round"
            lineJoin="round"
            zIndex={2}
          />
        ) : null}

        {routeRemaining.approach.length >= DIRECTIONS_ROUTE_MIN_POINTS ? (
          <Polyline
            coordinates={routeRemaining.approach}
            strokeColor={LIVE.green}
            strokeWidth={9}
            lineCap="round"
            lineJoin="round"
            zIndex={4}
          />
        ) : null}

        {breadcrumbTrail.length >= 2 ? (
          <Polyline
            coordinates={breadcrumbTrail}
            strokeColor={MAP.breadcrumb}
            strokeWidth={MAP.breadcrumbWidth}
            lineCap="round"
            lineJoin="round"
            zIndex={3}
          />
        ) : null}

        {pickup ? (
          <PickupMarker lat={pickup.lat} lng={pickup.lng} tracksViewChanges={markerTracks} />
        ) : null}
        {stops.map((s, i) => (
          <StopMarker
            key={`stop-${i}-${s.lat}-${s.lng}`}
            lat={s.lat}
            lng={s.lng}
            index={i + 1}
            tracksViewChanges={markerTracks}
          />
        ))}
        {dropoff ? (
          <DestinationMarker
            lat={dropoff.lat}
            lng={dropoff.lng}
            address={model.destinationAddress ?? undefined}
            tracksViewChanges={markerTracks}
          />
        ) : null}
        {isEnRoute && pickup ? (
          <EtaRoutePuck
            lat={pickup.lat}
            lng={pickup.lng}
            etaMin={model.etaMinutes ?? null}
            label="Pickup"
            tone="green"
          />
        ) : null}
        {isOngoing && stops[0] ? (
          <EtaRoutePuck
            lat={stops[0].lat}
            lng={stops[0].lng}
            etaMin={model.etaMinutes ?? null}
            label="Stop"
            tone="amber"
          />
        ) : null}
        {isOngoing && dropoff && !stops.length ? (
          <EtaRoutePuck
            lat={dropoff.lat}
            lng={dropoff.lng}
            etaMin={model.etaMinutes ?? null}
            label="Drop-off"
            tone="red"
          />
        ) : null}
        {isOngoing && dropoff && stops.length ? (
          <EtaRoutePuck
            lat={dropoff.lat}
            lng={dropoff.lng}
            etaMin={null}
            label="Drop-off"
            tone="red"
          />
        ) : null}
        {(() => {
          const riderPos =
            userLoc && isValidMapCoord(userLoc.lat, userLoc.lng)
              ? userLoc
              : pickup && isValidMapCoord(pickup.lat, pickup.lng)
                ? { lat: pickup.lat, lng: pickup.lng }
                : null;
          const showUser =
            riderPos &&
            (!pickup ||
              Math.abs(riderPos.lat - pickup.lat) > 0.00015 ||
              Math.abs(riderPos.lng - pickup.lng) > 0.00015);
          return showUser ? (
            <UserLocationMarker lat={riderPos.lat} lng={riderPos.lng} tracksViewChanges={markerTracks} />
          ) : null;
        })()}
        {safeDriver ? (
          <DriverCarMarker
            lat={safeDriver.lat}
            lng={safeDriver.lng}
            heading={driverHeading}
            moving={isEnRoute || isOngoing}
            tracksViewChanges={markerTracks}
            moveDurationMs={RIDER_TRACKING_LOCATION_THROTTLE_MS}
          />
        ) : null}
      </MapView>
      <DriverConnectingOverlay visible={connectingToDriver} />
      </>
    );
  },
);

export const LiveTrackingMap = memo(LiveTrackingMapInner);

const styles = StyleSheet.create({
  map: { flex: 1 },
});

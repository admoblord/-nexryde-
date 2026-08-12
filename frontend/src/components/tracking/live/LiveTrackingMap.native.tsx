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
    // Off by default: congestion colours compete with the route line at trip zoom
    // and the route must stay the highest-contrast thing on the map.
    const [trafficOn, setTrafficOn] = useState(false);
    const { colors } = useThemeColors();
    const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(model.userLocation ?? null);
    const [breadcrumbTrail, setBreadcrumbTrail] = useState<MapCoord[]>([]);
    const lastDriverRef = useRef<{ lat: number; lng: number } | null>(null);

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

    // Server stores ONE polyline per leg — never call Google Directions from the rider map.
    const tripCoords = useMemo(
      () => sanitizeMapCoords(model.routePolyline),
      [model.routePolyline],
    );

    const activeRoute = useMemo(() => {
      if (tripCoords.length >= DIRECTIONS_ROUTE_MIN_POINTS) return tripCoords;
      return [];
    }, [tripCoords]);

    const approachCoords = useMemo(() => {
      if (!driver || activeRoute.length < 2) return [];
      const { remaining } = splitRouteAtDriver(activeRoute, driver);
      return remaining.length >= 2 ? remaining : activeRoute;
    }, [activeRoute, driver]);

    /**
     * The drawn route follows the phase, not the booking.
     *
     * While the driver is still coming, the line is driver → pickup. Drawing the
     * pickup → destination route then is a lie: it shows the rider a path their
     * car is not on. The server keeps one polyline per leg and the rider map is
     * not allowed to call Directions, so the approach leg is a direct line.
     * Once the trip starts, the trip polyline takes over.
     */
    const routeRemaining = useMemo(() => {
      const driverForSplit =
        driver && isValidMapCoord(driver.lat, driver.lng) ? driver : null;

      if (isEnRoute) {
        const approach =
          driverForSplit && pickup && isValidMapCoord(pickup.lat, pickup.lng)
            ? sanitizeMapCoords([
                { latitude: driverForSplit.lat, longitude: driverForSplit.lng },
                { latitude: pickup.lat, longitude: pickup.lng },
              ])
            : [];
        return { approach, trip: [] as typeof tripCoords };
      }

      if (isOngoing) {
        if (!driverForSplit || activeRoute.length < 2) {
          return { approach: approachCoords, trip: tripCoords };
        }
        const split = splitRouteAtDriver(activeRoute, driverForSplit);
        return { approach: sanitizeMapCoords(split.remaining), trip: tripCoords };
      }

      return { approach: approachCoords, trip: tripCoords };
    }, [activeRoute, approachCoords, tripCoords, isOngoing, isEnRoute, driver, pickup]);

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

    /**
     * Fit the pair that matters for this phase.
     *
     * Including every known point — full trip polyline, pickup, dropoff, driver
     * and the rider — is what zoomed the live trip out across half of Lagos
     * while the driver was two streets away.
     */
    const fitCoords = useMemo(() => {
      const pts: Array<{ latitude: number; longitude: number }> = [];
      const driverPt =
        driver && isValidMapCoord(driver.lat, driver.lng)
          ? { latitude: driver.lat, longitude: driver.lng }
          : null;
      const pickupPt =
        pickup && isValidMapCoord(pickup.lat, pickup.lng)
          ? { latitude: pickup.lat, longitude: pickup.lng }
          : null;
      const dropoffPt =
        dropoff && isValidMapCoord(dropoff.lat, dropoff.lng)
          ? { latitude: dropoff.lat, longitude: dropoff.lng }
          : null;

      if (isEnRoute) {
        // Driver + pickup only.
        if (driverPt) pts.push(driverPt);
        if (pickupPt) pts.push(pickupPt);
      } else if (isOngoing) {
        // Where the car is now + where it is going, plus any remaining stop.
        if (driverPt) pts.push(driverPt);
        for (const s of stops) pts.push({ latitude: s.lat, longitude: s.lng });
        if (dropoffPt) pts.push(dropoffPt);
        if (pts.length < 2) pts.push(...tripCoords);
      } else {
        // Pre-assignment: the booked route.
        if (pickupPt) pts.push(pickupPt);
        for (const s of stops) pts.push({ latitude: s.lat, longitude: s.lng });
        if (dropoffPt) pts.push(dropoffPt);
        if (pts.length < 2) pts.push(...tripCoords);
      }

      return sanitizeMapCoords(pts);
    }, [tripCoords, pickup, stops, dropoff, driver, isEnRoute, isOngoing]);

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
        {routeRemaining.trip.length >= DIRECTIONS_ROUTE_MIN_POINTS ? (
          <Polyline
            coordinates={routeRemaining.trip}
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
          // Amber once the driver is standing at pickup — that badge means act now.
          <EtaRoutePuck
            lat={pickup.lat}
            lng={pickup.lng}
            etaMin={model.tripStatus === 'arrived' ? null : (model.etaMinutes ?? null)}
            label={model.tripStatus === 'arrived' ? 'Driver is here' : 'Pickup'}
            tone={model.tripStatus === 'arrived' ? 'amber' : 'navy'}
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
            label="Dropoff"
            tone="navy"
            valueMode="arrivalClock"
          />
        ) : null}
        {isOngoing && dropoff && stops.length ? (
          <EtaRoutePuck
            lat={dropoff.lat}
            lng={dropoff.lng}
            etaMin={null}
            label="Dropoff"
            tone="navy"
            valueMode="arrivalClock"
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
            status="on_trip"
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

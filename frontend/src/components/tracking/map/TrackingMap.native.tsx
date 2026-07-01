import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { StyleSheet, InteractionManager } from 'react-native';
import MapView, { Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { useAnimatedRouteCoords } from '@/src/hooks/useAnimatedRouteCoords';
import { fetchDirections } from '@/src/navigation/navUtils';
import type { TrackingMapModel } from '@/src/components/tracking/types';
import {
  PERFECT_TRACKING,
  PERFECT_TRACKING_MAP_STYLE,
} from '@/src/components/tracking/trackingMapTokens';
import {
  buildFallbackPolyline,
  distanceMarkersAlongRoute,
  bearingDeg,
  isValidMapCoord,
  sanitizeMapCoords,
} from '@/src/components/tracking/map/mapUtils';
import { DriverCarMarker } from '@/src/components/tracking/map/DriverCarMarker';
import { useMapMarkerTracksChanges } from '@/src/components/tracking/map/useMapMarkerTracksChanges';
import {
  PickupMarker,
  DestinationMarker,
  UserLocationMarker,
  DistanceKmMarker,
} from '@/src/components/tracking/map/MapMarkers';

export type TrackingMapHandle = {
  zoomIn: () => void;
  zoomOut: () => void;
  recenter: () => void;
  toggleLayers: () => void;
};

export type TrackingMapProps = {
  model: TrackingMapModel;
};

function regionFromCoords(
  coords: Array<{ latitude: number; longitude: number }>,
  pad = 0.012,
) {
  if (!coords.length) {
    return {
      latitude: 6.5244,
      longitude: 3.3792,
      latitudeDelta: 0.08,
      longitudeDelta: 0.08,
    };
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
  const latDelta = Math.max(0.02, maxLat - minLat + pad);
  const lngDelta = Math.max(0.02, maxLng - minLng + pad);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: latDelta,
    longitudeDelta: lngDelta,
  };
}

export const TrackingMap = forwardRef<TrackingMapHandle, TrackingMapProps>(function TrackingMap(
  { model },
  ref,
) {
  const mapRef = useRef<MapView>(null);
  const mapReadyRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const markerTracks = useMapMarkerTracksChanges(model.tripId);
  const [trafficOn, setTrafficOn] = useState(true);
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(
    model.userLocation ?? null,
  );
  const [directionsRoute, setDirectionsRoute] = useState<
    Array<{ latitude: number; longitude: number }>
  >([]);
  const lastDriverRef = useRef<{ lat: number; lng: number } | null>(null);
  const lastDirFetchRef = useRef<{ lat: number; lng: number; at: number } | null>(null);

  const pickup = model.pickup;
  const dropoff = model.dropoff;
  const driver = model.driver;

  useEffect(() => {
    if (model.userLocation) setUserLoc(model.userLocation);
  }, [model.userLocation?.lat, model.userLocation?.lng]);

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
      if (cancelled) {
        created.remove();
        sub = null;
      }
    })();
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [mapReady]);

  useEffect(() => {
    const key = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!key) return;

    const isEnRoute = model.tripStatus === 'accepted' || model.tripStatus === 'arrived';
    const isOngoing = model.tripStatus === 'ongoing';

    let origin: { lat: number; lng: number } | null = null;
    let dest: { lat: number; lng: number } | null = null;

    if (isEnRoute && driver && pickup) {
      origin = { lat: driver.lat, lng: driver.lng };
      dest = { lat: pickup.lat, lng: pickup.lng };
    } else if (isOngoing && driver && dropoff) {
      origin = { lat: driver.lat, lng: driver.lng };
      dest = { lat: dropoff.lat, lng: dropoff.lng };
    } else if (pickup && dropoff) {
      origin = { lat: pickup.lat, lng: pickup.lng };
      dest = { lat: dropoff.lat, lng: dropoff.lng };
    }

    if (!origin || !dest) return;

    const prevFetch = lastDirFetchRef.current;
    const now = Date.now();
    const movedEnough =
      !prevFetch ||
      Math.abs(prevFetch.lat - origin.lat) + Math.abs(prevFetch.lng - origin.lng) > 0.0007;
    const staleEnough = !prevFetch || now - prevFetch.at > 15000;
    if ((isEnRoute || isOngoing) && !movedEnough && !staleEnough) return;
    lastDirFetchRef.current = { lat: origin.lat, lng: origin.lng, at: now };

    let cancelled = false;
    void fetchDirections(origin.lat, origin.lng, dest.lat, dest.lng, key).then((dir) => {
      if (cancelled || !dir?.overviewCoords?.length) return;
      setDirectionsRoute(dir.overviewCoords);
    });
    return () => {
      cancelled = true;
    };
  }, [
    pickup?.lat,
    pickup?.lng,
    dropoff?.lat,
    dropoff?.lng,
    driver?.lat,
    driver?.lng,
    model.tripStatus,
  ]);

  const baseRoute = useMemo(() => {
    const isEnRoute = model.tripStatus === 'accepted' || model.tripStatus === 'arrived';
    const isOngoing = model.tripStatus === 'ongoing';

    if (isEnRoute) {
      if (directionsRoute.length >= 2) return sanitizeMapCoords(directionsRoute);
      if (driver && pickup && isValidMapCoord(driver.lat, driver.lng) && isValidMapCoord(pickup.lat, pickup.lng)) {
        return sanitizeMapCoords(
          buildFallbackPolyline(
            { lat: driver.lat, lng: driver.lng },
            { lat: pickup.lat, lng: pickup.lng },
            null,
          ),
        );
      }
      return [];
    }

    if (isOngoing) {
      let raw: Array<{ latitude: number; longitude: number }> = [];
      if (model.routePolyline.length >= 2) raw = model.routePolyline;
      else if (directionsRoute.length >= 2) raw = directionsRoute;
      else if (
        pickup &&
        dropoff &&
        isValidMapCoord(pickup.lat, pickup.lng) &&
        isValidMapCoord(dropoff.lat, dropoff.lng)
      ) {
        raw = buildFallbackPolyline(
          { lat: pickup.lat, lng: pickup.lng },
          { lat: dropoff.lat, lng: dropoff.lng },
          driver && isValidMapCoord(driver.lat, driver.lng) ? driver : null,
        );
      }
      return sanitizeMapCoords(raw);
    }

    if (directionsRoute.length >= 2) return sanitizeMapCoords(directionsRoute);
    if (model.routePolyline.length >= 2) return sanitizeMapCoords(model.routePolyline);
    if (
      pickup &&
      dropoff &&
      isValidMapCoord(pickup.lat, pickup.lng) &&
      isValidMapCoord(dropoff.lat, dropoff.lng)
    ) {
      return sanitizeMapCoords(
        buildFallbackPolyline(
          { lat: pickup.lat, lng: pickup.lng },
          { lat: dropoff.lat, lng: dropoff.lng },
          driver && isValidMapCoord(driver.lat, driver.lng) ? driver : null,
        ),
      );
    }
    return [];
  }, [model.routePolyline, model.tripStatus, directionsRoute, pickup, dropoff, driver]);

  const animatedRoute = useAnimatedRouteCoords(baseRoute, baseRoute.length >= 2, 1000);

  // Split the route at the driver's position once the trip is in progress:
  // traveled portion renders dimmed (Google-nav style), remaining stays bright.
  // Real congestion comes from the native traffic layer (showsTraffic), not
  // from artificially colouring route segments.
  const routeSplit = useMemo(() => {
    const all = { traveled: [] as typeof animatedRoute, remaining: animatedRoute };
    if (
      model.tripStatus !== 'ongoing' ||
      !driver ||
      !isValidMapCoord(driver.lat, driver.lng) ||
      animatedRoute.length < 2
    ) {
      return all;
    }
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < animatedRoute.length; i += 1) {
      const dLat = animatedRoute[i].latitude - driver.lat;
      const dLng = animatedRoute[i].longitude - driver.lng;
      const d = dLat * dLat + dLng * dLng;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    const driverPt = { latitude: driver.lat, longitude: driver.lng };
    return {
      traveled: best >= 1 ? [...animatedRoute.slice(0, best + 1), driverPt] : [],
      remaining: [driverPt, ...animatedRoute.slice(best)],
    };
  }, [animatedRoute, driver, model.tripStatus]);
  const kmMarkers = useMemo(
    () => distanceMarkersAlongRoute(animatedRoute, 5).slice(0, 12),
    [animatedRoute],
  );

  const lastHeadingRef = useRef(0);
  const driverHeading = useMemo(() => {
    if (model.driverHeading != null && Number.isFinite(Number(model.driverHeading))) {
      lastHeadingRef.current = Number(model.driverHeading);
      return lastHeadingRef.current;
    }
    const prev = lastDriverRef.current;
    if (driver && prev) {
      // When the car is paused (no meaningful movement) the bearing of two
      // identical points is 0 — keep facing the last real direction instead
      // of snapping north.
      const movedEnough =
        Math.abs(prev.lat - driver.lat) > 0.00003 ||
        Math.abs(prev.lng - driver.lng) > 0.00003;
      if (movedEnough) {
        lastHeadingRef.current = bearingDeg(prev.lat, prev.lng, driver.lat, driver.lng);
      }
      return lastHeadingRef.current;
    }
    if (driver && animatedRoute.length >= 2) {
      const idx = animatedRoute.findIndex(
        (p) =>
          Math.abs(p.latitude - driver.lat) < 0.0001 &&
          Math.abs(p.longitude - driver.lng) < 0.0001,
      );
      const i = idx >= 0 ? idx : 0;
      const next = animatedRoute[Math.min(i + 1, animatedRoute.length - 1)];
      lastHeadingRef.current = bearingDeg(driver.lat, driver.lng, next.latitude, next.longitude);
      return lastHeadingRef.current;
    }
    return lastHeadingRef.current;
  }, [model.driverHeading, driver, animatedRoute]);

  useEffect(() => {
    if (driver) lastDriverRef.current = { lat: driver.lat, lng: driver.lng };
  }, [driver?.lat, driver?.lng]);

  const fitCoords = useMemo(() => {
    const pts = [...animatedRoute];
    if (pickup && isValidMapCoord(pickup.lat, pickup.lng)) {
      pts.push({ latitude: pickup.lat, longitude: pickup.lng });
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
  }, [animatedRoute, pickup, dropoff, driver, userLoc]);

  const initialRegion = useMemo(() => regionFromCoords(fitCoords), [fitCoords]);

  const followRef = useRef(true);
  const lastFollowFitRef = useRef<{ lat: number; lng: number } | null>(null);

  const recenter = useCallback(() => {
    if (!mapRef.current || !mapReadyRef.current || fitCoords.length < 1) return;
    followRef.current = true;
    try {
      mapRef.current.fitToCoordinates(fitCoords, {
        edgePadding: { top: 100, right: 56, bottom: 200, left: 56 },
        animated: true,
      });
    } catch {
      /* native map not ready */
    }
  }, [fitCoords]);

  // Keep the car framed while it's moving: fit driver + pickup (en route to
  // rider) or driver + destination (trip ongoing). Throttled to ~90m of
  // movement and disabled as soon as the rider pans the map manually —
  // the recenter button re-enables it.
  useEffect(() => {
    if (!mapReady || !followRef.current || !mapRef.current) return;
    if (!driver || !isValidMapCoord(driver.lat, driver.lng)) return;
    const target =
      model.tripStatus === 'ongoing'
        ? dropoff
        : model.tripStatus === 'accepted' || model.tripStatus === 'arrived'
          ? pickup
          : null;
    if (!target || !isValidMapCoord(target.lat, target.lng)) return;
    const prev = lastFollowFitRef.current;
    const movedEnough =
      !prev ||
      Math.abs(prev.lat - driver.lat) + Math.abs(prev.lng - driver.lng) > 0.0008;
    if (!movedEnough) return;
    lastFollowFitRef.current = { lat: driver.lat, lng: driver.lng };
    try {
      mapRef.current.fitToCoordinates(
        [
          { latitude: driver.lat, longitude: driver.lng },
          { latitude: target.lat, longitude: target.lng },
        ],
        {
          edgePadding: { top: 130, right: 70, bottom: 230, left: 70 },
          animated: true,
        },
      );
    } catch {
      /* native map not ready */
    }
  }, [driver?.lat, driver?.lng, mapReady, model.tripStatus, pickup, dropoff]);

  useImperativeHandle(
    ref,
    () => ({
      zoomIn: () => {
        if (!mapReadyRef.current) return;
        void mapRef.current?.getCamera().then((cam) => {
          if (!cam?.zoom || !mapRef.current) return;
          mapRef.current.animateCamera({ zoom: (cam.zoom ?? 14) + 1 }, { duration: 250 });
        }).catch(() => undefined);
      },
      zoomOut: () => {
        if (!mapReadyRef.current) return;
        void mapRef.current?.getCamera().then((cam) => {
          if (!cam?.zoom || !mapRef.current) return;
          mapRef.current.animateCamera({ zoom: Math.max(8, (cam.zoom ?? 14) - 1) }, { duration: 250 });
        }).catch(() => undefined);
      },
      recenter,
      toggleLayers: () => setTrafficOn((v) => !v),
    }),
    [recenter],
  );

  useEffect(() => {
    if (!mapReady || fitCoords.length < 2) return;
    const task = InteractionManager.runAfterInteractions(() => {
      recenter();
    });
    return () => task.cancel();
  }, [model.tripId, mapReady]);

  const destAddress = model.destinationAddress ?? undefined;
  const canRenderMap =
    pickup &&
    dropoff &&
    isValidMapCoord(pickup.lat, pickup.lng) &&
    isValidMapCoord(dropoff.lat, dropoff.lng);

  const safeDriver =
    driver && isValidMapCoord(driver.lat, driver.lng) ? driver : null;

  if (!canRenderMap) {
    return null;
  }

  return (
    <MapView
      ref={mapRef}
      style={styles.map}
      provider={PROVIDER_GOOGLE}
      customMapStyle={PERFECT_TRACKING_MAP_STYLE}
      initialRegion={initialRegion}
      showsUserLocation={false}
      showsMyLocationButton={false}
      showsCompass={false}
      showsTraffic={trafficOn}
      rotateEnabled
      pitchEnabled={false}
      onPanDrag={() => {
        followRef.current = false;
      }}
      onMapReady={() => {
        mapReadyRef.current = true;
        setMapReady(true);
      }}
    >
      {animatedRoute.length >= 2 ? (
        <Polyline
          coordinates={animatedRoute}
          strokeColor="rgba(0,217,163,0.25)"
          strokeWidth={12}
          lineCap="round"
          lineJoin="round"
          zIndex={3}
        />
      ) : null}

      {routeSplit.remaining.length >= 2 ? (
        <Polyline
          coordinates={routeSplit.remaining}
          strokeColor={PERFECT_TRACKING.teal}
          strokeWidth={8}
          lineCap="round"
          lineJoin="round"
          zIndex={4}
        />
      ) : null}

      {routeSplit.traveled.length >= 2 ? (
        <Polyline
          coordinates={routeSplit.traveled}
          strokeColor="rgba(100,116,139,0.75)"
          strokeWidth={6}
          lineCap="round"
          lineJoin="round"
          zIndex={5}
        />
      ) : null}

      {kmMarkers.map((m) => (
        <DistanceKmMarker key={`km-${m.km}`} lat={m.latitude} lng={m.longitude} km={m.km} />
      ))}

      {pickup ? (
        <PickupMarker lat={pickup.lat} lng={pickup.lng} tracksViewChanges={markerTracks} />
      ) : null}
      {dropoff ? (
        <DestinationMarker
          lat={dropoff.lat}
          lng={dropoff.lng}
          address={destAddress}
          tracksViewChanges={markerTracks}
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
          <UserLocationMarker
            lat={riderPos.lat}
            lng={riderPos.lng}
            tracksViewChanges={markerTracks}
          />
        ) : null;
      })()}
      {safeDriver ? (
        <DriverCarMarker
          lat={safeDriver.lat}
          lng={safeDriver.lng}
          heading={driverHeading}
          moving={
            model.tripStatus === 'accepted' ||
            model.tripStatus === 'arrived' ||
            model.tripStatus === 'ongoing'
          }
          tracksViewChanges={markerTracks}
        />
      ) : null}
    </MapView>
  );
});

const styles = StyleSheet.create({
  map: { flex: 1, backgroundColor: PERFECT_TRACKING.bg },
});

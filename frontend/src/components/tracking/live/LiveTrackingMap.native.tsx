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
import { fetchDirections } from '@/src/navigation/navUtils';
import type { TrackingMapModel } from '@/src/components/tracking/types';
import {
  PERFECT_TRACKING,
  PERFECT_TRACKING_MAP_STYLE,
} from '@/src/components/tracking/trackingMapTokens';
import {
  buildFallbackPolyline,
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
} from '@/src/components/tracking/map/MapMarkers';
import { LIVE } from '@/src/components/tracking/live/liveTrackingTheme';

export type LiveTrackingMapHandle = {
  recenter: () => void;
  toggleLayers: () => void;
  trafficOn: boolean;
};

export type LiveTrackingMapProps = {
  model: TrackingMapModel;
};

function regionFromCoords(coords: Array<{ latitude: number; longitude: number }>, pad = 0.012) {
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
  function LiveTrackingMap({ model }, ref) {
    const mapRef = useRef<MapView>(null);
    const mapReadyRef = useRef(false);
    const [mapReady, setMapReady] = useState(false);
    const markerTracks = useMapMarkerTracksChanges(model.tripId);
    const [trafficOn, setTrafficOn] = useState(true);
    const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(model.userLocation ?? null);
    const [approachRoute, setApproachRoute] = useState<Array<{ latitude: number; longitude: number }>>([]);
    const [tripRoute, setTripRoute] = useState<Array<{ latitude: number; longitude: number }>>([]);
    const lastDriverRef = useRef<{ lat: number; lng: number } | null>(null);
    const lastApproachFetchRef = useRef<{ lat: number; lng: number; at: number } | null>(null);

    const pickup = model.pickup;
    const dropoff = model.dropoff;
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
      let cancelled = false;
      void fetchDirections(pickup.lat, pickup.lng, dropoff.lat, dropoff.lng, key).then((dir) => {
        if (cancelled) return;
        if (dir?.overviewCoords?.length) {
          setTripRoute(dir.overviewCoords);
          return;
        }
        if (model.routePolyline.length >= 2) {
          setTripRoute(model.routePolyline);
        } else {
          setTripRoute(
            buildFallbackPolyline(
              { lat: pickup.lat, lng: pickup.lng },
              { lat: dropoff.lat, lng: dropoff.lng },
              null,
            ),
          );
        }
      });
      return () => {
        cancelled = true;
      };
    }, [pickup?.lat, pickup?.lng, dropoff?.lat, dropoff?.lng, model.routePolyline]);

    // driver → pickup (live approach leg)
    useEffect(() => {
      const key = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
      if (!key || !isEnRoute || !driver || !pickup) return;
      const prev = lastApproachFetchRef.current;
      const now = Date.now();
      const moved =
        !prev ||
        Math.abs(prev.lat - driver.lat) + Math.abs(prev.lng - driver.lng) > 0.0007;
      const stale = !prev || now - prev.at > 12000;
      if (!moved && !stale) return;
      lastApproachFetchRef.current = { lat: driver.lat, lng: driver.lng, at: now };

      let cancelled = false;
      void fetchDirections(driver.lat, driver.lng, pickup.lat, pickup.lng, key).then((dir) => {
        if (cancelled) return;
        if (dir?.overviewCoords?.length) {
          setApproachRoute(dir.overviewCoords);
        } else {
          setApproachRoute(
            buildFallbackPolyline(
              { lat: driver.lat, lng: driver.lng },
              { lat: pickup.lat, lng: pickup.lng },
              null,
            ),
          );
        }
      });
      return () => {
        cancelled = true;
      };
    }, [isEnRoute, driver?.lat, driver?.lng, pickup?.lat, pickup?.lng]);

    // ongoing: driver → destination — only re-fetch when driver deviates >150 m
    // from the last fetch origin to avoid a Directions API call every 3 s.
    const lastOngoingFetchRef = useRef<{ lat: number; lng: number; at: number } | null>(null);
    useEffect(() => {
      const key = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
      if (!key || !isOngoing || !driver || !dropoff) return;
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

      let cancelled = false;
      void fetchDirections(driver.lat, driver.lng, dropoff.lat, dropoff.lng, key).then((dir) => {
        if (cancelled) return;
        if (dir?.overviewCoords?.length) setApproachRoute(dir.overviewCoords);
      });
      return () => {
        cancelled = true;
      };
    }, [isOngoing, driver?.lat, driver?.lng, dropoff?.lat, dropoff?.lng]);

    const approachCoords = useMemo(() => sanitizeMapCoords(approachRoute), [approachRoute]);
    const tripCoords = useMemo(() => sanitizeMapCoords(tripRoute), [tripRoute]);

    const lastHeadingRef = useRef(0);
    const driverHeading = useMemo(() => {
      if (model.driverHeading != null && Number.isFinite(Number(model.driverHeading))) {
        lastHeadingRef.current = Number(model.driverHeading);
        return lastHeadingRef.current;
      }
      const prev = lastDriverRef.current;
      if (driver && prev) {
        const moved =
          Math.abs(prev.lat - driver.lat) > 0.00003 || Math.abs(prev.lng - driver.lng) > 0.00003;
        if (moved) {
          lastHeadingRef.current = bearingDeg(prev.lat, prev.lng, driver.lat, driver.lng);
        }
        return lastHeadingRef.current;
      }
      return lastHeadingRef.current;
    }, [model.driverHeading, driver]);

    useEffect(() => {
      if (driver) lastDriverRef.current = { lat: driver.lat, lng: driver.lng };
    }, [driver?.lat, driver?.lng]);

    const fitCoords = useMemo(() => {
      const pts = [...tripCoords, ...approachCoords];
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
    }, [tripCoords, approachCoords, pickup, dropoff, driver, userLoc]);

    const initialRegion = useMemo(() => regionFromCoords(fitCoords), [fitCoords]);
    const followRef = useRef(true);
    const lastFollowFitRef = useRef<{ lat: number; lng: number } | null>(null);

    const recenter = useCallback(() => {
      if (!mapRef.current || !mapReadyRef.current || fitCoords.length < 1) return;
      followRef.current = true;
      try {
        mapRef.current.fitToCoordinates(fitCoords, {
          edgePadding: { top: 120, right: 56, bottom: 220, left: 56 },
          animated: true,
        });
      } catch {
        /* native map not ready */
      }
    }, [fitCoords]);

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
      try {
        mapRef.current.fitToCoordinates(
          [
            { latitude: driver.lat, longitude: driver.lng },
            { latitude: target.lat, longitude: target.lng },
          ],
          { edgePadding: { top: 130, right: 70, bottom: 240, left: 70 }, animated: true },
        );
      } catch {
        /* native map not ready */
      }
    }, [driver?.lat, driver?.lng, mapReady, isOngoing, isEnRoute, pickup, dropoff]);

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
        {tripCoords.length >= 2 ? (
          <Polyline
            coordinates={tripCoords}
            strokeColor="rgba(0,208,132,0.22)"
            strokeWidth={7}
            lineCap="round"
            lineJoin="round"
            zIndex={2}
          />
        ) : null}

        {approachCoords.length >= 2 ? (
          <Polyline
            coordinates={approachCoords}
            strokeColor={LIVE.green}
            strokeWidth={9}
            lineCap="round"
            lineJoin="round"
            zIndex={4}
          />
        ) : null}

        {pickup ? (
          <PickupMarker lat={pickup.lat} lng={pickup.lng} tracksViewChanges={markerTracks} />
        ) : null}
        {dropoff ? (
          <DestinationMarker
            lat={dropoff.lat}
            lng={dropoff.lng}
            address={model.destinationAddress ?? undefined}
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
          />
        ) : null}
      </MapView>
    );
  },
);

export const LiveTrackingMap = memo(LiveTrackingMapInner);

const styles = StyleSheet.create({
  map: { flex: 1, backgroundColor: LIVE.mapBg },
});

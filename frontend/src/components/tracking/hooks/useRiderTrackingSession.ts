import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Platform, Linking } from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useAppStore, type Trip } from '@/src/store/appStore';
import { useAuthedUserId } from '@/src/hooks/useAuthedUserId';
import { useETACountdown } from '@/src/hooks/useETACountdown';
import { useRiderTripRealtime, type RiderTripWsMessage } from '@/src/hooks/useRiderTripRealtime';
import {
  riderTripStatusPollIntervalMs,
  isRiderMapLiveTripStatus,
  isRiderMapFindingStatus,
  riderTripEtaFallbackPollMs,
  RIDER_TRACKING_CLIENT_ETA_MS,
  RIDER_TRACKING_LOCATION_THROTTLE_MS,
  RIDER_TRACKING_GPS_STALE_MS,
} from '@/src/constants/tripRealtimeRhythm';
import { RIDER_DRIVER_FOUND_HANDOFF_MS } from '@/src/constants/riderTripHandoff';
import {
  BACKEND_URL,
  getAuthHeaders,
  getActiveTrip,
  addFavoriteDriver,
  removeFavoriteDriver,
  triggerSOS,
} from '@/src/services/api';
import * as Location from 'expo-location';
import { fetchTripEta, fetchTripRoute } from '@/src/services/tripTrackingApi';
import { DIRECTIONS_ROUTE_MIN_POINTS } from '@/src/navigation/navUtils';
import { routePolylineFromTripRecord } from '@/src/utils/routePreviewCoords';
import { isValidMapCoord } from '@/src/components/tracking/map/mapUtils';
import { normalizeTripStatus } from '@/src/utils/tripStatus';
import {
  parseTripCoords,
  normalizeDriverInfo,
  mergeTripFromStatusPayload,
} from '@/src/utils/tripCoords';
import { pickDriverPhotoRaw } from '@/src/utils/tripProfilePhotos';
import { driverPingMovedEnough, parseTrackingPing } from '@/src/utils/riderTripLiveSync';
import { logLocationUpdated } from '@/src/utils/trackingLiveLogger';
import { getTripDriverCache, setTripDriverCache, clearTripDriverCache } from '@/src/utils/tripDriverCache';
import { openShareTrip } from '@/src/utils/openShareTrip';
import { useErrorToast } from '@/src/components/shared/ErrorToast';
import { breadcrumbTripCancelled } from '@/src/utils/sentryBreadcrumbs';
import {
  riderFinancialPaymentPending,
  isCashPaymentMethod,
} from '@/src/utils/tripPaymentMethod';

/**
 * Resolve the rider-facing screen status from the raw server trip.
 *
 * Uber/Bolt cash model: when the driver ends the trip it is TERMINALLY completed
 * and cash is auto-settled. The rider is never asked to confirm cash. So a cash
 * trip whose raw status is `completed` is always terminal `completed` here — even
 * if `payment_status` momentarily lags — and the rider is sent to the non-blocking
 * receipt. Only genuine wallet/transfer rides (payment still owed) map to
 * `pending_payment`. Safe-arrival / invisible-shield are surfaced separately and
 * must NEVER reopen a completed trip into a payment/active state (that was the
 * source of the looping cash-confirm sheet + booking lock).
 */
function resolveRiderScreenStatus(
  rawStatus: unknown,
  paymentStatus: unknown,
  paymentMethod: unknown,
): ReturnType<typeof normalizeTripStatus> {
  const raw = String(rawStatus || '').toLowerCase();
  if (raw === 'completed' && isCashPaymentMethod(paymentMethod as string | null | undefined)) {
    return 'completed';
  }
  return normalizeTripStatus(rawStatus as string | undefined, paymentStatus as string | undefined);
}
import type { TrackingMapModel } from '@/src/components/tracking/types';
import type { TrackingLiveDebug } from '@/src/components/tracking/v2/TrackingLiveDebugPanel';
import { resolveTrackingScreenPhase } from '@/src/components/tracking/v2/trackingScreenState';
import {
  isTripDriverAssigned,
  isTripFindingPhase,
  resolveAssignedDriverId,
  resolveAssignmentAcceptedAt,
  isTripAssignmentConfirmed,
} from '@/src/utils/tripAssignment';
import { usePickupWaitTimer } from '@/src/hooks/usePickupWaitTimer';
import { ETAService } from '@/src/services/etaService';
import { fetchWithTimeout } from '@/src/utils/fetchWithTimeout';
import { safeReplace } from '@/src/utils/navigationSafe';
import { managedFetch } from '@/src/services/networkManager';

function driverInfoFromTripDocument(trip: Record<string, unknown> | null | undefined) {
  if (!trip) return null;
  const photos = pickDriverPhotoRaw(trip);
  const info = {
    driver_id: trip.driver_id,
    name: trip.driver_name,
    vehicle: trip.vehicle_model || trip.vehicle_type,
    vehicle_model: trip.vehicle_model,
    vehicle_type: trip.vehicle_type,
    plate: trip.vehicle_plate,
    vehicle_plate: trip.vehicle_plate,
    color: trip.vehicle_color,
    vehicle_color: trip.vehicle_color,
    rating: trip.driver_rating,
    total_trips: trip.driver_total_trips || trip.driver_trips_completed,
    verified: trip.driver_verified,
    face_image: photos.face,
    profile_image: photos.profile,
  };
  return Object.values(info).some((value) => value != null && value !== '') ? info : null;
}

export function useRiderTrackingSession() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    tripId?: string;
    pickup?: string;
    destination?: string;
  }>();
  const { currentTrip, setCurrentTrip } = useAppStore();
  const { userId: riderId } = useAuthedUserId();

  const [loading, setLoading] = useState(() => {
    const trip = useAppStore.getState().currentTrip;
    const cachedDriver = getTripDriverCache();
    const hasTrip = Boolean(trip?.id);
    const hasDriverSeed = Boolean(
      cachedDriver?.driver_id ||
        trip?.driver_id ||
        (cachedDriver?.name && (cachedDriver?.plate || cachedDriver?.vehicle)),
    );
    return !(hasTrip && hasDriverSeed);
  });
  const [backgroundSyncing, setBackgroundSyncing] = useState(false);
  const [tripStatus, setTripStatus] = useState<string>(() => {
    const tripIdParam = typeof params.tripId === 'string' ? params.tripId : '';
    if (tripIdParam && currentTrip?.id === tripIdParam) {
      return normalizeTripStatus(currentTrip.status, currentTrip.payment_status);
    }
    if (!currentTrip?.id) return 'pending';
    return normalizeTripStatus(currentTrip.status, currentTrip.payment_status);
  });
  const [paymentStatus, setPaymentStatus] = useState('pending');
  const [driverInfo, setDriverInfo] = useState<Record<string, unknown> | null>(null);
  const [driverLocation, setDriverLocation] = useState<Record<string, unknown> | null>(null);
  const [serverEtaSeconds, setServerEtaSeconds] = useState<number | null>(null);
  const [distanceRemainingKm, setDistanceRemainingKm] = useState<number | null>(null);
  const [trackingStatus, setTrackingStatus] = useState<string | null>(null);
  const [locationStale, setLocationStale] = useState(false);
  const [snappedPolyline, setSnappedPolyline] = useState<Array<{ latitude: number; longitude: number }>>([]);
  const [isFavoriteDriver, setIsFavoriteDriver] = useState(false);
  const [acceptedBanner, setAcceptedBanner] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancellingRide, setCancellingRide] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const cancelInFlightRef = useRef(false);
  const toast = useErrorToast();
  /** Consecutive failed status syncs — drives the "live updates interrupted" banner. */
  const syncFailCountRef = useRef(0);
  const [syncError, setSyncError] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [liveDebug, setLiveDebug] = useState<TrackingLiveDebug>({
    driverLat: null,
    driverLng: null,
    lastGpsAt: null,
    updateCount: 0,
    wsConnected: false,
    lastWsAt: null,
    markerAnimating: false,
    routePoints: 0,
  });

  const lastLocationAtRef = useRef(Date.now());
  const lastDriverPingRef = useRef<{ lat: number; lng: number } | null>(null);
  const lastKnownDriverRef = useRef<{ lat: number; lng: number } | null>(null);
  const lastServerEtaAtRef = useRef(0);
  const lastLocationCommitRef = useRef(0);
  const navigationLockRef = useRef<string | null>(null);
  const tripStatusRef = useRef(tripStatus);
  const driverInfoRef = useRef(driverInfo);
  const acceptedBannerShownRef = useRef(false);

  tripStatusRef.current = tripStatus;
  driverInfoRef.current = driverInfo;

  const effectiveTripId = params.tripId || currentTrip?.id || '';
  const getCoords = useCallback((value: unknown) => parseTripCoords(value), []);

  const pickupCoords = getCoords(currentTrip?.pickup_location);
  const dropoffCoords = getCoords(currentTrip?.dropoff_location);
  const stopCoordsList = useMemo(() => {
    const raw = currentTrip?.stop_location;
    const one = getCoords(raw);
    return one ? [one] : [];
  }, [currentTrip?.stop_location, getCoords]);
  const liveDriverCoords = getCoords(driverLocation) ?? lastKnownDriverRef.current;

  const navigateOnce = useCallback((key: string, run: () => void) => {
    if (navigationLockRef.current === key) return;
    navigationLockRef.current = key;
    run();
  }, []);

  useEffect(() => {
    if (driverInfo && Object.keys(driverInfo).length > 0) setTripDriverCache(driverInfo);
  }, [driverInfo]);

  useEffect(() => {
    if (!isRiderMapLiveTripStatus(tripStatus)) clearTripDriverCache();
  }, [tripStatus]);

  useEffect(() => {
    if (!effectiveTripId) return;
    setDriverInfo((prev) => {
      if (prev && Object.keys(prev).length > 0) return prev;
      const cached = getTripDriverCache();
      const tripDriverId = currentTrip?.id === effectiveTripId ? currentTrip?.driver_id : null;
      if (cached && (!tripDriverId || String(cached.driver_id) === String(tripDriverId))) {
        return normalizeDriverInfo(cached);
      }
      if (currentTrip?.id === effectiveTripId && currentTrip.driver_id) {
        const seed = driverInfoFromTripDocument(currentTrip as unknown as Record<string, unknown>);
        if (seed) return normalizeDriverInfo(seed);
      }
      return prev;
    });
  }, [effectiveTripId, currentTrip?.id, currentTrip?.driver_id]);

  const assignedDriverId = useMemo(
    () => resolveAssignedDriverId(currentTrip, driverInfo),
    [currentTrip?.driver_id, currentTrip?.id, driverInfo?.driver_id, effectiveTripId],
  );

  const assignmentAcceptedAt = useMemo(
    () => resolveAssignmentAcceptedAt(currentTrip),
    [currentTrip?.accepted_at, currentTrip?.id],
  );

  const isFindingPhase = isTripFindingPhase(tripStatus, assignedDriverId, assignmentAcceptedAt);
  const isDriverAssigned = isTripDriverAssigned(tripStatus, assignedDriverId, assignmentAcceptedAt);
  const isLivePhase = isDriverAssigned;
  // Only genuine wallet/transfer rides (fare still owed) use the payment UI.
  // A terminally-completed trip (incl. all cash) goes straight to the receipt.
  const isPaymentPhase = tripStatus === 'pending_payment';
  const trackingPhase = resolveTrackingScreenPhase(tripStatus, Boolean(effectiveTripId), assignedDriverId);

  const driverGpsReady = useMemo(() => {
    const d = liveDriverCoords;
    return Boolean(d && isValidMapCoord(d.lat, d.lng));
  }, [liveDriverCoords?.lat, liveDriverCoords?.lng]);

  const awaitingDriverGps = isLivePhase && !driverGpsReady;

  const driverHydrated = useMemo(() => {
    if (!driverInfo || Object.keys(driverInfo).length === 0) return false;
    const name = String(driverInfo.name || '').trim();
    const vehicle = String(driverInfo.vehicle || driverInfo.vehicle_model || '').trim();
    const plate = String(driverInfo.plate || driverInfo.vehicle_plate || '').trim();
    return Boolean(name && name !== 'Driver' && (plate || (vehicle && vehicle !== 'Vehicle')));
  }, [driverInfo]);

  const commitDriverLocation = useCallback((location: Record<string, unknown>) => {
    const now = Date.now();
    const lat = Number(location.lat);
    const lng = Number(location.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const prev = lastDriverPingRef.current;
    const movedEnough = !prev || driverPingMovedEnough(prev, { lat, lng }, 2);
    const heartbeatDue = now - lastLocationCommitRef.current >= RIDER_TRACKING_LOCATION_THROTTLE_MS;
    if (prev && !movedEnough && !heartbeatDue) return;

    lastLocationCommitRef.current = now;
    lastDriverPingRef.current = { lat, lng };
    lastKnownDriverRef.current = { lat, lng };
    lastLocationAtRef.current = now;
    setLocationStale(false);
    setDriverLocation(location);
    setLiveDebug((d) => ({
      ...d,
      driverLat: lat,
      driverLng: lng,
      lastGpsAt: typeof location.updated_at === 'string' ? location.updated_at : new Date(now).toISOString(),
      updateCount: d.updateCount + 1,
      markerAnimating: movedEnough,
      lastWsAt: new Date(now).toISOString(),
    }));
    logLocationUpdated({ lat, lng, heading: location.heading, speed_kmh: location.speed_kmh });
  }, []);

  const fareDisplay = useMemo(() => {
    const f = currentTrip?.fare;
    if (f == null || !Number.isFinite(Number(f)) || Number(f) <= 0) return null;
    return `₦${Number(f).toLocaleString('en-NG')}`;
  }, [currentTrip?.fare]);

  const tripPaymentMethod = currentTrip?.payment_method ?? 'cash';
  const financialPaymentPending = useMemo(() => {
    if (tripStatus !== 'pending_payment') return false;
    return riderFinancialPaymentPending('completed', paymentStatus);
  }, [tripStatus, paymentStatus]);

  // Only enable call when trip is active AND driver has a phone number available
  const driverPhone = typeof driverInfo?.phone === 'string' && driverInfo.phone.trim()
    ? driverInfo.phone.trim()
    : null;
  const callAllowed =
    Boolean(driverPhone) &&
    (['accepted', 'arrived', 'ongoing', 'pending_payment'].includes(tripStatus) || isFavoriteDriver);

  const liveEta = useETACountdown(serverEtaSeconds, trackingStatus);

  const arrivedAtIso = useMemo(() => {
    const trip = currentTrip as { arrived_at?: string } | null;
    return trip?.arrived_at ?? null;
  }, [currentTrip]);

  const startedAtIso = useMemo(() => {
    const trip = currentTrip as { started_at?: string } | null;
    return trip?.started_at ?? null;
  }, [currentTrip]);

  const pickupWait = usePickupWaitTimer(arrivedAtIso, tripStatus === 'arrived');

  const statusLabel = useMemo(() => {
    switch (tripStatus) {
      case 'arrived':
        return pickupWait.phase === 'free'
          ? 'DRIVER AT PICKUP'
          : 'DRIVER WAITING';
      case 'ongoing':
        return 'TRIP IN PROGRESS';
      case 'accepted':
        return 'DRIVER EN ROUTE';
      default:
        return 'TRACKING';
    }
  }, [tripStatus, pickupWait.phase]);

  const statusSubline = useMemo(() => {
    if (!isDriverAssigned) return 'Confirming your driver assignment…';
    if (awaitingDriverGps && tripStatus !== 'arrived') {
      return 'Connecting to your driver…';
    }
    if (locationStale) return 'Updating live driver location…';
    if (tripStatus === 'arrived') {
      if (pickupWait.phase !== 'idle') return pickupWait.subline;
      return 'Your driver is at the pickup point. Walk out to meet them.';
    }
    if (tripStatus === 'ongoing') {
      if (awaitingDriverGps) return 'Connecting to your driver…';
      if (liveEta.etaMinutes != null && liveEta.etaMinutes > 0) {
        const dist = distanceRemainingKm != null && Number.isFinite(Number(distanceRemainingKm))
          ? Number(distanceRemainingKm) < 1
            ? `${Math.round(Number(distanceRemainingKm) * 1000)} m to go`
            : `${Number(distanceRemainingKm).toFixed(1)} km to go`
          : null;
        return dist
          ? `Arriving in ${liveEta.etaMinutes} min · ${dist}`
          : `Arriving in ${liveEta.etaMinutes} minute${liveEta.etaMinutes === 1 ? '' : 's'}`;
      }
      return 'Trip in progress — enjoy your ride';
    }
    if (liveEta.status === 'arrived') return 'Your driver has arrived at pickup';
    if (awaitingDriverGps) return 'Connecting to your driver…';
    if (liveEta.etaMinutes != null && liveEta.etaMinutes > 0) {
      const dist = distanceRemainingKm != null && Number.isFinite(Number(distanceRemainingKm))
        ? Number(distanceRemainingKm) < 1
          ? `${Math.round(Number(distanceRemainingKm) * 1000)} m away`
          : `${Number(distanceRemainingKm).toFixed(1)} km away`
        : null;
      return dist
        ? `Driver arriving in ${liveEta.etaMinutes} min · ${dist}`
        : `Driver arriving in ${liveEta.etaMinutes} minute${liveEta.etaMinutes === 1 ? '' : 's'}`;
    }
    return liveEta.subline || 'Tracking your driver in real time';
  }, [locationStale, liveEta, distanceRemainingKm, tripStatus, pickupWait, isDriverAssigned, awaitingDriverGps]);

  const destinationAddress = useMemo(() => {
    const trip = currentTrip as { dropoff_address?: string; destination?: string } | null;
    const fromTrip = trip?.dropoff_address || trip?.destination;
    if (fromTrip && String(fromTrip).trim()) return String(fromTrip).trim();
    const paramDest = typeof params.destination === 'string' ? params.destination : '';
    return paramDest.trim() || null;
  }, [currentTrip, params.destination]);

  // Seed finding-phase route from fare estimate / trip preview (don't wait for live phase).
  useEffect(() => {
    if (!currentTrip) return;
    const seeded = routePolylineFromTripRecord(
      currentTrip as { route_preview_coordinates?: unknown; polyline?: unknown },
    );
    if (seeded.length < DIRECTIONS_ROUTE_MIN_POINTS) return;
    setSnappedPolyline((prev) => (prev.length >= seeded.length ? prev : seeded));
  }, [effectiveTripId, currentTrip]);

  const mapModel: TrackingMapModel = useMemo(
    () => ({
      pickup: pickupCoords,
      dropoff: dropoffCoords,
      stops: stopCoordsList,
      driver: liveDriverCoords,
      driverHeading:
        driverLocation?.heading != null ? Number(driverLocation.heading) : null,
      routePolyline: snappedPolyline,
      tripStatus,
      tripId: effectiveTripId,
      destinationAddress,
      distanceKm: distanceRemainingKm,
      etaMinutes: liveEta.etaMinutes,
    }),
    [
      pickupCoords,
      dropoffCoords,
      stopCoordsList,
      liveDriverCoords,
      driverLocation,
      snappedPolyline,
      tripStatus,
      effectiveTripId,
      destinationAddress,
      distanceRemainingKm,
      liveEta.etaMinutes,
    ],
  );

  /**
   * Trip was cancelled remotely — route home and, when the DRIVER cancelled,
   * tell the rider who cancelled (+ reason) and offer one-tap rebooking.
   */
  const handleRemoteCancelled = useCallback(
    (payload: Record<string, unknown> | null | undefined) => {
      setCurrentTrip(null);
      navigateOnce(`cancelled-${effectiveTripId}`, () => {
        const byDriver = String(payload?.cancelled_by_role ?? '') === 'driver';
        const reason = String(payload?.cancellation_reason ?? '').trim();
        safeReplace(router, '/(rider-tabs)/rider-home');
        if (!byDriver) return;
        // Let the home screen mount before surfacing the native alert.
        setTimeout(() => {
          Alert.alert(
            'Trip cancelled by driver',
            reason
              ? `Your driver cancelled this trip — ${reason}. We can find you another ride right away.`
              : 'Your driver cancelled this trip. We can find you another ride right away.',
            [
              { text: 'Not now', style: 'cancel' },
              { text: 'Book another ride', onPress: () => router.push('/rider/book' as any) },
            ],
          );
        }, 450);
      });
    },
    [effectiveTripId, navigateOnce, router, setCurrentTrip],
  );

  const fetchStatus = useCallback(async () => {
    if (!effectiveTripId || !riderId) return;
    const hasCachedUi = Boolean(driverInfoRef.current && Object.keys(driverInfoRef.current).length);
    if (hasCachedUi) setBackgroundSyncing(true);
    try {
      const res = await fetchWithTimeout(
        `${BACKEND_URL}/api/trips/${effectiveTripId}/status`,
        { headers: getAuthHeaders(), timeoutMs: 8000 },
      );
      const data = await res.json();
      if (!res.ok || !data?.success) {
        syncFailCountRef.current += 1;
        if (syncFailCountRef.current >= 2) setSyncError(true);
        return;
      }
      syncFailCountRef.current = 0;
      setSyncError(false);
      setLastSyncAt(Date.now());

      // Completion is terminal. Cash is settled at completion (never pending);
      // safe-arrival / shield no longer hold the rider on the payment phase.
      const screenStatus = resolveRiderScreenStatus(
        data.status,
        data.payment_status,
        data.payment_method,
      );
      const merged = mergeTripFromStatusPayload(
        currentTrip?.id === effectiveTripId ? currentTrip : null,
        effectiveTripId,
        riderId,
        {
          ...(data as Record<string, unknown>),
          arrived_at:
            (data as Record<string, unknown>).arrived_at ??
            (data as { pickup_wait?: { arrived_at?: string } }).pickup_wait?.arrived_at,
        },
        screenStatus,
      );
      const confirmedDriverId = resolveAssignedDriverId(merged, data.driver_info);
      const acceptedAt = resolveAssignmentAcceptedAt(merged);
      const uiStatus =
        isRiderMapLiveTripStatus(screenStatus) &&
        !isTripAssignmentConfirmed(screenStatus, confirmedDriverId, acceptedAt)
          ? 'pending_driver_offers'
          : screenStatus;

      setTripStatus(uiStatus);
      setPaymentStatus(data.payment_status || 'pending');
      const normalizedDriver = normalizeDriverInfo(data.driver_info);
      setDriverInfo(normalizedDriver);
      if (normalizedDriver) setTripDriverCache(normalizedDriver);

      const ping = parseTrackingPing({
        driver_location: data.driver_location,
        eta_seconds: data.live_eta?.eta_seconds ?? data.driver_location?.eta_seconds,
        distance_remaining_km:
          data.live_eta?.distance_km ?? data.driver_location?.distance_km,
        speed_kmh: data.current_speed_kmh ?? data.driver_location?.speed_kmh,
      });
      if (ping.etaSeconds != null) {
        setServerEtaSeconds(Math.max(0, Math.floor(ping.etaSeconds)));
        lastServerEtaAtRef.current = Date.now();
      }
      if (ping.distanceKm != null) setDistanceRemainingKm(ping.distanceKm);
      if (ping.trackingStatus) setTrackingStatus(ping.trackingStatus);
      if (ping.location) {
        commitDriverLocation(ping.location as Record<string, unknown>);
      }

      setCurrentTrip({ ...merged, status: uiStatus } as typeof merged);
      const routeSeed = routePolylineFromTripRecord({
        ...merged,
        route_preview_coordinates: (data as { route_preview_coordinates?: unknown }).route_preview_coordinates,
        polyline: (data as { polyline?: unknown }).polyline,
      });
      if (routeSeed.length >= DIRECTIONS_ROUTE_MIN_POINTS) {
        setSnappedPolyline((prev) => (prev.length >= routeSeed.length ? prev : routeSeed));
      }

      if (uiStatus === 'cancelled') {
        handleRemoteCancelled(data as Record<string, unknown>);
        return;
      }
      if (screenStatus === 'completed') {
        navigateOnce(`receipt-${effectiveTripId}`, () =>
          safeReplace(router, {
            pathname: '/rider/trip-receipt',
            params: { tripId: effectiveTripId },
          }),
        );
      }
    } catch {
      syncFailCountRef.current += 1;
      if (syncFailCountRef.current >= 2) setSyncError(true);
    } finally {
      setLoading(false);
      setBackgroundSyncing(false);
    }
  }, [effectiveTripId, riderId, currentTrip, setCurrentTrip, router, navigateOnce, handleRemoteCancelled]);

  const applyClientEta = useCallback(() => {
    if (!isRiderMapLiveTripStatus(tripStatusRef.current)) return;
    const driver = lastDriverPingRef.current;
    if (!driver) return;
    const target =
      tripStatusRef.current === 'ongoing' ? dropoffCoords : pickupCoords;
    if (!target) return;
    const speed =
      Number(driverLocation?.speed_kmh) ||
      Number((driverLocation as { speed?: number })?.speed) ||
      40;
    const estimate = ETAService.calculateETA(
      { lat: driver.lat, lng: driver.lng },
      { lat: target.lat, lng: target.lng },
      speed,
    );
    const staleServer = Date.now() - lastServerEtaAtRef.current > 3500;
    if (staleServer) {
      setServerEtaSeconds(estimate.etaSeconds);
      setDistanceRemainingKm(estimate.distanceKm);
      setTrackingStatus(
        ETAService.trackingStatusFromEta(
          estimate.etaSeconds,
          estimate.distanceKm,
          tripStatusRef.current,
        ),
      );
    }
  }, [pickupCoords, dropoffCoords, driverLocation]);

  const handleTripWs = useCallback(
    (msg: RiderTripWsMessage) => {
      if (!riderId) return;
      const prevStatus = tripStatusRef.current;
      // A live WS push is a successful sync — clear any HTTP-poll error state.
      syncFailCountRef.current = 0;
      setSyncError(false);
      setLastSyncAt(Date.now());
      const t = (msg.trip || {}) as Record<string, unknown>;
      // Completion is terminal. Cash settles at completion; safe-arrival / shield
      // no longer reopen a completed trip into the payment phase.
      const screenStatus = resolveRiderScreenStatus(
        msg.status ?? tripStatusRef.current,
        t.payment_status,
        t.payment_method,
      );
      const ping = parseTrackingPing({
        driver_location: msg.driver_location,
        eta_seconds: msg.eta_seconds,
        distance_remaining_km: msg.distance_remaining_km,
        speed_kmh: (msg as Record<string, unknown>).speed_kmh as number | undefined,
      });

      if (ping.etaSeconds != null) {
        setServerEtaSeconds(Math.max(0, Math.floor(ping.etaSeconds)));
        lastServerEtaAtRef.current = Date.now();
      }
      if (ping.distanceKm != null) setDistanceRemainingKm(ping.distanceKm);
      if (ping.trackingStatus) setTrackingStatus(ping.trackingStatus);
      if (ping.location) {
        commitDriverLocation(ping.location as Record<string, unknown>);
      }

      const storeTrip = useAppStore.getState().currentTrip;
      const merged = mergeTripFromStatusPayload(
        storeTrip?.id === effectiveTripId ? storeTrip : null,
        effectiveTripId,
        riderId,
        {
          ...t,
          status: screenStatus,
          driver_location: msg.driver_location ?? t.driver_location,
          arrived_at:
            t.arrived_at ??
            (msg as { arrived_at?: string }).arrived_at,
          payment_status: t.payment_status ?? storeTrip?.payment_status,
        },
        screenStatus,
      );
      const confirmedDriverId = resolveAssignedDriverId(
        merged,
        typeof t.driver_info === 'object' && t.driver_info != null
          ? (t.driver_info as { driver_id?: unknown })
          : undefined,
      );
      const acceptedAt = resolveAssignmentAcceptedAt(merged);
      const uiStatus =
        isRiderMapLiveTripStatus(screenStatus) &&
        !isTripAssignmentConfirmed(screenStatus, confirmedDriverId, acceptedAt)
          ? 'pending_driver_offers'
          : screenStatus;

      setTripStatus(uiStatus);
      if (t.payment_status) setPaymentStatus(String(t.payment_status));

      if (t.driver_id || t.driver_info) {
        setDriverInfo((prev) =>
          normalizeDriverInfo({
            ...(prev || {}),
            ...(typeof t.driver_info === 'object' ? (t.driver_info as Record<string, unknown>) : {}),
            driver_id: (t.driver_id as string) || prev?.driver_id,
            name: (t.driver_name as string) || prev?.name || 'Driver',
            profile_image:
              (t.driver_profile_image as string | undefined) ||
              (t.profile_image as string | undefined) ||
              prev?.profile_image,
            face_image:
              (t.driver_face_image as string | undefined) ||
              (t.face_image as string | undefined) ||
              prev?.face_image,
            rating: t.driver_rating ?? prev?.rating,
            total_trips: t.driver_total_trips ?? prev?.total_trips,
            verified: t.driver_verified ?? prev?.verified,
            vehicle: t.vehicle_model || t.vehicle_type || prev?.vehicle,
            vehicle_model: t.vehicle_model || prev?.vehicle_model,
            vehicle_type: t.vehicle_type || prev?.vehicle_type,
            plate: t.vehicle_plate || prev?.plate,
            vehicle_plate: t.vehicle_plate || prev?.vehicle_plate,
            color: t.vehicle_color || prev?.color,
            vehicle_color: t.vehicle_color || prev?.vehicle_color,
          }),
        );
      }

      setCurrentTrip({ ...merged, status: uiStatus } as typeof merged);

      if (
        (uiStatus === 'arrived' && prevStatus !== 'arrived') ||
        (uiStatus === 'ongoing' && prevStatus !== 'ongoing')
      ) {
        void fetchStatus();
      }

      if (screenStatus === 'cancelled') {
        // Cancellation context lives inside msg.trip — merge so
        // cancelled_by_role / cancellation_reason are readable at top level.
        handleRemoteCancelled({ ...(msg as unknown as Record<string, unknown>), ...t });
      } else if (screenStatus === 'completed') {
        navigateOnce(`receipt-${effectiveTripId}`, () =>
          safeReplace(router, {
            pathname: '/rider/trip-receipt',
            params: { tripId: effectiveTripId },
          }),
        );
      }
    },
    [riderId, effectiveTripId, setCurrentTrip, router, navigateOnce, fetchStatus, handleRemoteCancelled],
  );

  const { connected: wsConnected } = useRiderTripRealtime({
    riderId,
    enabled: Boolean(effectiveTripId && riderId),
    watchTripId: effectiveTripId || null,
    onTripUpdate: handleTripWs,
  });

  useEffect(() => {
    setLiveDebug((d) => ({ ...d, wsConnected }));
  }, [wsConnected]);

  useFocusEffect(
    useCallback(() => {
      if (!effectiveTripId || !riderId) return;
      void fetchStatus();
    }, [effectiveTripId, riderId, fetchStatus]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !effectiveTripId || !riderId) return;
      setLoading(false);
      void fetchStatus();
    });
    return () => sub.remove();
  }, [effectiveTripId, riderId, fetchStatus]);

  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => setLoading(false), 12000);
    return () => clearTimeout(t);
  }, [loading, effectiveTripId]);

  useEffect(() => {
    if (!effectiveTripId || !riderId) {
      setLoading(false);
      return;
    }
    let mounted = true;
    void (async () => {
      if (mounted) await fetchStatus();
    })();
    const pollMs = riderTripStatusPollIntervalMs(wsConnected, tripStatusRef.current);
    const interval = setInterval(() => {
      if (mounted) void fetchStatus();
    }, pollMs);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [effectiveTripId, riderId, fetchStatus, wsConnected]);

  useEffect(() => {
    if (!effectiveTripId || !isLivePhase) return;
    let cancelled = false;
    void (async () => {
      const route = await fetchTripRoute(effectiveTripId);
      if (cancelled || !route) return;
      const segment = Array.isArray(route.segment_to_target) ? route.segment_to_target : [];
      const segmentPts = segment
        .map((p) => ({ latitude: Number(p.lat), longitude: Number(p.lng) }))
        .filter(
          (c) =>
            Number.isFinite(c.latitude) &&
            Number.isFinite(c.longitude) &&
            !(Math.abs(c.latitude) < 1e-6 && Math.abs(c.longitude) < 1e-6),
        );
      if (segmentPts.length >= DIRECTIONS_ROUTE_MIN_POINTS) {
        setSnappedPolyline(segmentPts);
        setLiveDebug((d) => ({ ...d, routePoints: segmentPts.length }));
        return;
      }
      const pts = (route.waypoints ?? [])
        .map((p) => ({ latitude: Number(p.lat), longitude: Number(p.lng) }))
        .filter(
          (c) =>
            Number.isFinite(c.latitude) &&
            Number.isFinite(c.longitude) &&
            !(Math.abs(c.latitude) < 1e-6 && Math.abs(c.longitude) < 1e-6),
        );
      if (pts.length >= DIRECTIONS_ROUTE_MIN_POINTS) {
        setSnappedPolyline(pts);
        setLiveDebug((d) => ({ ...d, routePoints: pts.length }));
      }
    })();
    const pullEta = () => {
      void fetchTripEta(effectiveTripId).then((eta) => {
        if (!eta) return;
        setServerEtaSeconds(eta.eta_seconds);
        lastServerEtaAtRef.current = Date.now();
        setTrackingStatus(eta.status);
        if (Number.isFinite(eta.distance_km)) setDistanceRemainingKm(eta.distance_km);
      });
    };
    pullEta();
    applyClientEta();
    const etaIv = setInterval(() => {
      pullEta();
      applyClientEta();
    }, riderTripEtaFallbackPollMs(wsConnected));
    const clientIv = setInterval(applyClientEta, RIDER_TRACKING_CLIENT_ETA_MS);
    return () => {
      cancelled = true;
      clearInterval(etaIv);
      clearInterval(clientIv);
    };
  }, [effectiveTripId, isLivePhase, wsConnected, tripStatus, applyClientEta]);

  useEffect(() => {
    if (!isLivePhase || !liveDriverCoords) return;
    applyClientEta();
  }, [
    isLivePhase,
    liveDriverCoords?.lat,
    liveDriverCoords?.lng,
    tripStatus,
    applyClientEta,
  ]);

  useEffect(() => {
    const storeStatus = currentTrip?.id === effectiveTripId
      ? normalizeTripStatus(currentTrip.status, currentTrip.payment_status)
      : null;
    if (storeStatus && storeStatus !== tripStatusRef.current) {
      setTripStatus(storeStatus);
    }
  }, [currentTrip?.id, currentTrip?.status, currentTrip?.payment_status, effectiveTripId]);

  useEffect(() => {
    if (!isLivePhase) {
      lastKnownDriverRef.current = null;
      return;
    }
    const staleIv = setInterval(() => {
      setLocationStale(Date.now() - lastLocationAtRef.current > RIDER_TRACKING_GPS_STALE_MS);
    }, 3000);
    return () => clearInterval(staleIv);
  }, [isLivePhase]);

  useEffect(() => {
    const driverId = driverInfo?.driver_id;
    if (!driverId || !riderId) return;
    void (async () => {
      try {
        const res = await fetch(
          `${BACKEND_URL}/api/users/${riderId}/favorite-drivers/${driverId}/check`,
          { headers: getAuthHeaders() },
        );
        if (res.ok) {
          const data = await res.json();
          setIsFavoriteDriver(Boolean(data?.is_favorite));
        }
      } catch {
        /* silent */
      }
    })();
  }, [driverInfo?.driver_id, riderId]);

  useEffect(() => {
    if (!isDriverAssigned) return;
    if (acceptedBannerShownRef.current) return;
    acceptedBannerShownRef.current = true;
    setAcceptedBanner(true);
    if (Platform.OS !== 'web') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    const t = setTimeout(() => setAcceptedBanner(false), RIDER_DRIVER_FOUND_HANDOFF_MS);
    return () => clearTimeout(t);
  }, [isDriverAssigned, assignedDriverId]);

  // Cash settlement is driver-confirmed (confirm-cash-received). The rider stays on
  // the payment phase until the server pushes payment_status=completed, so there is
  // no client-side cash auto-confirm anymore.

  useEffect(() => {
    if (!effectiveTripId || !riderId) return;
    if (currentTrip?.id === effectiveTripId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await getActiveTrip(riderId);
        if (cancelled) return;
        const trip = res?.data?.trip as Record<string, unknown> | undefined;
        if (res?.data?.active && trip?.id === effectiveTripId) {
          const st = normalizeTripStatus(
            String(trip.status || ''),
            String(trip.payment_status || ''),
          );
          const merged = mergeTripFromStatusPayload(null, effectiveTripId, riderId, trip, st);
          const confirmedDriverId = resolveAssignedDriverId(merged, trip);
          const acceptedAt = resolveAssignmentAcceptedAt(merged);
          const uiStatus =
            isRiderMapLiveTripStatus(st) &&
            !isTripAssignmentConfirmed(st, confirmedDriverId, acceptedAt)
              ? 'pending_driver_offers'
              : st;
          setCurrentTrip({ ...merged, status: uiStatus } as typeof merged);
          setTripStatus(uiStatus);
        }
      } catch {
        /* polling */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [effectiveTripId, riderId, currentTrip?.id, setCurrentTrip]);

  const onBack = useCallback(() => router.back(), [router]);

  const onCallDriver = useCallback(() => {
    if (!driverPhone) {
      Alert.alert(
        'Call not available',
        'The driver\'s phone number is not visible at this time. Try messaging instead.',
      );
      return;
    }
    const cleaned = driverPhone.replace(/\s+/g, '');
    Linking.openURL(`tel:${cleaned}`).catch(() =>
      Alert.alert('Cannot call', 'Unable to open the phone app on this device.'),
    );
  }, [driverPhone]);

  const onChatDriver = useCallback(() => {
    router.push({ pathname: '/chat', params: { tripId: effectiveTripId } } as any);
  }, [router, effectiveTripId]);

  const onOpenPickupCode = useCallback(() => {
    router.push({
      pathname: '/rider/security-code',
      params: { tripId: effectiveTripId },
    } as any);
  }, [router, effectiveTripId]);

  const onShareTrip = useCallback(() => {
    openShareTrip(router, effectiveTripId);
  }, [router, effectiveTripId]);

  const onEmergency = useCallback(() => {
    if (!effectiveTripId) return;
    Alert.alert(
      'Emergency',
      'This will alert NEXRYDE safety with your live GPS. Only use in a real emergency.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Alert safety',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              if (Platform.OS !== 'web') {
                try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch { /* noop */ }
              }
              try {
                // Mirror the Safety Center flow exactly: resolve live GPS, then
                // POST to the real /api/sos/trigger endpoint via triggerSOS.
                const permission = await Location.requestForegroundPermissionsAsync();
                if (permission.status !== 'granted') {
                  Alert.alert(
                    'Location Required',
                    'Enable location permission to send SOS with your live location.',
                  );
                  return;
                }
                const loc = await Location.getCurrentPositionAsync({
                  accuracy: Location.Accuracy.High,
                });
                await triggerSOS({
                  trip_id: effectiveTripId,
                  location_lat: loc.coords.latitude,
                  location_lng: loc.coords.longitude,
                });
                Alert.alert(
                  'SOS Sent',
                  'Emergency alert has been sent to your contacts and NEXRYDE support.',
                );
              } catch (err: any) {
                Alert.alert(
                  'SOS Failed',
                  err?.response?.data?.detail || 'Could not send SOS right now. Try again or call your local emergency number.',
                );
              }
            })();
          },
        },
      ],
    );
  }, [effectiveTripId]);

  const onCancelRide = useCallback(async (reason?: string) => {
    if (!effectiveTripId || !riderId) return;
    // For terminal / payment states don't cancel — just close tracking safely
    if (tripStatus === 'pending_payment') {
      safeReplace(router, { pathname: '/rider/trip-receipt', params: { tripId: effectiveTripId } });
      return;
    }
    if (['completed', 'cancelled'].includes(tripStatus)) {
      safeReplace(router, { pathname: '/rider/trip-receipt', params: { tripId: effectiveTripId } });
      return;
    }
    if (tripStatus === 'ongoing') {
      // Trip in progress — cannot cancel; just go back
      router.back();
      return;
    }
    if (cancelInFlightRef.current) return;
    cancelInFlightRef.current = true;
    setCancelError(null);
    setCancellingRide(true);
    try {
      const payload: Record<string, string> = { cancelled_by: riderId };
      const trimmed = String(reason || '').trim();
      if (trimmed) {
        payload.reason = trimmed;
        payload.cancellation_reason = trimmed;
      }
      const res = await managedFetch(`${BACKEND_URL}/api/trips/${effectiveTripId}/cancel`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        authed: true,
        timeoutMs: 8_000,
        retries: 0,
      });
      let data: { detail?: string; message?: string } = {};
      try {
        data = await res.json();
      } catch {
        /* non-JSON body */
      }
      if (!res.ok) {
        const detail = String(data?.detail || '');
        // Trip may already be cancelled server-side while UI still shows finding.
        if (res.status === 400 && /cannot cancel|already cancel/i.test(detail)) {
          clearTripDriverCache();
          setCancelModalOpen(false);
          setCurrentTrip(null);
          toast.show('Trip cancelled successfully.', 'success');
          safeReplace(router, '/(rider-tabs)/rider-home');
          return;
        }
        setCancelError(detail || 'Unable to cancel this trip. Tap Cancel Ride to retry.');
        return;
      }
      breadcrumbTripCancelled(effectiveTripId, trimmed || 'unspecified', 'rider');
      clearTripDriverCache();
      setCancelModalOpen(false);
      setCurrentTrip(null);
      toast.show('Trip cancelled successfully.', 'success');
      safeReplace(router, '/(rider-tabs)/rider-home');
    } catch (err) {
      const msg =
        err instanceof Error && err.message
          ? err.message
          : 'Could not cancel ride. Check your connection and retry.';
      setCancelError(msg);
    } finally {
      cancelInFlightRef.current = false;
      setCancellingRide(false);
    }
  }, [effectiveTripId, riderId, tripStatus, router, setCurrentTrip, toast]);

  /** Opens the reason sheet for cancellable phases; otherwise just leaves the screen. */
  const promptCancelRide = useCallback(() => {
    if (['ongoing', 'pending_payment', 'completed', 'cancelled'].includes(tripStatus)) {
      void onCancelRide();
      return;
    }
    setCancelError(null);
    setCancelModalOpen(true);
  }, [tripStatus, onCancelRide]);

  const closeCancelModal = useCallback(() => {
    if (!cancellingRide) {
      setCancelError(null);
      setCancelModalOpen(false);
    }
  }, [cancellingRide]);

  const onToggleFavorite = useCallback(async () => {
    const driverId = driverInfo?.driver_id as string | undefined;
    if (!driverId || !riderId) return;
    const next = !isFavoriteDriver;
    setIsFavoriteDriver(next); // optimistic
    try {
      if (next) await addFavoriteDriver(riderId, driverId);
      else await removeFavoriteDriver(riderId, driverId);
    } catch {
      setIsFavoriteDriver(!next); // revert on failure
    }
  }, [driverInfo?.driver_id, riderId, isFavoriteDriver]);

  const pickupLabel =
    (params.pickup as string) || currentTrip?.pickup_location?.address || 'Pickup';
  const destinationLabel =
    (params.destination as string) || currentTrip?.dropoff_location?.address || 'Destination';

  return {
    loading,
    backgroundSyncing,
    tripStatus,
    trackingPhase,
    driverHydrated,
    isFindingPhase,
    isLivePhase,
    isPaymentPhase,
    driverGpsReady,
    awaitingDriverGps,
    financialPaymentPending,
    tripPaymentMethod,
    paymentStatus,
    acceptedBanner,
    driverInfo,
    fareDisplay,
    callAllowed,
    isFavoriteDriver,
    mapModel,
    statusLabel,
    statusSubline,
    liveEta,
    pickupWait,
    arrivedAtIso,
    startedAtIso,
    distanceRemainingKm,
    wsConnected,
    locationStale,
    syncError,
    lastSyncAt,
    liveDebug,
    assignedDriverId,
    isDriverAssigned,
    riderId,
    pickupLabel,
    destinationLabel,
    effectiveTripId,
    currentTrip,
    cancelModalOpen,
    cancellingRide,
    cancelError,
    actions: {
      retrySync: fetchStatus,
      onBack,
      onCallDriver,
      onChatDriver,
      onOpenPickupCode,
      onShareTrip,
      onEmergency,
      onCancelRide,
      promptCancelRide,
      closeCancelModal,
      onToggleFavorite,
    },
  };
}

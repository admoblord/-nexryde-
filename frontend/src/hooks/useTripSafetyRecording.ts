import { useEffect, useMemo, useRef } from 'react';
import * as Location from 'expo-location';
import { useRideRecording } from '@/src/services/rideRecording';
import { useAuthedUserId } from '@/src/hooks/useAuthedUserId';
import { normalizeTripStatus } from '@/src/utils/tripStatus';

type TripLike = {
  id?: string;
  rider_id?: string;
  driver_id?: string | null;
  status?: string | null;
  payment_status?: string | null;
  fare?: number | null;
  pickup_address?: string | null;
  dropoff_address?: string | null;
};

const ACTIVE_RECORDING_STATUSES = new Set(['accepted', 'arrived', 'ongoing', 'pending_payment']);
const STOP_RECORDING_STATUSES = new Set(['completed', 'cancelled', 'pending_payment']);

export function useTripSafetyRecording(trip?: TripLike | null) {
  const { userId } = useAuthedUserId();
  const {
    status,
    currentRecording,
    startRecording,
    stopRecording,
    reportIncident,
    updateRecordingContext,
    appendLocationSample,
    updateSettings,
  } = useRideRecording();
  const startedTripIdRef = useRef<string | null>(null);
  const locationSubscriptionRef = useRef<Location.LocationSubscription | null>(null);

  const tripId = String(trip?.id || '');
  const tripNorm = useMemo(
    () => normalizeTripStatus(trip?.status ?? undefined, trip?.payment_status ?? undefined),
    [trip?.status, trip?.payment_status],
  );
  const driverId = String(trip?.driver_id || '').trim();
  const riderId = String(trip?.rider_id || userId || '').trim();

  const shouldRecord = useMemo(() => {
    return Boolean(tripId && riderId && driverId && ACTIVE_RECORDING_STATUSES.has(tripNorm));
  }, [tripId, riderId, driverId, tripNorm]);

  useEffect(() => {
    updateSettings((prev) => ({
      ...prev,
      type: 'audio',
      autoStart: true,
      // This hook handles user-facing UI in the tracking screen, so avoid duplicate alerts.
      notifyOtherParty: false,
    }));
  }, [updateSettings]);

  useEffect(() => {
    const run = async () => {
      if (shouldRecord && tripId && riderId && driverId && startedTripIdRef.current !== tripId) {
        const ok = await startRecording(tripId, driverId, riderId);
        if (ok) startedTripIdRef.current = tripId;
        return;
      }
      if (tripId && STOP_RECORDING_STATUSES.has(tripNorm) && startedTripIdRef.current === tripId && status === 'recording') {
        locationSubscriptionRef.current?.remove();
        locationSubscriptionRef.current = null;
        await stopRecording();
        startedTripIdRef.current = null;
        return;
      }
      if (!tripId && status === 'recording') {
        locationSubscriptionRef.current?.remove();
        locationSubscriptionRef.current = null;
        await stopRecording();
        startedTripIdRef.current = null;
      }
    };
    void run();
  }, [driverId, riderId, shouldRecord, startRecording, status, stopRecording, tripId, tripNorm]);

  useEffect(() => {
    if (!currentRecording?.id || currentRecording.tripId !== tripId) return;
    void updateRecordingContext(currentRecording.id, {
      route: [trip?.pickup_address, trip?.dropoff_address].filter(Boolean).join(' -> ') || currentRecording.metadata.route,
      startLocation: trip?.pickup_address || currentRecording.metadata.startLocation,
      endLocation: trip?.dropoff_address || currentRecording.metadata.endLocation,
      fare: typeof trip?.fare === 'number' ? trip.fare : currentRecording.metadata.fare,
    });
  }, [
    currentRecording?.id,
    currentRecording?.metadata.endLocation,
    currentRecording?.metadata.fare,
    currentRecording?.metadata.route,
    currentRecording?.metadata.startLocation,
    trip?.dropoff_address,
    trip?.fare,
    trip?.pickup_address,
    tripId,
    updateRecordingContext,
  ]);

  useEffect(() => {
    if (!shouldRecord || !currentRecording?.id || currentRecording.tripId !== tripId) return;

    let cancelled = false;

    const startTracking = async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== 'granted' || cancelled) return;

        const snapshot = async (coords: Location.LocationObjectCoords) => {
          try {
            await appendLocationSample(currentRecording.id, {
              latitude: coords.latitude,
              longitude: coords.longitude,
              speedKph: typeof coords.speed === 'number' ? coords.speed * 3.6 : null,
              heading: typeof coords.heading === 'number' ? coords.heading : null,
              timestamp: Date.now(),
            });
          } catch {
            /* non-fatal — avoid unhandled rejection on tracking screen */
          }
        };

        const initial = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (!cancelled) {
          await snapshot(initial.coords);
        }

        locationSubscriptionRef.current?.remove();
        locationSubscriptionRef.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 15000,
            distanceInterval: 75,
          },
          (position) => {
            void snapshot(position.coords);
          }
        );
      } catch {
        /* watchPosition / permission failures must not tear down the screen */
      }
    };

    void startTracking();

    return () => {
      cancelled = true;
      locationSubscriptionRef.current?.remove();
      locationSubscriptionRef.current = null;
    };
  }, [appendLocationSample, currentRecording?.id, currentRecording?.tripId, shouldRecord, tripId]);

  useEffect(() => {
    return () => {
      locationSubscriptionRef.current?.remove();
      locationSubscriptionRef.current = null;
      if (status === 'recording') {
        void stopRecording();
      }
    };
  }, [status, stopRecording]);

  return {
    recordingStatus: status,
    currentRecording,
    reportSafetyIncident: reportIncident,
  };
}

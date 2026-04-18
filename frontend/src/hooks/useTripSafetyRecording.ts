import { useEffect, useMemo, useRef } from 'react';
import * as Location from 'expo-location';
import { useRideRecording } from '@/src/services/rideRecording';
import { useAppStore } from '@/src/store/appStore';

type TripLike = {
  id?: string;
  rider_id?: string;
  driver_id?: string | null;
  status?: string | null;
  fare?: number | null;
  pickup_address?: string | null;
  dropoff_address?: string | null;
};

const ACTIVE_RECORDING_STATUSES = new Set(['accepted', 'arrived', 'ongoing', 'pending_payment']);
const STOP_RECORDING_STATUSES = new Set(['completed', 'cancelled', 'pending_payment']);

export function useTripSafetyRecording(trip?: TripLike | null) {
  const user = useAppStore((s) => s.user);
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
  const tripStatus = String(trip?.status || '');
  const driverId = String(trip?.driver_id || '');
  const riderId = String(trip?.rider_id || user?.id || '');

  const shouldRecord = useMemo(() => {
    return Boolean(tripId && riderId && ACTIVE_RECORDING_STATUSES.has(tripStatus));
  }, [tripId, riderId, tripStatus]);

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
      if (shouldRecord && tripId && riderId && startedTripIdRef.current !== tripId) {
        await startRecording(tripId, driverId, riderId);
        startedTripIdRef.current = tripId;
        return;
      }
      if (tripId && STOP_RECORDING_STATUSES.has(tripStatus) && startedTripIdRef.current === tripId && status === 'recording') {
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
  }, [driverId, riderId, shouldRecord, startRecording, status, stopRecording, tripId, tripStatus]);

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
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted' || cancelled) return;

      const snapshot = async (coords: Location.LocationObjectCoords) => {
        await appendLocationSample(currentRecording.id, {
          latitude: coords.latitude,
          longitude: coords.longitude,
          speedKph: typeof coords.speed === 'number' ? coords.speed * 3.6 : null,
          heading: typeof coords.heading === 'number' ? coords.heading : null,
          timestamp: Date.now(),
        });
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

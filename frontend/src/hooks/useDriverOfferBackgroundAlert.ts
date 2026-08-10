import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useAppStore } from '@/src/store/appStore';
import { useDriverSessionStore } from '@/src/store/driverSessionStore';
import { driverOffersSocket } from '@/src/services/driverOffersSocket';
import { normalizeExpoPushData } from '@/src/utils/expoPushData';
import {
  ensureDriverOfferPushChannel,
  presentDriverOfferLocalNotification,
  stopDriverOfferBackgroundAlert,
  triggerDriverOfferBackgroundAlert,
} from '@/src/services/driverOfferBackgroundAlert';

function addressFrom(value: unknown): string {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    const addr = o.address ?? o.formatted_address ?? o.label;
    if (typeof addr === 'string' && addr.trim()) return addr.trim();
  }
  return '';
}

function numOrStr(value: unknown): number | string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) return value.trim();
  return undefined;
}

/**
 * Bolt/Uber-style offer alert when the driver is online but the app is not in the foreground.
 * Launches native full-screen Accept/Decline with rider, pickup → destination, fare + ringtone.
 */
export function useDriverOfferBackgroundAlert() {
  const role = useAppStore((s) => s.user?.role);
  const driverId = useAppStore((s) => s.user?.id);
  // Confirm + reconnecting: brief WS drop must not drop offer alerts.
  const driverOnline = useDriverSessionStore(
    (s) => s.connectionPhase === 'confirmed' || s.connectionPhase === 'reconnecting',
  );
  const isDriver = role === 'driver';

  useEffect(() => {
    if (!isDriver || Platform.OS === 'web') return;

    void ensureDriverOfferPushChannel();

    const appSub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        // Fully hand the offer to the foreground JS modal: stop the native ringtone
        // AND full-screen alert. Leaving native audio running (stopNative:false) made
        // the native alarm loop while the JS offer modal started a second ringtone.
        void stopDriverOfferBackgroundAlert();
      }
    });

    const pushSub = Notifications.addNotificationReceivedListener((notification) => {
      const data = normalizeExpoPushData(
        notification.request.content.data as Record<string, unknown> | undefined
      );
      if (data?.type !== 'ride_request') return;
      if (AppState.currentState === 'active') return;
      if (!driverOnline) return;

      const tripId = typeof data.trip_id === 'string' ? data.trip_id : undefined;
      const offerId = typeof data.offer_id === 'string' ? data.offer_id : undefined;
      const offerKey = offerId || tripId || notification.request.identifier;

      void triggerDriverOfferBackgroundAlert({
        offerKey,
        title: notification.request.content.title ?? undefined,
        body: notification.request.content.body ?? undefined,
        tripId,
        offerId,
        driverId,
        source: 'push',
        riderName: typeof data.rider_name === 'string' ? data.rider_name : undefined,
        pickupAddress:
          typeof data.pickup_address === 'string' ? data.pickup_address : undefined,
        dropoffAddress:
          typeof data.dropoff_address === 'string'
            ? data.dropoff_address
            : typeof data.destination === 'string'
              ? data.destination
              : undefined,
        fare: numOrStr(data.fare ?? data.offered_fare),
        etaMinutes: numOrStr(data.eta_minutes ?? data.estimated_time_mins),
        distanceKm: numOrStr(data.distance_to_pickup_km ?? data.distance_km),
      });
    });

    const unsubOffer = driverOffersSocket.subscribeOffers((offer) => {
      if (AppState.currentState === 'active') return;
      if (!driverOnline) return;

      const tripId =
        typeof offer.trip_id === 'string'
          ? offer.trip_id
          : typeof offer.tripId === 'string'
            ? offer.tripId
            : undefined;
      const offerId =
        typeof offer.offer_id === 'string'
          ? offer.offer_id
          : typeof offer.id === 'string'
            ? offer.id
            : undefined;
      const offerKey = offerId || tripId || '';
      if (!offerKey) return;

      const riderName =
        typeof offer.rider_name === 'string' && offer.rider_name.trim()
          ? offer.rider_name.trim()
          : 'Rider';
      const pickup =
        addressFrom(offer.pickup_address) ||
        addressFrom(offer.pickup) ||
        addressFrom(offer.pickupAddress) ||
        addressFrom(offer.pickup_location) ||
        'Pickup location';
      const dropoff =
        addressFrom(offer.dropoff_address) ||
        addressFrom(offer.destination) ||
        addressFrom(offer.dropoff) ||
        addressFrom(offer.dropoff_location) ||
        addressFrom(offer.destination_coordinates) ||
        '';
      const fareRaw =
        offer.offered_fare ??
        offer.fare ??
        offer.rider_offer_price ??
        offer.estimated_fare ??
        offer.rider_fare;
      const fare =
        typeof fareRaw === 'number'
          ? fareRaw
          : typeof fareRaw === 'string'
            ? parseFloat(fareRaw)
            : NaN;
      const fareText = Number.isFinite(fare) ? ` • ₦${Math.round(fare).toLocaleString()}` : '';
      const routeLine = dropoff ? `${pickup} → ${dropoff}` : pickup;

      void triggerDriverOfferBackgroundAlert({
        offerKey,
        tripId,
        offerId,
        driverId,
        source: 'socket',
        riderName,
        pickupAddress: pickup,
        dropoffAddress: dropoff,
        fare: Number.isFinite(fare) ? fare : fareRaw,
        etaMinutes: numOrStr(offer.eta_minutes ?? offer.estimated_time_mins ?? offer.pickup_eta_minutes),
        distanceKm: numOrStr(
          offer.distance_to_pickup_km ?? offer.distance_to_pickup ?? offer.pickup_distance_km,
        ),
      });
      if (Platform.OS !== 'android') {
        void presentDriverOfferLocalNotification({
          title: '🚗 New ride offer',
          body: `${riderName}: ${routeLine}${fareText}`,
          tripId,
          offerId,
          riderName,
          pickupAddress: pickup,
          dropoffAddress: dropoff,
          fare: Number.isFinite(fare) ? fare : undefined,
        });
      }
    });

    return () => {
      appSub.remove();
      pushSub.remove();
      unsubOffer();
      void stopDriverOfferBackgroundAlert();
    };
  }, [driverId, driverOnline, isDriver]);
}

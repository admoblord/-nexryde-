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

/**
 * Bolt/Uber-style offer alert when the driver is online but the app is not in the foreground.
 * Remote push uses the driver_offers channel (custom sound); this hook loops audio when the
 * process is still alive (background location / recent foreground).
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
        void stopDriverOfferBackgroundAlert({ stopNative: false });
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

      const pickup =
        typeof offer.pickup_address === 'string'
          ? offer.pickup_address
          : typeof offer.pickupAddress === 'string'
            ? offer.pickupAddress
            : 'New ride request';
      const fareRaw = offer.fare ?? offer.estimated_fare ?? offer.rider_fare;
      const fare =
        typeof fareRaw === 'number'
          ? fareRaw
          : typeof fareRaw === 'string'
            ? parseFloat(fareRaw)
            : NaN;
      const fareText = Number.isFinite(fare) ? ` • ₦${Math.round(fare).toLocaleString()}` : '';

      void triggerDriverOfferBackgroundAlert({
        offerKey,
        tripId,
        offerId,
        driverId,
        source: 'socket',
      });
      if (Platform.OS !== 'android') {
        void presentDriverOfferLocalNotification({
          title: '🚗 New ride offer',
          body: `${pickup}${fareText}`,
          tripId,
          offerId,
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

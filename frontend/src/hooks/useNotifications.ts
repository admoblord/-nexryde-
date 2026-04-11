import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { useRouter } from 'expo-router';
import { useAppStore } from '@/src/store/appStore';
import { registerPushToken } from '@/src/services/api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export function useNotifications() {
  const router = useRouter();
  const { user } = useAppStore();
  const responseListener = useRef<Notifications.Subscription>();

  useEffect(() => {
    if (!user?.id) return;

    (async () => {
      if (!Device.isDevice) return;
      const { status: existing } = await Notifications.getPermissionsAsync();
      let finalStatus = existing;
      if (existing !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') return;

      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: '342aff56-5e09-4363-b8b6-12ab1cdec11f',
      });
      try {
        await registerPushToken(user.id, tokenData.data);
      } catch {}
    })();

    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (data?.type === 'trip_accepted' && data?.trip_id) {
        router.push({ pathname: '/rider/tracking', params: { tripId: String(data.trip_id) } } as any);
      }
      if (data?.type === 'trip_completed' && data?.trip_id) {
        router.push({ pathname: '/rider/trip-receipt', params: { tripId: String(data.trip_id) } } as any);
      }
      if (data?.type === 'ride_request') {
        if (user?.role === 'driver') {
          router.push('/(driver-tabs)/driver-home');
        }
      }
      if (data?.type === 'trial_ended' && user?.role === 'driver') {
        router.push('/driver/subscription');
      }
    });

    return () => {
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, [user?.id, user?.role]);
}

import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { useRouter } from 'expo-router';
import { useAppStore } from '@/src/store/appStore';
import { registerPushToken } from '@/src/services/api';
import { markFeatureAsSeen, syncAndNotifyNewFeatures } from '@/src/services/featureAnnouncements';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export function useNotifications() {
  const router = useRouter();
  const { user } = useAppStore();
  const responseListener = useRef<Notifications.Subscription | null>(null);

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
      try {
        await syncAndNotifyNewFeatures(user.role);
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
      // "You're offline — go online now" action notification
      if (data?.type === 'go_online' && user?.role === 'driver') {
        router.push('/(driver-tabs)/driver-home?action=go_online' as any);
      }
      if (data?.type === 'feature_update') {
        const route = typeof data?.route === 'string' ? data.route : '/(rider-tabs)/rider-home';
        const featureId = typeof data?.feature_id === 'string' ? data.feature_id : '';
        if (featureId) {
          void markFeatureAsSeen(featureId);
        }
        router.push(route as any);
      }
    });

    return () => {
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, [user?.id, user?.role]);
}

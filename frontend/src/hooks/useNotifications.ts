import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { useRouter } from 'expo-router';
import { useAppStore } from '@/src/store/appStore';
import { useAuthedUserId } from '@/src/hooks/useAuthedUserId';
import { registerPushToken, reportNotificationOpened } from '@/src/services/api';
import { ensureAndroidPushChannels } from '@/src/services/notifications';
import { markFeatureAsSeen, syncAndNotifyNewFeatures } from '@/src/services/featureAnnouncements';
import {
  resolvePushNotificationRoute,
  URGENT_PUSH_TYPES,
} from '@/src/constants/pushNotificationRouting';
import { normalizeExpoPushData } from '@/src/utils/expoPushData';

/**
 * Global foreground notification handler.
 * ALL notifications show as banners in the notification bar.
 * Sound plays for urgent ride events and engagement offers; silent for others.
 */
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = normalizeExpoPushData(
      notification.request.content.data as Record<string, unknown> | undefined
    );
    const t = typeof data?.type === 'string' ? data.type : '';
    const isPrayerAlert = typeof data?.prayerName === 'string';
    // Engagement/offer notifications also play sound so they get attention
    const isEngagement = t === 'earnings_update' || t === 'feature_update' || t === 'engagement';
    const urgent = URGENT_PUSH_TYPES.has(t) || isPrayerAlert;
    return {
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: urgent || isEngagement,
      shouldSetBadge: true,
    };
  },
});

export function useNotifications() {
  const router = useRouter();
  const { user } = useAppStore();
  const { userId, canCallAuthedApi } = useAuthedUserId();
  const responseListener = useRef<Notifications.Subscription | null>(null);
  const userRef = useRef(user);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    if (!userId || !canCallAuthedApi) return;

    (async () => {
      if (!Device.isDevice) return;
      const { status: existing } = await Notifications.getPermissionsAsync();
      let finalStatus = existing;
      if (existing !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') return;

      await ensureAndroidPushChannels();

      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: '342aff56-5e09-4363-b8b6-12ab1cdec11f',
      });
      try {
        await registerPushToken(userId, tokenData.data, { platform: Platform.OS });
      } catch {}
      try {
        await syncAndNotifyNewFeatures(user?.role ?? 'rider');
      } catch {}
    })();

    // Cold-start: handle tap on a notification that opened the app from terminated state
    void Notifications.getLastNotificationResponseAsync().then((lastResponse) => {
      if (!lastResponse) return;
      const raw = normalizeExpoPushData(
        lastResponse.notification.request.content.data as Record<string, unknown> | undefined
      );
      const u = userRef.current;
      const target = raw ? resolvePushNotificationRoute(raw, { role: u?.role }) : null;
      if (target) router.push(target as any);
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const raw = normalizeExpoPushData(
        response.notification.request.content.data as Record<string, unknown> | undefined
      );
      const u = userRef.current;
      const nid = typeof raw?.nid === 'string' ? raw.nid : undefined;
      if (nid && u?.id) {
        void reportNotificationOpened(u.id, { nid }).catch(() => {});
      }

      if (raw?.type === 'feature_update') {
        const featureId = typeof raw?.feature_id === 'string' ? raw.feature_id : '';
        if (featureId) void markFeatureAsSeen(featureId);
      }

      const target = raw ? resolvePushNotificationRoute(raw, { role: u?.role }) : null;
      if (!target) return;

      router.push(target as any);
    });

    return () => {
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, [userId, canCallAuthedApi, user?.role, router]);
}

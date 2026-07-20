import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ensureDriverOfferPushChannel } from '@/src/services/driverOfferBackgroundAlert';

/** Android 8+: remote pushes reference channelId — register before first marketing/ride notification. */
export async function ensureAndroidPushChannels(): Promise<void> {
  await Notifications.setNotificationCategoryAsync('engagement_driver', [
    {
      identifier: 'go_online',
      buttonTitle: 'Go Online',
      options: { opensAppToForeground: true },
    },
    {
      identifier: 'view_heatmap',
      buttonTitle: 'View Heatmap',
      options: { opensAppToForeground: true },
    },
  ]);
  await Notifications.setNotificationCategoryAsync('engagement_rider', [
    {
      identifier: 'book_ride',
      buttonTitle: 'Book Ride',
      options: { opensAppToForeground: true },
    },
    {
      identifier: 'open_app',
      buttonTitle: 'Open NexRyde',
      options: { opensAppToForeground: true },
    },
  ]);
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'NexRyde Notifications',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#FFD700',
    showBadge: true,
  });
  await ensureDriverOfferPushChannel();
  await Notifications.setNotificationChannelAsync('rides', {
    name: 'Ride Updates',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 500, 250, 500],
    lightColor: '#00D47E',
    showBadge: true,
    enableLights: true,
  });
  await Notifications.setNotificationChannelAsync('earnings', {
    name: 'Earnings Updates',
    importance: Notifications.AndroidImportance.HIGH,
    lightColor: '#FFD700',
    showBadge: true,
  });
  await Notifications.setNotificationChannelAsync('engagement_critical', {
    name: 'Critical NexRyde Alerts',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 400, 200, 400],
    lightColor: '#FF3B30',
    enableLights: true,
    enableVibrate: true,
    showBadge: true,
  });
  await Notifications.setNotificationChannelAsync('engagement_high', {
    name: 'High Priority NexRyde Updates',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 260, 120, 260],
    lightColor: '#FFD700',
    enableLights: true,
    enableVibrate: true,
    showBadge: true,
  });
  await Notifications.setNotificationChannelAsync('engagement_low', {
    name: 'NexRyde Suggestions',
    importance: Notifications.AndroidImportance.DEFAULT,
    lightColor: '#00D47E',
    showBadge: false,
  });
  await Notifications.setNotificationChannelAsync('marketing', {
    name: 'NexRyde Tips and Offers',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 220, 120, 220],
    lightColor: '#00D47E',
    enableLights: true,
    enableVibrate: true,
    showBadge: true,
  });
  // Legacy 'offers' channel: kept for older scheduled engagement payloads.
  // Must be importance HIGH or above — otherwise Android may drop it silently.
  await Notifications.setNotificationChannelAsync('offers', {
    name: 'NexRyde Offers and Tips',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 300, 150, 300],
    lightColor: '#00D47E',
    enableLights: true,
    enableVibrate: true,
    showBadge: true,
  });
}

// Foreground presentation + sound tiers: see `useNotifications` (root layout).

export interface PushNotificationData {
  type:
    | 'ride_request'
    | 'driver_assigned'
    | 'driver_arriving'
    | 'trip_started'
    | 'trip_completed'
    | 'earnings_update'
    | 'challenge_complete'
    | 'subscription_expiring'
    | 'driver_morning_rush'
    | 'driver_midday_reminder'
    | 'driver_evening_rush'
    | 'driver_weekend_demand'
    | 'driver_offline_reminder'
    | 'driver_nearby_ride_opportunity'
    | 'driver_online_high_demand'
    | 'driver_online_move_to_demand'
    | 'rider_morning_commute'
    | 'rider_evening_ride'
    | 'rider_weekend_travel'
    | 'rider_weather_ready'
    | 'rider_promo'
    | 'rider_driver_availability'
    | 'rider_book_before_demand_rises'
    | 'geo_fence_deviation'
    | 'geo_fence_explained'
    | 'speed_spike_alert'
    | 'safe_arrival_checkin'
    | 'feature_update'
    | 'route_updated'
    | 'rider_route_updated';
  title: string;
  body: string;
  data?: Record<string, any>;
}

class NotificationService {
  private expoPushToken: string | null = null;

  async initialize(): Promise<string | null> {
    try {
      if (!Device.isDevice) {
        console.log('Push notifications only work on physical devices');
        return null;
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('Push notification permission not granted');
        return null;
      }

      // Get Expo push token — projectId from app.json extra.eas.projectId
      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: '342aff56-5e09-4363-b8b6-12ab1cdec11f',
      });
      
      this.expoPushToken = tokenData.data;
      await AsyncStorage.setItem('pushToken', this.expoPushToken);

      await ensureAndroidPushChannels();

      return this.expoPushToken;
    } catch (error) {
      console.error('Error initializing notifications:', error);
      return null;
    }
  }

  async getToken(): Promise<string | null> {
    if (this.expoPushToken) return this.expoPushToken;
    const stored = await AsyncStorage.getItem('pushToken');
    return stored;
  }

  // Schedule a local notification
  async scheduleLocalNotification(notification: PushNotificationData, delaySeconds: number = 0) {
    try {
      const trigger: Notifications.NotificationTriggerInput | null = delaySeconds > 0
        ? {
            type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL as Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
            seconds: delaySeconds,
          }
        : null;

      await Notifications.scheduleNotificationAsync({
        content: {
          title: notification.title,
          body: notification.body,
          data: { type: notification.type, ...notification.data },
          sound: true,
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger,
      });
    } catch (error) {
      console.error('Error scheduling notification:', error);
    }
  }

  // Send immediate notification
  async sendLocalNotification(notification: PushNotificationData) {
    await this.scheduleLocalNotification(notification, 0);
  }

  // Notification templates for different events
  async notifyRideRequest(pickupAddress: string, fare: number) {
    await this.sendLocalNotification({
      type: 'ride_request',
      title: '🚗 New Ride Request!',
      body: `Pickup: ${pickupAddress} • ₦${fare.toLocaleString()}`,
      data: { pickupAddress, fare },
    });
  }

  async notifyDriverAssigned(driverName: string, carModel: string, eta: number) {
    await this.sendLocalNotification({
      type: 'driver_assigned',
      title: '✅ Driver Found!',
      body: `${driverName} (${carModel}) • ${eta} min away`,
      data: { driverName, carModel, eta },
    });
  }

  async notifyDriverArriving(driverName: string, minutes: number) {
    await this.sendLocalNotification({
      type: 'driver_arriving',
      title: '🚙 Driver Arriving!',
      body: `${driverName} will arrive in ${minutes} minute${minutes > 1 ? 's' : ''}`,
      data: { driverName, minutes },
    });
  }

  async notifyDriverArrived(driverName: string, plateNumber: string) {
    await this.sendLocalNotification({
      type: 'driver_arriving',
      title: '📍 Driver Has Arrived!',
      body: `${driverName} is waiting • ${plateNumber}`,
      data: { driverName, plateNumber },
    });
  }

  async notifyTripCompleted(fare: number, rating?: number) {
    await this.sendLocalNotification({
      type: 'trip_completed',
      title: '🎉 Trip Completed!',
      body: `Total fare: ₦${fare.toLocaleString()}${rating ? ` • Rate your trip` : ''}`,
      data: { fare, rating },
    });
  }

  async notifyEarningsUpdate(amount: number, tripCount: number) {
    await this.sendLocalNotification({
      type: 'earnings_update',
      title: '💰 Earnings Update',
      body: `You've earned ₦${amount.toLocaleString()} from ${tripCount} trip${tripCount > 1 ? 's' : ''} today!`,
      data: { amount, tripCount },
    });
  }

  async notifyChallengeComplete(challengeName: string, reward: string) {
    await this.sendLocalNotification({
      type: 'challenge_complete',
      title: '🏆 Challenge Complete!',
      body: `${challengeName} • Reward: ${reward}`,
      data: { challengeName, reward },
    });
  }

  async notifySubscriptionExpiring(daysLeft: number) {
    await this.sendLocalNotification({
      type: 'subscription_expiring',
      title: '⚠️ Subscription Expiring',
      body: `Your subscription expires in ${daysLeft} day${daysLeft > 1 ? 's' : ''}. Renew to keep earning!`,
      data: { daysLeft },
    });
  }

  // Add notification listeners
  addNotificationReceivedListener(callback: (notification: Notifications.Notification) => void) {
    return Notifications.addNotificationReceivedListener(callback);
  }

  addNotificationResponseListener(callback: (response: Notifications.NotificationResponse) => void) {
    return Notifications.addNotificationResponseReceivedListener(callback);
  }

  // Get badge count
  async getBadgeCount(): Promise<number> {
    return await Notifications.getBadgeCountAsync();
  }

  // Set badge count
  async setBadgeCount(count: number) {
    await Notifications.setBadgeCountAsync(count);
  }

  // Clear all notifications
  async clearAll() {
    await Notifications.dismissAllNotificationsAsync();
    await this.setBadgeCount(0);
  }

  async notifyHeatmapHotZone(zoneName: string, ridesWaiting: number): Promise<void> {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `Hot zone: ${zoneName}`,
          body: `${ridesWaiting} ride${ridesWaiting !== 1 ? 's' : ''} waiting nearby`,
          sound: true,
        },
        trigger: null,
      });
    } catch { /* best-effort */ }
  }

  async scheduleMorningRush(): Promise<string | null> {
    try {
      return await Notifications.scheduleNotificationAsync({
        content: {
          title: '🌅 Morning Rush — Go Online Now',
          body: 'Surge pricing is active. Drivers are earning 2× more right now. Tap to go online.',
          sound: true,
          priority: Notifications.AndroidNotificationPriority.HIGH,
          data: { type: 'earnings_update', screen: '/(driver-tabs)/driver-home' },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: 6,
          minute: 0,
        },
      });
    } catch { return null; }
  }

  async scheduleEveningRush(): Promise<string | null> {
    try {
      return await Notifications.scheduleNotificationAsync({
        content: {
          title: '🌆 Evening Rush — High Demand',
          body: 'Riders are waiting in your area. Go online now and start earning.',
          sound: true,
          priority: Notifications.AndroidNotificationPriority.HIGH,
          data: { type: 'earnings_update', screen: '/(driver-tabs)/driver-home' },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: 17,
          minute: 0,
        },
      });
    } catch { return null; }
  }

  async cancelScheduledNotification(id: string): Promise<void> {
    try {
      await Notifications.cancelScheduledNotificationAsync(id);
    } catch { /* best-effort */ }
  }
}

export const notificationService = new NotificationService();
export default notificationService;

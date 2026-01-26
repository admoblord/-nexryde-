import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export interface PushNotificationData {
  type: 'ride_request' | 'driver_assigned' | 'driver_arriving' | 'trip_started' | 'trip_completed' | 'earnings_update' | 'challenge_complete' | 'subscription_expiring';
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

      // Get Expo push token
      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: 'your-project-id', // This would come from app.json
      });
      
      this.expoPushToken = tokenData.data;
      await AsyncStorage.setItem('pushToken', this.expoPushToken);

      // Configure for Android
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'KODA Notifications',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FFD700',
        });

        await Notifications.setNotificationChannelAsync('rides', {
          name: 'Ride Updates',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 500, 250, 500],
          lightColor: '#00D26A',
        });

        await Notifications.setNotificationChannelAsync('earnings', {
          name: 'Earnings Updates',
          importance: Notifications.AndroidImportance.DEFAULT,
          lightColor: '#FFD700',
        });
      }

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
      const trigger = delaySeconds > 0 
        ? { seconds: delaySeconds } 
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
}

export const notificationService = new NotificationService();
export default notificationService;

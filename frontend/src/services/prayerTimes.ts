/**
 * NEXRYDE Prayer Times Service - REAL IMPLEMENTATION
 * Uses Aladhan API for accurate Islamic prayer times
 */

import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { BACKEND_URL } from '@/src/services/api';

// Configure notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export type PrayerName = 'Fajr' | 'Dhuhr' | 'Asr' | 'Maghrib' | 'Isha';

export interface PrayerTime {
  name: PrayerName;
  time: string;
  timestamp: number;
}

export interface PrayerSettings {
  enabled: boolean;
  notificationsEnabled: boolean;
  alertMinutesBefore: number;
  vibration: boolean;
  autoPauseRides: boolean;
  pauseDuration: number;
  alertBefore: number;
  showMosqueLocations: boolean;
  notificationSound: 'default' | 'silent';
}

export interface Mosque {
  id?: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  distance: number;
  hasWudu?: boolean;
  hasParking?: boolean;
  capacity?: number;
}

const DEFAULT_SETTINGS: PrayerSettings = {
  enabled: false,
  notificationsEnabled: false,
  alertMinutesBefore: 10,
  vibration: true,
  autoPauseRides: false,
  pauseDuration: 15,
  alertBefore: 10,
  showMosqueLocations: true,
  notificationSound: 'default',
};

export function usePrayerTimes() {
  const [prayerTimes, setPrayerTimes] = useState<PrayerTime[]>([]);
  const [nextPrayer, setNextPrayer] = useState<PrayerTime | null>(null);
  const [settings, setSettings] = useState<PrayerSettings>(DEFAULT_SETTINGS);
  const [nearbyMosques, setNearbyMosques] = useState<Mosque[]>([]);
  const [loading, setLoading] = useState(true);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);

  // Load settings from storage
  useEffect(() => {
    loadSettings();
    requestNotificationPermissions();
  }, []);

  // Fetch prayer times when location changes
  useEffect(() => {
    if (location) {
      fetchPrayerTimes();
      if (settings.enabled) {
        scheduleNotifications();
      }
    }
  }, [location, settings.enabled]);

  const loadSettings = async () => {
    try {
      const stored = await AsyncStorage.getItem('prayer_settings');
      if (stored) {
        setSettings(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Failed to load prayer settings:', error);
    }
  };

  const saveSettings = async (newSettings: Partial<PrayerSettings>) => {
    try {
      // Mirror alertBefore ↔ alertMinutesBefore so both fields stay in sync
      const patch = { ...newSettings };
      if (patch.alertBefore !== undefined && patch.alertMinutesBefore === undefined) {
        patch.alertMinutesBefore = patch.alertBefore;
      } else if (patch.alertMinutesBefore !== undefined && patch.alertBefore === undefined) {
        patch.alertBefore = patch.alertMinutesBefore;
      }
      // Enabling the feature also enables notifications so alerts actually fire
      if (patch.enabled === true && !settings.notificationsEnabled) {
        patch.notificationsEnabled = true;
      }
      const updated = { ...settings, ...patch };
      setSettings(updated);
      await AsyncStorage.setItem('prayer_settings', JSON.stringify(updated));

      if (updated.enabled && updated.notificationsEnabled) {
        await scheduleNotifications();
      } else {
        await Notifications.cancelAllScheduledNotificationsAsync();
      }
    } catch {
      // Silently handle save errors — settings are already updated in state
    }
  };

  const requestNotificationPermissions = async () => {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    return finalStatus === 'granted';
  };

  const fetchPrayerTimes = async () => {
    try {
      setLoading(true);
      
      // Resolve user location; if unavailable we still query with default city center.
      let latitude = 6.5244;
      let longitude = 3.3792;

      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const userLocation = await Location.getCurrentPositionAsync({});
          latitude = userLocation.coords.latitude;
          longitude = userLocation.coords.longitude;
        }
      } catch {
        // Location unavailable — continue with Lagos default coordinates
      }

      setLocation({ lat: latitude, lng: longitude });

      // Fetch prayer times from Aladhan API (free, accurate, Islamic prayer times API)
      const response = await fetch(
        `https://api.aladhan.com/v1/timings?latitude=${latitude}&longitude=${longitude}&method=2`
      );
      
      const data = await response.json();
      
      if (data.code === 200 && data.data) {
        const timings = data.data.timings;
        const today = new Date();
        
        const prayers: PrayerTime[] = [
          {
            name: 'Fajr',
            time: timings.Fajr,
            timestamp: parseTimeToTimestamp(timings.Fajr, today),
          },
          {
            name: 'Dhuhr',
            time: timings.Dhuhr,
            timestamp: parseTimeToTimestamp(timings.Dhuhr, today),
          },
          {
            name: 'Asr',
            time: timings.Asr,
            timestamp: parseTimeToTimestamp(timings.Asr, today),
          },
          {
            name: 'Maghrib',
            time: timings.Maghrib,
            timestamp: parseTimeToTimestamp(timings.Maghrib, today),
          },
          {
            name: 'Isha',
            time: timings.Isha,
            timestamp: parseTimeToTimestamp(timings.Isha, today),
          },
        ];

        setPrayerTimes(prayers);
        
        // Find next prayer
        const now = Date.now();
        const next = prayers.find(p => p.timestamp > now);
        setNextPrayer(next || prayers[0]); // If all passed, next is tomorrow's Fajr
      }
      
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch prayer times:', error);
      setPrayerTimes([]);
      setNextPrayer(null);
      setLoading(false);
    }
  };

  const parseTimeToTimestamp = (timeStr: string, date: Date): number => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const prayerDate = new Date(date);
    prayerDate.setHours(hours, minutes, 0, 0);
    return prayerDate.getTime();
  };

  const scheduleNotifications = async () => {
    try {
      // Cancel existing notifications
      await Notifications.cancelAllScheduledNotificationsAsync();
      
      if (!settings.notificationsEnabled) return;

      const now = Date.now();
      
      for (const prayer of prayerTimes) {
        const alertTime = prayer.timestamp - (settings.alertMinutesBefore * 60 * 1000);
        
        if (alertTime > now) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: `🕌 ${prayer.name} Prayer Time`,
              body: `Prayer time in ${settings.alertMinutesBefore} minutes at ${prayer.time}`,
              sound: settings.vibration ? 'default' : undefined,
              data: { prayerName: prayer.name, prayerTime: prayer.time },
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE as Notifications.SchedulableTriggerInputTypes.DATE,
              date: new Date(alertTime),
            },
          });
        }
      }
      
      // Prayer notifications scheduled successfully
    } catch (error) {
      console.error('Failed to schedule notifications:', error);
    }
  };

  const findNearbyMosques = async () => {
    if (!location) return;

    try {
      const response = await fetch(
        `${BACKEND_URL}/api/places/nearby?lat=${location.lat}&lng=${location.lng}&radius=5000&type=mosque`
      );

      const data = await response.json();
      const results = data?.results || data?.places || [];
      
      if (results.length > 0) {
        const mosques: Mosque[] = results.slice(0, 10).map((place: any) => ({
          id: place.id || place.place_id || place.name,
          name: place.name || place.displayName?.text || 'Mosque',
          address: place.vicinity || place.formattedAddress || '',
          latitude: place.geometry?.location?.lat || place.location?.latitude || 0,
          longitude: place.geometry?.location?.lng || place.location?.longitude || 0,
          hasWudu: Boolean(place.hasWudu),
          hasParking: Boolean(place.hasParking),
          capacity: typeof place.capacity === 'number' ? place.capacity : undefined,
          distance: calculateDistance(
            location.lat,
            location.lng,
            place.geometry.location.lat,
            place.geometry.location.lng
          ),
        }));

        setNearbyMosques(mosques.sort((a, b) => a.distance - b.distance));
      }
    } catch (error) {
      console.error('Failed to find nearby mosques:', error);
    }
  };

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) *
      Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Build formatted prayer times object for the screen
  const now = Date.now();
  const currentPrayer = prayerTimes.find((p, i) => {
    const next = prayerTimes[i + 1];
    return p.timestamp <= now && (!next || next.timestamp > now);
  });
  const isPraying = !!currentPrayer && (now - currentPrayer.timestamp) < 30 * 60 * 1000; // within 30 min

  const PRAYER_NAMES: Record<string, { arabic: string; hausa: string }> = {
    'Fajr': { arabic: 'الفجر', hausa: 'Sallar Asuba' },
    'Dhuhr': { arabic: 'الظهر', hausa: 'Sallar Azahar' },
    'Asr': { arabic: 'العصر', hausa: 'Sallar La\'asar' },
    'Maghrib': { arabic: 'المغرب', hausa: 'Sallar Magariba' },
    'Isha': { arabic: 'العشاء', hausa: 'Sallar Isha\'i' },
  };

  const formattedPrayerTimes = prayerTimes.length > 0 ? {
    location: location ? `${location.lat.toFixed(2)}°N, ${location.lng.toFixed(2)}°E` : 'Lagos, Nigeria',
    date: new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
    prayers: prayerTimes.map(p => ({
      ...p,
      arabicName: PRAYER_NAMES[p.name]?.arabic || '',
      hausaName: PRAYER_NAMES[p.name]?.hausa || '',
      isActive: currentPrayer?.name === p.name && isPraying,
      isPassed: p.timestamp < now,
    })),
    nextPrayer,
  } : null;

  return {
    prayerTimes: formattedPrayerTimes,
    nextPrayer,
    settings,
    nearbyMosques,
    loading,
    isPraying,
    saveSettings,
    fetchPrayerTimes,
    findNearbyMosques,
  };
}

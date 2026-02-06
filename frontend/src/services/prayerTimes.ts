/**
 * NEXRYDE Prayer Times Service - REAL IMPLEMENTATION
 * Uses Aladhan API for accurate Islamic prayer times
 */

import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';

// Configure notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
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
}

export interface Mosque {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  distance: number;
}

const DEFAULT_SETTINGS: PrayerSettings = {
  enabled: false,
  notificationsEnabled: false,
  alertMinutesBefore: 10,
  vibration: true,
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
      const updated = { ...settings, ...newSettings };
      setSettings(updated);
      await AsyncStorage.setItem('prayer_settings', JSON.stringify(updated));
      
      if (updated.enabled && updated.notificationsEnabled) {
        await scheduleNotifications();
      } else {
        await Notifications.cancelAllScheduledNotificationsAsync();
      }
    } catch (error) {
      console.error('Failed to save prayer settings:', error);
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
      
      // Get user location
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.log('Location permission denied');
        setLoading(false);
        return;
      }

      const userLocation = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = userLocation.coords;
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
              date: new Date(alertTime),
            },
          });
        }
      }
      
      console.log(`Scheduled ${prayerTimes.length} prayer notifications`);
    } catch (error) {
      console.error('Failed to schedule notifications:', error);
    }
  };

  const findNearbyMosques = async () => {
    if (!location) return;

    try {
      // Use Google Places API to find nearby mosques
      const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${location.lat},${location.lng}&radius=5000&type=mosque&key=${apiKey}`
      );

      const data = await response.json();
      
      if (data.results) {
        const mosques: Mosque[] = data.results.slice(0, 10).map((place: any) => ({
          name: place.name,
          address: place.vicinity,
          latitude: place.geometry.location.lat,
          longitude: place.geometry.location.lng,
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

  return {
    prayerTimes,
    nextPrayer,
    settings,
    nearbyMosques,
    loading,
    saveSettings,
    fetchPrayerTimes,
    findNearbyMosques,
  };
}

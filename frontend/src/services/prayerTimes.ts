/**
 * NEXRYDE Prayer Times Service
 * Smart alerts for Muslim drivers
 * 
 * "Respect for faith, success in work" 🕌
 */

import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { Vibration, Alert } from 'react-native';

// Prayer Times Types
export type PrayerName = 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';

export interface PrayerTime {
  name: PrayerName;
  arabicName: string;
  hausaName: string;
  time: string; // HH:MM format
  timestamp: number;
  isActive: boolean;
  hasAlerted: boolean;
}

export interface DailyPrayerTimes {
  date: string;
  location: string;
  latitude: number;
  longitude: number;
  prayers: PrayerTime[];
  nextPrayer: PrayerTime | null;
}

export interface PrayerSettings {
  enabled: boolean;
  autoPauseRides: boolean;
  pauseDuration: number; // minutes (default: 15)
  alertBefore: number; // minutes before prayer (default: 10)
  showMosqueLocations: boolean;
  notificationSound: boolean;
  vibration: boolean;
}

export interface Mosque {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  distance: number; // km from user
  hasWudu: boolean; // Ablution facilities
  hasParking: boolean;
  capacity?: number;
}

/**
 * Prayer Times Calculator
 * Uses astronomical calculations for accurate prayer times
 */
export class PrayerTimesCalculator {
  /**
   * Calculate prayer times for a given location and date
   * Based on Islamic prayer calculation methods
   */
  static calculatePrayerTimes(
    latitude: number,
    longitude: number,
    date: Date = new Date()
  ): DailyPrayerTimes {
    // For production, integrate with:
    // - Aladhan API (https://aladhan.com/prayer-times-api)
    // - Islamic Finder API
    // - Local calculation library (adhan-js)
    
    // For now, using Nigerian averages (Lagos timezone)
    // This is a simplified version - production should use proper astronomical calculations
    
    const prayers: PrayerTime[] = [
      {
        name: 'fajr',
        arabicName: 'الفجر',
        hausaName: 'Alfajiri',
        time: '05:15',
        timestamp: this.timeToTimestamp(date, '05:15'),
        isActive: false,
        hasAlerted: false,
      },
      {
        name: 'dhuhr',
        arabicName: 'الظهر',
        hausaName: 'Azahar',
        time: '12:45',
        timestamp: this.timeToTimestamp(date, '12:45'),
        isActive: false,
        hasAlerted: false,
      },
      {
        name: 'asr',
        arabicName: 'العصر',
        hausaName: 'Asarar',
        time: '16:00',
        timestamp: this.timeToTimestamp(date, '16:00'),
        isActive: false,
        hasAlerted: false,
      },
      {
        name: 'maghrib',
        arabicName: 'المغرب',
        hausaName: 'Magrib',
        time: '18:45',
        timestamp: this.timeToTimestamp(date, '18:45'),
        isActive: false,
        hasAlerted: false,
      },
      {
        name: 'isha',
        arabicName: 'العشاء',
        hausaName: 'Isha\'i',
        time: '20:00',
        timestamp: this.timeToTimestamp(date, '20:00'),
        isActive: false,
        hasAlerted: false,
      },
    ];
    
    const now = Date.now();
    const nextPrayer = prayers.find(p => p.timestamp > now) || prayers[0];
    
    return {
      date: date.toISOString().split('T')[0],
      location: this.getLocationName(latitude, longitude),
      latitude,
      longitude,
      prayers,
      nextPrayer,
    };
  }
  
  /**
   * Get prayer times from Aladhan API (production)
   */
  static async fetchPrayerTimesFromAPI(
    latitude: number,
    longitude: number,
    date: Date = new Date()
  ): Promise<DailyPrayerTimes> {
    try {
      // Production: Use Aladhan API
      // const response = await fetch(
      //   `https://api.aladhan.com/v1/timings/${date.getTime()/1000}?latitude=${latitude}&longitude=${longitude}&method=2`
      // );
      // const data = await response.json();
      // return this.parseAladhanResponse(data);
      
      // For now, use local calculation
      return this.calculatePrayerTimes(latitude, longitude, date);
    } catch (error) {
      console.error('Failed to fetch prayer times:', error);
      return this.calculatePrayerTimes(latitude, longitude, date);
    }
  }
  
  /**
   * Convert time string to timestamp
   */
  private static timeToTimestamp(date: Date, time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    const d = new Date(date);
    d.setHours(hours, minutes, 0, 0);
    return d.getTime();
  }
  
  /**
   * Get location name from coordinates
   */
  private static getLocationName(lat: number, lng: number): string {
    // In production, use reverse geocoding
    // For now, return generic based on coordinates
    
    // Lagos area
    if (lat >= 6.4 && lat <= 6.7 && lng >= 3.3 && lng <= 3.6) {
      return 'Lagos';
    }
    // Abuja area
    if (lat >= 8.9 && lat <= 9.2 && lng >= 7.3 && lng <= 7.6) {
      return 'Abuja';
    }
    // Kano area
    if (lat >= 11.9 && lat <= 12.1 && lng >= 8.4 && lng <= 8.6) {
      return 'Kano';
    }
    
    return 'Nigeria';
  }
  
  /**
   * Check if it's currently prayer time
   */
  static isPrayerTime(prayer: PrayerTime, pauseDuration: number = 15): boolean {
    const now = Date.now();
    const prayerEnd = prayer.timestamp + (pauseDuration * 60 * 1000);
    return now >= prayer.timestamp && now <= prayerEnd;
  }
  
  /**
   * Get next prayer
   */
  static getNextPrayer(prayerTimes: DailyPrayerTimes): PrayerTime | null {
    const now = Date.now();
    return prayerTimes.prayers.find(p => p.timestamp > now) || prayerTimes.prayers[0];
  }
  
  /**
   * Get time until next prayer (in minutes)
   */
  static getTimeUntilNextPrayer(nextPrayer: PrayerTime): number {
    const now = Date.now();
    const diff = nextPrayer.timestamp - now;
    return Math.max(0, Math.floor(diff / (60 * 1000)));
  }
  
  /**
   * Format time until prayer
   */
  static formatTimeUntilPrayer(minutes: number): string {
    if (minutes < 1) return 'Now';
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
}

/**
 * Mosque Finder Service
 */
export class MosqueFinder {
  /**
   * Find mosques near location
   */
  static async findNearbyMosques(
    latitude: number,
    longitude: number,
    radiusKm: number = 5
  ): Promise<Mosque[]> {
    // In production, integrate with:
    // - Google Places API (type: mosque)
    // - Foursquare API
    // - Local mosque database
    
    // For now, return simulated Nigerian mosques
    return this.getSimulatedMosques(latitude, longitude);
  }
  
  /**
   * Simulated mosque data for Nigerian cities
   */
  private static getSimulatedMosques(lat: number, lng: number): Mosque[] {
    const mosques: Mosque[] = [];
    
    // Lagos mosques
    if (lat >= 6.4 && lat <= 6.7 && lng >= 3.3 && lng <= 3.6) {
      mosques.push(
        {
          id: 'lagos-1',
          name: 'Lagos Central Mosque',
          address: 'Adeniji Adele Road, Lagos Island',
          latitude: 6.4541,
          longitude: 3.3947,
          distance: this.calculateDistance(lat, lng, 6.4541, 3.3947),
          hasWudu: true,
          hasParking: true,
          capacity: 5000,
        },
        {
          id: 'lagos-2',
          name: 'Surulere Mosque',
          address: 'Adeniran Ogunsanya, Surulere',
          latitude: 6.4969,
          longitude: 3.3544,
          distance: this.calculateDistance(lat, lng, 6.4969, 3.3544),
          hasWudu: true,
          hasParking: false,
        },
        {
          id: 'lagos-3',
          name: 'Ikeja Central Mosque',
          address: 'Allen Avenue, Ikeja',
          latitude: 6.5944,
          longitude: 3.3417,
          distance: this.calculateDistance(lat, lng, 6.5944, 3.3417),
          hasWudu: true,
          hasParking: true,
          capacity: 3000,
        }
      );
    }
    
    // Abuja mosques
    if (lat >= 8.9 && lat <= 9.2 && lng >= 7.3 && lng <= 7.6) {
      mosques.push(
        {
          id: 'abuja-1',
          name: 'National Mosque (Abuja)',
          address: 'Independence Avenue, Central Area',
          latitude: 9.0643,
          longitude: 7.4892,
          distance: this.calculateDistance(lat, lng, 9.0643, 7.4892),
          hasWudu: true,
          hasParking: true,
          capacity: 15000,
        },
        {
          id: 'abuja-2',
          name: 'Wuse Central Mosque',
          address: 'Wuse Zone 5, Abuja',
          latitude: 9.0579,
          longitude: 7.4951,
          distance: this.calculateDistance(lat, lng, 9.0579, 7.4951),
          hasWudu: true,
          hasParking: true,
        }
      );
    }
    
    // Kano mosques
    if (lat >= 11.9 && lat <= 12.1 && lng >= 8.4 && lng <= 8.6) {
      mosques.push(
        {
          id: 'kano-1',
          name: 'Kano Central Mosque',
          address: 'Kofar Mata, Kano',
          latitude: 12.0022,
          longitude: 8.5167,
          distance: this.calculateDistance(lat, lng, 12.0022, 8.5167),
          hasWudu: true,
          hasParking: true,
          capacity: 10000,
        }
      );
    }
    
    // Sort by distance
    return mosques.sort((a, b) => a.distance - b.distance);
  }
  
  /**
   * Calculate distance between two points (Haversine formula)
   */
  private static calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c * 10) / 10; // Round to 1 decimal
  }
  
  private static toRad(degrees: number): number {
    return (degrees * Math.PI) / 180;
  }
}

/**
 * Prayer Times React Hook
 */
export const usePrayerTimes = () => {
  const [prayerTimes, setPrayerTimes] = useState<DailyPrayerTimes | null>(null);
  const [settings, setSettings] = useState<PrayerSettings>({
    enabled: false,
    autoPauseRides: true,
    pauseDuration: 15,
    alertBefore: 10,
    showMosqueLocations: true,
    notificationSound: true,
    vibration: true,
  });
  const [nearbyMosques, setNearbyMosques] = useState<Mosque[]>([]);
  const [isPraying, setIsPraying] = useState(false);
  const [loading, setLoading] = useState(true);
  
  /**
   * Load prayer settings
   */
  const loadSettings = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem('@prayer_settings');
      if (stored) {
        setSettings(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Failed to load prayer settings:', error);
    }
  }, []);
  
  /**
   * Save prayer settings
   */
  const saveSettings = useCallback(async (newSettings: Partial<PrayerSettings>) => {
    try {
      const updated = { ...settings, ...newSettings };
      setSettings(updated);
      await AsyncStorage.setItem('@prayer_settings', JSON.stringify(updated));
    } catch (error) {
      console.error('Failed to save prayer settings:', error);
    }
  }, [settings]);
  
  /**
   * Fetch prayer times for current location
   */
  const fetchPrayerTimes = useCallback(async () => {
    try {
      setLoading(true);
      
      // Get current location
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please enable location to get accurate prayer times.');
        return;
      }
      
      const location = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = location.coords;
      
      // Calculate prayer times
      const times = await PrayerTimesCalculator.fetchPrayerTimesFromAPI(
        latitude,
        longitude
      );
      
      setPrayerTimes(times);
      
      // Find nearby mosques if enabled
      if (settings.showMosqueLocations) {
        const mosques = await MosqueFinder.findNearbyMosques(latitude, longitude);
        setNearbyMosques(mosques);
      }
      
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch prayer times:', error);
      setLoading(false);
    }
  }, [settings.showMosqueLocations]);
  
  /**
   * Check if currently in prayer time
   */
  const checkPrayerTime = useCallback(() => {
    if (!prayerTimes || !settings.enabled) return;
    
    const now = Date.now();
    let isPrayerTimeNow = false;
    
    for (const prayer of prayerTimes.prayers) {
      if (PrayerTimesCalculator.isPrayerTime(prayer, settings.pauseDuration)) {
        isPrayerTimeNow = true;
        if (!prayer.isActive) {
          // Prayer time just started
          handlePrayerTimeStart(prayer);
        }
        prayer.isActive = true;
      } else {
        if (prayer.isActive) {
          // Prayer time just ended
          handlePrayerTimeEnd(prayer);
        }
        prayer.isActive = false;
      }
    }
    
    setIsPraying(isPrayerTimeNow);
  }, [prayerTimes, settings]);
  
  /**
   * Handle prayer time start
   */
  const handlePrayerTimeStart = useCallback(async (prayer: PrayerTime) => {
    console.log(`Prayer time started: ${prayer.name}`);
    
    // Vibrate
    if (settings.vibration) {
      Vibration.vibrate([0, 500, 200, 500, 200, 500]);
    }
    
    // Show notification
    if (settings.notificationSound) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `🕌 ${prayer.arabicName} Prayer Time`,
          body: `It's time for ${prayer.hausaName} prayer. May Allah accept your prayers.`,
          sound: 'default',
        },
        trigger: null,
      });
    }
    
    // Alert user
    Alert.alert(
      `🕌 ${prayer.arabicName} Prayer Time`,
      `It's time for ${prayer.name.toUpperCase()} prayer (${prayer.hausaName}).\n\n${
        settings.autoPauseRides
          ? `Ride requests will be paused for ${settings.pauseDuration} minutes.`
          : 'You can continue working or take a break to pray.'
      }`,
      [
        {
          text: settings.autoPauseRides ? 'OK' : 'Continue Working',
          style: 'cancel',
        },
        {
          text: 'Find Mosque',
          onPress: () => {
            // Navigate to mosque finder
            console.log('Navigate to mosque finder');
          },
        },
      ]
    );
  }, [settings]);
  
  /**
   * Handle prayer time end
   */
  const handlePrayerTimeEnd = useCallback((prayer: PrayerTime) => {
    console.log(`Prayer time ended: ${prayer.name}`);
    
    if (settings.autoPauseRides) {
      Alert.alert(
        '✅ Prayer Time Complete',
        `${prayer.name.toUpperCase()} prayer time has ended. You can now resume accepting rides.`,
        [{ text: 'OK' }]
      );
    }
  }, [settings.autoPauseRides]);
  
  /**
   * Schedule pre-prayer alerts
   */
  const scheduleAlerts = useCallback(async () => {
    if (!prayerTimes || !settings.enabled || !settings.alertBefore) return;
    
    // Cancel existing notifications
    await Notifications.cancelAllScheduledNotificationsAsync();
    
    // Schedule alerts for each prayer
    for (const prayer of prayerTimes.prayers) {
      const alertTime = prayer.timestamp - (settings.alertBefore * 60 * 1000);
      
      if (alertTime > Date.now()) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: '⏰ Prayer Time Approaching',
            body: `${prayer.name.toUpperCase()} prayer in ${settings.alertBefore} minutes`,
            sound: 'default',
          },
          trigger: {
            date: alertTime,
          },
        });
      }
    }
  }, [prayerTimes, settings]);
  
  /**
   * Initialize
   */
  useEffect(() => {
    loadSettings();
    fetchPrayerTimes();
  }, []);
  
  /**
   * Check prayer time every minute
   */
  useEffect(() => {
    const interval = setInterval(checkPrayerTime, 60000); // Check every minute
    checkPrayerTime(); // Check immediately
    return () => clearInterval(interval);
  }, [checkPrayerTime]);
  
  /**
   * Schedule alerts when prayer times change
   */
  useEffect(() => {
    scheduleAlerts();
  }, [scheduleAlerts]);
  
  /**
   * Refresh prayer times at midnight
   */
  useEffect(() => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 1, 0, 0); // 12:01 AM
    
    const timeUntilMidnight = tomorrow.getTime() - now.getTime();
    
    const timeout = setTimeout(() => {
      fetchPrayerTimes();
      // Set up daily refresh
      const dailyInterval = setInterval(fetchPrayerTimes, 24 * 60 * 60 * 1000);
      return () => clearInterval(dailyInterval);
    }, timeUntilMidnight);
    
    return () => clearTimeout(timeout);
  }, [fetchPrayerTimes]);
  
  return {
    prayerTimes,
    settings,
    nearbyMosques,
    isPraying,
    loading,
    saveSettings,
    fetchPrayerTimes,
  };
};

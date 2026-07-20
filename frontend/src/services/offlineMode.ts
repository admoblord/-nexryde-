/**
 * NEXRYDE Offline Mode Service
 * Network monitoring + fare/location cache + unified action queue.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { Alert } from 'react-native';
import {
  clearQueue,
  flushOfflineQueue,
  migrateLegacyOfflineQueue,
  queueLength,
} from '@/src/utils/offlineQueue';
import { queueDriverAccept, queueTripRequest } from '@/src/utils/offlineQueueActions';
import {
  getPlatformConnectionSnapshot,
  startPlatformConnectionManager,
  subscribePlatformConnection,
} from '@/src/services/platformConnectionManager';

let isOnline = true;
let networkType: string | null = null;
let netInfoUnsubscribe: (() => void) | null = null;
let legacyMigrated = false;

/**
 * Initialize offline mode (singleton — safe to call multiple times).
 * Internet signals are owned by NetworkStateManager; this only tracks ops-online.
 */
export const initializeOfflineMode = (): (() => void) => {
  if (!legacyMigrated) {
    legacyMigrated = true;
    void migrateLegacyOfflineQueue();
  }

  if (netInfoUnsubscribe) return netInfoUnsubscribe;

  startPlatformConnectionManager();
  // Single NetInfo publisher lives in platformConnectionManager — do not double-subscribe.
  void NetInfo.fetch().then((state) => {
    networkType = state.type;
  });

  netInfoUnsubscribe = subscribePlatformConnection((snap) => {
    const wasOffline = !isOnline;
    isOnline = snap.state !== 'OFFLINE';
    if (wasOffline && isOnline) {
      void syncQueuedRequests();
    }
  });

  return () => {
    netInfoUnsubscribe?.();
    netInfoUnsubscribe = null;
  };
};

export const checkOnlineStatus = async (): Promise<boolean> => {
  startPlatformConnectionManager();
  // Temporary latency / DEGRADED / RECONNECTING must not cancel ride search.
  isOnline = getPlatformConnectionSnapshot().state !== 'OFFLINE';
  return isOnline;
};

export const getNetworkType = async (): Promise<string> => {
  const state = await NetInfo.fetch();
  return state.type || 'unknown';
};

/** @deprecated Use queueTripRequest / queueDriverAccept directly. */
export const queueRequest = async (
  type: 'trip_request' | 'driver_accept_trip' | 'location_update' | 'profile_update',
  data: Record<string, unknown>,
): Promise<void> => {
  if (type === 'trip_request') {
    const riderId = String(data.rider_id || '');
    if (riderId) await queueTripRequest(riderId, data);
    return;
  }
  if (type === 'driver_accept_trip') {
    const tripId = String(data.trip_id || '');
    if (tripId) {
      await queueDriverAccept(tripId, {
        driver_id: String(data.driver_id || ''),
        offer_id: data.offer_id as string | undefined,
        proposed_fare: Number(data.proposed_fare || 0),
      });
    }
  }
};

/** Flush unified offline queue and surface user feedback for ride actions. */
export const syncQueuedRequests = async (): Promise<void> => {
  try {
    const { flushed, flushedLabels } = await flushOfflineQueue();
    if (flushed === 0) return;

    if (flushedLabels.includes('trip_request')) {
      Alert.alert(
        'Trip Requested!',
        'Your ride request has been sent. Searching for drivers...',
      );
    }
    if (flushedLabels.includes('driver_accept_trip')) {
      Alert.alert(
        'Ride Accepted',
        'Your queued ride acceptance was sent successfully after network recovery.',
      );
    }
  } catch {
    /* non-fatal */
  }
};

export const cacheFareEstimate = async (route: string, estimate: unknown): Promise<void> => {
  try {
    const cacheJson = await AsyncStorage.getItem('@fare_cache');
    const cache = cacheJson ? JSON.parse(cacheJson) : {};
    cache[route] = { ...(estimate as object), cached_at: Date.now() };
    await AsyncStorage.setItem('@fare_cache', JSON.stringify(cache));
  } catch {
    /* ignore */
  }
};

export const getCachedFareEstimate = async (route: string): Promise<unknown | null> => {
  try {
    const cacheJson = await AsyncStorage.getItem('@fare_cache');
    if (!cacheJson) return null;
    const cache = JSON.parse(cacheJson);
    const estimate = cache[route];
    if (estimate && Date.now() - estimate.cached_at < 24 * 60 * 60 * 1000) return estimate;
    return null;
  } catch {
    return null;
  }
};

export const cacheRecentLocation = async (location: unknown): Promise<void> => {
  try {
    const locationsJson = await AsyncStorage.getItem('@recent_locations');
    const locations = locationsJson ? JSON.parse(locationsJson) : [];
    locations.unshift(location);
    await AsyncStorage.setItem('@recent_locations', JSON.stringify(locations.slice(0, 20)));
  } catch {
    /* ignore */
  }
};

export const getRecentLocations = async (): Promise<unknown[]> => {
  try {
    const locationsJson = await AsyncStorage.getItem('@recent_locations');
    return locationsJson ? JSON.parse(locationsJson) : [];
  } catch {
    return [];
  }
};

export const createOfflineBooking = async (
  riderId: string,
  bookingData: Record<string, unknown>,
): Promise<void> => {
  await queueTripRequest(riderId, { rider_id: riderId, ...bookingData });
  Alert.alert(
    'Offline Mode',
    'No network detected. Your ride request has been saved and will be sent automatically when you\'re back online.',
    [{ text: 'OK' }],
  );
};

export const queueDriverRideAcceptance = async (
  tripId: string,
  data: {
    driver_id: string;
    offer_id?: string;
    proposed_fare: number;
  },
): Promise<void> => {
  await queueDriverAccept(tripId, data);
  Alert.alert(
    'Offline Mode',
    'Low network detected. Your ride acceptance has been saved and will sync automatically once the network is stable.',
    [{ text: 'OK' }],
  );
};

export const getOfflineMessage = async (): Promise<string> => {
  const size = await queueLength();
  if (size === 0) return 'You are offline. Ride requests will be queued.';
  return `You are offline. ${size} ride request(s) waiting to sync.`;
};

export const clearOfflineQueue = async (): Promise<void> => {
  await clearQueue();
};

export const getQueueSize = queueLength;

export { isOnline, networkType };

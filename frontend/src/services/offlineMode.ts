/**
 * NEXRYDE Offline Mode Service
 * Allows app to work even with no network
 * 
 * Features:
 * - Offline booking (queued when online)
 * - Cached locations and fares
 * - Network status monitoring
 * - Auto-sync when online
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { Alert } from 'react-native';
import { BACKEND_URL } from '@/src/services/api';

// Offline queue for pending requests
interface QueuedRequest {
  id: string;
  type: 'trip_request' | 'driver_accept_trip' | 'location_update' | 'profile_update';
  data: any;
  timestamp: number;
  retries: number;
}

// Network status
let isOnline = true;
let networkType: string | null = null;

/**
 * Initialize offline mode
 */
export const initializeOfflineMode = () => {
  // Monitor network status
  NetInfo.addEventListener(state => {
    const wasOffline = !isOnline;
    isOnline = state.isConnected ?? false;
    networkType = state.type;
    
    console.log(`Network status: ${isOnline ? 'Online' : 'Offline'} (${networkType})`);
    
    // Auto-sync when back online
    if (wasOffline && isOnline) {
      console.log('Back online! Syncing queued requests...');
      syncQueuedRequests();
    }
  });
};

/**
 * Check if currently online
 */
export const checkOnlineStatus = async (): Promise<boolean> => {
  const state = await NetInfo.fetch();
  isOnline = state.isConnected ?? false;
  return isOnline;
};

/**
 * Get network type (wifi, cellular, none)
 */
export const getNetworkType = async (): Promise<string> => {
  const state = await NetInfo.fetch();
  return state.type || 'unknown';
};

/**
 * Queue request for later when offline
 */
export const queueRequest = async (
  type: QueuedRequest['type'],
  data: any
): Promise<void> => {
  const request: QueuedRequest = {
    id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type,
    data,
    timestamp: Date.now(),
    retries: 0,
  };
  
  try {
    const queueJson = await AsyncStorage.getItem('@offline_queue');
    const queue: QueuedRequest[] = queueJson ? JSON.parse(queueJson) : [];
    queue.push(request);
    
    await AsyncStorage.setItem('@offline_queue', JSON.stringify(queue));
    console.log(`Queued ${type} request for later sync`);
  } catch (error) {
    console.error('Failed to queue request:', error);
  }
};

/**
 * Sync all queued requests when back online
 */
export const syncQueuedRequests = async (): Promise<void> => {
  try {
    const queueJson = await AsyncStorage.getItem('@offline_queue');
    if (!queueJson) return;
    
    const queue: QueuedRequest[] = JSON.parse(queueJson);
    if (queue.length === 0) return;
    
    console.log(`Syncing ${queue.length} queued requests...`);
    
    const failedRequests: QueuedRequest[] = [];
    
    for (const request of queue) {
      try {
        // Process based on type
        if (request.type === 'trip_request') {
          // Include Authorization if the queued payload carried a token (required when JWT middleware applies).
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          const t = (request.data as { auth_token?: string })?.auth_token;
          if (t) headers.Authorization = `Bearer ${t}`;
          const response = await fetch(
            `${BACKEND_URL}/api/trips/request?rider_id=${request.data.rider_id}`,
            {
              method: 'POST',
              headers,
              body: JSON.stringify(request.data),
            }
          );
          
          if (response.ok) {
            console.log(`✅ Synced trip request: ${request.id}`);
            Alert.alert(
              'Trip Requested!',
              'Your ride request has been sent. Searching for drivers...'
            );
          } else {
            throw new Error('Request failed');
          }
        }
        if (request.type === 'driver_accept_trip') {
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          const t = (request.data as { auth_token?: string })?.auth_token;
          if (t) headers.Authorization = `Bearer ${t}`;
          const response = await fetch(
            `${BACKEND_URL}/api/trips/${request.data.trip_id}/accept`,
            {
              method: 'PUT',
              headers,
              body: JSON.stringify({
                driver_id: request.data.driver_id,
                offer_id: request.data.offer_id,
                proposed_fare: request.data.proposed_fare,
              }),
            }
          );

          if (response.ok) {
            console.log(`✅ Synced driver accept: ${request.id}`);
            Alert.alert(
              'Ride Accepted',
              'Your queued ride acceptance was sent successfully after network recovery.'
            );
          } else {
            throw new Error('Driver accept failed');
          }
        }
        // Add other request types as needed
        
      } catch (error) {
        console.error(`Failed to sync request ${request.id}:`, error);
        request.retries += 1;
        
        // Retry up to 3 times
        if (request.retries < 3) {
          failedRequests.push(request);
        } else {
          console.log(`Giving up on request ${request.id} after 3 retries`);
        }
      }
    }
    
    // Save failed requests back to queue
    await AsyncStorage.setItem('@offline_queue', JSON.stringify(failedRequests));
    
    if (failedRequests.length === 0) {
      console.log('✅ All requests synced successfully!');
    } else {
      console.log(`⚠️ ${failedRequests.length} requests failed, will retry later`);
    }
    
  } catch (error) {
    console.error('Sync error:', error);
  }
};

/**
 * Cache fare estimate for offline use
 */
export const cacheFareEstimate = async (
  route: string,
  estimate: any
): Promise<void> => {
  try {
    const cacheJson = await AsyncStorage.getItem('@fare_cache');
    const cache = cacheJson ? JSON.parse(cacheJson) : {};
    
    cache[route] = {
      ...estimate,
      cached_at: Date.now(),
    };
    
    await AsyncStorage.setItem('@fare_cache', JSON.stringify(cache));
  } catch (error) {
    console.error('Failed to cache fare:', error);
  }
};

/**
 * Get cached fare estimate
 */
export const getCachedFareEstimate = async (
  route: string
): Promise<any | null> => {
  try {
    const cacheJson = await AsyncStorage.getItem('@fare_cache');
    if (!cacheJson) return null;
    
    const cache = JSON.parse(cacheJson);
    const estimate = cache[route];
    
    // Check if cache is still valid (24 hours)
    if (estimate && Date.now() - estimate.cached_at < 24 * 60 * 60 * 1000) {
      return estimate;
    }
    
    return null;
  } catch (error) {
    console.error('Failed to get cached fare:', error);
    return null;
  }
};

/**
 * Cache recent locations for offline autocomplete
 */
export const cacheRecentLocation = async (
  location: any
): Promise<void> => {
  try {
    const locationsJson = await AsyncStorage.getItem('@recent_locations');
    const locations = locationsJson ? JSON.parse(locationsJson) : [];
    
    // Add to start of array
    locations.unshift(location);
    
    // Keep only last 20 locations
    const recent = locations.slice(0, 20);
    
    await AsyncStorage.setItem('@recent_locations', JSON.stringify(recent));
  } catch (error) {
    console.error('Failed to cache location:', error);
  }
};

/**
 * Get cached recent locations
 */
export const getRecentLocations = async (): Promise<any[]> => {
  try {
    const locationsJson = await AsyncStorage.getItem('@recent_locations');
    return locationsJson ? JSON.parse(locationsJson) : [];
  } catch (error) {
    console.error('Failed to get recent locations:', error);
    return [];
  }
};

/**
 * Create offline booking (queued for sync)
 */
export const createOfflineBooking = async (
  riderId: string,
  bookingData: any,
  authToken?: string | null
): Promise<void> => {
  await queueRequest('trip_request', {
    rider_id: riderId,
    ...bookingData,
    ...(authToken ? { auth_token: authToken } : {}),
  });
  
  // Show confirmation
  Alert.alert(
    '📱 Offline Mode',
    'No network detected. Your ride request has been saved and will be sent automatically when you\'re back online.',
    [{ text: 'OK' }]
  );
};

export const queueDriverRideAcceptance = async (
  tripId: string,
  data: {
    driver_id: string;
    offer_id?: string;
    proposed_fare: number;
  },
  authToken?: string | null
): Promise<void> => {
  await queueRequest('driver_accept_trip', {
    trip_id: tripId,
    ...data,
    ...(authToken ? { auth_token: authToken } : {}),
  });

  Alert.alert(
    'Offline Mode',
    'Low network detected. Your ride acceptance has been saved and will sync automatically once the network is stable.',
    [{ text: 'OK' }]
  );
};

/**
 * Get offline status message
 */
export const getOfflineMessage = async (): Promise<string> => {
  const queueJson = await AsyncStorage.getItem('@offline_queue');
  const queue: QueuedRequest[] = queueJson ? JSON.parse(queueJson) : [];
  
  if (queue.length === 0) {
    return 'You are offline. Ride requests will be queued.';
  }
  
  return `You are offline. ${queue.length} ride request(s) waiting to sync.`;
};

/**
 * Clear offline queue
 */
export const clearOfflineQueue = async (): Promise<void> => {
  await AsyncStorage.removeItem('@offline_queue');
};

/**
 * Get queue size
 */
export const getQueueSize = async (): Promise<number> => {
  try {
    const queueJson = await AsyncStorage.getItem('@offline_queue');
    const queue: QueuedRequest[] = queueJson ? JSON.parse(queueJson) : [];
    return queue.length;
  } catch {
    return 0;
  }
};

// Export network status
export { isOnline, networkType };

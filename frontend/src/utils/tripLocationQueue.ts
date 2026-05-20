import AsyncStorage from '@react-native-async-storage/async-storage';
import { postTripLocation } from '@/src/services/tripTrackingApi';

const QUEUE_KEY = '@nexryde_trip_location_queue';
const MAX_QUEUE = 120;

export type QueuedTripLocation = {
  tripId: string;
  latitude: number;
  longitude: number;
  heading?: number;
  speed?: number;
  timestamp: string;
};

export async function queueTripLocation(item: QueuedTripLocation): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    const queue: QueuedTripLocation[] = raw ? JSON.parse(raw) : [];
    queue.push(item);
    while (queue.length > MAX_QUEUE) queue.shift();
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    /* ignore */
  }
}

export async function flushTripLocationQueue(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return 0;
    const queue: QueuedTripLocation[] = JSON.parse(raw);
    if (!queue.length) return 0;
    const remaining: QueuedTripLocation[] = [];
    let sent = 0;
    for (const item of queue) {
      const res = await postTripLocation(item.tripId, {
        latitude: item.latitude,
        longitude: item.longitude,
        heading: item.heading,
        speed: item.speed,
        timestamp: item.timestamp,
      });
      if (res?.success) sent += 1;
      else remaining.push(item);
    }
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
    return sent;
  } catch {
    return 0;
  }
}

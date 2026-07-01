import AsyncStorage from '@react-native-async-storage/async-storage';

export type DriverSessionSnapshot = {
  verificationStatus: string;
  subscriptionStatus: string;
  trialTripsCompleted: number;
  trialTripsTarget: number;
  trialExtended: boolean;
  cachedAt: number;
};

const TTL_MS = 6 * 60 * 60 * 1000;

function cacheKey(driverId: string): string {
  return `nexryde_driver_session_v1_${driverId}`;
}

export async function readDriverSessionCache(
  driverId: string,
): Promise<DriverSessionSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(driverId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DriverSessionSnapshot;
    if (!parsed?.cachedAt || Date.now() - parsed.cachedAt > TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function writeDriverSessionCache(
  driverId: string,
  snap: Omit<DriverSessionSnapshot, 'cachedAt'>,
): Promise<void> {
  try {
    const payload: DriverSessionSnapshot = { ...snap, cachedAt: Date.now() };
    await AsyncStorage.setItem(cacheKey(driverId), JSON.stringify(payload));
  } catch {
    /* non-critical */
  }
}

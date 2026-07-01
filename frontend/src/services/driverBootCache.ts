/**
 * Uber-style stale-while-revalidate cache for driver dashboard boot.
 * Lets the UI render immediately from last-known good state while network refreshes.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export type DriverBootSnapshot = {
  driverId: string;
  verificationStatus: string;
  subscriptionStatus: string;
  trialTripsCompleted: number;
  trialTripsTarget: number;
  trialExtended: boolean;
  onboardingCompleted: boolean;
  savedAt: number;
};

const CACHE_KEY = '@nexryde_driver_boot_snapshot_v1';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export async function readDriverBootCache(driverId: string): Promise<DriverBootSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw) as DriverBootSnapshot;
    if (snap.driverId !== driverId) return null;
    if (Date.now() - snap.savedAt > CACHE_TTL_MS) {
      await AsyncStorage.removeItem(CACHE_KEY);
      return null;
    }
    return snap;
  } catch {
    return null;
  }
}

export async function writeDriverBootCache(snap: Omit<DriverBootSnapshot, 'savedAt'>): Promise<void> {
  try {
    await AsyncStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ ...snap, savedAt: Date.now() } satisfies DriverBootSnapshot),
    );
  } catch {
    /* non-fatal */
  }
}

export async function clearDriverBootCache(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CACHE_KEY);
  } catch {
    /* non-fatal */
  }
}

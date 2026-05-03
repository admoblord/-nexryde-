import AsyncStorage from '@react-native-async-storage/async-storage';

export type DriverLastScreen = 'home' | 'trip' | 'earnings' | 'profile';

export interface DriverPersistState {
  isOnline: boolean;
  lastScreen: DriverLastScreen;
  activeTripId: string | null;
  userId: string;
  savedAt: number;
}

const STATE_KEY = '@nexryde_driver_state_v2';
const TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

export async function saveDriverState(
  state: Omit<DriverPersistState, 'savedAt'>,
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      STATE_KEY,
      JSON.stringify({ ...state, savedAt: Date.now() }),
    );
  } catch {}
}

export async function loadDriverState(userId: string): Promise<DriverPersistState | null> {
  try {
    const raw = await AsyncStorage.getItem(STATE_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw) as DriverPersistState;
    if (state.userId !== userId) return null;
    if (Date.now() - state.savedAt > TTL_MS) {
      await AsyncStorage.removeItem(STATE_KEY);
      return null;
    }
    return state;
  } catch {
    return null;
  }
}

export async function updateDriverOnlineStatus(
  isOnline: boolean,
  userId: string,
): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STATE_KEY);
    const base: Partial<DriverPersistState> = raw
      ? JSON.parse(raw)
      : { userId, lastScreen: 'home', activeTripId: null };
    await AsyncStorage.setItem(
      STATE_KEY,
      JSON.stringify({ ...base, isOnline, userId, savedAt: Date.now() }),
    );
  } catch {}
}

export async function updateDriverLastScreen(
  screen: DriverLastScreen,
  userId: string,
): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STATE_KEY);
    if (!raw) return;
    const base = JSON.parse(raw);
    await AsyncStorage.setItem(
      STATE_KEY,
      JSON.stringify({ ...base, lastScreen: screen, userId, savedAt: Date.now() }),
    );
  } catch {}
}

export async function updateDriverActiveTrip(
  tripId: string | null,
  userId: string,
): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STATE_KEY);
    const base: Partial<DriverPersistState> = raw
      ? JSON.parse(raw)
      : { userId, isOnline: true, lastScreen: 'trip' };
    await AsyncStorage.setItem(
      STATE_KEY,
      JSON.stringify({ ...base, activeTripId: tripId, userId, savedAt: Date.now() }),
    );
  } catch {}
}

export async function clearDriverState(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STATE_KEY);
  } catch {}
}

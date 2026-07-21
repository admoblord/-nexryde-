/**
 * Uber-style stale-while-revalidate cache for driver dashboard boot.
 * Lets the UI render immediately from last-known good state while network refreshes.
 *
 * Per-driver keys so account switches never flash another driver's status.
 * Approved verification is durable — returning verified drivers must never see Checking.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  peekDriverVerificationFact,
  readDriverVerificationFact,
  writeDriverVerificationFact,
} from '@/src/services/driverVerificationFact';

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

/** Legacy single-slot key (migrated on read). */
const LEGACY_CACHE_KEY = '@nexryde_driver_boot_snapshot_v1';
const cacheKeyFor = (driverId: string) => `@nexryde_driver_boot_snapshot_v2_${driverId}`;

/** Keep last-known verification across weak-network sessions (30 days). */
export const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const memory = new Map<string, DriverBootSnapshot>();

function isFresh(snap: DriverBootSnapshot): boolean {
  return Date.now() - snap.savedAt <= CACHE_TTL_MS;
}

function keepDespiteStale(snap: DriverBootSnapshot): boolean {
  return (
    snap.verificationStatus === 'approved' ||
    snap.subscriptionStatus === 'trial' ||
    snap.subscriptionStatus === 'active'
  );
}

/** Sync peek for first-paint (same-session memory + verification fact). */
export function peekDriverBootCache(driverId: string): DriverBootSnapshot | null {
  if (!driverId) return null;
  const mem = memory.get(driverId);
  if (mem) return mem;
  const fact = peekDriverVerificationFact(driverId);
  if (fact?.verificationStatus === 'approved') {
    return {
      driverId,
      verificationStatus: 'approved',
      subscriptionStatus: 'trial',
      trialTripsCompleted: 0,
      trialTripsTarget: 15,
      trialExtended: false,
      onboardingCompleted: true,
      savedAt: fact.savedAt,
    };
  }
  return null;
}

export async function readDriverBootCache(driverId: string): Promise<DriverBootSnapshot | null> {
  if (!driverId) return null;
  try {
    const mem = memory.get(driverId);
    if (mem) return mem;

    const key = cacheKeyFor(driverId);
    const raw = await AsyncStorage.getItem(key);
    if (raw) {
      const snap = JSON.parse(raw) as DriverBootSnapshot;
      if (snap.driverId !== driverId) return null;
      if (!isFresh(snap) && !keepDespiteStale(snap)) {
        await AsyncStorage.removeItem(key);
      } else {
        memory.set(driverId, snap);
        if (snap.verificationStatus === 'approved') {
          void writeDriverVerificationFact(driverId, 'approved');
        }
        return snap;
      }
    }

    // Durable approved fact (survives logout / boot-cache clear).
    const fact = await readDriverVerificationFact(driverId);
    if (fact?.verificationStatus === 'approved') {
      const fromFact: DriverBootSnapshot = {
        driverId,
        verificationStatus: 'approved',
        subscriptionStatus: 'trial',
        trialTripsCompleted: 0,
        trialTripsTarget: 15,
        trialExtended: false,
        onboardingCompleted: true,
        savedAt: fact.savedAt,
      };
      memory.set(driverId, fromFact);
      return fromFact;
    }

    // One-time migrate from legacy global key.
    const legacyRaw = await AsyncStorage.getItem(LEGACY_CACHE_KEY);
    if (!legacyRaw) return null;
    const legacy = JSON.parse(legacyRaw) as DriverBootSnapshot;
    if (legacy.driverId !== driverId) return null;
    await writeDriverBootCache(legacy);
    await AsyncStorage.removeItem(LEGACY_CACHE_KEY);
    return isFresh(legacy) || keepDespiteStale(legacy) ? legacy : null;
  } catch {
    return null;
  }
}

export async function writeDriverBootCache(snap: Omit<DriverBootSnapshot, 'savedAt'>): Promise<void> {
  if (!snap.driverId) return;
  try {
    const payload = { ...snap, savedAt: Date.now() } satisfies DriverBootSnapshot;
    memory.set(snap.driverId, payload);
    await AsyncStorage.setItem(cacheKeyFor(snap.driverId), JSON.stringify(payload));
    if (snap.verificationStatus === 'approved') {
      await writeDriverVerificationFact(snap.driverId, 'approved');
    } else if (snap.verificationStatus) {
      // Persist non-approved too so Home/Profile agree; logout may clear boot snap but fact stays if approved.
      await writeDriverVerificationFact(snap.driverId, snap.verificationStatus);
    }
    try {
      const legacyRaw = await AsyncStorage.getItem(LEGACY_CACHE_KEY);
      if (legacyRaw) {
        const legacy = JSON.parse(legacyRaw) as DriverBootSnapshot;
        if (legacy.driverId === snap.driverId) {
          await AsyncStorage.removeItem(LEGACY_CACHE_KEY);
        }
      }
    } catch {
      /* non-fatal */
    }
  } catch {
    /* non-fatal */
  }
}

/**
 * Logout: clear ephemeral boot snapshot but KEEP durable approved fact
 * so the next login paints Verified/GO ONLINE instantly.
 */
export async function clearDriverBootCache(driverId?: string): Promise<void> {
  try {
    if (driverId) {
      const fact = memory.get(driverId)?.verificationStatus === 'approved'
        ? memory.get(driverId)
        : await readDriverVerificationFact(driverId);
      memory.delete(driverId);
      await AsyncStorage.removeItem(cacheKeyFor(driverId));
      // Re-seed memory from durable fact so peek works immediately after logout→login.
      if (fact?.verificationStatus === 'approved') {
        memory.set(driverId, {
          driverId,
          verificationStatus: 'approved',
          subscriptionStatus: 'trial',
          trialTripsCompleted: 0,
          trialTripsTarget: 15,
          trialExtended: false,
          onboardingCompleted: true,
          savedAt: fact.savedAt ?? Date.now(),
        });
      }
    } else {
      // Global clear: keep any approved facts in memory from AsyncStorage on next read.
      memory.clear();
    }
    await AsyncStorage.removeItem(LEGACY_CACHE_KEY);
  } catch {
    /* non-fatal */
  }
}

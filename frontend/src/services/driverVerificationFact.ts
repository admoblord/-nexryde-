/**
 * Permanent per-driver verification fact for DISPLAY.
 * Written once on server-confirmed approval; survives logout.
 * Go-online authorization still reconfirms with the server at tap time.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export type DriverVerificationFact = {
  driverId: string;
  verificationStatus: string;
  savedAt: number;
};

const factKey = (driverId: string) => `@nexryde_driver_verification_fact_v1_${driverId}`;

/** Sync memory so Home can paint approved on first frame of a session. */
const memory = new Map<string, DriverVerificationFact>();

export function peekDriverVerificationFact(driverId: string): DriverVerificationFact | null {
  if (!driverId) return null;
  return memory.get(driverId) ?? null;
}

export async function readDriverVerificationFact(
  driverId: string,
): Promise<DriverVerificationFact | null> {
  if (!driverId) return null;
  const mem = memory.get(driverId);
  if (mem) return mem;
  try {
    const raw = await AsyncStorage.getItem(factKey(driverId));
    if (!raw) return null;
    const fact = JSON.parse(raw) as DriverVerificationFact;
    if (!fact?.driverId || fact.driverId !== driverId || !fact.verificationStatus) return null;
    memory.set(driverId, fact);
    return fact;
  } catch {
    return null;
  }
}

const HARD_DOWNGRADES = new Set([
  'suspended',
  'rejected',
  'banned',
  'revoked',
  'documents_rejected',
  'blocked',
]);

/**
 * Persist status. Approved is durable across logout.
 * Never replace approved with speculative pending — only hard server downgrades.
 */
export async function writeDriverVerificationFact(
  driverId: string,
  verificationStatus: string,
): Promise<void> {
  if (!driverId || !verificationStatus) return;
  let existing = memory.get(driverId) ?? null;
  if (!existing) {
    try {
      const raw = await AsyncStorage.getItem(factKey(driverId));
      if (raw) existing = JSON.parse(raw) as DriverVerificationFact;
    } catch {
      existing = null;
    }
  }
  if (
    existing?.verificationStatus === 'approved' &&
    verificationStatus !== 'approved' &&
    !HARD_DOWNGRADES.has(verificationStatus)
  ) {
    memory.set(driverId, existing);
    return;
  }
  const fact: DriverVerificationFact = {
    driverId,
    verificationStatus,
    savedAt: Date.now(),
  };
  memory.set(driverId, fact);
  try {
    await AsyncStorage.setItem(factKey(driverId), JSON.stringify(fact));
  } catch {
    /* non-fatal */
  }
}

/** Only for account delete / explicit wipe — NOT logout. */
export async function clearDriverVerificationFact(driverId?: string): Promise<void> {
  try {
    if (driverId) {
      memory.delete(driverId);
      await AsyncStorage.removeItem(factKey(driverId));
      return;
    }
    memory.clear();
  } catch {
    /* non-fatal */
  }
}

export function isLocallyApproved(driverId: string | undefined | null): boolean {
  if (!driverId) return false;
  return peekDriverVerificationFact(driverId)?.verificationStatus === 'approved';
}

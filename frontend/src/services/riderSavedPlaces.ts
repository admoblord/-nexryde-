import AsyncStorage from '@react-native-async-storage/async-storage';
import { BACKEND_URL } from '@/src/services/api';

export type RiderSavedSlot = 'home' | 'work' | 'gym' | 'favorite';

/** Display / edit order on home and saved-places screen */
export const RIDER_SAVED_SLOTS_ORDER: RiderSavedSlot[] = ['home', 'work', 'gym', 'favorite'];

export interface RiderSavedPlace {
  slot: RiderSavedSlot;
  address: string;
  lat: number;
  lng: number;
  updatedAt: string;
}

const STORAGE_ROOT = '@nexryde_rider_saved_places_v2';

function key(userId: string) {
  return `${STORAGE_ROOT}:${userId}`;
}

export async function loadRiderSavedPlaces(userId: string): Promise<RiderSavedPlace[]> {
  try {
    const raw = await AsyncStorage.getItem(key(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: RiderSavedPlace[] = [];
    for (const row of parsed) {
      if (!row || typeof row !== 'object') continue;
      const o = row as Record<string, unknown>;
      const slot = o.slot as RiderSavedSlot;
      if (!['home', 'work', 'gym', 'favorite'].includes(String(slot))) continue;
      const address = String(o.address || '').trim();
      const lat = Number(o.lat);
      const lng = Number(o.lng);
      if (!address || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      out.push({
        slot,
        address,
        lat,
        lng,
        updatedAt: String(o.updatedAt || new Date().toISOString()),
      });
    }
    return out;
  } catch {
    return [];
  }
}

export async function upsertRiderSavedPlace(userId: string, place: Omit<RiderSavedPlace, 'updatedAt'>) {
  const existing = await loadRiderSavedPlaces(userId);
  const next = existing.filter((p) => p.slot !== place.slot);
  next.push({
    ...place,
    updatedAt: new Date().toISOString(),
  });
  await AsyncStorage.setItem(key(userId), JSON.stringify(next));
}

export async function removeRiderSavedPlace(userId: string, slot: RiderSavedSlot) {
  const existing = await loadRiderSavedPlaces(userId);
  const next = existing.filter((p) => p.slot !== slot);
  await AsyncStorage.setItem(key(userId), JSON.stringify(next));
}

export const RIDER_SAVED_SLOT_META: Record<
  RiderSavedSlot,
  { label: string; icon: 'home' | 'briefcase' | 'fitness' | 'star'; color: string }
> = {
  home: { label: 'Home', icon: 'home', color: '#22C55E' },
  work: { label: 'Work', icon: 'briefcase', color: '#3B82F6' },
  gym: { label: 'Gym', icon: 'fitness', color: '#A855F7' },
  favorite: { label: 'Saved', icon: 'star', color: '#F59E0B' },
};

/** Geocode an address for saved places & booking deep links (shared with book screen pattern). */
export async function geocodeAddressForRider(address: string): Promise<{ lat: number; lng: number; address: string } | null> {
  try {
    const query = encodeURIComponent(address.trim());
    const res = await fetch(`${BACKEND_URL}/api/places/geocode-address?address=${query}`);
    const data = await res.json().catch(() => ({}));
    const lat = Number(data?.latitude);
    const lng = Number(data?.longitude);
    if (res.ok && Number.isFinite(lat) && Number.isFinite(lng)) {
      return {
        lat,
        lng,
        address: String(data.address || address || '').trim() || address,
      };
    }
  } catch {
    /* noop */
  }
  return null;
}

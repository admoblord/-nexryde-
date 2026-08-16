/**
 * Merge GET /users/:id into the persisted rider session so Profile / Home
 * show name, phone, photo, rating, trips, and member-since immediately.
 */
import type { User } from '@/src/store/appStore';

function pickStr(
  incoming: unknown,
  fallback: string | null | undefined,
): string | null {
  if (typeof incoming === 'string' && incoming.trim()) return incoming;
  if (fallback == null) return null;
  return fallback;
}

function pickNum(incoming: unknown, fallback: number | undefined): number | undefined {
  if (incoming == null || incoming === '') return fallback;
  const n = Number(incoming);
  return Number.isFinite(n) ? n : fallback;
}

function pickBool(incoming: unknown, fallback: boolean | undefined): boolean | undefined {
  if (typeof incoming === 'boolean') return incoming;
  return fallback;
}

export function mergeRiderProfile(
  current: User | null | undefined,
  incoming: Record<string, unknown> | null | undefined,
): User | null {
  if (!incoming || typeof incoming !== 'object') return current ?? null;
  const id = typeof incoming.id === 'string' && incoming.id ? incoming.id : current?.id;
  if (!id) return current ?? null;
  if (current?.id && current.id !== id) return current;

  const next: User = {
    id,
    phone: pickStr(incoming.phone, current?.phone) ?? current?.phone ?? '',
    name: pickStr(incoming.name, current?.name) ?? current?.name ?? null,
    email: pickStr(incoming.email, current?.email) ?? current?.email ?? null,
    role:
      incoming.role === 'driver' || incoming.role === 'admin' || incoming.role === 'rider'
        ? incoming.role
        : current?.role ?? 'rider',
    is_verified: pickBool(incoming.is_verified, current?.is_verified) ?? false,
    profile_image: pickStr(incoming.profile_image, current?.profile_image),
    rating: pickNum(incoming.rating, current?.rating) ?? 5,
    rider_reputation_trip_count: pickNum(
      incoming.rider_reputation_trip_count,
      current?.rider_reputation_trip_count,
    ),
    total_trips: pickNum(incoming.total_trips, current?.total_trips) ?? 0,
    trips_completed: pickNum(incoming.trips_completed, current?.trips_completed) ?? 0,
    completion_rate: pickNum(incoming.completion_rate, current?.completion_rate) ?? 0,
    cancellation_rate: pickNum(incoming.cancellation_rate, current?.cancellation_rate) ?? 0,
    online_hours: pickNum(incoming.online_hours, current?.online_hours) ?? 0,
    gender: pickStr(incoming.gender, current?.gender) ?? current?.gender ?? '',
    vehicle_type: current?.vehicle_type ?? null,
    plate_number: current?.plate_number ?? null,
    is_online: current?.is_online ?? false,
    created_at: pickStr(incoming.created_at, current?.created_at) ?? current?.created_at ?? '',
    terms_accepted: pickBool(incoming.terms_accepted, current?.terms_accepted),
    terms_version: pickStr(incoming.terms_version, current?.terms_version),
    terms_accepted_at: pickStr(incoming.terms_accepted_at, current?.terms_accepted_at),
    privacy_accepted: pickBool(incoming.privacy_accepted, current?.privacy_accepted),
    privacy_version: pickStr(incoming.privacy_version, current?.privacy_version),
    privacy_accepted_at: pickStr(incoming.privacy_accepted_at, current?.privacy_accepted_at),
    rider_verification_completed: pickBool(
      incoming.rider_verification_completed,
      current?.rider_verification_completed,
    ),
    onboarding_complete: pickBool(incoming.onboarding_complete, current?.onboarding_complete),
  };

  return next;
}

export function riderProfileDisplayChanged(a: User | null | undefined, b: User | null | undefined): boolean {
  if (!a && !b) return false;
  if (!a || !b) return true;
  return (
    a.id !== b.id ||
    a.name !== b.name ||
    a.phone !== b.phone ||
    a.email !== b.email ||
    a.profile_image !== b.profile_image ||
    a.rating !== b.rating ||
    a.total_trips !== b.total_trips ||
    a.created_at !== b.created_at ||
    a.is_verified !== b.is_verified
  );
}

export function riderProfileHasDisplay(user: User | null | undefined): boolean {
  if (!user?.id) return false;
  return Boolean(
    (user.name && String(user.name).trim()) ||
      (user.phone && String(user.phone).trim()) ||
      (user.email && String(user.email).trim()),
  );
}

/** Apply API profile onto Zustand + SecureStore when display fields changed. */
export async function applyRiderProfileToStore(
  incoming: Record<string, unknown> | null | undefined,
): Promise<User | null> {
  const { useAppStore } = await import('@/src/store/appStore');
  const store = useAppStore.getState();
  const next = mergeRiderProfile(store.user, incoming);
  if (!next) return null;
  if (!riderProfileDisplayChanged(store.user, next)) return next;
  store.setUser(next);
  try {
    const [{ saveUserSession }, { getCachedToken }] = await Promise.all([
      import('@/utils/authStorage'),
      import('@/src/lib/tokenStore'),
    ]);
    const token = getCachedToken();
    await saveUserSession({ ...next, ...(token ? { token } : {}) });
  } catch {
    /* non-fatal — in-memory store already updated */
  }
  return next;
}

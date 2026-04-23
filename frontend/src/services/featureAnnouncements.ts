import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFeatureAnnouncements } from '@/src/services/api';
import notificationService from '@/src/services/notifications';

export type FeatureAnnouncement = {
  id: string;
  title: string;
  message: string;
  feature_route: string;
  audience: 'all' | 'rider' | 'driver';
  version?: string;
  created_at: string;
};

const FEATURE_SEEN_KEY = 'feature_announcements_seen_ids_v1';
const FEATURE_LAST_SYNC_KEY = 'feature_announcements_last_sync_v1';

const FALLBACK_ANNOUNCEMENTS: FeatureAnnouncement[] = [
  {
    id: 'feat-schedule-booking',
    title: 'Scheduled rides are live',
    message: 'You can now schedule rides directly from booking.',
    feature_route: '/rider/schedule',
    audience: 'rider',
    version: '2026.4',
    created_at: '2026-04-17T00:00:00.000Z',
  },
  {
    id: 'feat-live-driver-state',
    title: 'Driver moving/paused state on map',
    message: 'Trip map now shows if your driver is moving or paused.',
    feature_route: '/rider/tracking',
    audience: 'rider',
    version: '2026.4',
    created_at: '2026-04-17T00:00:00.000Z',
  },
];

async function readSeenIds(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(FEATURE_SEEN_KEY);
    const arr = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

export async function getSeenFeatureIds(): Promise<Set<string>> {
  return readSeenIds();
}

async function writeSeenIds(seen: Set<string>): Promise<void> {
  await AsyncStorage.setItem(FEATURE_SEEN_KEY, JSON.stringify(Array.from(seen)));
}

export async function fetchFeatureAnnouncements(role?: string): Promise<FeatureAnnouncement[]> {
  try {
    const res = await getFeatureAnnouncements();
    const rows = Array.isArray(res.data?.announcements) ? res.data.announcements : [];
    const filtered = rows.filter((r) => r.audience === 'all' || !role || r.audience === role);
    return filtered.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  } catch {
    return FALLBACK_ANNOUNCEMENTS.filter((r) => r.audience === 'all' || !role || r.audience === role);
  }
}

export async function getUnreadFeatureCount(role?: string): Promise<number> {
  const [announcements, seen] = await Promise.all([fetchFeatureAnnouncements(role), readSeenIds()]);
  return announcements.filter((a) => !seen.has(a.id)).length;
}

export async function markFeatureAsSeen(featureId: string): Promise<void> {
  const seen = await readSeenIds();
  seen.add(featureId);
  await writeSeenIds(seen);
}

export async function markAllFeaturesAsSeen(role?: string): Promise<void> {
  const [announcements, seen] = await Promise.all([fetchFeatureAnnouncements(role), readSeenIds()]);
  announcements.forEach((a) => seen.add(a.id));
  await writeSeenIds(seen);
}

export async function syncAndNotifyNewFeatures(role?: string): Promise<void> {
  const now = Date.now();
  const lastSync = Number((await AsyncStorage.getItem(FEATURE_LAST_SYNC_KEY)) || '0');
  // Avoid noisy notifications if screen re-mounts often.
  if (now - lastSync < 2 * 60 * 1000) return;

  const [announcements, seen] = await Promise.all([fetchFeatureAnnouncements(role), readSeenIds()]);
  const unseen = announcements.filter((a) => !seen.has(a.id));
  if (unseen.length > 0) {
    const newest = unseen[0];
    await notificationService.sendLocalNotification({
      type: 'feature_update',
      title: `New feature: ${newest.title}`,
      body: newest.message,
      data: {
        route: newest.feature_route,
        feature_id: newest.id,
      },
    });
  }
  await AsyncStorage.setItem(FEATURE_LAST_SYNC_KEY, String(now));
}


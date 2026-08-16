/**
 * Contract checks for rider profile hydration + tab cache keys.
 * Run: node frontend/scripts/validate_rider_profile_hydrate.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function pickStr(incoming, fallback) {
  if (typeof incoming === 'string' && incoming.trim()) return incoming;
  if (fallback == null) return null;
  return fallback;
}
function pickNum(incoming, fallback) {
  if (incoming == null || incoming === '') return fallback;
  const n = Number(incoming);
  return Number.isFinite(n) ? n : fallback;
}
function pickBool(incoming, fallback) {
  if (typeof incoming === 'boolean') return incoming;
  return fallback;
}

function mergeRiderProfile(current, incoming) {
  if (!incoming || typeof incoming !== 'object') return current ?? null;
  const id = typeof incoming.id === 'string' && incoming.id ? incoming.id : current?.id;
  if (!id) return current ?? null;
  if (current?.id && current.id !== id) return current;
  return {
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
    total_trips: pickNum(incoming.total_trips, current?.total_trips) ?? 0,
    created_at: pickStr(incoming.created_at, current?.created_at) ?? current?.created_at ?? '',
  };
}

function printRow(id, label, pass, detail) {
  console.log(`${pass ? 'PASS' : 'FAIL'}  [${id}] ${label}${detail ? ` — ${detail}` : ''}`);
  return pass;
}

const results = [];

const lean = {
  id: 'u1',
  phone: '+2348000000000',
  name: 'Ada',
  role: 'rider',
};
const api = {
  id: 'u1',
  name: 'Ada Lovelace',
  phone: '+2348000000000',
  email: 'ada@example.com',
  role: 'rider',
  is_verified: true,
  profile_image: 'https://cdn.example/ada.jpg',
  rating: 4.9,
  total_trips: 12,
  created_at: '2025-03-01T00:00:00Z',
};
const merged = mergeRiderProfile(lean, api);
results.push(
  printRow(
    'merge-display',
    'API profile fills name/photo/rating/trips/since',
    merged.name === 'Ada Lovelace' &&
      merged.profile_image?.includes('ada.jpg') &&
      merged.rating === 4.9 &&
      merged.total_trips === 12 &&
      merged.created_at.startsWith('2025'),
  ),
);

const keepPhoto = mergeRiderProfile(
  { ...lean, profile_image: 'file://local.jpg' },
  { id: 'u1', name: 'Ada', profile_image: null, total_trips: 3 },
);
results.push(
  printRow(
    'keep-local-photo',
    'Null API photo does not wipe a local/session photo',
    keepPhoto.profile_image === 'file://local.jpg' && keepPhoto.total_trips === 3,
  ),
);

const wrongUser = mergeRiderProfile(lean, { id: 'other', name: 'Eve', total_trips: 99 });
results.push(
  printRow('reject-other-id', 'Refuse to merge a different user id', wrongUser === lean),
);

const files = {
  helper: 'src/utils/hydrateRiderProfile.ts',
  driverHelper: 'src/utils/hydrateDriverProfile.ts',
  prefetch: 'src/services/prefetchTabData.ts',
  profile: 'app/(rider-tabs)/rider-profile.tsx',
  driverProfile: 'app/(driver-tabs)/driver-profile.tsx',
  bootstrap: 'src/hooks/useAppBootstrap.ts',
  home: 'app/(rider-tabs)/rider-home.tsx',
  wallet: 'app/(rider-tabs)/rider-wallet.tsx',
  notifs: 'src/components/FeatureNotificationsScreen.tsx',
};
const src = Object.fromEntries(
  Object.entries(files).map(([k, rel]) => [k, fs.readFileSync(path.join(root, rel), 'utf8')]),
);

results.push(
  printRow(
    'helper-exports',
    'hydrate helper exports merge + apply',
    src.helper.includes('export function mergeRiderProfile') &&
      src.helper.includes('export async function applyRiderProfileToStore'),
  ),
);
results.push(
  printRow(
    'prefetch-tabcache',
    'prefetch writes tabCache + applies profile to store',
    src.prefetch.includes('tabCacheSet') &&
      src.prefetch.includes('applyRiderProfileToStore') &&
      src.prefetch.includes('rider-wallet:') &&
      src.prefetch.includes('tab-notifs:rider:'),
  ),
);
results.push(
  printRow(
    'profile-consumes-prefetch',
    'profile tab uses query cache and applies API user',
    src.profile.includes('qk.riderProfile') &&
      src.profile.includes('applyRiderProfileToStore') &&
      src.profile.includes('qk.riderTrust'),
  ),
);
results.push(
  printRow(
    'bootstrap-keeps-display',
    'cold start keeps photo/rating/trips/created_at',
    src.bootstrap.includes('profile_image') &&
      src.bootstrap.includes('total_trips') &&
      src.bootstrap.includes('created_at'),
  ),
);
results.push(
  printRow(
    'home-seeds-places',
    'home paints saved places from prefetch cache',
    src.home.includes('qk.riderSavedPlaces') || src.home.includes('rider-saved:'),
  ),
);
results.push(
  printRow(
    'wallet-notifs-seed',
    'wallet + updates seed from queryClient prefetch',
    src.wallet.includes('qk.riderWallet') && src.notifs.includes('queryClient.getQueryData'),
  ),
);
results.push(
  printRow(
    'driver-prefetch-tabcache',
    'driver prefetch writes trips/earnings/profile/trust caches',
    src.prefetch.includes('driver-trips:') &&
      src.prefetch.includes('driver-earnings:') &&
      src.prefetch.includes('driver-profile:') &&
      src.prefetch.includes('qk.driverTrust') &&
      src.prefetch.includes('applyRiderProfileToStore'),
  ),
);
results.push(
  printRow(
    'driver-profile-consumes',
    'driver profile uses prefetch keys and applies user + driver display',
    src.driverProfile.includes('qk.driverProfile') &&
      src.driverProfile.includes('qk.driverTrust') &&
      src.driverProfile.includes('applyRiderProfileToStore') &&
      src.driverProfile.includes('driverProfileDisplay'),
  ),
);
results.push(
  printRow(
    'driver-helper',
    'driver display helper extracts name/city/vehicles',
    src.driverHelper.includes('export function driverProfileDisplay'),
  ),
);

const failed = results.filter((p) => !p).length;
if (failed) {
  console.error(`\n${failed} rider profile hydrate check(s) failed`);
  process.exit(1);
}
console.log('\nAll rider profile hydrate checks passed');

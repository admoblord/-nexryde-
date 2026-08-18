/**
 * Live end-to-end check of pickup/destination search.
 *
 * Signs in as a real rider, then drives the shipping placesSearch.ts against a
 * live backend across a matrix of pickup and destination queries, and injects
 * transport failures to prove the offline behaviour.
 *
 * Hits real infrastructure and needs an account, so it is a manual check, not
 * a CI gate.
 *
 *   NEXRYDE_VERIFY_EMAIL=rider@example.com \
 *     node --experimental-strip-types --no-warnings \
 *     frontend/scripts/verify_places_live.mjs
 */
import path from 'node:path';
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const FRONTEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE =
  process.env.NEXRYDE_VERIFY_BACKEND ||
  'https://nexryde-backend-993913300770.africa-south1.run.app';
const RIDER = process.env.NEXRYDE_VERIFY_EMAIL || '';

const [nodeMajor, nodeMinor] = process.versions.node.split('.').map(Number);
if (nodeMajor < 22 || (nodeMajor === 22 && nodeMinor < 6)) {
  console.log(`SKIP  needs Node >= 22.6 for --experimental-strip-types (have ${process.versions.node})`);
  process.exit(0);
}
if (!RIDER) {
  console.error('Set NEXRYDE_VERIFY_EMAIL to a rider account on the target backend.');
  process.exit(2);
}

// ── internal login ───────────────────────────────────────────────────────────
const loginRes = await fetch(`${BASE}/api/auth/email-signin`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: RIDER }),
});
const login = await loginRes.json();
const TOKEN = login.access_token || login.token || '';
if (!TOKEN) {
  console.error('login failed', loginRes.status, JSON.stringify(login).slice(0, 200));
  process.exit(1);
}
console.log(
  `internal login OK  http=${loginRes.status}  user=${login.user?.email}  role=${login.user?.role}  id=${login.user?.id}`,
);
console.log(`backend: ${BASE}\n`);

globalThis.__TOKEN__ = TOKEN;
globalThis.__MODE__ = 'live'; // live | dead | flaky
globalThis.__HARD_OFFLINE__ = false;
globalThis.__ATTEMPTS__ = 0;

const stubs = {
  '@react-native-async-storage/async-storage': `
    const mem = new Map();
    globalThis.__STORAGE__ = mem;
    export default {
      async getItem(k) { return mem.has(k) ? mem.get(k) : null; },
      async setItem(k, v) { mem.set(k, v); },
      async removeItem(k) { mem.delete(k); },
    };`,
  '@/src/services/api': `export const BACKEND_URL = ${JSON.stringify(BASE)};`,
  '@/src/services/platformConnectionManager': `
    export function isHardOffline() { return globalThis.__HARD_OFFLINE__ === true; }`,
  // Real HTTP with the internal rider's JWT, plus scripted transport failures.
  '@/src/utils/sessionRefresh': `
    export class ApiTimeoutError extends Error {
      constructor() { super('timeout'); this.name = 'ApiTimeoutError'; }
    }
    globalThis.__ApiTimeoutError__ = ApiTimeoutError;
    export async function authedFetch(url, opts = {}) {
      globalThis.__ATTEMPTS__ += 1;
      const mode = globalThis.__MODE__;
      if (mode === 'dead') throw new TypeError('Network request failed');
      if (mode === 'flaky' && globalThis.__ATTEMPTS__ % 2 === 1) {
        throw new TypeError('Network request failed');
      }
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs || 20000);
      try {
        return await fetch(url, {
          method: opts.method || 'GET',
          signal: ctrl.signal,
          headers: { Authorization: 'Bearer ' + globalThis.__TOKEN__ },
        });
      } catch (e) {
        if (e && e.name === 'AbortError') throw new ApiTimeoutError();
        throw e;
      } finally {
        clearTimeout(timer);
      }
    }`,
};

const hooks = `
const stubs = ${JSON.stringify(stubs)};
const root = ${JSON.stringify(pathToFileURL(FRONTEND).href)};
export async function resolve(specifier, context, next) {
  if (Object.hasOwn(stubs, specifier)) {
    return { url: 'stub:' + encodeURIComponent(specifier), shortCircuit: true };
  }
  if (specifier.startsWith('@/')) {
    return { url: root + '/' + specifier.slice(2) + '.ts', shortCircuit: true };
  }
  return next(specifier, context);
}
export async function load(url, context, next) {
  if (url.startsWith('stub:')) {
    return { format: 'module', shortCircuit: true, source: stubs[decodeURIComponent(url.slice(5))] };
  }
  return next(url, context);
}
`;
register(`data:text/javascript,${encodeURIComponent(hooks)}`);

globalThis.__DEV__ = false;

const { searchPlacesAutocomplete } = await import(
  pathToFileURL(path.join(FRONTEND, 'src', 'services', 'placesSearch.ts')).href
);

// Rider GPS in Lagos — the same bias the Route screen sends.
const ORIGIN = { lat: 6.4531, lng: 3.3958 };

const PAIRS = [
  ['Peace garden Estate', 'Ikeja City Mall'],
  ['Lekki Phase 1', 'Murtala Muhammed Airport'],
  ['23 Ogunlana Drive Surulere', 'Victoria Island'],
  ['Sangotedo', 'Yaba'],
  ['Computer Village Ikeja', 'Lekki Conservation Centre'],
  ['Ajah', 'National Theatre Iganmu'],
  ['Oshodi', 'Ikoyi'],
  ['Festac Town', 'Apapa Wharf'],
];

let pass = 0;
let fail = 0;

function row(field, query, out, ms) {
  const n = out.predictions.length;
  const top = n ? out.predictions[0].description.slice(0, 46) : '—';
  const tags = [
    out.fromCache ? 'cache' : '',
    out.offline ? 'offline' : '',
    out.emptyConfirmed ? 'confirmed-empty' : '',
  ]
    .filter(Boolean)
    .join(',');
  const ok = n > 0;
  if (ok) pass += 1;
  else fail += 1;
  console.log(
    `  ${ok ? 'OK  ' : 'MISS'} ${field.padEnd(11)} ${JSON.stringify(query).padEnd(30)} ${String(ms).padStart(5)}ms  ${String(n).padStart(2)} results  ${top}${tags ? `  [${tags}]` : ''}`,
  );
  return out;
}

async function run(field, query, opts) {
  const t0 = Date.now();
  const out = await searchPlacesAutocomplete(query, {
    origin: field === 'pickup' ? ORIGIN : ORIGIN,
    sessionToken: `verify-${field}-${Date.now()}`,
    countryCode: 'ng',
    ...opts,
  });
  return row(field, query, out, Date.now() - t0);
}

console.log('── 1. live: eight different pickup + destination pairs ──────────────────');
for (const [pickup, dropoff] of PAIRS) {
  await run('PICKUP', pickup);
  await run('DESTINATION', dropoff);
}

console.log('\n── 2. honesty: a place that does not exist ──────────────────────────────');
globalThis.__MODE__ = 'live';
const nonsense = await searchPlacesAutocomplete('zzqqxx nowhere at all 9999', {
  origin: ORIGIN,
  countryCode: 'ng',
});
// Geocoding used to answer a typo with "Nigeria", which pins the trip at the
// centre of the country. Needs the backend fix deployed to pass.
const junk = nonsense.predictions.filter((p) =>
  ['nigeria', 'africa'].includes(String(p.description || '').trim().toLowerCase()),
);
const nonsenseOk = nonsense.predictions.length === 0 && nonsense.emptyConfirmed === true;
console.log(
  `  ${nonsenseOk ? 'OK  ' : 'FAIL'} reported as a real empty result (not an outage): ` +
    `results=${nonsense.predictions.length} emptyConfirmed=${nonsense.emptyConfirmed} offline=${!!nonsense.offline}`,
);
if (junk.length) {
  console.log(
    `       ↳ backend still offers "${junk[0].description}" as a destination — deploy the backend fix`,
  );
}
nonsenseOk ? (pass += 1) : (fail += 1);

console.log('\n── 3. network dies: do the same addresses still resolve? ────────────────');
globalThis.__MODE__ = 'dead';
for (const [pickup, dropoff] of PAIRS.slice(0, 4)) {
  await run('PICKUP', pickup);
  await run('DESTINATION', dropoff);
}

console.log('\n── 4. network dies on a query never searched before ─────────────────────');
const cold = await searchPlacesAutocomplete('Somewhere never typed before', {
  origin: ORIGIN,
  countryCode: 'ng',
});
const coldOk = cold.offline === true && cold.predictions.length === 0;
console.log(
  `  ${coldOk ? 'OK  ' : 'FAIL'} says offline instead of "No places found": ` +
    `offline=${cold.offline} results=${cold.predictions.length}`,
);
coldOk ? (pass += 1) : (fail += 1);

console.log('\n── 5. one dropped request, then the network answers ─────────────────────');
globalThis.__MODE__ = 'flaky';
globalThis.__ATTEMPTS__ = 0;
const flaky = await searchPlacesAutocomplete('Surulere Lagos', {
  origin: ORIGIN,
  countryCode: 'ng',
});
const flakyOk = flaky.predictions.length > 0 && !flaky.offline;
console.log(
  `  ${flakyOk ? 'OK  ' : 'FAIL'} recovered after a dropped request: ` +
    `attempts=${globalThis.__ATTEMPTS__} results=${flaky.predictions.length} ` +
    `top=${flaky.predictions[0]?.description.slice(0, 40) || '—'}`,
);
flakyOk ? (pass += 1) : (fail += 1);

console.log(`\n${fail === 0 ? 'ALL CHECKS PASSED' : fail + ' CHECK(S) FAILED'}  (${pass} passed)`);
process.exit(fail === 0 ? 0 : 1);

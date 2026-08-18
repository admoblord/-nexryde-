/**
 * Behaviour proof for the search request path, driving the real
 * placesSearch.ts against a scripted fetch.
 *
 * Reproduces the screenshot: "Could not reach address search. Try again."
 * appeared after a single dropped request, with no retry and nothing to tap.
 *
 * Run: node --experimental-strip-types --no-warnings \
 *        frontend/scripts/validate_places_search_resilience.mjs
 */
import path from 'node:path';
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 6)) {
  console.log(
    `SKIP  search-resilience checks need Node >= 22.6 for --experimental-strip-types (have ${process.versions.node})`,
  );
  process.exit(0);
}

const stubs = {
  '@react-native-async-storage/async-storage': `
    const mem = new Map();
    globalThis.__STORAGE__ = mem;
    export default {
      async getItem(k) { return mem.has(k) ? mem.get(k) : null; },
      async setItem(k, v) { mem.set(k, v); },
      async removeItem(k) { mem.delete(k); },
    };`,
  '@/src/services/api': 'export const BACKEND_URL = "https://api.test";',
  '@/src/utils/sessionRefresh': `
    export class ApiTimeoutError extends Error {
      constructor() { super('timeout'); this.name = 'ApiTimeoutError'; }
    }
    globalThis.__ApiTimeoutError__ = ApiTimeoutError;
    export async function authedFetch(url, opts) {
      return globalThis.__FETCH__(url, opts);
    }`,
  '@/src/services/platformConnectionManager': `
    export function isHardOffline() { return globalThis.__HARD_OFFLINE__ === true; }`,
};

const frontendRoot = pathToFileURL(path.join(__dirname, '..')).href;

const hooks = `
const stubs = ${JSON.stringify(stubs)};
const root = ${JSON.stringify(frontendRoot)};
export async function resolve(specifier, context, next) {
  if (Object.hasOwn(stubs, specifier)) {
    return { url: 'stub:' + encodeURIComponent(specifier), shortCircuit: true };
  }
  // Real modules behind the "@/" alias load from source so the test drives
  // the shipping code, not a copy of it.
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

const searchMod = await import(
  pathToFileURL(path.join(__dirname, '..', 'src', 'services', 'placesSearch.ts')).href
);
const cacheMod = await import(
  pathToFileURL(path.join(__dirname, '..', 'src', 'services', 'placesCache.ts')).href
);
const { searchPlacesAutocomplete } = searchMod;

const results = [];
function check(id, label, pass, detail) {
  console.log(`${pass ? 'PASS' : 'FAIL'}  [${id}] ${label}${detail ? ` — ${detail}` : ''}`);
  results.push(pass);
}

const okBody = {
  status: 'OK',
  bias_retried: true,
  predictions: [
    {
      place_id: 'ChIJ-peace',
      description: 'Peace Garden Estate, Oladunni Street, Lagos, Nigeria',
      structured_formatting: {
        main_text: 'Peace Garden Estate',
        secondary_text: 'Oladunni Street, Lagos, Nigeria',
      },
    },
  ],
};

const respond = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

function reset() {
  cacheMod.__resetPlacesCache();
  globalThis.__STORAGE__?.clear();
  globalThis.__HARD_OFFLINE__ = false;
}

// 1. a single dropped request recovers on retry — the screenshot case
reset();
let calls = 0;
globalThis.__FETCH__ = async () => {
  calls += 1;
  if (calls === 1) throw new TypeError('Network request failed');
  return respond(okBody);
};
let out = await searchPlacesAutocomplete('Peace garden Estate', { countryCode: 'ng' });
check(
  'retries-one-dropped-request',
  'one dropped request no longer ends the search',
  calls === 2 && out.predictions.length === 1 && !out.offline,
  `${calls} attempts`,
);

// 2. a timeout is not retried — 20s of waiting is already enough
reset();
calls = 0;
globalThis.__FETCH__ = async () => {
  calls += 1;
  throw new globalThis.__ApiTimeoutError__();
};
out = await searchPlacesAutocomplete('Somewhere new entirely', { countryCode: 'ng' });
check(
  'timeout-not-retried',
  'a 20s timeout is not doubled by a retry',
  calls === 1 && out.offline === true,
  `${calls} attempt`,
);

// 3. total failure is reported as offline, not as "no places found"
check(
  'reports-offline-not-empty',
  'an unreachable backend is reported as offline',
  out.offline === true && out.emptyConfirmed !== true,
);

// 4. a previously found address still resolves with the network fully down
reset();
globalThis.__FETCH__ = async () => respond(okBody);
await searchPlacesAutocomplete('Peace garden Estate', { countryCode: 'ng' });
globalThis.__FETCH__ = async () => {
  throw new TypeError('Network request failed');
};
out = await searchPlacesAutocomplete('Peace garden Estate', { countryCode: 'ng' });
check(
  'offline-still-answers-known-query',
  'an address searched before still resolves offline',
  out.predictions.length === 1 && out.fromCache === true && out.offline === true,
);

// 5. when already hard offline, do not burn a second attempt
reset();
calls = 0;
globalThis.__HARD_OFFLINE__ = true;
globalThis.__FETCH__ = async () => {
  calls += 1;
  throw new TypeError('Network request failed');
};
await searchPlacesAutocomplete('Another new place', { countryCode: 'ng' });
check('no-retry-when-offline', 'a known-offline device does not retry pointlessly', calls === 1);

// 6. a genuine empty result is still honest
reset();
globalThis.__FETCH__ = async () => respond({ status: 'OK', predictions: [], bias_retried: true });
out = await searchPlacesAutocomplete('qqzz nowhere', { countryCode: 'ng' });
check(
  'genuine-empty-stays-empty',
  'a real zero-result is not dressed up as an outage',
  out.predictions.length === 0 && out.emptyConfirmed === true && !out.offline,
);

// 7. a failed unbiased second opinion never discards good biased rows
reset();
calls = 0;
globalThis.__FETCH__ = async (url) => {
  calls += 1;
  if (url.includes('location_bias')) {
    return respond({
      status: 'OK',
      predictions: [
        {
          place_id: 'ChIJ-ajah',
          description: 'Ajah Bus Stop, Lagos',
          structured_formatting: { main_text: 'Ajah Bus Stop', secondary_text: 'Lagos' },
        },
      ],
    });
  }
  throw new TypeError('Network request failed');
};
out = await searchPlacesAutocomplete('Peace garden Estate', {
  countryCode: 'ng',
  origin: { lat: 6.4531, lng: 3.3958 },
});
check(
  'failed-second-opinion-keeps-first',
  'a failed unbiased retry keeps the biased results',
  out.predictions.length === 1 && out.predictions[0].main_text === 'Ajah Bus Stop',
);

const failed = results.filter((p) => !p).length;
if (failed) {
  console.error(`\n${failed} search-resilience check(s) failed`);
  process.exit(1);
}
console.log('\nAll search-resilience checks passed');

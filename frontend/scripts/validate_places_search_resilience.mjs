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
    export function isHardOffline() { return globalThis.__HARD_OFFLINE__ === true; }
    export function getPlatformConnectionSnapshot() {
      if (globalThis.__HARD_OFFLINE__ === true) {
        return { internetReachable: false };
      }
      return {
        internetReachable: Object.prototype.hasOwnProperty.call(
          globalThis,
          '__INTERNET_REACHABLE__',
        )
          ? globalThis.__INTERNET_REACHABLE__
          : null,
      };
    }`,
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
const { searchPlacesAutocomplete, classifyPlacesFailure, PLACES_TOTAL_DEADLINE_MS } = searchMod;

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
  delete globalThis.__INTERNET_REACHABLE__;
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

// 2. a timeout is not retried — 9s of waiting is already enough
reset();
calls = 0;
globalThis.__FETCH__ = async () => {
  calls += 1;
  throw new globalThis.__ApiTimeoutError__();
};
out = await searchPlacesAutocomplete('Somewhere new entirely', { countryCode: 'ng' });
check(
  'timeout-not-retried',
  'a timeout is not doubled by a retry',
  calls === 1 && out.failure?.kind === 'timeout' && out.offline !== true,
  `${calls} attempt kind=${out.failure?.kind} offline=${out.offline}`,
);

// 3. a timeout on a phone that still has signal is NOT "no internet"
check(
  'timeout-is-not-no-internet',
  'timeout copy is timeout, not "No internet connection"',
  out.failure?.kind === 'timeout' && out.offline !== true && out.emptyConfirmed !== true,
);

// 4. a previously found address still resolves when the request is dropped
reset();
globalThis.__FETCH__ = async () => respond(okBody);
await searchPlacesAutocomplete('Peace garden Estate', { countryCode: 'ng' });
globalThis.__FETCH__ = async () => {
  throw new TypeError('Network request failed');
};
out = await searchPlacesAutocomplete('Peace garden Estate', { countryCode: 'ng' });
check(
  'dropped-request-still-answers-known-query',
  'an address searched before still resolves from cache',
  out.predictions.length === 1 &&
    out.fromCache === true &&
    out.failure?.kind === 'unreachable' &&
    out.offline !== true,
);

// 5. when already hard offline, do not burn a second attempt, and DO say no internet
reset();
calls = 0;
globalThis.__HARD_OFFLINE__ = true;
globalThis.__FETCH__ = async () => {
  calls += 1;
  throw new TypeError('Network request failed');
};
out = await searchPlacesAutocomplete('Another new place', { countryCode: 'ng' });
check('no-retry-when-offline', 'a known-offline device does not retry pointlessly', calls === 1);
check(
  'device-offline-is-the-only-no-internet',
  'NetInfo internetReachable===false is what sets offline',
  out.offline === true && out.failure?.kind === 'no_network',
);

// 5b. classifyPlacesFailure itself
reset();
check(
  'classify-timeout',
  'ApiTimeoutError is timeout while the device is reachable',
  classifyPlacesFailure(Object.assign(new Error('timeout'), { name: 'ApiTimeoutError' })).kind ===
    'timeout',
);
globalThis.__INTERNET_REACHABLE__ = false;
check(
  'classify-no-network-only-from-netinfo',
  'any error becomes no_network only when the device says so',
  classifyPlacesFailure(new Error('timeout')).kind === 'no_network',
);
delete globalThis.__INTERNET_REACHABLE__;
check(
  'classify-dropped-packet',
  'Network request failed with unknown connectivity is unreachable, not offline',
  classifyPlacesFailure(new TypeError('Network request failed')).kind === 'unreachable',
);

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

// 8. a hung token/request cannot stall past the 12s ceiling, and still is not "no internet"
reset();
const hungStarted = Date.now();
globalThis.__FETCH__ = () => new Promise(() => {});
out = await searchPlacesAutocomplete('Victoria Island hung', { countryCode: 'ng' });
const hungMs = Date.now() - hungStarted;
check(
  'deadline-aborts-hung-search',
  'a hung request unblocks the rider at the 12s ceiling',
  out.failure?.kind === 'timeout' &&
    out.offline !== true &&
    hungMs >= PLACES_TOTAL_DEADLINE_MS - 200 &&
    hungMs < PLACES_TOTAL_DEADLINE_MS + 2500,
  `${hungMs}ms kind=${out.failure?.kind} offline=${out.offline}`,
);

const failed = results.filter((p) => !p).length;
if (failed) {
  console.error(`\n${failed} search-resilience check(s) failed`);
  process.exit(1);
}
console.log('\nAll search-resilience checks passed');

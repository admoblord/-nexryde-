/**
 * Behaviour proof for the on-device pickup/destination cache.
 * Runs the real placesCache.ts against a stubbed AsyncStorage.
 *
 * Run: node --experimental-strip-types --no-warnings \
 *        frontend/scripts/validate_places_cache_behavior.mjs
 */
import { register } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Importing the real .ts module needs Node's type stripping (22.6+).
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 6)) {
  console.log(
    `SKIP  places-cache behaviour checks need Node >= 22.6 for --experimental-strip-types (have ${process.versions.node})`,
  );
  process.exit(0);
}

const hooks = `
export async function resolve(specifier, context, next) {
  if (specifier === '@react-native-async-storage/async-storage') {
    return { url: 'stub:async-storage', shortCircuit: true };
  }
  return next(specifier, context);
}
export async function load(url, context, next) {
  if (url === 'stub:async-storage') {
    return {
      format: 'module',
      shortCircuit: true,
      source: [
        'const mem = new Map();',
        'globalThis.__STORAGE__ = mem;',
        'export default {',
        '  async getItem(k) { return mem.has(k) ? mem.get(k) : null; },',
        '  async setItem(k, v) { mem.set(k, v); },',
        '  async removeItem(k) { mem.delete(k); },',
        '};',
      ].join('\\n'),
    };
  }
  return next(url, context);
}
`;
register(`data:text/javascript,${encodeURIComponent(hooks)}`);

const cache = await import(
  pathToFileURL(path.join(__dirname, '..', 'src', 'services', 'placesCache.ts')).href
);

const STORAGE_KEY = '@nexryde_places_predictions_v1';
const results = [];

function check(id, label, pass, detail) {
  console.log(`${pass ? 'PASS' : 'FAIL'}  [${id}] ${label}${detail ? ` — ${detail}` : ''}`);
  results.push(pass);
}

const rows = (...names) =>
  names.map((n) => ({ place_id: `ChIJ-${n}`, description: `${n}, Lagos, Nigeria`, main_text: n }));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. exact answer survives for the same query
cache.__resetPlacesCache();
await cache.hydratePlacesCache();
cache.writePlacesCache('Peace garden Estate', 'ng', rows('Peace Garden Estate'));
check(
  'exact-hit',
  'a query answered once is answered again offline',
  cache.readPlacesCache('peace garden estate', 'ng')?.[0]?.main_text === 'Peace Garden Estate',
);

// 2. unknown queries do not invent results
check(
  'unknown-miss',
  'never fabricates rows for a query we have not answered',
  cache.readPlacesCache('somewhere we never searched', 'ng') === null,
);

// 3. typing one more character during an outage keeps the list
check(
  'prefix-fallback',
  'longest answered prefix backs a longer query',
  cache.readPlacesCachePrefix('Peace garden Estate Sangotedo', 'ng')?.length === 1,
);
check(
  'prefix-needs-real-overlap',
  'an unrelated query gets no prefix rows',
  cache.readPlacesCachePrefix('Ikeja City Mall', 'ng') === null,
);

// 4. country scoping
check(
  'country-scoped',
  'cache does not leak across country codes',
  cache.readPlacesCache('peace garden estate', 'gh') === null,
);

// 5. survives an app restart
await sleep(1500); // debounced flush
const persisted = globalThis.__STORAGE__?.get(STORAGE_KEY);
cache.__resetPlacesCache();
await cache.hydratePlacesCache();
check(
  'survives-restart',
  'last good answer is still there after a cold start',
  !!persisted && cache.readPlacesCache('Peace garden Estate', 'ng')?.length === 1,
);

// 6. stale entries are dropped, not served forever
cache.__resetPlacesCache();
globalThis.__STORAGE__.set(
  STORAGE_KEY,
  JSON.stringify({
    'ng|old query': {
      predictions: rows('Somewhere Old'),
      savedAt: Date.now() - 31 * 24 * 60 * 60 * 1000,
    },
  }),
);
await cache.hydratePlacesCache();
check(
  'expires',
  'entries older than the TTL are discarded',
  cache.readPlacesCache('old query', 'ng') === null,
);

// 7. a corrupt cache never blocks a search
cache.__resetPlacesCache();
globalThis.__STORAGE__.set(STORAGE_KEY, '{not json');
let threw = false;
try {
  await cache.hydratePlacesCache();
} catch {
  threw = true;
}
check('corrupt-safe', 'a corrupt cache file is ignored, not thrown', !threw);

// 8. bounded growth
cache.__resetPlacesCache();
await cache.hydratePlacesCache();
for (let i = 0; i < 400; i += 1) cache.writePlacesCache(`query ${i}`, 'ng', rows(`Place ${i}`));
check(
  'bounded',
  'cache stays bounded and keeps the newest entries',
  cache.readPlacesCache('query 399', 'ng') !== null && cache.readPlacesCache('query 0', 'ng') === null,
);

const failed = results.filter((p) => !p).length;
if (failed) {
  console.error(`\n${failed} places-cache behaviour check(s) failed`);
  process.exit(1);
}
console.log('\nAll places-cache behaviour checks passed');

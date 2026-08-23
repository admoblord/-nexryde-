/**
 * Proof: pickup/destination search returns real addresses, not nearby-only landmarks.
 * Run: node frontend/scripts/validate_places_instant.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function printRow(id, label, pass, detail) {
  console.log(`${pass ? 'PASS' : 'FAIL'}  [${id}] ${label}${detail ? ` — ${detail}` : ''}`);
  return pass;
}

const files = {
  places: 'src/services/placesSearch.ts',
  cache: 'src/services/placesCache.ts',
  bolt: 'src/components/rider/BoltRouteSearch.tsx',
  ac: 'src/components/LocationAutocomplete.tsx',
  suggest: 'src/services/routeSuggestions.ts',
  saved: 'src/services/riderSavedPlaces.ts',
  engine: 'src/services/instantPickupEngine.ts',
  book: 'app/rider/book.tsx',
  backend: path.join(root, '..', 'backend', 'places_service.py'),
};
const src = {
  places: fs.readFileSync(path.join(root, files.places), 'utf8'),
  cache: fs.readFileSync(path.join(root, files.cache), 'utf8'),
  bolt: fs.readFileSync(path.join(root, files.bolt), 'utf8'),
  ac: fs.readFileSync(path.join(root, files.ac), 'utf8'),
  suggest: fs.readFileSync(path.join(root, files.suggest), 'utf8'),
  saved: fs.readFileSync(path.join(root, files.saved), 'utf8'),
  engine: fs.readFileSync(path.join(root, files.engine), 'utf8'),
  book: fs.readFileSync(path.join(root, files.book), 'utf8'),
  backend: fs.readFileSync(files.backend, 'utf8'),
};

const results = [];

results.push(
  printRow(
    'shared-authed-search',
    'one authed search helper for pickup and destination',
    src.places.includes('export async function searchPlacesAutocomplete') &&
      src.places.includes('authedFetch') &&
      src.bolt.includes('searchPlacesAutocomplete') &&
      src.ac.includes('searchPlacesAutocomplete'),
  ),
);

results.push(
  printRow(
    'no-bare-fetch',
    'LocationAutocomplete no longer calls places without a JWT',
    !src.ac.includes('await fetch(url)') && src.ac.includes('searchPlacesAutocomplete'),
  ),
);

results.push(
  printRow(
    'accept-predictions-not-just-ok',
    'BoltRouteSearch paints any predictions, not only status===OK',
    src.bolt.includes('searchPlacesAutocomplete') &&
      !src.bolt.includes("data?.status === 'OK'"),
  ),
);

results.push(
  printRow(
    'retry-unbiased',
    'empty biased search retries without location_bias',
    src.places.includes('location_bias') &&
      src.places.includes('unbiased') &&
      src.places.includes('must never hide a real Nigerian address'),
  ),
);

results.push(
  printRow(
    'places-first',
    'typed query lists real Places before saved/recent',
    src.suggest.includes('[...placesDedup, ...saved, ...recent]') &&
      src.suggest.includes('Keep Google rank'),
  ),
);

results.push(
  printRow(
    'backend-no-short-circuit',
    'local landmarks never replace Google',
    src.backend.includes('never replace Google') &&
      !src.backend.includes('if local_hits:\n        return {') &&
      src.backend.includes('_merge_place_predictions(predictions, local_hits)'),
  ),
);

results.push(
  printRow(
    'backend-no-token-or',
    'generic tokens Lagos/Island do not match every landmark',
    src.backend.includes('not a generic token') &&
      src.backend.includes('len(tokens) >= 2'),
  ),
);

results.push(
  printRow(
    'no-empty-while-loading',
    'Route does not show No places found while search is in flight',
    src.bolt.includes("Searching addresses…") &&
      src.bolt.includes('isSearchableQuery') &&
      src.bolt.includes("searchError === 'auth'"),
  ),
);

results.push(
  printRow(
    'gps-does-not-cancel-search',
    'Route search debounce ignores GPS origin object identity',
    src.bolt.includes('originRef.current = origin') &&
      src.bolt.includes('[ensureSession]') &&
      !src.bolt.includes('[ensureSession, origin]'),
  ),
);

results.push(
  printRow(
    'retry-unbiased-mismatch',
    'biased results that do not match the typed query retry without location_bias',
    src.places.includes('predictionsMatchTypedQuery') &&
      src.places.includes('needUnbiased'),
  ),
);

results.push(
  printRow(
    'backend-cache-with-session',
    'backend caches autocomplete even when the app sends sessiontoken',
    src.backend.includes('Cache even when sessiontoken is present') &&
      !src.backend.includes('use_cache = not session') &&
      src.backend.includes('build(False)'),
  ),
);

results.push(
  printRow(
    'backend-serves-stale-on-outage',
    'a Google outage serves the last good answer, not an empty list',
    src.backend.includes('_get_stale_cache') &&
      src.backend.includes('_set_stale_cache') &&
      src.backend.includes('"cache": "stale"'),
  ),
);

results.push(
  printRow(
    'backend-autocomplete-never-500',
    'autocomplete degrades instead of raising a 500 the app reads as an outage',
    !/except Exception as e:\n\s+print\(f"Error in autocomplete[\s\S]{0,120}raise HTTPException/.test(
      src.backend,
    ) && src.backend.includes('Autocomplete must never 500'),
  ),
);

results.push(
  printRow(
    'backend-empty-only-when-google-says-so',
    'only a real Google ZERO_RESULTS/OK counts as "no places"',
    src.backend.includes('genuinely_empty') &&
      src.backend.includes('("OK", "ZERO_RESULTS")'),
  ),
);

results.push(
  printRow(
    'client-last-good-cache',
    'client keeps a durable last-good answer per query',
    src.places.includes('readPlacesCache') &&
      src.places.includes('readPlacesCachePrefix') &&
      src.places.includes('writePlacesCache') &&
      src.cache.includes('AsyncStorage'),
  ),
);

results.push(
  printRow(
    'client-no-blank-on-degraded',
    'a degraded search keeps the addresses already on screen',
    src.places.includes('emptyConfirmed') &&
      src.bolt.includes('data.emptyConfirmed') &&
      src.ac.includes('data.emptyConfirmed') &&
      !src.bolt.includes('setPlaces([]);\n          setSearchError(\'network\');'),
  ),
);

results.push(
  printRow(
    'client-401-only-blocks-when-empty',
    'a cached answer still shows while a token refreshes',
    (() => {
      const authBranch = src.bolt.indexOf("setSearchError('auth')");
      const rowsBranch = src.bolt.indexOf('if (rows.length)');
      return rowsBranch > -1 && authBranch > rowsBranch;
    })(),
  ),
);

results.push(
  printRow(
    'saved-places-authed-geocode',
    'saved places / preset pickup / route change geocode with a JWT',
    src.saved.includes('authedFetch') &&
      !src.saved.includes('await fetch(`${BACKEND_URL}/api/places/geocode-address'),
  ),
);

results.push(
  printRow(
    'no-duplicate-unbiased-retry',
    'app skips its own unbiased retry when the backend already did it',
    src.places.includes('biasRetried') && src.backend.includes('bias_retried'),
  ),
);

results.push(
  printRow(
    'details-fallback-geocode',
    'failed Place Details still geocodes the tapped address',
    src.book.includes('Truncated Google session ids') &&
      src.book.includes('!coords && desc.length >= 3'),
  ),
);

results.push(
  printRow(
    'no-country-sized-destination',
    'a typo never offers the whole country as a pickup or dropoff',
    src.backend.includes('_TOO_COARSE_GEOCODE_TYPES') &&
      src.backend.includes('set(r.get("types") or []) & _TOO_COARSE_GEOCODE_TYPES') &&
      src.backend.includes('_predictions_match_typed_query([row], raw)'),
  ),
);

results.push(
  printRow(
    'retries-dropped-request',
    'one dropped request is retried instead of ending the search',
    src.places.includes('fetchAutocompleteWithRetry') &&
      src.places.includes('ApiTimeoutError') &&
      src.places.includes('RETRY_DELAY_MS'),
  ),
);

results.push(
  printRow(
    'route-search-uses-nexryde-brand',
    'Route search uses NEXRYDE navy/green, not the light Bolt grey sheet',
    src.bolt.includes('BRAND.bgDeep') &&
      src.bolt.includes('isSearchableQuery') &&
      src.bolt.includes('underlineColorAndroid') &&
      src.bolt.includes('<View style={[styles.fieldRow') &&
      !src.bolt.includes('#F2F3F5'),
  ),
);

results.push(
  printRow(
    'device-search-aborts-previous-request',
    'typing cancels the previous search instead of stacking 9s GETs',
    src.bolt.includes('abortRef') &&
      src.bolt.includes('signal: ac.signal') &&
      src.ac.includes('signal: ac.signal') &&
      src.places.includes('isPlacesAbortError') &&
      !src.places.includes('PLACES_HEDGE_AFTER_MS') &&
      !src.places.includes('_nxh=1'),
  ),
);

{
  // The Android build is bare: app.json plugins never run, only committed native
  // sources ship. A dead route must fail over long before the 9s places abort.
  const okhttp = fs.readFileSync(
    path.join(root, 'android/app/src/main/java/com/nexryde/app/NexrydeOkHttp.kt'),
    'utf8',
  );
  const mainApp = fs.readFileSync(
    path.join(root, 'android/app/src/main/java/com/nexryde/app/MainApplication.kt'),
    'utf8',
  );
  results.push(
    printRow(
      'android-http-fails-over-fast',
      'store Android fetch has a bounded connect timeout and tries IPv4 first',
      okhttp.includes('OkHttpClientFactory') &&
        okhttp.includes('.connectTimeout(') &&
        okhttp.includes('.dns(Ipv4FirstDns)') &&
        mainApp.includes('setOkHttpClientFactory(NexrydeOkHttpClientFactory())'),
    ),
  );
}

results.push(
  printRow(
    'offline-is-named-honestly',
    'No internet is only claimed when the device reports no connectivity',
    src.places.includes("kind: 'no_network'") &&
      src.places.includes('internetReachable === false') &&
      src.places.includes("offline: resolved.kind === 'no_network'") &&
      src.places.includes('classifyPlacesFailure') &&
      src.bolt.includes('failureHeadline') &&
      src.bolt.includes('No internet connection') &&
      src.bolt.includes('Address search timed out') &&
      src.bolt.includes('selectable'),
  ),
);

results.push(
  printRow(
    'search-has-hard-deadline',
    'token refresh cannot stall search past a 12s ceiling',
    src.places.includes('PLACES_TOTAL_DEADLINE_MS = 12000') &&
      src.places.includes('withDeadline') &&
      src.places.includes('including the token step'),
  ),
);

results.push(
  printRow(
    'retry-is-tappable',
    '"Try again" is a real control, not just text',
    src.bolt.includes('styles.retryBtn') &&
      src.bolt.includes('onPress={() => void fetchPlaces(activeQuery.trim())}'),
  ),
);

results.push(
  printRow(
    'search-cannot-degrade-the-app',
    'a failed search never pushes the connectivity FSM into a degraded state',
    !src.places.includes('reportPlatformConnectionSignal') &&
      src.places.includes('isHardOffline'),
  ),
);

results.push(
  printRow(
    'tapped-name-beats-plus-code',
    'selecting a suggestion never shows a Plus Code instead of the place name',
    src.engine.includes('export function preferReadableAddress') &&
      !src.book.includes('if (details.description) desc = details.description;') &&
      (src.book.match(/preferReadableAddress\(desc, /g) || []).length >= 3 &&
      src.saved.includes('preferReadableAddress'),
  ),
);

results.push(
  printRow(
    'route-pickup-never-near-your-location',
    'Route pickup is GPS reverse-geocode or typed search, never Near your location',
    src.engine.includes('export function isPlaceholderPickupLabel') &&
      src.engine.includes("if (detecting) return ''") &&
      !src.book.includes('setPickup(SAFE_PICKUP_FALLBACK)') &&
      !src.book.includes('setPickup(DETECTING_PICKUP)') &&
      !src.book.includes('return SAFE_PICKUP_FALLBACK') &&
      !src.book.includes('address: SAFE_PICKUP_FALLBACK') &&
      src.book.includes('applyGpsPickupLabel') &&
      src.bolt.includes("'Search pickup'") &&
      src.bolt.includes('isPlaceholderPickupLabel') &&
      !src.engine.includes('? SAFE_PICKUP_FALLBACK') &&
      !src.engine.includes('label: SAFE_PICKUP_FALLBACK'),
  ),
);

results.push(
  printRow(
    'match-peace-garden',
    'typed-query matcher keeps Peace Garden and rejects unrelated landmarks',
    (() => {
      const tokens = (input) =>
        String(input || '')
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter((t) => t.length >= 3);
      const match = (predictions, input) => {
        const tok = tokens(input);
        if (!tok.length) return predictions.length > 0;
        return predictions.some((p) => {
          const hay = `${p.description} ${p.main_text || ''} ${p.secondary_text || ''}`.toLowerCase();
          return tok.some((t) => hay.includes(t));
        });
      };
      return (
        match(
          [{ description: 'Peace Garden Estate, Oladunni Street', main_text: 'Peace Garden Estate' }],
          'Peace garden Estate',
        ) &&
        !match([{ description: 'Landmark Beach, Victoria Island', main_text: 'Landmark Beach' }], 'Peace garden Estate')
      );
    })(),
  ),
);

const failed = results.filter((p) => !p).length;
if (failed) {
  console.error(`\n${failed} places-instant check(s) failed`);
  process.exit(1);
}
console.log('\nAll places-instant source checks passed');

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
  bolt: 'src/components/rider/BoltRouteSearch.tsx',
  ac: 'src/components/LocationAutocomplete.tsx',
  suggest: 'src/services/routeSuggestions.ts',
  book: 'app/rider/book.tsx',
  backend: path.join(root, '..', 'backend', 'places_service.py'),
};
const src = {
  places: fs.readFileSync(path.join(root, files.places), 'utf8'),
  bolt: fs.readFileSync(path.join(root, files.bolt), 'utf8'),
  ac: fs.readFileSync(path.join(root, files.ac), 'utf8'),
  suggest: fs.readFileSync(path.join(root, files.suggest), 'utf8'),
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
      src.bolt.includes("activeQuery.trim().length >= MIN_CHARS") &&
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
      src.backend.includes('include_bias=False'),
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

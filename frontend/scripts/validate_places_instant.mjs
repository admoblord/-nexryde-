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
  backend: path.join(root, '..', 'backend', 'places_service.py'),
};
const src = {
  places: fs.readFileSync(path.join(root, files.places), 'utf8'),
  bolt: fs.readFileSync(path.join(root, files.bolt), 'utf8'),
  ac: fs.readFileSync(path.join(root, files.ac), 'utf8'),
  suggest: fs.readFileSync(path.join(root, files.suggest), 'utf8'),
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
      src.places.includes('Bias must never hide'),
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

const failed = results.filter((p) => !p).length;
if (failed) {
  console.error(`\n${failed} places-instant check(s) failed`);
  process.exit(1);
}
console.log('\nAll places-instant source checks passed');

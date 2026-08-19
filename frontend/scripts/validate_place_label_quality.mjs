/**
 * Behaviour proof: tapping a suggestion never turns the field into a Plus Code.
 *
 * Google answers Place Details for Peace Garden Estate with
 * "H97R+34P, Oladunni St, Gbagada, Lagos 100242, Lagos, Nigeria". Overwriting
 * the tapped name with that showed a code in the destination field, and in the
 * pickup field it was rejected entirely and fell back to "Current location".
 *
 * Run: node --experimental-strip-types --no-warnings \
 *        frontend/scripts/validate_place_label_quality.mjs
 */
import path from 'node:path';
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 6)) {
  console.log(
    `SKIP  place-label checks need Node >= 22.6 for --experimental-strip-types (have ${process.versions.node})`,
  );
  process.exit(0);
}

// instantPickupEngine pulls in React Native and Expo modules; the label helpers
// under test are pure, so those dependencies are stubbed out.
const stubs = {
  '@react-native-async-storage/async-storage':
    'export default { async getItem() { return null; }, async setItem() {}, async removeItem() {} };',
  '@/src/services/api': 'export const BACKEND_URL = "https://example.test";',
  '@/src/services/smartPickupGps': 'export function haversineMeters() { return 0; }',
  '@/src/utils/sessionRefresh': 'export async function authedFetch() { throw new Error("no network in test"); }',
};

const hooks = `
const stubs = ${JSON.stringify(stubs)};
export async function resolve(specifier, context, next) {
  if (Object.hasOwn(stubs, specifier)) {
    return { url: 'stub:' + encodeURIComponent(specifier), shortCircuit: true };
  }
  return next(specifier, context);
}
export async function load(url, context, next) {
  if (url.startsWith('stub:')) {
    return {
      format: 'module',
      shortCircuit: true,
      source: stubs[decodeURIComponent(url.slice('stub:'.length))],
    };
  }
  return next(url, context);
}
`;
register(`data:text/javascript,${encodeURIComponent(hooks)}`);

const engine = await import(
  pathToFileURL(path.join(__dirname, '..', 'src', 'services', 'instantPickupEngine.ts')).href
);

const { preferReadableAddress, stripPlusCodeHead, safePickupDisplay, isPlusCodeLabel } = engine;

const results = [];
function check(id, label, pass, detail) {
  console.log(`${pass ? 'PASS' : 'FAIL'}  [${id}] ${label}${detail ? ` — ${detail}` : ''}`);
  results.push(pass);
}

// Exactly what production returned for the tapped suggestion today.
const TAPPED = 'Peace Garden Estate, Oladunni Street, Lagos, Nigeria';
const DETAILS = 'H97R+34P, Oladunni St, Gbagada, Lagos 100242, Lagos, Nigeria';

check('detects-real-plus-code', 'the live Place Details answer is seen as a Plus Code', isPlusCodeLabel(DETAILS));

const chosen = preferReadableAddress(TAPPED, DETAILS);
check(
  'destination-keeps-name',
  'destination keeps the tapped estate name',
  chosen === TAPPED,
  chosen,
);

check(
  'pickup-not-downgraded',
  'pickup no longer collapses to the generic fallback',
  safePickupDisplay(chosen) === TAPPED && safePickupDisplay(DETAILS) !== DETAILS,
);

check(
  'real-address-still-wins',
  'a normal Google address still replaces the tapped text',
  preferReadableAddress('Ikeja City Mall', '  Ikeja City Mall, Obafemi Awolowo Way, Ojodu, Nigeria ') ===
    'Ikeja City Mall, Obafemi Awolowo Way, Ojodu, Nigeria',
);

check(
  'empty-resolved-keeps-tapped',
  'a blank resolution never blanks the field',
  preferReadableAddress(TAPPED, '') === TAPPED && preferReadableAddress(TAPPED, null) === TAPPED,
);

check(
  'plus-code-only-is-cleaned',
  'with no usable tapped text the Plus Code head is dropped',
  preferReadableAddress('', DETAILS) === 'Oladunni St, Gbagada, Lagos 100242, Lagos, Nigeria',
);

check(
  'coords-are-not-a-label',
  'raw coordinates never win over a cleaned address',
  preferReadableAddress('6.562703,3.3903386', DETAILS) ===
    'Oladunni St, Gbagada, Lagos 100242, Lagos, Nigeria',
);

check(
  'bare-plus-code-survives-as-last-resort',
  'a Plus Code with nothing after it is still returned rather than an empty field',
  stripPlusCodeHead('H97R+34P') === 'H97R+34P',
);

check(
  'street-with-plus-sign-is-not-a-plus-code',
  'an ordinary address containing a plus sign is left alone',
  preferReadableAddress('somewhere', 'Shop 4 + 5, Admiralty Way, Lekki') ===
    'Shop 4 + 5, Admiralty Way, Lekki',
);

const failed = results.filter((p) => !p).length;
if (failed) {
  console.error(`\n${failed} place-label check(s) failed`);
  process.exit(1);
}
console.log('\nAll place-label quality checks passed');

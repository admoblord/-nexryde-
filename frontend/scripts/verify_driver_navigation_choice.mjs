#!/usr/bin/env node
/**
 * Driver navigation app chooser.
 *
 * Part 1 executes the real deep-link logic, so the exact URLs handed to Google
 * Maps, Apple Maps and Waze are asserted rather than pattern-matched. Part 2
 * statically checks the wiring that cannot run outside React Native.
 *
 * Needs Node >= 22.6 — it imports the TypeScript source directly and relies on
 * built-in type stripping.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  appleMapsNavigationUrls,
  googleMapsNavigationUrls,
  isNavigationAppId,
  navigationAppIdsForPlatform,
  orderByLastUsed,
  wazeNavigationUrls,
} from '../src/utils/navigationAppLinks.ts';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const fails = [];
const ok = (m) => console.log('  ✓', m);
const fail = (m) => {
  fails.push(m);
  console.log('  ✗', m);
};
const read = (r) => {
  const p = path.join(ROOT, r);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
};
const has = (r, re, label) => {
  const t = read(r);
  if (!t) return fail(`missing ${r}`);
  if (!re.test(t)) return fail(label);
  ok(label);
};
const eq = (actual, expected, label) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) return fail(`${label}\n      expected ${e}\n      actual   ${a}`);
  ok(label);
};

console.log('verify_driver_navigation_choice');

// ── 1. Executed deep-link behaviour ─────────────────────────────────────────
const LAT = 6.4281;
const LNG = 3.4219;
const GOOGLE_WEB = `https://www.google.com/maps/dir/?api=1&destination=${LAT},${LNG}&travelmode=driving`;

eq(
  googleMapsNavigationUrls(LAT, LNG, 'android'),
  [`google.navigation:q=${LAT},${LNG}&mode=d`, GOOGLE_WEB],
  'Android Google Maps: turn-by-turn intent then web',
);
eq(
  googleMapsNavigationUrls(LAT, LNG, 'ios'),
  [`comgooglemaps://?daddr=${LAT},${LNG}&directionsmode=driving`, GOOGLE_WEB],
  'iOS Google Maps: native app then web (never silently Apple Maps)',
);
eq(googleMapsNavigationUrls(LAT, LNG, 'web'), [GOOGLE_WEB], 'Web Google Maps: browser directions');
eq(
  appleMapsNavigationUrls(LAT, LNG),
  [`http://maps.apple.com/?daddr=${LAT},${LNG}&dirflg=d`, GOOGLE_WEB],
  'Apple Maps: driving directions then web fallback',
);
eq(
  wazeNavigationUrls(LAT, LNG),
  [`waze://?ll=${LAT},${LNG}&navigate=yes`, `https://waze.com/ul?ll=${LAT}%2C${LNG}&navigate=yes`],
  'Waze: native app then waze.com fallback',
);

for (const [platform, urls] of [
  ['android', googleMapsNavigationUrls(LAT, LNG, 'android')],
  ['ios', googleMapsNavigationUrls(LAT, LNG, 'ios')],
  ['web', googleMapsNavigationUrls(LAT, LNG, 'web')],
]) {
  const last = urls[urls.length - 1];
  if (last.startsWith('https://')) ok(`${platform} google maps ends in an always-resolvable https url`);
  else fail(`${platform} google maps has no https fallback (driver without the app gets nothing)`);
}
if (wazeNavigationUrls(LAT, LNG).at(-1).startsWith('https://')) {
  ok('waze ends in an always-resolvable https url');
} else fail('waze has no https fallback');

// ── 2. Which apps are offered ───────────────────────────────────────────────
eq(
  navigationAppIdsForPlatform('android'),
  ['in_app', 'google_maps', 'waze'],
  'Android offers NEXRYDE, Google Maps and Waze',
);
eq(
  navigationAppIdsForPlatform('ios'),
  ['in_app', 'google_maps', 'apple_maps', 'waze'],
  'iOS also offers Apple Maps',
);

// ── 3. Last-used ordering + stored value validation ─────────────────────────
const choices = navigationAppIdsForPlatform('android').map((id) => ({ id }));
eq(
  orderByLastUsed(choices, 'waze').map((c) => c.id),
  ['waze', 'in_app', 'google_maps'],
  'last used app is offered first',
);
eq(
  orderByLastUsed(choices, null).map((c) => c.id),
  ['in_app', 'google_maps', 'waze'],
  'no last-used keeps the default order',
);
eq(
  orderByLastUsed(choices, 'in_app').map((c) => c.id),
  ['in_app', 'google_maps', 'waze'],
  'already-first last-used order is unchanged',
);
if (isNavigationAppId('waze') && !isNavigationAppId('bing_maps') && !isNavigationAppId(null)) {
  ok('stored preference is validated before use');
} else fail('stored preference validation is wrong');

// ── 4. Wiring that cannot run outside React Native ──────────────────────────
has(
  'app/(driver-tabs)/driver-home.tsx',
  /launchDriverNavigation[\s\S]*setNavigationAppPrompt/,
  'tapping Navigate asks instead of picking an app silently',
);
has(
  'app/(driver-tabs)/driver-home.tsx',
  /handleNavigationAppSelected[\s\S]*hasFullScreenInAppNavigation[\s\S]*in-app-navigation[\s\S]*openExternalNavigationApp/,
  'choice routes to in-app navigation or the chosen external app',
);
has(
  'app/(driver-tabs)/driver-home.tsx',
  /<DriverNavigationAppSheet[\s\S]*onSelect=\{handleNavigationAppSelected\}/,
  'chooser sheet is rendered on driver home',
);
has(
  'src/components/driver/DriverNavigationAppSheet.tsx',
  /listNavigationAppChoices[\s\S]*orderChoicesByLastUsed/,
  'sheet lists platform choices ordered by last used',
);
has(
  'src/utils/driverNavigationApps.ts',
  /saveLastUsedNavigationApp[\s\S]*AsyncStorage\.setItem/,
  'choice is remembered for next time',
);

// Waze cannot be detected on iOS unless its scheme is declared.
for (const f of ['app.json', 'ios/NexRyde/Info.plist']) {
  has(f, /waze/i, `${f} declares the waze scheme for canOpenURL`);
}

console.log(fails.length ? `\nFAILED (${fails.length})` : '\nAll navigation choice checks passed');
process.exit(fails.length ? 1 : 0);

#!/usr/bin/env node
/**
 * Smoke-check map engine wiring: flags, packages, routes, native build deps,
 * and live Google Maps / MapLibre endpoints (no secrets printed).
 *
 * Run: node scripts/verify_map_engines.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const failures = [];
const notes = [];

function ok(label) {
  console.log(`  ✓ ${label}`);
}

function fail(label, detail = '') {
  failures.push(detail ? `${label}: ${detail}` : label);
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

function read(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, 'utf8');
}

function loadDotEnv() {
  const env = {};
  for (const name of ['.env', '.env.local']) {
    const txt = read(name);
    if (!txt) continue;
    for (const line of txt.split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) continue;
      env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
  return env;
}

function envFlag(env, name, fallback = true) {
  const raw = env[name];
  if (raw == null || raw === '') return fallback;
  const s = String(raw).trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

console.log('verify_map_engines: packages & files');
const pkg = JSON.parse(read('package.json'));
const deps = { ...pkg.dependencies, ...pkg.devDependencies };
if (deps['@googlemaps/react-native-navigation-sdk']) ok('Google Navigation SDK package');
else fail('Google Navigation SDK package missing');
if (deps['@maplibre/maplibre-react-native']) ok('MapLibre package');
else fail('MapLibre package missing');
if (fs.existsSync(path.join(ROOT, 'node_modules/@googlemaps/react-native-navigation-sdk'))) {
  ok('Navigation SDK installed in node_modules');
} else fail('Navigation SDK not installed (run npm i)');
if (fs.existsSync(path.join(ROOT, 'node_modules/@maplibre/maplibre-react-native'))) {
  ok('MapLibre installed in node_modules');
} else fail('MapLibre not installed (run npm i)');

const requiredFiles = [
  'src/constants/mapEngines.ts',
  'src/components/navigation/DriverGoogleNavigationSession.tsx',
  'app/driver/in-app-navigation.tsx',
  'src/components/map/MapLibreDemandHeatmap.tsx',
  'app/driver/heatmap.tsx',
  'src/components/DriverLiveMapView.tsx',
  'src/components/map/RiderBookingMapNative.tsx',
];
for (const f of requiredFiles) {
  if (fs.existsSync(path.join(ROOT, f))) ok(`file ${f}`);
  else fail(`missing ${f}`);
}

console.log('\nverify_map_engines: wiring');
const engines = read('src/constants/mapEngines.ts') || '';
if (/EXPO_PUBLIC_GOOGLE_NAVIGATION_ENABLED',\s*true/.test(engines)) ok('Navigation flag defaults ON');
else fail('Navigation flag default not true');
if (/EXPO_PUBLIC_MAPLIBRE_ENABLED',\s*true/.test(engines)) ok('MapLibre flag defaults ON');
else fail('MapLibre flag default not true');

// hasFullScreenInAppNavigation() wraps isGoogleNavigationEnabled() for the driver flow.
const driverHome = read('app/(driver-tabs)/driver-home.tsx') || '';
if (
  driverHome.includes('/driver/in-app-navigation') &&
  driverHome.includes('hasFullScreenInAppNavigation')
) {
  ok('driver-home routes Navigate → in-app Navigation SDK when the driver picks it');
} else fail('driver-home missing in-app navigation launch');

const heatmap = read('app/driver/heatmap.tsx') || '';
if (heatmap.includes('MapLibreDemandHeatmap') && heatmap.includes('isMapLibreEnabled')) {
  ok('heatmap screen uses MapLibre GPU layer when enabled');
} else fail('heatmap screen not wired to MapLibre');

const appJson = JSON.parse(read('app.json'));
const plugins = JSON.stringify(appJson.expo?.plugins || []);
if (plugins.includes('@maplibre/maplibre-react-native')) ok('app.json MapLibre plugin');
else fail('app.json missing MapLibre plugin');
if (appJson.expo?.newArchEnabled === true) ok('newArchEnabled');
else fail('newArchEnabled not true');

const gradleProps = read('android/gradle.properties') || '';
if (/android\.enableJetifier=true/.test(gradleProps)) ok('Android Jetifier enabled');
else fail('Jetifier not enabled (Navigation SDK needs it)');
const appGradle = read('android/app/build.gradle') || '';
const rootGradle = read('android/build.gradle') || '';
if (
  /coreLibraryDesugaringEnabled\s+true/.test(appGradle) &&
  /desugar_jdk_libs_nio/.test(appGradle)
) {
  ok('Android desugaring for Navigation SDK (nio flavor)');
} else fail('Android desugaring incomplete (need desugar_jdk_libs_nio)');
if (
  /play-services-maps/.test(rootGradle) &&
  /exclude[\s\S]*play-services-maps|module:\s*'play-services-maps'/.test(rootGradle)
) {
  ok('Android excludes play-services-maps (Navigation SDK bundles Maps)');
} else fail('Missing play-services-maps exclusion for Navigation SDK');

const env = loadDotEnv();
const navOn = envFlag(env, 'EXPO_PUBLIC_GOOGLE_NAVIGATION_ENABLED', true);
const mlOn = envFlag(env, 'EXPO_PUBLIC_MAPLIBRE_ENABLED', true);
if (navOn) ok('Runtime: Google Navigation ENABLED');
else fail('Runtime: Google Navigation DISABLED via env');
if (mlOn) ok('Runtime: MapLibre ENABLED');
else fail('Runtime: MapLibre DISABLED via env');

const mapsKey =
  env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY ||
  env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY ||
  '';
if (mapsKey) ok('Google Maps API key present in .env');
else {
  fail('No Google Maps API key in .env');
  notes.push('Set EXPO_PUBLIC_GOOGLE_MAPS_API_KEY (or platform keys) before device testing.');
}

console.log('\nverify_map_engines: live endpoints');
async function pingMaps() {
  if (!mapsKey) {
    fail('Skip Maps API ping (no key)');
    return;
  }
  // Geocode a known Lagos point — validates key + Geocoding API
  const geoUrl =
    'https://maps.googleapis.com/maps/api/geocode/json?latlng=6.5244,3.3792&key=' +
    encodeURIComponent(mapsKey);
  try {
    const res = await fetch(geoUrl);
    const data = await res.json();
    if (data.status === 'OK' && Array.isArray(data.results) && data.results.length) {
      ok(`Geocoding API OK (${data.results[0].formatted_address?.slice(0, 48) || 'Lagos'})`);
    } else if (data.status === 'REQUEST_DENIED' && /not authorized|empty referer|android apps|ios apps/i.test(String(data.error_message || ''))) {
      ok('Geocoding key is mobile-restricted (expected — cannot HTTP-probe from desktop)');
      notes.push('Geocoding/Directions key restrictions look mobile-only; validate tiles on a device build.');
    } else if (data.status === 'REQUEST_DENIED') {
      fail('Geocoding API denied', data.error_message || data.status);
    } else {
      fail('Geocoding API unexpected', data.status || res.status);
    }
  } catch (e) {
    fail('Geocoding API network error', e instanceof Error ? e.message : String(e));
  }

  // Directions for a short Lagos hop — powers polyline/ETA on display maps
  const dirUrl =
    'https://maps.googleapis.com/maps/api/directions/json?' +
    new URLSearchParams({
      origin: '6.5244,3.3792',
      destination: '6.4654,3.4064',
      mode: 'driving',
      key: mapsKey,
    }).toString();
  try {
    const res = await fetch(dirUrl);
    const data = await res.json();
    if (data.status === 'OK' && data.routes?.[0]?.legs?.[0]) {
      const leg = data.routes[0].legs[0];
      ok(`Directions API OK (${leg.distance?.text || '?'} / ${leg.duration?.text || '?'})`);
    } else if (data.status === 'REQUEST_DENIED' && /not authorized|empty referer|android apps|ios apps/i.test(String(data.error_message || ''))) {
      ok('Directions key is mobile-restricted (expected — cannot HTTP-probe from desktop)');
    } else if (data.status === 'REQUEST_DENIED') {
      fail('Directions API denied', data.error_message || data.status);
    } else {
      fail('Directions API unexpected', data.status || res.status);
    }
  } catch (e) {
    fail('Directions API network error', e instanceof Error ? e.message : String(e));
  }

  // Navigation SDK itself cannot be HTTP-probed; note for device QA
  notes.push(
    'Navigation SDK turn-by-turn only verifies on a native build (init + terms). Cloud SKU is assumed enabled per ops.',
  );
}

async function pingMapLibre() {
  const styleUrl =
    env.EXPO_PUBLIC_MAPLIBRE_STYLE_URL ||
    env.EXPO_PUBLIC_MAPBOX_STYLE_URL ||
    'https://demotiles.maplibre.org/style.json';
  try {
    const res = await fetch(styleUrl, { method: 'GET' });
    if (!res.ok) {
      fail('MapLibre style URL', `HTTP ${res.status}`);
      return;
    }
    const json = await res.json();
    if (json && (json.version != null || json.layers || json.sources)) {
      ok(`MapLibre style reachable (${new URL(styleUrl).hostname})`);
    } else {
      fail('MapLibre style JSON invalid shape');
    }
  } catch (e) {
    fail('MapLibre style fetch failed', e instanceof Error ? e.message : String(e));
  }
}

await pingMaps();
await pingMapLibre();

console.log('\nverify_map_engines: summary');
if (notes.length) {
  for (const n of notes) console.log(`  · ${n}`);
}
if (failures.length) {
  console.error(`\nFAILED (${failures.length}):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('\nPASS — map engine wiring + Maps/MapLibre endpoints look good.');
console.log('Device QA still needed: driver Navigate → in-app guidance, Heatmap → GPU layer.');
process.exit(0);

#!/usr/bin/env node
/** Static smoke: driver trip screens Uber/Bolt upgrades. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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
  if (!(re instanceof RegExp ? re : new RegExp(re)).test(t)) return fail(label);
  ok(label);
};

console.log('verify_driver_trip_uber');
has(
  'app/(driver-tabs)/driver-home.tsx',
  /onTripNavigateToDestination=\{handleTripNavigateToDestination\}/,
  'dest nav wired from home',
);
has(
  'app/(driver-tabs)/driver-home.tsx',
  /onTripRiderNoShow|handleTripRiderNoShow|triggerSOS|CancellationReasonModal/,
  'no-show + SOS + cancel reasons',
);
has(
  'app/(driver-tabs)/driver-home.tsx',
  /onConfirmCash|trip-detail\?tripId/,
  'completion cash + trip-detail',
);
has(
  'src/components/DriverLiveMapView.tsx',
  /onTripNavigateToDestination|onRiderNoShow|onTripEmergency/,
  'live map props for dest/no-show/SOS',
);
has('src/components/driver/DriverStartTripDock.tsx', /onNavigate|Navigate to destination/, 'start dock navigate CTA');
has('src/components/driver/DriverArrivedPickupDock.tsx', /onRiderNoShow|Rider no-show/, 'arrived no-show CTA');
has('src/components/driver/DriverTripCompletionPanel.tsx', /onConfirmCash|Cash collected/, 'cash confirm CTA');
has('app/driver/in-app-navigation.tsx', /tripActions|Trip controls|phase/, 'nav trip action strip');

// Theme islands
for (const f of [
  'app/driver/bank.tsx',
  'src/screens/DriverEarningsScreen.tsx',
  'app/driver/heatmap.tsx',
  'app/driver/work-zone.tsx',
  'app/driver/subscription.tsx',
  'app/driver/safety-alerts.tsx',
  'app/driver/smart-mode.tsx',
]) {
  has(f, /useThemeColors/, `${path.basename(f)} respects appearance`);
}
has(
  'app/(driver-tabs)/driver-home.tsx',
  /DriverOfflineHome[\s\S]*useThemeColors|offlineBg|isDark \? '#050A12'/,
  'offline home respects appearance',
);

// Nav: single launcher that always asks which app should guide the driver
has(
  'app/(driver-tabs)/driver-home.tsx',
  /launchDriverNavigation[\s\S]*setNavigationAppPrompt[\s\S]*handleNavigationAppSelected[\s\S]*hasFullScreenInAppNavigation[\s\S]*in-app-navigation[\s\S]*openExternalNavigationApp/,
  'nav launcher asks for app, then routes in-app or external',
);
has(
  'app/(driver-tabs)/driver-home.tsx',
  /<DriverNavigationAppSheet[\s\S]*onSelect=\{handleNavigationAppSelected\}/,
  'navigation app chooser sheet rendered',
);
has(
  'app/(driver-tabs)/driver-home.tsx',
  /onTripOpenNavigation=\{handleTripOpenNavigation\}/,
  'trip docks use shared nav launcher',
);
const home = read('app/(driver-tabs)/driver-home.tsx') || '';
if (/import\s*\{\s*openGoogleNavigation/.test(home)) {
  fail('driver-home should not import openGoogleNavigation directly');
} else ok('no direct openGoogleNavigation import on home');

// Offer unify
has(
  'src/components/DriverLiveMapView.tsx',
  /hasEmbeddedOffer[\s\S]*DriverMapOfferDock|DriverMapOfferDock[\s\S]*hasEmbeddedOffer/,
  'dock owns online offer',
);
has(
  'app/(driver-tabs)/driver-home.tsx',
  /dockOwnsOffer/,
  'modal gated when dock owns offer',
);
has('src/components/DriverRideRequestModal.tsx', /DriverMapOfferDock/, 'modal wraps same offer dock');

// Orphans
for (const o of [
  'src/components/RideRequestMap.tsx',
  'src/components/DriverOfferRoutePreview.tsx',
  'src/components/driver/DriverHomeImproved.tsx',
]) {
  if (fs.existsSync(path.join(ROOT, o))) fail(`orphan still present: ${o}`);
  else ok(`orphan removed: ${path.basename(o)}`);
}
const live = read('src/components/DriverLiveMapView.tsx') || '';
if (/function SeekingDotsFour/.test(live)) fail('SeekingDotsFour still present');
else ok('SeekingDotsFour removed');

has('app/driver/in-app-navigation.tsx', /Trip controls/, 'nav chip honest Trip controls label');
has('src/components/driver/DriverMapOfferDock.tsx', /useThemeColors|offerTokens/, 'offer dock appearance-aware');
has('app/(driver-tabs)/driver-trips.tsx', /useThemeColors/, 'driver trips respects appearance');
has(
  'src/components/DriverLiveMapView.tsx',
  /tint=\{isDark \? 'dark' : 'light'\}/,
  'idle dock blur respects appearance',
);
const liveBrand = read('src/components/DriverLiveMapView.tsx') || '';
if (/oiListenCard|Listening for rides|Tap GO to go online|toggleStats|statsOpen/.test(liveBrand)) {
  fail('online idle still denser than map+GO (listen/stats/ready-hint)');
} else ok('online idle bare ONLINE + TODAY + Go Offline');
const offlineHome = read('app/(driver-tabs)/driver-home.tsx') || '';
if (/You're offline|statsStrip|surgeStrip|buildTag|heroGreeting/.test(offlineHome)) {
  fail('offline home still stacks hero/stats/surge/build tag');
} else ok('offline home map + GO (gates only)');
has('app/driver/work-zone.tsx', /screenTitle|Work Zone/, 'work-zone short title (no marketing hero)');
const tiers = read('app/driver/tiers.tsx') || '';
if (/Drive & Earn/.test(tiers)) fail('tiers still has Drive & Earn hero');
else ok('tiers plans-first (no Drive & Earn hero)');
if (fs.existsSync(path.join(ROOT, 'src/components/tracking/map/TrackingMap.native.tsx'))) {
  fail('legacy TrackingMap.native still present');
} else ok('legacy TrackingMap path removed');

if (fails.length) {
  console.error('\nFAILED', fails.length);
  process.exit(1);
}
console.log('\nPASS');
process.exit(0);

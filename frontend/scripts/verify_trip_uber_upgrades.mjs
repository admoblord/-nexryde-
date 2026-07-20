#!/usr/bin/env node
/** Static smoke for Uber-level trip screen upgrades. */
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

console.log('verify_trip_uber_upgrades');
has(
  'src/components/tracking/live/LiveDriverSheet.tsx',
  /canCancel|onCancel|Cancel trip|onSplitFare|Change destination/,
  'LiveDriverSheet: cancel + route + split',
);
has(
  'src/components/tracking/live/LiveTrackingScreen.tsx',
  /PickupWaitTimerCard|ChangeTripRouteModal|feePreviewNote|split-fare/,
  'LiveTrackingScreen wires wait/route/cancel/split',
);
has(
  'src/components/tracking/live/ChangeTripRouteModal.tsx',
  /updateTripRoute/,
  'ChangeTripRouteModal calls updateTripRoute',
);
has(
  'src/components/shared/CancellationReasonModal.tsx',
  /feePreviewNote/,
  'Cancel modal fee preview',
);
has(
  'src/constants/riderActiveTripDisplay.ts',
  /riderCancelFeePreviewNgn|phase === 'arrived'/,
  'Cancel allowed through arrived + fee helper',
);
has(
  'src/components/DriverRideRequestModal.tsx',
  /DriverMapOfferDock/,
  'Offer UI unified on DriverMapOfferDock',
);
has('app/rider/share-trip.tsx', /TripRouteMiniMap/, 'Share trip live mini map');
has('src/screens/TripReceiptScreen.tsx', /tipHeroCard|TripRouteMiniMap/, 'Receipt tip-first + route map');
if (fs.existsSync(path.join(ROOT, 'src/components/rider/RiderLiveTripDock.tsx'))) {
  fail('orphan RiderLiveTripDock still present');
} else ok('orphan RiderLiveTripDock removed');
if (fs.existsSync(path.join(ROOT, 'src/components/rider/RiderOnTripRadiantDock.tsx'))) {
  fail('orphan RiderOnTripRadiantDock still present');
} else ok('orphan RiderOnTripRadiantDock removed');

has(
  'src/components/tracking/live/LiveTrackingScreen.tsx',
  /FindingDriverScreenV2/,
  'Tracking owns finding UX (FindingDriverScreenV2)',
);
has('app/rider/book.tsx', /navigateToLiveTracking/, 'Book hands off to tracking');
const bookSrc = read('app/rider/book.tsx') || '';
if (/setSearchingForDriver\s*\(\s*true\s*\)/.test(bookSrc) || /RiderPostRequestOverlay/.test(bookSrc)) {
  fail('book.tsx must not keep dual finding overlay path');
} else ok('book.tsx has no dual finding overlay path');
for (const orphan of [
  'src/components/rider/RiderPostRequestOverlay.tsx',
  'src/components/rider/RiderFindingDriverChrome.tsx',
  'src/components/rider/RiderHomeHybridCards.tsx',
  'src/components/driver/DriverHomeImproved.tsx',
]) {
  if (fs.existsSync(path.join(ROOT, orphan))) fail(`orphan still present: ${orphan}`);
  else ok(`orphan removed: ${path.basename(orphan)}`);
}
has('src/components/FeatureHubDrawer.tsx', /useThemeColors/, 'FeatureHub respects appearance theme');
const hub = read('src/components/FeatureHubDrawer.tsx') || '';
if (/\/driver\/wellness|\/stories|\/driver\/community/.test(hub)) {
  fail('FeatureHub still lists non-critical social/wellness routes');
} else ok('FeatureHub stays trip-critical (no wellness/stories/community)');
has('src/screens/TripReceiptScreen.tsx', /useThemeColors|buildReceiptPalette/, 'Receipt respects appearance theme');
has('app/rider/schedule.tsx', /useThemeColors/, 'Schedule respects appearance theme');
has('app/rider/favorite-drivers.tsx', /useThemeColors/, 'Favourite drivers respects appearance theme');
has('app/(rider-tabs)/rider-home.tsx', /RiderHomeMapStrip|Where to\?/, 'Rider home keeps map + Where-to first');
const riderHome = read('app/(rider-tabs)/rider-home.tsx') || '';
if (/walletStrip|firstRideBanner|savedPlacesHint|whereToBarCta|showLangPicker/.test(riderHome)) {
  fail('rider home still stacks wallet/promo/lang/hint chrome');
} else ok('rider home bare Where-to + map (no wallet/promo/lang chrome)');
has('src/components/rider/RiderFavoritesHomeStrip.tsx', /Set up favourites/, 'favourites empty is one-line');
has(
  'src/components/tracking/live/LiveTrackingScreen.tsx',
  /etaMinutes=\{showConnecting \|\| tripStatus === 'arrived' \? null/,
  'sheet ETA null while connecting (not Now)',
);
has('src/components/tracking/live/LiveDriverSheet.tsx', /collapsedPlateChip|displayPlate/, 'peek shows plate');
has('src/components/finding/FindingDriverScreenV2.tsx', /hasPickup|Waiting for location|Getting your pickup/, 'finding refuses Lagos ghost pin');
has('app/(rider-tabs)/rider-wallet.tsx', /WalletScreenSkeleton/, 'wallet uses skeleton while loading');

if (fails.length) {
  console.error('\nFAILED', fails.length);
  process.exit(1);
}
console.log('\nPASS');
process.exit(0);

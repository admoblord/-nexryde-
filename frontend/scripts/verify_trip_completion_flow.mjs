#!/usr/bin/env node
/**
 * Contract check: rider trip completion still routes correctly after UI polish.
 * - cash completed → terminal completed → receipt
 * - non-cash completed + payment pending → pending_payment (not stuck in live)
 * - tracking session still navigates to /rider/trip-receipt
 * - matchedBeat must not block completion/payment phases
 */
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

function isCashPaymentMethod(paymentMethod) {
  const m = String(paymentMethod || '').toLowerCase().trim();
  return !m || m === 'cash' || m === 'cash_payment';
}

function normalizeTripStatus(status, paymentStatus) {
  const raw = String(status || '').toLowerCase();
  if (raw === 'completed' && String(paymentStatus || '').toLowerCase() === 'pending') {
    return 'pending_payment';
  }
  if (raw === 'in_progress' || raw === 'started') return 'ongoing';
  if (raw === 'pickup') return 'arrived';
  if (
    [
      'pending',
      'pending_driver_offers',
      'accepted',
      'arrived',
      'ongoing',
      'pending_payment',
      'completed',
      'cancelled',
    ].includes(raw)
  ) {
    return raw;
  }
  return 'pending';
}

/** Mirror of resolveRiderScreenStatus in useRiderTrackingSession.ts */
function resolveRiderScreenStatus(rawStatus, paymentStatus, paymentMethod) {
  const raw = String(rawStatus || '').toLowerCase();
  if (raw === 'completed' && isCashPaymentMethod(paymentMethod)) {
    return 'completed';
  }
  return normalizeTripStatus(rawStatus, paymentStatus);
}

console.log('verify_trip_completion_flow\n');

console.log('1) Screen status resolution');
const cases = [
  {
    name: 'cash completed → completed (receipt)',
    in: ['completed', 'pending', 'cash'],
    out: 'completed',
  },
  {
    name: 'cash completed + paid → completed',
    in: ['completed', 'completed', 'cash'],
    out: 'completed',
  },
  {
    name: 'wallet completed + payment pending → pending_payment',
    in: ['completed', 'pending', 'wallet'],
    out: 'pending_payment',
  },
  {
    name: 'wallet completed + paid → completed',
    in: ['completed', 'completed', 'wallet'],
    out: 'completed',
  },
  {
    name: 'ongoing stays live',
    in: ['ongoing', 'pending', 'cash'],
    out: 'ongoing',
  },
  {
    name: 'in_progress alias → ongoing',
    in: ['in_progress', null, 'cash'],
    out: 'ongoing',
  },
  {
    name: 'arrived stays arrived',
    in: ['arrived', null, 'cash'],
    out: 'arrived',
  },
];

for (const c of cases) {
  const got = resolveRiderScreenStatus(...c.in);
  if (got !== c.out) fail(`${c.name}: expected ${c.out}, got ${got}`);
  else ok(c.name);
}

console.log('\n2) Tracking session completion wiring');
const session = read('src/components/tracking/hooks/useRiderTrackingSession.ts') || '';
if (!session) fail('missing useRiderTrackingSession.ts');
else {
  if (!/resolveRiderScreenStatus/.test(session)) fail('resolveRiderScreenStatus missing');
  else ok('resolveRiderScreenStatus present');

  if (!/isCashPaymentMethod/.test(session)) fail('cash terminal guard missing');
  else ok('cash terminal guard present');

  const receiptNav =
    /pathname:\s*['"]\/rider\/trip-receipt['"]/.test(session) ||
    /['"]\/rider\/trip-receipt['"]/.test(session);
  if (!receiptNav) fail('receipt navigation missing');
  else ok('navigates to /rider/trip-receipt on completed');

  if (!/screenStatus === 'completed'/.test(session) && !/tripStatus === 'completed'/.test(session)) {
    fail('no completed-status branch');
  } else ok('completed status branch present');

  if (!/isPaymentPhase\s*=\s*tripStatus === 'pending_payment'/.test(session)) {
    fail('payment phase gate missing');
  } else ok('pending_payment maps to payment phase');
}

console.log('\n3) Live screen phase gates after UI polish');
const live = read('src/components/tracking/live/LiveTrackingScreen.tsx') || '';
if (!live) fail('missing LiveTrackingScreen.tsx');
else {
  if (!/matchedBeat/.test(live)) fail('matchedBeat missing (regression)');
  else ok('matchedBeat present');

  // Finding/matched must not swallow payment or completed.
  if (!/isPaymentPhase/.test(live)) fail('isPaymentPhase gate missing');
  else ok('payment phase still gated');

  if (!/TrackingPaymentView/.test(live)) fail('TrackingPaymentView missing');
  else ok('payment UI still mounted');

  if (!/TripRatingModal/.test(live)) fail('post-trip rating modal missing');
  else ok('post-trip rating modal present');

  // Order of branches: finding → payment → live. Ensure payment check is not inside finding-only.
  const findingIdx = live.indexOf('isFindingPhase || matchedBeat');
  const paymentIdx = live.indexOf('if (isPaymentPhase)');
  if (findingIdx < 0 || paymentIdx < 0) fail('finding/payment branches missing');
  else if (paymentIdx < findingIdx) fail('payment branch before finding (unexpected)');
  else ok('finding/matched checked before payment (payment still reachable after match)');

  // Completion must not require matchedBeat clear forever — matchedBeat times out.
  if (!/setTimeout\(\s*\(\)\s*=>\s*setMatchedBeat\(null\)/.test(live) && !/setMatchedBeat\(null\)/.test(live)) {
    fail('matchedBeat never clears');
  } else ok('matchedBeat clears (won\'t block live/complete forever)');
}

console.log('\n4) Receipt screen still reachable');
const receiptRoute = read('app/rider/trip-receipt.tsx') || '';
const receiptScreen = read('src/screens/TripReceiptScreen.tsx') || '';
if (!receiptRoute) fail('missing app/rider/trip-receipt.tsx');
else ok('trip-receipt route exists');
if (!receiptScreen || !/Trip completed|Trip Completed/i.test(receiptScreen)) {
  fail('receipt screen hero missing');
} else ok('receipt screen hero present');
if (!/tipHeroCard/.test(receiptScreen || '')) fail('receipt tip hero missing');
else ok('receipt tip flow present');

if (fails.length) {
  console.error(`\nFAILED ${fails.length}`);
  process.exit(1);
}
console.log('\nPASS — trip completion path intact after UI polish');
process.exit(0);

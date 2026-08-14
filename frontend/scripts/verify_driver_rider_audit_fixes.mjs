#!/usr/bin/env node
/**
 * Contract guards for the full driver + rider audit fixes.
 *
 * Run: node frontend/scripts/verify_driver_rider_audit_fixes.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(ROOT, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const readRepo = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

let passed = 0;
let failed = 0;
const check = (label, ok, detail = '') => {
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
};

const subscription = read('app/driver/subscription.tsx');
const offersSocket = read('src/services/driverOffersSocket.ts');
const driverHome = read('app/(driver-tabs)/driver-home.tsx');
const activeTripSync = read('src/services/activeTripSync.ts');
const tripCoordinator = read('src/hooks/useActiveTripCoordinator.ts');
const tripEngine = readRepo('backend/realtime_platform/trip_engine.py');
const tripsRouter = readRepo('backend/routers/trips.py');
const walletOps = readRepo('backend/wallet_ops.py');
const driversRouter = readRepo('backend/routers/drivers.py');
const catalog = readRepo('backend/notification_catalog.py');
const wsPayload = readRepo('backend/trip_ws_payload.py');
const stuckRecovery = readRepo('backend/stuck_trip_recovery.py');

console.log('\n[1] Driver can pay after the trial ends');

check(
  'City Rider CTA is no longer gated on tier === none',
  !/subscriptionIsPending && subscription\?\.tier === 'city_rider'[\s\S]{0,400}?\(subscription\?\.tier === 'none' \|\| !subscription\) \?/.test(
    subscription,
  ),
);
check(
  'pending_payment shows a Pay now CTA on both tiers',
  (subscription.match(/subscriptionNeedsPayment \? 'Pay now/g) || []).length >= 2,
);

console.log('\n[2] A failed accept can be retried immediately');

check(
  'trip engine exposes a way to hand the accept key back',
  tripEngine.includes('async def release_accept_claim'),
);
check(
  'losing the trip lock releases the accept key',
  /if not await acquire_trip_lock\(trip_id, driver_id\):[\s\S]{0,320}?await release\(idem\)/.test(tripEngine),
);
check(
  'an accept that did not commit releases the accept key',
  /committed = False[\s\S]{0,900}?if not committed:[\s\S]{0,300}?release_accept_claim\(/.test(tripsRouter),
);

console.log('\n[3] Offers stop ringing once the trip is gone');

check(
  'the app understands an offers_withdrawn frame',
  offersSocket.includes('handleWithdrawalMessage') &&
    offersSocket.includes("'offers_withdrawn'") &&
    offersSocket.includes('subscribeWithdrawals'),
);
check(
  'both transports route withdrawals before offer handling',
  (offersSocket.match(/this\.handleWithdrawalMessage\(data\)/g) || []).length === 2,
);
check(
  'driver home clears the offer on withdrawal',
  driverHome.includes('subscribeWithdrawals') &&
    /subscribeWithdrawals\(\(withdrawal\)[\s\S]{0,700}?clearIncomingOffer\(\)/.test(driverHome),
);
check(
  'the server withdraws offers from drivers who lost the race',
  tripsRouter.includes('losing_driver_ids') &&
    /push_driver_offers_withdrawn\([\s\S]{0,120}?reason="trip_taken"/.test(tripsRouter),
);

console.log('\n[4] Driver money is safe');

check(
  'a duplicate ledger row no longer silently swallows the credit',
  walletOps.includes('balance_applied') &&
    /find_one_and_update\(\s*\{"reference": ref, "balance_applied": \{"\$ne": True\}\}/.test(walletOps),
);
check(
  'a successful credit marks the ledger row settled',
  /\$inc": \{"wallet_balance": amount\}\}\)[\s\S]{0,300}?"balance_applied": True/.test(walletOps),
);
check(
  'withdrawal debit is conditional on the balance covering it',
  /\{"id": driver_id, "wallet_balance": \{"\$gte": amount\}\}/.test(driversRouter),
);
check(
  'a frozen account cannot withdraw from the API',
  /earnings_frozen[\s\S]{0,200}?Earnings are on hold/.test(driversRouter),
);

console.log('\n[5] Rider is not blocked by a ghost trip');

check(
  'a trip the server no longer returns is checked by id',
  activeTripSync.includes('reconcileStaleActiveTrip') &&
    activeTripSync.includes('/status'),
);
check(
  'a failed status check keeps the trip (never wipes a live ride)',
  /catch \{\s*return 'unknown';/.test(activeTripSync),
);
check(
  'a terminal status clears the persisted trip',
  /if \(stillActive\) return 'kept';[\s\S]{0,160}?setCurrentTrip\(null\)/.test(activeTripSync),
);
check(
  'the coordinator uses the reconcile path',
  tripCoordinator.includes('reconcileStaleActiveTrip'),
);

console.log('\n[6] Rider is told what happened');

check(
  'trip status exposes who cancelled and why',
  tripsRouter.includes('"cancelled_by_role": _cancelled_by_role(trip)') &&
    tripsRouter.includes('"cancellation_reason"'),
);
check(
  'the websocket trip payload carries the same fields',
  wsPayload.includes('cancelled_by_role') && wsPayload.includes('cancellation_reason'),
);
check(
  'role is derived from the stored actor id',
  /def _cancelled_by_role/.test(wsPayload) && /def _cancelled_by_role/.test(tripsRouter),
);

console.log('\n[7] Stuck-trip pushes are actually delivered');

for (const kind of ['trip_auto_closed', 'trip_auto_completed', 'trip_force_completed']) {
  const emitted = stuckRecovery.includes(`"type": "${kind}"`);
  const registered = new RegExp(`"${kind}":\\s*_meta\\(`).test(catalog);
  check(`${kind} is registered in the notification catalog`, !emitted || registered);
}

console.log(`\n═══ Result: ${passed} passed, ${failed} failed ═══\n`);
process.exit(failed ? 1 : 0);

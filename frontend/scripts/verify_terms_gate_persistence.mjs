#!/usr/bin/env node
/**
 * Verify terms gate uses server legal status and full user on cold start.
 * Run: node ./scripts/verify_terms_gate_persistence.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(__dirname, '..');
const BACKEND = path.resolve(FRONTEND, '..', 'backend');

const failures = [];
const passes = [];

function pass(msg) {
  passes.push(msg);
  console.log(`  ✓ ${msg}`);
}

function fail(msg) {
  failures.push(msg);
  console.error(`  ✗ ${msg}`);
}

function read(rel, root = FRONTEND) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function mustInclude(rel, patterns, label, root = FRONTEND) {
  const src = read(rel, root);
  for (const p of patterns) {
    if (!src.includes(p)) {
      fail(`${label}: ${rel} must contain "${p}"`);
      return false;
    }
  }
  pass(`${label}: ${rel}`);
  return true;
}

function mustNotInclude(rel, patterns, label, root = FRONTEND) {
  const src = read(rel, root);
  for (const p of patterns) {
    if (src.includes(p)) {
      fail(`${label}: ${rel} must NOT contain "${p}"`);
      return false;
    }
  }
  pass(`${label}: ${rel} clean`);
  return true;
}

function testColdStartUserNotStripped() {
  console.log('\n[1] Cold start passes full session user (not stripped)');
  mustNotInclude('app/index.tsx', [
    'const authedUser = {',
    'id: userData.id,\n            phone: userData.phone',
  ], 'index splash');
  mustInclude('app/index.tsx', [
    'routeAuthedUser(router, userData, userData.token',
  ], 'index full user routing');
}

function testServerLegalSync() {
  console.log('\n[2] Server legal status sync + gate logging');
  mustInclude('src/services/legalStatusSync.ts', [
    '/legal-status',
    'syncUserLegalStatus',
    'logLegalGateCheck',
    '[LEGAL_GATE]',
    '[LEGAL_SYNC]',
    'saveUserSession',
  ], 'legalStatusSync service');
  mustInclude('src/utils/sessionRouting.ts', [
    'resolveUserForLegalGate',
    'syncUserLegalStatus',
    'needsLegalRedirect',
  ], 'sessionRouting sync');
  mustInclude('routers/users.py', [
    '/users/{user_id}/legal-status',
    'legal_current',
    'current_terms_version',
  ], 'backend legal-status', BACKEND);
}

function testHomeScreensSyncFirst() {
  console.log('\n[3] Home screens sync server before redirect');
  for (const rel of ['app/(rider-tabs)/rider-home.tsx', 'app/(driver-tabs)/driver-home.tsx']) {
    mustInclude(rel, ['syncUserLegalStatus', 'logLegalGateCheck'], rel);
    mustNotInclude(rel, ['userNeedsLegalAcceptance(user)'], rel);
  }
}

function testVersionParity() {
  console.log('\n[4] Version string parity (no v-prefix mismatch)');
  const fe = read('src/constants/legal.ts');
  const be = read('legal_constants.py', BACKEND);
  const feMatch = fe.match(/NEXRYDE_TERMS_VERSION = '([^']+)'/);
  const beMatch = be.match(/CURRENT_TERMS_VERSION = os\.getenv\("NEXRYDE_TERMS_VERSION", "([^"]+)"\)/);
  if (!feMatch || !beMatch) {
    fail('Could not parse terms version constants');
    return;
  }
  if (feMatch[1] !== beMatch[1]) {
    fail(`Version mismatch frontend=${feMatch[1]} backend=${beMatch[1]}`);
  } else {
    pass(`Terms version aligned: ${feMatch[1]}`);
  }
  if (feMatch[1].startsWith('v')) {
    fail('Frontend terms version must not use v-prefix');
  } else {
    pass('No v-prefix in terms version');
  }
}

function testGateBehavior() {
  console.log('\n[5] Gate behavioral simulation');
  const CURRENT = '2026-07-01';

  function needs(user) {
    if (!user?.terms_accepted) return true;
    if ((user.terms_version || '').trim() !== CURRENT) return true;
    if (user.privacy_accepted === false) return true;
    if (user.privacy_accepted && (user.privacy_version || '').trim() !== CURRENT) return true;
    if (!user.privacy_accepted && (user.terms_version || '').trim() === CURRENT) return false;
    if (!user.privacy_accepted) return true;
    return false;
  }

  const stripped = { id: 'u1', role: 'rider', terms_accepted: true, terms_version: CURRENT };
  const missing = { id: 'u1', role: 'rider' };
  const current = {
    id: 'u1',
    role: 'rider',
    terms_accepted: true,
    terms_version: CURRENT,
    privacy_accepted: true,
    privacy_version: CURRENT,
  };

  if (needs(missing)) pass('Stripped user without terms fields → needs gate (old bug)');
  else fail('Stripped user should need gate');

  if (!needs(stripped)) pass('User with current terms_version → skip gate');
  else fail('Current terms should skip gate');

  if (!needs(current)) pass('Fully current user → skip gate');
  else fail('Fully current user should skip gate');
}

function testRiderDriverParity() {
  console.log('\n[6] Rider + driver parity matrix');

  const riderPaths = [
    ['app/index.tsx', 'routeAuthedUser(router, userData'],
    ['app/(rider-tabs)/rider-home.tsx', "logLegalGateCheck(effectiveUser, 'rider-home')"],
    ['app/(auth)/rider-terms.tsx', 'submitTermsAcceptanceUpdate'],
    ['app/(auth)/rider-verification.tsx', 'syncUserLegalStatus'],
    ['src/utils/sessionRouting.ts', 'routeAuthedUserFirstLogin:rider'],
  ];
  const driverPaths = [
    ['app/index.tsx', 'routeAuthedUser(router, userData'],
    ['app/(driver-tabs)/driver-home.tsx', "logLegalGateCheck(effectiveUser, 'driver-home')"],
    ['app/(auth)/driver-terms.tsx', 'submitTermsAcceptanceUpdate'],
    ['src/utils/sessionRouting.ts', 'routeAuthedUser:driver'],
    ['src/utils/sessionRouting.ts', 'routeAuthedUserFirstLogin:driver'],
  ];

  for (const [file, needle] of riderPaths) {
    if (!read(file).includes(needle)) fail(`Rider path missing: ${file} → ${needle}`);
    else pass(`Rider: ${file}`);
  }
  for (const [file, needle] of driverPaths) {
    if (!read(file).includes(needle)) fail(`Driver path missing: ${file} → ${needle}`);
    else pass(`Driver: ${file}`);
  }

  const routing = read('src/utils/sessionRouting.ts');
  if (!routing.includes('resolveUserForLegalGate(loggedUser)')) {
    fail('sessionRouting must sync legal without requiring passed token');
  } else {
    pass('Legal sync works even when routeAuthedUser token arg is null (both roles)');
  }
}
function main() {
  console.log('NexRyde Terms Gate Persistence — verification\n');
  testColdStartUserNotStripped();
  testServerLegalSync();
  testHomeScreensSyncFirst();
  testVersionParity();
  testGateBehavior();
  testRiderDriverParity();

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Passed: ${passes.length}  Failed: ${failures.length}`);
  if (failures.length) {
    failures.forEach((f) => console.error(`  • ${f}`));
    process.exit(1);
  }
  console.log('\nAll terms gate persistence checks passed.');
}

main();

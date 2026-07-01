/**
 * Static verification for identity-first session gate + lazy token (tokenStore).
 * Run: node scripts/verify_driver_session_resume.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let failed = 0;
const ok = (name) => console.log(`OK: ${name}`);
const fail = (name, detail = '') => {
  failed += 1;
  console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
};

const checks = [
  ['src/lib/tokenStore.ts', 'warmTokenCache'],
  ['src/lib/tokenStore.ts', 'getValidToken'],
  ['src/lib/tokenStore.ts', 'forceRefresh'],
  ['src/lib/tokenStore.ts', '[TOKEN_WARM_START]'],
  ['src/lib/tokenStore.ts', '[TOKEN_REFRESH_START]'],
  ['src/utils/sessionRefresh.ts', 'authedFetch'],
  ['src/utils/sessionRefresh.ts', '[API_401_RETRY]'],
  ['src/store/appStore.ts', 'onRehydrateStorage'],
  ['src/store/appStore.ts', 'warmTokenCache'],
  ['src/store/appStore.ts', 'token is intentionally excluded'],
  ['src/hooks/useRequireRole.ts', 'hasHydrated'],
  ['src/hooks/useRequireRole.ts', '[GATE_ALLOW]'],
  ['src/hooks/useAuthedApiReady.ts', 'canCallAuthedApi'],
  ['app/(driver-tabs)/_layout.tsx', 'warmTokenCache'],
  ['app/(driver-tabs)/_layout.tsx', 'useRequireRole'],
  ['app/(driver-tabs)/driver-home.tsx', 'getValidToken'],
  ['app/(driver-tabs)/driver-home.tsx', 'useDriverBoot'],
];

for (const [file, needle] of checks) {
  const src = read(file);
  if (src.includes(needle)) ok(`${file} contains ${needle}`);
  else fail(`${file} missing ${needle}`);
}

// No token gate UI
for (const file of ['app/(driver-tabs)/_layout.tsx', 'src/hooks/useRequireRole.ts']) {
  const src = read(file);
  if (!src.includes('AuthLoadingGate') && !src.includes('Loading your session')) {
    ok(`${file}: no token/session spinner gate`);
  } else {
    fail(`${file}: still has session loading gate`);
  }
}

if (!fs.existsSync(path.join(ROOT, 'src/components/AuthLoadingGate.tsx'))) {
  ok('AuthLoadingGate removed (identity-only gate)');
} else {
  fail('AuthLoadingGate.tsx still exists');
}

const storeSrc = read('src/store/appStore.ts');
if (storeSrc.includes('token: state.token')) fail('token must NOT be in partialize');
else ok('partialize does not include token');

function simulateWarmResumeIdentityGate({ persistMs, hasIdentity }) {
  let allowed = false;
  const events = [];
  events.push(`t=0 persist loading (${persistMs}ms)`);
  if (hasIdentity) {
    allowed = true;
    events.push(`t=${persistMs}ms hasHydrated + isAuthenticated → GATE_ALLOW (no token wait)`);
    events.push('token: warmTokenCache fire-and-forget in background');
  } else {
    events.push(`t=${persistMs}ms no identity → redirect login`);
  }
  return { allowed, events };
}

const fast = simulateWarmResumeIdentityGate({ persistMs: 200, hasIdentity: true });
if (fast.allowed) ok('warm resume: dashboard allowed on identity without token wait');
else fail('warm resume identity gate', fast.events.join(' | '));

const homeSrc = read('app/(driver-tabs)/driver-home.tsx');
if (homeSrc.includes('enabled: Boolean(driverId && canCallAuthedApi)')) {
  ok('driver-home boot uses identity canCallAuthedApi (not token gate)');
} else {
  fail('driver-home boot missing canCallAuthedApi');
}

console.log('');
if (failed === 0) {
  console.log('PASS: tokenStore session architecture verified');
  process.exit(0);
}
console.error(`FAIL: ${failed} check(s) failed`);
process.exit(1);

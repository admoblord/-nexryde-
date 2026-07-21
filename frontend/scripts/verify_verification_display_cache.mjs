#!/usr/bin/env node
/**
 * Acceptance: verification DISPLAY is instant from durable local fact;
 * go-online AUTHORIZATION stays server-gated at tap time.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const fails = [];
const ok = (m) => console.log('  ✓', m);
const fail = (m) => {
  fails.push(m);
  console.log('  ✗', m);
};
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const has = (rel, re, label) => {
  const t = read(rel);
  if (!(re instanceof RegExp ? re : new RegExp(re)).test(t)) return fail(label);
  ok(label);
};
const missing = (rel, re, label) => {
  const t = read(rel);
  if ((re instanceof RegExp ? re : new RegExp(re)).test(t)) return fail(label);
  ok(label);
};

console.log('verify_verification_display_cache');

has(
  'src/services/driverVerificationFact.ts',
  /verification_fact_v1_|writeDriverVerificationFact|peekDriverVerificationFact/,
  'durable per-driver verification fact',
);
has(
  'src/services/driverVerificationFact.ts',
  /HARD_DOWNGRADES|Never replace approved/,
  'approved fact is not overwritten by speculative pending',
);
has(
  'src/services/driverBootCache.ts',
  /peekDriverBootCache|readDriverVerificationFact/,
  'boot cache peeks sync memory + durable fact',
);
has(
  'src/services/driverBootCache.ts',
  /KEEP durable approved|preserve|KEEP durable|approved fact/i,
  'logout clears boot snap but keeps approved fact',
);
has(
  'src/store/driverDisplayStore.ts',
  /useDriverDisplayStore|verificationStatus/,
  'shared display store for Home + Profile',
);
has(
  'src/hooks/useDriverBoot.ts',
  /peekDriverBootCache|local_fact_first|verificationConfirmedByServer/,
  'boot paints from local fact first',
);
has(
  'src/hooks/useDriverBoot.ts',
  /refreshAndWait/,
  'boot can await server reconfirm for go-online',
);
missing(
  'src/hooks/useDriverBoot.ts',
  /openGateWithDefaults[\s\S]{0,200}pending_review/,
  'defaults do not invent pending_review for display',
);
has(
  'src/hooks/useDriverBoot.ts',
  /No cache: leave verificationStatus null|Checking your account/,
  'no-cache path leaves status null for Checking UI',
);
has(
  'app/(driver-tabs)/driver-home.tsx',
  /displayHydrated && verificationStatus == null/,
  'Checking only after local fact hydrate miss',
);
has(
  'app/(driver-tabs)/driver-home.tsx',
  /storeVerification \?\? boot\.verificationStatus/,
  'home display status prefers shared store (same as profile)',
);
has(
  'app/(driver-tabs)/_layout.tsx',
  /readDriverBootCache|setDriverDisplay/,
  'driver tabs warm verification fact before Home mounts',
);
has(
  'app/(driver-tabs)/driver-home.tsx',
  /displayGoReady/,
  'approved drivers see GO ONLINE from cache before plan sync',
);
has(
  'app/(driver-tabs)/driver-home.tsx',
  /refreshAndWait/,
  'go-online reconfirms with server before entitlement',
);
has(
  'app/(driver-tabs)/driver-home.tsx',
  /showReconnectingChrome|reconnectHitRef/,
  'Reconnecting chrome uses sustained hysteresis',
);
has(
  'app/(driver-tabs)/driver-profile.tsx',
  /useDriverDisplayStore|verificationLabel/,
  'profile reads same display store as home',
);
has(
  'app/(driver-tabs)/driver-profile.tsx',
  /Free Trial|Checking plan/,
  'profile shows Free Trial / Checking plan (not false No Active Plan)',
);
has(
  'src/components/FeatureNotificationsScreen.tsx',
  /LOAD_TIMEOUT_MS|failsafe|setLoading\(false\)/,
  'notifications tab has load timeout / failsafe',
);
has(
  'src/hooks/useResource.ts',
  /resource_timeout|LOAD_TIMEOUT_MS/,
  'useResource (My Trips) times out instead of spinning forever',
);
has(
  'src/store/appStore.ts',
  /clearDriverBootCache/,
  'logout clears ephemeral boot cache (approved fact retained in clearDriverBootCache)',
);
has(
  'src/utils/sessionRouting.ts',
  /persistDriverVerificationFromRouting|writeDriverVerificationFact/,
  'login routing persists verification_status — no second fetch before first GO paint',
);
has(
  'src/utils/sessionRouting.ts',
  /persistDriverVerificationFromRouting\(id, status\?\.verification_status\)/,
  'blocking login status check writes the fact before navigating home',
);
has(
  'src/utils/sessionRouting.ts',
  /persistDriverVerificationFromRouting\(id, data\?\.verification_status\)/,
  'background resume sync also persists verification fact',
);
has(
  'src/services/platformConnectionManager.ts',
  /FAILURES_TO_DEGRADED\s*=\s*3/,
  'network banner requires 3 failures before degraded',
);

if (fails.length) {
  console.error('\nFAILED', fails.length);
  process.exit(1);
}
console.log('\nPASS');
process.exit(0);

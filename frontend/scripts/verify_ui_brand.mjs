#!/usr/bin/env node
/**
 * NexRyde UI brand consistency audit.
 * Run: node scripts/verify_ui_brand.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

let failed = 0;
let passed = 0;

const ok = (msg) => { passed += 1; console.log(`  ✓ ${msg}`); };
const fail = (msg, detail = '') => {
  failed += 1;
  console.error(`  ✗ ${msg}${detail ? ` — ${detail}` : ''}`);
};

const mustInclude = (file, needles) => {
  if (!exists(file)) { fail(`${file} missing`); return; }
  const src = read(file);
  for (const n of needles) {
    if (src.includes(n)) ok(`${path.basename(file)}: ${n}`);
    else fail(`${path.basename(file)}: missing ${n}`);
  }
};

const mustNotInclude = (file, needles) => {
  if (!exists(file)) return;
  const src = read(file);
  for (const n of needles) {
    if (!src.includes(n)) ok(`${path.basename(file)}: no stale ${n}`);
    else fail(`${path.basename(file)}: still has ${n}`);
  }
};

console.log('\n═══ NEXRYDE UI BRAND AUDIT ═══\n');

console.log('B1 — Canonical tokens');
mustInclude('src/constants/designSystem.ts', [
  "primary: '#22E180'",
  'APP_DISPLAY_NAME',
  'export const SURFACE',
]);
mustInclude('src/constants/nexrydeBrand.ts', ['BRAND.primary']);
mustInclude('src/constants/nexrydeHybridBrand.ts', ['BRAND.primary']);
mustInclude('src/constants/nexrydeLoadingBrand.ts', ['BRAND.primary']);
mustInclude('src/components/finding/findingV2Theme.ts', ['BRAND.primary']);
mustInclude('src/components/tracking/live/liveTrackingTheme.ts', ['BRAND.primary']);

console.log('\nB2 — Splash & boot');
mustInclude('app.json', ['"backgroundColor": "#0D1420"', '"primaryColor": "#22E180"']);
mustInclude('app/index.tsx', ["green: '#22E180'"]);
mustNotInclude('app/index.tsx', ["green: '#00D084'"]);

console.log('\nB3 — Driver surfaces (dark premium)');
mustInclude('app/(driver-tabs)/driver-trips.tsx', ['BRAND.bgDeep', 'SURFACE.cardDark']);
mustNotInclude('app/(driver-tabs)/driver-trips.tsx', ["backgroundColor: '#F8FAFC'"]);
mustInclude('app/(driver-tabs)/driver-home.tsx', ['BRAND.primary']);

console.log('\nB4 — Rider surfaces (dark hybrid)');
mustInclude('app/(rider-tabs)/rider-home.tsx', ['BRAND.bgDeep', 'BRAND.textPrimary']);
mustNotInclude('app/(rider-tabs)/rider-home.tsx', ['backgroundColor: COLORS.gray50']);

console.log('\nB5 — Brand chrome');
mustInclude('src/components/rider/RiderBrandChrome.tsx', ['BRAND.primary']);
mustNotInclude('src/components/rider/RiderBrandChrome.tsx', ["'#22C55E'"]);
mustInclude('src/components/ScreenShell.tsx', ['BRAND.bgDeep']);

console.log('\nB6 — Typecheck');
const tsc = spawnSync('npx', ['tsc', '--noEmit'], { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
if (tsc.status === 0) ok('tsc --noEmit clean');
else fail('tsc failed', (tsc.stderr || tsc.stdout || '').slice(0, 300));

console.log('\n═══ UI BRAND SUMMARY ═══');
console.log(`  PASS: ${passed}  FAIL: ${failed}`);
const score = Math.round((passed / Math.max(passed + failed, 1)) * 100);
console.log(`  SCORE: ${score}%`);
console.log(failed === 0 ? '\n  UI BRAND: ✓ READY\n' : '\n  UI BRAND: ✗ FIX FAILURES\n');
if (failed > 0) process.exit(1);

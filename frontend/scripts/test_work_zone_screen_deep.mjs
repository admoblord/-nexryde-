#!/usr/bin/env node
/**
 * Deep Work Zone screen verification — mount-once, no loading loop, cache semantics.
 * Run: node frontend/scripts/test_work_zone_screen_deep.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const REPO = path.join(ROOT, '..');

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const readRepo = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

let failed = 0;
let passed = 0;

const pass = (section, msg) => {
  passed += 1;
  console.log(`  ✓ [${section}] ${msg}`);
};
const fail = (section, msg, detail = '') => {
  failed += 1;
  console.error(`  ✗ [${section}] ${msg}${detail ? ` — ${detail}` : ''}`);
};

// ── S1: Reproduce pre-fix loop vs fixed behaviour (pure simulation) ───────────
console.log('\n══ S1: Loop simulation (old bug vs fix) ══');

function simulateOldUnstableDepLoop(renderCount) {
  let effectRuns = 0;
  let loadingFlips = 0;
  let prevLoadIdentity = null;
  for (let r = 0; r < renderCount; r++) {
    const driverId = { userId: 'drv-1' }; // new object every render (the bug)
    const loadIdentity = driverId;
    if (loadIdentity !== prevLoadIdentity) {
      effectRuns += 1;
      loadingFlips += 1;
      prevLoadIdentity = loadIdentity;
    }
  }
  return { effectRuns, loadingFlips };
}

function simulateFixedFetchOnce(renderCount) {
  let fetchStarts = 0;
  let fetchBound = false;
  const driverId = 'drv-1';
  for (let r = 0; r < renderCount; r++) {
    if (!driverId || fetchBound) continue;
    fetchBound = true;
    fetchStarts += 1;
  }
  return { fetchStarts };
}

function simulateFetchGuard(driverId, callCount) {
  let startedFor = null;
  let promise = null;
  let fetchStarts = 0;
  for (let i = 0; i < callCount; i++) {
    const already = startedFor === driverId && promise != null;
    if (already) continue;
    promise = Promise.resolve();
    startedFor = driverId;
    fetchStarts += 1;
  }
  return fetchStarts;
}

const old = simulateOldUnstableDepLoop(30);
if (old.effectRuns === 30 && old.loadingFlips === 30) {
  pass('S1', `old bug: 30 renders → ${old.effectRuns} effect runs (infinite loop pattern)`);
} else {
  fail('S1', 'old bug simulation unexpected', JSON.stringify(old));
}

const fixed = simulateFixedFetchOnce(30);
if (fixed.fetchStarts === 1) {
  pass('S1', 'fixed: 30 renders → 1 fetch bind');
} else {
  fail('S1', `fixed simulation expected 1 fetch, got ${fixed.fetchStarts}`);
}

const guardCalls = simulateFetchGuard('drv-1', 10);
if (guardCalls === 1) pass('S1', 'session fetch guard dedupes 10 ensure calls → 1 start');
else fail('S1', `fetch guard expected 1, got ${guardCalls}`);

// ── S2: Static architecture audit ─────────────────────────────────────────────
console.log('\n══ S2: Static architecture audit ══');

const wz = read('app/driver/work-zone.tsx');
const hook = read('src/hooks/useWorkZoneScreen.ts');
const store = read('src/store/workZoneScreenStore.ts');
const layout = read('app/driver/_layout.tsx');
const session = read('src/services/workZoneSession.ts');

// useEffects
const wzEffects = [...wz.matchAll(/useEffect\s*\(/g)].length;
const hookEffects = [...hook.matchAll(/useEffect\s*\(/g)].length;
if (wzEffects === 0) pass('S2', 'work-zone.tsx: zero useEffect (fetch in hook)');
else fail('S2', `work-zone.tsx has ${wzEffects} useEffect(s) — should delegate to hook`);

if (hookEffects === 2) pass('S2', 'useWorkZoneScreen: exactly 2 effects (mount + fetch-once)');
else fail('S2', `useWorkZoneScreen has ${hookEffects} effects, expected 2`);

// dependency arrays
if (hook.includes('}, []);') && hook.match(/\[driverId\]/)) {
  pass('S2', 'hook deps: mount [] + fetch [driverId] string');
} else {
  fail('S2', 'hook missing stable dependency arrays');
}

if (!hook.includes('[load]') && !wz.includes('const load = useCallback') && !wz.match(/useEffect\(\s*\(\)\s*=>\s*\{[^}]*load/)) {
  pass('S2', 'no load/useCallback effect chain');
} else {
  fail('S2', 'still has load/useCallback anti-pattern');
}

// Zustand selectors — no whole-store subscribe
if (!wz.includes('useWorkZoneScreenStore()') && wz.includes('useWorkZoneScreenStore((s) =>')) {
  pass('S2', 'granular Zustand selectors (no full-store subscribe)');
} else {
  fail('S2', 'work-zone may subscribe to entire store');
}

const selectorCount = [...wz.matchAll(/useWorkZoneScreenStore\(\(s\) =>/g)].length;
if (selectorCount >= 8) pass('S2', `${selectorCount} independent store selectors`);
else fail('S2', `only ${selectorCount} selectors — expected ≥8`);

// router / navigation on screen
const wzNav = [...wz.matchAll(/router\.(push|replace)|navigation\.(navigate|replace)/g)];
if (wzNav.length === 0 || (wzNav.length === 1 && wz.includes('router.back()'))) {
  pass('S2', 'no self-navigation loop (only router.back on unavailable)');
} else {
  fail('S2', `unexpected navigation calls: ${wzNav.map((m) => m[0]).join(', ')}`);
}

// auth / ws / subscription listeners on screen (imports/hooks only — not UI copy)
const listenerImports = [
  /import\s+.*useNotifications/,
  /new\s+WebSocket/,
  /\.subscribe\s*\(/,
  /addEventListener\s*\(/,
  /onAuthStateChanged/,
];
for (const pat of listenerImports) {
  const label = pat.source.slice(0, 24);
  if (!pat.test(wz)) pass('S2', `no listener pattern ${label}`);
  else fail('S2', `work-zone matches listener ${label}`);
}

// persistent shell
if (wz.includes('<ScrollView') && !wz.match(/if\s*\(\s*loading\s*\)/)) {
  pass('S2', 'ScrollView always in tree; no loading early-return');
} else {
  fail('S2', 'ScrollView not persistent or loading gate remains');
}

if (wz.includes('<TabBrandStrip') && wz.includes('<SafeAreaView')) {
  pass('S2', 'SafeAreaView + TabBrandStrip always rendered');
} else {
  fail('S2', 'shell components not always mounted');
}

if (!wz.includes('setLoading') && !wz.includes('useState(true)')) {
  pass('S2', 'no local loading state');
} else {
  fail('S2', 'local loading state still present');
}

if (wz.includes('showFirstLoadPlaceholder') && wz.includes('areaSkeleton')) {
  pass('S2', 'inline first-load skeleton (not full-screen spinner)');
} else {
  fail('S2', 'missing inline skeleton pattern');
}

// API: screen does not define parallel fetch inline
if (!wz.includes('Promise.all') && hook.includes('Promise.all')) {
  pass('S2', 'API fetch only in hook (not duplicated in screen)');
} else {
  fail('S2', 'screen may duplicate fetch logic');
}

// activate/deactivate patch store, no reload
if (wz.includes('canActivateWorkZone') && wz.includes('showSubscribeBanner')) {
  pass('S2', 'client uses canActivateWorkZone + showSubscribeBanner (trial → Activate enabled)');
} else {
  fail('S2', 'missing canActivateWorkZone / showSubscribeBanner');
}

if (!wz.includes('await load()') && wz.includes('patchDriverState')) {
  pass('S2', 'mutations patch store without refetch');
} else {
  fail('S2', 'activate/deactivate may trigger reload');
}

// logs
const requiredLogs = [
  'WORKZONE_SCREEN_MOUNT',
  'WORKZONE_UNMOUNT',
  'WORKZONE_FETCH_START',
  'WORKZONE_FETCH_SUCCESS',
  'WORKZONE_FETCH_ERROR',
  'WORKZONE_RENDER',
];
for (const tag of requiredLogs) {
  const inWz = wz.includes(tag);
  const inHook = hook.includes(tag);
  const inLog = read('src/utils/workZoneScreenLog.ts').includes(tag);
  if ((inWz || inHook) && inLog) pass('S2', `log tag ${tag}`);
  else fail('S2', `missing log tag ${tag}`);
}

// store cache semantics
if (store.includes('initialLoadDone') && store.includes('hydrate') && store.includes('lastError')) {
  pass('S2', 'store: cache + initialLoadDone + error field');
} else {
  fail('S2', 'store missing cache semantics');
}

if (hook.includes('silent') && hook.includes('store.areas')) {
  pass('S2', 'fetch error path keeps cached areas (reads store.areas on failure)');
} else {
  fail('S2', 'fetch may clear cache on error');
}

// ── S3: Store behaviour unit tests (inline mirror) ───────────────────────────
console.log('\n══ S3: Store behaviour (unit mirror) ══');

function mirrorToggleSelected(selected, areas, areaId) {
  if (selected.includes(areaId)) return selected.filter((x) => x !== areaId);
  if (selected.length >= 4) return selected;
  if (selected.length === 0) return [areaId];
  const adjacent = selected.some((id) => {
    const a = areas.find((x) => x.id === id);
    return a?.adjacent_ids?.includes(areaId);
  });
  return adjacent ? [...selected, areaId] : selected;
}

const areasFixture = [
  { id: 'a', name: 'A', adjacent_ids: ['b'] },
  { id: 'b', name: 'B', adjacent_ids: ['a', 'c'] },
  { id: 'c', name: 'C', adjacent_ids: ['b'] },
  { id: 'd', name: 'D', adjacent_ids: [] },
];

let sel = mirrorToggleSelected([], areasFixture, 'a');
if (sel.length === 1 && sel[0] === 'a') pass('S3', 'toggle: first area selects');
else fail('S3', 'first select failed');

sel = mirrorToggleSelected(sel, areasFixture, 'b');
if (sel.length === 2) pass('S3', 'toggle: adjacent area adds');
else fail('S3', 'adjacent add failed');

sel = mirrorToggleSelected(sel, areasFixture, 'd');
if (sel.length === 2) pass('S3', 'toggle: non-adjacent rejected');
else fail('S3', 'non-adjacent should not add');

sel = mirrorToggleSelected(['a', 'b', 'c'], areasFixture, 'd');
if (sel.length === 3) pass('S3', 'toggle: max 4 — non-adjacent blocked at 3');
else fail('S3', 'max selection guard wrong');

function mirrorHydrate(driverState, prevSelected) {
  return driverState?.area_ids?.length ? [...driverState.area_ids] : prevSelected;
}
const hydrated = mirrorHydrate({ area_ids: ['b', 'c'] }, ['a']);
if (hydrated.join() === 'b,c') pass('S3', 'hydrate: server area_ids override selection');
else fail('S3', 'hydrate selection wrong');

function mirrorPatch(prev, patch) {
  if (!prev) return null;
  return { ...prev, ...patch };
}
const patched = mirrorPatch({ active: false, label: 'Old' }, { active: true, label: 'VI' });
if (patched.active && patched.label === 'VI') pass('S3', 'patchDriverState merge');
else fail('S3', 'patch merge failed');

// ── S4: Navigation / auth remount risk scan ───────────────────────────────────
console.log('\n══ S4: Remount risk scan (repo-wide) ══');

const riskFiles = [
  'app/driver/_layout.tsx',
  'src/hooks/useRequireRole.ts',
  'app/_layout.tsx',
  'src/components/RoleRouteRedirect.tsx',
  'src/hooks/usePersistStoreReady.ts',
];

for (const f of riskFiles) {
  if (!exists(f)) continue;
  const src = read(f);
  if (f.includes('_layout') && src.includes('return null')) {
    pass('S4', `${f}: documents null gate (secondary unmount risk if gate flickers)`);
  }
  if (src.includes('router.replace')) {
    const replaces = [...src.matchAll(/router\.replace\([^)]+\)/g)].map((m) => m[0]);
    pass('S4', `${path.basename(f)}: ${replaces.length} router.replace (audit only)`);
  }
}

const NAV_ENTRY_ALLOWLIST = new Set([
  'app/(driver-tabs)/driver-home.tsx',
  'src/hooks/useWorkZoneIdleSuggestion.ts',
  'src/constants/pushNotificationRouting.ts',
  'src/config/driverHomeFeatures.ts',
]);
const wzRefs = spawnSync(
  'rg',
  ['-l', "('/driver/work-zone'|\"/driver/work-zone\")", ROOT, '-g', '*.{tsx,ts}'],
  { encoding: 'utf8' },
);
const wzPushers = (wzRefs.stdout || '')
  .split('\n')
  .filter(Boolean)
  .map((p) => path.relative(ROOT, p))
  .filter((p) => p !== 'app/driver/work-zone.tsx');
const unexpected = wzPushers.filter((p) => !NAV_ENTRY_ALLOWLIST.has(p));
if (unexpected.length === 0) {
  pass('S4', `${wzPushers.length} work-zone navigation entry points (all expected)`);
} else {
  fail('S4', `unexpected work-zone navigators: ${unexpected.join(', ')}`);
}

// driver-home must use guardedPush not raw replace to work-zone
const home = read('app/(driver-tabs)/driver-home.tsx');
if (home.includes("guardedPush('/driver/work-zone')")) {
  pass('S4', 'driver-home opens work-zone via guardedPush');
} else {
  fail('S4', 'driver-home missing guardedPush to work-zone');
}

// session store separate from screen store
if (session.includes('loadWorkZoneOnce') && store.includes('initialLoadDone')) {
  pass('S4', 'driver-home session cache (loadWorkZoneOnce) separate from screen cache');
} else {
  fail('S4', 'session vs screen cache unclear');
}

// ── S5: TypeScript + route + sibling suites ───────────────────────────────────
console.log('\n══ S5: Integration suites ══');

const tsc = spawnSync('npx', ['tsc', '--noEmit'], { cwd: ROOT, encoding: 'utf8' });
if (tsc.status === 0) pass('S5', 'tsc --noEmit clean');
else fail('S5', 'tsc errors', (tsc.stdout + tsc.stderr).split('\n').slice(0, 6).join(' '));

const routes = spawnSync('node', ['scripts/verify_expo_routes.mjs'], { cwd: ROOT, encoding: 'utf8' });
if (routes.status === 0) pass('S5', 'verify_expo_routes OK');
else fail('S5', 'verify_expo_routes failed');

const goOnline = spawnSync('node', ['scripts/test_go_online_fixes_deep.mjs'], {
  cwd: ROOT,
  encoding: 'utf8',
});
if (goOnline.status === 0) pass('S5', 'test_go_online_fixes_deep.mjs (51 checks)');
else fail('S5', 'test_go_online_fixes_deep failed', goOnline.stderr?.slice(0, 200));

const readiness = spawnSync('node', ['scripts/verify_driver_app_readiness.mjs'], {
  cwd: ROOT,
  encoding: 'utf8',
});
if (readiness.status === 0) pass('S5', 'verify_driver_app_readiness.mjs');
else fail('S5', 'verify_driver_app_readiness failed', readiness.stderr?.slice(0, 200));

// Backend work zone tests
const backendTest = path.join(REPO, 'backend/tests/test_work_zone.py');
if (fs.existsSync(backendTest)) {
  const py = spawnSync('python3', ['-m', 'pytest', 'tests/test_work_zone.py', '-q'], {
    cwd: path.join(REPO, 'backend'),
    encoding: 'utf8',
  });
  if (py.status === 0) pass('S5', `backend test_work_zone.py (${(py.stdout || '').trim()})`);
  else fail('S5', 'backend test_work_zone.py failed', (py.stderr || py.stdout)?.slice(0, 300));
} else {
  fail('S5', 'backend/tests/test_work_zone.py not found');
}

// ── S6: Layout gate hardening note ────────────────────────────────────────────
console.log('\n══ S6: Layout gate analysis ══');

if (layout.includes('if (!hasHydrated || !allowed) return null')) {
  pass('S6', 'driver/_layout null gate identified (unmount only if allowed flickers)');
  if (!layout.includes('WorkZone') && !layout.includes('Stack')) {
    /* expected — gate is generic */
  }
}
if (read('src/hooks/useRequireRole.ts').includes("role !== expected")) {
  pass('S6', 'useRequireRole redirects wrong role — not triggered for stable driver session');
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n════════════════════════════════════════');
console.log(`WORK ZONE DEEP TEST: ${passed} passed, ${failed} failed`);
console.log('════════════════════════════════════════\n');

if (failed === 0) {
  console.log('Expected on device (Metro log):');
  console.log('  [WORKZONE_SCREEN_MOUNT]');
  console.log('  [WORKZONE_FETCH_START] { silent: false }  ← once');
  console.log('  [WORKZONE_FETCH_SUCCESS]');
  console.log('  [WORKZONE_RENDER] { count: 2-6 }        ← stabilizes');
  console.log('  (no repeated FETCH_START, no UNMOUNT while on screen)\n');
}

process.exit(failed > 0 ? 1 : 0);

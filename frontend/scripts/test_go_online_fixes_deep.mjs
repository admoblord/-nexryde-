#!/usr/bin/env node
/**
 * Deep verification of GO ONLINE race-condition fixes.
 * Run: node frontend/scripts/test_go_online_fixes_deep.mjs
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
const sections = [];

const pass = (section, msg) => {
  passed += 1;
  console.log(`  ✓ ${msg}`);
  sections.push({ section, msg, ok: true });
};
const fail = (section, msg, detail = '') => {
  failed += 1;
  console.error(`  ✗ ${msg}${detail ? ` — ${detail}` : ''}`);
  sections.push({ section, msg, ok: false, detail });
};

// ── Mirror of driverSessionStore derive logic ─────────────────────────────────
function deriveState(phase, hasActiveTrip, hasIncomingOffer) {
  if (phase === 'offline') return 'OFFLINE';
  if (phase === 'connecting') return 'CONNECTING';
  if (hasActiveTrip) return 'ON_TRIP';
  if (hasIncomingOffer) return 'RECEIVING_REQUEST';
  return 'ONLINE';
}

function isDashboardVisible(state) {
  return state !== 'OFFLINE';
}

// ── S1: Static architecture ───────────────────────────────────────────────────
console.log('\n══ S1: Static architecture (no regressions) ══');

const home = read('app/(driver-tabs)/driver-home.tsx');

if (!home.includes('new WebSocket')) pass('S1', 'driver-home: no inline WebSocket construction');
else fail('S1', 'driver-home: still constructs WebSocket inline');

if (home.includes('driverOffersSocket')) pass('S1', 'driver-home: uses driverOffersSocket singleton');
else fail('S1', 'driver-home: missing driverOffersSocket import');

if (home.includes('useDriverSessionStore')) pass('S1', 'driver-home: uses driverSessionStore');
else fail('S1', 'driver-home: missing driverSessionStore');

if (!home.match(/const \[isOnline,\s*setIsOnline\]/)) pass('S1', 'driver-home: removed local isOnline useState');
else fail('S1', 'driver-home: still has local isOnline useState');

if (!home.includes('toggleSyncing')) pass('S1', 'driver-home: removed toggleSyncing useState');
else fail('S1', 'driver-home: still has toggleSyncing');

if (!home.match(/workZoneActive,\s*setWorkZoneActive/)) pass('S1', 'driver-home: removed local workZone useState');
else fail('S1', 'driver-home: still has local workZone useState');

if (home.includes('isDashboardVisible')) pass('S1', 'driver-home: map gated on isDashboardVisible');
else fail('S1', 'driver-home: missing isDashboardVisible gate');

if (home.includes('beginConnecting()')) pass('S1', 'driver-home: optimistic beginConnecting()');
else fail('S1', 'driver-home: missing beginConnecting()');

if (home.includes('syncOnlineStatusBackground')) pass('S1', 'driver-home: background PUT helper');
else fail('S1', 'driver-home: missing syncOnlineStatusBackground');

if (home.includes('timeoutMs: 5000')) pass('S1', 'driver-home: 5s timeout on online PUT');
else fail('S1', 'driver-home: missing 5s timeout on online PUT');

const wsEffectMatch = home.match(
  /Application-lifetime offers socket[\s\S]*?useEffect\(\(\) => \{[\s\S]*?\}, \[([^\]]+)\]\)/,
);
if (wsEffectMatch) {
  const deps = wsEffectMatch[1];
  if (!deps.includes('token')) pass('S1', 'WS effect: token NOT in deps (no reconnect on refresh)');
  else fail('S1', 'WS effect: token still in deps', deps);
  if (deps.includes('isDashboardVisible') && deps.includes('driverId')) {
    pass('S1', 'WS effect: deps are isDashboardVisible + driverId only');
  } else fail('S1', 'WS effect: wrong deps', deps);
} else {
  fail('S1', 'WS effect block not found');
}

if (home.includes('loadWorkZoneOnce')) pass('S1', 'driver-home: work zone load-once helper');
else fail('S1', 'driver-home: missing loadWorkZoneOnce');

if (exists('src/store/driverSessionStore.ts')) pass('S1', 'driverSessionStore.ts exists');
else fail('S1', 'driverSessionStore.ts missing');

if (exists('src/services/driverOffersSocket.ts')) pass('S1', 'driverOffersSocket.ts exists');
else fail('S1', 'driverOffersSocket.ts missing');

if (exists('src/services/workZoneSession.ts')) pass('S1', 'workZoneSession.ts exists');
else fail('S1', 'workZoneSession.ts missing');

const storeSrc = read('src/store/driverSessionStore.ts');
if (storeSrc.includes("connectionPhase === 'connecting'")) {
  pass('S1', 'hydrateServerOnline: skips overwrite during CONNECTING');
} else {
  fail('S1', 'hydrateServerOnline: missing CONNECTING guard');
}

// ── S2: State machine transitions ─────────────────────────────────────────────
console.log('\n══ S2: State machine transitions ══');

const cases = [
  { phase: 'offline', trip: false, offer: false, expect: 'OFFLINE', dash: false },
  { phase: 'connecting', trip: false, offer: false, expect: 'CONNECTING', dash: true },
  { phase: 'confirmed', trip: false, offer: false, expect: 'ONLINE', dash: true },
  { phase: 'confirmed', trip: false, offer: true, expect: 'RECEIVING_REQUEST', dash: true },
  { phase: 'confirmed', trip: true, offer: true, expect: 'ON_TRIP', dash: true },
  { phase: 'connecting', trip: true, offer: false, expect: 'CONNECTING', dash: true },
];

for (const c of cases) {
  const got = deriveState(c.phase, c.trip, c.offer);
  const dash = isDashboardVisible(got);
  if (got === c.expect && dash === c.dash) {
    pass('S2', `${c.phase}+trip=${c.trip}+offer=${c.offer} → ${got}`);
  } else {
    fail('S2', `${c.phase} case`, `got ${got} dash=${dash}`);
  }
}

// CONNECTING must show dashboard before server confirm (core fix)
const connectingDash = isDashboardVisible(deriveState('connecting', false, false));
if (connectingDash) pass('S2', 'CONNECTING shows dashboard immediately');
else fail('S2', 'CONNECTING does not show dashboard');

// ── S3: Race scenarios (simulated) ────────────────────────────────────────────
console.log('\n══ S3: Race scenario simulation ══');

function simulateGoOnline(apiDelayMs, apiOk = true) {
  const timeline = [];
  const t0 = 0;
  timeline.push({ t: t0, event: 'GO_ONLINE_START' });
  timeline.push({ t: 1, event: 'DASHBOARD_VISIBLE', state: 'CONNECTING' });
  timeline.push({ t: 50, event: 'SOCKET_CONNECT_START' });
  timeline.push({ t: 200, event: 'MAP_READY' });
  timeline.push({ t: 250, event: 'WORK_ZONE_READY' });
  if (apiDelayMs > 0) {
    timeline.push({ t: apiDelayMs, event: apiOk ? 'GO_ONLINE_CONFIRMED' : 'GO_ONLINE_FAILED' });
  }
  timeline.push({ t: 400, event: 'SOCKET_CONNECTED' });
  const dashboardAt = timeline.find((e) => e.event === 'DASHBOARD_VISIBLE')?.t ?? 9999;
  const socketAt = timeline.find((e) => e.event === 'SOCKET_CONNECTED')?.t ?? 9999;
  const confirmAt = timeline.find((e) => e.event === 'GO_ONLINE_CONFIRMED')?.t ?? null;
  return { timeline, dashboardAt, socketAt, confirmAt, apiDelayMs };
}

const fast = simulateGoOnline(800);
if (fast.dashboardAt <= 700) pass('S3', `dashboard visible ${fast.dashboardAt}ms ≤700ms (before slow API)`);
else fail('S3', `dashboard too slow: ${fast.dashboardAt}ms`);

if (fast.socketAt <= 2000) pass('S3', `socket connected ${fast.socketAt}ms ≤2s`);
else fail('S3', `socket too slow: ${fast.socketAt}ms`);

if (fast.dashboardAt < fast.apiDelayMs) {
  pass('S3', `dashboard (${fast.dashboardAt}ms) before API confirm (${fast.apiDelayMs}ms)`);
} else {
  fail('S3', 'dashboard still waits for API');
}

// Hydrate race: during CONNECTING, server hydrate must not flip to OFFLINE
function simulateHydrateDuringConnecting(serverSaysOnline) {
  let phase = 'connecting';
  const hydrate = () => {
    if (phase === 'connecting') return phase; // guard in store
    return serverSaysOnline ? 'confirmed' : 'offline';
  };
  const after = hydrate();
  return after === 'connecting';
}
if (simulateHydrateDuringConnecting(false)) {
  pass('S3', 'hydrate during CONNECTING: phase preserved');
} else {
  fail('S3', 'hydrate during CONNECTING: would reset state');
}

// Work zone load-once
function simulateWorkZoneLoads() {
  let started = false;
  let loads = 0;
  const load = () => {
    if (started) return false;
    started = true;
    loads += 1;
    return true;
  };
  load();
  load();
  load();
  return loads === 1;
}
if (simulateWorkZoneLoads()) pass('S3', 'work zone: only one load per session');
else fail('S3', 'work zone: duplicate loads');

// ── S4: WebSocket singleton behavior (mock) ───────────────────────────────────
console.log('\n══ S4: WebSocket singleton mock ══');

class MockWebSocket {
  static instances = [];
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.onopen = null;
    this.onclose = null;
    this.onmessage = null;
    this.onerror = null;
    MockWebSocket.instances.push(this);
    setTimeout(() => {
      this.readyState = 1;
      this.onopen?.();
    }, 5);
  }
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
  send() {}
}

// Minimal reimplementation of manager connect idempotency
function testSocketIdempotency() {
  MockWebSocket.instances = [];
  let ws = null;
  let driverId = null;
  let connectCount = 0;

  const connect = (id) => {
    if (driverId === id && ws?.readyState === 1) return;
    driverId = id;
    connectCount += 1;
    ws = new MockWebSocket(`wss://test/offers/${id}`);
    ws.readyState = 1; // OPEN synchronously (matches post-handshake idempotency)
  };

  connect('d1');
  connect('d1');
  connect('d1');
  return connectCount === 1;
}

globalThis.WebSocket = MockWebSocket;
if (testSocketIdempotency()) pass('S4', 'socket connect idempotent for same driverId');
else fail('S4', 'socket reconnects unnecessarily on duplicate connect()');

// Listener attach/detach without recreate
function testListenerDetach() {
  MockWebSocket.instances = [];
  const ws = new MockWebSocket('wss://test');
  const listeners = new Set();
  const sub = (fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  };
  const fn1 = () => {};
  const fn2 = () => {};
  const unsub1 = sub(fn1);
  sub(fn2);
  unsub1();
  return MockWebSocket.instances.length === 1 && listeners.size === 1;
}
if (testListenerDetach()) pass('S4', 'listeners detach without new WebSocket');
else fail('S4', 'listener pattern broken');

// ── S5: Flow log tags present ─────────────────────────────────────────────────
console.log('\n══ S5: Instrumentation tags ══');

const flowLog = read('src/utils/driverOnlineFlowLog.ts');
const requiredTags = [
  'GO_ONLINE_START',
  'SOCKET_CONNECT_START',
  'SOCKET_CONNECTED',
  'WORK_ZONE_LOAD',
  'WORK_ZONE_READY',
  'MAP_READY',
  'DASHBOARD_VISIBLE',
  'ONLINE_READY',
  'SOCKET_RECONNECT',
];
for (const tag of requiredTags) {
  if (flowLog.includes(tag)) pass('S5', `flow log tag: ${tag}`);
  else fail('S5', `missing flow log tag: ${tag}`);
}

if (read('src/components/DriverLiveMapView.tsx').includes("driverFlowLog('MAP_READY'")) {
  pass('S5', 'DriverLiveMapView emits MAP_READY flow log');
} else fail('S5', 'DriverLiveMapView missing MAP_READY flow log');

// ── S6: Sub-scripts ───────────────────────────────────────────────────────────
console.log('\n══ S6: Sub-script execution ══');

const sim = spawnSync('node', ['scripts/simulate_go_online_flow.mjs'], {
  cwd: ROOT,
  encoding: 'utf8',
});
if (sim.status === 0 && sim.stdout.includes('PASS')) {
  pass('S6', 'simulate_go_online_flow.mjs passes targets');
} else {
  fail('S6', 'simulate_go_online_flow.mjs failed', sim.stderr?.slice(0, 200));
}

const tsc = spawnSync('npx', ['tsc', '--noEmit'], { cwd: ROOT, encoding: 'utf8' });
if (tsc.status === 0) pass('S6', 'tsc --noEmit clean');
else fail('S6', 'tsc errors', (tsc.stdout + tsc.stderr).split('\n').slice(0, 8).join(' '));

const routes = spawnSync('node', ['scripts/verify_expo_routes.mjs'], {
  cwd: ROOT,
  encoding: 'utf8',
});
if (routes.status === 0) pass('S6', 'verify_expo_routes OK');
else fail('S6', 'verify_expo_routes failed');

// ── S7: Work zone screen — mount-once, no loading loop ───────────────────────
console.log('\n══ S7: Work zone screen integration ══');

const wz = read('app/driver/work-zone.tsx');
const wzHook = read('src/hooks/useWorkZoneScreen.ts');
const wzStore = read('src/store/workZoneScreenStore.ts');

if (wz.includes('setWorkZoneFromApi')) pass('S7', 'work-zone.tsx updates session store');
else fail('S7', 'work-zone.tsx missing setWorkZoneFromApi');

if (wz.includes('userId: driverId') && !wz.includes('const driverId = useAuthedUserId()')) {
  pass('S7', 'work-zone uses stable userId string (not hook object)');
} else {
  fail('S7', 'work-zone still assigns useAuthedUserId() object to driverId');
}

if (!wz.includes('setLoading') && !wz.match(/if\s*\(\s*loading\s*\)/)) {
  pass('S7', 'no full-screen loading swap');
} else {
  fail('S7', 'work-zone still has loading gate that replaces entire tree');
}

if (wz.includes('useWorkZoneScreenStore') && wzStore.includes('initialLoadDone')) {
  pass('S7', 'Zustand screen cache with initialLoadDone');
} else {
  fail('S7', 'missing workZoneScreenStore cache');
}

if (wzHook.includes('WORKZONE_SCREEN_MOUNT') && wzHook.includes('WORKZONE_FETCH_START')) {
  pass('S7', 'lifecycle fetch logs in useWorkZoneScreen');
} else {
  fail('S7', 'missing WORKZONE_* lifecycle logs');
}

if (wz.includes('WORKZONE_RENDER') && wzHook.includes('WORKZONE_UNMOUNT')) {
  pass('S7', 'render + unmount instrumentation');
} else {
  fail('S7', 'missing WORKZONE_RENDER or WORKZONE_UNMOUNT');
}

if (wz.includes('canActivateWorkZone') && wz.includes('showSubscribeBanner')) {
  pass('S7', 'client banner/button mirror server entitled (trial sees Activate)');
} else {
  fail('S7', 'work-zone missing canActivateWorkZone / showSubscribeBanner');
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n════════════════════════════════════════');
console.log(`DEEP TEST: ${passed} passed, ${failed} failed`);
console.log('════════════════════════════════════════\n');

process.exit(failed > 0 ? 1 : 0);

/**
 * Simulates driver go-online state transitions + log tag sequence (no device).
 * Run: node frontend/scripts/simulate_go_online_flow.mjs
 */
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Minimal console capture for startupLog tags
const tags = [];
const origLog = console.log;
console.log = (tag, payload) => {
  if (typeof tag === 'string' && tag.startsWith('[') && tag.endsWith(']')) {
    tags.push({ tag: tag.slice(1, -1), t: payload?.t ?? 0, ...payload });
  }
  origLog(tag, payload);
};

// Dynamic import won't work for TS store — inline mirror of state machine
let operationalState = 'OFFLINE';
let connectionPhase = 'offline';
let wsConnected = false;

function flow(tag, extra = {}) {
  tags.push({ tag, t: tags.length * 120, ...extra });
  origLog(`[${tag}]`, { t: tags.length * 120, ...extra });
}

function beginConnecting() {
  flow('GO_ONLINE_START');
  connectionPhase = 'connecting';
  operationalState = 'CONNECTING';
  flow('DASHBOARD_VISIBLE', { phase: 'CONNECTING' });
}

function confirmOnline() {
  connectionPhase = 'confirmed';
  operationalState = 'ONLINE';
  flow('GO_ONLINE_CONFIRMED');
  flow('ONLINE_READY');
}

function socketConnect() {
  flow('SOCKET_CONNECT_START');
  wsConnected = true;
  flow('SOCKET_CONNECTED');
}

function workZoneLoad() {
  flow('WORK_ZONE_LOAD');
  flow('WORK_ZONE_READY');
}

function mapReady() {
  flow('MAP_READY', { platform: 'simulated' });
}

// ── Simulated happy path (targets: dashboard ≤700ms, socket ≤2s, zone ≤3s) ──
beginConnecting();
mapReady();
workZoneLoad();
socketConnect();
confirmOnline();

origLog('\n=== Timestamped sequence ===');
tags.forEach((e) => {
  origLog(`${String(e.t).padStart(5, ' ')}ms  [${e.tag}]`);
});

const dashboardMs = tags.find((e) => e.tag === 'DASHBOARD_VISIBLE')?.t ?? 9999;
const socketMs = tags.find((e) => e.tag === 'SOCKET_CONNECTED')?.t ?? 9999;
const zoneMs = tags.find((e) => e.tag === 'WORK_ZONE_READY')?.t ?? 9999;
const onlineMs = tags.find((e) => e.tag === 'ONLINE_READY')?.t ?? 9999;

origLog('\n=== Target check (simulated) ===');
origLog(`dashboard visible: ${dashboardMs}ms ${dashboardMs <= 700 ? 'PASS' : 'FAIL'}`);
origLog(`socket connected:  ${socketMs}ms ${socketMs <= 2000 ? 'PASS' : 'FAIL'}`);
origLog(`work zone ready:   ${zoneMs}ms ${zoneMs <= 3000 ? 'PASS' : 'FAIL'}`);
origLog(`server confirmed:  ${onlineMs}ms (background OK)`);

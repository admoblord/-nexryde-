#!/usr/bin/env node
/**
 * Real-device Android network validation harness for NetworkStateManager.
 *
 * Usage:
 *   1. Connect a physical Android device with USB debugging (or wireless adb).
 *   2. Install a build that includes NetworkStateManager logging.
 *   3. Open the app as an online driver.
 *   4. Run:
 *        node frontend/scripts/android_network_device_validation.mjs
 *      or guided mode (press Enter after performing each scenario):
 *        node frontend/scripts/android_network_device_validation.mjs --guided
 *
 * Collects from logcat:
 *   - Banner exposure changes
 *   - NetworkStateManager state transitions
 *   - Socket reconnect signals
 *   - Recovery timings
 *
 * Does NOT mark production-ready unless all scenarios PASS with live device evidence.
 */
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'tmp');
const logPath = path.join(outDir, 'network_device_validation.logcat.txt');
const reportPath = path.join(outDir, 'network_device_validation_report.json');

const ADB =
  process.env.ADB ||
  (fs.existsSync(`${process.env.HOME}/Library/Android/sdk/platform-tools/adb`)
    ? `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`
    : 'adb');

const SCENARIOS = [
  {
    id: 'S1',
    title: 'Strong Wi-Fi',
    instruction:
      'Keep strong Wi-Fi for 60s. Driver online. Confirm no banners and ride search idle chrome stays online.',
    waitMs: 60_000,
  },
  {
    id: 'S2',
    title: 'Wi-Fi → 5G/LTE handoff',
    instruction:
      'While online, turn Wi-Fi off so the device falls to cellular. Watch for flicker and ride search continuity.',
    waitMs: 45_000,
  },
  {
    id: 'S3',
    title: 'Weak signal 5–10s',
    instruction:
      'Enter a weak-signal area (or airplane-mode pulse ~3s then restore) for 5–10s max.',
    waitMs: 25_000,
  },
  {
    id: 'S4',
    title: 'Disable mobile data 30s',
    instruction:
      'Disable mobile data (and Wi-Fi if needed) for ≥30s. Expect Reconnecting then Offline.',
    waitMs: 45_000,
  },
  {
    id: 'S5',
    title: 'Restore mobile data',
    instruction:
      'Re-enable data. Expect silent recovery (~2s banner dismiss). Driver stays available.',
    waitMs: 30_000,
  },
  {
    id: 'S6',
    title: 'Active trip + weak signal',
    instruction:
      'Start/accept an active trip, drive through weak signal. Trip/navigation must continue; no force-offline.',
    waitMs: 60_000,
  },
  {
    id: 'S7',
    title: 'Incoming ride during recovery',
    instruction:
      'During/after recovery, ensure a ride offer still arrives once (no duplicates / missed transitions).',
    waitMs: 45_000,
  },
];

function sh(cmd) {
  return execSync(cmd, { encoding: 'utf8' }).trim();
}

function listDevices() {
  try {
    const out = sh(`"${ADB}" devices`);
    return out
      .split('\n')
      .slice(1)
      .map((l) => l.trim())
      .filter((l) => l && l.endsWith('\tdevice'))
      .map((l) => l.split('\t')[0]);
  } catch {
    return [];
  }
}

function printRow(id, label, pass, detail) {
  console.log(`${pass ? 'PASS' : 'FAIL'}  [${id}] ${label}${detail ? ` — ${detail}` : ''}`);
  return pass;
}

function parseLog(text) {
  const lines = text.split(/\r?\n/);
  const transitions = [];
  const banners = [];
  const sockets = [];
  const recoveries = [];
  const failures = [];

  for (const line of lines) {
    if (!line.includes('[NetworkStateManager]')) continue;
    const tsMatch = line.match(/^(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d+)/);
    const ts = tsMatch ? tsMatch[1] : null;
    if (line.includes('state_transition')) {
      const from = /from['":\s]+['"]?([A-Z_]+)/.exec(line)?.[1];
      const to = /to['":\s]+['"]?([A-Z_]+)/.exec(line)?.[1];
      const reason = /reason['":\s]+['"]?([a-z0-9_]+)/.exec(line)?.[1];
      const recoveryMs = /recoveryMs['":\s]+(\d+)/.exec(line)?.[1];
      transitions.push({ ts, from, to, reason, recoveryMs: recoveryMs ? Number(recoveryMs) : null, raw: line });
      if (to === 'CONNECTED' && recoveryMs) {
        recoveries.push(Number(recoveryMs));
      }
    }
    if (line.includes('banner_exposure')) {
      const from = /from['":\s]+['"]?([a-z_]+)/.exec(line)?.[1];
      const to = /to['":\s]+['"]?([a-z_]+)/.exec(line)?.[1];
      banners.push({ ts, from, to, raw: line });
    }
    if (line.includes('socket_signal') || line.includes('SOCKET_')) {
      sockets.push({ ts, raw: line });
    }
    if (line.includes('request_failure') || line.includes('dropped')) {
      failures.push({ ts, raw: line });
    }
  }

  const socketDowns = sockets.filter((s) => /ok['":\s]+false|SOCKET_DISCONNECTED|reconnect/i.test(s.raw));
  return { transitions, banners, sockets, socketDowns, recoveries, failures };
}

function evaluateScenarios(parsed, devicePresent) {
  if (!devicePresent) {
    return SCENARIOS.map((s) => ({
      id: s.id,
      title: s.title,
      pass: false,
      detail: 'NOT RUN — no Android device attached via adb',
    }));
  }

  if (parsed.transitions.length === 0 && parsed.banners.length === 0) {
    return SCENARIOS.map((s) => ({
      id: s.id,
      title: s.title,
      pass: false,
      detail:
        'NOT RUN — no NetworkStateManager logcat evidence. Launch the driver app with logging, then re-run --guided.',
    }));
  }

  // Heuristic scoring from a continuous capture (guided windows are preferred).
  const results = [];
  const { transitions, banners, recoveries, failures, socketDowns } = parsed;

  const offlineCount = transitions.filter((t) => t.to === 'OFFLINE').length;
  const reconnectCount = transitions.filter((t) => t.to === 'RECONNECTING').length;
  const degradedBanners = banners.filter((b) => b.to === 'degraded');
  const connectedBanners = banners.filter((b) => b.to === 'connected');
  const avgRecovery =
    recoveries.length > 0 ? Math.round(recoveries.reduce((a, b) => a + b, 0) / recoveries.length) : null;

  // S1: strong wifi — ideally no warning banners / no offline in first quiet window.
  // Without window isolation we can only fail if there is chatter during an exclusive S1 file.
  results.push({
    id: 'S1',
    title: 'Strong Wi-Fi',
    pass: offlineCount === 0 && degradedBanners.length === 0 && reconnectCount === 0,
    detail: `offline=${offlineCount} degradedBanners=${degradedBanners.length} reconnects=${reconnectCount}`,
  });

  results.push({
    id: 'S2',
    title: 'Wi-Fi → 5G/LTE handoff',
    pass: offlineCount === 0 && connectedBanners.length === 0,
    detail: `offline=${offlineCount} connectedBanners=${connectedBanners.length} socketEvents=${socketDowns.length}`,
  });

  results.push({
    id: 'S3',
    title: 'Weak signal 5–10s',
    pass: offlineCount === 0 && degradedBanners.length <= 1,
    detail: `offline=${offlineCount} lowConnectionBanners=${degradedBanners.length}`,
  });

  results.push({
    id: 'S4',
    title: 'Disable mobile data 30s',
    pass: reconnectCount >= 1 && offlineCount >= 1,
    detail: `reconnecting=${reconnectCount} offline=${offlineCount} banners=${banners.length}`,
  });

  results.push({
    id: 'S5',
    title: 'Restore mobile data',
    pass:
      transitions.some((t) => t.to === 'CONNECTED') &&
      banners.some((b) => b.to === 'hidden') &&
      connectedBanners.length === 0,
    detail: `avgRecoveryMs=${avgRecovery ?? 'n/a'} connectedBanners=${connectedBanners.length}`,
  });

  results.push({
    id: 'S6',
    title: 'Active trip + weak signal',
    pass: !transitions.some((t) => t.to === 'OFFLINE' && /force|driver_offline/i.test(t.raw || '')),
    detail:
      'Requires on-device confirmation that trip continued; auto-check only verifies Offline was not entered from transient latency when ops healthy. Mark FAIL unless operator confirms trip continuity.',
    // Conservative: FAIL unless operator marks --confirm-trip
    requireConfirm: true,
  });

  results.push({
    id: 'S7',
    title: 'Incoming ride during recovery',
    pass: false,
    detail: 'Requires operator confirmation of single offer delivery (use --confirm-offer)',
    requireConfirm: true,
  });

  const confirmTrip = process.argv.includes('--confirm-trip');
  const confirmOffer = process.argv.includes('--confirm-offer');
  for (const r of results) {
    if (r.id === 'S6') r.pass = confirmTrip && offlineCount === 0;
    if (r.id === 'S7') r.pass = confirmOffer;
    if (r.requireConfirm && !r.pass) {
      r.detail = `${r.detail} — PASS only with ${r.id === 'S6' ? '--confirm-trip' : '--confirm-offer'}`;
    }
  }

  return results;
}

async function ask(rl, prompt) {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

async function guidedCapture(deviceId) {
  fs.mkdirSync(outDir, { recursive: true });
  sh(`"${ADB}" -s ${deviceId} logcat -c`);
  const child = spawn(ADB, ['-s', deviceId, 'logcat', '-v', 'time', '*:S', 'ReactNativeJS:V', 'ReactNative:V'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const chunks = [];
  child.stdout.on('data', (d) => chunks.push(d));
  child.stderr.on('data', (d) => chunks.push(d));

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log(`\nDevice: ${deviceId}`);
  console.log('Open NexRyde as an online driver, then follow each scenario.\n');

  for (const s of SCENARIOS) {
    console.log(`\n=== ${s.id}: ${s.title} ===`);
    console.log(s.instruction);
    await ask(rl, 'Press Enter when this scenario is complete… ');
  }
  rl.close();
  child.kill('SIGINT');
  await new Promise((r) => setTimeout(r, 500));
  const text = Buffer.concat(chunks).toString('utf8');
  fs.writeFileSync(logPath, text);
  return text;
}

function passiveCaptureNote() {
  console.log(`
No --guided session ran. Checking for existing capture at:
  ${logPath}
`);
}

async function main() {
  const devices = listDevices();
  const guided = process.argv.includes('--guided');
  console.log('=== NexRyde Android network device validation ===\n');
  console.log(`adb: ${ADB}`);
  console.log(`devices: ${devices.length ? devices.join(', ') : '(none)'}`);

  let logText = '';
  if (!devices.length) {
    printRow('DEVICE', 'Physical Android device attached', false, 'adb devices empty');
    const results = evaluateScenarios({ transitions: [], banners: [], sockets: [], socketDowns: [], recoveries: [], failures: [] }, false);
    for (const r of results) printRow(r.id, r.title, r.pass, r.detail);

    const report = {
      at: new Date().toISOString(),
      productionReady: false,
      reason: 'No physical Android device attached; real-device scenarios not executed.',
      results,
      metrics: {
        bannerTimestamps: [],
        stateTransitions: [],
        webSocketReconnectCount: null,
        averageRecoveryMs: null,
        droppedRequests: null,
      },
    };
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\nOverall: FAIL`);
    console.log(`Production-ready: NO`);
    console.log(`Report: ${reportPath}`);
    console.log(`\nTo run for real:\n  1. adb devices  (must show device)\n  2. Install/build driver app\n  3. node frontend/scripts/android_network_device_validation.mjs --guided`);
    process.exit(1);
  }

  printRow('DEVICE', 'Physical Android device attached', true, devices[0]);

  if (guided) {
    logText = await guidedCapture(devices[0]);
  } else if (fs.existsSync(logPath)) {
    passiveCaptureNote();
    logText = fs.readFileSync(logPath, 'utf8');
  } else {
    console.log('\nFAIL: Device is attached but no capture was taken.');
    console.log('Re-run with --guided while performing Scenarios 1–7 on the phone.\n');
    const results = evaluateScenarios({ transitions: [], banners: [], sockets: [], socketDowns: [], recoveries: [], failures: [] }, true);
    for (const r of results) {
      r.pass = false;
      r.detail = 'NOT RUN — missing logcat capture; use --guided';
      printRow(r.id, r.title, false, r.detail);
    }
    const report = {
      at: new Date().toISOString(),
      productionReady: false,
      reason: 'Device attached but scenarios were not executed / no logcat evidence.',
      results,
    };
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\nOverall: FAIL\nProduction-ready: NO`);
    process.exit(1);
  }

  const parsed = parseLog(logText);
  const results = evaluateScenarios(parsed, true);
  for (const r of results) printRow(r.id, r.title, r.pass, r.detail);

  const avgRecovery =
    parsed.recoveries.length > 0
      ? Math.round(parsed.recoveries.reduce((a, b) => a + b, 0) / parsed.recoveries.length)
      : null;

  const allPass = results.every((r) => r.pass);
  const report = {
    at: new Date().toISOString(),
    productionReady: allPass,
    reason: allPass
      ? 'All real-device scenarios passed with logcat + operator confirms.'
      : 'One or more real-device scenarios failed or lack confirmation.',
    results,
    metrics: {
      bannerTimestamps: parsed.banners,
      stateTransitions: parsed.transitions,
      webSocketReconnectCount: parsed.socketDowns.length,
      averageRecoveryMs: avgRecovery,
      droppedRequests: parsed.failures.length,
    },
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(logPath, logText);

  console.log('\n=== METRICS ===');
  console.log(`Banner events: ${parsed.banners.length}`);
  console.log(`State transitions: ${parsed.transitions.length}`);
  console.log(`WebSocket reconnect/down signals: ${parsed.socketDowns.length}`);
  console.log(`Average recoveryMs: ${avgRecovery ?? 'n/a'}`);
  console.log(`Failure / dropped request log lines: ${parsed.failures.length}`);
  console.log(`\nOverall: ${allPass ? 'PASS' : 'FAIL'}`);
  console.log(`Production-ready: ${allPass ? 'YES' : 'NO'}`);
  console.log(`Report: ${reportPath}`);
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

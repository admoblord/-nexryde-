#!/usr/bin/env node
/**
 * Execute the hydrate decision (production module) and tap GO ONLINE as
 * loopy9ice@gmail.com against production.
 *
 * Run: node --experimental-strip-types frontend/scripts/test_loopy_go_online_live.mjs
 */
import { decideHydrateOnlineAction } from '../src/utils/driverHydrateOnlineDecision.ts';

const API = process.env.NEXRYDE_API_URL
  || 'https://nexryde-backend-993913300770.africa-south1.run.app';
const EMAIL = 'loopy9ice@gmail.com';
const LAT = 6.472012;
const LNG = 3.6165562;
const HOLD_MS = Number(process.env.LOOPY_ONLINE_HOLD_MS || 45000);
const HEARTBEAT_MS = 8000;

let failed = 0;
let passed = 0;

function pass(msg) {
  passed += 1;
  console.log(`  PASS  ${msg}`);
}
function fail(msg) {
  failed += 1;
  console.error(`  FAIL  ${msg}`);
}

function assertDecision(label, input, expectedAction, mustNotPut) {
  const d = decideHydrateOnlineAction(input);
  const put = d.putServerOffline === true;
  if (d.action !== expectedAction) {
    fail(`${label}: action=${d.action} reason=${d.reason} (expected ${expectedAction})`);
    return d;
  }
  if (mustNotPut && put) {
    fail(`${label}: hydrate would PUT is_online=false`);
    return d;
  }
  pass(`${label}: ${d.action}/${d.reason} putServerOffline=${put}`);
  return d;
}

async function jsonFetch(method, path, { token, body, query } = {}) {
  const url = new URL(path, API);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v != null) url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text.slice(0, 300) };
  }
  return { status: res.status, data };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

console.log('\n══ 1. Hydrate decision (loopy bounce cases) ══');

const androidOffline = {
  platform: 'android',
  toggleInFlight: false,
  commitInFlight: false,
  stale: false,
  desiredOffline: false,
  hasLiveTrip: false,
  resumeRecentShift: false,
};

assertDecision(
  'loopy remount after GO (server online, local offline, recent persist)',
  { ...androidOffline, serverOnline: true, localPhase: 'offline', resumeRecentShift: true },
  'restore_online',
  true,
);

assertDecision(
  'loopy cold login leftover server-online (no persist)',
  { ...androidOffline, serverOnline: true, localPhase: 'offline', resumeRecentShift: false },
  'keep_local_offline_leave_server',
  true,
);

assertDecision(
  'hydrate during GO commit (optimistic confirmed, server still false)',
  {
    ...androidOffline,
    serverOnline: false,
    localPhase: 'confirmed',
    commitInFlight: true,
  },
  'skip',
  true,
);

assertDecision(
  'stale profile is_online=false after PUT true',
  {
    ...androidOffline,
    serverOnline: false,
    localPhase: 'confirmed',
    stale: true,
  },
  'skip',
  true,
);

assertDecision(
  'user tapped GO OFFLINE while server still online',
  {
    ...androidOffline,
    serverOnline: true,
    localPhase: 'offline',
    desiredOffline: true,
  },
  'put_offline',
  false,
);

assertDecision(
  'connecting must not PUT',
  { ...androidOffline, serverOnline: true, localPhase: 'connecting' },
  'skip',
  true,
);

console.log('\n══ 2. Live tap GO ONLINE as loopy9ice ══');

let token = null;
let driverId = null;
let leftOffline = false;

async function leaveOffline(reason) {
  if (!token || !driverId || leftOffline) return;
  leftOffline = true;
  const off = await jsonFetch('PUT', `/api/drivers/${driverId}/online`, {
    token,
    query: {
      is_online: 'false',
      request_id: `qa_off_${Date.now()}`,
    },
  });
  console.log(`  leave-offline (${reason}): HTTP ${off.status} ${JSON.stringify(off.data)}`);
}

try {
  const auth = await jsonFetch('POST', '/api/auth/email-signin', {
    body: { email: EMAIL },
  });
  if (auth.status !== 200 || !auth.data?.token) {
    fail(`signin HTTP ${auth.status} ${JSON.stringify(auth.data).slice(0, 200)}`);
  } else {
    token = auth.data.token;
    driverId = auth.data.user?.id;
    pass(`signed in ${EMAIL} id=${driverId}`);
  }

  const tap = await jsonFetch('PUT', `/api/drivers/${driverId}/online`, {
    token,
    query: {
      is_online: 'true',
      lat: String(LAT),
      lng: String(LNG),
      request_id: `online_${Date.now()}_internaltap`,
    },
  });
  if (tap.status !== 200) {
    fail(`GO ONLINE PUT HTTP ${tap.status} ${JSON.stringify(tap.data)}`);
  } else {
    pass(`tapped GO ONLINE: ${JSON.stringify(tap.data)}`);
  }

  const afterTap = await jsonFetch('GET', `/api/drivers/${driverId}/profile`, { token });
  const onlineNow = Boolean(afterTap.data?.is_online);
  if (onlineNow) pass(`profile is_online=true last_heartbeat=${afterTap.data?.last_heartbeat}`);
  else fail(`profile still offline after tap: ${JSON.stringify({
    is_online: afterTap.data?.is_online,
    went_offline_reason: afterTap.data?.went_offline_reason,
  })}`);

  const remount = decideHydrateOnlineAction({
    ...androidOffline,
    serverOnline: onlineNow,
    localPhase: 'offline',
    resumeRecentShift: true,
  });
  if (remount.putServerOffline) {
    fail(`remount hydrate would PUT offline (${remount.action}/${remount.reason})`);
  } else {
    pass(`remount hydrate after tap: ${remount.action}/${remount.reason} (no server PUT)`);
  }

  const cold = decideHydrateOnlineAction({
    ...androidOffline,
    serverOnline: onlineNow,
    localPhase: 'offline',
    resumeRecentShift: false,
  });
  if (cold.putServerOffline) {
    fail(`cold-login hydrate would PUT offline (${cold.action}/${cold.reason})`);
  } else {
    pass(`cold-login hydrate after tap: ${cold.action}/${cold.reason} (no server PUT)`);
  }

  console.log(`\n══ 3. Hold online ${HOLD_MS / 1000}s with heartbeats (bounce was 36s) ══`);
  const started = Date.now();
  let beats = 0;
  let snapshots = 0;
  while (Date.now() - started < HOLD_MS) {
    const hb = await jsonFetch('POST', '/api/driver/heartbeat', {
      token,
      body: { lat: LAT, lng: LNG, network_quality: 'good' },
    });
    beats += 1;
    const action = hb.data?.action;
    const serverOnline = hb.data?.server_online;
    if (hb.status !== 200) {
      fail(`heartbeat HTTP ${hb.status} ${JSON.stringify(hb.data)}`);
    } else if (action === 'FORCE_OFFLINE' || serverOnline === false) {
      fail(`heartbeat ${beats} FORCE_OFFLINE server_online=${serverOnline}`);
    } else {
      pass(`heartbeat ${beats} server_online=${serverOnline} action=${action}`);
    }

    const prof = await jsonFetch('GET', `/api/drivers/${driverId}/profile`, { token });
    snapshots += 1;
    if (!prof.data?.is_online) {
      fail(`hydrate GET ${snapshots}: bounced offline reason=${prof.data?.went_offline_reason}`);
    } else {
      pass(`hydrate GET ${snapshots}: still online hb=${prof.data?.last_heartbeat}`);
    }

    const remaining = HOLD_MS - (Date.now() - started);
    if (remaining > 0) await sleep(Math.min(HEARTBEAT_MS, remaining));
  }

  const finalProf = await jsonFetch('GET', `/api/drivers/${driverId}/profile`, { token });
  if (finalProf.data?.is_online) {
    pass(`still online after ${HOLD_MS / 1000}s (${beats} heartbeats, ${snapshots} hydrates)`);
  } else {
    fail(`ended offline after hold went_offline_reason=${finalProf.data?.went_offline_reason}`);
  }
} catch (err) {
  fail(`probe exception: ${err instanceof Error ? err.message : String(err)}`);
} finally {
  await leaveOffline('end of internal tap');
}

console.log(`\n══ Result: ${passed} passed, ${failed} failed ══\n`);
process.exit(failed ? 1 : 0);

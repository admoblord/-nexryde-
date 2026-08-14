#!/usr/bin/env node
/**
 * Live check of the weak-network driver fixes against production.
 *
 * Signs in as the QA driver, exercises the refresh endpoint the way the new
 * rejected/unavailable classifier does, taps GO ONLINE, holds the shift, and
 * leaves the driver offline.
 *
 * Run: node frontend/scripts/test_driver_weak_network_live.mjs
 */
const API = process.env.NEXRYDE_API_URL
  || 'https://nexryde-backend-993913300770.africa-south1.run.app';
const EMAIL = process.env.LOOPY_EMAIL || 'loopy9ice@gmail.com';
const LAT = 6.472012;
const LNG = 3.6165562;
const HOLD_MS = Number(process.env.LOOPY_ONLINE_HOLD_MS || 45000);

let passed = 0;
let failed = 0;
const pass = (m) => { passed += 1; console.log(`  PASS  ${m}`); };
const fail = (m) => { failed += 1; console.error(`  FAIL  ${m}`); };

async function call(method, path, { token, body, query, timeoutMs = 20000 } = {}) {
  const url = new URL(path, API);
  if (query) for (const [k, v] of Object.entries(query)) if (v != null) url.searchParams.set(k, String(v));
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      signal: ctl.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body != null ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 200) }; }
    return { status: res.status, data, networkError: false };
  } catch (e) {
    return { status: null, data: null, networkError: true, error: String(e?.message || e) };
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Mirror of the new tokenStore classifier. */
function classifyRefresh(status, networkError) {
  if (networkError) return 'unavailable';
  if (status === 401 || status === 403) return 'rejected';
  if (status >= 200 && status < 300) return 'ok';
  return 'unavailable';
}

let token = null;
let refreshToken = null;
let driverId = null;
let leftOffline = false;

async function leaveOffline(why) {
  if (!token || !driverId || leftOffline) return;
  leftOffline = true;
  const off = await call('PUT', `/api/drivers/${driverId}/online`, {
    token,
    query: { is_online: 'false', request_id: `qa_off_${Date.now()}` },
  });
  console.log(`  leave-offline (${why}): HTTP ${off.status} ${JSON.stringify(off.data)}`);
}

try {
  console.log('\n[1] Sign in');
  const auth = await call('POST', '/api/auth/email-signin', { body: { email: EMAIL } });
  if (auth.status !== 200 || !auth.data?.token) {
    fail(`signin HTTP ${auth.status}`);
  } else {
    token = auth.data.token;
    refreshToken = auth.data.refresh_token;
    driverId = auth.data.user?.id;
    pass(`signed in ${EMAIL} id=${driverId} refresh=${refreshToken ? 'yes' : 'no'}`);
  }

  console.log('\n[2] Refresh classification (decides logout vs keep session)');

  const goodRefresh = await call('POST', '/api/auth/refresh-token', {
    body: { refresh_token: refreshToken },
  });
  const goodOutcome = classifyRefresh(goodRefresh.status, goodRefresh.networkError);
  if (goodOutcome === 'ok') pass(`valid refresh token → ok (HTTP ${goodRefresh.status})`);
  else fail(`valid refresh token → ${goodOutcome} (HTTP ${goodRefresh.status})`);

  const badRefresh = await call('POST', '/api/auth/refresh-token', {
    body: { refresh_token: 'definitely-not-a-real-refresh-token' },
  });
  const badOutcome = classifyRefresh(badRefresh.status, badRefresh.networkError);
  if (badOutcome === 'rejected') {
    pass(`revoked/garbage refresh token → rejected (HTTP ${badRefresh.status}) — logout is correct here`);
  } else {
    fail(`garbage refresh token → ${badOutcome} (HTTP ${badRefresh.status}); expected rejected`);
  }

  // Unreachable host stands in for "driver has no data".
  const deadHost = await (async () => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 4000);
    try {
      await fetch('https://10.255.255.1/auth/refresh-token', { method: 'POST', signal: ctl.signal });
      return { status: 0, networkError: false };
    } catch {
      return { status: null, networkError: true };
    } finally {
      clearTimeout(timer);
    }
  })();
  const deadOutcome = classifyRefresh(deadHost.status, deadHost.networkError);
  if (deadOutcome === 'unavailable') {
    pass('unreachable network → unavailable — session is kept, driver stays signed in');
  } else {
    fail(`unreachable network → ${deadOutcome}; expected unavailable`);
  }

  console.log('\n[3] Tap GO ONLINE');
  const tap = await call('PUT', `/api/drivers/${driverId}/online`, {
    token,
    query: {
      is_online: 'true',
      lat: String(LAT),
      lng: String(LNG),
      request_id: `online_${Date.now()}_weaknet`,
    },
  });
  if (tap.status === 200) pass(`GO ONLINE: ${JSON.stringify(tap.data)}`);
  else fail(`GO ONLINE HTTP ${tap.status} ${JSON.stringify(tap.data)}`);

  const prof = await call('GET', `/api/drivers/${driverId}/profile`, { token });
  if (prof.data?.is_online) pass('profile is_online=true');
  else fail(`profile is_online=${prof.data?.is_online} reason=${prof.data?.went_offline_reason}`);

  console.log('\n[4] Idempotent retry (what the new retry loop sends)');
  const rid = `online_${Date.now()}_retry`;
  const first = await call('PUT', `/api/drivers/${driverId}/online`, {
    token,
    query: { is_online: 'true', lat: String(LAT), lng: String(LNG), request_id: rid },
  });
  const replay = await call('PUT', `/api/drivers/${driverId}/online`, {
    token,
    query: { is_online: 'true', lat: String(LAT), lng: String(LNG), request_id: rid },
  });
  if (first.status === 200 && replay.status === 200) {
    pass(`duplicate request_id replays cleanly (${first.status}/${replay.status}) — retries are safe`);
  } else {
    fail(`retry replay ${first.status}/${replay.status}`);
  }

  console.log(`\n[5] Hold the shift ${HOLD_MS / 1000}s with heartbeats`);
  const started = Date.now();
  let beats = 0;
  while (Date.now() - started < HOLD_MS) {
    const hb = await call('POST', '/api/driver/heartbeat', {
      token,
      body: { lat: LAT, lng: LNG, network_quality: 'poor' },
    });
    beats += 1;
    if (hb.status !== 200) fail(`heartbeat ${beats} HTTP ${hb.status}`);
    else if (hb.data?.action === 'FORCE_OFFLINE' || hb.data?.server_online === false) {
      fail(`heartbeat ${beats} FORCE_OFFLINE server_online=${hb.data?.server_online}`);
    } else {
      pass(`heartbeat ${beats} server_online=${hb.data?.server_online}`);
    }
    const left = HOLD_MS - (Date.now() - started);
    if (left > 0) await sleep(Math.min(9000, left));
  }

  const finalProf = await call('GET', `/api/drivers/${driverId}/profile`, { token });
  if (finalProf.data?.is_online) pass(`still online after ${HOLD_MS / 1000}s (${beats} heartbeats)`);
  else fail(`bounced offline: ${finalProf.data?.went_offline_reason}`);

  console.log('\n[6] Session survived the whole run');
  const me = await call('GET', `/api/drivers/${driverId}/profile`, { token });
  if (me.status === 200) pass('original access token still accepted — never signed out');
  else fail(`token rejected at end: HTTP ${me.status}`);
} catch (e) {
  fail(`probe exception: ${e instanceof Error ? e.message : String(e)}`);
} finally {
  await leaveOffline('end of probe');
}

console.log(`\n═══ Result: ${passed} passed, ${failed} failed ═══\n`);
process.exit(failed ? 1 : 0);

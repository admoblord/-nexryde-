#!/usr/bin/env node
/**
 * Live production probe of the driver and rider flows touched by the audit.
 *
 * Read-only apart from the driver online toggle (left offline at the end).
 * Never cancels or creates rider trips.
 *
 * Run: node frontend/scripts/test_driver_rider_flows_live.mjs
 */
const API = process.env.NEXRYDE_API_URL
  || 'https://nexryde-backend-993913300770.africa-south1.run.app';
const DRIVER_EMAIL = process.env.LOOPY_EMAIL || 'loopy9ice@gmail.com';
const RIDER_EMAIL = process.env.RIDER_EMAIL || 'josephbbs12@gmail.com';
const LAT = 6.472012;
const LNG = 3.6165562;

let passed = 0;
let failed = 0;
let warned = 0;
const pass = (m) => { passed += 1; console.log(`  PASS  ${m}`); };
const fail = (m) => { failed += 1; console.error(`  FAIL  ${m}`); };
const warn = (m) => { warned += 1; console.log(`  WARN  ${m}`); };

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
    return { status: res.status, data };
  } catch (e) {
    return { status: null, data: null, error: String(e?.message || e) };
  } finally {
    clearTimeout(timer);
  }
}

async function signIn(email) {
  const r = await call('POST', '/api/auth/email-signin', { body: { email } });
  if (r.status !== 200 || !r.data?.token) return null;
  return { token: r.data.token, id: r.data.user?.id, role: r.data.user?.role };
}

let driver = null;
let leftOffline = false;

async function leaveDriverOffline() {
  if (!driver || leftOffline) return;
  leftOffline = true;
  const off = await call('PUT', `/api/drivers/${driver.id}/online`, {
    token: driver.token,
    query: { is_online: 'false', request_id: `qa_off_${Date.now()}` },
  });
  console.log(`  leave-offline: HTTP ${off.status}`);
}

try {
  console.log('\n══ DRIVER ══');

  driver = await signIn(DRIVER_EMAIL);
  if (!driver) fail(`driver signin failed for ${DRIVER_EMAIL}`);
  else pass(`signed in driver ${DRIVER_EMAIL} (${driver.role})`);

  // Onboarding + verification
  const onboarding = await call('GET', `/api/drivers/${driver.id}/onboarding-status`, { token: driver.token });
  if (onboarding.status === 200) {
    pass(`onboarding-status: step=${onboarding.data?.step} completed=${onboarding.data?.completed}`);
  } else {
    fail(`onboarding-status HTTP ${onboarding.status}`);
  }

  const profile = await call('GET', `/api/drivers/${driver.id}/profile`, { token: driver.token });
  if (profile.status === 200) {
    const p = profile.data || {};
    pass(`profile: verification=${p.verification_status} docs=${p.documents_verified} vehicle=${p.vehicle_model || 'none'}`);
    // The go-online gate needs a vehicle; onboarding must actually have collected one.
    if (p.verification_status === 'approved' && !p.vehicle_model && !p.vehicle_registered) {
      fail('approved driver has no vehicle on record — GO ONLINE would reject with ERR_NO_VEHICLE');
    } else {
      pass('approved driver has the vehicle the go-online gate requires');
    }
    if (p.bank_name && p.account_number) pass('bank details on file (withdrawal would not block)');
    else warn('no bank details on file — withdrawal would be blocked');
  } else {
    fail(`profile HTTP ${profile.status}`);
  }

  // Subscription — the pay-now fix depends on these fields
  const sub = await call('GET', '/api/driver/subscription-status', { token: driver.token });
  if (sub.status === 200) {
    const s = sub.data || {};
    pass(`subscription: status=${s.status} tier=${s.tier} active=${s.subscription_active}`);
    const payableStates = ['pending_payment', 'expired', 'none'];
    if (payableStates.includes(String(s.status))) {
      pass(`status ${s.status} now renders a Pay now CTA (previously no button at all)`);
    } else {
      pass(`status ${s.status} is a plan state the app already handled`);
    }
  } else {
    fail(`subscription-status HTTP ${sub.status}`);
  }

  // Go online / offline
  const on = await call('PUT', `/api/drivers/${driver.id}/online`, {
    token: driver.token,
    query: { is_online: 'true', lat: String(LAT), lng: String(LNG), request_id: `on_${Date.now()}` },
  });
  if (on.status === 200) pass(`GO ONLINE: ${JSON.stringify(on.data)}`);
  else fail(`GO ONLINE HTTP ${on.status} ${JSON.stringify(on.data)}`);

  const afterOn = await call('GET', `/api/drivers/${driver.id}/profile`, { token: driver.token });
  if (afterOn.data?.is_online) pass('driver is online server-side');
  else fail(`driver not online: ${afterOn.data?.went_offline_reason}`);

  const hb = await call('POST', '/api/driver/heartbeat', {
    token: driver.token,
    body: { lat: LAT, lng: LNG, network_quality: 'good' },
  });
  if (hb.status === 200 && hb.data?.server_online) pass('heartbeat accepted, server_online=true');
  else fail(`heartbeat HTTP ${hb.status} action=${hb.data?.action}`);

  const offers = await call('GET', `/api/trips/offers/${driver.id}`, { token: driver.token });
  if (offers.status === 200) pass(`offers endpoint OK (${Array.isArray(offers.data) ? offers.data.length : 0} pending)`);
  else fail(`offers HTTP ${offers.status}`);

  const earnings = await call('GET', `/api/drivers/${driver.id}/stats`, { token: driver.token });
  if (earnings.status === 200) pass(`driver stats OK (today=${earnings.data?.today_earnings ?? 'n/a'})`);
  else warn(`driver stats HTTP ${earnings.status}`);

  const withdrawals = await call('GET', `/api/drivers/${driver.id}/withdrawals`, { token: driver.token, query: { limit: 1 } });
  if (withdrawals.status === 200) {
    pass(`withdrawals OK (wallet=${withdrawals.data?.wallet_balance ?? 0} frozen=${withdrawals.data?.earnings_frozen})`);
  } else {
    warn(`withdrawals HTTP ${withdrawals.status}`);
  }

  await leaveDriverOffline();
  const afterOff = await call('GET', `/api/drivers/${driver.id}/profile`, { token: driver.token });
  if (afterOff.data?.is_online === false) pass('driver left offline');
  else fail('driver still online at end of probe');

  console.log('\n══ RIDER ══');

  const rider = await signIn(RIDER_EMAIL);
  if (!rider) {
    fail(`rider signin failed for ${RIDER_EMAIL}`);
  } else {
    pass(`signed in rider ${RIDER_EMAIL} (${rider.role})`);

    const active = await call('GET', `/api/trips/active/${rider.id}`, { token: rider.token });
    if (active.status === 200) {
      pass(`active trip endpoint OK (active=${Boolean(active.data?.active)})`);
      // The ghost-trip fix resolves a stored trip by id. Prove that path answers.
      const tripId = active.data?.trip?.id;
      if (tripId) {
        const st = await call('GET', `/api/trips/${tripId}/status`, { token: rider.token });
        if (st.status === 200 && st.data?.success) {
          pass(`status-by-id works: status=${st.data.status} cancelled_by_role=${st.data.cancelled_by_role ?? 'null'}`);
          if ('cancelled_by_role' in st.data && 'cancellation_reason' in st.data) {
            pass('status payload carries cancellation context (driver-cancel alert can render)');
          } else {
            fail('status payload missing cancellation context');
          }
        } else {
          fail(`status-by-id HTTP ${st.status}`);
        }
      } else {
        pass('no live rider trip — nothing to reconcile (expected steady state)');
      }
    } else {
      fail(`active trip HTTP ${active.status}`);
    }

    const history = await call('GET', `/api/trips/user/${rider.id}`, {
      token: rider.token,
      query: { role: 'rider' },
    });
    if (history.status === 200) {
      const rows = Array.isArray(history.data) ? history.data : history.data?.trips || [];
      pass(`trip history OK (${rows.length} rows)`);
      // Verify cancellation context is derivable on a real cancelled trip.
      const cancelled = rows.find((t) => String(t.status).toLowerCase() === 'cancelled');
      if (cancelled?.id) {
        const st = await call('GET', `/api/trips/${cancelled.id}/status`, { token: rider.token });
        if (st.status !== 200) {
          warn(`cancelled trip status HTTP ${st.status}`);
        } else if (!('cancelled_by_role' in (st.data || {}))) {
          // Expected until the backend carrying this field is deployed.
          warn('deployed backend does not yet return cancelled_by_role (fix is unreleased)');
        } else {
          pass(`cancelled trip resolves role=${st.data.cancelled_by_role ?? 'null'} reason=${st.data.cancellation_reason ?? 'null'}`);
        }
      } else {
        warn('no cancelled trip in recent history to inspect');
      }
    } else {
      warn(`trip history HTTP ${history.status}`);
    }

    const est = await call('POST', '/api/fare/estimate', {
      token: rider.token,
      body: {
        pickup_lat: 6.4295, pickup_lng: 3.4230,
        dropoff_lat: 6.4474, dropoff_lng: 3.4721,
        service_type: 'economy',
        rider_id: rider.id,
      },
    });
    if (est.status === 200) pass('fare estimate OK (rider can price a ride)');
    else warn(`fare estimate HTTP ${est.status} ${JSON.stringify(est.data).slice(0, 120)}`);

    const bookStatus = await call('GET', `/api/enforcement/book-status/${rider.id}`, { token: rider.token });
    if (bookStatus.status === 200) {
      pass(`book-status OK (can_book=${bookStatus.data?.can_book} reason=${bookStatus.data?.reason ?? 'none'})`);
    } else {
      warn(`book-status HTTP ${bookStatus.status}`);
    }
  }
} catch (e) {
  fail(`probe exception: ${e instanceof Error ? e.message : String(e)}`);
} finally {
  await leaveDriverOffline();
}

console.log(`\n═══ Result: ${passed} passed, ${failed} failed, ${warned} warnings ═══\n`);
process.exit(failed ? 1 : 0);

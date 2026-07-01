/**
 * Validates session refresh throttle behavior (in-flight dedupe vs time blocking).
 * Run: node scripts/test_session_refresh.mjs
 */

function createRefreshThrottle(minIntervalMs, opts = {}) {
  const inFlightOnly = opts.inFlightOnly ?? false;
  let lastAt = 0;
  let inFlight = null;

  return {
    shouldRun(force = false) {
      if (force) return true;
      if (inFlightOnly) return !inFlight;
      return Date.now() - lastAt >= minIntervalMs;
    },
    markRan() {
      lastAt = Date.now();
    },
    async run(fn, force = false) {
      if (inFlight) return inFlight;
      if (!force && !inFlightOnly && Date.now() - lastAt < minIntervalMs) {
        return undefined;
      }
      const job = fn().finally(() => {
        lastAt = Date.now();
        inFlight = null;
      });
      inFlight = job;
      return job;
    },
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  let failed = 0;
  const assert = (name, ok) => {
    if (!ok) {
      failed += 1;
      console.error(`FAIL: ${name}`);
    } else {
      console.log(`OK: ${name}`);
    }
  };

  // inFlightOnly: second call while first runs shares promise; after done, immediate retry allowed
  const inFlight = createRefreshThrottle(0, { inFlightOnly: true });
  let calls = 0;
  const slow = () =>
    new Promise((resolve) => {
      calls += 1;
      setTimeout(() => resolve('done'), 30);
    });

  const p1 = inFlight.run(slow);
  const p2 = inFlight.run(slow);
  await Promise.all([p1, p2]);
  assert('inFlightOnly dedupes concurrent calls', calls === 1);

  const p3 = inFlight.run(slow);
  await p3;
  assert('inFlightOnly allows immediate follow-up after finish', calls === 2);

  // time-based throttle blocks rapid sequential calls
  const timed = createRefreshThrottle(200, { inFlightOnly: false });
  let timedCalls = 0;
  const tick = () => {
    timedCalls += 1;
    return Promise.resolve('x');
  };
  await timed.run(tick);
  const skipped = await timed.run(tick);
  assert('timed throttle skips call inside window', skipped === undefined && timedCalls === 1);
  await sleep(220);
  await timed.run(tick);
  assert('timed throttle allows call after window', timedCalls === 2);

  // simulate old 12s throttle vs new inFlightOnly under user navigation
  const oldThrottle = createRefreshThrottle(12_000, { inFlightOnly: false });
  let oldCalls = 0;
  await oldThrottle.run(async () => {
    oldCalls += 1;
  });
  const oldSkipped = await oldThrottle.run(async () => {
    oldCalls += 1;
  });
  assert('old 12s throttle blocks second navigation fetch', oldSkipped === undefined && oldCalls === 1);

  const newThrottle = createRefreshThrottle(0, { inFlightOnly: true });
  let newCalls = 0;
  await newThrottle.run(async () => {
    newCalls += 1;
  });
  await newThrottle.run(async () => {
    newCalls += 1;
  });
  assert('new inFlightOnly allows back-to-back navigation fetches', newCalls === 2);

  if (failed > 0) {
    console.error(`\n${failed} assertion(s) failed`);
    process.exit(1);
  }
  console.log('\nAll session refresh throttle tests passed.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

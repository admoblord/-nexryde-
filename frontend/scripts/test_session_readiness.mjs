/**
 * Session readiness rules for driver critical paths.
 * Run: node scripts/test_session_readiness.mjs
 */

const CRITICAL_ACTION_MIN_TTL_SEC = 300;

function jwtExpSec(token) {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const padded = part.replace(/-/g, '+').replace(/_/g, '/');
    const padLen = (4 - (padded.length % 4)) % 4;
    const json = Buffer.from(padded + '='.repeat(padLen), 'base64').toString('utf8');
    const payload = JSON.parse(json);
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

function getAccessTokenTtlSec(token) {
  const exp = jwtExpSec(token);
  if (!exp) return null;
  return Math.max(0, exp - Math.floor(Date.now() / 1000));
}

function shouldProactivelyRefresh(ttlSec) {
  return ttlSec == null || ttlSec < CRITICAL_ACTION_MIN_TTL_SEC;
}

function buildFakeJwt(expSec) {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ exp: expSec, sub: 'test' })).toString('base64url');
  return `${header}.${payload}.sig`;
}

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

  const freshExp = Math.floor(Date.now() / 1000) + 900;
  const freshTtl = getAccessTokenTtlSec(buildFakeJwt(freshExp));
  assert('fresh token TTL ~900s', freshTtl != null && freshTtl > 850 && freshTtl <= 900);
  assert('fresh token skips proactive refresh', !shouldProactivelyRefresh(freshTtl));

  const staleExp = Math.floor(Date.now() / 1000) + 120;
  const staleTtl = getAccessTokenTtlSec(buildFakeJwt(staleExp));
  assert('stale token TTL ~120s', staleTtl != null && staleTtl > 100 && staleTtl <= 120);
  assert('stale token triggers proactive refresh', shouldProactivelyRefresh(staleTtl));

  const expiredExp = Math.floor(Date.now() / 1000) - 10;
  const expiredTtl = getAccessTokenTtlSec(buildFakeJwt(expiredExp));
  assert('expired token TTL is 0', expiredTtl === 0);
  assert('expired token triggers proactive refresh', shouldProactivelyRefresh(expiredTtl));

  if (failed > 0) {
    console.error(`\n${failed} assertion(s) failed`);
    process.exit(1);
  }
  console.log('\nAll session readiness tests passed.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

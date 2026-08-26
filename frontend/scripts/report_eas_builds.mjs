/**
 * Print recent Android builds with their artifact URLs.
 *
 * The Expo dashboard requires a login, and internal-distribution build pages
 * are not readable anonymously, so a finished build's install link is invisible
 * to anyone without an Expo account — including an agent trying to confirm what
 * shipped. This runs where the token already is, in CI, and prints the same
 * facts as the dashboard.
 *
 * Never fails the build: reporting is not a gate.
 *
 * Run: node ./scripts/report_eas_builds.mjs [--limit 6]
 */
import { spawnSync } from 'node:child_process';

const limitArg = process.argv.indexOf('--limit');
const limit = limitArg > -1 ? String(Number(process.argv[limitArg + 1]) || 6) : '6';

function readBuilds() {
  const res = spawnSync(
    'eas',
    ['build:list', '--platform', 'android', '--limit', limit, '--non-interactive', '--json'],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  );
  if (res.error) return { error: `eas build:list did not run: ${res.error.message}` };
  const text = String(res.stdout || '').trim();
  // eas prints progress lines before the JSON payload on some versions.
  const start = text.indexOf('[');
  if (start === -1) {
    return { error: `no JSON in output${res.stderr ? `: ${String(res.stderr).trim().slice(0, 200)}` : ''}` };
  }
  try {
    return { builds: JSON.parse(text.slice(start)) };
  } catch (err) {
    return { error: `could not parse build list: ${err.message}` };
  }
}

const pad = (v, n) => String(v ?? '?').padEnd(n);

const { builds, error } = readBuilds();
if (error || !Array.isArray(builds)) {
  console.log(`(build list unavailable — ${error || 'unexpected shape'})`);
  process.exit(0);
}

if (!builds.length) {
  console.log('(no Android builds found)');
  process.exit(0);
}

console.log('status       profile       version        commit    artifact');
for (const b of builds) {
  const version = `v${b.appVersion ?? '?'}(${b.appBuildVersion ?? '?'})`;
  const artifact =
    b.artifacts?.applicationArchiveUrl ||
    b.artifacts?.buildUrl ||
    `https://expo.dev/accounts/josephbbs1/projects/nexryde/builds/${b.id}`;
  console.log(
    `${pad(b.status, 12)} ${pad(b.buildProfile, 13)} ${pad(version, 14)} ` +
      `${pad(String(b.gitCommitHash || '').slice(0, 8), 9)} ${artifact}`,
  );
}

/**
 * The app must not name its hosting provider anywhere but one config file.
 *
 * Moving off Cloud Run meant finding the URL in app.json, app.config.js,
 * eas.json, api.ts, a terms screen and — worst of all — the security allowlist,
 * which silently refused every host that was not Cloud Run. That is a migration
 * tax nobody should pay twice.
 *
 * Rules:
 *   1. Only backend.config.json may contain a provider hostname.
 *   2. The security allowlist must be derived from config, not hardcoded.
 *   3. backend.config.json must hold a usable https origin.
 *
 * Run: node ./scripts/verify_backend_origin.cjs --require-success
 */
const fs = require('fs');
const path = require('path');

const requireSuccess = process.argv.includes('--require-success');
const root = path.resolve(__dirname, '..');
const failures = [];

function fail(msg) {
  failures.push(msg);
}

// Hostnames that mean "a specific hosting provider". Add to this list rather
// than exempting files.
const PROVIDER_PATTERNS = [
  { re: /[a-z0-9-]+\.run\.app/gi, name: 'Cloud Run' },
  { re: /[a-z0-9-]+\.emergentagent\.com/gi, name: 'Emergent' },
  { re: /[a-z0-9-]+\.herokuapp\.com/gi, name: 'Heroku' },
  { re: /[a-z0-9-]+\.fly\.dev/gi, name: 'Fly' },
  { re: /[a-z0-9-]+\.onrender\.com/gi, name: 'Render' },
  { re: /[a-z0-9-]+\.railway\.app/gi, name: 'Railway' },
];

const CONFIG_FILE = 'backend.config.json';

// Shipped app code and build config. Dev/verification scripts are allowed to
// name a host because they are not part of the app.
const SCANNED = [
  { dir: 'src', exts: ['.ts', '.tsx'] },
  { dir: 'app', exts: ['.ts', '.tsx'] },
];
const SCANNED_FILES = ['app.config.js', 'app.json', 'eas.json'];

function walk(dir, exts, out = []) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return out;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      walk(rel, exts, out);
    } else if (exts.some((e) => entry.name.endsWith(e))) {
      out.push(rel);
    }
  }
  return out;
}

const files = [
  ...SCANNED.flatMap(({ dir, exts }) => walk(dir, exts)),
  ...SCANNED_FILES.filter((f) => fs.existsSync(path.join(root, f))),
];

for (const rel of files) {
  const text = fs.readFileSync(path.join(root, rel), 'utf8');
  for (const { re, name } of PROVIDER_PATTERNS) {
    const hits = text.match(re);
    if (!hits) continue;
    // A comment explaining the rule is fine; a URL is not.
    const real = hits.filter((h) => !/example|placeholder/i.test(h));
    if (real.length) {
      fail(
        `${rel} names a ${name} host (${real[0]}) — put it in ${CONFIG_FILE} `
          + 'or read it from src/config/backendOrigin.ts',
      );
    }
  }
}

// The allowlist is the trap that made the last move painful.
const securityPath = path.join(root, 'src/services/securityConfig.ts');
if (fs.existsSync(securityPath)) {
  const security = fs.readFileSync(securityPath, 'utf8');
  if (!security.includes('allowedApiHosts()')) {
    fail('securityConfig.ts must build its allowlist from allowedApiHosts(), not a literal set');
  }
  if (/ALLOWED_BACKEND_HOSTS\s*=\s*new Set\(\[[^\]]*['"][a-z0-9.-]+\.[a-z]{2,}/is.test(security)) {
    fail('securityConfig.ts still carries a hardcoded host allowlist');
  }
}

const configPath = path.join(root, CONFIG_FILE);
if (!fs.existsSync(configPath)) {
  fail(`missing ${CONFIG_FILE} — the app has nowhere to read its origin from`);
} else {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (err) {
    fail(`${CONFIG_FILE} is not valid JSON: ${err.message}`);
  }
  if (parsed) {
    const origin = String(parsed.origin || '').trim();
    if (!origin) fail(`${CONFIG_FILE} has no "origin"`);
    else if (!/^https:\/\/[^/\s]+$/.test(origin)) {
      fail(`${CONFIG_FILE} "origin" must be a bare https origin, got ${origin}`);
    }
    if (!Array.isArray(parsed.extraApiHosts)) {
      fail(`${CONFIG_FILE} "extraApiHosts" must be an array`);
    }
  }
}

if (failures.length) {
  for (const f of failures) console.error(`[verify_backend_origin] FAIL: ${f}`);
  process.exit(requireSuccess ? 1 : 0);
}

console.log(
  '[verify_backend_origin] OK — the API host lives only in backend.config.json, '
    + 'and the allowlist follows it',
);

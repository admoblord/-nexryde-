/**
 * Prove the API host allowlist follows configuration instead of a provider.
 *
 * The old allowlist accepted only `*.run.app` hosts beginning with
 * `nexryde-backend`. Pointing the app anywhere else made every axios call fail
 * with "Security: Invalid API endpoint" — the kind of blocker that looks like a
 * network fault and lives in a security helper. This exercises the real module.
 *
 * Run: node --experimental-strip-types --no-warnings ./scripts/validate_api_host_allowlist.mjs
 */
import path from 'node:path';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

const FRONTEND = path.resolve(import.meta.dirname, '..');

globalThis.__DEV__ = false;

const CONFIGURED = 'https://api.nexryde.example';

// expo-constants stands in for what app.config.js injects at build time.
const stubs = {
  'react-native': `export const Platform = { OS: 'android', select: (o) => o.android ?? o.default };`,
  'expo-constants': `export default {
    nativeAppVersion: '1.0.0',
    nativeBuildVersion: '1',
    expoConfig: {
      extra: {
        BACKEND_URL: ${JSON.stringify(CONFIGURED)},
        extraApiHosts: ['cdn.nexryde.example'],
      },
    },
  };`,
};

const hooks = `
const stubs = ${JSON.stringify(stubs)};
const root = ${JSON.stringify(pathToFileURL(FRONTEND).href)};
export async function resolve(specifier, context, next) {
  if (Object.hasOwn(stubs, specifier)) {
    return { url: 'stub:' + encodeURIComponent(specifier), shortCircuit: true };
  }
  if (specifier.startsWith('@/')) {
    const rel = specifier.slice(2);
    const ext = rel.endsWith('.json') ? '' : '.ts';
    return { url: root + '/' + rel + ext, shortCircuit: true };
  }
  return next(specifier, context);
}
export async function load(url, context, next) {
  if (url.startsWith('stub:')) {
    return { format: 'module', shortCircuit: true, source: stubs[decodeURIComponent(url.slice(5))] };
  }
  return next(url, context);
}
`;
register(`data:text/javascript,${encodeURIComponent(hooks)}`);

const { validateApiUrl } = await import(
  pathToFileURL(path.join(FRONTEND, 'src', 'services', 'securityConfig.ts')).href
);
const { resolveBackendOrigin, allowedApiHosts } = await import(
  pathToFileURL(path.join(FRONTEND, 'src', 'config', 'backendOrigin.ts')).href
);

let failed = 0;
function check(label, pass, detail) {
  console.log(`${pass ? 'PASS' : 'FAIL'}  [${label}]${detail ? ` — ${detail}` : ''}`);
  if (!pass) failed += 1;
}

check(
  'origin-comes-from-config',
  resolveBackendOrigin() === CONFIGURED,
  resolveBackendOrigin(),
);

check(
  'configured-host-is-allowed',
  validateApiUrl(`${CONFIGURED}/api/places/autocomplete?input=sangotedo`),
  'a host that is not Cloud Run must be accepted when it is the configured one',
);

check(
  'unrelated-host-is-refused',
  validateApiUrl('https://evil.example/api/trips/request') === false,
  'redirection to an unrelated host must still be refused',
);

check(
  'http-is-refused',
  validateApiUrl('http://api.nexryde.example/api/health') === false,
  'plaintext must be refused in production',
);

check(
  'no-provider-is-hardcoded',
  ![...allowedApiHosts()].some((h) => h.endsWith('.run.app')),
  `allowlist=${[...allowedApiHosts()].join(', ')}`,
);

check(
  'extra-hosts-are-honoured',
  validateApiUrl('https://cdn.nexryde.example/media/doc.webp'),
  'a CDN listed in extraApiHosts must be reachable',
);

if (failed) {
  console.error(`\n${failed} api-host check(s) failed`);
  process.exit(1);
}
console.log('\nAll api-host allowlist checks passed');

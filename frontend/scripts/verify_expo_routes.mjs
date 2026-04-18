#!/usr/bin/env node
/**
 * Static check: hub + safety screens only reference routes that exist as files under app/.
 * Run: node scripts/verify_expo_routes.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'app');

function existsRoute(routeHref) {
  const clean = String(routeHref).replace(/^\//, '').split('?')[0];
  if (!clean) return false;
  const base = path.join(APP, clean);
  const candidates = [
    `${base}.tsx`,
    `${base}.ts`,
    path.join(base, 'index.tsx'),
    path.join(base, 'index.ts'),
  ];
  return candidates.some((f) => fs.existsSync(f));
}

const scanFiles = [
  path.join(ROOT, 'src', 'components', 'FeatureHubDrawer.tsx'),
  path.join(ROOT, 'app', '(driver-tabs)', 'driver-safety.tsx'),
  path.join(ROOT, 'app', '(rider-tabs)', 'rider-safety.tsx'),
];

const routeRegex = /route:\s*['"]([^'"]+)['"]/g;
const routes = new Set();
for (const file of scanFiles) {
  if (!fs.existsSync(file)) {
    console.error('Missing scan file:', file);
    process.exit(1);
  }
  const txt = fs.readFileSync(file, 'utf8');
  let m;
  while ((m = routeRegex.exec(txt)) !== null) {
    routes.add(m[1]);
  }
}

const missing = [...routes].filter((r) => !existsRoute(r));
if (missing.length) {
  console.error('verify_expo_routes: these hrefs have no matching app file:\n', missing.join('\n'));
  process.exit(1);
}

console.log(`verify_expo_routes: OK — ${routes.size} unique route: strings in hub + safety screens.`);

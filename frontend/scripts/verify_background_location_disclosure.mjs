#!/usr/bin/env node
/**
 * Guardrail: Google Play BACKGROUND_LOCATION prominent disclosure must wrap
 * every requestBackgroundPermissionsAsync call site.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function mustInclude(rel, needles, label) {
  const text = read(rel);
  for (const n of needles) {
    if (!text.includes(n)) {
      console.error(`FAIL ${label}: ${rel} missing ${JSON.stringify(n)}`);
      process.exitCode = 1;
      return;
    }
  }
  console.log(`OK  ${label}: ${rel}`);
}

// 1. Disclosure copy + consent API exists
mustInclude(
  'src/services/backgroundLocationDisclosure.ts',
  [
    'even when the app is closed or not in use',
    'promptBackgroundLocationDisclosure',
    'Continue',
  ],
  'disclosure service',
);

// 2. Host mounted in root layout
mustInclude(
  'app/_layout.tsx',
  ['BackgroundLocationDisclosureHost'],
  'root host',
);

// 3. Preflight + BG task both prompt before OS request
mustInclude(
  'src/services/driverPermissionPreflight.ts',
  ['promptBackgroundLocationDisclosure', 'requestBackgroundPermissionsAsync'],
  'preflight',
);
mustInclude(
  'src/tasks/backgroundLocationTask.ts',
  ['promptBackgroundLocationDisclosure', 'requestBackgroundPermissionsAsync'],
  'bg task',
);

// 4. No other call sites that request BG location without the disclosure import nearby
const walk = (dir, out = []) => {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === '.git') continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|jsx)$/.test(ent.name)) out.push(p);
  }
  return out;
};

const offenders = [];
for (const file of walk(root)) {
  const text = fs.readFileSync(file, 'utf8');
  if (!text.includes('requestBackgroundPermissionsAsync')) continue;
  const rel = path.relative(root, file);
  if (
    rel.includes('backgroundLocationDisclosure') ||
    rel.includes('verify_background_location_disclosure')
  ) {
    continue;
  }
  if (!text.includes('promptBackgroundLocationDisclosure')) {
    offenders.push(rel);
  }
}

if (offenders.length) {
  console.error('FAIL bare requestBackgroundPermissionsAsync without disclosure:', offenders);
  process.exitCode = 1;
} else {
  console.log('OK  all requestBackgroundPermissionsAsync sites gated');
}

if (process.exitCode) {
  process.exit(process.exitCode);
}
console.log('Background location disclosure checks passed.');

#!/usr/bin/env node
/**
 * Guardrail: Google Play BACKGROUND_LOCATION prominent disclosure.
 *
 * Rules:
 * 1. Disclosure copy + Continue consent API exist
 * 2. Host mounted in root layout
 * 3. The ONLY file allowed to call requestBackgroundPermissionsAsync is
 *    backgroundLocationDisclosure.ts (single choke-point)
 * 4. Preflight + BG task use requestBackgroundLocationWithDisclosure
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

mustInclude(
  'src/services/backgroundLocationDisclosure.ts',
  [
    'even when the app is closed or not in use',
    'requestBackgroundLocationWithDisclosure',
    'promptBackgroundLocationDisclosure',
    'requestBackgroundPermissionsAsync',
    'Continue',
  ],
  'disclosure choke-point',
);

mustInclude(
  'app/_layout.tsx',
  ['BackgroundLocationDisclosureHost'],
  'root host',
);

mustInclude(
  'src/services/driverPermissionPreflight.ts',
  ['requestBackgroundLocationWithDisclosure'],
  'preflight',
);

mustInclude(
  'src/tasks/backgroundLocationTask.ts',
  ['requestBackgroundLocationWithDisclosure'],
  'bg task',
);

mustInclude(
  'src/components/driver/BackgroundLocationDisclosureHost.tsx',
  ['testID="bg-location-disclosure"', 'BG_LOCATION_DISCLOSURE'],
  'host UI',
);

const walk = (dir, out = []) => {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === '.git' || ent.name === 'android' || ent.name === 'ios') {
      continue;
    }
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|jsx)$/.test(ent.name)) out.push(p);
  }
  return out;
};

const chokePoint = path.normalize('src/services/backgroundLocationDisclosure.ts');
const offenders = [];
for (const file of walk(root)) {
  const text = fs.readFileSync(file, 'utf8');
  if (!text.includes('requestBackgroundPermissionsAsync')) continue;
  const rel = path.relative(root, file);
  if (path.normalize(rel) === chokePoint) continue;
  if (rel.includes('verify_background_location_disclosure')) continue;
  offenders.push(rel);
}

if (offenders.length) {
  console.error(
    'FAIL requestBackgroundPermissionsAsync outside choke-point:',
    offenders,
  );
  process.exitCode = 1;
} else {
  console.log('OK  only backgroundLocationDisclosure.ts calls requestBackgroundPermissionsAsync');
}

// Native Android must not request BACKGROUND_LOCATION itself (JS owns the flow).
const androidRoot = path.join(root, 'android');
if (fs.existsSync(androidRoot)) {
  const nativeOffenders = [];
  const walkNative = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walkNative(p);
      else if (/\.(kt|java)$/.test(ent.name)) {
        const text = fs.readFileSync(p, 'utf8');
        if (
          text.includes('ACCESS_BACKGROUND_LOCATION') &&
          (text.includes('requestPermissions') || text.includes('ActivityCompat.request'))
        ) {
          nativeOffenders.push(path.relative(root, p));
        }
      }
    }
  };
  walkNative(androidRoot);
  if (nativeOffenders.length) {
    console.error('FAIL native BACKGROUND_LOCATION request:', nativeOffenders);
    process.exitCode = 1;
  } else {
    console.log('OK  no native Android BACKGROUND_LOCATION permission requests');
  }
}

if (process.exitCode) process.exit(process.exitCode);
console.log('Background location disclosure checks passed.');

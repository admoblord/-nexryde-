#!/usr/bin/env node
/**
 * Regression guard: release AAB must not ship with R8 enabled but missing keep rules.
 * This exact failure caused build 167+ to crash ~2s after splash (process death).
 *
 * Run: node ./scripts/verify_android_release_startup.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const failures = [];
const passes = [];

function pass(msg) {
  passes.push(msg);
  console.log(`  ✓ ${msg}`);
}

function fail(msg) {
  failures.push(msg);
  console.error(`  ✗ ${msg}`);
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

const REQUIRED_PROGUARD_KEEPS = [
  'com.facebook.react.**',
  'com.facebook.hermes.**',
  'expo.modules.**',
  'com.nexryde.app.**',
  'com.reactnativeandroidwidget.**',
  'com.rnmaps.maps.**',
  // Driver offline MapView uses Navigation SDK maps (play-services-maps excluded).
  'com.google.android.libraries.navigation.**',
  'com.google.android.react.navsdk.**',
  'io.sentry.**',
  'expo.modules.taskManager.**',
];

console.log('\n═══ Android release startup safety ═══\n');

// [1] R8 enabled → proguard rules must be complete
console.log('[1] R8 / ProGuard rules');
const gradleProps = read('android/gradle.properties');
const minifyOn = /android\.enableMinifyInReleaseBuilds\s*=\s*true/.test(gradleProps);
const shrinkOn = /android\.enableShrinkResourcesInReleaseBuilds\s*=\s*true/.test(gradleProps);

if (minifyOn) pass('gradle.properties: minify enabled (expected for lean AAB)');
else pass('gradle.properties: minify disabled (release uses full classpath)');

if (exists('android/app/proguard-rules.pro')) {
  const proguard = read('android/app/proguard-rules.pro');
  if (minifyOn) {
    for (const keep of REQUIRED_PROGUARD_KEEPS) {
      if (proguard.includes(keep)) pass(`proguard-rules.pro keeps ${keep}`);
      else fail(`proguard-rules.pro MISSING keep for ${keep} (R8 will strip it → startup crash)`);
    }
    const lineCount = proguard.split('\n').filter((l) => l.trim().startsWith('-keep')).length;
    if (lineCount < 10) {
      fail(`proguard-rules.pro has only ${lineCount} -keep lines — too few for RN/Expo release`);
    } else {
      pass(`proguard-rules.pro has ${lineCount} -keep rules`);
    }
  }
} else {
  fail('android/app/proguard-rules.pro missing');
}

// [2] shrinkResources → resource keep file
console.log('\n[2] Resource shrink safety');
if (shrinkOn) {
  pass('gradle.properties: shrinkResources enabled');
  if (exists('android/app/src/main/res/raw/keep.xml')) {
    const keepXml = read('android/app/src/main/res/raw/keep.xml');
    if (keepXml.includes('@raw/nexryde_')) pass('res/raw/keep.xml preserves notification sounds');
    else fail('resource_keep.xml must keep @raw/nexryde_* sounds');
  } else {
    fail('shrinkResources enabled but android/app/src/main/res/raw/keep.xml missing');
  }
} else {
  pass('shrinkResources disabled — resource_keep.xml optional');
}

// [3] Startup entry must not throw synchronously
console.log('\n[3] JS bootstrap hardening');
const indexTs = read('index.ts');
if (indexTs.includes('registerWidgetTaskHandler') && indexTs.includes('try {')) {
  pass('index.ts: widget registration wrapped in try/catch');
} else {
  fail('index.ts: Android widget registration must be try/catch wrapped');
}

const layout = read('app/_layout.tsx');
if (!layout.match(/^import\s+['"]@\/src\/tasks\/backgroundLocationTask['"]/m)) {
  pass('_layout.tsx: no synchronous backgroundLocationTask import');
} else {
  fail('_layout.tsx: backgroundLocationTask must not be a top-level import (defer to useEffect)');
}
if (layout.includes("import('@/src/tasks/backgroundLocationTask')")) {
  pass('_layout.tsx: backgroundLocationTask deferred to useEffect');
} else {
  fail('_layout.tsx: must lazy-import backgroundLocationTask in useEffect');
}
if (layout.includes('installGlobalErrorHandler') && layout.includes('try {')) {
  pass('_layout.tsx: installGlobalErrorHandler wrapped in try/catch');
} else {
  fail('_layout.tsx: installGlobalErrorHandler must be try/catch wrapped');
}

// [4] Splash watchdog present
console.log('\n[4] Splash session watchdog');
const splash = read('app/index.tsx');
if (splash.includes('STARTUP_GLOBAL_WATCHDOG_MS')) pass('index.tsx: global startup watchdog');
else fail('index.tsx: missing STARTUP_GLOBAL_WATCHDOG_MS watchdog');

console.log(`\n${'─'.repeat(60)}`);
console.log(`Passed: ${passes.length}  Failed: ${failures.length}`);
if (failures.length) {
  console.error('\nFAILED — do not ship release AAB until fixed.');
  process.exit(1);
}
console.log('\nRelease startup safety checks passed.');

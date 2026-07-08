#!/usr/bin/env node
/**
 * Verify all 4 driver offer ringtones are present, mapped, and loadable.
 * Run: node ./scripts/verify_driver_offer_ringtones.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(__dirname, '..');

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
  return fs.readFileSync(path.join(FRONTEND, rel), 'utf8');
}

const RINGTONES = [
  { id: 'nexryde1', asset: 'assets/sounds/driver_offer_1.m4a', androidRaw: 'android/app/src/main/res/raw/nexryde_1.m4a' },
  { id: 'nexryde2', asset: 'assets/sounds/driver_offer_2.m4a', androidRaw: 'android/app/src/main/res/raw/nexryde_2.m4a' },
  { id: 'nexryde3', asset: 'assets/sounds/driver_offer_3.mp3', androidRaw: 'android/app/src/main/res/raw/nexryde_3.mp3' },
  { id: 'nexryde4', asset: 'assets/sounds/driver_offer_4.mp3', androidRaw: 'android/app/src/main/res/raw/nexryde_4.mp3' },
];

function testAssetFiles() {
  console.log('\n[1] Asset + Android raw files');
  for (const tone of RINGTONES) {
    for (const rel of [tone.asset, tone.androidRaw]) {
      const full = path.join(FRONTEND, rel);
      if (!fs.existsSync(full)) {
        fail(`Missing file: ${rel}`);
        continue;
      }
      const stat = fs.statSync(full);
      if (stat.size < 10_000) {
        fail(`${rel} too small (${stat.size} bytes) — likely corrupt`);
        continue;
      }
      pass(`${rel} exists (${Math.round(stat.size / 1024)} KB)`);
    }
  }
}

function testMapping() {
  console.log('\n[2] Code mapping (driverOfferSounds.ts)');
  const src = read('src/constants/driverOfferSounds.ts');

  for (const tone of RINGTONES) {
    if (!src.includes(`case '${tone.id}':`)) {
      fail(`Missing switch case for ${tone.id}`);
      continue;
    }
    const assetName = path.basename(tone.asset);
    if (!src.includes(assetName)) {
      fail(`Case ${tone.id} does not require ${assetName}`);
      continue;
    }
    pass(`${tone.id} → ${assetName}`);
  }

  if (src.includes('.wav')) {
    fail('Stale .wav reference in driverOfferSounds.ts');
  } else {
    pass('No stale .wav references in mapping');
  }

  const ids = ['nexryde1', 'nexryde2', 'nexryde3', 'nexryde4'];
  for (const id of ids) {
    if (!src.includes(`'${id}'`)) {
      fail(`Ringtone id ${id} missing from constants`);
    }
  }
  if (src.includes('driverOfferAndroidRawSound') && src.includes('driverOfferIosSoundFile')) {
    pass('Android/iOS push sound helpers present');
  } else {
    fail('driverOfferSounds.ts missing Android/iOS push sound helpers');
  }
  pass('All 4 ringtone IDs declared');
}

function testPlaybackChain() {
  console.log('\n[3] Playback chain untouched by terms/auth fix');

  const chainFiles = [
    'src/hooks/useDriverOfferAlert.ts',
    'src/hooks/useDriverOfferBackgroundAlert.ts',
    'src/services/driverOfferBackgroundAlert.ts',
    'src/services/driverOfferRingtonePreview.ts',
    'src/components/profile/DriverOfferSoundPreferences.tsx',
    'app/driver/offer-ringtone.tsx',
  ];

  for (const rel of chainFiles) {
    if (!fs.existsSync(path.join(FRONTEND, rel))) {
      fail(`Missing playback file: ${rel}`);
      continue;
    }
    const src = read(rel);
    const hasSoundHook =
      src.includes('getDriverOfferSoundModule') ||
      src.includes('DriverOfferSoundPreferences') ||
      src.includes('driverOfferBackgroundAlert') ||
      src.includes('triggerDriverOfferBackgroundAlert');
    if (!hasSoundHook) {
      fail(`${rel} missing expected sound imports`);
      continue;
    }
    pass(`${rel} intact`);
  }

  const termsFiles = ['app/(auth)/rider-terms.tsx', 'app/(auth)/driver-terms.tsx'];
  for (const rel of termsFiles) {
    const src = read(rel);
    if (src.includes('driver_offer') || src.includes('driverOffer')) {
      fail(`${rel} unexpectedly references driver offer sounds`);
    }
  }
  pass('Terms screens do not touch ringtone code');
}

function testAudioPlayable() {
  console.log('\n[4] Audio decode check (ffprobe)');

  let ffprobe;
  try {
    ffprobe = execSync('which ffprobe', { encoding: 'utf8' }).trim();
  } catch {
    console.log('  (skipped — ffprobe not installed)');
    return;
  }

  for (const tone of RINGTONES) {
    const full = path.join(FRONTEND, tone.asset);
    try {
      const out = execSync(
        `"${ffprobe}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${full}"`,
        { encoding: 'utf8' },
      ).trim();
      const dur = parseFloat(out);
      if (!Number.isFinite(dur) || dur < 0.3) {
        fail(`${tone.id}: invalid duration (${out})`);
      } else {
        pass(`${tone.id}: decodable, ${dur.toFixed(2)}s`);
      }
    } catch (e) {
      fail(`${tone.id}: ffprobe failed — ${e.message}`);
    }
  }
}

function testEasignore() {
  console.log('\n[5] EAS upload includes sounds');
  const easignorePath = path.join(FRONTEND, '.easignore');
  if (!fs.existsSync(easignorePath)) {
    pass('No .easignore — sounds included by default');
    return;
  }
  const src = fs.readFileSync(easignorePath, 'utf8');
  if (src.match(/assets\/sounds|\.m4a|\.mp3|sounds\//)) {
    fail('.easignore may exclude ringtone assets');
  } else {
    pass('.easignore does not exclude sound assets');
  }
}

function main() {
  console.log('NexRyde Driver Offer Ringtones — verification\n');
  testAssetFiles();
  testMapping();
  testPlaybackChain();
  testAudioPlayable();
  testEasignore();

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Passed: ${passes.length}  Failed: ${failures.length}`);
  if (failures.length) {
    console.error('\nFAILED CHECKS:');
    failures.forEach((f) => console.error(`  • ${f}`));
    process.exit(1);
  }
  console.log('\nAll 4 driver ringtones verified — not affected by terms/auth changes.');
  console.log('\nOn-device check: Driver hub → Offer ringtone → preview each NexRyde 1–4.');
}

main();

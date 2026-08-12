#!/usr/bin/env node
/**
 * Verify a release AAB is free of the Play Console 16 KB NDK crash warning
 * rooted in androidx.datastore 1.2.0's libdatastore_shared_counter.so.
 *
 * Usage:
 *   node ./scripts/verify_android_16kb_aab.mjs /path/to/app.aab
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function fail(msg) {
  console.error(`[verify_android_16kb_aab] FAIL: ${msg}`);
  process.exit(1);
}

function ok(msg) {
  console.log(`[verify_android_16kb_aab] OK: ${msg}`);
}

async function main() {
  const aabPath = process.argv[2];
  if (!aabPath) {
    fail('Usage: node ./scripts/verify_android_16kb_aab.mjs <app.aab>');
  }
  const abs = path.resolve(aabPath);
  if (!fs.existsSync(abs)) {
    fail(`AAB not found: ${abs}`);
  }

  let AdmZip;
  try {
    AdmZip = require('adm-zip');
  } catch {
    // Fallback: use unzip via child_process listing is awkward for binary checks.
    // Prefer node's built-in if adm-zip missing — use `yauzl` or unzip to temp.
  }

  const { execFileSync } = await import('node:child_process');
  const tmp = fs.mkdtempSync(path.join('/tmp', 'nexryde-16kb-'));
  try {
    execFileSync('unzip', ['-qo', abs, '-d', tmp], { stdio: 'pipe' });

    const versionFiles = [
      'base/root/META-INF/androidx.datastore_datastore-core.version',
      'base/root/META-INF/androidx.datastore_datastore.version',
    ];
    for (const rel of versionFiles) {
      const p = path.join(tmp, rel);
      if (!fs.existsSync(p)) continue;
      const ver = fs.readFileSync(p, 'utf8').trim();
      if (ver === '1.2.0') {
        fail(`${rel} is 1.2.0 (buggy 16KB native lib). Need >= 1.2.1.`);
      }
      ok(`${path.basename(rel)} = ${ver}`);
    }

    const so = path.join(tmp, 'base/lib/arm64-v8a/libdatastore_shared_counter.so');
    if (!fs.existsSync(so)) {
      ok('no arm64 libdatastore_shared_counter.so (datastore native not packaged)');
      return;
    }
    const size = fs.statSync(so).size;
    // 1.2.0 arm64 ≈ 54 KB; fixed 1.2.1 ≈ 10 KB. Guard the known-bad size band.
    if (size > 40000) {
      fail(
        `libdatastore_shared_counter.so is ${size} bytes — looks like datastore 1.2.0 (expect ~10KB from 1.2.1).`,
      );
    }
    ok(`libdatastore_shared_counter.so size=${size} (not the 1.2.0 ~54KB binary)`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch((err) => {
  fail(err?.stack || String(err));
});

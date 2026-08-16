#!/usr/bin/env node
/**
 * Verify a release AAB is free of the Play Console 16 KB NDK crash warning
 * rooted in androidx.datastore 1.2.x's NDK-r20 libdatastore_shared_counter.so.
 *
 * Usage:
 *   node ./scripts/verify_android_16kb_aab.mjs /path/to/app.aab
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

function fail(msg) {
  console.error(`[verify_android_16kb_aab] FAIL: ${msg}`);
  process.exit(1);
}

function ok(msg) {
  console.log(`[verify_android_16kb_aab] OK: ${msg}`);
}

function readelfAlign(soPath) {
  try {
    const out = execFileSync('readelf', ['-lW', soPath], { encoding: 'utf8' });
    const loadAligns = [];
    const lines = out.split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      if (!/\bLOAD\b/.test(lines[i])) continue;
      const tokens = lines[i].trim().split(/\s+/);
      const last = tokens[tokens.length - 1] || '';
      let n = NaN;
      if (/^0x[0-9a-fA-F]+$/.test(last)) {
        n = Number.parseInt(last, 16);
      } else {
        const next = (lines[i + 1] || '').match(/0x[0-9a-fA-F]+\s*$/);
        if (next) n = Number.parseInt(next[0], 16);
      }
      if (Number.isFinite(n) && n > 0) loadAligns.push(n);
    }
    return { loadAligns, raw: out };
  } catch {
    return null;
  }
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

  const tmp = fs.mkdtempSync(path.join('/tmp', 'nexryde-16kb-'));
  try {
    execFileSync('unzip', ['-qo', abs, '-d', tmp], { stdio: 'pipe' });

    const versionFiles = [
      'base/root/META-INF/androidx.datastore_datastore-core.version',
      'base/root/META-INF/androidx.datastore_datastore-core-android.version',
      'base/root/META-INF/androidx.datastore_datastore.version',
    ];
    let sawVersion = false;
    for (const rel of versionFiles) {
      const p = path.join(tmp, rel);
      if (!fs.existsSync(p)) continue;
      sawVersion = true;
      const ver = fs.readFileSync(p, 'utf8').trim();
      if (ver.startsWith('1.2.') || ver.startsWith('1.3.')) {
        fail(`${rel} is ${ver} (native lib stamped NDK r20). Need 1.1.7.`);
      }
      ok(`${path.basename(rel)} = ${ver}`);
    }
    if (!sawVersion) {
      ok('no DataStore META-INF version files (native lib may still be present)');
    }

    const so = path.join(tmp, 'base/lib/arm64-v8a/libdatastore_shared_counter.so');
    if (!fs.existsSync(so)) {
      ok('no arm64 libdatastore_shared_counter.so (datastore native not packaged)');
      return;
    }
    const size = fs.statSync(so).size;
    const buf = fs.readFileSync(so);
    const ident = buf.includes(Buffer.from('r20\0'))
      ? 'r20'
      : buf.includes(Buffer.from('r25c\0'))
        ? 'r25c'
        : buf.includes(Buffer.from('r28'))
          ? 'r28+'
          : 'unknown';
    if (ident === 'r20') {
      fail(
        `libdatastore_shared_counter.so is stamped NDK r20 (${size} bytes) — Play "older NDK" crash warning. Need 1.1.7 (r25c).`,
      );
    }
    if (size > 20000) {
      fail(
        `libdatastore_shared_counter.so is ${size} bytes — looks like datastore 1.2.0 (~54KB). Need 1.1.7 (~7KB).`,
      );
    }
    ok(`libdatastore_shared_counter.so size=${size} ndk=${ident}`);

    const elf = readelfAlign(so);
    if (elf?.loadAligns?.length) {
      const minAlign = Math.min(...elf.loadAligns);
      if (minAlign < 16384) {
        fail(`ELF LOAD align ${minAlign} < 16384 — Play will still warn on 16 KB devices`);
      }
      ok(`ELF LOAD align=${minAlign} (>= 16384)`);
    } else {
      ok('readelf not available — skipped ELF LOAD align check');
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch((err) => {
  fail(err?.stack || String(err));
});

#!/usr/bin/env node
/**
 * Prove an .ipa / .app contains the patched Appearance native marker.
 * Usage: node ./scripts/verify_appearance_in_ipa.cjs <path-to.ipa-or.app>
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const os = require('os');

const MARKER = 'NexRydeAppearancePatch/v1';
const target = process.argv[2];
if (!target) {
  console.error('Usage: node ./scripts/verify_appearance_in_ipa.cjs <ipa-or-app>');
  process.exit(2);
}
if (!fs.existsSync(target)) {
  console.error(`Missing: ${target}`);
  process.exit(1);
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  return r;
}

function findBinaries(root) {
  const out = [];
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        // Skip huge irrelevant trees
        if (ent.name === '_CodeSignature' || ent.name === 'assets') continue;
        walk(p);
      } else {
        out.push(p);
      }
    }
  };
  walk(root);
  // Prefer main app binary + React framework binary
  return out
    .filter((p) => {
      try {
        const st = fs.statSync(p);
        if (!st.isFile() || st.size < 10000) return false;
      } catch {
        return false;
      }
      const base = path.basename(p);
      const parent = path.basename(path.dirname(p));
      return (
        base === 'NexRyde' ||
        base === 'React' ||
        parent.endsWith('.app') ||
        p.includes('React.framework') ||
        base.endsWith('.dylib')
      );
    })
    .sort((a, b) => {
      const score = (p) =>
        (path.basename(p) === 'NexRyde' ? 0 : 10) +
        (p.includes('React.framework') ? 1 : 5) +
        p.length / 1000;
      return score(a) - score(b);
    });
}

let searchRoot = target;
let tmp;
if (target.endsWith('.ipa')) {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nexryde-ipa-'));
  const unzip = run('unzip', ['-q', target, '-d', tmp]);
  if (unzip.status !== 0) {
    console.error(unzip.stderr || 'unzip failed');
    process.exit(1);
  }
  searchRoot = tmp;
}

const binaries = findBinaries(searchRoot).filter((p) => {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
});

console.log(`[ipa-verify] searching ${binaries.length} binaries for ${MARKER}`);
let hit = null;
for (const bin of binaries) {
  const r = run('strings', [bin]);
  if (r.status === 0 && r.stdout && r.stdout.includes(MARKER)) {
    hit = bin;
    break;
  }
  // also try rg via strings alternate
  const r2 = spawnSync('sh', ['-c', `strings ${JSON.stringify(bin)} | grep -F ${JSON.stringify(MARKER)}`], {
    encoding: 'utf8',
  });
  if (r2.status === 0 && r2.stdout.includes(MARKER)) {
    hit = bin;
    break;
  }
}

if (!hit) {
  console.error('[ipa-verify] FAIL: marker not found in IPA/APP binaries');
  console.error('[ipa-verify] candidates:', binaries.slice(0, 20).join('\n'));
  process.exit(1);
}
console.log(`[ipa-verify] PASS: marker found in ${hit}`);
process.exit(0);

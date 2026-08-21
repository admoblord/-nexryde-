/**
 * Fail the Android EAS prebuild if Cronet is still allowed to speak QUIC.
 *
 * Pickup/destination search on AAB 322 timed out on-device because fetch went
 * through Cronet HTTP/3 (UDP). This must stay TCP (HTTP/2).
 *
 * Run: node ./scripts/verify_cronet_tcp.cjs --require-success
 */
const fs = require('fs');
const path = require('path');

const requireSuccess = process.argv.includes('--require-success');
const root = path.resolve(__dirname, '..');
const mainApp = path.join(
  root,
  'android/app/src/main/java/com/nexryde/app/MainApplication.kt',
);
const appJson = path.join(root, 'app.json');

function fail(msg) {
  console.error(`[verify_cronet_tcp] FAIL: ${msg}`);
  process.exit(requireSuccess ? 1 : 0);
}

const json = JSON.parse(fs.readFileSync(appJson, 'utf8'));
const plugins = json.expo?.plugins || [];
const cronet = plugins.find(
  (p) => Array.isArray(p) && p[0] === 'expo-cronet',
);
if (!cronet) {
  fail('expo-cronet plugin missing from app.json');
}
if (cronet[1]?.enableQuic !== false) {
  fail(`app.json expo-cronet.enableQuic must be false (got ${JSON.stringify(cronet[1]?.enableQuic)})`);
}
const cronetIdx = plugins.findIndex((p) => Array.isArray(p) && p[0] === 'expo-cronet');
const okhttpIdx = plugins.indexOf('./plugins/withNexrydeOkHttp.js');
if (okhttpIdx < 0) {
  fail('withNexrydeOkHttp.js must run after expo-cronet');
}
if (okhttpIdx < cronetIdx) {
  fail('withNexrydeOkHttp.js must be listed after expo-cronet so it can patch Cronet');
}

if (!fs.existsSync(mainApp)) {
  fail(`missing ${mainApp}`);
}
const src = fs.readFileSync(mainApp, 'utf8');
if (src.includes('CronetEngine') || src.includes('enableQuic')) {
  if (src.includes('.enableQuic(true)')) {
    fail('MainApplication.kt still has enableQuic(true) — QUIC will hang pickup search');
  }
  if (!src.includes('.enableQuic(false)')) {
    fail('MainApplication.kt has Cronet but not enableQuic(false)');
  }
  if (!src.includes('connectTimeout(5,')) {
    fail('Cronet OkHttp client is missing a 5s connect timeout');
  }
}

console.log('[verify_cronet_tcp] OK — Cronet QUIC disabled, TCP connect timeout present');
process.exit(0);

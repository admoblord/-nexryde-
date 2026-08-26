/**
 * Guard the Android HTTP client that actually ships.
 *
 * This app has a committed android/ directory, so EAS builds it as-is and never
 * runs `expo prebuild`. Everything under app.json "plugins" is therefore inert
 * on Android: AAB 322 and 323 both shipped without a line of the Cronet config
 * we thought we had changed. Only the checked-in native sources count.
 *
 * React Native's OkHttp builder sets connect/read/write to 0 — unlimited. With
 * sixteen Cloud Run addresses to choose from, one black-holed route hung every
 * request until the JS abort, which riders saw as "Address search timed out".
 *
 * Run: node ./scripts/verify_android_http.cjs --require-success
 */
const fs = require('fs');
const path = require('path');

const requireSuccess = process.argv.includes('--require-success');
const root = path.resolve(__dirname, '..');
const androidDir = path.join(root, 'android');
const nativeDir = path.join(androidDir, 'app/src/main/java/com/nexryde/app');
const httpFile = path.join(nativeDir, 'NexrydeOkHttp.kt');
const mainApp = path.join(nativeDir, 'MainApplication.kt');
const appJson = path.join(root, 'app.json');

function fail(msg) {
  console.error(`[verify_android_http] FAIL: ${msg}`);
  process.exit(requireSuccess ? 1 : 0);
}

if (!fs.existsSync(androidDir)) {
  // Managed project: config plugins would apply again and this guard is moot.
  console.log('[verify_android_http] SKIP — no committed android/ directory');
  process.exit(0);
}

if (!fs.existsSync(httpFile)) {
  fail('missing NexrydeOkHttp.kt — fetch would fall back to RN defaults (no timeouts)');
}
const http = fs.readFileSync(httpFile, 'utf8');

if (!/class NexrydeOkHttpClientFactory\s*:\s*OkHttpClientFactory/.test(http)) {
  fail('NexrydeOkHttp.kt does not implement OkHttpClientFactory');
}
const connect = http.match(/\.connectTimeout\(\s*(?:CONNECT_TIMEOUT_SECONDS|(\d+))/);
if (!connect) {
  fail('no connectTimeout on the app OkHttp client — a dead route hangs until the JS abort');
}
if (!/CONNECT_TIMEOUT_SECONDS\s*=\s*([1-9]|10)L?\b/.test(http)) {
  fail('connect timeout must stay well under the 9s places abort');
}
if (!/\.readTimeout\(/.test(http) || !/\.writeTimeout\(/.test(http)) {
  fail('read/write timeouts missing — a stalled socket never errors');
}
// This is the bound that decides a dead link, so it has to fire well before the
// JS backstop — otherwise the app cancels first and we learn nothing.
if (!/READ_TIMEOUT_SECONDS\s*=\s*[1-8]L?\b/.test(http)) {
  fail('read timeout must stay in single-figure seconds: it is what turns a stalled '
    + 'stream into an error the app can report instead of silence');
}
if (!/\.dns\(\s*Ipv4FirstDns\s*\)/.test(http)) {
  fail('IPv4-first DNS missing — an unroutable IPv6 answer costs the whole request');
}
if (/ipv4 \+ resolved\.filterNot/.test(http)) {
  fail('DNS still appends AAAA records — IPv6 black-holes must not be tried at all');
}
if (!/\.protocols\(\s*listOf\(\s*Protocol\.HTTP_1_1\s*\)\s*\)/.test(http)) {
  fail('HTTP/1.1-only missing — a dead HTTP/2 stream on Cloud Run sits silent until the JS abort');
}
if (!/\.connectionPool\(/.test(http) || !/KEEP_ALIVE_SECONDS\s*=\s*[1-9]L?\b/.test(http)) {
  fail('short keep-alive pool missing — a connection that survived a network switch is reused');
}

// connectTimeout starts at the socket, so a silent DNS server is unbounded without this.
if (!/DNS_TIMEOUT_SECONDS\s*=\s*[1-5]L?\b/.test(http)) {
  fail('no DNS timeout — Dns.SYSTEM.lookup blocks past the 9s abort and connectTimeout '
    + 'never applies, so the rider waits on name resolution with nothing logged server-side');
}
if (!/pending\.get\(\s*DNS_TIMEOUT_SECONDS/.test(http) || !/UnknownHostException/.test(http)) {
  fail('DNS timeout is declared but the lookup does not enforce it');
}

// A pooled HTTP/2 connection that died on a Wi-Fi → mobile switch accepts the
// request and never answers; pings surface that in seconds.
if (!/\.pingInterval\(/.test(http)) {
  fail('no pingInterval — a half-open pooled connection swallows the request until readTimeout');
}
if (!/PING_INTERVAL_SECONDS\s*=\s*[1-9]L?\b/.test(http)) {
  fail('ping interval must be seconds, not minutes, to beat the 9s abort');
}

if (!fs.existsSync(mainApp)) {
  fail(`missing ${mainApp}`);
}
const main = fs.readFileSync(mainApp, 'utf8');
if (!main.includes('OkHttpClientProvider.setOkHttpClientFactory(NexrydeOkHttpClientFactory())')) {
  fail('MainApplication.kt never installs NexrydeOkHttpClientFactory');
}
const onCreateAt = main.indexOf('override fun onCreate()');
const installAt = main.indexOf('setOkHttpClientFactory');
const loadAt = main.indexOf('loadReactNative(');
if (onCreateAt < 0 || installAt < onCreateAt || (loadAt > -1 && installAt > loadAt)) {
  fail('the OkHttp factory must be installed in onCreate before loadReactNative');
}

// Cronet only ever existed in app.json, which Android never reads here.
const json = JSON.parse(fs.readFileSync(appJson, 'utf8'));
const plugins = json.expo?.plugins || [];
const cronet = plugins.find((p) => (Array.isArray(p) ? p[0] : p) === 'expo-cronet');
if (cronet) {
  fail('expo-cronet is back in app.json but prebuild never runs — it cannot take effect');
}

// The native timeouts and the JS backstop are one budget, and they were fighting:
// a 9s JS abort fired before OkHttp's own bound, so every stall looked like a
// timeout with nothing logged server-side. The native layer must always lose the
// race to nothing — it has to be the one that reports a dead link.
const placesSearch = fs.readFileSync(
  path.join(root, 'src/services/placesSearch.ts'),
  'utf8',
);
const jsCapMs = Number(placesSearch.match(/PLACES_SEARCH_TIMEOUT_MS = (\d+)/)?.[1]);
const connectS = Number(http.match(/CONNECT_TIMEOUT_SECONDS\s*=\s*(\d+)/)?.[1]);
const readS = Number(http.match(/READ_TIMEOUT_SECONDS\s*=\s*(\d+)/)?.[1]);
if (!Number.isFinite(jsCapMs) || !Number.isFinite(connectS) || !Number.isFinite(readS)) {
  fail('could not read the JS places cap or the native timeouts to compare them');
}
if (jsCapMs <= (connectS + readS) * 1000) {
  fail(`the JS places cap (${jsCapMs}ms) is not above the native dead-link bound `
    + `(${connectS}s connect + ${readS}s read) — it would cancel live requests `
    + 'before OkHttp can report a dead one');
}

// Same trap as the plugins: EAS reads the version from the native code, so a
// bump in app.json alone ships a build labelled with the previous version. We
// spent a week unsure which build was on the phone; the labels must not lie.
const gradle = fs.readFileSync(path.join(androidDir, 'app/build.gradle'), 'utf8');
const gradleCode = gradle.match(/versionCode\s+(\d+)/);
const gradleName = gradle.match(/versionName\s+"([^"]+)"/);
if (!gradleCode || !gradleName) {
  fail('android/app/build.gradle has no versionCode/versionName — EAS would label the build blind');
}
if (String(json.expo?.android?.versionCode) !== gradleCode[1]) {
  fail(`versionCode mismatch: app.json ${json.expo?.android?.versionCode} vs `
    + `build.gradle ${gradleCode[1]} — the native value is the one that ships`);
}
if (String(json.expo?.version) !== gradleName[1]) {
  fail(`version mismatch: app.json ${json.expo?.version} vs build.gradle ${gradleName[1]}`);
}

console.log(
  '[verify_android_http] OK — bounded connect/read/write timeouts, bounded DNS, '
  + 'HTTP/1.1 only, IPv4 only, short keep-alive',
);
process.exit(0);

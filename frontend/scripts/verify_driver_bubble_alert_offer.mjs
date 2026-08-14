#!/usr/bin/env node
/**
 * Driver bubble / ride-alert / offer-timer contract.
 *
 * Reported: the floating bubble blinked instead of sitting steady, it appeared a
 * beat late after minimising, the ride ringtone did not load or ring out, and the
 * offer countdown was too short.
 *
 * Run: node frontend/scripts/verify_driver_bubble_alert_offer.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(ROOT, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const readRepo = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

let passed = 0;
let failed = 0;
const check = (label, ok, detail = '') => {
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
};

const KT = 'android/app/src/main/java/com/nexryde/app/driver';
const renderer = read(`${KT}/OverlayRenderer.kt`);
const rideAlert = read(`${KT}/RideAlertManager.kt`);
const bubbleController = read(`${KT}/DriverOverlayBubbleController.kt`);
const audio = read(`${KT}/DriverAlertAudioManager.kt`);
const fgs = read(`${KT}/DriverForegroundService.kt`);
const mainActivity = read('android/app/src/main/java/com/nexryde/app/MainActivity.kt');
const offerConstants = read('src/constants/driverOffer.ts');
const offerAlertHook = read('src/hooks/useDriverOfferAlert.ts');
const backendConfig = readRepo('backend/realtime_platform/config.py');

console.log('\n[1] Bubble is steady, not blinking');

check(
  'no infinite pulse animation on the bubble',
  !renderer.includes('ValueAnimator') &&
    !/repeatCount = ValueAnimator\.INFINITE/.test(renderer) &&
    !renderer.includes('startPulse'),
);

check(
  'background drawables are rebuilt only when the status colour changes',
  renderer.includes('appliedStatusColor') &&
    /if \(appliedStatusColor != color\) \{[\s\S]{0,240}?circle\.background = circleDrawable/.test(
      renderer,
    ),
);

// bind() runs once per countdown tick, so nothing in it may allocate unconditionally.
const bindBody = renderer.slice(
  renderer.indexOf('fun bind(state: OverlayState)'),
  renderer.indexOf('private fun setTextIfChanged'),
);
check(
  'bind() never allocates a drawable unconditionally',
  !/^\s*(statusBadge|circle)\.background = circleDrawable/m.test(
    bindBody.replace(/if \(appliedStatusColor != color\) \{[\s\S]*?\n {4}\}/, ''),
  ),
);

check(
  'text is only written when it actually changed',
  renderer.includes('setTextIfChanged') &&
    /fun setTextIfChanged\(view: TextView, next: String\) \{[\s\S]{0,160}?if \(view\.text\?\.toString\(\) == next\) return/.test(
      renderer,
    ),
);

check(
  'button state is not re-applied on every tick',
  /private fun setButtonsEnabled\(enabled: Boolean\) \{\s*if \(acceptButton\.isEnabled == enabled\) return/.test(
    renderer,
  ),
);

console.log('\n[2] Bubble shows the instant the app is minimised');

check(
  'MainActivity hooks onUserLeaveHint',
  /override fun onUserLeaveHint\(\)/.test(mainActivity) &&
    mainActivity.includes('DriverOverlayBubbleController.onAppMinimized()'),
);

check(
  'onUserLeaveHint cannot crash the activity',
  /runCatching \{ DriverOverlayBubbleController\.onAppMinimized\(\) \}/.test(mainActivity),
);

check(
  'controller exposes onAppMinimized and delegates to the alert manager',
  /fun onAppMinimized\(\) \{\s*rideAlertManager\?\.onAppMinimized\(\)/.test(bubbleController),
);

check(
  'minimise never draws a bubble for an offline driver',
  /fun onAppMinimized\(\) \{\s*if \(!online\) return/.test(rideAlert),
);

check(
  'minimise never replaces a live offer card',
  /fun onAppMinimized\(\)[\s\S]{0,400}?if \(stateManager\.state\.isExpanded\) return[\s\S]{0,120}?if \(currentOffer != null\) return/.test(
    rideAlert,
  ),
);

check(
  'minimise keeps the on-trip bubble on trip',
  /fun onAppMinimized\(\)[\s\S]{0,600}?OverlayPhase\.ON_TRIP\) stateManager\.onTrip\(\) else stateManager\.online\(\)/.test(
    rideAlert,
  ),
);

console.log('\n[3] Ride alert actually rings');

check(
  'ringtone is prepared before the offer arrives',
  audio.includes('fun prewarm()') && /fun goOnline\(\)[\s\S]{0,220}?audioManager\.prewarm\(\)/.test(rideAlert),
);

check(
  'prepare happens off the main thread',
  /fun prewarm\(\)[\s\S]{0,320}?Thread \{[\s\S]{0,240}?buildPreparedPlayer\(\)/.test(audio),
);

check(
  'the prepared player is reused and rewound instead of rebuilt per offer',
  /player\.seekTo\(0\)[\s\S]{0,80}?player\.start\(\)/.test(audio) &&
    !/fun start\(\)[\s\S]{0,400}?stop\(\)\s*\n/.test(audio),
);

check(
  'a decode failure falls back to the system alarm tone instead of silence',
  audio.includes('setOnErrorListener') &&
    audio.includes('startFallbackRingtone') &&
    audio.includes('RingtoneManager.getDefaultUri'),
);

check(
  'alarm volume is raised while ringing and restored afterwards',
  audio.includes('raiseAlarmVolume') &&
    audio.includes('restoreAlarmVolume') &&
    /fun stop\(\)[\s\S]{0,400}?restoreAlarmVolume\(\)/.test(audio),
);

check(
  'the player is fully released when the shift ends',
  audio.includes('fun release()') &&
    /fun goOffline\(\)[\s\S]{0,160}?audioManager\.release\(\)/.test(rideAlert) &&
    /override fun onDestroy\(\)[\s\S]{0,320}?driverAlertAudioManager\.release\(\)/.test(fgs),
);

check(
  'the in-app (JS) ringtone is cached so it does not load on arrival',
  offerAlertHook.includes('loadOfferSound') &&
    /useEffect\(\(\) => \{[\s\S]{0,200}?void loadOfferSound\(ringtoneId\);[\s\S]{0,60}?\}, \[ringtoneId, soundEnabled\]\)/.test(
      offerAlertHook,
    ) &&
    /await sound\.setPositionAsync\(0\)[\s\S]{0,80}?await sound\.playAsync\(\)/.test(offerAlertHook),
);

check(
  'the cached JS sound is rewound, not unloaded, between offers',
  /async function teardown\(\)[\s\S]{0,700}?setPositionAsync\(0\)/.test(offerAlertHook) &&
    !/async function teardown\(\)[\s\S]{0,700}?unloadAsync\(\)/.test(offerAlertHook),
);

console.log('\n[4] Offer countdown is longer and still inside the server window');

const jsSeconds = Number(/DRIVER_OFFER_COUNTDOWN_SECONDS = (\d+)/.exec(offerConstants)?.[1] ?? 0);
const ktSeconds = Number(/OFFER_COUNTDOWN_SECONDS = (\d+)/.exec(rideAlert)?.[1] ?? 0);
const backendTtl = Number(/offer_ttl_sec: int = (\d+)/.exec(backendConfig)?.[1] ?? 0);

check('offer countdown was increased past the old 20s', jsSeconds > 20, `got ${jsSeconds}s`);
check('native countdown matches the JS countdown', jsSeconds === ktSeconds, `js=${jsSeconds} native=${ktSeconds}`);
check(
  'countdown stays under the backend offer TTL (cannot accept an expired offer)',
  backendTtl > 0 && jsSeconds < backendTtl,
  `countdown=${jsSeconds}s backendTtl=${backendTtl}s`,
);

const replayMaxAge = Number(/OFFER_REPLAY_MAX_AGE_MS = ([\d_]+)/.exec(fgs)?.[1].replace(/_/g, '') ?? 0);
check(
  'a replayed offer still has time left on the clock',
  replayMaxAge > 0 && replayMaxAge < jsSeconds * 1000,
  `replayMaxAge=${replayMaxAge}ms countdown=${jsSeconds * 1000}ms`,
);

console.log(`\n═══ Result: ${passed} passed, ${failed} failed ═══\n`);
process.exit(failed ? 1 : 0);

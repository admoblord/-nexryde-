#!/usr/bin/env node
/**
 * Production-safe React Native Appearance.setColorScheme patch.
 *
 * Why: On New Architecture, TurboModule void methods run on
 * com.meta.react.turbomodulemanager.queue. RCTAppearance.setColorScheme
 * mutates UIWindow off-main → NSException → SIGABRT.
 *
 * This script patches node_modules/react-native/.../RCTAppearance.mm in place.
 * CocoaPods compiles React from that path, so EAS/App Store binaries pick it up
 * when this runs before `pod install` / Xcode build.
 *
 * Usage:
 *   node ./scripts/apply_appearance_native_patch.mjs              # apply
 *   node ./scripts/apply_appearance_native_patch.mjs --verify-only
 *   node ./scripts/apply_appearance_native_patch.mjs --require-success
 */
const fs = require('fs');
const path = require('path');

const MARKER = 'NexRydeAppearancePatch/v1';
const ROOT = path.resolve(__dirname, '..');
const APPEARANCE_MM = path.join(
  ROOT,
  'node_modules',
  'react-native',
  'React',
  'CoreModules',
  'RCTAppearance.mm'
);
const VENDORED_APPEARANCE_MM = path.join(
  ROOT,
  'native-patches',
  'RCTAppearance.mm'
);
const PROOF_DIR = path.join(ROOT, 'ios', 'NEXRYDE');
const PROOF_FILE = path.join(PROOF_DIR, 'NexRydeAppearancePatch.proof');

const SAFE_METHOD = `RCT_EXPORT_METHOD(setColorScheme : (NSString *)style)
{
  // ${MARKER}
  // New Architecture: TurboModule void methods may run off the main queue.
  // UIWindow.overrideUserInterfaceStyle must run on main; catch NSException.
  NSString *styleCopy = [style copy];
  dispatch_async(dispatch_get_main_queue(), ^{
    @try {
      UIUserInterfaceStyle userInterfaceStyle = [RCTConvert UIUserInterfaceStyle:styleCopy];
      NSMutableArray<UIWindow *> *windows = [NSMutableArray new];
      UIApplication *application = RCTSharedApplication();
      if (application == nil) {
        return;
      }
      for (UIScene *scene in application.connectedScenes) {
        if (![scene isKindOfClass:[UIWindowScene class]]) {
          continue;
        }
        [windows addObjectsFromArray:((UIWindowScene *)scene).windows];
      }
      for (UIWindow *window in windows) {
        if (window != nil) {
          window.overrideUserInterfaceStyle = userInterfaceStyle;
        }
      }
    } @catch (NSException *exception) {
      NSLog(@"%@ TurboModule Exception: Appearance.setColorScheme(%@) — %@ / %@",
            @"${MARKER}",
            styleCopy,
            exception.name,
            exception.reason);
    }
  });
}`;

const METHOD_RE =
  /RCT_EXPORT_METHOD\(setColorScheme\s*:\s*\(NSString\s*\*\)style\)\s*\{[\s\S]*?\n\}/;

function writeProof(status) {
  fs.mkdirSync(PROOF_DIR, { recursive: true });
  const body = [
    `marker=${MARKER}`,
    `status=${status}`,
    `source=${APPEARANCE_MM}`,
    `patched_at=${new Date().toISOString()}`,
    `has_dispatch_async=${String(fs.existsSync(APPEARANCE_MM) && fs.readFileSync(APPEARANCE_MM, 'utf8').includes('dispatch_async(dispatch_get_main_queue()'))}`,
    `has_try=${String(fs.existsSync(APPEARANCE_MM) && fs.readFileSync(APPEARANCE_MM, 'utf8').includes('@try'))}`,
  ].join('\n');
  fs.writeFileSync(PROOF_FILE, `${body}\n`);
  return PROOF_FILE;
}

function isPatched(contents) {
  return (
    contents.includes(MARKER) &&
    contents.includes('dispatch_async(dispatch_get_main_queue()') &&
    contents.includes('@try') &&
    contents.includes('@catch (NSException')
  );
}

function apply() {
  if (!fs.existsSync(APPEARANCE_MM)) {
    throw new Error(`RCTAppearance.mm not found at ${APPEARANCE_MM}`);
  }
  let contents = fs.readFileSync(APPEARANCE_MM, 'utf8');
  if (isPatched(contents)) {
    const proof = writeProof('already_patched');
    console.log(`[appearance-native-patch] already patched: ${APPEARANCE_MM}`);
    console.log(`[appearance-native-patch] proof: ${proof}`);
    return { applied: false, path: APPEARANCE_MM, proof };
  }
  if (fs.existsSync(VENDORED_APPEARANCE_MM)) {
    const vendored = fs.readFileSync(VENDORED_APPEARANCE_MM, 'utf8');
    if (!isPatched(vendored)) {
      throw new Error(`Vendored RCTAppearance.mm missing patch markers: ${VENDORED_APPEARANCE_MM}`);
    }
    fs.writeFileSync(APPEARANCE_MM, vendored);
    const proof = writeProof('copied_vendored');
    console.log(`[appearance-native-patch] copied vendored patch -> ${APPEARANCE_MM}`);
    console.log(`[appearance-native-patch] proof: ${proof}`);
    return { applied: true, path: APPEARANCE_MM, proof, from: VENDORED_APPEARANCE_MM };
  }
  if (!METHOD_RE.test(contents)) {
    throw new Error('setColorScheme method not found — React Native version mismatch');
  }
  contents = contents.replace(METHOD_RE, SAFE_METHOD);
  if (!contents.includes('#import <React/RCTConvert.h>')) {
    contents = contents.replace(
      '#import <React/RCTEventEmitter.h>',
      '#import <React/RCTEventEmitter.h>\n#import <React/RCTConvert.h>'
    );
  }
  if (!isPatched(contents)) {
    throw new Error('patch applied but verification markers missing');
  }
  fs.writeFileSync(APPEARANCE_MM, contents);
  const proof = writeProof('patched');
  console.log(`[appearance-native-patch] patched: ${APPEARANCE_MM}`);
  console.log(`[appearance-native-patch] proof: ${proof}`);
  return { applied: true, path: APPEARANCE_MM, proof };
}

function verify() {
  if (!fs.existsSync(APPEARANCE_MM)) {
    throw new Error(`RCTAppearance.mm not found at ${APPEARANCE_MM}`);
  }
  const contents = fs.readFileSync(APPEARANCE_MM, 'utf8');
  if (!isPatched(contents)) {
    throw new Error(`Patch markers missing in ${APPEARANCE_MM}`);
  }
  const proof = writeProof('verified');
  console.log(`[appearance-native-patch] VERIFY OK: ${APPEARANCE_MM}`);
  console.log(`[appearance-native-patch] proof: ${proof}`);
  // Print the exact patched method for audit logs
  const match = contents.match(METHOD_RE);
  if (match) {
    console.log('[appearance-native-patch] --- patched method begin ---');
    console.log(match[0]);
    console.log('[appearance-native-patch] --- patched method end ---');
  }
  return { path: APPEARANCE_MM, proof, method: match ? match[0] : null };
}

function main() {
  const args = new Set(process.argv.slice(2));
  const requireSuccess = args.has('--require-success');
  try {
    if (args.has('--verify-only')) {
      verify();
    } else {
      apply();
      verify();
    }
  } catch (err) {
    console.error(`[appearance-native-patch] FAIL: ${err.message || err}`);
    try {
      writeProof('failed');
    } catch {
      /* ignore */
    }
    if (requireSuccess) process.exit(1);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = { MARKER, APPEARANCE_MM, PROOF_FILE, apply, verify, isPatched };

#!/usr/bin/env node
/**
 * Fail the iOS build if React Native would use the prebuilt RNCore XCFramework.
 * Patching node_modules/RCTAppearance.mm only affects App Store binaries when
 * ios.buildReactNativeFromSource=true (Podfile sets RCT_USE_PREBUILT_RNCORE=0).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const propsPath = path.join(ROOT, 'ios', 'Podfile.properties.json');
const requireSuccess = process.argv.includes('--require-success');

function fail(msg) {
  console.error(`[verify-rn-from-source] FAIL: ${msg}`);
  if (requireSuccess) process.exit(1);
  process.exitCode = 1;
}

if (!fs.existsSync(propsPath)) {
  fail(`missing ${propsPath} — run expo prebuild first`);
} else {
  const props = JSON.parse(fs.readFileSync(propsPath, 'utf8'));
  if (props['ios.buildReactNativeFromSource'] !== 'true') {
    fail(
      `ios.buildReactNativeFromSource is "${props['ios.buildReactNativeFromSource']}" (want "true"). ` +
        'Prebuilt React.framework ignores node_modules patches.'
    );
  } else {
    console.log('[verify-rn-from-source] OK: ios.buildReactNativeFromSource=true');
    console.log(`[verify-rn-from-source] ${propsPath}`);
  }
}

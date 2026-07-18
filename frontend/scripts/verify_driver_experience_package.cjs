/**
 * Fail EAS/Android builds if MainApplication lost DriverExperiencePackage after prebuild.
 * Run: node ./scripts/verify_driver_experience_package.cjs --require-success
 */
const fs = require('fs');
const path = require('path');

const requireSuccess = process.argv.includes('--require-success');
const root = path.resolve(__dirname, '..');
const mainApp = path.join(
  root,
  'android/app/src/main/java/com/nexryde/app/MainApplication.kt',
);

function fail(msg) {
  console.error(`[verify_driver_experience_package] FAIL: ${msg}`);
  if (requireSuccess) process.exit(1);
  process.exit(0);
}

if (!fs.existsSync(mainApp)) {
  fail(`missing ${mainApp}`);
}
const src = fs.readFileSync(mainApp, 'utf8');
if (!src.includes('import com.nexryde.app.driver.DriverExperiencePackage')) {
  fail('DriverExperiencePackage import missing from MainApplication.kt');
}
if (!src.includes('add(DriverExperiencePackage())')) {
  fail('DriverExperiencePackage registration missing from MainApplication.kt');
}
console.log('[verify_driver_experience_package] OK — DriverExperiencePackage registered');
process.exit(0);

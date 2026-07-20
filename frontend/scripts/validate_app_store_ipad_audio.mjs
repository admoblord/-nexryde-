/**
 * Contract check for App Store Guideline 4 + 2.5.4 resubmission fixes.
 * Run: node frontend/scripts/validate_app_store_ipad_audio.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function printRow(id, label, pass, detail) {
  console.log(`${pass ? 'PASS' : 'FAIL'}  [${id}] ${label}${detail ? ` — ${detail}` : ''}`);
  return pass;
}

function main() {
  const appJson = JSON.parse(read('app.json'));
  const plist = read('ios/NexRyde/Info.plist');
  const pbx = read('ios/NexRyde.xcodeproj/project.pbxproj');
  const audioSession = read('src/services/driverOfferAudioSession.ts');
  const flow = read('src/constants/flowLayout.ts');

  const bgModes = appJson.expo.ios.infoPlist.UIBackgroundModes || [];
  const results = [];

  results.push(
    printRow(
      '2.5.4a',
      'UIBackgroundModes does not declare audio (app.json)',
      !bgModes.includes('audio') &&
        bgModes.includes('location') &&
        bgModes.includes('remote-notification'),
      JSON.stringify(bgModes),
    ),
  );

  results.push(
    printRow(
      '2.5.4b',
      'Info.plist does not declare audio background mode',
      !/<string>audio<\/string>/.test(plist.split('UIBackgroundModes')[1]?.split('</array>')[0] || 'audio'),
      null,
    ),
  );

  results.push(
    printRow(
      '2.5.4c',
      'Offer audio does not request staysActiveInBackground',
      audioSession.includes('staysActiveInBackground: false') &&
        audioSession.includes('2.5.4'),
      null,
    ),
  );

  results.push(
    printRow(
      '4a',
      'iPad: supportsTablet + requireFullScreen',
      appJson.expo.ios.supportsTablet === true && appJson.expo.ios.requireFullScreen === true,
      null,
    ),
  );

  results.push(
    printRow(
      '4b',
      'Info.plist UIRequiresFullScreen true + iPad orientations',
      plist.includes('<key>UIRequiresFullScreen</key>\n    <true/>') &&
        plist.includes('UISupportedInterfaceOrientations~ipad'),
      null,
    ),
  );

  results.push(
    printRow(
      '4c',
      'Xcode TARGETED_DEVICE_FAMILY includes iPad (1,2)',
      pbx.includes('TARGETED_DEVICE_FAMILY = "1,2"'),
      null,
    ),
  );

  results.push(
    printRow(
      '4d',
      'Tablet-aware flowLayout max width',
      flow.includes('FLOW_MAX_CONTENT_WIDTH_TABLET') && flow.includes('isTablet'),
      null,
    ),
  );

  const all = results.every(Boolean);
  console.log(`\nOverall: ${all ? 'PASS' : 'FAIL'}`);
  process.exit(all ? 0 : 1);
}

main();

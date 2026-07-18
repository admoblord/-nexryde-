#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const androidRoot = path.join(root, 'android');
const appGradle = path.join(androidRoot, 'app', 'build.gradle');
const rootGradle = path.join(androidRoot, 'build.gradle');
const appJson = path.join(androidRoot, 'app', 'google-services.json');
const projectJson = path.join(root, 'google-services.json');
const envJson = process.env.GOOGLE_SERVICES_FILE || '';

const checks = [
  ['google-services.json available', [appJson, projectJson, envJson].some((p) => p && fs.existsSync(p))],
  ['root Gradle has Google Services classpath', fs.readFileSync(rootGradle, 'utf8').includes('com.google.gms:google-services')],
  ['app Gradle applies Google Services plugin', fs.readFileSync(appGradle, 'utf8').includes('com.google.gms.google-services')],
  ['app Gradle enforces release Firebase config', fs.readFileSync(appGradle, 'utf8').includes('google-services.json is required for Android release FCM')],
];

let failed = false;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  failed ||= !ok;
}

if (failed) {
  process.exitCode = 1;
}

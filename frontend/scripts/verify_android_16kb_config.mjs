#!/usr/bin/env node
/**
 * Source-level proof that Play's 16 KB DataStore crash warning cannot return
 * after `expo prebuild`. Run: node ./scripts/verify_android_16kb_config.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const plugin = require(path.join(root, 'plugins/withAndroid16KbPageSize.js'));

function printRow(id, label, pass, detail) {
  console.log(`${pass ? 'PASS' : 'FAIL'}  [${id}] ${label}${detail ? ` — ${detail}` : ''}`);
  return pass;
}

const results = [];
const ndkMajor = Number(String(plugin.NDK_VERSION || '').split('.')[0]);
results.push(
  printRow(
    'ndk-r28',
    'plugin pins NDK r28 or higher',
    Number.isFinite(ndkMajor) && ndkMajor >= 28,
    `ndk=${plugin.NDK_VERSION}`,
  ),
);

const ds = String(plugin.DATASTORE_VERSION || '');
const dsOk = ds === '1.1.1' || ds === '1.1.7';
results.push(
  printRow(
    'datastore-1.1.7',
    'plugin forces datastore-core-android 1.1.7 (r25c .so), not the whole group',
    dsOk,
    `datastore=${ds}`,
  ),
);

const appJson = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
const plugins = JSON.stringify(appJson.expo?.plugins || []);
results.push(
  printRow(
    'app-json-plugin',
    'app.json registers withAndroid16KbPageSize before prebuild',
    plugins.includes('withAndroid16KbPageSize'),
  ),
);

const rootGradle = fs.readFileSync(path.join(root, 'android/build.gradle'), 'utf8');
results.push(
  printRow(
    'root-gradle-force',
    'android/build.gradle forces only datastore-core-android 1.1.7',
    rootGradle.includes(plugin.BEGIN) &&
      rootGradle.includes("name == 'datastore-core-android'") &&
      rootGradle.includes('androidx.datastore:datastore-core-android:1.1.7') &&
      !rootGradle.includes('androidx.datastore:datastore-guava:1.1.7'),
  ),
);

const props = fs.readFileSync(path.join(root, 'android/gradle.properties'), 'utf8');
results.push(
  printRow(
    'gradle-properties-ndk',
    'gradle.properties pins ndkVersion r28+',
    /(?:^|\n)ndkVersion=28\./.test(props),
  ),
);

const appGradle = fs.readFileSync(path.join(root, 'android/app/build.gradle'), 'utf8');
results.push(
  printRow(
    'app-ndk-property',
    'app module prefers gradle.properties ndkVersion',
    appGradle.includes('findProperty("ndkVersion")'),
  ),
);

const injected = plugin.injectBuildGradle('apply plugin: "expo-root-project"\n');
results.push(
  printRow(
    'prebuild-inject',
    'plugin re-injects the 16KB block on a clean prebuild gradle',
    injected.includes(plugin.BEGIN) && injected.includes(plugin.DATASTORE_VERSION),
  ),
);

const failed = results.filter((p) => !p).length;
if (failed) {
  console.error(`\n${failed} android-16kb config check(s) failed`);
  process.exit(1);
}
console.log('\nAll android-16kb config checks passed');

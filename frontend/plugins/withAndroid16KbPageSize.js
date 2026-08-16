/**
 * Expo config plugin: keep the Android app Play-safe on 16 KB page-size devices.
 *
 * Play Console: "Your app could crash on 16 KB devices" for
 *   base/lib/arm64-v8a/libdatastore_shared_counter.so
 *
 * 1) Pin NDK r28+ so anything compiled from source gets 16 KB ELF defaults.
 * 2) Force AndroidX DataStore 1.1.7. The 1.2.0 / 1.2.1 native lib is stamped
 *    NDK r20 — Play's "compiled with an older Android NDK … can still crash
 *    on 16 KB devices" warning. 1.1.7 ships the same .so as 1.1.1 (NDK r25c)
 *    which Play accepts. Do not "upgrade" to 1.2.1 for this warning.
 *
 * Survives `expo prebuild` (EAS production regenerates android/).
 */
const {
  withAppBuildGradle,
  withGradleProperties,
  withProjectBuildGradle,
} = require('@expo/config-plugins');

const NDK_VERSION = '28.2.13676358';
const DATASTORE_VERSION = '1.1.7';

const BEGIN = '// @generated begin nexryde-16kb-page-size';
const END = '// @generated end nexryde-16kb-page-size';

const GRADLE_SNIPPET = `${BEGIN}
// NDK r28+ defaults to 16 KB ELF alignment for from-source native builds.
ext {
    ndkVersion = "${NDK_VERSION}"
}

// 1.2.0/1.2.1 libdatastore_shared_counter.so is stamped NDK r20 (Play crash
// warning). 1.1.7 is NDK r25c — same native binary Play already accepted.
allprojects { project ->
    project.configurations.configureEach { configuration ->
        configuration.resolutionStrategy.eachDependency { details ->
            if (details.requested.group == 'androidx.datastore') {
                details.useVersion('${DATASTORE_VERSION}')
                details.because('Play 16KB: avoid datastore 1.2.x NDK r20 native lib')
            }
        }
        configuration.resolutionStrategy.force(
            'androidx.datastore:datastore:${DATASTORE_VERSION}',
            'androidx.datastore:datastore-android:${DATASTORE_VERSION}',
            'androidx.datastore:datastore-core:${DATASTORE_VERSION}',
            'androidx.datastore:datastore-core-android:${DATASTORE_VERSION}',
            'androidx.datastore:datastore-preferences:${DATASTORE_VERSION}',
            'androidx.datastore:datastore-preferences-android:${DATASTORE_VERSION}',
            'androidx.datastore:datastore-preferences-core:${DATASTORE_VERSION}'
        )
    }
}
${END}
`;

function upsertGradleProperty(properties, key, value) {
  const idx = properties.findIndex(
    (item) => item.type === 'property' && item.key === key,
  );
  if (idx >= 0) {
    properties[idx].value = value;
  } else {
    properties.push({ type: 'property', key, value });
  }
}

function stripGeneratedBlock(contents) {
  const begin = contents.indexOf(BEGIN);
  if (begin < 0) {
    return contents;
  }
  const end = contents.indexOf(END, begin);
  if (end < 0) {
    return contents;
  }
  const after = end + END.length;
  let start = begin;
  if (start > 0 && contents[start - 1] === '\n') {
    start -= 1;
  }
  let finish = after;
  if (contents[finish] === '\n') {
    finish += 1;
  }
  return contents.slice(0, start) + contents.slice(finish);
}

function injectBuildGradle(contents) {
  let next = stripGeneratedBlock(contents);
  const applyMarker = 'apply plugin: "expo-root-project"';
  if (next.includes(applyMarker)) {
    return next.replace(applyMarker, `${GRADLE_SNIPPET}\n${applyMarker}`);
  }
  return `${next.trimEnd()}\n\n${GRADLE_SNIPPET}\n`;
}

function pinAppNdkVersion(contents) {
  return contents.replace(
    /ndkVersion\s+rootProject\.ext\.ndkVersion/,
    'ndkVersion (rootProject.findProperty("ndkVersion") ?: rootProject.ext.ndkVersion)',
  );
}

function withAndroid16KbPageSize(config) {
  config = withGradleProperties(config, (cfg) => {
    upsertGradleProperty(cfg.modResults, 'ndkVersion', NDK_VERSION);
    return cfg;
  });

  config = withProjectBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      throw new Error(
        '[withAndroid16KbPageSize] Expected groovy android/build.gradle',
      );
    }
    cfg.modResults.contents = injectBuildGradle(cfg.modResults.contents);
    return cfg;
  });

  config = withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      throw new Error(
        '[withAndroid16KbPageSize] Expected groovy android/app/build.gradle',
      );
    }
    cfg.modResults.contents = pinAppNdkVersion(cfg.modResults.contents);
    return cfg;
  });

  return config;
}

module.exports = withAndroid16KbPageSize;
module.exports.NDK_VERSION = NDK_VERSION;
module.exports.DATASTORE_VERSION = DATASTORE_VERSION;
module.exports.injectBuildGradle = injectBuildGradle;
module.exports.pinAppNdkVersion = pinAppNdkVersion;
module.exports.BEGIN = BEGIN;

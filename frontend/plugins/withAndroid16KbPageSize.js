/**
 * Expo config plugin: keep the Android app Play-safe on 16 KB page-size devices.
 *
 * 1) Pin NDK r28+ so anything compiled from source gets correct 16 KB ELF defaults.
 * 2) Force AndroidX DataStore >= 1.2.1 — 1.2.0 ships libdatastore_shared_counter.so
 *    built with an ancient Kotlin/Native linker that triggers Play Console's
 *    "compiled for 16 KB … older Android NDK … can cause crashes" warning.
 *
 * Survives `expo prebuild` (EAS production profile regenerates android/).
 */
const {
  withGradleProperties,
  withProjectBuildGradle,
} = require('@expo/config-plugins');

const NDK_VERSION = '28.2.13676358';
const DATASTORE_VERSION = '1.2.1';

const BEGIN = '// @generated begin nexryde-16kb-page-size';
const END = '// @generated end nexryde-16kb-page-size';

const GRADLE_SNIPPET = `${BEGIN}
// NDK r28+ defaults to 16 KB ELF alignment for from-source native builds.
ext {
    ndkVersion = "${NDK_VERSION}"
}

// androidx.datastore:1.2.0's libdatastore_shared_counter.so is 16 KB-aligned but
// linked with a buggy old NDK/Kotlin-Native toolchain (Play crash warning).
// Fixed in 1.2.1: https://issuetracker.google.com/issues/476745201
allprojects { project ->
    project.configurations.configureEach { configuration ->
        configuration.resolutionStrategy.eachDependency { details ->
            if (details.requested.group == 'androidx.datastore') {
                details.useVersion('${DATASTORE_VERSION}')
                details.because('Play 16KB: avoid buggy datastore 1.2.0 native lib')
            }
        }
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
  // Drop a preceding newline so re-injection stays tidy.
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
  // Fresh / unexpected layout — append before EOF.
  return `${next.trimEnd()}\n\n${GRADLE_SNIPPET}\n`;
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

  return config;
}

module.exports = withAndroid16KbPageSize;
module.exports.NDK_VERSION = NDK_VERSION;
module.exports.DATASTORE_VERSION = DATASTORE_VERSION;

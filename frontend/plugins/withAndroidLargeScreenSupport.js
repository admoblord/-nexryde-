/**
 * Expo config plugin: clear Play Console "Remove resizability and orientation
 * restrictions" for Android 16 large screens (sw >= 600dp).
 *
 * - MainActivity: no fixed orientation; explicitly resizeable
 * - Known library activities that ship portrait locks: override to unspecified
 *
 * Phone UIs can still prefer portrait via layout; Android 16 ignores orientation
 * locks on large screens when targeting API 36 regardless.
 */
const { withAndroidManifest } = require('@expo/config-plugins');

const RESTRICTED_ORIENTATIONS = new Set([
  'portrait',
  'reversePortrait',
  'sensorPortrait',
  'userPortrait',
  'landscape',
  'reverseLandscape',
  'sensorLandscape',
  'userLandscape',
]);

/** Third-party activities known to declare android:screenOrientation="portrait". */
const LIBRARY_ORIENTATION_OVERRIDES = [
  'com.google.mlkit.vision.codescanner.internal.GmsBarcodeScanningDelegateActivity',
  'com.canhub.cropper.CropImageActivity',
  'expo.modules.imagepicker.ExpoCropImageActivity',
];

function ensureToolsNamespace(manifest) {
  if (!manifest.$) {
    manifest.$ = {};
  }
  if (!manifest.$['xmlns:tools']) {
    manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
  }
}

function mergeToolsReplace(existing, attr) {
  const parts = String(existing || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.includes(attr)) {
    parts.push(attr);
  }
  return parts.join(',');
}

function clearRestrictedOrientation(attrs, { forceReplace = false } = {}) {
  const current = attrs['android:screenOrientation'];
  if (!current || !RESTRICTED_ORIENTATIONS.has(current)) {
    if (!forceReplace) {
      return false;
    }
  }
  attrs['android:screenOrientation'] = 'unspecified';
  if (forceReplace) {
    attrs['tools:replace'] = mergeToolsReplace(
      attrs['tools:replace'],
      'android:screenOrientation',
    );
  }
  return true;
}

function findOrCreateActivity(app, activityName) {
  if (!app.activity) {
    app.activity = [];
  }
  const existing = app.activity.find(
    (a) => a?.$?.['android:name'] === activityName,
  );
  if (existing) {
    return existing;
  }
  const created = {
    $: {
      'android:name': activityName,
    },
  };
  app.activity.push(created);
  return created;
}

function withAndroidLargeScreenSupport(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    ensureToolsNamespace(manifest);

    const app = manifest.application?.[0];
    if (!app) {
      return cfg;
    }

    for (const activity of app.activity || []) {
      const attrs = activity.$;
      if (!attrs) continue;
      const name = attrs['android:name'] || '';
      const isMain =
        name === '.MainActivity' || name.endsWith('.MainActivity');

      if (isMain) {
        // Prefer omitting a lock entirely; Expo "default" uses unspecified.
        delete attrs['android:screenOrientation'];
        attrs['android:resizeableActivity'] = 'true';
        delete attrs['android:maxAspectRatio'];
        delete attrs['android:minAspectRatio'];
        continue;
      }

      clearRestrictedOrientation(attrs, {
        forceReplace: !name.startsWith('.') && !name.includes('nexryde'),
      });
    }

    for (const name of LIBRARY_ORIENTATION_OVERRIDES) {
      const activity = findOrCreateActivity(app, name);
      activity.$ = activity.$ || { 'android:name': name };
      activity.$['android:screenOrientation'] = 'unspecified';
      activity.$['tools:replace'] = mergeToolsReplace(
        activity.$['tools:replace'],
        'android:screenOrientation',
      );
    }

    return cfg;
  });
}

module.exports = withAndroidLargeScreenSupport;

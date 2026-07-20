/**
 * Expo config plugin: apply Appearance native patch during prebuild.
 * Invokes the shared Node script so EAS and local prebuild share one path.
 */
const { withDangerousMod } = require('@expo/config-plugins');
const { spawnSync } = require('child_process');
const path = require('path');

function withSafeAppearanceTurboModule(config) {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const script = path.join(
        cfg.modRequest.projectRoot,
        'scripts',
        'apply_appearance_native_patch.cjs'
      );
      console.log('[withSafeAppearanceTurboModule] executing appearance native patch');
      const result = spawnSync(process.execPath, [script, '--require-success'], {
        cwd: cfg.modRequest.projectRoot,
        encoding: 'utf8',
        stdio: 'inherit',
      });
      if (result.status !== 0) {
        throw new Error(
          `[withSafeAppearanceTurboModule] appearance native patch failed (exit ${result.status})`
        );
      }
      console.log('[withSafeAppearanceTurboModule] plugin executed OK');
      return cfg;
    },
  ]);
}

module.exports = withSafeAppearanceTurboModule;

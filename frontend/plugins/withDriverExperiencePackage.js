/**
 * Expo config plugin: ensure Android MainApplication registers DriverExperiencePackage
 * after `expo prebuild` regenerates native project files.
 */
const { withMainApplication } = require('@expo/config-plugins');

const IMPORT_LINE = 'import com.nexryde.app.driver.DriverExperiencePackage';
const ADD_LINE = 'add(DriverExperiencePackage())';

function withDriverExperiencePackage(config) {
  return withMainApplication(config, (cfg) => {
    let contents = cfg.modResults.contents;
    if (!contents.includes(IMPORT_LINE)) {
      if (contents.includes('import com.facebook.react.ReactPackage')) {
        contents = contents.replace(
          'import com.facebook.react.ReactPackage',
          `import com.facebook.react.ReactPackage\n${IMPORT_LINE}`,
        );
      } else {
        contents = `${IMPORT_LINE}\n${contents}`;
      }
    }
    if (!contents.includes(ADD_LINE)) {
      if (contents.includes('PackageList(this).packages.apply {')) {
        contents = contents.replace(
          'PackageList(this).packages.apply {',
          `PackageList(this).packages.apply {\n              ${ADD_LINE}`,
        );
      } else if (contents.includes('PackageList(this).packages')) {
        contents = contents.replace(
          /PackageList\(this\)\.packages/,
          `PackageList(this).packages.apply {\n              ${ADD_LINE}\n            }`,
        );
      } else {
        throw new Error(
          '[withDriverExperiencePackage] Could not locate PackageList registration in MainApplication',
        );
      }
    }
    cfg.modResults.contents = contents;
    return cfg;
  });
}

module.exports = withDriverExperiencePackage;

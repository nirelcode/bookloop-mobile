const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Writes android/local.properties with sdk.dir so Gradle can find the Android SDK
// during local EAS builds without relying on env var inheritance through WSL.
module.exports = function withAndroidLocalProperties(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      // Candidate paths in priority order
      const candidates = [
        process.env.ANDROID_HOME,
        process.env.ANDROID_SDK_ROOT,
        '/home/idan/android-sdk',
        '/root/android-sdk',
      ];

      // Pick the first candidate that actually exists on disk
      const sdkDir = candidates.find(p => {
        try { return p && fs.existsSync(p); } catch { return false; }
      }) || '/home/idan/android-sdk';

      const localPropertiesPath = path.join(
        config.modRequest.platformProjectRoot,
        'local.properties'
      );
      fs.writeFileSync(localPropertiesPath, `sdk.dir=${sdkDir}\n`);
      return config;
    },
  ]);
};

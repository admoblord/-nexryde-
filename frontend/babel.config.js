module.exports = function (api) {
  api.cache(true);
  const isProd = process.env.NODE_ENV === 'production';
  return {
    presets: [
      [
        'babel-preset-expo',
        {
          unstable_transformImportMeta: true,
          // Enable ES module tree-shaking in production
          jsxRuntime: 'automatic',
        },
      ],
    ],
    plugins: [
      [
        'module-resolver',
        {
          root: ['./'],
          alias: {
            '@': './',
          },
          extensions: [
            '.ios.ts',
            '.android.ts',
            '.ts',
            '.ios.tsx',
            '.android.tsx',
            '.tsx',
            '.jsx',
            '.js',
            '.json',
          ],
        },
      ],
      // Strip console.* calls in production to reduce bundle size
      ...(isProd ? [['transform-remove-console', { exclude: ['error', 'warn'] }]] : []),
      // Reanimated plugin must be LAST
      'react-native-reanimated/plugin',
    ],
  };
};

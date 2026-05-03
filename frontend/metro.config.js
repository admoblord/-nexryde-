// metro.config.js
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const { FileStore } = require('metro-cache');

const config = getDefaultConfig(__dirname);

// ── Stable on-disk cache ─────────────────────────────────────────────────────
const root = process.env.METRO_CACHE_ROOT || path.join(__dirname, '.metro-cache');
config.cacheStores = [
  new FileStore({ root: path.join(root, 'cache') }),
];

// ── Build performance ────────────────────────────────────────────────────────
config.maxWorkers = 4;

// ── Tree-shaking: mark side-effect-free packages ─────────────────────────────
// Allows Metro to drop unused exports in production builds
config.transformer = {
  ...config.transformer,
  minifierConfig: {
    // Terser options — aggressive dead-code removal
    compress: {
      drop_console: true,       // strip all console.log/warn/error in prod
      drop_debugger: true,
      pure_getters: true,
      passes: 2,
    },
    mangle: {
      toplevel: false,
    },
    output: {
      ascii_only: true,
      quote_style: 3,
      wrap_iife: true,
    },
  },
};

// ── Exclude web-only & server-only file variants ──────────────────────────────
config.resolver = {
  ...config.resolver,
  // Prefer .native.ts/.native.tsx over .web.ts/.web.tsx for Android/iOS builds
  sourceExts: ['tsx', 'ts', 'jsx', 'js', 'json', 'cjs', 'mjs'],
  // Block test/storybook files from being bundled
  blockList: [
    /.*\/__tests__\/.*/,
    /.*\.test\.(ts|tsx|js|jsx)$/,
    /.*\.spec\.(ts|tsx|js|jsx)$/,
    /.*\.stories\.(ts|tsx|js|jsx)$/,
    /.*\/storybook\/.*/,
  ],
};

module.exports = config;

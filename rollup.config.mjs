/**
 * Rollup Configuration — Cupcake Provider Manager
 *
 * Bundles modular ES source (src/) into a single IIFE for the RisuAI V3
 * iframe sandbox (about:srcdoc, CSP connect-src 'none').
 *
 * Output: dist/provider-manager.js (self-contained, no external imports)
 * The RisuAI plugin header (src/plugin-header.js) is prepended as a banner.
 *
 * The `@update-url` inside the banner is rewritten at build time from
 * the CPM_ENV environment variable (or defaults to test2).
 *
 * Build usage:
 *   CPM_ENV=production npm run build   (production URL)
 *   npm run build                      (test URL — default)
 *   npm run build:production           (shorthand)
 */
import resolve from '@rollup/plugin-node-resolve';
import { readFileSync, writeFileSync } from 'node:fs';

// ── Resolve deployment URL from CPM_ENV ──
const CPM_ENV = process.env.CPM_ENV || 'test2';
const _URL_MAP = {
  production: 'https://cupcake-plugin-manager.vercel.app',
  test: 'https://cupcake-plugin-manager-test.vercel.app',
  test2: 'https://test-2-wheat-omega.vercel.app',
};
const CPM_BASE_URL = _URL_MAP[CPM_ENV] || _URL_MAP.test2;
console.log(`[rollup] CPM_ENV=${CPM_ENV} → ${CPM_BASE_URL}`);

// ── Validate against cpm-url.config.js (consistency check) ──
const urlConfigSrc = readFileSync(
  new URL('./src/cpm-url.config.js', import.meta.url),
  'utf-8',
);
if (!urlConfigSrc.includes(CPM_BASE_URL)) {
  console.warn(`[rollup] ⚠️  CPM_BASE_URL "${CPM_BASE_URL}" not found in src/cpm-url.config.js — ensure URL map is in sync`);
}

// ── Read plugin header and inject the URL ──
let pluginHeader = readFileSync(
  new URL('./src/plugin-header.js', import.meta.url),
  'utf-8',
).trimEnd();

// Replace the @update-url value with the URL from config
pluginHeader = pluginHeader.replace(
  /(@update-url\s+)\S+/,
  `$1${CPM_BASE_URL}/api/main-plugin`,
);

function normalizeEol(text) {
  return String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

export default {
  input: 'src/index.js',
  output: {
    file: 'dist/provider-manager.js',
    format: 'iife',
    name: 'CupcakeProviderManager',
    banner: pluginHeader,
    // No sourcemap — production runtime in iframe sandbox
  },
  plugins: [
    resolve(),
    // ── Build-time CPM_ENV pinning (HD-1) ──
    // The iframe runtime has no reliable process.env, so pin the resolved
    // environment directly inside src/cpm-url.config.js during bundling.
    // This avoids the previous broad string-replacement approach, which could
    // also rewrite comments and the fallback URL map in the final bundle.
    {
      name: 'pin-cpm-env',
      transform(code, id) {
        const normalizedId = id.replace(/\\/g, '/');
        if (!normalizedId.endsWith('/src/cpm-url.config.js')) return null;
        return code.replace(
          'const _env = _resolveEnv();',
          `const _env = '${CPM_ENV}';`,
        );
      },
    },
    {
      name: 'normalize-dist-eol',
      writeBundle(options) {
        if (!options.file) return;
        const outputFile = new URL(`./${options.file}`, import.meta.url);
        const raw = readFileSync(outputFile, 'utf-8');
        const normalized = normalizeEol(raw);
        if (raw !== normalized) {
          writeFileSync(outputFile, normalized, 'utf-8');
        }
      },
    },
  ],
};

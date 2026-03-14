// @ts-check
/**
 * cpm-url.config.js — Single source of truth for the CPM deployment URL.
 *
 * Both `src/lib/endpoints.js` (runtime) and `rollup.config.mjs` (build-time
 * banner injection into plugin-header.js) read from this file.
 *
 * URL is determined by the `CPM_ENV` environment variable:
 *   - CPM_ENV=production  → https://cupcake-plugin-manager.vercel.app
 *   - CPM_ENV=test (or unset) → https://cupcake-plugin-manager-test.vercel.app
 *
 * Build usage:
 *   CPM_ENV=production npm run build   (production)
 *   npm run build                      (test — default)
 *   npm run build:production           (shorthand for production)
 */

const _URLS = {
    production: 'https://cupcake-plugin-manager.vercel.app',
    test: 'https://cupcake-plugin-manager-test.vercel.app',
};

/**
 * Resolve CPM_ENV from environment (Node build) or fall back to 'test'.
 * In the iframe runtime (no process.env), this always evaluates to 'test'.
 * During bundling, Rollup pins the resolved `_env` value directly in the
 * bundled copy of this module so the final artifact stays environment-stable
 * without broad string replacement across the whole bundle.
 * @returns {'production' | 'test'}
 */
function _resolveEnv() {
    try {
        // @ts-ignore — process.env exists only in Node (build-time)
        const env = (typeof process !== 'undefined' && process.env?.CPM_ENV) || '';
        if (env === 'production') return 'production';
    } catch (_) { /* iframe runtime — no process */ }
    return 'test';
}

const _env = _resolveEnv();

/** @type {string} */
export const CPM_BASE_URL = _URLS[_env] || _URLS.test;

/** @type {string} */
export const CPM_ENV = _env;

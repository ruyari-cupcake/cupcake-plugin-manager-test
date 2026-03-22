// @ts-check
/**
 * cpm-url.config.js — Single source of truth for the CPM deployment URL.
 *
 * Both `src/lib/endpoints.js` (runtime) and `rollup.config.mjs` (build-time
 * banner injection into plugin-header.js) read from this file.
 *
 * URL is determined by the `CPM_ENV` environment variable:
 *   - CPM_ENV=production  → https://cupcake-plugin-manager.vercel.app
 *   - CPM_ENV=test         → https://cupcake-plugin-manager-test.vercel.app
 *   - CPM_ENV=test2 (or unset) → https://test-2-gzzwcegiw-preyari94-9916s-projects.vercel.app
 *
 * Build usage:
 *   CPM_ENV=production npm run build   (production)
 *   npm run build                      (test2 — default)
 *   npm run build:production           (shorthand for production)
 */

const _URLS = {
    production: 'https://cupcake-plugin-manager.vercel.app',
    test: 'https://cupcake-plugin-manager-test.vercel.app',
    test2: 'https://test-2-gzzwcegiw-preyari94-9916s-projects.vercel.app',
};

/**
 * Resolve CPM_ENV from environment (Node build) or fall back to 'test2'.
 * In the iframe runtime (no process.env), this always evaluates to 'test2'.
 * During bundling, Rollup pins the resolved `_env` value directly in the
 * bundled copy of this module so the final artifact stays environment-stable
 * without broad string replacement across the whole bundle.
 * @returns {'production' | 'test' | 'test2'}
 */
function _resolveEnv() {
    try {
        // @ts-ignore — process.env exists only in Node (build-time)
        const env = (typeof process !== 'undefined' && process.env?.CPM_ENV) || '';
        if (env === 'production') return 'production';
        if (env === 'test') return 'test';
    } catch (_) { /* iframe runtime — no process */ }
    return 'test2';
}

const _env = _resolveEnv();

/** @type {string} */
export const CPM_BASE_URL = _URLS[_env] || _URLS.test2;

/** @type {string} */
export const CPM_ENV = _env;

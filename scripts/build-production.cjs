/**
 * build-production.cjs — Production build wrapper.
 *
 * Sets CPM_ENV=production and runs the standard build pipeline.
 * Cross-platform (Windows / macOS / Linux) without cross-env dependency.
 *
 * Usage:
 *   npm run build:production
 *   node scripts/build-production.cjs
 */
'use strict';
const { execSync } = require('node:child_process');

process.env.CPM_ENV = 'production';
console.log('[build-production] CPM_ENV=production');

try {
    execSync('npm run build:css && rollup -c rollup.config.mjs', {
        stdio: 'inherit',
        env: { ...process.env, CPM_ENV: 'production' },
    });
} catch (e) {
    process.exit(e.status || 1);
}

#!/usr/bin/env node
'use strict';

/**
 * verify-copilot-version-sync.cjs
 *
 * Ensures Copilot emulation versions in companion files stay in sync
 * with the single source of truth: src/lib/copilot-version-defaults.js.
 *
 * Checked files:
 *   - cpm-copilot-manager.js          (CODE_VERSION, CHAT_VERSION)
 *   - universal-cors-proxy-worker.js   (CODE_VERSION, CHAT_VERSION)
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const p = (...parts) => path.join(ROOT, ...parts);

function readText(filePath) {
    return fs.readFileSync(filePath, 'utf-8');
}

function extractConst(source, name) {
    // Matches: const NAME = 'value'  or  const NAME = "value"
    const re = new RegExp(`(?:export\\s+)?const\\s+${name}\\s*=\\s*['"]([^'"]+)['"]`);
    const m = source.match(re);
    return m ? m[1] : null;
}

const errors = [];

// 1. Read source of truth
const defaultsSrc = readText(p('src', 'lib', 'copilot-version-defaults.js'));
const truthChat = extractConst(defaultsSrc, 'DEFAULT_COPILOT_CHAT_VERSION');
const truthCode = extractConst(defaultsSrc, 'DEFAULT_VSCODE_VERSION');

if (!truthChat || !truthCode) {
    console.error('[verify-copilot-version-sync] Could not read version constants from copilot-version-defaults.js');
    process.exit(1);
}

// 2. Check cpm-copilot-manager.js
const copilotMgrPath = p('cpm-copilot-manager.js');
if (fs.existsSync(copilotMgrPath)) {
    const copilotMgrSrc = readText(copilotMgrPath);
    const mgrChat = extractConst(copilotMgrSrc, 'CHAT_VERSION');
    const mgrCode = extractConst(copilotMgrSrc, 'CODE_VERSION');

    if (mgrChat !== truthChat) {
        errors.push(`cpm-copilot-manager.js CHAT_VERSION mismatch: "${mgrChat}" vs source-of-truth "${truthChat}"`);
    }
    if (mgrCode !== truthCode) {
        errors.push(`cpm-copilot-manager.js CODE_VERSION mismatch: "${mgrCode}" vs source-of-truth "${truthCode}"`);
    }
}

// 3. Check universal-cors-proxy-worker.js
const proxyPath = p('universal-cors-proxy-worker.js');
if (fs.existsSync(proxyPath)) {
    const proxySrc = readText(proxyPath);
    const proxyChat = extractConst(proxySrc, 'CHAT_VERSION');
    const proxyCode = extractConst(proxySrc, 'CODE_VERSION');

    if (proxyChat !== truthChat) {
        errors.push(`universal-cors-proxy-worker.js CHAT_VERSION mismatch: "${proxyChat}" vs source-of-truth "${truthChat}"`);
    }
    if (proxyCode !== truthCode) {
        errors.push(`universal-cors-proxy-worker.js CODE_VERSION mismatch: "${proxyCode}" vs source-of-truth "${truthCode}"`);
    }
}

// 4. Report
if (errors.length > 0) {
    console.error('\n[verify-copilot-version-sync] Version sync check FAILED:\n');
    for (const e of errors) {
        console.error(`  ❌ ${e}`);
    }
    console.error('\n  Source of truth: src/lib/copilot-version-defaults.js');
    console.error('  Update the companion files to match, then re-run.\n');
    process.exit(1);
} else {
    console.log('[verify-copilot-version-sync] ✅ Copilot emulation versions are in sync.');
}

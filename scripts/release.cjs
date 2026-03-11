#!/usr/bin/env node
/**
 * release.cjs — Atomic release pipeline for Cupcake Provider Manager.
 *
 * Combines these previously manual steps into ONE command:
 *   1. Rollup build  →  dist/provider-manager.js
 *   2. Copy dist → root  (if changed)
 *   3. Verify versions.json ↔ actual file header versions match
 *   4. Regenerate update-bundle.json with SHA-256 hashes
 *   5. Run full test suite
 *   6. Produce a release-hash manifest (release-hashes.json)
 *
 * Usage:
 *   node scripts/release.cjs              # full pipeline
 *   node scripts/release.cjs --skip-test  # skip vitest (CI already ran it)
 *   node scripts/release.cjs --dry-run    # verify only, no writes
 *
 * Exit codes:
 *   0  — success
 *   1  — validation or build failure (safe — nothing was partially written)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

// ── CLI flags ──
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const SKIP_TEST = args.includes('--skip-test');

const ROOT = path.resolve(__dirname, '..');
const p = (...segs) => path.join(ROOT, ...segs);

const log = (tag, msg) => console.log(`[release:${tag}] ${msg}`);
const fail = (msg) => { console.error(`\n❌  RELEASE ABORTED: ${msg}\n`); process.exit(1); };

function sha256(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    return crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
}

function sha256str(content) {
    return crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
}

function extractVersionFromHeader(filePath) {
    const head = fs.readFileSync(filePath, 'utf-8').substring(0, 2000);
    const m = head.match(/\/\/\s*@version\s+([^\r\n]+)/i);
    return m ? m[1].trim() : null;
}

// ════════════════════════════════════════════════════════════════
// Step 1: Rollup build
// ════════════════════════════════════════════════════════════════
log('build', 'Running rollup build...');
try {
    execSync('npx rollup -c rollup.config.mjs', { cwd: ROOT, stdio: 'pipe' });
    log('build', '✓ Rollup build succeeded');
} catch (e) {
    fail(`Rollup build failed:\n${e.stderr?.toString() || e.message}`);
}

const distFile = p('dist', 'provider-manager.js');
const rootFile = p('provider-manager.js');

if (!fs.existsSync(distFile)) {
    fail('dist/provider-manager.js not found after build');
}

// ════════════════════════════════════════════════════════════════
// Step 2: Copy dist → root (only if content changed)
// ════════════════════════════════════════════════════════════════
const distHash = sha256(distFile);
const rootExists = fs.existsSync(rootFile);
const rootHash = rootExists ? sha256(rootFile) : '';

if (distHash !== rootHash) {
    if (DRY_RUN) {
        log('copy', `DRY-RUN: would copy dist → root (hash ${distHash.substring(0, 12)}…)`);
    } else {
        fs.copyFileSync(distFile, rootFile);
        log('copy', `✓ Copied dist/provider-manager.js → root (hash ${distHash.substring(0, 12)}…)`);
    }
} else {
    log('copy', '✓ Root file already matches dist (no copy needed)');
}

// ════════════════════════════════════════════════════════════════
// Step 3: Verify versions.json ↔ file header versions
// ════════════════════════════════════════════════════════════════
const versionsPath = p('versions.json');
if (!fs.existsSync(versionsPath)) fail('versions.json not found');

const versions = JSON.parse(fs.readFileSync(versionsPath, 'utf-8'));
const mismatches = [];

for (const [name, info] of Object.entries(versions)) {
    let filePath = p(info.file);
    // For main plugin, fall back to dist/ if root copy doesn't exist yet
    if (!fs.existsSync(filePath) && info.file === 'provider-manager.js') {
        filePath = p('dist', info.file);
    }
    if (!fs.existsSync(filePath)) {
        mismatches.push(`${name}: file ${info.file} not found`);
        continue;
    }
    const headerVer = extractVersionFromHeader(filePath);
    if (headerVer && headerVer !== info.version) {
        mismatches.push(`${name}: versions.json says ${info.version}, file header says ${headerVer}`);
    }
}

if (mismatches.length > 0) {
    console.error('\n⚠️  Version mismatches detected:');
    for (const m of mismatches) console.error(`   → ${m}`);
    fail('Fix version mismatches before releasing.');
}
log('version', `✓ All ${Object.keys(versions).length} entries in versions.json match file headers`);

// ════════════════════════════════════════════════════════════════
// Step 4: Regenerate update-bundle.json with SHA-256
// ════════════════════════════════════════════════════════════════
const outputPath = p('update-bundle.json');
const code = {};
const hashManifest = {};

for (const [name, info] of Object.entries(versions)) {
    let filePath = p(info.file);
    if (!fs.existsSync(filePath) && info.file === 'provider-manager.js') {
        filePath = p('dist', info.file);
    }
    if (!fs.existsSync(filePath)) continue;
    const src = fs.readFileSync(filePath, 'utf-8');
    code[info.file] = src;
    const hash = sha256str(src);
    info.sha256 = hash;
    hashManifest[info.file] = { version: info.version, sha256: hash, size: src.length };
    log('bundle', `  ${info.file} (${(src.length / 1024).toFixed(1)}KB) v${info.version} [sha256:${hash.substring(0, 12)}…]`);
}

const bundle = { versions, code };
const bundleJson = JSON.stringify(bundle, null, 0);

if (DRY_RUN) {
    log('bundle', `DRY-RUN: would write update-bundle.json (${(bundleJson.length / 1024).toFixed(1)}KB)`);
} else {
    fs.writeFileSync(outputPath, bundleJson, 'utf-8');
    log('bundle', `✓ update-bundle.json generated: ${(bundleJson.length / 1024).toFixed(1)}KB (${Object.keys(code).length} files)`);
}

// ════════════════════════════════════════════════════════════════
// Step 5: Run full test suite
// ════════════════════════════════════════════════════════════════
if (SKIP_TEST) {
    log('test', 'Skipped (--skip-test flag)');
} else {
    log('test', 'Running vitest...');
    try {
        const testOutput = execSync('npx vitest run', { cwd: ROOT, stdio: 'pipe' }).toString();
        const passMatch = testOutput.match(/(\d+)\s+passed/);
        log('test', `✓ Tests passed${passMatch ? ` (${passMatch[1]} tests)` : ''}`);
    } catch (e) {
        const stderr = e.stderr?.toString() || '';
        const stdout = e.stdout?.toString() || '';
        fail(`Tests failed:\n${stdout}\n${stderr}`);
    }
}

// ════════════════════════════════════════════════════════════════
// Step 6: Produce release-hashes.json (links private → public)
// ════════════════════════════════════════════════════════════════
const releaseInfo = {
    timestamp: new Date().toISOString(),
    version: versions['Cupcake Provider Manager']?.version || 'unknown',
    files: hashManifest,
    bundleHash: sha256str(bundleJson),
};

const releaseHashPath = p('release-hashes.json');
if (DRY_RUN) {
    log('hashes', `DRY-RUN: would write release-hashes.json`);
} else {
    fs.writeFileSync(releaseHashPath, JSON.stringify(releaseInfo, null, 2), 'utf-8');
    log('hashes', `✓ release-hashes.json written — keep this in your private repo for audit trail`);
}

// ════════════════════════════════════════════════════════════════
// Summary
// ════════════════════════════════════════════════════════════════
console.log(`
${'═'.repeat(60)}
${DRY_RUN ? '🔍 DRY RUN COMPLETE' : '✅ RELEASE PIPELINE COMPLETE'}
${'═'.repeat(60)}
  Version:    ${releaseInfo.version}
  Files:      ${Object.keys(hashManifest).length} hashed
  Bundle:     ${(bundleJson.length / 1024).toFixed(1)}KB [sha256:${releaseInfo.bundleHash.substring(0, 16)}…]
  Tests:      ${SKIP_TEST ? 'skipped' : 'passed'}
${'═'.repeat(60)}
${DRY_RUN ? '' : 'Ready to commit & push. Run: git add -A && git commit -m "release v' + releaseInfo.version + '"'}
`);

#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const p = (...parts) => path.join(ROOT, ...parts);

function normalizeEol(text) {
    return String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function readText(filePath) {
    return normalizeEol(fs.readFileSync(filePath, 'utf-8'));
}

function readJson(filePath) {
    return JSON.parse(readText(filePath));
}

function sha256(text) {
    return crypto.createHash('sha256').update(normalizeEol(text), 'utf-8').digest('hex');
}

function headerVersion(source, label) {
    const match = source.match(/^\/\/@version\s+([^\r\n]+)/m);
    if (!match) throw new Error(`${label}: missing //@version`);
    return match[1].trim();
}

function constVersion(source, label) {
    const match = source.match(/(?:export\s+const|const)\s+CPM_VERSION\s*=\s*'([^']+)'/);
    if (!match) throw new Error(`${label}: missing CPM_VERSION`);
    return match[1].trim();
}

function fail(errors) {
    console.error('\n[verify-release-sync] Release sync check failed:\n');
    for (const err of errors) console.error(`- ${err}`);
    console.error('\nFix the mismatches and rerun node scripts/release.cjs before pushing.\n');
    process.exit(1);
}

const packageJson = readJson(p('package.json'));
const packageLock = readJson(p('package-lock.json'));
const versions = readJson(p('versions.json'));
const releaseHashes = readJson(p('release-hashes.json'));
const updateBundle = readJson(p('update-bundle.json'));

const srcHeader = readText(p('src', 'plugin-header.js'));
const sharedState = readText(p('src', 'lib', 'shared-state.js'));
const rootBundle = readText(p('provider-manager.js'));
const distPath = p('dist', 'provider-manager.js');

if (!fs.existsSync(distPath)) {
    fail(['dist/provider-manager.js is missing. Run npm run build first.']);
}

const distBundle = readText(distPath);
const bundleMain = updateBundle?.versions?.['Cupcake Provider Manager'];
const bundleCode = updateBundle?.code?.['provider-manager.js'];
const hashEntry = releaseHashes?.files?.['provider-manager.js'];
const versionEntry = versions?.['Cupcake Provider Manager'];

const expected = packageJson.version;
const actualRootHash = sha256(rootBundle);
const actualDistHash = sha256(distBundle);
const errors = [];

function expectEqual(label, actual, expectedValue) {
    if (actual !== expectedValue) errors.push(`${label}: expected ${expectedValue}, got ${actual}`);
}

expectEqual('package-lock version', packageLock.version, expected);
expectEqual('package-lock packages[""] version', packageLock.packages?.['']?.version, expected);
expectEqual('src/plugin-header.js version', headerVersion(srcHeader, 'src/plugin-header.js'), expected);
expectEqual('src/lib/shared-state.js CPM_VERSION', constVersion(sharedState, 'src/lib/shared-state.js'), expected);
expectEqual('provider-manager.js header version', headerVersion(rootBundle, 'provider-manager.js'), expected);
expectEqual('provider-manager.js CPM_VERSION', constVersion(rootBundle, 'provider-manager.js'), expected);
expectEqual('dist/provider-manager.js header version', headerVersion(distBundle, 'dist/provider-manager.js'), expected);
expectEqual('dist/provider-manager.js CPM_VERSION', constVersion(distBundle, 'dist/provider-manager.js'), expected);
expectEqual('versions.json main version', versionEntry?.version, expected);
expectEqual('release-hashes.json version', releaseHashes.version, expected);
expectEqual('release-hashes.json provider-manager.js version', hashEntry?.version, expected);
expectEqual('update-bundle.json main version', bundleMain?.version, expected);

if (rootBundle !== distBundle) {
    errors.push('provider-manager.js does not match dist/provider-manager.js');
}
if (bundleCode !== rootBundle) {
    errors.push('update-bundle.json code[provider-manager.js] does not match provider-manager.js');
}
if (bundleCode) {
    expectEqual('update-bundle bundled header version', headerVersion(bundleCode, 'update-bundle code[provider-manager.js]'), expected);
    expectEqual('update-bundle bundled CPM_VERSION', constVersion(bundleCode, 'update-bundle code[provider-manager.js]'), expected);
}

expectEqual('release-hashes provider-manager.js sha256', hashEntry?.sha256, actualRootHash);
expectEqual('update-bundle provider-manager.js sha256', bundleMain?.sha256, actualRootHash);
expectEqual('dist/provider-manager.js sha256 parity', actualDistHash, actualRootHash);

if (errors.length > 0) fail(errors);

console.log(`[verify-release-sync] OK — all release artifacts match v${expected}`);

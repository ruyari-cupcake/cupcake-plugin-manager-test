#!/usr/bin/env node
/**
 * verify-deployment.mjs — Local deployment verification script.
 *
 * Checks that a Vercel deployment is serving production-correct content:
 *   1. /api/versions  → returns valid JSON with expected plugin entries
 *   2. /api/main-plugin → @update-url points to production domain
 *   3. /api/update-bundle → CPM_BASE_URL resolves to production URL
 *
 * Usage:
 *   node scripts/verify-deployment.mjs [BASE_URL]
 *
 * If BASE_URL is omitted, defaults to the production URL.
 *
 * Exit codes:
 *   0 = all checks passed
 *   1 = one or more checks failed
 *   2 = network / unexpected error
 */

const PRODUCTION_DOMAIN = 'cupcake-plugin-manager.vercel.app';
const PRODUCTION_BASE = `https://${PRODUCTION_DOMAIN}`;
const TEST_DOMAINS = [
    'cupcake-plugin-manager-test.vercel.app',
    'test-2-gzzwcegiw-preyari94-9916s-projects.vercel.app',
];

const baseUrl = (process.argv[2] || PRODUCTION_BASE).replace(/\/+$/, '');

// ── Helpers ──────────────────────────────────────────────────

function isProductionUrl(url) {
    return url.includes(PRODUCTION_DOMAIN);
}

function isTestUrl(url) {
    return TEST_DOMAINS.some(d => url.includes(d));
}

function badge(pass) {
    return pass ? '\x1b[32m✔ PASS\x1b[0m' : '\x1b[31m✘ FAIL\x1b[0m';
}

async function fetchJson(endpoint) {
    const url = `${baseUrl}${endpoint}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    return { data: await res.json(), headers: res.headers, status: res.status };
}

async function fetchText(endpoint) {
    const url = `${baseUrl}${endpoint}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    return { data: await res.text(), headers: res.headers, status: res.status };
}

// ── Checks ───────────────────────────────────────────────────

const results = [];

async function checkVersions() {
    console.log('\n─── Check 1: /api/versions ───');
    const { data, headers, status } = await fetchJson('/api/versions');

    const hasEntries = typeof data === 'object' && Object.keys(data).length > 0;
    const hasCPM = 'Cupcake Provider Manager' in data;
    const ct = headers.get('content-type') || '';
    const isJson = ct.includes('application/json');

    console.log(`  Status:       ${status}`);
    console.log(`  Content-Type: ${ct}`);
    console.log(`  Entries:      ${Object.keys(data).length}`);
    console.log(`  Has CPM:      ${hasCPM}`);

    if (hasCPM) {
        const cpm = data['Cupcake Provider Manager'];
        console.log(`  CPM version:  ${cpm.version}`);
        console.log(`  CPM file:     ${cpm.file}`);
    }

    const pass = hasEntries && hasCPM && isJson;
    console.log(`  Result:       ${badge(pass)}`);
    results.push({ name: '/api/versions', pass });
}

async function checkMainPlugin() {
    console.log('\n─── Check 2: /api/main-plugin (@update-url) ───');
    const { data, headers, status } = await fetchText('/api/main-plugin');

    const ct = headers.get('content-type') || '';
    const isJs = ct.includes('javascript');

    // Extract @update-url from plugin header
    const urlMatch = data.match(/\/\/@update-url\s+(\S+)/);
    const updateUrl = urlMatch ? urlMatch[1] : null;

    const isProd = updateUrl ? isProductionUrl(updateUrl) : false;
    const isTest = updateUrl ? isTestUrl(updateUrl) : false;

    console.log(`  Status:       ${status}`);
    console.log(`  Content-Type: ${ct}`);
    console.log(`  @update-url:  ${updateUrl || '(not found)'}`);
    console.log(`  Points to:    ${isProd ? 'PRODUCTION ✓' : isTest ? '⚠ TEST DOMAIN' : '? UNKNOWN DOMAIN'}`);

    // Extract version
    const verMatch = data.match(/\/\/@version\s+(\S+)/);
    if (verMatch) console.log(`  Version:      ${verMatch[1]}`);

    const pass = isJs && isProd;
    console.log(`  Result:       ${badge(pass)}`);
    results.push({ name: '/api/main-plugin @update-url', pass });
}

async function checkUpdateBundle() {
    console.log('\n─── Check 3: /api/update-bundle (CPM_BASE_URL) ───');
    const { data, headers, status } = await fetchJson('/api/update-bundle');

    const ct = headers.get('content-type') || '';
    const isJson = ct.includes('application/json');

    const mainCode = data?.code?.['provider-manager.js'] || '';

    // Check _env value
    const envMatch = mainCode.match(/const\s+_env\s*=\s*['"](\w+)['"]/);
    const envVal = envMatch ? envMatch[1] : null;

    // Check CPM_BASE_URL resolved value by looking for the URL pattern
    const urlsBlock = mainCode.match(/production:\s*'([^']+)'/);
    const prodUrlInCode = urlsBlock ? urlsBlock[1] : null;

    // Check which URL CPM_BASE_URL actually resolves to
    const baseUrlMatch = mainCode.match(/const\s+CPM_BASE_URL\s*=\s*['"]([^'"]+)['"]/);
    let resolvedBaseUrl = baseUrlMatch ? baseUrlMatch[1] : null;

    // If CPM_BASE_URL = _URLS[_env], resolve manually
    if (!resolvedBaseUrl && envVal) {
        const urlMap = {};
        const urlEntries = mainCode.matchAll(/(\w+):\s*'(https:\/\/[^']+)'/g);
        for (const m of urlEntries) urlMap[m[1]] = m[2];
        resolvedBaseUrl = urlMap[envVal] || null;
    }

    const isProd = resolvedBaseUrl ? isProductionUrl(resolvedBaseUrl) : false;
    const isTest = resolvedBaseUrl ? isTestUrl(resolvedBaseUrl) : false;

    console.log(`  Status:          ${status}`);
    console.log(`  Content-Type:    ${ct}`);
    console.log(`  _env value:      ${envVal || '(not found)'}`);
    console.log(`  Resolved URL:    ${resolvedBaseUrl || '(could not resolve)'}`);
    console.log(`  Production URL:  ${prodUrlInCode || '(not found)'}`);
    console.log(`  Points to:       ${isProd ? 'PRODUCTION ✓' : isTest ? '⚠ TEST DOMAIN' : '? UNKNOWN'}`);
    console.log(`  Bundle has code: ${Object.keys(data?.code || {}).length} files`);
    console.log(`  Bundle versions: ${Object.keys(data?.versions || {}).length} entries`);

    const pass = isJson && isProd;
    console.log(`  Result:          ${badge(pass)}`);
    results.push({ name: '/api/update-bundle CPM_BASE_URL', pass });
}

// ── Main ─────────────────────────────────────────────────────

console.log(`\n🧁 Cupcake Deployment Verifier`);
console.log(`  Target: ${baseUrl}`);
console.log(`  Time:   ${new Date().toISOString()}`);

try {
    await checkVersions();
    await checkMainPlugin();
    await checkUpdateBundle();

    console.log('\n═══════════════════════════════════════');
    const allPass = results.every(r => r.pass);
    const failCount = results.filter(r => !r.pass).length;
    if (allPass) {
        console.log('\x1b[32m  ALL CHECKS PASSED — deployment is production-correct.\x1b[0m');
    } else {
        console.log(`\x1b[31m  ${failCount} CHECK(S) FAILED — deployment may be test-contaminated.\x1b[0m`);
        for (const r of results.filter(r => !r.pass)) {
            console.log(`\x1b[31m    ✘ ${r.name}\x1b[0m`);
        }
    }
    console.log('═══════════════════════════════════════\n');
    process.exit(allPass ? 0 : 1);
} catch (err) {
    console.error(`\n\x1b[31m  FATAL: ${err.message}\x1b[0m\n`);
    process.exit(2);
}

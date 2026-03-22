#!/usr/bin/env node
/**
 * verify-production-url.cjs — Origin (프로덕션) push 시 URL 검증 가드.
 *
 * pre-push hook에서 호출되며, push 대상이 프로덕션 레포(origin)일 때만 실행된다.
 * 빌드 산출물에 테스트 서버 URL이 박혀있으면 push를 차단한다.
 *
 * 검증 항목:
 *   1. provider-manager.js @update-url 이 프로덕션 URL인지
 *   2. provider-manager.js 내 _env 이 'production'인지
 *   3. dist/provider-manager.js 도 동일한지
 *
 * 사용법 (pre-push hook에서):
 *   node scripts/verify-production-url.cjs "$HUSKY_GIT_PARAMS" 또는
 *   node scripts/verify-production-url.cjs <remote-name> <remote-url>
 *
 * 직접 실행도 가능:
 *   node scripts/verify-production-url.cjs          → 현재 파일 상태 검증
 *   node scripts/verify-production-url.cjs --force  → 항상 프로덕션 검증 수행
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const p = (...parts) => path.join(ROOT, ...parts);

// ── Constants ──
const PRODUCTION_DOMAIN = 'cupcake-plugin-manager.vercel.app';
const TEST_DOMAIN = 'cupcake-plugin-manager-test.vercel.app';
const TEST2_DOMAIN = 'test-2-gzzwcegiw-preyari94-9916s-projects.vercel.app';
const PRODUCTION_UPDATE_URL = `https://${PRODUCTION_DOMAIN}/api/main-plugin`;
const TEST_UPDATE_URL = `https://${TEST_DOMAIN}/api/main-plugin`;
const TEST2_UPDATE_URL = `https://${TEST2_DOMAIN}/api/main-plugin`;
const PRODUCTION_GITHUB_REPO = 'ruyari-cupcake/cupcake-plugin-manager';

// Production remote patterns (case-insensitive)
const PRODUCTION_REMOTE_PATTERNS = [
    /ruyari-cupcake\/cupcake-plugin-manager(?:\.git)?$/i,  // NOT cupcake-plugin-manager-test
    /\/cupcake-plugin-manager(?:\.git)?$/i,
];
const TEST_REMOTE_PATTERNS = [
    /cupcake-plugin-manager-test2/i,
    /cupcake-plugin-manager-test/i,
];

function normalizeEol(text) {
    return String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function readText(filePath) {
    if (!fs.existsSync(filePath)) return null;
    return normalizeEol(fs.readFileSync(filePath, 'utf-8'));
}

/**
 * Determine if this push is targeting the production remote.
 * Git pre-push hook receives: <remote-name> <remote-url> via stdin lines:
 *   <local-ref> <local-sha> <remote-ref> <remote-sha>
 * But husky passes remote name and URL as arguments.
 */
function isProductionPush() {
    // --force flag: always run production checks
    if (process.argv.includes('--force')) return true;

    // Check HUSKY environment or direct arguments
    const remoteArg = process.argv[2] || process.env.HUSKY_GIT_REMOTE || '';
    const urlArg = process.argv[3] || process.env.HUSKY_GIT_PARAMS || '';

    // If remote name is 'origin', check the URL
    if (remoteArg === 'origin') return true;

    // Check URL patterns
    const combinedArgs = `${remoteArg} ${urlArg}`;
    if (TEST_REMOTE_PATTERNS.some(pat => pat.test(combinedArgs))) return false;
    if (PRODUCTION_REMOTE_PATTERNS.some(pat => pat.test(combinedArgs))) return true;

    return false;
}

function extractUpdateUrl(source) {
    const match = source.match(/^\/\/@update-url\s+(\S+)/m);
    return match ? match[1].trim() : null;
}

function extractEnv(source) {
    const match = source.match(/const _env = '([^']+)'/);
    return match ? match[1].trim() : null;
}

function fail(errors) {
    console.error('');
    console.error('╔══════════════════════════════════════════════════════════════╗');
    console.error('║  ⛔ PRODUCTION URL VERIFICATION FAILED — PUSH BLOCKED ⛔   ║');
    console.error('╠══════════════════════════════════════════════════════════════╣');
    console.error('║                                                              ║');
    console.error('║  본서버(origin)에 테스트 서버 URL이 포함된 빌드를 push하려  ║');
    console.error('║  했습니다. 이대로 배포하면 사용자가 테스트 서버를 바라봅니다. ║');
    console.error('║                                                              ║');
    console.error('╚══════════════════════════════════════════════════════════════╝');
    console.error('');
    for (const err of errors) {
        console.error(`  ❌ ${err}`);
    }
    console.error('');
    console.error('해결 방법:');
    console.error('  1. $env:CPM_ENV="production"; npm run build');
    console.error('     또는 npm run build:production');
    console.error('  2. node scripts/release.cjs');
    console.error('  3. git add -A && git commit --amend --no-edit');
    console.error('  4. git push origin main');
    console.error('');
    process.exit(1);
}

// ── Main ──
function main() {
    const isProd = isProductionPush();
    if (!isProd) {
        // Test remote push — skip production URL verification
        return;
    }

    console.log('[verify-production-url] 프로덕션 push 감지 — URL 검증 시작...');

    const errors = [];

    // Check root provider-manager.js
    const rootBundle = readText(p('provider-manager.js'));
    if (!rootBundle) {
        fail(['provider-manager.js가 존재하지 않습니다.']);
        return;
    }

    const rootUpdateUrl = extractUpdateUrl(rootBundle);
    const rootEnv = extractEnv(rootBundle);

    if (!rootUpdateUrl) {
        errors.push('provider-manager.js에서 @update-url을 찾을 수 없습니다.');
    } else if (rootUpdateUrl.includes(TEST_DOMAIN) || rootUpdateUrl.includes(TEST2_DOMAIN)) {
        errors.push(
            `provider-manager.js @update-url이 테스트 서버를 가리킵니다:` +
            `\n    현재: ${rootUpdateUrl}` +
            `\n    필요: ${PRODUCTION_UPDATE_URL}`
        );
    } else if (!rootUpdateUrl.includes(PRODUCTION_DOMAIN)) {
        errors.push(`provider-manager.js @update-url이 알 수 없는 도메인입니다: ${rootUpdateUrl}`);
    }

    if (!rootEnv) {
        errors.push('provider-manager.js에서 _env 값을 찾을 수 없습니다.');
    } else if (rootEnv !== 'production') {
        errors.push(
            `provider-manager.js의 _env가 '${rootEnv}'입니다 (expected: 'production')` +
            `\n    → 런타임 API 호출이 ${rootEnv === 'test' ? '테스트' : '알 수 없는'} 서버로 갑니다.`
        );
    }

    // Check dist/provider-manager.js
    const distBundle = readText(p('dist', 'provider-manager.js'));
    if (distBundle) {
        const distUpdateUrl = extractUpdateUrl(distBundle);
        const distEnv = extractEnv(distBundle);

        if (distUpdateUrl && (distUpdateUrl.includes(TEST_DOMAIN) || distUpdateUrl.includes(TEST2_DOMAIN))) {
            errors.push(
                `dist/provider-manager.js @update-url이 테스트 서버를 가리킵니다:` +
                `\n    현재: ${distUpdateUrl}` +
                `\n    필요: ${PRODUCTION_UPDATE_URL}`
            );
        }
        if (distEnv && distEnv !== 'production') {
            errors.push(`dist/provider-manager.js의 _env가 '${distEnv}'입니다 (expected: 'production')`);
        }
    }

    // Check update-bundle.json embedded code
    const updateBundleRaw = readText(p('update-bundle.json'));
    if (updateBundleRaw) {
        try {
            const updateBundle = JSON.parse(updateBundleRaw);
            const bundledCode = updateBundle?.code?.['provider-manager.js'];
            if (bundledCode) {
                const bundledUpdateUrl = extractUpdateUrl(bundledCode);
                const bundledEnv = extractEnv(bundledCode);

                if (bundledUpdateUrl && (bundledUpdateUrl.includes(TEST_DOMAIN) || bundledUpdateUrl.includes(TEST2_DOMAIN))) {
                    errors.push(
                        `update-bundle.json 내 provider-manager.js 코드의 @update-url이 테스트 서버입니다:` +
                        `\n    현재: ${bundledUpdateUrl}`
                    );
                }
                if (bundledEnv && bundledEnv !== 'production') {
                    errors.push(
                        `update-bundle.json 내 provider-manager.js 코드의 _env가 '${bundledEnv}'입니다`
                    );
                }
            }
        } catch (_) {
            errors.push('update-bundle.json 파싱 실패');
        }
    }

    // Check sub-plugin @update-url (GitHub raw URLs should point to prod repo)
    const glob = require('node:path');
    const subPlugins = fs.readdirSync(ROOT).filter(f => f.startsWith('cpm-') && f.endsWith('.js'));
    const testRepoPatterns = [/cupcake-plugin-manager-test2?\b/i];
    for (const file of subPlugins) {
        const content = readText(p(file));
        if (!content) continue;
        const url = extractUpdateUrl(content);
        if (url && testRepoPatterns.some(pat => pat.test(url))) {
            errors.push(
                `${file}의 @update-url이 테스트 레포를 가리킵니다:` +
                `\n    현재: ${url}` +
                `\n    필요: ${PRODUCTION_GITHUB_REPO} 레포 URL`
            );
        }
    }

    if (errors.length > 0) {
        fail(errors);
    }

    console.log(`[verify-production-url] ✅ 프로덕션 URL 검증 통과`);
    console.log(`  @update-url: ${rootUpdateUrl}`);
    console.log(`  _env: ${rootEnv}`);
    console.log(`  sub-plugins: ${subPlugins.length}개 검증 완료`);
}

main();

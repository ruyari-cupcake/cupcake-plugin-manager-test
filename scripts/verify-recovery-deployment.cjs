#!/usr/bin/env node
/**
 * verify-recovery-deployment.cjs — 교차오염 복구 배포 검증 스크립트
 *
 * test(legacy) 서버가 production URL이 박힌 코드를 서빙하는지 검증한다.
 * 로컬 전용 (배포 번들에 포함되지 않음).
 *
 * Usage:
 *   node scripts/verify-recovery-deployment.cjs                  # 기본: test 서버 검증
 *   node scripts/verify-recovery-deployment.cjs <base-url>       # 커스텀 URL
 *   node scripts/verify-recovery-deployment.cjs --all            # 모든 서버 검증
 */
'use strict';

const SERVERS = {
    test: 'https://cupcake-plugin-manager-test.vercel.app',
    test2: 'https://test-2-wheat-omega.vercel.app',
    production: 'https://cupcake-plugin-manager.vercel.app',
};

const PRODUCTION_DOMAIN = 'cupcake-plugin-manager.vercel.app';
const TEST_DOMAINS = [
    'cupcake-plugin-manager-test.vercel.app',
    'test-2-wheat-omega.vercel.app',
];

async function fetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    return res.json();
}

async function fetchText(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    return res.text();
}

function extractUpdateUrl(code) {
    const m = code.match(/^\/\/@update-url\s+(\S+)/m);
    return m ? m[1].trim() : null;
}

function extractEnv(code) {
    const m = code.match(/const _env = '([^']+)'/);
    return m ? m[1].trim() : null;
}

async function verifyServer(name, baseUrl, expectProduction) {
    const results = [];
    const prefix = `[${name}]`;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`${prefix} 서버: ${baseUrl}`);
    console.log(`${prefix} 기대값: ${expectProduction ? 'production URL' : 'test URL (자체 환경)'}`);
    console.log('='.repeat(60));

    // Check 1: /api/versions
    try {
        const versions = await fetchJson(`${baseUrl}/api/versions`);
        const cpmEntry = versions['Cupcake Provider Manager'];
        if (cpmEntry) {
            console.log(`${prefix} ✅ /api/versions → v${cpmEntry.version}`);
            results.push({ check: 'versions', pass: true });
        } else {
            console.log(`${prefix} ⚠️  /api/versions: CPM 엔트리 없음`);
            results.push({ check: 'versions', pass: false });
        }
    } catch (e) {
        console.log(`${prefix} ❌ /api/versions 실패: ${e.message}`);
        results.push({ check: 'versions', pass: false });
    }

    // Check 2: /api/main-plugin — @update-url
    try {
        const code = await fetchText(`${baseUrl}/api/main-plugin`);
        const updateUrl = extractUpdateUrl(code);
        const env = extractEnv(code);

        if (expectProduction) {
            const urlOk = updateUrl && updateUrl.includes(PRODUCTION_DOMAIN);
            const envOk = env === 'production';
            console.log(`${prefix} ${urlOk ? '✅' : '❌'} /api/main-plugin @update-url: ${updateUrl}`);
            console.log(`${prefix} ${envOk ? '✅' : '❌'} /api/main-plugin _env: ${env}`);
            results.push({ check: 'main-plugin-url', pass: urlOk });
            results.push({ check: 'main-plugin-env', pass: envOk });
        } else {
            console.log(`${prefix} ℹ️  /api/main-plugin @update-url: ${updateUrl}`);
            console.log(`${prefix} ℹ️  /api/main-plugin _env: ${env}`);
            results.push({ check: 'main-plugin-url', pass: true });
            results.push({ check: 'main-plugin-env', pass: true });
        }
    } catch (e) {
        console.log(`${prefix} ❌ /api/main-plugin 실패: ${e.message}`);
        results.push({ check: 'main-plugin-url', pass: false });
        results.push({ check: 'main-plugin-env', pass: false });
    }

    // Check 3: /api/update-bundle — 번들 내 코드 검증
    try {
        const bundle = await fetchJson(`${baseUrl}/api/update-bundle`);
        const pmCode = bundle?.code?.['provider-manager.js'];
        if (pmCode) {
            const bundleUrl = extractUpdateUrl(pmCode);
            const bundleEnv = extractEnv(pmCode);

            if (expectProduction) {
                const urlOk = bundleUrl && bundleUrl.includes(PRODUCTION_DOMAIN);
                const envOk = bundleEnv === 'production';
                console.log(`${prefix} ${urlOk ? '✅' : '❌'} update-bundle @update-url: ${bundleUrl}`);
                console.log(`${prefix} ${envOk ? '✅' : '❌'} update-bundle _env: ${bundleEnv}`);
                results.push({ check: 'bundle-url', pass: urlOk });
                results.push({ check: 'bundle-env', pass: envOk });
            } else {
                console.log(`${prefix} ℹ️  update-bundle @update-url: ${bundleUrl}`);
                console.log(`${prefix} ℹ️  update-bundle _env: ${bundleEnv}`);
                results.push({ check: 'bundle-url', pass: true });
                results.push({ check: 'bundle-env', pass: true });
            }
        } else {
            console.log(`${prefix} ❌ update-bundle에 provider-manager.js 코드 없음`);
            results.push({ check: 'bundle-url', pass: false });
            results.push({ check: 'bundle-env', pass: false });
        }
    } catch (e) {
        console.log(`${prefix} ❌ /api/update-bundle 실패: ${e.message}`);
        results.push({ check: 'bundle-url', pass: false });
        results.push({ check: 'bundle-env', pass: false });
    }

    const passed = results.filter(r => r.pass).length;
    const total = results.length;
    const allPassed = passed === total;
    console.log(`\n${prefix} 결과: ${passed}/${total} ${allPassed ? '✅ PASS' : '❌ FAIL'}`);
    return allPassed;
}

async function main() {
    const arg = process.argv[2];

    if (arg === '--all') {
        console.log('🔍 모든 서버 검증 시작...\n');
        const testOk = await verifyServer('test (legacy)', SERVERS.test, true); // recovery: must serve prod
        const test2Ok = await verifyServer('test2', SERVERS.test2, false);       // own env
        const prodOk = await verifyServer('production', SERVERS.production, true);

        console.log('\n' + '='.repeat(60));
        console.log('📊 전체 결과:');
        console.log(`  test (legacy):  ${testOk ? '✅ production URL 서빙 중 (복구 정상)' : '❌ 복구 미완료'}`);
        console.log(`  test2:          ${test2Ok ? '✅ 정상' : '❌ 문제 있음'}`);
        console.log(`  production:     ${prodOk ? '✅ 정상' : '❌ 문제 있음'}`);

        process.exit(testOk && test2Ok && prodOk ? 0 : 1);
    } else {
        const baseUrl = arg || SERVERS.test;
        const expectProd = baseUrl === SERVERS.test || baseUrl === SERVERS.production;
        const ok = await verifyServer('검증', baseUrl, expectProd);
        process.exit(ok ? 0 : 1);
    }
}

main().catch(e => {
    console.error('❌ 스크립트 에러:', e.message);
    process.exit(2);
});

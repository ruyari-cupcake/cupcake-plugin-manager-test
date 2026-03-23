/**
 * production-url-guard.test.js — Origin (프로덕션) push 시 테스트 URL 차단 테스트.
 *
 * 이 테스트는 빌드된 산출물(provider-manager.js, dist/provider-manager.js,
 * update-bundle.json)에 테스트 서버 URL이 활성 엔드포인트로 박혀있는지 검증한다.
 *
 * URL 맵(production/test 양쪽 URL이 문자열 리터럴로 존재하는 부분)은 허용하되,
 * 실제 런타임에 사용되는 @update-url과 _env 값이 빌드 환경과 일치하는지 확인한다.
 *
 * 2026-03-15 사고 재발 방지를 위해 추가됨.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';

const PRODUCTION_DOMAIN = 'cupcake-plugin-manager.vercel.app';
const TEST_DOMAIN = 'cupcake-plugin-manager-test.vercel.app';
const TEST2_DOMAIN = 'test-2-wheat-omega.vercel.app';
const ALL_TEST_DOMAINS = [TEST_DOMAIN, TEST2_DOMAIN];

const rootBundlePath = new URL('../provider-manager.js', import.meta.url);
const distBundlePath = new URL('../dist/provider-manager.js', import.meta.url);
const updateBundlePath = new URL('../update-bundle.json', import.meta.url);

const rootBundle = readFileSync(rootBundlePath, 'utf-8');
const distBundle = existsSync(distBundlePath)
    ? readFileSync(distBundlePath, 'utf-8')
    : null;
const updateBundle = JSON.parse(readFileSync(updateBundlePath, 'utf-8'));

function extractUpdateUrl(source) {
    const match = source.match(/^\/\/@update-url\s+(\S+)/m);
    return match ? match[1].trim() : null;
}

function extractEnv(source) {
    const match = source.match(/const _env = '([^']+)'/);
    return match ? match[1].trim() : null;
}

// Determine expected environment from the built bundle
const builtEnv = extractEnv(rootBundle) || 'test2';

function containsAnyTestDomain(url) {
    return ALL_TEST_DOMAINS.some(d => url.includes(d));
}

describe('production URL guard (2026-03-15 사고 재발 방지)', () => {
    it('root provider-manager.js @update-url matches the build environment', () => {
        const url = extractUpdateUrl(rootBundle);
        expect(url).toBeTruthy();
        if (builtEnv === 'production') {
            expect(url).toContain(PRODUCTION_DOMAIN);
            expect(containsAnyTestDomain(url)).toBe(false);
        } else {
            expect(containsAnyTestDomain(url)).toBe(true);
        }
    });

    it('root provider-manager.js _env matches the build environment', () => {
        const env = extractEnv(rootBundle);
        expect(env).toBe(builtEnv);
    });

    it('dist/provider-manager.js (if exists) matches the root bundle environment', () => {
        if (!distBundle) return; // skip if dist doesn't exist
        const distUrl = extractUpdateUrl(distBundle);
        const distEnvValue = extractEnv(distBundle);

        expect(distUrl).toBeTruthy();
        expect(distEnvValue).toBe(builtEnv);

        if (builtEnv === 'production') {
            expect(distUrl).toContain(PRODUCTION_DOMAIN);
            expect(containsAnyTestDomain(distUrl)).toBe(false);
        } else {
            expect(containsAnyTestDomain(distUrl)).toBe(true);
        }
    });

    it('update-bundle.json embedded provider-manager.js matches the build environment', () => {
        const bundledCode = updateBundle?.code?.['provider-manager.js'];
        expect(bundledCode).toBeTruthy();

        const bundledUrl = extractUpdateUrl(bundledCode);
        const bundledEnv = extractEnv(bundledCode);

        expect(bundledUrl).toBeTruthy();
        expect(bundledEnv).toBe(builtEnv);

        if (builtEnv === 'production') {
            expect(bundledUrl).toContain(PRODUCTION_DOMAIN);
            expect(containsAnyTestDomain(bundledUrl)).toBe(false);
        } else {
            expect(containsAnyTestDomain(bundledUrl)).toBe(true);
        }
    });

    it('all three artifacts agree on the build environment', () => {
        const rootEnv = extractEnv(rootBundle);
        const bundledEnv = extractEnv(updateBundle?.code?.['provider-manager.js'] || '');

        expect(rootEnv).toBeTruthy();
        expect(bundledEnv).toBeTruthy();
        expect(rootEnv).toBe(bundledEnv);

        if (distBundle) {
            const distEnvValue = extractEnv(distBundle);
            expect(distEnvValue).toBe(rootEnv);
        }
    });

    // This test specifically guards against the 2026-03-15 scenario:
    // production build environment but test URLs in the output
    it('CRITICAL: production _env must not have test URLs, test _env must not have production URLs in @update-url', () => {
        const url = extractUpdateUrl(rootBundle);
        const env = extractEnv(rootBundle);

        if (env === 'production') {
            expect(containsAnyTestDomain(url), 'production 빌드인데 @update-url이 테스트 서버를 가리킴!').toBe(false);
            expect(url, 'production 빌드인데 @update-url이 프로덕션 서버가 아님!').toContain(PRODUCTION_DOMAIN);
        }
        if (env === 'test' || env === 'test2') {
            expect(url, 'test 빌드인데 @update-url이 프로덕션 서버를 가리킴!').not.toContain(PRODUCTION_DOMAIN);
            expect(containsAnyTestDomain(url), 'test 빌드인데 @update-url이 테스트 서버가 아님!').toBe(true);
        }
    });

    it('sub-plugin @update-url must match build environment repo', () => {
        const rootDir = new URL('..', import.meta.url);
        const subPlugins = readdirSync(rootDir)
            .filter(f => f.startsWith('cpm-') && f.endsWith('.js'));

        const env = extractEnv(rootBundle);
        // In production: must NOT point to test repos
        // In test/test2: must point to the matching test repo
        const issues = [];

        if (env === 'production') {
            const testRepoPattern = /cupcake-plugin-manager-test2?\b/i;
            for (const file of subPlugins) {
                const content = readFileSync(new URL(`../${file}`, import.meta.url), 'utf-8');
                const url = extractUpdateUrl(content);
                if (url && testRepoPattern.test(url)) {
                    issues.push(`${file}: production인데 @update-url이 테스트 레포를 가리킴 → ${url}`);
                }
            }
        } else if (env === 'test2') {
            for (const file of subPlugins) {
                const content = readFileSync(new URL(`../${file}`, import.meta.url), 'utf-8');
                const url = extractUpdateUrl(content);
                if (url && /cupcake-plugin-manager\/main\//.test(url) && !/cupcake-plugin-manager-test2\/main\//.test(url)) {
                    issues.push(`${file}: test2인데 @update-url이 origin 레포를 가리킴 → ${url}`);
                }
            }
        }

        expect(issues, `서브 플러그인 @update-url 환경 불일치:\n${issues.join('\n')}`).toHaveLength(0);
    });

    it('rollup URL map and cpm-url.config.js URL map must contain the same domains', () => {
        const rollupSrc = readFileSync(new URL('../rollup.config.mjs', import.meta.url), 'utf-8');
        const urlConfigSrc = readFileSync(new URL('../src/cpm-url.config.js', import.meta.url), 'utf-8');

        // Extract domains from both files
        for (const domain of [PRODUCTION_DOMAIN, TEST_DOMAIN, TEST2_DOMAIN]) {
            expect(rollupSrc, `rollup.config.mjs에 ${domain} 누락`).toContain(domain);
            expect(urlConfigSrc, `cpm-url.config.js에 ${domain} 누락`).toContain(domain);
        }
    });
});

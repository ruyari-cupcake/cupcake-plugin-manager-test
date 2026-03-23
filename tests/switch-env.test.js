/**
 * switch-env integration test
 *
 * switch-env.cjs를 실제 실행하여 서브플러그인 @update-url이
 * 올바르게 전환되는지 검증한다.
 *
 * 테스트가 실제 cpm-*.js 파일을 변경하므로
 * beforeAll/afterAll에서 원본 내용을 백업/복구한다.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const SCRIPT = join(ROOT, 'scripts', 'switch-env.cjs');
const subPlugins = readdirSync(ROOT).filter(f => f.startsWith('cpm-') && f.endsWith('.js'));

// 환경별 레포 경로 패턴
const ENV_REPO_PATTERN = {
    production: /cupcake-plugin-manager\/main\//,
    test: /cupcake-plugin-manager-test\/main\//,
    test2: /cupcake-plugin-manager-test2\/main\//,
};

/** Extract @update-url from source */
function extractUpdateUrl(content) {
    const m = content.match(/^\/\/@update-url\s+(\S+)/m);
    return m ? m[1] : null;
}

// Back up original content so we can restore after all tests
/** @type {Map<string, string>} */
const originals = new Map();

beforeAll(() => {
    for (const file of subPlugins) {
        originals.set(file, readFileSync(join(ROOT, file), 'utf-8'));
    }
});

afterAll(() => {
    // Restore originals
    for (const [file, content] of originals) {
        writeFileSync(join(ROOT, file), content, 'utf-8');
    }
});

function runSwitch(env) {
    return execSync(`node "${SCRIPT}" ${env}`, { encoding: 'utf-8', cwd: ROOT });
}

function runCheck() {
    return execSync(`node "${SCRIPT}" --check`, { encoding: 'utf-8', cwd: ROOT });
}

describe('switch-env.cjs integration', () => {
    it('--check returns current environment info without modifying files', () => {
        const before = subPlugins.map(f => readFileSync(join(ROOT, f), 'utf-8'));
        const output = runCheck();
        const after = subPlugins.map(f => readFileSync(join(ROOT, f), 'utf-8'));

        expect(output).toContain('현재 환경 상태');
        // No file should change
        for (let i = 0; i < subPlugins.length; i++) {
            expect(after[i]).toBe(before[i]);
        }
    });

    it('switches all sub-plugins to production', () => {
        const output = runSwitch('production');
        expect(output).toContain('production');

        for (const file of subPlugins) {
            const content = readFileSync(join(ROOT, file), 'utf-8');
            const url = extractUpdateUrl(content);
            expect(url, `${file} should point to production repo`).toMatch(ENV_REPO_PATTERN.production);
            expect(url, `${file} should NOT contain test2`).not.toMatch(/cupcake-plugin-manager-test2/);
        }
    });

    it('switches all sub-plugins to test', () => {
        runSwitch('test');

        for (const file of subPlugins) {
            const content = readFileSync(join(ROOT, file), 'utf-8');
            const url = extractUpdateUrl(content);
            expect(url, `${file} should point to test repo`).toMatch(ENV_REPO_PATTERN.test);
        }
    });

    it('switches all sub-plugins back to test2', () => {
        runSwitch('test2');

        for (const file of subPlugins) {
            const content = readFileSync(join(ROOT, file), 'utf-8');
            const url = extractUpdateUrl(content);
            expect(url, `${file} should point to test2 repo`).toMatch(ENV_REPO_PATTERN.test2);
        }
    });

    it('roundtrip: test2 → production → test2 produces identical files', () => {
        // Ensure we start at test2
        runSwitch('test2');
        const beforeContents = subPlugins.map(f => readFileSync(join(ROOT, f), 'utf-8'));

        // Switch to production and back
        runSwitch('production');
        runSwitch('test2');
        const afterContents = subPlugins.map(f => readFileSync(join(ROOT, f), 'utf-8'));

        for (let i = 0; i < subPlugins.length; i++) {
            expect(afterContents[i], `${subPlugins[i]} should match after roundtrip`).toBe(beforeContents[i]);
        }
    });

    it('skips files already at the target environment', () => {
        runSwitch('test2'); // ensure test2
        const output = runSwitch('test2'); // run again
        expect(output).toContain('이미 일치');
        // Should report 0 changed
        expect(output).toMatch(/0개 변경/);
    });

    it('rejects invalid environment argument', () => {
        expect(() => {
            execSync(`node "${SCRIPT}" invalid_env`, { encoding: 'utf-8', cwd: ROOT, stdio: 'pipe' });
        }).toThrow();
    });

    it('rejects missing argument', () => {
        expect(() => {
            execSync(`node "${SCRIPT}"`, { encoding: 'utf-8', cwd: ROOT, stdio: 'pipe' });
        }).toThrow();
    });
});

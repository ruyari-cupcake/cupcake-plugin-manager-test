#!/usr/bin/env node
/**
 * switch-env.cjs — 환경(production/test/test2) 전환 스크립트.
 *
 * 서브플러그인 11개 + 메인 플러그인 헤더의 @update-url을 대상 환경 레포로
 * 일괄 변경하고, 검증까지 수행한다.
 *
 * Usage:
 *   node scripts/switch-env.cjs production   # 프로덕션으로 전환
 *   node scripts/switch-env.cjs test2        # test2로 전환 (기본)
 *   node scripts/switch-env.cjs test         # 레거시 test로 전환
 *   node scripts/switch-env.cjs --check      # 현재 상태만 출력 (변경 없음)
 *
 * 이 스크립트는 소스 파일(@update-url)만 변경한다.
 * 번들 산출물(provider-manager.js, update-bundle.json)은
 * `node scripts/release.cjs`로 다시 빌드해야 반영된다.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const p = (...segs) => path.join(ROOT, ...segs);

// ── 환경별 레포 매핑 ──
const ENV_REPO = {
    production: 'cupcake-plugin-manager',
    test:       'cupcake-plugin-manager-test',
    test2:      'cupcake-plugin-manager-test2',
};

const VALID_ENVS = Object.keys(ENV_REPO);
const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/ruyari-cupcake';

// ── CLI 파싱 ──
const arg = process.argv[2];
const isCheck = arg === '--check';
const targetEnv = isCheck ? null : arg;

if (!isCheck && (!targetEnv || !VALID_ENVS.includes(targetEnv))) {
    console.error(`Usage: node scripts/switch-env.cjs <${VALID_ENVS.join('|')}>`);
    console.error('       node scripts/switch-env.cjs --check');
    process.exit(1);
}

// ── 서브플러그인 목록 ──
const subPlugins = fs.readdirSync(ROOT)
    .filter(f => f.startsWith('cpm-') && f.endsWith('.js'));

// ── URL 정규식 ──
const UPDATE_URL_RE = /^(\/\/@update-url\s+)https:\/\/raw\.githubusercontent\.com\/ruyari-cupcake\/cupcake-plugin-manager(?:-test2?)?\/main\/(\S+)/m;

/**
 * 파일에서 현재 환경을 감지한다.
 * @param {string} content
 * @returns {{ env: string|null, url: string|null }}
 */
function detectEnv(content) {
    const m = content.match(UPDATE_URL_RE);
    if (!m) return { env: null, url: null };
    const url = m[0].replace(/^\/\/@update-url\s+/, '');
    for (const [env, repo] of Object.entries(ENV_REPO)) {
        if (url.includes(`/${repo}/`)) return { env, url };
    }
    return { env: null, url };
}

// ── --check 모드 ──
if (isCheck) {
    console.log('[switch-env] 현재 환경 상태:\n');
    const header = p('src', 'plugin-header.js');
    if (fs.existsSync(header)) {
        const { env, url } = detectEnv(fs.readFileSync(header, 'utf-8'));
        console.log(`  plugin-header.js: ${env || '???'} (${url || 'N/A'})`);
    }
    for (const file of subPlugins) {
        const { env, url } = detectEnv(fs.readFileSync(p(file), 'utf-8'));
        console.log(`  ${file}: ${env || '???'} (${url || 'N/A'})`);
    }
    process.exit(0);
}

// ── 전환 수행 ──
const targetRepo = ENV_REPO[targetEnv];
let changed = 0;
let skipped = 0;
const errors = [];

console.log(`[switch-env] 환경 전환: → ${targetEnv} (${targetRepo})\n`);

// 1. 서브플러그인 @update-url 변경
for (const file of subPlugins) {
    const filePath = p(file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const { env: currentEnv } = detectEnv(content);

    if (currentEnv === targetEnv) {
        skipped++;
        continue;
    }

    const newContent = content.replace(
        UPDATE_URL_RE,
        `$1${GITHUB_RAW_BASE}/${targetRepo}/main/$2`,
    );

    if (newContent === content) {
        errors.push(`  ${file}: @update-url 패턴 매칭 실패`);
        continue;
    }

    fs.writeFileSync(filePath, newContent, 'utf-8');
    console.log(`  ✓ ${file}: ${currentEnv || '???'} → ${targetEnv}`);
    changed++;
}

// 2. 메인 플러그인 헤더 @update-url (Vercel 도메인, not GitHub raw)
//    → 이것은 rollup이 빌드 시 자동 주입하므로 경고만 출력
const headerPath = p('src', 'plugin-header.js');
if (fs.existsSync(headerPath)) {
    console.log(`\n  ℹ plugin-header.js @update-url은 rollup 빌드 시 CPM_ENV=${targetEnv}에 맞게 자동 주입됩니다.`);
}

// ── 결과 출력 ──
console.log(`\n[switch-env] 완료: ${changed}개 변경, ${skipped}개 이미 일치`);

if (errors.length > 0) {
    console.error('\n[switch-env] ⚠️  오류:');
    errors.forEach(e => console.error(e));
    process.exit(1);
}

// ── 후속 안내 ──
console.log('\n[switch-env] 다음 단계:');
console.log(`  1. CPM_ENV=${targetEnv} node scripts/release.cjs --skip-test`);
console.log(`  2. git add -A && git commit -m "switch to ${targetEnv}"`);
console.log(`  3. git push ${targetEnv === 'production' ? 'origin' : targetEnv} main`);

if (targetEnv === 'production') {
    console.log('\n  ⚠️  프로덕션 전환! push 전 반드시 확인:');
    console.log('     - npm run verify:production-url');
    console.log('     - provider-manager.js @update-url이 cupcake-plugin-manager.vercel.app인지 확인');
}

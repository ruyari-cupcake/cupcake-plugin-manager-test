# Copilot Instructions

## 언어
- 사용자와의 대화는 한국어로 진행한다.
- 코드, 커밋 메시지, 주석은 영어로 작성한다.

## 작업 자동화 정책

### 자동 수행 (별도 확인 불필요)
- 테스트 실행 (`npm test`, `npm run test:coverage`, 개별 테스트 등)
- 빌드 (`npm run build`, `npm run build:production`)
- 릴리즈 검증 (`npm run verify:release-sync`)
- 코드 수정, 파일 생성/편집
- 로컬 `git add` 및 `git commit`

### 반드시 사용자 허락 필요
- **`git push`** — 원격 저장소 반영은 어떤 목적이든 (테스트, 검증, 릴리즈 포함) 반드시 현재 대화에서 사용자가 명시적으로 요청한 경우에만 수행한다.
- GitHub 릴리즈 생성, PR 생성, 원격 브랜치 조작 등 원격 저장소에 영향을 주는 모든 작업.

### 커밋 규칙
- 작업 단위별로 의미 있는 커밋 메시지를 작성한다.
- 커밋 메시지 형식: `type: short description` (예: `fix: resolve HD-1 bundle env pinning`)
- 타입: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `build`

## 프로젝트 컨텍스트

### 빌드 환경
- `CPM_ENV` 환경변수로 `test` / `production` 전환
- 기본 빌드(`npm run build`)는 test 환경
- `npm run build:production`은 production 환경
- 소스 `src/plugin-header.js`의 `@update-url`은 항상 test URL 유지 (빌드 시 배너에서 덮어씀)

### 테스트/검증 흐름
1. `npm test` — 전체 테스트
2. `npm run test:coverage` — 커버리지 포함
3. `npm run verify:release-sync` — 릴리즈 아티팩트 정합성
4. `node scripts/release.cjs` — 전체 릴리즈 파이프라인 (production 포함)

### readiness audit 관련 추가 규칙
- `src/lib/fetch-custom.js`, `src/lib/smart-fetch.js`, `src/lib/auto-updater.js`, `src/cpm-url.config.js`, `rollup.config.mjs`를 수정했다면 `npm run test:coverage`까지 실행한다.
- 브랜치 커버리지는 현재 기준 `90%` 이상 유지가 목표다.
- production 산출물이 필요하면 `npm run build:production` 또는 동일 쉘에서 `CPM_ENV=production` 후 `node scripts/release.cjs`를 실행한다.
- `node scripts/release.cjs`는 현재 셸의 `CPM_ENV`를 그대로 사용하므로, production/test 전환 시 같은 셸에서 연속 실행하지 않도록 주의한다.

### 주요 파일
- `src/cpm-url.config.js` — 환경별 URL 단일 소스
- `src/lib/endpoints.js` — 런타임 엔드포인트 상수
- `rollup.config.mjs` — 빌드 시 환경 고정 및 배너 주입
- `scripts/release.cjs` — 릴리즈 파이프라인
- `scripts/build-production.cjs` — production 빌드 래퍼

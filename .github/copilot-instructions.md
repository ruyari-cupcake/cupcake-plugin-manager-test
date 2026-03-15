# Copilot Instructions

---

## ⛔⛔⛔ 최우선 규칙 — git push 대상 ⛔⛔⛔

> **이 규칙은 이 문서의 다른 모든 규칙보다 우선한다.**
> **push 명령을 실행하기 전에 반드시 이 섹션을 다시 읽어라.**

### 기본 push 대상은 항상 `test` (테스트서버)

```
git push test main          ← 기본. 항상 이것만 사용
git push origin main        ← 금지. 사용자가 "본서버" "origin" "프로덕션"이라고 명시한 경우에만
```

### 절대 규칙

1. **`git push`를 실행할 때 리모트를 생략하지 마라.** 반드시 `git push test main` 형태로 리모트를 명시한다.
2. **사용자가 "푸시해", "올려", "배포해"라고만 말하면 → `test`로 push한다.** 예외 없음.
3. **`origin`에 push하려면 사용자가 현재 대화에서 "본서버", "origin", "프로덕션"이라는 단어를 직접 사용한 경우에만 가능하다.**
4. **"서버로 올려", "push해", "배포해" 등 대상을 특정하지 않은 표현은 전부 `test`를 의미한다.**
5. **이전 대화에서 origin push를 허락받았더라도, 현재 대화에서 다시 명시하지 않으면 무효다.**
6. provider-manager.js는 빌드 결과물이다. 절대 빌드 결과물을 수정하지 않는다. 소스 파일을 수정한 후 빌드하여 변경사항을 반영한다.

### 위반 시 결과
- `origin/main`에 push하면 Vercel이 자동 배포하여 **실사용자 수백 명에게 즉시 반영**된다.
- 버그가 포함된 코드가 본서버에 올라가면 되돌리기 전까지 모든 사용자가 영향받는다.
- **이 규칙을 어기는 것은 프로덕션 장애를 유발하는 것과 같다.**

---

## 📋 push 전 필수 확인 문서

`git push`를 실행하기 전에 아래 문서를 반드시 참조한다:

1. **이 파일 (`copilot-instructions.md`)** — 최우선 규칙 섹션의 push 대상 확인
2. **[DEPLOY.md](../DEPLOY.md)** — 리모트 구조, 배포 절차, 프로덕션 빌드 방법
3. **[DEPLOY_CHECKLIST.md](../DEPLOY_CHECKLIST.md)** — push 전 체크리스트, 릴리즈 동기화 검증

---

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
- **push 대상 리모트**: 사용자가 "본서버"/"origin"/"프로덕션"을 명시하지 않은 한 **항상 `test`**. 위 최우선 규칙 참조.
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

### 🚨 프로덕션(origin) push 시 URL 검증 — 절대 규칙

> **2026-03-15 사고 이력:** `CPM_ENV=production` 없이 빌드 → 테스트 URL이 프로덕션에 배포됨

**origin에 push할 때는 반드시:**
1. `CPM_ENV=production`으로 빌드했는지 확인
2. `provider-manager.js`의 `@update-url`이 `cupcake-plugin-manager.vercel.app`인지 확인
3. `provider-manager.js`의 `const _env = 'production';`인지 확인
4. `npm run verify:production-url`로 자동 검증

**테스트 URL(`cupcake-plugin-manager-test.vercel.app`)이 프로덕션 산출물에 하나라도 있으면 절대 push하지 않는다.**

pre-push hook이 자동으로 origin push를 감지하여 검증하지만, 이를 맹신하지 말고 직접 확인한다.

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
- `scripts/verify-production-url.cjs` — 프로덕션 URL 검증 (origin push 시 자동 실행, 테스트 URL 차단)

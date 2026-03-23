# Cupcake Plugin Manager — 저장소 / 배포 분리 체크리스트

> 이 문서는 두 가지를 분리해서 관리한다.
>
> 1. 저장소에 추적해야 하는 파일
> 2. 실제 공개 배포물에 포함할 파일

> ## ⛔⛔⛔ AI 에이전트 최우선 규칙 — push 대상 ⛔⛔⛔
>
> **기본 push 리모트: `test2` (테스트서버)**
>
> ```
> git push test2 main         ← 기본. "푸시해" = 이것
> git push origin main        ← 금지. "본서버에 올려" = 이것 (명시적 요청 시에만)
> ```
>
> ### 본서버 push 시 규칙
> - `git push test2 main && git push origin main` — **둘 다 push**
>
> ### 규칙 요약
> - `git push` 시 리모트를 반드시 명시한다 (`test2` 또는 `origin`)
> - 사용자가 대상을 지정하지 않으면 → **무조건 `test2`**
> - ⚠️ legacy `test` 리모트는 교차 오염 복구용으로만 사용. 신규 push 금지.
> - `origin`은 사용자가 현재 대화에서 "본서버"/"origin"/"프로덕션"을 **직접 말한 경우에만** 사용
> - **`origin/main`에 push하면 Vercel 자동 배포 → 실사용자 수백 명에게 즉시 반영 → 버그 전파**
>
> ### 필수 참조
> - push 전에 반드시 [`.github/copilot-instructions.md`](.github/copilot-instructions.md)의 최우선 규칙 섹션을 확인한다
> - push 전에 반드시 [DEPLOY.md](DEPLOY.md)의 리모트 구조를 확인한다

> ## 🚨🚨🚨 프로덕션(origin) push 전 — URL 검증 필수 🚨🚨🚨
>
> **origin에 push하기 전에 반드시 아래를 확인한다:**
>
> | 검증 항목 | 올바른 값 (프로덕션) | 잘못된 값 (테스트) |
> |-----------|--------------------|--------------------|
> | `provider-manager.js` `@update-url` | `cupcake-plugin-manager.vercel.app` | `cupcake-plugin-manager-test.vercel.app` 또는 `test-2-*.vercel.app` |
> | `provider-manager.js` `const _env` | `'production'` | `'test'` |
> | `dist/provider-manager.js` `@update-url` | `cupcake-plugin-manager.vercel.app` | `cupcake-plugin-manager-test.vercel.app` 또는 `test-2-*.vercel.app` |
> | `dist/provider-manager.js` `const _env` | `'production'` | `'test'` |
>
> **자동 검증:** `npm run verify:production-url`
>
> **자동 차단:** pre-push hook이 origin push 시 테스트 URL을 감지하면 push를 차단한다.
>
> **사고 이력 (2026-03-15):** `CPM_ENV=production` 없이 빌드 → 테스트 URL이 프로덕션에 배포됨

---

## 1. 저장소에 추적해야 하는 것

아래는 개발·검증·마이그레이션을 위해 **Git 저장소에 남겨야 하는 소스 원본**이다.

| 범주 | 예시 |
|------|------|
| 소스 | `src/`, `scripts/`, `api/` |
| 테스트 / 품질 | `tests/`, `.github/`, `.husky/`, `coverage/` 제외 설정 파일들 |
| 빌드 / 타입체크 설정 | `package.json`, `package-lock.json`, `rollup.config.mjs`, `eslint.config.js`, `vitest.config.js`, `jsconfig.json`, `tsconfig.typecheck.json`, `.lintstagedrc.json` |
| 문서 | `README.md`, `PLUGIN_GUIDE.md`, `DEPLOY.md`, `DEPLOY_CHECKLIST.md`, `DATA_OWNERSHIP_POLICY.md` |
| 배포 산출물 메타 | `versions.json`, `update-bundle.json`, `release-hashes.json`, `vercel.json` |
| 최종 산출물 | `provider-manager.js`, `cpm-*.js` |

핵심 원칙:

- `src/`와 설정 파일은 **배포 대상이 아닐 수는 있어도 저장소 추적 대상**이다.
- 마이그레이션 전에는 “지금 돌아가는 근거”를 최대한 저장소에 남기는 편이 안전하다.
- `.gitignore`는 로컬/생성물만 제외하고, 소스 원본은 제외하지 않는다.

---

## 2. 공개 배포물에 포함할 것

실제 사용자에게 전달하거나 원격 업데이트 API가 참조하는 파일만 따로 관리한다.

| 파일 | 설명 |
|------|------|
| `provider-manager.js` | 루트에 놓인 메인 플러그인 배포본 |
| `cpm-*.js` | 루트에 놓인 서브 플러그인 배포본 |
| `versions.json` | 원격 버전 메타데이터 |
| `update-bundle.json` | 업데이트 번들 |
| `vercel.json` | 배포 환경 설정 |
| `api/main-plugin.js` | 메인 플러그인 다운로드 API |
| `api/versions.js` | 버전 조회 API |
| `api/update-bundle.js` | 번들 제공 API |

주의:

- 저장소에 있다고 해서 모두 공개 배포물에 넣는 것은 아니다.
- 배포 방식이 바뀌면 이 목록도 함께 바뀔 수 있다.
- 현재처럼 마이그레이션 예정인 단계에서는 “저장소 추적”과 “공개 배포”를 절대 같은 의미로 취급하지 않는다.

---

## 3. 저장소와 배포 둘 다 제외할 것

아래는 로컬 산출물 또는 불필요한 임시 파일이다.

- `node_modules/`
- `dist/`
- `coverage/`
- `*복사본*`, `*.bak`, `*.backup*`
- `backup_before_*/`, `pr6_test/`
- 개인 설정 덤프 (`cupcake_pm_settings*.json` 등)
- 민감 정보가 포함된 임시 파일

---

## 4. 작업 순서

1. `src/`에서 수정
2. 필요 시 테스트 / 린트 / 타입체크 수행
3. 배포본이 필요한 변경이면 `node scripts/release.cjs`로 루트 `provider-manager.js`, `versions.json`, `update-bundle.json`, `release-hashes.json`까지 동기화
4. 마이그레이션 전까지는 **소스 원본 보존**을 우선

---

## 5. 푸시 전 확인

### 모든 push (test / origin 공통)

```bash
# 1) 소스 원본이 추적되고 있는지 확인
git ls-files | sort

# 2) 로컬 산출물이 추적되지 않는지 확인
git status --ignored

# 3) release 동기화 검증
npm run verify:release-sync

# 4) release 회귀 테스트
npm run test:release-sync

# 5) 커버리지 확인 (fetch/update/url 변경 시 필수 권장)
npm run test:coverage
```

### 🚨 origin(프로덕션) push 시 추가 필수 확인

```bash
# 6) 프로덕션 URL 검증 (origin push 전 필수!)
npm run verify:production-url

# 또는 수동으로 직접 확인:
# provider-manager.js의 @update-url이 프로덕션 URL인지:
Select-String -Path provider-manager.js -Pattern "@update-url" | Select-Object -First 1
#   → 반드시 cupcake-plugin-manager.vercel.app 이어야 함
#   → cupcake-plugin-manager-test 가 보이면 절대 push 금지!

# provider-manager.js의 _env가 production인지:
Select-String -Path provider-manager.js -Pattern "const _env\b" | Select-Object -First 1
#   → const _env = 'production'; 이어야 함
#   → const _env = 'test'; 이면 절대 push 금지!
```

**pre-push hook 자동 검증:**
Husky `pre-push` 훅이 모든 push에 대해 lint/typecheck/build/release-sync를 검증하고,
origin push를 감지하면 추가로 `scripts/verify-production-url.cjs`를 실행하여
테스트 URL이 포함된 산출물이 프로덕션에 올라가는 것을 자동으로 차단한다.

---

## 6. 서브플러그인 @update-url 환경 규칙

> **환경 전환 시 서브플러그인 @update-url을 반드시 해당 환경 레포로 변경한다.**
>
> 메인 플러그인의 URL은 rollup 빌드가 자동 치환하지만, 서브플러그인 URL은 수동 관리이다.
> 환경을 바꾸고 서브플러그인 URL을 안 바꾸면 **빌드 및 테스트에서 실패한다.**
>
> **자동 전환**: `node scripts/switch-env.cjs <production|test2|test>` 또는 `npm run env:switch -- <환경>`

| 환경 | 서브플러그인 @update-url GitHub 레포 경로 |
|------|------------------------------------------|
| `test2` (기본) | `ruyari-cupcake/cupcake-plugin-manager-test2/main/` |
| `test` (레거시) | `ruyari-cupcake/cupcake-plugin-manager-test/main/` |
| `production` | `ruyari-cupcake/cupcake-plugin-manager/main/` |

### 자동 검증 포인트

1. **빌드 시** (`release.cjs` Step 0): 서브플러그인 `@update-url`이 빌드 환경 레포와 일치하는지 검증 → 불일치 시 빌드 실패
2. **테스트** (`production-url-guard.test.js`): 환경별 서브플러그인 URL 교차 검증
3. **pre-push** (`verify-production-url.cjs`): origin push 시 프로덕션 레포 필수

추가 확인 포인트:

- `fetch-custom.js`, `smart-fetch.js`, `auto-updater.js`, `cpm-url.config.js`, `rollup.config.mjs`를 수정했다면 브랜치 커버리지 `90%` 이상 유지 여부를 확인한다.
- URL 전환 로직을 수정했다면 `npm run build`와 `npm run build:production`을 각각 실행해 `dist/provider-manager.js`의 `@update-url`이 올바른 환경을 가리키는지 확인한다.

### Readiness audit 수정 항목 점검

아래 항목은 프로덕션 readiness audit에서 직접 지적되었던 부분들이다. 관련 파일을 만졌다면 같이 확인한다.

- QW-1 (`package.json` engines): Node 20 미만 환경이 섞이지 않았는지 확인
- QW-2 (`src/lib/fetch-custom.js`): 재시도/백오프 분기 변경 시 `npm test` + `npm run test:coverage`
- HD-1 (`src/cpm-url.config.js`, `rollup.config.mjs`, `scripts/release.cjs`): test / production 빌드를 둘 다 1회 검증
- HD-2 (`tests/*coverage*.test.js`, `tests/*branch-coverage*.test.js`): 전체 브랜치 커버리지 `90%` 이상 유지 확인

권장 확인 순서:

1. `npm test`
2. `npm run test:coverage`
3. `npm run verify:release-sync`
4. `node scripts/release.cjs`

---

## 6. 기억할 원칙

- `.gitignore`는 “저장소에 남길지”를 결정한다.
- 배포 체크리스트는 “사용자에게 보낼지”를 결정한다.
- 둘은 같은 질문이 아니다.
- 마이그레이션 직전 단계에서는 소스와 설정을 저장소에서 숨기면 나중에 복구 비용이 더 커진다.

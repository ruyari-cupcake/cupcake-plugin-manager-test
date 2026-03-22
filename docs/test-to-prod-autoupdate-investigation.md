# 테스트서버→본서버 자동업데이트 교차 오염 조사 보고서

> 조사일: 2026-03-23  
> 조사 버전: v1.22.16 (v1.22.12 코드 기반 긴급 롤백)  
> 조사자: Copilot Agent

---

## TL;DR (요약)

**테스트 서버에 push하면 프로덕션 유저도 자동 업데이트되는 이유:**

1. `rollup.config.mjs`에서 `CPM_ENV` 기본값이 **`'test'`** → `npm run build`만 실행하면 test URL로 빌드됨
2. test 빌드를 실수로 origin(프로덕션)에 push하면, **프로덕션 유저의 @update-url이 test 서버를 가리키게 됨**
3. 이후 test 서버에 새 코드를 push할 때마다 → **프로덕션 유저의 CPM이 test 서버에서 업데이트 감지 → 자동 설치**
4. **추가 발견**: `cpm-copilot-manager.js`의 `@update-url`이 현재도 test 레포(`cupcake-plugin-manager-test`)를 가리키고 있음

---

## 1. 현재 빌드 아티팩트 환경 상태

| 파일 | @update-url | _env | 상태 |
|---|---|---|---|
| `provider-manager.js` (빌드) | `cupcake-plugin-manager.vercel.app` | `production` | ✅ 정상 |
| `dist/provider-manager.js` | `cupcake-plugin-manager.vercel.app` | `production` | ✅ 정상 |
| `update-bundle.json` 내 코드 | `cupcake-plugin-manager.vercel.app` | `production` | ✅ 정상 |
| **`src/plugin-header.js` (소스)** | **`cupcake-plugin-manager-test.vercel.app`** | N/A | ⚠️ **TEST URL 하드코딩** |

→ 현재 **빌드된 산출물은 올바른 프로덕션 URL**이지만, 소스 파일 자체에 test URL이 박혀 있음.  
→ 빌드 시 rollup이 `CPM_ENV`에 따라 치환하므로 정상 동작하지만, **실수 여지가 존재**.

---

## 2. 서브 플러그인 @update-url 교차 오염 현황

| 서브 플러그인 | @update-url 가리키는 레포 | 상태 |
|---|---|---|
| `cpm-chat-navigation.js` | `cupcake-plugin-manager` (prod) | ✅ |
| `cpm-chat-resizer.js` | `cupcake-plugin-manager` (prod) | ✅ |
| `cpm-provider-anthropic.js` | `cupcake-plugin-manager` (prod) | ✅ |
| `cpm-provider-aws.js` | `cupcake-plugin-manager` (prod) | ✅ |
| `cpm-provider-deepseek.js` | `cupcake-plugin-manager` (prod) | ✅ |
| `cpm-provider-gemini.js` | `cupcake-plugin-manager` (prod) | ✅ |
| `cpm-provider-openai.js` | `cupcake-plugin-manager` (prod) | ✅ |
| `cpm-provider-openrouter.js` | `cupcake-plugin-manager` (prod) | ✅ |
| `cpm-provider-vertex.js` | `cupcake-plugin-manager` (prod) | ✅ |
| `cpm-translation-cache.js` | `cupcake-plugin-manager` (prod) | ✅ |
| **`cpm-copilot-manager.js`** | **`cupcake-plugin-manager-test`** (TEST) | ❌ **교차 오염** |
| `cpm-auto-translate-last-char-poc.js` | `cupcake-plugin-manager-test` (TEST) | ⚠️ POC |

→ **`cpm-copilot-manager.js`가 test 레포 URL을 가리키고 있음!** 프로덕션 유저가 이 서브플러그인 업데이트를 확인하면 test 레포에서 코드를 받게 됨.

---

## 3. Auto-Update 흐름 분석

### 경로 1: CPM 내부 Auto-Updater
```
checkVersionsQuiet()
  → VERSIONS_URL (CPM_BASE_URL/api/versions) fetch
  → 서브플러그인 + 메인 플러그인 버전 비교
  → 새 버전 → safeMainPluginUpdate()
       → UPDATE_BUNDLE_URL (update-bundle.json) 에서 코드 다운로드 + SHA256 검증
       → 설치
```

**핵심**: `CPM_BASE_URL`은 빌드 시 `_env` 변수로 결정됨. `_env='test'`이면 모든 API 호출이 test 서버로 향함.

### 경로 2: RisuAI 네이티브 업데이트
```
RisuAI 앱 자체가 @update-url 헤더를 읽음
  → 해당 URL로 최신 JS fetch
  → 버전 비교 → 업데이트 제안/설치
```

**핵심**: RisuAI가 읽는 `@update-url`도 빌드 시 치환된 값. test 빌드가 설치되면 test 서버 URL이 들어감.

---

## 4. 교차 오염 시나리오 재현

### 시나리오 A: CPM_ENV 미지정 빌드 (가장 유력한 원인)

```bash
npm run build                    # CPM_ENV 없음 → 기본값 'test'
node scripts/release.cjs         # test URL이 박힌 번들로 릴리스
git push origin main             # 프로덕션에 test 빌드 배포!
```

rollup.config.mjs:22에서:
```js
const CPM_ENV = process.env.CPM_ENV || 'test';  // ← 기본값이 test!
```

이렇게 되면:
1. 프로덕션 유저가 test URL이 박힌 v1.22.XX를 받음
2. 이후 유저의 CPM은 **test 서버** (cupcake-plugin-manager-test.vercel.app)에서 업데이트 확인
3. test 서버에 새 코드가 push될 때마다 → 프로덕션 유저도 자동 업데이트됨

### 시나리오 B: Vercel 배포 메커니즘
- GitHub 레포에 push → Vercel 자동 배포
- Vercel API route는 레포의 `update-bundle.json`을 그대로 서빙
- 따라서 커밋에 포함된 빌드 산출물 = Vercel에서 서빙되는 파일

---

## 5. 기존 안전장치와 한계

| 안전장치 | 동작 | 한계 |
|---|---|---|
| `.husky/pre-push` hook | origin push 시 URL/env 검증 | `--no-verify`로 우회 가능, 다른 머신에선 미동작 |
| `verify-production-url.cjs` | @update-url이 test면 차단 | 서브 플러그인 URL은 미검증 |
| `production-url-guard.test.js` | URL 일관성 테스트 | 수동 실행 시에만 효과 |
| `verify-release-sync.cjs` | 버전/해시 동기화 | URL 교차 오염은 검사 안 함 |

### 안전장치가 놓치는 것들:
- ❌ `cpm-copilot-manager.js`의 test 레포 URL (어떤 가드에도 안 잡힘)
- ❌ 다른 머신/CI에서의 push (husky 미설치)
- ❌ `--no-verify` 사용 시

---

## 6. v1.22.12 이후 버전별 변경 요약

### v1.22.12 → v1.22.13 (커밋 43db09b, 7f1cb47)
**변경**: 
- Rewrite 프록시 URL 쿼리파라미터 병합 수정 (`_proxyBase.search` + `_origUrl.search`)
- proxyKey 개행문자 새니타이즈 (`.replace(/[\r\n]/g, '')`)
- Auto-update OFF 시 6시간 쿨다운 + 네트워크 호출 차단
- toast dismiss localStorage 기록
- **위험도**: 중간 — auto-updater 로직 변경

### v1.22.13 → v1.22.14 (커밋 8e78944)
**변경**: 
- `needsCopilotResponsesAPI()`에 `isGeminiFamily()` 추가 → 모든 Gemini 모델이 Responses API 사용
- **위험도**: **🔴 높음** — 이것이 Copilot 400 에러의 직접 원인. `gemini-3.1-pro-preview` 등 Responses API 미지원 Gemini 모델까지 /responses로 라우팅됨

### v1.22.14~v1.22.15 (커밋 77bc49e, 917eb3e, a00a379)
**변경**:
- retryPendingMainUpdate OFF guard 순서 수정
- toast key 상수화
- Responses API fallback 테스트 추가
- unsupported_api_for_model 자동 fallback 로직 (v1.22.15)
- **위험도**: 중간 — v1.22.14의 문제를 패치하려는 시도

### 400 에러 근본 원인
**v1.22.14**에서 `needsCopilotResponsesAPI()`가 모든 Gemini 모델에 대해 `true`를 반환하도록 변경됨. 하지만 일부 Gemini 모델(예: `gemini-3.1-pro-preview`)은 Copilot의 Responses API를 지원하지 않아 `unsupported_api_for_model` 400 에러가 발생.

---

## 7. 권장 조치사항 (수정 필요 항목)

1. **[긴급]** `cpm-copilot-manager.js`의 `@update-url`을 production 레포로 수정
2. **[중요]** `rollup.config.mjs`의 CPM_ENV 기본값을 `'production'`으로 변경하거나, 미지정 시 빌드 중단하도록 변경
3. **[중요]** `verify-production-url.cjs`에 서브 플러그인 @update-url 검증 추가
4. **[선택]** `src/plugin-header.js`의 기본 @update-url을 production으로 변경
5. **[선택]** CI/CD 파이프라인에서 URL 검증 추가 (husky에만 의존하지 않도록)

---

*이 보고서는 조사 목적으로만 작성되었으며, 어떤 코드도 수정하지 않았습니다.*

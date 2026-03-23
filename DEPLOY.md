# 배포 가이드 — Cupcake Provider Manager

> ## ⛔⛔⛔ AI 에이전트 — push 전 필독 ⛔⛔⛔
>
> **기본 push 리모트는 `test2`다. `origin`이 아니다.**
>
> - `git push test2 main` ← 기본. 사용자가 대상을 지정하지 않으면 항상 이것.
> - `git push origin main` ← **금지**. 사용자가 "본서버"/"origin"/"프로덕션"을 명시한 경우에만.
> - **본서버 push 시: `test2`와 `origin` 둘 다 push한다.** (`git push test2 main && git push origin main`)
> - `origin`에 push하면 Vercel 자동 배포로 **실사용자에게 즉시 반영**된다.
> - 상세 규칙은 [`.github/copilot-instructions.md`](.github/copilot-instructions.md)의 최우선 규칙 섹션 참조.

> ## 🚨🚨🚨 프로덕션(origin) 배포 시 URL 검증 — 절대 규칙 🚨🚨🚨
>
> **origin에 push할 때는 반드시 프로덕션 빌드(`CPM_ENV=production`)로 빌드한 산출물만 올린다.**
>
> ### 사고 이력
> - **2026-03-15**: `CPM_ENV=production` 없이 빌드 → 테스트 서버 URL(`cupcake-plugin-manager-test.vercel.app`)이 본서버에 배포됨
> - 실사용자의 플러그인이 테스트 서버를 바라보는 치명적 장애 발생
>
> ### 반드시 확인할 것 (origin push 전)
> 1. `provider-manager.js` 5행의 `@update-url`이 `https://cupcake-plugin-manager.vercel.app/api/main-plugin`인지 확인
> 2. `provider-manager.js` 내부 `const _env = 'production';`인지 확인 (**`'test'`이면 절대 push 금지**)
> 3. `npm run verify:production-url`로 자동 검증 가능
>
> ### 자동 차단 (pre-push hook)
> - pre-push hook이 origin push를 감지하면 `scripts/verify-production-url.cjs`가 자동 실행
> - 테스트 URL이 하나라도 검출되면 **push가 차단**됨
> - 이 가드를 우회(--no-verify)하지 말 것

## 리모트 구조

| 리모트 | 레포 | Vercel 도메인 | 용도 |
|--------|------|---------------|------|
| `test2` | `ruyari-cupcake/cupcake-plugin-manager-test2` | `test-2-wheat-omega.vercel.app` | **⭐ 기본 배포 (테스트) — 항상 여기로 push** |
| `test` | `ruyari-cupcake/cupcake-plugin-manager-test` | `cupcake-plugin-manager-test.vercel.app` | ⚠️ 레거시 (교차 오염 위험 — 사용 자제) |
| `origin` | `ruyari-cupcake/cupcake-plugin-manager` | `cupcake-plugin-manager.vercel.app` | ⛔ 프로덕션 (사용자가 명시적으로 요청한 경우에만, test2와 함께 push) |

---

## 기본 배포 (test2) — 평소 작업

### 중요: 메인 자동업데이트 수정 후에는 산출물 동기화까지 반드시 확인

메인 플러그인 자동업데이트는 소스 파일만 맞아서는 안 된다.
실제 배포되는 파일인 [provider-manager.js](provider-manager.js), [update-bundle.json](update-bundle.json), [release-hashes.json](release-hashes.json)까지 같이 갱신되어야 한다.

특히 아래 파일만 고치고 릴리즈 산출물을 재생성하지 않으면, 서버는 **예전 자동업데이트 코드**를 계속 배포할 수 있다.

- [src/lib/sub-plugin-manager.js](src/lib/sub-plugin-manager.js)
- [src/plugin-header.js](src/plugin-header.js)
- [src/lib/shared-state.js](src/lib/shared-state.js)
- [versions.json](versions.json)

가장 안전한 방법은 수동 `build + copy` 대신 아래 `release` 파이프라인을 쓰는 것이다.

```bash
# 1. 코드 수정 후 릴리즈 파이프라인 실행
#    - rollup build
#    - dist → root 복사
#    - versions.json/header 검증
#    - update-bundle.json 재생성
#    - 테스트 실행
#    - release-hashes.json 생성
node scripts/release.cjs

# 2. 커밋 & push
git add -A
git commit -m "feat: 설명"
git push test2 main

# 3. 릴리즈 (선택)
git tag v1.xx.x-test.N
git push test2 v1.xx.x-test.N
# → GitHub Actions가 빌드+테스트 후 Release 자동 생성
```

### 배포 전 체크리스트

- [provider-manager.js](provider-manager.js) 헤더 버전이 이번 배포 버전과 일치하는지 확인
- [update-bundle.json](update-bundle.json)에 `provider-manager.js` 최신 코드와 최신 `sha256`이 들어갔는지 확인
- [versions.json](versions.json)의 `Cupcake Provider Manager` 버전/changes가 최신인지 확인
- 메인 자동업데이트 관련 수정이었다면 반드시 `node scripts/release.cjs`를 다시 실행
- 네트워크/업데이트/라우터 관련 수정이었다면 `npm run test:coverage`를 실행해 전체 브랜치 커버리지가 `90%` 이상 유지되는지 확인

---

## 프로덕션 배포 (origin) — 요청 시에만

> ### ⚠️⚠️⚠️ 경고: 프로덕션 배포는 반드시 아래 순서를 지킨다 ⚠️⚠️⚠️
> 한 단계라도 빠뜨리면 테스트 서버 URL이 본서버에 올라간다.
> **2026-03-15 사고 재발 방지를 위해 이 절차는 반드시 엄수한다.**

### 1단계: 프로덕션 빌드 (CPM_ENV=production 필수)

소스 파일 수정은 **불필요**. `CPM_ENV` 환경변수로 빌드 타임에 URL이 자동 전환된다.

```bash
# 프로덕션 빌드 (권장 — cross-platform)
npm run build:production

# 또는 수동으로 환경변수 설정
# Linux/Mac:
CPM_ENV=production npm run build
# Windows (PowerShell):
$env:CPM_ENV="production"; npm run build
```

빌드 시 다음이 자동으로 수행된다:
- `plugin-header.js`의 `@update-url`이 프로덕션 URL로 치환
- 번들 내 모든 런타임 URL(`VERSIONS_URL`, `MAIN_UPDATE_URL` 등)이 프로덕션 URL로 치환
- 콘솔에 `[rollup] CPM_ENV=production → https://cupcake-plugin-manager.vercel.app` 확인 메시지 출력

### ‼️ 1-1단계: 빌드 결과 검증 (필수 — 건너뛰지 말 것)

**빌드 직후 반드시 아래 3개를 확인한다. 하나라도 안 맞으면 push하지 않는다.**

```bash
# 검증 1: @update-url 확인
Select-String -Path dist/provider-manager.js -Pattern "@update-url" | Select-Object -First 1
#   → //@update-url https://cupcake-plugin-manager.vercel.app/api/main-plugin  ← 이것이어야 함
#   → //@update-url https://cupcake-plugin-manager-test.vercel.app/...         ← 이거면 잘못된 것!

# 검증 2: _env 값 확인
Select-String -Path dist/provider-manager.js -Pattern "const _env\b" | Select-Object -First 1
#   → const _env = 'production';    ← 이것이어야 함
#   → const _env = 'test';          ← 이거면 잘못된 것!

# 검증 3: 자동 검증 스크립트 (위 두 개를 한번에 검증)
npm run verify:production-url
```

**검증에 실패하면:**
1. `CPM_ENV=production` 환경변수가 설정되었는지 확인
2. 새 셸을 열고 다시 `$env:CPM_ENV="production"; npm run build` 실행
3. 다시 검증

### 2단계: 릴리즈 & 푸시

```bash
# release.cjs가 provider-manager.js / update-bundle.json / release-hashes.json 동기화를 보장한다.
# release.cjs는 현재 CPM_ENV를 그대로 사용해 build → 동기화까지 수행한다.
# ⚠️ 반드시 CPM_ENV=production 상태에서 실행할 것!

# Linux/Mac
CPM_ENV=production node scripts/release.cjs

# Windows (PowerShell)
$env:CPM_ENV="production"; node scripts/release.cjs

# 릴리즈 후 다시 검증 (필수)
npm run verify:production-url

git add -A
git commit -m "release: provider-manager vX.XX.X"
git push origin main
# → pre-push hook이 자동으로 프로덕션 URL 검증 수행
# → 테스트 URL이 감지되면 push가 차단됨

# test2에도 push (본서버 push 시 항상 함께)
git push test2 main

git tag vX.XX.X
git push origin vX.XX.X
```

### 3단계: 테스트 서버 복원

프로덕션 배포 후, 소스는 그대로 두고 **테스트 빌드로 돌아오기만 하면 된다.** 소스 파일 수정이 필요 없으므로 이전보다 훨씬 안전하다.

```bash
npm run build            # CPM_ENV 기본값 = test2
node scripts/release.cjs
git add -A
git commit -m "chore: restore test2 build artifacts"
git push test2 main
```

---

## 서브플러그인 @update-url 관리

> ### ⚠️ 환경별 서브플러그인 URL 규칙
>
> 서브플러그인(`cpm-*.js`)의 `@update-url`은 **배포 대상 환경의 GitHub 레포**를 가리켜야 한다.
> 메인 플러그인 URL은 빌드 시 rollup이 자동 치환하지만, **서브플러그인 URL은 수동 관리**이므로 환경 전환 시 반드시 확인한다.

| 환경 | @update-url GitHub 레포 |
|------|------------------------|
| `test2` | `ruyari-cupcake/cupcake-plugin-manager-test2/main/` |
| `test` | `ruyari-cupcake/cupcake-plugin-manager-test/main/` |
| `production` | `ruyari-cupcake/cupcake-plugin-manager/main/` |

### 자동 검증

- **빌드 시**: `release.cjs` Step 0에서 서브플러그인 `@update-url`이 빌드 환경과 일치하는지 검증
- **테스트**: `production-url-guard.test.js`의 `sub-plugin @update-url must match build environment repo` 테스트
- **pre-push**: `verify-production-url.cjs`가 origin push 시 서브플러그인이 프로덕션 레포를 가리키는지 확인

### 환경 전환 시 변경 방법

```bash
# test2 → production 전환 시 (origin push 전)
# PowerShell 예시:
Get-ChildItem cpm-*.js | ForEach-Object {
    (Get-Content $_.FullName) -replace 'cupcake-plugin-manager-test2/', 'cupcake-plugin-manager/' |
    Set-Content $_.FullName
}

# production → test2 복원
Get-ChildItem cpm-*.js | ForEach-Object {
    (Get-Content $_.FullName) -replace 'cupcake-plugin-manager/main/', 'cupcake-plugin-manager-test2/main/' |
    Set-Content $_.FullName
}
```

> **주의:** `cupcake-plugin-manager/main/` → `cupcake-plugin-manager-test2/main/` 치환 시
> `cupcake-plugin-manager-test2/main/`가 이미 있는 줄까지 치환되지 않도록 정규식 패턴에 주의한다.

---

## 주의사항

### 🚨 절대 규칙: origin에 테스트 URL 금지

- **origin에는 `CPM_ENV=production`으로 빌드한 산출물만 push한다**
- **push 전 `@update-url`과 `_env` 값을 반드시 확인한다**
  - `@update-url`에 `cupcake-plugin-manager-test`가 있으면 → **테스트 빌드. origin에 push 금지.**
  - `const _env = 'test'`이면 → **테스트 빌드. origin에 push 금지.**
- **pre-push hook이 자동으로 검증하지만, `--no-verify`로 우회하지 말 것**
- `npm run verify:production-url`로 언제든 수동 검증 가능

### 기타 주의사항

- **test에는 프로덕션 빌드 산출물을 push하지 않는다** — 기본 `npm run build`는 자동으로 test2 URL 사용
- 프로덕션 배포 후 반드시 3단계(test2 빌드 복원)를 수행한다
- `CPM_ENV` 미설정 시 항상 test2 URL로 빌드되므로, 실수로 프로덕션 URL이 테스트 서버에 올라가는 사고가 방지된다
- 메인 자동업데이트 관련 수정 후에는 **소스만 커밋하지 말고 반드시 [node scripts/release.cjs](scripts/release.cjs)로 산출물을 재생성한다**
- [provider-manager.js](provider-manager.js)와 [update-bundle.json](update-bundle.json)이 stale이면 메인 자동업데이트는 수정 전 코드를 계속 내려보낼 수 있다
- 푸시 전 Husky가 `npm run verify:release-sync`와 `npm run test:release-sync`를 실행하므로, 산출물 버전/해시/번들 코드가 안 맞으면 푸시가 차단된다
- `origin` push 전에 반드시 전체 테스트를 통과시킨다
- URL/빌드 파이프라인 수정이었다면 `npm run build`와 `npm run build:production`을 각각 1회 실행해 test/prod 양쪽이 모두 올바르게 고정되는지 확인한다

---

## 공개 응답 범위 정책

### 왜 이 정책이 필요한가

CPM의 버전 확인/자동업데이트 응답은 웹, 도커, 로컬, 모바일 웹뷰(iOS/Android), iframe sandbox(`null` origin) 등 여러 환경에서 소비된다.

이 때문에 Vercel 응답의 CORS는 현재 `Access-Control-Allow-Origin: *`를 유지한다.
이 설정은 **보안 실수**라기보다 **멀티 플랫폼 호환을 위한 운영상 선택**이다.

대신 아래 원칙을 반드시 지켜야 한다.

### 공개로 취급하는 엔드포인트

다음 응답은 **공개 응답(public response)** 으로 취급한다.

- `versions.json`
- `update-bundle.json`
- `provider-manager.js`
- 기타 Vercel에서 배포하는 버전/업데이트용 JSON, JS 정적 응답

즉, 위 응답은 "누가 읽어도 되는 배포물/버전 정보"여야 한다.

### 절대 포함하면 안 되는 것

공개 응답에는 아래 항목이 절대 들어가면 안 된다.

- 사용자 API 키
- OAuth 토큰, 세션 토큰, 쿠키 값
- 사용자 식별자, 계정 ID, 이메일 등 개인 식별 정보
- 디버그용 내부 상태 덤프
- 비공개 관리자 정보
- 서버 내부 경로, 비공개 설정값, 비공개 feature flag
- 아직 공개되면 안 되는 실험용 비밀 데이터

### 허용되는 것

공개 응답에는 아래 정보만 포함되어야 한다.

- 공개 버전 문자열
- 공개 changelog 요약
- 공개 배포 번들 코드
- 공개 해시값(`sha256` 등)
- 공개 가능한 메타데이터(파일명, 버전명, 배포 시각 등)

### 운영 원칙

1. 자동업데이트 응답은 **공개 CDN 파일처럼 취급**한다.
2. 민감 정보 보호는 CORS가 아니라 **응답 내용 통제**로 보장한다.
3. 업데이트 번들은 항상 무결성 검증(`sha256`)을 통과해야 한다.
4. 새로운 응답 필드를 추가할 때는 "이 값이 공개되어도 되는가?"를 먼저 검토한다.
5. 비밀 데이터가 필요한 기능은 공개 정적 응답에 넣지 말고 별도 보호 경로를 사용한다.

### 리뷰 체크리스트

버전/업데이트 응답을 수정할 때마다 아래를 확인한다.

- [ ] 이 응답은 외부 사이트가 읽어도 문제없는가?
- [ ] 사용자별 데이터가 섞이지 않았는가?
- [ ] 토큰/키/세션/개인정보가 전혀 없는가?
- [ ] 응답이 공개 배포물이라는 전제가 유지되는가?
- [ ] 무결성 검증 경로가 여전히 유효한가?

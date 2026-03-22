# 교차 오염 유저 복구 방안

> 작성일: 2026-03-23
> 관련 버전: v1.22.16
> 상태: **복구 배포 완료** (test 서버에 production 빌드 push 완료)

---

## 1. 문제 요약

일부 프로덕션 유저가 test 서버 URL(`cupcake-plugin-manager-test.vercel.app`)이
하드코딩된 CPM 빌드를 설치하게 되었음. 이로 인해:

- **CPM 내부 auto-updater**: `CPM_BASE_URL` = test → test 서버에서 버전 체크
- **RisuAI 네이티브 업데이터**: `@update-url` = test → test 서버에서 플러그인 fetch

---

## 2. 자동 복구 메커니즘

### 핵심 원리

test 서버에 **production URL이 박힌 빌드**를 배포하면, 오염 유저가 자동 업데이트 시
새 코드에 production URL이 포함되어 **자연 치유**됨.

### 업데이트 흐름

```
오염 유저 CPM (CPM_BASE_URL = test)
    │
    ├─ 경로 1: CPM auto-updater
    │   └─ test 서버 /api/versions → v1.22.16 발견
    │       └─ test 서버 /api/update-bundle → production 빌드 코드 다운로드
    │           └─ _validateAndInstallMainPlugin()
    │               └─ DB 업데이트: script = 새 코드 (CPM_BASE_URL = production)
    │                              updateURL = production/api/main-plugin
    │
    ├─ 경로 2: RisuAI 네이티브 업데이터
    │   └─ test 서버 /api/main-plugin → production 빌드 코드 직접 반환
    │       └─ RisuAI가 DB 플러그인 교체
    │
    └─ 재시작 후 → CPM_BASE_URL = production, @update-url = production
        └─ ✅ 복구 완료
```

### 코드 근거

**CPM_BASE_URL 교체** — `rollup.config.mjs` 빌드 시 `pin-cpm-env` 플러그인이 `_env`를 고정:
```js
// rollup.config.mjs (pin-cpm-env plugin)
code.replace('const _env = _resolveEnv();', `const _env = '${CPM_ENV}';`);
```
→ production 빌드의 코드는 `_env = 'production'` 하드코딩 → `CPM_BASE_URL` = production

**@update-url 교체** — `auto-updater.js` L789:
```js
const updatedPlugin = {
    script: code,                                          // 새 코드 전체
    updateURL: parsedUpdateURL || existing.updateURL || '', // 새 @update-url 우선
};
nextPlugins[existingIdx] = updatedPlugin;  // 기존 엔트리 통째 교체
await Risu.setDatabaseLite({ plugins: nextPlugins });
```
→ 새 코드의 `@update-url` (= production)이 DB에 저장, 기존 test URL 완전 대체

**서브 플러그인** — `auto-updater.js`:
서브 플러그인 URL은 boolean 존재 여부만 확인, 실제 다운로드는 `CPM_BASE_URL/api/update-bundle`에서 수행.
→ 메인 플러그인이 production으로 복구되면 서브 플러그인도 자동으로 production에서 업데이트.

---

## 3. 현재 복구 상태

### 배포 현황

| 서버 | 커밋 | 빌드 환경 | CPM_BASE_URL | @update-url |
|---|---|---|---|---|
| **origin** (production) | `4b2314f` | production | production | production |
| **test** (legacy) | `4b2314f` | production | production | production |
| **test2** (default) | `3d4ae6a` | test2 | test2 | test2 |

→ test 서버가 production 빌드를 서빙하므로, 오염 유저의 auto-updater가 production URL 코드를 받게 됨.

### 유저 시나리오별 복구

| 시나리오 | 복구 여부 | 설명 |
|---|---|---|
| 이미 v1.22.16으로 자동 업데이트됨 | ✅ 자동 복구 완료 | `66a8999` 배포 시점부터 production 빌드가 test 서버에 있었음 |
| 아직 업데이트 안 됨 (RisuAI 미실행) | ✅ 다음 실행 시 자동 복구 | RisuAI 실행 → auto-update 체크 → production 빌드 설치 |
| `cpm_disable_autoupdate` 활성화 | ⚠️ 수동 개입 필요 | auto-update 비활성화 유저는 직접 플러그인 재설치 안내 필요 |
| 오프라인 / 장기 미접속 | ⏳ 접속 시 자동 복구 | 인터넷 연결 + RisuAI 실행 시 자동 복구 |

### 복구 확인 방법

오염 유저가 복구되었는지 확인하려면:
1. CPM 설정 패널에서 버전이 `1.22.16`인지 확인
2. 브라우저 개발자 도구 → Network에서 API 호출이 `cupcake-plugin-manager.vercel.app`으로 가는지 확인
3. `cupcake-plugin-manager-test.vercel.app`으로의 요청이 없어야 정상

---

## 4. 자동 업데이트 비활성화 유저 대응

`cpm_disable_autoupdate` 설정을 켠 유저는 수동으로 복구해야 함:

### 수동 복구 안내문 (공지용)

> **[긴급] CPM 업데이트 안내**
>
> CPM 자동 업데이트를 비활성화한 사용자분들께서는 다음 방법으로 최신 버전을 설치해 주세요:
>
> 1. RisuAI 설정 → 플러그인 → Cupcake Provider Manager 삭제
> 2. 아래 URL을 RisuAI 플러그인 설치 창에 붙여넣기:
>    `https://cupcake-plugin-manager.vercel.app/api/main-plugin`
> 3. 설치 후 RisuAI 새로고침

---

## 5. 주의사항

- **복구 타이밍**: auto-update 체크 주기는 10분 쿨다운. 유저가 RisuAI를 열어야 발동.
- **세션 지속**: 복구 업데이트 설치 후에도 현재 세션에서는 이전 코드가 메모리에 로드된 상태.
  페이지 새로고침/재시작 후 완전히 production으로 전환됨.
- **test 서버 영구 유지**: 오염 유저가 모두 복구될 때까지 test 서버에 production 빌드를 유지해야 함.
  향후 test 서버를 다른 용도로 사용하려면, 충분한 기간(최소 2주) 후에 변경.
- **모니터링**: test 서버의 Vercel Analytics에서 `/api/versions` 요청 빈도를 모니터링하면
  아직 복구되지 않은 유저 수를 추정할 수 있음 (요청이 0에 수렴하면 모두 복구된 것).

# CPM 자동 업데이트 OFF 우회 분석 보고서

> **작성일**: 2026-03-23  
> **분석 대상**: `_temp_repo` — Cupcake Provider Manager (CPM) 메인 플러그인  
> **보고 사유**: `cpm_disable_autoupdate = true` 설정 시에도 네트워크 요청·메모리 소비·새로고침 유사 동작이 발생한다는 사용자 리포트

---

## 1. 요약 (Executive Summary)

`cpm_disable_autoupdate` 설정은 **"자동 설치(install)"만 차단**하며, **버전 확인 네트워크 요청(fetch)과 파싱은 차단하지 않는다.**  
결과적으로 자동 업데이트를 OFF로 설정하더라도 부팅 시 **최소 2~3회의 HTTP 요청**이 발생하고, 응답 데이터의 JSON 파싱·정규식 추출·스키마 검증이 실행되어 CPU와 메모리를 소모한다.

| 분류 | 설정 존중 여부 | 설명 |
|------|:---:|------|
| 부트 리트라이 (`retryPendingMainPluginUpdateOnBoot`) | ✅ | 설정 확인 후 설치 건너뜀 |
| 매니페스트 기반 버전 체크 (`checkVersionsQuiet`) | ❌ **부분** | fetch 후 install만 차단 |
| JS 폴백 버전 체크 (`checkMainPluginVersionQuiet`) | ❌ **부분** | 50~70KB JS 다운로드 후 install만 차단 |
| 번들 자동 부트스트랩 (`autoBootstrapBundledPlugins`) | ❌ **완전 무시** | 설정 확인 자체가 없음 |
| 서브플러그인 타이머/리스너 | ❌ **무관** | 별도 lifecycle, 설정과 독립 |

---

## 2. 설정 정의 및 동작 위치

### 2.1 설정 키
- **키 이름**: `cpm_disable_autoupdate`
- **타입**: `string` (checkbox — `"true"` / `"false"`)
- **기본값**: `false` (자동 업데이트 활성)
- **선언 위치**: [src/plugin-header.js#L93](src/plugin-header.js#L93)
- **UI**: 설정 탭 → "메인 플러그인 자동 업데이트 비활성화" 체크박스

### 2.2 설정 읽기 함수
```javascript
// src/lib/shared-state.js
await safeGetBoolArg('cpm_disable_autoupdate', false)
```
`Risu.getArg()`를 통해 RisuAI DB에 저장된 플러그인 `realArg` 값을 읽는다. `"true"` → `true`, 나머지 → `false`.

---

## 3. 부팅 시퀀스 상세 분석

### 3.1 init.js 부팅 흐름 (시간 순)

```
[0s] Phase: register-settings
[0s] Phase: subplugin-registry       ← loadRegistry() — localStorage 읽기 (10~20KB)
[0s] Phase: auto-bootstrap           ← autoBootstrapBundledPlugins() ★ 문제 1
[0s] Phase: subplugin-execute         ← executeEnabled() — 서브플러그인 실행 (타이머 시작)
[0s] Phase: settings-restore
[0s] Phase: copilot-version-overrides
[0s] Phase: model-registration
[0s] Phase: tool-use-mcp
[5s] setTimeout → 자동 업데이트 체크 시작 ★ 문제 2, 3
    ├── retryPendingMainPluginUpdateOnBoot() → ✅ 설정 존중
    ├── checkVersionsQuiet()                 → ❌ 부분 우회
    └── checkMainPluginVersionQuiet()        → ❌ 부분 우회
```

**참조**: [src/lib/init.js#L162-L168](src/lib/init.js#L162-L168) (부트스트랩), [src/lib/init.js#L389-L404](src/lib/init.js#L389-L404) (5초 딜레이 체크)

---

## 4. 문제별 상세 분석

### ★ 문제 1: `autoBootstrapBundledPlugins()` — 설정 확인 완전 부재

**파일**: [src/lib/auto-updater.js#L1041-L1107](src/lib/auto-updater.js#L1041-L1107)  
**호출 위치**: [src/lib/init.js#L168](src/lib/init.js#L168) — `loadRegistry()` 직후, `executeEnabled()` 직전

```javascript
async autoBootstrapBundledPlugins() {
    const LOG = '[CPM Bootstrap]';
    try {
        // ❌ cpm_disable_autoupdate 확인 없이 바로 fetch
        const cacheBuster = this.UPDATE_BUNDLE_URL + '?_t=' + Date.now() + '&_r=' + ...;
        const result = await Risu.risuFetch(cacheBuster, {
            method: 'GET', plainFetchForce: true
        });
        // ... 50KB+ update-bundle.json 다운로드 및 파싱 ...
```

**영향**:
- 매 플러그인 로드마다 `update-bundle.json` (~50KB+) 전체를 다운로드
- JSON 파싱 + 스키마 검증 + SHA-256 해시 계산
- 자동 업데이트 OFF와 **완전히 무관**하게 항상 실행
- 신규 서브플러그인이 번들에 추가되면 **OFF인데도 자동 설치**됨

**메모리 영향**: ~200-500KB (fetch 버퍼 + JSON 파싱 + SHA-256 계산)

---

### ★ 문제 2: `checkVersionsQuiet()` — fetch 후 install만 차단

**파일**: [src/lib/auto-updater.js#L299-L387](src/lib/auto-updater.js#L299-L387)

**코드 흐름**:
```
1. [L299] 중복 방지 플래그 확인 (window._cpmVersionChecked)
2. [L306] 10분 쿨다운 확인
3. [L320] ❌ 설정 확인 없이 versions.json fetch (5~10KB)
4. [L330] JSON 파싱 + 스키마 검증
5. [L340] 설치된 서브플러그인별 버전 비교 반복문
6. [L360] 업데이트 토스트 알림 표시
7. [L374] ✅ 드디어 safeGetBoolArg('cpm_disable_autoupdate') 확인
8. [L375] OFF면 → 토스트만 표시, install 건너뜀
```

**핵심 문제**: 7단계에서 설정을 확인하지만, 이미 1~6단계의 네트워크 요청·파싱·비교가 완료된 후.

```javascript
// L320 — 이 시점에서 설정 확인이 필요하나 없음
const cacheBuster = this.VERSIONS_URL + '?_t=' + Date.now();
console.log(`[CPM AutoCheck] Fetching version manifest...`);
const fetchPromise = Risu.risuFetch(cacheBuster, { method: 'GET', plainFetchForce: true });

// ... 130줄의 파싱·비교·토스트 로직 후 ...

// L374 — 설정 확인이 여기서야 됨
if (mainUpdateInfo) {
    setTimeout(async () => {
        if (await safeGetBoolArg('cpm_disable_autoupdate', false)) {
            // ✅ 여기서 차단 — 하지만 이미 fetch + parse 완료
            console.log(`[CPM AutoCheck] Auto-update disabled by user. Showing notification only.`);
            await this._showMainUpdateAvailableToast(...);
            return;
        }
        await this.safeMainPluginUpdate(...); // 이건 실행 안 됨
    }, delay);
}
```

**메모리 영향**: ~50-100KB (fetch + JSON.parse + 스키마 검증 객체)

---

### ★ 문제 3: `checkMainPluginVersionQuiet()` — 전체 JS 다운로드 후 install만 차단

**파일**: [src/lib/auto-updater.js#L400-L495](src/lib/auto-updater.js#L400-L495)

**코드 흐름**:
```
1. [L400] 매니페스트에서 이미 확인했으면 건너뜀 ← 보통 건너뜀
2. [L404] 중복 방지 플래그 확인
3. [L408] 10분 쿨다운 확인
4. [L420] ❌ provider-manager.js 전체 다운로드 시작 (50~70KB)
5. [L425] nativeFetch 시도 (20초 타임아웃)
6. [L445] 실패 시 risuFetch 폴백 (20초 타임아웃)
7. [L462] 정규식으로 버전 태그 추출
8. [L470] 버전 비교
9. [L477] ✅ 드디어 safeGetBoolArg('cpm_disable_autoupdate') 확인
10. [L478] OFF면 → 토스트만 표시
```

**핵심 문제**: 매니페스트 체크(문제 2)가 성공하면 이 경로는 건너뛰어지지만, **매니페스트 fetch가 실패할 경우** 이 폴백이 실행되어 **전체 JS 파일을 다운로드하고 파싱한 후에야** 설정을 확인한다.

```javascript
// L420 — 전체 JS 다운로드 (설정 확인 없음)
const cacheBuster = this.MAIN_UPDATE_URL + '?_t=' + Date.now();
const response = await Promise.race([
    Risu.nativeFetch(cacheBuster, { method: 'GET' }),
    new Promise((_, reject) => setTimeout(() => reject(...), 20000)),
]);
code = await response.text(); // 50~70KB 전체 JS

// ... 정규식 파싱 후 ...

// L477 — 다운로드 완료 후에야 설정 확인
if (cmp > 0) {
    if (await safeGetBoolArg('cpm_disable_autoupdate', false)) {
        // ✅ install은 차단 — 하지만 이미 JS 전체 다운로드됨
        await this._showMainUpdateAvailableToast(...);
        return;
    }
}
```

**메모리 영향**: 최악 시 ~150-300KB (2회 다운 시도 + 정규식 + 문자열 버퍼)

---

### ★ 문제 4: 서브플러그인 자체 타이머/리스너

**설정과 독립적으로 동작**하는 서브플러그인 타이머:

| 서브플러그인 | 파일 | 타이머 종류 | 주기 | 영향 |
|---|---|---|---|---|
| Chat Navigation | [cpm-chat-navigation.js#L546](cpm-chat-navigation.js#L546) | `setInterval` | 3초 | DOM 폴링 (컨테이너 감시) |
| Chat Resizer | [cpm-chat-resizer.js#L401](cpm-chat-resizer.js#L401) | MutationObserver + debounce | 250-400ms | DOM 변경 감시 |
| Translation Cache | [cpm-translation-cache.js](cpm-translation-cache.js) | Event listeners | 이벤트 발생 시 | 핸들러 위임 |

이 타이머들은 **메인 플러그인의 자동 업데이트 설정과 무관**하다. 다만, 사용자가 체감하는 "새로고침"의 원인일 수 있다. 특히 Chat Navigation의 3초 폴링은 DOM을 반복 탐색하므로 체감 성능에 영향을 줄 수 있다.

---

## 5. RisuAI 오픈소스 교차검증

> 교차검증 소스: `Risuai-main/src/ts/plugins/` 디렉토리  
> 검증일: 2026-03-23

### 5.1 플러그인 로드 라이프사이클 (RisuAI 측)

RisuAI의 V3 플러그인 실행 흐름 (`Risuai-main/src/ts/plugins` 참조):

```
loadPlugins()                          ← plugins.svelte.ts#L417 (앱 초기화 시 1회 호출)
  └─ loadV3Plugins(pluginV3)           ← v3.svelte.ts#L1045
       └─ executePluginV3(plugin)      ← v3.svelte.ts#L1056 (플러그인당 1회)
            ├─ iframe 생성 (sandbox: allow-scripts, allow-modals, allow-downloads)
            ├─ CSP 적용 (connect-src 'none')
            ├─ SandboxHost 인스턴스 생성 → RPC postMessage 브릿지
            └─ host.run(iframe, plugin.script) → 플러그인 코드 실행
```

**검증 확인**: `executePluginV3()`는 이미 실행 중인 플러그인을 중복 로드하지 않음:
```typescript
// v3.svelte.ts#L1058-L1061
const alreadyRunning = v3PluginInstances.find(p => p.name === plugin.name);
if(alreadyRunning){
    console.log(`[RisuAI Plugin: ${plugin.name}] Plugin is already running. Skipping load.`);
    return;
}
```

### 5.2 `connect-src 'none'` CSP와 메모리 영향

**소스**: `Risuai-main/src/ts/plugins/apiV3/factory.ts#L271`:
```typescript
private csp = `connect-src 'none'; script-src 'nonce-${this.nonce}' https:; frame-src 'none'; object-src 'none'; style-src * 'unsafe-inline';`;
```

**⚠ 교차검증 핵심 발견**:
1. RisuAI의 CSP `connect-src 'none'`으로 인해 iframe 내부에서 **직접 fetch 불가**
2. 모든 네트워크 요청(`Risu.risuFetch()`, `Risu.nativeFetch()`)은 **postMessage RPC를 통해 호스트 메인 프레임에서 실행**
3. 따라서 CPM의 불필요한 네트워크 요청은 **호스트(RisuAI) 앱의 메인 스레드 메모리를 직접 점유**
4. 응답 데이터는 RPC를 통해 iframe으로 전달되므로 **호스트에서 한 번, iframe에서 한 번** 총 2회 메모리 할당이 발생

이 구조는 CPM의 불필요한 fetch가 "플러그인 자체만의 문제"가 아니라 **RisuAI 앱 전체의 성능에 영향**을 미친다는 것을 의미한다.

### 5.3 `pluginStorage`의 실제 구현

**소스**: `Risuai-main/src/ts/plugins/pluginSafeClass.ts#L4-L6`:
```typescript
const pluginStorage = localforage.createInstance({
    name: 'plugin',
    storeName: 'plugin'
});
```

**검증 결과**:
- **IndexedDB** 기반 (`localforage` 라이브러리)
- 키 접두사 `safe_plugin_` 자동 부착
- 비동기 I/O — `pluginStorage.setItem()` 호출 시 IndexedDB 트랜잭션 발생
- CPM이 쿨다운 타임스탬프 저장(`_VERSION_CHECK_STORAGE_KEY`)에 사용 → 부팅마다 IndexedDB read+write
- **API 노출 경로**: `v3.svelte.ts#L1007-L1012`에서 `_getPluginStorage`, `_setPluginStorage` 등으로 RPC 브릿지에 매핑

### 5.4 플러그인 재실행 트리거 검증

RisuAI 측에서 플러그인을 **주기적으로 재초기화하지 않음**을 확인:

| 검증 항목 | 소스 파일 | 결과 |
|---|---|---|
| 주기적 재실행 | `plugins.svelte.ts` | ❌ 없음 — `loadPlugins()`는 앱 초기화 1회만 |
| 수동 리로드 경로 | `v3.svelte.ts#L481-L510` | `unloadV3Plugin()` → `executePluginV3()` — 수동 트리거만 |
| Hot-reload 감시 | `developMode.ts#L5-L50` | File System Access API 기반 (수동 `showOpenFilePicker`) — 배포 환경 비활성 |
| 권한 재확인 주기 | `v3.svelte.ts#L525-L540` | 3일 주기지만 **플러그인 재실행과 무관** (권한 다이얼로그만 재표시) |
| SPA 네비게이션 | 전체 | 페이지 이동 없는 SPA — 플러그인은 한번 로드 후 계속 유지 |

### 5.5 교차검증 결론

**보고서의 원인 분석이 정확함을 확인:**

1. ✅ 사용자가 체감하는 "새로고침"은 **RisuAI가 플러그인을 재로드해서가 아님**
2. ✅ **CPM 내부의 네트워크 요청(fetch)**과 **서브플러그인의 DOM 조작 타이머**가 원인
3. ✅ RPC 브릿지 구조 때문에 불필요한 fetch는 **호스트 앱 전체의 메모리에 영향**
4. ✅ `cpm_disable_autoupdate` 설정은 install만 차단하며, fetch/파싱 경로는 **설정과 무관**하게 실행
5. ✅ `autoBootstrapBundledPlugins()`는 설정 확인 자체가 없어 **가장 심각한 우회 경로**

---

## 6. 메모리/성능 영향 종합

### 6.1 1회 부팅 시 (자동 업데이트 OFF)

| 단계 | 네트워크 요청 | 응답 크기 | 추가 메모리 사용 |
|------|:---:|---:|---:|
| `autoBootstrapBundledPlugins` | 1회 (update-bundle.json) | ~50KB+ | ~200-500KB (파싱) |
| `checkVersionsQuiet` | 1회 (versions.json) | ~5-10KB | ~50-100KB (파싱) |
| `checkMainPluginVersionQuiet` | 0~2회 (폴백 시) | ~50-70KB/회 | ~150-300KB (파싱) |
| **합계 (정상 경로)** | **2회** | **~55-60KB** | **~250-600KB** |
| **합계 (폴백 포함)** | **3-4회** | **~155-200KB** | **~400-900KB** |

### 6.2 세션 중 반복

- `checkVersionsQuiet` 쿨다운: **10분** — 페이지가 SPA로 유지되므로 10분마다 반복
  - 다만 `_cpmVersionChecked` 플래그로 세션당 1회로 제한됨
- `autoBootstrapBundledPlugins`: 세션당 **1회**

→ 실질적으로 **부팅 시 1회**만 집중 발생. 10분 주기 반복은 `_cpmVersionChecked` 플래그로 인해 **현 구현에서는 발생하지 않음**.

### 6.3 서브플러그인 상시 메모리

- Chat Navigation 3초 `setInterval`: DOM 탐색 → 미미하지만 GC 압력 지속
- Chat Resizer MutationObserver: DOM 변경 시마다 콜백 실행
- 이벤트 핸들러 누적: hot-reload 시 이전 핸들러 미해제 가능성

---

## 7. 근본 원인 정리

### 7.1 설계 패턴 문제
`cpm_disable_autoupdate`는 **"자동 설치를 비활성화"**하는 것이지, **"버전 확인 자체를 비활성화"**하는 것이 아니다. 설정 이름("Disable Main Plugin Auto-Update")이 사용자 기대와 다르다.

### 7.2 체크-후-차단 패턴 (Check-then-Block)
모든 업데이트 경로에서 다운로드·파싱이 먼저 실행되고, **그 이후에** 설정을 확인한다. 이는 불필요한 리소스 소비의 직접적 원인.

### 7.3 부트스트랩의 비조건적 실행
`autoBootstrapBundledPlugins()`는 `cpm_disable_autoupdate`를 전혀 확인하지 않으며, 이는 자동 업데이트 OFF 사용자에게 신규 서브플러그인이 동의 없이 설치될 수 있는 잠재적 문제도 내포.

### 7.4 `plainFetchForce: true`의 의미
CPM의 모든 업데이트 요청에 `plainFetchForce: true`가 사용되는데, 이는 RisuAI의 프록시를 우회하고 직접 fetch를 실행한다. 브라우저 캐시 정책도 cache buster(`?_t=...`)로 무력화하므로, **매번 전체 응답을 네트워크에서 다운로드**한다.

---

## 8. 사용자 체감 시나리오 재현

1. 사용자가 `cpm_disable_autoupdate` = true 설정
2. RisuAI 새로고침/재접속
3. CPM 부팅 시작
4. `autoBootstrapBundledPlugins()` → update-bundle.json 50KB+ 다운로드 (설정 무시) → 번들에 새 서브플러그인 있으면 자동 설치까지 됨
5. 5초 후 `checkVersionsQuiet()` → versions.json 다운로드 (설정 무시) → 업데이트 토스트 표시 → 메인 업데이트 감지 시 토스트 추가 표시
6. 폴백 경로로 `checkMainPluginVersionQuiet()` → provider-manager.js 전체를 다운로드 후 정규식으로 버전 추출 (설정 무시)
7. 서브플러그인 타이머 시작 (3초 폴링 등)
8. 사용자가 네트워크 활동과 토스트 알림을 보고 "OFF인데 왜 새로고침/업데이트가 되지?" 라고 인식

---

## 9. 검증 방법

브라우저 DevTools에서 확인 가능:
1. **Network 탭**: `versions.json`, `update-bundle.json`, `provider-manager.js` 요청 필터링
2. **Console 탭**: `[CPM AutoCheck]`, `[CPM MainAutoCheck]`, `[CPM Bootstrap]` 로그 검색
3. 자동 업데이트 OFF 상태에서도 위 요청/로그가 모두 출력됨을 확인

---

## 10. 권장 사항 요약

| 우선순위 | 영역 | 권장 조치 |
|:---:|---|---|
| P0 | `autoBootstrapBundledPlugins` | 함수 시작부에 `cpm_disable_autoupdate` 확인 추가 |
| P0 | `checkVersionsQuiet` | fetch 이전에 설정 확인 → OFF면 전체 건너뛰기 |
| P0 | `checkMainPluginVersionQuiet` | fetch 이전에 설정 확인 → OFF면 전체 건너뛰기 |
| P1 | init.js 부팅 시퀀스 | 5초 setTimeout 진입 전에 설정 일괄 확인 |
| P2 | 서브플러그인 타이머 | 개별 비활성화 옵션 또는 부모 설정 연동 검토 |
| P3 | 설정 이름/설명 | "자동 업데이트" → "자동 업데이트 확인 및 설치" 로 명확화 |

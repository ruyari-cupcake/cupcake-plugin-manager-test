# CPM 자동 업데이트 OFF 수정 계획서 (v2 — 수정)

> **작성일**: 2026-03-23 | **최종 수정**: 2026-03-23  
> **기반 보고서**: `audit_report/autoupdate_off_bypass_analysis.md`  
> **대상 파일**: `src/lib/auto-updater.js`, `src/lib/init.js`  
> **영향 범위**: 메인 플러그인 부팅 시퀀스, 자동 업데이트 체크 중 "설치/과부하" 경로만 차단

---

## 0. 수정 원칙 (v2 변경)

> ⚠ **v1 계획과의 핵심 차이**: 업데이트 **확인(fetch)과 플로팅 알림은 유지**한다.  
> 자동 업데이트 OFF는 **자동 설치와 과부하 유발 작업만 차단**하는 것이 올바른 동작이다.

1. **`checkVersionsQuiet()`는 OFF에서도 정상 실행** — versions.json(5~10KB)은 경량이며, 업데이트 플로팅 토스트는 사용자 편의 기능으로 반드시 유지
2. **자동 설치(`safeMainPluginUpdate`, `_rememberPendingMainUpdate`, `install`)만 차단** — 현재 `checkVersionsQuiet()` 내부의 설정 확인 위치는 이미 올바름
3. **과부하 유발 작업만 차단** — 50~70KB JS 전체 다운로드(`checkMainPluginVersionQuiet`), 50KB+ 번들 다운로드+자동설치(`autoBootstrapBundledPlugins`)
4. **리스 저장 데이터 접근은 최소화** — OFF 시 불필요한 `pluginStorage` 쓰기, `_rememberPendingMainUpdate` 등 차단
5. 수정은 **최소 변경**으로 구현 — 기존 함수 시그니처·반환값 변경 없음

---

## 1. 현행 동작 분류 (수정 대상 판별)

### 1.1 `checkVersionsQuiet()` — ✅ **현행 유지 (수정 불필요)**

| 단계 | 동작 | 리소스 | OFF 시 동작 | 판정 |
|:---:|---|---|---|:---:|
| 1 | versions.json fetch | ~5-10KB | 실행 | ✅ 유지 (경량, 편의 기능) |
| 2 | JSON 파싱 + 스키마 검증 | 미미 | 실행 | ✅ 유지 |
| 3 | 서브플러그인 버전 비교 | CPU 미미 | 실행 | ✅ 유지 |
| 4 | **업데이트 플로팅 토스트 표시** | DOM 삽입 | 실행 | ✅ **반드시 유지** |
| 5 | 메인 업데이트 감지 시 토스트 | DOM 삽입 | ✅ 기존 코드가 이미 처리 | ✅ 유지 |
| 6 | `_rememberPendingMainUpdate` | pluginStorage | ❌ OFF 시 건너뜀 | ✅ **이미 올바름** |
| 7 | `safeMainPluginUpdate` (자동 설치) | 50-70KB DL | ❌ OFF 시 건너뜀 | ✅ **이미 올바름** |

**현재 코드 (L374~L387)**:
```javascript
if (mainUpdateInfo) {
    setTimeout(async () => {
        if (await safeGetBoolArg('cpm_disable_autoupdate', false)) {
            // ✅ OFF: 토스트만 표시, install 안 함 — 올바른 동작
            await this._showMainUpdateAvailableToast(...);
            return;
        }
        // ON: 자동 설치 진행
        await this._rememberPendingMainUpdate(...);
        await this.safeMainPluginUpdate(...);
    }, delay);
}
```

→ **이 함수는 이미 올바르게 동작하므로 수정하지 않는다.**

---

### 1.2 `checkMainPluginVersionQuiet()` — ❌ **수정 필요**

| 단계 | 동작 | 리소스 | OFF 시 문제 | 판정 |
|:---:|---|---|---|:---:|
| 1 | **provider-manager.js 전체 다운로드** | **50~70KB** | ❌ **과부하** | 🔴 차단 |
| 2 | nativeFetch 실패 시 risuFetch 폴백 | **추가 50~70KB** | ❌ **과부하** | 🔴 차단 |
| 3 | 정규식 버전 추출 | CPU 미미 | 1~2에 의존 | — |
| 4 | 토스트 표시 | DOM 삽입 | ✅ 기존 코드가 처리 | — |
| 5 | `_rememberPendingMainUpdate` + install | pluginStorage + DL | ❌ OFF 시 건너뜀 | ✅ 이미 처리 |

**문제**: 이 함수는 **매니페스트 경로의 폴백**으로, 버전 확인을 위해 **JS 파일 전체를 다운로드**한다. OFF 사용자에게 이 과부하는 불필요하다. (매니페스트 경로가 실패해도 토스트만 안 뜰 뿐, 치명적이지 않음)

---

### 1.3 `autoBootstrapBundledPlugins()` — ❌ **수정 필요**

| 단계 | 동작 | 리소스 | OFF 시 문제 | 판정 |
|:---:|---|---|---|:---:|
| 1 | **update-bundle.json 전체 다운로드** | **50KB+** | ❌ **과부하** | 🔴 차단 |
| 2 | JSON 파싱 + 스키마 검증 | CPU | ❌ 1에 의존 | 🔴 차단 |
| 3 | SHA-256 해시 계산 | CPU | ❌ 1~2에 의존 | 🔴 차단 |
| 4 | 신규 서브플러그인 자동 초기 설치 | DB 쓰기 | △ 대부분 이미 설치됨 (실질 0회) | 🟡 부차적 |

**문제**: 설정 확인 자체가 없으며, **매 부팅마다 50KB+ 번들을 다운로드**하고 JSON 파싱 + SHA-256 계산을 수행한다. (참고: 4단계의 자동 설치는 레지스트리에 없는 신규 플러그인만 대상이며, 기존 서브플러그인 업데이트와는 별개. 대부분의 경우 모든 번들 플러그인이 이미 설치되어 있으므로 실질적 install 호출은 0회지만, 1~3단계의 과부하는 매번 발생.)

---

### 1.4 `retryPendingMainPluginUpdateOnBoot()` — ✅ **현행 유지**

기존 코드가 이미 `safeGetBoolArg('cpm_disable_autoupdate')` 확인 후 건너뜀. 올바른 동작.

---

## 2. 수정 대상 목록 (v2)

| # | 파일 | 함수 | 수정 내용 | 우선순위 |
|:---:|---|---|---|:---:|
| 1 | `src/lib/auto-updater.js` | `checkMainPluginVersionQuiet()` | 함수 진입부에 설정 확인 → OFF 시 전체 건너뜀 | P0 |
| 2 | `src/lib/auto-updater.js` | `autoBootstrapBundledPlugins()` | 함수 진입부에 설정 확인 → OFF 시 전체 건너뜀 | P0 |
| 3 | `src/lib/init.js` | 5초 setTimeout 내 폴백 호출부 | `checkMainPluginVersionQuiet` 호출 전 설정 확인 | P1 |
| 4 | 설정 UI/헤더 | `cpm_disable_autoupdate` 설명 | 설명문을 실제 동작에 맞게 명확화 | P3 |

> **v1 대비 제거 항목**: `checkVersionsQuiet()` 수정 (이미 올바르므로 불필요), init.js 전체 차단 (확인 기능 유지 필요)

---

## 3. 상세 수정 계획

### 3.1 [P0] `checkMainPluginVersionQuiet()` — 과부하 JS 다운로드 차단

**파일**: `src/lib/auto-updater.js`  
**위치**: 함수 시작부, 중복 방지 플래그 직후 (현재 L404~L406 부근)

**현재 코드**:
```javascript
async checkMainPluginVersionQuiet() {
    try {
        if (window._cpmMainVersionFromManifest) {
            // 매니페스트에서 이미 확인 → skip (이 경로는 문제 없음)
            return;
        }
        if (window._cpmMainVersionChecked) return;
        window._cpmMainVersionChecked = true;
        // ... 쿨다운 확인 후 바로 전체 JS fetch (50~70KB) ...
```

**수정 후**:
```javascript
async checkMainPluginVersionQuiet() {
    try {
        if (window._cpmMainVersionFromManifest) {
            return; // 매니페스트에서 이미 확인
        }
        if (window._cpmMainVersionChecked) return;
        window._cpmMainVersionChecked = true;

        // ── Early exit: auto-update OFF → skip heavy JS download ──
        // 매니페스트 경로(checkVersionsQuiet)가 실패한 경우의 폴백이므로,
        // OFF 사용자에게는 50~70KB JS 전체 다운로드를 건너뜀.
        // 매니페스트 확인+토스트는 checkVersionsQuiet에서 이미 처리됨.
        if (await safeGetBoolArg('cpm_disable_autoupdate', false)) {
            console.log('[CPM MainAutoCheck] Auto-update disabled. Skipping heavy JS fallback download.');
            return;
        }

        // ... 기존 쿨다운 + fetch 로직 그대로 유지 ...
```

**변경 효과**:
- OFF 시 50~70KB JS 다운로드 제거 (최대 2회 시도 120~140KB 절약)
- 매니페스트 경로가 성공했으면 이미 `_cpmMainVersionFromManifest` 플래그로 건너뛰므로 영향 없음
- 매니페스트 경로가 실패한 경우에만 실질적 차이 발생 → OFF 사용자는 토스트를 못 보지만 이는 네트워크 문제 상황이므로 수용 가능

**기존 내부 설정 확인 (L477~L480)**: 제거하지 않고 유지 (Defense in Depth)

---

### 3.2 [P0] `autoBootstrapBundledPlugins()` — 번들 다운로드+자동 설치 차단

**파일**: `src/lib/auto-updater.js`  
**위치**: 함수 시작부 (현재 L1041~L1048 부근)

**현재 코드**:
```javascript
async autoBootstrapBundledPlugins() {
    const LOG = '[CPM Bootstrap]';
    try {
        const cacheBuster = this.UPDATE_BUNDLE_URL + '?_t=' + ...;
        const result = await Risu.risuFetch(cacheBuster, { ... });
        // ... 50KB+ 다운로드 + 자동 설치 ...
```

**수정 후**:
```javascript
async autoBootstrapBundledPlugins() {
    const LOG = '[CPM Bootstrap]';
    try {
        // ── Early exit: auto-update OFF → skip bundle fetch & auto-install ──
        // 50KB+ 번들 다운로드 + SHA-256 계산 + 신규 서브플러그인 자동 설치를 건너뜀.
        // OFF 사용자는 수동으로 서브플러그인을 설치해야 함.
        if (await safeGetBoolArg('cpm_disable_autoupdate', false)) {
            console.log(`${LOG} Auto-update disabled. Skipping bundle fetch and auto-bootstrap.`);
            return [];
        }

        const cacheBuster = this.UPDATE_BUNDLE_URL + '?_t=' + ...;
        // ... 기존 로직 그대로 유지 ...
```

**변경 효과**:
- OFF 시 50KB+ 번들 다운로드 + JSON 파싱 + SHA-256 계산 과부하 제거
- 기존 서브플러그인은 영향 없음 (이미 설치되어 레지스트리에 있는 것은 `executeEnabled()`에서 정상 실행)
- 참고: 신규 서브플러그인 자동 초기 설치도 건너뛰지만, 실제로 대부분 이미 설치되어 있으므로 영향 미미

---

### 3.3 [P1] `init.js` 5초 setTimeout — 폴백 호출 조건 추가

**파일**: `src/lib/init.js`  
**위치**: 5초 setTimeout 내부 (현재 L389~L404 부근)

**주의**: `checkVersionsQuiet()`는 OFF에서도 실행해야 하므로, v1처럼 전체를 차단하면 안 됨.

**수정 방향**: 기존 코드 유지. 각 함수 내부에서 이미 처리하므로 init.js 측 수정은 **선택적 최적화**로만 적용.

**수정 후** (선택적):
```javascript
setTimeout(async () => {
    let retryHandled = false;
    try {
        retryHandled = ... retryPendingMainPluginUpdateOnBoot() ... // ← 이미 내부에서 OFF 확인
    } catch (_) { }

    // 매니페스트 기반 확인: OFF에서도 실행 (토스트 알림 유지)
    try { await SubPluginManager.checkVersionsQuiet(); } catch (_) { }

    // JS 폴백: 내부에서 OFF 확인 후 건너뜀 (3.1 수정 적용됨)
    if (!retryHandled) {
        try { await SubPluginManager.checkMainPluginVersionQuiet(); } catch (_) { }
    }
}, 5000);
```

→ 실질적으로 **init.js 코드 자체는 변경 불필요**. 각 함수 내부의 early-exit가 올바르게 동작.

---

### 3.4 [P3] 설정 설명문 명확화

**현재**:
```
"Disable Main Plugin Auto-Update (true/false)"
"🔒 메인 플러그인 자동 업데이트를 비활성화합니다"
"활성화하면 새 버전이 있어도 자동으로 설치하지 않고, 알림만 표시합니다."
```

**수정 후**:
```
"Disable Main Plugin Auto-Update (true/false)"
"🔒 메인 플러그인 자동 업데이트를 비활성화합니다"
"활성화하면 새 버전 알림은 표시하되, 자동 설치 및 무거운 백그라운드 다운로드를 건너뜁니다. 수동 업데이트(+ 버튼)는 항상 작동합니다."
```

**수정 위치**: 
- `src/ui/settings-page.js` 또는 해당 inline HTML (설명문 `<p>` 태그)
- `src/plugin-header.js#L93` (@arg 선언) — 영문 설명은 현행 유지 가능

---

## 4. 수정 적용 순서

```
Phase 1 (P0 — 핵심 수정, 2개 파일만):
  1. auto-updater.js: checkMainPluginVersionQuiet() early-exit 추가
  2. auto-updater.js: autoBootstrapBundledPlugins() early-exit 추가
  3. 단위 테스트: OFF 시 heavy fetch 차단 + 토스트 정상 검증

Phase 2 (P3 — UX):
  4. 설정 설명문 수정
  5. 빌드 → dist 반영
```

---

## 5. 테스트 계획

### 5.1 단위 테스트 (vitest)

| 테스트 ID | 대상 | 시나리오 | 기대 결과 |
|---|---|---|---|
| AU-01 | `checkVersionsQuiet` | OFF 상태 | **정상 실행** — versions.json fetch + 토스트 표시 ✅ |
| AU-02 | `checkVersionsQuiet` | OFF 상태, 메인 업뎃 감지 | 토스트 표시 ✅, `safeMainPluginUpdate` 호출 0회 ✅ |
| AU-03 | `checkMainPluginVersionQuiet` | OFF 상태 | `nativeFetch`/`risuFetch` 호출 0회, 즉시 return |
| AU-04 | `checkMainPluginVersionQuiet` | ON 상태 | 기존 동작 유지 (fetch + 비교 + 설치) |
| AU-05 | `autoBootstrapBundledPlugins` | OFF 상태 | `risuFetch` 호출 0회, 빈 배열 반환 |
| AU-06 | `autoBootstrapBundledPlugins` | ON 상태 | 기존 동작 유지 (번들 다운 + 설치) |

### 5.2 통합 테스트 (브라우저 DevTools)

| 테스트 ID | 시나리오 | 검증 항목 |
|---|---|---|
| INT-01 | OFF 상태 부팅 | **versions.json** 요청 ✅ 존재, **update-bundle.json** 요청 ❌ 없음 |
| INT-02 | OFF 상태, 업뎃 존재 | 서브플러그인 업데이트 **토스트 표시됨** ✅ |
| INT-03 | OFF 상태, 메인 업뎃 존재 | 메인 업데이트 **토스트 표시됨** ✅, 자동 설치 ❌ 안 됨 |
| INT-04 | ON 상태 부팅 | 기존 동작 완전 동일 (fetch + 토스트 + 자동 설치) |
| INT-05 | OFF→ON 전환 후 재부팅 | 모든 기능 정상 복원 |

### 5.3 회귀 테스트

| 항목 | 확인 사항 |
|---|---|
| 수동 업데이트 | 리스 설정의 + 버튼으로 수동 설치 → OFF여도 작동 ✅ |
| 업데이트 토스트 클릭 | 토스트의 수동 설치 버튼 클릭 → 정상 작동 ✅ |
| 서브플러그인 실행 | `executeEnabled()`는 OFF와 무관하게 정상 ✅ |
| 매니페스트 실패 시 | OFF면 폴백(JS 다운로드)도 건너뜀 → **수용 가능한 트레이드오프** |
| 설정 백업/복원 | `SettingsBackup` 무영향 ✅ |
| 모델 등록 | `registerModels()` 무영향 ✅ |

---

## 6. 리스크 분석

| 리스크 | 가능성 | 영향 | 완화 방안 |
|---|:---:|:---:|---|
| 매니페스트 fetch 실패 + OFF → 토스트 안 뜸 | 낮 | 낮 | 네트워크 문제 시 ON이어도 안 뜨므로 동일 상황 |
| OFF 사용자가 신규 서브플러그인 자동 초기 설치를 못 받음 | 낮 | 낮 | 대부분 이미 설치됨; 미설치 시 수동 설치 안내 |
| `safeGetBoolArg` 실패 시 무한 차단 | 낮 | 중 | try-catch로 실패 시 기존 동작(fetch) 진행 |

---

## 7. 예상 결과 (수정 전 vs 후)

### 자동 업데이트 OFF 상태 부팅 시

| 항목 | 수정 전 | 수정 후 |
|---|---|---|
| versions.json fetch (경량) | 1회, 5~10KB | **1회, 5~10KB (유지)** |
| update-bundle.json fetch (과부하) | 1회, 50KB+ | **0회** |
| provider-manager.js fetch (과부하) | 0~2회, 50~70KB/회 | **0회** |
| 업데이트 토스트 표시 | ✅ 정상 | **✅ 정상 (유지)** |
| 자동 설치 | ❌ 차단 | **❌ 차단 (유지)** |
| 신규 서브플러그인 자동 초기 설치 | △ 대부분 실질 0회 (이미 설치) | **건너뜀 (과부하 차단의 부수 효과)** |
| 총 네트워크 절약 | — | **50~190KB 절약** |
| 추가 메모리 절약 | — | **200~700KB 절약** |

---

## 8. 참고: 서브플러그인 타이머 이슈 (별도 계획 필요)

본 계획서의 범위 밖이나, 보고서에서 식별된 서브플러그인 타이머 이슈:

| 서브플러그인 | 타이머 | 향후 검토 사항 |
|---|---|---|
| Chat Navigation | 3초 `setInterval` | 컨테이너 발견 후 clearInterval 또는 IntersectionObserver 전환 |
| Chat Resizer | MutationObserver debounce | disconnect 조건 검토 |
| Translation Cache | Event listeners | 핫리로드 시 중복 등록 방지 |

이 이슈들은 자동 업데이트 설정과는 **별개의 성능 최적화 항목**이므로, 별도 티켓/계획으로 관리 권장.

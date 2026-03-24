# 서브 플러그인 토스트 과부하 감사 보고서

> **버전:** v1.22.36 | **작성일:** 2026-03-24 | **대상:** 자동 업데이트 확인 → 서브 플러그인 업데이트 토스트 경로

---

## 1. 결론 (Executive Summary)

**서브 플러그인 토스트 경로는 완전히 경량이며, 페이지 새로고침이나 과부하를 유발하는 요소가 없습니다.**

무거운 작업(번들 다운로드, DB 쓰기 등)은 모두 **메인 플러그인 자동 업데이트** 또는 **설정 UI 수동 업데이트** 시에만 발생합니다.

---

## 2. 자동 실행 호출 체인

```
init.js (line ~395)
 └─ setTimeout(5000ms)
     ├─ [1] retryPendingMainPluginUpdateOnBoot()   ← 메인 플러그인 부팅 재시도
     ├─ [2] checkVersionsQuiet()                    ← 서브 + 메인 버전 확인
     └─ [3] checkMainPluginVersionQuiet()           ← 메인 플러그인 JS 폴백 (필요시만)
```

### 서브 플러그인 토스트 경로 (항상 실행)

```
checkVersionsQuiet()
 ├─ 쿨다운 체크 (pluginStorage → _VERSION_CHECK_STORAGE_KEY, 10분)
 ├─ fetch: versions.json (~수 KB, VERSIONS_URL + cacheBuster)  ← 유일한 네트워크 요청
 ├─ 매니페스트 JSON 파싱 + 스키마 검증
 ├─ this.plugins[] 순회 → 로컬 vs 원격 버전 비교
 ├─ updatesAvailable > 0이면:
 │   └─ showUpdateToast(updates)  ← 순수 DOM 조작만 (네트워크 없음)
 └─ pluginStorage.setItem(Date.now()) ← 쿨다운 타임스탬프 기록 (극히 경미)
```

---

## 3. 항목별 점검 결과

### 3-1. showUpdateToast() (update-toast.js)

| 점검 항목 | 결과 | 비고 |
|-----------|------|------|
| 대용량 파일 다운로드? | ❌ **없음** | 네트워크 요청 전혀 없음 |
| saveRegistry() 호출? | ❌ **없음** | |
| DB(getDatabase/setDatabaseLite) 접근? | ❌ **없음** | |
| fetch / risuFetch 호출? | ❌ **없음** | |
| 쿠키 / localStorage / pluginStorage 쓰기? | ❌ **없음** | |
| 페이지 리로드 유발? | ❌ **없음** | |
| 수행 동작 | ✅ DOM 조작만 | `getRootDocument()` → `createElement('div')` → 인라인 CSS → `body.appendChild()` → 8초 후 자동 제거 |

### 3-2. checkVersionsQuiet() — 서브 플러그인 부분

| 점검 항목 | 결과 | 비고 |
|-----------|------|------|
| 네트워크 요청 | `versions.json` **1회만** | ~수 KB, 15초 타임아웃 |
| update-bundle.json (~988KB) 다운로드? | ❌ **절대 없음** | `checkAllUpdates()`만 다운로드함 |
| saveRegistry() 호출? | ❌ **없음** | |
| DB 쓰기? | ❌ **없음** | |
| pluginStorage 쓰기? | 쿨다운 타임스탬프 1개 | `Date.now()` 문자열 → 극히 경미 |
| applyUpdate() 호출? | ❌ **없음** | 버전 비교 + 토스트 표시 후 종료 |
| install() 호출? | ❌ **없음** | |

### 3-3. checkVersionsQuiet() — 메인 플러그인 부분 (⚠️ 주의)

서브 플러그인 확인과 같은 함수 안에 메인 플러그인 업데이트 경로가 공존합니다:

```
checkVersionsQuiet() 
 └─ mainUpdateInfo 존재 시 (메인 업데이트 감지)
     └─ setTimeout(1500ms 또는 0ms)
         ├─ cpm_disable_autoupdate = true  → _showMainUpdateAvailableToast() (경량, 토스트만)
         └─ cpm_disable_autoupdate = false → safeMainPluginUpdate()  ⚠️ 무거움!
             └─ _downloadMainPluginCode()
                 ├─ 1차: update-bundle.json (~988KB) fetch 시도
                 ├─ 실패시: provider-manager.js (~640KB) 직접 다운로드
                 └─ SHA-256 무결성 검증
             └─ _validateAndInstallMainPlugin()
                 ├─ Risu.getDatabase() → DB 읽기
                 ├─ Risu.setDatabaseLite() → DB 쓰기 (메인 플러그인 코드 전체)
                 └─ _waitForMainPluginPersistence() → 3.5초 대기
```

**이것이 과거에 새로고침을 유발했을 가능성이 있는 경로입니다.**  
현재는 `cpm_disable_autoupdate = true` 시 이 경로가 차단되어 토스트만 표시됩니다.

---

## 4. 경로 비교 요약

| 경로 | 호출 시점 | I/O 영향 | 안전성 |
|------|-----------|----------|--------|
| **서브 플러그인 토스트** (`checkVersionsQuiet` → `showUpdateToast`) | 자동 (init 5초 후) | versions.json 1회 + DOM 조작 | ✅ **완전 경량** |
| **메인 플러그인 토스트** (`cpm_disable_autoupdate=true`) | 자동 (init 5초 후) | DOM 조작만 | ✅ **경량** |
| **메인 플러그인 자동 업뎃** (`cpm_disable_autoupdate=false`) | 자동 (init 5초 후) | ~988KB 다운로드 + DB 쓰기 + 3.5s 대기 | ⚠️ **무거움** |
| **설정 UI 수동 업뎃** (`checkAllUpdates` → `applyUpdate`) | 수동 버튼 클릭 | ~988KB 번들 + `saveRegistry()` | ⚠️ **무거움** (의도적) |

---

## 5. checkAllUpdates vs checkVersionsQuiet

| | checkVersionsQuiet() | checkAllUpdates() |
|--|--|--|
| **호출 시점** | init.js에서 자동 (5초 후) | 설정 UI 버튼 클릭 시에만 |
| **다운로드** | `versions.json` (~수 KB) | `update-bundle.json` (~988KB) |
| **코드 포함?** | ❌ 버전 정보만 | ✅ 모든 서브 플러그인 코드 포함 |
| **applyUpdate() 호출?** | ❌ 없음 | 사용자 "업데이트" 버튼 클릭 시에만 |
| **saveRegistry()?** | ❌ 없음 | applyUpdate() 내부에서만 |

---

## 6. 잠재적 주의사항

### 6-1. 메인 + 서브 경로 공존
`checkVersionsQuiet()` 안에 서브 플러그인 확인(경량)과 메인 업데이트 트리거(무거움)가 공존합니다.  
서브 토스트 자체는 경량이지만, 같은 함수 실행 중 메인 업데이트가 감지되면 무거운 경로가 시작될 수 있습니다.

→ **현재 상태:** `cpm_disable_autoupdate=true` 시 메인 자동 업데이트 경로가 차단되므로, 토스트만 표시됩니다. `false`(기본값)일 때만 무거운 경로가 활성화됩니다.

### 6-2. retryPendingMainPluginUpdateOnBoot()와 이중 실행 가능성
이론적으로 `retryPending`과 `checkVersionsQuiet()` 내 메인 업데이트가 동시에 실행될 수 있으나,  
`_mainUpdateInFlight` dedup 플래그와 `_cpmMainUpdateCompletedThisBoot` 가드로 실질적 중복은 방지됩니다.

### 6-3. pluginStorage.setItem 쿨다운 기록
`checkVersionsQuiet()` 내에서 쿨다운 타임스탬프를 `pluginStorage.setItem()`으로 기록합니다.  
이는 극히 경미한 작업이며 과부하를 유발할 가능성은 사실상 없습니다.

---

## 7. 최종 판정

| 질문 | 답변 |
|------|------|
| 서브 플러그인 토스트가 큰 문서를 다운로드하는가? | **❌ 아니오** — versions.json(수 KB)만 fetch |
| 서브 플러그인 토스트가 레지스트리 저장을 건드리는가? | **❌ 아니오** — saveRegistry() 호출 없음 |
| 서브 플러그인 토스트가 DB를 건드리는가? | **❌ 아니오** — getDatabase/setDatabaseLite 호출 없음 |
| 서브 플러그인 토스트가 과부하를 유발하는가? | **❌ 아니오** — DOM 조작만 수행 |
| 서브 플러그인 토스트가 새로고침을 유발하는가? | **❌ 아니오** — 리로드 코드 없음 |
| 무거운 작업은 어디서 발생하는가? | **메인 플러그인 자동 업데이트** (checkVersionsQuiet 내) 또는 **설정 UI 수동 업데이트** (checkAllUpdates/applyUpdate) |

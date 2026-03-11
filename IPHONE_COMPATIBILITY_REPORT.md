# ~~iPhone 호환성 분석 보고서: CacheKeeper vs Cupcake Provider Manager~~ (SUPERSEDED)

> **⚠️ 이 보고서는 `IPHONE_COMPATIBILITY_REPORT_FINAL.md`로 대체되었습니다.**  
> **이 보고서에는 중대한 분석 오류가 포함되어 있습니다. 최종 보고서를 참조하세요.**

> **작성일:** 2026-03-11 (초안, 폐기됨)  
> **대상:** gemini-cache-keeper v2.8.8 vs Cupcake Provider Manager v1.19.6  
> **작성 목적:** iPhone에서 CacheKeeper는 정상 동작하지만 Cupcake PM이 실패하는 원인 파악 및 교차검증

---

## 1. 핵심 발견: 근본 원인 (Root Cause)

### 🔴 V2 vs V3 플러그인 아키텍처 차이 — 가장 결정적인 원인

| 항목 | CacheKeeper | Cupcake PM |
|------|------------|------------|
| **API 버전** | V2 (`@api` 선언 없음) | V3 (`@api 3.0`) |
| **실행 환경** | **HOST 윈도우** (직접 실행) | **Sandboxed iframe** (Guest) |
| **API 호출 방식** | 직접 함수 호출 | postMessage 브릿지 통과 |
| **addProvider 콜백 위치** | HOST 윈도우 내부 | Guest iframe → CALLBACK_RETURN 통해 HOST로 전달 |
| **Response 전달** | 직접 반환 (직렬화 없음) | postMessage로 직렬화/전송 필요 |
| **ReadableStream 반환** | 직접 반환 → 항상 동작 ✅ | postMessage 통과 → Safari에서 실패 가능 ❌ |

**CacheKeeper는 V2 플러그인이므로 HOST 윈도우에서 직접 실행됩니다.** iframe 샌드박스도, postMessage 브릿지도 없습니다. 모든 API 호출과 반환값이 JavaScript 메모리 내에서 직접 전달됩니다. iPhone/Safari의 postMessage 제한에 전혀 영향을 받지 않습니다.

**Cupcake PM은 V3 플러그인(`@api 3.0`)이므로** `sandbox="allow-scripts allow-modals allow-downloads"` 속성의 iframe 내에서 실행됩니다. 모든 RisuAI API 호출과 addProvider 콜백 반환값이 `postMessage`를 통과해야 하며, 이 과정에서 직렬화(structured clone) 또는 전송(transfer)이 필요합니다.

---

## 2. V3 브릿지의 치명적 비대칭 (교차검증 완료)

### 2.1 `collectTransferables` 함수의 Guest/Host 비대칭

**RisuAI 소스(`factory.ts`) 교차검증 결과**, Guest와 Host의 `collectTransferables` 구현이 다릅니다:

**Guest (iframe 내부, GUEST_BRIDGE_SCRIPT) — line 92:**
```javascript
function collectTransferables(obj, transferables = []) {
    if (obj instanceof ArrayBuffer ||
        obj instanceof MessagePort ||
        obj instanceof ImageBitmap ||
        (typeof OffscreenCanvas !== 'undefined' && obj instanceof OffscreenCanvas)) {
        transferables.push(obj);
    }
    // ❌ ReadableStream, WritableStream, TransformStream 누락!
}
```

**Host (SandboxHost 클래스) — line 308:**
```typescript
private collectTransferables(obj, transferables = []) {
    if (obj instanceof ArrayBuffer ||
        obj instanceof MessagePort ||
        obj instanceof ImageBitmap ||
        obj instanceof ReadableStream ||    // ✅ 포함됨
        obj instanceof WritableStream ||    // ✅ 포함됨
        obj instanceof TransformStream ||   // ✅ 포함됨
        (typeof OffscreenCanvas !== 'undefined' && obj instanceof OffscreenCanvas)) {
        transferables.push(obj);
    }
}
```

### 2.2 이 비대칭이 미치는 영향

| 방향 | ReadableStream 처리 | Safari/iPhone |
|------|---------------------|---------------|
| **HOST → Guest** (nativeFetch 응답) | transferables에 포함 → **transfer** 방식 | transfer 지원 (Safari 14.1+) ✅ |
| **Guest → HOST** (addProvider 반환) | transferables에 **미포함** → **structured clone** 시도 | ReadableStream clone 미지원 → **DataCloneError** ❌ |

따라서 Cupcake PM의 `addProvider` 콜백이 `{ success: true, content: ReadableStream }`을 반환하면:
1. Guest의 `collectTransferables`가 ReadableStream을 감지하지 못함
2. `postMessage(response, '*', [])` — transfer list가 비어있음
3. ReadableStream에 대해 structured clone 시도
4. Safari/iPhone에서 `DOMException: DataCloneError` 발생
5. **CALLBACK_RETURN 전체가 실패** → 요청 hang 또는 에러

### 2.3 Cupcake의 기존 방어 로직과 그 한계

Cupcake에는 이미 `checkStreamCapability()` (stream-utils.js)가 있어 MessageChannel을 통한 ReadableStream clone 가능 여부를 테스트합니다:

```javascript
// Phase 1: structured-clone test
const s1 = new ReadableStream({ start(c) { c.close(); } });
const mc1 = new MessageChannel();
mc1.port1.postMessage({ s: s1 });
```

iPhone에서 이 테스트는 **실패** → `_streamBridgeCapable = false` → `collectStream()`으로 폴백하여 string을 반환합니다.

**이론적으로는 이 방어 로직이 작동해야 합니다.** 하지만 다음 문제가 남습니다:
- `checkStreamCapability()`가 테스트하는 것은 MessageChannel이지, 실제 iframe `postMessage`가 아님
- 타이밍 이슈: 테스트는 init 시점에 실행되지만, 실제 요청 시점에서 환경이 다를 수 있음  
- fetch 자체의 문제는 이 테스트로 감지되지 않음

---

## 3. Fetch 전략 비교 (상세)

### 3.1 CacheKeeper의 Fetch 전략

```
CacheKeeper (V2, HOST 윈도우에서 실행)
│
├─ proxyFetch()
│  ├─ nativeFetchRef(url, opts)    ← __pluginApis__.nativeFetch (HOST에서 직접 호출)
│  │   → 직접 fetchNative() 실행
│  │   → Response 객체 직접 반환 (직렬화 없음)
│  │
│  └─ [폴백] fetch(PROXY_URL, {...})  ← 📌 직접 proxy2 fetch
│      → HOST 윈도우에서 직접 proxy2로 fetch
│      → Response 직접 반환
│
├─ originalNativeFetchEarly(url, opts)  ← 위와 동일
│
└─ originalFetch(url, opts)  ← window.fetch 원본
```

**핵심:** CacheKeeper는 HOST에서 직접 실행되므로 `nativeFetch`가 실패해도 **직접 proxy2에 fetch**할 수 있습니다.

### 3.2 Cupcake PM의 Fetch 전략

```
Cupcake PM (V3, Guest iframe에서 실행)
│
├─ smartNativeFetch()
│  │
│  ├─ [Google/Vertex URL] nativeFetch 우선
│  │   ├─ Risu.nativeFetch(url, opts)
│  │   │   → postMessage 브릿지 → HOST fetchNative()
│  │   │   → HOST: serialize(Response) → ReadableStream transfer
│  │   │   → 📌 Safari: transfer 실패 가능 → 에러
│  │   │
│  │   └─ [AbortSignal 에러 시] signal 제거 후 재시도
│  │       → 동일한 ReadableStream transfer 문제 재발
│  │
│  ├─ [폴백] Risu.risuFetch(url, {..., plainFetchForce: true})
│  │   → postMessage → HOST globalFetch()
│  │   → HOST: plainFetch → 전체 body 수집 → Uint8Array로 반환
│  │   → Uint8Array는 structured-clone 가능 → 브릿지 통과 ✅
│  │   → Guest: new Response(Uint8Array) → 가공
│  │
│  └─ [최종 폴백] Risu.nativeFetch(url, opts)
│      → 위의 nativeFetch와 동일 문제
│
└─ 📌 직접 proxy2 fetch 경로 없음!
```

### 3.3 핵심 차이 요약

| 항목 | CacheKeeper | Cupcake PM |
|------|------------|------------|
| **기본 fetch 방식** | HOST의 nativeFetch 직접 호출 | postMessage 브릿지로 nativeFetch |
| **직접 proxy2 폴백** | ✅ `fetch(PROXY_URL, {...})` | ❌ 없음 |
| **fetch 실패 시** | proxy2 직접 접근 가능 | 브릿지 의존 → 브릿지 실패 시 전체 실패 |
| **Response 반환** | 직접 Response 객체 (직렬화 없음) | ReadableStream transfer 필요 |
| **AbortSignal 전달** | 직접 전달 (직렬화 불필요) | 브릿지 통과 → 직렬화 → DataCloneError 가능 |

---

## 4. Streaming 모드 비교

### 4.1 CacheKeeper: 기본 비스트리밍

```javascript
// DEFAULT_CONFIG
provider_streaming: false,          // 📌 기본값: 비스트리밍
provider_decoupledStreaming: false,
```

CacheKeeper의 SelfProvider는 **기본적으로 비스트리밍**입니다:
- `GeminiResponseParser._nonStreaming(response, options)` 호출
- `response.json()` → 텍스트 추출 → `{ success: true, content: "plain string" }` 반환
- addProvider 콜백이 항상 plain string 반환 → postMessage에서 직렬화 문제 없음

### 4.2 Cupcake PM: 스트리밍 → 사후 수집

```javascript
// fetchCustom에서: 항상 ReadableStream 생성
return { success: true, content: createSSEStream(res, ...) };
// ↑ ReadableStream이 항상 먼저 생성됨

// handleRequest에서: 사후 판단
if (result.content instanceof ReadableStream) {
    if (streamEnabled && bridgeCapable) {
        return result; // ReadableStream 직접 반환 → Safari에서 실패 가능
    } else {
        result.content = await collectStream(result.content); // string으로 수집
    }
}
```

**문제:** 스트리밍 URL로 요청하여 SSE 응답을 받고, ReadableStream으로 파싱한 후, collectStream으로 다시 string으로 수집합니다. 이 과정에서:
1. 스트리밍 URL(`streamGenerateContent`)을 사용하므로 서버 응답이 SSE 형식
2. 비스트리밍 URL(`generateContent`)을 사용하면 JSON 형식으로 한 번에 반환가능
3. `config.streaming` 설정과 관계없이 **URL 수준에서 이미 스트리밍 요청이 됨**

CacheKeeper는 비스트리밍 시 `generateContent` URL, 스트리밍 시 `streamGenerateContent` URL을 명확히 분리합니다:
```javascript
const endpoint = streaming ? 'streamGenerateContent?alt=sse' : 'generateContent';
```

---

## 5. 안정성 관련 추가 비교

### 5.1 Fetch 재귀 방지

**CacheKeeper:**
```javascript
_fetchBypassDepth++;
if (_fetchBypassDepth === 1) {
    window.userScriptFetch = null;    // fetch hook 제거
    globalThis.userScriptFetch = null;
}
try {
    return await proxyFetch(url, opts);
} finally {
    _fetchBypassDepth--;
    if (_fetchBypassDepth === 0) {
        // hook 복원
    }
}
```
→ 자체 fetch 호출 시 `userScriptFetch` hook을 임시 제거하여 무한 재귀 방지

**Cupcake PM:** V3 iframe 환경이므로 HOST의 `window.fetch`를 직접 hook하지 않음 → 재귀 문제 자체가 없음 (다른 방식의 문제가 있음)

### 5.2 에러 격리 및 폴백

**CacheKeeper:**
- 모든 인터셉터 에러를 catch → `callOriginalFetch`로 폴백
- 캐시 생성 실패 시 → 캐시 없이 원본 요청 전달 가능
- Provider 에러 시 → 캐시/마커 없이 fallback 요청 발사

```javascript
} catch (e) {
    // 에러 시 폴백: 마커 제거 후 원본 fetch
    return await callOriginalFetch(url, stripMarker(options, url));
}
```

**Cupcake PM:**
- fetchCustom 내부에서 에러 → `{ success: false, content: error }` 반환
- smartNativeFetch 3단계 폴백 체인
- 하지만 브릿지 레벨 에러(postMessage 실패)는 catch 불가

### 5.3 Response Body 안전성

**CacheKeeper:**
```javascript
async _fetchOnce(url, bodyStr, headers, abortSignal) {
    return await callOriginalFetch(url, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: bodyStr,  // 항상 string
        signal: abortSignal,
    });
}
```
→ Body를 항상 JSON string으로 전달. 직렬화 이슈 없음.

**Cupcake PM:**
```javascript
// smartNativeFetch에서 nativeFetch 호출 시
const nfOptions = { ...options };
if (typeof nfOptions.body === 'string') {
    nfOptions.body = new TextEncoder().encode(nfOptions.body);
}
const nfRes = await callNativeFetchWithAbortFallback(url, nfOptions);
```
→ Body를 Uint8Array로 변환하여 postMessage 브릿지로 전달. 이 자체는 문제없으나, Response 반환 시 ReadableStream transfer 필요.

---

## 6. iPhone 장애 시나리오 재구성

### 6.1 가장 가능성 높은 장애 시나리오

```
1. Cupcake의 addProvider 콜백 호출 (Guest iframe 내)
2. handleRequest() → fetchByProviderId() → fetchCustom()
3. smartNativeFetch(streamUrl, { signal: abortSignal })
4. [Google URL] → Risu.nativeFetch() 시도
5. Guest → HOST postMessage 전송:
   args에 AbortSignal 포함 → 직렬화 시 문제 가능
   하지만 serializeArg()가 AbortSignal을 특별 처리하지 않음
   → DataCloneError 또는 AbortSignal이 null로 대체됨

6. HOST: fetchNative() 실행 → fetch → Response 획득
7. HOST: serialize(Response) → { value: ReadableStream(body) }
8. HOST: collectTransferables → ReadableStream → transfer list에 포함
9. HOST → Guest postMessage(response, '*', [ReadableStream])
10. 📌 Safari 사파리 sandboxed iframe에서 ReadableStream transfer:
    - 최신 Safari: 성공할 수 있음 (14.1+)
    - sandboxed iframe 제한: 실패할 수 있음
    - 실패 시: HOST의 catch → 에러 메시지 전송

11-A. [성공 시] Guest에서 Response 재구성 → SSE 스트림 파싱
     → handleRequest에서 collectStream() → string 반환
     → CALLBACK_RETURN postMessage:
       Guest collectTransferables에 ReadableStream 없음 (이미 string)
     → string 직렬화 → 성공 ✅

11-B. [nativeFetch 실패 시] smartNativeFetch 폴백 →
     risuFetch(plainFetchForce) → Uint8Array 반환 → 
     new Response(Uint8Array) → SSE 파싱 → collectStream() → string
     → CALLBACK_RETURN → 성공 ✅
     
11-C. [리소스 한계] nativeFetch 실패 → risuFetch로 폴백 시:
     - 대용량 응답이 전체 body를 Uint8Array로 한 번에 로드
     - iPhone의 메모리 제한에 걸릴 수 있음
     - risuFetch 자체도 postMessage 통과 → body 이중 직렬화
```

### 6.2 실패 확률이 높은 지점

1. **nativeFetch의 Response ReadableStream transfer** (HOST→Guest)
   - Safari 버전/sandboxed iframe 조합에 따라 불안정
   
2. **risuFetch 폴백의 대용량 응답 처리**
   - 전체 SSE 응답을 Uint8Array로 담아 postMessage 통과
   - iPhone 메모리 제약 시 실패 가능

3. **AbortSignal 직렬화**
   - Guest의 `serializeArg`가 AbortSignal을 처리하지 않음
   - HOST에서 AbortSignal을 특별 처리하지만 Guest→HOST 경로에서 누락

4. **폴백 체인의 누적 지연**
   - nativeFetch 시도 → 실패 → risuFetch 시도 → 성공까지의 시간
   - iPhone의 네트워크/메모리 환경에서 타임아웃 가능

---

## 7. V3 플러그인에서 구현 가능한 개선사항

### 7.1 즉시 적용 가능 (RisuAI 수정 불필요)

| 번호 | 개선사항 | 효과 | 위험도 |
|------|---------|------|--------|
| **F1** | iPhone/Safari 감지 시 스트리밍 무조건 비활성화 | addProvider return에서 ReadableStream 제거 | 낮음 |
| **F2** | smartNativeFetch에 직접 proxy2 폴백 경로 추가 | 브릿지 우회 가능한 최종 폴백 확보 | 낮음 |
| **F3** | 비스트리밍 URL 사용 강제 (iPhone) | `generateContent` URL 사용 → SSE 파싱 불필요 | 낮음 |
| **F4** | nativeFetch 타임아웃 추가 | 브릿지 hang 방지 | 낮음 |
| **F5** | request body를 object로 유지 (string 변환 지연) | risuFetch 경로 최적화 | 낮음 |

### 7.2 RisuAI 수정 필요

| 번호 | 개선사항 | 효과 | 비고 |
|------|---------|------|------|
| **R1** | Guest `collectTransferables`에 ReadableStream 추가 | Guest→HOST ReadableStream transfer 가능 | PR 제출 필요 |
| **R2** | CALLBACK_RETURN에 serialize 함수 적용 | Response 등 특수 타입 안전 전달 | PR 제출 필요 |

### 7.3 구현 상세

#### F1: iPhone/Safari 감지 및 스트리밍 비활성화

```javascript
// stream-utils.js에 추가
function _isIOS() {
    const ua = navigator.userAgent;
    return /iPad|iPhone|iPod/.test(ua) || 
           (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function _isSafari() {
    return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
}

export async function checkStreamCapability() {
    if (_streamBridgeCapable !== null) return _streamBridgeCapable;
    
    // 📌 iPhone/Safari에서는 즉시 false 반환
    if (_isIOS() || _isSafari()) {
        _streamBridgeCapable = false;
        console.log('[CupcakePM] iOS/Safari detected — streaming disabled for bridge safety.');
        return false;
    }
    // ... 기존 로직
}
```

#### F2: 직접 proxy2 폴백 경로

```javascript
// smart-fetch.js에 추가
const RISU_PROXY_URL = 'https://sv.risuai.xyz/proxy2';

function _buildProxyHeaders(url, headers) {
    return {
        'risu-url': encodeURIComponent(url),
        'risu-header': encodeURIComponent(JSON.stringify(headers || {})),
        'Content-Type': 'application/json',
        'x-risu-tk': 'use',
    };
}

// smartNativeFetch의 최종 폴백으로 추가
async function _directProxy2Fetch(url, options) {
    const headers = options.headers || {};
    return fetch(RISU_PROXY_URL, {
        method: 'POST',
        headers: _buildProxyHeaders(url, headers),
        body: options.body,
        // signal은 sandbox iframe에서 직접 전달 가능
        signal: options.signal,
    });
}
```

#### F3: 비스트리밍 URL 강제 (iPhone)

```javascript
// fetch-custom.js의 streaming 판단 로직에 추가
const useStreaming = streamingEnabled && perModelStreamingEnabled && !_isIOS();

// Google format URL 수정
if (format === 'google' && useStreaming) {
    streamUrl = effectiveUrl.replace(':generateContent', ':streamGenerateContent');
    if (!streamUrl.includes('alt=')) streamUrl += '&alt=sse';
} 
// iPhone에서는 generateContent URL 유지 → JSON 응답 → 파싱 간단
```

---

## 8. CacheKeeper 구조의 안정성 우위

CacheKeeper가 더 안정적으로 동작하는 구조적 이유:

### 8.1 V2 직접 실행의 이점
- **브릿지 오버헤드 제로**: 모든 API 호출이 동기식 메모리 접근
- **직렬화 문제 없음**: Response, ReadableStream, AbortSignal 등 모든 객체가 직접 전달
- **에러 격리 우수**: try-catch가 모든 에러를 잡을 수 있음 (postMessage 실패 감지 불가 문제 없음)

### 8.2 다중 Fetch 경로
```
CacheKeeper Fetch 체인:
nativeFetchRef → proxy2 직접 fetch → originalFetch

Cupcake Fetch 체인:
direct fetch → bridge nativeFetch → bridge risuFetch → bridge nativeFetch (재시도)
```
CacheKeeper는 브릿지에 의존하지 않는 독립 경로(proxy2 직접 fetch)가 있지만,
Cupcake의 모든 경로는 브릿지를 통과합니다.

### 8.3 비스트리밍 기본값
CacheKeeper의 `provider_streaming: false` 기본값은 가장 안전한 경로를 기본으로 사용합니다.
- `generateContent` → JSON 한 번에 반환 → `response.json()` → string
- ReadableStream 생성/전달 불필요
- 모든 플랫폼에서 100% 호환

### 8.4 자체 에러 복구
```javascript
// CacheKeeper: SelfProvider 에러 시 폴백
} catch (e) {
    showToast('캐시 오류 - 기본 요청으로 전환', 'error');
    // 마커/캐시 없이 완전 새로운 요청 발사
    const fallbackReqSettings = { streaming: false, ... };
    const fallbackBody = this._buildFullBody(...);
    const fallbackResponse = await this._fetch(fallbackUrl, fallbackBody, ...);
    return await GeminiResponseParser.parse(fallbackResponse, streaming, { thoughtsMode: 'strip' });
}
```
→ 에러 발생 시 캐시/마커를 모두 strip하고 비스트리밍으로 폴백. 최대한 응답을 전달하려는 설계.

---

## 9. 교차검증: RisuAI 오픈소스 확인 결과

### 9.1 factory.ts 검증

| 확인 항목 | 결과 | 소스 위치 |
|-----------|------|-----------|
| Guest collectTransferables에 ReadableStream 미포함 | ✅ 확인 | factory.ts L92-110 |
| Host collectTransferables에 ReadableStream 포함 | ✅ 확인 | factory.ts L308-330 |
| serialize()가 Response body를 ReadableStream으로 전달 | ✅ 확인 | factory.ts L349-362 |
| CALLBACK_RETURN에서 result를 그대로 resolve | ✅ 확인 | factory.ts L265-272 |
| addProvider가 V3에서 mode를 'v3'로 강제 | ✅ 확인 | v3.svelte.ts L621 |
| AbortSignal이 ABORT_SIGNAL_REF로 직렬화 | ✅ 확인 | factory.ts L387-404 |
| Guest serializeArg에서 AbortSignal 미처리 | ✅ 확인 | factory.ts L55-65 |

### 9.2 fetchNative 검증

| 확인 항목 | 결과 | 소스 위치 |
|-----------|------|-----------|
| window.userScriptFetch 우선 체크 | ✅ 확인 | globalApi.svelte.ts L1480 |
| web 환경에서 proxy2 경유 | ✅ 확인 | globalApi.svelte.ts L1582 |
| Response body가 ReadableStream으로 반환 | ✅ 확인 | globalApi.svelte.ts L1584-1590 |
| plainFetch 시 직접 fetch | ✅ 확인 | globalApi.svelte.ts L1594-1599 |

### 9.3 V3 Plugin 실행 환경 검증

| 확인 항목 | 결과 | 소스 위치 |
|-----------|------|-----------|
| sandbox="allow-scripts allow-modals allow-downloads" | ✅ 확인 | factory.ts L449-451 |
| allow-same-origin 미포함 → unique origin | ✅ 확인 | factory.ts L449-451 |
| CSP 메타 태그 설정 | ✅ 확인 | factory.ts L520 |

---

## 10. 의심 사항 체크리스트

### 🔴 확정된 문제

| # | 문제 | 심각도 | 영향 |
|---|------|--------|------|
| 1 | Guest collectTransferables에 ReadableStream 미포함 | 치명적 | ReadableStream 반환 시 Safari에서 DataCloneError |
| 2 | V3 sandbox iframe의 postMessage 제약 | 치명적 | 모든 API 호출/반환에 직렬화 필요 |
| 3 | 직접 proxy2 폴백 경로 부재 | 높음 | 브릿지 실패 시 완전 차단 |

### 🟡 의심되는 문제

| # | 문제 | 심각도 | 확인 방법 |
|---|------|--------|-----------|
| 4 | nativeFetch Response transfer가 Safari sandboxed iframe에서 실패 가능 | 높음 | iPhone 실기기 테스트 필요 |
| 5 | risuFetch 대용량 응답 시 postMessage 크기 제한 | 중간 | 대형 SSE 응답으로 테스트 |
| 6 | AbortSignal이 Guest→HOST postMessage에서 누락될 수 있음 | 중간 | AbortSignal 포함 요청 테스트 |
| 7 | checkStreamCapability가 iPhone Safari에서 올바르게 동작하는지 | 중간 | iPhone Safari 실기기 확인 |
| 8 | 스트리밍 URL 사용 후 전체 수집 시 불완전 응답 | 중간 | 긴 응답으로 테스트 |

### 🟢 현재 이상 없음 (교차검증 완료)

| # | 항목 | 결과 |
|---|------|------|
| 9 | SSE 파서 로직 | OpenAI/Anthropic/Gemini 모두 정상 구현 |
| 10 | Body 직렬화 (JSON sanitize) | deep-clone + strip 로직 정상 |
| 11 | Key rotation | 브릿지와 무관, 정상 동작 |
| 12 | collectStream 구현 | TextDecoder + Uint8Array/String 모두 처리 |

---

## 11. 권장 수정 우선순위

### 즉시 (Phase 1)
1. **F1**: iPhone/Safari UA 감지 → 스트리밍 무조건 비활성화
2. **F3**: iPhone에서 비스트리밍 URL(`generateContent`) 강제 사용
3. **F4**: nativeFetch 호출에 합리적 타임아웃 추가

### 단기 (Phase 2)
4. **F2**: 직접 proxy2 폴백 경로 추가 (CacheKeeper의 `fetch(PROXY_URL, ...)` 패턴 차용)
5. **F5**: risuFetch 경로 최적화 (body object 유지, 이중 직렬화 방지)

### 중기 (Phase 3)
6. **R1**: RisuAI PR — Guest `collectTransferables`에 ReadableStream/WritableStream/TransformStream 추가
7. **R2**: RisuAI PR — CALLBACK_RETURN에 serialize 함수 적용하여 Response/Stream 안전 전달

---

## 12. 결론

**iPhone 장애의 근본 원인은 V2 vs V3 아키텍처 차이입니다.**

CacheKeeper(V2)는 HOST에서 직접 실행되어 postMessage 브릿지를 통과하지 않습니다. Cupcake PM(V3)은 sandboxed iframe에서 실행되어 모든 것이 브릿지를 통과해야 하며, 이 브릿지에는 ReadableStream을 포함한 여러 유형의 데이터가 Safari에서 안전하게 전달되지 않는 구조적 문제가 있습니다.

RisuAI 자체의 Guest bridge script에 ReadableStream transferable 지원이 누락되어 있는 것이 직접적인 원인이지만, 이는 upstream 수정이 필요합니다. 당장은 iPhone/Safari 감지 → 비스트리밍 강제 → 직접 proxy2 폴백 추가로 대응할 수 있습니다.

CacheKeeper의 가장 핵심적 안정성 우위는 V2 직접 실행 + proxy2 직접 폴백 + 비스트리밍 기본값의 조합입니다. 이 중 Cupcake가 V3에서 적용할 수 있는 것은 비스트리밍 기본값과 proxy2 직접 폴백이며, 이 두 가지만으로도 iPhone 호환성을 크게 개선할 수 있을 것으로 판단됩니다.

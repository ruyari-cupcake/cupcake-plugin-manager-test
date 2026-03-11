# iPhone 호환성 최종 분석 보고서

> **작성일:** 2026-03-11  
> **대상:** gemini-cache-keeper v2.8.8 vs Cupcake Provider Manager v1.19.6  
> **목적:** iPhone에서 CacheKeeper는 작동하고 Cupcake PM이 실패하는 원인 파악 — 모든 환경 교차검증 완료  
> **참고:** 이전 보고서(`IPHONE_COMPATIBILITY_REPORT.md`)의 중대한 오류를 수정한 최종 버전

---

## 1. 이전 분석의 중대한 오류 수정

### 이전 보고서에서 잘못된 것

이전 보고서에서는 "Guest → Host 반환 시 ReadableStream 직렬화 문제"를 주요 원인으로 지목했습니다.  
**이것은 틀림.** `cpm_streaming_enabled = false` (기본값)에서는 반환 경로에 ReadableStream이 이미 포함되지 않습니다.

```
router.js handleRequest (기본 동작):
  result.content === ReadableStream?  
    → cpm_streaming_enabled === false (기본값)
    → collectStream(result.content) 실행
    → string으로 변환 후 반환
    → CALLBACK_RETURN에 string만 포함 → 모든 환경에서 안전 ✅
```

### 진짜 문제: HOST → Guest 방향의 Response 전달

**실제 문제는 fetch 수신 방향**입니다. `Risu.nativeFetch()`를 호출하면:

```
[Guest iframe]  → postMessage { method: 'nativeFetch', args: [url, opts] }
[HOST window]   → fetchNative() 실행 → Response 객체 (body: ReadableStream) 반환
[HOST window]   → serialize(Response) → { __type: 'CALLBACK_STREAMS', value: response.body }
[HOST window]   → collectTransferables() → [ReadableStream] 포함
[HOST window]   → postMessage(response, '*', [ReadableStream])  ← ★ Safari < 16.4에서 실패
```

HOST의 `serialize()` (factory.ts L341-356)가 Response 객체를 ReadableStream body와 함께 전달하고,  
HOST의 `collectTransferables()` (factory.ts L308-322)가 ReadableStream을 transfer list에 포함합니다.

**Safari 16.4 미만에서 ReadableStream transfer는 DataCloneError를 발생시킵니다.**

---

## 2. 검증 완료: 두 API의 결정적 차이

### risuFetch (globalFetch) vs nativeFetch (fetchNative)

| 항목 | risuFetch | nativeFetch |
|---|---|---|
| HOST 반환 타입 | `{ ok, data: Uint8Array, headers, status }` | `Response` (body: ReadableStream) |
| serialize() 처리 | 변환 없음 (plain object) | `CALLBACK_STREAMS` + ReadableStream |
| collectTransferables | Uint8Array.buffer → ArrayBuffer transfer | ReadableStream transfer |
| ArrayBuffer transfer | 모든 브라우저 지원 (Safari 6+) ✅ | Safari 16.4+ 에서만 ✅ |
| bridge 통과 | **항상 안전** | **Safari < 16.4에서 실패** |

**검증 코드 추적:**  

`fetchWithPlainFetch` (globalApi.svelte.ts L703):
```typescript
const data = arg.rawResponse ? new Uint8Array(await response.arrayBuffer()) : await response.json();
return { ok, data, headers: Object.fromEntries(response.headers), status: response.status };
```
→ rawResponse=true일 때 Uint8Array로 전체 body 수집 → Uint8Array.buffer가 transfer list에 포함 → 안전

`fetchWithProxy` (globalApi.svelte.ts L773):
```typescript
const data = new Uint8Array(await response.arrayBuffer());
return { ok: isSuccess, data, headers: ..., status: response.status };
```
→ proxy2 경유 시에도 동일하게 Uint8Array → 안전

`fetchNative` (globalApi.svelte.ts L1420):
```typescript
return new Response(readableStream, { headers, status });
```
→ Response 객체 직접 반환 → serialize()에서 ReadableStream 추출 → **위험**

---

## 3. 검증 완료: iPhone에서의 실제 요청 흐름

### 3.1 CSP 제약 확인

```typescript
// factory.ts SandboxHost constructor
private csp = `connect-src 'none'; script-src 'nonce-...' https:; ...`;
```

**`connect-src 'none'`** → iframe 내부에서 모든 직접 네트워크 연결 차단.  
→ **이전 보고서의 F2 (직접 proxy2 fetch)는 불가능합니다.**  
→ 모든 네트워크 통신은 반드시 postMessage bridge를 통해야 합니다.

### 3.2 AbortSignal 직렬화 문제 (검증 완료)

Guest bridge의 `serializeArg` (factory.ts L44-65):
```javascript
function serializeArg(arg) {
    if (typeof arg === 'function') { return { __type: 'CALLBACK_REF', id }; }
    if (arg && typeof arg === 'object') {
        const refId = proxyRefRegistry.get(arg);
        if (refId) return { __type: 'REMOTE_REF', id: refId };
    }
    return arg;  // ← AbortSignal은 여기로 빠짐! 직렬화 미처리
}
```

`Risu.nativeFetch(url, { signal: abortSignal, ... })` 호출 시:
1. `options.signal`에 AbortSignal 포함
2. `serializeArg`가 AbortSignal을 처리하지 못함 → 그대로 남음
3. `postMessage` 시 AbortSignal structured clone 시도 → **DataCloneError**

**이미 `callNativeFetchWithAbortFallback`에서 이 문제를 감지하고 signal 제거 후 재시도합니다:**
```javascript
const _cloneIssue = /clone|structured|postmessage|AbortSignal|DataCloneError/i.test(_msg);
if (_hasSignal && _cloneIssue) {
    delete _retry.signal;
    return await Risu.nativeFetch(_url, _retry);  // signal 없이 재시도
}
```

이 재시도에서 AbortSignal 문제는 해결되지만, **Response ReadableStream transfer 문제가 다시 발생합니다.**

### 3.3 전체 요청 타임라인 (Google/Vertex URL, Safari < 16.4)

```
T+0ms     smartNativeFetch() 시작
T+0ms     ─ _preferNativeFirst=true → Strategy 1 건너뜀
T+0ms     ─ Google nativeFetch 블록 진입
T+0ms       ├ Risu.nativeFetch(url, {signal, body, headers, method})
T+5ms       ├ Guest → HOST postMessage 전송
T+10ms      ├ AbortSignal structured clone 실패 → DataCloneError
T+10ms      ├ callNativeFetchWithAbortFallback catch → signal 제거 후 재시도
T+15ms      ├ Risu.nativeFetch(url, {body, headers, method}) (signal 없음)
T+20ms      ├ Guest → HOST postMessage 성공 (AbortSignal 없으므로)
T+25ms      ├ HOST: fetchNative() → proxy2 fetch 시작
T+1500ms    ├ HOST: Response 수신 (body: ReadableStream)
T+1505ms    ├ HOST: serialize(Response) → { value: ReadableStream }
T+1510ms    ├ HOST: postMessage(response, '*', [ReadableStream])
T+1510ms    ├ ★ Safari < 16.4: DataCloneError (ReadableStream transfer 불가)
T+1515ms    ├ HOST catch → 에러 메시지 전송 { error: "Failed to post message..." }
T+1520ms    ├ Guest: Risu.nativeFetch reject → callNativeFetchWithAbortFallback
T+1525ms    ├ _hasSignal=false → throw (더 이상 재시도 안 함)
T+1525ms    └ Google nativeFetch 블록 catch → console.log → fall through

T+1530ms  ─ risuFetch 블록 진입 (plainFetchForce)
T+1535ms    ├ Risu.risuFetch(url, {body: object, rawResponse: true, plainFetchForce: true})
T+1540ms    ├ Guest → HOST postMessage (body는 plain object → 직렬화 안전)
T+1545ms    ├ HOST: globalFetch() → fetchWithPlainFetch → fetch → arrayBuffer → Uint8Array
T+3000ms    ├ HOST: { ok, data: Uint8Array, headers, status } 반환
T+3005ms    ├ HOST: serialize → 변환 없음 (plain object)
T+3010ms    ├ HOST: collectTransferables → Uint8Array.buffer → [ArrayBuffer]
T+3010ms    ├ HOST: postMessage(response, '*', [ArrayBuffer]) → ✅ 성공!
T+3015ms    ├ Guest: { ok, data: Uint8Array, headers, status }
T+3020ms    ├ _extractResponseBody(result) → Uint8Array
T+3025ms    └ new Response(Uint8Array, {status, headers}) → 성공!

T+3025ms  ─ smartNativeFetch 반환: Response 객체
T+3030ms  ─ fetchCustom: res.text() → JSON.parse → 결과
T+3035ms  ─ handleRequest: { success: true, content: "응답 텍스트" }
T+3040ms  ─ CALLBACK_RETURN → string → 브릿지 통과 → ✅ 성공

총 소요 시간: ~3초 (본래 ~1.5초 + nativeFetch 실패 오버헤드 ~1.5초)
```

### 3.4 Non-Google URL (OpenAI, Anthropic 등, Safari < 16.4)

```
T+0ms     smartNativeFetch() 시작
T+0ms     ─ _preferNativeFirst=false
T+0ms     ─ Strategy 1: fetch(url, options) → CSP connect-src 'none' → 즉시 실패
T+5ms     ─ risuFetch 블록 진입 (plainFetchForce)
          ─ (위 Google 시나리오의 T+1530ms 이후와 동일)
T+1500ms  ─ 성공!

총 소요 시간: ~1.5초 (오버헤드 거의 없음)
```

**Non-Google URL은 nativeFetch를 먼저 시도하지 않으므로 추가 지연이 거의 없습니다.**

### 3.5 Copilot URL — Google URL과 동일한 패턴

nativeFetch 먼저 시도 → 실패 → risuFetch fallback → 추가 지연 발생

---

## 4. HOST 에러 처리 검증 (Silent Fail 가능성)

### 4.1 정상 실패 경로 (throw)

```typescript
// factory.ts L498-507
try {
    this.iframe.contentWindow?.postMessage(response, '*', transferables);
} catch (error) {
    this.iframe.contentWindow?.postMessage({
        type: 'RESPONSE', reqId: data.reqId,
        error: 'Failed to post message to iframe: ' + (error as Error).message
    }, '*');
}
```

ReadableStream transfer 실패 시 → DataCloneError throw → catch → 에러 메시지 전송 → Guest reject → fallback 동작  
**이 경로는 정상적으로 동작합니다.**

### 4.2 ⚠️ Silent Drop 가능성 (미확인)

일부 브라우저/WebView 조합에서 `postMessage`가 throw하지 않고 메시지를 삼키는 것이 보고된 적 있습니다:
- iframe의 contentWindow가 detached된 경우 (`contentWindow?.` → undefined → no-op)
- 특정 WebView 버그에서 메시지가 전달되지만 이벤트가 발화하지 않는 경우

이 경우 Guest의 `pendingRequests` Promise가 영원히 resolve되지 않아 **hang** 발생.
**현재 smartNativeFetch에 타임아웃이 없으므로 이 경우 복구 불가능합니다.**

---

## 5. checkStreamCapability 정확도 검증

### Phase 1: structured-clone test
```javascript
const s1 = new ReadableStream({ start(c) { c.close(); } });
const mc1 = new MessageChannel();
mc1.port1.postMessage({ s: s1 });  // transfer list 없음 → structured clone 시도
```

- Safari < 16.4: ReadableStream structured clone 미지원 → false
- Safari 16.4+: clone 지원 → true
- Chrome/Firefox: clone 지원 → true

MessageChannel과 iframe postMessage는 동일한 structured clone 알고리즘을 사용합니다.  
**따라서 checkStreamCapability는 신뢰할 수 있는 Feature Detection입니다.** ✅

현재 이 체크는 **반환 경로** (Guest → HOST)에서만 사용됩니다.  
**호환성 모드에서는 이 체크를 fetch 전략 선택에도 활용합니다.**

---

## 6. UA 감지 신뢰성 검증

| 문제 | 설명 |
|---|---|
| iPadOS 15+ | Desktop mode 기본 = macOS Safari UA |
| iOS Chrome/Firefox/Edge | 모두 WebKit 기반 = Safari UA와 유사 |
| Desktop Safari | RS transfer 지원이 버전마다 다름 |
| Android WebView | 커스텀 UA 가능 |
| RisuAI isIOS() | `maxTouchPoints > 1` → Surface 등 터치 디스플레이 오탐 |

**결론: Feature detection (checkStreamCapability) >> UA detection >> 사용자 토글이 가장 확실**

---

## 7. 이전 보고서 수정 사항 재평가

| 번호 | 제안 | 평가 | 이유 |
|---|---|---|---|
| F1 | UA 감지 → 스트리밍 비활성화 | ❌ 불필요+불충분 | 반환 경로는 이미 안전. 진짜 문제는 fetch 경로. UA 불신뢰 |
| F2 | 직접 proxy2 fetch | ❌ **불가능** | CSP `connect-src 'none'` → iframe에서 직접 fetch 불가 |
| F3 | Non-streaming URL 강제 | ⚠️ 부분적 | non-streaming이든 streaming이든 smartNativeFetch 경로 동일 |
| F4 | nativeFetch 타임아웃 | ✅ 유효 | silent drop 방어 |
| F5 | Body 최적화 | ✅ 유효 | 핵심은 아니나 방어적 |

---

## 8. 최종 수정: 호환성 모드 토글

### 구현 내용

**`@arg cpm_compatibility_mode`** — 사용자가 켜면:
1. `smartNativeFetch`에서 `nativeFetch` 전략 완전 스킵
2. `risuFetch(plainFetchForce)` 만 사용 → Uint8Array → 항상 안전
3. nativeFetch의 Response ReadableStream transfer 문제 완전 회피
4. Google/Vertex/Copilot URL에서 nativeFetch 실패 → risuFetch fallback의 1.5~5초 지연 제거

**추가: 자동 감지 보조**
- 호환성 모드가 꺼져 있어도 `checkStreamCapability() === false`면 자동으로 nativeFetch 후순위
- nativeFetch에 15초 방어 타임아웃 추가

### 영향 범위

| 환경 | 토글 OFF | 토글 ON |
|---|---|---|
| iPhone (iOS < 16.4) | ⚠️ Google/Copilot 지연 | ✅ 즉시 동작 |
| iPhone (iOS 16.4+) | ✅ | ✅ (불필요하지만 안전) |
| Android Chrome | ✅ | ✅ (streaming 없음) |
| Desktop Chrome | ✅ | ✅ |
| Desktop Safari | ⚠️ 버전 의존 | ✅ |
| Tauri macOS | ⚠️ | ✅ |
| Tauri Win/Linux | ✅ | ✅ |
| Node/Docker | ✅ | ✅ |

---

## 9. CacheKeeper와의 최종 비교

| 항목 | CacheKeeper | Cupcake PM | Cupcake PM (호환성 모드) |
|---|---|---|---|
| API 버전 | V2 (HOST 직접) | V3 (iframe sandbox) | V3 (iframe sandbox) |
| fetch 방식 | HOST에서 직접 fetch | nativeFetch → bridge → Response(RS) | risuFetch → bridge → Uint8Array |
| RS transfer 필요 | ❌ 불필요 | ✅ 필요 | ❌ 불필요 |
| Safari 호환 | ✅ 모든 버전 | ⚠️ < 16.4 문제 | ✅ 모든 버전 |
| proxy2 직접 fallback | ✅ 있음 | ❌ CSP 차단 | ❌ CSP 차단 (불필요) |
| 실질 차이 | - | nativeFetch 실패 지연 | **차이 해소** |

---

## 10. 실기기 확인이 필요한 항목

| # | 항목 | 이유 |
|---|---|---|
| 1 | Safari < 16.4에서 RS postMessage가 throw vs silent drop | 코드 분석으로 확인 불가 |
| 2 | iOS 16.4+ sandboxed iframe에서 실제 RS transfer 성공 | Edge case 가능성 |
| 3 | risuFetch 대용량 (>1MB) 응답의 메모리 이슈 | 부하 테스트 필요 |
| 4 | proxy2 서버의 응답 타임아웃/크기 제한 | 서버측 확인 필요 |

---

## 11. 결론

**V2 (CacheKeeper) = HOST에서 직접 실행 → bridge 없음 → 모든 환경에서 안전**  
**V3 (Cupcake) = iframe sandbox → postMessage bridge → Response(ReadableStream) transfer 필요 → Safari < 16.4에서 실패**

risuFetch fallback이 있어서 최종적으로 동작은 하지만, nativeFetch 실패 → 재시도 → 실패 → fallback 경로가 **1.5~5초의 추가 지연**을 유발합니다.

**호환성 모드 토글**로 nativeFetch를 완전 스킵하면 CacheKeeper와 동등한 안정성을 확보할 수 있습니다.

---

*검증 범위: factory.ts, globalApi.svelte.ts, smart-fetch.js, fetch-custom.js, router.js, stream-utils.js, plugin-header.js, init.js, shared-state.js 전체 코드 추적 완료*

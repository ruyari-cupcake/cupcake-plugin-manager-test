# Priority-1 Cross-Validation Report
## Cupcake Provider Manager × RisuAI-main 교차검증

작성일: 2026-03-11  
대상 범위: **1순위 후보 2개만** 재검토
- 요청 취소가 안 먹는 문제
- 메시지가 잘못 전달되는 문제

사용자 전제 반영:
- 타임아웃은 의도적으로 넣지 않음
- 서브플러그인 샌드박스/무결성/키 접근은 지금 우선순위에서 제외
- "내가 배포하고 내가 넣는" 운영 모델을 전제로 판단

---

# 1. 결론 요약

## 최종 우선순위
### P1-A: **취소가 안 먹는 문제**
가장 먼저 잡아야 함.

이유:
1. **실사용에서 바로 체감됨**
2. 현재 코드가 실제로 `AbortSignal`을 **버리고 재시도**함
3. RisuAI-main 오픈소스도 이 문제를 이미 중요한 문제로 보고, **별도 Abort relay 구조**를 넣어둠
4. 즉, 이건 "과잉 경고"가 아니라 **업스트림도 신경 쓰는 실제 문제**임

### P1-B: **메시지가 `[object Object]`로 깨질 수 있는 문제**
같이 고치면 좋지만, **P1-A보다는 한 단계 아래**로 보는 것이 맞음.

이유:
1. 현재 프로젝트 helper 계층에서는 실제로 잘못 처리됨
2. 하지만 **RisuAI-main의 기본 `prompt_chat` 타입은 `content: string`** 이라서,
   정상적인 RisuAI 기본 채팅 흐름에서는 **도달 가능성이 낮음**
3. 즉, **버그는 맞지만, 업스트림 기준 정상 입력에서는 잘 안 터질 가능성**이 큼
4. 다만 수정 비용이 매우 낮고 부작용도 거의 없어서, **P1 작업 묶음에 같이 태우는 건 좋음**

---

# 2. 교차검증에 사용한 근거

## 현재 프로젝트 코드
- [_temp_repo/src/lib/smart-fetch.js](_temp_repo/src/lib/smart-fetch.js)
- [_temp_repo/src/lib/sanitize.js](_temp_repo/src/lib/sanitize.js)
- [_temp_repo/src/lib/stream-builders.js](_temp_repo/src/lib/stream-builders.js)
- [_temp_repo/src/lib/helpers.js](_temp_repo/src/lib/helpers.js)

## RisuAI-main 업스트림 코드
- [Risuai-main/src/ts/plugins/apiV3/factory.ts](Risuai-main/src/ts/plugins/apiV3/factory.ts)
- [Risuai-main/src/ts/globalApi.svelte.ts](Risuai-main/src/ts/globalApi.svelte.ts)
- [Risuai-main/src/ts/plugins/plugins.svelte.ts](Risuai-main/src/ts/plugins/plugins.svelte.ts)
- [Risuai-main/src/ts/process/index.svelte.ts](Risuai-main/src/ts/process/index.svelte.ts)
- [Risuai-main/src/ts/plugins/apiV3/risuai.d.ts](Risuai-main/src/ts/plugins/apiV3/risuai.d.ts)
- [Risuai-main/src/ts/plugins/migrationGuide.md](Risuai-main/src/ts/plugins/migrationGuide.md)

---

# 3. P1-A — 요청 취소가 안 먹는 문제

## 3-1. 현재 프로젝트에서 실제로 무슨 일이 벌어지는가
현재 [_temp_repo/src/lib/smart-fetch.js](_temp_repo/src/lib/smart-fetch.js#L67-L80) 에서 `nativeFetch` 호출 중 `AbortSignal`이 structured clone 문제로 실패하면:

- `signal`이 들어간 요청을 한번 시도하고
- clone/DataCloneError류 에러가 나면
- **`signal`을 지운 뒤 다시 요청**함

같은 패턴이 [_temp_repo/src/lib/smart-fetch.js](_temp_repo/src/lib/smart-fetch.js#L176-L206) 의 `risuFetch` 경로에도 있음.

즉 실제 동작은:
1. 사용자 취소 가능 요청 시작
2. 브리지에서 signal 전달 실패
3. 코드가 "취소 기능 없이" 재요청
4. 사용자 입장에서는 취소를 눌렀는데 요청이 계속 감

이건 단순 추정이 아니라, 코드가 현재 그렇게 작성되어 있음.

---

## 3-2. 업스트림 RisuAI-main은 이 문제를 어떻게 다루는가
RisuAI-main은 이걸 **진짜 문제**로 보고 별도 설계를 넣어둠.

### 핵심 근거 1: AbortSignal은 structured clone이 안 된다는 걸 업스트림이 명시적으로 처리함
[Risuai-main/src/ts/plugins/apiV3/factory.ts](Risuai-main/src/ts/plugins/apiV3/factory.ts#L384-L406) 에서:
- `AbortSignal`을 그대로 넘기지 않고
- `ABORT_SIGNAL_REF`로 바꾼 다음
- abort 이벤트가 발생하면 별도 `ABORT_SIGNAL` 메시지를 postMessage로 전달함

즉 업스트림도 이미 인정하고 있음:
- `AbortSignal`은 그냥 브리지로 넘기면 깨질 수 있음
- 그래서 **relay 방식**이 필요함

### 핵심 근거 2: 업스트림 host fetch 계층은 signal을 적극 전달함
[Risuai-main/src/ts/globalApi.svelte.ts](Risuai-main/src/ts/globalApi.svelte.ts#L619-L650) 에서는 `globalFetch()`가 `abortSignal`을 받고,
각 fetch 구현에서 실제 `fetch(..., { signal: arg.abortSignal })`로 전달함.

예:
- [plain fetch](Risuai-main/src/ts/globalApi.svelte.ts#L703-L710)
- [userscript fetch](Risuai-main/src/ts/globalApi.svelte.ts#L723-L730)
- [proxy fetch](Risuai-main/src/ts/globalApi.svelte.ts#L784-L791)

즉 업스트림 철학은 분명함:
- **취소 신호는 유지해야 한다**
- 안 되면 relay를 만들어서라도 유지해야 한다
- "안 되니까 signal 빼고 계속 간다"가 기본 전략이 아님

### 핵심 근거 3: 업스트림 문서도 v3 sandbox + 보안 격리 + API bridge 구조를 전제함
[Risuai-main/src/ts/plugins/migrationGuide.md](Risuai-main/src/ts/plugins/migrationGuide.md#L145-L153) 에서 v3 API가 sandboxed iframe 기반이라고 명시됨.

즉 현재 `_temp_repo`의 `smart-fetch.js` 상단 주석이 말하는 "V3 iframe sandbox" 전제는 업스트림 구조와 맞아떨어짐.

---

## 3-3. 그래서 이 문제는 정말 1순위인가?
**예. 1순위 맞음.**

이유는 세 가지:

### A. 도달 가능성이 높음
이 문제는 비정상 입력이 필요 없음.

그냥:
- 브리지 환경
- Copilot/Google/nativeFetch/risuFetch 경로
- 사용자가 취소 버튼 누름

이면 터질 수 있음.

### B. 사용자 체감이 큼
사용자가 느끼는 건:
- 멈춘 줄 알았는데 계속 돌아감
- 취소했는데 나중에 응답이 튀어나옴
- 요청이 이미 취소됐다고 생각했는데 로그나 상태가 이상함

이건 품질 문제로 바로 보임.

### C. 업스트림도 같은 문제를 중요하게 다루고 있음
업스트림이 relay 구조를 만든 시점에서,
이 문제는 "이론상 가능한 걱정"이 아니라 **실제 브리지 환경의 핵심 문제**임.

---

## 3-4. 이걸 현재 프로젝트에서 고칠 수 있는가?
**가능함.** 다만 2단계로 봐야 함.

### 1단계: 플러그인 단독 수정으로 가능한 수준
현재 프로젝트만 수정해서도 **사용자 체감 취소**는 상당 부분 복구 가능함.

추천 방향:
1. `signal` clone 실패 시 무조건 재시도하지 말 것
2. 재시도하더라도 `Promise.race()`로 **abort 쪽이 이기면 즉시 AbortError 처리**할 것
3. 스트리밍은 이미 [_temp_repo/src/lib/stream-builders.js](_temp_repo/src/lib/stream-builders.js#L39-L48) 에서 `abortSignal.aborted`를 체크하므로,
   fetch 단계에서만 abort semantics를 정리해도 체감이 많이 좋아짐

이 방식의 장점:
- host 수정 없이 가능
- timeout 추가 불필요
- UI 레벨 취소는 정상화 가능

이 방식의 한계:
- host 쪽 네트워크 요청 자체는 계속 갈 수 있음
- 즉 "진짜 네트워크 중단"까지는 보장 못 함
- 하지만 사용자 입장에서는 요청이 취소된 것처럼 동작시킬 수 있음

### 2단계: 업스트림 방식에 맞춘 근본 수정
가장 깔끔한 방식은 RisuAI-main의 [Abort relay 구조](Risuai-main/src/ts/plugins/apiV3/factory.ts#L162-L188) 와 정렬하는 것임.

즉:
- host가 `AbortSignal` relay를 지원하는 버전이면 그걸 신뢰하고
- 지원 안 하는 환경만 별도 fallback 처리
- signal 제거 재시도는 최후의 수단으로만 두고,
  그 경우에도 호출자에게는 `AbortError` semantics를 유지

---

## 3-5. P1-A 구현 우선순위 제안
### 꼭 해야 하는 것
1. `signal` 제거 재시도를 기본 전략에서 빼기
2. 최소한 호출자에게는 `AbortError`가 보이게 만들기
3. 취소 후 late response가 정상 응답처럼 처리되지 않게 막기

### 굳이 지금 안 해도 되는 것
- timeout
- host 전면 개조
- 네트워크 레벨 완전 중단 보장

즉 **네 현재 요구(타임아웃 제외)** 기준으로도 충분히 P1로 잡을 수 있음.

---

# 4. P1-B — 메시지가 잘못 전달되는 문제

## 4-1. 현재 프로젝트의 실제 문제점
현재 [_temp_repo/src/lib/sanitize.js](_temp_repo/src/lib/sanitize.js#L129-L131) 는:
- `content`가 string이면 그대로 넣고
- array면 part를 분해하고
- 그 외 object면 `.text`가 있을 때만 text를 쓰고
- 아니면 `String(content)`를 씀

즉 객체가 `{ custom: 'data' }` 같은 형태면 결과가:
- `"[object Object]"`

가 됨.

이건 helper 로직 기준으로는 확실한 버그임.

---

## 4-2. 그런데 업스트림 RisuAI-main 기준으로 이게 얼마나 자주 터질까?
여기서 중요 포인트가 있음.

RisuAI-main 기본 타입은 계속 `content: string`으로 잡혀 있음.

근거:
- [Risuai-main/src/ts/process/index.svelte.ts](Risuai-main/src/ts/process/index.svelte.ts#L36-L44)
- [Risuai-main/src/ts/plugins/plugins.svelte.ts](Risuai-main/src/ts/plugins/plugins.svelte.ts#L430-L438)
- [Risuai-main/src/ts/plugins/apiV3/risuai.d.ts](Risuai-main/src/ts/plugins/apiV3/risuai.d.ts#L159-L167)

즉 업스트림 기본 흐름에서는:
- `prompt_chat`의 각 message `content`는 원칙적으로 string
- multimodal은 별도 `multimodals` 필드로 분리

이 말은 곧:
- **RisuAI 기본 채팅 경로만 타면 object content는 잘 안 들어온다**
- 따라서 이 버그는 "도달 가능성"이 P1-A보다 낮다

---

## 4-3. 그럼 이 버그는 무시해도 되는가?
**완전 무시는 비추천**.

이유:
1. 현재 프로젝트는 업스트림보다 더 넓은 입력을 받도록 helper를 확장해 둠
   - OpenAI style parts
   - Anthropic blocks
   - Gemini inlineData
   - object/array content fallback
2. 즉 프로젝트 코드 스스로 "비문자열 content도 받을 수 있다"는 방향으로 작성돼 있음
3. 그런데 마지막 fallback이 `String(content)`라서 설계 의도와 충돌함

즉 이건
- 업스트림 기본 입력만 보면 낮은 우선순위지만
- 현재 프로젝트의 **확장 호환 레이어 관점**에서는 틀린 처리임

---

## 4-4. 이 버그를 고치는 것이 위험한가?
**거의 위험하지 않음.**

수정 방향은 단순함:
- `String(content)` 대신
- object면 `safeStringify(content)` 또는 최소 `JSON.stringify(content)`

현재 [_temp_repo/src/lib/helpers.js](_temp_repo/src/lib/helpers.js#L30-L37) 에 이미 `safeStringify()` 가 있으므로,
새 유틸을 만들 필요도 없음.

즉 이 버그는:
- 수정 비용 낮음
- 회귀 위험 낮음
- 테스트도 이미 있음

그래서 "급한 체감 문제"는 아니어도,
**P1 묶음 작업에 같이 넣기 매우 좋은 버그**임.

---

# 5. 최종 우선순위 재정의

## 만약 "진짜 1개만 먼저 고쳐라"라면
### **취소가 안 먹는 문제만 먼저**
이게 맞음.

이유:
- 업스트림과 교차검증했을 때 더 명확하게 실문제임
- 도달 가능성 높음
- 사용자가 바로 느낌
- 현재 코드가 의도적으로 signal을 버리고 있어서 우선순위가 높음

---

## 만약 "1순위 작업 묶음"으로 잡는다면
### 1순위 묶음 = 아래 두 개
1. **P1-A** 취소 안 먹는 문제
2. **P1-B** object content가 `[object Object]`로 깨지는 문제

단, 내부 순서는 반드시:
- 먼저 취소
- 그 다음 메시지 stringify

---

# 6. 실무용 판단

## 지금 당장 고쳐야 하는 것
### P1-A
- [_temp_repo/src/lib/smart-fetch.js](_temp_repo/src/lib/smart-fetch.js#L67-L80)
- [_temp_repo/src/lib/smart-fetch.js](_temp_repo/src/lib/smart-fetch.js#L176-L206)

핵심: `signal` 제거 재시도 때문에 취소 semantics가 깨짐

## 바로 같이 태워도 되는 것
### P1-B
- [_temp_repo/src/lib/sanitize.js](_temp_repo/src/lib/sanitize.js#L129-L131)

핵심: object fallback이 `String(content)`라 잘못된 문자열이 나감

## 지금 안 봐도 되는 것
- timeout
- 샌드박스 보안
- 설치 무결성
- 키/토큰 비공개화

네 운영 모델에서는 이건 일단 후순위로 밀어도 됨.

---

# 7. 최종 결론

**가능함.**

타임아웃을 제외하고도 1순위는 충분히 잡을 수 있음.  
다만 교차검증 결과, 1순위 안에서도 무게는 같지 않음.

## 최종 판정
- **가장 먼저 고칠 1순위 = 취소 안 먹는 문제**
- **같이 묶어서 고칠 수 있는 1순위 보조 = 메시지 object stringify 문제**

즉 정리하면:

> 이번 라운드의 진짜 P1은 `smart-fetch.js`의 abort 처리이고,  
> `sanitize.js`의 object stringify는 비용이 거의 없으니 같이 처리하는 것이 가장 효율적이다.

---

# 8. 바로 실행 가능한 다음 단계

원하면 다음 단계로 바로 이어서:
1. **수정안 설계서** 작성
2. 실제 코드 수정
3. 테스트 추가/보정
4. 교차검증 재실행

까지 진행 가능함.
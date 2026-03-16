# 슬롯별 생각/추론 오버라이드 교차검증 버그 리포트

**날짜**: 2025-06-10  
**버전**: v1.21.0  
**심각도**: 설계 결함 (등록된 프로바이더 경로에서 슬롯 오버라이드 완전 무시)

---

## 1. 사용자 보고 증상

> 번역 개별설정에서 생각레벨 LOW로 설정하고, 버텍스에선 MEDIUM으로 설정한 후 번역을 실행하면,
> 실제로 MEDIUM이 API에 전달됨. LOW가 무시되는 상태.

---

## 2. 근본 원인 (Root Cause)

### `router.js`의 `fetchByProviderId()`에 두 개의 코드 경로 존재

```
fetchByProviderId(modelDef, messages, temp, maxTokens, args, ...)
  ├── Path A: customFetchers[provider] 존재 → fetcher(args) 직접 호출 <-- 서브플러그인 경로
  └── Path B: provider.startsWith('Custom') → fetchCustom(config) 호출 <-- 커스텀모델 경로
```

| 경로 | `_cpmSlotThinkingConfig` 소비 여부 | 결과 |
|------|-------------------------------------|------|
| **Path A** (등록 프로바이더) | ❌ **완전 무시** | 프로바이더 전역 설정 사용 |
| **Path B** (커스텀 모델) | ✅ 정상 머지 | 슬롯 오버라이드 > 커스텀모델 기본값 > 'none' |

### 정확한 코드

**Path A** ([router.js L96](src/lib/router.js)):
```js
const fetcher = customFetchers[modelDef.provider];
if (fetcher) return await fetcher(modelDef, messages, temp, maxTokens, args, abortSignal, _reqId);
// → args._cpmSlotThinkingConfig은 args 안에 있지만, 서브플러그인이 읽지 않음
```

**Path B** ([router.js L98-131](src/lib/router.js)):
```js
if (modelDef.provider.startsWith('Custom')) {
    const _so = args._cpmSlotThinkingConfig || {};
    return await fetchCustom({
        thinking_level: _so.thinking_level || cDef.thinking || 'none',
        // ... (6개 키 전부 머지)
    }, ...);
}
```

### 서브플러그인 측 증거

모든 서브플러그인에서 `_cpmSlotThinkingConfig` 검색 → **0건**

각 서브플러그인은 자체 전역 설정만 읽음:

| 서브플러그인 | 읽는 키 | 슬롯 오버라이드 반영 | 
|---|---|---|
| **cpm-provider-vertex.js** | `cpm_vertex_thinking_level`, `cpm_vertex_thinking_budget` | ❌ |
| **cpm-provider-vertex.js** (Claude 모델) | `cpm_vertex_claude_effort` | ❌ |
| **cpm-provider-gemini.js** | `cpm_gemini_thinking_level`, `cpm_gemini_thinking_budget` | ❌ |
| **cpm-provider-anthropic.js** | `cpm_anthropic_thinking_budget`, `cpm_anthropic_thinking_effort` | ❌ |
| **cpm-provider-aws.js** | `cpm_aws_thinking_budget`, `cpm_aws_thinking_effort` | ❌ |
| **cpm-provider-openai.js** | `cpm_openai_reasoning`, `cpm_openai_verbosity` | ❌ |
| **cpm-provider-openrouter.js** | `cpm_openrouter_reasoning` | ❌ |
| **cpm-provider-deepseek.js** | (생각/추론 설정 없음) | N/A |

---

## 3. 데이터 흐름 추적

### 정상 작동하는 부분 (handleRequest → _cpmSlotThinkingConfig 수집)

```
사용자가 설정 UI에서 변경
  → <select id="cpm_slot_translation_thinking"> change 이벤트
  → bindSettingsPersistenceHandlers → setVal("cpm_slot_translation_thinking", "LOW")
  → Risu.setArgument("cpm_slot_translation_thinking", "LOW")
  → plugin.realArg["cpm_slot_translation_thinking"] = "LOW"  ✅ 정상 저장

번역 요청 시 handleRequest() 실행
  → inferSlot() → { slot: 'translation', heuristicConfirmed: true }  ✅
  → safeGetArg('cpm_slot_translation_thinking') → 'LOW'  ✅
  → thinkingOverrides.thinking_level = 'LOW'  ✅
  → args._cpmSlotThinkingConfig = { thinking_level: 'LOW' }  ✅ 정상 수집
```

### 깨지는 부분 (fetchByProviderId에서 서브플러그인 경로)

```
fetchByProviderId() 진입
  → modelDef.provider = 'VertexAI'  (등록된 프로바이더)
  → customFetchers['VertexAI'] 존재  ✅
  → return await fetcher(modelDef, messages, temp, maxTokens, args, ...)
    ↓
  cpm-provider-vertex.js 내부:
    → config.thinking = await CPM.safeGetArg('cpm_vertex_thinking_level')  // = 'MEDIUM'
    → args._cpmSlotThinkingConfig 참조 → ❌ 없음 (읽지 않음)
    → API body.thinkingConfig.thinkingLevel = 'MEDIUM'  ← 슬롯 오버라이드 무시!
```

---

## 4. 영향 범위

- ✅ **커스텀 모델**: 슬롯 오버라이드 정상 작동 (Path B)
- ❌ **Vertex**: thinking_level, thinkingBudget 슬롯 오버라이드 무시
- ❌ **Gemini**: thinking_level, thinkingBudget 슬롯 오버라이드 무시
- ❌ **Anthropic**: effort 슬롯 오버라이드 무시
- ❌ **AWS Bedrock**: effort, thinkingBudget 슬롯 오버라이드 무시
- ❌ **OpenAI**: reasoning, verbosity 슬롯 오버라이드 무시
- ❌ **OpenRouter**: reasoning 슬롯 오버라이드 무시
- N/A **DeepSeek**: 생각/추론 설정 자체 없음

**사용자 관점**: 보조모델 슬롯 설정에서 생각/추론 레벨을 변경해도, 등록된 프로바이더를 사용하면 완전히 무시됨. 프로바이더 전역 설정(Vertex 설정, Gemini 설정 등)의 값이 항상 사용됨.

---

## 5. 수정 방안

### 방안 A: router.js에서 서브플러그인 호출 전 args 주입 (추천)

```js
// router.js fetchByProviderId()
const fetcher = customFetchers[modelDef.provider];
if (fetcher) {
    // 슬롯 오버라이드를 args에 표준 프로퍼티로 주입
    const _so = args._cpmSlotThinkingConfig;
    if (_so) {
        args._cpmResolvedThinking = _so;  // 서브플러그인이 확인할 표준 키
    }
    return await fetcher(modelDef, messages, temp, maxTokens, args, abortSignal, _reqId);
}
```

**서브플러그인 수정** (각 7개):
```js
// config 구성 시
const slotOverride = args?._cpmResolvedThinking || {};
const thinking = slotOverride.thinking_level || await CPM.safeGetArg('cpm_vertex_thinking_level');
```

- **장점**: 깔끔한 설계, 명확한 우선순위 체인
- **단점**: 7개 서브플러그인 전부 수정 필요, 서브플러그인 버전 범프 필요

### 방안 B: router.js에서 setArgument로 임시 주입

```js
// 호출 전: 전역 설정을 슬롯 값으로 임시 교체
const _so = args._cpmSlotThinkingConfig;
if (_so && _so.thinking_level) {
    const providerKey = getProviderThinkingKey(modelDef.provider); // e.g., 'cpm_vertex_thinking_level'
    const originalValue = await safeGetArg(providerKey);
    await Risu.setArgument(providerKey, _so.thinking_level);
    try {
        return await fetcher(...);
    } finally {
        await Risu.setArgument(providerKey, originalValue); // 복원
    }
}
```

- **장점**: 서브플러그인 수정 불필요
- **단점**: 레이스 컨디션 위험 (동시 호출 시), setArgument가 async (postMessage RPC)

### 방안 C: 프로바이더-슬롯 키 매핑 테이블

router.js에 프로바이더별 키 매핑 테이블을 두고, 슬롯 오버라이드를 프로바이더 전역 키에 직접 매핑:

```js
const PROVIDER_THINKING_KEYS = {
    'VertexAI': { thinking_level: 'cpm_vertex_thinking_level', thinkingBudget: 'cpm_vertex_thinking_budget' },
    'GoogleAI': { thinking_level: 'cpm_gemini_thinking_level', thinkingBudget: 'cpm_gemini_thinking_budget' },
    'Anthropic': { effort: 'cpm_anthropic_thinking_effort' },
    // ...
};
```

- **장점**: 서브플러그인 수정 불필요 (방안 B와 동일)
- **단점**: 하드코딩된 매핑, 서브플러그인 추가 시 router도 수정 필요, 레이스 컨디션 동일

---

## 6. 추천

**방안 A 추천.** 이유:
1. 레이스 컨디션 없음 (동기적 프로퍼티 전달)
2. 서브플러그인이 명시적으로 슬롯 오버라이드를 인식
3. router.js에 프로바이더별 하드코딩 불필요
4. 서브플러그인 독립성 유지 (각자 자기 키 처리)

단점인 "7개 서브플러그인 수정"은 각 서브플러그인에서 2-3줄만 추가하면 되므로 부담이 적음.

---

## 7. 현재 상태 요약

| 항목 | 상태 |
|------|------|
| handleRequest 수집 로직 | ✅ 정상 (40개 테스트 통과) |
| 커스텀 모델 경로 머지 | ✅ 정상 |
| 등록 프로바이더 경로 머지 | ❌ **미구현** |
| settings-ui.js UI | ✅ 정상 작동 |
| 값 저장/복원 (setArgument/getArgument) | ✅ 정상 작동 |
| 슬롯 추론 (translation 감지) | ✅ 정상 (heuristic 기반) |

**결론**: `handleRequest()`까지의 수집은 완벽하게 작동. `fetchByProviderId()`에서 등록 프로바이더 경로(`customFetchers`)가 `_cpmSlotThinkingConfig`를 소비하지 않는 설계 결함.

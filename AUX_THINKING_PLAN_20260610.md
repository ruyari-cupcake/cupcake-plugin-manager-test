# 보조 모델 생각/추론 설정 기능 추가 계획서

**작성일**: 2026-06-10  
**대상**: CPM v1.20.17+ (현재 → v1.21.0 예정)  
**목표**: 번역, 감정, 하이파(메모리), 루아/트리거 보조 모델 슬롯에 생각 레벨 / 생각 토큰 / Reasoning Effort / Response Verbosity / Anthropic Effort(적응형 추론) 설정 추가

---

## 1. 현재 상태 분석

### 1-A. 보조 모델 슬롯 시스템 (현재)

| 슬롯 | CPM 키 접두사 | 현재 지원 파라미터 |
|------|-------------|------------------|
| 번역 (Translation) | `cpm_slot_translation_` | max_context, max_out, temp, top_p, top_k, rep_pen, freq_pen, pres_pen |
| 감정 (Emotion) | `cpm_slot_emotion_` | 상동 |
| 메모리 (HyPA) | `cpm_slot_memory_` | 상동 |
| 루아/트리거 (Other) | `cpm_slot_other_` | 상동 |

**누락된 설정**: 생각 레벨, 생각 토큰 예산, Reasoning Effort, Response Verbosity, Anthropic Effort

### 1-B. 커스텀 모델에서는 이미 지원 중

커스텀 모델은 다음 필드를 모델별로 설정 가능:
- `thinking` (Gemini 생각 레벨: OFF/MINIMAL/LOW/MEDIUM/HIGH)
- `thinkingBudget` (Gemini 2.5용 생각 토큰 예산)
- `reasoning` (OpenAI o1/o3 추론 레벨: none/off/low/medium/high/xhigh)
- `verbosity` (OpenAI 응답 상세도: none/low/medium/high)
- `effort` (Anthropic 적응형 추론: none/unspecified/low/medium/high/max)
- `adaptiveThinking` (Anthropic 적응형 추론 토글)

이 설정들은 `fetchCustom()` 함수에서 3개 포맷(OpenAI, Anthropic, Google)에 맞게 자동 변환됨.

### 1-C. RisuAI 측의 지원 상황

RisuAI (backup_v3/main.js)에서 확인한 사항:
- ✅ 보조 모델 요청 시 `gemini_thinkingLevel`, `thinking_tokens` 필드를 `args` 객체에 포함하여 전달
- ✅ 각 보조 슬롯별 getter 함수(`getTranslationSettings()`, `getMemorySettings()` 등)에서 생각 관련 값을 추출
- ⚠️ RisuAI가 전달하는 값은 CPM의 슬롯 오버라이드보다 낮은 우선순위

**우선순위 체계**: CPM 슬롯 오버라이드 > RisuAI 슬롯별 파라미터 > RisuAI 메인 파라미터

---

## 2. 기술 설계

### 2-A. 데이터 흐름 (현재 vs 변경 후)

```
[현재]
RisuAI args (생각 파라미터 포함) → CPM router → inferSlot → 샘플링만 오버라이드
                                                          → fetchByProviderId → config에서 커스텀 모델의 생각 설정 사용
                                                          → fetchCustom → API 요청

[변경 후]
RisuAI args (생각 파라미터 포함) → CPM router → inferSlot → 샘플링 + 생각/추론 오버라이드
                                                          → fetchByProviderId → config에 슬롯 오버라이드 반영
                                                          → fetchCustom → API 요청
```

### 2-B. 새 설정 키

| 프로바이더 | 설정 키 | 타입 | 옵션 | UI 라벨 |
|-----------|---------|------|------|---------|
| Gemini | `cpm_slot_{slot}_thinking` | select | off/none/MINIMAL/LOW/MEDIUM/HIGH | Thinking Level (생각 수준) |
| Gemini | `cpm_slot_{slot}_thinking_budget` | number | 0~ | Thinking Budget Tokens (생각 토큰 예산) |
| OpenAI | `cpm_slot_{slot}_reasoning` | select | none/off/low/medium/high/xhigh | Reasoning Effort (추론 수준) |
| OpenAI | `cpm_slot_{slot}_verbosity` | select | none/low/medium/high | Response Verbosity (응답 상세도) |
| Anthropic | `cpm_slot_{slot}_effort` | select | none/unspecified/low/medium/high/max | Anthropic Effort (적응형 추론) |
| Anthropic | `cpm_slot_{slot}_adaptive_thinking` | checkbox | true/false | Adaptive Thinking (적응형 추론 활성화) |

---

## 3. 변경 파일 목록

### 3-A. settings-ui.js (UI 렌더링)

**위치**: `src/lib/settings-ui.js` L237~255 `renderAuxParams()` 함수

**변경 내용**: 기존 샘플링 파라미터 블록 아래에 생각/추론 섹션 추가

```javascript
// 기존 코드 (L237-255)
const renderAuxParams = async (slot) => `
    <div class="mt-8 pt-6 border-t border-gray-800 space-y-2">
        <h4>Generation Parameters</h4>
        ...기존 8개 샘플링 필드...
    </div>
    <!-- 신규 추가 -->
    <div class="mt-8 pt-6 border-t border-gray-800 space-y-2">
        <h4>Thinking / Reasoning Settings (생각·추론 설정)</h4>
        <p class="text-xs text-blue-400 ...">
            프로바이더별 생각/추론 설정입니다. 비워두면(None/Off) CPM이 건드리지 않습니다.<br/>
            Gemini = Thinking Level/Budget, OpenAI = Reasoning/Verbosity, Anthropic = Effort/Adaptive
        </p>
        ${await renderInput(`cpm_slot_${slot}_thinking`, 'Thinking Level (Gemini 생각 수준)', 'select', thinkingList)}
        ${await renderInput(`cpm_slot_${slot}_thinking_budget`, 'Thinking Budget Tokens (Gemini 2.5 생각 토큰, 0=끄기)', 'number')}
        ${await renderInput(`cpm_slot_${slot}_reasoning`, 'Reasoning Effort (OpenAI o1/o3)', 'select', reasoningList)}
        ${await renderInput(`cpm_slot_${slot}_verbosity`, 'Response Verbosity (OpenAI)', 'select', verbosityList)}
        ${await renderInput(`cpm_slot_${slot}_effort`, 'Anthropic Effort (적응형 추론)', 'select', effortList)}
        ${await renderInput(`cpm_slot_${slot}_adaptive_thinking`, 'Adaptive Thinking (Anthropic 적응형 추론)', 'checkbox')}
    </div>
`;
```

### 3-B. router.js (슬롯 오버라이드 수집)

**위치**: `src/lib/router.js` L152~189 `handleRequest()` 함수

**변경 내용**: 기존 샘플링 오버라이드 블록에 생각/추론 오버라이드 추가

```javascript
// 기존 샘플링 오버라이드 이후에 추가 (L189 근처)
const slotThinking = await safeGetArg(`cpm_slot_${slot}_thinking`);
const slotThinkingBudget = await safeGetArg(`cpm_slot_${slot}_thinking_budget`);
const slotReasoning = await safeGetArg(`cpm_slot_${slot}_reasoning`);
const slotVerbosity = await safeGetArg(`cpm_slot_${slot}_verbosity`);
const slotEffort = await safeGetArg(`cpm_slot_${slot}_effort`);
const slotAdaptiveThinking = await safeGetBoolArg(`cpm_slot_${slot}_adaptive_thinking`);

// args에 _cpmSlotThinkingConfig 객체로 묶어서 전달
// (args에 직접 넣지 않는 이유: 기존 RisuAI args 필드와 충돌 방지)
args._cpmSlotThinkingConfig = {};
if (slotThinking && slotThinking !== '' && slotThinking !== 'none' && slotThinking !== 'off') {
    args._cpmSlotThinkingConfig.thinking_level = slotThinking;
}
if (slotThinkingBudget && slotThinkingBudget !== '' && slotThinkingBudget !== '0') {
    const n = _toFiniteInt(slotThinkingBudget);
    if (n !== undefined && n > 0) args._cpmSlotThinkingConfig.thinkingBudget = n;
}
if (slotReasoning && slotReasoning !== '' && slotReasoning !== 'none') {
    args._cpmSlotThinkingConfig.reasoning = slotReasoning;
}
if (slotVerbosity && slotVerbosity !== '' && slotVerbosity !== 'none') {
    args._cpmSlotThinkingConfig.verbosity = slotVerbosity;
}
if (slotEffort && slotEffort !== '' && slotEffort !== 'none') {
    args._cpmSlotThinkingConfig.effort = slotEffort;
}
if (slotAdaptiveThinking) {
    args._cpmSlotThinkingConfig.adaptiveThinking = true;
}
```

### 3-C. router.js (fetchByProviderId config 병합)

**위치**: `src/lib/router.js` L110~130 `fetchByProviderId()` 함수

**변경 내용**: `fetchCustom()` 호출 시 슬롯 오버라이드를 config에 병합

```javascript
// fetchCustom 호출 직전에 슬롯 오버라이드 병합
const slotOverrides = args._cpmSlotThinkingConfig || {};
return await fetchCustom({
    url: cDef.url, key: cDef.key, model: cDef.model, ...
    // 기존 값을 슬롯 오버라이드로 덮어씌움 (슬롯 > 커스텀 모델 기본값)
    thinking_level: slotOverrides.thinking_level || cDef.thinking || 'none',
    thinkingBudget: slotOverrides.thinkingBudget || parseInt(cDef.thinkingBudget) || 0,
    reasoning: slotOverrides.reasoning || cDef.reasoning || 'none',
    verbosity: slotOverrides.verbosity || cDef.verbosity || 'none',
    effort: slotOverrides.effort || cDef.effort || 'none',
    adaptiveThinking: slotOverrides.adaptiveThinking || !!cDef.adaptiveThinking,
    ...
}, messages, temp, maxTokens, args, abortSignal, _reqId);
```

### 3-D. fetch-custom.js (변경 없음)

`fetchCustom()`은 이미 `config.thinking_level`, `config.thinkingBudget`, `config.reasoning`, `config.effort`, `config.adaptiveThinking`을 올바르게 처리하므로 **변경 불필요**.

---

## 4. 교차 검증

### 4-A. RisuAI 오픈소스와의 호환성

| 항목 | RisuAI 동작 | CPM 대응 | 호환성 |
|------|-----------|---------|--------|
| `gemini_thinkingLevel` | args에 포함 | CPM 슬롯 오버라이드가 우선, 없으면 RisuAI 값 사용 | ✅ |
| `thinking_tokens` | args에 포함 | CPM thinkingBudget이 우선, 없으면 RisuAI 값 사용 | ✅ |
| `removeThoughts` | RisuAI 자체 처리 | CPM이 건드리지 않음 | ✅ |

### 4-B. 프로바이더별 생각/추론 동작

| 프로바이더 (포맷) | Thinking Level | Thinking Budget | Reasoning | Effort | Adaptive |
|----------------|:---------:|:---------:|:---------:|:------:|:--------:|
| Gemini (google) | ✅ thinkingConfig.thinkingLevel | ✅ budget→level 변환 | ❌ 해당없음 | ❌ 해당없음 | ❌ 해당없음 |
| OpenAI (openai) | ❌ 해당없음 | ❌ 해당없음 | ✅ reasoning_effort | ✅ response_verbosity | ❌ 해당없음 |
| Anthropic (anthropic) | ❌ 해당없음 | ✅ thinking.budget_tokens | ❌ 해당없음 | ✅ output_config.effort | ✅ thinking.type='adaptive' |
| 커스텀 (openai/anthropic/google) | ✅ 포맷에 따라 | ✅ 포맷에 따라 | ✅ 포맷에 따라 | ✅ 포맷에 따라 | ✅ 포맷에 따라 |

### 4-C. 잠재적 충돌/위험 분석

| 시나리오 | 위험 | 대응 |
|---------|------|------|
| 슬롯 thinking 설정 + 커스텀 모델 thinking 설정 공존 | 어느 것이 우선? | **슬롯이 우선** (비어있으면 커스텀 모델 값 사용) |
| Gemini 모델에 Reasoning effort 설정 | 의미 없음 | fetchCustom에서 format='google'이면 reasoning 무시 → **안전** |
| Anthropic 모델에 Thinking Level='HIGH' | Anthropic에는 thinkingLevel 개념 없음 | fetchCustom에서 format='anthropic'이면 thinkingLevel 무시 → **안전** |
| 슬롯 heuristicConfirmed=false | 생각 오버라이드 적용 안 함 | 기존 가드와 동일하게 보호 → **안전** |
| adaptiveThinking + effort 동시 설정 | Anthropic에서는 adaptive thinking이 effort보다 우선 | fetchCustom 기존 로직 (L180-195)이 이미 처리 → **안전** |

---

## 5. 테스트 계획

### 5-A. 단위 테스트 (신규)

| 테스트 파일 | 범위 | 예상 개수 |
|-----------|------|---------|
| `tests/slot-thinking-override.test.js` | 슬롯별 생각/추론 UI 설정 값 수집 및 config 병합 | ~20 |
| `tests/slot-thinking-e2e.test.js` | 슬롯 오버라이드 → fetchCustom → API body 검증 | ~15 |

### 5-B. 핵심 테스트 시나리오

1. **Gemini 번역 슬롯 + Thinking Level=HIGH**: body.generationConfig.thinkingConfig.thinkingLevel === 'HIGH'
2. **Gemini 메모리 슬롯 + Thinking Budget=8000 (Flash)**: level → MEDIUM
3. **Anthropic 감정 슬롯 + Effort=high + Adaptive=true**: body.thinking.type === 'adaptive', body.output_config.effort === 'high'
4. **Anthropic 번역 슬롯 + Budget=10000 (Adaptive OFF)**: body.thinking.type === 'enabled', body.thinking.budget_tokens === 10000
5. **OpenAI 루아 슬롯 + Reasoning=medium**: body.reasoning_effort === 'medium'
6. **슬롯 설정 비어있음 → 커스텀 모델 기본값 사용**: config.thinking_level === cDef.thinking
7. **슬롯 설정 있음 → 커스텀 모델 기본값 덮어씌움**: config.thinking_level === slotOverride
8. **heuristicConfirmed=false → 오버라이드 미적용**: config === cDef 값 그대로
9. **Gemini 모델에 Reasoning effort 설정 → 무시됨**: body에 reasoning_effort 없음
10. **Anthropic 모델에 Thinking Level 설정 → 무시됨**: body에 thinkingConfig 없음

---

## 6. 구현 순서

```
Step 1: settings-ui.js — renderAuxParams()에 생각/추론 UI 필드 추가
Step 2: router.js — handleRequest()에 슬롯 생각/추론 값 수집 로직 추가
Step 3: router.js — fetchByProviderId()에 config 병합 로직 추가
Step 4: Rollup 빌드 + 기존 테스트 통과 확인
Step 5: 신규 테스트 작성 (35건)
Step 6: 전체 테스트 스위트 실행 (3426+ → 3461+ 예상)
Step 7: 버전 범프 (v1.20.17 → v1.21.0)
Step 8: 테스트 서버 배포
```

---

## 7. 부수 변경사항

### 7-A. gemini-3.1-flash-lite-preview 모델 추가 (이미 완료)

| 파일 | 변경 |
|------|------|
| `cpm-provider-gemini.js` L11~17 | GEMINI_MODELS 배열에 추가 |
| `cpm-provider-vertex.js` L12~19 | GEMINI_MODELS 배열에 추가 |
| `src/lib/format-gemini.js` L129 | Flash 감지 정규식 수정: `/gemini-3[^.]*flash/i` → `/gemini-3[\d.]*-?flash/i` |

### 7-B. Flash 감지 정규식 수정 이유

- **기존**: `/gemini-3[^.]*flash/` — `gemini-3.1-flash-lite-preview`의 `.`을 매칭하지 못함
- **변경**: `/gemini-3[\d.]*-?flash/` — 버전 번호 내 `.`을 허용하여 3.1, 3.5 등 매칭 가능
- **검증**: 5개 모델 ID에 대해 의도대로 매칭/비매칭 확인 완료

---

## 8. 리스크 평가

| 리스크 | 영향 | 확률 | 대응 |
|-------|------|------|------|
| 새 UI 필드 렌더링 오류 | 설정 패널 깨짐 | 낮음 | 기존 renderInput 헬퍼 재사용 |
| 슬롯 오버라이드 값이 fetchCustom에 안 도달 | 설정해도 적용 안 됨 | 낮음 | E2E 테스트로 검증 |
| 리스AI args 필드와 충돌 | 예상치 못한 동작 | 매우 낮음 | `_cpmSlotThinkingConfig` 프리픽스로 네임스페이스 분리 |
| heuristic 오작동으로 메인 채팅에 오버라이드 적용 | 메인 채팅 생각 레벨 변경 | 낮음 | 기존 heuristic guard 동일 적용 |

**전체 리스크**: ✅ **LOW** — 기존 인프라 재사용, 신규 코드 100줄 미만, 기존 테스트 영향 없음

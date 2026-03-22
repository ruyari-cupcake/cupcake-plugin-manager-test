# Copilot Gemini 추론(Reasoning) 교차검증 보고서

**비교 대상**: `copilot-manager-v1.7.1.js` (standalone) vs `_temp_repo` CPM v1.22.11  
**작성일**: 2026-03-22

---

## 1. 결론 요약

| 항목 | v1.7.1 (standalone) | CPM v1.22.11 (_temp_repo) |
|------|---------------------|--------------------------|
| Copilot Gemini 추론 | ✅ 작동 | ❌ **미작동** |
| 원인 | `openai_thinking` 설정이 Gemini에도 `reasoning_effort`로 전달 | `supportsOpenAIReasoningEffort()`가 Gemini를 인식하지 않음 |
| 경로 | 전역 설정 → `reasoning_effort` 자동 주입 | 커스텀 모델 `reasoning: 'none'` 고정 → 주입 안됨 |

> **CPM에서 Copilot Gemini 추론이 안 되는 이유**: 2가지 누락이 동시에 발생

---

## 2. 근본 원인 분석

### 원인 A: `supportsOpenAIReasoningEffort()`에 Gemini 미포함

**파일**: `src/lib/model-helpers.js:86-89`

```js
export function supportsOpenAIReasoningEffort(modelName) {
    if (!modelName) return false;
    return isO3O4Family(modelName) || isGPT5Family(modelName);
    // ❌ Gemini 모델이 빠져 있음!
}
```

**파일**: `src/lib/fetch-custom.js:274-277` — reasoning_effort 주입 조건:
```js
if (config.reasoning && config.reasoning !== 'none') {
    if (format === 'openai' && supportsOpenAIReasoningEffort(config.model)) {
        body.reasoning_effort = config.reasoning;  // ← Gemini는 여기 도달 불가
    }
}
```

**v1.7.1 대응 코드** (minified `qt(t)` 함수):
```js
function qt(t) {
    return (t.capabilities?.supports?.reasoning_effort?.length ?? 0) > 0
        || t.capabilities?.supports?.adaptive_thinking === true
        || t.id.includes("gpt-5")
        || t.id.includes("gemini")         // ✅ Gemini 명시적 포함
        || /(opus-4.6|sonnet-4.6)/.test(t.id);
}
```

### 원인 B: Copilot 자동 생성 모델의 `reasoning: 'none'` 하드코딩

**파일**: `cpm-copilot-manager.js:1021`

코파일럿 매니저가 자동 생성하는 커스텀 모델 정의:
```js
const modelDef = {
    // ...
    reasoning: 'none',    // ← 항상 none으로 고정
    thinking: 'none',     // ← 항상 none으로 고정
    // ...
};
```

설령 `supportsOpenAIReasoningEffort()`에 Gemini를 추가하더라도, 
`config.reasoning`이 `'none'`이므로 `fetch-custom.js:274`의 조건을 통과하지 못합니다.

### 원인 C: Gemini Direct Provider와의 경로 차이

| 요청 경로 | Thinking 설정 소스 | 상태 |
|-----------|-------------------|------|
| Gemini Direct (`cpm-provider-gemini.js`) | `cpm_gemini_thinking_level` / `cpm_gemini_thinking_budget` via `safeGetArg` | ✅ 설정값 있으면 작동 |
| Copilot Gemini (`cpm-copilot-manager.js` → `fetch-custom.js`) | 커스텀 모델의 `reasoning`/`thinking_level` 필드 | ❌ `'none'`으로 고정 |

Copilot API의 Gemini 모델은 OpenAI 호환 endpoint(`/chat/completions`)를 사용하므로 `cpm-provider-gemini.js`가 아닌 `fetch-custom.js` 경로를 탑니다. 
이 경로에서는 `cpm_gemini_thinking_level` 설정이 참조되지 않습니다.

---

## 3. v1.7.1의 작동 메커니즘

v1.7.1에서는 **전역 `openai_thinking` 설정**이 존재:

```
UI: "OpenAI 추론 노력" → none/minimal/low/medium/high/xhigh
설명: "Gemini 시리즈에서 사고 단계로, GPT-5 시리즈에서 추론 노력으로 적용됩니다."
```

이 설정은 **모든 Copilot 모델**에 적용되며, `qt(t)` 함수가 `gemini`를 포함하는 모델을 reasoning 지원으로 인식합니다:

```
사용자가 openai_thinking = "medium" 설정
  → qt(gemini-2.5-flash) = true (gemini 포함)
  → reasoning_effort = "medium" 주입
  → Copilot API가 Gemini에 thinking 활성화
```

---

## 4. 수정 방안

### 방안 1: `supportsOpenAIReasoningEffort()`에 Gemini 추가 + 슬롯 설정 연결 (권장)

**model-helpers.js:**
```js
export function supportsOpenAIReasoningEffort(modelName) {
    if (!modelName) return false;
    const m = String(modelName).toLowerCase();
    return isO3O4Family(modelName) 
        || isGPT5Family(modelName)
        || m.includes('gemini');  // ← 추가
}
```

**router.js 또는 fetch-custom.js:**  
슬롯 thinking config의 `reasoning` 값을 Copilot Gemini 커스텀 모델에 전달하도록 수정.

### 방안 2: cpm-copilot-manager.js에서 모델 생성 시 Gemini 감지

```js
const isGeminiModel = modelDef.model && modelDef.model.includes('gemini');
if (isGeminiModel) {
    modelDef.reasoning = slotConfig.reasoning || 'medium';  // 기본값
}
```

### 방안 3: 전역 "Copilot Thinking" 설정 추가 (v1.7.1 방식 재현)

`cpm_copilot_reasoning_effort` 같은 전역 설정을 추가하고, 
Copilot 모델 요청 시 자동 주입.

---

## 5. Gemini Direct Provider는 정상인가?

`cpm-provider-gemini.js`의 **Gemini Direct API** 경로는 별도 분석 필요:

- `cpm_gemini_thinking_level` → `@arg`로 선언됨 (plugin-header.js:37)
- `settings-backup.js`에 포함됨
- **하지만 이 값을 설정하는 UI가 메인 설정 패널에 없음** (슬롯 UI에만 존재)
- 유저가 RisuAI의 플러그인 인자를 직접 수정하거나, 슬롯 설정을 사용해야 함
- 기본값이 없으므로 `safeGetArg('cpm_gemini_thinking_level')` → `''` → `buildGeminiThinkingConfig()` → `null` → thinking 미적용

**결론**: Gemini Direct도 유저가 슬롯 설정을 하지 않으면 thinking이 작동하지 않음.

---

## 6. 영향 범위

| 모델 | 경로 | Thinking 상태 |
|------|------|--------------|
| Copilot Gemini 2.5 Flash/Pro | fetch-custom.js (openai format) | ❌ reasoning='none' 고정 |
| Copilot Gemini 3.x | fetch-custom.js (openai format) | ❌ reasoning='none' 고정 |
| Gemini Direct (API key) | cpm-provider-gemini.js | ⚠️ 슬롯 설정 필요 |
| Copilot GPT-5 | fetch-custom.js (openai format) | ✅ 슬롯 reasoning으로 작동 |
| Copilot Claude | fetch-custom.js (anthropic format) | ✅ 별도 경로 |

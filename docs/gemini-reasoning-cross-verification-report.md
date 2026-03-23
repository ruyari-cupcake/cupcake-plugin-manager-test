# Gemini reasoning_effort 교차검증 보고서

> **작성일**: 2026-03-23 (재검증 완료)  
> **CPM 현재 버전**: v1.22.19 (v1.22.11 코드 기반)  
> **비교 대상**: copilot-manager-v1.7.1.js (`other_plugin/`)  
> **목적**: Gemini reasoning_effort 지원 차이 분석 및 400 에러 원인 규명

---

## 1. 핵심 발견

### ⚠️ 중요: CPM은 Gemini를 2가지 경로로 처리

| 경로 | 포맷 | API 엔드포인트 | 사고 제어 방식 | 현재 상태 |
|------|------|--------------|--------------|----------|
| **A. Copilot API 프록시** | format='openai' | `/chat/completions` (githubcopilot.com) | `reasoning_effort` | ❌ 누락 (사일런트 실패) |
| **B. Google Gemini API 직접** | format='google' | Google Gemini endpoints | `generationConfig.thinkingConfig` | ✅ 정상 동작 |

**copilot-manager-v1.7.1은 경로 A만 사용** (Copilot API 전용).
**CPM은 양쪽 다 지원** — 경로 B는 정상, 경로 A에서만 reasoning_effort 누락.

---

## 2. copilot-manager-v1.7.1 분석 (Copilot API 경로만 사용)

### 2.1 Gemini 감지: `qt()` 함수
```javascript
function qt(t){
    return (t.capabilities?.supports?.reasoning_effort?.length ?? 0) > 0
        || t.capabilities?.supports?.adaptive_thinking === true
        || t.id.includes("gpt-5")
        || t.id.includes("gemini")     // ← Gemini 명시적 포함
        || /(opus-4.6|sonnet-4.6)/.test(t.id)
}
```
- **이중 감지**: 모델 ID + Copilot API capabilities 모두 사용
- Gemini 모델: `t.id.includes("gemini")` → `true`

### 2.2 reasoning_effort 주입: `Kt()` / `Wt()` 함수
```javascript
function Kt(t, e, s){
    if (!e.openaiThinking) return {body: s, removeTemperature: false};
    let n;
    n = "xhigh" !== e.openaiThinking || Ht(t)
        ? "minimal" === e.openaiThinking && !Gt(t)
          || "none" === e.openaiThinking && !Lt(t)
          ? "low" : e.openaiThinking
        : "high";
    s.reasoning_effort = n;  // ← Gemini에도 적용
    return {body: s, removeTemperature: true};
}
```

### 2.3 엔드포인트 라우팅
```javascript
const r = "Anthropic" === e.vendor && "anthropic" === U.claudeFormat
    && (e.supported_endpoints?.includes("/v1/messages") ?? false);
const c = !r && "responses" === U.openaiFormat
    && (e.supported_endpoints?.includes("/responses") ?? false);
const l = r ? `${Nt()}/v1/messages`
          : c ? `${Nt()}/responses`
          : `${Nt()}/chat/completions`;   // ← Gemini는 여기
```
- **Gemini**: vendor≠Anthropic, `supported_endpoints`에 `/responses` 없음
- → **항상 `/chat/completions`으로 라우팅**

### 2.4 copilot-manager의 Gemini 요청 결과
```
POST https://api.individual.githubcopilot.com/chat/completions
{
  "model": "gemini-2.5-flash",
  "messages": [...],
  "reasoning_effort": "low"   ← Copilot API가 이해하는 파라미터
}
```

---

## 3. CPM v1.22.11 분석 (2가지 경로)

### 3.1 경로 A: Copilot API 프록시 (format='openai') — ❌ 문제 있음

#### 3.1.1 감지 누락: `supportsOpenAIReasoningEffort()`
```javascript
// src/lib/model-helpers.js
export function supportsOpenAIReasoningEffort(modelName) {
    if (!modelName) return false;
    return isO3O4Family(modelName) || isGPT5Family(modelName);
    // ⚠️ Gemini 없음
}
```
- `supportsOpenAIReasoningEffort("gemini-2.5-flash")` → `false` ❌

#### 3.1.2 reasoning_effort 주입 실패
```javascript
// src/lib/fetch-custom.js ~Line 289
if (config.reasoning && config.reasoning !== 'none') {
    if (format === 'openai' && supportsOpenAIReasoningEffort(config.model)) {
        body.reasoning_effort = config.reasoning;   // ← Gemini에서 실행 안 됨
    }
}
```
- format='openai' + Gemini → `supportsOpenAIReasoningEffort()` = `false` → **사일런트 실패**
- 에러 없음, 로그 없음, 단순히 reasoning_effort가 빠진 채 요청 전송

### 3.2 경로 B: Google Gemini API 직접 (format='google') — ✅ 정상

```javascript
// src/lib/fetch-custom.js ~Line 112-223
else if (format === 'google') {
    const { contents, systemInstruction } = formatToGemini(messages, {...});
    body.contents = formattedMessages;
    body.generationConfig = { temperature: temp, maxOutputTokens: maxTokens };
    
    // Gemini thinking 설정 (Google API 전용)
    const _thinkCfg = buildGeminiThinkingConfig(
        config.model, config.thinking_level, _thinkBudgetForGemini, _isVertexEndpoint
    );
    if (_thinkCfg) body.generationConfig.thinkingConfig = _thinkCfg;
}
```
- Google API에 올바른 포맷으로 전송 ✅
- `thinkingConfig`은 Google Gemini API의 정식 사고 제어 방식

### 3.3 /responses 엔드포인트 (이전 400 에러 원인)
```javascript
// src/lib/model-helpers.js
export function needsCopilotResponsesAPI(modelName) {
    if (!modelName) return false;
    const m = String(modelName).toLowerCase();
    const match = m.match(/(?:^|\/)gpt-5\.(\d+)/);
    if (match && parseInt(match[1]) >= 4) return true;  // GPT-5.4+ 전용
    return false;
}
```
- v1.22.14에서 `isGeminiFamily()` 추가 → Gemini `/responses`로 라우팅 → 400 에러
- v1.22.11 롤백: Gemini는 `/responses` 미사용 → 400 에러 해결 ✅

---

## 4. 비교표 (재검증)

| 항목 | copilot-manager-v1.7.1 | CPM 경로A (Copilot proxy) | CPM 경로B (Google 직접) |
|------|:---:|:---:|:---:|
| **Gemini 감지** | ✅ `qt()` | ❌ 누락 | N/A (format='google' 분기) |
| **사고 제어** | `reasoning_effort` | ❌ 미주입 | ✅ `thinkingConfig` |
| **엔드포인트** | /chat/completions | /chat/completions | Google API endpoints |
| **포맷** | OpenAI (messages) | OpenAI (messages) | Google (contents) |
| **400 에러** | 없음 | 없음 | 없음 |
| **기능 손실** | 없음 | ✅ reasoning 무시됨 | 없음 |

---

## 5. 문제 영향도 평가

### 5.1 영향 범위 (정정)
- **영향받는 사용자**: Copilot API를 통해 Gemini 모델을 사용하면서 reasoning 설정을 한 사용자
- **영향받지 않는 사용자**: Google Gemini API 직접 사용자 (thinkingConfig 정상 동작)
- **심각도**: 중간 — 경로 A에서만 기능 손실, 에러는 없음

### 5.2 동작 차이
| 시나리오 | copilot-manager | CPM (현재) |
|---------|:---:|:---:|
| Copilot Gemini + reasoning="low" | ✅ `reasoning_effort: "low"` 전송 | ❌ 무시됨 |
| Copilot Gemini + reasoning="none" | ✅ 전송 안 함 | ✅ 전송 안 함 |
| Google Gemini + thinking | N/A | ✅ `thinkingConfig` 사용 |

### 5.3 긴급도
- 400 에러 (크리티컬) → ✅ 완전 해결
- Copilot Gemini reasoning_effort 누락 → ⚠️ 기능 손실 (사일런트)
- Google Gemini thinking → ✅ 정상

---

## 6. 수정 방안 (3가지 옵션)

> **수정 범위**: 경로 A (Copilot API 프록시, format='openai')에만 해당.  
> 경로 B (Google Gemini API 직접)는 이미 `thinkingConfig`으로 정상 동작.

### Option A: 최소 수정 — supportsOpenAIReasoningEffort에 Gemini 추가
```javascript
// src/lib/model-helpers.js
export function supportsOpenAIReasoningEffort(modelName) {
    if (!modelName) return false;
    return isO3O4Family(modelName) 
        || isGPT5Family(modelName) 
        || /\bgemini/i.test(String(modelName));  // ← 추가
}
```
- **장점**: 1줄 수정, 최소 위험
- **단점**: `isGeminiFamily()`를 다시 만들지 않으므로 일관성 부족
- **중요**: `needsCopilotResponsesAPI()`에는 추가하지 않음 → /chat/completions 유지 → 400 에러 방지

### Option B: isGeminiFamily 복원 + 안전한 적용 (권장)
```javascript
// src/lib/model-helpers.js
export function isGeminiFamily(modelName) {
    if (!modelName) return false;
    return /\bgemini/i.test(String(modelName));
}

export function supportsOpenAIReasoningEffort(modelName) {
    if (!modelName) return false;
    return isO3O4Family(modelName) || isGPT5Family(modelName) || isGeminiFamily(modelName);
}

// ⚠️ 절대 needsCopilotResponsesAPI()에는 추가하지 말 것!
// needsCopilotResponsesAPI는 Gemini를 포함하지 않아야 400 에러 방지
```
- **장점**: copilot-manager와 동일한 구조, 명확한 함수 분리
- **핵심**: `supportsOpenAIReasoningEffort()`에만 적용, `needsCopilotResponsesAPI()` 절대 건드리지 않음
- **fetch-custom.js 영향**: format='openai'일 때만 해당 → Copilot proxy 경로 수정
  - format='google'일 때는 이미 별도 분기(`thinkingConfig`)로 처리 → 영향 없음

### Option C: Copilot API capabilities 기반 동적 감지
```javascript
// fetch-custom.js
if (config.reasoning && config.reasoning !== 'none') {
    const modelSupportsReasoning = supportsOpenAIReasoningEffort(config.model)
        || config._capabilities?.supports?.reasoning_effort?.length > 0;
    
    if (format === 'openai' && modelSupportsReasoning) {
        body.reasoning_effort = config.reasoning;
    }
}
```
- **장점**: 모든 모델에 동적으로 대응 (향후 새 모델 추가 시 자동 지원)
- **단점**: capabilities 데이터 전달 인프라 필요, 변경 범위 큼

### 권장: **Option B** (isGeminiFamily 복원 + 안전한 적용)

---

## 7. 안전 장치 — 400 에러 재발 방지

어떤 옵션을 선택하든 반드시 지켜야 할 원칙:

```javascript
// ❌ 절대 하지 말 것
export function needsCopilotResponsesAPI(modelName) {
    return isGPT54Plus(modelName) || isGeminiFamily(modelName);  // ← 이거 하면 안 됨!
}

// ✅ 올바른 방식: Gemini는 /chat/completions만 사용
export function needsCopilotResponsesAPI(modelName) {
    return isGPT54Plus(modelName);  // Gemini 포함하지 않음
}
```

**근거**: 
- copilot-manager-v1.7.1도 Gemini에 `/chat/completions` 사용
- Gemini 모델의 `supported_endpoints`에 `/chat/completions`만 포함됨
- `/responses` 엔드포인트는 GPT-5.4+ 전용

---

## 8. 테스트 체크리스트 (수정 후)

- [ ] `supportsOpenAIReasoningEffort("gemini-2.5-flash")` → `true`
- [ ] `supportsOpenAIReasoningEffort("gemini-3-pro")` → `true`
- [ ] `needsCopilotResponsesAPI("gemini-2.5-flash")` → `false` (변경 없어야 함)
- [ ] Gemini + reasoning="medium" → body에 `reasoning_effort: "medium"` 포함
- [ ] Gemini + reasoning="none" → body에 `reasoning_effort` 없음
- [ ] Gemini + slot override → slot의 reasoning 값 사용
- [ ] gpt-4o + reasoning="medium" → body에 `reasoning_effort` 없음
- [ ] o3-mini + reasoning="medium" → body에 `reasoning_effort: "medium"` 포함

---

## 부록: 파일 위치 참조

| 파일 | 역할 |
|------|------|
| `other_plugin/copilot-manager-v1.7.1.js` | 참조 구현 (정상 동작) |
| `src/lib/model-helpers.js` | 모델 감지 함수 (수정 대상) |
| `src/lib/fetch-custom.js` | reasoning_effort 주입 (수정 불필요 — model-helpers 수정 시 자동 해결) |
| `src/lib/router.js` | 라우팅 config 전달 |
| `tests/model-helpers.test.js` | 유닛 테스트 (수정 테스트 추가 필요) |
| `tests/proxy-url-e2e.test.js` | E2E 테스트 (수정 테스트 추가 필요) |

---

## 9. 수정 계획서 (Option B 기반)

> **목표**: Copilot API 경로(format='openai')에서 Gemini reasoning_effort 복원  
> **원칙**: `needsCopilotResponsesAPI()`는 절대 건드리지 않음  
> **버전**: 수정 후 v1.22.20으로 릴리즈 예정

### Phase 1: model-helpers.js 수정

**파일**: `src/lib/model-helpers.js`

**Step 1.1** — `isGeminiFamily()` 함수 복원
```javascript
// isGeminiNoCivicModel() 다음에 추가
/**
 * Detect any Gemini model (2.x, 3.x, etc.).
 * Matches: gemini-2.5-flash, gemini-3-pro, gemini-2.5-flash-preview, etc.
 * @param {string} modelName
 * @returns {boolean}
 */
export function isGeminiFamily(modelName) {
    if (!modelName) return false;
    return /\bgemini/i.test(String(modelName));
}
```
- 위치: `isGeminiNoCivicModel()` 바로 아래
- v1.22.12의 `isGeminiFamily`와 동일한 로직

**Step 1.2** — `supportsOpenAIReasoningEffort()`에 Gemini 추가
```javascript
export function supportsOpenAIReasoningEffort(modelName) {
    if (!modelName) return false;
    return isO3O4Family(modelName) || isGPT5Family(modelName) || isGeminiFamily(modelName);
}
```
- 변경: `|| isGeminiFamily(modelName)` 추가
- fetch-custom.js에서 format='openai' + Gemini 조합 시 `reasoning_effort` 자동 주입됨

**Step 1.3** — `needsCopilotResponsesAPI()` 검증 (변경 없음!)
```javascript
// 이 함수는 절대 수정하지 않음!
export function needsCopilotResponsesAPI(modelName) {
    // GPT-5.4+ 전용 — Gemini 포함하면 400 에러 재발
    if (!modelName) return false;
    const m = String(modelName).toLowerCase();
    const match = m.match(/(?:^|\/)gpt-5\.(\d+)/);
    if (match && parseInt(match[1]) >= 4) return true;
    return false;
}
```

### Phase 2: 테스트 수정

**파일**: `tests/model-helpers.test.js`

**Step 2.1** — import에 `isGeminiFamily` 추가
```javascript
import {
    ...
    isGeminiFamily,          // ← 추가
    supportsOpenAIReasoningEffort,
    ...
} from '../src/lib/model-helpers.js';
```

**Step 2.2** — `isGeminiFamily` describe 블록 복원
```javascript
describe('isGeminiFamily', () => {
    it('returns false for null/empty', () => { ... });
    it('matches all Gemini variants', () => { ... });
    it('is case-insensitive', () => { ... });
    it('rejects non-Gemini models', () => { ... });
});
```

**Step 2.3** — `supportsOpenAIReasoningEffort` Gemini 테스트 복원
```javascript
it('matches Gemini models (Copilot API reasoning_effort support)', () => {
    expect(supportsOpenAIReasoningEffort('gemini-2.5-flash')).toBe(true);
    expect(supportsOpenAIReasoningEffort('gemini-3-pro')).toBe(true);
});
```

**Step 2.4** — `needsCopilotResponsesAPI` Gemini 제외 테스트 추가 (방어)
```javascript
it('rejects Gemini models (Gemini는 /chat/completions만 사용)', () => {
    expect(needsCopilotResponsesAPI('gemini-2.5-flash')).toBe(false);
    expect(needsCopilotResponsesAPI('gemini-3-pro')).toBe(false);
});
```

**파일**: `tests/proxy-url-e2e.test.js`

**Step 2.5** — Gemini reasoning_effort E2E 테스트 복원
- "Gemini model with reasoning='medium' injects reasoning_effort into body" → `expect(body.reasoning_effort).toBe('medium')`
- "slot _cpmSlotThinkingConfig overrides model reasoning for Gemini" → `expect(body.reasoning_effort).toBe('high')`
- "Gemini 3 model also supports reasoning_effort" → `expect(body.reasoning_effort).toBe('high')`

### Phase 3: 빌드 & 배포

**Step 3.1** — 모든 테스트 통과 확인
```bash
npx vitest run
# 예상: 3830+ 테스트 전체 PASS
```

**Step 3.2** — 프로덕션 빌드 + origin/test 배포
```bash
CPM_ENV=production npm run build
node scripts/release.cjs --skip-test
git add -A && git commit -m "feat: v1.22.20 - Gemini reasoning_effort 안전 복원 (Copilot API 경로, needsCopilotResponsesAPI 미변경)"
git push origin main
git push test main --force   # 교차오염 복구 유지
```

**Step 3.3** — test2 빌드 + test2 배포
```bash
CPM_ENV= npm run build
node scripts/release.cjs --skip-test
git add -A && git commit -m "chore: test2 build sync for v1.22.20"
git push test2 main
```

### Phase 4: 검증

**Step 4.1** — 복구 모니터링
```bash
node scripts/verify-recovery-deployment.cjs --all
# 예상: production 5/5 PASS, test(legacy) 5/5 PASS
```

**Step 4.2** — 수동 검증 (선택)
- RisuAI에서 Copilot Gemini 모델 + reasoning="medium" 설정
- 브라우저 DevTools Network 탭에서 API 요청 body 확인
- `reasoning_effort: "medium"` 포함 확인

### ⚠️ 절대 하지 말아야 할 것

1. `needsCopilotResponsesAPI()`에 `isGeminiFamily()` 추가 → **400 에러 재발**
2. Gemini를 `/responses` 엔드포인트로 라우팅 → **400 에러 재발**
3. format='google' 분기의 `thinkingConfig` 로직 변경 → **Google API 경로 파괴**

### 예상 소요 변경량

| 파일 | 변경 유형 | 예상 라인 |
|------|----------|----------|
| `src/lib/model-helpers.js` | 함수 추가 + 수정 | +10, ~1 |
| `tests/model-helpers.test.js` | import + describe 복원 + 방어 테스트 | +30 |
| `tests/proxy-url-e2e.test.js` | E2E 테스트 복원 | ~10 수정 |
| `src/lib/shared-state.js` | 버전 → 1.22.20 | 1 |
| `src/plugin-header.js` | 버전 → 1.22.20 | 1 |
| `package.json` | 버전 → 1.22.20 | 1 |
| `versions.json` | 변경 로그 | 2 |
| **총** | | **~55줄** |

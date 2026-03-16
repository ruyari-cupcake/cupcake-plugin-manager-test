# CPM v1.20.16 Bug Audit Report

**Date**: 2026-06-09 (updated 2026-06-10)  
**Scope**: Full fresh-from-scratch audit of CPM (Cupcake Provider Manager) v1.20.16  
**Method**: Cross-verification against RisuAI-main source code  
**Files Audited**: 13 files (provider-manager.js + 7 provider sub-plugins + 5 utility sub-plugins)  
**Status**: 7 priority bugs fixed, 3370/3370 tests passing (121 test files)

---

## Summary

| Category | Count | Critical | High | Medium | Low |
|----------|-------|----------|------|--------|-----|
| **A — Logic Errors** | 7 | 0 | 1 | 3 | 3 |
| **B — V3 API Mismatches** | 3 | 0 | 0 | 2 | 1 |
| **C — Edge Cases** | 10 | 0 | 0 | 4 | 6 |
| **Total** | **20** | **0** | **1** | **9** | **10** |

### Intentional Exclusions (per user directive)
- Gemini safety settings always using `OFF` instead of `BLOCK_NONE` — **intentional**
- Vertex Gemini 3 global endpoint forcing — **intentional**
- Sub-plugin sandbox/permission issues — **intentional**

---

## Category A: Logic Errors

### [BUG-A001] `checkStreamCapability` Phase 2 regex 800-char window — false positive detection
- **Severity**: HIGH
- **File**: `provider-manager.js` L3241
- **Description**: Phase 2 of stream capability detection regex-scans the `collectTransferables` function in the host page, but truncates at 800 characters:
  ```javascript
  const ctFnMatch = scriptContent.match(
    /function\s+collectTransferables\b[\s\S]{0,800}?return\s+transferables/
  );
  ```
  If the function body exceeds 800 chars, the regex may match without finding the `ReadableStream` reference (which could appear after char 800). This causes **false positive capability detection** — CPM believes streaming works when it doesn't, leading to broken stream responses.
- **Fix**: Increase the regex window to at least 2000 chars, or parse the entire function body.

---

### [BUG-A002] `formatToOpenAI` mergesys discards all system messages when no user/assistant messages exist
- **Severity**: MEDIUM
- **File**: `provider-manager.js` L938-944
- **Description**: When `config.mergesys` is true and ALL input messages are system role:
  ```javascript
  if (sysPrompt && newMsgs.length > 0) {
      newMsgs[0].content = sysPrompt + "\n\n" + ...;
  }
  msgs = newMsgs; // empty array — sysPrompt lost
  ```
  `newMsgs` is empty, so `sysPrompt` is accumulated but never preserved. The downstream filter then returns `{ success: false, content: 'No messages' }`.
- **Impact**: System-only conversations silently fail instead of being sent as a synthetic user message.
- **Fix**: Add `else if (sysPrompt) { newMsgs.push({ role: 'user', content: sysPrompt }); }` after the condition.

---

### [BUG-A003] `fetchCustom` continues request after deep-clone failure
- **Severity**: MEDIUM
- **File**: `provider-manager.js` L6181-6183
- **Description**: If `JSON.parse(JSON.stringify(body.messages))` fails (circular reference, non-serializable objects), the error is logged but processing continues with the original un-cloned messages:
  ```javascript
  try { body.messages = JSON.parse(JSON.stringify(body.messages)); }
  catch (e) { console.error('Deep-clone of messages failed:', ...); }
  // continues → JSON.stringify(body) will ALSO fail
  ```
  The subsequent `JSON.stringify(body)` will fail again, but now with a less helpful error message.
- **Fix**: Return `{ success: false, content: '[Cupcake PM] Message serialization failed' }` on clone failure.

---

### [BUG-A004] `fetchCustom` key rotation pool name collision
- **Severity**: MEDIUM
- **File**: `provider-manager.js` L6722
- **Description**: Inline key pool name uses `config.model`:
  ```javascript
  const _rotationPoolName = `_cpm_custom_inline_${config.model || 'unknown'}`;
  ```
  If two different custom model configurations use the same `config.model` string (e.g., both set to "gpt-4o"), they share the same key pool. Keys from one config could be used for the other, causing authentication failures.
- **Fix**: Use `config.uniqueId` or a combination of `config.url + config.model` for the pool name.

---

### [BUG-A005] `createSSEStream` silently swallows onComplete callback errors
- **Severity**: LOW
- **File**: `provider-manager.js` L2818, L2826, L2841
- **Description**: All three call sites wrap `onComplete()` in `try { ... } catch (_) { /* */ }` with empty catch blocks. If a downstream parser (e.g., thought signature extraction) throws, the error is silently eaten.
- **Fix**: Add `console.warn('[SSE] onComplete error:', _)` in catch blocks.

---

### [BUG-A006] All fetch strategies failure gives no diagnostic info
- **Severity**: LOW
- **File**: `provider-manager.js` ~L4042
- **Description**: When all 6 `smartNativeFetch` strategies fail, a generic error is thrown:
  ```javascript
  throw new Error(`[CupcakePM] All fetch strategies failed for ${url.substring(0, 60)}`);
  ```
  No record of which strategies were attempted or their individual errors.
- **Fix**: Accumulate strategy names and error snippets, include in the final error message.

---

### [BUG-A007] Unknown provider types get `hasFullSystemPrompt` flag unconditionally
- **Severity**: LOW
- **File**: `provider-manager.js` L1032-1040
- **Description**: Model registration assigns flag 6 (`hasFullSystemPrompt`) to all providers that are not Claude or Gemini:
  ```javascript
  if (isClaudeFamily) modelFlags.push(7);
  else if (isGeminiFamily) modelFlags.push(7, 9);
  else modelFlags.push(6); // ALL unknowns get hasFullSystemPrompt
  ```
  Custom providers or future providers that don't support full system prompts receive incorrect capability declarations to RisuAI.
- **Impact**: RisuAI may send full system prompts to providers that only support first-system-prompt or no system prompt at all.
- **Fix**: Default unknowns to [0, 8] only (minimal assumption), or add explicit detection for OpenAI-family before assigning flag 6.

---

## Category B: V3 API Mismatches

### [BUG-B001] `buildGeminiThinkingConfig` ignores thinking budget for Gemini 3 models
- **Severity**: MEDIUM
- **File**: `provider-manager.js` L1503-1530
- **RisuAI Reference**: `google.ts` L360-371
- **Description**: RisuAI translates a numeric `thinking_tokens` budget into a `thinkingLevel` string for Gemini 3 models:
  ```typescript
  // RisuAI google.ts
  if (/^gemini-3-/.test(internalId)) {
      if (budgetNum >= 16384) thinkingLevel = 'HIGH'
      else if (budgetNum >= 4096) thinkingLevel = 'MEDIUM'
      else thinkingLevel = 'LOW'
  }
  ```
  CPM's `buildGeminiThinkingConfig` only checks the `level` parameter for Gemini 3 and **ignores** the `budget` parameter entirely:
  ```javascript
  if (isGemini3) {
      if (level && level !== 'off' && level !== 'none') {
          return { includeThoughts: true, thinkingLevel: String(level).toUpperCase() };
      }
      return null; // budget completely ignored for Gemini 3
  }
  ```
  Users who set a thinking budget (number) but not a thinking level for Gemini 3 get **no thinking** at all.
- **Fix**: Add budget→level translation for Gemini 3 when `level` is not set, mirroring RisuAI's threshold mapping.

---

### [BUG-B002] OpenRouter reasoning parameter structure may diverge from API spec
- **Severity**: MEDIUM
- **File**: `cpm-provider-openrouter.js` L90-96
- **Description**: CPM sends reasoning config as a nested object:
  ```javascript
  body.reasoning = { effort: config.reasoning, max_tokens: reasoningMaxTokens };
  ```
  OpenAI-compatible APIs (which OpenRouter proxies) typically expect a flat `reasoning_effort` string. CPM's OpenAI sub-plugin correctly uses the flat format, but OpenRouter uses the nested format.
- **Impact**: If OpenRouter follows OpenAI spec, this nested structure may be silently ignored or cause errors.
- **Fix**: Verify against OpenRouter API documentation. If they follow OpenAI spec, switch to flat `reasoning_effort`.

---

### [BUG-B003] `formatToGemini` without `preserveSystem` diverges from RisuAI native behavior
- **Severity**: LOW
- **File**: `provider-manager.js` L1693-1700
- **RisuAI Reference**: `google.ts` L329
- **Description**: When `config.preserveSystem` is false (not the sub-plugin default), CPM merges system instructions into user message content with a "system: " prefix. RisuAI's native google.ts always uses the `systemInstruction` field natively.
- **Impact**: Minimal — sub-plugins default to `preserveSystem=true`. Only affects `fetchCustom` with Gemini format when preserveSystem is explicitly disabled.

---

## Category C: Edge Cases

### [BUG-C001] `smartNativeFetch` skips compat mode check for Copilot URLs
- **Severity**: MEDIUM
- **File**: `provider-manager.js` L3710-3755
- **Description**: Compatibility mode (Safari <16.4 ReadableStream transfer safety) is checked for Google/Vertex URLs but **not** for Copilot URLs:
  ```javascript
  // Google: compat mode check ✓
  if (_compatMode) { /* skip nativeFetch */ }
  // Copilot: NO compat check ✗
  if (_isCopilotUrl && Risu.nativeFetch) { /* always tries */ }
  ```
  Copilot streaming on Safari <16.4 may fail silently.
- **Fix**: Add compat mode check before Copilot nativeFetch attempt.

---

### [BUG-C002] `smartNativeFetch` AbortSignal loss on structured clone error
- **Severity**: MEDIUM
- **File**: `provider-manager.js` L3728-3737
- **Description**: When `AbortSignal` can't be structured-cloned (Safari iframe), signal is removed and replaced with `_raceWithAbortSignal()`. If the race implementation has timing issues, a cancelled request may still return a partial response that gets displayed.
- **Fix**: Verify `_raceWithAbortSignal` rejects immediately on signal.aborted; add logging when signal fallback activates.

---

### [BUG-C003] `createSSEStream` CRLF handling
- **Severity**: MEDIUM
- **File**: `provider-manager.js` L2830
- **Description**: Line splitting uses `\n` only:
  ```javascript
  const lines = buffer.split('\n');
  ```
  Some API servers send `\r\n` (CRLF). The trailing `\r` remains attached to line content, causing SSE parsers to fail on `data:` prefix matching.
- **Fix**: Use `buffer.split(/\r?\n/)` or strip `\r` before processing.

---

### [BUG-C004] `fetchCustom` 5MB streaming body warning without prevention
- **Severity**: MEDIUM
- **File**: `provider-manager.js` L6626
- **Description**: Bodies over 5MB are warned about but still sent through the V3 bridge, which may truncate data and cause "unexpected EOF" errors that are hard to diagnose.
- **Fix**: Either enforce a hard limit with user-visible error, or document the maximum supported body size clearly.

---

### [BUG-C005] Copilot token `expires_at` format assumption
- **Severity**: LOW-MEDIUM
- **File**: `provider-manager.js` L3488
- **Description**: Assumes `data.expires_at` is in seconds and multiplies by 1000:
  ```javascript
  const expiryMs = data.expires_at ? data.expires_at * 1000 : Date.now() + 1800000;
  ```
  If GitHub API returns milliseconds, token will appear valid ~1000× longer than intended, using expired credentials.
- **Fix**: Add format detection: `data.expires_at > 1e10 ? data.expires_at : data.expires_at * 1000`.

---

### [BUG-C006] `inferSlot` prompt truncation at 3000 chars
- **Severity**: LOW
- **File**: `provider-manager.js` L2190
- **Description**: Slot heuristic scoring only considers the first 3 messages + last 2 messages, truncated to 3000 chars. Long multi-turn conversations may be misclassified.
- **Impact**: Incorrect slot inference leads to wrong generation parameter overrides.

---

### [BUG-C007] `checkStreamCapability` MessageChannel port memory leak
- **Severity**: LOW
- **File**: `provider-manager.js` L3198-3258
- **Description**: If Phase 1's `mc1.port1.onmessage` fires after the 500ms timeout, the port and its stream reference are never cleaned up. The `_streamBridgeCapable` cache prevents re-detection but the leaked ports accumulate.
- **Fix**: Set `mc1.port1.onmessage = null` in the timeout handler.

---

### [BUG-C008] `fetchCustom` customParams blocklist incomplete
- **Severity**: LOW
- **File**: `provider-manager.js` L6285-6319
- **Description**: The `BLOCKED_FIELDS` array prevents user-supplied `customParams` from overwriting critical body fields, but misses some format-specific keys (e.g., `response_format`, certain tool-related fields).
- **Impact**: A malformed `customParams` could inadvertently override response format settings.

---

### [BUG-C009] `fetchCustom` temperature+top_p auto-retry only handles top_p deletion
- **Severity**: LOW
- **File**: `provider-manager.js` L6744-6750
- **Description**: On 400 error mentioning `temperature.*top_p`, only `top_p` is deleted for retry. If the API also rejects temperature alone, no further retry is attempted.
- **Fix**: Consider a second retry with temperature deletion if the first retry still fails with 400.

---

### [BUG-C010] AWS Bedrock forces temperature=1 when thinking enabled
- **Severity**: LOW (documented in code)
- **File**: `cpm-provider-aws.js` L281
- **Description**: User-set temperature is silently overridden to 1.0 when thinking is enabled on Bedrock. This is required by the Bedrock API but not communicated to the user.
- **Fix**: Add a user-visible log/toast: "Thinking mode requires temperature=1 on Bedrock".

---

## Cross-Verification Methodology

### RisuAI Source Files Examined
| File | Path | Compared With |
|------|------|---------------|
| `anthropic.ts` | `Risuai-main/src/ts/process/request/anthropic.ts` | `cpm-provider-anthropic.js`, `cpm-provider-vertex.js` (Claude path), `formatToAnthropic()` |
| `google.ts` | `Risuai-main/src/ts/process/request/google.ts` | `cpm-provider-gemini.js`, `cpm-provider-vertex.js` (Gemini path), `formatToGemini()`, `buildGeminiThinkingConfig()`, `getGeminiSafetySettings()` |
| `openai.ts` | `Risuai-main/src/ts/model/providers/openai.ts` | `cpm-provider-openai.js`, `formatToOpenAI()`, `needsDeveloperRole()` |
| `shared.ts` | `Risuai-main/src/ts/process/request/shared.ts` | `applyParameters()` mapping, parameter scaling |
| `request.ts` | `Risuai-main/src/ts/process/request/request.ts` | `requestPlugin()` flow, ProviderArguments interface |
| `v3.svelte.ts` | `Risuai-main/src/ts/plugins/apiV3/v3.svelte.ts` | `addProvider()` registration, sandbox bridge |
| `risuai.d.ts` | `risuai.d.ts` | V3 API type definitions |
| `plugins.svelte.ts` | `Risuai-main/src/ts/plugins/plugins.svelte.ts` | Plugin loading flow |

### Key Cross-Verification Findings
1. **Anthropic thinking**: CPM correctly implements dual-path (adaptive vs budget) aligned with RisuAI's `anthropic.ts` L363-387 ✓
2. **Anthropic cache_control**: CPM correctly applies ephemeral cache with optional 1h TTL, aligned with RisuAI ✓
3. **Anthropic beta headers**: CPM correctly adds `output-128k-2025-02-19` and `extended-cache-ttl-2025-04-11` ✓
4. **OpenAI developer role**: CPM's `needsDeveloperRole()` regex matches RisuAI's `DeveloperRole` flag assignment pattern ✓
5. **Gemini safety settings**: CPM always uses `OFF` — **intentional divergence** (not flagged per user directive)
6. **Gemini thinking**: CPM's Gemini 3 `thinkingLevel` path correct; missing budget→level translation noted as BUG-B001
7. **Gemini CIVIC_INTEGRITY**: CPM correctly strips for `noCivic` models, aligned with RisuAI's `noCivilIntegrity` flag ✓
8. **Parameter scaling**: RisuAI's `applyParameters()` pre-scales temperature/100 etc.; CPM receives already-scaled values ✓
9. **Vertex Claude**: System prompt caching, adaptive thinking, and beta headers all aligned with direct Anthropic implementation ✓
10. **AWS Bedrock global./us. prefix**: CPM's normalization matches RisuAI's `anthropic.ts` L413-428 logic ✓

---

## Recommended Priority

1. **BUG-A001** (HIGH) — `checkStreamCapability` false positive → broken streaming — **✅ FIXED**
2. **BUG-C003** (MEDIUM) — CRLF SSE parsing → broken responses from CRLF servers — **✅ FIXED**
3. **BUG-A002** (MEDIUM) — mergesys data loss → system-only conversations fail — **✅ FIXED**
4. **BUG-B001** (MEDIUM) — Gemini 3 budget ignored → thinking silently disabled — **✅ FIXED**
5. **BUG-C001** (MEDIUM) — Copilot compat mode → Safari streaming failures — **INTENTIONAL** (code comments L3772-3775: Copilot MUST use nativeFetch)
6. **BUG-A003** (MEDIUM) — deep-clone failure → unhelpful error messages — **✅ FIXED**
7. **BUG-A004** (MEDIUM) — key pool collision → authentication cross-contamination — **✅ FIXED**
8. **BUG-C004** (MEDIUM) — 5MB body → "unexpected EOF" errors — **✅ FIXED**

---

## Fix Details

### Applied Fixes (7 bugs, source + bundled)

| Bug | Source File | Fix Summary |
|-----|------------|-------------|
| BUG-A001 | `src/lib/stream-utils.js` | Regex window 800→3000 chars in `checkStreamCapability` Phase 2 |
| BUG-A002 | `src/lib/format-openai.js` | Added `else if (sysPrompt && newMsgs.length === 0)` → synthetic user message |
| BUG-A003 | `src/lib/fetch-custom.js` | Deep-clone failure returns `{ success: false }` error instead of continuing |
| BUG-A004 | `src/lib/fetch-custom.js` | Pool name includes URL: `${config.url}_${config.model}` |
| BUG-B001 | `src/lib/format-gemini.js` | Added budget→level translation for Gemini 3 (flash: 8192/2048, pro: 16384/4096 thresholds) |
| BUG-C003 | `src/lib/stream-builders.js` | `split('\n')` → `split(/\r?\n/)` in both `createSSEStream` and `createAnthropicSSEStream` |
| BUG-C004 | `src/lib/fetch-custom.js` | Added 10MB hard limit with user error, 5MB existing warning preserved |

### Test Results
- **New tests**: 39 tests in `tests/bugfix-audit-20260609.test.js` (ALL PASSING)
- **Pre-existing test corrections**: 9 tests updated to match correct behavior (Anthropic "System:" prefix capitalization, claude1HourCaching TTL, mergesys synthetic user)
- **Full suite**: 121 files, 3370 tests — **ALL PASSING**
- **Release artifacts**: dist/provider-manager.js, release-hashes.json, update-bundle.json synced

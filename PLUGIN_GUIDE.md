# Cupcake Provider Manager — Sub-Plugin Development Guide

> **Last Updated:** 2026-03-14  
> **CPM Version:** 1.20.6  
> **RisuAI Compatibility:** V3 (iframe-sandboxed plugins)

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Quick Start — Minimal Provider](#3-quick-start--minimal-provider)
4. [File Header (Metadata)](#4-file-header-metadata)
5. [CPM Global API Reference](#5-cpm-global-api-reference)
6. [registerProvider() — Full Spec](#6-registerprovider--full-spec)
7. [Message Formatting Helpers](#7-message-formatting-helpers)
8. [SSE Streaming Helpers](#8-sse-streaming-helpers)
9. [Settings Tab System](#9-settings-tab-system)
10. [Dynamic Model Fetching](#10-dynamic-model-fetching)
11. [Key Rotation (키 회전)](#11-key-rotation-키-회전)
12. [Utility Functions](#12-utility-functions)
13. [Non-Provider Extensions](#13-non-provider-extensions)
14. [Auxiliary Slot System](#14-auxiliary-slot-system)
15. [Settings Backup & Persistence](#15-settings-backup--persistence)
16. [Deployment & Update Workflow](#16-deployment--update-workflow)
17. [Security & Safety](#17-security--safety)
18. [Troubleshooting & Best Practices](#18-troubleshooting--best-practices)

---

## 1. Overview

**Cupcake Provider Manager (CPM)** is a RisuAI V3 plugin that acts as a _meta-framework_ for managing multiple AI provider backends (OpenAI, Anthropic, Gemini, Vertex AI, AWS Bedrock, DeepSeek, OpenRouter, GitHub Copilot, etc.) via **sub-plugins**.

Sub-plugins are standalone `.js` files that run inside CPM's execution context (which itself runs inside RisuAI's sandboxed iframe). Each sub-plugin can:

- **Register an AI provider** with models, a fetcher function, and a settings tab
- **Fetch dynamic model lists** from provider APIs
- **Add UI components** (like the Chat Input Resizer, Copilot Token Manager, Translation Cache Manager)
- **Use CPM helper functions** for message formatting, SSE parsing, key rotation, etc.
- **Leverage key rotation** for automatic failover across multiple API keys

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Provider Manager** (`provider-manager.js`) | The main CPM engine — handles routing, settings UI, update system, key rotation |
| **Sub-Plugin** (`cpm-*.js`) | A standalone JS file that registers providers/components via `window.CupcakePM` |
| **Update Bundle** (`update-bundle.json`) | A single JSON file containing all sub-plugin versions + embedded code, served via Vercel API |
| **Settings Tab** | Each provider can register a tab in CPM's settings panel |
| **Key Rotation** | Built-in multi-key rotation with automatic failover on 429/529/503 errors |
| **Auxiliary Slots** | Per-task model routing (translation, emotion, memory, other) with parameter overrides |
| **Settings Backup** | Automatic persistence to `pluginStorage` — survives plugin reinstalls |
| **Hot-Reload** | Sub-plugins can be updated and reloaded without restarting RisuAI |

---

## 2. Architecture

```
RisuAI V3 App
  └─ iframe (about:srcdoc, sandboxed)
       └─ provider-manager.js (CPM v1.20.6 engine)
            ├─ window.CupcakePM API exposed
            ├─ KeyPool (key rotation engine)
            ├─ SettingsBackup (pluginStorage persistence)
            ├─ SubPluginManager loads installed sub-plugins
            │   ├─ cpm-provider-openai.js
            │   ├─ cpm-provider-anthropic.js
            │   ├─ cpm-provider-gemini.js
            │   ├─ cpm-provider-vertex.js
            │   ├─ cpm-provider-aws.js
            │   ├─ cpm-provider-deepseek.js
            │   ├─ cpm-provider-openrouter.js
            │   ├─ cpm-copilot-manager.js
            │   ├─ cpm-chat-resizer.js
            │   ├─ cpm-chat-navigation.js
            │   ├─ cpm-translation-cache.js
            │   └─ ... (executed via CSP nonce-based <script> tag)
            ├─ handleRequest() routes to correct fetcher
            │   ├─ inferSlot() → aux slot parameter overrides
            │   └─ fetchByProviderId() → customFetchers[provider] or fetchCustom()
            └─ Settings UI renders all registered tabs
```

### Data Flow

1. RisuAI calls `addProvider` callback with `(args, abortSignal)` — the `modelDef` is captured via closure
2. CPM's `handleRequest()` infers the **slot** (translation / emotion / memory / other / chat) from CPM's own slot configuration
3. If the model is assigned to an aux slot, generation parameter overrides are applied
4. `fetchByProviderId()` routes to `customFetchers[provider]` (registered by sub-plugin) or `fetchCustom()` for Custom Models
5. Sub-plugin's `fetcher(modelDef, messages, temp, maxTokens, args, abortSignal)` is called
6. Sub-plugin fetches the API, returns `{ success, content }` (string or ReadableStream)
7. **Important:** `handleRequest()` always collects ReadableStream into a plain string before returning to RisuAI

### Message Sanitization Pipeline

Messages pass through multiple sanitization stages before reaching the API:

```
RisuAI args.prompt_chat
  → sanitizeMessages() [null filter, tag strip, role validation]
    → formatToOpenAI/Anthropic/Gemini() [role normalization, multimodal handling]
      → final .filter(m => m != null) [safety net]
        → safeStringify() + sanitizeBodyJSON() [JSON serialization safety]
          → smartNativeFetch() body re-sanitization [before network call]
```

---

## 3. Quick Start — Minimal Provider

The simplest possible provider sub-plugin:

```javascript
// @name CPM Provider - MyProvider
// @version 1.0.0
// @description My custom provider for Cupcake PM
// @icon 🔵
// @update-url https://raw.githubusercontent.com/YOUR_USER/YOUR_REPO/main/cpm-provider-myprovider.js

(() => {
    const CPM = window.CupcakePM;
    if (!CPM) { console.error('[CPM-MyProvider] CupcakePM API not found!'); return; }

    CPM.registerProvider({
        name: 'MyProvider',

        // Static model list
        models: [
            { uniqueId: 'myprovider-model-a', id: 'model-a', name: 'Model A' },
            { uniqueId: 'myprovider-model-b', id: 'model-b', name: 'Model B' },
        ],

        // Core fetcher — called when user sends a message with this provider's model
        fetcher: async function (modelDef, messages, temp, maxTokens, args, abortSignal) {
            // Use key rotation for automatic retry on rate limits
            const doFetch = async (apiKey) => {
                const formattedMessages = CPM.formatToOpenAI(messages);

                const body = {
                    model: modelDef.id,
                    messages: formattedMessages.filter(m => m != null),
                    temperature: temp,
                    max_tokens: maxTokens,
                    stream: true,
                };

                const fetchFn = typeof CPM.smartNativeFetch === 'function'
                    ? CPM.smartNativeFetch : Risuai.nativeFetch;
                const res = await fetchFn('https://api.myprovider.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify(body),
                });

                if (!res.ok) {
                    return {
                        success: false,
                        content: `[MyProvider Error ${res.status}] ${await res.text()}`,
                        _status: res.status  // Required for key rotation to detect retryable errors
                    };
                }

                return { success: true, content: CPM.createSSEStream(res, CPM.parseOpenAISSELine, abortSignal) };
            };

            // withKeyRotation: automatic retry on 429/529/503 with key pool
            if (typeof CPM.withKeyRotation === 'function') {
                return CPM.withKeyRotation('cpm_myprovider_key', doFetch);
            }
            const fallbackKey = await CPM.safeGetArg('cpm_myprovider_key');
            return doFetch(fallbackKey);
        },

        // Dynamic model fetching from the API
        fetchDynamicModels: async () => {
            try {
                const key = typeof CPM.pickKey === 'function'
                    ? await CPM.pickKey('cpm_myprovider_key')
                    : await CPM.safeGetArg('cpm_myprovider_key');
                if (!key) return null;

                const res = await CPM.smartFetch('https://api.myprovider.com/v1/models', {
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${key}` }
                });
                if (!res.ok) return null;

                const data = await res.json();
                return data.models.map(m => ({
                    uniqueId: `myprovider-${m.id}`,
                    id: m.id,
                    name: m.display_name || m.id
                }));
            } catch (e) {
                console.warn('[CPM-MyProvider] Dynamic model fetch error:', e);
                return null;
            }
        },

        // Settings tab in CPM settings panel
        settingsTab: {
            id: 'tab-myprovider',
            icon: '🔵',
            label: 'MyProvider',
            exportKeys: ['cpm_myprovider_key', 'cpm_dynamic_myprovider'],
            renderContent: async (renderInput, lists) => {
                return `
                    <h3 class="text-3xl font-bold text-blue-400 mb-6 pb-3 border-b border-gray-700">MyProvider Configuration</h3>
                    ${await renderInput('cpm_myprovider_key', 'API Key (여러 개 입력 시 공백/줄바꿈으로 구분, 자동 키회전)', 'password')}
                    ${await renderInput('cpm_dynamic_myprovider', '📡 서버에서 모델 목록 불러오기 (Fetch models from API)', 'checkbox')}
                `;
            }
        }
    });
})();
```

---

## 4. File Header (Metadata)

Every sub-plugin **must** include metadata comments at the top. CPM uses `extractMetadata()` to parse these:

```javascript
// @name CPM Provider - MyProvider       // REQUIRED: Display name (must match versions.json key)
// @version 1.0.0                        // REQUIRED: Semver version string
// @description Short description        // Optional: Shown in sub-plugin manager
// @icon 🔵                              // Optional: Emoji icon for sidebar
// @update-url https://raw.git...        // REQUIRED: URL for update system
```

| Tag | Required | Description |
|-----|----------|-------------|
| `@name` | ✅ | Must exactly match the key used in `versions.json` |
| `@version` | ✅ | Semver string (e.g., `1.2.3`). Used for update comparison |
| `@description` | ❌ | Brief description shown in Sub-Plugin Manager tab |
| `@icon` | ❌ | Single emoji, shown in sidebar. Default: `📦` |
| `@update-url` | ✅ | Raw URL to the `.js` file (used as install source key) |

Also supported: `@display-name`, `@api`, `@author` (informational only).

---

## 5. CPM Global API Reference

All sub-plugins access CPM through `window.CupcakePM`:

```javascript
const CPM = window.CupcakePM;
```

### Core Registration

| API | Type | Description |
|-----|------|-------------|
| `CPM.registerProvider(config)` | Function | Register a provider (see §6) |

### Message Formatting

| API | Type | Description |
|-----|------|-------------|
| `CPM.formatToOpenAI(messages, config?)` | Function | Format messages for OpenAI API (see §7) |
| `CPM.formatToAnthropic(messages, config?)` | Function | Format messages for Anthropic API (see §7) |
| `CPM.formatToGemini(messages, config?)` | Function | Format messages for Gemini API (see §7) |
| `CPM.buildGeminiThinkingConfig(model, level, budget?)` | Function | Build Gemini thinkingConfig (3+ vs 2.5) |
| `CPM.getGeminiSafetySettings()` | Function | Get Gemini safety settings from user config |
| `CPM.validateGeminiParams()` | Function | Validate Gemini API parameters before request |
| `CPM.isExperimentalGeminiModel(modelId)` | Function | Check if a Gemini model is experimental (Gemma, LearnLM, etc.) |
| `CPM.cleanExperimentalModelParams(body)` | Function | Remove unsupported params for experimental Gemini models |

### SSE Streaming

| API | Type | Description |
|-----|------|-------------|
| `CPM.createSSEStream(response, lineParser, abortSignal?)` | Function | Create SSE ReadableStream (see §8) |
| `CPM.createOpenAISSEStream(response, abortSignal?)` | Function | Pre-built OpenAI SSE stream with reasoning support |
| `CPM.createResponsesAPISSEStream(response, abortSignal?)` | Function | OpenAI Responses API SSE stream (NEW in v1.15+) |
| `CPM.parseOpenAISSELine(line)` | Function | Parse OpenAI SSE `data:` line → delta text |
| `CPM.createAnthropicSSEStream(response, abortSignal?)` | Function | Create Anthropic SSE stream (handles event types) |
| `CPM.parseGeminiSSELine(line, config?)` | Function | Parse Gemini SSE line → delta text |
| `CPM.collectStream(stream)` | Function | Collect a ReadableStream\<string\> into a single string |
| `CPM.saveThoughtSignatureFromStream(stream)` | Function | Save thought signature from streaming response for Gemini |
| `CPM.ThoughtSignatureCache` | Object | Read-only accessor for cached thought signatures |

### Non-Streaming Response Parsers

| API | Type | Description |
|-----|------|-------------|
| `CPM.parseOpenAINonStreamingResponse(json)` | Function | Extract text from OpenAI non-streaming response |
| `CPM.parseResponsesAPINonStreamingResponse(json)` | Function | Extract text from Responses API non-streaming response |
| `CPM.parseClaudeNonStreamingResponse(json)` | Function | Extract text from Anthropic non-streaming response |
| `CPM.parseGeminiNonStreamingResponse(json)` | Function | Extract text from Gemini non-streaming response |

### Key Rotation

| API | Type | Description |
|-----|------|-------------|
| `CPM.pickKey(argName)` | Async Function | Pick a random key from whitespace-separated key pool |
| `CPM.drainKey(argName, failedKey)` | Function | Remove a failed key from pool, returns remaining count |
| `CPM.keyPoolRemaining(argName)` | Function | Get remaining key count in pool |
| `CPM.resetKeyPool(argName)` | Function | Force re-parse keys from settings on next pick |
| `CPM.withKeyRotation(argName, fetchFn, opts?)` | Async Function | Auto-retry with key rotation on 429/529/503 (see §11) |
| `CPM.pickJsonKey(argName)` | Async Function | Pick a random JSON credential from pool (for Vertex etc.) |
| `CPM.withJsonKeyRotation(argName, fetchFn, opts?)` | Async Function | JSON credential rotation with auto-retry (see §11) |

### Settings & Arguments

| API | Type | Description |
|-----|------|-------------|
| `CPM.safeGetArg(key, defaultValue?)` | Async Function | Read a plugin argument safely |
| `CPM.safeGetBoolArg(key, defaultValue?)` | Async Function | Read a boolean plugin argument |
| `CPM.setArg(key, value)` | Function | Write a plugin argument (also updates backup) |

### Networking

| API | Type | Description |
|-----|------|-------------|
| `CPM.smartFetch(url, options?)` | Async Function | 3-strategy fetch: direct → nativeFetch → risuFetch |
| `CPM.smartNativeFetch(url, options?)` | Async Function | Alias for `smartFetch` — for streaming use |
| `CPM.checkStreamCapability()` | Async Function | Test if ReadableStream can cross iframe bridge |

### Custom Models

| API | Type | Description |
|-----|------|-------------|
| `CPM.addCustomModel(modelDef, tag?)` | Function | Programmatically add a Custom Model |

### Copilot & Cloud Auth

| API | Type | Description |
|-----|------|-------------|
| `CPM.ensureCopilotApiToken()` | Async Function | Exchange GitHub OAuth for Copilot API token |
| `CPM.AwsV4Signer` | Class | AWS Signature V4 signer (for Bedrock) |
| `CPM.vertexTokenCache` | Object | Shared Vertex AI OAuth token cache `{ token, expiry }` |

### Hot-Reload & Lifecycle

| API | Type | Description |
|-----|------|-------------|
| `CPM.hotReload(pluginId)` | Function | Hot-reload a specific sub-plugin |
| `CPM.hotReloadAll()` | Function | Hot-reload all sub-plugins |
| `CPM.registerCleanup(cleanupFn)` | Function | Register a cleanup hook for unload/hot-reload (called automatically) |
| `CPM.isStreamingAvailable()` | Async Function | Returns `{ enabled, bridgeCapable, active }` streaming status |

### Utility

| API | Type | Description |
|-----|------|-------------|
| `CPM.safeUUID()` | Function | Generate a cryptographically random UUID (fallback to Math.random) |
| `CPM._needsCopilotResponsesAPI(model)` | Function | Check if model requires OpenAI Responses API (gpt-4.1+, o-series) |
| `CPM._normalizeTokenUsage(raw)` | Function | Normalize token usage from various provider formats |

### RisuAI APIs Available in Context

Since sub-plugins run inside CPM's iframe, you also have access to:

| API | Description |
|-----|-------------|
| `Risuai.nativeFetch(url, options)` | Cross-origin fetch via RisuAI's native bridge |
| `Risuai.risuFetch(url, options)` | RisuAI fetch with special modes (plainFetchForce, etc.) |
| `risuai.setArgument(key, value)` | Persist a plugin argument |
| `Risuai.getArgument(key)` | Read a plugin argument (note: capital `R`) |
| `risuai.pluginStorage` | `.getItem(key)` / `.setItem(key, value)` for persistent storage |
| `risuai.showContainer(mode)` | Show the plugin container (`'fullscreen'`, etc.) |
| `risuai.hideContainer()` | Hide the plugin container |
| `risuai.registerSetting(label, callback, icon, type)` | Register a settings button in RisuAI |
| `risuai.getRootDocument()` | Get the host page's document (SafeElement) |

---

## 6. registerProvider() — Full Spec

```javascript
CPM.registerProvider({
    name,              // string — Provider display name (used as routing key)
    models,            // Array<ModelDef> — Static model list
    fetcher,           // async function — Core request handler
    settingsTab,       // Object — Settings tab configuration (optional)
    fetchDynamicModels // async function — Optional dynamic model fetching
});
```

### 6.1 `name` (string, required)

The provider name. This is used as:
- The routing key in `customFetchers[name]`
- The `provider` field on each model definition
- Display label in the model dropdown: `🧁 [ProviderName] ModelName`

### 6.2 `models` (Array, required)

Static model list. Each model object:

```javascript
{
    uniqueId: 'provider-model-id',  // Globally unique ID (prefix with provider name)
    id: 'model-id',                 // API model identifier (sent to the API)
    name: 'Display Name'            // Human-readable name shown in UI
}
```

**Important:** `uniqueId` must be globally unique across all providers. Convention: `{provider}-{model-id}`.

Models appear in RisuAI's provider dropdown as: `🧁 [ProviderName] Display Name`

### 6.3 `fetcher` (async function, required)

The core request handler. Called when a user sends a message with one of this provider's models.

```javascript
async function fetcher(modelDef, messages, temp, maxTokens, args, abortSignal) {
    // modelDef   — { uniqueId, id, name, provider } — the selected model
    // messages   — Array<{role, content, multimodals?}> — pre-sanitized by CPM
    // temp       — number — temperature (0.0–2.0)
    // maxTokens  — number — max output tokens
    // args       — object — raw RisuAI PluginV2ProviderArgument
    //                        (prompt_chat, mode, top_p, frequency_penalty, presence_penalty, etc.)
    // abortSignal — AbortSignal|undefined — can't be passed to nativeFetch (iframe bridge limitation)

    // Must return: { success: boolean, content: string | ReadableStream<string>, _status?: number }
}
```

**Return format:**
- `{ success: true, content: ReadableStream }` — Streaming response
- `{ success: true, content: "full text" }` — Non-streaming response  
- `{ success: false, content: "[Error] message", _status: 429 }` — Error with HTTP status

> **⚠️ `_status` field:** When using key rotation (`CPM.withKeyRotation`), you **must** include `_status: res.status` in error results. This allows the key rotation engine to detect retryable errors (429, 529, 503) and automatically try another key.

> **⚠️ Stream Collection:** Even if a sub-plugin returns a `ReadableStream`, CPM's `handleRequest()` **always collects it into a plain string** before returning to RisuAI. This is because RisuAI's V3 bridge cannot reliably transfer ReadableStream, and `translateLLM` rejects streaming responses. Chat responses appear all at once (no progressive streaming), which is expected behavior.

**Important notes:**
- `messages` are already sanitized by CPM (null filtering, internal tag stripping via `stripInternalTags`)
- `abortSignal` cannot be passed to `Risuai.nativeFetch()` — AbortSignal can't be cloned via `postMessage` (structured clone limitation). Check `abortSignal.aborted` in loops or use the stream's cancel mechanism.
- Use `CPM.formatToOpenAI(messages)` etc. to convert messages to API-specific format
- Use `CPM.smartNativeFetch` instead of `Risuai.nativeFetch` for automatic 3-strategy fallback
- Always add a final `.filter(m => m != null)` to formatted messages before `JSON.stringify`

### 6.4 `settingsTab` (Object, optional)

Registers a tab in CPM's settings panel:

```javascript
{
    id: 'tab-myprovider',        // Unique tab ID
    icon: '🔵',                   // Emoji icon for sidebar button
    label: 'MyProvider',          // Sidebar label text
    exportKeys: ['cpm_key1', 'cpm_key2'],  // Keys included in settings export/import
    renderContent: async (renderInput, lists) => {
        // renderInput — async helper to render form inputs
        // lists — { reasoningList, verbosityList, thinkingList } — common option lists
        return `<h3>My Settings</h3>...`;
    }
}
```

See [§9 Settings Tab System](#9-settings-tab-system) for full details.

### 6.5 `fetchDynamicModels` (async function, optional)

If provided, CPM calls this to fetch the live model list from the provider's API:

```javascript
async function fetchDynamicModels() {
    // Return Array<{uniqueId, id, name}> or null on failure
}
```

This is gated by a per-provider checkbox: `cpm_dynamic_{providerName.toLowerCase()}`. Only runs when the user explicitly enables it.

### 6.6 Hot-Reload Tracking

CPM automatically tracks which sub-plugin registered each provider. When a sub-plugin is hot-reloaded:

1. **Unload** — All providers, tabs, and fetchers registered by that plugin are removed
2. **Re-execute** — The plugin code is re-evaluated
3. **Re-fetch dynamic models** — For any newly registered providers with dynamic fetching enabled

This means sub-plugins **do not** need to manually handle cleanup — CPM tracks registrations via `_currentExecutingPluginId`.

However, for **custom cleanup** (e.g., removing global event listeners, clearing intervals), use `registerCleanup`:

```javascript
CPM.registerCleanup(() => {
    clearInterval(myPollingInterval);
    window.removeEventListener('message', myHandler);
});
```

This hook is called automatically during unload or hot-reload.

---

## 7. Message Formatting Helpers

CPM provides pre-built formatters that handle:
- Null/invalid message filtering (via `sanitizeMessages()`)
- Internal RisuAI tag stripping (`{{inlay::...}}`, `{{inlayed::...}}`, `<qak>`)
- Role normalization (`model` → `assistant`, `char` → `assistant`)
- Multimodal content (images, audio)
- System message merging

### 7.1 `formatToOpenAI(messages, config?)`

Formats messages for OpenAI-compatible APIs.

```javascript
const formatted = CPM.formatToOpenAI(messages, {
    mergesys: false,    // Merge all system messages into first user message
    mustuser: false,    // Ensure first message is user/system role
    altrole: false,     // Replace 'assistant' with 'model' (for Gemini-like)
    sysfirst: false,    // Move first system message to position 0
});
// Returns: Array<{role, content, name?}>
```

**Role normalization order:**
1. `model` / `char` → `assistant` (always, before other processing)
2. If `config.altrole` is true: `assistant` → `model` (for Gemini-style APIs)

**Handles multimodals:** If a message has `multimodals` array (images/audio), converts to OpenAI vision/audio format:
```javascript
// Image:
{ type: 'image_url', image_url: { url: 'data:...' } }
// Audio:
{ type: 'input_audio', input_audio: { data: '<base64>', format: 'wav' | 'mp3' } }
```

### 7.2 `formatToAnthropic(messages, config?)`

Formats for Anthropic's Messages API format.

```javascript
const { messages: formattedMsgs, system: systemPrompt } = CPM.formatToAnthropic(messages);
// messages — Array<{role: 'user'|'assistant', content}> (consecutive same-role merged)
// system   — string (all system messages concatenated)
```

Ensures:
- First message is always `user` role (prepends `(Continue)` if needed)
- Consecutive same-role messages are merged with `\n\n`
- System messages extracted to separate `system` field

### 7.3 `formatToGemini(messages, config?)`

Formats for Google Gemini API format.

```javascript
const { contents, systemInstruction } = CPM.formatToGemini(messages, {
    preserveSystem: false  // If true, keep system as separate systemInstruction
});
// contents — Array<{role: 'user'|'model', parts: [{text}]}>
// systemInstruction — Array<string>
```

**Default behavior (`preserveSystem: false`):** Merges system instructions into the first user message's parts wrapped in `[System Content]...[/System Content]`, then **empties** the `systemInstruction` array. So when using the default, `systemInstruction` will be an empty array.

**With `preserveSystem: true`:** System messages are kept in the `systemInstruction` array and NOT merged into contents.

### 7.4 `buildGeminiThinkingConfig(model, level, budget?)`

Builds the appropriate `thinkingConfig` object based on model version:

```javascript
const thinkingConfig = CPM.buildGeminiThinkingConfig('gemini-3-pro-preview', 'HIGH');
// Gemini 3+:   { thinkMode: 'HIGH' }

const thinkingConfig = CPM.buildGeminiThinkingConfig('gemini-2.5-flash', 'MEDIUM');
// Gemini 2.5:  { thinkingBudget: 10240 }

const thinkingConfig = CPM.buildGeminiThinkingConfig('gemini-2.5-flash', null, 8000);
// Explicit:    { thinkingBudget: 8000 }
```

**Gemini 3+ models:** Uses `thinkMode` (level strings: `MINIMAL`, `LOW`, `MEDIUM`, `HIGH`)  
**Gemini 2.5 models:** Uses `thinkingBudget` (numeric token count), with level-to-budget mapping:

| Level | Budget Tokens |
|-------|--------------|
| `MINIMAL` | 1024 |
| `LOW` | 4096 |
| `MEDIUM` | 10240 |
| `HIGH` | 24576 |

---

## 8. SSE Streaming Helpers

### 8.1 `createSSEStream(response, lineParser, abortSignal?)`

Generic SSE stream parser. Works with any SSE-format API.

```javascript
const stream = CPM.createSSEStream(response, (line) => {
    // line — raw SSE line (e.g., "data: {...}")
    // Return delta text string, or null to skip
    if (!line.startsWith('data:')) return null;
    const json = JSON.parse(line.slice(5).trim());
    return json.choices?.[0]?.delta?.content || null;
}, abortSignal);
// Returns: ReadableStream<string>
```

**Internal behavior:**
- Lines starting with `:` are skipped (SSE comments)
- Empty lines are skipped
- Remaining buffer is processed when stream ends
- Checks `abortSignal.aborted` on each pull iteration

### 8.2 `parseOpenAISSELine(line)`

Pre-built parser for OpenAI-compatible SSE:

```javascript
const stream = CPM.createSSEStream(res, CPM.parseOpenAISSELine, abortSignal);
```

Handles `data: [DONE]` termination. Works with: OpenAI, DeepSeek, OpenRouter, and any OpenAI-compatible endpoint.

### 8.3 `createOpenAISSEStream(response, abortSignal?)` *(NEW in v1.15+)*

Pre-built OpenAI SSE stream with reasoning/thinking block support:

```javascript
const stream = CPM.createOpenAISSEStream(res, abortSignal);
```

Automatically wraps `reasoning_content` deltas in `<Thoughts>` tags.

### 8.4 `createResponsesAPISSEStream(response, abortSignal?)` *(NEW in v1.15+)*

Pre-built SSE stream for OpenAI Responses API (used by gpt-4.1+, o-series models):

```javascript
const stream = CPM.createResponsesAPISSEStream(res, abortSignal);
```

Handles Responses API event types (`response.output_text.delta`, `response.reasoning_summary_text.delta`, etc.).

### 8.5 `createAnthropicSSEStream(response, abortSignal?)`

Pre-built Anthropic SSE stream (handles `event: content_block_delta` + `data: {...}` pairs):

```javascript
const stream = CPM.createAnthropicSSEStream(res, abortSignal);
```

Extracts `delta.text` from `content_block_delta` events only.

### 8.6 `parseGeminiSSELine(line, config?)`

Pre-built Gemini SSE parser:

```javascript
const stream = CPM.createSSEStream(res, (line) => CPM.parseGeminiSSELine(line, {
    showThoughtsToken: false,
    useThoughtSignature: false,
}), abortSignal);
```

Config options:
- `showThoughtsToken` — Include thought process text in output
- `useThoughtSignature` — Include thought signature in output

### 8.7 `collectStream(stream)`

Utility to collect a ReadableStream into a single string:

```javascript
const fullText = await CPM.collectStream(stream);
```

---

## 9. Settings Tab System

### 9.1 `renderContent(renderInput, lists)`

The `renderContent` function receives two arguments:

- **`renderInput`** — An async helper function for rendering form inputs
- **`lists`** — Common option lists: `{ reasoningList, verbosityList, thinkingList }`

### 9.2 `renderInput(id, label, type?, opts?)`

```javascript
await renderInput(id, label, type, opts)
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `id` | string | — | Argument key (persisted via `risuai.setArgument`) |
| `label` | string | — | Display label |
| `type` | string | `'text'` | Input type |
| `opts` | Array | `[]` | Options for `select` type |

**Supported types:**

| Type | Renders | Example |
|------|---------|---------|
| `'text'` | Text input | `renderInput('cpm_my_url', 'API URL')` |
| `'password'` | Password field with 👁️ toggle | `renderInput('cpm_my_key', 'API Key', 'password')` |
| `'number'` | Number input | `renderInput('cpm_my_budget', 'Token Budget', 'number')` |
| `'checkbox'` | Checkbox toggle | `renderInput('cpm_my_flag', 'Enable Feature', 'checkbox')` |
| `'select'` | Dropdown select | `renderInput('cpm_my_opt', 'Option', 'select', [{value: 'a', text: 'A'}])` |
| `'textarea'` | Multi-line text | `renderInput('cpm_my_params', 'Custom JSON', 'textarea')` |

**Password fields** now include a built-in visibility toggle button (👁️ / 🔒).

**Select options format:**
```javascript
[
    { value: '', text: 'None (Default)' },
    { value: 'low', text: 'Low' },
    { value: 'high', text: 'High' },
]
```

### 9.3 `exportKeys`

Array of argument keys to include in CPM's settings export/import feature:

```javascript
exportKeys: ['cpm_myprovider_key', 'cpm_myprovider_url', 'cpm_dynamic_myprovider']
```

These keys are also automatically included in the `SettingsBackup` system's snapshot.

### 9.4 Common Lists

The `lists` parameter provides pre-defined option arrays:

```javascript
renderContent: async (renderInput, lists) => {
    // lists.reasoningList — OpenAI reasoning effort: none/off/low/medium/high
    // lists.verbosityList — OpenAI verbosity: none/low/medium/high
    // lists.thinkingList  — Gemini thinking level: off/none/MINIMAL/LOW/MEDIUM/HIGH
    return `
        ${await renderInput('cpm_my_reasoning', 'Reasoning', 'select', lists.reasoningList)}
    `;
}
```

**Full list values:**

```javascript
reasoningList = [
    { value: 'none', text: 'None (없음)' },
    { value: 'off', text: 'Off (끄기)' },
    { value: 'low', text: 'Low (낮음)' },
    { value: 'medium', text: 'Medium (중간)' },
    { value: 'high', text: 'High (높음)' },
    { value: 'xhigh', text: 'XHigh (매우 높음)' }
];

verbosityList = [
    { value: 'none', text: 'None (기본값)' },
    { value: 'low', text: 'Low (낮음)' },
    { value: 'medium', text: 'Medium (중간)' },
    { value: 'high', text: 'High (높음)' }
];

thinkingList = [
    { value: 'off', text: 'Off (끄기)' },
    { value: 'none', text: 'None (없음)' },
    { value: 'MINIMAL', text: 'Minimal (최소)' },
    { value: 'LOW', text: 'Low (낮음)' },
    { value: 'MEDIUM', text: 'Medium (중간)' },
    { value: 'HIGH', text: 'High (높음)' }
];
```

---

## 10. Dynamic Model Fetching

### Purpose

Instead of hardcoding models, sub-plugins can fetch the live model list from the provider's API at runtime.

### Implementation

```javascript
fetchDynamicModels: async () => {
    try {
        // Use pickKey for key rotation support
        const key = typeof CPM.pickKey === 'function'
            ? await CPM.pickKey('cpm_myprovider_key')
            : await CPM.safeGetArg('cpm_myprovider_key');
        if (!key) return null;

        const res = await CPM.smartFetch('https://api.myprovider.com/v1/models', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${key}` }
        });
        if (!res.ok) return null;

        const data = await res.json();
        return data.models.map(m => ({
            uniqueId: `myprovider-${m.id}`,
            id: m.id,
            name: m.display_name || m.id
        }));
    } catch (e) {
        console.warn('[CPM-MyProvider] Dynamic model fetch error:', e);
        return null;
    }
}
```

### User Enable/Disable

Dynamic fetching is controlled by a per-provider checkbox. Add this to your settings tab:

```javascript
${await renderInput('cpm_dynamic_myprovider', '📡 서버에서 모델 목록 불러오기 (Fetch models from API)', 'checkbox')}
```

Include `'cpm_dynamic_myprovider'` in your `exportKeys`.

CPM checks `cpm_dynamic_{name.toLowerCase()}` — the name must match your provider's `name` field (lowercased).

### Behavior

When dynamic models are fetched successfully:
1. **All static models** for that provider are **removed** from `ALL_DEFINED_MODELS`
2. Dynamic models are added in their place
3. If dynamic fetch fails or returns null, **static models are preserved** as fallback

---

## 11. Key Rotation (키 회전)

CPM v1.20.6 includes a built-in **KeyPool** system for automatic multi-key rotation. Users can enter multiple API keys separated by whitespace/newlines in a single settings field.

### 11.1 Basic Key Rotation

```javascript
// In your fetcher:
const doFetch = async (apiKey) => {
    const res = await CPM.smartNativeFetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify(body)
    });
    if (!res.ok) {
        return {
            success: false,
            content: `[Error ${res.status}] ${await res.text()}`,
            _status: res.status  // REQUIRED for rotation to work
        };
    }
    return { success: true, content: CPM.createSSEStream(res, CPM.parseOpenAISSELine, abortSignal) };
};

// Use withKeyRotation for automatic retry
if (typeof CPM.withKeyRotation === 'function') {
    return CPM.withKeyRotation('cpm_myprovider_key', doFetch);
}
// Fallback for older CPM without key rotation
const fallbackKey = await CPM.safeGetArg('cpm_myprovider_key');
return doFetch(fallbackKey);
```

### 11.2 How Key Rotation Works

1. Keys are parsed from the setting string (whitespace/newline-separated)
2. A **random** key is picked from the pool for each request
3. On retryable errors (429, 529, 503), the failed key is **drained** from the pool
4. Another random key is picked and the request is retried
5. Max retries: 30 (default)
6. When all keys are exhausted, the pool is reset (re-parsed from settings)

### 11.3 `withKeyRotation(argName, fetchFn, opts?)`

```javascript
CPM.withKeyRotation(argName, fetchFn, opts?)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `argName` | string | Setting key containing whitespace-separated API keys |
| `fetchFn` | `async (key) => result` | Fetch function receiving a single key |
| `opts.maxRetries` | number | Max retry attempts (default: 30) |
| `opts.isRetryable` | `(result) => boolean` | Custom retryable error check (default: 429/529/503) |

The `fetchFn` must return objects with `_status` field for retryable error detection:
```javascript
{ success: false, content: "error message", _status: 429 }
```

### 11.4 JSON Credential Rotation (Vertex AI 등)

For providers that use JSON credentials (like Vertex AI service accounts), use JSON rotation:

```javascript
if (typeof CPM.withJsonKeyRotation === 'function') {
    return CPM.withJsonKeyRotation('cpm_vertex_key_json', async (credJson) => {
        const credential = JSON.parse(credJson);
        // Use credential to sign request...
        return doFetch(credential);
    });
}
```

JSON credentials can be entered as:
- Single JSON object: `{...}`
- Comma-separated: `{...},{...}`
- JSON array: `[{...},{...}]`
- Newline-separated: `{...}\n{...}`

### 11.5 Manual Key Pool API

For fine-grained control:

```javascript
const key = await CPM.pickKey('cpm_myprovider_key');     // Random key from pool
const remaining = CPM.drainKey('cpm_myprovider_key', failedKey); // Remove failed key
const count = CPM.keyPoolRemaining('cpm_myprovider_key'); // Check remaining
CPM.resetKeyPool('cpm_myprovider_key');                   // Force re-parse
```

---

## 12. Utility Functions

### 12.1 `safeGetArg(key, defaultValue?)`

Safely reads a plugin argument. Returns `defaultValue` (default: `''`) if the key doesn't exist or throws.

```javascript
const apiKey = await CPM.safeGetArg('cpm_myprovider_key');
const budget = await CPM.safeGetArg('cpm_myprovider_budget', '0');
```

### 12.2 `safeGetBoolArg(key, defaultValue?)`

Reads a boolean argument.
- Returns `true` if value is `'true'` or `true`
- Returns `false` if value is `'false'`, `false`, or `''`
- Returns `defaultValue` (default: `false`) for any other value or if key doesn't exist

```javascript
const enabled = await CPM.safeGetBoolArg('cpm_myprovider_caching');
const defaultOn = await CPM.safeGetBoolArg('cpm_myprovider_feature', true);
```

### 12.3 `setArg(key, value)`

Writes an argument value (always stringified). Also persists to the SettingsBackup:

```javascript
CPM.setArg('cpm_myprovider_model', 'gpt-4o');
```

### 12.4 `smartFetch(url, options?)`

Uses a 3-strategy fallback chain to maximize compatibility:

1. **Strategy 1:** Direct browser `fetch()` from iframe (fastest, avoids proxy)
2. **Strategy 2:** `Risuai.nativeFetch()` via proxy (bypasses CSP, supports streaming)
3. **Strategy 3:** `Risuai.risuFetch(plainFetchForce)` — direct fetch from HOST window (bypasses proxy region blocks)

**Automatic fallback triggers:**
- Strategy 1 failure: expected in V3 iframe sandbox (CSP blocks direct requests)
- Strategy 2 → 3: on 403/502/503 (proxy blocked by upstream API), 400 with `null-message corruption` or `location restriction`
- Strategy 3 failure: returns original proxy response as last resort

For POST requests, the body is automatically deep-sanitized before crossing the V3 bridge.

```javascript
const res = await CPM.smartFetch('https://api.example.com/models', {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${key}` }
});
```

**When to use `smartFetch` vs `Risuai.nativeFetch`:**
- `smartFetch` / `smartNativeFetch` — **Recommended for all API calls.** Handles proxy fallback automatically.
- `Risuai.nativeFetch` — Direct proxy call only. Use when you explicitly want proxy behavior.

### 12.5 `addCustomModel(modelDef, tag?)`

Programmatically add a model to CPM's Custom Models Manager:

```javascript
const result = CPM.addCustomModel({
    name: 'My Dynamic Model',
    model: 'model-id',
    url: 'https://api.example.com/v1/chat/completions',
    key: 'sk-...',
    format: 'openai'   // 'openai' | 'anthropic' | 'google'
}, 'my-plugin-tag');
// Returns: { success, created, uniqueId, error? }
```

Using the same `tag` for subsequent calls performs an **upsert** (update if exists).

### 12.6 `ensureCopilotApiToken()`

Exchanges a stored GitHub OAuth token for a short-lived Copilot API token (cached with expiry):

```javascript
const token = await CPM.ensureCopilotApiToken();
```

The token is cached and automatically refreshed 60 seconds before expiry.

### 12.7 `AwsV4Signer`

AWS Signature Version 4 signer class for AWS Bedrock API authentication. Used by `cpm-provider-aws.js`.

```javascript
const signer = new CPM.AwsV4Signer({
    method: 'POST',
    url: bedrockUrl,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    accessKeyId: awsKey,
    secretAccessKey: awsSecret,
    region: awsRegion,
    service: 'bedrock'
});
const signed = await signer.sign();
```

---

## 13. Non-Provider Extensions

Sub-plugins don't have to be providers. You can create UI components or utilities:

```javascript
// @name CPM Component - My Widget
// @version 1.0.0
// @description A utility widget
// @icon ⚙️
// @update-url https://...

(async () => {
    const risuai = window.risuai || window.Risuai;
    if (!risuai) return;

    // Register as a CupcakePM sub-plugin (for settings UI in the Sub-Plugins tab)
    window.CupcakePM_SubPlugins = window.CupcakePM_SubPlugins || [];
    window.CupcakePM_SubPlugins = window.CupcakePM_SubPlugins.filter(p => p.id !== 'my-widget');
    window.CupcakePM_SubPlugins.push({
        id: 'my-widget',
        name: 'My Widget',
        description: 'Does something useful',
        version: '1.0.0',
        icon: '⚙️',
        uiHtml: `<div>Widget settings HTML here</div>`,
        onRender: async (container, getArg, setVal) => {
            // Called when the Sub-Plugins tab is rendered/activated
            // container — the DOM element containing uiHtml
            // getArg — async function to read settings (same as safeGetArg)
            // setVal — function to write settings
            const checkbox = container.querySelector('#my_widget_enabled');
            if (checkbox) {
                const val = await getArg('my_widget_enabled');
                checkbox.checked = val === 'true';
                checkbox.addEventListener('change', () => setVal('my_widget_enabled', checkbox.checked));
            }
        }
    });

    // Your component logic here...
})();
```

### Sub-Plugin UI Registration Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier for this component |
| `name` | string | Display name |
| `description` | string | Short description |
| `version` | string | Version string |
| `icon` | string | Emoji icon |
| `uiHtml` | string | HTML string rendered in the Sub-Plugins tab |
| `onRender` | function | Callback for initializing UI interactions |

### Existing Non-Provider Sub-Plugins

| Sub-Plugin | Description |
|------------|-------------|
| **Chat Input Resizer** (`cpm-chat-resizer.js`) | Fullscreen text input overlay for mobile |
| **Chat Navigation** (`cpm-chat-navigation.js`) | 채팅 메시지 네비게이션 (4버튼 → 2버튼 → 키보드 → OFF 순환) |
| **Copilot Token Manager** (`cpm-copilot-manager.js`) | GitHub Copilot OAuth device flow, token management, model list, quota check |
| **Translation Cache Manager** (`cpm-translation-cache.js`) | Search/edit/manage RisuAI's LLM translation cache, user dictionary |

---

## 14. Auxiliary Slot System

CPM supports **auxiliary model slots** that allow routing specific tasks (translation, emotion, memory, other) to dedicated models with custom generation parameters.

### How It Works

1. User assigns a specific model to each aux slot in CPM settings (e.g., "Translation → GPT-5-nano")
2. When RisuAI calls the plugin, `inferSlot()` checks if the invoked model's `uniqueId` matches any slot configuration
3. If matched, generation parameter overrides are applied (max tokens, temperature, top_p, etc.)
4. If no slot matches, it's treated as main chat

### Slot Types

| Slot | Key Prefix | Purpose |
|------|-----------|---------|
| `translation` | `cpm_slot_translation` | Translation tasks |
| `emotion` | `cpm_slot_emotion` | Character emotion/reaction detection |
| `memory` | `cpm_slot_memory` | Memory summarization (Hypa) |
| `other` | `cpm_slot_other` | Lua scripts, triggers, utilities |

### Per-Slot Parameters

Each slot supports full generation parameter overrides:

| Setting Key | Parameter |
|------------|-----------|
| `cpm_slot_{slot}_max_context` | Max context tokens |
| `cpm_slot_{slot}_max_out` | Max output tokens |
| `cpm_slot_{slot}_temp` | Temperature |
| `cpm_slot_{slot}_top_p` | Top P |
| `cpm_slot_{slot}_top_k` | Top K |
| `cpm_slot_{slot}_rep_pen` | Repetition penalty |
| `cpm_slot_{slot}_freq_pen` | Frequency penalty |
| `cpm_slot_{slot}_pres_pen` | Presence penalty |

### Parameter Priority Order

1. **CPM slot override** (highest priority)
2. RisuAI separate params (파라미터 분리)
3. RisuAI main model params
4. **CPM global fallback** (`cpm_fallback_temp`, `cpm_fallback_max_tokens`, etc.)
5. Hardcoded defaults (Temperature 0.7)

> **Note:** V3 forces `args.mode = 'v3'`, so CPM cannot rely on mode for routing. Instead, slot inference compares the invoked model's `uniqueId` against CPM's own slot configuration.

---

## 15. Settings Backup & Persistence

CPM includes a `SettingsBackup` system that persists all settings to `risuai.pluginStorage`. This protects against settings loss when the main plugin is deleted and reinstalled.

### How It Works

1. On CPM initialization, `SettingsBackup.load()` reads the backup from `pluginStorage`
2. `restoreIfEmpty()` fills in any keys that are currently empty but have backup values
3. Every time settings are saved (via `setVal` in the settings UI), they are also written to the backup
4. Opening the settings panel triggers a `snapshotAll()` to capture the full state

### For Sub-Plugin Developers

Your `exportKeys` are automatically included in the backup snapshot. No additional code is needed to make your settings persistent.

If you need direct access to `pluginStorage`:
```javascript
// Read from persistent storage
const data = await risuai.pluginStorage.getItem('my_custom_data');
// Write to persistent storage
await risuai.pluginStorage.setItem('my_custom_data', JSON.stringify(myData));
```

---

## 16. Deployment & Update Workflow

### 16.1 Repository Structure

```
your-repo/
├── src/                           # ESM source modules (v1.20.6)
│   ├── index.js                   # Rollup entry point
│   ├── plugin-header.js           # RisuAI @arg declarations
│   ├── cpm-url.config.js          # Build-time URL config (test/production)
│   └── lib/                       # All core modules (30+)
├── dist/
│   └── provider-manager.js        # Built IIFE bundle
├── tests/                         # Vitest test files (30+)
├── styles/                        # Tailwind CSS source + generated
├── cpm-provider-openai.js         # OpenAI sub-plugin
├── cpm-provider-anthropic.js      # Anthropic sub-plugin
├── cpm-provider-gemini.js         # Gemini Studio sub-plugin
├── cpm-provider-vertex.js         # Vertex AI sub-plugin
├── cpm-provider-aws.js            # AWS Bedrock sub-plugin
├── cpm-provider-deepseek.js       # DeepSeek sub-plugin
├── cpm-provider-openrouter.js     # OpenRouter sub-plugin
├── cpm-copilot-manager.js         # GitHub Copilot Token Manager
├── cpm-chat-resizer.js            # Chat Input Resizer UI component
├── cpm-chat-navigation.js         # Chat Navigation UI component
├── cpm-translation-cache.js       # Translation Cache Manager
├── versions.json                  # Version manifest
├── update-bundle.json             # ⚠️ BUNDLED versions + code (auto-generated)
├── release-hashes.json            # SHA-256 manifest (auto-generated)
├── api/
│   ├── main-plugin.js             # Vercel serverless — main plugin download
│   ├── versions.js                # Vercel serverless — version manifest
│   └── update-bundle.js           # Vercel serverless — update bundle
├── scripts/
│   ├── build-production.cjs       # Cross-platform production build
│   ├── build-tailwind.cjs         # Tailwind CSS generation
│   ├── release.cjs                # Atomic release pipeline
│   └── verify-release-sync.cjs    # Release sync verification
├── vercel.json                    # Vercel routing config
├── rollup.config.mjs             # Rollup build config
├── vitest.config.js              # Vitest + coverage config
├── eslint.config.js              # ESLint 9 flat config
├── tsconfig.typecheck.json       # TypeScript checkJs config
└── PLUGIN_GUIDE.md               # This guide
```

### 16.2 versions.json

Maps plugin display names to version + filename:

```json
{
    "CPM Provider - OpenAI": {
        "version": "1.5.7",
        "file": "cpm-provider-openai.js"
    },
    "CPM Provider - Anthropic": {
        "version": "1.6.6",
        "file": "cpm-provider-anthropic.js"
    },
    "CPM Provider - Gemini Studio": {
        "version": "1.6.4",
        "file": "cpm-provider-gemini.js"
    },
    "CPM Provider - Vertex AI": {
        "version": "1.6.4",
        "file": "cpm-provider-vertex.js"
    },
    "CPM Provider - AWS Bedrock": {
        "version": "1.5.2",
        "file": "cpm-provider-aws.js"
    },
    "CPM Provider - DeepSeek": {
        "version": "1.4.5",
        "file": "cpm-provider-deepseek.js"
    },
    "CPM Provider - OpenRouter": {
        "version": "1.3.5",
        "file": "cpm-provider-openrouter.js"
    },
    "CPM Component - Chat Input Resizer": {
        "version": "0.3.6",
        "file": "cpm-chat-resizer.js"
    },
    "CPM Component - Copilot Token Manager": {
        "version": "1.7.2",
        "file": "cpm-copilot-manager.js"
    },
    "CPM Component - Translation Cache Manager": {
        "version": "1.3.2",
        "file": "cpm-translation-cache.js"
    },
    "CPM Component - Chat Navigation": {
        "version": "2.1.3",
        "file": "cpm-chat-navigation.js"
    },
    "Cupcake Provider Manager": {
        "version": "1.20.6",
        "file": "provider-manager.js"
    }
}
```

**The key (`@name`) must exactly match the `@name` metadata in the `.js` file.**

### 16.3 update-bundle.json

This is the **critical file** that the update system reads. It's a single JSON object combining versions (with SHA-256 integrity hashes) and embedded code:

```json
{
    "versions": {
        "CPM Provider - OpenAI": { "version": "1.5.7", "file": "cpm-provider-openai.js", "sha256": "abc123..." },
        "...": "..."
    },
    "code": {
        "cpm-provider-openai.js": "// @name CPM Provider - OpenAI\n// @version 1.5.7\n...(full file contents)...",
        "...": "..."
    }
}
```

The Vercel API routes (`/api/update-bundle`, `/api/main-plugin`) serve this file directly with CORS headers.

### 16.4 Rebuilding update-bundle.json

**⚠️ You MUST rebuild this file after every sub-plugin code change, or the update won't be detected by users.**

The recommended way is to use the integrated release pipeline:

```bash
node scripts/release.cjs
```

This single command performs the full pipeline:
1. Rollup build → `dist/provider-manager.js`
2. Copy dist → root (if changed)
3. Verify `versions.json` ↔ actual file header versions match
4. Regenerate `update-bundle.json` with SHA-256 hashes
5. Run full test suite
6. Produce `release-hashes.json` manifest

Alternatively, you can regenerate just the bundle with the standalone script:

```bash
node generate-bundle.cjs
```

### 16.5 Complete Update Checklist

When you update a sub-plugin, you must update **4 things**:

| Step | Action | File |
|------|--------|------|
| 1 | Update `@version` in the sub-plugin file header | `cpm-provider-xyz.js` |
| 2 | Update version number in `versions.json` | `versions.json` |
| 3 | **Run `node scripts/release.cjs`** to rebuild bundle + verify + test | `update-bundle.json`, `release-hashes.json` |
| 4 | Commit and push to GitHub | All changed files |

**Recommended:** Use `node scripts/release.cjs` which automates steps 2-3 verification and ensures all artifacts are in sync. If versions.json doesn't match the file headers, the release pipeline will abort with an error.

### 16.6 How the Update System Works

1. CPM's `checkAllUpdates()` calls `Risuai.risuFetch()` with `plainFetchForce: true` and a cache-busting parameter to fetch `/api/update-bundle` from Vercel
2. Vercel function reads `update-bundle.json` from disk and returns it with CORS headers + `Cache-Control: no-cache`
3. CPM compares local `plugin.version` against `bundle.versions[plugin.name].version` using semver comparison
4. If remote version is newer, the pre-fetched code from `bundle.code[file]` is available immediately
5. User clicks "Update" → `applyUpdate()` replaces the plugin code in storage and memory
6. **Hot-reload** is automatically triggered — the updated plugin takes effect immediately without refreshing

**Why a bundle?** RisuAI's iframe CSP blocks direct `fetch()`. `nativeFetch` goes through proxy2 which caches per-domain (cache poisoning). `risuFetch(plainFetchForce)` works but triggers CORS preflight on raw GitHub. The Vercel API route handles CORS properly, and bundling minimizes requests.

### 16.7 Main Engine (`provider-manager.js`) Updates

The `provider-manager.js` main engine has its own `@update-url` pointing to the Vercel API endpoint. The source contains the test2 URL (default build target):

```
//@update-url https://test-2-wheat-omega.vercel.app/api/main-plugin
```

At build time, `rollup.config.mjs` substitutes the URL based on `CPM_ENV`:
- **test2** (default): `test-2-wheat-omega.vercel.app`
- **test** (legacy — 사용 자제): `cupcake-plugin-manager-test.vercel.app`
- **production**: `cupcake-plugin-manager.vercel.app`

This is separate from the sub-plugin update bundle. RisuAI handles main engine updates via its native plugin update mechanism. To update the main engine:

1. Update source version fields (`package.json`, `src/plugin-header.js`, `src/lib/shared-state.js`) and `versions.json`
2. Run `node scripts/release.cjs` to regenerate `provider-manager.js`, `update-bundle.json`, and `release-hashes.json`
3. Push the synced artifacts
4. RisuAI will detect the new version on next plugin update check

### 16.8 Vercel API Route

The `api/update-bundle.js` serverless function (ESM):

```javascript
import { readFileSync } from 'fs';
import { join } from 'path';

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Range',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
};

export default function handler(req, res) {
    if (req.method === 'OPTIONS') {
        res.writeHead(204, CORS_HEADERS);
        res.end();
        return;
    }

    const bundlePath = join(process.cwd(), 'update-bundle.json');
    const data = readFileSync(bundlePath, 'utf-8');
    res.writeHead(200, {
        ...CORS_HEADERS,
        'Content-Type': 'application/json; charset=utf-8',
    });
    res.end(data);
}
```

---

## 17. Security & Safety

> **CPM은 RisuAI V3의 iframe 샌드박스 안에서 실행됩니다. 사용자의 시스템이나 브라우저 데이터에 접근할 수 없습니다.**

### 17.1 Nonce 기반 코드 실행과 안전성

CPM은 서브 플러그인을 로드하기 위해 **CSP nonce 기반 `<script>` 태그 주입**을 사용합니다 (`_executeViaScriptTag()` — `csp-exec.js`). 이전에 사용하던 `eval()` 대신 V3 호스트의 CSP 정책과 호환되는 방식으로 전환되었으며, sandbox 보안 경계를 탈출하지 않습니다.

#### RisuAI V3 다중 보안 레이어

| Layer | 보호 내용 |
|-------|----------|
| **iframe Sandbox** | `allow-same-origin` 미포함 → null origin. 호스트 DOM, 쿠키, localStorage 접근 불가 |
| **CSP** | `connect-src 'none'` → 직접 네트워크 요청(fetch, XHR, WebSocket) 전면 차단 |
| **RPC Bridge** | 모든 API 호출은 postMessage 기반 RPC Proxy를 통해 직렬화됨 (structured clone) |
| **Host API Restrictions** | URL 블랙리스트, SafeElement 래핑, mode 고정, 권한 검사 (getPluginPermission) 적용 |

#### Nonce 기반 `<script>` 실행이 안전한 이유

1. **iframe 내부 실행** — 서브 플러그인 코드는 이미 격리된 sandbox iframe 안에서 nonce가 부여된 `<script>` 태그로 실행됩니다. sandbox 탈출 경로를 열지 않습니다.
2. **CSP와 호환** — V3 호스트의 Content-Security-Policy nonce를 자동 추출 (`_extractNonce()`)하여 사용하므로 CSP 위반 없이 안전하게 실행됩니다.
3. **사용자 동의 기반** — 모든 서브 플러그인은 사용자가 직접 설치(파일 업로드 또는 업데이트 버튼 클릭)한 코드만 실행합니다.
4. **업데이트 안전장치** — 원격 코드의 `@name`이 대상 플러그인과 일치하지 않으면 업데이트가 차단되며, SHA-256 무결성 검증도 수행됩니다.
5. **타임아웃 보호** — `_executeViaScriptTag()`는 10초 타임아웃을 가지며, CSP 차단 등으로 스크립트가 실행되지 않으면 자동으로 에러를 발생시킵니다.

#### 서브 플러그인 코드 vs 일반 코드 비교

| 항목 | 서브 플러그인 (`<script nonce>`) | 일반 iframe 코드 |
|------|-------------------------------|----------------|
| 호스트 DOM 접근 | ❌ 불가 | ❌ 불가 |
| 호스트 localStorage | ❌ 불가 | ❌ 불가 |
| 직접 fetch() | ❌ CSP 차단 | ❌ CSP 차단 |
| window.parent 접근 | ❌ cross-origin 차단 | ❌ cross-origin 차단 |
| PM 로컬 변수 접근 | ✅ 가능 (window scope 공유) | ❌ 불가 |

> nonce `<script>` 코드가 일반 코드와 다른 점은 오직 PM의 window scope 접근이며, 이는 sandbox 외부로의 탈출이 아닌 **sandbox 내부에서의 권한 공유**입니다.

### 17.2 서브 플러그인 간 격리

서브 플러그인은 같은 iframe 내에서 실행되므로 상호 간 완전한 격리는 없습니다. 이는 설계 의도이며, 다음과 같이 완화됩니다:

- 모든 서브 플러그인은 **사용자가 직접 설치**한 것만 실행
- 이는 **RisuAI 플러그인 자체의 보안 수준과 동일** (RisuAI 플러그인도 nativeFetch로 외부 통신 가능)
- **브라우저 확장 프로그램의 보안 모델과 본질적으로 동일**한 수준

### 17.3 코드 신뢰 체인

| 입력 경로 | 설명 | 사용자 동의 |
|----------|------|-----------|
| 파일 업로드 | 사용자가 로컬 .js 파일을 직접 선택 | ✅ 명시적 동의 |
| Update Bundle | CPM Vercel API에서 버전 확인 후 다운로드 | ✅ "Update" 버튼 클릭 |
| 초기 설치 | RisuAI 플러그인 시스템을 통한 PM 자체 설치 | ✅ 사용자 설치 |

> 📄 보안 분석 히스토리: [Issue #4](https://github.com/ruyari-cupcake/cupcake-plugin-manager/issues/4) (초기 eval() 기반 → 현재 nonce 기반 `<script>` 전환)

---

## 18. Troubleshooting & Best Practices

### Common Issues

| Problem | Cause | Solution |
|---------|-------|----------|
| Sub-plugin updates not showing | `update-bundle.json` not rebuilt | Rebuild bundle (§16.4) |
| `CupcakePM API not found!` | Script running before CPM loads | Wrap in `(() => { ... })()` IIFE |
| `nativeFetch` returns cached data | proxy2 cache poisoning | Use `smartFetch` for all API calls |
| `AbortSignal could not be cloned` | AbortSignal can't cross iframe bridge | Don't pass `abortSignal` to `nativeFetch` |
| `Invalid service_tier argument` | Sending invalid/empty service_tier | Validate against known values (`flex`, `default`), skip empty |
| `max_tokens not supported` (newer OpenAI) | GPT-5 / o-series require `max_completion_tokens` | Detect model name: `/^(gpt-5\|o[1-9])/` → use `max_completion_tokens` |
| Null messages in API request | V3 iframe bridge JSON round-trip | Use `sanitizeMessages()` + `.filter(m => m != null)` |
| No progressive streaming in chat | `handleRequest()` always collects streams to strings | By design — needed for V3 bridge + translateLLM compatibility |
| Proxy 403 on Vertex AI / Google Cloud | nativeFetch proxy blocked by region | `smartFetch` auto-falls back to risuFetch (Strategy 3) |
| Proxy 400 with location error | proxy server in restricted region | `smartFetch` auto-falls back to Strategy 3 (user's real IP) |
| `@name` doesn't match versions.json | Name mismatch breaks update detection | Ensure exact string match |
| Key rotation not working | Missing `_status` in error result | Include `_status: res.status` in all error returns |
| All keys exhausted | All keys returned 429/529 | Pool auto-resets; add more keys or wait for rate limit reset |
| Settings lost after reinstall | `@arg` values wiped | Auto-restored from `SettingsBackup` on next load |
| Copilot API auth failure | OAuth token expired/invalid | Re-generate token via Copilot Token Manager |

### Best Practices

1. **Always sanitize messages** — Use `CPM.formatToOpenAI()` etc. instead of passing raw messages
2. **Use `safeGetArg` / `safeGetBoolArg`** — Never call `Risuai.getArgument()` directly (it throws on missing keys)
3. **Prefix setting keys** — Use `cpm_{provider}_` prefix to avoid conflicts (e.g., `cpm_openai_key`)
4. **Handle errors gracefully** — Return `{ success: false, content: "[Error] ...", _status: res.status }` instead of throwing
5. **Include `_status` in error results** — Required for key rotation to detect retryable errors
6. **Filter null messages** — Even after formatting, add a final `.filter(m => m != null)` before JSON.stringify
7. **Don't pass AbortSignal to nativeFetch** — It can't be cloned across the iframe bridge
8. **Use IIFE wrapper** — Always wrap sub-plugin code in `(() => { ... })()` to avoid polluting global scope
9. **Use `smartFetch` / `smartNativeFetch` for all API calls** — Handles proxy fallback and body sanitization automatically
10. **Use key rotation** — Wrap your fetch logic in `CPM.withKeyRotation()` for automatic failover
11. **Use `CPM.pickKey()` for dynamic model fetching** — Picks a random key from the pool for model list API calls
12. **Include dynamic fetch checkbox** — Let users opt-in to server model fetching via `cpm_dynamic_{name}`
13. **Rebuild the bundle** — After **any** code change, always rebuild `update-bundle.json` before pushing
14. **Streams are always collected** — Your fetcher can return ReadableStream, but CPM will collect it to a string before returning to RisuAI
15. **Use `exportKeys`** — List all your setting keys so they're included in export/import and automatic backup

### Fetcher Pattern: Complete Template

```javascript
fetcher: async function (modelDef, messages, temp, maxTokens, args, abortSignal) {
    const config = {
        url: await CPM.safeGetArg('cpm_myprovider_url'),
        model: await CPM.safeGetArg('cpm_myprovider_model') || modelDef.id,
        // ... provider-specific settings
    };

    const url = config.url || 'https://api.myprovider.com/v1/chat/completions';
    const formattedMessages = CPM.formatToOpenAI(messages, config);

    const doFetch = async (apiKey) => {
        const body = {
            model: config.model,
            messages: Array.isArray(formattedMessages)
                ? formattedMessages.filter(m => m != null && typeof m === 'object')
                : [],
            temperature: temp,
            max_tokens: maxTokens,
            stream: true,
        };

        // Apply optional params from args (passed through from RisuAI/slot overrides)
        if (args.top_p !== undefined && args.top_p !== null) body.top_p = args.top_p;
        if (args.frequency_penalty !== undefined) body.frequency_penalty = args.frequency_penalty;
        if (args.presence_penalty !== undefined) body.presence_penalty = args.presence_penalty;

        const fetchFn = typeof CPM.smartNativeFetch === 'function'
            ? CPM.smartNativeFetch : Risuai.nativeFetch;
        const res = await fetchFn(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            return {
                success: false,
                content: `[MyProvider Error ${res.status}] ${await res.text()}`,
                _status: res.status
            };
        }
        return {
            success: true,
            content: CPM.createSSEStream(res, CPM.parseOpenAISSELine, abortSignal)
        };
    };

    // Key rotation with fallback
    if (typeof CPM.withKeyRotation === 'function') {
        return CPM.withKeyRotation('cpm_myprovider_key', doFetch);
    }
    const fallbackKey = await CPM.safeGetArg('cpm_myprovider_key');
    return doFetch(fallbackKey);
},
```

### Version Naming Convention

Follow semantic versioning: `MAJOR.MINOR.PATCH`
- **MAJOR** — Breaking changes (API signature changes, etc.)
- **MINOR** — New features (new models, new settings, etc.)  
- **PATCH** — Bug fixes

---

## Appendix A: Current Sub-Plugin Registry

| Sub-Plugin | Version | Type | Description |
|------------|---------|------|-------------|
| CPM Provider - OpenAI | 1.5.7 | Provider | GPT-4.1, GPT-5, GPT-5.1, GPT-5.2, GPT-5.4, ChatGPT-4o, o-series; Key rotation, Service Tier |
| CPM Provider - Anthropic | 1.6.6 | Provider | Claude 4–4.6; Adaptive thinking, Prompt caching, Key rotation |
| CPM Provider - Gemini Studio | 1.6.4 | Provider | Gemini 2.5–3.1; Thinking config (thinkMode / thinkingBudget), Key rotation |
| CPM Provider - Vertex AI | 1.6.4 | Provider | Gemini via GCP; Service Account JSON auth, JSON key rotation |
| CPM Provider - AWS Bedrock | 1.5.2 | Provider | Claude/others via AWS; V4 signing, Key rotation |
| CPM Provider - DeepSeek | 1.4.5 | Provider | DeepSeek Chat/Reasoner; Key rotation |
| CPM Provider - OpenRouter | 1.3.5 | Provider | OpenRouter aggregator; Provider routing, Key rotation |
| CPM Component - Chat Input Resizer | 0.3.6 | UI | Fullscreen text input overlay for mobile |
| CPM Component - Chat Navigation | 2.1.3 | UI | 채팅 메시지 네비게이션 (4버튼 → 2버튼 → 키보드 → OFF 순환) |
| CPM Component - Copilot Token Manager | 1.7.2 | Utility | GitHub Copilot OAuth flow, Token/Quota management |
| CPM Component - Translation Cache Manager | 1.3.2 | Utility | Translation cache search/edit/dictionary |

## Appendix B: Complete Example — Anthropic Provider

See [`cpm-provider-anthropic.js`](cpm-provider-anthropic.js) for a full production example that demonstrates:
- Extended model list with date-versioned variants (Claude 4–4.5) and latest models (Claude 4.6)
- Anthropic-specific message formatting (`formatToAnthropic`)
- **Adaptive thinking** for Claude 4.6 models (`thinking.type: 'adaptive'` + `output_config.effort`)
- **Extended thinking** for Claude 4.5 and earlier (`thinking.type: 'enabled'` + `budget_tokens`)
- Prompt caching (`cache_control: { type: 'ephemeral' }`)
- Dynamic model fetching with API pagination (`has_more` / `last_id`)
- Full settings tab with multiple input types
- **Key rotation** with `CPM.withKeyRotation` and `_status` error reporting

## Appendix C: GitHub Copilot Integration

Custom Models with a `githubcopilot.com` URL get special treatment:

1. **Auto token exchange:** CPM automatically calls `ensureCopilotApiToken()` to get a short-lived API token
2. **Required headers:** `Copilot-Integration-Id`, `X-Request-Id`, `Editor-Version`, `Editor-Plugin-Version` are auto-attached
3. **Vision support:** If messages contain image content, `Copilot-Vision-Request: true` header is added
4. **Effort + Anthropic:** When `effort` is set on a Copilot custom model with `anthropic` format, the URL is auto-switched to `/v1/messages` and `anthropic-version` header is added

The **Copilot Token Manager** sub-plugin (`cpm-copilot-manager.js`) provides:
- GitHub OAuth Device Flow for initial token generation
- Token status checking (subscription, telemetry, features)
- Available model list query
- Quota / rate limit information
- Auto-configuration of Custom Models for Copilot

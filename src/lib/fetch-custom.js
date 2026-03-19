// @ts-check
/**
 * fetch-custom.js — Custom model API fetcher.
 * Handles all three formats (OpenAI, Anthropic, Google) with
 * streaming/non-streaming, Copilot integration, key rotation,
 * and Responses API support.
 */
import { safeGetArg, safeGetBoolArg } from './shared-state.js';
import { sanitizeMessages, sanitizeBodyJSON } from './sanitize.js';
import { safeStringify, hasNonEmptyMessageContent, hasAttachedMultimodals, safeUUID } from './helpers.js';
import { formatToOpenAI } from './format-openai.js';
import { formatToAnthropic } from './format-anthropic.js';
import { looksLikeServiceAccountJson, getVertexBearerToken } from './vertex-auth.js';
import {
    formatToGemini, buildGeminiThinkingConfig, getGeminiSafetySettings,
    validateGeminiParams, cleanExperimentalModelParams,
} from './format-gemini.js';
import {
    supportsOpenAIReasoningEffort, needsCopilotResponsesAPI,
    shouldStripOpenAISamplingParams, shouldStripGPT54SamplingForReasoning,
    needsDeveloperRole,
} from './model-helpers.js';
import {
    createSSEStream, createOpenAISSEStream, createResponsesAPISSEStream,
    createAnthropicSSEStream, saveThoughtSignatureFromStream,
} from './stream-builders.js';
import { parseGeminiSSELine } from './sse-parsers.js';
import {
    parseClaudeNonStreamingResponse, parseGeminiNonStreamingResponse,
    parseOpenAINonStreamingResponse, parseResponsesAPINonStreamingResponse,
} from './response-parsers.js';
import { smartNativeFetch } from './smart-fetch.js';
import { ensureCopilotApiToken } from './copilot-token.js';
import {
    getCopilotStaticHeaders,
    normalizeCopilotNodelessMode,
    shouldUseLegacyCopilotRequestHeaders,
} from './copilot-headers.js';
import { KeyPool } from './key-pool.js';
import { updateApiRequest as _updateApiRequest } from './api-request-log.js';

/** @param {number} ms */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Cached ReadableStream support flag.
 * Checked once — prevents double-request on environments (iOS Safari)
 * where streaming fetch succeeds but getReader() fails.
 * @type {boolean | null}
 */
let _readableStreamSupported = null;

/** @returns {boolean} */
function _checkReadableStreamSupport() {
    if (_readableStreamSupported !== null) return _readableStreamSupported;
    try {
        const _testRes = new Response(new ReadableStream());
        const _reader = _testRes.body?.getReader();
        if (_reader) { _reader.releaseLock(); _readableStreamSupported = true; }
        else { _readableStreamSupported = false; }
    } catch (_e) {
        _readableStreamSupported = false;
    }
    if (!_readableStreamSupported) {
        console.warn('[Cupcake PM] ReadableStream not supported in this environment — streaming will be auto-disabled for custom models.');
    }
    return _readableStreamSupported;
}

/** @param {any} headers */
function _parseRetryAfterMs(headers) {
    const raw = headers?.get?.('retry-after');
    if (!raw) return 0;
    const seconds = Number(raw);
    if (Number.isFinite(seconds) && seconds >= 0) {
        return Math.max(0, Math.floor(seconds * 1000));
    }
    const retryAt = Date.parse(raw);
    if (Number.isNaN(retryAt)) return 0;
    return Math.max(0, retryAt - Date.now());
}

/** @param {number} status */
function _isRetriableHttpStatus(status) {
    // 524 = Cloudflare timeout — retrying immediately won't help, skip it
    return status === 408 || status === 429 || (status >= 500 && status !== 524);
}

/**
 * @param {Record<string, any>} config
 * @param {any[]} messagesRaw
 * @param {number} temp
 * @param {number} maxTokens
 * @param {Record<string, any>} [args]
 * @param {AbortSignal} [abortSignal]
 * @param {string} [_reqId]
 */
export async function fetchCustom(config, messagesRaw, temp, maxTokens, args = {}, abortSignal, _reqId) {
    if (!config.url || !config.url.trim()) {
        return { success: false, content: '[Cupcake PM] Base URL is required. Configure it in PM settings.' };
    }
    const messages = sanitizeMessages(messagesRaw);
    const format = config.format || 'openai';
    let formattedMessages;
    let systemPrompt = '';

    if (format === 'anthropic') {
        const { messages: anthropicMsgs, system: anthropicSys } = formatToAnthropic(messages, config);
        formattedMessages = anthropicMsgs;
        systemPrompt = anthropicSys;
    } else if (format === 'google') {
        const { contents: geminiContents, systemInstruction: geminiSys } = formatToGemini(messages, {
            preserveSystem: config.preserveSystem !== false,
            ...config,
        });
        formattedMessages = geminiContents;
        systemPrompt = geminiSys.length > 0 ? geminiSys.join('\n\n') : '';
    } else {
        const modelId = String(config.model || '');
        config.developerRole = needsDeveloperRole(modelId);
        formattedMessages = formatToOpenAI(messages, config);
    }

    const _rawKeys = (config.key || '').trim();
    const _allKeys = _rawKeys.split(/\s+/).filter((/** @type {string} */ k) => k.length > 0);
    const _useKeyRotation = _allKeys.length > 1;
    const _keyPool = [..._allKeys];

    if (format === 'openai' && Array.isArray(formattedMessages)) {
        const _validOpenAIRoles = new Set(['system', 'user', 'assistant', 'tool', 'function', 'developer']);
        for (let _ri = 0; _ri < formattedMessages.length; _ri++) {
            const _fm = formattedMessages[_ri];
            if (_fm && typeof _fm.role === 'string' && !_validOpenAIRoles.has(_fm.role)) {
                const _oldRole = _fm.role;
                _fm.role = (_oldRole === 'model' || _oldRole === 'char') ? 'assistant' : 'user';
                console.warn(`[Cupcake PM] fetchCustom: normalized invalid OpenAI role '${_oldRole}' → '${_fm.role}' at index ${_ri}`);
            }
        }
    }

    // Safety: clamp maxTokens if custom model has maxOutputLimit set
    if (config.maxOutputLimit && config.maxOutputLimit > 0 && typeof maxTokens === 'number' && maxTokens > config.maxOutputLimit) {
        console.warn(`[CPM-Custom] max_tokens ${maxTokens} → clamped to ${config.maxOutputLimit} for ${config.model} (user limit)`);
        maxTokens = config.maxOutputLimit;
    }

    /** @type {any} */
    const body = { model: config.model, temperature: temp };

    const _needsMCT = (/** @type {string} */ model) => { if (!model) return false; return /(?:^|\/)(?:gpt-(?:4\.5|5)|o[1-9])/i.test(model); };
    if (format === 'openai' && _needsMCT(config.model)) {
        body.max_completion_tokens = maxTokens;
    } else {
        body.max_tokens = maxTokens;
    }
    if (args.top_p !== undefined && args.top_p !== null) body.top_p = args.top_p;
    if (args.top_k !== undefined && args.top_k !== null) body.top_k = args.top_k;
    if (args.frequency_penalty !== undefined && args.frequency_penalty !== null) body.frequency_penalty = args.frequency_penalty;
    if (args.presence_penalty !== undefined && args.presence_penalty !== null) body.presence_penalty = args.presence_penalty;
    if (args.min_p !== undefined && args.min_p !== null) body.min_p = args.min_p;
    if (format === 'openai' && args.repetition_penalty !== undefined && args.repetition_penalty !== null) {
        body.repetition_penalty = args.repetition_penalty;
    }

    // ── Anthropic format ──
    if (format === 'anthropic') {
        delete body.frequency_penalty; delete body.presence_penalty; delete body.min_p; delete body.top_k;
        body.messages = formattedMessages;
        if (systemPrompt) body.system = systemPrompt;
        if (args.top_k !== undefined && args.top_k !== null) body.top_k = args.top_k;

        const effortRaw = String(config.effort || '').trim().toLowerCase();
        const thinkingMode = String(config.thinking || config.thinking_level || '').trim().toLowerCase();
        const adaptiveToggle = !!config.adaptiveThinking;
        const VALID_EFFORTS = ['low', 'medium', 'high', 'max'];

        // Adaptive thinking: only when the explicit toggle is ON (or legacy thinkingMode === 'adaptive')
        const useAdaptiveThinking = adaptiveToggle || thinkingMode === 'adaptive';
        if (useAdaptiveThinking) {
            body.thinking = { type: 'adaptive' };
            const adaptiveEffort = VALID_EFFORTS.includes(effortRaw) ? effortRaw : 'high';
            body.output_config = { effort: adaptiveEffort };
            body.max_tokens = Math.max(body.max_tokens || 0, 16000);
            delete body.temperature; delete body.top_k; delete body.top_p;
        } else if (VALID_EFFORTS.includes(effortRaw)) {
            // Effort WITHOUT adaptive thinking — set output_config only (no thinking block)
            body.output_config = { effort: effortRaw };
        }

        // Budget-based thinking (type: 'enabled') — independent of adaptive/effort
        if (!useAdaptiveThinking) {
            const explicitBudget = config.thinkingBudget || 0;
            const legacyBudget = parseInt(config.thinking_level) || 0;
            const budget = explicitBudget > 0 ? explicitBudget : legacyBudget;
            if (budget > 0) {
                body.thinking = { type: 'enabled', budget_tokens: budget };
                if (!body.max_tokens || body.max_tokens <= budget) body.max_tokens = budget + 4096;
                delete body.temperature; delete body.top_k; delete body.top_p;
            }
        }
    } else if (format === 'google') {
        // ── Google format ──
        body.contents = formattedMessages;
        if (systemPrompt) body.systemInstruction = { parts: [{ text: systemPrompt }] };
        body.generationConfig = { temperature: temp, maxOutputTokens: maxTokens };
        if (args.top_p !== undefined && args.top_p !== null) body.generationConfig.topP = args.top_p;
        if (args.top_k !== undefined && args.top_k !== null) body.generationConfig.topK = args.top_k;
        if (args.frequency_penalty !== undefined && args.frequency_penalty !== null) body.generationConfig.frequencyPenalty = args.frequency_penalty;
        if (args.presence_penalty !== undefined && args.presence_penalty !== null) body.generationConfig.presencePenalty = args.presence_penalty;
        const _isVertexEndpoint = config.url && (config.url.includes('aiplatform.googleapis.com') || config.url.includes('vertex'));
        const _thinkBudgetForGemini = config.thinkingBudget || undefined;
        const _thinkCfg = buildGeminiThinkingConfig(config.model, config.thinking_level, _thinkBudgetForGemini, _isVertexEndpoint);
        if (_thinkCfg) body.generationConfig.thinkingConfig = _thinkCfg;
        body.safetySettings = getGeminiSafetySettings(config.model);
        validateGeminiParams(body.generationConfig);
        cleanExperimentalModelParams(body.generationConfig, config.model);
        delete body.temperature; delete body.max_tokens; delete body.top_p; delete body.top_k;
        delete body.frequency_penalty; delete body.presence_penalty; delete body.min_p;
        delete body.max_completion_tokens; delete body.model;
    } else {
        // ── OpenAI format ──
        body.messages = formattedMessages;
    }

    // ── Final safety: deep-clone + filter ──
    if (body.messages) {
        try { body.messages = JSON.parse(JSON.stringify(body.messages)); } catch (e) { console.error('[Cupcake PM] Deep-clone of messages failed:', /** @type {Error} */ (e).message); return { success: false, content: `[Cupcake PM] Message serialization failed: ${/** @type {Error} */ (e).message}. Messages may contain non-serializable objects.` }; }
        const before = body.messages.length;
        body.messages = body.messages.filter((/** @type {any} */ m) => {
            if (m == null || typeof m !== 'object') return false;
            if (!hasNonEmptyMessageContent(m.content) && !hasAttachedMultimodals(m)) return false;
            if (typeof m.role !== 'string' || !m.role) return false;
            return true;
        });
        if (body.messages.length < before) console.warn(`[Cupcake PM] ⚠️ Removed ${before - body.messages.length} null/invalid entries from messages array`);
        if (body.messages.length === 0) return { success: false, content: '[Cupcake PM] messages must be non-empty (all messages became empty after sanitization)' };
    }
    if (body.contents) {
        try { body.contents = JSON.parse(JSON.stringify(body.contents)); } catch (e) { console.error('[Cupcake PM] ⚠️ Deep-clone of contents failed:', /** @type {Error} */ (e).message); return { success: false, content: `[Cupcake PM] Content serialization failed: ${/** @type {Error} */ (e).message}. Contents may contain non-serializable objects.` }; }
        const before = body.contents.length;
        body.contents = body.contents.filter((/** @type {any} */ m) => m != null && typeof m === 'object');
        if (body.contents.length < before) console.warn(`[Cupcake PM] ⚠️ Removed ${before - body.contents.length} null/invalid entries from contents array`);
    }

    if (config.maxout) {
        if (format === 'openai') { body.max_output_tokens = maxTokens; delete body.max_tokens; delete body.max_completion_tokens; }
        else if (format === 'google') { body.generationConfig.maxOutputTokens = maxTokens; }
    }

    // o3/o4: strip sampling params
    if (format === 'openai') {
        const _modelStr = String(config.model || '').toLowerCase();
        if (shouldStripOpenAISamplingParams(_modelStr)) {
            delete body.temperature; delete body.top_p; delete body.frequency_penalty;
            delete body.presence_penalty; delete body.min_p; delete body.repetition_penalty;
        }
        if (shouldStripGPT54SamplingForReasoning(_modelStr, config.reasoning)) {
            delete body.temperature;
            delete body.top_p;
        }
    }

    // Copilot API: omit top_p when it's the default value (1.0) to avoid
    // "temperature and top_p cannot both be specified" on certain models.
    if (config.url && config.url.includes('githubcopilot.com') && body.top_p === 1) {
        delete body.top_p;
    }

    if (config.reasoning && config.reasoning !== 'none') {
        if (format === 'openai' && supportsOpenAIReasoningEffort(config.model)) {
            body.reasoning_effort = config.reasoning;
        }
    }
    if (config.verbosity && config.verbosity !== 'none') {
        if (format === 'openai') body.verbosity = config.verbosity;
    }
    if (format === 'openai' && config.promptCacheRetention && config.promptCacheRetention !== 'none') {
        body.prompt_cache_retention = config.promptCacheRetention;
    }

    // ── Tool-Use: inject tools into body (internal CPM logic, NOT customParams) ──
    if (config._cpmActiveTools && Array.isArray(config._cpmActiveTools) && config._cpmActiveTools.length > 0) {
        if (format === 'openai') {
            body.tools = config._cpmActiveTools.map(t => ({
                type: 'function',
                function: { name: t.name, description: t.description, parameters: t.inputSchema }
            }));
            body.tool_choice = 'auto';
        } else if (format === 'anthropic') {
            body.tools = config._cpmActiveTools.map(t => ({
                name: t.name, description: t.description, input_schema: t.inputSchema
            }));
            body.tool_choice = { type: 'auto' };
        } else if (format === 'google') {
            body.tools = [{ function_declarations: config._cpmActiveTools.map(t => ({
                name: t.name, description: t.description, parameters: t.inputSchema
            })) }];
        }
    }

    if (config.customParams && config.customParams.trim() !== '') {
        try {
            const extra = JSON.parse(config.customParams);
            if (typeof extra === 'object' && extra !== null && !Array.isArray(extra)) {
                const safeExtra = { ...extra };

                // ── Blocklist: structural/security-critical fields that must not be overridden via customParams ──
                // These fields control conversation content, streaming behaviour, model identity, or tool definitions.
                // Allowing them to be overridden could silently break the request or create security issues.
                /** @type {string[]} */
                const BLOCKED_FIELDS = [
                    // conversation content — replacing these would discard the user's actual chat
                    'messages', 'contents', 'input', 'prompt',
                    // streaming control — CPM sets this based on caller intent; override would break the SSE parser
                    'stream', 'stream_options',
                    // model identity — the model is chosen in the provider tab UI; overriding here is almost always a mistake
                    'model',
                    // tool / function injection — could execute arbitrary tool definitions the user didn't intend
                    'tools', 'functions', 'function_call', 'tool_choice', 'tool_config',
                    // system-level overrides (both snake_case and camelCase variants)
                    'system', 'system_instruction', 'systemInstruction',
                ];
                /** @type {string[]} */
                const stripped = [];
                for (const key of BLOCKED_FIELDS) {
                    if (key in safeExtra) {
                        stripped.push(key);
                        delete safeExtra[key];
                    }
                }
                if (stripped.length > 0) {
                    console.warn(`[Cupcake PM] customParams: blocked field(s) stripped: ${stripped.join(', ')}. Use the main UI settings instead.`);
                }

                // ── Type guard: only merge primitive values and plain objects/arrays ──
                for (const [key, value] of Object.entries(safeExtra)) {
                    if (value !== null && typeof value === 'object' && typeof value.then === 'function') {
                        // Reject thenables (Promise-like objects) — not valid JSON values
                        delete safeExtra[key];
                        console.warn(`[Cupcake PM] customParams: rejected non-serializable value for key "${key}"`);
                    }
                }

                Object.assign(body, safeExtra);
            }
        } catch (e) { console.error('[Cupcake PM] Failed to parse customParams JSON for Custom Model:', e); }
    }

    // ── Copilot + Anthropic: auto-switch URL ──
    let effectiveUrl = config.url;
    if (config.url && config.url.includes('githubcopilot.com') && format === 'anthropic') {
        effectiveUrl = 'https://api.githubcopilot.com/v1/messages';
        console.log('[Cupcake PM] Copilot + Anthropic format detected → URL auto-switched to /v1/messages');
    }

    // ── Copilot + Responses API detection ──
    const _responsesMode = String(config.responsesMode || 'auto').toLowerCase();
    const _responsesForceOn = _responsesMode === 'on' || _responsesMode === 'force' || _responsesMode === 'always';
    const _responsesForceOff = _responsesMode === 'off' || _responsesMode === 'disable' || _responsesMode === 'disabled';
    const _isManualResponsesEndpoint = !!(config.url && /\/responses(?:\?|$)/.test(config.url));
    const _isCopilotDomain = !!(config.url && config.url.includes('githubcopilot.com'));
    const _canUseResponsesByUrl = _isManualResponsesEndpoint || _isCopilotDomain;
    const _autoResponsesMatch = _isManualResponsesEndpoint || (_isCopilotDomain && needsCopilotResponsesAPI(config.model));
    const _useResponsesAPI = !!(format === 'openai' && !_responsesForceOff && _canUseResponsesByUrl && (_responsesForceOn || _autoResponsesMatch));

    if (_useResponsesAPI) {
        if (_isCopilotDomain && !_isManualResponsesEndpoint && (_responsesForceOn || needsCopilotResponsesAPI(config.model))) {
            const _copilotBase = (config.url.match(/https:\/\/[^/]+/) || ['https://api.githubcopilot.com'])[0];
            effectiveUrl = `${_copilotBase}/responses`;
        }
        if (body.messages) {
            // Response API does not accept 'name' field on input items (e.g. example_assistant, example_user).
            // Sending it causes 400: "Unknown parameter: 'input[N].name'"
            body.input = body.messages.map((/** @type {any} */ msg) => {
                const { name: _name, ...rest } = msg;
                return rest;
            });
            delete body.messages;
        }
        if (body.max_completion_tokens) { body.max_output_tokens = body.max_completion_tokens; delete body.max_completion_tokens; }
        else if (body.max_tokens) { body.max_output_tokens = body.max_tokens; delete body.max_tokens; }
        if (body.reasoning_effort) { body.reasoning = { effort: body.reasoning_effort, summary: 'auto' }; delete body.reasoning_effort; }
        delete body.stream_options; delete body.prompt_cache_retention;

        if (args.temperature === undefined || args.temperature === null) delete body.temperature;
        if (args.top_p === undefined || args.top_p === null) delete body.top_p;
        if (args.frequency_penalty === undefined || args.frequency_penalty === null) delete body.frequency_penalty;
        if (args.presence_penalty === undefined || args.presence_penalty === null) delete body.presence_penalty;
        delete body.min_p; delete body.repetition_penalty;

        console.log(`[Cupcake PM] Copilot + Responses API detected (model=${config.model}) → URL=${effectiveUrl}`);
    }
    const _isResponsesEndpoint = _useResponsesAPI || (effectiveUrl && /\/responses(?:\?|$)/.test(effectiveUrl));

    // ── CORS Proxy: proxyUrl이 설정되어 있으면 도메인을 프록시로 교체 ──
    // Responses API URL 재작성 후에 적용해야 올바른 경로를 프록시로 보냄
    // 모든 API URL에 적용됨 (Copilot, Google, NVIDIA, 기타 커스텀 API 모두)
    let _proxyUrl = (config.proxyUrl || '').trim().replace(/\/+$/, '');
    // Auto-prepend https:// if user entered bare domain (e.g. "my-server.kr/proxy")
    if (_proxyUrl && !/^https?:\/\//i.test(_proxyUrl)) {
        _proxyUrl = 'https://' + _proxyUrl;
        console.log(`[Cupcake PM] proxyUrl missing scheme — auto-prepended https:// → ${_proxyUrl}`);
    }
    const _isProxied = !!_proxyUrl;
    const _proxyDirect = !!config.proxyDirect;
    if (_proxyUrl && effectiveUrl) {
        if (_proxyDirect) {
            // Direct mode: 프록시 URL로 직접 요청, effectiveUrl은 X-Target-URL 헤더로 전달
            console.log(`[Cupcake PM] CORS Proxy (Direct mode) → proxy=${_proxyUrl.substring(0, 60)}, target=${effectiveUrl.substring(0, 60)}`);
        } else {
            // Rewrite mode (기본): 도메인을 프록시로 교체
            try {
                const _origUrl = new URL(effectiveUrl);
                const _proxyBase = new URL(_proxyUrl);
                effectiveUrl = _proxyBase.origin + _proxyBase.pathname.replace(/\/+$/, '') + _origUrl.pathname + _origUrl.search;
                console.log(`[Cupcake PM] CORS Proxy (Rewrite mode) active → ${effectiveUrl}`);
            } catch (_e) {
                console.error(`[Cupcake PM] ❌ Invalid proxyUrl "${_proxyUrl}" — proxy NOT applied. URL 형식을 확인하세요 (예: https://my-server.kr/proxy).`, _e);
            }
        }
    } else if (!_proxyUrl && effectiveUrl) {
        console.log(`[Cupcake PM] No proxyUrl configured for ${effectiveUrl.substring(0, 60)} — direct request mode`);
    }

    // ── Direct proxy wrapper: intercepts smartNativeFetch in direct mode ──
    // Direct mode uses plain fetch() to the external proxy — no need to go
    // through Risu's nativeFetch/risuFetch pipeline (which would cause
    // double-proxying or header loss).
    /**
     * @param {string} url
     * @param {RequestInit & Record<string, any>} [options]
     * @returns {Promise<Response>}
     */
    const _smartFetch = (_proxyDirect && _proxyUrl)
        ? async (/** @type {string} */ url, /** @type {RequestInit & Record<string, any>} */ options = {}) => {
            const directHeaders = {
                ...(/** @type {Record<string, string>} */ (options.headers) || {}),
                'X-Target-URL': url,
            };
            console.log(`[Cupcake PM] [direct proxy] → ${_proxyUrl.substring(0, 60)} (target: ${url.substring(0, 60)})`);
            return fetch(_proxyUrl, { ...options, headers: directHeaders });
        }
        : smartNativeFetch;

    // ── Core fetch logic (wrapped for key rotation) ──
    const _doCustomFetch = async (/** @type {string} */ _apiKey) => {
        const _parseNonStreamingData = (/** @type {any} */ data) => {
            if (format === 'anthropic') return parseClaudeNonStreamingResponse(data, {}, _reqId);
            if (format === 'google') return parseGeminiNonStreamingResponse(data, config, _reqId);
            if (_isResponsesEndpoint) return parseResponsesAPINonStreamingResponse(data, _reqId);
            return parseOpenAINonStreamingResponse(data, _reqId);
        };

        const _executeRequest = async (/** @type {() => Promise<any>} */ requestFactory, /** @type {string} */ label, maxAttempts = 3) => {
            let attempt = 0;
            let response;

            while (attempt < maxAttempts) {
                response = await requestFactory();
                if (response?.ok) return response;

                const status = response?.status || 0;
                if (!_isRetriableHttpStatus(status) || attempt >= maxAttempts - 1 || abortSignal?.aborted) {
                    return response;
                }

                response?.body?.cancel?.();
                attempt++;
                const retryAfterMs = _parseRetryAfterMs(response?.headers);
                const exponentialDelay = Math.min(1000 * Math.pow(2, attempt - 1), 16000);
                const retryDelay = retryAfterMs || exponentialDelay;
                console.warn(`[Cupcake PM] ${label} retry ${attempt}/${maxAttempts - 1} after HTTP ${status} (delay: ${retryDelay}ms)`);
                await sleep(retryDelay);
            }

            return response;
        };

        const _toNonStreamingUrl = (/** @type {string} */ urlValue) => {
            let nextUrl = String(urlValue || effectiveUrl || '');
            if (format === 'google') {
                nextUrl = nextUrl.replace(':streamGenerateContent', ':generateContent');
                nextUrl = nextUrl.replace(/([?&])alt=sse(&)?/i, (/** @type {string} */ _m, /** @type {string} */ sep, /** @type {string} */ tail) => (tail ? sep : ''));
                nextUrl = nextUrl.replace(/\?&/, '?').replace(/[?&]$/, '');
            }
            return nextUrl;
        };

        const _initialApiKey = String(_apiKey || '').trim();
        /** @type {Record<string, string>} */
        const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${_initialApiKey}` };
        /** @type {Window & typeof globalThis & { _cpmCopilotMachineId?: string, _cpmCopilotSessionId?: string }} */
        const _win = /** @type {any} */ (window);

        // Direct Anthropic API: x-api-key header
        if (format === 'anthropic' && effectiveUrl && effectiveUrl.includes('api.anthropic.com')) {
            delete headers['Authorization'];
            headers['x-api-key'] = _initialApiKey;
        }

        // Vertex AI: Service Account JSON → OAuth Bearer token
        const _isVertexEndpointForAuth = effectiveUrl && (
            effectiveUrl.includes('aiplatform.googleapis.com') || config.authType === 'service_account'
        );
        if (_isVertexEndpointForAuth && looksLikeServiceAccountJson(_initialApiKey)) {
            try {
                const vertexToken = await getVertexBearerToken(_initialApiKey);
                headers['Authorization'] = `Bearer ${vertexToken}`;
            } catch (vertexErr) {
                return {
                    success: false,
                    content: `[Cupcake PM] Vertex AI 인증 실패: ${/** @type {Error} */(vertexErr).message}`
                };
            }
        }

        // Copilot via CORS proxy still needs the raw GitHub OAuth token so the worker can
        // exchange it for a Copilot API token server-side.
        if (_isProxied && _isCopilotDomain) {
            let proxiedCopilotToken = _initialApiKey;
            if (!proxiedCopilotToken) {
                const _githubToken = await safeGetArg('tools_githubCopilotToken');
                proxiedCopilotToken = String(_githubToken || '').replace(/[^\x20-\x7E]/g, '').trim();
            }

            if (!proxiedCopilotToken) {
                return {
                    success: false,
                    content: '[Cupcake PM] CORS Proxy 사용 시 GitHub Copilot OAuth 토큰이 필요합니다. Copilot Manager 토큰 또는 커스텀 모델 API Key에 OAuth 토큰을 넣어 주세요.'
                };
            }

            headers['Authorization'] = `Bearer ${proxiedCopilotToken}`;
        }

        // Copilot headers — skip when using CORS proxy (proxy handles token exchange + headers)
        if (!_isProxied && effectiveUrl && effectiveUrl.includes('githubcopilot.com')) {
            const copilotNodelessMode = normalizeCopilotNodelessMode(await safeGetArg('cpm_copilot_nodeless_mode'));
            const useLegacyHeaders = shouldUseLegacyCopilotRequestHeaders(copilotNodelessMode);
            let copilotApiToken = config.copilotToken || '';
            if (!copilotApiToken) copilotApiToken = await ensureCopilotApiToken();
            if (copilotApiToken) {
                headers['Authorization'] = `Bearer ${copilotApiToken}`;
            } else {
                // Do NOT proceed with the raw OAuth token — the Copilot completions
                // API rejects it with "Authorization header is badly formatted".
                console.error('[Cupcake PM] Copilot: Token exchange failed — cannot authenticate.');
                return { success: false, content: '[Cupcake PM] Copilot API 토큰 교환 실패. GitHub Copilot OAuth 토큰이 유효한지 확인하세요. (Token exchange failed — check your Copilot OAuth token.)' };
            }

            if (!_win._cpmCopilotMachineId) {
                _win._cpmCopilotMachineId = Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
            }
            if (!_win._cpmCopilotSessionId) _win._cpmCopilotSessionId = safeUUID() + Date.now().toString();

            Object.assign(headers, getCopilotStaticHeaders(copilotNodelessMode));
            if (!useLegacyHeaders) {
                headers['Vscode-Machineid'] = _win._cpmCopilotMachineId;
                headers['Vscode-Sessionid'] = _win._cpmCopilotSessionId;
                headers['X-Interaction-Id'] = safeUUID();
                headers['X-Request-Id'] = safeUUID();
            }

            if (format === 'anthropic') headers['anthropic-version'] = '2023-06-01';

            const _visionMsgArr = body.messages || body.input || [];
            const hasVisionContent = _visionMsgArr.some((/** @type {any} */ m) =>
                Array.isArray(m?.content) && m.content.some((/** @type {any} */ p) => p.type === 'image_url' || p.type === 'image')
            );
            if (hasVisionContent) headers['Copilot-Vision-Request'] = 'true';
        }

        // Anthropic beta headers (non-Copilot)
        if (format === 'anthropic') {
            const _isCopilotAnthropic = _isCopilotDomain || _isProxied;
            if (_isCopilotAnthropic && _isProxied) {
                // Copilot via CORS proxy — only anthropic-version needed (proxy handles the rest)
                headers['anthropic-version'] = '2023-06-01';
            } else if (!_isCopilotAnthropic) {
                const _anthropicBetas = [];
                const _effectiveMaxTokens = body.max_tokens || maxTokens || 0;
                if (_effectiveMaxTokens > 8192) _anthropicBetas.push('output-128k-2025-02-19');
                if (_anthropicBetas.length > 0) headers['anthropic-beta'] = _anthropicBetas.join(',');
                headers['anthropic-version'] = '2023-06-01';
                headers['anthropic-dangerous-direct-browser-access'] = 'true';
            }
        }

        // ── Streaming ──
        const streamingEnabled = await safeGetBoolArg('cpm_streaming_enabled', false);
        const perModelStreamingEnabled = (config.streaming === true) || (config.streaming !== false && !config.decoupled);
        const _compatActive = await safeGetBoolArg('cpm_compatibility_mode', false);
        const _isCopilotStreamUrl = !!(effectiveUrl && effectiveUrl.includes('githubcopilot.com'));
        // ReadableStream pre-check: auto-disable streaming on environments where
        // getReader() will fail (iOS Safari / iframe sandbox), preventing the
        // "stream request succeeded → ReadableStream read failed → non-stream
        // fallback" double-request bug.
        const _rsSupported = _checkReadableStreamSupport();
        // Compatibility mode: disable ALL streaming (including Copilot).
        // Copilot can return non-streaming responses fine; the old 524 issue
        // only applies to very long responses and is far less harmful than
        // the double-request bug on iPhone.
        let useStreaming = streamingEnabled && perModelStreamingEnabled && !_compatActive;
        if (useStreaming && !_rsSupported) {
            console.log(`[Cupcake PM] ReadableStream unavailable — auto-disabling streaming for ${format} to prevent duplicate requests.`);
            useStreaming = false;
        }
        if (streamingEnabled && _compatActive) {
            console.log(`[Cupcake PM] Compatibility mode active — forcing non-streaming for all endpoints (including Copilot).`);
        }

        if (useStreaming) {
            /** @type {any} */
            const streamBody = { ...body };
            let streamUrl = effectiveUrl;

            if (format === 'anthropic') {
                streamBody.stream = true;
            } else if (format === 'google') {
                streamUrl = effectiveUrl.replace(':generateContent', ':streamGenerateContent');
                if (!streamUrl.includes('alt=')) streamUrl += (streamUrl.includes('?') ? '&' : '?') + 'alt=sse';
            } else {
                streamBody.stream = true;
                if (!_isResponsesEndpoint) {
                    const _wantStreamUsage = await safeGetBoolArg('cpm_show_token_usage', false);
                    if (_wantStreamUsage) streamBody.stream_options = { include_usage: true };
                }
            }

            const finalBody = sanitizeBodyJSON(safeStringify(streamBody));
            const _streamBodyLen = finalBody.length;
            if (_streamBodyLen > 10_000_000) {
                return { success: false, content: `[Cupcake PM] Request body too large (${(_streamBodyLen / 1_048_576).toFixed(1)} MB). V3 bridge limit is ~10 MB. Reduce chat history or remove images.` };
            }
            if (_streamBodyLen > 5_000_000) {
                console.warn(`[Cupcake PM] ⚠️ Streaming body size: ${(_streamBodyLen / 1_048_576).toFixed(2)} MB (${body.messages?.length || 0} messages). Large bodies may cause 'unexpected EOF' if V3 bridge truncates data.`);
            }
            if (_reqId) _updateApiRequest(_reqId, {
                url: streamUrl,
                requestHeaders: { ...headers, 'Authorization': headers['Authorization'] ? '***REDACTED***' : undefined },
                requestBody: (() => { try { return JSON.parse(finalBody); } catch { return finalBody; } })()
            });

            const res = await _executeRequest(
                () => _smartFetch(streamUrl, { method: 'POST', headers, body: finalBody, signal: abortSignal }),
                `${format} stream request`
            );
            if (_reqId) _updateApiRequest(_reqId, { status: res.status });

            if (!res.ok) {
                const errBody = await res.text();
                if (_reqId) _updateApiRequest(_reqId, { response: errBody.substring(0, 2000) });
                // Enhanced diagnostic for JSON truncation errors
                if (res.status === 400 && errBody.includes('unexpected EOF')) {
                    console.error(`[Cupcake PM] ❌ API returned 'unexpected EOF' — the JSON body was likely truncated during transfer.`,
                        `\n  Body size: ${_streamBodyLen} chars`,
                        `\n  Message count: ${streamBody.messages?.length || streamBody.input?.length || 0}`,
                        `\n  Format: ${format}`,
                        `\n  URL: ${streamUrl?.substring(0, 80)}`,
                        `\n  Hint: If body > 5MB, try reducing chat history length or removing images.`);
                }
                return { success: false, content: `[Custom API Error ${res.status}] ${errBody}`, _status: res.status };
            }

            const _hasReadableStreamBody = !!(res?.body && typeof res.body.getReader === 'function');
            if (!_hasReadableStreamBody) {
                // Copilot: non-streaming fallback causes 524 — return error immediately
                if (_isCopilotStreamUrl) {
                    console.error(`[Cupcake PM] Copilot streaming response body unavailable (no ReadableStream). Cannot fall back to non-streaming (would cause 524).`);
                    return { success: false, content: `[Cupcake PM] Copilot 스트리밍 응답 본문을 읽을 수 없습니다. ReadableStream이 지원되지 않는 환경입니다. 호환성 모드를 확인하거나 브라우저를 업데이트해 주세요.`, _status: 0 };
                }

                // ── Safety net: try reading the already-received response as text ──
                // The server already processed the streaming request, so the data
                // may still be accessible via Response.text() even when
                // ReadableStream.getReader() is unavailable (iOS Safari).
                // This avoids a duplicate non-streaming request.
                try {
                    const _existingText = await res.text();
                    if (_existingText && _existingText.trim().length > 0) {
                        console.log(`[Cupcake PM] ReadableStream unavailable but Response.text() succeeded (${_existingText.length} chars) — extracting content without duplicate request.`);
                        // Parse SSE lines from the streaming response text
                        const _sseChunks = [];
                        for (const _line of _existingText.split('\n')) {
                            if (!_line.startsWith('data: ') || _line.trim() === 'data: [DONE]') continue;
                            try {
                                const _d = JSON.parse(_line.slice(6));
                                if (format === 'openai') {
                                    const _t = _d.choices?.[0]?.delta?.content || _d.choices?.[0]?.message?.content || '';
                                    if (_t) _sseChunks.push(_t);
                                } else if (format === 'anthropic') {
                                    const _t = _d.delta?.text || '';
                                    if (_t) _sseChunks.push(_t);
                                } else if (format === 'google') {
                                    const _t = _d.candidates?.[0]?.content?.parts?.[0]?.text || '';
                                    if (_t) _sseChunks.push(_t);
                                }
                            } catch { /* skip non-JSON data lines */ }
                        }
                        if (_sseChunks.length > 0) {
                            const _extracted = _sseChunks.join('');
                            if (_reqId) _updateApiRequest(_reqId, { response: `(SSE text fallback: ${_extracted.length} chars)` });
                            return { success: true, content: _extracted };
                        }
                        // Not SSE — maybe the server returned plain JSON despite stream:true
                        try {
                            const _jsonData = JSON.parse(_existingText);
                            if (_reqId) _updateApiRequest(_reqId, { response: _jsonData });
                            return _parseNonStreamingData(_jsonData);
                        } catch { /* not valid JSON either, fall through */ }
                    }
                } catch (_textErr) {
                    console.warn(`[Cupcake PM] Response.text() also failed: ${/** @type {Error} */ (_textErr).message}`);
                }

                // Last resort: non-streaming duplicate request
                console.warn(`[Cupcake PM] Streaming response body completely unreadable for ${format}; retrying as non-streaming (duplicate request).`);
                const fallbackUrl = _toNonStreamingUrl(streamUrl);
                const fallbackBodyObj = { ...body };
                delete fallbackBodyObj.stream_options;
                if (format !== 'google') fallbackBodyObj.stream = false;
                const fallbackBody = sanitizeBodyJSON(safeStringify(fallbackBodyObj));
                const fallbackRes = await _executeRequest(
                    () => _smartFetch(fallbackUrl, { method: 'POST', headers, body: fallbackBody, signal: abortSignal }),
                    `${format} non-stream fallback`
                );
                if (_reqId) _updateApiRequest(_reqId, { status: fallbackRes.status });
                if (!fallbackRes.ok) {
                    const errBody = await fallbackRes.text();
                    if (_reqId) _updateApiRequest(_reqId, { response: errBody.substring(0, 2000) });
                    return { success: false, content: `[Custom API Error ${fallbackRes.status}] ${errBody}`, _status: fallbackRes.status };
                }
                const fallbackText = await fallbackRes.text();
                let fallbackData;
                try {
                    fallbackData = JSON.parse(fallbackText);
                } catch (_jsonErr) {
                    const contentType = fallbackRes.headers?.get?.('content-type') || 'unknown';
                    if (_reqId) _updateApiRequest(_reqId, { response: `[Parse Error: content-type=${contentType}]\n${fallbackText.substring(0, 4000)}` });
                    return { success: false, content: `[Custom API Error] Response is not JSON (${contentType}): ${fallbackText.substring(0, 1000)}`, _status: fallbackRes.status };
                }
                if (_reqId) _updateApiRequest(_reqId, { response: fallbackData });
                return _parseNonStreamingData(fallbackData);
            }

            if (_reqId) _updateApiRequest(_reqId, { response: '(streaming…)' });

            if (format === 'anthropic') {
                const _showThinkingInStream = await safeGetBoolArg('cpm_streaming_show_thinking', true);
                return { success: true, content: createAnthropicSSEStream(res, abortSignal, _reqId, { showThinking: _showThinkingInStream }) };
            } else if (format === 'google') {
                config._tokenUsageReqId = _reqId;
                const _onComplete = () => saveThoughtSignatureFromStream(config, _reqId);
                return { success: true, content: createSSEStream(res, (/** @type {string} */ line) => parseGeminiSSELine(line, config), abortSignal, _onComplete, _reqId) };
            } else if (_isResponsesEndpoint) {
                return { success: true, content: createResponsesAPISSEStream(res, abortSignal, _reqId) };
            } else {
                return { success: true, content: createOpenAISSEStream(res, abortSignal, _reqId) };
            }
        }

        // ── Non-streaming fallback ──
        const _nonStreamBody = sanitizeBodyJSON(safeStringify(body));
        const _nonStreamBodyLen = _nonStreamBody.length;
        if (_nonStreamBodyLen > 10_000_000) {
            return { success: false, content: `[Cupcake PM] Request body too large (${(_nonStreamBodyLen / 1_048_576).toFixed(1)} MB). V3 bridge limit is ~10 MB. Reduce chat history or remove images.` };
        }
        if (_nonStreamBodyLen > 5_000_000) {
            console.warn(`[Cupcake PM] ⚠️ Non-stream body size: ${(_nonStreamBodyLen / 1_048_576).toFixed(2)} MB (${body.messages?.length || 0} messages). Large bodies may cause 'unexpected EOF' if V3 bridge truncates data.`);
        }
        if (_reqId) _updateApiRequest(_reqId, {
            url: effectiveUrl,
            requestHeaders: { ...headers, 'Authorization': headers['Authorization'] ? '***REDACTED***' : undefined },
            requestBody: (() => { try { return JSON.parse(_nonStreamBody); } catch { return _nonStreamBody; } })()
        });

        const res = await _executeRequest(
            () => _smartFetch(effectiveUrl, { method: 'POST', headers, body: _nonStreamBody, signal: abortSignal }),
            `${format} request`
        );
        if (_reqId) _updateApiRequest(_reqId, { status: res.status });

        if (!res.ok) {
            const errBody = await res.text();
            if (_reqId) _updateApiRequest(_reqId, { response: errBody.substring(0, 2000) });
            return { success: false, content: `[Custom API Error ${res.status}] ${errBody}`, _status: res.status };
        }

        const _rawResponseText = await res.text();
        if (_reqId) _updateApiRequest(_reqId, { response: _rawResponseText.substring(0, 4000) });

        let data;
        try {
            data = JSON.parse(_rawResponseText);
        } catch (_jsonErr) {
            const contentType = res.headers?.get?.('content-type') || 'unknown';
            if (_reqId) _updateApiRequest(_reqId, { response: `[Parse Error: content-type=${contentType}]\n${_rawResponseText.substring(0, 4000)}` });
            return { success: false, content: `[Custom API Error] Response is not JSON (${contentType}): ${_rawResponseText.substring(0, 1000)}`, _status: res.status };
        }
        if (_reqId) _updateApiRequest(_reqId, { response: data });

        // Tool-use round: return raw parsed JSON so tool-loop can inspect tool_calls
        if (config._cpmReturnRawJSON) {
            return { success: true, content: _rawResponseText, _rawData: data, _status: res.status };
        }

        return _parseNonStreamingData(data);
    };

    // ── Key Rotation dispatch ──
    const _dispatchFetch = async () => {
        if (_useKeyRotation) {
            const _rotationPoolName = `_cpm_custom_inline_${encodeURIComponent(config.url || '')}_${config.model || 'unknown'}`;
            /** @type {Record<string, any>} */ (KeyPool._pools)[_rotationPoolName] = { lastRaw: _rawKeys, keys: [..._keyPool], _inline: true };
            return KeyPool.withRotation(_rotationPoolName, _doCustomFetch);
        }
        return _doCustomFetch(_allKeys[0] || '');
    };

    let _result = await _dispatchFetch();

    // ── temperature+top_p conflict auto-retry (once) ──
    // Some Copilot-served models reject both parameters simultaneously.
    // Detect the specific 400 error pattern and retry without top_p.
    if (_result && !_result.success && _result._status === 400 && body.top_p !== undefined) {
        if (/temperature.*top_p|top_p.*temperature/i.test(String(_result.content || ''))) {
            console.warn(`[Cupcake PM] API rejected temperature+top_p for model "${config.model}" — retrying without top_p.`);
            delete body.top_p;
            _result = await _dispatchFetch();
        }
    }

    return _result;
}

// @ts-check
/**
 * fetch-custom.js — Custom model API fetcher.
 * Handles all three formats (OpenAI, Anthropic, Google) with
 * streaming/non-streaming, Copilot integration, key rotation,
 * and Responses API support.
 */
import { safeGetBoolArg } from './shared-state.js';
import { sanitizeMessages, sanitizeBodyJSON } from './sanitize.js';
import { safeStringify, hasNonEmptyMessageContent, hasAttachedMultimodals, safeUUID } from './helpers.js';
import { formatToOpenAI } from './format-openai.js';
import { formatToAnthropic } from './format-anthropic.js';
import {
    formatToGemini, buildGeminiThinkingConfig, getGeminiSafetySettings,
    validateGeminiParams, cleanExperimentalModelParams,
} from './format-gemini.js';
import {
    supportsOpenAIReasoningEffort, needsCopilotResponsesAPI,
    shouldStripOpenAISamplingParams, shouldStripGPT54SamplingForReasoning,
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
import { getCopilotStaticHeaders } from './copilot-headers.js';
import { KeyPool } from './key-pool.js';
import { updateApiRequest as _updateApiRequest } from './api-request-log.js';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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

function _isRetriableHttpStatus(status) {
    return status === 408 || status === 429 || status >= 500;
}

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
        config.developerRole = /(?:^|\/)(?:gpt-5|o[2-9]|o1(?!-(?:preview|mini)))/i.test(modelId);
        formattedMessages = formatToOpenAI(messages, config);
    }

    const _rawKeys = (config.key || '').trim();
    const _allKeys = _rawKeys.split(/\s+/).filter(k => k.length > 0);
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

    const _needsMCT = (model) => { if (!model) return false; return /(?:^|\/)(?:gpt-(?:4\.5|5)|o[1-9])/i.test(model); };
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
        try { body.messages = JSON.parse(JSON.stringify(body.messages)); } catch (e) { console.error('[Cupcake PM] Deep-clone of messages failed:', e.message); }
        const before = body.messages.length;
        body.messages = body.messages.filter(m => {
            if (m == null || typeof m !== 'object') return false;
            if (!hasNonEmptyMessageContent(m.content) && !hasAttachedMultimodals(m)) return false;
            if (typeof m.role !== 'string' || !m.role) return false;
            return true;
        });
        if (body.messages.length < before) console.warn(`[Cupcake PM] ⚠️ Removed ${before - body.messages.length} null/invalid entries from messages array`);
        if (body.messages.length === 0) return { success: false, content: '[Cupcake PM] messages must be non-empty (all messages became empty after sanitization)' };
    }
    if (body.contents) {
        try { body.contents = JSON.parse(JSON.stringify(body.contents)); } catch (e) { console.error('[Cupcake PM] ⚠️ Deep-clone of contents failed:', e.message); }
        const before = body.contents.length;
        body.contents = body.contents.filter(m => m != null && typeof m === 'object');
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

    if (config.customParams && config.customParams.trim() !== '') {
        try {
            const extra = JSON.parse(config.customParams);
            if (typeof extra === 'object' && extra !== null) {
                const safeExtra = { ...extra };
                delete safeExtra.messages; delete safeExtra.contents; delete safeExtra.stream;
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
            body.input = body.messages.map(({ name: _name, ...rest }) => rest);
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

    // ── Core fetch logic (wrapped for key rotation) ──
    const _doCustomFetch = async (_apiKey) => {
        const _parseNonStreamingData = (data) => {
            if (format === 'anthropic') return parseClaudeNonStreamingResponse(data, {}, _reqId);
            if (format === 'google') return parseGeminiNonStreamingResponse(data, config, _reqId);
            if (_isResponsesEndpoint) return parseResponsesAPINonStreamingResponse(data, _reqId);
            return parseOpenAINonStreamingResponse(data, _reqId);
        };

        const _executeRequest = async (requestFactory, label, maxAttempts = 3) => {
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
                const retryDelay = _parseRetryAfterMs(response?.headers) || (700 * attempt);
                console.warn(`[Cupcake PM] ${label} retry ${attempt}/${maxAttempts - 1} after HTTP ${status}`);
                await sleep(retryDelay);
            }

            return response;
        };

        const _toNonStreamingUrl = (urlValue) => {
            let nextUrl = String(urlValue || effectiveUrl || '');
            if (format === 'google') {
                nextUrl = nextUrl.replace(':streamGenerateContent', ':generateContent');
                nextUrl = nextUrl.replace(/([?&])alt=sse(&)?/i, (_m, sep, tail) => (tail ? sep : ''));
                nextUrl = nextUrl.replace(/\?&/, '?').replace(/[?&]$/, '');
            }
            return nextUrl;
        };

        const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${_apiKey}` };
        /** @type {Window & typeof globalThis & { _cpmCopilotMachineId?: string, _cpmCopilotSessionId?: string }} */
        const _win = /** @type {any} */ (window);

        // Direct Anthropic API: x-api-key header
        if (format === 'anthropic' && effectiveUrl && effectiveUrl.includes('api.anthropic.com')) {
            delete headers['Authorization'];
            headers['x-api-key'] = _apiKey;
        }

        // Copilot headers
        if (effectiveUrl && effectiveUrl.includes('githubcopilot.com')) {
            let copilotApiToken = config.copilotToken || '';
            if (!copilotApiToken) copilotApiToken = await ensureCopilotApiToken();
            if (copilotApiToken) headers['Authorization'] = `Bearer ${copilotApiToken}`;
            else console.warn('[Cupcake PM] Copilot: No API token available.');

            if (!_win._cpmCopilotMachineId) {
                _win._cpmCopilotMachineId = Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
            }
            if (!_win._cpmCopilotSessionId) _win._cpmCopilotSessionId = safeUUID() + Date.now().toString();

            Object.assign(headers, getCopilotStaticHeaders());
            headers['Vscode-Machineid'] = _win._cpmCopilotMachineId;
            headers['Vscode-Sessionid'] = _win._cpmCopilotSessionId;
            headers['X-Interaction-Id'] = safeUUID();
            headers['X-Request-Id'] = safeUUID();

            if (format === 'anthropic') headers['anthropic-version'] = '2023-06-01';

            const _visionMsgArr = body.messages || body.input || [];
            const hasVisionContent = _visionMsgArr.some(m =>
                Array.isArray(m?.content) && m.content.some(p => p.type === 'image_url' || p.type === 'image')
            );
            if (hasVisionContent) headers['Copilot-Vision-Request'] = 'true';
        }

        // Anthropic beta headers (non-Copilot)
        if (format === 'anthropic') {
            const _isCopilotAnthropic = !!(effectiveUrl && effectiveUrl.includes('githubcopilot.com'));
            if (!_isCopilotAnthropic) {
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
        const useStreaming = streamingEnabled && perModelStreamingEnabled;
        if (!useStreaming && effectiveUrl && effectiveUrl.includes('githubcopilot.com')) {
            console.warn(`[Cupcake PM] Copilot request in non-stream mode. Long responses may return 524 via proxy.`);
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
            if (_reqId) _updateApiRequest(_reqId, {
                url: streamUrl,
                requestHeaders: { ...headers, 'Authorization': headers['Authorization'] ? '***REDACTED***' : undefined },
                requestBody: (() => { try { return JSON.parse(finalBody); } catch { return finalBody; } })()
            });

            const res = await _executeRequest(
                () => smartNativeFetch(streamUrl, { method: 'POST', headers, body: finalBody, signal: abortSignal }),
                `${format} stream request`
            );
            if (_reqId) _updateApiRequest(_reqId, { status: res.status });

            if (!res.ok) {
                const errBody = await res.text();
                if (_reqId) _updateApiRequest(_reqId, { response: errBody.substring(0, 2000) });
                return { success: false, content: `[Custom API Error ${res.status}] ${errBody}`, _status: res.status };
            }

            const _hasReadableStreamBody = !!(res?.body && typeof res.body.getReader === 'function');
            if (!_hasReadableStreamBody) {
                console.warn(`[Cupcake PM] Streaming response body unavailable for ${format}; retrying as non-streaming.`);
                const fallbackUrl = _toNonStreamingUrl(streamUrl);
                const fallbackBodyObj = { ...body };
                delete fallbackBodyObj.stream_options;
                if (format !== 'google') fallbackBodyObj.stream = false;
                const fallbackBody = sanitizeBodyJSON(safeStringify(fallbackBodyObj));
                const fallbackRes = await _executeRequest(
                    () => smartNativeFetch(fallbackUrl, { method: 'POST', headers, body: fallbackBody, signal: abortSignal }),
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
                return { success: true, content: createAnthropicSSEStream(res, abortSignal, _reqId) };
            } else if (format === 'google') {
                config._tokenUsageReqId = _reqId;
                const _onComplete = () => saveThoughtSignatureFromStream(config, _reqId);
                return { success: true, content: createSSEStream(res, (line) => parseGeminiSSELine(line, config), abortSignal, _onComplete, _reqId) };
            } else if (_isResponsesEndpoint) {
                return { success: true, content: createResponsesAPISSEStream(res, abortSignal, _reqId) };
            } else {
                return { success: true, content: createOpenAISSEStream(res, abortSignal, _reqId) };
            }
        }

        // ── Non-streaming fallback ──
        const _nonStreamBody = sanitizeBodyJSON(safeStringify(body));
        if (_reqId) _updateApiRequest(_reqId, {
            url: effectiveUrl,
            requestHeaders: { ...headers, 'Authorization': headers['Authorization'] ? '***REDACTED***' : undefined },
            requestBody: (() => { try { return JSON.parse(_nonStreamBody); } catch { return _nonStreamBody; } })()
        });

        const res = await _executeRequest(
            () => smartNativeFetch(effectiveUrl, { method: 'POST', headers, body: _nonStreamBody, signal: abortSignal }),
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

        return _parseNonStreamingData(data);
    };

    // ── Key Rotation dispatch ──
    if (_useKeyRotation) {
        const _rotationPoolName = `_cpm_custom_inline_${config.model || 'unknown'}`;
        KeyPool._pools[_rotationPoolName] = { lastRaw: _rawKeys, keys: [..._keyPool], _inline: true };
        return KeyPool.withRotation(_rotationPoolName, _doCustomFetch);
    }
    return _doCustomFetch(_allKeys[0] || '');
}

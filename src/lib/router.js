// @ts-check
/**
 * router.js — Main request router and provider dispatch.
 * handleRequest is the entry point called by RisuAI for every API request.
 * fetchByProviderId dispatches to the correct provider fetcher.
 */
import { Risu, safeGetArg, safeGetBoolArg, state, customFetchers } from './shared-state.js';
import { sanitizeMessages } from './sanitize.js';
import { inferSlot } from './slot-inference.js';
import { fetchCustom } from './fetch-custom.js';
import {
    storeApiRequest as _storeApiRequest,
    updateApiRequest as _updateApiRequest,
    getAllApiRequests as _getAllApiRequests,
} from './api-request-log.js';
import { _takeTokenUsage } from './token-usage.js';
import { showTokenUsageToast as _showTokenUsageToast } from './token-toast.js';
import { collectStream, checkStreamCapability } from './stream-utils.js';

/**
 * @typedef {Object} ModelDef
 * @property {string} provider - Provider name (e.g. 'CustomOpenAI')
 * @property {string} name - Display name
 * @property {string} [uniqueId] - Unique identifier for custom models
 */

/**
 * @typedef {Object} RequestResult
 * @property {boolean} success
 * @property {string|ReadableStream} content
 * @property {number} [_status]
 */

// ── Helpers ──

/**
 * Parse value to finite float or undefined.
 * @param {*} v
 * @returns {number|undefined}
 */
export function _toFiniteFloat(v) {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : undefined;
}

/**
 * Parse value to finite integer or undefined.
 * @param {*} v
 * @returns {number|undefined}
 */
export function _toFiniteInt(v) {
    const n = parseInt(v);
    return Number.isFinite(n) ? n : undefined;
}

// ── Provider Dispatch ──

/**
 * Dispatch request to the correct provider fetcher.
 * @param {ModelDef} modelDef
 * @param {Record<string, any>} args - Request arguments from RisuAI
 * @param {AbortSignal} [abortSignal]
 * @param {string} [_reqId] - Request ID for logging
 * @returns {Promise<RequestResult>}
 */
export async function fetchByProviderId(modelDef, args, abortSignal, _reqId) {
    const cpmFallbackTemp = await safeGetArg('cpm_fallback_temp');
    const cpmFallbackMaxTokens = await safeGetArg('cpm_fallback_max_tokens');
    const cpmFallbackTopP = await safeGetArg('cpm_fallback_top_p');
    const cpmFallbackFreqPen = await safeGetArg('cpm_fallback_freq_pen');
    const cpmFallbackPresPen = await safeGetArg('cpm_fallback_pres_pen');

    const fallbackTemp = cpmFallbackTemp !== '' ? _toFiniteFloat(cpmFallbackTemp) : undefined;
    const fallbackMaxTokens = cpmFallbackMaxTokens !== '' ? _toFiniteInt(cpmFallbackMaxTokens) : undefined;
    const temp = args.temperature ?? fallbackTemp;
    const maxTokens = args.max_tokens ?? fallbackMaxTokens;

    if (args.top_p === undefined && cpmFallbackTopP !== '') {
        const n = _toFiniteFloat(cpmFallbackTopP);
        if (n !== undefined) args.top_p = n;
    }
    if (args.frequency_penalty === undefined && cpmFallbackFreqPen !== '') {
        const n = _toFiniteFloat(cpmFallbackFreqPen);
        if (n !== undefined) args.frequency_penalty = n;
    }
    if (args.presence_penalty === undefined && cpmFallbackPresPen !== '') {
        const n = _toFiniteFloat(cpmFallbackPresPen);
        if (n !== undefined) args.presence_penalty = n;
    }

    const rawChat = args.prompt_chat;
    const messages = sanitizeMessages(rawChat);

    try {
        const fetcher = customFetchers[modelDef.provider];
        if (fetcher) return await fetcher(modelDef, messages, temp, maxTokens, args, abortSignal, _reqId);

        if (modelDef.provider.startsWith('Custom')) {
            const cDef = /** @type {Record<string, any>|undefined} */ (state.CUSTOM_MODELS_CACHE.find((/** @type {any} */ m) => m.uniqueId === modelDef.uniqueId));
            if (!cDef) return { success: false, content: `[Cupcake PM] Custom model config not found.` };

            // Diagnostic: log actual proxyUrl value from cache at request time
            if (cDef.proxyUrl) {
                console.log(`[CPM Router] ✓ proxyUrl="${cDef.proxyUrl}" for ${cDef.name || cDef.uniqueId}`);
            } else {
                console.log(`[CPM Router] ⚠ proxyUrl is EMPTY for ${cDef.name || cDef.uniqueId} (uniqueId=${cDef.uniqueId}, keys=${Object.keys(cDef).join(',')})`);
            }

            return await fetchCustom({
                url: cDef.url, key: cDef.key, model: cDef.model, proxyUrl: cDef.proxyUrl || '', proxyDirect: !!cDef.proxyDirect,
                format: cDef.format || 'openai',
                sysfirst: !!cDef.sysfirst, altrole: !!cDef.altrole,
                mustuser: !!cDef.mustuser, maxout: !!cDef.maxout, mergesys: !!cDef.mergesys,
                reasoning: cDef.reasoning || 'none', verbosity: cDef.verbosity || 'none',
                responsesMode: cDef.responsesMode || 'auto',
                thinking_level: cDef.thinking || 'none', tok: cDef.tok || 'o200k_base',
                thinkingBudget: parseInt(cDef.thinkingBudget) || 0,
                maxOutputLimit: parseInt(cDef.maxOutputLimit) || 0,
                promptCacheRetention: cDef.promptCacheRetention || 'none',
                decoupled: !!cDef.decoupled, thought: !!cDef.thought,
                streaming: (cDef.streaming === true) || (cDef.streaming !== false && !cDef.decoupled),
                showThoughtsToken: !!cDef.thought, useThoughtSignature: !!cDef.thought,
                customParams: cDef.customParams || '', copilotToken: '',
                effort: cDef.effort || 'none',
                adaptiveThinking: !!cDef.adaptiveThinking
            }, messages, temp, maxTokens, args, abortSignal, _reqId);
        }
        return { success: false, content: `[Cupcake PM] Unknown provider selected: ${modelDef.provider}` };
    } catch (_e) {
        const e = /** @type {Error} */ (_e);
        return { success: false, content: `[Cupcake PM Crash] ${e.message}` };
    }
}

// ── Main Router ──

/**
 * Main request router — entry point called by RisuAI for every API request.
 * Handles slot inference, parameter overrides, logging, and streaming.
 * @param {Record<string, any>} args - Request arguments from RisuAI
 * @param {ModelDef} activeModelDef - Currently selected model definition
 * @param {AbortSignal} [abortSignal]
 * @returns {Promise<RequestResult>}
 */
export async function handleRequest(args, activeModelDef, abortSignal) {
    args = (args && typeof args === 'object') ? args : {};
    if (!activeModelDef || typeof activeModelDef !== 'object' || !activeModelDef.provider) {
        return { success: false, content: '[Cupcake PM] Invalid model selection.' };
    }

    // V3 forces args.mode='v3', so we infer the slot from CPM's own slot config.
    // inferSlot now returns { slot, heuristicConfirmed } — always runs content
    // heuristics to guard against same-model-in-main-and-aux collision.
    const slotResult = await inferSlot(activeModelDef, args);
    const slot = slotResult.slot;
    const targetDef = activeModelDef;

    // Apply slot-specific generation param overrides (only when heuristically confirmed)
    if (slot !== 'chat') {
        if (!slotResult.heuristicConfirmed) {
            // This shouldn't normally happen (inferSlot returns 'chat' when unconfirmed),
            // but guard just in case.
            console.warn(`[Cupcake PM] ⚠️ Slot '${slot}' detected but NOT heuristically confirmed. Skipping CPM overrides — using Risu params.`);
        } else {
            const maxOut = await safeGetArg(`cpm_slot_${slot}_max_out`);
            const maxCtx = await safeGetArg(`cpm_slot_${slot}_max_context`);
            const slotTemp = await safeGetArg(`cpm_slot_${slot}_temp`);
            const topP = await safeGetArg(`cpm_slot_${slot}_top_p`);
            const topK = await safeGetArg(`cpm_slot_${slot}_top_k`);
            const repPen = await safeGetArg(`cpm_slot_${slot}_rep_pen`);
            const freqPen = await safeGetArg(`cpm_slot_${slot}_freq_pen`);
            const presPen = await safeGetArg(`cpm_slot_${slot}_pres_pen`);

            if (maxOut !== '') { const n = _toFiniteInt(maxOut); if (n !== undefined) args.max_tokens = n; }
            if (maxCtx !== '') { const n = _toFiniteInt(maxCtx); if (n !== undefined) args.max_context_tokens = n; }
            if (slotTemp !== '') { const n = _toFiniteFloat(slotTemp); if (n !== undefined) args.temperature = n; }
            if (topP !== '') { const n = _toFiniteFloat(topP); if (n !== undefined) args.top_p = n; }
            if (topK !== '') { const n = _toFiniteInt(topK); if (n !== undefined) args.top_k = n; }
            if (repPen !== '') { const n = _toFiniteFloat(repPen); if (n !== undefined) args.repetition_penalty = n; }
            if (freqPen !== '') { const n = _toFiniteFloat(freqPen); if (n !== undefined) args.frequency_penalty = n; }
            if (presPen !== '') { const n = _toFiniteFloat(presPen); if (n !== undefined) args.presence_penalty = n; }
        }
    }

    // Centralized API Request Logging
    const _displayName = `[${targetDef.provider}] ${targetDef.name}`;
    const _reqId = _storeApiRequest({
        timestamp: new Date().toISOString(),
        modelName: _displayName,
        url: '', method: 'POST', headers: {},
        body: { slot, temperature: args.temperature, max_tokens: args.max_tokens, messageCount: args.prompt_chat?.length || 0 },
        response: null, status: null, duration: null
    });
    const _startTime = Date.now();

    let result;
    try {
        result = await fetchByProviderId(targetDef, args, abortSignal, _reqId);
    } catch (_e) {
        const e = /** @type {Error} */ (_e);
        _updateApiRequest(_reqId, { duration: Date.now() - _startTime, status: 'crash', response: `[CRASH] ${e.message}` });
        console.error(`[CupcakePM] 💥 Request crashed (${_displayName}):`, e);
        try { Risu.log(`💥 CRASH (${_displayName}): ${e.message}`); } catch {}
        throw e;
    }

    // Normalize malformed provider returns
    if (!result || typeof result !== 'object') {
        result = { success: false, content: `[Cupcake PM Error] Invalid provider result type: ${typeof result}` };
    }
    if (typeof result.success !== 'boolean') result.success = !!result.success;
    if (result.content == null) result.content = '';

    _updateApiRequest(_reqId, {
        duration: Date.now() - _startTime,
        status: result.success ? (result._status || 200) : (result._status || 'error')
    });

    const _nonStreamTokenUsage = _takeTokenUsage(_reqId, false);
    const _showTokens = await safeGetBoolArg('cpm_show_token_usage', false);

    const _apiRequestHistory = { get: (/** @type {string} */ _id) => { /* placeholder — actual data comes from api-request-log module */ } };
    const _logResponse = (/** @type {any} */ contentStr, prefix = '📥 Response') => {
        const safeContent = typeof contentStr === 'string' ? contentStr : (contentStr == null ? '' : String(contentStr));
        _updateApiRequest(_reqId, { response: safeContent.substring(0, 4000) });
        console.log(`[CupcakePM] ${prefix} (${_displayName}):`, safeContent.substring(0, 2000));
        try { Risu.log(`${prefix} (${_displayName}): ${safeContent.substring(0, 500)}`); } catch {}
    };

    // Streaming pass-through
    if (result && result.success && result.content instanceof ReadableStream) {
        const streamEnabled = await safeGetBoolArg('cpm_streaming_enabled', false);

        if (streamEnabled) {
            const bridgeCapable = await checkStreamCapability();
            if (bridgeCapable) {
                /** @type {any[]} */
                const _chunks = [];
                let _chunksTotalBytes = 0;
                let _chunksOverflow = false;
                const _STREAM_LOG_MAX_BYTES = 512 * 1024; // 512 KB cap for logging buffer
                const _streamDecoder = new TextDecoder();
                const _streamStartTime = _startTime;
                const _streamModelName = _displayName;
                const _streamShowTokens = _showTokens;
                result.content = result.content.pipeThrough(new TransformStream({
                    transform(chunk, controller) {
                        controller.enqueue(chunk);
                        if (!_chunksOverflow) {
                            const _sz = chunk.byteLength || chunk.length || 0;
                            if (_chunksTotalBytes + _sz <= _STREAM_LOG_MAX_BYTES) {
                                _chunks.push(chunk);
                                _chunksTotalBytes += _sz;
                            } else {
                                _chunksOverflow = true;
                            }
                        }
                    },
                    flush() {
                        const full = _chunks.map((c) => {
                            if (typeof c === 'string') return c;
                            if (c instanceof Uint8Array) return _streamDecoder.decode(c, { stream: true });
                            if (c instanceof ArrayBuffer) return _streamDecoder.decode(new Uint8Array(c), { stream: true });
                            return String(c ?? '');
                        }).join('') + _streamDecoder.decode();
                        _logResponse(_chunksOverflow ? full + '\n[...truncated for logging]' : full, '📥 Streamed Response');
                        const streamUsage = _takeTokenUsage(_reqId, true);
                        if (_streamShowTokens && streamUsage) _showTokenUsageToast(_streamModelName, streamUsage, Date.now() - _streamStartTime);
                    }
                }));
                console.log('[Cupcake PM] ✓ Streaming: returning ReadableStream to RisuAI');
            } else {
                console.warn('[Cupcake PM] ⚠ Streaming enabled but V3 bridge cannot transfer ReadableStream. Falling back to collected string.');
                result.content = await collectStream(result.content);
                _logResponse(result.content);
                const _collectedUsage = _takeTokenUsage(_reqId, true);
                if (_showTokens && _collectedUsage) _showTokenUsageToast(_displayName, _collectedUsage, Date.now() - _startTime);
            }
        } else {
            result.content = await collectStream(result.content);
            _logResponse(result.content);
            const _collectedUsage2 = _takeTokenUsage(_reqId, true);
            if (_showTokens && _collectedUsage2) _showTokenUsageToast(_displayName, _collectedUsage2, Date.now() - _startTime);
        }
    } else if (result) {
        const contentStr = typeof result.content === 'string'
            ? result.content
            : (() => { try { const s = JSON.stringify(result.content); return s == null ? String(result.content) : s; } catch { return String(result.content); } })();
        _logResponse(contentStr);
        if (_showTokens && _nonStreamTokenUsage) _showTokenUsageToast(_displayName, _nonStreamTokenUsage, Date.now() - _startTime);
    }

    return result;
}
